var common = require('./settings');
var watch = require('./watch');
var tools = require('./tools');

var s_chat_history = [];

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

  text = '\n\nPhone-side tools are available. Current phone date/time: ' + formatDateTime(new Date()) + '.' +
    '\nOnly tools listed here are enabled in app settings.' +
    '\nYou may use at most ' + maxToolCalls + ' tool call(s) total for this request.';

  if (hasTimelineTools(toolDefinitions)) {
    text += '\nTimeline tool rules:' +
      '\n- For reminder requests, alarms, alerts, or phrases like "remind me", call pebble_timeline_create_reminder.' +
      '\n- For non-reminder calendar events, schedule items, or timeline pins, call pebble_timeline_create_or_update_pin.' +
      '\n- Do not say a reminder, event, or pin was created, updated, or deleted unless the timeline tool result succeeded.' +
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

function shouldRequestReasoningSummary(settings, options) {
  return !!(settings.ShowThinking && !isChatEndpoint(settings) && !(options && options.skipReasoningSummary));
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
    content: common.truncate(userText, common.MAX_CHAT_HISTORY_MESSAGE_CHARS)
  });
  s_chat_history.push({
    role: 'assistant',
    content: common.truncate(assistantText, common.MAX_CHAT_HISTORY_MESSAGE_CHARS)
  });

  while (s_chat_history.length > common.MAX_CHAT_HISTORY_MESSAGES) {
    s_chat_history.splice(0, 2);
  }
}

