var common = require('./settings');
var watch = require('./watch');
var timelineStore = require('./timeline_store');
var memoryStore = require('./memory_store');
var webFetch = require('./web_fetch');
var toolPagination = require('./tool_pagination');

var MCP_PROTOCOL_VERSION = '2025-06-18';
var MCP_CLIENT_NAME = 'llm_thing';
var MCP_CLIENT_VERSION = '1.0.0';
var TIMELINE_API_BASE = 'https://timeline-api.getpebble.com/v1/user/pins/';
var TIMELINE_PIN_ID_MAX_ATTEMPTS = 128;
var TIMELINE_PIN_ID_MAX_PENDING = 128;
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
var HEALTH_METRICS = [
  { name: 'steps', bit: 1, responseField: 'stepCount', outputField: 'steps' },
  { name: 'active_time', bit: 2, responseField: 'activeSeconds', outputField: 'activeSeconds' },
  { name: 'distance', bit: 4, responseField: 'walkedDistanceMeters', outputField: 'distanceMeters' },
  { name: 'sleep', bit: 8, responseField: 'sleepSeconds', outputField: 'sleepSeconds' },
  { name: 'restful_sleep', bit: 16, responseField: 'sleepRestfulSeconds', outputField: 'restfulSleepSeconds' },
  { name: 'resting_calories', bit: 32, responseField: 'restingKCalories', outputField: 'restingCaloriesKcal' },
  { name: 'active_calories', bit: 64, responseField: 'activeKCalories', outputField: 'activeCaloriesKcal' },
  { name: 'heart_rate', bit: 128 },
  { name: 'activity_sessions', bit: 2048 | 4096 | 8192 },
  { name: 'sleep_sessions', bit: 512 | 1024 }
];
var HEALTH_METRIC_MAP = Object.create(null);
var HEALTH_METRIC_NAMES = [];

(function initHealthMetricMetadata() {
  var i;
  var metric;
  for (i = 0; i < HEALTH_METRICS.length; i += 1) {
    metric = HEALTH_METRICS[i];
    HEALTH_METRIC_MAP[metric.name] = metric;
    HEALTH_METRIC_NAMES.push(metric.name);
  }
}());

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
var TIMELINE_RESULT_WARNING_MAX_CHARS = 256;
var TOOL_READ_CONCURRENCY = 2;
var TOOL_EXECUTION_SERIAL = 'serial';
var TOOL_EXECUTION_INDEPENDENT_READ = 'independent_read';
var TOOL_VALIDATION_MAX_DEPTH = 64;
var TOOL_VALIDATION_MAX_OBJECT_PROPERTIES = 256;
var TOOL_VALIDATION_MAX_WORK = 2048;
var TOOL_VALIDATION_MAX_SIGNATURE_CHARS = 65536;

var s_mcp_request_id = 1;
var s_tool_execution_id = 1;
var s_timeline_pending_pin_ids = Object.create(null);
var s_timeline_pending_pin_id_order = [];

var MCP_MAX_RESULT_CHARS = 6000;
var MCP_RESULT_TRUNCATION_SUFFIX = '... [truncated]';
var MCP_MAX_CONTENT_BLOCKS = 32;
var MCP_MAX_RESULT_METADATA_CHARS = 256;
var MCP_MAX_STRUCTURED_DEPTH = 128;
var MCP_MAX_STRUCTURED_NODES = 4096;
var MCP_MAX_PAGINATION_PAGES = 20;
var MCP_MAX_TOOLS_PER_SERVER = 64;
var MCP_MAX_TOOLS_GLOBAL = 64;
var MCP_MAX_TOOL_NAME_CHARS = 128;
var MCP_MAX_DESCRIPTION_CHARS = 1024;
var MCP_MAX_INPUTSCHEMA_CHARS = 8192;
var MCP_MAX_SERVER_CACHE_CHARS = 65536;
var MCP_MAX_SESSION_ID_CHARS = 1024;
var MCP_MAX_SCHEMA_DEPTH = 64;
var MCP_REQUEST_TIMEOUT_MS = 30000;
var MCP_SUPPORTED_PROTOCOL_VERSIONS = { '2025-06-18': true };
var MCP_CACHE_TTL_MS = 5 * 60 * 1000;
var MCP_MAX_CACHE_ENTRIES = 32;
var MCP_MAX_PENDING_DISCOVERIES = 16;
var MCP_MAX_PENDING_WAITERS = 32;

var s_mcp_cache = Object.create(null);
var s_mcp_cache_keys = [];
var s_mcp_pending = Object.create(null);
var s_mcp_pending_count = 0;
var s_mcp_warm_generation = null;
var s_mcp_warm_generation_id = 1;
var MCP_INVALID_SCHEMA = {};

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
        server._mcpCacheKey = mcpCacheKey(server);
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

function isCurrentMcpContext(context) {
  if (context && typeof context === 'object' && context.background === true) {
    if (context.warmGeneration) {
      return context.active !== false && context.warmGeneration.active &&
        s_mcp_warm_generation === context.warmGeneration;
    }
    return context.active !== false;
  }
  return watch.isCurrentRequest(context);
}

function makeMcpWaiter(requestContext, server, callback) {
  if (requestContext && typeof requestContext === 'object' && requestContext.warmGeneration) {
    return {
      type: 'warm',
      generation: requestContext.warmGeneration,
      key: mcpCacheStorageKey(server._mcpCacheKey),
      server: server,
      callback: callback,
      settled: false
    };
  }
  return {
    type: 'foreground',
    requestId: requestContext,
    server: server,
    callback: callback,
    settled: false
  };
}

function isCurrentMcpWaiter(waiter) {
  if (waiter.type === 'warm') {
    return waiter.generation.active && s_mcp_warm_generation === waiter.generation &&
      hasOwn(waiter.generation.serverKeys, waiter.key);
  }
  return watch.isCurrentRequest(waiter.requestId);
}

function settleMcpWaiter(waiter, error, tools, noTools) {
  if (waiter.settled) {
    return;
  }
  waiter.settled = true;
  waiter.callback(error, tools, noTools === true);
}

function pruneMcpWaiters(pending) {
  var kept = [];
  var removed = [];
  var i;

  for (i = 0; i < pending.waiters.length; i += 1) {
    if (isCurrentMcpWaiter(pending.waiters[i])) {
      kept.push(pending.waiters[i]);
    } else {
      removed.push(pending.waiters[i]);
    }
  }
  pending.waiters = kept;
  for (i = 0; i < removed.length; i += 1) {
    settleMcpWaiter(removed[i], 'MCP discovery canceled', null, false);
  }
}

function cancelMcpServerDiscovery(pending, error) {
  var storageKey = mcpCacheStorageKey(pending.key);
  var waiters;
  var requests;
  var i;

  if (pending.done) {
    return;
  }
  pending.done = true;
  delete s_mcp_pending[storageKey];
  s_mcp_pending_count -= 1;
  pending.context.active = false;
  waiters = pending.waiters.slice();
  pending.waiters = [];
  requests = pending.context.requests.slice();

  for (i = 0; i < waiters.length; i += 1) {
    settleMcpWaiter(waiters[i], error || 'MCP discovery canceled', null, false);
  }
  for (i = 0; i < requests.length; i += 1) {
    try {
      requests[i].abort();
    } catch (e) {}
  }
}

function cancelUnobservedMcpDiscoveries(preserveGeneration) {
  var keys = Object.keys(s_mcp_pending);
  var i;
  var pending;

  for (i = 0; i < keys.length; i += 1) {
    pending = s_mcp_pending[keys[i]];
    if (!pending || pending.done) {
      continue;
    }
    pruneMcpWaiters(pending);
    if (!pending.waiters.length && (!preserveGeneration ||
        !hasOwn(preserveGeneration.serverKeys, keys[i]))) {
      cancelMcpServerDiscovery(pending, 'MCP discovery canceled');
    }
  }
}

function cancelMcpRequest(requestId) {
  var keys = Object.keys(s_mcp_pending);
  var i;
  var j;
  var pending;
  var kept;
  var removed;
  var waiter;

  for (i = 0; i < keys.length; i += 1) {
    pending = s_mcp_pending[keys[i]];
    if (!pending || pending.done) {
      continue;
    }
    kept = [];
    removed = [];
    for (j = 0; j < pending.waiters.length; j += 1) {
      waiter = pending.waiters[j];
      if (waiter.type === 'foreground' && Number(waiter.requestId) === Number(requestId)) {
        removed.push(waiter);
      } else {
        kept.push(waiter);
      }
    }
    pending.waiters = kept;
    for (j = 0; j < removed.length; j += 1) {
      settleMcpWaiter(removed[j], 'MCP discovery canceled', null, false);
    }
    if (!kept.length) {
      cancelMcpServerDiscovery(pending, 'MCP discovery canceled');
    }
  }
}

function trackMcpXhr(context, request) {
  if (context && typeof context === 'object' && context.background === true) {
    if (context.active === false) {
      try {
        request.abort();
      } catch (e) {}
      return false;
    }
    context.requests.push(request);
    return true;
  }
  return watch.trackXhr(context, request);
}

function untrackMcpXhr(context, request) {
  var i;

  if (context && typeof context === 'object' && context.background === true) {
    for (i = context.requests.length - 1; i >= 0; i -= 1) {
      if (context.requests[i] === request) {
        context.requests.splice(i, 1);
      }
    }
    return;
  }
  watch.untrackXhr(context, request);
}

function updateMcpCacheSession(server) {
  var key;
  var entry;

  if (!server || !server._mcpCacheKey) {
    return;
  }
  key = 'mcp:' + server._mcpCacheKey;
  entry = s_mcp_cache[key];
  if (entry) {
    entry.sessionId = server.sessionId || '';
  }
}

