var opencodeSession = require('./opencode_session');

var MAX_MODELS = 500;
var MAX_MODEL_ID_CHARS = 256;
var MAX_TOTAL_MODEL_CHARS = 30000;
var DISCOVERY_TIMEOUT_MS = 15000;
var CACHE_KEY = 'llm_thing_model_list_cache_v1';
var MAX_CACHE_ENTRIES = 8;
var refreshGenerations = {};

function trim(value) {
  return String(value === undefined || value === null ? '' : value).replace(/^\s+|\s+$/g, '');
}

function deriveModelsUrl(endpoint) {
  var url = trim(endpoint).replace(/[?#].*$/, '').replace(/\/+$/, '');
  var parts = /^(https?:\/\/[^\/?#]+)(\/.*)$/i.exec(url);
  var path;

  if (!parts) {
    return '';
  }

  path = parts[2];
  if (/\/models$/i.test(path)) {
    return parts[1] + path;
  }
  if (/\/(responses|chat\/completions|messages)$/i.test(path)) {
    return parts[1] + path.replace(/\/(responses|chat\/completions|messages)$/i, '/models');
  }
  return '';
}

function normalizeModels(values) {
  var seen = {};
  var models = [];
  var totalChars = 0;
  var id;
  var seenKey;
  var i;

  if (!Array.isArray(values)) {
    return [];
  }

  for (i = 0; i < values.length && models.length < MAX_MODELS; i += 1) {
    id = trim(values[i] && typeof values[i] === 'object' ? values[i].id : values[i]);
    seenKey = 'model:' + id;
    if (!id || id.length > MAX_MODEL_ID_CHARS || seen[seenKey]) {
      continue;
    }
    if (totalChars + id.length > MAX_TOTAL_MODEL_CHARS) {
      break;
    }
    seen[seenKey] = true;
    models.push(id);
    totalChars += id.length;
  }

  models.sort(function(left, right) {
    left = left.toLowerCase();
    right = right.toLowerCase();
    return left < right ? -1 : (left > right ? 1 : 0);
  });
  return models;
}

function parseModels(responseText) {
  var parsed;

  try {
    parsed = JSON.parse(responseText || '');
  } catch (e) {
    return [];
  }
  if (!parsed || !Array.isArray(parsed.data)) {
    return [];
  }
  return normalizeModels(parsed.data);
}

function hashCredentialScope(value) {
  var first = 2166136261;
  var second = 5381;
  var i;

  for (i = 0; i < value.length; i += 1) {
    first = (first * 31 + value.charCodeAt(i)) | 0;
    second ^= value.charCodeAt(i);
    second = (second + (second << 10)) | 0;
    second ^= second >>> 6;
  }
  second = (second + (second << 3)) | 0;
  second ^= second >>> 11;
  second = (second + (second << 15)) | 0;
  return ('00000000' + (first >>> 0).toString(16)).slice(-8) + ('00000000' + (second >>> 0).toString(16)).slice(-8);
}

function getScope(settings) {
  var endpoint = trim(settings && settings.Endpoint);
  var apiKey = trim(settings && settings.ApiKey);
  var modelsUrl = deriveModelsUrl(endpoint);

  if (!endpoint) {
    return { status: 'Enter an endpoint and save settings before refreshing models. Manual model entry remains available.' };
  }
  if (!apiKey) {
    return { status: 'Enter an API key and save settings before refreshing models. Manual model entry remains available.' };
  }
  if (!modelsUrl) {
    return { status: 'Could not derive a models URL. Manual model entry remains available.' };
  }
  return { scope: hashCredentialScope(modelsUrl + '\u0000' + apiKey), modelsUrl: modelsUrl };
}

function readCache() {
  var parsed;
  var records;
  var result = [];
  var i;
  var record;
  var models;

  try {
    parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
  } catch (e) {
    return result;
  }
  records = Array.isArray(parsed) ? parsed : [];
  for (i = 0; i < records.length && result.length < MAX_CACHE_ENTRIES; i += 1) {
    record = records[i];
    if (!record || !/^[0-9a-f]{16}$/.test(record.scope || '') || !Array.isArray(record.models)) {
      continue;
    }
    models = normalizeModels(record.models);
    if (!models.length) {
      continue;
    }
    result.push({
      scope: record.scope,
      models: models,
      status: trim(record.status).substring(0, 300)
    });
  }
  return result;
}

function writeCache(records) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(records.slice(0, MAX_CACHE_ENTRIES)));
  } catch (e) {
    // Cached model discovery is optional when phone storage is unavailable.
  }
}

function modelCountStatus(count) {
  return count + (count === 1 ? ' cached model. ' : ' cached models. ') +
    'Save & Refresh Models, then reopen settings to select the updated list.';
}

function findCachedRecord(records, scope) {
  var i;

  for (i = 0; i < records.length; i += 1) {
    if (records[i].scope === scope) {
      return i;
    }
  }
  return -1;
}

function getCached(settings) {
  var scopeInfo = getScope(settings);
  var records;
  var index;
  var record;

  if (!scopeInfo.scope) {
    return { models: [], status: scopeInfo.status };
  }
  records = readCache();
  index = findCachedRecord(records, scopeInfo.scope);
  if (index === -1) {
    return {
      models: [],
      status: 'No cached model list. Save & Refresh Models, then reopen settings. Manual model entry remains available.'
    };
  }
  record = records[index];
  return { models: record.models, status: record.status || modelCountStatus(record.models.length) };
}

function cacheRefreshResult(scope, result, callback) {
  var records = readCache();
  var index = findCachedRecord(records, scope);
  var generation = refreshGenerations[scope];
  var cached;
  var status;

  if (generation !== undefined && result.generation !== generation) {
    callback(result.value);
    return;
  }

  if (result.value.models && result.value.models.length) {
    cached = {
      scope: scope,
      models: normalizeModels(result.value.models),
      status: modelCountStatus(result.value.models.length)
    };
  } else if (index !== -1) {
    cached = records[index];
    status = 'Refresh failed: ' + result.value.status + ' Showing ' + cached.models.length +
      (cached.models.length === 1 ? ' cached model. ' : ' cached models. ') +
      'Reopen settings to use saved models.';
    cached.status = status;
  }

  if (cached) {
    if (index !== -1) {
      records.splice(index, 1);
    }
    records.unshift(cached);
    writeCache(records);
    callback({ models: cached.models, status: cached.status });
    return;
  }
  callback(result.value);
}

function discover(settings, callback) {
  var endpoint = trim(settings && settings.Endpoint);
  var apiKey = trim(settings && settings.ApiKey);
  var modelsUrl;
  var request;
  var finished = false;

  function finish(models, status) {
    if (finished) {
      return;
    }
    finished = true;
    callback({ models: models || [], status: status });
  }

  if (!endpoint) {
    finish([], 'Enter an endpoint and save settings to load models.');
    return null;
  }
  if (!apiKey) {
    finish([], 'Enter an API key and save settings to load models.');
    return null;
  }
  modelsUrl = deriveModelsUrl(endpoint);
  if (!modelsUrl) {
    finish([], 'Could not derive a models URL. Manual model entry remains available.');
    return null;
  }

  request = new XMLHttpRequest();
  request.open('GET', modelsUrl, true);
  request.timeout = DISCOVERY_TIMEOUT_MS;
  request.setRequestHeader('Authorization', 'Bearer ' + apiKey);
  opencodeSession.applySessionHeader(request, modelsUrl);
  request.onload = function() {
    var models;

    if (request.status < 200 || request.status >= 300) {
      finish([], 'Could not load models (HTTP ' + request.status + '). Manual entry remains available.');
      return;
    }
    models = parseModels(request.responseText);
    if (!models.length) {
      finish([], 'No models found in the endpoint response. Manual entry remains available.');
      return;
    }
    finish(models, models.length + (models.length === 1 ? ' model loaded.' : ' models loaded.'));
  };
  request.onerror = function() {
    finish([], 'Could not load models from the endpoint. Manual entry remains available.');
  };
  request.ontimeout = function() {
    finish([], 'Loading models timed out. Manual entry remains available.');
  };
  request.send();
  return request;
}

function refresh(settings, callback) {
  var scopeInfo = getScope(settings);
  var generation;

  if (!scopeInfo.scope) {
    callback({ models: [], status: scopeInfo.status });
    return null;
  }
  generation = (refreshGenerations[scopeInfo.scope] || 0) + 1;
  refreshGenerations[scopeInfo.scope] = generation;
  return discover(settings, function(value) {
    cacheRefreshResult(scopeInfo.scope, { value: value, generation: generation }, callback);
  });
}

module.exports = {
  deriveModelsUrl: deriveModelsUrl,
  parseModels: parseModels,
  discover: discover,
  getCached: getCached,
  refresh: refresh,
  cacheKey: CACHE_KEY,
  maxCacheEntries: MAX_CACHE_ENTRIES
};
