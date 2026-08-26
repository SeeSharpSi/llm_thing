var common = require('./settings');

var STORE_KEY = 'llm_thing_endpoint_cache_v1';
var ENVELOPE_VERSION = 1;
var MAX_ENTRIES = 32;
var PROTOCOLS = { 'responses': true, 'chat-completions': true, 'messages': true };
var TERMINAL_SUFFIXES = ['/responses', '/chat/completions', '/messages'];
var SCHEME_PATTERN = /^([A-Za-z][A-Za-z0-9+\-.]*):\/\//;

function nowMs() {
  return (new Date()).getTime();
}

function trimWhitespace(value) {
  return String(value === undefined || value === null ? '' : value).replace(/^\s+|\s+$/g, '');
}

function isValidProtocol(protocol) {
  return typeof protocol === 'string' && Object.prototype.hasOwnProperty.call(PROTOCOLS, protocol);
}

function stripQueryAndHash(text) {
  var queryIndex = text.indexOf('?');
  var hashIndex = text.indexOf('#');
  var cutIndex;

  if (queryIndex === -1 && hashIndex === -1) {
    return text;
  }
  if (queryIndex === -1) {
    cutIndex = hashIndex;
  } else if (hashIndex === -1) {
    cutIndex = queryIndex;
  } else {
    cutIndex = queryIndex < hashIndex ? queryIndex : hashIndex;
  }

  return text.substring(0, cutIndex);
}

function stripTrailingSlashes(text) {
  while (text.length && text.charAt(text.length - 1) === '/') {
    text = text.substring(0, text.length - 1);
  }

  return text;
}

function stripUserinfo(authority) {
  var atIndex = authority.lastIndexOf('@');

  if (atIndex === -1) {
    return authority;
  }

  return authority.substring(atIndex + 1);
}

function stripTerminalSuffix(pathText) {
  var i;
  var suffix;
  var offset;

  for (i = 0; i < TERMINAL_SUFFIXES.length; i += 1) {
    suffix = TERMINAL_SUFFIXES[i];
    offset = pathText.length - suffix.length;
    if (offset >= 0 && pathText.substring(offset).toLowerCase() === suffix) {
      return pathText.substring(0, offset);
    }
  }

  return pathText;
}

function normalizeEndpoint(endpoint) {
  var raw = stripTrailingSlashes(stripQueryAndHash(trimWhitespace(endpoint)));
  var schemeMatch = SCHEME_PATTERN.exec(raw);
  var remainder;
  var slashIndex;
  var authority;
  var path;

  if (!raw) {
    return '';
  }

  if (!schemeMatch) {
    return stripTerminalSuffix(raw);
  }

  remainder = raw.substring(schemeMatch[0].length);
  if (!remainder) {
    return '';
  }

  slashIndex = remainder.indexOf('/');
  if (slashIndex === -1) {
    authority = stripUserinfo(remainder).toLowerCase();
    if (!authority) {
      return '';
    }
    return schemeMatch[1].toLowerCase() + '://' + authority;
  }

  authority = stripUserinfo(remainder.substring(0, slashIndex)).toLowerCase();
  if (!authority) {
    return '';
  }

  path = stripTrailingSlashes(stripTerminalSuffix(remainder.substring(slashIndex)));

  return schemeMatch[1].toLowerCase() + '://' + authority + path;
}

function findEntryIndex(entries, provider, model) {
  var i;

  for (i = 0; i < entries.length; i += 1) {
    if (entries[i].provider === provider && entries[i].model === model) {
      return i;
    }
  }

  return -1;
}

function sortEntryIndices(entries) {
  var indices = [];
  var i;

  for (i = 0; i < entries.length; i += 1) {
    indices.push(i);
  }

  indices.sort(function(a, b) {
    var delta = (entries[b].updatedAt || 0) - (entries[a].updatedAt || 0);

    if (delta !== 0) {
      return delta;
    }

    return a - b;
  });

  return indices;
}

function pruneEntries(entries) {
  var indices = sortEntryIndices(entries);
  var result = [];
  var i;
  var j;
  var entry;
  var duplicate;

  for (i = 0; i < indices.length && result.length < MAX_ENTRIES; i += 1) {
    entry = entries[indices[i]];
    duplicate = false;
    for (j = 0; j < result.length; j += 1) {
      if (result[j].provider === entry.provider && result[j].model === entry.model) {
        duplicate = true;
        break;
      }
    }
    if (!duplicate) {
      result.push(entry);
    }
  }

  return result;
}

function normalizeStoredEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  if (typeof entry.provider !== 'string' || !entry.provider) {
    return null;
  }
  if (typeof entry.model !== 'string' || !entry.model) {
    return null;
  }
  if (!isValidProtocol(entry.protocol)) {
    return null;
  }
  if (typeof entry.updatedAt !== 'number' || !isFinite(entry.updatedAt) || entry.updatedAt <= 0) {
    return null;
  }

  return {
    provider: entry.provider,
    model: entry.model,
    protocol: entry.protocol,
    updatedAt: entry.updatedAt
  };
}

function loadEntries() {
  var parsed;
  var raw;
  var collected = [];
  var i;
  var entry;

  try {
    raw = localStorage.getItem(STORE_KEY) || '';
    parsed = raw ? JSON.parse(raw) : null;
  } catch (e) {
    common.logDebug('endpoint cache parse failed');
    return [];
  }

  if (!parsed || typeof parsed !== 'object' || parsed.version !== ENVELOPE_VERSION || !Array.isArray(parsed.entries)) {
    return [];
  }

  for (i = 0; i < parsed.entries.length; i += 1) {
    entry = normalizeStoredEntry(parsed.entries[i]);
    if (entry) {
      collected.push(entry);
    }
  }

  return pruneEntries(collected);
}

function saveEntries(entries) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      version: ENVELOPE_VERSION,
      entries: pruneEntries(entries)
    }));
    return true;
  } catch (e) {
    common.logDebug('endpoint cache write failed');
    return false;
  }
}

function get(endpoint, model) {
  var provider;
  var modelName;
  var entries;
  var index;

  if (typeof endpoint !== 'string' || typeof model !== 'string') {
    return '';
  }

  provider = normalizeEndpoint(endpoint);
  modelName = trimWhitespace(model);
  if (!provider || !modelName) {
    return '';
  }

  entries = loadEntries();
  index = findEntryIndex(entries, provider, modelName);
  if (index === -1 || !isValidProtocol(entries[index].protocol)) {
    return '';
  }

  return entries[index].protocol;
}

function remember(endpoint, model, protocol) {
  var provider;
  var modelName;
  var entries;
  var index;
  var time;

  if (typeof endpoint !== 'string' || typeof model !== 'string' || !isValidProtocol(protocol)) {
    return false;
  }

  provider = normalizeEndpoint(endpoint);
  modelName = trimWhitespace(model);
  if (!provider || !modelName) {
    return false;
  }

  entries = loadEntries();
  time = nowMs();
  index = findEntryIndex(entries, provider, modelName);
  if (index !== -1) {
    entries[index].protocol = protocol;
    entries[index].updatedAt = time;
  } else {
    entries.push({
      provider: provider,
      model: modelName,
      protocol: protocol,
      updatedAt: time
    });
  }

  return saveEntries(entries);
}

module.exports = {
  get: get,
  remember: remember
};
