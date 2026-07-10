var common = require('./settings');

var CHUNK_SIZE = 400;
var MAX_RESPONSE_CHARS = 6000;
var MAX_SEND_ATTEMPTS = 3;
var SEND_RETRY_DELAY_MS = 100;
// Non-NUL style markers are stripped from display and drive watch-side fonts.
var WATCH_BOLD_ON = '\u0001';
var WATCH_BOLD_OFF = '\u0002';
var WATCH_PROMPT_ON = '\u0003';
var WATCH_PROMPT_OFF = '\u0004';
var WATCH_SMALL_ON = '\u0005';
var WATCH_SMALL_OFF = '\u0006';
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
  currentToolRemembered: false,
  inputContextSize: '',
  outputContextSize: ''
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

function utf8BytesForCodePoint(codePoint) {
  if (codePoint <= 0x7f) {
    return 1;
  }
  if (codePoint <= 0x7ff) {
    return 2;
  }
  if (codePoint <= 0xffff) {
    return 3;
  }
  return 4;
}

function truncateAtCodePointBoundary(text, maxLength) {
  var value = String(text || '');
  var end = value.length > maxLength ? maxLength : value.length;

  if (end > 0 && end < value.length &&
      value.charCodeAt(end - 1) >= 0xd800 && value.charCodeAt(end - 1) <= 0xdbff &&
      value.charCodeAt(end) >= 0xdc00 && value.charCodeAt(end) <= 0xdfff) {
    end -= 1;
  }

  return value.substring(0, end);
}

function nextUtf8Chunk(text, start, maxBytes) {
  var value = String(text || '');
  var end = start;
  var bytes = 0;
  var first;
  var second;
  var width;
  var codePoint;
  var codePointBytes;

  while (end < value.length) {
    first = value.charCodeAt(end);
    codePoint = first;
    width = 1;
    if (first >= 0xd800 && first <= 0xdbff && end + 1 < value.length) {
      second = value.charCodeAt(end + 1);
      if (second >= 0xdc00 && second <= 0xdfff) {
        codePoint = 0x10000 + ((first - 0xd800) * 0x400) + (second - 0xdc00);
        width = 2;
      }
    }
    codePointBytes = utf8BytesForCodePoint(codePoint);
    if (bytes + codePointBytes > maxBytes) {
      break;
    }
    bytes += codePointBytes;
    end += width;
  }

  return {
    text: value.substring(start, end),
    end: end,
    bytes: bytes
  };
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
    if (item.attempts < MAX_SEND_ATTEMPTS && isCurrentMessage(item.dict)) {
      item.attempts += 1;
      common.logDebug('sendAppMessage retry=' + item.attempts + ' error=' + JSON.stringify(e));
      s_send_queue.unshift(item);
      setTimeout(processSendQueue, SEND_RETRY_DELAY_MS);
      return;
    }
    common.logDebug('sendAppMessage failed attempts=' + item.attempts + ': ' + JSON.stringify(e));
    if (item.onFailure) {
      item.onFailure(e || { error: 'AppMessage failed' });
    }
    processSendQueue();
  });
}

function sendMessage(dict, onSuccess, onFailure) {
  if (!isCurrentMessage(dict)) {
    common.logDebug('dropping stale message request=' + dict.RequestId);
    if (onFailure) {
      onFailure({ error: 'Stale request' });
    }
    return false;
  }

  s_send_queue.push({
    dict: dict,
    onSuccess: onSuccess,
    onFailure: onFailure,
    attempts: 1
  });
  processSendQueue();
  return true;
}

function syncWatchSettings(settings) {
  sendMessage({
    FontSize: settings.FontSize,
    BuzzStrength: settings.BuzzStrength,
    ScrollLines: settings.ScrollLines,
    TouchScrollEnabled: settings.TouchScrollEnabled ? 1 : 0,
    ShowInputContextSize: settings.ShowInputContextSize ? 1 : 0,
    ShowOutputContextSize: settings.ShowOutputContextSize ? 1 : 0,
    PreserveChats: settings.PreserveChats ? 1 : 0,
    StartDictationQuickLaunch: settings.StartDictationQuickLaunch ? 1 : 0,
    TextColor: settings.TextColor,
    BackgroundColor: settings.BackgroundColor,
    PromptBackgroundColor: settings.PromptBackgroundColor,
    BoldTextColor: settings.BoldTextColor
  });
}

