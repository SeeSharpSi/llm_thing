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
var HEALTH_INFO_TIMEOUT_MS = 8000;
var ACTION_APPROVAL_TIMEOUT_MS = 60000;
var ACTION_APPROVAL_DETAIL_MAX_BYTES = 600;
var ACTION_APPROVAL_MESSAGE_MAX_BYTES = 1024;
// Conservative allowance for five AppMessage tuple headers, keys, scalar values, and title.
var ACTION_APPROVAL_WIRE_FIXED_OVERHEAD_BYTES = 128;

var s_health_info_request_id = 1;
var s_send_queue = [];
var s_in_flight_send = null;
var s_last_watch_settings = null;
var s_pending_watch_settings = null;
var s_pending_watch_settings_force = false;
var s_sending_watch_settings = null;
var s_latest_request_id = null;
var s_active_xhrs = {};
var s_pending_health_info = {};
var s_pending_action_approvals = Object.create(null);
var s_action_approval_id = (Date.now() % 2147483647) + 1;
var s_progress = {
  requestId: 0,
  active: false,
  current: '',
  detail: '',
  toolHistory: [],
  currentTool: '',
  currentToolRemembered: false,
  toolExecutions: Object.create(null),
  activeToolExecutionIds: [],
  currentToolExecutionId: '',
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
  return requestId !== null && requestId !== undefined && s_latest_request_id !== null &&
    !isNaN(Number(requestId)) && Number(requestId) === Number(s_latest_request_id);
}

function isCurrentMessage(dict) {
  return !dictHasRequestId(dict) || isCurrentRequest(dict.RequestId);
}

function failSendItem(item, error) {
  if (!item || item.settled) {
    return;
  }
  item.settled = true;
  if (item.retryTimer !== null && item.retryTimer !== undefined) {
    clearTimeout(item.retryTimer);
    item.retryTimer = null;
  }
  if (item.onFailure) {
    item.onFailure(error || { error: 'AppMessage failed' });
  }
}

function pendingActionApproval(requestId, approvalId) {
  var pending = s_pending_action_approvals[String(requestId)];
  return pending && !pending.settled && pending.approvalId === approvalId ? pending : null;
}

function isApprovalCancel(item) {
  return !!item && item.approvalCancel === true && item.dict && item.dict.ApprovalCancel === 1;
}

function isApprovalRequestActive(item) {
  return !!item && item.approvalRequest && !!pendingActionApproval(item.approvalRequest.requestId, item.approvalRequest.approvalId);
}

function canSendItem(item) {
  if (isApprovalCancel(item)) { return true; }
  if (item && item.approvalRequest && !isApprovalRequestActive(item)) { return false; }
  return !!item && isCurrentMessage(item.dict);
}

