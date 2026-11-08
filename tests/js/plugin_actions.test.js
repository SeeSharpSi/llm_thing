'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var path = require('node:path');
var installFakeTimers = require('./helpers/fake_timers');
var load = require('./helpers/load_with_stubs');
var schema = require('../../src/pkjs/plugin_action_schema');
var modulePath = path.resolve(__dirname, '../../src/pkjs/plugin_actions');
var UUID = 'abcdefab-cdef-abcd-efab-cdefabcdefab';

function setup(manifest) {
  var tracked = [];
  var approvals = [];
  var watch = {
    current: true,
    isCurrentRequest: function() { return watch.current; },
    trackXhr: function(id, handle) { tracked.push(handle); return true; },
    untrackXhr: function(id, handle) { var index = tracked.indexOf(handle); if (index !== -1) { tracked.splice(index, 1); } },
    requestActionApproval: function(spec, id, callback) {
      var entry = { spec: spec, requestId: id, callback: callback, aborted: false };
      approvals.push(entry);
      return { abort: function() { entry.aborted = true; } };
    }
  };
  global.Pebble = {
    enumeratePlugins: function() { return manifest; },
    invokeAction: function(request) { setup.invocations.push(request); return setup.promise; }
  };
  setup.invocations = [];
  setup.promise = null;
  return { api: load.loadWithStubs(modulePath, { './watch': watch }), watch: watch, tracked: tracked, approvals: approvals };
}

function manifest() {
  return [{ uuid: UUID.toUpperCase(), name: 'Fixture', actions: [
    { name: 'setMode', description: 'Set mode', parameters: {
      type: 'object', additionalProperties: false, required: ['mode'],
      properties: { mode: { type: 'string', enum: ['on', 'off'] }, count: { type: 'integer', minimum: 0 } }
    } },
    { name: 'broken', parameters: { type: 'object', unsupportedKeyword: true } }
  ] }];
}

test.afterEach(function() {
  delete global.Pebble;
  load.clearModule(modulePath);
});

test('catalogue is opt-in independent, bounded, normalized, stable, and omits unsupported schemas', function() {
  var h = setup(manifest());
  var publicCatalogue = h.api.getCatalogue();
  var noOptIn = h.api.getTools({ PluginSourcesJson: JSON.stringify([{ plugin: UUID, action: 'setMode' }]) });
  var enabled = JSON.stringify([{ plugin: UUID.toUpperCase(), action: 'setMode' }, { plugin: UUID, action: 'setMode' }, { plugin: UUID, action: 'broken' }]);
  var tools = h.api.getTools({ PluginActionsJson: enabled });
  var reversed = h.api.getTools({ PluginActionsJson: JSON.stringify([{ plugin: UUID, action: 'setMode' }]) });
  assert.equal(publicCatalogue.actions.length, 1);
  assert.deepEqual(publicCatalogue.actions[0], {
    plugin: UUID,
    pluginName: 'Fixture',
    action: 'setMode',
    description: 'Set mode',
    arguments: ['mode', 'count']
  });
  assert.match(publicCatalogue.status, /unsupported/);
  assert.equal(noOptIn.length, 0, 'source choices do not enable actions');
  assert.equal(tools.length, 1, 'duplicate opt-ins collapse and unsupported schema remains unavailable');
  assert.equal(tools[0].name, reversed[0].name);
  assert.match(tools[0].name, /^pebble_plugin_action_/);
  assert.ok(tools[0].name.length <= 64);
  assert.equal(tools[0].parameters.type, 'object');
  assert.equal(tools[0].logArguments, false);
  assert.equal(h.api.getCatalogue().actions[0].plugin, UUID);
  var twoPlugins = setup([
    { uuid: UUID, name: 'One', actions: [{ name: 'sameAction', parameters: { type: 'object' } }] },
    { uuid: '12345678-1234-1234-1234-123456789abc', name: 'Two', actions: [{ name: 'sameAction', parameters: { type: 'object' } }] }
  ]);
  var orderA = twoPlugins.api.getTools({ PluginActionsJson: JSON.stringify([
    { plugin: UUID, action: 'sameAction' }, { plugin: '12345678-1234-1234-1234-123456789abc', action: 'sameAction' }
  ]) });
  var orderB = twoPlugins.api.getTools({ PluginActionsJson: JSON.stringify([
    { plugin: '12345678-1234-1234-1234-123456789abc', action: 'sameAction' }, { plugin: UUID, action: 'sameAction' }
  ]) });
  assert.notEqual(orderA[0].name, orderA[1].name);
  assert.deepEqual(orderA.map(function(tool) { return tool.name; }).sort(), orderB.map(function(tool) { return tool.name; }).sort());
});

