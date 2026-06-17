var common = require('./settings');
var watch = require('./watch');

var MCP_PROTOCOL_VERSION = '2025-06-18';
var MCP_CLIENT_NAME = 'llm_thing';
var MCP_CLIENT_VERSION = '1.0.0';
var TIMELINE_API_BASE = 'https://timeline-api.getpebble.com/v1/user/pins/';
var MAX_HEALTH_RANGE_SECONDS = 7 * 24 * 60 * 60;

var s_mcp_request_id = 1;

function hasToolArgValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function summarizeToolArgValue(value, maxLength) {
  var parts = [];
  var i;

  if (!hasToolArgValue(value)) {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return common.truncate(value, maxLength);
  }

  if (Object.prototype.toString.call(value) === '[object Array]') {
    for (i = 0; i < value.length; i += 1) {
      if (hasToolArgValue(value[i])) {
        parts.push(summarizeToolArgValue(value[i], 40));
      }
    }
    return common.truncate(parts.join(', '), maxLength);
  }

  if (typeof value === 'object') {
    if (hasToolArgValue(value.query)) {
      return summarizeToolArgValue(value.query, maxLength);
    }
    if (hasToolArgValue(value.text)) {
      return summarizeToolArgValue(value.text, maxLength);
    }
    if (hasToolArgValue(value.input)) {
      return summarizeToolArgValue(value.input, maxLength);
    }
    return common.truncate(common.safeJson(value), maxLength);
  }

  return common.truncate(String(value), maxLength);
}

function firstToolArg(args, keys) {
  var i;
  var key;

  for (i = 0; i < keys.length; i += 1) {
    key = keys[i];
    if (hasToolArgValue(args[key])) {
      return {
        key: key,
        value: args[key]
      };
    }
  }

  return null;
}

function hasOwnToolArgs(args) {
  var key;

  for (key in args) {
    if (args.hasOwnProperty(key)) {
      return true;
    }
  }

  return false;
}

