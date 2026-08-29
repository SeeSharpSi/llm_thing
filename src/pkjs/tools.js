var common = require('./settings');
var watch = require('./watch');
var timelineStore = require('./timeline_store');
var webFetch = require('./web_fetch');

var MCP_PROTOCOL_VERSION = '2025-06-18';
var MCP_CLIENT_NAME = 'llm_thing';
var MCP_CLIENT_VERSION = '1.0.0';
var TIMELINE_API_BASE = 'https://timeline-api.getpebble.com/v1/user/pins/';
var TIMELINE_DEFAULT_PIN_ICON = 'NOTIFICATION_REMINDER';
var TIMELINE_DEFAULT_REMINDER_ICON = 'NOTIFICATION_REMINDER';
var TIMELINE_DEFAULT_NOTIFICATION_ICON = 'NOTIFICATION_GENERIC';
var TIMELINE_RAW_PIN_ARG_KEYS = {
  pin: true,
  layout: true,
  reminders: true,
  createNotification: true,
  updateNotification: true,
  actions: true
};
var MAX_HEALTH_RANGE_SECONDS = 7 * 24 * 60 * 60;
var MAX_HEALTH_HOUR_RANGE_SECONDS = 24 * 60 * 60;
var MAX_HEALTH_SESSIONS = 32;
var MAX_HEALTH_BUCKET_VALUES = 64;
var HEALTH_METRIC_BITS = {
  steps: 1,
  active_time: 2,
  distance: 4,
  sleep: 8,
  restful_sleep: 16,
  resting_calories: 32,
  active_calories: 64,
  heart_rate: 128
};
var HEALTH_SESSION_BITS = {
  sleep_sessions: 512 | 1024,
  activity_sessions: 2048 | 4096 | 8192
};
var HEALTH_ACTIVITY_TYPES = {
  1: 'sleep',
  2: 'restful_sleep',
  4: 'walk',
  8: 'run',
  16: 'open_workout'
};
var TIMELINE_MAX_PAST_MS = 2 * 24 * 60 * 60 * 1000;
var TIMELINE_MAX_FUTURE_MS = 365 * 24 * 60 * 60 * 1000;
var TIMELINE_RETRY_DELAY_MS = 250;

var s_mcp_request_id = 1;

var MCP_MAX_RESULT_CHARS = 12000;
var MCP_RESULT_TRUNCATION_SUFFIX = '... [truncated]';
var MCP_MAX_PAGINATION_PAGES = 20;
var MCP_MAX_TOOLS_PER_SERVER = 64;
var MCP_MAX_TOOLS_GLOBAL = 64;
var MCP_MAX_DESCRIPTION_CHARS = 1024;
var MCP_MAX_INPUTSCHEMA_CHARS = 8192;
var MCP_SUPPORTED_PROTOCOL_VERSIONS = { '2025-06-18': true };
var MCP_CACHE_TTL_MS = 5 * 60 * 1000;

var s_mcp_cache = null;

function hasOwn(object, key) {
  return object !== null && object !== undefined && Object.prototype.hasOwnProperty.call(object, key);
}

function hasToolArgValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function formatToolParamValue(value, maxLength) {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return common.truncate(value.replace(/\s+/g, ' '), maxLength);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return common.truncate(common.safeJson(value), maxLength);
}

function stripToolNamePrefix(toolName, prefix) {
  toolName = String(toolName || '');
  prefix = common.trim(prefix);

  if (!prefix || toolName.substring(0, prefix.length).toLowerCase() !== prefix.toLowerCase()) {
    return toolName;
  }

  return toolName.substring(prefix.length).replace(/^[_\-\s:]+/, '');
}

function formatDisplayToolName(toolName, toolInfo) {
  var name = String(toolName || 'unknown');
  var serverLabel;

  if (toolInfo && toolInfo.kind === 'mcp' && toolInfo.server) {
    serverLabel = toolInfo.server.displayLabel || toolInfo.server.label || '';
    name = stripToolNamePrefix(name, serverLabel);
    name = stripToolNamePrefix(name, slugify(serverLabel));
    name = stripToolNamePrefix(name, toolInfo.server.label);
  }

  name = common.trim(name.replace(/_+/g, ' ').replace(/\s+/g, ' '));
  return name || 'unknown';
}

function formatToolCallDetail(toolName, args, toolInfo) {
  var parts = [];
  var key;
  var text;
  var displayToolName = formatDisplayToolName(toolName, toolInfo);

  args = args || {};
  if (typeof args !== 'object') {
    return common.truncate(displayToolName + ': { value:' + formatToolParamValue(args, 100) + ' }', 160);
  }

  for (key in args) {
    if (hasOwn(args, key) && args[key] !== undefined) {
      parts.push(key + ':' + formatToolParamValue(args[key], 80));
    }
  }

  text = displayToolName + ': { ';
  if (parts.length) {
    text += parts.join(', ') + ' ';
  }
  text += '}';

  return common.truncate(text, 160);
}

function formatToolWords(value) {
  var words = common.trim(value).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').split(' ');
  var result = [];
  var i;
  var word;

  for (i = 0; i < words.length; i += 1) {
    word = words[i];
    if (word) {
      result.push(word.charAt(0).toUpperCase() + word.substring(1));
    }
  }

  return result.join(' ');
}

function formatToolLabel(toolInfo) {
  if (toolInfo.kind === 'builtin') {
    return toolInfo.label || toolInfo.name || 'Built-in Tool';
  }

  return toolInfo.server.displayLabel || toolInfo.server.label;
}

function formatToolCallLabel(call, toolMap) {
  var name = String((call && (call.name || call.tool || call.function)) || '');
  var toolInfo = toolMap && hasOwn(toolMap, name) ? toolMap[name] : null;
  var serverLabel;
  var toolLabel;

  if (toolInfo && toolInfo.kind === 'mcp') {
    serverLabel = common.trim(toolInfo.server.displayLabel) || formatToolWords(toolInfo.server.label || 'MCP');
    toolLabel = formatToolWords(formatDisplayToolName(toolInfo.toolName || name, toolInfo));
    return serverLabel + ': ' + (toolLabel || 'Tool');
  }

  if (toolInfo && toolInfo.kind === 'builtin') {
    toolLabel = formatToolWords(stripToolNamePrefix(name || toolInfo.name, 'pebble'));
    return 'Pebble: ' + (toolLabel || formatToolLabel(toolInfo));
  }

  return formatToolWords(name) || 'Unknown Tool';
}

function isMatchingResponse(msg, expectedId, allowMissingId) {
  if (!msg || typeof msg !== 'object') {
    return false;
  }
  if (msg.method) {
    return false;
  }
  if (msg.result === undefined && msg.error === undefined) {
    return false;
  }
  if (expectedId !== undefined && msg.id === undefined && !allowMissingId) {
    return false;
  }
  if (msg.id !== undefined && msg.id !== expectedId) {
    return false;
  }
  return true;
}

function parseSseEventData(eventBlock) {
  var lines = eventBlock.split(/\r?\n/);
  var data = '';
  var i;
  var line;
  var value;

  for (i = 0; i < lines.length; i += 1) {
    line = lines[i];
    if (!line || line.charAt(0) === ':') {
      continue;
    }
    if (line.indexOf('data:') === 0) {
      value = line.substring(5);
      if (value.charAt(0) === ' ') {
        value = value.substring(1);
      }
      if (data) {
        data += '\n';
      }
      data += value;
    }
  }

  return data;
}

function parseMcpResponse(text, expectedId) {
  var trimmed = common.trim(text);
  var parsed;
  var events;
  var i;
  var eventData;
  var msg;

  if (!trimmed) {
    return null;
  }

  try {
    parsed = JSON.parse(trimmed);
    // A single JSON response is isolated to this HTTP request; tolerate legacy
    // servers that omit the JSON-RPC id. SSE may contain multiple messages and
    // therefore requires an exact id below.
    if (isMatchingResponse(parsed, expectedId, true)) {
      return parsed;
    }
    return null;
  } catch (e) {}

  events = trimmed.split(/\r?\n\r?\n/);
  for (i = 0; i < events.length; i += 1) {
    if (!common.trim(events[i])) {
      continue;
    }
    eventData = parseSseEventData(events[i]);
    if (!eventData || eventData === '[DONE]') {
      continue;
    }
    try {
      msg = JSON.parse(eventData);
    } catch (e2) {
      continue;
    }
    if (isMatchingResponse(msg, expectedId, false)) {
      return msg;
    }
  }

  return null;
}

function slugify(value) {
  var slug = common.trim(value).replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return slug || 'tool';
}

function authHeader(value) {
  var header = common.trim(value);

  if (!header) {
    return '';
  }

  if (/^(Bearer|Basic|Digest|Token)\s+/i.test(header)) {
    return header;
  }

  return 'Bearer ' + header;
}

function isValidHttpHeaderName(value) {
  return /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(value);
}

function isReservedMcpHeader(value) {
  var name = String(value || '').toLowerCase();

  return name === 'content-type' ||
    name === 'accept' ||
    name === 'mcp-protocol-version' ||
    name === 'mcp-session-id';
}

function normalizeMcpHeaders(value) {
  var headers = [];
  var seen = {};
  var i;
  var header;
  var name;
  var headerValue;
  var lowerName;

  if (!value || !value.length) {
    return headers;
  }

  for (i = 0; i < value.length; i += 1) {
    header = value[i] || {};
    name = common.trim(header.name);
    headerValue = common.trim(String(header.value || '').replace(/[\r\n]+/g, ' '));
    lowerName = name.toLowerCase();

    if (!name || !headerValue || !isValidHttpHeaderName(name) || isReservedMcpHeader(name) || hasOwn(seen, lowerName)) {
      continue;
    }

    seen[lowerName] = true;
    headers.push({
      name: name,
      value: headerValue,
      lowerName: lowerName
    });
  }

  return headers;
}

function parseOptionalToolCallLimit(value) {
  var text = String(value === undefined || value === null ? '' : value).replace(/^\s+|\s+$/g, '');
  var number;

  if (!text) {
    return null;
  }

  number = parseInt(text, 10);
  if (isNaN(number) || number < 0) {
    return null;
  }

  return number;
}

