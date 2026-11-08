var watch = require('./watch');
var actionSchema = require('./plugin_action_schema');

var MAX_ACTIONS = 128;
var MAX_CATALOGUE_WORK = 8192;
var MAX_SCHEMA_CACHE_CHARS = 65536;
var MAX_ENABLED = 16;
var MAX_ENABLED_SCAN = 256;
var MAX_ACTION_NAME = 120;
var MAX_UI_DESCRIPTION = 512;
var MAX_MODEL_DESCRIPTION = 1024;
var MAX_PARAMETERS = 32;
var MAX_RESULT_CHARS = 6000;
var ACTION_TIMEOUT_MS = 30000;
var MAX_REQUEST_STATES = 16;
var s_requests = Object.create(null);
var s_request_order = [];
var s_live_id = 1;

function own(object, key) {
  return object !== null && object !== undefined && Object.prototype.hasOwnProperty.call(object, key);
}

function isObject(value) {
  return value && typeof value === 'object' && Object.prototype.toString.call(value) !== '[object Array]';
}

function validUuid(value) {
  return typeof value === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value);
}

function boundedText(value, max) {
  var text = typeof value === 'string' ? value : '';
  var end;
  if (text.length <= max) { return text; }
  end = max;
  if (end > 0 && end < text.length && text.charCodeAt(end - 1) >= 0xD800 && text.charCodeAt(end - 1) <= 0xDBFF &&
      text.charCodeAt(end) >= 0xDC00 && text.charCodeAt(end) <= 0xDFFF) { end -= 1; }
  return text.substring(0, end);
}

function hash(value) {
  var h = 2166136261;
  var i;
  for (i = 0; i < value.length; i += 1) { h = ((h ^ value.charCodeAt(i)) * 16777619) >>> 0; }
  return h.toString(36);
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'action';
}