function summarizeToolArgs(args) {
  var parts = [];
  var searchArg;
  var primaryArg;
  var keys = ['id', 'url', 'time', 'max_results', 'time_range', 'search_depth'];
  var i;
  var key;

  args = args || {};
  if (typeof args !== 'object') {
    return summarizeToolArgValue(args, 120);
  }

  if (args.pin && hasToolArgValue(args.pin.id)) {
    return 'pin: ' + summarizeToolArgValue(args.pin.id, 120);
  }

  searchArg = firstToolArg(args, ['query', 'q', 'search_query', 'searchQuery', 'search', 'terms', 'keywords', 'prompt', 'text', 'input']);
  if (searchArg) {
    return 'query: ' + summarizeToolArgValue(searchArg.value, 120);
  }

  primaryArg = firstToolArg(args, ['id', 'url']);
  if (primaryArg) {
    return primaryArg.key + ': ' + summarizeToolArgValue(primaryArg.value, 120);
  }

  for (i = 0; i < keys.length; i += 1) {
    key = keys[i];
    if (hasToolArgValue(args[key])) {
      parts.push(key + ': ' + summarizeToolArgValue(args[key], 80));
    }
  }

  if (!parts.length) {
    return hasOwnToolArgs(args) ? common.truncate(common.safeJson(args), 100) : 'no arguments';
  }

  return parts.join(', ');
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

function parseJsonOrSse(text) {
  var value = common.trim(text);
  var lines;
  var data = '';
  var i;

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch (e) {}

  lines = value.split(/\r?\n/);
  for (i = 0; i < lines.length; i += 1) {
    if (lines[i].indexOf('data:') === 0) {
      data += common.trim(lines[i].substring(5));
    }
  }

  if (!data || data === '[DONE]') {
    return null;
  }

  return JSON.parse(data);
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

    if (!name || !headerValue || !isValidHttpHeaderName(name) || isReservedMcpHeader(name) || seen[lowerName]) {
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

function parseMcpServers(settings) {
  var parsed;
  var servers = [];
  var i;
  var server;

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
      server = {
        displayLabel: common.trim(server.label),
        label: slugify(server.label),
        url: common.trim(server.url),
        description: common.trim(server.description),
        allowedTools: common.splitCsv(server.allowedTools),
        authorization: common.trim(server.authorization),
        headers: normalizeMcpHeaders(server.headers),
        sessionId: ''
      };
      if (server.label && server.url) {
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

  if (method.indexOf('notifications/') !== 0) {
    payload.id = s_mcp_request_id;
    s_mcp_request_id += 1;
  }
  if (params) {
    payload.params = params;
  }

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
      callback('MCP HTTP ' + request.status + ': ' + String(request.responseText || '').substring(0, 180));
      return;
    }

    try {
      sessionId = request.getResponseHeader('Mcp-Session-Id');
      if (sessionId) {
        server.sessionId = sessionId;
      }
    } catch (e) {}

    if (!expectBody || !common.trim(request.responseText)) {
      callback(null, null);
      return;
    }

    try {
      json = parseJsonOrSse(request.responseText);
    } catch (e2) {
      callback('Bad MCP JSON response');
      return;
    }

    if (json.error) {
      callback(json.error.message || common.safeJson(json.error));
      return;
    }

    callback(null, json.result || {});
  };

  request.onerror = function() {
    watch.untrackXhr(requestId, request);
    if (!watch.isCurrentRequest(requestId)) {
      return;
    }
    common.logDebug('mcp network error server=' + server.label + ' method=' + method);
    callback('MCP network error');
  };

  request.ontimeout = function() {
    watch.untrackXhr(requestId, request);
    if (!watch.isCurrentRequest(requestId)) {
      return;
    }
    common.logDebug('mcp timeout server=' + server.label + ' method=' + method);
    callback('MCP request timed out');
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
  }, true, requestId, function(error) {
    if (error) {
      callback(error);
      return;
    }

    mcpJsonRpc(server, 'notifications/initialized', {}, false, requestId, function() {
      callback(null);
    });
  });
}

function formatMcpToolResult(result) {
  var text = common.collectTextFromContent(result && result.content);

  if (text) {
    return text;
  }

  return common.safeJson(result || {});
}

function discoverMcpTools(settings, requestId, callback) {
  var servers = parseMcpServers(settings);
  var tools = [];
  var toolMap = {};
  var usedNames = {};
  var remaining = servers.length;

  common.logDebug('mcp discover start servers=' + servers.length);

  function finishOne() {
    remaining -= 1;
    if (remaining <= 0) {
      callback(null, tools, toolMap);
    }
  }

  function addTools(server, result) {
    var serverTools = (result && result.tools) || [];
    var i;
    var tool;
    var exposedName;
    var baseName;
    var suffix;

    for (i = 0; i < serverTools.length; i += 1) {
      tool = serverTools[i] || {};
      if (!tool.name || !isAllowedTool(server, tool.name)) {
        continue;
      }

      baseName = slugify(server.label) + '__' + slugify(tool.name);
      exposedName = baseName;
      suffix = 2;
      while (usedNames[exposedName]) {
        exposedName = baseName + '_' + suffix;
        suffix += 1;
      }
      usedNames[exposedName] = true;

      tools.push({
        name: exposedName,
        description: common.trim(tool.description || server.description || 'MCP tool'),
        parameters: tool.inputSchema || { type: 'object', properties: {} }
      });
      toolMap[exposedName] = {
        kind: 'mcp',
        server: server,
        toolName: tool.name
      };
      common.logDebug('mcp tool exposed=' + exposedName + ' original=' + tool.name + ' server=' + server.label);
    }
  }

  if (!remaining) {
    callback(null, tools, toolMap);
    return;
  }

  servers.forEach(function(server) {
    initializeMcpServer(server, requestId, function(initError) {
      if (!watch.isCurrentRequest(requestId)) {
        return;
      }
      if (initError) {
        common.logDebug('mcp initialize failed server=' + server.label + ' error=' + initError);
        finishOne();
        return;
      }

      common.logDebug('mcp initialized server=' + server.label);

      mcpJsonRpc(server, 'tools/list', {}, true, requestId, function(listError, result) {
        if (!watch.isCurrentRequest(requestId)) {
          return;
        }
        if (listError) {
          common.logDebug('mcp tools/list failed server=' + server.label + ' error=' + listError);
        } else {
          addTools(server, result);
          common.logDebug('mcp tools/list ok server=' + server.label + ' count=' + (((result && result.tools) || []).length));
        }
        finishOne();
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

function validateTimelinePin(pin) {
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
  if (!pin.layout || typeof pin.layout !== 'object') {
    return 'Pin layout is required';
  }
  if (!common.trim(pin.layout.type)) {
    return 'Pin layout.type is required';
  }

  return '';
}

function timelinePinRequest(method, id, pin, requestId, callback) {
  getTimelineToken(function(tokenError, token) {
    var request;

    if (!watch.isCurrentRequest(requestId)) {
      return;
    }
    if (tokenError) {
      callback(tokenError);
      return;
    }

    request = new XMLHttpRequest();
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

      watch.untrackXhr(requestId, request);
      if (!watch.isCurrentRequest(requestId)) {
        return;
      }

      if (request.status < 200 || request.status >= 300) {
        callback('Timeline HTTP ' + request.status + ': ' + responseText.substring(0, 180));
        return;
      }

      callback(null, common.safeJson({
        ok: true,
        action: method === 'DELETE' ? 'deleted' : 'created_or_updated',
        id: id,
        note: 'Timeline pins may take up to 15 minutes to appear on the watch.'
      }));
    };

    request.onerror = function() {
      watch.untrackXhr(requestId, request);
      if (!watch.isCurrentRequest(requestId)) {
        return;
      }
      callback('Timeline network error');
    };

    request.ontimeout = function() {
      watch.untrackXhr(requestId, request);
      if (!watch.isCurrentRequest(requestId)) {
        return;
      }
      callback('Timeline request timed out');
    };

    request.onabort = function() {
      watch.untrackXhr(requestId, request);
    };

    request.send(pin ? JSON.stringify(pin) : null);
  });
}

function extractTimelinePin(args) {
  args = parseObjectArg(args) || {};
  if (args.pin !== undefined) {
    return parseObjectArg(args.pin);
  }

  return args;
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

function callTimelineUpsertBuiltin(args, requestId, callback) {
  var pin = extractTimelinePin(args);
  var validationError = validateTimelinePin(pin);

  if (validationError) {
    callback(validationError);
    return;
  }

  timelinePinRequest('PUT', pin.id, pin, requestId, callback);
}

function callTimelineDeleteBuiltin(args, requestId, callback) {
  var id = extractTimelinePinId(args);

  if (!id) {
    callback('Pin id is required');
    return;
  }
  if (id.length > 64) {
    callback('Pin id must be 64 characters or fewer');
    return;
  }

  timelinePinRequest('DELETE', id, null, requestId, callback);
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

function buildHealthSummaryWindow(args) {
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
    startUnix = endUnix - MAX_HEALTH_RANGE_SECONDS;
  }

  return {
    startUnix: startUnix,
    endUnix: endUnix,
    includeHeartRate: boolArg(args.includeHeartRate, false)
  };
}

function callHealthSummaryBuiltin(args, requestId, callback) {
  var range = buildHealthSummaryWindow(args);

  if (range.error) {
    callback(range.error);
    return;
  }

  watch.requestHealthSummary(range, requestId, callback);
}

function addBuiltinTool(tools, toolMap, definition) {
  var baseName = definition.name;
  var exposedName = baseName;
  var suffix = 2;

  while (toolMap[exposedName]) {
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
    call: definition.call
  };
  common.logDebug('builtin tool exposed=' + exposedName);
}

function addBuiltinTools(settings, tools, toolMap) {
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
      name: 'pebble_timeline_create_or_update_pin',
      label: 'Timeline',
      description: 'Create or update one of this app\'s Pebble timeline pins. Provide complete Pebble timeline pin JSON in pin. Updating uses the same id. Deleted pin ids should not be reused.',
      parameters: {
        type: 'object',
        properties: {
          pin: { type: 'object', description: 'Complete timeline pin object. Required: id, time as ISO date-time, layout.type. Include layout fields, reminders, notifications, and actions as needed.' }
        },
        required: ['pin']
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
  }

  if (settings.HealthToolEnabled) {
    addBuiltinTool(tools, toolMap, {
      name: 'pebble_get_health_summary',
      label: 'Health',
      description: 'Get a compact Pebble Health summary from the watch. Use only when the user asks about steps, activity, distance, sleep, calories, workouts, or heart rate. Heart rate is only included when includeHeartRate is true.',
      parameters: {
        type: 'object',
        properties: {
          range: { type: 'string', enum: ['today', 'yesterday', 'last_24h', 'last_7d', 'custom'], description: 'Health time range. Default today.' },
          startTime: { type: 'string', description: 'ISO date-time or Unix seconds for custom range start.' },
          endTime: { type: 'string', description: 'ISO date-time or Unix seconds for custom range end. Default now.' },
          includeHeartRate: { type: 'boolean', description: 'Include current heart rate when relevant. Default false.' }
        }
      },
      call: callHealthSummaryBuiltin
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
    callback(null, tools, toolMap);
  });
}

function callMcpTool(toolInfo, args, requestId, callback) {
  common.logDebug('mcp tool call server=' + toolInfo.server.label + ' tool=' + toolInfo.toolName + ' args=' + common.safeJson(args).substring(0, 240));
  mcpJsonRpc(toolInfo.server, 'tools/call', {
    name: toolInfo.toolName,
    arguments: args || {}
  }, true, requestId, function(error, result) {
    if (!watch.isCurrentRequest(requestId)) {
      return;
    }
    if (error) {
      common.logDebug('mcp tool error server=' + toolInfo.server.label + ' tool=' + toolInfo.toolName + ' error=' + error);
      callback(error);
      return;
    }

    common.logDebug('mcp tool result server=' + toolInfo.server.label + ' tool=' + toolInfo.toolName + ' chars=' + formatMcpToolResult(result).length);
    callback(null, formatMcpToolResult(result));
  });
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

function runToolCalls(requestId, toolCalls, toolMap, callback) {
  var results = [];
  var index = 0;

  function next() {
    var call;
    var name;
    var args;
    var toolInfo;

    if (!watch.isCurrentRequest(requestId)) {
      return;
    }

    if (index >= toolCalls.length) {
      callback(results);
      return;
    }

    call = toolCalls[index] || {};
    index += 1;
    name = call.name || call.tool || call.function;
    args = call.arguments || call.args || {};
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args);
      } catch (e) {
        args = {};
      }
    }

    toolInfo = toolMap[name];
    if (!toolInfo) {
      watch.progressDone(requestId, String(name || 'unknown'), 'unknown tool');
      results.push({
        id: call.id || name || String(index),
        name: name || 'unknown',
        error: 'Unknown or unavailable tool'
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
          id: call.id || name,
          name: name,
          error: error
        });
      } else {
        results.push({
          id: call.id || name,
          name: name,
          result: resultText
        });
        watch.progressDone(requestId, formatToolLabel(toolInfo), String(resultText || '').length + ' chars');
      }
      next();
    }

    watch.progressToolStart(requestId, formatToolLabel(toolInfo), summarizeToolArgs(args));
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
  formatToolWords: formatToolWords
};
