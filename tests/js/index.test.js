'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var path = require('node:path');
var createFakePebble = require('./helpers/fake_pebble');
var load = require('./helpers/load_with_stubs');

var indexPath = path.resolve(__dirname, '../../src/pkjs/index');

function createHarness(options) {
  options = options || {};
  global.Pebble = createFakePebble();
  global.confirm = function() { return true; };

  function FakeClay(config, customFn, clayOptions) {
    this.config = config;
    this.customFn = customFn;
    this.options = clayOptions;
    this.registered = [];
    this.currentSettings = null;
    FakeClay.instance = this;
  }
  FakeClay.prototype.registerComponent = function(component) { this.registered.push(component); };
  FakeClay.prototype.setSettings = function(value) { this.currentSettings = value; };
  FakeClay.prototype.generateUrl = function() { return 'data:text/html,test'; };
  FakeClay.prototype.getSettings = function(response, convert) {
    this.lastGetSettings = [response, convert];
    return JSON.parse(response);
  };

  var currentSettings = options.settings || {
    FontSize: 18,
    PreserveChats: true
  };
  var settings = {
    DEFAULT_SETTINGS: currentSettings,
    saved: [],
    loadSettings: function() { return currentSettings; },
    saveSettings: function(value) { settings.saved.push(value); },
    extend: function(base, value) {
      var result = {};
      Object.keys(base).forEach(function(key) { result[key] = base[key]; });
      Object.keys(value || {}).forEach(function(key) { result[key] = value[key]; });
      return result;
    },
    logDebug: function() {}
  };
  var watch = {
    calls: [],
    syncWatchSettings: function(value) { watch.calls.push(['sync', value]); },
    handleHealthSummaryResponse: function(value) { watch.calls.push(['health', value]); },
    sendPastChatsError: function(value) { watch.calls.push(['list-error', value]); },
    sendPastChats: function(value) { watch.calls.push(['list', value]); },
    sendPastChatTranscript: function(value) { watch.calls.push(['transcript', value]); },
    sendPastChatDeleted: function(value) { watch.calls.push(['deleted', value]); }
  };
  var model = {
    calls: [],
    resetChatHistory: function() { model.calls.push(['reset']); },
    listSavedChats: function() { return [{ id: 'one' }]; },
    loadSavedChat: function(id) { return id === 'one' ? { id: 'one', messages: [] } : null; },
    deleteSavedChat: function(id) { model.calls.push(['delete', id]); },
    deleteAllSavedChats: function() { model.calls.push(['delete-all']); },
    requestCompletion: function(id, text) { model.calls.push(['request', id, text]); }
  };
  var modelDiscovery = {
    calls: [],
    discover: function(value, callback) {
      modelDiscovery.calls.push(value);
      callback({ models: ['model-a', "$'model-b"], status: '2 models loaded.' });
    }
  };
  var config = [{
    type: 'section',
    items: [{ type: 'model_selector', messageKey: 'Model' }]
  }];

  load.loadWithStubs(indexPath, {
    '@rebble/clay': FakeClay,
    './config': config,
    './mcp_servers_component': { name: 'mcp_servers' },
    './model_discovery': modelDiscovery,
    './model_selector_component': { name: 'model_selector' },
    './settings': settings,
    './watch': watch,
    './model': model
  });

  return { clay: FakeClay.instance, settings: settings, watch: watch, model: model, modelDiscovery: modelDiscovery };
}

test.afterEach(function() {
  delete global.Pebble;
  delete global.confirm;
  delete global.document;
  load.clearModule(indexPath);
});

test('registers Clay and handles ready and configuration open', function() {
  var harness = createHarness();

  assert.deepEqual(harness.clay.options, { autoHandleEvents: false });
  assert.equal(harness.clay.registered[0].name, 'mcp_servers');
  assert.equal(harness.clay.registered[1].name, 'model_selector');
  global.Pebble.emit('ready');
  assert.deepEqual(harness.model.calls, [['reset']]);
  assert.equal(harness.watch.calls[0][0], 'sync');

  global.Pebble.emit('showConfiguration');
  assert.equal(harness.clay.currentSettings.FontSize, 18);
  assert.equal(harness.modelDiscovery.calls.length, 1);
  assert.deepEqual(JSON.parse(decodeURIComponent(harness.clay.config[0].items[0].modelsEncoded)), ['model-a', "$'model-b"]);
  assert.equal(harness.clay.config[0].items[0].modelsStatus, '2 models loaded.');
  assert.deepEqual(global.Pebble.openedUrls, ['data:text/html,test']);
});

test('webview close deletes chats once for the delete action without reloading', function() {
  var harness = createHarness();

  global.Pebble.emit('webviewclosed', { response: JSON.stringify({ ConfigAction: 'delete_saved_chats', FontSize: 24 }) });

  assert.deepEqual(harness.clay.lastGetSettings[1], false);
  assert.deepEqual(harness.model.calls, [['delete-all']]);
  assert.equal(harness.settings.saved.length, 1);
  assert.equal(harness.watch.calls[0][0], 'sync');
  assert.equal(harness.watch.calls[0][1].FontSize, 24);
  assert.ok(!('ConfigAction' in harness.settings.saved[0]));
  assert.ok(!('DeleteAllPastChats' in harness.settings.saved[0]));
  assert.deepEqual(global.Pebble.openedUrls, []);
});

