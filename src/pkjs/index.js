var Clay = require('@rebble/clay');
var clayConfig = require('./config');
var clay = new Clay(clayConfig, null, { autoHandleEvents: false });

var SETTINGS_KEY = 'llm_thing_settings';
var CHUNK_SIZE = 400;

var DEFAULT_SETTINGS = {
  Endpoint: 'https://api.openai.com/v1/responses',
  ApiKey: '',
  Model: 'gpt-4.1-mini',
  SystemPrompt: 'You are a helpful assistant. Keep answers concise for a watch screen.',
  ShowThinking: false,
  McpServer1Enabled: false,
  McpServer1Label: '',
  McpServer1Url: '',
  McpServer1Description: '',
  McpServer1AllowedTools: '',
  McpServer1Authorization: '',
  McpServer2Enabled: false,
  McpServer2Label: '',
  McpServer2Url: '',
  McpServer2Description: '',
  McpServer2AllowedTools: '',
  McpServer2Authorization: '',
  McpServer3Enabled: false,
  McpServer3Label: '',
  McpServer3Url: '',
  McpServer3Description: '',
  McpServer3AllowedTools: '',
  McpServer3Authorization: ''
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
  result.McpServer1Enabled = result.McpServer1Enabled === true || result.McpServer1Enabled === 1 || result.McpServer1Enabled === '1';
  result.McpServer2Enabled = result.McpServer2Enabled === true || result.McpServer2Enabled === 1 || result.McpServer2Enabled === '1';
  result.McpServer3Enabled = result.McpServer3Enabled === true || result.McpServer3Enabled === 1 || result.McpServer3Enabled === '1';
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
    console.log('sendAppMessage failed: ' + JSON.stringify(e));
  });
}

function sendReset(requestId, onSuccess) {
  sendMessage({ ResponseReset: 1, RequestId: requestId }, onSuccess);
}

function sendError(requestId, message) {
  sendReset(requestId, function() {
    sendMessage({ ResponseError: String(message).substring(0, CHUNK_SIZE), RequestId: requestId });
  });
}