function isValidMcpUrl(url) {
  var text = common.trim(url);
  var match;
  var scheme;
  var host;
  var hostPart;

  match = /^(https?):\/\/([^\/\?#]+)/i.exec(text);
  if (!match) {
    return false;
  }
  scheme = match[1].toLowerCase();
  host = match[2].toLowerCase();

  if (scheme === 'https') {
    return true;
  }

  if (host.charAt(0) === '[') {
    hostPart = host.substring(0, host.indexOf(']') + 1);
  } else {
    hostPart = host.split(':')[0];
  }
  return hostPart === 'localhost' || hostPart === '127.0.0.1' || hostPart === '[::1]';
}

function parseMcpServers(settings) {
  var parsed;
  var servers = [];
  var i;
  var server;
  var maxToolCalls;

  try {
    parsed = JSON.parse(settings.McpServersJson || '[]');
  } catch (e) {
    parsed = [];
  }

  if (!parsed || !parsed.length) {
    return servers;
  }

  for (i = 0; i < parsed.length; i += 1) {
    server = parsed[i] || {};
    if (server.enabled === true || server.enabled === 1 || server.enabled === '1') {
      maxToolCalls = parseOptionalToolCallLimit(server.maxToolCalls);
      server = {
        displayLabel: common.trim(server.label),
        label: slugify(server.label),
        limitKey: slugify(server.label) + '_' + i,
        url: common.trim(server.url),
        description: common.trim(server.description),
        allowedTools: common.splitCsv(server.allowedTools),
        maxToolCalls: maxToolCalls,
        authorization: common.trim(server.authorization),
        headers: normalizeMcpHeaders(server.headers),
        sessionId: ''
      };
      if (server.label && server.url && server.maxToolCalls !== 0) {
        if (!isValidMcpUrl(server.url)) {
          common.logDebug('mcp server omitted invalid url server=' + server.label);
          continue;
        }
        servers.push(server);
      }
    }
  }

  return servers;
}

function isAllowedTool(server, name) {
  var i;

  if (!server.allowedTools.length) {
    return true;
  }

  for (i = 0; i < server.allowedTools.length; i += 1) {
    if (server.allowedTools[i] === name) {
      return true;
    }
  }

  return false;
}

function applyMcpCustomHeaders(request, server, authorization) {
  var headers = server.headers || [];
  var i;

  for (i = 0; i < headers.length; i += 1) {
    if (headers[i].lowerName === 'authorization' && authorization) {
      continue;
    }

    try {
      request.setRequestHeader(headers[i].name, headers[i].value);
    } catch (e) {
      common.logDebug('mcp custom header skipped server=' + server.label + ' name=' + headers[i].name);
    }
  }
}

function mcpJsonRpc(server, method, params, expectBody, requestId, callback) {
  var request = new XMLHttpRequest();
  var payload = {
    jsonrpc: '2.0',
    method: method
  };
  var authorization = authHeader(server.authorization);
  var jsonRpcId;

  if (method.indexOf('notifications/') !== 0) {
    payload.id = s_mcp_request_id;
    s_mcp_request_id += 1;
  }
  if (params) {
    payload.params = params;
  }
  jsonRpcId = payload.id;

  request.open('POST', server.url, true);
  request.setRequestHeader('Content-Type', 'application/json');
  request.setRequestHeader('Accept', 'application/json, text/event-stream');
  request.setRequestHeader('MCP-Protocol-Version', MCP_PROTOCOL_VERSION);
  if (server.sessionId) {
    request.setRequestHeader('Mcp-Session-Id', server.sessionId);
  }
  if (authorization) {
    request.setRequestHeader('Authorization', authorization);
  }
  applyMcpCustomHeaders(request, server, authorization);
  request.timeout = 30000;

  if (!watch.trackXhr(requestId, request)) {
    return;
  }

  common.logDebug('mcp request server=' + server.label + ' method=' + method + ' id=' + (payload.id || 'notification'));

  request.onload = function() {
    var json;
    var sessionId;

    watch.untrackXhr(requestId, request);
    if (!watch.isCurrentRequest(requestId)) {
      return;
    }

    common.logDebug('mcp response server=' + server.label + ' method=' + method + ' status=' + request.status + ' bytes=' + String(request.responseText || '').length);

    if (request.status < 200 || request.status >= 300) {
      callback('MCP HTTP ' + request.status + ': ' + String(request.responseText || '').substring(0, 180), null, request.status);
      return;
    }

    try {
      sessionId = request.getResponseHeader('Mcp-Session-Id');
      if (sessionId) {
        server.sessionId = sessionId;
      }
    } catch (e) {}

    if (!expectBody || !common.trim(request.responseText)) {
      callback(null, null, request.status);
      return;
    }

    try {
      json = parseMcpResponse(request.responseText, jsonRpcId);
    } catch (e2) {
      callback('Bad MCP JSON response', null, request.status);
      return;
    }

    if (!json) {
      callback('No matching MCP response', null, request.status);
      return;
    }

    if (json.error) {
      callback(json.error.message || common.safeJson(json.error), null, request.status);
      return;
    }

    callback(null, json.result || {}, request.status);
  };

  request.onerror = function() {
    watch.untrackXhr(requestId, request);
    if (!watch.isCurrentRequest(requestId)) {
      return;
    }
    common.logDebug('mcp network error server=' + server.label + ' method=' + method);
    callback('MCP network error', null, 0);
  };

  request.ontimeout = function() {
    watch.untrackXhr(requestId, request);
    if (!watch.isCurrentRequest(requestId)) {
      return;
    }
    common.logDebug('mcp timeout server=' + server.label + ' method=' + method);
    callback('MCP request timed out', null, 0);
  };

  request.onabort = function() {
    watch.untrackXhr(requestId, request);
  };

  request.send(JSON.stringify(payload));
}

function initializeMcpServer(server, requestId, callback) {
  mcpJsonRpc(server, 'initialize', {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: {
      name: MCP_CLIENT_NAME,
      version: MCP_CLIENT_VERSION
    }
  }, true, requestId, function(error, result) {
    var caps;
    var protocolVersion;

    if (error) {
      callback(error);
      return;
    }

    protocolVersion = result && result.protocolVersion;
    if (!hasOwn(MCP_SUPPORTED_PROTOCOL_VERSIONS, protocolVersion)) {
      callback('MCP incompatible protocolVersion: ' + (protocolVersion || 'missing'));
      return;
    }

    caps = result && result.capabilities;
    if (caps && typeof caps === 'object' && !caps.tools) {
      callback(null, { noTools: true });
      return;
    }

    mcpJsonRpc(server, 'notifications/initialized', {}, false, requestId, function(initError) {
      if (initError) {
        callback(initError);
        return;
      }
      callback(null, null);
    });
  });
}

function capMcpResult(text) {
  var value = String(text || '');

  if (value.length <= MCP_MAX_RESULT_CHARS) {
    return value;
  }

  return value.substring(0, MCP_MAX_RESULT_CHARS - MCP_RESULT_TRUNCATION_SUFFIX.length) + MCP_RESULT_TRUNCATION_SUFFIX;
}

function formatMcpToolResult(result) {
  var text = common.collectTextFromContent(result && result.content);

  if (text) {
    return capMcpResult(text);
  }

  if (result && result.structuredContent !== undefined && result.structuredContent !== null) {
    return capMcpResult(common.safeJson(result.structuredContent));
  }

  return capMcpResult(common.safeJson(result || {}));
}

function mcpCacheKey(servers) {
  var entries = [];
  var i;
  var s;

  for (i = 0; i < servers.length; i += 1) {
    s = servers[i];
    entries.push({
      displayLabel: s.displayLabel,
      label: s.label,
      url: s.url,
      description: s.description,
      allowedTools: s.allowedTools,
      maxToolCalls: s.maxToolCalls,
      authorization: s.authorization,
      headers: s.headers
    });
  }

  return JSON.stringify(entries);
}

function lookupMcpCache(key) {
  if (!s_mcp_cache || s_mcp_cache.key !== key) {
    return null;
  }
  if (Date.now() - s_mcp_cache.time > MCP_CACHE_TTL_MS) {
    s_mcp_cache = null;
    return null;
  }
  return s_mcp_cache;
}

function cloneTools(tools) {
  var copy = [];
  var i;

  for (i = 0; i < tools.length; i += 1) {
    copy.push(tools[i]);
  }
  return copy;
}

function cloneToolMap(toolMap) {
  var copy = Object.create(null);
  var key;

  for (key in toolMap) {
    if (hasOwn(toolMap, key)) {
      copy[key] = toolMap[key];
    }
  }
  return copy;
}

function listAllMcpTools(server, requestId, callback) {
  var allTools = [];
  var done = false;
  var pageCount = 0;

  function finish(error, tools) {
    if (done) {
      return;
    }
    done = true;
    callback(error, tools);
  }

  function fetchPage(cursor) {
    var params = cursor ? { cursor: cursor } : {};
    var i;

    if (pageCount >= MCP_MAX_PAGINATION_PAGES) {
      common.logDebug('mcp tools/list page limit reached server=' + server.label);
      finish(null, allTools);
      return;
    }
    pageCount += 1;

    mcpJsonRpc(server, 'tools/list', params, true, requestId, function(listError, result) {
      var serverTools;
      var nextCursor;

      if (!watch.isCurrentRequest(requestId)) {
        return;
      }
      if (listError) {
        finish(listError, null);
        return;
      }

      serverTools = (result && result.tools) || [];
      for (i = 0; i < serverTools.length; i += 1) {
        if (allTools.length >= MCP_MAX_TOOLS_PER_SERVER) {
          common.logDebug('mcp tools/list per-server limit reached server=' + server.label);
          finish(null, allTools);
          return;
        }
        allTools.push(serverTools[i]);
      }

      nextCursor = result && result.nextCursor;
      if (nextCursor) {
        fetchPage(nextCursor);
      } else {
        finish(null, allTools);
      }
    });
  }

  fetchPage(null);
}

function discoverMcpTools(settings, requestId, callback) {
  var servers = parseMcpServers(settings);
  var cacheKey = mcpCacheKey(servers);
  var cached;
  var tools = [];
  var toolMap = Object.create(null);
  var usedNames = Object.create(null);
  var results = [];
  var remaining = servers.length;
  var hadError = false;

  common.logDebug('mcp discover start servers=' + servers.length);

  cached = lookupMcpCache(cacheKey);
  if (cached) {
    common.logDebug('mcp cache hit');
    callback(null, cloneTools(cached.tools), cloneToolMap(cached.toolMap));
    return;
  }

  function addTools(server, serverTools) {
    var i;
    var tool;
    var exposedName;
    var baseName;
    var suffix;
    var description;
    var inputSchema;
    var schemaSize;

    for (i = 0; i < serverTools.length; i += 1) {
      if (tools.length >= MCP_MAX_TOOLS_GLOBAL) {
        common.logDebug('mcp tools global limit reached');
        return;
      }
      tool = serverTools[i] || {};
      if (!tool.name || !isAllowedTool(server, tool.name)) {
        continue;
      }

      inputSchema = tool.inputSchema || { type: 'object', properties: {} };
      try {
        schemaSize = JSON.stringify(inputSchema).length;
      } catch (e) {
        schemaSize = MCP_MAX_INPUTSCHEMA_CHARS + 1;
      }
      if (schemaSize > MCP_MAX_INPUTSCHEMA_CHARS) {
        common.logDebug('mcp tool skipped oversized inputSchema server=' + server.label + ' tool=' + tool.name);
        continue;
      }

      baseName = slugify(server.label) + '__' + slugify(tool.name);
      exposedName = baseName;
      suffix = 2;
      while (hasOwn(usedNames, exposedName)) {
        exposedName = baseName + '_' + suffix;
        suffix += 1;
      }
      usedNames[exposedName] = true;

      description = common.trim(tool.description || server.description || 'MCP tool');
      if (description.length > MCP_MAX_DESCRIPTION_CHARS) {
        description = description.substring(0, MCP_MAX_DESCRIPTION_CHARS);
      }
      if (server.maxToolCalls !== null) {
        description += ' This MCP server may be called at most ' + server.maxToolCalls + ' time(s) this request.';
      }

      tools.push({
        name: exposedName,
        description: description,
        parameters: inputSchema
      });
      toolMap[exposedName] = {
        kind: 'mcp',
        server: server,
        toolName: tool.name,
        parameters: inputSchema
      };
      common.logDebug('mcp tool exposed=' + exposedName + ' original=' + tool.name + ' server=' + server.label);
    }
  }

  function finalize() {
    var i;
    var entry;

    for (i = 0; i < results.length; i += 1) {
      entry = results[i];
      if (entry && entry.tools) {
        addTools(entry.server, entry.tools);
      }
    }

    if (!hadError) {
      s_mcp_cache = {
        key: cacheKey,
        time: Date.now(),
        tools: cloneTools(tools),
        toolMap: cloneToolMap(toolMap)
      };
    }

    callback(null, cloneTools(tools), cloneToolMap(toolMap));
  }

  if (!remaining) {
    finalize();
    return;
  }

  servers.forEach(function(server, index) {
    initializeMcpServer(server, requestId, function(initError, initResult) {
      var noTools = initResult && initResult.noTools;

      if (!watch.isCurrentRequest(requestId)) {
        return;
      }
      if (initError) {
        common.logDebug('mcp initialize failed server=' + server.label + ' error=' + initError);
        hadError = true;
        results[index] = null;
        remaining -= 1;
        if (remaining <= 0) {
          finalize();
        }
        return;
      }

      if (noTools) {
        common.logDebug('mcp server declares no tools capability server=' + server.label);
        results[index] = { server: server, tools: [] };
        remaining -= 1;
        if (remaining <= 0) {
          finalize();
        }
        return;
      }

      common.logDebug('mcp initialized server=' + server.label);

      listAllMcpTools(server, requestId, function(listError, serverTools) {
        if (!watch.isCurrentRequest(requestId)) {
          return;
        }
        if (listError) {
          common.logDebug('mcp tools/list failed server=' + server.label + ' error=' + listError);
          hadError = true;
          results[index] = null;
        } else {
          results[index] = { server: server, tools: serverTools };
          common.logDebug('mcp tools/list ok server=' + server.label + ' count=' + serverTools.length);
        }
        remaining -= 1;
        if (remaining <= 0) {
          finalize();
        }
      });
    });
  });
}

function pad2(value) {
  return value < 10 ? '0' + value : String(value);
}

function formatDateTime(date) {
  var offsetMinutes = -date.getTimezoneOffset();
  var offsetSign = offsetMinutes >= 0 ? '+' : '-';
  var absOffset = Math.abs(offsetMinutes);

  return date.getFullYear() + '-' +
    pad2(date.getMonth() + 1) + '-' +
    pad2(date.getDate()) + ' ' +
    pad2(date.getHours()) + ':' +
    pad2(date.getMinutes()) + ':' +
    pad2(date.getSeconds()) + ' GMT' +
    offsetSign +
    pad2(Math.floor(absOffset / 60)) + ':' +
    pad2(absOffset % 60);
}

function formatIsoDateTime(date) {
  if (date && date.toISOString) {
    return date.toISOString();
  }

  return formatDateTime(date || new Date());
}

function boolArg(value, fallback) {
  var normalized;

  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (value === true || value === 1) {
    return true;
  }
  if (value === false || value === 0) {
    return false;
  }

  normalized = String(value).toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function parseObjectArg(value) {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (e) {
      return null;
    }
  }

  return value;
}

function callGeolocationBuiltin(args, requestId, callback) {
  var options;

  args = args || {};
  if (!watch.isCurrentRequest(requestId)) {
    return;
  }
  if (typeof navigator === 'undefined' || !navigator.geolocation || !navigator.geolocation.getCurrentPosition) {
    callback('Geolocation unavailable');
    return;
  }

  options = {
    enableHighAccuracy: boolArg(args.enableHighAccuracy, false),
    timeout: common.clampNumber(args.timeoutMs, 1000, 60000, 10000),
    maximumAge: common.clampNumber(args.maximumAgeMs, 0, 3600000, 300000)
  };

  navigator.geolocation.getCurrentPosition(function(position) {
    var coords = position.coords || {};
    var result = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracyMeters: coords.accuracy,
      timestamp: formatIsoDateTime(position.timestamp ? new Date(position.timestamp) : new Date())
    };

    if (coords.altitude !== undefined && coords.altitude !== null) {
      result.altitudeMeters = coords.altitude;
    }
    if (coords.altitudeAccuracy !== undefined && coords.altitudeAccuracy !== null) {
      result.altitudeAccuracyMeters = coords.altitudeAccuracy;
    }
    if (coords.heading !== undefined && coords.heading !== null) {
      result.headingDegrees = coords.heading;
    }
    if (coords.speed !== undefined && coords.speed !== null) {
      result.speedMetersPerSecond = coords.speed;
    }

    if (watch.isCurrentRequest(requestId)) {
      callback(null, common.safeJson(result));
    }
  }, function(error) {
    if (!watch.isCurrentRequest(requestId)) {
      return;
    }
    if (error && error.message) {
      callback('Geolocation error: ' + error.message);
      return;
    }
    if (error && error.code) {
      callback('Geolocation error code ' + error.code);
      return;
    }

    callback('Geolocation error');
  }, options);
}

function getTimelineToken(callback) {
  if (!Pebble.getTimelineToken) {
    callback('Timeline token API unavailable');
    return;
  }

  Pebble.getTimelineToken(function(token) {
    if (!token) {
      callback('Timeline token unavailable');
      return;
    }

    callback(null, token);
  }, function(error) {
    callback('Timeline token error: ' + (error || 'unknown error'));
  });
}

function isTimelineArray(value) {
  return Object.prototype.toString.call(value) === '[object Array]';
}

function firstTimelineValue(args, keys) {
  var i;
  var key;

  for (i = 0; i < keys.length; i += 1) {
    key = keys[i];
    if (hasToolArgValue(args[key])) {
      return args[key];
    }
  }

  return undefined;
}

function validateTimelineArgShape(args) {
  var key;

  for (key in args) {
    if (args.hasOwnProperty(key)) {
      if (TIMELINE_RAW_PIN_ARG_KEYS[key]) {
        return 'Use structured timeline arguments, not raw Pebble pin JSON';
      }
    }
  }

  return '';
}

function addTimelineStringField(target, key, value, maxLength) {
  value = common.trim(value);
  if (!value) {
    return;
  }

  target[key] = maxLength ? common.truncate(value, maxLength) : value;
}

function optionalTimelineInteger(value, name, min, max, errors) {
  var number;

  if (!hasToolArgValue(value)) {
    return null;
  }

  number = parseInt(value, 10);
  if (isNaN(number)) {
    errors.push(name + ' must be an integer');
    return null;
  }
  if (min !== null && min !== undefined && number < min) {
    errors.push(name + ' must be ' + min + ' or greater');
    return null;
  }
  if (max !== null && max !== undefined && number > max) {
    errors.push(name + ' must be ' + max + ' or less');
    return null;
  }

  return number;
}

function normalizeTimelineDateTime(value) {
  var unix;

  if (!hasToolArgValue(value)) {
    return '';
  }

  unix = parseUnixTimeArg(value);
  if (unix === null) {
    return '';
  }

  return formatIsoDateTime(new Date(unix * 1000));
}

function normalizeTimelineIconName(value) {
  return common.trim(value)
    .replace(/\\_/g, '_')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function normalizeTimelineIcon(value, fallback) {
  var text = common.trim(value);
  var match;
  var iconName;

  if (!text) {
    text = fallback || '';
  }
  if (!text) {
    return '';
  }

  text = text.replace(/\\_/g, '_');
  if (/^app:\/\/images\//i.test(text)) {
    return text;
  }

  match = text.match(/^system:\/\/images\/(.+)$/i);
  iconName = match ? match[1] : text;
  iconName = normalizeTimelineIconName(iconName);

  return iconName ? 'system://images/' + iconName : '';
}

function normalizeTimelineLayoutType(value) {
  var lower = common.trim(value).toLowerCase();

  if (!lower || lower === 'generic' || lower === 'genericpin') {
    return 'genericPin';
  }
  if (lower === 'calendar' || lower === 'calendarpin') {
    return 'calendarPin';
  }
  if (lower === 'sports' || lower === 'sportspin') {
    return 'sportsPin';
  }
  if (lower === 'weather' || lower === 'weatherpin') {
    return 'weatherPin';
  }

  return '';
}

function normalizeTimelineStringArray(value) {
  var result = [];
  var parsed;
  var i;
  var item;

  if (typeof value === 'string') {
    parsed = parseObjectArg(value);
    value = isTimelineArray(parsed) ? parsed : value.split(/\r?\n/);
  } else {
    value = parseObjectArg(value);
  }
  if (!isTimelineArray(value)) {
    return result;
  }

  for (i = 0; i < value.length; i += 1) {
    item = common.trim(value[i]);
    if (item) {
      result.push(item);
    }
  }

  return result;
}

function generateTimelinePinId(title) {
  var base = slugify(title || 'reminder').toLowerCase();
  var suffix = String(new Date().getTime()) + '_' + String(Math.floor(Math.random() * 10000));
  var prefix = 'llm_' + base.substring(0, 28) + '_';

  return (prefix + suffix).substring(0, 64);
}

function buildTimelinePinLayout(args, errors) {
  var layout = {};
  var layoutType = normalizeTimelineLayoutType(firstTimelineValue(args, ['pinType', 'layoutType', 'type']));
  var tinyIcon = firstTimelineValue(args, ['icon', 'tinyIcon', 'pinIcon']);
  var headings;
  var paragraphs;
  var fields = [
    'title', 'subtitle', 'shortTitle', 'shortSubtitle', 'body', 'locationName',
    'smallIcon', 'largeIcon', 'primaryColor', 'secondaryColor', 'backgroundColor',
    'lastUpdated', 'displayTime', 'rankAway', 'rankHome', 'nameAway', 'nameHome',
    'recordAway', 'recordHome', 'scoreAway', 'scoreHome', 'sportsGameState'
  ];
  var maxLengths = {
    body: 512
  };
  var i;
  var key;

  if (!layoutType) {
    errors.push('layoutType must be genericPin, calendarPin, sportsPin, or weatherPin');
    layoutType = 'genericPin';
  }
  layout.type = layoutType;

  for (i = 0; i < fields.length; i += 1) {
    key = fields[i];
    addTimelineStringField(layout, key, args[key], maxLengths[key]);
  }

  if (hasToolArgValue(tinyIcon) || layoutType !== 'calendarPin') {
    layout.tinyIcon = normalizeTimelineIcon(tinyIcon, TIMELINE_DEFAULT_PIN_ICON);
  }
  if (hasToolArgValue(args.smallIcon)) {
    layout.smallIcon = normalizeTimelineIcon(args.smallIcon, '');
  }
  if (hasToolArgValue(args.largeIcon)) {
    layout.largeIcon = normalizeTimelineIcon(args.largeIcon, '');
  }

  headings = normalizeTimelineStringArray(args.headings);
  paragraphs = normalizeTimelineStringArray(args.paragraphs);
  if (headings.length || paragraphs.length) {
    if (headings.length !== paragraphs.length) {
      errors.push('headings and paragraphs must have the same number of items');
    } else {
      layout.headings = headings;
      layout.paragraphs = paragraphs;
    }
  }

  return layout;
}

function buildTimelineNotification(prefix, args) {
  var title = common.trim(args[prefix + 'Title']);
  var body = common.trim(args[prefix + 'Body']);
  var icon = args[prefix + 'Icon'];
  var notification;

  if (!title && !body && !hasToolArgValue(icon)) {
    return null;
  }

  notification = {
    layout: {
      type: 'genericNotification',
      title: title || 'Timeline update',
      tinyIcon: normalizeTimelineIcon(icon, TIMELINE_DEFAULT_NOTIFICATION_ICON)
    }
  };
  if (body) {
    notification.layout.body = common.truncate(body, 512);
  }
  if (prefix === 'updateNotification') {
    notification.time = normalizeTimelineDateTime(args.updateNotificationTime) || formatIsoDateTime(new Date());
  }

  return notification;
}

function buildTimelineReminderTime(reminderArgs, defaultArgs, pinTime, errors) {
  var reminderTime = normalizeTimelineDateTime(firstTimelineValue(reminderArgs, ['time', 'reminderTime']));
  var minutesBefore;
  var pinUnix;

  if (reminderTime) {
    return reminderTime;
  }

  minutesBefore = firstTimelineValue(reminderArgs, ['minutesBefore', 'remindMinutesBefore']);
  if (!hasToolArgValue(minutesBefore)) {
    minutesBefore = firstTimelineValue(defaultArgs, ['minutesBefore', 'remindMinutesBefore']);
  }
  if (hasToolArgValue(minutesBefore)) {
    minutesBefore = optionalTimelineInteger(minutesBefore, 'minutesBefore', 0, 43200, errors);
    pinUnix = parseUnixTimeArg(pinTime);
    if (minutesBefore !== null && pinUnix !== null) {
      return formatIsoDateTime(new Date((pinUnix - minutesBefore * 60) * 1000));
    }
  }

  return '';
}

function buildTimelineReminder(reminderArgs, defaultArgs, pinTime, errors) {
  var reminder;
  var title;
  var locationName;
  var icon;

  reminderArgs = parseObjectArg(reminderArgs) || {};
  reminder = {
    time: buildTimelineReminderTime(reminderArgs, defaultArgs, pinTime, errors),
    layout: {
      type: 'genericReminder'
    }
  };

  if (!reminder.time) {
    errors.push('Reminder time or minutesBefore is required');
    return null;
  }

  title = common.trim(firstTimelineValue(reminderArgs, ['title', 'reminderTitle']) || defaultArgs.reminderTitle || defaultArgs.title || 'Reminder');
  locationName = firstTimelineValue(reminderArgs, ['locationName', 'reminderLocationName']) || defaultArgs.reminderLocationName || defaultArgs.locationName;
  icon = firstTimelineValue(reminderArgs, ['tinyIcon', 'reminderIcon', 'icon']);
  if (!hasToolArgValue(icon)) {
    icon = defaultArgs.reminderIcon;
  }

  reminder.layout.title = title || 'Reminder';
  reminder.layout.tinyIcon = normalizeTimelineIcon(icon, TIMELINE_DEFAULT_REMINDER_ICON);
  addTimelineStringField(reminder.layout, 'locationName', locationName, 128);

  return reminder;
}

function buildTimelineReminders(args, pinTime, forceReminder, errors) {
  var reminders = [];
  var raw = parseObjectArg(args.reminders);
  var i;
  var reminder;

  if (isTimelineArray(raw)) {
    if (raw.length > 3) {
      errors.push('reminders can include at most 3 items');
    }
    for (i = 0; i < raw.length && i < 3; i += 1) {
      reminder = buildTimelineReminder(raw[i], args, pinTime, errors);
      if (reminder) {
        reminders.push(reminder);
      }
    }
    return reminders;
  }

  if (forceReminder || hasToolArgValue(args.reminderTime) || hasToolArgValue(args.remindMinutesBefore) || hasToolArgValue(args.minutesBefore) || hasToolArgValue(args.reminderTitle) || hasToolArgValue(args.reminderIcon)) {
    reminder = buildTimelineReminder({
      time: args.reminderTime || ((!hasToolArgValue(args.remindMinutesBefore) && !hasToolArgValue(args.minutesBefore) && forceReminder) ? pinTime : ''),
      minutesBefore: firstTimelineValue(args, ['minutesBefore', 'remindMinutesBefore']),
      title: firstTimelineValue(args, ['reminderTitle', 'title']),
      locationName: firstTimelineValue(args, ['reminderLocationName', 'locationName']),
      icon: args.reminderIcon
    }, args, pinTime, errors);
    if (reminder) {
      reminders.push(reminder);
    }
  }

  return reminders;
}

function normalizeTimelineActionType(action) {
  var type = common.trim(action.type).toLowerCase();

  if (!type && hasToolArgValue(action.launchCode)) {
    return 'openWatchApp';
  }
  if (!type && hasToolArgValue(action.url)) {
    return 'http';
  }
  if (type === 'openwatchapp' || type === 'open_watch_app') {
    return 'openWatchApp';
  }
  if (type === 'http') {
    return 'http';
  }

  return '';
}

function buildTimelineActions(args, errors) {
  var raw = parseObjectArg(args.actions);
  var actions = [];
  var i;
  var source;
  var action;
  var type;
  var launchCode;
  var bodyJson;

  if (raw === undefined || raw === null || raw === '') {
    return actions;
  }
  if (!isTimelineArray(raw)) {
    errors.push('actions must be an array');
    return actions;
  }

  for (i = 0; i < raw.length; i += 1) {
    source = parseObjectArg(raw[i]) || {};
    type = normalizeTimelineActionType(source);
    action = {
      title: common.trim(source.title),
      type: type
    };

    if (!action.title) {
      errors.push('actions[' + i + '].title is required');
      continue;
    }
    if (!type) {
      errors.push('actions[' + i + '].type must be openWatchApp or http');
      continue;
    }

    if (type === 'openWatchApp') {
      if (!hasToolArgValue(source.launchCode)) {
        errors.push('actions[' + i + '].launchCode is required for openWatchApp actions');
      } else {
        launchCode = optionalTimelineInteger(source.launchCode, 'actions[' + i + '].launchCode', 0, 2147483647, errors);
        if (launchCode !== null) {
          action.launchCode = launchCode;
        }
      }
    } else if (type === 'http') {
      action.url = common.trim(source.url);
      if (!action.url) {
        errors.push('actions[' + i + '].url is required for http actions');
      }
      action.method = common.trim(source.method || 'POST').toUpperCase();
      if (!/^(GET|POST|PUT|DELETE)$/.test(action.method)) {
        errors.push('actions[' + i + '].method must be GET, POST, PUT, or DELETE');
      }
      if (source.headers && typeof source.headers === 'object' && !isTimelineArray(source.headers)) {
        action.headers = source.headers;
      }
      if (hasToolArgValue(source.bodyText)) {
        action.bodyText = String(source.bodyText);
      }
      if (source.bodyJSON !== undefined && source.bodyJSON !== null && source.bodyJSON !== '') {
        bodyJson = parseObjectArg(source.bodyJSON);
        if (!bodyJson || typeof bodyJson !== 'object' || isTimelineArray(bodyJson)) {
          errors.push('actions[' + i + '].bodyJSON must be an object');
        } else {
          action.bodyJSON = bodyJson;
        }
      }
      if (action.bodyText && action.bodyJSON) {
        errors.push('actions[' + i + '] cannot include both bodyText and bodyJSON');
      }
      if ((action.method === 'GET' || action.method === 'DELETE') && (action.bodyText || action.bodyJSON)) {
        errors.push('actions[' + i + '] cannot include a body with GET or DELETE');
      }
      addTimelineStringField(action, 'successText', source.successText, 80);
      addTimelineStringField(action, 'failureText', source.failureText, 80);
      if (hasToolArgValue(source.successIcon)) {
        action.successIcon = normalizeTimelineIcon(source.successIcon, 'GENERIC_CONFIRMATION');
      }
      if (hasToolArgValue(source.failureIcon)) {
        action.failureIcon = normalizeTimelineIcon(source.failureIcon, 'RESULT_FAILED');
      }
    }

    actions.push(action);
  }

  return actions;
}

function buildTimelinePin(args, options) {
  var errors = [];
  var pin;
  var duration;
  var reminders;
  var actions;
  var createNotification;
  var updateNotification;
  var validationError;

  options = options || {};
  args = parseObjectArg(args) || {};

  if (typeof args !== 'object' || isTimelineArray(args)) {
    return {
      error: 'Timeline arguments must be an object'
    };
  }
  validationError = validateTimelineArgShape(args);
  if (validationError) {
    return {
      error: validationError
    };
  }

  pin = {
    id: common.trim(args.id || args.pinId) || generateTimelinePinId(args.title || args.reminderTitle),
    time: normalizeTimelineDateTime(firstTimelineValue(args, ['time', 'eventTime', 'pinTime'])),
    layout: buildTimelinePinLayout(args, errors)
  };

  if (!pin.time) {
    errors.push('time must be an ISO date-time, Unix seconds, or parseable date-time');
  }

  duration = optionalTimelineInteger(firstTimelineValue(args, ['durationMinutes', 'duration']), 'durationMinutes', 0, 1440, errors);
  if (duration !== null) {
    pin.duration = duration;
  }

  reminders = buildTimelineReminders(args, pin.time, options.forceReminder, errors);
  if (reminders.length) {
    pin.reminders = reminders;
  }

  createNotification = buildTimelineNotification('createNotification', args);
  if (createNotification) {
    pin.createNotification = createNotification;
  }
  updateNotification = buildTimelineNotification('updateNotification', args);
  if (updateNotification) {
    pin.updateNotification = updateNotification;
  }

  actions = buildTimelineActions(args, errors);
  if (actions.length) {
    pin.actions = actions;
  }

  if (errors.length) {
    return {
      error: errors[0]
    };
  }

  return {
    pin: pin
  };
}

function validateTimelinePin(pin) {
  var layoutType;
  var i;
  var reminder;
  var pinTimeMs;
  var nowMs;

  if (!pin || typeof pin !== 'object') {
    return 'Pin must be an object';
  }

  pin.id = common.trim(pin.id);
  if (!pin.id) {
    return 'Pin id is required';
  }
  if (pin.id.length > 64) {
    return 'Pin id must be 64 characters or fewer';
  }
  if (!common.trim(pin.time)) {
    return 'Pin time is required';
  }
  pinTimeMs = Date.parse(pin.time);
  if (!isFinite(pinTimeMs)) {
    return 'Pin time is invalid';
  }
  nowMs = new Date().getTime();
  if (pinTimeMs < nowMs - TIMELINE_MAX_PAST_MS) {
    return 'Pin time cannot be more than 2 days in the past';
  }
  if (pinTimeMs > nowMs + TIMELINE_MAX_FUTURE_MS) {
    return 'Pin time cannot be more than 1 year in the future';
  }
  if (!pin.layout || typeof pin.layout !== 'object') {
    return 'Pin layout is required';
  }
  layoutType = common.trim(pin.layout.type);
  if (!layoutType) {
    return 'Pin layout.type is required';
  }
  if (!common.trim(pin.layout.title)) {
    return 'Pin layout.title is required';
  }
  if (layoutType !== 'calendarPin' && !common.trim(pin.layout.tinyIcon)) {
    return 'Pin layout.tinyIcon is required';
  }
  if (layoutType === 'weatherPin' && !common.trim(pin.layout.locationName)) {
    return 'Pin layout.locationName is required for weatherPin';
  }
  if (pin.layout.headings && pin.layout.paragraphs && pin.layout.headings.length !== pin.layout.paragraphs.length) {
    return 'Pin layout headings and paragraphs must match';
  }

  if (pin.reminders !== undefined) {
    if (!isTimelineArray(pin.reminders)) {
      return 'Pin reminders must be an array';
    }
    if (pin.reminders.length > 3) {
      return 'Pin reminders can include at most 3 items';
    }
    for (i = 0; i < pin.reminders.length; i += 1) {
      reminder = pin.reminders[i] || {};
      if (!common.trim(reminder.time)) {
        return 'Pin reminders[' + i + '].time is required';
      }
      if (!reminder.layout || typeof reminder.layout !== 'object') {
        return 'Pin reminders[' + i + '].layout is required';
      }
      if (common.trim(reminder.layout.type) !== 'genericReminder') {
        return 'Pin reminders[' + i + '].layout.type must be genericReminder';
      }
      if (!common.trim(reminder.layout.title)) {
        return 'Pin reminders[' + i + '].layout.title is required';
      }
      if (!common.trim(reminder.layout.tinyIcon)) {
        return 'Pin reminders[' + i + '].layout.tinyIcon is required';
      }
    }
  }

  return '';
}

function timelinePinRequest(method, id, pin, requestId, callback) {
  getTimelineToken(function(tokenError, token) {
    var finished = false;

    if (!watch.isCurrentRequest(requestId)) {
      return;
    }
    if (tokenError) {
      callback(tokenError);
      return;
    }

    function finish(error, result) {
      if (finished) {
        return;
      }
      finished = true;
      callback(error, result);
    }

    function retryDelay(request) {
      var retryAfter = null;
      var seconds;

      try {
        retryAfter = request.getResponseHeader('Retry-After');
      } catch (e) {}
      seconds = parseFloat(retryAfter);
      if (!isNaN(seconds) && seconds >= 0) {
        return Math.min(seconds * 1000, common.MAX_RETRY_AFTER_MS || 5000);
      }
      return TIMELINE_RETRY_DELAY_MS;
    }

    function retry(attempt, delay) {
      setTimeout(function() {
        if (watch.isCurrentRequest(requestId)) {
          sendAttempt(attempt + 1);
        }
      }, delay);
    }

    function sendAttempt(attempt) {
      var request = new XMLHttpRequest();

      request.open(method, TIMELINE_API_BASE + encodeURIComponent(id), true);
      request.setRequestHeader('X-User-Token', token);
      if (pin) {
        request.setRequestHeader('Content-Type', 'application/json');
      }
      request.timeout = 30000;

      if (!watch.trackXhr(requestId, request)) {
        return;
      }

      request.onload = function() {
        var responseText = String(request.responseText || '');
        var retryable = request.status === 408 || request.status === 429 || request.status >= 500;

        watch.untrackXhr(requestId, request);
        if (!watch.isCurrentRequest(requestId)) {
          return;
        }
        if (retryable && attempt === 0) {
          common.logDebug('timeline retry status=' + request.status);
          retry(attempt, retryDelay(request));
          return;
        }
        if (method === 'DELETE' && attempt > 0 && request.status === 404) {
          finish(null, 'Timeline pin deleted successfully.');
          return;
        }
        if (request.status < 200 || request.status >= 300) {
          finish('Timeline HTTP ' + request.status + ': ' + responseText.substring(0, 180));
          return;
        }

        finish(null, method === 'DELETE' ? 'Timeline pin deleted successfully.' : 'Timeline pin saved successfully.');
      };

      request.onerror = function() {
        watch.untrackXhr(requestId, request);
        if (!watch.isCurrentRequest(requestId)) {
          return;
        }
        if (attempt === 0) {
          common.logDebug('timeline retry network error');
          retry(attempt, TIMELINE_RETRY_DELAY_MS);
          return;
        }
        finish('Timeline network error');
      };

      request.ontimeout = function() {
        watch.untrackXhr(requestId, request);
        if (!watch.isCurrentRequest(requestId)) {
          return;
        }
        if (attempt === 0) {
          common.logDebug('timeline retry timeout');
          retry(attempt, TIMELINE_RETRY_DELAY_MS);
          return;
        }
        finish('Timeline request timed out');
      };

      request.onabort = function() {
        watch.untrackXhr(requestId, request);
      };

      request.send(pin ? JSON.stringify(pin) : null);
    }

    sendAttempt(0);
  });
}

function extractTimelinePinId(args) {
  args = parseObjectArg(args) || {};
  if (args.id !== undefined) {
    return common.trim(args.id);
  }
  if (args.pinId !== undefined) {
    return common.trim(args.pinId);
  }
  if (args.pin_id !== undefined) {
    return common.trim(args.pin_id);
  }
  if (args.pin && args.pin.id !== undefined) {
    return common.trim(args.pin.id);
  }

  return '';
}

function cloneTimelineValue(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (e) {
    return null;
  }
}

function buildTimelineSuccessResult(pin, editable, warning) {
  var payload = {
    status: 'success',
    id: pin.id,
    title: pin.layout && pin.layout.title ? String(pin.layout.title) : '',
    time: pin.time,
    editable: !!editable
  };
  if (warning) {
    payload.warning = warning;
  }
  return common.safeJson(payload);
}

function buildTimelineDeleteResult(id, warning) {
  var payload = {
    status: 'deleted',
    id: id
  };
  if (warning) {
    payload.warning = warning;
  }
  return common.safeJson(payload);
}

function saveTimelineRecord(kind, pin, args) {
  var argsClone = cloneTimelineValue(args) || {};
  argsClone.id = pin.id;
  try {
    return timelineStore.saveTimelinePin(pin.id, kind, pin, argsClone);
  } catch (e) {
    return false;
  }
}

function finishTimelineSave(kind, pin, args, callback) {
  var editable = saveTimelineRecord(kind, pin, args);
  var warning = '';

  if (!editable) {
    warning = 'Pin saved but storage failed; not editable';
    common.logDebug('timeline store save failed id=' + pin.id);
  }
  callback(null, buildTimelineSuccessResult(pin, editable, warning));
}

function callTimelineUpsertBuiltin(args, requestId, callback) {
  var built = buildTimelinePin(args, { forceReminder: false });
  var pin;
  var validationError;
  var argsForStore;

  if (built.error) {
    callback(built.error);
    return;
  }

  pin = built.pin;
  validationError = validateTimelinePin(pin);

  if (validationError) {
    callback(validationError);
    return;
  }

  argsForStore = cloneTimelineValue(args) || {};
  argsForStore.id = pin.id;

  timelinePinRequest('PUT', pin.id, pin, requestId, function(error) {
    if (error) {
      callback(error);
      return;
    }
    finishTimelineSave('pin', pin, argsForStore, callback);
  });
}

function callTimelineReminderBuiltin(args, requestId, callback) {
  var built = buildTimelinePin(args, { forceReminder: true });
  var pin;
  var validationError;
  var argsForStore;

  if (built.error) {
    callback(built.error);
    return;
  }

  pin = built.pin;
  validationError = validateTimelinePin(pin);

  if (validationError) {
    callback(validationError);
    return;
  }

  argsForStore = cloneTimelineValue(args) || {};
  argsForStore.id = pin.id;

  timelinePinRequest('PUT', pin.id, pin, requestId, function(error) {
    if (error) {
      callback(error);
      return;
    }
    finishTimelineSave('reminder', pin, argsForStore, callback);
  });
}

function callTimelineDeleteBuiltin(args, requestId, callback) {
  var id = extractTimelinePinId(args);
  var stored;

  if (!id) {
    callback('Pin id is required');
    return;
  }
  if (id.length > 64) {
    callback('Pin id must be 64 characters or fewer');
    return;
  }

  try {
    stored = timelineStore.getTimelinePin(id);
  } catch (e) {
    stored = null;
  }

  timelinePinRequest('DELETE', id, null, requestId, function(error) {
    var removed = false;
    var warning = '';

    if (error) {
      callback(error);
      return;
    }
    try {
      removed = timelineStore.removeTimelinePin(id);
    } catch (e) {}
    if (stored && !removed) {
      warning = 'Pin deleted but stored edit record could not be removed';
      common.logDebug('timeline store remove failed id=' + id);
    }
    callback(null, buildTimelineDeleteResult(id, warning));
  });
}

function callTimelineListBuiltin(args, requestId, callback) {
  var pins = [];
  try {
    pins = timelineStore.listTimelinePins();
  } catch (e) {
    pins = [];
  }
  callback(null, common.safeJson(pins));
}

function callTimelineEditBuiltin(args, requestId, callback) {
  var id = common.trim(args && args.id);
  var stored;
  var mergedArgs;
  var allowedFields = ['title', 'time', 'durationMinutes', 'pinType', 'subtitle', 'body', 'locationName', 'icon', 'pinIcon', 'reminderTime', 'remindMinutesBefore', 'reminderTitle', 'reminderIcon', 'createNotificationTitle', 'createNotificationBody'];
  var i;
  var key;
  var forceReminder;
  var built;
  var pin;
  var validationError;
  var argsForStore;

  if (!id) {
    callback('Missing required tool argument: id');
    return;
  }
  if (id.length > 64) {
    callback('Pin id must be 64 characters or fewer');
    return;
  }

  try {
    stored = timelineStore.getTimelinePin(id);
  } catch (e) {
    stored = null;
  }
  if (!stored) {
    callback('Unknown pin id: ' + id + '. Use pebble_timeline_list_pins to find editable pins.');
    return;
  }

  mergedArgs = cloneTimelineValue(stored.args) || {};
  for (i = 0; i < allowedFields.length; i += 1) {
    key = allowedFields[i];
    if (hasOwn(args, key)) {
      mergedArgs[key] = cloneTimelineValue(args[key]);
      if (mergedArgs[key] === null && args[key] !== null) {
        mergedArgs[key] = args[key];
      }
    }
  }
  mergedArgs.id = stored.id;

  forceReminder = stored.kind === 'reminder';
  built = buildTimelinePin(mergedArgs, { forceReminder: forceReminder });
  if (built.error) {
    callback(built.error);
    return;
  }
  pin = built.pin;
  pin.id = stored.id;
  validationError = validateTimelinePin(pin);
  if (validationError) {
    callback(validationError);
    return;
  }

  argsForStore = cloneTimelineValue(mergedArgs) || {};
  argsForStore.id = pin.id;

  timelinePinRequest('PUT', pin.id, pin, requestId, function(error) {
    if (error) {
      callback(error);
      return;
    }
    finishTimelineSave(stored.kind, pin, argsForStore, callback);
  });
}

function parseUnixTimeArg(value) {
  var number;
  var parsed;
  var text;

  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Math.floor(value > 100000000000 ? value / 1000 : value);
  }

  text = common.trim(value);
  if (!text) {
    return null;
  }

  if (/^[0-9]+$/.test(text)) {
    number = parseInt(text, 10);
    return Math.floor(number > 100000000000 ? number / 1000 : number);
  }

  parsed = Date.parse(text);
  if (isNaN(parsed)) {
    return null;
  }

  return Math.floor(parsed / 1000);
}

function localDayStartUnix(offsetDays) {
  var now = new Date();
  var date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);

  return Math.floor(date.getTime() / 1000);
}

