var common = require('./settings');
var watch = require('./watch');
var tools = require('./tools');
var chatStore = require('./chat_store');
var endpointCache = require('./endpoint_cache');
var opencodeSession = require('./opencode_session');

var CANDIDATE_PROTOCOL_ORDER = ['responses', 'chat', 'messages'];
var CANONICAL_SUFFIX_BY_PROTOCOL = {
  responses: '/responses',
  chat: '/chat/completions',
  messages: '/messages'
};
var CACHE_PROTOCOL_NAMES = { 'responses': true, 'chat-completions': true, 'messages': true };

var s_chat_history = [];
var s_saved_chat_history = [];
var s_active_chat_id = null;
var s_conversation_generation = 0;
var s_active_completion = null;
var s_retry_capsule = null;
var s_native_unsupported_keys = {};
var MAX_TOOL_RESULT_CHARS = 6000;
var MAX_TOOL_RESULTS_TOTAL_CHARS = 12000;
var MAX_RETRY_CAPSULE_BYTES = 64 * 1024;
var MAX_RETRY_CAPSULE_NODES = 4096;
var MAX_RETRY_CAPSULE_DEPTH = 32;
var TOOL_RESULT_TRUNCATION_SUFFIX = '... [truncated]';
var TOOL_RESULT_ERROR_RESERVE_CHARS = 96;
var TOOL_RESULT_ERROR_OMISSION = 'Tool result omitted: budget exhausted';
var TOOL_ERROR_OMISSION = 'Tool error omitted: exceeds reserved allowance';
var TOOL_CAP_NOTICE = 'Tool call budget exhausted. Answer using gathered results.';
var DEFAULT_MESSAGES_MAX_TOKENS = 4096;
var ANTHROPIC_API_VERSION = '2023-06-01';
var NATIVE_UNSUPPORTED_TTL_MS = 5 * 60 * 1000;

function nativeUnsupportedKey(settings) {
  return String((settings && settings.Endpoint) || '').toLowerCase() + '|' +
    String((settings && settings.ApiMode) || 'auto') + '|' +
    String((settings && settings.Model) || '');
}

function isNativeToolsUnsupported(settings) {
  var key = nativeUnsupportedKey(settings);
  var markedAt = s_native_unsupported_keys[key];

  if (!markedAt) {
    return false;
  }
  if (new Date().getTime() - markedAt > NATIVE_UNSUPPORTED_TTL_MS) {
    delete s_native_unsupported_keys[key];
    return false;
  }
  return true;
}

function markNativeToolsUnsupported(settings) {
  if (Object.keys(s_native_unsupported_keys).length >= 32) {
    s_native_unsupported_keys = {};
  }
  s_native_unsupported_keys[nativeUnsupportedKey(settings)] = new Date().getTime();
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

function hasTimelineTools(tools) {
  var i;

  for (i = 0; i < tools.length; i += 1) {
    if (String(tools[i].name || '').indexOf('pebble_timeline_') === 0) {
      return true;
    }
  }

  return false;
}

function buildToolGuidance(toolDefinitions, maxToolCalls) {
  var text;

  if (!toolDefinitions.length || maxToolCalls <= 0) {
    return '';
  }

  text = '\n\nPhone-side tools are available.' +
    '\nOnly phone-side tools listed here are enabled in app settings.' +
    '\nYou may use at most ' + maxToolCalls + ' tool call(s) total for this request.';

  if (hasTimelineTools(toolDefinitions)) {
    text += '\nTimeline tool rules:' +
      '\n- For reminder requests or phrases like "remind me", call pebble_timeline_create_reminder.' +
      '\n- This creates a scheduled Pebble Timeline reminder notification attached to a pin, not an OS/system alarm. For an alarm request, explain this limitation and offer the Timeline reminder as the available alternative; never claim a system alarm was set.' +
      '\n- Set reminderTime for an exact notification time, remindMinutesBefore for relative timing (0 means pin time), or omit both to use time.' +
      '\n- For events without a scheduled reminder, call pebble_timeline_create_pin.' +
      '\n- Creation tools always make new pins with generated ids; never supply an id when creating.' +
      '\n- To change an existing pin, first call pebble_timeline_list_pins and use a listed id with pebble_timeline_edit_pin. Only supplied fields change; other fields stay as stored.' +
      '\n- Empty string clears supported optional text fields; integer and enum fields cannot be cleared with empty string. Use clearReminder:true to remove scheduled alerts.' +
      '\n- Do not say a reminder, event, or pin was created, updated, or deleted unless the timeline tool result succeeded. Local acceptance does not confirm watch delivery.' +
      '\n- After a successful timeline tool result, include the title/time when known and the returned pin id.' +
      '\n- If title, time, or target pin is ambiguous, ask one concise clarification instead of calling a tool.';
  }

  return text;
}

function buildToolInstructions(toolDefinitions, maxToolCalls, nativeTools) {
  var text = buildToolGuidance(toolDefinitions, maxToolCalls);
  var i;

  if (!text || nativeTools) {
    return text;
  }

  text += '\nIf a tool is needed, respond with only JSON in this exact shape:' +
    '\n{"tool_calls":[{"id":"call_1","name":"tool_name","arguments":{}}]}' +
    '\nDo not include markdown, explanation, or final answer with tool call JSON. After tool results are provided, answer the user normally or request more tools with the same JSON shape.';

  text += '\nAvailable tools:';

  for (i = 0; i < toolDefinitions.length; i += 1) {
    text += '\n- ' + toolDefinitions[i].name + ': ' + toolDefinitions[i].description + '\n  Parameters JSON Schema: ' + common.safeJson(toolDefinitions[i].parameters);
  }

  text += '\nCurrent phone date/time: ' + formatDateTime(new Date()) + '.';

  return text;
}

function buildSystemPrompt(settings, toolInstructions) {
  var prompt = expandSystemPromptVariables(settings.SystemPrompt);
  return prompt + (toolInstructions || '');
}

function endpointProtocol(settings) {
  var path;
  var suffix;

  if (settings && settings.ApiMode === 'chat-completions') {
    return 'chat';
  }
  if (settings && settings.ApiMode === 'responses') {
    return 'responses';
  }
  if (settings && settings.ApiMode === 'messages') {
    return 'messages';
  }

  path = String((settings && settings.Endpoint) || '').toLowerCase();
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(path)) {
    path = path.replace(/^[a-z][a-z0-9+.-]*:\/\/[^\/]*/, '');
  }
  path = path.split('#')[0].split('?')[0];
  while (path.length > 1 && path.charAt(path.length - 1) === '/') {
    path = path.substring(0, path.length - 1);
  }

  suffix = '/chat/completions';
  if (path.length >= suffix.length && path.substring(path.length - suffix.length) === suffix) {
    return 'chat';
  }
  suffix = '/messages';
  if (path.length >= suffix.length && path.substring(path.length - suffix.length) === suffix) {
    return 'messages';
  }

  return 'responses';
}

function internalProtocolFromCacheName(name) {
  if (!CACHE_PROTOCOL_NAMES[name]) {
    return '';
  }
  return name === 'chat-completions' ? 'chat' : name;
}

function cacheProtocolNameFromInternal(protocol) {
  return protocol === 'chat' ? 'chat-completions' : protocol;
}

function isExplicitApiMode(settings) {
  var mode = String((settings && settings.ApiMode) || '');
  return mode === 'responses' || mode === 'chat-completions' || mode === 'messages';
}

function analyzeConfiguredEndpoint(endpoint) {
  var raw = String(endpoint === undefined || endpoint === null ? '' : endpoint);
  var queryIndex = raw.indexOf('?');
  var hashIndex = raw.indexOf('#');
  var cutIndex;
  var main;
  var tail;
  var schemeMatch;
  var rest;
  var slashIndex;
  var authority;
  var path;
  var trailingSlashes;
  var trimmedPath;
  var loweredPath;
  var suffixes = [
    ['responses', '/responses'],
    ['chat', '/chat/completions'],
    ['messages', '/messages']
  ];
  var i;
  var entry;
  var offset;

  if (queryIndex === -1 && hashIndex === -1) {
    main = raw;
    tail = '';
  } else {
    if (queryIndex === -1) {
      cutIndex = hashIndex;
    } else if (hashIndex === -1) {
      cutIndex = queryIndex;
    } else {
      cutIndex = queryIndex < hashIndex ? queryIndex : hashIndex;
    }
    main = raw.substring(0, cutIndex);
    tail = raw.substring(cutIndex);
  }

  schemeMatch = /^[A-Za-z][A-Za-z0-9+\-.]*:\/\//.exec(main);
  if (!schemeMatch) {
    return null;
  }

  rest = main.substring(schemeMatch[0].length);
  slashIndex = rest.indexOf('/');
  if (slashIndex === -1) {
    authority = rest;
    path = '';
  } else {
    authority = rest.substring(0, slashIndex);
    path = rest.substring(slashIndex);
  }
  if (!authority) {
    return null;
  }

  trailingSlashes = 0;
  while (path.length - trailingSlashes > 0 && path.charAt(path.length - 1 - trailingSlashes) === '/') {
    trailingSlashes += 1;
  }
  trimmedPath = path.substring(0, path.length - trailingSlashes);
  loweredPath = trimmedPath.toLowerCase();

  for (i = 0; i < suffixes.length; i += 1) {
    entry = suffixes[i];
    offset = loweredPath.length - entry[1].length;
    if (offset >= 0 && loweredPath.substring(offset) === entry[1]) {
      return {
        protocol: entry[0],
        root: main.substring(0, main.length - trailingSlashes - entry[1].length),
        tail: tail
      };
    }
  }

  return null;
}

function shallowCopySettings(source) {
  var copy = {};
  var key;

  source = source || {};
  for (key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      copy[key] = source[key];
    }
  }

  return copy;
}

function buildEndpointPlan(settings) {
  var plan = {
    rotationActive: false,
    originalEndpoint: String((settings && settings.Endpoint) || ''),
    candidates: []
  };
  var info;
  var order;
  var seen;
  var rememberedRaw;
  var remembered;
  var i;
  var protocol;

  function pushCandidate(protocolName, url) {
    var attemptSettings = shallowCopySettings(settings);
    attemptSettings.Endpoint = url;
    plan.candidates.push({ protocol: protocolName, settings: attemptSettings });
  }

  function addProtocol(protocolName) {
    if (!seen[protocolName]) {
      seen[protocolName] = true;
      order.push(protocolName);
    }
  }

  if (!settings || !settings.Endpoint) {
    pushCandidate(endpointProtocol(settings), '');
    return plan;
  }

  info = analyzeConfiguredEndpoint(settings.Endpoint);
  if (!info || isExplicitApiMode(settings)) {
    pushCandidate(endpointProtocol(settings), settings.Endpoint);
    return plan;
  }

  plan.rotationActive = true;
  seen = {};
  order = [];

  rememberedRaw = endpointCache.get(settings.Endpoint, settings.Model);
  remembered = internalProtocolFromCacheName(String(rememberedRaw));
  if (!remembered) {
    addProtocol(info.protocol);
  } else {
    addProtocol(remembered);
  }
  for (i = 0; i < CANDIDATE_PROTOCOL_ORDER.length; i += 1) {
    addProtocol(CANDIDATE_PROTOCOL_ORDER[i]);
  }

  for (i = 0; i < order.length; i += 1) {
    protocol = order[i];
    if (protocol === info.protocol) {
      pushCandidate(protocol, settings.Endpoint);
    } else {
      pushCandidate(protocol, info.root + CANONICAL_SUFFIX_BY_PROTOCOL[protocol] + info.tail);
    }
  }

  return plan;
}