test('catalogue contains hostile metadata and reports unavailable native APIs', function() {
  var hostilePlugin = { uuid: UUID, name: 'Hostile' };
  Object.defineProperty(hostilePlugin, 'actions', { get: function() { throw new Error('hostile getter'); } });
  var h = setup([hostilePlugin]);
  var catalogue = h.api.getCatalogue();
  assert.deepEqual(catalogue.actions, []);
  assert.match(catalogue.status, /metadata could not be read safely/);
  global.Pebble.invokeAction = null;
  assert.match(h.api.getCatalogue().status, /update Pebble app/);
});

test('discovery enforces 128 catalogue and 16 selected action caps with moderate schemas', function() {
  var plugins = [];
  var selections = [];
  var schemaChars = 0;
  var i;
  for (i = 0; i < 140; i += 1) {
    var id = ('00000000-0000-0000-0000-' + ('000000000000' + i).slice(-12));
    plugins.push({ uuid: id, name: 'Plugin ' + i, actions: [{ name: 'action' + i, parameters: { type: 'object', properties: { value: { type: 'string', maxLength: 80 } } } }] });
    if (i < 128) { schemaChars += JSON.stringify(plugins[i].actions[0].parameters).length; }
    if (i < 20) { selections.push({ plugin: id, action: 'action' + i }); }
  }
  var h = setup(plugins);
  var catalogue = h.api.getCatalogue();
  var tools = h.api.getTools({ PluginActionsJson: JSON.stringify(selections) });
  assert.equal(catalogue.actions.length, 128);
  assert.ok(schemaChars > 8192, 'moderate schemas exceed old byte-as-work budget');
  assert.match(catalogue.status, /bounded metadata limits/);
  assert.equal(tools.length, 16);
  assert.ok(tools.every(function(tool) { return tool.parameters.properties.value; }));
});

test('empty opt-in avoids native plugin enumeration and schema sanitization', function() {
  var h = setup(manifest());
  var enumerationCount = 0;
  global.Pebble.enumeratePlugins = function() { enumerationCount += 1; throw new Error('must not enumerate'); };
  assert.deepEqual(h.api.getTools({ PluginActionsJson: '[]' }), []);
  assert.equal(enumerationCount, 0);
});

test('action invocation passes exact identity and validated args; filters result fields', function() {
  var h = setup(manifest());
  var callbacks = [];
  setup.promise = { then: function(resolve, reject) { callbacks.push(resolve); return this; } };
  var definition = h.api.getTools({ PluginActionsJson: JSON.stringify([{ plugin: UUID, action: 'setMode' }]) })[0];
  var output;
  var invalid;
  definition.call({ mode: 'illegal' }, 11, function(error) { invalid = error; });
  assert.match(invalid, /mode must be one of/);
  assert.equal(setup.invocations.length, 0, 'invalid direct arguments never invoke native API');
  definition.call({ mode: 'on', count: 0 }, 1, function(error, value) { assert.ifError(error); output = value; });
  assert.equal(setup.invocations.length, 1);
  assert.deepEqual(setup.invocations[0], { plugin: UUID, action: 'setMode', args: { mode: 'on', count: 0 } });
  callbacks[0]({ ok: true, text: 'changed', refreshed: ['device'], ignored: 'secret', binary: { data: 'secret' } });
  assert.deepEqual(JSON.parse(output), { ok: true, pluginUuid: UUID, action: 'setMode', text: 'changed', refreshed: ['device'] });
  assert.equal(h.tracked.length, 0);
});