function buildHealthInfoWindow(args) {
  var now = Math.floor(new Date().getTime() / 1000);
  var range;
  var startUnix;
  var endUnix;

  args = args || {};
  range = common.trim(args.range || args.timeRange || 'today').toLowerCase().replace(/[-\s]+/g, '_');

  if (range === 'custom' || args.startTime !== undefined || args.startUnix !== undefined || args.endTime !== undefined || args.endUnix !== undefined) {
    startUnix = parseUnixTimeArg(args.startUnix !== undefined ? args.startUnix : args.startTime);
    endUnix = parseUnixTimeArg(args.endUnix !== undefined ? args.endUnix : args.endTime);
    if (startUnix === null) {
      return { error: 'startTime or startUnix is required for custom health ranges' };
    }
    if (endUnix === null) {
      endUnix = now;
    }
  } else if (range === 'today') {
    startUnix = localDayStartUnix(0);
    endUnix = now;
  } else if (range === 'yesterday') {
    startUnix = localDayStartUnix(-1);
    endUnix = localDayStartUnix(0);
  } else if (range === 'last_24h' || range === 'last_24_hours') {
    startUnix = now - 24 * 60 * 60;
    endUnix = now;
  } else if (range === 'last_7d' || range === 'last_7_days' || range === 'week') {
    startUnix = now - MAX_HEALTH_RANGE_SECONDS;
    endUnix = now;
  } else {
    return { error: 'Unsupported health range: ' + range };
  }

  if (endUnix > now) {
    endUnix = now;
  }
  if (endUnix <= 0 || startUnix < 0 || startUnix >= endUnix) {
    return { error: 'Invalid health time range' };
  }
  if (endUnix - startUnix > MAX_HEALTH_RANGE_SECONDS) {
    return { error: 'Health range cannot exceed 7 days' };
  }

  return {
    startUnix: startUnix,
    endUnix: endUnix
  };
}

