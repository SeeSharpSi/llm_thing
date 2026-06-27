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

function buildToolInstructions(tools, maxToolCalls) {
  var text;
  var i;
  var hasTimelineTools = false;

  if (!tools.length || maxToolCalls <= 0) {
    return '';
  }

  for (i = 0; i < tools.length; i += 1) {
    if (String(tools[i].name || '').indexOf('pebble_timeline_') === 0) {
      hasTimelineTools = true;
      break;
    }
  }

  text = '\n\nPhone-side tools are available. If a tool is needed, respond with only JSON in this exact shape:' +
    '\n{"tool_calls":[{"id":"call_1","name":"tool_name","arguments":{}}]}' +
    '\nDo not include markdown, explanation, or final answer with tool call JSON. After tool results are provided, answer the user normally or request more tools with the same JSON shape.' +
    '\nOnly tools listed here are enabled in app settings.' +
    '\nYou may use at most ' + maxToolCalls + ' tool call(s) total for this request.';

  if (hasTimelineTools) {
    text += '\nTimeline tool rules:' +
      '\n- For reminder requests, alarms, alerts, or phrases like "remind me", call pebble_timeline_create_reminder.' +
      '\n- For non-reminder calendar events, schedule items, or timeline pins, call pebble_timeline_create_or_update_pin.' +
      '\n- Do not say a reminder, event, or pin was created, updated, or deleted unless the timeline tool result succeeded.' +
      '\n- After a successful timeline tool result, include the title/time when known and the returned pin id.' +
      '\n- If title, time, or target pin is ambiguous, ask one concise clarification instead of calling a tool.';
  }

  text += '\nAvailable tools:';

  for (i = 0; i < tools.length; i += 1) {
    text += '\n- ' + tools[i].name + ': ' + tools[i].description + '\n  Parameters JSON Schema: ' + common.safeJson(tools[i].parameters);
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

  common.logDebug('llm request endpoint=' + settings.Endpoint + ' model=' + settings.Model + ' mode=' + (isChatEndpoint(settings) ? 'chat' : 'responses') + ' messages=' + conversation.length + ' bytes=' + body.length);

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
    answer = answer || common.collectTextFromContent(message.reasoning_content);
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
        thinking += common.collectTextFromContent(item.summary || item.content || item.reasoning);
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
  var value = common.trim(text);
  var match = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  if (match) {
    return common.trim(match[1]);
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

  if (parsed && parsed.function && parsed.function.name) {
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

function requestFinalAfterToolCap(requestId, settings, conversation, callback) {
  watch.progressSet(requestId, 'thinking', 'tool call limit reached');
  requestModel(settings, conversation, requestId, function(error, json) {
    var assistantText;
    if (!watch.isCurrentRequest(requestId)) {
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
  common.logDebug('tool loop round=' + round + ' availableTools=' + Object.keys(toolMap).length + ' usedToolCalls=' + usedToolCalls + ' maxToolCalls=' + settings.MaxToolCalls);
  watch.progressSet(requestId, 'thinking', round === 0 ? '' : 'with tool results');
  requestModel(settings, conversation, requestId, function(error, json) {
    var assistantText;
    var toolCalls;
    var remainingToolCalls;
    var noMoreTools;
    var skippedCount;

    if (!watch.isCurrentRequest(requestId)) {
      return;
    }
    if (error) {
      callback(error);
      return;
    }

    assistantText = extractResponseText(json);
    toolCalls = parseToolCalls(assistantText);
    common.logDebug('llm response shape ' + summarizeResponseShape(json));
    common.logDebug('tool loop model textChars=' + assistantText.length + ' toolCalls=' + toolCalls.length);

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
      common.logDebug('tool loop truncating toolCalls=' + toolCalls.length + ' remaining=' + remainingToolCalls);
      toolCalls = toolCalls.slice(0, remainingToolCalls);
    }
    tools.runToolCalls(requestId, toolCalls, toolMap, function(results) {
      if (!watch.isCurrentRequest(requestId)) {
        return;
      }
      common.logDebug('tool loop results=' + results.length);
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
    completeWithTools(requestId, settings, conversation, {}, 0, 0, function(completionError, text) {
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

    conversation = buildConversation(settings, userText, buildToolInstructions(discoveredTools, settings.MaxToolCalls));
    common.logDebug('tools discover done tools=' + discoveredTools.length);
    watch.progressDone(requestId, 'Tools loaded', discoveredTools.length + ' tools');
    completeWithTools(requestId, settings, conversation, toolMap, 0, 0, function(completionError, text) {
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
  });
}

module.exports = {
  resetChatHistory: resetChatHistory,
  requestCompletion: requestCompletion
};