function mcpJsonRpc(server, method, params, expectBody, requestContext, callback) {
  var request = null;
  var payload = {
    jsonrpc: '2.0',
    method: method
  };
  var authorization = authHeader(server.authorization);
  var jsonRpcId;
  var requestSettled = false;
  var requestTracked = false;
  var deadlineTimer = null;
  var stage = 'construct';

  function cleanupRpc() {
    if (deadlineTimer !== null) {
      try {
        clearTimeout(deadlineTimer);
      } catch (e) {}
      deadlineTimer = null;
    }
    if (requestTracked) {
      requestTracked = false;
      try {
        untrackMcpXhr(requestContext, request);
      } catch (e2) {}
    }
  }

  function finishRpc(error, result, status) {
    if (requestSettled) {
      return;
    }
    requestSettled = true;
    cleanupRpc();
    callback(error, result, status);
  }

  function discardRpc() {
    if (requestSettled) {
      return;
    }
    requestSettled = true;
    cleanupRpc();
  }

  function timeoutRpc() {
    if (requestSettled) {
      return;
    }
    deadlineTimer = null;
    if (!isCurrentMcpContext(requestContext)) {
      discardRpc();
      return;
    }
    common.logDebug('mcp deadline timeout server=' + server.label + ' method=' + method);
    finishRpc('MCP request timed out', null, 0);
    if (request) {
      try {
        request.abort();
      } catch (e) {}
    }
  }

  if (method.indexOf('notifications/') !== 0) {
    payload.id = s_mcp_request_id;
    s_mcp_request_id += 1;
  }
  if (params) {
    payload.params = params;
  }
  jsonRpcId = payload.id;

  try {
    request = new XMLHttpRequest();

    request.onload = function() {
      var json;
      var sessionId;

      if (requestSettled) {
        return;
      }
      if (!isCurrentMcpContext(requestContext)) {
        discardRpc();
        return;
      }

      common.logDebug('mcp response server=' + server.label + ' method=' + method + ' status=' + request.status + ' bytes=' + String(request.responseText || '').length);

      if (request.status < 200 || request.status >= 300) {
        finishRpc('MCP HTTP ' + request.status + ': ' + String(request.responseText || '').substring(0, 180), null, request.status);
        return;
      }

      try {
        sessionId = request.getResponseHeader('Mcp-Session-Id');
        if (sessionId) {
          if (String(sessionId).length > MCP_MAX_SESSION_ID_CHARS) {
            common.logDebug('mcp session id skipped oversized server=' + server.label);
          } else {
            server.sessionId = sessionId;
            if (method !== 'initialize') {
              updateMcpCacheSession(server);
            }
          }
        }
      } catch (e) {}

      if (!expectBody || !common.trim(request.responseText)) {
        finishRpc(null, null, request.status);
        return;
      }

      try {
        json = parseMcpResponse(request.responseText, jsonRpcId);
      } catch (e2) {
        finishRpc('Bad MCP JSON response', null, request.status);
        return;
      }

      if (!json) {
        finishRpc('No matching MCP response', null, request.status);
        return;
      }

      if (json.error) {
        finishRpc(json.error.message || common.safeJson(json.error), null, request.status);
        return;
      }

      finishRpc(null, json.result || {}, request.status);
    };

    request.onerror = function() {
      if (requestSettled) {
        return;
      }
      if (!isCurrentMcpContext(requestContext)) {
        discardRpc();
        return;
      }
      common.logDebug('mcp network error server=' + server.label + ' method=' + method);
      finishRpc('MCP network error', null, 0);
    };

    request.ontimeout = function() {
      if (requestSettled) {
        return;
      }
      if (!isCurrentMcpContext(requestContext)) {
        discardRpc();
        return;
      }
      common.logDebug('mcp timeout server=' + server.label + ' method=' + method);
      finishRpc('MCP request timed out', null, 0);
    };

    request.onabort = function() {
      if (requestSettled) {
        return;
      }
      if (!isCurrentMcpContext(requestContext)) {
        discardRpc();
        return;
      }
      common.logDebug('mcp request aborted server=' + server.label + ' method=' + method);
      finishRpc('MCP request aborted', null, 0);
    };

    stage = 'open';
    request.open('POST', server.url, true);
    stage = 'headers';
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
    request.timeout = MCP_REQUEST_TIMEOUT_MS;

    stage = 'tracking';
    requestTracked = true;
    if (!trackMcpXhr(requestContext, request)) {
      requestTracked = false;
      return;
    }

    common.logDebug('mcp request server=' + server.label + ' method=' + method + ' id=' + (payload.id || 'notification'));
    deadlineTimer = setTimeout(timeoutRpc, MCP_REQUEST_TIMEOUT_MS);
    stage = 'send';
    request.send(JSON.stringify(payload));
  } catch (e3) {
    common.logDebug('mcp request setup failed server=' + server.label + ' method=' + method + ' stage=' + stage);
    finishRpc('MCP request failed during ' + stage + ' for ' + method, null, 0);
    if (request) {
      try {
        request.abort();
      } catch (e4) {}
    }
  }
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
      updateMcpCacheSession(server);
      callback(null, { noTools: true });
      return;
    }

    mcpJsonRpc(server, 'notifications/initialized', {}, false, requestId, function(initError) {
      if (initError) {
        callback(initError);
        return;
      }
      updateMcpCacheSession(server);
      callback(null, null);
    });
  });
}

function capMcpResult(text, truncated) {
  var value = String(text === undefined || text === null ? '' : text);

  if (value.length <= MCP_MAX_RESULT_CHARS && !truncated) {
    return value;
  }
  return value.substring(0, MCP_MAX_RESULT_CHARS - MCP_RESULT_TRUNCATION_SUFFIX.length) + MCP_RESULT_TRUNCATION_SUFFIX;
}

function boundedMcpMetadata(value) {
  var text;
  if (typeof value !== 'string') {
    return '';
  }
  text = value;
  if (text.length > MCP_MAX_RESULT_METADATA_CHARS) {
    text = text.substring(0, MCP_MAX_RESULT_METADATA_CHARS - MCP_RESULT_TRUNCATION_SUFFIX.length) + MCP_RESULT_TRUNCATION_SUFFIX;
  }
  return text;
}

function mcpBlockMetadata(block, nested) {
  var parts = [];
  var uri = boundedMcpMetadata(block.uri || nested && nested.uri);
  var mimeType = boundedMcpMetadata(block.mimeType || block.mime_type || nested && (nested.mimeType || nested.mime_type));

  if (uri) {
    parts.push('uri=' + uri);
  }
  if (mimeType) {
    parts.push('mimeType=' + mimeType);
  }
  return parts.length ? ' (' + parts.join('; ') + ')' : '';
}

function formatMcpContentBlock(block) {
  var type;
  var nested;
  var metadata;

  if (!block || typeof block !== 'object' || Object.prototype.toString.call(block) === '[object Array]') {
    return '[MCP unsupported content block: malformed entry]';
  }
  type = typeof block.type === 'string' ? boundedMcpMetadata(block.type) : '';
  nested = block.resource && typeof block.resource === 'object' ? block.resource : {};
  metadata = mcpBlockMetadata(block, nested);

  if (type === 'text') {
    return typeof block.text === 'string' ? block.text : '[MCP text block omitted: invalid text]';
  }
  if (type === 'resource' && typeof nested.text === 'string') {
    return 'MCP embedded resource text' + metadata + ':\n' + nested.text;
  }
  if (type === 'image' || type === 'audio') {
    return '[MCP ' + type + ' content omitted' + metadata + '; binary data omitted]';
  }
  if (type === 'resource') {
    return '[MCP resource content omitted' + metadata + '; binary or unavailable content omitted]';
  }
  if (type === 'resource_link') {
    return '[MCP resource_link reference only' + metadata + '; content not fetched]';
  }
  return '[MCP unsupported content block' + (type ? ' type=' + type : '') + metadata + '; payload omitted]';
}

function appendMcpContentPart(state, part) {
  var separator = state.hasPart ? '\n\n' : '';
  var available = MCP_MAX_RESULT_CHARS - state.text.length - separator.length;

  if (available <= 0) {
    state.truncated = true;
    return;
  }
  if (part.length > available) {
    state.text += separator + part.substring(0, available);
    state.hasPart = true;
    state.truncated = true;
    return;
  }
  state.text += separator + part;
  state.hasPart = true;
}

function collectMcpContent(content) {
  var state = { text: '', hasPart: false, hasBlocks: false, truncated: false, omittedBlocks: 0 };
  var count;
  var i;

  if (content === undefined || content === null) {
    return state;
  }
  if (Object.prototype.toString.call(content) !== '[object Array]') {
    state.hasBlocks = true;
    appendMcpContentPart(state, '[MCP content omitted: malformed content list]');
    return state;
  }

  state.hasBlocks = content.length > 0;
  count = Math.min(content.length, MCP_MAX_CONTENT_BLOCKS);
  for (i = 0; i < count; i += 1) {
    appendMcpContentPart(state, formatMcpContentBlock(content[i]));
  }
  if (content.length > count) {
    state.omittedBlocks = content.length - count;
    state.truncated = true;
    appendMcpContentPart(state, '[MCP content omitted: ' + state.omittedBlocks + ' additional blocks]');
  }
  return state;
}

function appendMcpSerialized(state, value) {
  if (state.length + value.length > state.limit) {
    return false;
  }
  state.parts.push(value);
  state.length += value.length;
  return true;
}

function writeMcpStructuredValue(value, state, stack, depth, inArray) {
  var type = typeof value;
  var isArray;
  var key;
  var keyText;
  var count = 0;
  var first = true;
  var i;
  var item;

  state.nodes += 1;
  if (state.nodes > MCP_MAX_STRUCTURED_NODES || depth > MCP_MAX_STRUCTURED_DEPTH) {
    return false;
  }
  if (value === null) {
    return appendMcpSerialized(state, 'null');
  }
  if (type === 'string') {
    if (value.length > state.limit - state.length) {
      return false;
    }
    return appendMcpSerialized(state, JSON.stringify(value));
  }
  if (type === 'number' || type === 'boolean') {
    return appendMcpSerialized(state, JSON.stringify(value));
  }
  if (type === 'undefined' || type === 'function' || type === 'symbol') {
    return inArray ? appendMcpSerialized(state, 'null') : false;
  }
  if (type !== 'object') {
    return false;
  }

  isArray = Object.prototype.toString.call(value) === '[object Array]';
  if (stack.indexOf(value) !== -1) {
    return false;
  }
  stack.push(value);
  if (isArray) {
    if (!appendMcpSerialized(state, '[')) {
      stack.pop();
      return false;
    }
    for (i = 0; i < value.length; i += 1) {
      if (!first && !appendMcpSerialized(state, ',')) {
        stack.pop();
        return false;
      }
      first = false;
      if (!writeMcpStructuredValue(value[i], state, stack, depth + 1, true)) {
        stack.pop();
        return false;
      }
    }
    stack.pop();
    return appendMcpSerialized(state, ']');
  }

  if (!appendMcpSerialized(state, '{')) {
    stack.pop();
    return false;
  }
  for (key in value) {
    if (!hasOwn(value, key)) {
      continue;
    }
    count += 1;
    if (count > MCP_MAX_STRUCTURED_NODES || typeof value[key] === 'undefined' || typeof value[key] === 'function' || typeof value[key] === 'symbol') {
      if (count > MCP_MAX_STRUCTURED_NODES) {
        stack.pop();
        return false;
      }
      continue;
    }
    if (key.length > state.limit - state.length) {
      stack.pop();
      return false;
    }
    keyText = JSON.stringify(key);
    if ((!first && !appendMcpSerialized(state, ',')) || !appendMcpSerialized(state, keyText) || !appendMcpSerialized(state, ':')) {
      stack.pop();
      return false;
    }
    first = false;
    item = value[key];
    if (!writeMcpStructuredValue(item, state, stack, depth + 1, false)) {
      stack.pop();
      return false;
    }
  }
  stack.pop();
  return appendMcpSerialized(state, '}');
}

