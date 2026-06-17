var Clay = require('@rebble/clay');
var clayConfig = require('./config');
var mcpServersComponent = require('./mcp_servers_component');
function clayCustomFn() {
  var self = this;
  var watchDisplayKeys = [
    'FontSize',
    'BuzzStrength',
    'ScrollLines',
    'TextColor',
    'BackgroundColor',
    'PromptBackgroundColor',
    'BoldTextColor',
    'StartDictationQuickLaunch'
  ];

  self.on(self.EVENTS.AFTER_BUILD, function() {
    var resetButton = self.getItemById('ResetWatchDisplay');
    if (!resetButton) {
      return;
    }

    resetButton.on('click', function() {
      watchDisplayKeys.forEach(function(key) {
        var item = self.getItemByMessageKey(key);
        if (item) {
          item.set(item.config.defaultValue);
        }
      });
    });
  });
}

var clay = new Clay(clayConfig, clayCustomFn, { autoHandleEvents: false });
clay.registerComponent(mcpServersComponent);

var SETTINGS_KEY = 'llm_thing_settings';
var CHUNK_SIZE = 400;
var MAX_RESPONSE_CHARS = 6000;
// Non-NUL style markers are stripped from display and drive watch-side fonts.
var WATCH_BOLD_ON = '\u0001';
var WATCH_BOLD_OFF = '\u0002';
var DEFAULT_MAX_TOOL_CALLS = 4;
var MAX_CHAT_HISTORY_MESSAGES = 16;
var MAX_CHAT_HISTORY_MESSAGE_CHARS = 3000;
var MCP_PROTOCOL_VERSION = '2025-06-18';
var MCP_CLIENT_NAME = 'llm_thing';
var MCP_CLIENT_VERSION = '1.0.0';
var TIMELINE_API_BASE = 'https://timeline-api.getpebble.com/v1/user/pins/';
var HEALTH_SUMMARY_TIMEOUT_MS = 8000;
var MAX_HEALTH_RANGE_SECONDS = 7 * 24 * 60 * 60;
var s_mcp_request_id = 1;
var s_health_summary_request_id = 1;
var s_send_queue = [];
var s_send_busy = false;
var s_chat_history = [];
var s_latest_request_id = 0;
var s_active_xhrs = {};
var s_pending_health_summaries = {};
var s_progress = {
  requestId: 0,
  active: false,
  current: '',
  detail: '',
  toolHistory: [],
  currentTool: '',
  currentToolRemembered: false
};

function logDebug(message) {
  console.log('[llm_thing] ' + message);
}

function requestKey(requestId) {
  return String(requestId || 0);
}

function dictHasRequestId(dict) {
  return dict && dict.RequestId !== undefined && dict.RequestId !== null;
}

function isCurrentRequest(requestId) {
  return Number(requestId) === Number(s_latest_request_id);
}

function isCurrentMessage(dict) {
  return !dictHasRequestId(dict) || isCurrentRequest(dict.RequestId);
}

function abortXhrsForKey(key) {
  var requests = s_active_xhrs[key] || [];
  var i;

  for (i = 0; i < requests.length; i += 1) {
    try {
      requests[i].abort();
    } catch (e) {}
  }

  delete s_active_xhrs[key];
}

function clearPendingHealthSummary(key) {
  var pending = s_pending_health_summaries[key];

  if (!pending) {
    return null;
  }

  if (pending.timeout) {
    clearTimeout(pending.timeout);
  }
  delete s_pending_health_summaries[key];
  return pending;
}

function abortStaleHealthSummaries(requestId) {
  var key;
  var pending;

  for (key in s_pending_health_summaries) {
    if (s_pending_health_summaries.hasOwnProperty(key)) {
      pending = s_pending_health_summaries[key];
      if (Number(pending.requestId) !== Number(requestId)) {
        clearPendingHealthSummary(key);
      }
    }
  }
}

function dropStaleQueuedMessages(requestId) {
  var kept = [];
  var dropped = 0;
  var i;
  var item;

  for (i = 0; i < s_send_queue.length; i += 1) {
    item = s_send_queue[i];
    if (dictHasRequestId(item.dict) && Number(item.dict.RequestId) !== Number(requestId)) {
      dropped += 1;
    } else {
      kept.push(item);
    }
  }

  if (dropped) {
    logDebug('dropped stale queued messages count=' + dropped);
  }

  s_send_queue = kept;
}

function beginRequestLifecycle(requestId) {
  var key;

  s_latest_request_id = requestId;
  for (key in s_active_xhrs) {
    if (s_active_xhrs.hasOwnProperty(key) && key !== requestKey(requestId)) {
      logDebug('aborting stale request id=' + key);
      abortXhrsForKey(key);
    }
  }
  dropStaleQueuedMessages(requestId);
  abortStaleHealthSummaries(requestId);
  if (!s_active_xhrs[requestKey(requestId)]) {
    s_active_xhrs[requestKey(requestId)] = [];
  }
}

function finishRequestLifecycle(requestId) {
  delete s_active_xhrs[requestKey(requestId)];
}

function trackXhr(requestId, request) {
  var key = requestKey(requestId);

  if (!isCurrentRequest(requestId)) {
    try {
      request.abort();
    } catch (e) {}
    return false;
  }

  if (!s_active_xhrs[key]) {
    s_active_xhrs[key] = [];
  }
  s_active_xhrs[key].push(request);
  return true;
}

function untrackXhr(requestId, request) {
  var key = requestKey(requestId);
  var requests = s_active_xhrs[key];
  var i;

  if (!requests) {
    return;
  }

  for (i = requests.length - 1; i >= 0; i -= 1) {
    if (requests[i] === request) {
      requests.splice(i, 1);
      break;
    }
  }
}