function healthMetricValue(response, metric) {
  var values = {
    steps: response.stepCount,
    active_time: response.activeSeconds,
    distance: response.walkedDistanceMeters,
    sleep: response.sleepSeconds,
    restful_sleep: response.sleepRestfulSeconds,
    resting_calories: response.restingKCalories,
    active_calories: response.activeKCalories
  };
  var result = {};

  if (metric === 'heart_rate') {
    if (response.heartRateCurrentBPM !== undefined) { result.currentBpm = response.heartRateCurrentBPM; }
    if (response.heartRateAverageBPM !== undefined) { result.averageBpm = response.heartRateAverageBPM; }
    if (response.heartRateMinBPM !== undefined) { result.minBpm = response.heartRateMinBPM; }
    if (response.heartRateMaxBPM !== undefined) { result.maxBpm = response.heartRateMaxBPM; }
    return Object.keys(result).length ? result : undefined;
  }
  if (values[metric] !== undefined && values[metric] !== null) {
    return values[metric];
  }
  return undefined;
}

function healthFriendlyMetricName(metric) {
  var names = {
    steps: 'steps', active_time: 'activeSeconds', distance: 'distanceMeters',
    sleep: 'sleepSeconds', restful_sleep: 'restfulSleepSeconds',
    resting_calories: 'restingCaloriesKcal', active_calories: 'activeCaloriesKcal'
  };
  return names[metric];
}