function resetChatHistory() {
  s_chat_history = [];
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

function buildNativeTools(toolDefinitions, chatMode) {
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

    if (chatMode) {
      result.push({
        type: 'function',
        function: definition
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

function buildBody(settings, conversation, options) {
  var chatMode = isChatEndpoint(settings);
  var body;

  options = options || {};

  if (chatMode) {
    body = {
      model: settings.Model,
      messages: conversation
    };
    if (options.nativeTools && options.toolDefinitions && options.toolDefinitions.length) {
      body.tools = buildNativeTools(options.toolDefinitions, true);
    }
    return body;
  }

  body = {
    model: settings.Model,
    input: conversation
  };

  if (shouldRequestReasoningSummary(settings, options)) {
    body.reasoning = { summary: 'auto' };
  }

  if (options.nativeTools && options.toolDefinitions && options.toolDefinitions.length) {
    body.tools = buildNativeTools(options.toolDefinitions, false);
  }

  return body;
}

function requestModel(settings, conversation, requestId, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  options = options || {};

  function sendAttempt(skipReasoningSummary) {
    var request = new XMLHttpRequest();
    var requestOptions = copyRequestOptions(options);
    var includeReasoningSummary;
    var body;

    if (skipReasoningSummary) {
      requestOptions.skipReasoningSummary = true;
    }
    includeReasoningSummary = shouldRequestReasoningSummary(settings, requestOptions);
    body = JSON.stringify(buildBody(settings, conversation, requestOptions));

    common.logDebug('llm request endpoint=' + settings.Endpoint + ' model=' + settings.Model + ' mode=' + (isChatEndpoint(settings) ? 'chat' : 'responses') + ' nativeTools=' + (requestOptions.nativeTools ? '1' : '0') + ' tools=' + ((requestOptions.toolDefinitions && requestOptions.toolDefinitions.length) || 0) + ' reasoningSummary=' + (includeReasoningSummary ? '1' : '0') + ' messages=' + conversation.length + ' bytes=' + body.length);

    request.open('POST', settings.Endpoint, true);
    request.setRequestHeader('Content-Type', 'application/json');
    request.setRequestHeader('Authorization', 'Bearer ' + settings.ApiKey);
    request.timeout = 60000;

    if (!watch.trackXhr(requestId, request)) {
      return;
    }

    request.onload = function() {
      var json;

      watch.untrackXhr(requestId, request);
      if (!watch.isCurrentRequest(requestId)) {
        return;
      }

      common.logDebug('llm response status=' + request.status + ' bytes=' + String(request.responseText || '').length);

      if (request.status < 200 || request.status >= 300) {
        if (includeReasoningSummary && (request.status === 400 || request.status === 422)) {
          common.logDebug('reasoning summary rejected; retrying without summary');
          sendAttempt(true);
          return;
        }
        callback('HTTP ' + request.status + ': ' + String(request.responseText || '').substring(0, 250), null, { status: request.status });
        return;
      }

      try {
        json = JSON.parse(request.responseText);
      } catch (e) {
        callback('Bad JSON response');
        return;
      }

      callback(null, json, { status: request.status });
    };

    request.onerror = function() {
      watch.untrackXhr(requestId, request);
      if (!watch.isCurrentRequest(requestId)) {
        return;
      }
      common.logDebug('llm network error');
      callback('Network error');
    };

    request.ontimeout = function() {
      watch.untrackXhr(requestId, request);
      if (!watch.isCurrentRequest(requestId)) {
        return;
      }
      common.logDebug('llm timeout');
      callback('Request timed out');
    };

    request.onabort = function() {
      watch.untrackXhr(requestId, request);
    };

    request.send(body);
  }

  sendAttempt(false);
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

  return answer;
}

function stripThinking(text) {
  return String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^\s+/, '');
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

function parseResponse(json, showThinking, extraThinking) {
  var answer = extractResponseText(json);
  var fallback = 'No response text. ' + summarizeResponseShape(json);
  var thinking = extractResponseThinking(json);
  var blocks;

  answer = answer || fallback;

  if (!showThinking) {
    return stripThinking(answer);
  }

  blocks = extractThinkingBlocks(answer);
  thinking = appendThinkingText(thinking, blocks.thinking);
  thinking = appendThinkingText(common.trim(extraThinking), thinking);
  answer = blocks.answer;

  if (!thinking) {
    return answer;
  }

  return 'Thinking:\n' + thinking + '\n\nAnswer:\n' + stripThinking(answer);
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

function formatToolResultOutput(result) {
  if (result.error) {
    return common.safeJson({ error: result.error });
  }

  return common.safeJson({ result: result.result });
}

function buildSkippedToolResults(toolCalls) {
  var results = [];
  var i;
  var call;

  for (i = 0; i < toolCalls.length; i += 1) {
    call = toolCalls[i] || {};
    results.push({
      id: call.id || call.call_id || call.name || String(i + 1),
      call_id: call.call_id || call.id || call.name || String(i + 1),
      name: call.name || 'unknown',
      error: 'Tool call budget exhausted'
    });
  }

  return results;
}

function appendTextToolResults(conversation, assistantText, results, noMoreTools, skippedCount) {
  var content = 'Tool results:\n' + common.safeJson(results);
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

function appendNativeToolResults(conversation, settings, json, toolCalls, results, noMoreTools, skippedCount) {
  var i;
  var result;

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

function requestFinalAfterToolCap(requestId, settings, conversation, toolDefinitions, toolMap, mode, thinkingTrace, callback) {
  var requestOptions = mode === 'native' ? { nativeTools: true, toolDefinitions: toolDefinitions } : {};

  watch.progressSet(requestId, 'thinking', 'tool call limit reached');
  requestModel(settings, conversation, requestId, requestOptions, function(error, json) {
    var assistantText;
    var batch;
    if (!watch.isCurrentRequest(requestId)) {
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

function completeWithTools(requestId, settings, conversation, toolDefinitions, toolMap, mode, round, usedToolCalls, thinkingTrace, callback) {
  var requestOptions = mode === 'native' ? { nativeTools: true, toolDefinitions: toolDefinitions } : {};

  thinkingTrace = thinkingTrace || '';

  common.logDebug('tool loop mode=' + mode + ' round=' + round + ' availableTools=' + Object.keys(toolMap).length + ' usedToolCalls=' + usedToolCalls + ' maxToolCalls=' + settings.MaxToolCalls);
  watch.progressSet(requestId, 'thinking', round === 0 ? '' : 'with tool results');
  requestModel(settings, conversation, requestId, requestOptions, function(error, json) {
    var assistantText;
    var batch;
    var toolCalls;
    var originalToolCalls;
    var skippedToolCalls;
    var skippedResults;
    var remainingToolCalls;
    var noMoreTools;
    var skippedCount;

    if (!watch.isCurrentRequest(requestId)) {
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
      appendToolResults(conversation, settings, json, assistantText, batch.source, originalToolCalls, skippedResults, true, originalToolCalls.length);
      requestFinalAfterToolCap(requestId, settings, conversation, toolDefinitions, toolMap, mode, thinkingTrace, callback);
      return;
    }
    noMoreTools = originalToolCalls.length >= remainingToolCalls;
    skippedCount = 0;
    skippedToolCalls = [];
    if (originalToolCalls.length > remainingToolCalls) {
      skippedCount = originalToolCalls.length - remainingToolCalls;
      common.logDebug('tool loop truncating toolCalls=' + originalToolCalls.length + ' remaining=' + remainingToolCalls);
      skippedToolCalls = originalToolCalls.slice(remainingToolCalls);
      toolCalls = originalToolCalls.slice(0, remainingToolCalls);
    }
    skippedResults = buildSkippedToolResults(skippedToolCalls);
    tools.runToolCalls(requestId, toolCalls, toolMap, function(results) {
      if (!watch.isCurrentRequest(requestId)) {
        return;
      }
      results = results.concat(skippedResults);
      common.logDebug('tool loop results=' + results.length + ' skipped=' + skippedCount);
      appendToolResults(conversation, settings, json, assistantText, batch.source, originalToolCalls, results, noMoreTools, skippedCount);
      if (noMoreTools) {
        requestFinalAfterToolCap(requestId, settings, conversation, toolDefinitions, toolMap, mode, thinkingTrace, callback);
        return;
      }
      completeWithTools(requestId, settings, conversation, toolDefinitions, toolMap, mode, round + 1, usedToolCalls + results.length, thinkingTrace, callback);
    });
  });
}

function requestCompletion(requestId, userText) {
  var settings = common.loadSettings();
  var conversation;

  common.logDebug('request start id=' + requestId + ' textChars=' + String(userText || '').length + ' endpoint=' + settings.Endpoint + ' model=' + settings.Model + ' maxToolCalls=' + settings.MaxToolCalls + ' geoTool=' + settings.GeolocationToolEnabled + ' timelineTool=' + settings.TimelineToolEnabled + ' healthTool=' + settings.HealthToolEnabled + ' history=' + s_chat_history.length);
  watch.beginRequestLifecycle(requestId);
  watch.syncWatchSettings(settings);
  watch.progressStart(requestId, 'thinking', '');

  if (!settings.Endpoint) {
    watch.sendError(requestId, 'Endpoint missing. Open settings on phone.');
    watch.finishRequestLifecycle(requestId);
    return;
  }

  if (!settings.ApiKey) {
    watch.sendError(requestId, 'API key missing. Open settings on phone.');
    watch.finishRequestLifecycle(requestId);
    return;
  }

  if (settings.MaxToolCalls <= 0) {
    common.logDebug('tools disabled maxToolCalls=0');
    conversation = buildConversation(settings, userText, '');
    completeWithTools(requestId, settings, conversation, [], {}, 'text', 0, 0, '', function(completionError, text) {
      if (!watch.isCurrentRequest(requestId)) {
        return;
      }
      if (completionError) {
        watch.sendError(requestId, completionError);
        watch.finishRequestLifecycle(requestId);
        return;
      }

      watch.sendResponse(requestId, settings, text, function() {
        if (watch.isCurrentRequest(requestId)) {
          rememberChatTurn(userText, text);
        }
        watch.finishRequestLifecycle(requestId);
      });
    });
    return;
  }

  watch.progressSet(requestId, 'Loading tools', 'discovering phone tools');
  tools.discoverPhoneTools(settings, requestId, function(error, discoveredTools, toolMap) {
    if (!watch.isCurrentRequest(requestId)) {
      return;
    }
    if (error) {
      watch.sendError(requestId, error);
      watch.finishRequestLifecycle(requestId);
      return;
    }

    conversation = buildConversation(settings, userText, buildToolInstructions(discoveredTools, settings.MaxToolCalls, true));
    common.logDebug('tools discover done tools=' + discoveredTools.length);
    watch.progressDone(requestId, 'Tools loaded', discoveredTools.length + ' tools');

    function finishCompletion(completionError, text) {
      if (!watch.isCurrentRequest(requestId)) {
        return;
      }
      if (completionError) {
        watch.sendError(requestId, completionError);
        watch.finishRequestLifecycle(requestId);
        return;
      }

      watch.sendResponse(requestId, settings, text, function() {
        if (watch.isCurrentRequest(requestId)) {
          rememberChatTurn(userText, text);
        }
        watch.finishRequestLifecycle(requestId);
      });
    }

    completeWithTools(requestId, settings, conversation, discoveredTools, toolMap, 'native', 0, 0, '', function(completionError, text, meta) {
      if (!watch.isCurrentRequest(requestId)) {
        return;
      }

      if (completionError && meta && meta.nativeUnsupported) {
        common.logDebug('native tool request rejected; retrying text tool fallback');
        conversation = buildConversation(settings, userText, buildToolInstructions(discoveredTools, settings.MaxToolCalls, false));
        completeWithTools(requestId, settings, conversation, discoveredTools, toolMap, 'text', 0, 0, '', finishCompletion);
        return;
      }

      finishCompletion(completionError, text);
    });
  });
}

module.exports = {
  resetChatHistory: resetChatHistory,
  requestCompletion: requestCompletion
};
