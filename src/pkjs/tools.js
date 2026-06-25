var common = require('./settings');
var watch = require('./watch');

var MCP_PROTOCOL_VERSION = '2025-06-18';
var MCP_CLIENT_NAME = 'llm_thing';
var MCP_CLIENT_VERSION = '1.0.0';
var TIMELINE_API_BASE = 'https://timeline-api.getpebble.com/v1/user/pins/';
var TIMELINE_DEFAULT_PIN_ICON = 'NOTIFICATION_REMINDER';
var TIMELINE_DEFAULT_REMINDER_ICON = 'NOTIFICATION_REMINDER';
var TIMELINE_DEFAULT_NOTIFICATION_ICON = 'NOTIFICATION_GENERIC';
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
  var layoutType = normalizeTimelineLayoutType(firstTimelineValue(args, ['layoutType', 'type']));
  var tinyIcon = firstTimelineValue(args, ['tinyIcon', 'pinIcon', 'icon']);
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

  args = parseObjectArg(args) || {};
  options = options || {};

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
  var built = buildTimelinePin(args, { forceReminder: false });
  var pin;
  var validationError;

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

  timelinePinRequest('PUT', pin.id, pin, requestId, callback);
}

function callTimelineReminderBuiltin(args, requestId, callback) {
  var built = buildTimelinePin(args, { forceReminder: true });
  var pin;
  var validationError;

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
      name: 'pebble_timeline_create_reminder',
      label: 'Timeline',
      description: 'Create a Pebble timeline pin with a scheduled reminder. Use this for user requests like "remind me". Provide structured fields only; the phone builds the Pebble reminders array with layout.type genericReminder and icon system://images/NOTIFICATION_REMINDER.',
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
      description: 'Create or update one of this app\'s Pebble timeline pins from structured fields. Do not provide raw Pebble pin JSON. Updating uses the same id. Deleted pin ids should not be reused. Scheduled reminders must use reminders, reminderTime, or remindMinutesBefore; createNotification is only shown when the pin is delivered.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', maxLength: 64, description: 'Optional pin id. Required when updating an existing pin. Generated when omitted for new pins.' },
          time: { type: 'string', description: 'Pin event start time as ISO date-time with timezone, parseable date-time, or Unix seconds.' },
          durationMinutes: { type: 'integer', minimum: 0, maximum: 1440, description: 'Optional event duration in minutes.' },
          layoutType: { type: 'string', enum: ['genericPin', 'calendarPin', 'sportsPin', 'weatherPin'], description: 'Pin layout type. Default genericPin.' },
          title: { type: 'string', description: 'Pin title. Required by supported layouts.' },
          subtitle: { type: 'string', description: 'Optional subtitle.' },
          shortTitle: { type: 'string', description: 'Optional short timeline title for weather pins.' },
          shortSubtitle: { type: 'string', description: 'Optional short timeline subtitle for weather pins.' },
          body: { type: 'string', maxLength: 512, description: 'Optional pin body text.' },
          locationName: { type: 'string', description: 'Optional location. Required for weatherPin and useful for reminders/calendar pins.' },
          tinyIcon: { type: 'string', description: 'Optional Pebble icon name or URI. Default NOTIFICATION_REMINDER except calendarPin. Example: NOTIFICATION_REMINDER, NOTIFICATION_FLAG, ALARM_CLOCK, TIMELINE_CALENDAR.' },
          smallIcon: { type: 'string', description: 'Optional Pebble small icon name or URI.' },
          largeIcon: { type: 'string', description: 'Optional Pebble large icon name or URI.' },
          primaryColor: { type: 'string', description: 'Optional six-digit color hex or Pebble color constant.' },
          secondaryColor: { type: 'string', description: 'Optional six-digit color hex or Pebble color constant.' },
          backgroundColor: { type: 'string', description: 'Optional six-digit color hex or Pebble color constant.' },
          headings: { type: 'array', items: { type: 'string' }, description: 'Optional detail headings. Must have same item count as paragraphs.' },
          paragraphs: { type: 'array', items: { type: 'string' }, description: 'Optional detail paragraphs. Must have same item count as headings.' },
          lastUpdated: { type: 'string', description: 'Optional ISO date-time when pin data was last updated.' },
          displayTime: { type: 'string', enum: ['pin', 'none'], description: 'Optional weatherPin display time mode.' },
          rankAway: { type: 'string', description: 'Optional sportsPin away team rank.' },
          rankHome: { type: 'string', description: 'Optional sportsPin home team rank.' },
          nameAway: { type: 'string', description: 'Optional sportsPin away team short name.' },
          nameHome: { type: 'string', description: 'Optional sportsPin home team short name.' },
          recordAway: { type: 'string', description: 'Optional sportsPin away team record.' },
          recordHome: { type: 'string', description: 'Optional sportsPin home team record.' },
          scoreAway: { type: 'string', description: 'Optional sportsPin away team score.' },
          scoreHome: { type: 'string', description: 'Optional sportsPin home team score.' },
          sportsGameState: { type: 'string', enum: ['pre-game', 'in-game'], description: 'Optional sportsPin game state.' },
          reminderTime: { type: 'string', description: 'Optional single scheduled reminder time. Creates reminders[0].' },
          remindMinutesBefore: { type: 'integer', minimum: 0, maximum: 43200, description: 'Optional minutes before pin time for a single scheduled reminder.' },
          reminderTitle: { type: 'string', description: 'Optional title for the single scheduled reminder. Defaults to title.' },
          reminderIcon: { type: 'string', description: 'Optional icon for scheduled reminders. Default NOTIFICATION_REMINDER.' },
          reminders: {
            type: 'array',
            maxItems: 3,
            description: 'Optional scheduled reminders. Each item is converted to a Pebble Reminder object with layout.type genericReminder. Do not use createNotification for scheduled reminders.',
            items: {
              type: 'object',
              properties: {
                time: { type: 'string', description: 'Reminder alert time as ISO date-time, parseable date-time, or Unix seconds.' },
                minutesBefore: { type: 'integer', minimum: 0, maximum: 43200, description: 'Alternative to time: minutes before pin time.' },
                title: { type: 'string', description: 'Reminder title.' },
                locationName: { type: 'string', description: 'Optional reminder location.' },
                icon: { type: 'string', description: 'Optional Pebble icon name or URI. Default NOTIFICATION_REMINDER.' }
              }
            }
          },
          createNotificationTitle: { type: 'string', description: 'Optional notification title shown when pin is first delivered. This is not a scheduled reminder.' },
          createNotificationBody: { type: 'string', maxLength: 512, description: 'Optional notification body shown when pin is first delivered.' },
          createNotificationIcon: { type: 'string', description: 'Optional icon for create notification. Default NOTIFICATION_GENERIC.' },
          updateNotificationTime: { type: 'string', description: 'Optional update notification timestamp. Defaults to now when update notification fields are used.' },
          updateNotificationTitle: { type: 'string', description: 'Optional notification title shown when an existing pin is updated.' },
          updateNotificationBody: { type: 'string', maxLength: 512, description: 'Optional notification body shown when an existing pin is updated.' },
          updateNotificationIcon: { type: 'string', description: 'Optional icon for update notification. Default NOTIFICATION_GENERIC.' },
          actions: {
            type: 'array',
            description: 'Optional pin actions. Use openWatchApp with launchCode or http with url/method/body fields.',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Action title shown on the watch.' },
                type: { type: 'string', enum: ['openWatchApp', 'http'], description: 'Action type.' },
                launchCode: { type: 'integer', minimum: 0, description: 'Required for openWatchApp actions.' },
                url: { type: 'string', description: 'Required for http actions.' },
                method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], description: 'HTTP method. Default POST.' },
                headers: { type: 'object', description: 'Optional HTTP headers object.' },
                bodyText: { type: 'string', description: 'Optional HTTP body text. Do not use with GET/DELETE or bodyJSON.' },
                bodyJSON: { type: 'object', description: 'Optional HTTP JSON body. Do not use with GET/DELETE or bodyText.' },
                successText: { type: 'string', description: 'Optional HTTP action success text.' },
                successIcon: { type: 'string', description: 'Optional HTTP action success icon. Default GENERIC_CONFIRMATION.' },
                failureText: { type: 'string', description: 'Optional HTTP action failure text.' },
                failureIcon: { type: 'string', description: 'Optional HTTP action failure icon. Default RESULT_FAILED.' }
              },
              required: ['title', 'type']
            }
          }
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