function sendReset(requestId, onSuccess, onFailure) {
  sendMessage({ ResponseReset: 1, RequestId: requestId }, onSuccess, onFailure);
}

function sendWatchText(requestId, text, includeDone, onDone) {
  var i = 0;
  var chunkIndex = 0;
  var completed = false;
  var value = truncateAtCodePointBoundary(text, MAX_RESPONSE_CHARS);

  function complete(error) {
    if (completed) {
      return;
    }
    completed = true;
    if (onDone) {
      onDone(error || null);
    }
  }

  function fail(error) {
    var message = 'Response transfer failed. Try again.';

    if (!isCurrentRequest(requestId)) {
      complete(error || new Error(message));
      return;
    }
    sendMessage({ ResponseError: message, RequestId: requestId }, function() {
      complete(error || new Error(message));
    }, function() {
      complete(error || new Error(message));
    });
  }

  function finish() {
    if (includeDone) {
      sendMessage({ ResponseDone: 1, RequestId: requestId }, function() {
        complete(null);
      }, fail);
    } else {
      complete(null);
    }
  }

  function sendNext() {
    var chunk;

    if (i >= value.length) {
      finish();
      return;
    }

    chunk = nextUtf8Chunk(value, i, CHUNK_SIZE);
    if (!chunk.text) {
      fail(new Error('Unable to encode response chunk'));
      return;
    }

    sendMessage({
      ResponseChunk: chunk.text,
      ResponseChunkIndex: chunkIndex,
      RequestId: requestId
    }, function() {
      i = chunk.end;
      chunkIndex += 1;
      sendNext();
    }, fail);
  }

  sendReset(requestId, sendNext, fail);
}

function sendPastChats(chats, onDone) {
  var i = 0;

  chats = chats || [];
  sendMessage({ PastChatsReset: 1 }, function sendNext() {
    var chat;

    if (i >= chats.length) {
      sendMessage({ PastChatsDone: chats.length }, onDone);
      return;
    }

    chat = chats[i] || {};
    sendMessage({
      PastChatsItemId: common.truncate(chat.id || '', 48),
      PastChatsItemTitle: common.truncate(chat.title || 'Untitled chat', 80)
    }, function() {
      i += 1;
      sendNext();
    });
  });
}

function sendPastChatsError(message) {
  sendMessage({ PastChatsError: common.truncate(message || 'Saved chats unavailable', CHUNK_SIZE) });
}

function sendPastChatDeleted(chatId) {
  sendMessage({ PastChatDeleted: common.truncate(chatId || '', 48) });
}

function stripWatchMarkers(text) {
  return String(text || '').replace(/[\u0001-\u0006]/g, '');
}

function appendTruncatedNotice(text, limit) {
  var suffix = '\n\n[Truncated]';
  var value = String(text || '');

  if (value.length + suffix.length <= limit) {
    return value + suffix;
  }
  if (limit <= suffix.length) {
    return value.substring(0, limit);
  }

  return value.substring(0, limit - suffix.length) + suffix;
}

function formatSavedPromptContent(content, maxLength) {
  if (maxLength <= 2) {
    return '';
  }

  return WATCH_PROMPT_ON + formatMarkdownBoldForWatch(content, maxLength - 2) + WATCH_PROMPT_OFF;
}

function formatSavedAssistantContent(content, maxLength) {
  if (maxLength <= 0) {
    return '';
  }

  return wrapThinkingSmallForWatch(formatMarkdownBoldForWatch(content, maxLength));
}