function isChatEndpoint(settings) {
  return endpointProtocol(settings) === 'chat';
}

function isMessagesEndpoint(settings) {
  return endpointProtocol(settings) === 'messages';
}

function endpointHost(settings) {
  var endpoint = String((settings && settings.Endpoint) || '');
  var match;

  try {
    match = endpoint.match(/^https?:\/\/([^\/]+)/i);
    return match ? match[1].toLowerCase() : '';
  } catch (e) {
    return '';
  }
}

function isOpenAiResponsesEndpoint(settings) {
  if (endpointProtocol(settings) !== 'responses') {
    return false;
  }
  return endpointHost(settings) === 'api.openai.com';
}

function shouldRequestReasoningSummary(settings, options) {
  return !!(settings && settings.ShowThinking) &&
    endpointProtocol(settings) === 'responses' &&
    !(options && options.skipReasoningSummary);
}

function copyRequestOptions(options) {
  var result = {};
  var key;

  options = options || {};
  for (key in options) {
    if (options.hasOwnProperty(key)) {
      result[key] = options[key];
    }
  }

  return result;
}

function buildConversation(settings, userText, toolInstructions, history) {
  var conversation = [
    { role: 'system', content: buildSystemPrompt(settings, toolInstructions) }
  ];
  var i;

  history = history || s_chat_history;
  for (i = 0; i < history.length; i += 1) {
    conversation.push(history[i]);
  }

  conversation.push({ role: 'user', content: userText });
  return conversation;
}

function historyTotalChars(history) {
  var total = 0;
  var i;

  for (i = 0; i < history.length; i += 1) {
    total += String((history[i] && history[i].content) || '').length;
  }

  return total;
}

function trimHistoryByCountAndChars(history) {
  while (history.length > common.MAX_CHAT_HISTORY_MESSAGES) {
    history.splice(0, 2);
  }

  while (history.length >= 2 && historyTotalChars(history) > common.MAX_CHAT_HISTORY_TOTAL_CHARS) {
    history.splice(0, 2);
  }
}

function appendChatTurn(history, userText, assistantText) {
  history.push({
    role: 'user',
    content: common.truncate(userText, common.MAX_CHAT_HISTORY_MESSAGE_CHARS)
  });
  history.push({
    role: 'assistant',
    content: common.truncate(assistantText, common.MAX_CHAT_HISTORY_MESSAGE_CHARS)
  });

  trimHistoryByCountAndChars(history);
}

function copyChatHistory(messages) {
  var result = [];
  var i;
  var message;

  messages = messages || [];
  for (i = 0; i < messages.length; i += 1) {
    message = messages[i] || {};
    if (message.role !== 'user' && message.role !== 'assistant') {
      continue;
    }
    result.push({
      role: message.role,
      content: common.truncate(message.content || '', common.MAX_CHAT_HISTORY_MESSAGE_CHARS)
    });
  }

  trimHistoryByCountAndChars(result);

  return result;
}

function rememberChatTurn(settings, userText, assistantText) {
  var saved;
  var answerOnly = stripThinkingWrapper(assistantText);

  appendChatTurn(s_chat_history, userText, answerOnly);

  if (!settings.PreserveChats) {
    return;
  }

  appendChatTurn(s_saved_chat_history, userText, answerOnly);
  saved = chatStore.saveChatHistory(s_active_chat_id, s_saved_chat_history);
  if (saved) {
    s_active_chat_id = saved.id;
  }
}

function clearCompletionTimers(context) {
  var timers;
  var i;

  if (!context || !context.timers) {
    return;
  }

  timers = context.timers.slice();
  context.timers = [];
  for (i = 0; i < timers.length; i += 1) {
    clearTimeout(timers[i].id);
  }
}

function removeCompletionTimer(context, timer) {
  var i;

  if (!context || !context.timers) {
    return;
  }
  for (i = context.timers.length - 1; i >= 0; i -= 1) {
    if (context.timers[i] === timer) {
      context.timers.splice(i, 1);
      return;
    }
  }
}

function scheduleCompletionTimer(context, callback, delayMs) {
  var timer = { id: null };
  var fired = false;

  timer.id = setTimeout(function() {
    fired = true;
    removeCompletionTimer(context, timer);
    if (isCurrentCompletion(context)) {
      callback();
    }
  }, delayMs);
  if (!fired) {
    context.timers.push(timer);
  }
}

function isCurrentCompletion(context) {
  return !!context && s_active_completion === context &&
    context.generation === s_conversation_generation &&
    watch.isCurrentRequest(context.requestId);
}

function cloneJsonValue(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (e) {
    return null;
  }
}

function addRetryCapsuleBytes(state, amount) {
  if (amount < 0 || state.bytes + amount > MAX_RETRY_CAPSULE_BYTES) {
    return false;
  }
  state.bytes += amount;
  return true;
}

function addRetryCapsuleString(state, value) {
  var i;
  var code;
  var next;

  if (typeof value !== 'string' || value.length > MAX_RETRY_CAPSULE_BYTES ||
      !addRetryCapsuleBytes(state, 2)) {
    return false;
  }
  for (i = 0; i < value.length; i += 1) {
    code = value.charCodeAt(i);
    if (code === 0x22 || code === 0x5c) {
      if (!addRetryCapsuleBytes(state, 2)) { return false; }
    } else if (code < 0x20) {
      if (!addRetryCapsuleBytes(state,
          code === 0x08 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d ? 2 : 6)) {
        return false;
      }
    } else if (code <= 0x7f) {
      if (!addRetryCapsuleBytes(state, 1)) { return false; }
    } else if (code <= 0x7ff) {
      if (!addRetryCapsuleBytes(state, 2)) { return false; }
    } else if (code >= 0xd800 && code <= 0xdbff) {
      next = i + 1 < value.length ? value.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        if (!addRetryCapsuleBytes(state, 4)) { return false; }
        i += 1;
      } else if (!addRetryCapsuleBytes(state, 6)) {
        return false;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      if (!addRetryCapsuleBytes(state, 6)) { return false; }
    } else if (!addRetryCapsuleBytes(state, 3)) {
      return false;
    }
  }
  return true;
}

function cloneBoundedRetryValue(value, state, depth) {
  var type;
  var result;
  var key;
  var child;
  var count = 0;
  var separator = false;
  var i;
  var numberText;

  if (depth > MAX_RETRY_CAPSULE_DEPTH || state.nodes >= MAX_RETRY_CAPSULE_NODES) {
    return undefined;
  }
  state.nodes += 1;
  if (value === null) {
    return addRetryCapsuleBytes(state, 4) ? null : undefined;
  }

  type = typeof value;
  if (type === 'string') {
    return addRetryCapsuleString(state, value) ? value : undefined;
  }
  if (type === 'boolean') {
    return addRetryCapsuleBytes(state, value ? 4 : 5) ? value : undefined;
  }
  if (type === 'number') {
    if (!isFinite(value)) { return undefined; }
    numberText = String(value);
    return addRetryCapsuleBytes(state, numberText.length) ? value : undefined;
  }
  if (type !== 'object') {
    return undefined;
  }

  if (Object.prototype.toString.call(value) === '[object Array]') {
    if (value.length > MAX_RETRY_CAPSULE_NODES - state.nodes ||
        !addRetryCapsuleBytes(state, 1)) {
      return undefined;
    }
    result = [];
    for (i = 0; i < value.length; i += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, i) ||
          (i > 0 && !addRetryCapsuleBytes(state, 1))) {
        return undefined;
      }
      child = cloneBoundedRetryValue(value[i], state, depth + 1);
      if (child === undefined) { return undefined; }
      result.push(child);
    }
    return addRetryCapsuleBytes(state, 1) ? result : undefined;
  }
  if (Object.prototype.toString.call(value) !== '[object Object]' ||
      !addRetryCapsuleBytes(state, 1)) {
    return undefined;
  }

  result = Object.create(null);
  for (key in value) {
    count += 1;
    if (count > MAX_RETRY_CAPSULE_NODES || state.nodes >= MAX_RETRY_CAPSULE_NODES) {
      return undefined;
    }
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      continue;
    }
    if ((separator && !addRetryCapsuleBytes(state, 1)) ||
        !addRetryCapsuleString(state, key) || !addRetryCapsuleBytes(state, 1)) {
      return undefined;
    }
    child = cloneBoundedRetryValue(value[key], state, depth + 1);
    if (child === undefined) { return undefined; }
    result[key] = child;
    separator = true;
  }
  return addRetryCapsuleBytes(state, 1) ? result : undefined;
}

function cloneBoundedRetryCapsule(capsule) {
  var state = { bytes: 0, nodes: 0 };
  var copy = cloneBoundedRetryValue(capsule, state, 0);
  var serialized;
  var bytes = 0;
  var i;
  var code;
  var next;

  if (copy === undefined) {
    return null;
  }
  try {
    serialized = JSON.stringify(copy);
  } catch (e) {
    return null;
  }
  if (typeof serialized !== 'string' || serialized.length > MAX_RETRY_CAPSULE_BYTES) {
    return null;
  }
  for (i = 0; i < serialized.length; i += 1) {
    code = serialized.charCodeAt(i);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < serialized.length &&
        (next = serialized.charCodeAt(i + 1)) >= 0xdc00 && next <= 0xdfff) {
      bytes += 4;
      i += 1;
    } else {
      bytes += 3;
    }
    if (bytes > MAX_RETRY_CAPSULE_BYTES) {
      return null;
    }
  }
  return copy;
}

function storeRetryCapsule(capsule) {
  var copy;

  s_retry_capsule = null;
  copy = cloneBoundedRetryCapsule(capsule);
  if (!copy) {
    common.logDebug('retry capsule rejected by size or shape limit');
    return false;
  }
  s_retry_capsule = copy;
  return true;
}

function rememberModelFailure(context) {
  var state = context && context.retryState;

  if (!state) {
    s_retry_capsule = null;
    return false;
  }
  if (!state.toolsStarted) {
    return rememberBeforeToolsFailure(context);
  }
  return storeRetryCapsule({
    requestId: context.requestId,
    generation: context.generation,
    kind: 'final-only',
    conversation: state.baseConversation || state.conversation,
    settings: state.settings,
    userText: context.userText,
    mode: state.mode || 'text',
    thinkingTrace: state.thinkingTrace || ''
  });
}

