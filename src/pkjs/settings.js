var SETTINGS_KEY = 'llm_thing_settings';
var DEFAULT_MAX_TOOL_CALLS = 4;
var DEFAULT_REQUEST_TIMEOUT_MS = 60000;
var MAX_CHAT_HISTORY_MESSAGES = 16;
var MAX_CHAT_HISTORY_MESSAGE_CHARS = 3000;

var DEFAULT_SETTINGS = {
  Endpoint: 'https://api.openai.com/v1/responses',
  ApiKey: '',
  Model: 'gpt-4.1-mini',
  RequestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
  SystemPrompt: 'You are a helpful assistant. Keep answers concise for a watch screen. Use Markdown bold when useful, but do not use italics or strikethrough.',
  ShowThinking: false,
  ShowInputContextSize: false,
  ShowOutputContextSize: false,
  PreserveChats: false,
  DeleteAllPastChats: false,
  WebSearchEnabled: false,
  GeolocationToolEnabled: false,
  TimelineToolEnabled: false,
  HealthToolEnabled: false,
  MaxToolCalls: DEFAULT_MAX_TOOL_CALLS,
  FontSize: 18,
  BuzzStrength: 1,
  ScrollLines: 3,
  TouchScrollEnabled: true,
  StartDictationQuickLaunch: false,
  TextColor: 0x000000,
  BackgroundColor: 0xFFFFFF,
  PromptBackgroundColor: 0xAAAAAA,
  BoldTextColor: 0x000000,
  McpServersJson: '[]'
};

function logDebug(message) {
  console.log('[llm_thing] ' + message);
}

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
  result.ShowInputContextSize = result.ShowInputContextSize === true || result.ShowInputContextSize === 1 || result.ShowInputContextSize === '1';
  result.ShowOutputContextSize = result.ShowOutputContextSize === true || result.ShowOutputContextSize === 1 || result.ShowOutputContextSize === '1';
  result.PreserveChats = result.PreserveChats === true || result.PreserveChats === 1 || result.PreserveChats === '1';
  result.DeleteAllPastChats = result.DeleteAllPastChats === true || result.DeleteAllPastChats === 1 || result.DeleteAllPastChats === '1';
  result.WebSearchEnabled = result.WebSearchEnabled === true || result.WebSearchEnabled === 1 || result.WebSearchEnabled === '1';
  result.GeolocationToolEnabled = result.GeolocationToolEnabled === true || result.GeolocationToolEnabled === 1 || result.GeolocationToolEnabled === '1';
  result.TimelineToolEnabled = result.TimelineToolEnabled === true || result.TimelineToolEnabled === 1 || result.TimelineToolEnabled === '1';
  result.HealthToolEnabled = result.HealthToolEnabled === true || result.HealthToolEnabled === 1 || result.HealthToolEnabled === '1';
  result.StartDictationQuickLaunch = result.StartDictationQuickLaunch === true || result.StartDictationQuickLaunch === 1 || result.StartDictationQuickLaunch === '1';
  result.TouchScrollEnabled = result.TouchScrollEnabled === true || result.TouchScrollEnabled === 1 || result.TouchScrollEnabled === '1';
  result.MaxToolCalls = minNumber(result.MaxToolCalls, 0, DEFAULT_MAX_TOOL_CALLS);
  result.RequestTimeoutMs = minNumber(result.RequestTimeoutMs, 1000, DEFAULT_REQUEST_TIMEOUT_MS);
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

module.exports = {
  DEFAULT_SETTINGS: DEFAULT_SETTINGS,
  DEFAULT_MAX_TOOL_CALLS: DEFAULT_MAX_TOOL_CALLS,
  DEFAULT_REQUEST_TIMEOUT_MS: DEFAULT_REQUEST_TIMEOUT_MS,
  MAX_CHAT_HISTORY_MESSAGES: MAX_CHAT_HISTORY_MESSAGES,
  MAX_CHAT_HISTORY_MESSAGE_CHARS: MAX_CHAT_HISTORY_MESSAGE_CHARS,
  logDebug: logDebug,
  clampNumber: clampNumber,
  minNumber: minNumber,
  extend: extend,
  loadSettings: loadSettings,
  saveSettings: saveSettings,
  trim: trim,
  splitCsv: splitCsv,
  safeJson: safeJson,
  truncate: truncate,
  collectTextFromContent: collectTextFromContent
};
