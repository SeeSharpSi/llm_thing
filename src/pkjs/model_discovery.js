var MAX_MODELS = 500;
var MAX_MODEL_ID_CHARS = 256;
var MAX_TOTAL_MODEL_CHARS = 30000;
var DISCOVERY_TIMEOUT_MS = 15000;

function trim(value) {
  return String(value === undefined || value === null ? '' : value).replace(/^\s+|\s+$/g, '');
}

function deriveModelsUrl(endpoint) {
  endpoint = trim(endpoint);
  endpoint = endpoint.replace(/[?#].*$/, '').replace(/\/+$/, '');

  if (!/^https?:\/\/[^/]+/i.test(endpoint)) {
    return '';
  }
  if (/\/models$/i.test(endpoint)) {
    return endpoint;
  }
  if (/\/(responses|chat\/completions)$/i.test(endpoint)) {
    return endpoint.replace(/\/(responses|chat\/completions)$/i, '/models');
  }
  return '';
}

function parseModels(responseText) {
  var parsed;
  var seen = {};
  var models = [];
  var totalChars = 0;
  var id;
  var seenKey;
  var i;

  try {
    parsed = JSON.parse(responseText || '');
  } catch (e) {
    return [];
  }
  if (!parsed || !Array.isArray(parsed.data)) {
    return [];
  }

  for (i = 0; i < parsed.data.length && models.length < MAX_MODELS; i += 1) {
    id = trim(parsed.data[i] && parsed.data[i].id);
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

module.exports = {
  deriveModelsUrl: deriveModelsUrl,
  parseModels: parseModels,
  discover: discover
};