function processSendQueue() {
  var item;

  if (s_send_busy || !s_send_queue.length) {
    return;
  }

  item = s_send_queue.shift();
  while (item && !isCurrentMessage(item.dict)) {
    logDebug('skipping stale message request=' + item.dict.RequestId);
    if (!s_send_queue.length) {
      return;
    }
    item = s_send_queue.shift();
  }

  s_send_busy = true;
  Pebble.sendAppMessage(item.dict, function() {
    s_send_busy = false;
    if (item.onSuccess) {
      item.onSuccess();
    }
    processSendQueue();
  }, function(e) {
    s_send_busy = false;
    logDebug('sendAppMessage failed: ' + JSON.stringify(e));
    if (item.onFailure) {
      item.onFailure(e);
    }
    processSendQueue();
  });
}

var DEFAULT_SETTINGS = {
  Endpoint: 'https://api.openai.com/v1/responses',
  ApiKey: '',
  Model: 'gpt-4.1-mini',
  SystemPrompt: 'You are a helpful assistant. Keep answers concise for a watch screen. Use Markdown bold when useful, but do not use italics or strikethrough.',
  ShowThinking: false,
  WebSearchEnabled: false,
  GeolocationToolEnabled: false,
  TimelineToolEnabled: false,
  HealthToolEnabled: false,
  MaxToolCalls: DEFAULT_MAX_TOOL_CALLS,
  FontSize: 18,
  BuzzStrength: 1,
  ScrollLines: 3,
  StartDictationQuickLaunch: false,
  TextColor: 0x000000,
  BackgroundColor: 0xFFFFFF,
  PromptBackgroundColor: 0xAAAAAA,
  BoldTextColor: 0x000000,
  McpServersJson: '[]'
};

function clampNumber(value, min, max, fallback) {
  var number = parseInt(value, 10);

  if (isNaN(number)) {
    return fallback;
  }

  if (number < min) {
    return min;
  }

  if (number > max) {
    return max;
  }

  return number;
}

function minNumber(value, min, fallback) {
  var number = parseInt(value, 10);

  if (isNaN(number)) {
    return fallback;
  }

  if (number < min) {
    return min;
  }

  return number;
}

function extend(base, extra) {
  var result = {};
  var key;
  var value;

  for (key in base) {
    if (base.hasOwnProperty(key)) {
      result[key] = base[key];
    }
  }

  if (extra) {
    for (key in extra) {
      if (extra.hasOwnProperty(key) && extra[key] !== undefined && extra[key] !== null) {
        value = extra[key];
        if (typeof value === 'object' && value.hasOwnProperty('value')) {
          value = value.value;
        }
        if (value !== '[object Object]') {
          result[key] = value;
        }
      }
    }
  }

  result.ShowThinking = result.ShowThinking === true || result.ShowThinking === 1 || result.ShowThinking === '1';
  result.WebSearchEnabled = result.WebSearchEnabled === true || result.WebSearchEnabled === 1 || result.WebSearchEnabled === '1';
  result.GeolocationToolEnabled = result.GeolocationToolEnabled === true || result.GeolocationToolEnabled === 1 || result.GeolocationToolEnabled === '1';
  result.TimelineToolEnabled = result.TimelineToolEnabled === true || result.TimelineToolEnabled === 1 || result.TimelineToolEnabled === '1';
  result.HealthToolEnabled = result.HealthToolEnabled === true || result.HealthToolEnabled === 1 || result.HealthToolEnabled === '1';
  result.StartDictationQuickLaunch = result.StartDictationQuickLaunch === true || result.StartDictationQuickLaunch === 1 || result.StartDictationQuickLaunch === '1';
  result.MaxToolCalls = minNumber(result.MaxToolCalls, 0, DEFAULT_MAX_TOOL_CALLS);
  result.FontSize = clampNumber(result.FontSize, 14, 28, 18);
  if (result.FontSize !== 14 && result.FontSize !== 18 && result.FontSize !== 24 && result.FontSize !== 28) {
    result.FontSize = 18;
  }
  result.BuzzStrength = clampNumber(result.BuzzStrength, 0, 3, 1);
  result.ScrollLines = clampNumber(result.ScrollLines, 1, 10, 3);
  return result;
}