function formatSavedChatTranscript(chat, settings) {
  var messages = chat && chat.messages ? chat.messages : [];
  var text = '';
  var i;
  var message;
  var content;
  var segment;
  var limit = maxResponseCharsForFontSize(settings);
  var available;
  var separator;
  var truncated = false;

  if (limit > MAX_RESPONSE_CHARS) {
    limit = MAX_RESPONSE_CHARS;
  }

  for (i = 0; i < messages.length; i += 1) {
    message = messages[i] || {};
    content = stripWatchMarkers(message.content || '');
    if (!content) {
      continue;
    }

    separator = text ? '\n\n' : '';
    available = limit - text.length - separator.length;
    if (available <= 0) {
      truncated = true;
      break;
    }

    if (message.role === 'user') {
      segment = formatSavedPromptContent(content, available);
    } else if (message.role === 'assistant') {
      segment = formatSavedAssistantContent(content, available);
    } else {
      continue;
    }

    if (segment.length > available) {
      segment = segment.substring(0, available);
      truncated = true;
    }

    if (!segment) {
      truncated = true;
      break;
    }

    text += separator + segment;
  }

  if (truncated || i < messages.length) {
    return appendTruncatedNotice(text, limit);
  }

  return text;
}

function sendPastChatTranscript(chat, settings, onDone) {
  var text = formatSavedChatTranscript(chat, settings);
  var i = 0;

  sendMessage({ PastChatTextReset: 1 }, function sendNext() {
    if (i >= text.length) {
      sendMessage({ PastChatTextDone: 1 }, onDone);
      return;
    }

    sendMessage({
      PastChatTextChunk: text.substring(i, i + CHUNK_SIZE)
    }, function() {
      i += CHUNK_SIZE;
      sendNext();
    });
  });
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
    if (value !== WATCH_BOLD_ON && value !== WATCH_BOLD_OFF &&
        value !== WATCH_SMALL_ON && value !== WATCH_SMALL_OFF) {
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

function wrapThinkingSmallForWatch(text) {
  var value = String(text || '');
  var thinkingPrefix = 'Thinking:\n';
  var answerMarker = '\n\nAnswer:\n';
  var answerIndex;

  if (value.substring(0, thinkingPrefix.length) !== thinkingPrefix) {
    return value;
  }

  answerIndex = value.indexOf(answerMarker, thinkingPrefix.length);
  if (answerIndex === -1) {
    return WATCH_SMALL_ON + value + WATCH_SMALL_OFF;
  }

  return WATCH_SMALL_ON + value.substring(0, answerIndex) + WATCH_SMALL_OFF + value.substring(answerIndex);
}

function formatResponseForWatch(text, maxLength) {
  var value = formatMarkdownBoldForWatch(text, maxLength);
  var wrapped = wrapThinkingSmallForWatch(value);

  if (wrapped.length <= maxLength) {
    return wrapped;
  }

  value = formatMarkdownBoldForWatch(text, maxLength - 2);
  return wrapThinkingSmallForWatch(value);
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
    ProgressHistory: formatProgressHistory(s_progress.toolHistory),
    ProgressInputContextSize: common.truncate(s_progress.inputContextSize || '', 24),
    ProgressOutputContextSize: common.truncate(s_progress.outputContextSize || '', 24)
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
  s_progress.inputContextSize = '';
  s_progress.outputContextSize = '';
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

function progressSetContextSizes(requestId, inputText, outputText) {
  inputText = inputText || '';
  outputText = outputText || '';

  if (!s_progress.active || s_progress.requestId !== requestId) {
    return;
  }

  if (s_progress.inputContextSize === inputText && s_progress.outputContextSize === outputText) {
    return;
  }

  s_progress.inputContextSize = inputText;
  s_progress.outputContextSize = outputText;
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
  s_progress.inputContextSize = '';
  s_progress.outputContextSize = '';
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
  var value = formatResponseForWatch(truncateResponseForWatch(text, limit), MAX_RESPONSE_CHARS);

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
  var pending = s_pending_health_summaries[key];
  var callback;

  if (!pending) {
    common.logDebug('unexpected health summary response token=' + key);
    return;
  }

  if (dictHasRequestId(dict) && Number(dict.RequestId) !== Number(pending.requestId)) {
    return;
  }
  pending = clearPendingHealthSummary(key);
  callback = pending.callback;
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
  progressSetContextSizes: progressSetContextSizes,
  progressDone: progressDone,
  progressStop: progressStop,
  sendError: sendError,
  sendResponse: sendResponse,
  sendPastChats: sendPastChats,
  sendPastChatsError: sendPastChatsError,
  sendPastChatDeleted: sendPastChatDeleted,
  sendPastChatTranscript: sendPastChatTranscript,
  requestHealthSummary: requestHealthSummary,
  handleHealthSummaryResponse: handleHealthSummaryResponse
};