function healthValues(response, metrics) {
  var values = {};
  var metric;
  var value;
  var heartRate;
  var i;

  for (i = 0; i < metrics.length; i += 1) {
    metric = metrics[i];
    value = healthMetricValue(response, metric);
    if (value === undefined) { continue; }
    if (metric === 'heart_rate') {
      heartRate = value;
    } else {
      values[healthFriendlyMetricName(metric)] = value;
    }
  }
  if (heartRate) { values.heartRate = heartRate; }
  return values;
}

function healthUnavailable(response, metrics, scope) {
  var result = [];
  var metric;
  var bit;
  var reason;
  var i;

  for (i = 0; i < metrics.length; i += 1) {
    metric = metrics[i];
    bit = HEALTH_METRIC_BITS[metric] || HEALTH_SESSION_BITS[metric];
    reason = '';
    if (bit && (Number(response.unp) & bit)) { reason = 'permission_denied'; }
    else if (bit && (Number(response.uns) & bit)) { reason = 'not_supported'; }
    else if (bit && (Number(response.und) & bit)) { reason = 'no_data'; }
    if (reason) {
      result.push({ metric: metric, reason: reason, scope: scope });
    }
  }
  return result;
}

function healthDayBuckets(startUnix, endUnix) {
  var start = new Date(startUnix * 1000);
  var cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  var result = [];
  var next;

  while (cursor.getTime() / 1000 < endUnix) {
    next = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    result.push({
      startUnix: Math.max(startUnix, Math.floor(cursor.getTime() / 1000)),
      endUnix: Math.min(endUnix, Math.floor(next.getTime() / 1000))
    });
    cursor = next;
  }
  return result;
}

