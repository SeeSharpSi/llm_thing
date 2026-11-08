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
    syncWatchSettings: function(value, force) { watch.calls.push(['sync', value, force]); },
    handleHealthInfoResponse: function(value) { watch.calls.push(['health', value]); },
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
    requestCompletion: function(id, text) { model.calls.push(['request', id, text]); },
    cancelCompletion: function(id) { model.calls.push(['cancel', id]); },
    retryCompletion: function(id, failedId) { model.calls.push(['retry', id, failedId]); }
  };
  var modelDiscovery = {
    discoverCalls: [],
    cachedCalls: [],
    refreshCalls: [],
    refreshCallbacks: [],
    discover: function(value, callback) {
      modelDiscovery.discoverCalls.push(value);
      if (callback) {
        modelDiscovery.discoveryCallback = callback;
      }
    },
    getCached: function(value) {
      modelDiscovery.cachedCalls.push(value);
      return { models: ['model-a', "$'model-b"], status: '2 cached models.' };
    },
    refresh: function(value, callback) {
      modelDiscovery.refreshCalls.push(value);
      modelDiscovery.refreshCallbacks.push(callback);
    }
  };
  var pluginSources = {
    calls: 0,
    getCatalogue: function() {
      pluginSources.calls += 1;
      return { sources: [{ plugin: 'plugin-id', pluginName: 'Phone', category: 'calendar', item: 'today', properties: ['title'] }], status: '1 source available.' };
    }
  };
  var pluginActions = {
    calls: 0,
    invokeCalls: 0,
    getCatalogue: function() {
      pluginActions.calls += 1;
      return { actions: [{ plugin: '00000000-0000-0000-0001-000000000007', pluginName: 'Home', action: 'set_on', description: 'Turn switch on.', arguments: ['device_id'] }], status: '1 action available.' };
    },
    invokeAction: function() { pluginActions.invokeCalls += 1; }
  };
  var tools = {
    warmCalls: [],
    warmMcpTools: function(value) { tools.warmCalls.push(value); }
  };
  var config = [{
    type: 'section',
    items: [
      { type: 'model_selector', messageKey: 'Model' },
      { type: 'plugin_sources', messageKey: 'PluginSourcesJson' },
      { type: 'plugin_actions', messageKey: 'PluginActionsJson' }
    ]
  }];

  load.loadWithStubs(indexPath, {
    '@rebble/clay': FakeClay,
    './config': config,
    './mcp_servers_component': { name: 'mcp_servers' },
    './builtin_tools_component': { name: 'builtin_tools' },
    './settings_io_component': { name: 'settings_io' },
    './model_discovery': modelDiscovery,
    './model_selector_component': { name: 'model_selector' },
    './plugin_sources_component': { name: 'plugin_sources' },
    './plugin_actions_component': { name: 'plugin_actions' },
    './plugin_sources': pluginSources,
    './plugin_actions': pluginActions,
    './settings': settings,
    './tools': tools,
    './watch': watch,
    './model': model,
    './memory_store': options.memoryStore || {
      MAX_MEMORIES: 128,
      listMemories: function() { return []; },
      replaceMemories: function() {}
    }
  });

  return { clay: FakeClay.instance, settings: settings, watch: watch, model: model, modelDiscovery: modelDiscovery, tools: tools, pluginSources: pluginSources, pluginActions: pluginActions };
}

test.afterEach(function() {
  delete global.Pebble;
  delete global.confirm;
  delete global.document;
  load.clearModule(indexPath);
});