function rememberBeforeToolsFailure(context) {
  return storeRetryCapsule({
    requestId: context.requestId,
    generation: context.generation,
    kind: 'before-tools',
    userText: context.userText,
    history: context.historyAtStart
  });
}

function rememberSetupFailure(context) {
  return storeRetryCapsule({
    requestId: context.requestId,
    generation: context.generation,
    kind: 'setup',
    userText: context.userText,
    history: context.historyAtStart
  });
}

function rememberDeliveryFailure(context, settings, userText, text, answerText) {
  return storeRetryCapsule({
    requestId: context.requestId,
    generation: context.generation,
    kind: 'delivery',
    settings: { PreserveChats: !!settings.PreserveChats },
    userText: userText,
    text: String(text || ''),
    answerText: String(answerText || '')
  });
}

function setModelRetryState(context, settings, conversation, mode, thinkingTrace,
                            baseConversation) {
  context.retryState = {
    settings: settings,
    conversation: conversation,
    baseConversation: baseConversation || null,
    mode: mode,
    thinkingTrace: thinkingTrace,
    toolsStarted: context.toolsStarted === true
  };
}

function sendCompletionResponse(context, settings, userText, text) {
  watch.sendResponse(context.requestId, settings, text, function(sendError) {
    if (!sendError && isCurrentCompletion(context)) {
      s_retry_capsule = null;
      rememberChatTurn(settings, userText, text);
    }
    finishCompletionContext(context);
  }, function(sendError, preparedText) {
    if (!sendError || !isCurrentCompletion(context)) {
      return false;
    }
    return rememberDeliveryFailure(context, settings, userText, preparedText, text);
  });
}

function finishCompletionContext(context) {
  clearCompletionTimers(context);
  if (s_active_completion !== context) {
    return;
  }
  s_active_completion = null;
  watch.finishRequestLifecycle(context.requestId);
}

function failCompletionContext(context, message) {
  var retryAvailable;

  if (!isCurrentCompletion(context)) {
    return;
  }
  if (context.retryKind === 'setup') {
    rememberSetupFailure(context);
  } else if (context.retryKind === 'before-tools') {
    rememberBeforeToolsFailure(context);
  }
  if (s_retry_capsule && Number(s_retry_capsule.requestId) === Number(context.requestId) &&
      s_retry_capsule.generation !== context.generation) {
    s_retry_capsule = null;
  }
  retryAvailable = !!(s_retry_capsule &&
      Number(s_retry_capsule.requestId) === Number(context.requestId) &&
      s_retry_capsule.generation === context.generation);
  watch.sendError(context.requestId, message, function() {
    finishCompletionContext(context);
  }, retryAvailable);
}

function invalidateConversationGeneration() {
  var context = s_active_completion;

  s_conversation_generation += 1;
  s_retry_capsule = null;
  s_active_completion = null;
  if (context) {
    clearCompletionTimers(context);
    watch.cancelRequestLifecycle(context.requestId);
  }
}

function resetChatHistory() {
  invalidateConversationGeneration();
  s_chat_history = [];
  s_saved_chat_history = [];
  s_active_chat_id = null;
  opencodeSession.rotateConversationSessionId();
}

function listSavedChats() {
  return chatStore.listChats();
}

function loadSavedChat(chatId) {
  var chat = chatStore.getChat(chatId);

  if (!chat) {
    return null;
  }

  invalidateConversationGeneration();
  s_chat_history = copyChatHistory(chat.messages);
  s_saved_chat_history = copyChatHistory(chat.messages);
  s_active_chat_id = chat.id;
  opencodeSession.rotateConversationSessionId();
  return chat;
}

function deleteSavedChat(chatId) {
  var deleted = chatStore.deleteChat(chatId);

  if (deleted) {
    s_retry_capsule = null;
  }
  if (deleted && s_active_chat_id === String(chatId || '')) {
    invalidateConversationGeneration();
    s_active_chat_id = null;
    s_saved_chat_history = [];
    opencodeSession.rotateConversationSessionId();
  }

  return deleted;
}

function deleteAllSavedChats() {
  invalidateConversationGeneration();
  chatStore.deleteAllChats();
  s_active_chat_id = null;
  s_saved_chat_history = [];
  opencodeSession.rotateConversationSessionId();
}

function normalizeToolParameters(parameters) {
  if (!parameters || typeof parameters !== 'object') {
    return { type: 'object', properties: {} };
  }

  if (!parameters.type) {
    parameters.type = 'object';
  }
  if (parameters.type === 'object' && !parameters.properties) {
    parameters.properties = {};
  }

  return parameters;
}

function buildNativeTools(toolDefinitions, protocol) {
  var result = [];
  var i;
  var tool;
  var definition;

  for (i = 0; i < toolDefinitions.length; i += 1) {
    tool = toolDefinitions[i] || {};
    definition = {
      name: tool.name,
      description: tool.description || 'Phone-side tool',
      parameters: normalizeToolParameters(tool.parameters)
    };

    if (protocol === 'chat') {
      result.push({
        type: 'function',
        function: definition
      });
    } else if (protocol === 'messages') {
      result.push({
        name: definition.name,
        description: definition.description,
        input_schema: definition.parameters
      });
    } else {
      result.push({
        type: 'function',
        name: definition.name,
        description: definition.description,
        parameters: definition.parameters
      });
    }
  }

  return result;
}

function buildReasoningObject(settings, options) {
  var reasoning = {};
  var effort;

  if (shouldRequestReasoningSummary(settings, options)) {
    reasoning.summary = 'auto';
  }

  effort = common.REASONING_EFFORTS && common.REASONING_EFFORTS.hasOwnProperty(settings.ReasoningEffort)
    ? common.REASONING_EFFORTS[settings.ReasoningEffort]
    : '';
  if (effort) {
    reasoning.effort = effort;
  }

  return Object.keys(reasoning).length ? reasoning : null;
}

function responsesTextFromContent(content) {
  var text = '';
  var i;

  if (typeof content === 'string') {
    return content;
  }
  if (!content || !content.length) {
    return '';
  }
  for (i = 0; i < content.length; i += 1) {
    if (content[i] && typeof content[i].text === 'string') {
      text += content[i].text;
    } else if (typeof content[i] === 'string') {
      text += content[i];
    }
  }
  return text;
}

function extractSystemPrompt(conversation) {
  if (conversation.length && conversation[0] && conversation[0].role === 'system') {
    return responsesTextFromContent(conversation[0].content);
  }

  return '';
}

function toResponsesInput(conversation) {
  var input = [];
  var i;
  var item;
  var j;
  var part;
  var content;

  for (i = 0; i < conversation.length; i += 1) {
    item = conversation[i] || {};
    if (item.type) {
      input.push(item);
      continue;
    }
    if (item.role !== 'system' && item.role !== 'developer' && item.role !== 'user' && item.role !== 'assistant') {
      continue;
    }
    if (typeof item.content === 'string') {
      content = [{ type: item.role === 'assistant' ? 'output_text' : 'input_text', text: item.content }];
      input.push({ role: item.role, content: content });
      continue;
    }
    if (item.content && item.content.length) {
      content = [];
      for (j = 0; j < item.content.length; j += 1) {
        part = item.content[j] || {};
        if (part.type === 'text') {
          content.push({ type: item.role === 'assistant' ? 'output_text' : 'input_text', text: String(part.text || '') });
        } else {
          content.push(part);
        }
      }
      input.push({ role: item.role, content: content });
      continue;
    }
    content = [{ type: item.role === 'assistant' ? 'output_text' : 'input_text', text: '' }];
    input.push({ role: item.role, content: content });
  }

  return input;
}

function collectRoleTurns(conversation) {
  var turns = [];
  var i;

  for (i = 0; i < conversation.length; i += 1) {
    if (conversation[i] && (conversation[i].role === 'user' || conversation[i].role === 'assistant')) {
      turns.push(conversation[i]);
    }
  }

  return turns;
}

function buildMessagesMaxTokens(settings) {
  if (settings.MaxOutputTokens && settings.MaxOutputTokens > 0) {
    return settings.MaxOutputTokens;
  }

  return DEFAULT_MESSAGES_MAX_TOKENS;
}

function buildBody(settings, conversation, options) {
  var chatMode = isChatEndpoint(settings);
  var protocol = endpointProtocol(settings);
  var body;
  var reasoning;
  var tools;

  options = options || {};

  if (chatMode) {
    body = {
      model: settings.Model,
      messages: conversation
    };
    if (options.nativeTools && options.toolDefinitions && options.toolDefinitions.length) {
      body.tools = buildNativeTools(options.toolDefinitions, 'chat');
    }
    if (settings.MaxOutputTokens && settings.MaxOutputTokens > 0) {
      body.max_completion_tokens = settings.MaxOutputTokens;
    }
    return body;
  }

  if (protocol === 'messages') {
    body = {
      model: settings.Model,
      max_tokens: buildMessagesMaxTokens(settings),
      system: extractSystemPrompt(conversation),
      messages: collectRoleTurns(conversation)
    };
    if (options.nativeTools && options.toolDefinitions && options.toolDefinitions.length) {
      body.tools = buildNativeTools(options.toolDefinitions, 'messages');
    }
    return body;
  }

  body = {
    model: settings.Model,
    input: toResponsesInput(conversation)
  };

  reasoning = buildReasoningObject(settings, options);
  if (reasoning) {
    body.reasoning = reasoning;
    if (isOpenAiResponsesEndpoint(settings)) {
      reasoning.encrypted_content = 'auto';
    }
  }

  tools = [];
  if (options.nativeTools && options.toolDefinitions && options.toolDefinitions.length) {
    tools = buildNativeTools(options.toolDefinitions, 'responses');
  }
  if (tools.length) {
    body.tools = tools;
  }

  if (settings.MaxOutputTokens && settings.MaxOutputTokens > 0) {
    body.max_output_tokens = settings.MaxOutputTokens;
  }

  if (isOpenAiResponsesEndpoint(settings)) {
    body.store = false;
  }

  return body;
}

function isTransientHttpStatus(status) {
  return status === 408 || status === 429 || (status >= 500 && status < 600);
}

function parseRetryAfterMs(request) {
  var raw;
  var seconds;

  try {
    raw = request.getResponseHeader('Retry-After');
  } catch (e) {
    raw = null;
  }

  if (!raw) {
    return 0;
  }

  seconds = parseInt(raw, 10);
  if (isNaN(seconds) || seconds < 0) {
    return 0;
  }

  return Math.min(seconds * 1000, common.MAX_RETRY_AFTER_MS);
}