function healthHourBuckets(startUnix, endUnix) {
  var result = [];
  var cursor = startUnix;
  while (cursor < endUnix) {
    result.push({ startUnix: cursor, endUnix: Math.min(endUnix, cursor + 60 * 60) });
    cursor += 60 * 60;
  }
  return result;
}

function callHealthInfoBuiltin(args, requestId, callback) {
  var metricNames = ['steps', 'active_time', 'distance', 'sleep', 'restful_sleep', 'resting_calories', 'active_calories', 'heart_rate', 'activity_sessions', 'sleep_sessions'];
  var scalarMetrics = [];
  var sessionMetrics = [];
  var range;
  var granularity;
  var baseline;
  var buckets;
  var queries = [];
  var responses = [];
  var sessions = [];
  var truncated = false;
  var totalMask = 0;
  var sessionMask = 0;
  var i;
  var j;
  var metric;
  var query;

  args = args || {};
  if (!isArrayValue(args.metrics) || !args.metrics.length) {
    callback('metrics must be a nonempty array');
    return;
  }
  for (i = 0; i < args.metrics.length; i += 1) {
    metric = args.metrics[i];
    if (typeof metric !== 'string' || metricNames.indexOf(metric) < 0) {
      callback('metrics must contain supported metric strings');
      return;
    }
    if (args.metrics.indexOf(metric) !== i) {
      callback('metrics must contain unique values');
      return;
    }
    if (metric === 'activity_sessions' || metric === 'sleep_sessions') { sessionMetrics.push(metric); }
    else { scalarMetrics.push(metric); totalMask |= HEALTH_METRIC_BITS[metric]; }
  }
  range = buildHealthInfoWindow(args);
  if (range.error) { callback(range.error); return; }
  granularity = args.granularity || 'total';
  if (['total', 'hour', 'day'].indexOf(granularity) < 0) { callback('granularity must be total, hour, or day'); return; }
  baseline = args.baseline || 'none';
  if (['none', 'daily', 'weekday_or_weekend', 'same_weekday'].indexOf(baseline) < 0) { callback('baseline must be none, daily, weekday_or_weekend, or same_weekday'); return; }
  if (granularity === 'hour' && range.endUnix - range.startUnix > MAX_HEALTH_HOUR_RANGE_SECONDS) {
    callback('Hour granularity cannot exceed 24 hours');
    return;
  }

  for (i = 0; i < sessionMetrics.length; i += 1) { sessionMask |= HEALTH_SESSION_BITS[sessionMetrics[i]]; }
  if (scalarMetrics.length) { queries.push({ kind: 'total', startUnix: range.startUnix, endUnix: range.endUnix, queryMask: totalMask, averageScope: 0 }); }
  if (sessionMetrics.length) { queries.push({ kind: 'current', startUnix: range.startUnix, endUnix: range.endUnix, queryMask: 256, averageScope: 0 }); }
  if (granularity !== 'total' && scalarMetrics.length) {
    buckets = granularity === 'hour' ? healthHourBuckets(range.startUnix, range.endUnix) : healthDayBuckets(range.startUnix, range.endUnix);
    if (buckets.length * scalarMetrics.length > MAX_HEALTH_BUCKET_VALUES) {
      callback('Health Info request has too many bucket values; request fewer metrics or coarser granularity');
      return;
    }
    for (i = 0; i < buckets.length; i += 1) {
      queries.push({ kind: 'bucket', bucket: buckets[i], startUnix: buckets[i].startUnix, endUnix: buckets[i].endUnix, queryMask: totalMask, averageScope: 0 });
    }
  }
  if (baseline !== 'none' && scalarMetrics.length) {
    queries.push({ kind: 'baseline', startUnix: range.startUnix, endUnix: range.endUnix, queryMask: totalMask, averageScope: { daily: 1, weekday_or_weekend: 2, same_weekday: 3 }[baseline] });
  }
  if (sessionMetrics.length) {
    queries.push({ kind: 'sessions', startUnix: range.startUnix, endUnix: range.endUnix, queryMask: sessionMask, averageScope: 0, sessionOffset: 0 });
  }

  function finish() {
    var result = {
      startTime: new Date(range.startUnix * 1000).toISOString(),
      endTime: new Date(range.endUnix * 1000).toISOString(),
      timezoneOffsetMinutes: -new Date(range.startUnix * 1000).getTimezoneOffset(),
      granularity: granularity,
      totals: {},
      unavailable: []
    };
    var response;
    var item;
    var values;
    for (i = 0; i < responses.length; i += 1) {
      response = responses[i].response;
      values = healthValues(response, scalarMetrics);
      if (responses[i].kind === 'total') { result.totals = values; }
      if (responses[i].kind === 'baseline') {
        result.baseline = { scope: baseline, values: values };
        item = healthUnavailable(response, responses[i].metrics);
        if (item.length) { result.baseline.unavailable = item; }
      }
      if (responses[i].kind === 'bucket') {
        if (!result.buckets) { result.buckets = []; }
        item = { startTime: new Date(responses[i].startUnix * 1000).toISOString(), endTime: new Date(responses[i].endUnix * 1000).toISOString(), values: values };
        item.unavailable = healthUnavailable(response, responses[i].metrics);
        if (!item.unavailable.length) { delete item.unavailable; }
        result.buckets.push(item);
      }
      if (responses[i].kind === 'total' || responses[i].kind === 'current' || responses[i].kind === 'sessions') {
        result.unavailable = result.unavailable.concat(healthUnavailable(response, responses[i].metrics));
      }
      if ((responses[i].kind === 'total' || responses[i].kind === 'current') && response.currentActivities !== undefined && response.currentActivities !== null) {
        result.currentActivities = String(response.currentActivities).split(',').filter(function(name) { return common.trim(name); }).map(function(name) { return common.trim(name); });
      }
    }
    if (sessions.length) {
      result.sessions = [];
      for (i = 0; i < sessions.length; i += 1) {
        item = sessions[i];
        result.sessions.push({ type: HEALTH_ACTIVITY_TYPES[item[0]] || 'unknown', startTime: new Date(item[1] * 1000).toISOString(), endTime: new Date(item[2] * 1000).toISOString(), durationSeconds: item[2] - item[1] });
      }
    }
    if (truncated) { result.truncated = true; }
    while (JSON.stringify(result).length > 5800 && result.sessions && result.sessions.length) { result.sessions.pop(); result.truncated = true; }
    if (!scalarMetrics.length) { delete result.totals; }
    if (!result.unavailable.length) { delete result.unavailable; }
    if (JSON.stringify(result).length > 5800) {
      callback('Health Info result exceeds tool result limit');
      return;
    }
    callback(null, JSON.stringify(result));
  }

  function runNext(index) {
    if (!watch.isCurrentRequest(requestId)) { return; }
    if (index >= queries.length) { finish(); return; }
    query = queries[index];
    watch.requestHealthInfo({ startUnix: query.startUnix, endUnix: query.endUnix, queryMask: query.queryMask, averageScope: query.averageScope, sessionOffset: query.sessionOffset || 0 }, requestId, function(error, jsonString) {
      var parsed;
      var page;
      if (!watch.isCurrentRequest(requestId)) { return; }
      if (error) { callback(error); return; }
      try { parsed = JSON.parse(jsonString); } catch (e) { callback('Malformed health info response JSON'); return; }
      if (!parsed || typeof parsed !== 'object') { callback('Malformed health info response JSON'); return; }
      if (query.kind === 'sessions') {
        page = isArrayValue(parsed.sessions) ? parsed.sessions : [];
        responses.push({ kind: query.kind, metrics: sessionMetrics, startUnix: query.startUnix, endUnix: query.endUnix, response: parsed });
        for (j = 0; j < page.length && sessions.length < MAX_HEALTH_SESSIONS; j += 1) { if (isArrayValue(page[j]) && page[j].length >= 3) { sessions.push(page[j]); } }
        if (j < page.length) { truncated = true; }
        if (parsed.hasMore && sessions.length < MAX_HEALTH_SESSIONS && page.length) { query.sessionOffset += page.length; runNext(index); return; }
        if (parsed.hasMore) { truncated = true; }
      } else {
        responses.push({ kind: query.kind, metrics: scalarMetrics, startUnix: query.startUnix, endUnix: query.endUnix, response: parsed });
      }
      runNext(index + 1);
    });
  }

  runNext(0);
}

