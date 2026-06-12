var Clay = require('@rebble/clay');
var clayConfig = require('./config');
var mcpServersComponent = require('./mcp_servers_component');
var clay = new Clay(clayConfig, null, { autoHandleEvents: false });
clay.registerComponent(mcpServersComponent);

var SETTINGS_KEY = 'llm_thing_settings';
var CHUNK_SIZE = 400;
var MAX_RESPONSE_CHARS = 6000;
var MAX_TOOL_ROUNDS = 4;
var MCP_PROTOCOL_VERSION = '2025-06-18';
var MCP_CLIENT_NAME = 'llm_thing';
var MCP_CLIENT_VERSION = '1.0.0';
var s_mcp_request_id = 1;

function logDebug(message) {
  console.log('[llm_thing] ' + message);
}

var DEFAULT_SETTINGS = {
  Endpoint: 'https://api.openai.com/v1/responses',
  ApiKey: '',
  Model: 'gpt-4.1-mini',
  SystemPrompt: 'You are a helpful assistant. Keep answers concise for a watch screen.',
  ShowThinking: false,
  WebSearchEnabled: false,
  McpServersJson: '[]'
};

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

function sendMessage(dict, onSuccess) {
  Pebble.sendAppMessage(dict, function() {
    if (onSuccess) {
      onSuccess();
    }
  }, function(e) {
    logDebug('sendAppMessage failed: ' + JSON.stringify(e));
  });
}

function sendReset(requestId, onSuccess) {
  sendMessage({ ResponseReset: 1, RequestId: requestId }, onSuccess);
}

function sendError(requestId, message) {
  logDebug('watch error request=' + requestId + ' message=' + String(message).substring(0, 160));
  sendReset(requestId, function() {
    sendMessage({ ResponseError: String(message).substring(0, CHUNK_SIZE), RequestId: requestId });
  });
}