test('webview close object-wrapped delete action unwraps and executes once', function() {
  var harness = createHarness();

  global.Pebble.emit('webviewclosed', {
    response: JSON.stringify({ ConfigAction: { value: 'delete_saved_chats' }, FontSize: 18 })
  });

  assert.deepEqual(harness.model.calls, [['delete-all']]);
  assert.ok(!('ConfigAction' in harness.settings.saved[0]));
  assert.deepEqual(global.Pebble.openedUrls, []);
});

test('model reload action saves settings and reopens with phone-side discovery', function() {
  var harness = createHarness();

  global.Pebble.emit('webviewclosed', {
    response: JSON.stringify({
      ConfigAction: 'reload_models',
      Endpoint: 'https://new.example/v1/responses',
      ApiKey: 'new-secret'
    })
  });

  assert.deepEqual(harness.model.calls, []);
  assert.equal(harness.settings.saved.length, 1);
  assert.equal(harness.watch.calls[0][0], 'sync');
  assert.equal(harness.modelDiscovery.calls.length, 1);
  assert.equal(harness.modelDiscovery.calls[0].Endpoint, 'https://new.example/v1/responses');
  assert.ok(!('ConfigAction' in harness.settings.saved[0]));
  assert.ok(!('DeleteAllPastChats' in harness.settings.saved[0]));
  assert.ok(!('ConfigAction' in harness.clay.currentSettings));
  assert.ok(!('DeleteAllPastChats' in harness.clay.currentSettings));
  assert.deepEqual(global.Pebble.openedUrls, ['data:text/html,test']);
});

test('empty or unknown configuration actions perform neither flow and stay unpersisted', function() {
  var harness = createHarness();

  global.Pebble.emit('webviewclosed', { response: JSON.stringify({ ConfigAction: '', FontSize: 20 }) });
  assert.deepEqual(harness.model.calls, []);
  assert.equal(harness.modelDiscovery.calls.length, 0);
  assert.equal(harness.settings.saved.length, 1);
  assert.equal(harness.watch.calls.length, 1);
  assert.ok(!('ConfigAction' in harness.settings.saved[0]));
  assert.deepEqual(global.Pebble.openedUrls, []);

  global.Pebble.emit('webviewclosed', { response: JSON.stringify({ ConfigAction: true }) });
  global.Pebble.emit('webviewclosed', { response: JSON.stringify({ ConfigAction: 'bogus_action' }) });
  assert.deepEqual(harness.model.calls, []);
  assert.equal(harness.modelDiscovery.calls.length, 0);
  assert.equal(harness.settings.saved.length, 3);
  assert.deepEqual(global.Pebble.openedUrls, []);
});

test('appmessage routes reset, request, saved chat, delete, and health flows', function() {
  var harness = createHarness();

  global.Pebble.emit('appmessage', { payload: { ChatReset: 1, RequestId: 7, RequestText: 'Hello' } });
  global.Pebble.emit('appmessage', { payload: { PastChatsRequest: 1 } });
  global.Pebble.emit('appmessage', { payload: { PastChatLoad: 'one' } });
  global.Pebble.emit('appmessage', { payload: { PastChatDelete: 'one' } });
  global.Pebble.emit('appmessage', { payload: {
    RequestId: 7,
    HealthSummaryRequest: 2,
    HealthSummaryJson: '{}'
  } });

  assert.deepEqual(harness.model.calls.slice(0, 2), [['reset'], ['request', 7, 'Hello']]);
  assert.ok(harness.watch.calls.some(function(call) { return call[0] === 'list'; }));
  assert.ok(harness.watch.calls.some(function(call) { return call[0] === 'transcript'; }));
  assert.ok(harness.watch.calls.some(function(call) { return call[0] === 'deleted'; }));
  assert.ok(harness.watch.calls.some(function(call) { return call[0] === 'health'; }));
});

test('saved-chat requests reject disabled preservation and missing chats', function() {
  var harness = createHarness({ settings: { PreserveChats: false } });

  global.Pebble.emit('appmessage', { payload: { PastChatsRequest: 1 } });
  global.Pebble.emit('appmessage', { payload: { PastChatLoad: 'missing' } });

  assert.deepEqual(harness.watch.calls, [
    ['list-error', 'Enable Preserve Chats in settings.'],
    ['list-error', 'Enable Preserve Chats in settings.']
  ]);
});

test('token-only health responses route to missing-data handling', function() {
  var harness = createHarness();

  global.Pebble.emit('appmessage', { payload: { RequestId: 7, HealthSummaryRequest: 2 } });

  assert.deepEqual(harness.watch.calls, [['health', { RequestId: 7, HealthSummaryRequest: 2 }]]);
});

test('malformed Clay webview responses are caught without losing settings', function() {
  var harness = createHarness();

  assert.doesNotThrow(function() {
    global.Pebble.emit('webviewclosed', { response: '{bad' });
  });
  assert.deepEqual(harness.settings.saved, []);
  assert.deepEqual(harness.watch.calls, []);
});