function addBuiltinTool(tools, toolMap, definition) {
  var baseName = definition.name;
  var exposedName = baseName;
  var suffix = 2;

while (hasOwn(toolMap, exposedName)) {
      exposedName = baseName + '_' + suffix;
      suffix += 1;
    }

  tools.push({
    name: exposedName,
    description: definition.description,
    parameters: definition.parameters
  });
  toolMap[exposedName] = {
    kind: 'builtin',
    name: exposedName,
    label: definition.label,
    parameters: definition.parameters,
    call: definition.call
  };
  common.logDebug('builtin tool exposed=' + exposedName);
}

function addBuiltinTools(settings, tools, toolMap) {
  if (settings.WebSearchEnabled) {
    addBuiltinTool(tools, toolMap, {
      name: 'web_fetch',
      label: 'Web Fetch',
      description: 'Fetch and read an HTTP(S) web page as Markdown. Use offset and limit character ranges; fetch pages in chunks when needed. Do not assume content outside returned range.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['url'],
        properties: {
          url: { type: 'string', maxLength: 2048, description: 'HTTP(S) page URL.' },
          offset: { type: 'integer', minimum: 0, maximum: 500000, description: 'Character offset in final Markdown. Default 0.' },
          limit: { type: 'integer', minimum: 1, maximum: 6000, description: 'Maximum returned Markdown characters. Default 3000.' }
        }
      },
      call: function(args, requestId, callback) { webFetch.fetch(args, requestId, watch, callback); }
    });
  }
  if (settings.GeolocationToolEnabled) {
    addBuiltinTool(tools, toolMap, {
      name: 'pebble_get_location',
      label: 'Geolocation',
      description: 'Get the phone current geolocation. Use only when user request needs current location.',
      parameters: {
        type: 'object',
        properties: {
          enableHighAccuracy: { type: 'boolean', description: 'Use GPS/high accuracy when available. Default false.' },
          timeoutMs: { type: 'integer', minimum: 1000, maximum: 60000, description: 'Maximum wait time in milliseconds. Default 10000.' },
          maximumAgeMs: { type: 'integer', minimum: 0, maximum: 3600000, description: 'Accept cached location up to this age in milliseconds. Default 300000.' }
        }
      },
      call: callGeolocationBuiltin
    });
  }

  if (settings.TimelineToolEnabled) {
    addBuiltinTool(tools, toolMap, {
      name: 'pebble_timeline_create_reminder',
      label: 'Timeline',
      description: 'Create a Pebble timeline pin with a scheduled reminder alert. Use this for reminder, alarm, alert, and "remind me" requests. Do not use this for general calendar events or timeline pins that do not need a reminder alert. Provide structured fields only; the phone builds the Pebble reminders array with layout.type genericReminder and icon system://images/NOTIFICATION_REMINDER.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', maxLength: 64, description: 'Optional pin id. If absent, a unique id is generated. Do not reuse ids for deleted pins.' },
          title: { type: 'string', description: 'Reminder/pin title shown on the watch.' },
          time: { type: 'string', description: 'Event time as ISO date-time with timezone, parseable date-time, or Unix seconds. For simple reminders, this is the reminder time.' },
          reminderTime: { type: 'string', description: 'Optional exact reminder alert time. Defaults to time unless remindMinutesBefore is provided.' },
          remindMinutesBefore: { type: 'integer', minimum: 0, maximum: 43200, description: 'Optional minutes before time to show reminder. Use instead of reminderTime for "10 minutes before" requests.' },
          durationMinutes: { type: 'integer', minimum: 0, maximum: 1440, description: 'Optional event duration in minutes.' },
          body: { type: 'string', maxLength: 512, description: 'Optional detail text for the timeline pin.' },
          locationName: { type: 'string', description: 'Optional location shown on the reminder.' },
          pinIcon: { type: 'string', description: 'Optional Pebble icon name or URI for the pin. Default NOTIFICATION_REMINDER. Example: NOTIFICATION_REMINDER, ALARM_CLOCK, TIMELINE_CALENDAR.' },
          reminderIcon: { type: 'string', description: 'Optional Pebble icon name or URI for the reminder. Default NOTIFICATION_REMINDER.' },
          createNotificationTitle: { type: 'string', description: 'Optional notification title shown when pin is first delivered. This is not the scheduled reminder.' },
          createNotificationBody: { type: 'string', maxLength: 512, description: 'Optional notification body shown when pin is first delivered.' }
        },
        required: ['title', 'time']
      },
      call: callTimelineReminderBuiltin
    });
    addBuiltinTool(tools, toolMap, {
      name: 'pebble_timeline_create_or_update_pin',
      label: 'Timeline',
      description: 'Create or update one of this app\'s non-reminder Pebble timeline, calendar, sports, or weather pins from simple arguments. Do not use this for simple "remind me" requests; use pebble_timeline_create_reminder instead. Do not provide raw Pebble pin JSON, layout objects, reminders arrays, action objects, or Pebble Timeline API payloads; the phone builds the final pin JSON. Updating uses the same id. Deleted pin ids should not be reused. Use reminderTime or remindMinutesBefore only when the user asks for an alert attached to this non-reminder pin.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', maxLength: 64, description: 'Optional pin id. Required when updating an existing pin. Generated when omitted for new pins.' },
          time: { type: 'string', description: 'Pin event start time as ISO date-time with timezone, parseable date-time, or Unix seconds.' },
          durationMinutes: { type: 'integer', minimum: 0, maximum: 1440, description: 'Optional event duration in minutes.' },
          pinType: { type: 'string', enum: ['generic', 'calendar', 'sports', 'weather'], description: 'Kind of timeline pin. Default generic.' },
          title: { type: 'string', description: 'Pin title shown on the watch.' },
          subtitle: { type: 'string', description: 'Optional subtitle.' },
          body: { type: 'string', maxLength: 512, description: 'Optional pin body text.' },
          locationName: { type: 'string', description: 'Optional location. Required for weatherPin and useful for reminders/calendar pins.' },
          icon: { type: 'string', description: 'Optional Pebble icon name or URI. Default NOTIFICATION_REMINDER except calendar pins. Example: NOTIFICATION_REMINDER, NOTIFICATION_FLAG, ALARM_CLOCK, TIMELINE_CALENDAR.' },
          reminderTime: { type: 'string', description: 'Optional single scheduled reminder time. Creates reminders[0].' },
          remindMinutesBefore: { type: 'integer', minimum: 0, maximum: 43200, description: 'Optional minutes before pin time for a single scheduled reminder.' },
          reminderTitle: { type: 'string', description: 'Optional title for the single scheduled reminder. Defaults to title.' },
          reminderIcon: { type: 'string', description: 'Optional icon for scheduled reminder. Default NOTIFICATION_REMINDER.' }
        },
        required: ['title', 'time']
      },
      call: callTimelineUpsertBuiltin
    });
    addBuiltinTool(tools, toolMap, {
      name: 'pebble_timeline_delete_pin',
      label: 'Timeline',
      description: 'Delete one of this app\'s Pebble timeline pins by id.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Pin id to delete.' }
        },
        required: ['id']
      },
      call: callTimelineDeleteBuiltin
    });
    addBuiltinTool(tools, toolMap, {
      name: 'pebble_timeline_list_pins',
      label: 'Timeline',
      description: 'List LLM-created Pebble timeline pins stored on the phone for editing. Returns compact JSON with id, kind, title, time for editable pins. Use this to find a target before calling pebble_timeline_edit_pin. No network request.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {}
      },
      call: callTimelineListBuiltin
    });
    addBuiltinTool(tools, toolMap, {
      name: 'pebble_timeline_edit_pin',
      label: 'Timeline',
      description: 'Edit an existing LLM-created Pebble timeline pin by id. PUTs full pin JSON to the same id, replacing the existing pin entirely. Load the target with pebble_timeline_list_pins first. Only supplied fields change; other fields are preserved from the stored pin. Empty strings clear optional fields.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', maxLength: 64, description: 'Pin id to edit. Must be an existing LLM-created pin. Use pebble_timeline_list_pins to find ids.' },
          title: { type: 'string', description: 'Pin title shown on the watch.' },
          time: { type: 'string', description: 'Pin event start time as ISO date-time with timezone, parseable date-time, or Unix seconds.' },
          durationMinutes: { type: 'integer', minimum: 0, maximum: 1440, description: 'Optional event duration in minutes.' },
          pinType: { type: 'string', enum: ['generic', 'calendar', 'sports', 'weather'], description: 'Kind of timeline pin.' },
          subtitle: { type: 'string', description: 'Optional subtitle.' },
          body: { type: 'string', maxLength: 512, description: 'Optional pin body text. Empty string clears.' },
          locationName: { type: 'string', description: 'Optional location. Empty string clears.' },
          icon: { type: 'string', description: 'Optional Pebble icon name or URI. Empty string clears to default.' },
          pinIcon: { type: 'string', description: 'Optional Pebble icon name or URI for the pin. Empty string clears.' },
          reminderTime: { type: 'string', description: 'Optional exact reminder alert time.' },
          remindMinutesBefore: { type: 'integer', minimum: 0, maximum: 43200, description: 'Optional minutes before time to show reminder.' },
          reminderTitle: { type: 'string', description: 'Optional title for the single scheduled reminder. Empty string clears.' },
          reminderIcon: { type: 'string', description: 'Optional icon for scheduled reminder. Empty string clears.' },
          createNotificationTitle: { type: 'string', description: 'Optional notification title shown when pin is first delivered. Empty string clears.' },
          createNotificationBody: { type: 'string', maxLength: 512, description: 'Optional notification body shown when pin is first delivered. Empty string clears.' }
        },
        required: ['id']
      },
      call: callTimelineEditBuiltin
    });
  }

  if (settings.HealthToolEnabled) {
    addBuiltinTool(tools, toolMap, {
      name: 'pebble_health_info',
      label: 'Health Info',
      description: 'Request only health metrics relevant to the user question. Supports totals, hourly or daily buckets, historical activity and sleep sessions, heart-rate statistics, and an optional personal baseline.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['metrics'],
        properties: {
          metrics: { type: 'array', minItems: 1, uniqueItems: true, description: 'Nonempty unique health metrics to request.', items: { type: 'string', enum: ['steps', 'active_time', 'distance', 'sleep', 'restful_sleep', 'resting_calories', 'active_calories', 'heart_rate', 'activity_sessions', 'sleep_sessions'] } },
          range: { type: 'string', enum: ['today', 'yesterday', 'last_24h', 'last_7d', 'custom'], description: 'Health time range. Default today.' },
          startTime: { type: 'string', description: 'ISO date-time or Unix seconds for custom range start.' },
          endTime: { type: 'string', description: 'ISO date-time or Unix seconds for custom range end. Default now.' },
          granularity: { type: 'string', enum: ['total', 'hour', 'day'], description: 'Aggregation granularity. Default total.' },
          baseline: { type: 'string', enum: ['none', 'daily', 'weekday_or_weekend', 'same_weekday'], description: 'Optional personal baseline scope. Default none.' }
        }
      },
      call: callHealthInfoBuiltin
    });
  }
}

