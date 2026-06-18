var common = require('./settings');

var CHUNK_SIZE = 400;
var MAX_RESPONSE_CHARS = 6000;
// Non-NUL style markers are stripped from display and drive watch-side fonts.
var WATCH_BOLD_ON = '\u0001';
var WATCH_BOLD_OFF = '\u0002';
var HEALTH_SUMMARY_TIMEOUT_MS = 8000;

var s_health_summary_request_id = 1;
var s_send_queue = [];
var s_send_busy = false;
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
    common.logDebug('dropped stale queued messages count=' + dropped);
  }

  s_send_queue = kept;
}

function beginRequestLifecycle(requestId) {
  var key;

  s_latest_request_id = requestId;
  for (key in s_active_xhrs) {
    if (s_active_xhrs.hasOwnProperty(key) && key !== requestKey(requestId)) {
      common.logDebug('aborting stale request id=' + key);
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
    common.logDebug('skipping stale message request=' + item.dict.RequestId);
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
    common.logDebug('sendAppMessage failed: ' + JSON.stringify(e));
    if (item.onFailure) {
      item.onFailure(e);
    }
    processSendQueue();
  });
}

function sendMessage(dict, onSuccess, onFailure) {
  if (!isCurrentMessage(dict)) {
    common.logDebug('dropping stale message request=' + dict.RequestId);
    return;
  }

  s_send_queue.push({
    dict: dict,
    onSuccess: onSuccess,
    onFailure: onFailure
  });
  processSendQueue();
}

function syncWatchSettings(settings) {
  sendMessage({
    FontSize: settings.FontSize,
    BuzzStrength: settings.BuzzStrength,
    ScrollLines: settings.ScrollLines,
    TouchScrollEnabled: settings.TouchScrollEnabled ? 1 : 0,
    StartDictationQuickLaunch: settings.StartDictationQuickLaunch ? 1 : 0,
    TextColor: settings.TextColor,
    BackgroundColor: settings.BackgroundColor,
    PromptBackgroundColor: settings.PromptBackgroundColor,
    BoldTextColor: settings.BoldTextColor
  });
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
    line = common.truncate(groups[i].label, 48 - suffix.length) + suffix;
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
    ProgressText: common.truncate(current || 'thinking', 80),
    ProgressDetail: common.truncate(detail || '', 160),
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
  common.logDebug('watch error request=' + requestId + ' message=' + String(message).substring(0, 160));
  sendReset(requestId, function() {
    sendMessage({ ResponseError: String(message).substring(0, CHUNK_SIZE), RequestId: requestId });
  });
}

function sendResponse(requestId, settings, text, onDone) {
  var limit = maxResponseCharsForFontSize(settings);
  var value = formatMarkdownBoldForWatch(truncateResponseForWatch(text, limit), MAX_RESPONSE_CHARS);

  progressStop(requestId);
  common.logDebug('send response request=' + requestId + ' chars=' + value.length + ' limit=' + limit);
  sendWatchText(requestId, value, true, onDone);
}

function requestHealthSummary(range, requestId, callback) {
  var healthRequestId;
  var key;
  var dict;

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

  common.logDebug('health summary request token=' + healthRequestId + ' start=' + range.startUnix + ' end=' + range.endUnix + ' hr=' + (range.includeHeartRate ? 1 : 0));
  sendMessage(dict, null, function(e) {
    var pending = clearPendingHealthSummary(key);
    if (pending && isCurrentRequest(pending.requestId)) {
      pending.callback('Health summary send failed: ' + ((e && (e.error || e.message)) || 'AppMessage failed'));
    }
  });
}

function handleHealthSummaryResponse(dict) {
  var key = String(dict.HealthSummaryRequest || 0);
  var pending = clearPendingHealthSummary(key);
  var callback;

  if (!pending) {
    common.logDebug('unexpected health summary response token=' + key);
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

module.exports = {
  dictHasRequestId: dictHasRequestId,
  isCurrentRequest: isCurrentRequest,
  beginRequestLifecycle: beginRequestLifecycle,
  finishRequestLifecycle: finishRequestLifecycle,
  trackXhr: trackXhr,
  untrackXhr: untrackXhr,
  sendMessage: sendMessage,
  syncWatchSettings: syncWatchSettings,
  progressStart: progressStart,
  progressToolStart: progressToolStart,
  progressSet: progressSet,
  progressDone: progressDone,
  progressStop: progressStop,
  sendError: sendError,
  sendResponse: sendResponse,
  requestHealthSummary: requestHealthSummary,
  handleHealthSummaryResponse: handleHealthSummaryResponse
};