function loadSettings() {
  try {
    return extend(DEFAULT_SETTINGS, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
  } catch (e) {
    return extend(DEFAULT_SETTINGS, null);
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(extend(DEFAULT_SETTINGS, settings)));
}

function syncWatchSettings(settings) {
  sendMessage({
    FontSize: settings.FontSize,
    BuzzStrength: settings.BuzzStrength,
    ScrollLines: settings.ScrollLines,
    StartDictationQuickLaunch: settings.StartDictationQuickLaunch ? 1 : 0,
    TextColor: settings.TextColor,
    BackgroundColor: settings.BackgroundColor,
    PromptBackgroundColor: settings.PromptBackgroundColor,
    BoldTextColor: settings.BoldTextColor
  });
}

function sendMessage(dict, onSuccess, onFailure) {
  if (!isCurrentMessage(dict)) {
    logDebug('dropping stale message request=' + dict.RequestId);
    return;
  }

  s_send_queue.push({
    dict: dict,
    onSuccess: onSuccess,
    onFailure: onFailure
  });
  processSendQueue();
}

function sendReset(requestId, onSuccess) {
  sendMessage({ ResponseReset: 1, RequestId: requestId }, onSuccess);
}

function sendWatchText(requestId, text, includeDone, onDone) {
  var i = 0;
  var value = String(text || '').substring(0, MAX_RESPONSE_CHARS);

  function finish() {
    if (includeDone) {
      sendMessage({ ResponseDone: 1, RequestId: requestId }, onDone);
    } else if (onDone) {
      onDone();
    }
  }

  function sendNext() {
    if (i >= value.length) {
      finish();
      return;
    }

    sendMessage({
      ResponseChunk: value.substring(i, i + CHUNK_SIZE),
      RequestId: requestId
    }, function() {
      i += CHUNK_SIZE;
      sendNext();
    });
  }

  sendReset(requestId, sendNext);
}

function maxResponseCharsForFontSize(settings) {
  var fontSize = parseInt(settings && settings.FontSize, 10);

  if (fontSize >= 28) {
    return 2400;
  }
  if (fontSize >= 24) {
    return 3200;
  }

  return MAX_RESPONSE_CHARS;
}

function truncateResponseForWatch(text, limit) {
  var value = String(text || '');
  var suffix = '\n\n[Truncated]';

  if (value.length <= limit) {
    return value;
  }
  if (limit <= suffix.length) {
    return value.substring(0, limit);
  }

  return value.substring(0, limit - suffix.length) + suffix;
}

function formatMarkdownBoldForWatch(text, maxLength) {
  var value = String(text || '');
  var output = '';
  var i = 0;
  var close;
  var ch;

  function appendChar(value) {
    if (output.length >= maxLength) {
      return false;
    }
    if (value !== WATCH_BOLD_ON && value !== WATCH_BOLD_OFF) {
      output += value;
    }
    return true;
  }

  while (i < value.length && output.length < maxLength) {
    if (value.substring(i, i + 2) === '**') {
      close = value.indexOf('**', i + 2);
      if (close !== -1) {
        if (output.length + 2 > maxLength) {
          break;
        }

        output += WATCH_BOLD_ON;
        i += 2;
        while (i < close && output.length < maxLength - 1) {
          appendChar(value.charAt(i));
          i += 1;
        }
        output += WATCH_BOLD_OFF;
        i = close + 2;
        continue;
      }
    }

    ch = value.charAt(i);
    appendChar(ch);
    i += 1;
  }

  return output;
}

function formatProgressHistory(items) {
  var groups = [];
  var text = '';
  var candidate;
  var i;
  var label;
  var group;
  var suffix;
  var line;

  for (i = 0; i < items.length; i += 1) {
    label = String(items[i] || '');
    if (!label) {
      continue;
    }

    group = groups.length ? groups[groups.length - 1] : null;
    if (group && group.label === label) {
      group.count += 1;
    } else {
      groups.push({ label: label, count: 1 });
    }
  }

  for (i = groups.length - 1; i >= 0; i -= 1) {
    suffix = groups[i].count > 1 ? ' ' + groups[i].count + 'x' : '';
    line = truncate(groups[i].label, 48 - suffix.length) + suffix;
    candidate = line + (text ? '\n' + text : '');
    if (candidate.length > 240) {
      break;
    }
    text = candidate;
  }

  return text;
}

function sendProgressState(requestId, current, detail, reset, onDone) {
  var dict = {
    RequestId: requestId,
    ProgressText: truncate(current || 'thinking', 80),
    ProgressDetail: truncate(detail || '', 160),
    ProgressHistory: formatProgressHistory(s_progress.toolHistory)
  };

  if (reset) {
    dict.ProgressReset = 1;
  }

  sendMessage(dict, onDone);
}

function progressStart(requestId, current, detail) {
  s_progress.requestId = requestId;
  s_progress.active = true;
  s_progress.current = current || 'thinking';
  s_progress.detail = detail || '';
  s_progress.toolHistory = [];
  s_progress.currentTool = '';
  s_progress.currentToolRemembered = false;
  sendProgressState(requestId, s_progress.current, s_progress.detail, true);
}

function progressToolStart(requestId, current, detail) {
  if (!s_progress.active || s_progress.requestId !== requestId) {
    progressStart(requestId, current, detail);
  }

  s_progress.currentTool = current || 'thinking';
  s_progress.currentToolRemembered = false;
  progressSet(requestId, current, detail);
}

function progressSet(requestId, current, detail) {
  current = current || 'thinking';
  detail = detail || '';

  if (!s_progress.active || s_progress.requestId !== requestId) {
    progressStart(requestId, current, detail);
    return;
  }

  if (s_progress.current === current && s_progress.detail === detail) {
    return;
  }

  s_progress.current = current;
  s_progress.detail = detail;
  sendProgressState(requestId, s_progress.current, s_progress.detail, false);
}

function progressDone(requestId) {
  var toolName;

  if (!s_progress.active || s_progress.requestId !== requestId) {
    return;
  }

  toolName = s_progress.currentTool;
  if (toolName && !s_progress.currentToolRemembered) {
    s_progress.toolHistory.push(toolName);
    s_progress.currentToolRemembered = true;
  }
}

function progressStop(requestId) {
  if (s_progress.requestId !== requestId) {
    return;
  }

  s_progress.active = false;
  s_progress.current = '';
  s_progress.detail = '';
  s_progress.toolHistory = [];
  s_progress.currentTool = '';
  s_progress.currentToolRemembered = false;
}

function sendError(requestId, message) {
  progressStop(requestId);
  logDebug('watch error request=' + requestId + ' message=' + String(message).substring(0, 160));
  sendReset(requestId, function() {
    sendMessage({ ResponseError: String(message).substring(0, CHUNK_SIZE), RequestId: requestId });
  });
}

function sendResponse(requestId, settings, text, onDone) {
  var limit = maxResponseCharsForFontSize(settings);
  var value = formatMarkdownBoldForWatch(truncateResponseForWatch(text, limit), MAX_RESPONSE_CHARS);

  progressStop(requestId);
  logDebug('send response request=' + requestId + ' chars=' + value.length + ' limit=' + limit);
  sendWatchText(requestId, value, true, onDone);
}

function trim(value) {
  return String(value || '').replace(/^\s+|\s+$/g, '');
}

function splitCsv(value) {
  var items = String(value || '').split(',');
  var result = [];
  var item;
  var i;

  for (i = 0; i < items.length; i += 1) {
    item = trim(items[i]);
    if (item) {
      result.push(item);
    }
  }

  return result;
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch (e) {
    return 'null';
  }
}

function truncate(value, maxLength) {
  value = String(value || '');
  if (value.length <= maxLength) {
    return value;
  }

  return value.substring(0, maxLength - 3) + '...';
}

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
    return truncate(value, maxLength);
  }

  if (Object.prototype.toString.call(value) === '[object Array]') {
    for (i = 0; i < value.length; i += 1) {
      if (hasToolArgValue(value[i])) {
        parts.push(summarizeToolArgValue(value[i], 40));
      }
    }
    return truncate(parts.join(', '), maxLength);
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
    return truncate(safeJson(value), maxLength);
  }

  return truncate(String(value), maxLength);
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
    return hasOwnToolArgs(args) ? truncate(safeJson(args), 100) : 'no arguments';
  }

  return parts.join(', ');
}