function sendResponse(requestId, text) {
  var i = 0;
  var value = String(text || '').substring(0, 6000);

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

function splitCsv(value) {
  var items = String(value || '').split(',');
  var result = [];
  var item;
  var i;

  for (i = 0; i < items.length; i += 1) {
    item = items[i].replace(/^\s+|\s+$/g, '');
    if (item) {
      result.push(item);
    }
  }

  return result;
}

function addMcpTool(tools, settings, index) {
  var enabled = settings['McpServer' + index + 'Enabled'];
  var label = String(settings['McpServer' + index + 'Label'] || '').replace(/^\s+|\s+$/g, '');
  var url = String(settings['McpServer' + index + 'Url'] || '').replace(/^\s+|\s+$/g, '');
  var description = String(settings['McpServer' + index + 'Description'] || '').replace(/^\s+|\s+$/g, '');
  var authorization = String(settings['McpServer' + index + 'Authorization'] || '').replace(/^\s+|\s+$/g, '');
  var allowedTools = splitCsv(settings['McpServer' + index + 'AllowedTools']);
  var tool;

  if (!enabled || !label || !url) {
    return;
  }

  tool = {
    type: 'mcp',
    server_label: label,
    server_url: url,
    require_approval: 'never'
  };

  if (description) {
    tool.server_description = description;
  }
  if (authorization) {
    tool.authorization = authorization;
  }
  if (allowedTools.length) {
    tool.allowed_tools = allowedTools;
  }

  tools.push(tool);
}

function buildMcpTools(settings) {
  var tools = [];

  addMcpTool(tools, settings, 1);
  addMcpTool(tools, settings, 2);
  addMcpTool(tools, settings, 3);

  return tools;
}

function buildBody(settings, userText) {
  var endpoint = String(settings.Endpoint || '').toLowerCase();
  var body;
  var tools;

  if (endpoint.indexOf('/chat/completions') !== -1) {
    return {
      model: settings.Model,
      messages: [
        { role: 'system', content: settings.SystemPrompt },
        { role: 'user', content: userText }
      ]
    };
  }

  body = {
    model: settings.Model,
    input: [
      { role: 'system', content: settings.SystemPrompt },
      { role: 'user', content: userText }
    ]
  };

  tools = buildMcpTools(settings);
  if (tools.length) {
    body.tools = tools;
  }

  return body;
}

function collectTextFromContent(content) {
  var text = '';
  var i;

  if (typeof content === 'string') {
    return content;
  }

  if (!content || !content.length) {
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

function stripThinking(text) {
  return String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^\s+/, '');
}

function parseResponse(json, showThinking) {
  var answer = '';
  var thinking = '';
  var i;
  var j;
  var item;
  var content;
  var hasOutputText = !!json.output_text;

  if (hasOutputText) {
    answer = json.output_text;
  }

  if (json.choices && json.choices.length && json.choices[0].message) {
    answer = answer || collectTextFromContent(json.choices[0].message.content);
    thinking = thinking || json.choices[0].message.reasoning_content || json.choices[0].message.reasoning || '';
  }

  if (json.output && json.output.length) {
    for (i = 0; i < json.output.length; i += 1) {
      item = json.output[i];
      if (item.type === 'reasoning' || item.reasoning) {
        thinking += collectTextFromContent(item.summary || item.content || item.reasoning);
      }
      if (item.content && item.content.length) {
        for (j = 0; j < item.content.length; j += 1) {
          content = item.content[j];
          if (!hasOutputText && (content.type === 'output_text' || content.type === 'text')) {
            answer += content.text || '';
          } else if (content.type === 'reasoning' || content.type === 'reasoning_text') {
            thinking += content.text || '';
          }
        }
      }
    }
  }

  answer = answer || JSON.stringify(json);

  if (!showThinking) {
    return stripThinking(answer);
  }

  if (!thinking) {
    return answer;
  }

  return 'Thinking:\n' + thinking + '\n\nAnswer:\n' + stripThinking(answer);
}

function requestCompletion(requestId, userText) {
  var settings = loadSettings();
  var request;
  var body;

  if (!settings.Endpoint) {
    sendError(requestId, 'Endpoint missing. Open settings on phone.');
    return;
  }

  if (!settings.ApiKey) {
    sendError(requestId, 'API key missing. Open settings on phone.');
    return;
  }

  body = JSON.stringify(buildBody(settings, userText));
  request = new XMLHttpRequest();
  request.open('POST', settings.Endpoint, true);
  request.setRequestHeader('Content-Type', 'application/json');
  request.setRequestHeader('Authorization', 'Bearer ' + settings.ApiKey);
  request.timeout = 60000;

  request.onload = function() {
    var json;

    if (request.status < 200 || request.status >= 300) {
      sendError(requestId, 'HTTP ' + request.status + ': ' + request.responseText.substring(0, 250));
      return;
    }

    try {
      json = JSON.parse(request.responseText);
      sendResponse(requestId, parseResponse(json, settings.ShowThinking));
    } catch (e) {
      sendError(requestId, 'Bad JSON response');
    }
  };

  request.onerror = function() {
    sendError(requestId, 'Network error');
  };

  request.ontimeout = function() {
    sendError(requestId, 'Request timed out');
  };

  request.send(body);
}

Pebble.addEventListener('ready', function() {
  console.log('llm_thing ready');
});

Pebble.addEventListener('showConfiguration', function() {
  clay.setSettings(loadSettings());
  Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener('webviewclosed', function(e) {
  if (!e || !e.response) {
    return;
  }

  saveSettings(clay.getSettings(e.response, false));
});

Pebble.addEventListener('appmessage', function(e) {
  var dict = e.payload || {};
  var requestId = dict.RequestId || 0;

  if (dict.RequestText) {
    requestCompletion(requestId, dict.RequestText);
  }
});