test('confirmation opt-in ORs duplicate flags across bounded scan and rejects invalid flags', function() {
  var h = setup(manifest());
  var entries = [{ plugin: UUID, action: 'setMode', confirm: false }];
  var i;
  for (i = 0; i < 20; i += 1) {
    entries.push({ plugin: ('00000000-0000-0000-0000-' + ('000000000000' + i).slice(-12)), action: 'other' + i });
  }
  entries.push({ plugin: UUID, action: 'setMode', confirm: true });
  var confirmed = h.api.getTools({ PluginActionsJson: JSON.stringify(entries) });
  assert.match(confirmed[0].description, /Requires watch approval before execution/);
  var callbackValue;
  confirmed[0].call({ mode: 'on' }, 30, function(error) { callbackValue = error; });
  assert.equal(h.approvals.length, 1, 'later duplicate opts accepted action into confirmation');
  assert.equal(setup.invocations.length, 0);
  h.approvals[0].callback(null, false);
  assert.match(callbackValue, /User denied/);

  var invalid = h.api.getTools({ PluginActionsJson: JSON.stringify([
    { plugin: UUID, action: 'setMode', confirm: 'true' }
  ]) });
  assert.equal(invalid.length, 0, 'nonboolean confirmation flag omits entry');
});

test('confirmed action waits for allow and uses same immutable argument snapshot for prompt and native call', function() {
  var pluginManifest = manifest();
  pluginManifest[0].actions[0].parameters.properties.nested = {
    type: 'object', additionalProperties: false, required: ['value'],
    properties: { value: { type: 'string' } }
  };
  var h = setup(pluginManifest);
  var definition = h.api.getTools({ PluginActionsJson: JSON.stringify([{ plugin: UUID, action: 'setMode', confirm: true }]) })[0];
  var original = { mode: 'on', count: 1, nested: { value: 'before\u202e\u0001\ud800' } };
  var callbackValue;
  setup.promise = { then: function(resolve) { resolve({ ok: true, text: 'done' }); return this; } };
  definition.call(original, 31, function(error, value) { callbackValue = error || value; });
  assert.equal(setup.invocations.length, 0, 'native action waits for watch allow');
  assert.equal(h.approvals.length, 1);
  assert.equal(h.approvals[0].spec.args.nested.value, 'before\u202e\u0001\ud800');
  original.mode = 'off';
  original.count = 2;
  original.nested.value = 'after';
  assert.deepEqual(h.approvals[0].spec.args, { mode: 'on', count: 1, nested: { value: 'before\u202e\u0001\ud800' } });
  assert.equal(Object.isFrozen(h.approvals[0].spec.args), true);
  assert.equal(Object.isFrozen(h.approvals[0].spec.args.nested), true);
  h.approvals[0].callback(null, true);
  assert.deepEqual(setup.invocations[0].args, { mode: 'on', count: 1, nested: { value: 'before\u202e\u0001\ud800' } });
  assert.equal(callbackValue && JSON.parse(callbackValue).text, 'done');
});

test('duplicate synchronous approval callbacks invoke native once while promise remains pending', function() {
  var h = setup(manifest());
  var resolveNative;
  setup.promise = { then: function(resolve) { resolveNative = resolve; return this; } };
  var definition = h.api.getTools({ PluginActionsJson: JSON.stringify([{ plugin: UUID, action: 'setMode', confirm: true }]) })[0];
  definition.call({ mode: 'on' }, 37, function() {});
  h.approvals[0].callback(null, true);
  h.approvals[0].callback(null, true);
  assert.equal(setup.invocations.length, 1);
  resolveNative({ ok: true });
  assert.equal(setup.invocations.length, 1);
});

test('aborting tracked plugin action aborts approval and ignores late allow', function() {
  var h = setup(manifest());
  var definition = h.api.getTools({ PluginActionsJson: JSON.stringify([{ plugin: UUID, action: 'setMode', confirm: true }]) })[0];
  var callbackCount = 0;
  definition.call({ mode: 'on' }, 38, function() { callbackCount += 1; });
  assert.equal(h.tracked.length, 1);
  h.tracked[0].abort();
  assert.equal(h.approvals[0].aborted, true);
  h.approvals[0].callback(null, true);
  assert.equal(setup.invocations.length, 0);
  assert.equal(callbackCount, 0);
});