function requestModel(settings, conversation, requestId, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  options = options || {};

  var done = false;
  var reasoningSummarySkipped = false;
  var transientRetried = false;
  var plan = buildEndpointPlan(settings);
  var completionContext = s_active_completion && s_active_completion.requestId === requestId ? s_active_completion : null;

  function finishOnce(error, json, meta) {
    if (done) {
      return;
    }
    done = true;
    if (!isCurrentCompletion(completionContext)) {
      return;
    }
    if (error) {
      rememberModelFailure(completionContext);
    }
    callback(error, json, meta);
  }

  function scheduleTransientRetry(runAttempt, delayMs) {
    transientRetried = true;
    scheduleCompletionTimer(completionContext, function() {
      if (done) {
        return;
      }
      runAttempt();
    }, delayMs);
  }

  function attempt(candidateIndex, skipReasoningSummary) {
    var candidate = plan.candidates[candidateIndex];
    var attemptSettings = candidate.settings;
    var request = new XMLHttpRequest();
    var requestOptions = copyRequestOptions(options);
    var includeReasoningSummary;
    var body;

    if (!isCurrentCompletion(completionContext)) {
      return;
    }

    if (skipReasoningSummary) {
      requestOptions.skipReasoningSummary = true;
    }
    includeReasoningSummary = shouldRequestReasoningSummary(attemptSettings, requestOptions);
    body = JSON.stringify(buildBody(attemptSettings, conversation, requestOptions));

    common.logDebug('llm request endpoint=' + attemptSettings.Endpoint + ' model=' + attemptSettings.Model + ' mode=' + endpointProtocol(attemptSettings) + ' nativeTools=' + (requestOptions.nativeTools ? '1' : '0') + ' tools=' + ((requestOptions.toolDefinitions && requestOptions.toolDefinitions.length) || 0) + ' reasoningSummary=' + (includeReasoningSummary ? '1' : '0') + ' messages=' + conversation.length + ' bytes=' + body.length + ' timeoutMs=' + attemptSettings.RequestTimeoutMs);

    request.open('POST', attemptSettings.Endpoint, true);
    request.setRequestHeader('Content-Type', 'application/json');
    if (isMessagesEndpoint(attemptSettings)) {
      request.setRequestHeader('x-api-key', attemptSettings.ApiKey);
      request.setRequestHeader('anthropic-version', ANTHROPIC_API_VERSION);
    } else {
      request.setRequestHeader('Authorization', 'Bearer ' + attemptSettings.ApiKey);
    }
    opencodeSession.applySessionHeader(request, attemptSettings.Endpoint);
    request.timeout = attemptSettings.RequestTimeoutMs;

    if (!watch.trackXhr(requestId, request)) {
      return;
    }

    request.onload = function() {
      var json;

      watch.untrackXhr(requestId, request);
      if (!isCurrentCompletion(completionContext)) {
        return;
      }

      common.logDebug('llm response status=' + request.status + ' bytes=' + String(request.responseText || '').length);

      if (request.status < 200 || request.status >= 300) {
        if (includeReasoningSummary && (request.status === 400 || request.status === 422) && !reasoningSummarySkipped) {
          common.logDebug('reasoning summary rejected; retrying without summary');
          reasoningSummarySkipped = true;
          attempt(candidateIndex, true);
          return;
        }

        if (plan.rotationActive && request.status === 500) {
          common.logDebug('http 500 rotating protocol candidate=' + (candidateIndex + 1) + '/' + plan.candidates.length + ' failedProtocol=' + candidate.protocol);
          if (candidateIndex + 1 < plan.candidates.length) {
            attempt(candidateIndex + 1, false, false);
          } else {
            finishOnce('HTTP ' + request.status + ': ' + String(request.responseText || '').substring(0, 250), null, { status: request.status });
          }
          return;
        }

        if (isTransientHttpStatus(request.status) && !transientRetried) {
          common.logDebug('transient http status=' + request.status + '; retrying once');
          scheduleTransientRetry(function() {
            attempt(candidateIndex, skipReasoningSummary);
          }, parseRetryAfterMs(request));
          return;
        }

        finishOnce('HTTP ' + request.status + ': ' + String(request.responseText || '').substring(0, 250), null, { status: request.status });
        return;
      }

      try {
        json = JSON.parse(request.responseText);
      } catch (e) {
        finishOnce('Bad JSON response');
        return;
      }

      if (plan.rotationActive) {
        endpointCache.remember(plan.originalEndpoint, attemptSettings.Model, cacheProtocolNameFromInternal(candidate.protocol));
      }

      finishOnce(null, json, { status: request.status });
    };

    request.onerror = function() {
      watch.untrackXhr(requestId, request);
      if (!isCurrentCompletion(completionContext)) {
        return;
      }
      common.logDebug('llm network error');
      if (!transientRetried) {
        scheduleTransientRetry(function() {
          attempt(candidateIndex, skipReasoningSummary);
        }, 0);
        return;
      }
      finishOnce('Network error');
    };

    request.ontimeout = function() {
      watch.untrackXhr(requestId, request);
      if (!isCurrentCompletion(completionContext)) {
        return;
      }
      common.logDebug('llm timeout');
      if (!transientRetried) {
        scheduleTransientRetry(function() {
          attempt(candidateIndex, skipReasoningSummary);
        }, 0);
        return;
      }
      finishOnce('Request timed out');
    };

    request.onabort = function() {
      watch.untrackXhr(requestId, request);
    };

    request.send(body);
  }

  attempt(0, false, false);
}

function getUsageToken(usage, primaryName, fallbackName) {
  var value;
  var number;

  if (!usage) {
    return null;
  }

  value = usage[primaryName];
  if (value === undefined || value === null) {
    value = usage[fallbackName];
  }

  number = parseInt(value, 10);
  if (isNaN(number) || number < 0) {
    return null;
  }

  return number;
}

function updateProgressContextSizes(requestId, settings, json) {
  var usage = json && json.usage;
  var inputTokens;
  var outputTokens;
  var inputText = '';
  var outputText = '';

  if (!settings.ShowInputContextSize && !settings.ShowOutputContextSize) {
    return;
  }

  inputTokens = getUsageToken(usage, 'input_tokens', 'prompt_tokens');
  outputTokens = getUsageToken(usage, 'output_tokens', 'completion_tokens');

  if (settings.ShowInputContextSize && inputTokens !== null) {
    inputText = String(inputTokens);
  }
  if (settings.ShowOutputContextSize && outputTokens !== null) {
    outputText = String(outputTokens);
  }

  watch.progressSetContextSizes(requestId, inputText, outputText);
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

function appendThinkingText(base, value) {
  value = common.trim(value);
  if (!value) {
    return base;
  }

  return base + (base ? '\n\n' : '') + value;
}

function collectThinkingText(content) {
  var text = common.collectTextFromContent(content);
  var i;

  if (text || !content) {
    return text;
  }

  if (content.summary) {
    return collectThinkingText(content.summary);
  }
  if (content.reasoning) {
    return collectThinkingText(content.reasoning);
  }
  if (content.reasoning_content) {
    return collectThinkingText(content.reasoning_content);
  }
  if (content.reasoning_details) {
    return collectThinkingText(content.reasoning_details);
  }
  if (content.thinking) {
    return collectThinkingText(content.thinking);
  }
  if (content.thinking_content) {
    return collectThinkingText(content.thinking_content);
  }

  if (content.length) {
    for (i = 0; i < content.length; i += 1) {
      text += collectThinkingText(content[i]);
    }
  }

  return text;
}

function appendThinkingContent(base, content) {
  return appendThinkingText(base, collectThinkingText(content));
}

function extractMessageThinking(message) {
  var thinking = '';

  if (!message) {
    return '';
  }

  thinking = appendThinkingContent(thinking, message.reasoning_content);
  thinking = appendThinkingContent(thinking, message.reasoning);
  thinking = appendThinkingContent(thinking, message.reasoning_details);
  thinking = appendThinkingContent(thinking, message.thinking);
  thinking = appendThinkingContent(thinking, message.thinking_content);

  return thinking;
}

function extractResponseThinking(json) {
  var thinking = extractMessageThinking(getChoiceMessage(json));
  var i;
  var item;

  if (json.output && json.output.length) {
    for (i = 0; i < json.output.length; i += 1) {
      item = json.output[i];
      if (item.type === 'reasoning' || item.reasoning) {
        thinking = appendThinkingContent(thinking, item.summary || item.content || item.reasoning || item);
      }
    }
  }

  if (json.content && json.content.length) {
    for (i = 0; i < json.content.length; i += 1) {
      item = json.content[i] || {};
      if (item.type === 'thinking' && typeof item.thinking === 'string') {
        thinking = appendThinkingText(thinking, item.thinking);
      }
    }
  }

  return thinking;
}

function extractThinkingBlocks(text) {
  var thinking = '';
  var source = String(text || '');
  var pattern = /<think>([\s\S]*?)<\/think>/gi;
  var match;

  while ((match = pattern.exec(source)) !== null) {
    thinking = appendThinkingText(thinking, match[1]);
  }

  return {
    thinking: thinking,
    answer: stripThinking(source)
  };
}

function summarizeResponseShape(json) {
  var message = getChoiceMessage(json);
  var content = message ? message.content : null;
  var contentType = content === null ? 'null' : typeof content;
  var contentLength = typeof content === 'string' ? content.length : (content && content.length ? content.length : 0);
  var reasoningLength = extractMessageThinking(message).length;

  return 'finish=' + getFinishReason(json) + ' contentType=' + contentType + ' contentLen=' + contentLength + ' reasoningLen=' + reasoningLength;
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
    answer = answer || common.collectTextFromContent(message.content);
    answer = answer || common.collectTextFromContent(message.output_text);
    answer = answer || common.collectTextFromContent(message.text);
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

  if (json.content && json.content.length) {
    for (i = 0; i < json.content.length; i += 1) {
      item = json.content[i] || {};
      if (!hasOutputText && item.type === 'text' && typeof item.text === 'string') {
        answer += item.text;
      }
    }
  }

  return answer;
}

function stripThinking(text) {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
    .replace(/<\/think>/gi, '')
    .replace(/^\s+/, '');
}

function stripThinkingWrapper(text) {
  var value = stripThinking(text);
  var marker = '\n\nAnswer:\n';
  var index = value.indexOf(marker);

  if (value.substring(0, 'Thinking:\n'.length) === 'Thinking:\n' && index !== -1) {
    return value.substring(index + marker.length);
  }

  return value;
}

function formatToolCallTrace(toolCalls, toolMap) {
  var lines = [];
  var i;

  for (i = 0; i < toolCalls.length; i += 1) {
    lines.push('> ' + tools.formatToolCallLabel(toolCalls[i], toolMap));
  }

  return lines.join('\n');
}

function extractResponseThinkingText(json) {
  var answer = extractResponseText(json);
  var thinking = extractResponseThinking(json);
  var blocks = extractThinkingBlocks(answer);

  return appendThinkingText(thinking, blocks.thinking);
}

function appendToolRoundTrace(base, json, toolCalls, toolMap) {
  var trace = appendThinkingText(base, extractResponseThinkingText(json));

  return appendThinkingText(trace, formatToolCallTrace(toolCalls, toolMap));
}

function extractRefusal(json) {
  var message = getChoiceMessage(json);
  var i;
  var j;
  var item;
  var content;

  if (message && message.refusal) {
    return common.trim(String(message.refusal));
  }

  if (message && message.content && message.content.length) {
    for (i = 0; i < message.content.length; i += 1) {
      content = message.content[i] || {};
      if (content.type === 'refusal' && content.text) {
        return common.trim(String(content.text));
      }
    }
  }

  if (json.output && json.output.length) {
    for (i = 0; i < json.output.length; i += 1) {
      item = json.output[i] || {};
      if (item.content && item.content.length) {
        for (j = 0; j < item.content.length; j += 1) {
          content = item.content[j] || {};
          if (content.type === 'refusal' && content.text) {
            return common.trim(String(content.text));
          }
        }
      }
    }
  }

  return '';
}

function extractIncompleteReason(json) {
  var status = String(json && json.status || '');
  var details = json && json.incomplete_details;

  if (status !== 'incomplete') {
    if (json && json.stop_reason === 'max_tokens') {
      return 'max_tokens';
    }
    return '';
  }

  if (details && details.reason) {
    return common.trim(String(details.reason));
  }

  return '';
}

function parseResponse(json, showThinking, extraThinking) {
  var answer = extractResponseText(json);
  var refusal;
  var incomplete;
  var thinking;
  var blocks;
  var result;

  if (!answer) {
    refusal = extractRefusal(json);
    if (refusal) {
      answer = refusal;
    }
  }

  if (!answer) {
    incomplete = extractIncompleteReason(json);
    if (incomplete) {
      answer = 'Response incomplete: ' + incomplete;
    }
  }

  if (!answer) {
    common.logDebug('no response text; shape=' + summarizeResponseShape(json));
    answer = 'No response text.';
  }

  if (!showThinking) {
    return stripThinking(answer);
  }

  blocks = extractThinkingBlocks(answer);
  thinking = extractResponseThinking(json);
  thinking = appendThinkingText(thinking, blocks.thinking);
  thinking = appendThinkingText(common.trim(extraThinking), thinking);
  result = blocks.answer;

  if (!thinking) {
    return result;
  }

  return 'Thinking:\n' + thinking + '\n\nAnswer:\n' + stripThinking(result);
}

function stripCodeFence(text) {
  var value = common.trim(text);
  var match = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  if (match) {
    return common.trim(match[1]);
  }

  return value;
}

function parseJsonFromText(text) {
  var value = stripCodeFence(stripThinking(text));
  var parsed;
  var start;
  var end;

  try {
    return JSON.parse(value);
  } catch (e) {
    start = value.indexOf('{');
    end = value.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(value.substring(start, end + 1));
      } catch (e2) {}
    }

    start = value.indexOf('[');
    end = value.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) {
      return null;
    }

    try {
      parsed = JSON.parse(value.substring(start, end + 1));
    } catch (e3) {
      return null;
    }
  }

  return parsed;
}