function serializeMcpStructuredValue(value, limit) {
  var state = { limit: limit, length: 0, nodes: 0, parts: [] };
  var serialized;
  try {
    if (!writeMcpStructuredValue(value, state, [], 0, false)) {
      return null;
    }
    serialized = state.parts.join('');
    return serialized.length <= limit ? serialized : null;
  } catch (e) {
    return null;
  }
}

function buildMcpResultEnvelope(text, structuredJson, flags) {
  var fields = ['"mcpResult":true', '"text":' + JSON.stringify(text), '"structuredContent":' + structuredJson];

  if (flags.textTruncated) {
    fields.push('"textTruncated":true');
  }
  if (flags.structuredContentOmitted) {
    fields.push('"structuredContentOmitted":true');
  }
  if (flags.omittedBlocks) {
    fields.push('"omittedBlocks":' + flags.omittedBlocks);
  }
  return '{' + fields.join(',') + '}';
}

function truncateMcpTextToFit(text, structuredJson, flags, limit) {
  var low = 0;
  var high = text.length;
  var middle;
  var candidate;
  var best = '';

  flags.textTruncated = true;
  while (low <= high) {
    middle = Math.floor((low + high) / 2);
    if (middle > 0 && middle < text.length && text.charCodeAt(middle - 1) >= 0xD800 && text.charCodeAt(middle - 1) <= 0xDBFF &&
        text.charCodeAt(middle) >= 0xDC00 && text.charCodeAt(middle) <= 0xDFFF) {
      middle -= 1;
    }
    candidate = buildMcpResultEnvelope(text.substring(0, middle), structuredJson, flags);
    if (candidate.length <= limit) {
      best = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best;
}

function formatMcpToolResult(result) {
  var content = collectMcpContent(result && result.content);
  var hasStructured = !!result && hasOwn(result, 'structuredContent') && result.structuredContent !== undefined;
  var structuredValue;
  var serialized;
  var omission = { error: 'Structured MCP result omitted: result exceeds safe size or serialization limits' };
  var flags;
  var baseLength;
  var envelope;

  if (hasStructured && content.hasBlocks) {
    structuredValue = serializeMcpStructuredValue(result.structuredContent, MCP_MAX_RESULT_CHARS);
    if (structuredValue === null) {
      structuredValue = JSON.stringify(omission);
      flags = { textTruncated: content.truncated, structuredContentOmitted: true, omittedBlocks: content.omittedBlocks };
    } else {
      flags = { textTruncated: content.truncated, omittedBlocks: content.omittedBlocks };
    }
    baseLength = buildMcpResultEnvelope('', 'null', { textTruncated: true }).length;
    if (structuredValue.length + baseLength - 'null'.length > MCP_MAX_RESULT_CHARS) {
      structuredValue = JSON.stringify(omission);
      flags.structuredContentOmitted = true;
    }
    envelope = buildMcpResultEnvelope(content.text, structuredValue, flags);
    if (envelope.length > MCP_MAX_RESULT_CHARS) {
      envelope = truncateMcpTextToFit(content.text, structuredValue, flags, MCP_MAX_RESULT_CHARS);
    }
    if (!envelope) {
      envelope = buildMcpResultEnvelope('', JSON.stringify(omission), {
        textTruncated: content.text.length > 0 || content.truncated,
        structuredContentOmitted: true,
        omittedBlocks: content.omittedBlocks
      });
    }
    return { text: envelope, structured: true, mcpEnvelope: true };
  }

  if (content.hasBlocks) {
    return { text: capMcpResult(content.text, content.truncated), structured: false, mcpEnvelope: false };
  }

  if (hasStructured) {
    structuredValue = serializeMcpStructuredValue(result.structuredContent, MCP_MAX_RESULT_CHARS);
    if (structuredValue === null) {
      structuredValue = JSON.stringify(omission);
    }
    return { text: structuredValue, structured: true, mcpEnvelope: false };
  }

  serialized = serializeMcpStructuredValue(result || {}, MCP_MAX_RESULT_CHARS);
  if (serialized === null) {
    serialized = JSON.stringify(omission);
  }
  return { text: serialized, structured: true, mcpEnvelope: false };
}

function mcpCacheKey(server) {
  return JSON.stringify({
    displayLabel: server.displayLabel,
    label: server.label,
    limitKey: server.limitKey,
    url: server.url,
    description: server.description,
    allowedTools: server.allowedTools,
    maxToolCalls: server.maxToolCalls,
    authorization: server.authorization,
    headers: server.headers
  });
}

function mcpCacheStorageKey(key) {
  return 'mcp:' + key;
}

function removeMcpCacheKey(storageKey) {
  var index = s_mcp_cache_keys.indexOf(storageKey);

  if (hasOwn(s_mcp_cache, storageKey)) {
    delete s_mcp_cache[storageKey];
  }
  if (index !== -1) {
    s_mcp_cache_keys.splice(index, 1);
  }
}

function lookupMcpCache(key) {
  var storageKey = mcpCacheStorageKey(key);
  var entry = s_mcp_cache[storageKey];
  var index;

  if (!entry) {
    return null;
  }
  if (Date.now() - entry.time > MCP_CACHE_TTL_MS) {
    removeMcpCacheKey(storageKey);
    return null;
  }
  entry.lastUsed = Date.now();
  index = s_mcp_cache_keys.indexOf(storageKey);
  if (index !== -1) {
    s_mcp_cache_keys.splice(index, 1);
  }
  s_mcp_cache_keys.push(storageKey);
  return entry;
}

function cloneMcpValue(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (e) {
    return null;
  }
}

function cloneMcpToolList(tools) {
  return cloneMcpValue(tools || []) || [];
}

function storeMcpCache(server, tools, noTools) {
  var storageKey = mcpCacheStorageKey(server._mcpCacheKey);
  var index;

  s_mcp_cache[storageKey] = {
    time: Date.now(),
    lastUsed: Date.now(),
    sessionId: server.sessionId || '',
    noTools: noTools === true,
    tools: cloneMcpToolList(tools)
  };
  index = s_mcp_cache_keys.indexOf(storageKey);
  if (index !== -1) {
    s_mcp_cache_keys.splice(index, 1);
  }
  s_mcp_cache_keys.push(storageKey);
  while (s_mcp_cache_keys.length > MCP_MAX_CACHE_ENTRIES) {
    removeMcpCacheKey(s_mcp_cache_keys[0]);
  }
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

function cloneBoundedMcpSchema(value, budget, depth) {
  var serialized;
  var result;
  var key;
  var item;
  var first;
  var i;

  if (depth > MCP_MAX_SCHEMA_DEPTH) {
    return MCP_INVALID_SCHEMA;
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    serialized = JSON.stringify(value);
    if (serialized === undefined || budget.chars + serialized.length > MCP_MAX_INPUTSCHEMA_CHARS) {
      return MCP_INVALID_SCHEMA;
    }
    budget.chars += serialized.length;
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > MCP_MAX_INPUTSCHEMA_CHARS) {
      return MCP_INVALID_SCHEMA;
    }
    serialized = JSON.stringify(value);
    if (budget.chars + serialized.length > MCP_MAX_INPUTSCHEMA_CHARS) {
      return MCP_INVALID_SCHEMA;
    }
    budget.chars += serialized.length;
    return value;
  }
  if (Array.isArray(value)) {
    result = [];
    budget.chars += 2;
    if (budget.chars > MCP_MAX_INPUTSCHEMA_CHARS) {
      return MCP_INVALID_SCHEMA;
    }
    for (i = 0; i < value.length; i += 1) {
      if (i > 0) {
        budget.chars += 1;
      }
      item = cloneBoundedMcpSchema(value[i], budget, depth + 1);
      if (item === MCP_INVALID_SCHEMA) {
        return MCP_INVALID_SCHEMA;
      }
      result.push(item);
    }
    return result;
  }
  if (typeof value === 'object') {
    result = Object.create(null);
    budget.chars += 2;
    if (budget.chars > MCP_MAX_INPUTSCHEMA_CHARS) {
      return MCP_INVALID_SCHEMA;
    }
    first = true;
    for (key in value) {
      if (!hasOwn(value, key)) {
        continue;
      }
      if (key.length > MCP_MAX_INPUTSCHEMA_CHARS) {
        return MCP_INVALID_SCHEMA;
      }
      serialized = JSON.stringify(key);
      budget.chars += (first ? 0 : 1) + serialized.length + 1;
      if (budget.chars > MCP_MAX_INPUTSCHEMA_CHARS) {
        return MCP_INVALID_SCHEMA;
      }
      item = cloneBoundedMcpSchema(value[key], budget, depth + 1);
      if (item === MCP_INVALID_SCHEMA) {
        return MCP_INVALID_SCHEMA;
      }
      result[key] = item;
      first = false;
    }
    return result;
  }
  return MCP_INVALID_SCHEMA;
}

function sanitizeMcpToolDefinition(tool, server) {
  var name;
  var description;
  var inputSchema;
  var schemaBudget = { chars: 0 };
  var schema;
  var size;

  tool = tool || {};
  name = typeof tool.name === 'string' ? tool.name : '';
  if (!name) {
    return null;
  }
  if (name.length > MCP_MAX_TOOL_NAME_CHARS) {
    common.logDebug('mcp tool skipped oversized name server=' + server.label + ' chars=' + name.length);
    return null;
  }

  description = typeof tool.description === 'string' ? tool.description : '';
  if (description.length > MCP_MAX_DESCRIPTION_CHARS * 2) {
    description = description.substring(0, MCP_MAX_DESCRIPTION_CHARS * 2);
  }
  description = common.trim(description);
  if (description.length > MCP_MAX_DESCRIPTION_CHARS) {
    description = description.substring(0, MCP_MAX_DESCRIPTION_CHARS);
  }

  inputSchema = tool.inputSchema || { type: 'object', properties: {} };
  schema = cloneBoundedMcpSchema(inputSchema, schemaBudget, 0);
  if (schema === MCP_INVALID_SCHEMA) {
    common.logDebug('mcp tool skipped oversized inputSchema server=' + server.label + ' tool=' + name + ' limit=' + MCP_MAX_INPUTSCHEMA_CHARS);
    return null;
  }

  size = JSON.stringify(name).length + JSON.stringify(description).length + schemaBudget.chars + 40;
  return {
    tool: { name: name, description: description, inputSchema: schema },
    chars: size
  };
}

function listAllMcpTools(server, requestContext, callback) {
  var allTools = [];
  var done = false;
  var pageCount = 0;
  var toolCount = 0;
  var cachedChars = 0;

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

    mcpJsonRpc(server, 'tools/list', params, true, requestContext, function(listError, result) {
      var serverTools;
      var nextCursor;

      if (!isCurrentMcpContext(requestContext)) {
        return;
      }
      if (listError) {
        finish(listError, null);
        return;
      }

      serverTools = result && Array.isArray(result.tools) ? result.tools : [];
      for (i = 0; i < serverTools.length; i += 1) {
        var sanitized;

        if (toolCount >= MCP_MAX_TOOLS_PER_SERVER) {
          common.logDebug('mcp tools/list per-server limit reached server=' + server.label);
          finish(null, allTools);
          return;
        }
        toolCount += 1;
        sanitized = sanitizeMcpToolDefinition(serverTools[i], server);
        if (!sanitized) {
          continue;
        }
        if (cachedChars + sanitized.chars > MCP_MAX_SERVER_CACHE_CHARS) {
          common.logDebug('mcp tool skipped server cache character limit server=' + server.label + ' tool=' + sanitized.tool.name + ' limit=' + MCP_MAX_SERVER_CACHE_CHARS);
          continue;
        }
        cachedChars += sanitized.chars;
        allTools.push(sanitized.tool);
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

function finishMcpServerDiscovery(pending, error, tools, noTools) {
  var key = mcpCacheStorageKey(pending.key);
  var i;

  if (pending.done) {
    return;
  }
  pruneMcpWaiters(pending);
  if (!pending.waiters.length) {
    cancelMcpServerDiscovery(pending, 'MCP discovery canceled');
    return;
  }

  pending.done = true;
  delete s_mcp_pending[key];
  s_mcp_pending_count -= 1;
  pending.context.active = false;
  if (!error) {
    storeMcpCache(pending.server, tools, noTools);
  }

  for (i = 0; i < pending.waiters.length; i += 1) {
    var waiter = pending.waiters[i];
    if (!isCurrentMcpWaiter(waiter)) {
      settleMcpWaiter(waiter, 'MCP discovery canceled', null, false);
      continue;
    }
    waiter.server.sessionId = pending.server.sessionId || '';
    waiter.server._mcpCacheKey = pending.key;
    settleMcpWaiter(waiter, error, error ? null : tools, noTools === true);
  }
}

function discoverMcpServer(server, requestContext, callback) {
  var key = server._mcpCacheKey || mcpCacheKey(server);
  var storageKey = mcpCacheStorageKey(key);
  var cached = lookupMcpCache(key);
  var pending = s_mcp_pending[storageKey];
  var waiter = makeMcpWaiter(requestContext, server, callback);
  var context;

  if (!isCurrentMcpWaiter(waiter)) {
    settleMcpWaiter(waiter, 'MCP discovery canceled', null, false);
    return;
  }
  if (cached) {
    server.sessionId = cached.sessionId || '';
    settleMcpWaiter(waiter, null, cloneMcpToolList(cached.tools), cached.noTools === true);
    return;
  }
  if (pending) {
    pruneMcpWaiters(pending);
    if (pending.done || s_mcp_pending[storageKey] !== pending) {
      pending = null;
    }
  }
  if (pending) {
    if (pending.waiters.length >= MCP_MAX_PENDING_WAITERS) {
      settleMcpWaiter(waiter, 'MCP discovery busy', null, false);
      return;
    }
    pending.waiters.push(waiter);
    return;
  }
  cancelUnobservedMcpDiscoveries(requestContext && requestContext.warmGeneration);
  if (s_mcp_pending_count >= MCP_MAX_PENDING_DISCOVERIES) {
    settleMcpWaiter(waiter, 'MCP discovery busy', null, false);
    return;
  }

  context = { background: true, active: true, requests: [] };
  pending = {
    key: key,
    server: server,
    context: context,
    waiters: [waiter],
    done: false
  };
  s_mcp_pending[storageKey] = pending;
  s_mcp_pending_count += 1;

  initializeMcpServer(server, context, function(initError, initResult) {
    var noTools = initResult && initResult.noTools;

    if (pending.done) {
      return;
    }
    if (initError) {
      common.logDebug('mcp initialize failed server=' + server.label);
      finishMcpServerDiscovery(pending, initError, null, false);
      return;
    }
    if (noTools) {
      common.logDebug('mcp server declares no tools capability server=' + server.label);
      finishMcpServerDiscovery(pending, null, [], true);
      return;
    }

    common.logDebug('mcp initialized server=' + server.label);
    listAllMcpTools(server, context, function(listError, serverTools) {
      if (pending.done) {
        return;
      }
      if (listError) {
        common.logDebug('mcp tools/list failed server=' + server.label);
        finishMcpServerDiscovery(pending, listError, null, false);
        return;
      }
      common.logDebug('mcp tools/list ok server=' + server.label + ' count=' + serverTools.length);
      finishMcpServerDiscovery(pending, null, serverTools, false);
    });
  });
}

function discoverMcpTools(settings, requestContext, callback, serverList) {
  var servers = serverList || parseMcpServers(settings);
  var tools = [];
  var toolMap = Object.create(null);
  var usedNames = Object.create(null);
  var results = [];
  var remaining = servers.length;

  common.logDebug('mcp discover start servers=' + servers.length);

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

    if (!isCurrentMcpContext(requestContext)) {
      return;
    }
    for (i = 0; i < results.length; i += 1) {
      entry = results[i];
      if (entry && entry.tools) {
        addTools(entry.server, entry.tools);
      }
    }

    callback(null, cloneTools(tools), cloneToolMap(toolMap));
  }

  if (!remaining) {
    finalize();
    return;
  }

  servers.forEach(function(server, index) {
    discoverMcpServer(server, requestContext, function(discoveryError, serverTools) {
      if (discoveryError) {
        results[index] = null;
      } else {
        results[index] = { server: server, tools: serverTools || [] };
      }
      remaining -= 1;
      if (remaining <= 0) {
        finalize();
      }
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
  if (typeof Pebble === 'undefined' || !Pebble.getTimelineToken) {
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

function validateTimelineArgShape(args, allowStoredReminders) {
  var key;

  for (key in args) {
    if (args.hasOwnProperty(key)) {
      if (TIMELINE_RAW_PIN_ARG_KEYS[key] && !(allowStoredReminders && key === 'reminders')) {
        return 'Use structured timeline arguments, not raw Pebble pin JSON';
      }
    }
  }

  return '';
}

function timelineCreationIdError(args) {
  if (!args || typeof args !== 'object') {
    return '';
  }
  if (hasOwn(args, 'id') || hasOwn(args, 'pinId') || hasOwn(args, 'pin_id') ||
      (args.pin && typeof args.pin === 'object' && hasOwn(args.pin, 'id'))) {
    return 'Timeline creation generates a new pin id. Omit id; use pebble_timeline_edit_pin to change an existing pin.';
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
  var base = slugify(title || 'reminder').toLowerCase().substring(0, 20);
  var prefix = 'llm_' + base + '_' + new Date().getTime().toString(36) + '_';
  var attempt;
  var sequence;
  var id;

  for (attempt = 0; attempt < TIMELINE_PIN_ID_MAX_ATTEMPTS; attempt += 1) {
    sequence = timelineStore.nextTimelinePinIdSequence();
    id = (prefix + sequence.toString(36)).substring(0, 64);
    if (!timelineStore.getTimelinePin(id) && !hasOwn(s_timeline_pending_pin_ids, id)) {
      reserveTimelinePinId(id);
      return id;
    }
  }

  return '';
}

function reserveTimelinePinId(id) {
  var oldest;

  if (hasOwn(s_timeline_pending_pin_ids, id)) {
    return;
  }
  while (s_timeline_pending_pin_id_order.length >= TIMELINE_PIN_ID_MAX_PENDING) {
    oldest = s_timeline_pending_pin_id_order.shift();
    delete s_timeline_pending_pin_ids[oldest];
  }
  s_timeline_pending_pin_ids[id] = true;
  s_timeline_pending_pin_id_order.push(id);
}

function releaseTimelinePinId(id) {
  var index;
  if (!hasOwn(s_timeline_pending_pin_ids, id)) {
    return;
  }
  delete s_timeline_pending_pin_ids[id];
  index = s_timeline_pending_pin_id_order.indexOf(id);
  if (index !== -1) {
    s_timeline_pending_pin_id_order.splice(index, 1);
  }
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
  var hasReminderTime = hasToolArgValue(firstTimelineValue(reminderArgs, ['time', 'reminderTime']));
  var hasMinutesBefore;
  var pinUnix;

  minutesBefore = firstTimelineValue(reminderArgs, ['minutesBefore', 'remindMinutesBefore']);
  if (!hasToolArgValue(minutesBefore)) {
    minutesBefore = firstTimelineValue(defaultArgs, ['minutesBefore', 'remindMinutesBefore']);
  }
  hasMinutesBefore = hasToolArgValue(minutesBefore);

  if (hasReminderTime && hasMinutesBefore) {
    errors.push('Use either reminderTime or remindMinutesBefore, not both');
    return '';
  }

  if (reminderTime) {
    return reminderTime;
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

function buildTimelineReminders(args, pinTime, forceReminder, errors, suppressReminder) {
  var reminders = [];
  var raw = parseObjectArg(args.reminders);
  var i;
  var reminder;

  if (suppressReminder) {
    return reminders;
  }

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
  validationError = validateTimelineArgShape(args, options.allowStoredReminders);
  if (validationError) {
    return {
      error: validationError
    };
  }

  pin = {
    id: common.trim(args.id || args.pinId),
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

  reminders = buildTimelineReminders(args, pin.time, options.forceReminder, errors, options.suppressReminder);
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

  if (!pin.id) {
    pin.id = generateTimelinePinId(args.title || args.reminderTitle);
    if (!pin.id) {
      return {
        error: 'Unable to generate a unique Timeline pin id'
      };
    }
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
  var pebble = typeof Pebble !== 'undefined' ? Pebble : null;
  var localMethod = method === 'DELETE' ? 'deleteTimelinePin' : 'insertTimelinePin';
  var finished = false;

  function finish(error, isLocal) {
    if (finished) {
      return;
    }
    finished = true;
    callback(error, isLocal === true);
  }

  if (!watch.isCurrentRequest(requestId)) {
    return;
  }

  if (pebble && typeof pebble[localMethod] === 'function') {
    try {
      if (method === 'DELETE') {
        pebble.deleteTimelinePin(id);
      } else {
        pebble.insertTimelinePin(pin);
      }
    } catch (e) {
      finish('Local Timeline API error: ' + (e && e.message ? e.message : String(e || 'unknown error')));
      return;
    }

    if (!watch.isCurrentRequest(requestId)) {
      return;
    }

    // These APIs are synchronous void calls; PebbleKit JS does not report
    // whether the pin was subsequently delivered to the watch.
    finish(null, true);
    return;
  }

  getTimelineToken(function(tokenError, token) {

    if (!watch.isCurrentRequest(requestId)) {
      return;
    }
    if (tokenError) {
      finish(tokenError);
      return;
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
          finish(null, false);
          return;
        }
        if (request.status < 200 || request.status >= 300) {
          finish('Timeline HTTP ' + request.status + ': ' + responseText.substring(0, 180));
          return;
        }

        finish(null, false);
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

function buildTimelineSuccessResult(pin, editable, warning, isLocal) {
  var payload = {
    status: isLocal ? 'accepted' : 'success',
    id: pin.id,
    title: pin.layout && pin.layout.title ? String(pin.layout.title) : '',
    time: pin.time,
    editable: !!editable
  };
  if (isLocal) {
    payload.deliveryAcknowledged = false;
    payload.message = 'Local Timeline API call completed; watch delivery is not acknowledged.';
  }
  if (warning) {
    payload.warning = warning;
  }
  return common.safeJson(payload);
}

function buildTimelineDeleteResult(id, warning, isLocal) {
  var payload = {
    status: isLocal ? 'accepted' : 'deleted',
    id: id
  };
  if (isLocal) {
    payload.deliveryAcknowledged = false;
    payload.message = 'Local Timeline API call completed; watch delivery is not acknowledged.';
  }
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

function finishTimelineSave(kind, pin, args, callback, isLocal) {
  var editable = saveTimelineRecord(kind, pin, args);
  var warnings = [];
  var warning = '';

  if (isLocal && (pin.createNotification || pin.updateNotification)) {
    warnings.push('Local pins ignore createNotification/updateNotification; no notification was created.');
  }

  if (!editable) {
    warnings.push('Pin saved but storage failed; not editable');
    common.logDebug('timeline store save failed id=' + pin.id);
  }
  if (warnings.length) {
    warning = common.truncate(warnings.join(' '), TIMELINE_RESULT_WARNING_MAX_CHARS);
  }
  releaseTimelinePinId(pin.id);
  callback(null, buildTimelineSuccessResult(pin, editable, warning, isLocal));
}

function callTimelineCreateBuiltin(kind, args, requestId, callback) {
  var idError = timelineCreationIdError(args);
  var built;
  var pin;
  var validationError;
  var argsForStore;

  if (idError) {
    callback(idError);
    return;
  }
  built = buildTimelinePin(args, { forceReminder: kind === 'reminder' });
  if (built.error) {
    callback(built.error);
    return;
  }

  pin = built.pin;
  validationError = validateTimelinePin(pin);

  if (validationError) {
    releaseTimelinePinId(pin.id);
    callback(validationError);
    return;
  }

  argsForStore = cloneTimelineValue(args) || {};
  argsForStore.id = pin.id;

  timelinePinRequest('PUT', pin.id, pin, requestId, function(error, isLocal) {
    if (error) {
      releaseTimelinePinId(pin.id);
      callback(error);
      return;
    }
    finishTimelineSave(kind, pin, argsForStore, callback, isLocal);
  });
}

function callTimelineCreatePinBuiltin(args, requestId, callback) {
  callTimelineCreateBuiltin('pin', args, requestId, callback);
}

function callTimelineReminderBuiltin(args, requestId, callback) {
  callTimelineCreateBuiltin('reminder', args, requestId, callback);
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

  timelinePinRequest('DELETE', id, null, requestId, function(error, isLocal) {
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
    callback(null, buildTimelineDeleteResult(id, warning, isLocal));
  });
}

function callTimelineListBuiltin(args, requestId, callback) {
  var pins = [];
  var items = [];
  var fingerprintParts = [];
  var i;
  var pin;
  var rawTitle;
  var rawTime;
  var title;
  var time;
  var page;
  try {
    pins = timelineStore.listTimelinePins();
  } catch (e) {
    pins = [];
  }
  pins.sort(function(a, b) {
    var aUpdated = a && typeof a.updatedAt === 'number' ? a.updatedAt : 0;
    var bUpdated = b && typeof b.updatedAt === 'number' ? b.updatedAt : 0;
    var aId = String(a && a.id || '');
    var bId = String(b && b.id || '');
    if (bUpdated !== aUpdated) { return bUpdated - aUpdated; }
    return aId < bId ? -1 : (aId > bId ? 1 : 0);
  });
  for (i = 0; i < pins.length; i += 1) {
    pin = pins[i] || {};
    rawTitle = typeof pin.title === 'string' ? pin.title : String(pin.title || '');
    rawTime = typeof pin.time === 'string' ? pin.time : String(pin.time || '');
    fingerprintParts.push(String(pin.id || ''), String(pin.kind || ''), rawTitle, rawTime,
      String(pin.createdAt || 0), String(pin.updatedAt || 0));
    title = boundedTimelineField(rawTitle, 384);
    time = boundedTimelineField(rawTime, 128);
    items.push({
      id: String(pin.id || '').substring(0, 64),
      kind: pin.kind === 'reminder' ? 'reminder' : 'pin',
      title: title.value,
      titleTruncated: title.truncated,
      time: time.value,
      timeTruncated: time.truncated,
      createdAt: typeof pin.createdAt === 'number' && isFinite(pin.createdAt) ? pin.createdAt : 0,
      updatedAt: typeof pin.updatedAt === 'number' && isFinite(pin.updatedAt) ? pin.updatedAt : 0
    });
  }
  items.sort(function(a, b) {
    if (b.updatedAt !== a.updatedAt) { return b.updatedAt - a.updatedAt; }
    return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
  });
  page = toolPagination.paginate(items, {
    scope: 'timeline_list',
    query: '',
    datasetHash: toolPagination.hashParts(fingerprintParts),
    cursor: args && args.cursor,
    limit: args && args.limit,
    defaultLimit: 5,
    maxLimit: 64
  });
  if (page.error) { callback(page.error); return; }
  callback(null, common.safeJson(page.value));
}

function boundedTimelineField(value, maximum) {
  var text = typeof value === 'string' ? value : String(value || '');
  var clipped;
  if (text.length <= maximum) { return { value: text, truncated: false }; }
  clipped = text.substring(0, maximum);
  if (clipped.length && clipped.charCodeAt(clipped.length - 1) >= 0xd800 && clipped.charCodeAt(clipped.length - 1) <= 0xdbff) {
    clipped = clipped.substring(0, clipped.length - 1);
  }
  return { value: clipped, truncated: true };
}

function clearTimelineReminderScheduleArgs(args) {
  delete args.reminderTime;
  delete args.remindMinutesBefore;
  delete args.minutesBefore;
  delete args.reminders;
}

function callTimelineEditBuiltin(args, requestId, callback) {
  var id = common.trim(args && args.id);
  var stored;
  var mergedArgs;
  var allowedFields = ['title', 'time', 'durationMinutes', 'pinType', 'subtitle', 'body', 'locationName', 'icon', 'pinIcon', 'reminderTime', 'remindMinutesBefore', 'reminderTitle', 'reminderIcon', 'createNotificationTitle', 'createNotificationBody'];
  var i;
  var key;
  var forceReminder;
  var hasNewReminderTime;
  var hasNewMinutesBefore;
  var clearReminder;
  var reminderRemoved;
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

  hasNewReminderTime = hasToolArgValue(args.reminderTime);
  hasNewMinutesBefore = hasToolArgValue(firstTimelineValue(args, ['minutesBefore', 'remindMinutesBefore']));
  clearReminder = args.clearReminder === true;
  if (args.clearReminder !== undefined && typeof args.clearReminder !== 'boolean') {
    callback('clearReminder must be a boolean');
    return;
  }
  if (hasNewReminderTime && hasNewMinutesBefore) {
    callback('Use either reminderTime or remindMinutesBefore, not both');
    return;
  }
  if (clearReminder && (hasNewReminderTime || hasNewMinutesBefore)) {
    callback('clearReminder cannot be combined with reminderTime or remindMinutesBefore');
    return;
  }

  mergedArgs = cloneTimelineValue(stored.args) || {};
  for (i = 0; i < allowedFields.length; i += 1) {
    key = allowedFields[i];
    if (hasOwn(args, key)) {
      if ((key === 'reminderTime' || key === 'remindMinutesBefore') && !hasToolArgValue(args[key])) {
        continue;
      }
      mergedArgs[key] = cloneTimelineValue(args[key]);
      if (mergedArgs[key] === null && args[key] !== null) {
        mergedArgs[key] = args[key];
      }
    }
  }

  if (clearReminder) {
    clearTimelineReminderScheduleArgs(mergedArgs);
    mergedArgs._timelineReminderRemoved = true;
  } else if (hasNewReminderTime) {
    delete mergedArgs.remindMinutesBefore;
    delete mergedArgs.minutesBefore;
    delete mergedArgs.reminders;
    delete mergedArgs._timelineReminderRemoved;
  } else if (hasNewMinutesBefore) {
    delete mergedArgs.reminderTime;
    delete mergedArgs.minutesBefore;
    delete mergedArgs.reminders;
    delete mergedArgs._timelineReminderRemoved;
  }
  delete mergedArgs.clearReminder;

  mergedArgs.id = stored.id;

  reminderRemoved = mergedArgs._timelineReminderRemoved === true;
  forceReminder = stored.kind === 'reminder' && !reminderRemoved;
  built = buildTimelinePin(mergedArgs, {
    forceReminder: forceReminder,
    suppressReminder: reminderRemoved,
    allowStoredReminders: true
  });
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

  timelinePinRequest('PUT', pin.id, pin, requestId, function(error, isLocal) {
    if (error) {
      callback(error);
      return;
    }
    finishTimelineSave(stored.kind, pin, argsForStore, callback, isLocal);
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
  var result = {};
  var value;

  if (metric === 'heart_rate') {
    if (response.heartRateCurrentBPM !== undefined) { result.currentBpm = response.heartRateCurrentBPM; }
    if (response.heartRateAverageBPM !== undefined) { result.averageBpm = response.heartRateAverageBPM; }
    if (response.heartRateMinBPM !== undefined) { result.minBpm = response.heartRateMinBPM; }
    if (response.heartRateMaxBPM !== undefined) { result.maxBpm = response.heartRateMaxBPM; }
    return Object.keys(result).length ? result : undefined;
  }
  if (!HEALTH_METRIC_MAP[metric]) { return undefined; }
  value = response[HEALTH_METRIC_MAP[metric].responseField];
  if (value !== undefined && value !== null) {
    return value;
  }
  return undefined;
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
      values[HEALTH_METRIC_MAP[metric].outputField] = value;
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
    bit = HEALTH_METRIC_MAP[metric] && HEALTH_METRIC_MAP[metric].bit;
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
    if (typeof metric !== 'string' || !HEALTH_METRIC_MAP[metric]) {
      callback('metrics must contain supported metric strings');
      return;
    }
    if (args.metrics.indexOf(metric) !== i) {
      callback('metrics must contain unique values');
      return;
    }
    if (metric === 'activity_sessions' || metric === 'sleep_sessions') { sessionMetrics.push(metric); }
    else { scalarMetrics.push(metric); totalMask |= HEALTH_METRIC_MAP[metric].bit; }
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

  for (i = 0; i < sessionMetrics.length; i += 1) { sessionMask |= HEALTH_METRIC_MAP[sessionMetrics[i]].bit; }
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

function callMemorySaveBuiltin(args, requestId, callback) {
  var memory = memoryStore.addMemory(args.text);
  if (!memory) { callback('Unable to save memory'); return; }
  callback(null, JSON.stringify({ status: 'saved', memory: memory }));
}

function callMemorySearchBuiltin(args, requestId, callback) {
  var query = args && typeof args.query === 'string' ? args.query : '';
  var limit = args && args.limit !== undefined ? args.limit : undefined;
  var normalizedQuery = query.trim().toLowerCase();
  var memories = memoryStore.searchMemories(query, memoryStore.MAX_SEARCH_RESULTS);
  var fingerprintParts = [];
  var i;
  var page;
  for (i = 0; i < memories.length; i += 1) {
    fingerprintParts.push(memories[i].id, memories[i].text, memories[i].createdAt, memories[i].updatedAt);
  }
  page = toolPagination.paginate(memories, {
    scope: 'memory_search',
    query: normalizedQuery,
    datasetHash: toolPagination.hashParts(fingerprintParts),
    cursor: args && args.cursor,
    limit: limit,
    defaultLimit: 4,
    maxLimit: memoryStore.MAX_SEARCH_RESULTS
  });
  if (page.error) { callback(page.error); return; }
  callback(null, JSON.stringify(page.value));
}

function callMemoryDeleteBuiltin(args, requestId, callback) {
  var id = args && typeof args.id === 'string' ? args.id.trim() : '';
  if (!id) { callback('Memory id is required'); return; }
  if (!memoryStore.deleteMemory(id)) { callback('Memory not found or could not be deleted'); return; }
  callback(null, JSON.stringify({ status: 'deleted', id: id }));
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
    builtinName: baseName,
    executionClass: definition.executionClass || TOOL_EXECUTION_SERIAL,
    structuredResult: definition.structuredResult !== false,
    label: definition.label,
    parameters: definition.parameters,
    call: definition.call
  };
  common.logDebug('builtin tool exposed=' + exposedName);
}

function addBuiltinTools(settings, tools, toolMap) {
  if (settings.PebbleMemoryToolEnabled) {
    addBuiltinTool(tools, toolMap, {
      name: 'pebble_memory_save',
      label: 'Memory',
      description: 'Save an intentional user note for later recall. Use only when the user explicitly asks to remember or save something, never for inferred facts or ordinary conversation.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['text'],
        properties: { text: { type: 'string', maxLength: 500, description: 'Text the user explicitly asked to remember.' } }
      },
      call: callMemorySaveBuiltin
    });
    addBuiltinTool(tools, toolMap, {
      name: 'pebble_memory_search',
      label: 'Memory',
      description: 'Search intentional notes saved by the user. Search when a prior intentional note may help answer the request; omit query to list recent notes. Results are paged; continue with nextCursor until hasMore is false.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string', maxLength: 500, description: 'Optional text to find in saved notes.' },
          limit: { type: 'integer', minimum: 1, maximum: 32, description: 'Optional page size. Defaults to 4.' },
          cursor: { type: 'string', maxLength: 512, description: 'Opaque cursor from previous page for same query.' }
        }
      },
      call: callMemorySearchBuiltin
    });
    addBuiltinTool(tools, toolMap, {
      name: 'pebble_memory_delete',
      label: 'Memory',
      description: 'Delete one saved intentional note by its exact id.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['id'],
        properties: { id: { type: 'string', maxLength: 64, description: 'Exact saved memory id.' } }
      },
      call: callMemoryDeleteBuiltin
    });
  }
  if (settings.WebSearchEnabled) {
    addBuiltinTool(tools, toolMap, {
      name: 'web_fetch',
      structuredResult: false,
      executionClass: TOOL_EXECUTION_INDEPENDENT_READ,
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
        additionalProperties: false,
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
      description: 'Create a new Pebble timeline pin with a scheduled reminder notification attached to the pin. Use for reminder and "remind me" requests; use pebble_timeline_create_pin for events without a reminder. Each call generates a new id; do not supply an id. For an existing pin, use pebble_timeline_list_pins then pebble_timeline_edit_pin. Set reminderTime for an exact notification time, remindMinutesBefore for a relative time (0 means at pin time), or omit both to use time. This does not create an OS/system alarm. Result includes id; editable indicates whether future edits are available. Local acceptance does not confirm watch delivery.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', description: 'Reminder/pin title shown on the watch.' },
          time: { type: 'string', description: 'Pin time as ISO date-time with timezone, parseable date-time, or Unix seconds. Also the reminder notification time when neither reminder mode is supplied.' },
          reminderTime: { type: 'string', description: 'Optional exact scheduled reminder notification time; omitted means time. Do not combine with remindMinutesBefore.' },
          remindMinutesBefore: { type: 'integer', minimum: 0, maximum: 43200, description: 'Optional minutes before time for the scheduled reminder notification. Use instead of reminderTime for relative timing; 0 means at time.' },
          durationMinutes: { type: 'integer', minimum: 0, maximum: 1440, description: 'Optional event duration in minutes.' },
          body: { type: 'string', maxLength: 512, description: 'Optional detail text for the timeline pin.' },
          locationName: { type: 'string', description: 'Optional location shown on the reminder.' },
          pinIcon: { type: 'string', description: 'Optional Pebble icon name or URI for the pin. Default NOTIFICATION_REMINDER. Example: NOTIFICATION_REMINDER, ALARM_CLOCK, TIMELINE_CALENDAR.' },
          reminderIcon: { type: 'string', description: 'Optional Pebble icon name or URI for the reminder. Default NOTIFICATION_REMINDER.' },
          createNotificationTitle: { type: 'string', description: 'Optional create notification title for the legacy HTTP Timeline API only; ignored on local pins. This is not the scheduled reminder.' },
          createNotificationBody: { type: 'string', maxLength: 512, description: 'Optional create notification body for the legacy HTTP Timeline API only; ignored on local pins.' }
        },
        required: ['title', 'time']
      },
      call: callTimelineReminderBuiltin
    });
    addBuiltinTool(tools, toolMap, {
      name: 'pebble_timeline_create_pin',
      label: 'Timeline',
      description: 'Create a new Pebble timeline pin for calendar events, schedule items, or other non-reminder entries. Use pebble_timeline_create_reminder when user asks for a scheduled reminder alert. Each call generates a new id; do not supply an id. To change an existing pin, first find it with pebble_timeline_list_pins, then call pebble_timeline_edit_pin with its id. Use reminderTime or remindMinutesBefore only for an alert attached to this pin. Result includes id; editable indicates whether future edits are available. Local acceptance does not confirm watch delivery.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          time: { type: 'string', description: 'Pin event start time as ISO date-time with timezone, parseable date-time, or Unix seconds.' },
          durationMinutes: { type: 'integer', minimum: 0, maximum: 1440, description: 'Optional event duration in minutes.' },
          pinType: { type: 'string', enum: ['generic', 'calendar', 'sports', 'weather'], description: 'Kind of timeline pin. Default generic.' },
          title: { type: 'string', description: 'Pin title shown on the watch.' },
          subtitle: { type: 'string', description: 'Optional subtitle.' },
          body: { type: 'string', maxLength: 512, description: 'Optional pin body text.' },
          locationName: { type: 'string', description: 'Optional location. Required for weatherPin and useful for reminders/calendar pins.' },
          icon: { type: 'string', description: 'Optional Pebble icon name or URI. Default NOTIFICATION_REMINDER except calendar pins. Example: NOTIFICATION_REMINDER, NOTIFICATION_FLAG, ALARM_CLOCK, TIMELINE_CALENDAR.' },
          reminderTime: { type: 'string', description: 'Optional single scheduled reminder time. Creates reminders[0]. Do not combine with remindMinutesBefore.' },
          remindMinutesBefore: { type: 'integer', minimum: 0, maximum: 43200, description: 'Optional minutes before pin time for a single scheduled reminder; 0 means at pin time.' },
          reminderTitle: { type: 'string', description: 'Optional title for the single scheduled reminder. Defaults to title.' },
          reminderIcon: { type: 'string', description: 'Optional icon for scheduled reminder. Default NOTIFICATION_REMINDER.' }
        },
        required: ['title', 'time']
      },
      call: callTimelineCreatePinBuiltin
    });
    addBuiltinTool(tools, toolMap, {
      name: 'pebble_timeline_delete_pin',
      label: 'Timeline',
      description: 'Delete one of this app\'s Pebble timeline pins by id.',
      parameters: {
        type: 'object',
        additionalProperties: false,
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
      description: 'List Pebble timeline pins created by this app that can be edited. Pages include id, kind, title, time, and titleTruncated/timeTruncated flags. When hasMore is true, pass nextCursor for next page. Use a listed id with pebble_timeline_edit_pin to change a pin. No network request.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 64, description: 'Optional page size. Defaults to 5.' },
          cursor: { type: 'string', maxLength: 512, description: 'Opaque cursor from previous page.' }
        }
      },
      call: callTimelineListBuiltin
    });
    addBuiltinTool(tools, toolMap, {
      name: 'pebble_timeline_edit_pin',
      label: 'Timeline',
      description: 'Edit an existing pin created by this app. First find its id with pebble_timeline_list_pins. Only supplied fields change; all other stored fields are preserved. Empty string clears supported optional text fields, such as subtitle and body; locationName is required for weather pins. Empty string cannot clear integer or enum fields; use clearReminder:true to remove all scheduled alerts. Use either reminderTime or remindMinutesBefore (0 means at pin time); supplying one replaces the other. Do not combine either mode with clearReminder:true. clearReminder:false does not restore a removed alert; supply a reminder mode to add one again. Local acceptance does not confirm watch delivery.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', maxLength: 64, description: 'Pin id to edit. Must be an existing LLM-created pin. Use pebble_timeline_list_pins to find ids.' },
          title: { type: 'string', description: 'Pin title shown on the watch.' },
          time: { type: 'string', description: 'Pin event start time as ISO date-time with timezone, parseable date-time, or Unix seconds.' },
          durationMinutes: { type: 'integer', minimum: 0, maximum: 1440, description: 'Optional event duration in minutes. Empty string is invalid; this field has no clear value.' },
          pinType: { type: 'string', enum: ['generic', 'calendar', 'sports', 'weather'], description: 'Kind of timeline pin. Empty string is not a valid enum value.' },
          subtitle: { type: 'string', description: 'Optional subtitle. Empty string clears.' },
          body: { type: 'string', maxLength: 512, description: 'Optional pin body text. Empty string clears.' },
          locationName: { type: 'string', description: 'Optional location. Empty string clears unless required for a weather pin.' },
          icon: { type: 'string', description: 'Optional Pebble icon name or URI. Empty string resets to default icon.' },
          pinIcon: { type: 'string', description: 'Optional Pebble icon name or URI for the pin. Empty string resets to default icon.' },
          reminderTime: { type: 'string', description: 'Optional exact reminder alert time. Supplying this replaces any stored remindMinutesBefore mode. Empty string does not remove the alert; use clearReminder:true.' },
          remindMinutesBefore: { type: 'integer', minimum: 0, maximum: 43200, description: 'Optional minutes before time to show reminder, including 0 for pin time. Supplying this replaces any stored reminderTime mode. Cannot be cleared with an empty string; use clearReminder:true.' },
          clearReminder: { type: 'boolean', description: 'Set true to remove every scheduled reminder. Do not combine true with reminderTime or remindMinutesBefore. False alone does not restore a previously removed reminder.' },
          reminderTitle: { type: 'string', description: 'Optional title for the scheduled reminder. Empty string resets it to the pin title.' },
          reminderIcon: { type: 'string', description: 'Optional icon for the scheduled reminder. Empty string resets to default icon.' },
          createNotificationTitle: { type: 'string', description: 'Optional create notification title for the legacy HTTP Timeline API only; ignored on local pins. Empty string uses the fallback title "Timeline update" if notification remains.' },
          createNotificationBody: { type: 'string', maxLength: 512, description: 'Optional create notification body for the legacy HTTP Timeline API only; ignored on local pins. Empty string clears body.' }
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
          metrics: { type: 'array', minItems: 1, maxItems: HEALTH_METRICS.length, uniqueItems: true, description: 'Nonempty unique health metrics to request.', items: { type: 'string', enum: HEALTH_METRIC_NAMES } },
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

function warmMcpTools(settings, callback) {
  var normalizedSettings = settings || {};
  var maxToolCalls = parseInt(normalizedSettings.MaxToolCalls, 10);
  var servers = parseMcpServers(normalizedSettings);
  var previousGeneration = s_mcp_warm_generation;
  var generation = {
    id: s_mcp_warm_generation_id,
    active: true,
    serverKeys: Object.create(null),
    context: null
  };
  var context;
  var i;

  s_mcp_warm_generation_id += 1;
  if (previousGeneration) {
    previousGeneration.active = false;
    if (previousGeneration.context) {
      previousGeneration.context.active = false;
    }
  }
  s_mcp_warm_generation = generation;

  if (!isNaN(maxToolCalls) && maxToolCalls <= 0) {
    servers = [];
  }
  for (i = 0; i < servers.length; i += 1) {
    generation.serverKeys[mcpCacheStorageKey(servers[i]._mcpCacheKey)] = true;
  }

  context = { background: true, active: true, warmGeneration: generation };
  generation.context = context;
  cancelUnobservedMcpDiscoveries(generation);
  if (!servers.length) {
    cancelUnobservedMcpDiscoveries();
    context.active = false;
    if (callback) {
      callback(null, { serverCount: 0, tools: [] });
    }
    return;
  }

  discoverMcpTools(normalizedSettings, context, function(error, tools) {
    context.active = false;
    if (callback) {
      callback(error, { serverCount: servers.length, tools: tools || [] });
    }
  }, servers);
  if (s_mcp_warm_generation === generation) {
    cancelUnobservedMcpDiscoveries();
  }
}

function callMcpTool(toolInfo, args, requestId, callback) {
  var called = false;
  var retried = false;

  function once(error, resultText, resultInfo) {
    if (called) {
      return;
    }
    called = true;
    if (error) {
      common.logDebug('mcp tool error server=' + toolInfo.server.label + ' tool=' + toolInfo.toolName);
      callback(error);
      return;
    }
    common.logDebug('mcp tool result server=' + toolInfo.server.label + ' tool=' + toolInfo.toolName + ' chars=' + String(resultText || '').length);
    callback(null, resultText, resultInfo);
  }

  function doCall() {
    common.logDebug('mcp tool call server=' + toolInfo.server.label + ' tool=' + toolInfo.toolName + ' args=' + common.safeJson(args).substring(0, 240));
    mcpJsonRpc(toolInfo.server, 'tools/call', {
      name: toolInfo.toolName,
      arguments: args || {}
    }, true, requestId, function(error, result, httpStatus) {
      var formatted;
      if (!watch.isCurrentRequest(requestId)) {
        return;
      }
      if (error && httpStatus === 404 && toolInfo.server.sessionId && !retried) {
        retried = true;
        common.logDebug('mcp tool 404 reinitialize server=' + toolInfo.server.label);
        toolInfo.server.sessionId = '';
        updateMcpCacheSession(toolInfo.server);
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
        once(formatMcpToolResult(result).text || 'MCP tool reported an error');
        return;
      }
      formatted = formatMcpToolResult(result);
      once(null, formatted.text, {
        structured: formatted.structured,
        mcpResultEnvelope: formatted.mcpEnvelope === true
      });
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
    callback(null, resultText, { structured: toolInfo.structuredResult === true });
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
  if (a === null || b === null || typeof a === 'object') {
    return a === b;
  }
  return a === b;
}

function articleFor(type) {
  if (type === 'integer' || type === 'object' || type === 'array') {
    return 'an';
  }
  return 'a';
}

function joinToolArgPath(parent, child) {
  return parent ? parent + '.' + child : child;
}

function consumeToolValidationWork(state, amount, key) {
  state.work += amount;
  if (state.work > TOOL_VALIDATION_MAX_WORK) {
    return (key || 'Tool arguments') + ' exceeds validation work limit ' + TOOL_VALIDATION_MAX_WORK;
  }
  return '';
}

function consumeToolSignatureChars(state, amount, key) {
  state.signatureChars += amount;
  if (state.signatureChars > TOOL_VALIDATION_MAX_SIGNATURE_CHARS) {
    return (key || 'Tool arguments') + ' exceeds validation signature limit ' + TOOL_VALIDATION_MAX_SIGNATURE_CHARS;
  }
  return '';
}

function toolArgValueSignature(value, state, key, depth) {
  var type = typeof value;
  var token;
  var parts;
  var keys;
  var childKey;
  var childPath;
  var child;
  var item;
  var count = 0;
  var sortWork;
  var i;
  var error;

  if (depth > TOOL_VALIDATION_MAX_DEPTH) {
    return { error: (key || 'Tool arguments') + ' exceeds maximum validation depth ' + TOOL_VALIDATION_MAX_DEPTH };
  }
  error = consumeToolValidationWork(state, 1, key);
  if (error) {
    return { error: error };
  }

  if (value === null) {
    token = 'null';
    error = consumeToolSignatureChars(state, token.length, key);
    return error ? { error: error } : { value: token };
  }
  if (type === 'string' || type === 'number' || type === 'boolean') {
    if (type === 'string' && value.length > TOOL_VALIDATION_MAX_SIGNATURE_CHARS - state.signatureChars) {
      return { error: (key || 'Tool arguments') + ' exceeds validation signature limit ' + TOOL_VALIDATION_MAX_SIGNATURE_CHARS };
    }
    try {
      token = JSON.stringify(value);
    } catch (e) {
      token = undefined;
    }
    if (token === undefined) {
      token = type + ':' + String(value);
    }
    error = consumeToolSignatureChars(state, token.length, key);
    return error ? { error: error } : { value: token };
  }
  if (isArrayValue(value)) {
    parts = [];
    for (i = 0; i < value.length; i += 1) {
      item = toolArgValueSignature(value[i], state, key + '[' + i + ']', depth + 1);
      if (item.error) {
        return item;
      }
      parts.push(item.value);
    }
    error = consumeToolSignatureChars(state, parts.length + 1, key);
    return error ? { error: error } : { value: '[' + parts.join(',') + ']' };
  }
  if (isObjectValue(value)) {
    parts = [];
    keys = [];
    for (childKey in value) {
      if (!hasOwn(value, childKey)) {
        continue;
      }
      count += 1;
      if (count > TOOL_VALIDATION_MAX_OBJECT_PROPERTIES) {
        return { error: (key || 'Tool arguments') + ' exceeds validation property limit ' + TOOL_VALIDATION_MAX_OBJECT_PROPERTIES };
      }
      keys.push(childKey);
    }
    sortWork = count > 1 ? count * Math.ceil(Math.log(count) / Math.LN2) : count;
    error = consumeToolValidationWork(state, sortWork, key);
    if (error) {
      return { error: error };
    }
    keys.sort();
    for (i = 0; i < keys.length; i += 1) {
      childKey = keys[i];
      childPath = joinToolArgPath(key, childKey);
      if (childKey.length > TOOL_VALIDATION_MAX_SIGNATURE_CHARS - state.signatureChars) {
        return { error: childPath + ' exceeds validation signature limit ' + TOOL_VALIDATION_MAX_SIGNATURE_CHARS };
      }
      try {
        token = JSON.stringify(childKey);
      } catch (e2) {
        token = undefined;
      }
      if (token === undefined) {
        token = String(childKey);
      }
      error = consumeToolSignatureChars(state, token.length + 1, childPath);
      if (error) {
        return { error: error };
      }
      child = toolArgValueSignature(value[childKey], state, childPath, depth + 1);
      if (child.error) {
        return child;
      }
      parts.push(token + ':' + child.value);
    }
    error = consumeToolSignatureChars(state, parts.length + 1, key);
    return error ? { error: error } : { value: '{' + parts.join(',') + '}' };
  }

  token = type + ':' + String(value);
  error = consumeToolSignatureChars(state, token.length, key);
  return error ? { error: error } : { value: token };
}

function validateToolArgValue(value, schema, key, state, depth, root) {
  var type;
  var required;
  var properties;
  var itemSchema;
  var i;
  var matched;
  var childKey;
  var childPath;
  var collectionCount;
  var argError;
  var hasObjectShape;
  var seenUniqueItems;
  var signature;
  var enumCandidate;
  var enumValueSignature;
  var enumCandidateSignature;

  if (!isObjectValue(schema)) {
    return '';
  }
  if (depth > TOOL_VALIDATION_MAX_DEPTH) {
    return (key || 'Tool arguments') + ' exceeds maximum validation depth ' + TOOL_VALIDATION_MAX_DEPTH;
  }
  argError = consumeToolValidationWork(state, 1, key);
  if (argError) {
    return argError;
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
        if (root) {
          return 'Tool arguments must be a JSON object';
        }
        return key + ' must be ' + type.join(' or ');
      }
    } else if (!valueMatchesType(value, type)) {
      if (root && type === 'object') {
        return 'Tool arguments must be a JSON object';
      }
      return key + ' must be ' + articleFor(type) + ' ' + type;
    }
  }

  if (isArrayValue(schema.enum) && schema.enum.length) {
    matched = false;
    enumValueSignature = null;
    for (i = 0; i < schema.enum.length; i += 1) {
      enumCandidate = schema.enum[i];
      if (value !== null && enumCandidate !== null && typeof value === 'object' && typeof enumCandidate === 'object') {
        if (isArrayValue(value) !== isArrayValue(enumCandidate)) {
          continue;
        }
        if (!enumValueSignature) {
          enumValueSignature = toolArgValueSignature(value, state, key, depth + 1);
          if (enumValueSignature.error) {
            return enumValueSignature.error;
          }
        }
        enumCandidateSignature = toolArgValueSignature(enumCandidate, state, key, depth + 1);
        if (enumCandidateSignature.error) {
          return enumCandidateSignature.error;
        }
        matched = enumValueSignature.value === enumCandidateSignature.value;
      } else {
        matched = argValuesEqual(value, enumCandidate);
      }
      if (matched) {
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
  if (schema.minLength !== undefined && typeof value === 'string' && value.length < schema.minLength) {
    return key + ' must have length ' + schema.minLength + ' or greater';
  }
  if (schema.maxLength !== undefined && typeof value === 'string' && value.length > schema.maxLength) {
    return key + ' exceeds max length ' + schema.maxLength;
  }

  if (isArrayValue(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      if (schema.minItems === 1 && value.length === 0) {
        return key + ' must be nonempty';
      }
      return key + ' must contain at least ' + schema.minItems + ' item(s)';
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      return key + ' must contain no more than ' + schema.maxItems + ' item(s)';
    }
    itemSchema = schema.items;
    if (isObjectValue(itemSchema)) {
      for (i = 0; i < value.length; i += 1) {
        argError = validateToolArgValue(value[i], itemSchema, key + '[' + i + ']', state, depth + 1, false);
        if (argError) {
          return argError;
        }
      }
    } else if (schema.uniqueItems !== true) {
      argError = consumeToolValidationWork(state, value.length, key);
      if (argError) {
        return argError;
      }
    }
    if (schema.uniqueItems === true) {
      seenUniqueItems = Object.create(null);
      for (i = 0; i < value.length; i += 1) {
        signature = toolArgValueSignature(value[i], state, key + '[' + i + ']', depth + 1);
        if (signature.error) {
          return signature.error;
        }
        if (hasOwn(seenUniqueItems, signature.value)) {
          return key + ' must contain unique items';
        }
        seenUniqueItems[signature.value] = true;
      }
    }
  }

  required = isArrayValue(schema.required) ? schema.required : [];
  properties = isObjectValue(schema.properties) ? schema.properties : {};
  hasObjectShape = schema.type === 'object' || schema.properties !== undefined || required.length > 0;
  if (hasObjectShape && !isObjectValue(value)) {
    if (type && isArrayValue(type) && value === null && valueMatchesType(value, type[0])) {
      return '';
    }
    if (!type) {
      return root ? 'Tool arguments must be a JSON object' : key + ' must be an object';
    }
  }

  if (isObjectValue(value)) {
    if (required.length > TOOL_VALIDATION_MAX_OBJECT_PROPERTIES) {
      return (key || 'Tool arguments') + ' schema exceeds validation property limit ' + TOOL_VALIDATION_MAX_OBJECT_PROPERTIES;
    }
    for (i = 0; i < required.length; i += 1) {
      childPath = joinToolArgPath(key, required[i]);
      if (!hasToolArgValue(value[required[i]])) {
        return 'Missing required tool argument: ' + childPath;
      }
    }

    if (schema.additionalProperties === false) {
      collectionCount = 0;
      for (childKey in value) {
        if (!hasOwn(value, childKey)) {
          continue;
        }
        collectionCount += 1;
        if (collectionCount > TOOL_VALIDATION_MAX_OBJECT_PROPERTIES) {
          return (key || 'Tool arguments') + ' exceeds validation property limit ' + TOOL_VALIDATION_MAX_OBJECT_PROPERTIES;
        }
        childPath = joinToolArgPath(key, childKey);
        if (!hasOwn(properties, childKey)) {
          return 'Unsupported tool argument: ' + childPath;
        }
        argError = validateToolArgValue(value[childKey], properties[childKey], childPath, state, depth + 1, false);
        if (argError) {
          return argError;
        }
      }
    } else {
      collectionCount = 0;
      for (childKey in properties) {
        if (!hasOwn(properties, childKey) || !hasOwn(value, childKey)) {
          continue;
        }
        collectionCount += 1;
        if (collectionCount > TOOL_VALIDATION_MAX_OBJECT_PROPERTIES) {
          return (key || 'Tool arguments') + ' schema exceeds validation property limit ' + TOOL_VALIDATION_MAX_OBJECT_PROPERTIES;
        }
        childPath = joinToolArgPath(key, childKey);
        argError = validateToolArgValue(value[childKey], properties[childKey], childPath, state, depth + 1, false);
        if (argError) {
          return argError;
        }
      }
    }
  }

  return '';
}

function validateToolArgs(args, schema) {
  return validateToolArgValue(args, schema || {}, '', { work: 0, signatureChars: 0 }, 0, true);
}

function isIndependentReadTool(toolInfo) {
  return !!toolInfo && toolInfo.kind === 'builtin' &&
    toolInfo.builtinName === 'web_fetch' &&
    toolInfo.executionClass === TOOL_EXECUTION_INDEPENDENT_READ;
}

function runToolCalls(requestId, toolCalls, toolMap, callback) {
  var jobs = [];
  var results = [];
  var nextIndex = 0;
  var completed = 0;
  var callbackCalled = false;
  var i;

  function createJob(call, index) {
    var name;
    var args;
    var callId;
    var toolInfo;
    var parsedArgs;
    var validationError;
    var progressId;

    call = call || {};
    if (call.function && typeof call.function === 'object') {
      name = call.function.name || call.name || call.tool;
      args = call.function.arguments || call.arguments || call.args || {};
    } else {
      name = call.name || call.tool || call.function;
      args = call.arguments || call.args || {};
    }
    callId = call.call_id || call.id || name || String(index + 1);
    toolInfo = hasOwn(toolMap, name) ? toolMap[name] : null;

    if (!toolInfo) {
      return {
        index: index,
        id: callId,
        name: name || 'unknown',
        error: 'Unknown or unavailable tool'
      };
    }
    progressId = 'tool-call-' + s_tool_execution_id;
    s_tool_execution_id += 1;

    parsedArgs = parseToolArgsValue(args);
    if (parsedArgs.error) {
      return {
        index: index,
        id: callId,
        name: name,
        toolInfo: toolInfo,
        progressId: progressId,
        error: parsedArgs.error
      };
    }
    args = parsedArgs.args;
    if (toolInfo.kind === 'builtin' &&
        (toolInfo.builtinName === 'pebble_timeline_create_pin' || toolInfo.builtinName === 'pebble_timeline_create_reminder')) {
      validationError = timelineCreationIdError(args);
      if (validationError) {
        return {
          index: index,
          id: callId,
          name: name,
          toolInfo: toolInfo,
          progressId: progressId,
          error: validationError
        };
      }
    }
    validationError = validateToolArgs(args, toolInfo.parameters);
    if (validationError) {
      return {
        index: index,
        id: callId,
        name: name,
        toolInfo: toolInfo,
        progressId: progressId,
        error: validationError
      };
    }

    return {
      index: index,
      id: callId,
      name: name,
      args: args,
      toolInfo: toolInfo,
      progressId: progressId
    };
  }

  function settleJob(job, error, resultText, resultInfo) {
    if (job.settled) {
      return false;
    }
    job.settled = true;
    if (!watch.isCurrentRequest(requestId)) {
      return false;
    }

    if (error) {
      if (job.toolInfo) {
        watch.progressDone(
          requestId,
          formatToolLabel(job.toolInfo),
          'error: ' + (job.error !== undefined ? job.error : common.truncate(error, 90)),
          job.progressId
        );
      } else {
        watch.progressDone(requestId, String(job.name || 'unknown'), 'unknown tool');
      }
      results[job.index] = {
        id: job.id,
        call_id: job.id,
        name: job.name,
        error: error
      };
    } else {
      results[job.index] = {
        id: job.id,
        call_id: job.id,
        name: job.name,
        result: resultText
      };
      if (resultInfo && resultInfo.structured) {
        results[job.index]._structuredResult = true;
      }
      if (resultInfo && resultInfo.mcpResultEnvelope === true) {
        results[job.index]._mcpResultEnvelope = true;
      }
      watch.progressDone(requestId, formatToolLabel(job.toolInfo), String(resultText || '').length + ' chars', job.progressId);
    }
    completed += 1;
    return true;
  }

  function executeJob(job, done) {
    function finishToolCall(error, resultText, resultInfo) {
      if (settleJob(job, error, resultText, resultInfo)) {
        done();
      }
    }

    if (!watch.isCurrentRequest(requestId)) {
      return;
    }
    watch.progressToolStart(requestId, formatToolLabel(job.toolInfo), formatToolCallDetail(job.name, job.args, job.toolInfo), job.progressId);
    try {
      if (job.toolInfo.kind === 'builtin') {
        callBuiltinTool(job.toolInfo, job.args, requestId, finishToolCall);
      } else {
        callMcpTool(job.toolInfo, job.args, requestId, finishToolCall);
      }
    } catch (e) {
      finishToolCall(e && e.message ? e.message : String(e || 'Tool call failed'));
    }
  }

  function reportImmediateError(job) {
    if (job.toolInfo && watch.isCurrentRequest(requestId)) {
      watch.progressToolStart(requestId, formatToolLabel(job.toolInfo), 'invalid arguments', job.progressId);
    }
    settleJob(job, job.error);
  }

  function finishIfComplete() {
    if (!callbackCalled && completed === jobs.length && watch.isCurrentRequest(requestId)) {
      callbackCalled = true;
      callback(results);
    }
  }

  function runIndependentBatch(start, end) {
    var batchIndex = start;
    var active = 0;
    var remaining = end - start;
    var pumping = false;

    function pump() {
      var job;

      if (pumping) {
        return;
      }
      pumping = true;
      while (active < TOOL_READ_CONCURRENCY && batchIndex < end && watch.isCurrentRequest(requestId)) {
        job = jobs[batchIndex];
        batchIndex += 1;
        active += 1;
        executeJob(job, function() {
          active -= 1;
          remaining -= 1;
          if (remaining === 0) {
            next();
          } else {
            pump();
          }
        });
      }
      pumping = false;
    }

    nextIndex = end;
    pump();
  }

  function next() {
    var job;
    var batchEnd;

    if (!watch.isCurrentRequest(requestId)) {
      return;
    }
    if (nextIndex >= jobs.length) {
      finishIfComplete();
      return;
    }

    job = jobs[nextIndex];
    if (job.error) {
      nextIndex += 1;
      reportImmediateError(job);
      next();
      return;
    }

    if (isIndependentReadTool(job.toolInfo)) {
      batchEnd = nextIndex + 1;
      while (batchEnd < jobs.length && !jobs[batchEnd].error && isIndependentReadTool(jobs[batchEnd].toolInfo)) {
        batchEnd += 1;
      }
      runIndependentBatch(nextIndex, batchEnd);
      return;
    }

    nextIndex += 1;
    executeJob(job, next);
  }

  for (i = 0; i < toolCalls.length; i += 1) {
    jobs.push(createJob(toolCalls[i], i));
  }
  next();
}

module.exports = {
  discoverPhoneTools: discoverPhoneTools,
  warmMcpTools: warmMcpTools,
  cancelMcpRequest: cancelMcpRequest,
  runToolCalls: runToolCalls,
  formatToolCallLabel: formatToolCallLabel,
  formatToolWords: formatToolWords
};