test('legacy actions remain automatic and denial prevents same-request reprompt', function() {
  var h = setup(manifest());
  var automatic = h.api.getTools({ PluginActionsJson: JSON.stringify([{ plugin: UUID, action: 'setMode', confirm: false }]) })[0];
  assert.doesNotMatch(automatic.description, /Requires watch approval/);
  setup.promise = { then: function(resolve) { resolve({ ok: true }); return this; } };
  automatic.call({ mode: 'on' }, 32, function() {});
  assert.equal(setup.invocations.length, 1);
  assert.equal(h.approvals.length, 0);

  var confirmed = h.api.getTools({ PluginActionsJson: JSON.stringify([{ plugin: UUID, action: 'setMode', confirm: true }]) })[0];
  var first;
  var second;
  confirmed.call({ mode: 'on' }, 33, function(error) { first = error; });
  h.approvals[0].callback(null, false);
  confirmed.call({ mode: 'off' }, 33, function(error) { second = error; });
  assert.match(first, /User denied.*action was not run/);
  assert.match(first, /Do not retry or bypass confirmation/);
  assert.equal(second, first);
  assert.equal(h.approvals.length, 1);
  assert.equal(setup.invocations.length, 1);
});

test('confirmation API absence, errors, and stale lifecycle fail closed', function() {
  var h = setup(manifest());
  var definition = h.api.getTools({ PluginActionsJson: JSON.stringify([{ plugin: UUID, action: 'setMode', confirm: true }]) })[0];
  var error;
  h.watch.requestActionApproval = null;
  definition.call({ mode: 'on' }, 34, function(value) { error = value; });
  assert.match(error, /Watch confirmation is unavailable/);
  assert.equal(setup.invocations.length, 0);

  h.watch.requestActionApproval = function(spec, id, callback) {
    callback('Watch confirmation timed out; action was not run.', false);
    return { abort: function() {} };
  };
  definition.call({ mode: 'on' }, 35, function(value) { error = value; });
  assert.match(error, /timed out; action was not run/);
  assert.equal(setup.invocations.length, 0);
});

test('native action deadline starts only after watch approval', function() {
  var timers = installFakeTimers();
  try {
    var h = setup(manifest());
    var definition = h.api.getTools({ PluginActionsJson: JSON.stringify([{ plugin: UUID, action: 'setMode', confirm: true }]) })[0];
    var error;
    setup.promise = { then: function() { return this; } };
    definition.call({ mode: 'on' }, 36, function(value) { error = value; });
    assert.equal(timers.timers.length, 0, 'no native timeout while user decides');
    h.approvals[0].callback(null, true);
    assert.equal(timers.timers[0].delay, 30000);
    timers.run(timers.timers[0].id);
    assert.match(error, /outcome unknown/);
  } finally { timers.restore(); }
});

test('uncertain native outcomes block same action replay; timeout is explicit and never retried', function() {
  var timers = installFakeTimers();
  try {
    var h = setup(manifest());
    var reject;
    setup.promise = { then: function(resolve, fail) { reject = fail; return this; } };
    var definition = h.api.getTools({ PluginActionsJson: JSON.stringify([{ plugin: UUID, action: 'setMode' }]) })[0];
    var first;
    var second;
    definition.call({ mode: 'on' }, 2, function(error) { first = error; });
    reject(new Error('connection lost'));
    assert.match(first, /outcome unknown/);
    assert.match(first, /do not automatically retry/);
    definition.call({ mode: 'off' }, 2, function(error) { second = error; });
    assert.match(second, /blocked after an earlier unknown outcome/);
    assert.equal(setup.invocations.length, 1);

    var timed;
    setup.promise = { then: function() { return this; } };
    definition.call({ mode: 'on' }, 3, function(error) { timed = error; });
    assert.equal(timers.timers[timers.timers.length - 1].delay, 30000);
    timers.run(timers.timers[timers.timers.length - 1].id);
    assert.match(timed, /outcome unknown/);
    assert.equal(setup.invocations.length, 2);
    var blocked;
    definition.call({ mode: 'on' }, 3, function(error) { blocked = error; });
    assert.match(blocked, /blocked/);
  } finally { timers.restore(); }
});