function normalizeToolCall(call, index) {
  var fn;
  var name;
  var args;
  var id;

  call = call || {};
  fn = call.function && typeof call.function === 'object' ? call.function : null;
  if (fn) {
    name = fn.name || call.name || call.tool;
    args = fn.arguments;
  } else {
    name = call.name || call.tool || (typeof call.function === 'string' ? call.function : '');
    args = call.arguments;
  }

  if (args === undefined) {
    args = call.args;
  }
  if (args === undefined) {
    args = call.parameters;
  }
  if (args === undefined) {
    args = call.params;
  }
  if (args === undefined) {
    args = call.input;
  }
  if (args === undefined) {
    args = {};
  }

  id = call.id || call.call_id || call.tool_call_id || name || ('call_' + index);

  return {
    id: id,
    call_id: call.call_id || id,
    name: name,
    arguments: args
  };
}

function addToolCall(result, call, toolMap, allowUnknown) {
  var normalized = normalizeToolCall(call, result.length + 1);

  if (!normalized.name) {
    return;
  }

  if (!allowUnknown && toolMap && !toolMap[normalized.name]) {
    return;
  }

  result.push(normalized);
}

function parsedToolCalls(parsed, toolMap) {
  var result = [];
  var i;

  if (!parsed) {
    return result;
  }

  if (Object.prototype.toString.call(parsed) === '[object Array]') {
    for (i = 0; i < parsed.length; i += 1) {
      addToolCall(result, parsed[i], toolMap, false);
    }
    return result;
  }

  if (parsed && parsed.tool_calls && parsed.tool_calls.length) {
    for (i = 0; i < parsed.tool_calls.length; i += 1) {
      addToolCall(result, parsed.tool_calls[i], toolMap, true);
    }
    return result;
  }

  if (parsed && parsed.tool_calls && typeof parsed.tool_calls === 'object') {
    addToolCall(result, parsed.tool_calls, toolMap, true);
    return result;
  }

  if (parsed && parsed.tool_call && typeof parsed.tool_call === 'object') {
    addToolCall(result, parsed.tool_call, toolMap, true);
    return result;
  }

  if (parsed && parsed.function_call && typeof parsed.function_call === 'object') {
    addToolCall(result, parsed.function_call, toolMap, true);
    return result;
  }

  if (parsed && parsed.name && toolMap && toolMap[parsed.name]) {
    addToolCall(result, parsed, toolMap, false);
    return result;
  }

  if (parsed && parsed.function && parsed.function.name && toolMap && toolMap[parsed.function.name]) {
    addToolCall(result, parsed, toolMap, false);
    return result;
  }

  return result;
}

function parseToolCalls(text, toolMap) {
  return parsedToolCalls(parseJsonFromText(text), toolMap);
}

function extractNativeToolCalls(json) {
  var result = [];
  var message = getChoiceMessage(json);
  var i;
  var item;

  if (message && message.tool_calls && message.tool_calls.length) {
    for (i = 0; i < message.tool_calls.length; i += 1) {
      addToolCall(result, message.tool_calls[i], null, true);
    }
  }

  if (message && message.function_call) {
    addToolCall(result, {
      id: message.function_call.id || message.function_call.name,
      function: message.function_call
    }, null, true);
  }

  if (json.output && json.output.length) {
    for (i = 0; i < json.output.length; i += 1) {
      item = json.output[i] || {};
      if (item.type === 'function_call' || (item.name && item.arguments !== undefined && item.call_id)) {
        addToolCall(result, item, null, true);
      }
    }
  }

  if (json.content && json.content.length) {
    for (i = 0; i < json.content.length; i += 1) {
      item = json.content[i] || {};
      if (item.type === 'tool_use') {
        addToolCall(result, item, null, true);
      }
    }
  }

  return result;
}

function extractToolCallBatch(json, mode, toolMap) {
  var nativeCalls;
  var textCalls;

  if (mode === 'native') {
    nativeCalls = extractNativeToolCalls(json);
    if (nativeCalls.length) {
      return { source: 'native', calls: nativeCalls };
    }
  }

  textCalls = parseToolCalls(extractResponseText(json), toolMap);
  if (textCalls.length) {
    return { source: 'text', calls: textCalls };
  }

  return { source: '', calls: [] };
}

function buildToolCapNotice() {
  return TOOL_CAP_NOTICE;
}

function formatToolResultOutput(result) {
  var sanitized = sanitizeToolResult(result);
  if (sanitized.error) { return common.safeJson({ error: sanitized.error }); }
  return common.safeJson({ result: sanitized.result });
}

function capErrorText(value) {
  var text = String(value || '');
  var suffix = '... [truncated]';
  var maximum = 900;
  if (text.length <= maximum) { return text; }
  return text.substring(0, maximum - suffix.length) + suffix;
}

function boundedToolError(value) {
  var text = String(value || '');
  if (text.length <= MAX_TOOL_RESULT_CHARS) { return text; }
  return TOOL_ERROR_OMISSION;
}

function capPlainToolValue(value, limit) {
  var text = String(value || '');
  if (text.length <= limit) { return text; }
  if (limit > TOOL_RESULT_TRUNCATION_SUFFIX.length) {
    return text.substring(0, limit - TOOL_RESULT_TRUNCATION_SUFFIX.length) + TOOL_RESULT_TRUNCATION_SUFFIX;
  }
  return null;
}

function structuredOmission(reason, limit) {
  var text = common.safeJson({ error: reason });
  if (text.length <= limit) { return text; }
  text = common.safeJson({ error: 'Omitted' });
  if (text.length <= limit) { return text; }
  return limit >= 4 ? 'null' : null;
}

function isTrustedMcpResultEnvelope(result, value) {
  return result && result._mcpResultEnvelope === true && value && typeof value === 'object' && value.mcpResult === true &&
    typeof value.text === 'string' && Object.prototype.hasOwnProperty.call(value, 'structuredContent');
}