test('opens configuration synchronously from cache without starting model discovery', function() {
  var harness = createHarness();

  assert.deepEqual(harness.clay.options, { autoHandleEvents: false });
  assert.equal(harness.clay.registered[0].name, 'mcp_servers');
  assert.equal(harness.clay.registered[1].name, 'model_selector');
  assert.equal(harness.clay.registered[2].name, 'memory_manager');
  assert.equal(harness.clay.registered[3].name, 'builtin_tools');
  assert.equal(harness.clay.registered[4].name, 'settings_io');
  assert.equal(harness.clay.registered[5].name, 'plugin_sources');
  assert.equal(harness.clay.registered[6].name, 'plugin_actions');
  assert.equal(harness.clay.registered.length, 7);
  global.Pebble.emit('ready');
  assert.deepEqual(harness.model.calls, [['reset']]);
  assert.equal(harness.watch.calls[0][0], 'sync');
  assert.equal(harness.watch.calls[0][2], true, 'startup always performs full settings sync');
  assert.deepEqual(harness.tools.warmCalls, [harness.settings.loadSettings()]);

  global.Pebble.emit('showConfiguration');
  assert.deepEqual(global.Pebble.openedUrls, ['data:text/html,test']);
  assert.equal(harness.clay.currentSettings.FontSize, 18);
  assert.equal(harness.modelDiscovery.cachedCalls.length, 1);
  assert.equal(harness.modelDiscovery.discoverCalls.length, 0);
  assert.equal(harness.modelDiscovery.refreshCalls.length, 0);
  assert.deepEqual(JSON.parse(decodeURIComponent(harness.clay.config[0].items[0].modelsEncoded)), ['model-a', "$'model-b"]);
  assert.equal(harness.clay.config[0].items[0].modelsStatus, '2 cached models.');
  assert.equal(harness.pluginSources.calls, 1);
  assert.deepEqual(JSON.parse(decodeURIComponent(harness.clay.config[0].items[1].catalogueEncoded)), [
    { plugin: 'plugin-id', pluginName: 'Phone', category: 'calendar', item: 'today', properties: ['title'] }
  ]);
  assert.equal(harness.clay.config[0].items[1].catalogueStatus, '1 source available.');
  assert.equal(harness.pluginActions.calls, 1);
  assert.equal(harness.pluginActions.invokeCalls, 0, 'configuration discovery never invokes an action');
  assert.deepEqual(JSON.parse(decodeURIComponent(harness.clay.config[0].items[2].catalogueEncoded)), [
    { plugin: '00000000-0000-0000-0001-000000000007', pluginName: 'Home', action: 'set_on', description: 'Turn switch on.', arguments: ['device_id'] }
  ]);
  assert.equal(harness.clay.config[0].items[2].catalogueStatus, '1 action available.');
  global.Pebble.emit('showConfiguration');
  assert.equal(harness.pluginSources.calls, 2, 'catalogue refreshes each time settings open');
  assert.equal(harness.pluginActions.calls, 2, 'action catalogue refreshes each time settings open');
});

test('configuration reports unsupported plugin catalogue without losing configured choices', function() {
  var harness = createHarness({ settings: { PluginSourcesJson: '[{"plugin":"legacy","category":"old","item":"entry"}]' } });
  harness.pluginSources.getCatalogue = function() { throw new Error('Plugin source catalogue is not supported by this phone.'); };
  global.Pebble.emit('showConfiguration');
  assert.equal(harness.clay.currentSettings.PluginSourcesJson, '[{"plugin":"legacy","category":"old","item":"entry"}]');
  assert.equal(decodeURIComponent(harness.clay.config[0].items[1].catalogueEncoded), '[]');
  assert.match(harness.clay.config[0].items[1].catalogueStatus, /not supported by this phone/);
});