test('cancellation suppresses late completion without claiming native action was undone', function() {
  var h = setup(manifest());
  var resolve;
  var callbackCount = 0;
  setup.promise = { then: function(done) { resolve = done; return this; } };
  var definition = h.api.getTools({ PluginActionsJson: JSON.stringify([{ plugin: UUID, action: 'setMode' }]) })[0];
  definition.call({ mode: 'on' }, 4, function() { callbackCount += 1; });
  assert.equal(h.tracked.length, 1);
  h.tracked[0].abort();
  h.api.cancelRequest(4);
  assert.equal(h.tracked.length, 0);
  h.watch.current = false;
  resolve({ ok: true, text: 'late' });
  assert.equal(callbackCount, 0);
  assert.equal(setup.invocations.length, 1);
});

test('permission and authentication failures give recovery steps without success claims', function() {
  var h = setup(manifest());
  var resolve;
  setup.promise = { then: function(done) { resolve = done; return this; } };
  var definition = h.api.getTools({ PluginActionsJson: JSON.stringify([{ plugin: UUID, action: 'setMode' }]) })[0];
  var error;
  definition.call({ mode: 'on' }, 5, function(value) { error = value; });
  resolve({ ok: false, code: 'PERMISSION_DENIED', message: 'denied' });
  assert.match(error, /Approve Pebble access/);
  assert.doesNotMatch(error, /outcome unknown/);
  setup.promise = { then: function(done) { resolve = done; return this; } };
  definition.call({ mode: 'on' }, 6, function(value) { error = value; });
  resolve({ ok: false, code: 'AUTH_REQUIRED' });
  assert.match(error, /Configure or sign in/);
  assert.equal(schema.validate({ mode: 'on' }, definition.parameters), '');
});

test('future native error codes are unknown and block replay; known failure codes stay definite', function() {
  var h = setup(manifest());
  var resolve;
  var definition = h.api.getTools({ PluginActionsJson: JSON.stringify([{ plugin: UUID, action: 'setMode' }]) })[0];
  var future;
  setup.promise = { then: function(done) { resolve = done; return this; } };
  definition.call({ mode: 'on' }, 15, function(error) { future = error; });
  resolve({ ok: false, code: 'FUTURE_NATIVE_CODE', message: 'opaque' });
  assert.match(future, /outcome unknown/);
  var blocked;
  definition.call({ mode: 'off' }, 15, function(error) { blocked = error; });
  assert.match(blocked, /blocked/);
  var known;
  setup.promise = { then: function(done) { resolve = done; return this; } };
  definition.call({ mode: 'on' }, 16, function(error) { known = error; });
  resolve({ ok: false, code: 'INVALID_REQUEST', message: 'bad input' });
  assert.match(known, /failed with code INVALID_REQUEST/);
  assert.doesNotMatch(known, /outcome unknown/);
  ['TIMEOUT', 'UNKNOWN'].forEach(function(code, index) {
    var uncertain;
    var requestId = 20 + index;
    setup.promise = { then: function(done) { resolve = done; return this; } };
    definition.call({ mode: 'on' }, requestId, function(error) { uncertain = error; });
    resolve({ ok: false, code: code });
    assert.match(uncertain, new RegExp('outcome unknown: native reported ' + code));
    var replay;
    definition.call({ mode: 'on' }, requestId, function(error) { replay = error; });
    assert.match(replay, /blocked/);
  });
});