function discoverPhoneTools(settings, requestId, callback) {
  discoverMcpTools(settings, requestId, function(error, tools, toolMap) {
    if (!watch.isCurrentRequest(requestId)) {
      return;
    }
    if (error) {
      callback(error);
      return;
    }

    addBuiltinTools(settings, tools, toolMap);
    tools.sort(function(a, b) {
      if (a.name < b.name) {
        return -1;
      }
      if (a.name > b.name) {
        return 1;
      }
      return 0;
    });
    callback(null, tools, toolMap);
  });
}

function callMcpTool(toolInfo, args, requestId, callback) {
  var called = false;
  var retried = false;

  function once(error, resultText) {
    if (called) {
      return;
    }
    called = true;
    if (error) {
      common.logDebug('mcp tool error server=' + toolInfo.server.label + ' tool=' + toolInfo.toolName + ' error=' + error);
      callback(error);
      return;
    }
    common.logDebug('mcp tool result server=' + toolInfo.server.label + ' tool=' + toolInfo.toolName + ' chars=' + String(resultText || '').length);
    callback(null, resultText);
  }

  function doCall() {
    common.logDebug('mcp tool call server=' + toolInfo.server.label + ' tool=' + toolInfo.toolName + ' args=' + common.safeJson(args).substring(0, 240));
    mcpJsonRpc(toolInfo.server, 'tools/call', {
      name: toolInfo.toolName,
      arguments: args || {}
    }, true, requestId, function(error, result, httpStatus) {
      if (!watch.isCurrentRequest(requestId)) {
        return;
      }
      if (error && httpStatus === 404 && toolInfo.server.sessionId && !retried) {
        retried = true;
        common.logDebug('mcp tool 404 reinitialize server=' + toolInfo.server.label);
        toolInfo.server.sessionId = '';
        initializeMcpServer(toolInfo.server, requestId, function(initError) {
          if (!watch.isCurrentRequest(requestId)) {
            return;
          }
          if (initError) {
            once(initError);
            return;
          }
          doCall();
        });
        return;
      }
      if (error) {
        once(error);
        return;
      }
      if (result && result.isError === true) {
        once(formatMcpToolResult(result));
        return;
      }
      once(null, formatMcpToolResult(result));
    });
  }

  doCall();
}

function callBuiltinTool(toolInfo, args, requestId, callback) {
  common.logDebug('builtin tool call name=' + toolInfo.name + ' args=' + common.safeJson(args).substring(0, 240));
  toolInfo.call(args, requestId, function(error, resultText) {
    if (!watch.isCurrentRequest(requestId)) {
      return;
    }
    if (error) {
      common.logDebug('builtin tool error name=' + toolInfo.name + ' error=' + error);
      callback(error);
      return;
    }

    common.logDebug('builtin tool result name=' + toolInfo.name + ' chars=' + String(resultText || '').length);
    callback(null, resultText);
  });
}

function isArrayValue(value) {
  return Object.prototype.toString.call(value) === '[object Array]';
}

function isObjectValue(value) {
  return value && typeof value === 'object' && !isArrayValue(value);
}

function parseToolArgsValue(value) {
  var text;

  if (value === undefined || value === null || value === '') {
    return { args: {} };
  }

  if (typeof value === 'string') {
    text = common.trim(value);
    if (!text) {
      return { args: {} };
    }
    try {
      value = JSON.parse(text);
    } catch (e) {
      return { error: 'Malformed tool arguments JSON' };
    }
  }

  if (!isObjectValue(value)) {
    return { error: 'Tool arguments must be a JSON object' };
  }

  return { args: value };
}

function valueMatchesType(value, type) {
  if (type === 'string') {
    return typeof value === 'string';
  }
  if (type === 'integer') {
    return typeof value === 'number' && isFinite(value) && Math.floor(value) === value;
  }
  if (type === 'number') {
    return typeof value === 'number' && isFinite(value);
  }
  if (type === 'boolean') {
    return typeof value === 'boolean';
  }
  if (type === 'object') {
    return isObjectValue(value);
  }
  if (type === 'array') {
    return isArrayValue(value);
  }
  if (type === 'null') {
    return value === null;
  }
  return true;
}

function argValuesEqual(a, b) {
  if (typeof a !== typeof b) {
    return false;
  }
  if (typeof a === 'object' && a !== null && b !== null) {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch (e) {
      return false;
    }
  }
  return a === b;
}

function articleFor(type) {
  if (type === 'integer' || type === 'object' || type === 'array') {
    return 'an';
  }
  return 'a';
}

function validateToolArgValue(value, schema, key) {
  var type;
  var i;
  var matched;

  if (!isObjectValue(schema)) {
    return '';
  }

  type = schema.type;
  if (type) {
    if (isArrayValue(type)) {
      matched = false;
      for (i = 0; i < type.length; i += 1) {
        if (valueMatchesType(value, type[i])) {
          matched = true;
          break;
        }
      }
      if (!matched) {
        return key + ' must be ' + type.join(' or ');
      }
    } else if (!valueMatchesType(value, type)) {
      return key + ' must be ' + articleFor(type) + ' ' + type;
    }
  }

  if (isArrayValue(schema.enum) && schema.enum.length) {
    matched = false;
    for (i = 0; i < schema.enum.length; i += 1) {
      if (argValuesEqual(value, schema.enum[i])) {
        matched = true;
        break;
      }
    }
    if (!matched) {
      return key + ' must be one of ' + schema.enum.map(function(v) { return String(v); }).join(', ');
    }
  }

  if (schema.minimum !== undefined && typeof value === 'number' && value < schema.minimum) {
    return key + ' must be ' + schema.minimum + ' or greater';
  }
  if (schema.maximum !== undefined && typeof value === 'number' && value > schema.maximum) {
    return key + ' must be ' + schema.maximum + ' or less';
  }
  if (schema.maxLength !== undefined && typeof value === 'string' && value.length > schema.maxLength) {
    return key + ' exceeds max length ' + schema.maxLength;
  }

  return '';
}

function validateToolArgs(args, schema) {
  var required;
  var properties;
  var i;
  var key;
  var argError;

  schema = schema || {};
  required = isArrayValue(schema.required) ? schema.required : [];
  properties = schema.properties || {};

  if ((schema.type === 'object' || required.length || schema.properties) && !isObjectValue(args)) {
    return 'Tool arguments must be a JSON object';
  }

  for (i = 0; i < required.length; i += 1) {
    key = required[i];
    if (!hasToolArgValue(args[key])) {
      return 'Missing required tool argument: ' + key;
    }
  }

  if (schema.additionalProperties === false) {
    for (key in args) {
      if (hasOwn(args, key) && !hasOwn(properties, key)) {
        return 'Unsupported tool argument: ' + key;
      }
    }
  }

  for (key in args) {
    if (!hasOwn(args, key)) {
      continue;
    }
    if (hasOwn(properties, key)) {
      argError = validateToolArgValue(args[key], properties[key], key);
      if (argError) {
        return argError;
      }
    }
  }

  return '';
}

function runToolCalls(requestId, toolCalls, toolMap, callback) {
  var results = [];
  var index = 0;

  function next() {
    var call;
    var name;
    var args;
    var parsedArgs;
    var toolInfo;
    var validationError;
    var callId;

    if (!watch.isCurrentRequest(requestId)) {
      return;
    }

    if (index >= toolCalls.length) {
      callback(results);
      return;
    }

    call = toolCalls[index] || {};
    index += 1;
    if (call.function && typeof call.function === 'object') {
      name = call.function.name || call.name || call.tool;
      args = call.function.arguments || call.arguments || call.args || {};
    } else {
      name = call.name || call.tool || call.function;
      args = call.arguments || call.args || {};
    }
    callId = call.call_id || call.id || name || String(index);

    toolInfo = hasOwn(toolMap, name) ? toolMap[name] : null;
    if (!toolInfo) {
      watch.progressDone(requestId, String(name || 'unknown'), 'unknown tool');
      results.push({
        id: callId,
        call_id: callId,
        name: name || 'unknown',
        error: 'Unknown or unavailable tool'
      });
      next();
      return;
    }

    parsedArgs = parseToolArgsValue(args);
    if (parsedArgs.error) {
      watch.progressToolStart(requestId, formatToolLabel(toolInfo), 'invalid arguments');
      watch.progressDone(requestId, formatToolLabel(toolInfo), 'error: ' + parsedArgs.error);
      results.push({
        id: callId,
        call_id: callId,
        name: name,
        error: parsedArgs.error
      });
      next();
      return;
    }
    args = parsedArgs.args;

    validationError = validateToolArgs(args, toolInfo.parameters);
    if (validationError) {
      watch.progressToolStart(requestId, formatToolLabel(toolInfo), 'invalid arguments');
      watch.progressDone(requestId, formatToolLabel(toolInfo), 'error: ' + validationError);
      results.push({
        id: callId,
        call_id: callId,
        name: name,
        error: validationError
      });
      next();
      return;
    }

    function finishToolCall(error, resultText) {
      if (!watch.isCurrentRequest(requestId)) {
        return;
      }
      if (error) {
        watch.progressDone(requestId, formatToolLabel(toolInfo), 'error: ' + common.truncate(error, 90));
        results.push({
          id: callId,
          call_id: callId,
          name: name,
          error: error
        });
      } else {
        results.push({
          id: callId,
          call_id: callId,
          name: name,
          result: resultText
        });
        watch.progressDone(requestId, formatToolLabel(toolInfo), String(resultText || '').length + ' chars');
      }
      next();
    }

    watch.progressToolStart(requestId, formatToolLabel(toolInfo), formatToolCallDetail(name, args, toolInfo));
    if (toolInfo.kind === 'builtin') {
      callBuiltinTool(toolInfo, args, requestId, finishToolCall);
    } else {
      callMcpTool(toolInfo, args, requestId, finishToolCall);
    }
  }

  next();
}

module.exports = {
  discoverPhoneTools: discoverPhoneTools,
  runToolCalls: runToolCalls,
  formatToolCallLabel: formatToolCallLabel,
  formatToolWords: formatToolWords
};
