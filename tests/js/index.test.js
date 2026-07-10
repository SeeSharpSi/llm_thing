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
    PreserveChats: true,
    DeleteAllPastChats: false
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
      result.DeleteAllPastChats = result.DeleteAllPastChats === true || result.DeleteAllPastChats === '1';
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

  load.loadWithStubs(indexPath, {
    '@rebble/clay': FakeClay,
    './config': [],
    './mcp_servers_component': { name: 'mcp_servers' },
    './settings': settings,
    './watch': watch,
    './model': model
  });

  return { clay: FakeClay.instance, settings: settings, watch: watch, model: model };
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
  global.Pebble.emit('ready');
  assert.deepEqual(harness.model.calls, [['reset']]);
  assert.equal(harness.watch.calls[0][0], 'sync');

  global.Pebble.emit('showConfiguration');
  assert.equal(harness.clay.currentSettings.FontSize, 18);
  assert.deepEqual(global.Pebble.openedUrls, ['data:text/html,test']);
});

test('webview close normalizes, deletes chats once, saves, and syncs', function() {
  var harness = createHarness();

  global.Pebble.emit('webviewclosed', { response: JSON.stringify({ DeleteAllPastChats: '1', FontSize: 24 }) });

  assert.deepEqual(harness.clay.lastGetSettings[1], false);
  assert.deepEqual(harness.model.calls, [['delete-all']]);
  assert.equal(harness.settings.saved[0].DeleteAllPastChats, false);
  assert.equal(harness.settings.saved[0].FontSize, 24);
  assert.equal(harness.watch.calls[0][0], 'sync');
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
  var harness = createHarness({ settings: { PreserveChats: false, DeleteAllPastChats: false } });

  global.Pebble.emit('appmessage', { payload: { PastChatsRequest: 1 } });
  global.Pebble.emit('appmessage', { payload: { PastChatLoad: 'missing' } });

  assert.deepEqual(harness.watch.calls, [
    ['list-error', 'Enable Preserve Chats in settings.'],
    ['list-error', 'Enable Preserve Chats in settings.']
  ]);
});

test.todo('token-only health responses route to missing-data handling');
test.todo('malformed Clay webview responses are caught without losing settings');