test('nonthenables and throwing then getters settle once and untrack synthetic handles', function() {
  var h = setup(manifest());
  var definition = h.api.getTools({ PluginActionsJson: JSON.stringify([{ plugin: UUID, action: 'setMode' }]) })[0];
  var first;
  var firstCount = 0;
  setup.promise = {};
  definition.call({ mode: 'on' }, 17, function(error) { firstCount += 1; first = error; });
  assert.match(first, /outcome unknown/);
  assert.equal(firstCount, 1);
  assert.equal(h.tracked.length, 0);
  var second;
  var secondCount = 0;
  setup.promise = {};
  Object.defineProperty(setup.promise, 'then', { get: function() { throw new Error('then getter'); } });
  definition.call({ mode: 'on' }, 18, function(error) { secondCount += 1; second = error; });
  assert.match(second, /outcome unknown/);
  assert.equal(secondCount, 1);
  assert.equal(h.tracked.length, 0);
  assert.equal(setup.invocations.length, 2, 'native invoke occurs once per attempt, with no retry');
  var malformedCount = 0;
  var malformed;
  setup.promise = { then: function(resolve) { resolve({ ok: 'yes' }); return this; } };
  definition.call({ mode: 'on' }, 19, function(error) { malformedCount += 1; malformed = error; });
  assert.match(malformed, /outcome unknown/);
  assert.equal(malformedCount, 1);
  assert.equal(h.tracked.length, 0);
  assert.equal(setup.invocations.length, 3, 'malformed response receives no native retry');
});

test('synchronous native throws become unknown and duplicate thenable callbacks settle once', function() {
  var h = setup(manifest());
  var definition = h.api.getTools({ PluginActionsJson: JSON.stringify([{ plugin: UUID, action: 'setMode' }]) })[0];
  var first;
  global.Pebble.invokeAction = function() { throw new Error('native bridge throw'); };
  definition.call({ mode: 'on' }, 7, function(error) { first = error; });
  assert.match(first, /outcome unknown/);
  var count = 0;
  var output;
  global.Pebble.invokeAction = function() {
    return { then: function(resolve) { resolve({ ok: true, text: 'first' }); resolve({ ok: true, text: 'second' }); return this; } };
  };
  definition.call({ mode: 'on' }, 8, function(error, value) { assert.ifError(error); count += 1; output = value; });
  assert.equal(count, 1);
  assert.equal(JSON.parse(output).text, 'first');
});

test('success result is valid bounded JSON with surrogate-safe explicit truncation', function() {
  var h = setup(manifest());
  var definition = h.api.getTools({ PluginActionsJson: JSON.stringify([{ plugin: UUID, action: 'setMode' }]) })[0];
  var output;
  setup.promise = { then: function(resolve) {
    resolve({ ok: true, text: new Array(5990).join('x') + '\ud83d\ude00', refreshed: ['device'], extra: { binary: true } });
    return this;
  } };
  definition.call({ mode: 'on' }, 9, function(error, value) { assert.ifError(error); output = value; });
  assert.ok(output.length <= 6000);
  var parsed = JSON.parse(output);
  assert.equal(parsed.textTruncated, true);
  assert.equal(parsed.refreshed[0], 'device');
  assert.equal(parsed.text.charCodeAt(parsed.text.length - 1) >= 0xD800 && parsed.text.charCodeAt(parsed.text.length - 1) <= 0xDBFF, false);
  assert.equal(parsed.extra, undefined);
  var refreshed = [];
  var entryReads = 0;
  var i;
  for (i = 0; i < 32; i += 1) { refreshed.push('refreshed-' + i + '-' + new Array(70).join('r')); }
  Object.defineProperty(refreshed, '32', { get: function() { entryReads += 1; return 'must not be read'; } });
  refreshed.length = 33;
  setup.promise = { then: function(resolve) {
    var escaped = new Array(2500).join('"\\') + new Array(1002).join('x') + '\ud83d\ude00TAIL';
    resolve({ ok: true, text: escaped, refreshed: refreshed });
    return this;
  } };
  definition.call({ mode: 'on' }, 10, function(error, value) { assert.ifError(error); output = value; });
  assert.ok(output.length <= 6000);
  parsed = JSON.parse(output);
  assert.equal(parsed.refreshed.length, 32);
  assert.ok(parsed.refreshed.every(function(value) { return value.length <= 64; }));
  assert.equal(entryReads, 0, 'only first 32 refreshed entries are read');
  assert.equal(parsed.textTruncated, true);
  assert.ok(parsed.text.length > 0, 'fitting preserves useful text');
  assert.equal(parsed.text.charCodeAt(parsed.text.length - 1) >= 0xD800 && parsed.text.charCodeAt(parsed.text.length - 1) <= 0xDBFF, false);
});