function succeedSendItem(item) {
  if (!item || item.settled) {
    return;
  }
  item.settled = true;
  if (item.onSuccess) {
    item.onSuccess();
  }
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

function sendUtf8ChunkSequence(spec) {
  var value = String(spec.text || '');
  var offset = 0;
  var chunkIndex = 0;

  function stepFailed(error) {
    if (spec.onFailure) {
      spec.onFailure(error);
    }
  }

  function sendNext() {
    var chunk;

    if (offset >= value.length) {
      if (!spec.doneDict) {
        if (spec.onSuccess) {
          spec.onSuccess();
        }
        return;
      }
      sendMessage(spec.doneDict(), function() {
        if (spec.onSuccess) {
          spec.onSuccess();
        }
      }, stepFailed);
      return;
    }

    chunk = nextUtf8Chunk(value, offset, CHUNK_SIZE);
    if (!chunk.text) {
      stepFailed(new Error('Unable to encode response chunk'));
      return;
    }

    sendMessage(spec.chunkDict(chunk.text, chunkIndex), function() {
      offset = chunk.end;
      chunkIndex += 1;
      sendNext();
    }, stepFailed);
  }

  sendMessage(spec.resetDict(), sendNext, stepFailed);
}

function abortXhrsForKey(key) {
  var requests = (s_active_xhrs[key] || []).slice();
  var i;

  delete s_active_xhrs[key];

  for (i = 0; i < requests.length; i += 1) {
    try {
      requests[i].abort();
    } catch (e) {}
  }

}

function clearPendingHealthInfo(key) {
  var pending = s_pending_health_info[key];

  if (!pending) {
    return null;
  }

  if (pending.timeout !== null && pending.timeout !== undefined) {
    clearTimeout(pending.timeout);
  }
  delete s_pending_health_info[key];
  return pending;
}

function abortStaleHealthInfo(requestId) {
  var key;
  var pending;

  for (key in s_pending_health_info) {
    if (s_pending_health_info.hasOwnProperty(key)) {
      pending = s_pending_health_info[key];
      if (Number(pending.requestId) !== Number(requestId)) {
        clearPendingHealthInfo(key);
      }
    }
  }
}

function cancelHealthInfoForRequest(requestId) {
  var key;
  var pending;

  for (key in s_pending_health_info) {
    if (s_pending_health_info.hasOwnProperty(key)) {
      pending = s_pending_health_info[key];
      if (Number(pending.requestId) === Number(requestId)) {
        clearPendingHealthInfo(key);
      }
    }
  }
}

function dropQueuedMessagesForRequest(requestId) {
  var kept = [];
  var dropped = [];
  var i;
  var item;

  for (i = 0; i < s_send_queue.length; i += 1) {
    item = s_send_queue[i];
    if (dictHasRequestId(item.dict) && Number(item.dict.RequestId) === Number(requestId) && !isApprovalCancel(item)) {
      dropped.push(item);
    } else {
      kept.push(item);
    }
  }
  s_send_queue = kept;

  for (i = 0; i < dropped.length; i += 1) {
    failSendItem(dropped[i], { error: 'Request canceled' });
  }
}

function dropStaleQueuedMessages(requestId) {
  var kept = [];
  var dropped = [];
  var i;
  var item;

  for (i = 0; i < s_send_queue.length; i += 1) {
    item = s_send_queue[i];
    if (dictHasRequestId(item.dict) && Number(item.dict.RequestId) !== Number(requestId) && !isApprovalCancel(item)) {
      dropped.push(item);
    } else {
      kept.push(item);
    }
  }

  if (dropped.length) {
    common.logDebug('dropped stale queued messages count=' + dropped.length);
  }

  s_send_queue = kept;
  for (i = 0; i < dropped.length; i += 1) {
    failSendItem(dropped[i], { error: 'Stale request' });
  }
}

function beginRequestLifecycle(requestId) {
  var key;

  clearActionApprovalsForRequest(requestId, true);
  s_latest_request_id = requestId;
  for (key in s_active_xhrs) {
    if (s_active_xhrs.hasOwnProperty(key) && key !== requestKey(requestId)) {
      common.logDebug('aborting stale request id=' + key);
      abortXhrsForKey(key);
    }
  }
  dropStaleQueuedMessages(requestId);
  abortStaleHealthInfo(requestId);
  if (!s_active_xhrs[requestKey(requestId)]) {
    s_active_xhrs[requestKey(requestId)] = [];
  }
  processSendQueue();
}

function finishRequestLifecycle(requestId) {
  clearActionApprovalsForRequest(requestId, false);
  abortPluginActionHandlesForRequest(requestId);
  delete s_active_xhrs[requestKey(requestId)];
}

function cancelRequestLifecycle(requestId) {
  var key;

  if (!isCurrentRequest(requestId)) {
    return false;
  }

  key = requestKey(requestId);
  clearActionApprovalsForRequest(requestId, false);
  s_latest_request_id = null;
  abortXhrsForKey(key);
  cancelHealthInfoForRequest(requestId);
  dropQueuedMessagesForRequest(requestId);
  if (s_in_flight_send && dictHasRequestId(s_in_flight_send.dict) &&
      Number(s_in_flight_send.dict.RequestId) === Number(requestId)) {
    failSendItem(s_in_flight_send, { error: 'Request canceled' });
  }
  progressStop(requestId);
  processSendQueue();
  return true;
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

function handleSendFailure(item, error) {
  if (s_in_flight_send !== item) { return; }
  s_in_flight_send = null;
  if (item.settled) {
    processSendQueue();
    return;
  }
  if (item.attempts < MAX_SEND_ATTEMPTS && canSendItem(item)) {
    item.attempts += 1;
    if (item.approvalRequest || item.approvalCancel) {
      common.logDebug('action approval AppMessage retry=' + item.attempts + ' stage=transport');
    } else {
      common.logDebug('sendAppMessage retry=' + item.attempts + ' error=' + JSON.stringify(error));
    }
    s_send_queue.unshift(item);
    item.retryTimer = setTimeout(function() {
      item.retryTimer = null;
      processSendQueue();
    }, SEND_RETRY_DELAY_MS);
    return;
  }
  if (item.approvalRequest || item.approvalCancel) {
    common.logDebug('action approval AppMessage failed attempts=' + item.attempts + ' stage=transport');
  } else {
    common.logDebug('sendAppMessage failed attempts=' + item.attempts + ': ' + JSON.stringify(error));
  }
  failSendItem(item, error || { error: 'AppMessage failed' });
  processSendQueue();
}

function processSendQueue() {
  var item;

  if (s_in_flight_send || !s_send_queue.length) {
    return;
  }
  if (s_send_queue[0].retryTimer !== null && s_send_queue[0].retryTimer !== undefined) {
    return;
  }

  item = s_send_queue.shift();
  while (item && !canSendItem(item)) {
    if (!item.approvalRequest && !item.approvalCancel) { common.logDebug('skipping stale message request=' + item.dict.RequestId); }
    failSendItem(item, { error: 'Stale request' });
    if (!s_send_queue.length) {
      return;
    }
    item = s_send_queue.shift();
  }

  s_in_flight_send = item;
  try { Pebble.sendAppMessage(item.dict, function() {
    if (s_in_flight_send !== item) {
      return;
    }
    s_in_flight_send = null;
    if (!item.settled) {
      if (!canSendItem(item)) {
        failSendItem(item, { error: 'Request canceled' });
      } else {
        succeedSendItem(item);
      }
    }
    processSendQueue();
  }, function(e) { handleSendFailure(item, e); });
  } catch (sendError) {
    if (item.approvalRequest || item.approvalCancel) { handleSendFailure(item, { error: 'send threw' }); }
    else {
      if (s_in_flight_send === item) { s_in_flight_send = null; }
      throw sendError;
    }
  }
}

function sendMessage(dict, onSuccess, onFailure, sendOptions) {
  sendOptions = sendOptions || {};
  if (!isCurrentMessage(dict) && sendOptions.approvalCancel !== true) {
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
    attempts: 1,
    retryTimer: null,
    settled: false,
    approvalRequest: sendOptions.approvalRequest || null,
    approvalCancel: sendOptions.approvalCancel === true
  });
  processSendQueue();
  return true;
}

function isStrictApprovalRequestId(requestId) {
  return typeof requestId === 'number' && isFinite(requestId) && Math.floor(requestId) === requestId &&
    requestId >= 0 && requestId <= 4294967295;
}

function nextActionApprovalId() {
  var result = s_action_approval_id;
  s_action_approval_id = s_action_approval_id >= 2147483647 ? 1 : s_action_approval_id + 1;
  return result;
}

function escapeApprovalJson(value) {
  return value.replace(/[\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069\ud800-\udfff]/g, function(character) {
    var hex = character.charCodeAt(0).toString(16);
    while (hex.length < 4) { hex = '0' + hex; }
    return '\\u' + hex;
  });
}

function dropQueuedApprovalRequest(pending) {
  var kept = [];
  var dropped = [];
  var i;
  var item;
  for (i = 0; i < s_send_queue.length; i += 1) {
    item = s_send_queue[i];
    if (item.approvalRequest && Number(item.approvalRequest.requestId) === Number(pending.requestId) &&
        item.approvalRequest.approvalId === pending.approvalId) { dropped.push(item); }
    else { kept.push(item); }
  }
  s_send_queue = kept;
  if (s_in_flight_send && s_in_flight_send.approvalRequest &&
      Number(s_in_flight_send.approvalRequest.requestId) === Number(pending.requestId) &&
      s_in_flight_send.approvalRequest.approvalId === pending.approvalId) { dropped.push(s_in_flight_send); }
  for (i = 0; i < dropped.length; i += 1) { failSendItem(dropped[i], { error: 'Approval no longer pending' }); }
}

function sendActionApprovalCancel(pending) {
  var dict = { RequestId: pending.requestId, ApprovalId: pending.approvalId, ApprovalCancel: 1 };
  try { sendMessage(dict, null, null, { approvalCancel: true }); } catch (e) {}
}

function settleActionApproval(pending, error, approved, suppressCallback, sendCancel) {
  if (!pending || pending.settled) { return false; }
  pending.settled = true;
  if (pending.timeout !== null) { clearTimeout(pending.timeout); pending.timeout = null; }
  if (s_pending_action_approvals[String(pending.requestId)] === pending) {
    delete s_pending_action_approvals[String(pending.requestId)];
  }
  dropQueuedApprovalRequest(pending);
  if (pending.tracked) {
    pending.tracked = false;
    try { untrackXhr(pending.requestId, pending.handle); } catch (e) {}
  }
  if (sendCancel) { sendActionApprovalCancel(pending); }
  if (!suppressCallback && isCurrentRequest(pending.requestId)) {
    pending.callback(error || null, approved === true);
  }
  return true;
}

function requestActionApproval(spec, requestId, callback) {
  var handle;
  var pending;
  var approvalId;
  var argsJson;
  var detail;
  var dict;
  var bytes;
  var key;
  var validationError = null;

  spec = spec || {};
  if (!isStrictApprovalRequestId(requestId) || typeof callback !== 'function' || !isCurrentRequest(requestId)) {
    if (typeof callback === 'function') { callback('Action approval request is stale; action was not run.', false); }
    return { abort: function() {} };
  }
  if (typeof Pebble === 'undefined' || !Pebble || typeof Pebble.sendAppMessage !== 'function') {
    callback('Watch confirmation is unavailable; action was not run.', false);
    return { abort: function() {} };
  }
  key = String(requestId);
  if (s_pending_action_approvals[key]) {
    callback('Another action confirmation is pending; action was not run.', false);
    return { abort: function() {} };
  }
  try {
    if (typeof spec.plugin !== 'string' || typeof spec.pluginName !== 'string' || typeof spec.action !== 'string' ||
        !spec.plugin || !spec.pluginName || !spec.action) { throw new Error('invalid approval identity'); }
    argsJson = JSON.stringify(spec.args);
    if (typeof argsJson !== 'string') { throw new Error('arguments are not JSON'); }
    detail = 'Plugin: ' + escapeApprovalJson(JSON.stringify(spec.pluginName)) +
      '\nAction: ' + escapeApprovalJson(JSON.stringify(spec.action)) +
      '\nArguments: ' + escapeApprovalJson(argsJson) +
      '\nPlugin UUID: ' + escapeApprovalJson(JSON.stringify(spec.plugin));
    if (detail.indexOf('\u0000') !== -1) { throw new Error('NUL in approval detail'); }
    bytes = nextUtf8Chunk(detail, 0, ACTION_APPROVAL_DETAIL_MAX_BYTES);
    if (bytes.end !== detail.length || bytes.bytes > ACTION_APPROVAL_DETAIL_MAX_BYTES) {
      validationError = 'Confirmation details exceed the watch limit; shorten arguments. Action was not run.';
    } else {
      approvalId = nextActionApprovalId();
      dict = {
        RequestId: requestId,
        ApprovalRequest: 1,
        ApprovalId: approvalId,
        ApprovalTitle: 'Confirm action',
        ApprovalDetail: detail
      };
      if (bytes.bytes + ACTION_APPROVAL_WIRE_FIXED_OVERHEAD_BYTES > ACTION_APPROVAL_MESSAGE_MAX_BYTES) {
        validationError = 'Confirmation details exceed the watch message limit; shorten arguments. Action was not run.';
      }
    }
  } catch (e) {
    validationError = 'Confirmation details are invalid; shorten arguments. Action was not run.';
  }
  if (validationError) {
    callback(validationError, false);
    return { abort: function() {} };
  }

  pending = {
    requestId: requestId,
    approvalId: approvalId,
    callback: callback,
    timeout: null,
    handle: null,
    tracked: false,
    settled: false
  };
  handle = { abort: function() { settleActionApproval(pending, null, false, true, true); } };
  pending.handle = handle;
  s_pending_action_approvals[key] = pending;
  pending.timeout = setTimeout(function() {
    settleActionApproval(pending, 'Watch confirmation timed out; action was not run.', false, false, true);
  }, ACTION_APPROVAL_TIMEOUT_MS);
  pending.tracked = true;
  if (!trackXhr(requestId, handle)) {
    pending.tracked = false;
    settleActionApproval(pending, 'Watch confirmation request became stale; action was not run.', false, false, true);
    return handle;
  }
  sendMessage(dict, null, function() {
    if (pendingActionApproval(requestId, approvalId) === pending) {
      settleActionApproval(pending, 'Could not send watch confirmation; action was not run.', false, false, true);
    }
  }, { approvalRequest: { requestId: requestId, approvalId: approvalId } });
  return handle;
}

function handleActionApprovalResponse(dict) {
  var pending;
  var requestId;
  var approvalId;
  var decision;
  if (!dict || typeof dict !== 'object' || !Object.prototype.hasOwnProperty.call(dict, 'RequestId') ||
      !Object.prototype.hasOwnProperty.call(dict, 'ApprovalId') || !Object.prototype.hasOwnProperty.call(dict, 'ApprovalDecision')) { return false; }
  requestId = dict.RequestId;
  approvalId = dict.ApprovalId;
  decision = dict.ApprovalDecision;
  if (!isStrictApprovalRequestId(requestId) || typeof approvalId !== 'number' || !isFinite(approvalId) ||
      Math.floor(approvalId) !== approvalId || approvalId < 1 || approvalId > 4294967295 ||
      (decision !== 0 && decision !== 1)) { return false; }
  pending = pendingActionApproval(requestId, approvalId);
  if (!pending || !isCurrentRequest(requestId)) { return false; }
  settleActionApproval(pending, null, decision === 1, false, true);
  return true;
}

function clearActionApprovalsForRequest(requestId, staleOnly) {
  var keys = Object.keys(s_pending_action_approvals);
  var i;
  var pending;
  for (i = 0; i < keys.length; i += 1) {
    pending = s_pending_action_approvals[keys[i]];
    if (pending && (staleOnly ? Number(pending.requestId) !== Number(requestId) : Number(pending.requestId) === Number(requestId))) {
      settleActionApproval(pending, null, false, true, true);
    }
  }
}

function abortPluginActionHandlesForRequest(requestId) {
  var key = requestKey(requestId);
  var handles = (s_active_xhrs[key] || []).slice();
  var i;
  for (i = 0; i < handles.length; i += 1) {
    if (handles[i] && handles[i].pluginAction === true && typeof handles[i].abort === 'function') {
      try { handles[i].abort(); } catch (e) {}
      untrackXhr(requestId, handles[i]);
    }
  }
}

function buildWatchSettings(settings) {
  var normalized = common.extend(common.DEFAULT_SETTINGS, settings || {});

  function colorValue(value, fallback) {
    var number = parseInt(value, 10);
    return isNaN(number) || number < 0 ? fallback : number;
  }

  return {
    FontSize: normalized.FontSize,
    BuzzStrength: normalized.BuzzStrength,
    SpeakerFeedbackEnabled: normalized.SpeakerFeedbackEnabled ? 1 : 0,
    ScrollLines: normalized.ScrollLines,
    TouchScrollEnabled: normalized.TouchScrollEnabled ? 1 : 0,
    ShowInputContextSize: normalized.ShowInputContextSize ? 1 : 0,
    ShowOutputContextSize: normalized.ShowOutputContextSize ? 1 : 0,
    PreserveChats: normalized.PreserveChats ? 1 : 0,
    StartDictationQuickLaunch: normalized.StartDictationQuickLaunch ? 1 : 0,
    TextColor: colorValue(normalized.TextColor, common.DEFAULT_SETTINGS.TextColor),
    BackgroundColor: colorValue(normalized.BackgroundColor, common.DEFAULT_SETTINGS.BackgroundColor),
    PromptBackgroundColor: colorValue(normalized.PromptBackgroundColor, common.DEFAULT_SETTINGS.PromptBackgroundColor),
    BoldTextColor: colorValue(normalized.BoldTextColor, common.DEFAULT_SETTINGS.BoldTextColor)
  };
}

function sameWatchSettings(left, right) {
  var key;

  if (!left || !right) {
    return false;
  }
  for (key in left) {
    if (Object.prototype.hasOwnProperty.call(left, key) && left[key] !== right[key]) {
      return false;
    }
  }
  for (key in right) {
    if (Object.prototype.hasOwnProperty.call(right, key) && left[key] !== right[key]) {
      return false;
    }
  }
  return true;
}

function sendPendingWatchSettings() {
  var snapshot;
  var force;

  if (s_sending_watch_settings || !s_pending_watch_settings) {
    return;
  }

  snapshot = s_pending_watch_settings;
  force = s_pending_watch_settings_force;
  s_pending_watch_settings = null;
  s_pending_watch_settings_force = false;
  if (!force && sameWatchSettings(snapshot, s_last_watch_settings)) {
    sendPendingWatchSettings();
    return;
  }

  s_sending_watch_settings = snapshot;
  sendMessage(snapshot, function() {
    s_last_watch_settings = snapshot;
    s_sending_watch_settings = null;
    sendPendingWatchSettings();
  }, function() {
    s_last_watch_settings = null;
    s_sending_watch_settings = null;
    sendPendingWatchSettings();
  });
}

function syncWatchSettings(settings, force) {
  var snapshot = buildWatchSettings(settings);

  if (force) {
    if (!s_pending_watch_settings || !sameWatchSettings(snapshot, s_pending_watch_settings)) {
      s_pending_watch_settings = snapshot;
    }
    s_pending_watch_settings_force = true;
    sendPendingWatchSettings();
    return true;
  }

  if (s_sending_watch_settings && sameWatchSettings(snapshot, s_sending_watch_settings)) {
    if (s_pending_watch_settings_force) {
      s_pending_watch_settings = snapshot;
    } else {
      s_pending_watch_settings = null;
    }
    return true;
  }
  if (s_pending_watch_settings && sameWatchSettings(snapshot, s_pending_watch_settings)) {
    return true;
  }
  if (s_pending_watch_settings_force) {
    s_pending_watch_settings = snapshot;
    sendPendingWatchSettings();
    return true;
  }
  if (!s_sending_watch_settings && !s_pending_watch_settings &&
      sameWatchSettings(snapshot, s_last_watch_settings)) {
    return false;
  }

  s_pending_watch_settings = snapshot;
  s_pending_watch_settings_force = false;
  sendPendingWatchSettings();
  return true;
}

function sendReset(requestId, onSuccess, onFailure) {
  sendMessage({ ResponseReset: 1, RequestId: requestId }, onSuccess, onFailure);
}

function sendWatchText(requestId, text, includeDone, onDone, onTransferFailure) {
  var completed = false;
  var value = String(text || '');

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
    var retryAvailable = false;

    if (!isCurrentRequest(requestId)) {
      complete(error || new Error(message));
      return;
    }
    if (onTransferFailure) {
      retryAvailable = onTransferFailure(error || new Error(message), value) === true;
    }
    sendMessage({
      ResponseError: message,
      RetryAvailable: retryAvailable ? 1 : 0,
      RequestId: requestId
    }, function() {
      complete(error || new Error(message));
    }, function() {
      complete(error || new Error(message));
    });
  }

  sendUtf8ChunkSequence({
    text: value,
    resetDict: function() {
      return { ResponseReset: 1, RequestId: requestId };
    },
    chunkDict: function(chunkText, chunkIndex) {
      return {
        ResponseChunk: chunkText,
        ResponseChunkIndex: chunkIndex,
        RequestId: requestId
      };
    },
    doneDict: includeDone ? function() {
      return { ResponseDone: 1, RequestId: requestId };
    } : null,
    onSuccess: function() {
      complete(null);
    },
    onTransferFailure: onTransferFailure,
    onFailure: fail
  });
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

function codePointAt(value, index) {
  var first = value.charCodeAt(index);
  var second;

  if (first >= 0xd800 && first <= 0xdbff && index + 1 < value.length) {
    second = value.charCodeAt(index + 1);
    if (second >= 0xdc00 && second <= 0xdfff) {
      return { text: value.substring(index, index + 2), width: 2 };
    }
  }

  if ((first >= 0xd800 && first <= 0xdfff)) {
    return { text: '\ufffd', width: 1 };
  }

  return { text: value.charAt(index), width: 1 };
}

function markerForStyle(style, enabled) {
  if (style === 'bold') {
    return enabled ? WATCH_BOLD_ON : WATCH_BOLD_OFF;
  }
  if (style === 'prompt') {
    return enabled ? WATCH_PROMPT_ON : WATCH_PROMPT_OFF;
  }
  return enabled ? WATCH_SMALL_ON : WATCH_SMALL_OFF;
}

function readOutputStyles(text) {
  var state = { bold: false, prompt: false, small: false };
  var i;
  var ch;

  for (i = 0; i < text.length; i += 1) {
    ch = text.charAt(i);
    if (ch === WATCH_BOLD_ON) {
      state.bold = true;
    } else if (ch === WATCH_BOLD_OFF) {
      state.bold = false;
    } else if (ch === WATCH_PROMPT_ON) {
      state.prompt = true;
    } else if (ch === WATCH_PROMPT_OFF) {
      state.prompt = false;
    } else if (ch === WATCH_SMALL_ON) {
      state.small = true;
    } else if (ch === WATCH_SMALL_OFF) {
      state.small = false;
    }
  }

  return state;
}

function createBoundedOutput(limit) {
  var text = '';
  var truncated = false;
  var styles = { bold: false, prompt: false, small: false };

  limit = Math.min(limit, MAX_RESPONSE_CHARS);

  function append(value) {
    if (truncated) {
      return false;
    }
    if (text.length + value.length > limit) {
      truncated = true;
      return false;
    }
    text += value;
    return true;
  }

  function appendText(value) {
    var i = 0;
    var point;

    while (i < value.length) {
      point = codePointAt(value, i);
      if (!append(point.text)) {
        return false;
      }
      i += point.width;
    }
    return true;
  }

  function setStyle(style, enabled) {
    var marker;

    if (truncated || styles[style] === enabled) {
      return !truncated;
    }
    marker = markerForStyle(style, enabled);
    if (!append(marker)) {
      return false;
    }
    styles[style] = enabled;
    return true;
  }

  function finish() {
    var notice = '\n\n[Truncated]';
    var prefix = text;
    var state;
    var closers;
    var end;

    if (!truncated) {
      return { text: text, truncated: false };
    }

    while (true) {
      state = readOutputStyles(prefix);
      closers = (state.bold ? WATCH_BOLD_OFF : '') +
        (state.prompt ? WATCH_PROMPT_OFF : '') +
        (state.small ? WATCH_SMALL_OFF : '');
      end = prefix.length;
      while (end > limit - notice.length - closers.length) {
        end -= 1;
      }
      if (end > 0 && end < prefix.length &&
          prefix.charCodeAt(end - 1) >= 0xd800 && prefix.charCodeAt(end - 1) <= 0xdbff &&
          prefix.charCodeAt(end) >= 0xdc00 && prefix.charCodeAt(end) <= 0xdfff) {
        end -= 1;
      }
      if (end === prefix.length) {
        return { text: prefix + closers + notice, truncated: true };
      }
      prefix = prefix.substring(0, end);
    }
  }

  return {
    appendText: appendText,
    setStyle: setStyle,
    length: function() { return text.length; },
    getText: function() { return text; },
    isTruncated: function() { return truncated; },
    finish: finish
  };
}

function formatSegment(rawText, role, output, separator) {
  var value = stripWatchMarkers(rawText);
  var start;
  var prefix = 'Thinking:\n';
  var answerMarker = '\n\nAnswer:\n';
  var answerIndex = -1;
  var thinkingEnd;
  var i = 0;
  var close;

  if (!value) {
    return { text: '', truncated: false };
  }

  if (separator && output.length() && !output.appendText(separator)) {
    return { text: '', truncated: true };
  }
  start = output.length();

  if (role === 'prompt') {
    output.setStyle('prompt', true);
  } else if (value.substring(0, prefix.length) === prefix) {
    answerIndex = value.indexOf(answerMarker, prefix.length);
  }

  thinkingEnd = role === 'assistant' && value.substring(0, prefix.length) === prefix ?
    (answerIndex === -1 ? value.length : answerIndex) : -1;
  if (thinkingEnd >= 0) {
    output.setStyle('small', true);
  }

  while (i < value.length && !output.isTruncated()) {
    if (value.substring(i, i + 2) === '**' && (close = value.indexOf('**', i + 2)) !== -1) {
      output.setStyle('bold', true);
      i += 2;
      while (i < close && !output.isTruncated()) {
        if (thinkingEnd >= 0 && i === thinkingEnd) {
          output.setStyle('small', false);
        }
        var point = codePointAt(value, i);
        output.appendText(point.text);
        i += point.width;
      }
      if (thinkingEnd >= 0 && i === thinkingEnd) {
        output.setStyle('small', false);
      }
      output.setStyle('bold', false);
      i = close + 2;
      continue;
    }

    if (thinkingEnd >= 0 && i === thinkingEnd) {
      output.setStyle('small', false);
      thinkingEnd = -1;
    }
    if (value.substring(i, i + 2) === '**') {
      output.appendText('**');
      i += 2;
    } else {
      var rawPoint = codePointAt(value, i);
      output.appendText(rawPoint.text);
      i += rawPoint.width;
    }
  }

  if (thinkingEnd >= 0 && !output.isTruncated()) {
    output.setStyle('small', false);
  }
  if (role === 'prompt' && !output.isTruncated()) {
    output.setStyle('prompt', false);
  }

  return {
    text: output.getText().substring(start),
    truncated: output.isTruncated()
  };
}

function formatResponseForWatch(text, limit) {
  var output = createBoundedOutput(limit);

  formatSegment(text, 'assistant', output, '');
  return output.finish();
}

function formatSavedChatTranscript(chat, settings) {
  var messages = chat && chat.messages ? chat.messages : [];
  var output = createBoundedOutput(maxResponseCharsForFontSize(settings));
  var i;
  var message;
  var segment;

  for (i = 0; i < messages.length && !output.isTruncated(); i += 1) {
    message = messages[i] || {};
    if (message.role !== 'user' && message.role !== 'assistant') {
      continue;
    }
    segment = formatSegment(message.content || '', message.role === 'user' ? 'prompt' : 'assistant', output, '\n\n');
    if (segment.truncated) {
      break;
    }
  }

  return output.finish();
}

function sendPastChatTranscript(chat, settings, onDone) {
  sendUtf8ChunkSequence({
    text: formatSavedChatTranscript(chat, settings).text,
    resetDict: function() {
      return { PastChatTextReset: 1 };
    },
    chunkDict: function(chunkText) {
      return { PastChatTextChunk: chunkText };
    },
    doneDict: function() {
      return { PastChatTextDone: 1 };
    },
    onSuccess: onDone
  });
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
  if (!isCurrentRequest(requestId)) {
    return;
  }

  s_progress.requestId = requestId;
  s_progress.active = true;
  s_progress.current = current || 'thinking';
  s_progress.detail = detail || '';
  s_progress.toolHistory = [];
  s_progress.currentTool = '';
  s_progress.currentToolRemembered = false;
  s_progress.toolExecutions = Object.create(null);
  s_progress.activeToolExecutionIds = [];
  s_progress.currentToolExecutionId = '';
  s_progress.inputContextSize = '';
  s_progress.outputContextSize = '';
  sendProgressState(requestId, s_progress.current, s_progress.detail, true);
}

function findActiveToolExecution() {
  var entry;
  var i;

  for (i = s_progress.activeToolExecutionIds.length - 1; i >= 0; i -= 1) {
    entry = s_progress.toolExecutions[s_progress.activeToolExecutionIds[i]];
    if (entry && !entry.completed) {
      return { id: s_progress.activeToolExecutionIds[i], entry: entry };
    }
  }
  return null;
}

function removeActiveToolExecution(executionId) {
  var i;

  for (i = s_progress.activeToolExecutionIds.length - 1; i >= 0; i -= 1) {
    if (s_progress.activeToolExecutionIds[i] === executionId) {
      s_progress.activeToolExecutionIds.splice(i, 1);
      return;
    }
  }
}

function progressToolStart(requestId, current, detail, toolExecutionId) {
  var executionKey;
  var entry;

  if (!isCurrentRequest(requestId)) {
    return;
  }

  if (!s_progress.active || s_progress.requestId !== requestId) {
    progressStart(requestId, current, detail);
  }

  if (toolExecutionId !== undefined && toolExecutionId !== null && String(toolExecutionId)) {
    executionKey = String(toolExecutionId);
    entry = s_progress.toolExecutions[executionKey];
    if (entry && entry.completed) {
      return;
    }
    s_progress.currentTool = current || 'thinking';
    if (!entry) {
      entry = { label: s_progress.currentTool, detail: detail || '', completed: false };
      s_progress.toolExecutions[executionKey] = entry;
      s_progress.activeToolExecutionIds.push(executionKey);
    } else {
      entry.label = s_progress.currentTool;
      entry.detail = detail || '';
    }
    s_progress.currentToolExecutionId = executionKey;
  } else {
    s_progress.currentTool = current || 'thinking';
    s_progress.currentToolExecutionId = '';
    s_progress.currentToolRemembered = false;
  }
  progressSet(requestId, current, detail);
}

function progressSet(requestId, current, detail) {
  if (!isCurrentRequest(requestId)) {
    return;
  }

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
  if (!isCurrentRequest(requestId)) {
    return;
  }

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

function progressDone(requestId, current, detail, toolExecutionId) {
  var toolName;
  var executionKey;
  var entry;
  var active;

  if (!isCurrentRequest(requestId) || !s_progress.active || s_progress.requestId !== requestId) {
    return;
  }

  if (toolExecutionId !== undefined && toolExecutionId !== null && String(toolExecutionId)) {
    executionKey = String(toolExecutionId);
    entry = s_progress.toolExecutions[executionKey];
    if (!entry || entry.completed) {
      return;
    }
    entry.completed = true;
    s_progress.toolHistory.push(entry.label);
    removeActiveToolExecution(executionKey);

    if (s_progress.currentToolExecutionId === executionKey) {
      active = findActiveToolExecution();
      if (active) {
        s_progress.currentToolExecutionId = active.id;
        s_progress.currentTool = active.entry.label;
        s_progress.current = active.entry.label;
        s_progress.detail = active.entry.detail;
      } else {
        s_progress.currentToolExecutionId = executionKey;
      }
    }
    sendProgressState(requestId, s_progress.current, s_progress.detail, false);
    return;
  }

  // Preserve the legacy single-tool path without recounting identified runs.
  if (s_progress.currentToolExecutionId && s_progress.toolExecutions[s_progress.currentToolExecutionId]) {
    return;
  }
  toolName = s_progress.currentTool;
  if (toolName && !s_progress.currentToolRemembered) {
    s_progress.toolHistory.push(toolName);
    s_progress.currentToolRemembered = true;
  }
}

function progressStop(requestId) {
  if (Number(s_progress.requestId) !== Number(requestId)) {
    return;
  }

  s_progress.active = false;
  s_progress.current = '';
  s_progress.detail = '';
  s_progress.toolHistory = [];
  s_progress.currentTool = '';
  s_progress.currentToolRemembered = false;
  s_progress.toolExecutions = Object.create(null);
  s_progress.activeToolExecutionIds = [];
  s_progress.currentToolExecutionId = '';
  s_progress.inputContextSize = '';
  s_progress.outputContextSize = '';
}

function sendError(requestId, message, onDone, retryAvailable) {
  var completed = false;

  function complete(error) {
    if (completed) {
      return;
    }
    completed = true;
    if (onDone) {
      onDone(error || null);
    }
  }

  progressStop(requestId);
  common.logDebug('watch error request=' + requestId + ' message=' + String(message).substring(0, 160));
  sendReset(requestId, function() {
    sendMessage({
      ResponseError: String(message).substring(0, CHUNK_SIZE),
      RetryAvailable: retryAvailable ? 1 : 0,
      RequestId: requestId
    }, function() {
      complete(null);
    }, complete);
  }, complete);
}

function sendResponse(requestId, settings, text, onDone, onTransferFailure) {
  var formatted = formatResponseForWatch(text, maxResponseCharsForFontSize(settings));

  common.logDebug('send response request=' + requestId + ' chars=' + formatted.text.length + ' limit=' + maxResponseCharsForFontSize(settings) + ' truncated=' + (formatted.truncated ? 1 : 0));
  sendPreparedResponse(requestId, formatted.text, onDone, onTransferFailure);
}

function sendPreparedResponse(requestId, text, onDone, onTransferFailure) {
  progressStop(requestId);
  common.logDebug('send prepared response request=' + requestId + ' chars=' + String(text || '').length);
  sendWatchText(requestId, text, true, onDone, onTransferFailure);
}

function requestHealthInfo(query, requestId, callback) {
  var healthRequestId;
  var key;
  var dict;

  if (!Pebble.sendAppMessage) {
    callback('Health Info requires AppMessage');
    return;
  }
  if (!isCurrentRequest(requestId)) {
    return;
  }

  healthRequestId = s_health_info_request_id;
  s_health_info_request_id += 1;
  if (s_health_info_request_id > 2147480000) {
    s_health_info_request_id = 1;
  }

  key = String(healthRequestId);
  s_pending_health_info[key] = {
    requestId: requestId,
    callback: callback,
    timeout: setTimeout(function() {
      var pending = clearPendingHealthInfo(key);
      if (pending && isCurrentRequest(pending.requestId)) {
        pending.callback('Health Info request timed out');
      }
    }, HEALTH_INFO_TIMEOUT_MS)
  };

  dict = {
    RequestId: requestId,
    HealthSummaryRequest: healthRequestId,
    HealthStartUnix: query.startUnix,
    HealthEndUnix: query.endUnix,
    HealthQueryMask: query.queryMask,
    HealthAverageScope: query.averageScope || 0,
    HealthSessionOffset: query.sessionOffset || 0
  };

  common.logDebug('health info request token=' + healthRequestId + ' start=' + query.startUnix + ' end=' + query.endUnix + ' mask=' + query.queryMask + ' scope=' + (query.averageScope || 0) + ' offset=' + (query.sessionOffset || 0));
  sendMessage(dict, null, function(e) {
    var pending = clearPendingHealthInfo(key);
    if (pending && isCurrentRequest(pending.requestId)) {
      pending.callback('Health Info send failed: ' + ((e && (e.error || e.message)) || 'AppMessage failed'));
    }
  });
}

function handleHealthInfoResponse(dict) {
  var key = String(dict.HealthSummaryRequest || 0);
  var pending = s_pending_health_info[key];
  var callback;

  if (!pending) {
    common.logDebug('unexpected health info response token=' + key);
    return;
  }

  if (dictHasRequestId(dict) && Number(dict.RequestId) !== Number(pending.requestId)) {
    return;
  }
  pending = clearPendingHealthInfo(key);
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

  callback('Health Info response missing data');
}

module.exports = {
  dictHasRequestId: dictHasRequestId,
  isCurrentRequest: isCurrentRequest,
  beginRequestLifecycle: beginRequestLifecycle,
  finishRequestLifecycle: finishRequestLifecycle,
  cancelRequestLifecycle: cancelRequestLifecycle,
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
  sendPreparedResponse: sendPreparedResponse,
  sendPastChats: sendPastChats,
  sendPastChatsError: sendPastChatsError,
  sendPastChatDeleted: sendPastChatDeleted,
  sendPastChatTranscript: sendPastChatTranscript,
  requestHealthInfo: requestHealthInfo,
  handleHealthInfoResponse: handleHealthInfoResponse,
  requestActionApproval: requestActionApproval,
  handleActionApprovalResponse: handleActionApprovalResponse
};