function sendResponse(requestId, text) {
  var i = 0;
  var value = String(text || '').substring(0, MAX_RESPONSE_CHARS);

  logDebug('send response request=' + requestId + ' chars=' + value.length);

  function sendNext() {
    if (i >= value.length) {
      sendMessage({ ResponseDone: 1, RequestId: requestId });
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
        label: slugify(server.label),
        url: trim(server.url),
        description: trim(server.description),
        allowedTools: splitCsv(server.allowedTools),
        authorization: trim(server.authorization),
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

function mcpJsonRpc(server, method, params, expectBody, callback) {
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
  request.timeout = 30000;

  logDebug('mcp request server=' + server.label + ' method=' + method + ' id=' + (payload.id || 'notification'));

  request.onload = function() {
    var json;
    var sessionId;

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
    logDebug('mcp network error server=' + server.label + ' method=' + method);
    callback('MCP network error');
  };

  request.ontimeout = function() {
    logDebug('mcp timeout server=' + server.label + ' method=' + method);
    callback('MCP request timed out');
  };

  request.send(JSON.stringify(payload));
}

function initializeMcpServer(server, callback) {
  mcpJsonRpc(server, 'initialize', {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: {
      name: MCP_CLIENT_NAME,
      version: MCP_CLIENT_VERSION
    }
  }, true, function(error) {
    if (error) {
      callback(error);
      return;
    }

    mcpJsonRpc(server, 'notifications/initialized', {}, false, function() {
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

function discoverMcpTools(settings, callback) {
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
    initializeMcpServer(server, function(initError) {
      if (initError) {
        logDebug('mcp initialize failed server=' + server.label + ' error=' + initError);
        finishOne();
        return;
      }

      logDebug('mcp initialized server=' + server.label);

      mcpJsonRpc(server, 'tools/list', {}, true, function(listError, result) {
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

function callMcpTool(toolInfo, args, callback) {
  logDebug('mcp tool call server=' + toolInfo.server.label + ' tool=' + toolInfo.toolName + ' args=' + safeJson(args).substring(0, 240));
  mcpJsonRpc(toolInfo.server, 'tools/call', {
    name: toolInfo.toolName,
    arguments: args || {}
  }, true, function(error, result) {
    if (error) {
      logDebug('mcp tool error server=' + toolInfo.server.label + ' tool=' + toolInfo.toolName + ' error=' + error);
      callback(error);
      return;
    }

    logDebug('mcp tool result server=' + toolInfo.server.label + ' tool=' + toolInfo.toolName + ' chars=' + formatMcpToolResult(result).length);
    callback(null, formatMcpToolResult(result));
  });
}

function runToolCalls(toolCalls, toolMap, callback) {
  var results = [];
  var index = 0;

  function next() {
    var call;
    var name;
    var args;
    var toolInfo;

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
      results.push({
        id: call.id || name || String(index),
        name: name || 'unknown',
        error: 'Unknown or unavailable MCP tool'
      });
      next();
      return;
    }

    callMcpTool(toolInfo, args, function(error, resultText) {
      if (error) {
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
      }
      next();
    });
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

function buildToolInstructions(tools) {
  var text;
  var i;

  if (!tools.length) {
    return '';
  }

  text = '\n\nPhone-side MCP tools are available. If a tool is needed, respond with only JSON in this exact shape:' +
    '\n{"tool_calls":[{"id":"call_1","name":"tool_name","arguments":{}}]}' +
    '\nDo not include markdown, explanation, or final answer with tool call JSON. After tool results are provided, answer the user normally or request more tools with the same JSON shape.' +
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

function buildInitialConversation(settings, userText, toolInstructions) {
  return [
    { role: 'system', content: buildSystemPrompt(settings, toolInstructions) },
    { role: 'user', content: userText }
  ];
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

function requestModel(settings, conversation, callback) {
  var request = new XMLHttpRequest();
  var body = JSON.stringify(buildBody(settings, conversation));

  logDebug('llm request endpoint=' + settings.Endpoint + ' model=' + settings.Model + ' mode=' + (isChatEndpoint(settings) ? 'chat' : 'responses') + ' messages=' + conversation.length + ' bytes=' + body.length);

  request.open('POST', settings.Endpoint, true);
  request.setRequestHeader('Content-Type', 'application/json');
  request.setRequestHeader('Authorization', 'Bearer ' + settings.ApiKey);
  request.timeout = 60000;

  request.onload = function() {
    var json;

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
    logDebug('llm network error');
    callback('Network error');
  };

  request.ontimeout = function() {
    logDebug('llm timeout');
    callback('Request timed out');
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

function appendToolResults(conversation, assistantText, results) {
  conversation.push({
    role: 'assistant',
    content: assistantText
  });
  conversation.push({
    role: 'user',
    content: 'Tool results:\n' + safeJson(results) + '\nUse these results to answer the original request. If another tool is needed, respond only with the same tool_calls JSON shape.'
  });
}

function completeWithTools(settings, conversation, toolMap, round, callback) {
  logDebug('tool loop round=' + round + ' availableTools=' + Object.keys(toolMap).length);
  requestModel(settings, conversation, function(error, json) {
    var assistantText;
    var toolCalls;

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

    if (round >= MAX_TOOL_ROUNDS) {
      callback('Tool loop limit reached');
      return;
    }

    runToolCalls(toolCalls, toolMap, function(results) {
      logDebug('tool loop results=' + results.length);
      appendToolResults(conversation, assistantText, results);
      completeWithTools(settings, conversation, toolMap, round + 1, callback);
    });
  });
}

function requestCompletion(requestId, userText) {
  var settings = loadSettings();

  logDebug('request start id=' + requestId + ' textChars=' + String(userText || '').length + ' endpoint=' + settings.Endpoint + ' model=' + settings.Model);

  if (!settings.Endpoint) {
    sendError(requestId, 'Endpoint missing. Open settings on phone.');
    return;
  }

  if (!settings.ApiKey) {
    sendError(requestId, 'API key missing. Open settings on phone.');
    return;
  }

  discoverMcpTools(settings, function(error, tools, toolMap) {
    var conversation;

    if (error) {
      sendError(requestId, error);
      return;
    }

    conversation = buildInitialConversation(settings, userText, buildToolInstructions(tools));
    logDebug('mcp discover done tools=' + tools.length);
    completeWithTools(settings, conversation, toolMap, 0, function(completionError, text) {
      if (completionError) {
        sendError(requestId, completionError);
        return;
      }

      sendResponse(requestId, text);
    });
  });
}

Pebble.addEventListener('ready', function() {
  logDebug('ready');
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
  saveSettings(clay.getSettings(e.response, false));
});

Pebble.addEventListener('appmessage', function(e) {
  var dict = e.payload || {};
  var requestId = dict.RequestId || 0;

  if (dict.RequestText) {
    logDebug('appmessage request id=' + requestId + ' textChars=' + String(dict.RequestText || '').length);
    requestCompletion(requestId, dict.RequestText);
  }
});
