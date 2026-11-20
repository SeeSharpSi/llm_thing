var common = require('./settings');

var STORE_KEY = 'llm_thing_saved_chats_v1';
var MAX_SAVED_CHATS = 20;
var MAX_SAVED_CHAT_STORAGE_BYTES = 256 * 1024;
var MAX_CHAT_TITLE_CHARS = 48;

function nowMs() {
  return (new Date()).getTime();
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]+/g, ' ').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
}

function generateId() {
  return String(nowMs()) + '_' + String(Math.floor(Math.random() * 1000000));
}

function copyMessages(messages) {
  var result = [];
  var i;
  var message;
  var role;

  messages = messages || [];
  for (i = 0; i < messages.length; i += 1) {
    message = messages[i] || {};
    role = message.role;
    if (role !== 'user' && role !== 'assistant') {
      continue;
    }
    result.push({
      role: role,
      content: common.truncate(String(message.content || ''), common.MAX_CHAT_HISTORY_MESSAGE_CHARS)
    });
  }

  while (result.length > common.MAX_CHAT_HISTORY_MESSAGES) {
    result.splice(0, 2);
  }

  return result;
}

function firstUserPrompt(messages) {
  var i;

  messages = messages || [];
  for (i = 0; i < messages.length; i += 1) {
    if (messages[i] && messages[i].role === 'user') {
      return messages[i].content || '';
    }
  }

  return '';
}

function summarizePrompt(prompt) {
  var text = normalizeWhitespace(prompt);
  var sentenceEnd;
  var title;

  if (!text) {
    return 'Untitled chat';
  }

  sentenceEnd = text.search(/[.!?]/);
  if (sentenceEnd > 8 && sentenceEnd < MAX_CHAT_TITLE_CHARS) {
    text = text.substring(0, sentenceEnd + 1);
  }

  title = common.truncate(text, MAX_CHAT_TITLE_CHARS);
  return title || 'Untitled chat';
}

function normalizeTimestamp(value, fallback) {
  var number = parseInt(value, 10);

  if (isNaN(number) || number <= 0) {
    return fallback;
  }

  return number;
}

function normalizeChat(chat) {
  var time = nowMs();
  var messages;

  if (!chat || typeof chat !== 'object') {
    return null;
  }

  messages = copyMessages(chat.messages);
  if (!messages.length) {
    return null;
  }

  return {
    id: String(chat.id || generateId()),
    title: common.truncate(normalizeWhitespace(chat.title || summarizePrompt(firstUserPrompt(messages))), MAX_CHAT_TITLE_CHARS),
    createdAt: normalizeTimestamp(chat.createdAt, time),
    updatedAt: normalizeTimestamp(chat.updatedAt, time),
    messages: messages
  };
}

function sortNewestFirst(chats) {
  chats.sort(function(a, b) {
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
}

function utf8ByteLength(value) {
  var bytes = 0;
  var i;
  var code;

  for (i = 0; i < value.length; i += 1) {
    code = value.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length && value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) {
      bytes += 4;
      i += 1;
    } else {
      bytes += 3;
    }
  }

  return bytes;
}

function serializeStore(store) {
  return JSON.stringify({
    version: 1,
    chats: store.chats
  });
}

function loadStore() {
  var parsed;
  var raw;
  var store = { version: 1, chats: [] };
  var chats;
  var i;
  var chat;

  try {
    raw = localStorage.getItem(STORE_KEY) || '';
    parsed = raw ? JSON.parse(raw) : null;
  } catch (e) {
    common.logDebug('saved chats parse failed');
    return store;
  }

  chats = parsed && parsed.chats && parsed.chats.length ? parsed.chats : [];
  for (i = 0; i < chats.length; i += 1) {
    chat = normalizeChat(chats[i]);
    if (chat) {
      store.chats.push(chat);
    }
  }

  sortNewestFirst(store.chats);
  while (store.chats.length > MAX_SAVED_CHATS) {
    store.chats.pop();
  }

  return store;
}

function saveStore(store) {
  var serialized;

  sortNewestFirst(store.chats);
  while (store.chats.length > MAX_SAVED_CHATS) {
    store.chats.pop();
  }

  serialized = serializeStore(store);
  while (store.chats.length && utf8ByteLength(serialized) > MAX_SAVED_CHAT_STORAGE_BYTES) {
    store.chats.pop();
    serialized = serializeStore(store);
  }

  while (store.chats.length >= 0) {
    try {
      localStorage.setItem(STORE_KEY, serialized);
      return true;
    } catch (e) {
      if (!store.chats.length) {
        common.logDebug('saved chats write failed empty');
        return false;
      }
      store.chats.pop();
      serialized = serializeStore(store);
    }
  }

  return false;
}

function findChatIndex(store, chatId) {
  var id = String(chatId || '');
  var i;

  for (i = 0; i < store.chats.length; i += 1) {
    if (store.chats[i].id === id) {
      return i;
    }
  }

  return -1;
}

function listChats() {
  var store = loadStore();
  var result = [];
  var i;
  var chat;

  for (i = 0; i < store.chats.length; i += 1) {
    chat = store.chats[i];
    result.push({
      id: chat.id,
      title: chat.title,
      updatedAt: chat.updatedAt
    });
  }

  return result;
}

function getChat(chatId) {
  var store = loadStore();
  var index = findChatIndex(store, chatId);
  var chat;

  if (index === -1) {
    return null;
  }

  chat = store.chats[index];
  return {
    id: chat.id,
    title: chat.title,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    messages: copyMessages(chat.messages)
  };
}

function saveChatHistory(activeChatId, messages) {
  var store = loadStore();
  var index = findChatIndex(store, activeChatId);
  var copied = copyMessages(messages);
  var time = nowMs();
  var chat;

  if (!copied.length) {
    return null;
  }

  if (index === -1) {
    chat = {
      id: generateId(),
      title: summarizePrompt(firstUserPrompt(copied)),
      createdAt: time,
      updatedAt: time,
      messages: copied
    };
    store.chats.push(chat);
  } else {
    chat = store.chats[index];
    chat.updatedAt = time;
    chat.messages = copied;
    if (!chat.title) {
      chat.title = summarizePrompt(firstUserPrompt(copied));
    }
  }

  if (!saveStore(store) || findChatIndex(store, chat.id) === -1) {
    return null;
  }

  return {
    id: chat.id,
    title: chat.title
  };
}

function deleteChat(chatId) {
  var store = loadStore();
  var index = findChatIndex(store, chatId);

  if (index === -1) {
    return false;
  }

  store.chats.splice(index, 1);
  saveStore(store);
  return true;
}

function deleteAllChats() {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch (e) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ version: 1, chats: [] }));
    } catch (e2) {}
  }
}

module.exports = {
  MAX_SAVED_CHATS: MAX_SAVED_CHATS,
  MAX_SAVED_CHAT_STORAGE_BYTES: MAX_SAVED_CHAT_STORAGE_BYTES,
  listChats: listChats,
  getChat: getChat,
  saveChatHistory: saveChatHistory,
  deleteChat: deleteChat,
  deleteAllChats: deleteAllChats
};