function enumerateCatalogue() {
  var result = { actions: [], status: '' };
  var plugins;
  var work = 0;
  var schemaCacheChars = 0;
  var limited = false;
  var warned = false;
  var metadataError = false;
  var seen = Object.create(null);
  var i;
  var j;
  var plugin;
  var action;
  var sanitized;
  var parameters;
  var argumentsList;
  var key;
  if (typeof Pebble === 'undefined' || !Pebble || typeof Pebble.enumeratePlugins !== 'function' || typeof Pebble.invokeAction !== 'function') {
    result.status = 'Pebble plugin actions unavailable; update Pebble app to enable native plugin actions';
    return result;
  }
  try { plugins = Pebble.enumeratePlugins(); } catch (e) {
    result.status = 'Pebble plugin enumeration failed; update Pebble app and retry';
    return result;
  }
  if (Object.prototype.toString.call(plugins) !== '[object Array]') {
    result.status = 'Pebble plugin catalogue unavailable; update Pebble app';
    return result;
  }
  try {
    for (i = 0; i < plugins.length && result.actions.length < MAX_ACTIONS && !limited; i += 1) {
      work += 1;
      if (work > MAX_CATALOGUE_WORK) { limited = true; break; }
      plugin = plugins[i];
      if (!isObject(plugin) || !validUuid(plugin.uuid) || Object.prototype.toString.call(plugin.actions) !== '[object Array]') { continue; }
      for (j = 0; j < plugin.actions.length && result.actions.length < MAX_ACTIONS && !limited; j += 1) {
        work += 1;
        if (work > MAX_CATALOGUE_WORK) { limited = true; break; }
        action = plugin.actions[j];
        if (!isObject(action) || typeof action.name !== 'string' || !action.name || action.name.length > MAX_ACTION_NAME) { continue; }
        key = JSON.stringify([plugin.uuid.toLowerCase(), action.name]);
        if (own(seen, key)) { continue; }
        seen[key] = true;
        try { sanitized = actionSchema.sanitize(action.parameters); } catch (e2) { sanitized = { schema: null, error: 'Schema sanitizer unavailable' }; }
        if (!sanitized || !sanitized.schema) { warned = true; continue; }
        try { parameters = JSON.stringify(sanitized.schema); } catch (e3) { parameters = ''; }
        if (!parameters || schemaCacheChars + parameters.length > MAX_SCHEMA_CACHE_CHARS) { limited = true; break; }
        schemaCacheChars += parameters.length;
        argumentsList = [];
        if (isObject(sanitized.schema.properties)) {
          var propertyNames = Object.keys(sanitized.schema.properties);
          var p;
          work += Math.min(propertyNames.length, MAX_PARAMETERS);
          if (work > MAX_CATALOGUE_WORK) { limited = true; break; }
          for (p = 0; p < propertyNames.length && p < MAX_PARAMETERS; p += 1) { argumentsList.push(boundedText(propertyNames[p], 80)); }
        }
        result.actions.push({
          plugin: plugin.uuid.toLowerCase(),
          pluginName: boundedText(plugin.name || 'Pebble plugin', 120),
          action: action.name,
          description: boundedText(action.description || '', MAX_UI_DESCRIPTION),
          arguments: argumentsList,
          parameters: sanitized.schema,
          modelDescription: boundedText(action.description || '', MAX_MODEL_DESCRIPTION)
        });
      }
    }
  } catch (e4) { metadataError = true; }
  if (plugins.length > 0 && result.actions.length >= MAX_ACTIONS) { limited = true; }
  result.actions.sort(function(a, b) {
    var left = JSON.stringify([a.plugin, a.action]);
    var right = JSON.stringify([b.plugin, b.action]);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  result.status = result.actions.length ? 'Pebble plugin actions available' : 'No supported Pebble plugin actions found; update Pebble app and installed plugins if actions are expected';
  if (warned) { result.status += '; some actions omitted because their parameter schemas are unsupported'; }
  if (metadataError) { result.status += '; some plugin metadata could not be read safely'; }
  if (limited) { result.status += '; catalogue scan stopped at bounded metadata limits'; }
  return result;
}

function getCatalogue() {
  var catalogue = enumerateCatalogue();
  var actions = [];
  var i;
  var entry;
  for (i = 0; i < catalogue.actions.length; i += 1) {
    entry = catalogue.actions[i];
    actions.push({ plugin: entry.plugin, pluginName: entry.pluginName, action: entry.action, description: entry.description, arguments: entry.arguments.slice() });
  }
  return { actions: actions, status: catalogue.status };
}

function parseEnabled(settings) {
  var parsed;
  var enabled = [];
  var seen = Object.create(null);
  var i;
  var entry;
  var key;
  var enabledIndex;
  try { parsed = JSON.parse(settings && settings.PluginActionsJson || '[]'); } catch (e) { return enabled; }
  if (Object.prototype.toString.call(parsed) !== '[object Array]') { return enabled; }
  for (i = 0; i < parsed.length && i < MAX_ENABLED_SCAN; i += 1) {
    entry = parsed[i];
    if (!isObject(entry) || !validUuid(entry.plugin) || typeof entry.action !== 'string' || !entry.action || entry.action.length > MAX_ACTION_NAME) { continue; }
    if (own(entry, 'confirm') && typeof entry.confirm !== 'boolean') { continue; }
    key = JSON.stringify([entry.plugin.toLowerCase(), entry.action]);
    if (own(seen, key)) {
      enabledIndex = seen[key];
      if (entry.confirm === true) { enabled[enabledIndex].confirm = true; }
    } else if (enabled.length < MAX_ENABLED) {
      seen[key] = enabled.length;
      enabled.push({ plugin: entry.plugin.toLowerCase(), action: entry.action, confirm: entry.confirm === true });
    }
  }
  return enabled;
}

function definitionName(action, used) {
  var tuple = JSON.stringify([action.plugin, action.action]);
  var suffix = '_' + hash(tuple);
  var base = 'pebble_plugin_action_' + slug(action.action);
  var name = base.substring(0, 64 - suffix.length) + suffix;
  var n = 2;
  while (own(used, name)) { name = base.substring(0, 64 - suffix.length - String(n).length - 1) + '_' + n + suffix; n += 1; }
  used[name] = true;
  return name;
}

function stateFor(requestId) {
  var key = String(requestId);
  var state = s_requests[key];
  var i;
  if (state && !watch.isCurrentRequest(requestId)) { delete s_requests[key]; state = null; }
  if (!state) {
    state = { requestId: requestId, blocked: Object.create(null), denied: Object.create(null), live: Object.create(null) };
    s_requests[key] = state;
    s_request_order.push(key);
  }
  for (i = s_request_order.length - 1; i >= 0; i -= 1) {
    var existing = s_requests[s_request_order[i]];
    if (!existing || !watch.isCurrentRequest(existing.requestId)) { delete s_requests[s_request_order[i]]; s_request_order.splice(i, 1); }
  }
  while (s_request_order.length > MAX_REQUEST_STATES) { delete s_requests[s_request_order.shift()]; }
  return state;
}

function uncertainMessage(reason) {
  return 'Plugin action outcome unknown: ' + reason + '. It may already have completed; do not automatically retry.';
}

function capResult(result) {
  var base = { ok: true, pluginUuid: result.pluginUuid, action: result.action };
  var flags = { textTruncated: false, refreshedTruncated: false };
  var sourceText = typeof result.text === 'string' ? result.text : '';
  var text = boundedText(sourceText, MAX_RESULT_CHARS);
  var refreshed = [];
  var i;
  if (Object.prototype.toString.call(result.refreshed) === '[object Array]') {
    for (i = 0; i < result.refreshed.length && i < 32; i += 1) {
      if (typeof result.refreshed[i] === 'string') {
        if (result.refreshed[i].length > 64) { flags.refreshedTruncated = true; }
        refreshed.push(boundedText(result.refreshed[i], 64));
      }
      else { flags.refreshedTruncated = true; }
    }
    if (result.refreshed.length > 32) { flags.refreshedTruncated = true; }
  }
  if (sourceText.length > MAX_RESULT_CHARS) { flags.textTruncated = true; }
  function build() {
    var value = { ok: true, pluginUuid: base.pluginUuid, action: base.action };
    if (text) { value.text = text; }
    if (refreshed.length) { value.refreshed = refreshed; }
    if (flags.textTruncated) { value.textTruncated = true; }
    if (flags.refreshedTruncated) { value.refreshedTruncated = true; }
    return JSON.stringify(value);
  }
  var output = build();
  while (refreshed.length) {
    var savedText = text;
    text = '';
    var emptyTextOutput = build();
    text = savedText;
    if (emptyTextOutput.length <= MAX_RESULT_CHARS) { break; }
    refreshed.pop();
    flags.refreshedTruncated = true;
    output = build();
  }
  if (output.length > MAX_RESULT_CHARS) {
    flags.textTruncated = true;
    var low = 0;
    var high = text.length;
    var middle;
    var best = '';
    while (low <= high) {
      middle = Math.floor((low + high) / 2);
      var clipped = boundedText(text, middle);
      var oldText = text;
      text = clipped;
      var candidate = build();
      text = oldText;
      if (candidate.length <= MAX_RESULT_CHARS) { best = candidate; low = middle + 1; }
      else { high = middle - 1; }
    }
    output = best || JSON.stringify({ ok: true, pluginUuid: base.pluginUuid, action: base.action, textTruncated: true });
  }
  return output;
}

function cloneAndFreezeArguments(args) {
  var clone;
  function freeze(value) {
    var key;
    if (!value || typeof value !== 'object') { return; }
    for (key in value) { if (own(value, key)) { freeze(value[key]); } }
    if (Object.freeze) { try { Object.freeze(value); } catch (e) {} }
  }
  try { clone = JSON.parse(JSON.stringify(args)); } catch (e2) { return null; }
  if (!clone || typeof clone !== 'object' || Object.prototype.toString.call(clone) === '[object Array]') { return null; }
  freeze(clone);
  return clone;
}

function callAction(action, schema, args, requestId, callback, requiresConfirmation) {
  var state = stateFor(requestId);
  var actionKey = JSON.stringify([action.plugin, action.action]);
  var token = 'action-' + s_live_id;
  var done = false;
  var timer = null;
  var tracked = false;
  var approvalHandle = null;
  var approvalCallbackCalled = false;
  var snapshot;
  var handle = { pluginAction: true, abort: cancel };
  var validationError;
  s_live_id += 1;

  function cleanup() {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    if (tracked) { tracked = false; try { watch.untrackXhr(requestId, handle); } catch (e) {} }
    if (state.live[token]) { delete state.live[token]; }
  }
  function finish(error, result, uncertain) {
    if (done) { return; }
    done = true;
    cleanup();
    if (uncertain) { state.blocked[actionKey] = true; }
    if (watch.isCurrentRequest(requestId)) { callback(error, result); }
  }
  function cancel() {
    if (done) { return; }
    done = true;
    if (approvalHandle && typeof approvalHandle.abort === 'function') {
      try { approvalHandle.abort(); } catch (e) {}
      approvalHandle = null;
    }
    cleanup();
  }
  function invokeNative() {
    var promise;
    if (done || !watch.isCurrentRequest(requestId)) { cancel(); return; }
    timer = setTimeout(function() { finish(uncertainMessage('native action timed out'), null, true); }, ACTION_TIMEOUT_MS);
    try {
      promise = Pebble.invokeAction({ plugin: action.plugin, action: action.action, args: snapshot });
      if (!promise || typeof promise.then !== 'function') { finish(uncertainMessage('native response was not a promise'), null, true); return; }
      promise.then(function(response) {
        var output;
        if (done) { return; }
        if (!watch.isCurrentRequest(requestId)) { cancel(); return; }
        try {
          if (!isObject(response) || typeof response.ok !== 'boolean') { finish(uncertainMessage('native response was malformed'), null, true); return; }
          if (response.ok !== true) {
            if (typeof response.code !== 'string' || (response.message !== undefined && typeof response.message !== 'string')) {
              finish(uncertainMessage('native error response was malformed'), null, true);
              return;
            }
            if (response.code === 'PERMISSION_DENIED') { finish('Plugin action permission denied. Approve Pebble access, then retry.', null, false); return; }
            if (response.code === 'AUTH_REQUIRED') { finish('Plugin action requires authentication. Configure or sign in to the plugin, then retry.', null, false); return; }
            if (response.code === 'TIMEOUT' || response.code === 'UNKNOWN') {
              finish(uncertainMessage('native reported ' + response.code), null, true);
              return;
            }
            if (response.code === 'INVALID_ARGS' || response.code === 'INVALID_REQUEST' ||
                response.code === 'PLUGIN_UNAVAILABLE' || response.code === 'RATE_LIMITED') {
              finish('Plugin action failed with code ' + response.code, null, false);
              return;
            }
            finish(uncertainMessage('native error code was not recognized'), null, true);
            return;
          }
          if ((response.text !== undefined && typeof response.text !== 'string') ||
              (response.refreshed !== undefined && Object.prototype.toString.call(response.refreshed) !== '[object Array]')) {
            finish(uncertainMessage('native response fields were malformed'), null, true);
            return;
          }
          output = capResult({ pluginUuid: action.plugin, action: action.action, text: response.text, refreshed: response.refreshed });
          finish(null, output, false);
        } catch (e) {
          finish(uncertainMessage('native response could not be processed safely'), null, true);
        }
      }, function() {
        if (!done) { finish(uncertainMessage('native invocation rejected'), null, true); }
      });
    } catch (e2) { finish(uncertainMessage('native invocation failed'), null, true); }
  }
  function approvalCompleted(error, approved) {
    var denial;
    if (approvalCallbackCalled) { return; }
    approvalCallbackCalled = true;
    approvalHandle = null;
    if (done || !watch.isCurrentRequest(requestId)) { cancel(); return; }
    if (error) {
      denial = String(error);
      state.denied[actionKey] = denial;
      finish(denial, null, false);
      return;
    }
    if (approved !== true) {
      denial = 'User denied plugin action; action was not run. Do not retry or bypass confirmation.';
      state.denied[actionKey] = denial;
      finish(denial, null, false);
      return;
    }
    invokeNative();
  }
  if (!watch.isCurrentRequest(requestId)) { return; }
  validationError = actionSchema.validate(args, schema);
  if (validationError) { callback('Invalid plugin action arguments: ' + validationError); return; }
  if (state.blocked[actionKey]) { callback('Plugin action blocked after an earlier unknown outcome in this request; do not retry automatically'); return; }
  if (state.denied[actionKey]) { callback(state.denied[actionKey]); return; }
  if (requiresConfirmation && typeof watch.requestActionApproval !== 'function') {
    state.denied[actionKey] = 'Watch confirmation is unavailable; action was not run.';
    callback(state.denied[actionKey]);
    return;
  }
  if (typeof Pebble === 'undefined' || !Pebble || typeof Pebble.invokeAction !== 'function') { callback('Pebble plugin action API unavailable; update Pebble app'); return; }
  snapshot = cloneAndFreezeArguments(args);
  if (!snapshot) { callback('Plugin action arguments could not be snapshotted safely; action was not run.'); return; }
  validationError = actionSchema.validate(snapshot, schema);
  if (validationError) { callback('Invalid plugin action arguments: ' + validationError); return; }
  state.live[token] = cancel;
  if (typeof watch.trackXhr === 'function') {
    tracked = true;
    if (!watch.trackXhr(requestId, handle)) { tracked = false; cancel(); return; }
  }
  if (requiresConfirmation) {
    var returnedHandle;
    try {
      returnedHandle = watch.requestActionApproval({
        plugin: action.plugin,
        pluginName: action.pluginName,
        action: action.action,
        args: snapshot
      }, requestId, approvalCompleted);
      if (!approvalCallbackCalled && !done) { approvalHandle = returnedHandle; }
      else if (returnedHandle && typeof returnedHandle.abort === 'function') { returnedHandle.abort(); }
    } catch (approvalError) {
      if (!approvalCallbackCalled && !done) {
        approvalCallbackCalled = true;
        state.denied[actionKey] = 'Watch confirmation is unavailable; action was not run.';
        finish(state.denied[actionKey], null, false);
      }
    }
  } else { invokeNative(); }
}

function getTools(settings) {
  var enabled = parseEnabled(settings);
  var catalogue;
  var tools = [];
  var used = Object.create(null);
  var i;
  var j;
  if (!enabled.length) { return tools; }
  catalogue = enumerateCatalogue().actions;
  for (i = 0; i < enabled.length; i += 1) {
    for (j = 0; j < catalogue.length; j += 1) {
      if (catalogue[j].plugin !== enabled[i].plugin || catalogue[j].action !== enabled[i].action) { continue; }
      (function(selected) {
        var requiresConfirmation = enabled[i].confirm === true;
        var validate = function(args) { return actionSchema.validate(args, selected.parameters); };
        var description = 'Invoke exact action ' + selected.action + ' on installed Pebble plugin ' + selected.pluginName + '. This may change plugin or external state. ' +
          (requiresConfirmation ? 'Requires watch approval before execution. ' : '') + selected.modelDescription;
        tools.push({
          name: definitionName(selected, used),
          label: 'Plugin action: ' + selected.pluginName + ' / ' + selected.action,
          description: boundedText(description, MAX_MODEL_DESCRIPTION),
          parameters: selected.parameters,
          validate: validate,
          logArguments: false,
          call: function(args, requestId, callback) { callAction(selected, selected.parameters, args, requestId, callback, requiresConfirmation); }
        });
      }(catalogue[j]));
      break;
    }
  }
  return tools;
}

function cancelRequest(requestId) {
  var key = String(requestId);
  var state = s_requests[key];
  var tokens;
  var i;
  if (!state) { return; }
  tokens = Object.keys(state.live);
  for (i = 0; i < tokens.length; i += 1) { state.live[tokens[i]](); }
  delete s_requests[key];
  i = s_request_order.indexOf(key);
  if (i !== -1) { s_request_order.splice(i, 1); }
}

module.exports = { getCatalogue: getCatalogue, getTools: getTools, cancelRequest: cancelRequest };