function capMcpResultEnvelope(value, limit) {
  var text = value.text;
  var structuredContent = value.structuredContent;
  var textTruncated = value.textTruncated === true;
  var structuredContentOmitted = value.structuredContentOmitted === true;
  var omittedBlocks = typeof value.omittedBlocks === 'number' && isFinite(value.omittedBlocks) && value.omittedBlocks > 0 ? Math.floor(value.omittedBlocks) : 0;
  var low;
  var high;
  var middle;
  var candidate;
  var best = null;

  function serialize(candidateText) {
    var output = {
      mcpResult: true,
      text: candidateText,
      structuredContent: structuredContent
    };
    if (textTruncated) { output.textTruncated = true; }
    if (structuredContentOmitted) { output.structuredContentOmitted = true; }
    if (omittedBlocks) { output.omittedBlocks = omittedBlocks; }
    return JSON.stringify(output);
  }

  try {
    candidate = serialize(text);
    if (candidate.length <= limit) { return candidate; }

    textTruncated = true;
    candidate = serialize('');
    if (candidate.length > limit) {
      structuredContent = { error: 'Structured MCP content omitted: remaining tool-result budget is too small' };
      structuredContentOmitted = true;
      candidate = serialize('');
      if (candidate.length > limit) { return null; }
    }

    low = 0;
    high = text.length;
    while (low <= high) {
      middle = Math.floor((low + high) / 2);
      if (middle > 0 && middle < text.length && text.charCodeAt(middle - 1) >= 0xD800 && text.charCodeAt(middle - 1) <= 0xDBFF &&
          text.charCodeAt(middle) >= 0xDC00 && text.charCodeAt(middle) <= 0xDFFF) {
        middle -= 1;
      }
      candidate = serialize(text.substring(0, middle));
      if (candidate.length <= limit) {
        best = candidate;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return best;
  } catch (e) {
    return null;
  }
}

function sanitizeToolResult(result) {
  var output = {};
  var value;
  var parsed;
  var structured;
  if (!result || typeof result !== 'object') { result = {}; }
  if (result.id !== undefined) { output.id = capErrorText(result.id).substring(0, 128); }
  if (result.call_id !== undefined) { output.call_id = capErrorText(result.call_id).substring(0, 128); }
  if (result.name !== undefined) { output.name = capErrorText(result.name).substring(0, 128); }
  if (result.error) {
    output.error = boundedToolError(result.error);
    return output;
  }
  if (result.result === undefined) { return output; }

  structured = result._structuredResult === true ||
    (result.result !== null && typeof result.result === 'object');
  if (structured) {
    value = typeof result.result === 'string' ? result.result : common.safeJson(result.result);
    try {
      parsed = JSON.parse(value);
      output.result = parsed;
    } catch (e) {
      output.result = { error: 'Structured tool result omitted: invalid JSON' };
    }
    return output;
  }

  output.result = String(result.result);
  return output;
}

function sanitizeToolResults(results) {
  var sanitized = [];
  var i;
  for (i = 0; i < results.length; i += 1) {
    sanitized.push(sanitizeToolResult(results[i]));
  }
  return sanitized;
}

function errorForReservedAllowance(error, allowance) {
  var text = String(error || '');
  if (text.length <= allowance && text.length <= MAX_TOOL_RESULT_CHARS) { return text; }
  if (TOOL_ERROR_OMISSION.length <= allowance) { return TOOL_ERROR_OMISSION; }
  if ('Omitted'.length <= allowance) { return 'Omitted'; }
  return '';
}

function capToolResults(results, remainingChars, options) {
  var i;
  var result;
  var value;
  var limit;
  var structured;
  var parsed;
  var futureSlots;
  var slotCount;
  var noticeLength;
  var slotAllowance;
  var remainingData;
  var omissionReason;
  var omission;

  options = options || {};
  remainingChars = typeof remainingChars === 'number' && isFinite(remainingChars) ? Math.max(0, remainingChars) : MAX_TOOL_RESULTS_TOTAL_CHARS;
  futureSlots = typeof options.futureSlots === 'number' && isFinite(options.futureSlots) ? Math.max(0, Math.floor(options.futureSlots)) : 0;
  slotCount = results.length + futureSlots;
  noticeLength = options.includeCapNotice || futureSlots > 0 ? TOOL_CAP_NOTICE.length : 0;
  slotAllowance = slotCount > 0 ? Math.min(
    TOOL_RESULT_ERROR_RESERVE_CHARS,
    Math.floor(Math.max(0, remainingChars - noticeLength) / slotCount)
  ) : 0;
  remainingData = Math.max(0, remainingChars - noticeLength - slotAllowance * slotCount);

  for (i = 0; i < results.length; i += 1) {
    result = results[i] || {};
    if (result.error) {
      value = String(result.error);
      limit = Math.min(MAX_TOOL_RESULT_CHARS, remainingData + slotAllowance);
      if (value.length > limit) {
        value = errorForReservedAllowance(value, slotAllowance);
      }
      result.error = value;
      remainingChars -= result.error.length;
      remainingData += slotAllowance - result.error.length;
      continue;
    }
    if (result.result === undefined || (result.result === null && result._structuredResult !== true)) {
      remainingData += slotAllowance;
      continue;
    }

    value = typeof result.result === 'string' ? result.result : common.safeJson(result.result);
    structured = result._structuredResult === true ||
      (result.result !== null && typeof result.result === 'object');
    if (structured) {
      parsed = null;
      try {
        parsed = JSON.parse(value);
        value = common.safeJson(parsed);
      } catch (e) {
        value = common.safeJson({ error: 'Structured tool result omitted: invalid JSON' });
      }
      if (isTrustedMcpResultEnvelope(result, parsed)) {
        omissionReason = value.length > MAX_TOOL_RESULT_CHARS ?
          'Structured MCP result omitted: per-result limit exceeded' :
          'Structured MCP result omitted: budget reserved for other results';
        limit = Math.min(MAX_TOOL_RESULT_CHARS, remainingData + slotAllowance);
        value = capMcpResultEnvelope(parsed, limit);
        if (value !== null) {
          remainingChars -= value.length;
          remainingData += slotAllowance - value.length;
          result.result = value;
          result._structuredResult = true;
          continue;
        }
        value = structuredOmission(omissionReason, slotAllowance);
        if (value === null) {
          delete result.result;
          delete result._structuredResult;
          result.error = errorForReservedAllowance(TOOL_RESULT_ERROR_OMISSION, slotAllowance);
          remainingChars -= result.error.length;
          remainingData += slotAllowance - result.error.length;
          continue;
        }
        remainingChars -= value.length;
        remainingData += slotAllowance - value.length;
        result.result = value;
        result._structuredResult = true;
        continue;
      }
      limit = Math.min(MAX_TOOL_RESULT_CHARS, remainingData + slotAllowance);
      if (value.length > limit) {
        omissionReason = value.length > MAX_TOOL_RESULT_CHARS ?
          'Tool result omitted: per-result limit exceeded' :
          'Tool result omitted: budget reserved for other results';
        omission = structuredOmission(omissionReason, slotAllowance);
        value = omission;
        if (value === null) {
          delete result.result;
          delete result._structuredResult;
          result.error = errorForReservedAllowance(TOOL_RESULT_ERROR_OMISSION, slotAllowance);
          remainingChars -= result.error.length;
          remainingData += slotAllowance - result.error.length;
          continue;
        }
        remainingChars -= value.length;
        remainingData += slotAllowance - value.length;
      } else {
        remainingChars -= value.length;
        remainingData += slotAllowance - value.length;
      }
      result.result = value;
      result._structuredResult = true;
      continue;
    }

    limit = Math.min(MAX_TOOL_RESULT_CHARS, remainingData + slotAllowance);
    if (limit <= 0) {
      delete result.result;
      delete result._structuredResult;
      result.error = errorForReservedAllowance(TOOL_RESULT_ERROR_OMISSION, slotAllowance);
      remainingChars -= result.error.length;
      remainingData += slotAllowance - result.error.length;
      continue;
    }
    if (value.length > limit) {
      value = capPlainToolValue(value, limit);
      if (value === null) {
        delete result.result;
        delete result._structuredResult;
        result.error = errorForReservedAllowance(TOOL_RESULT_ERROR_OMISSION, slotAllowance);
        remainingChars -= result.error.length;
        remainingData += slotAllowance - result.error.length;
        continue;
      }
    }
    result.result = value;
    remainingChars -= value.length;
    remainingData -= value.length;
    remainingData += slotAllowance;
  }

  if (options.includeCapNotice) { remainingChars -= TOOL_CAP_NOTICE.length; }

  return Math.max(0, remainingChars);
}

function buildSkippedToolResult(call, index, error) {
  call = call || {};
  return {
    id: call.id || call.call_id || call.name || String(index + 1),
    call_id: call.call_id || call.id || call.name || String(index + 1),
    name: call.name || 'unknown',
    error: error || 'Tool call budget exhausted'
  };
}

function buildSkippedToolResults(toolCalls, error) {
  var results = [];
  var i;

  for (i = 0; i < toolCalls.length; i += 1) {
    results.push(buildSkippedToolResult(toolCalls[i], i, error));
  }

  return results;
}

function planToolCallsByBudget(toolCalls, toolMap, remainingToolCalls, mcpToolCallCounts) {
  var plan = [];
  var runnableToolCalls = [];
  var skippedCount = 0;
  var consumedGlobal = 0;
  var i;
  var call;
  var toolInfo;
  var server;
  var limit;
  var limitKey;
  var used;

  for (i = 0; i < toolCalls.length; i += 1) {
    call = toolCalls[i] || {};

    if (consumedGlobal >= remainingToolCalls) {
      plan.push({ result: buildSkippedToolResult(call, i, 'Tool call budget exhausted') });
      skippedCount += 1;
      continue;
    }

    consumedGlobal += 1;
    toolInfo = toolMap[call.name];
    if (toolInfo && toolInfo.kind === 'mcp' && toolInfo.server && toolInfo.server.maxToolCalls !== null && toolInfo.server.maxToolCalls !== undefined) {
      server = toolInfo.server;
      limit = server.maxToolCalls;
      limitKey = server.limitKey || server.label || server.displayLabel || 'mcp';
      used = mcpToolCallCounts[limitKey] || 0;
      if (used >= limit) {
        plan.push({ result: buildSkippedToolResult(call, i, 'MCP server tool call budget exhausted') });
        skippedCount += 1;
        continue;
      }
      mcpToolCallCounts[limitKey] = used + 1;
    }

    runnableToolCalls.push(call);
    plan.push({ run: true, call: call, index: i });
  }

  return {
    plan: plan,
    toolCalls: runnableToolCalls,
    skippedCount: skippedCount,
    noMoreTools: remainingToolCalls <= 0 || toolCalls.length >= remainingToolCalls
  };
}

function mergePlannedToolResults(plan, runnableResults) {
  var results = [];
  var runnableIndex = 0;
  var i;
  var item;

  for (i = 0; i < plan.length; i += 1) {
    item = plan[i] || {};
    if (item.run) {
      results.push(runnableResults[runnableIndex] || buildSkippedToolResult(item.call, item.index || i, 'Tool call did not return a result'));
      runnableIndex += 1;
    } else {
      results.push(item.result);
    }
  }

  return results;
}

function appendTextToolResults(conversation, assistantText, results, noMoreTools, skippedCount) {
  var content = 'Tool results:\n' + common.safeJson(sanitizeToolResults(results));
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

function chatAssistantToolMessage(json, toolCalls) {
  var message = getChoiceMessage(json) || {};
  var output = {
    role: 'assistant',
    content: message.content !== undefined ? message.content : null
  };
  var i;
  var call;

  if (message.tool_calls && message.tool_calls.length) {
    output.tool_calls = message.tool_calls;
    return output;
  }

  output.tool_calls = [];
  for (i = 0; i < toolCalls.length; i += 1) {
    call = toolCalls[i] || {};
    output.tool_calls.push({
      id: call.id || call.call_id || call.name || ('call_' + (i + 1)),
      type: 'function',
      function: {
        name: call.name,
        arguments: typeof call.arguments === 'string' ? call.arguments : common.safeJson(call.arguments || {})
      }
    });
  }

  return output;
}

function buildMessagesAssistantReplay(json, toolCalls) {
  var blocks = [];
  var sawToolUse = false;
  var content = json && json.content;
  var block;
  var item;
  var call;
  var i;

  if (content && content.length) {
    for (i = 0; i < content.length; i += 1) {
      item = content[i] || {};
      if (item.type === 'text' && typeof item.text === 'string' && item.text !== '') {
        blocks.push({ type: 'text', text: item.text });
      } else if (item.type === 'thinking' && typeof item.thinking === 'string') {
        block = { type: 'thinking', thinking: item.thinking };
        if (typeof item.signature === 'string' && item.signature) {
          block.signature = item.signature;
        }
        blocks.push(block);
      } else if (item.type === 'redacted_thinking' && typeof item.data === 'string' && item.data) {
        blocks.push({ type: 'redacted_thinking', data: item.data });
      } else if (item.type === 'tool_use' && typeof item.id === 'string' && item.id &&
          typeof item.name === 'string' && item.name) {
        sawToolUse = true;
        blocks.push({
          type: 'tool_use',
          id: item.id,
          name: item.name,
          input: item.input && typeof item.input === 'object' ? item.input : {}
        });
      }
    }
  }

  if (!sawToolUse && toolCalls && toolCalls.length) {
    for (i = 0; i < toolCalls.length; i += 1) {
      call = toolCalls[i] || {};
      if (!call.name) {
        continue;
      }
      blocks.push({
        type: 'tool_use',
        id: String(call.call_id || call.id || call.name),
        name: call.name,
        input: call.arguments && typeof call.arguments === 'object' ? call.arguments : {}
      });
    }
  }

  return blocks;
}

function messagesToolUseId(result, index, toolCalls) {
  var call = toolCalls && toolCalls[index] ? toolCalls[index] : null;

  if (result.call_id) {
    return String(result.call_id);
  }
  if (result.id) {
    return String(result.id);
  }
  if (result.name) {
    return String(result.name);
  }
  if (call) {
    return String(call.call_id || call.id || call.name);
  }

  return String(index + 1);
}

function appendMessagesToolResults(conversation, json, toolCalls, results, noMoreTools, skippedCount) {
  var toolResultBlocks = [];
  var i;
  var result;

  conversation.push({
    role: 'assistant',
    content: buildMessagesAssistantReplay(json, toolCalls)
  });

  for (i = 0; i < results.length; i += 1) {
    result = results[i] || {};
    toolResultBlocks.push({
      type: 'tool_result',
      tool_use_id: messagesToolUseId(result, i, toolCalls),
      content: formatToolResultOutput(result)
    });
  }

  if (noMoreTools) {
    toolResultBlocks.push({ type: 'text', text: buildToolCapNotice(skippedCount) });
  }

  conversation.push({ role: 'user', content: toolResultBlocks });
}

function appendNativeToolResults(conversation, settings, json, toolCalls, results, noMoreTools, skippedCount) {
  var i;
  var result;

  if (isMessagesEndpoint(settings)) {
    appendMessagesToolResults(conversation, json, toolCalls, results, noMoreTools, skippedCount);
    return;
  }

  if (isChatEndpoint(settings)) {
    conversation.push(chatAssistantToolMessage(json, toolCalls));
    for (i = 0; i < results.length; i += 1) {
      result = results[i] || {};
      conversation.push({
        role: 'tool',
        tool_call_id: result.call_id || result.id || result.name || String(i + 1),
        content: formatToolResultOutput(result)
      });
    }
    if (noMoreTools) {
      conversation.push({
        role: 'user',
        content: buildToolCapNotice(skippedCount)
      });
    }
    return;
  }

  if (json.output && json.output.length) {
    for (i = 0; i < json.output.length; i += 1) {
      conversation.push(json.output[i]);
    }
  } else {
    conversation.push({
      role: 'assistant',
      content: extractResponseText(json)
    });
  }

  for (i = 0; i < results.length; i += 1) {
    result = results[i] || {};
    conversation.push({
      type: 'function_call_output',
      call_id: result.call_id || result.id || result.name || String(i + 1),
      output: formatToolResultOutput(result)
    });
  }

  if (noMoreTools) {
    conversation.push({
      role: 'user',
      content: buildToolCapNotice(skippedCount)
    });
  }
}

function appendToolResults(conversation, settings, json, assistantText, source, toolCalls, results, noMoreTools, skippedCount) {
  if (source === 'native') {
    appendNativeToolResults(conversation, settings, json, toolCalls, results, noMoreTools, skippedCount);
    return;
  }

  appendTextToolResults(conversation, assistantText, results, noMoreTools, skippedCount);
}

function isNativeToolRequestError(error) {
  return /^HTTP (400|404|422)/.test(String(error || ''));
}

function requestFinalAfterToolCap(requestId, settings, conversation, toolDefinitions, toolMap, mode,
                                  thinkingTrace, callback) {
  var requestOptions = mode === 'native' ? { nativeTools: true, toolDefinitions: toolDefinitions } : {};
  var completionContext = s_active_completion && s_active_completion.requestId === requestId ? s_active_completion : null;

  if (!isCurrentCompletion(completionContext)) {
    return;
  }
  watch.progressSet(requestId, 'thinking', 'tool call limit reached');
  setModelRetryState(completionContext, settings, conversation, mode, thinkingTrace);
  requestModel(settings, conversation, requestId, requestOptions, function(error, json) {
    var assistantText;
    var batch;
    if (!isCurrentCompletion(completionContext)) {
      return;
    }
    if (error) {
      callback(error);
      return;
    }
    updateProgressContextSizes(requestId, settings, json);
    assistantText = extractResponseText(json);
    batch = extractToolCallBatch(json, mode, toolMap);
    if (batch.calls.length) {
      callback(null, 'I am out of tool calls, and the model requested another tool instead of producing a final answer. I can only answer from information already gathered.');
      return;
    }
    callback(null, parseResponse(json, settings.ShowThinking, thinkingTrace));
  });
}

function completeWithTools(requestId, settings, conversation, toolDefinitions, toolMap, mode, round, usedToolCalls, mcpToolCallCounts, thinkingTrace, remainingToolResultChars, callback) {
  var requestOptions = mode === 'native' ? { nativeTools: true, toolDefinitions: toolDefinitions } : {};
  var completionContext = s_active_completion && s_active_completion.requestId === requestId ? s_active_completion : null;

  if (!isCurrentCompletion(completionContext)) {
    return;
  }
  mcpToolCallCounts = mcpToolCallCounts || {};
  thinkingTrace = thinkingTrace || '';
  remainingToolResultChars = typeof remainingToolResultChars === 'number' ? remainingToolResultChars : MAX_TOOL_RESULTS_TOTAL_CHARS;

  common.logDebug('tool loop mode=' + mode + ' round=' + round + ' availableTools=' + Object.keys(toolMap).length + ' usedToolCalls=' + usedToolCalls + ' maxToolCalls=' + settings.MaxToolCalls);
  watch.progressSet(requestId, 'thinking', round === 0 ? '' : 'with tool results');
  setModelRetryState(completionContext, settings, conversation, mode, thinkingTrace);
  requestModel(settings, conversation, requestId, requestOptions, function(error, json) {
    var assistantText;
    var batch;
    var toolCalls;
    var originalToolCalls;
    var remainingToolCalls;
    var noMoreTools;
    var skippedCount;
    var skippedResults;
    var budgetPlan;
    var futureToolCallSlots;

    if (!isCurrentCompletion(completionContext)) {
      return;
    }
    if (error) {
      callback(error, null, {
        nativeUnsupported: mode === 'native' && round === 0 && usedToolCalls === 0 && isNativeToolRequestError(error)
      });
      return;
    }

    updateProgressContextSizes(requestId, settings, json);
    assistantText = extractResponseText(json);
    if (Object.keys(toolMap).length <= 0) {
      callback(null, parseResponse(json, settings.ShowThinking, thinkingTrace));
      return;
    }
    batch = extractToolCallBatch(json, mode, toolMap);
    toolCalls = batch.calls;
    common.logDebug('llm response shape ' + summarizeResponseShape(json));
    common.logDebug('tool loop source=' + (batch.source || 'none') + ' model textChars=' + assistantText.length + ' toolCalls=' + toolCalls.length);

    if (!toolCalls.length) {
      callback(null, parseResponse(json, settings.ShowThinking, thinkingTrace));
      return;
    }

    thinkingTrace = appendToolRoundTrace(thinkingTrace, json, toolCalls, toolMap);

    remainingToolCalls = settings.MaxToolCalls - usedToolCalls;
    originalToolCalls = toolCalls;
    if (remainingToolCalls <= 0) {
      skippedResults = buildSkippedToolResults(originalToolCalls);
      remainingToolResultChars = capToolResults(skippedResults, remainingToolResultChars, {
        futureSlots: 0,
        includeCapNotice: true
      });
      appendToolResults(conversation, settings, json, assistantText, batch.source, originalToolCalls, skippedResults, true, originalToolCalls.length);
      requestFinalAfterToolCap(requestId, settings, conversation, toolDefinitions, toolMap, mode,
          thinkingTrace, callback);
      return;
    }
    budgetPlan = planToolCallsByBudget(originalToolCalls, toolMap, remainingToolCalls, mcpToolCallCounts);
    toolCalls = budgetPlan.toolCalls;
    noMoreTools = budgetPlan.noMoreTools;
    skippedCount = budgetPlan.skippedCount;
    if (skippedCount > 0) {
      common.logDebug('tool loop budget skipped=' + skippedCount + ' runnable=' + toolCalls.length + ' requested=' + originalToolCalls.length + ' remaining=' + remainingToolCalls);
    }
    if (toolCalls.length) {
      completionContext.toolsStarted = true;
    }
    tools.runToolCalls(requestId, toolCalls, toolMap, function(results) {
      if (!isCurrentCompletion(completionContext)) {
        return;
      }
      results = mergePlannedToolResults(budgetPlan.plan, results);
      if (usedToolCalls + results.length >= settings.MaxToolCalls) {
        noMoreTools = true;
      }
      futureToolCallSlots = noMoreTools ? 0 : Math.max(0, remainingToolCalls - results.length);
      remainingToolResultChars = capToolResults(results, remainingToolResultChars, {
        futureSlots: futureToolCallSlots,
        includeCapNotice: noMoreTools
      });
      common.logDebug('tool loop results=' + results.length + ' skipped=' + skippedCount);
      appendToolResults(conversation, settings, json, assistantText, batch.source, originalToolCalls, results, noMoreTools, skippedCount);
      if (noMoreTools) {
        requestFinalAfterToolCap(requestId, settings, conversation, toolDefinitions, toolMap, mode,
            thinkingTrace, callback);
        return;
      }
      completeWithTools(requestId, settings, conversation, toolDefinitions, toolMap, mode, round + 1, usedToolCalls + results.length, mcpToolCallCounts, thinkingTrace, remainingToolResultChars, callback);
    });
  });
}

function finishToolCompletion(context, settings, conversation, toolDefinitions, toolMap,
                              mode, completionError, text, meta) {
  var toolInstructions;

  if (!isCurrentCompletion(context)) {
    return;
  }
  if (completionError && meta && meta.nativeUnsupported) {
    common.logDebug('native tool request rejected; retrying text tool fallback');
    markNativeToolsUnsupported(settings);
    toolInstructions = buildToolInstructions(toolDefinitions, settings.MaxToolCalls, false);
    conversation = buildConversation(settings, context.userText, toolInstructions,
        context.historyAtStart);
    completeWithTools(context.requestId, settings, conversation, toolDefinitions, toolMap,
        'text', 0, 0, {}, '', MAX_TOOL_RESULTS_TOTAL_CHARS,
        function(error, answer, fallbackMeta) {
          finishToolCompletion(context, settings, conversation, toolDefinitions, toolMap,
              'text', error, answer, fallbackMeta);
        });
    return;
  }
  if (completionError) {
    failCompletionContext(context, completionError);
    return;
  }
  sendCompletionResponse(context, settings, context.userText, text);
}

function startCompletion(context, settings) {
  var requestId = context.requestId;
  var userText = context.userText;
  var conversation;
  var toolInstructions;

  common.logDebug('request start id=' + requestId + ' textChars=' + String(userText || '').length + ' endpoint=' + settings.Endpoint + ' model=' + settings.Model + ' maxToolCalls=' + settings.MaxToolCalls + ' preserveChats=' + (settings.PreserveChats ? '1' : '0') + ' geoTool=' + settings.GeolocationToolEnabled + ' timelineTool=' + settings.TimelineToolEnabled + ' healthTool=' + settings.HealthToolEnabled + ' history=' + context.historyAtStart.length);
  watch.progressStart(requestId, 'thinking', '');

  if (!settings.Endpoint) {
    context.retryKind = 'setup';
    failCompletionContext(context, 'Endpoint missing. Open settings on phone.');
    return;
  }

  if (!settings.ApiKey) {
    context.retryKind = 'setup';
    failCompletionContext(context, 'API key missing. Open settings on phone.');
    return;
  }

  if (settings.MaxToolCalls <= 0) {
    common.logDebug('tools disabled maxToolCalls=0');
    conversation = buildConversation(settings, userText, '', context.historyAtStart);
    completeWithTools(requestId, settings, conversation, [], {}, 'text', 0, 0, {}, '',
        MAX_TOOL_RESULTS_TOTAL_CHARS, function(completionError, text) {
          finishToolCompletion(context, settings, conversation, [], {}, 'text',
              completionError, text, null);
        });
    return;
  }

  watch.progressSet(requestId, 'Loading tools', 'discovering phone tools');
  tools.discoverPhoneTools(settings, requestId, function(error, discoveredTools, toolMap) {
    var mode;

    if (!isCurrentCompletion(context)) {
      return;
    }
    if (error) {
      context.retryKind = 'before-tools';
      failCompletionContext(context, error);
      return;
    }

    toolInstructions = buildToolInstructions(discoveredTools, settings.MaxToolCalls,
        !isNativeToolsUnsupported(settings));
    conversation = buildConversation(settings, userText, toolInstructions,
        context.historyAtStart);
    common.logDebug('tools discover done tools=' + discoveredTools.length + ' nativeUnsupported=' + (isNativeToolsUnsupported(settings) ? '1' : '0'));
    watch.progressDone(requestId, 'Tools loaded', discoveredTools.length + ' tools');
    mode = isNativeToolsUnsupported(settings) ? 'text' : 'native';
    completeWithTools(requestId, settings, conversation, discoveredTools, toolMap, mode,
        0, 0, {}, '', MAX_TOOL_RESULTS_TOTAL_CHARS,
        function(completionError, text, meta) {
          finishToolCompletion(context, settings, conversation, discoveredTools, toolMap,
              mode, completionError, text, meta);
        });
  });
}

function createCompletionContext(requestId, userText, history) {
  return {
    generation: s_conversation_generation,
    requestId: requestId,
    userText: String(userText || ''),
    historyAtStart: copyChatHistory(history),
    timers: [],
    toolsStarted: false,
    retryKind: null
  };
}

function activateCompletion(context) {
  var previousContext = s_active_completion;

  clearCompletionTimers(previousContext);
  watch.beginRequestLifecycle(context.requestId);
  s_active_completion = context;
}

function appendRecoveryInstruction(conversation, settings) {
  var instruction = 'FINAL-ANSWER-ONLY RECOVERY. Do not call or request any tools. Summarize available evidence from recorded tool results. Report incomplete or unknown actions honestly. Never claim an action ran unless a recorded result proves it. If more work would need a tool, state that no additional action was run.';
  var last = conversation.length ? conversation[conversation.length - 1] : null;

  if (isMessagesEndpoint(settings) && last && last.role === 'user' &&
      Object.prototype.toString.call(last.content) === '[object Array]') {
    last.content.push({ type: 'text', text: instruction });
    return;
  }
  if (last && last.role === 'user' && typeof last.content === 'string') {
    last.content += '\n\n' + instruction;
    return;
  }
  conversation.push({ role: 'user', content: instruction });
}

function sendRetryUnavailable(requestId, message, failedRequestId) {
  if (!watch.isCurrentRequest(failedRequestId) || s_active_completion) {
    return false;
  }
  watch.beginRequestLifecycle(requestId);
  watch.progressStart(requestId, 'Error', '');
  watch.sendError(requestId, message, function() {
    watch.finishRequestLifecycle(requestId);
  }, false);
  return true;
}

function retryCompletion(requestId, failedRequestId) {
  var capsule = s_retry_capsule;
  var context;
  var settings;
  var conversation;
  var knownKind;

  if (!watch.isCurrentRequest(failedRequestId) || !requestId ||
      Number(requestId) === Number(failedRequestId)) {
    return false;
  }
  if (s_active_completion) {
    return false;
  }
  if (!capsule || Number(capsule.requestId) !== Number(failedRequestId) ||
      capsule.generation !== s_conversation_generation) {
    if (capsule && Number(capsule.requestId) === Number(failedRequestId)) {
      s_retry_capsule = null;
    }
    return sendRetryUnavailable(requestId, 'Retry is no longer available. Start a new request.', failedRequestId);
  }

  knownKind = capsule.kind === 'setup' || capsule.kind === 'before-tools' ||
      capsule.kind === 'delivery' || capsule.kind === 'final-only';
  if (!knownKind || typeof capsule.userText !== 'string') {
    s_retry_capsule = null;
    return sendRetryUnavailable(requestId, 'Retry context is unavailable. Start a new request.', failedRequestId);
  }

  if ((capsule.kind === 'setup' || capsule.kind === 'before-tools') &&
      Object.prototype.toString.call(capsule.history) !== '[object Array]') {
    s_retry_capsule = null;
    return sendRetryUnavailable(requestId, 'Retry context is unavailable. Start a new request.', failedRequestId);
  }
  if (capsule.kind === 'final-only') {
    settings = capsule.settings;
    conversation = cloneBoundedRetryCapsule(capsule.conversation);
    if (Object.prototype.toString.call(settings) !== '[object Object]' || !conversation ||
        Object.prototype.toString.call(conversation) !== '[object Array]') {
      s_retry_capsule = null;
      return sendRetryUnavailable(requestId,
          'Recorded tool results are unavailable. Start a new request.', failedRequestId);
    }
  }
  if (capsule.kind === 'delivery' &&
      (Object.prototype.toString.call(capsule.settings) !== '[object Object]' ||
       typeof capsule.text !== 'string' || typeof capsule.answerText !== 'string')) {
    s_retry_capsule = null;
    return sendRetryUnavailable(requestId, 'Retry context is unavailable. Start a new request.', failedRequestId);
  }

  s_retry_capsule = null;
  context = createCompletionContext(requestId, capsule.userText, capsule.history || []);
  context.toolsStarted = capsule.kind === 'final-only';
  activateCompletion(context);

  if (capsule.kind === 'setup' || capsule.kind === 'before-tools') {
    startCompletion(context, common.loadSettings());
    return true;
  }

  if (capsule.kind === 'delivery') {
    watch.progressStart(requestId, 'Receiving', 'retrying response');
    watch.sendPreparedResponse(requestId, capsule.text, function(sendError) {
      if (!sendError && isCurrentCompletion(context)) {
        s_retry_capsule = null;
        rememberChatTurn(capsule.settings, capsule.userText, capsule.answerText);
      }
      finishCompletionContext(context);
    }, function(sendError, preparedText) {
      if (!sendError || !isCurrentCompletion(context)) {
        return false;
      }
      return rememberDeliveryFailure(context, capsule.settings, capsule.userText, preparedText,
          capsule.answerText);
    });
    return true;
  }

  if (capsule.kind === 'final-only') {
    appendRecoveryInstruction(conversation, settings);
    setModelRetryState(context, settings, conversation, capsule.mode, capsule.thinkingTrace,
        capsule.conversation);
    watch.progressStart(requestId, 'thinking', 'summarizing recorded tool results');
    requestModel(settings, conversation, requestId, {}, function(error, json) {
      var batch;
      var answer;

      if (!isCurrentCompletion(context)) {
        return;
      }
      if (error) {
        failCompletionContext(context, error);
        return;
      }
      updateProgressContextSizes(requestId, settings, json);
      batch = extractToolCallBatch(json, capsule.mode, {});
      if (batch.calls.length) {
        answer = 'Recovery requested another tool. No additional actions were run. I can only summarize recorded results.';
      } else {
        answer = parseResponse(json, settings.ShowThinking, capsule.thinkingTrace);
      }
      sendCompletionResponse(context, settings, capsule.userText, answer);
    });
    return true;
  }
  return false;
}

function requestCompletion(requestId, userText) {
  var settings = common.loadSettings();
  var previousContext = s_active_completion;
  var completionContext;

  clearCompletionTimers(previousContext);
  s_retry_capsule = null;
  completionContext = createCompletionContext(requestId, userText, copyChatHistory(s_chat_history));
  activateCompletion(completionContext);
  startCompletion(completionContext, settings);
}

function cancelCompletion(requestId) {
  var context;
  var canceled;

  if (!watch.isCurrentRequest(requestId)) {
    return false;
  }
  s_retry_capsule = null;
  context = s_active_completion;
  if (context && Number(context.requestId) === Number(requestId)) {
    clearCompletionTimers(context);
    s_active_completion = null;
  }
  canceled = watch.cancelRequestLifecycle(requestId);
  if (canceled && tools.cancelMcpRequest) {
    tools.cancelMcpRequest(requestId);
  }
  return canceled;
}

module.exports = {
  resetChatHistory: resetChatHistory,
  listSavedChats: listSavedChats,
  loadSavedChat: loadSavedChat,
  deleteSavedChat: deleteSavedChat,
  deleteAllSavedChats: deleteAllSavedChats,
  requestCompletion: requestCompletion,
  cancelCompletion: cancelCompletion,
  retryCompletion: retryCompletion
};