test('configuration close persists plugin choices but not catalogue injection fields', function() {
  var selected = '[{"plugin":"00000000-0000-0000-0001-000000000007","category":"calendar","item":"today"}]';
  var selectedActions = '[{"plugin":"00000000-0000-0000-0001-000000000007","action":"set_on"}]';
  var harness = createHarness();
  global.Pebble.emit('showConfiguration');
  global.Pebble.emit('webviewclosed', { response: JSON.stringify({ PluginSourcesJson: selected, PluginActionsJson: selectedActions }) });

  assert.equal(harness.settings.saved[0].PluginSourcesJson, selected);
  assert.equal(harness.settings.saved[0].PluginActionsJson, selectedActions);
  assert.equal(Object.prototype.hasOwnProperty.call(harness.settings.saved[0], 'catalogueEncoded'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(harness.settings.saved[0], 'catalogueStatus'), false);
});

test('memory manager visibility follows its toggle after Clay builds', function() {
  var harness = createHarness();
  var enabled = false;
  var toggleListener;
  var managerCalls = [];
  var toggle = {
    get: function() { return enabled; },
    on: function(event, callback) { assert.equal(event, 'change'); toggleListener = callback; }
  };
  var manager = {
    hide: function() { managerCalls.push('hide'); },
    show: function() { managerCalls.push('show'); }
  };
  var afterBuild;
  var clayContext = {
    EVENTS: { AFTER_BUILD: 'after-build' },
    on: function(event, callback) { assert.equal(event, 'after-build'); afterBuild = callback; },
    getItemById: function() { return null; },
    getItemByMessageKey: function(key) {
      if (key === 'PebbleMemoryToolEnabled') { return toggle; }
      if (key === 'MemoriesJson') { return manager; }
      return null;
    }
  };

  harness.clay.customFn.call(clayContext);
  afterBuild();
  assert.deepEqual(managerCalls, ['hide']);
  enabled = true;
  toggleListener();
  assert.deepEqual(managerCalls, ['hide', 'show']);
});

test('Reset Watch Display restores Response Sound default to disabled', function() {
  var harness = createHarness();
  var afterBuild;
  var resetClick;
  var values = {};
  var resetButton = {
    on: function(event, callback) {
      assert.equal(event, 'click');
      resetClick = callback;
    }
  };
  var soundToggle = {
    config: { defaultValue: false },
    set: function(value) { values.SpeakerFeedbackEnabled = value; }
  };
  var clayContext = {
    EVENTS: { AFTER_BUILD: 'after-build' },
    on: function(event, callback) { assert.equal(event, 'after-build'); afterBuild = callback; },
    getItemById: function(id) { return id === 'ResetWatchDisplay' ? resetButton : null; },
    getItemByMessageKey: function(key) { return key === 'SpeakerFeedbackEnabled' ? soundToggle : null; }
  };

  harness.clay.customFn.call(clayContext);
  afterBuild();
  resetClick();

  assert.equal(values.SpeakerFeedbackEnabled, false);
});

test('after build appends the six built-in tool roots into the expander', function() {
  var harness = createHarness();
  var afterBuild;
  var appended = [];
  var roots = {};
  var toolKeys = [
    'WebSearchEnabled',
    'GeolocationToolEnabled',
    'TimelineToolEnabled',
    'HealthToolEnabled',
    'PebbleMemoryToolEnabled',
    'MaxToolCalls'
  ];
  var expander = {
    appendItems: function(elements) { appended.push(elements.slice()); }
  };
  var manager = { hide: function() {}, show: function() {} };
  var clayContext = {
    EVENTS: { AFTER_BUILD: 'after-build' },
    on: function(event, callback) { assert.equal(event, 'after-build'); afterBuild = callback; },
    getItemById: function(id) { return id === 'BuiltinTools' ? expander : null; },
    getItemByMessageKey: function(key) {
      if (key === 'MemoriesJson') { return manager; }
      if (toolKeys.indexOf(key) !== -1) {
        if (!roots[key]) {
          roots[key] = { $element: [key] };
          if (key === 'PebbleMemoryToolEnabled') {
            roots[key].get = function() { return false; };
            roots[key].on = function() {};
          }
        }
        return roots[key];
      }
      return null;
    }
  };

  harness.clay.customFn.call(clayContext);
  afterBuild();

  assert.equal(appended.length, 1);
  assert.deepEqual(appended[0], toolKeys);
});

test('configuration bridges phone-local memories without persisting transient JSON', function() {
  var replaced = [];
  var harness = createHarness({
    memoryStore: {
      MAX_MEMORIES: 128,
      listMemories: function() { return [{ id: 'one', text: 'saved', createdAt: 10, updatedAt: 11 }]; },
      replaceMemories: function(records) { replaced.push(records); }
    }
  });

  global.Pebble.emit('showConfiguration');
  assert.deepEqual(JSON.parse(harness.clay.currentSettings.MemoriesJson), [{ id: 'one', text: 'saved', createdAt: 10, updatedAt: 11 }]);
  global.Pebble.emit('webviewclosed', { response: JSON.stringify({ PebbleMemoryToolEnabled: 1, MemoriesJson: '[{"id":"two","text":"note","createdAt":20,"updatedAt":21}]' }) });
  assert.deepEqual(replaced, [[{ id: 'two', text: 'note', createdAt: 20, updatedAt: 21 }]]);
  assert.ok(!('MemoriesJson' in harness.settings.saved[0]));
});

test('configuration unwraps Clay memory values before replacing the store', function() {
  var replaced = [];
  var harness = createHarness({
    memoryStore: {
      MAX_MEMORIES: 128,
      listMemories: function() { return []; },
      replaceMemories: function(records) { replaced.push(records); return true; }
    }
  });

  global.Pebble.emit('webviewclosed', {
    response: JSON.stringify({
      MemoriesJson: { value: '[{"id":"one","text":"note","createdAt":20,"updatedAt":21}]' }
    })
  });

  assert.deepEqual(replaced, [[{ id: 'one', text: 'note', createdAt: 20, updatedAt: 21 }]]);
  assert.ok(!('MemoriesJson' in harness.settings.saved[0]));
});

test('malformed memory payload preserves store and still saves toggle', function() {
  var replaced = 0;
  var harness = createHarness({ memoryStore: { MAX_MEMORIES: 128, listMemories: function() { return []; }, replaceMemories: function() { replaced += 1; } } });
  assert.doesNotThrow(function() { global.Pebble.emit('webviewclosed', { response: JSON.stringify({ PebbleMemoryToolEnabled: 1, MemoriesJson: '{bad' }) }); });
  assert.equal(replaced, 0);
  assert.equal(harness.settings.saved[0].PebbleMemoryToolEnabled, 1);
  assert.ok(!('MemoriesJson' in harness.settings.saved[0]));
});

test('webview close deletes chats once for the delete action without reloading', function() {
  var harness = createHarness();

  global.Pebble.emit('webviewclosed', { response: JSON.stringify({ ConfigAction: 'delete_saved_chats', FontSize: 24 }) });

  assert.deepEqual(harness.clay.lastGetSettings[1], false);
  assert.deepEqual(harness.model.calls, [['delete-all']]);
  assert.equal(harness.settings.saved.length, 1);
  assert.equal(harness.watch.calls[0][0], 'sync');
  assert.deepEqual(harness.tools.warmCalls, [harness.settings.saved[0]], 'settings save warms MCP definitions');
  assert.equal(harness.watch.calls[0][2], undefined, 'settings save uses changed-settings deduplication');
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

test('model refresh action saves settings, refreshes cache, and never reopens configuration', function() {
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
  assert.equal(harness.modelDiscovery.refreshCalls.length, 1);
  assert.equal(harness.modelDiscovery.refreshCalls[0].Endpoint, 'https://new.example/v1/responses');
  assert.deepEqual(harness.tools.warmCalls, [harness.settings.saved[0]]);
  assert.ok(!('ConfigAction' in harness.settings.saved[0]));
  assert.ok(!('DeleteAllPastChats' in harness.settings.saved[0]));
  assert.deepEqual(global.Pebble.openedUrls, []);
  harness.modelDiscovery.refreshCallbacks[0]({ models: ['fresh-model'], status: '1 model loaded.' });
  assert.deepEqual(global.Pebble.openedUrls, []);
});

test('empty or unknown configuration actions perform neither flow and stay unpersisted', function() {
  var harness = createHarness();

  global.Pebble.emit('webviewclosed', { response: JSON.stringify({ ConfigAction: '', FontSize: 20 }) });
  assert.deepEqual(harness.model.calls, []);
  assert.equal(harness.modelDiscovery.discoverCalls.length, 0);
  assert.equal(harness.modelDiscovery.refreshCalls.length, 0);
  assert.equal(harness.settings.saved.length, 1);
  assert.equal(harness.watch.calls.length, 1);
  assert.ok(!('ConfigAction' in harness.settings.saved[0]));
  assert.deepEqual(global.Pebble.openedUrls, []);

  global.Pebble.emit('webviewclosed', { response: JSON.stringify({ ConfigAction: true }) });
  global.Pebble.emit('webviewclosed', { response: JSON.stringify({ ConfigAction: 'bogus_action' }) });
  assert.deepEqual(harness.model.calls, []);
  assert.equal(harness.modelDiscovery.discoverCalls.length, 0);
  assert.equal(harness.modelDiscovery.refreshCalls.length, 0);
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

test('appmessage routes cancel and safe retry request ids', function() {
  var harness = createHarness();

  global.Pebble.emit('appmessage', { payload: { RequestId: 42, RequestCancel: 1 } });
  global.Pebble.emit('appmessage', { payload: { RequestId: 43, RequestRetry: 42 } });

  assert.deepEqual(harness.model.calls, [['cancel', 42], ['retry', 43, 42]]);
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