function formatToolWords(value) {
  var words = trim(value).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').split(' ');
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
  var value = trim(text);
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
      data += trim(lines[i].substring(5));
    }
  }

  if (!data || data === '[DONE]') {
    return null;
  }

  return JSON.parse(data);
}

function slugify(value) {
  var slug = trim(value).replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return slug || 'tool';
}

function authHeader(value) {
  var header = trim(value);

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
    name = trim(header.name);
    headerValue = trim(String(header.value || '').replace(/[\r\n]+/g, ' '));
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
        displayLabel: trim(server.label),
        label: slugify(server.label),
        url: trim(server.url),
        description: trim(server.description),
        allowedTools: splitCsv(server.allowedTools),
        authorization: trim(server.authorization),
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
      logDebug('mcp custom header skipped server=' + server.label + ' name=' + headers[i].name);
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

  if (!trackXhr(requestId, request)) {
    return;
  }

  logDebug('mcp request server=' + server.label + ' method=' + method + ' id=' + (payload.id || 'notification'));

  request.onload = function() {
    var json;
    var sessionId;

    untrackXhr(requestId, request);
    if (!isCurrentRequest(requestId)) {
      return;
    }

    logDebug('mcp response server=' + server.label + ' method=' + method + ' status=' + request.status + ' bytes=' + String(request.responseText || '').length);

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

    if (!expectBody || !trim(request.responseText)) {
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
      callback(json.error.message || safeJson(json.error));
      return;
    }

    callback(null, json.result || {});
  };

  request.onerror = function() {
    untrackXhr(requestId, request);
    if (!isCurrentRequest(requestId)) {
      return;
    }
    logDebug('mcp network error server=' + server.label + ' method=' + method);
    callback('MCP network error');
  };

  request.ontimeout = function() {
    untrackXhr(requestId, request);
    if (!isCurrentRequest(requestId)) {
      return;
    }
    logDebug('mcp timeout server=' + server.label + ' method=' + method);
    callback('MCP request timed out');
  };

  request.onabort = function() {
    untrackXhr(requestId, request);
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

function collectTextFromContent(content) {
  var text = '';
  var i;

  if (typeof content === 'string') {
    return content;
  }

  if (!content) {
    return '';
  }

  if (content.text) {
    return String(content.text);
  }

  if (content.output_text) {
    return String(content.output_text);
  }

  if (content.content) {
    return collectTextFromContent(content.content);
  }

  if (!content.length) {
    return '';
  }

  for (i = 0; i < content.length; i += 1) {
    if (typeof content[i] === 'string') {
      text += content[i];
    } else if (content[i].text) {
      text += content[i].text;
    } else if (content[i].content) {
      text += collectTextFromContent(content[i].content);
    }
  }

  return text;
}

function getChoiceMessage(json) {
  if (json.choices && json.choices.length && json.choices[0].message) {
    return json.choices[0].message;
  }

  return null;
}

function getFinishReason(json) {
  if (json.choices && json.choices.length) {
    return json.choices[0].finish_reason || '';
  }

  return '';
}

function summarizeResponseShape(json) {
  var message = getChoiceMessage(json);
  var content = message ? message.content : null;
  var contentType = content === null ? 'null' : typeof content;
  var contentLength = typeof content === 'string' ? content.length : (content && content.length ? content.length : 0);
  var reasoningLength = message && message.reasoning_content ? String(message.reasoning_content).length : 0;

  return 'finish=' + getFinishReason(json) + ' contentType=' + contentType + ' contentLen=' + contentLength + ' reasoningLen=' + reasoningLength;
}

function formatMcpToolResult(result) {
  var text = collectTextFromContent(result && result.content);

  if (text) {
    return text;
  }

  return safeJson(result || {});
}

function discoverMcpTools(settings, requestId, callback) {
  var servers = parseMcpServers(settings);
  var tools = [];
  var toolMap = {};
  var usedNames = {};
  var remaining = servers.length;

  logDebug('mcp discover start servers=' + servers.length);

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
        description: trim(tool.description || server.description || 'MCP tool'),
        parameters: tool.inputSchema || { type: 'object', properties: {} }
      });
      toolMap[exposedName] = {
        kind: 'mcp',
        server: server,
        toolName: tool.name
      };
      logDebug('mcp tool exposed=' + exposedName + ' original=' + tool.name + ' server=' + server.label);
    }
  }

  if (!remaining) {
    callback(null, tools, toolMap);
    return;
  }

  servers.forEach(function(server) {
    initializeMcpServer(server, requestId, function(initError) {
      if (!isCurrentRequest(requestId)) {
        return;
      }
      if (initError) {
        logDebug('mcp initialize failed server=' + server.label + ' error=' + initError);
        finishOne();
        return;
      }

      logDebug('mcp initialized server=' + server.label);

      mcpJsonRpc(server, 'tools/list', {}, true, requestId, function(listError, result) {
        if (!isCurrentRequest(requestId)) {
          return;
        }
        if (listError) {
          logDebug('mcp tools/list failed server=' + server.label + ' error=' + listError);
        } else {
          addTools(server, result);
          logDebug('mcp tools/list ok server=' + server.label + ' count=' + (((result && result.tools) || []).length));
        }
        finishOne();
      });
    });
  });
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
  if (!isCurrentRequest(requestId)) {
    return;
  }
  if (typeof navigator === 'undefined' || !navigator.geolocation || !navigator.geolocation.getCurrentPosition) {
    callback('Geolocation unavailable');
    return;
  }

  options = {
    enableHighAccuracy: boolArg(args.enableHighAccuracy, false),
    timeout: clampNumber(args.timeoutMs, 1000, 60000, 10000),
    maximumAge: clampNumber(args.maximumAgeMs, 0, 3600000, 300000)
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

    if (isCurrentRequest(requestId)) {
      callback(null, safeJson(result));
    }
  }, function(error) {
    if (!isCurrentRequest(requestId)) {
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

  pin.id = trim(pin.id);
  if (!pin.id) {
    return 'Pin id is required';
  }
  if (pin.id.length > 64) {
    return 'Pin id must be 64 characters or fewer';
  }
  if (!trim(pin.time)) {
    return 'Pin time is required';
  }
  if (!pin.layout || typeof pin.layout !== 'object') {
    return 'Pin layout is required';
  }
  if (!trim(pin.layout.type)) {
    return 'Pin layout.type is required';
  }

  return '';
}

function timelinePinRequest(method, id, pin, requestId, callback) {
  getTimelineToken(function(tokenError, token) {
    var request;

    if (!isCurrentRequest(requestId)) {
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

    if (!trackXhr(requestId, request)) {
      return;
    }

    request.onload = function() {
      var responseText = String(request.responseText || '');

      untrackXhr(requestId, request);
      if (!isCurrentRequest(requestId)) {
        return;
      }

      if (request.status < 200 || request.status >= 300) {
        callback('Timeline HTTP ' + request.status + ': ' + responseText.substring(0, 180));
        return;
      }

      callback(null, safeJson({
        ok: true,
        action: method === 'DELETE' ? 'deleted' : 'created_or_updated',
        id: id,
        note: 'Timeline pins may take up to 15 minutes to appear on the watch.'
      }));
    };

    request.onerror = function() {
      untrackXhr(requestId, request);
      if (!isCurrentRequest(requestId)) {
        return;
      }
      callback('Timeline network error');
    };

    request.ontimeout = function() {
      untrackXhr(requestId, request);
      if (!isCurrentRequest(requestId)) {
        return;
      }
      callback('Timeline request timed out');
    };

    request.onabort = function() {
      untrackXhr(requestId, request);
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
    return trim(args.id);
  }
  if (args.pinId !== undefined) {
    return trim(args.pinId);
  }
  if (args.pin_id !== undefined) {
    return trim(args.pin_id);
  }
  if (args.pin && args.pin.id !== undefined) {
    return trim(args.pin.id);
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

  text = trim(value);
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
  range = trim(args.range || args.timeRange || 'today').toLowerCase().replace(/[-\s]+/g, '_');

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

function handleHealthSummaryResponse(dict) {
  var key = String(dict.HealthSummaryRequest || 0);
  var pending = clearPendingHealthSummary(key);
  var callback;

  if (!pending) {
    logDebug('unexpected health summary response token=' + key);
    return;
  }

  callback = pending.callback;
  if (dictHasRequestId(dict) && Number(dict.RequestId) !== Number(pending.requestId)) {
    return;
  }
  if (!isCurrentRequest(pending.requestId)) {
    return;
  }

  if (dict.HealthSummaryError !== undefined && dict.HealthSummaryError !== null && String(dict.HealthSummaryError)) {
    callback(String(dict.HealthSummaryError));
    return;
  }
  if (dict.HealthSummaryJson !== undefined && dict.HealthSummaryJson !== null) {
    callback(null, String(dict.HealthSummaryJson));
    return;
  }

  callback('Health summary response missing data');
}

function callHealthSummaryBuiltin(args, requestId, callback) {
  var range = buildHealthSummaryWindow(args);
  var healthRequestId;
  var key;
  var dict;

  if (range.error) {
    callback(range.error);
    return;
  }
  if (!Pebble.sendAppMessage) {
    callback('Health summary requires AppMessage');
    return;
  }
  if (!isCurrentRequest(requestId)) {
    return;
  }

  healthRequestId = s_health_summary_request_id;
  s_health_summary_request_id += 1;
  if (s_health_summary_request_id > 2147480000) {
    s_health_summary_request_id = 1;
  }

  key = String(healthRequestId);
  s_pending_health_summaries[key] = {
    requestId: requestId,
    callback: callback,
    timeout: setTimeout(function() {
      var pending = clearPendingHealthSummary(key);
      if (pending && isCurrentRequest(pending.requestId)) {
        pending.callback('Health summary request timed out');
      }
    }, HEALTH_SUMMARY_TIMEOUT_MS)
  };

  dict = {
    RequestId: requestId,
    HealthSummaryRequest: healthRequestId,
    HealthStartUnix: range.startUnix,
    HealthEndUnix: range.endUnix,
    HealthIncludeHeartRate: range.includeHeartRate ? 1 : 0
  };

  logDebug('health summary request token=' + healthRequestId + ' start=' + range.startUnix + ' end=' + range.endUnix + ' hr=' + (range.includeHeartRate ? 1 : 0));
  sendMessage(dict, null, function(e) {
    var pending = clearPendingHealthSummary(key);
    if (pending && isCurrentRequest(pending.requestId)) {
      pending.callback('Health summary send failed: ' + ((e && (e.error || e.message)) || 'AppMessage failed'));
    }
  });
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
  logDebug('builtin tool exposed=' + exposedName);
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
    if (!isCurrentRequest(requestId)) {
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
  logDebug('mcp tool call server=' + toolInfo.server.label + ' tool=' + toolInfo.toolName + ' args=' + safeJson(args).substring(0, 240));
  mcpJsonRpc(toolInfo.server, 'tools/call', {
    name: toolInfo.toolName,
    arguments: args || {}
  }, true, requestId, function(error, result) {
    if (!isCurrentRequest(requestId)) {
      return;
    }
    if (error) {
      logDebug('mcp tool error server=' + toolInfo.server.label + ' tool=' + toolInfo.toolName + ' error=' + error);
      callback(error);
      return;
    }

    logDebug('mcp tool result server=' + toolInfo.server.label + ' tool=' + toolInfo.toolName + ' chars=' + formatMcpToolResult(result).length);
    callback(null, formatMcpToolResult(result));
  });
}

function callBuiltinTool(toolInfo, args, requestId, callback) {
  logDebug('builtin tool call name=' + toolInfo.name + ' args=' + safeJson(args).substring(0, 240));
  toolInfo.call(args, requestId, function(error, resultText) {
    if (!isCurrentRequest(requestId)) {
      return;
    }
    if (error) {
      logDebug('builtin tool error name=' + toolInfo.name + ' error=' + error);
      callback(error);
      return;
    }

    logDebug('builtin tool result name=' + toolInfo.name + ' chars=' + String(resultText || '').length);
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

    if (!isCurrentRequest(requestId)) {
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
      progressDone(requestId, String(name || 'unknown'), 'unknown tool');
      results.push({
        id: call.id || name || String(index),
        name: name || 'unknown',
        error: 'Unknown or unavailable tool'
      });
      next();
      return;
    }

    function finishToolCall(error, resultText) {
      if (!isCurrentRequest(requestId)) {
        return;
      }
      if (error) {
        progressDone(requestId, formatToolLabel(toolInfo), 'error: ' + truncate(error, 90));
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
        progressDone(requestId, formatToolLabel(toolInfo), String(resultText || '').length + ' chars');
      }
      next();
    }

    progressToolStart(requestId, formatToolLabel(toolInfo), summarizeToolArgs(args));
    if (toolInfo.kind === 'builtin') {
      callBuiltinTool(toolInfo, args, requestId, finishToolCall);
    } else {
      callMcpTool(toolInfo, args, requestId, finishToolCall);
    }
  }

  next();
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

function expandSystemPromptVariables(prompt) {
  return String(prompt || '').replace(/\$DATETIME/g, formatDateTime(new Date()));
}

function buildToolInstructions(tools, maxToolCalls) {
  var text;
  var i;

  if (!tools.length || maxToolCalls <= 0) {
    return '';
  }

  text = '\n\nPhone-side tools are available. If a tool is needed, respond with only JSON in this exact shape:' +
    '\n{"tool_calls":[{"id":"call_1","name":"tool_name","arguments":{}}]}' +
    '\nDo not include markdown, explanation, or final answer with tool call JSON. After tool results are provided, answer the user normally or request more tools with the same JSON shape.' +
    '\nOnly tools listed here are enabled in app settings.' +
    '\nYou may use at most ' + maxToolCalls + ' tool call(s) total for this request.' +
    '\nAvailable tools:';

  for (i = 0; i < tools.length; i += 1) {
    text += '\n- ' + tools[i].name + ': ' + tools[i].description + '\n  Parameters JSON Schema: ' + safeJson(tools[i].parameters);
  }

  return text;
}

function buildSystemPrompt(settings, toolInstructions) {
  var prompt = expandSystemPromptVariables(settings.SystemPrompt);

  if (settings.WebSearchEnabled) {
    prompt += '\nIf web search is available to you, use it when useful and cite sources briefly.';
  }

  return prompt + (toolInstructions || '');
}

function isChatEndpoint(settings) {
  return String(settings.Endpoint || '').toLowerCase().indexOf('/chat/completions') !== -1;
}

function buildConversation(settings, userText, toolInstructions) {
  var conversation = [
    { role: 'system', content: buildSystemPrompt(settings, toolInstructions) }
  ];
  var i;

  for (i = 0; i < s_chat_history.length; i += 1) {
    conversation.push(s_chat_history[i]);
  }

  conversation.push({ role: 'user', content: userText });
  return conversation;
}

function rememberChatTurn(userText, assistantText) {
  s_chat_history.push({
    role: 'user',
    content: truncate(userText, MAX_CHAT_HISTORY_MESSAGE_CHARS)
  });
  s_chat_history.push({
    role: 'assistant',
    content: truncate(assistantText, MAX_CHAT_HISTORY_MESSAGE_CHARS)
  });

  while (s_chat_history.length > MAX_CHAT_HISTORY_MESSAGES) {
    s_chat_history.splice(0, 2);
  }
}

function resetChatHistory() {
  s_chat_history = [];
}

function buildBody(settings, conversation) {
  if (isChatEndpoint(settings)) {
    return {
      model: settings.Model,
      messages: conversation
    };
  }

  return {
    model: settings.Model,
    input: conversation
  };
}

function requestModel(settings, conversation, requestId, callback) {
  var request = new XMLHttpRequest();
  var body = JSON.stringify(buildBody(settings, conversation));

  logDebug('llm request endpoint=' + settings.Endpoint + ' model=' + settings.Model + ' mode=' + (isChatEndpoint(settings) ? 'chat' : 'responses') + ' messages=' + conversation.length + ' bytes=' + body.length);

  request.open('POST', settings.Endpoint, true);
  request.setRequestHeader('Content-Type', 'application/json');
  request.setRequestHeader('Authorization', 'Bearer ' + settings.ApiKey);
  request.timeout = 60000;

  if (!trackXhr(requestId, request)) {
    return;
  }

  request.onload = function() {
    var json;

    untrackXhr(requestId, request);
    if (!isCurrentRequest(requestId)) {
      return;
    }

    logDebug('llm response status=' + request.status + ' bytes=' + String(request.responseText || '').length);

    if (request.status < 200 || request.status >= 300) {
      callback('HTTP ' + request.status + ': ' + String(request.responseText || '').substring(0, 250));
      return;
    }

    try {
      json = JSON.parse(request.responseText);
    } catch (e) {
      callback('Bad JSON response');
      return;
    }

    callback(null, json);
  };

  request.onerror = function() {
    untrackXhr(requestId, request);
    if (!isCurrentRequest(requestId)) {
      return;
    }
    logDebug('llm network error');
    callback('Network error');
  };

  request.ontimeout = function() {
    untrackXhr(requestId, request);
    if (!isCurrentRequest(requestId)) {
      return;
    }
    logDebug('llm timeout');
    callback('Request timed out');
  };

  request.onabort = function() {
    untrackXhr(requestId, request);
  };

  request.send(body);
}

function extractResponseText(json) {
  var answer = '';
  var i;
  var j;
  var item;
  var content;
  var hasOutputText = !!json.output_text;
  var message;

  if (hasOutputText) {
    answer = json.output_text;
  }

  message = getChoiceMessage(json);
  if (message) {
    answer = answer || collectTextFromContent(message.content);
    answer = answer || collectTextFromContent(message.output_text);
    answer = answer || collectTextFromContent(message.text);
    answer = answer || collectTextFromContent(message.reasoning_content);
  }

  if (json.output && json.output.length) {
    for (i = 0; i < json.output.length; i += 1) {
      item = json.output[i];
      if (item.content && item.content.length) {
        for (j = 0; j < item.content.length; j += 1) {
          content = item.content[j];
          if (!hasOutputText && (content.type === 'output_text' || content.type === 'text')) {
            answer += content.text || '';
          }
        }
      }
    }
  }

  return answer;
}

function stripThinking(text) {
  return String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^\s+/, '');
}

function parseResponse(json, showThinking) {
  var answer = extractResponseText(json);
  var thinking = '';
  var i;
  var item;

  if (getChoiceMessage(json)) {
    thinking = thinking || getChoiceMessage(json).reasoning_content || getChoiceMessage(json).reasoning || '';
  }

  if (json.output && json.output.length) {
    for (i = 0; i < json.output.length; i += 1) {
      item = json.output[i];
      if (item.type === 'reasoning' || item.reasoning) {
        thinking += collectTextFromContent(item.summary || item.content || item.reasoning);
      }
    }
  }

  answer = answer || ('No response text. ' + summarizeResponseShape(json));

  if (!showThinking) {
    return stripThinking(answer);
  }

  if (!thinking) {
    return answer;
  }

  return 'Thinking:\n' + thinking + '\n\nAnswer:\n' + stripThinking(answer);
}

function stripCodeFence(text) {
  var value = trim(text);
  var match = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  if (match) {
    return trim(match[1]);
  }

  return value;
}

function parseToolCalls(text) {
  var value = stripCodeFence(text);
  var parsed;
  var start;
  var end;

  try {
    parsed = JSON.parse(value);
  } catch (e) {
    start = value.indexOf('{');
    end = value.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      return [];
    }
    try {
      parsed = JSON.parse(value.substring(start, end + 1));
    } catch (e2) {
      return [];
    }
  }

  if (parsed && parsed.tool_calls && parsed.tool_calls.length) {
    return parsed.tool_calls;
  }

  if (parsed && parsed.name) {
    return [parsed];
  }

  return [];
}

function buildToolCapNotice(skippedCount) {
  var text = 'Tool call budget exhausted for this request. No more tool calls are available.';
  if (skippedCount > 0) {
    text += ' ' + skippedCount + ' requested tool call(s) were not run.';
  }
  return text +
    '\nDo not output tool_calls JSON.' +
    '\nWrite the final answer now using only the original request, prior conversation, and tool results already provided.' +
    '\nIf you needed more tool calls, start with a brief caveat that you are out of tool calls.';
}
function appendToolResults(conversation, assistantText, results, noMoreTools, skippedCount) {
  var content = 'Tool results:\n' + safeJson(results);
  if (noMoreTools) {
    content += '\n' + buildToolCapNotice(skippedCount);
  } else {
    content += '\nUse these results to answer the original request. If another tool is needed, respond only with the same tool_calls JSON shape.';
  }
  conversation.push({
    role: 'assistant',
    content: assistantText
  });
  conversation.push({
    role: 'user',
    content: content
  });
}
function requestFinalAfterToolCap(requestId, settings, conversation, callback) {
  progressSet(requestId, 'thinking', 'tool call limit reached');
  requestModel(settings, conversation, requestId, function(error, json) {
    var assistantText;
    if (!isCurrentRequest(requestId)) {
      return;
    }
    if (error) {
      callback(error);
      return;
    }
    assistantText = extractResponseText(json);
    if (parseToolCalls(assistantText).length) {
      callback(null, 'I am out of tool calls, and the model requested another tool instead of producing a final answer. I can only answer from information already gathered.');
      return;
    }
    callback(null, parseResponse(json, settings.ShowThinking));
  });
}

function completeWithTools(requestId, settings, conversation, toolMap, round, usedToolCalls, callback) {
  logDebug('tool loop round=' + round + ' availableTools=' + Object.keys(toolMap).length + ' usedToolCalls=' + usedToolCalls + ' maxToolCalls=' + settings.MaxToolCalls);
  progressSet(requestId, 'thinking', round === 0 ? '' : 'with tool results');
  requestModel(settings, conversation, requestId, function(error, json) {
    var assistantText;
    var toolCalls;
    var remainingToolCalls;
    var noMoreTools;
    var skippedCount;

    if (!isCurrentRequest(requestId)) {
      return;
    }
    if (error) {
      callback(error);
      return;
    }

    assistantText = extractResponseText(json);
    toolCalls = parseToolCalls(assistantText);
    logDebug('llm response shape ' + summarizeResponseShape(json));
    logDebug('tool loop model textChars=' + assistantText.length + ' toolCalls=' + toolCalls.length);

    if (!toolCalls.length) {
      callback(null, parseResponse(json, settings.ShowThinking));
      return;
    }

    remainingToolCalls = settings.MaxToolCalls - usedToolCalls;
    if (remainingToolCalls <= 0) {
      conversation.push({
        role: 'assistant',
        content: assistantText
      });
      conversation.push({
        role: 'user',
        content: buildToolCapNotice(toolCalls.length)
      });
      requestFinalAfterToolCap(requestId, settings, conversation, callback);
      return;
    }
    noMoreTools = toolCalls.length >= remainingToolCalls;
    skippedCount = 0;
    if (toolCalls.length > remainingToolCalls) {
      skippedCount = toolCalls.length - remainingToolCalls;
      logDebug('tool loop truncating toolCalls=' + toolCalls.length + ' remaining=' + remainingToolCalls);
      toolCalls = toolCalls.slice(0, remainingToolCalls);
    }
    runToolCalls(requestId, toolCalls, toolMap, function(results) {
      if (!isCurrentRequest(requestId)) {
        return;
      }
      logDebug('tool loop results=' + results.length);
      appendToolResults(conversation, assistantText, results, noMoreTools, skippedCount);
      if (noMoreTools) {
        requestFinalAfterToolCap(requestId, settings, conversation, callback);
        return;
      }
      completeWithTools(requestId, settings, conversation, toolMap, round + 1, usedToolCalls + toolCalls.length, callback);
    });
  });
}

function requestCompletion(requestId, userText) {
  var settings = loadSettings();
  var conversation;

  logDebug('request start id=' + requestId + ' textChars=' + String(userText || '').length + ' endpoint=' + settings.Endpoint + ' model=' + settings.Model + ' maxToolCalls=' + settings.MaxToolCalls + ' geoTool=' + settings.GeolocationToolEnabled + ' timelineTool=' + settings.TimelineToolEnabled + ' healthTool=' + settings.HealthToolEnabled + ' history=' + s_chat_history.length);
  beginRequestLifecycle(requestId);
  syncWatchSettings(settings);
  progressStart(requestId, 'thinking', '');

  if (!settings.Endpoint) {
    sendError(requestId, 'Endpoint missing. Open settings on phone.');
    finishRequestLifecycle(requestId);
    return;
  }

  if (!settings.ApiKey) {
    sendError(requestId, 'API key missing. Open settings on phone.');
    finishRequestLifecycle(requestId);
    return;
  }

  if (settings.MaxToolCalls <= 0) {
    logDebug('tools disabled maxToolCalls=0');
    conversation = buildConversation(settings, userText, '');
    completeWithTools(requestId, settings, conversation, {}, 0, 0, function(completionError, text) {
      if (!isCurrentRequest(requestId)) {
        return;
      }
      if (completionError) {
        sendError(requestId, completionError);
        finishRequestLifecycle(requestId);
        return;
      }

      sendResponse(requestId, settings, text, function() {
        if (requestId === s_latest_request_id) {
          rememberChatTurn(userText, text);
        }
        finishRequestLifecycle(requestId);
      });
    });
    return;
  }

  progressSet(requestId, 'Loading tools', 'discovering phone tools');
  discoverPhoneTools(settings, requestId, function(error, tools, toolMap) {
    if (!isCurrentRequest(requestId)) {
      return;
    }
    if (error) {
      sendError(requestId, error);
      finishRequestLifecycle(requestId);
      return;
    }

    conversation = buildConversation(settings, userText, buildToolInstructions(tools, settings.MaxToolCalls));
    logDebug('tools discover done tools=' + tools.length);
    progressDone(requestId, 'Tools loaded', tools.length + ' tools');
    completeWithTools(requestId, settings, conversation, toolMap, 0, 0, function(completionError, text) {
      if (!isCurrentRequest(requestId)) {
        return;
      }
      if (completionError) {
        sendError(requestId, completionError);
        finishRequestLifecycle(requestId);
        return;
      }

      sendResponse(requestId, settings, text, function() {
        if (requestId === s_latest_request_id) {
          rememberChatTurn(userText, text);
        }
        finishRequestLifecycle(requestId);
      });
    });
  });
}

Pebble.addEventListener('ready', function() {
  logDebug('ready');
  resetChatHistory();
  syncWatchSettings(loadSettings());
});

Pebble.addEventListener('showConfiguration', function() {
  logDebug('show configuration');
  clay.setSettings(loadSettings());
  Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener('webviewclosed', function(e) {
  if (!e || !e.response) {
    logDebug('configuration closed without response');
    return;
  }

  logDebug('configuration saved');
  var settings = clay.getSettings(e.response, false);
  saveSettings(settings);
  syncWatchSettings(extend(DEFAULT_SETTINGS, settings));
});

Pebble.addEventListener('appmessage', function(e) {
  var dict = e.payload || {};
  var requestId = dict.RequestId || 0;

  if (dict.HealthSummaryRequest && (dict.HealthSummaryJson !== undefined || dict.HealthSummaryError !== undefined)) {
    handleHealthSummaryResponse(dict);
    return;
  }

  if (dict.ChatReset) {
    logDebug('appmessage chat reset');
    resetChatHistory();
  }

  if (dict.RequestText) {
    logDebug('appmessage request id=' + requestId + ' textChars=' + String(dict.RequestText || '').length);
    requestCompletion(requestId, dict.RequestText);
  }
});
