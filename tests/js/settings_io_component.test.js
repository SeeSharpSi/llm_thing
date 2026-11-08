'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var JSDOM = require('jsdom').JSDOM;
var load = require('./helpers/load_with_stubs');
var component = require('../../src/pkjs/settings_io_component');

function fakeItem(type, config, initialValue) {
  var value = initialValue;
  var setCalls = [];
  var item = {
    config: Object.assign({ type: type }, config || {}),
    get: function() { return value; },
    set: function(nextValue) {
      value = nextValue;
      setCalls.push(nextValue);
      return item;
    }
  };

  item.messageKey = item.config.messageKey || null;
  item.setCalls = setCalls;
  return item;
}

var defaultMcpServers = [{
  enabled: true,
  label: 'One',
  url: 'https://one.example/mcp',
  description: 'Primary server',
  allowedTools: 'search',
  maxToolCalls: '2',
  authorization: 'mcp-auth-secret',
  headers: [{
    name: 'X-API-Key',
    value: 'mcp-header-secret'
  }]
}];

function createItems(options) {
  options = options || {};
  return {
    Endpoint: fakeItem('input', { messageKey: 'Endpoint' }, options.Endpoint || 'https://api.example/v1/responses'),
    ApiKey: fakeItem('input', { messageKey: 'ApiKey' }, options.ApiKey || 'sk-super-secret'),
    Model: fakeItem('model_selector', { messageKey: 'Model' }, 'gpt-4.1-mini'),
    ApiMode: fakeItem('select', {
      messageKey: 'ApiMode',
      options: [
        { label: 'Auto', value: 'auto' },
        { label: 'Responses', value: 'responses' },
        { label: 'Chat Completions', value: 'chat-completions' },
        { label: 'Messages', value: 'messages' }
      ]
    }, 'auto'),
    MaxOutputTokens: fakeItem('input', {
      messageKey: 'MaxOutputTokens',
      attributes: { type: 'number' }
    }, 0),
    SystemPrompt: fakeItem('input', { messageKey: 'SystemPrompt' }, 'Keep answers short.'),
    ShowThinking: fakeItem('toggle', { messageKey: 'ShowThinking' }, false),
    FontSize: fakeItem('select', {
      messageKey: 'FontSize',
      options: [
        { label: 'Small', value: '14' },
        { label: 'Normal', value: '18' },
        { label: 'Large', value: '24' },
        { label: 'Huge', value: '28' }
      ]
    }, '18'),
    TextColor: fakeItem('color', { messageKey: 'TextColor' }, 0),
    McpServersJson: fakeItem('mcp_servers', { messageKey: 'McpServersJson' }, JSON.stringify(options.mcpServers || defaultMcpServers)),
    MemoriesJson: fakeItem('memory_manager', { messageKey: 'MemoriesJson' }, '[{"text":"memory-secret"}]'),
    ConfigAction: fakeItem('input', {
      messageKey: 'ConfigAction',
      attributes: { type: 'hidden' }
    }, '')
  };
}

function createHarness(options) {
  var dom = new JSDOM('<!doctype html><html><body>' + component.template + '</body></html>');
  var root = dom.window.document.querySelector('.component-settings-io');
  var target = root.querySelector('[data-manipulator-target]');
  var events = [];
  var items = createItems(options);
  var clay = {
    getAllItemsCalls: 0,
    serialize: function() {
      throw new Error('settings export must read getAllItems, not serialize');
    },
    getAllItems: function() {
      clay.getAllItemsCalls += 1;
      return Object.keys(items).map(function(key) { return items[key]; });
    },
    getItemByMessageKey: function() {
      throw new Error('settings import must read getAllItems, not getItemByMessageKey');
    }
  };
  var item = {
    $element: [root],
    $manipulatorTarget: {
      set: function(name, value) {
        if (name === 'value') {
          target.value = value;
        }
      }
    },
    trigger: function(name) {
      events.push(name);
      return item;
    }
  };

  item.$element.set = function(command) {
    if (command === '+hide') {
      root.classList.add('hide');
    } else if (command === '-hide') {
      root.classList.remove('hide');
    }
  };

  component.initialize.call(item, null, clay);
  item.events = events;
  item.window = dom.window;
  item.root = root;
  item.target = target;
  item.textarea = root.querySelector('[data-settings-json]');
  item.status = root.querySelector('[data-settings-status]');
  item.items = items;
  item.clay = clay;
  return item;
}

function click(item, element) {
  element.dispatchEvent(new item.window.Event('click', { bubbles: true }));
}

function setClipboard(item, writeText) {
  Object.defineProperty(item.window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: writeText }
  });
}

function clearClipboard(item) {
  Object.defineProperty(item.window.navigator, 'clipboard', {
    configurable: true,
    value: undefined
  });
}

function setExecCommand(item, handler) {
  Object.defineProperty(item.window.document, 'execCommand', {
    configurable: true,
    value: handler
  });
}

test('declares the settings_io Clay component shape and empty value', function() {
  var item = createHarness();

  assert.equal(component.name, 'settings_io');
  assert.equal(component.defaults.defaultValue, '');
  assert.ok(item.root.classList.contains('component'));
  assert.ok(item.root.classList.contains('component-settings-io'));
  assert.equal(item.target.getAttribute('type'), 'hidden');
  assert.equal(item.textarea.tagName, 'TEXTAREA');
  assert.equal(item.textarea.hasAttribute('hidden'), false);
  assert.equal(component.manipulator.get.call(item), '');
  component.manipulator.set.call(item, 'ignored');
  assert.deepEqual(item.events, ['change']);
});

test('export builds the exact envelope, excludes secrets, and redacts MCP credentials', function() {
  var item = createHarness();
  var exported = item.buildExportSettings();
  var settings = exported.settings;
  var servers;
  var text;

  assert.equal(exported.app, 'llm_thing');
  assert.equal(exported.version, 1);
  assert.ok(!('ApiKey' in settings));
  assert.ok(!('ConfigAction' in settings));
  assert.ok(!('MemoriesJson' in settings));
  assert.equal(settings.Endpoint, 'https://api.example/v1/responses');
  assert.equal(settings.Model, 'gpt-4.1-mini');
  assert.equal(settings.ApiMode, 'auto');
  assert.equal(settings.ShowThinking, false);
  assert.equal(settings.FontSize, '18');
  assert.equal(settings.TextColor, 0);

  servers = JSON.parse(settings.McpServersJson);
  assert.equal(servers.length, 1);
  assert.equal(servers[0].label, 'One');
  assert.equal(servers[0].url, 'https://one.example/mcp');
  assert.equal(servers[0].description, 'Primary server');
  assert.equal(servers[0].allowedTools, 'search');
  assert.equal(servers[0].maxToolCalls, '2');
  assert.equal(servers[0].authorization, '');
  assert.equal(servers[0].headers[0].name, 'X-API-Key');
  assert.equal(servers[0].headers[0].value, '');

  text = JSON.stringify(exported);
  assert.equal(text.indexOf('sk-super-secret'), -1);
  assert.equal(text.indexOf('mcp-auth-secret'), -1);
  assert.equal(text.indexOf('mcp-header-secret'), -1);
  assert.equal(text.indexOf('memory-secret'), -1);
});

test('export turns malformed MCP JSON into an empty array', function() {
  var item = createHarness({ mcpServers: [] });

  item.items.McpServersJson.set('{bad');
  assert.equal(item.buildExportSettings().settings.McpServersJson, '[]');
});

test('export and import re-read the current Clay items on every operation', function() {
  var item = createHarness();
  var rebuilt;
  var exported;
  var result;

  exported = item.buildExportSettings();
  assert.equal(exported.settings.Endpoint, 'https://api.example/v1/responses');
  assert.equal(exported.settings.ShowThinking, false);
  assert.equal(item.clay.getAllItemsCalls, 1);

  item.items.Endpoint.set('https://changed.example/v1/responses');
  item.items.ShowThinking.set(true);
  exported = item.buildExportSettings();
  assert.equal(exported.settings.Endpoint, 'https://changed.example/v1/responses');
  assert.equal(exported.settings.ShowThinking, true);
  assert.equal(item.clay.getAllItemsCalls, 2);

  rebuilt = createItems({ Endpoint: 'https://rebuilt.example/v1/responses' });
  item.clay.getAllItems = function() {
    item.clay.getAllItemsCalls += 1;
    return Object.keys(rebuilt).map(function(key) { return rebuilt[key]; });
  };

  exported = item.buildExportSettings();
  assert.equal(exported.settings.Endpoint, 'https://rebuilt.example/v1/responses');
  assert.equal(item.clay.getAllItemsCalls, 3);

  result = item.importSettingsText(JSON.stringify({
    Endpoint: 'https://imported.example/v1/responses',
    ShowThinking: true
  }));
  assert.equal(result.ok, true);
  assert.equal(result.applied, 2);
  assert.equal(rebuilt.Endpoint.get(), 'https://imported.example/v1/responses');
  assert.equal(rebuilt.ShowThinking.get(), true);
  assert.equal(item.clay.getAllItemsCalls, 4);

  result = item.importSettingsText(JSON.stringify({
    Endpoint: 'https://again.example/v1/responses'
  }));
  assert.equal(result.ok, true);
  assert.equal(rebuilt.Endpoint.get(), 'https://again.example/v1/responses');
  assert.equal(item.clay.getAllItemsCalls, 5);
});

test('export and import treat an unbuilt Clay API as having no items', function() {
  var item = createHarness();
  var result;

  item.clay.getAllItems = function() {
    throw new Error('ClayConfig not built. build() must be run first');
  };

  assert.deepEqual(item.buildExportSettings(), {
    app: 'llm_thing',
    version: 1,
    settings: {}
  });

  result = item.importSettingsText(JSON.stringify({
    Endpoint: 'https://unbuilt.example/v1/responses'
  }));
  assert.equal(result.ok, false);
  assert.equal(result.applied, 0);
  assert.equal(result.skipped, 1);
  assert.match(item.status.textContent, /No supported settings/);
  assert.equal(item.items.Endpoint.get(), 'https://api.example/v1/responses');
});

test('export button fills the visible textarea and writes clipboard text', async function() {
  var item = createHarness();
  var written = null;

  setClipboard(item, function(text) {
    written = text;
    return Promise.resolve();
  });
  click(item, item.root.querySelector('[data-settings-export]'));
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(item.textarea.value, JSON.stringify(item.buildExportSettings(), null, 2));
  assert.equal(written, item.textarea.value);
  assert.match(item.status.textContent, /copied/i);
});

test('export falls back to a temporary textarea and execCommand copy', function() {
  var item = createHarness();
  var commands = [];

  clearClipboard(item);
  setExecCommand(item, function(command) {
    commands.push(command);
    assert.equal(item.window.document.querySelectorAll('textarea').length, 2);
    return true;
  });

  click(item, item.root.querySelector('[data-settings-export]'));

  assert.deepEqual(commands, ['copy']);
  assert.equal(item.window.document.querySelectorAll('textarea').length, 1);
  assert.match(item.status.textContent, /copied/i);
});

test('export falls back to execCommand when clipboard write rejects', async function() {
  var item = createHarness();
  var commands = [];

  setClipboard(item, function() {
    return Promise.reject(new Error('denied'));
  });
  setExecCommand(item, function(command) {
    commands.push(command);
    return true;
  });

  click(item, item.root.querySelector('[data-settings-export]'));
  await new Promise(function(resolve) { setTimeout(resolve, 0); });

  assert.deepEqual(commands, ['copy']);
  assert.match(item.status.textContent, /copied/i);
});

test('failed clipboard and execCommand select the textarea for manual copy', function() {
  var item = createHarness();

  clearClipboard(item);
  setExecCommand(item, function() { return false; });
  click(item, item.root.querySelector('[data-settings-export]'));

  assert.match(item.status.textContent, /manually/i);
  assert.equal(item.textarea.selectionStart, 0);
  assert.equal(item.textarea.selectionEnd, item.textarea.value.length);
});

test('imports an envelope, applies supported values, keeps secrets, and reports status', function() {
  var item = createHarness();
  var result = item.importSettingsText(JSON.stringify({
    app: 'llm_thing',
    version: 1,
    settings: {
      Endpoint: 'https://new.example/v1/responses',
      ShowThinking: true,
      FontSize: '24',
      TextColor: 123456,
      MaxOutputTokens: 512,
      ApiKey: 'imported-secret',
      ConfigAction: 'delete_saved_chats',
      MemoriesJson: '[{"text":"imported memory"}]',
      UnknownSetting: 'ignored'
    }
  }));

  assert.equal(result.ok, true);
  assert.equal(result.applied, 5);
  assert.equal(result.skipped, 1);
  assert.equal(result.keptApiKey, true);
  assert.equal(item.items.Endpoint.get(), 'https://new.example/v1/responses');
  assert.equal(item.items.ShowThinking.get(), true);
  assert.equal(item.items.FontSize.get(), '24');
  assert.equal(item.items.TextColor.get(), 123456);
  assert.equal(item.items.MaxOutputTokens.get(), 512);
  assert.equal(typeof item.items.MaxOutputTokens.get(), 'number');
  assert.equal(item.items.ApiKey.get(), 'sk-super-secret');
  assert.equal(item.items.ConfigAction.get(), '');
  assert.equal(item.items.MemoriesJson.get(), '[{"text":"memory-secret"}]');
  assert.equal(
    item.status.textContent,
    'Imported 5 settings. Tap Save Settings to apply. Your API key was kept. Ignored 1 unsupported value.'
  );
});

test('import accepts plain objects and value wrappers', function() {
  var item = createHarness();
  var plain = item.importSettingsText(JSON.stringify({ Endpoint: 'https://plain.example/v1/responses' }));
  var wrapped;

  assert.equal(plain.ok, true);
  assert.equal(item.items.Endpoint.get(), 'https://plain.example/v1/responses');

  wrapped = item.importSettingsText(JSON.stringify({
    value: JSON.stringify({ Endpoint: 'https://wrapped.example/v1/responses' })
  }));
  assert.equal(wrapped.ok, true);
  assert.equal(item.items.Endpoint.get(), 'https://wrapped.example/v1/responses');
});

test('normalizes toggles, validates selects, colors, and finite numbers', function() {
  var item = createHarness();
  var result;

  [
    [true, true],
    [1, true],
    ['1', true],
    ['true', true],
    [false, false],
    [0, false],
    ['0', false],
    ['false', false],
    ['', false]
  ].forEach(function(entry) {
    result = item.importSettingsText(JSON.stringify({ ShowThinking: entry[0] }));
    assert.equal(result.ok, true);
    assert.equal(item.items.ShowThinking.get(), entry[1]);
  });

  result = item.importSettingsText(JSON.stringify({ ShowThinking: 'yes' }));
  assert.equal(result.ok, false);
  assert.equal(item.items.ShowThinking.get(), false);

  result = item.importSettingsText(JSON.stringify({ FontSize: '28' }));
  assert.equal(result.ok, true);
  assert.equal(item.items.FontSize.get(), '28');
  result = item.importSettingsText(JSON.stringify({ FontSize: '30' }));
  assert.equal(result.ok, false);
  assert.equal(item.items.FontSize.get(), '28');

  result = item.importSettingsText(JSON.stringify({ TextColor: 16777215 }));
  assert.equal(result.ok, true);
  assert.equal(item.items.TextColor.get(), 16777215);
  result = item.importSettingsText(JSON.stringify({ TextColor: 16777216 }));
  assert.equal(result.ok, false);
  assert.equal(item.items.TextColor.get(), 16777215);

  result = item.importSettingsText(JSON.stringify({ MaxOutputTokens: '128' }));
  assert.equal(result.ok, true);
  assert.equal(item.items.MaxOutputTokens.get(), 128);
  result = item.importSettingsText(JSON.stringify({ MaxOutputTokens: 'not-a-number' }));
  assert.equal(result.ok, false);
  assert.equal(item.items.MaxOutputTokens.get(), 128);
});

test('MCP import merges same-URL secrets by URL or empty-URL label and never crosses URLs', function() {
  var currentServers = [
    {
      label: 'One',
      url: 'https://one.example/mcp',
      authorization: 'current-one-auth',
      headers: [{ name: 'X-API-Key', value: 'current-one-header' }]
    },
    {
      label: 'Two',
      url: 'https://two.example/mcp',
      authorization: 'current-two-auth',
      headers: [{ name: 'Authorization', value: 'current-two-header' }]
    },
    {
      label: 'Label Only',
      url: '',
      authorization: 'current-label-auth',
      headers: [{ name: 'X-Label', value: 'current-label-header' }]
    },
    {
      label: 'Has Url',
      url: 'https://has.example/mcp',
      authorization: 'current-has-url',
      headers: [{ name: 'X-Has', value: 'current-has-header' }]
    }
  ];
  var importedServers = [
    {
      label: 'One',
      url: ' https://one.example/mcp ',
      authorization: '',
      headers: [
        { name: 'x-api-key', value: '' },
        { name: 'X-New', value: '' }
      ]
    },
    {
      label: 'Two',
      url: 'https://changed.example/mcp',
      authorization: '',
      headers: [{ name: 'Authorization', value: '' }]
    },
    {
      label: 'label only',
      url: '',
      authorization: '',
      headers: [{ name: 'x-label', value: '' }]
    },
    {
      label: 'Has Url',
      url: '',
      authorization: '',
      headers: [{ name: 'X-Has', value: '' }]
    },
    {
      label: 'One replacement',
      url: 'https://one.example/mcp',
      authorization: 'imported-auth',
      headers: [{ name: 'X-API-Key', value: 'imported-header' }]
    }
  ];
  var item = createHarness({ mcpServers: currentServers });
  var result = item.importSettingsText(JSON.stringify({
    McpServersJson: JSON.stringify(importedServers)
  }));
  var merged = JSON.parse(item.items.McpServersJson.get());

  assert.equal(result.ok, true);
  assert.equal(result.applied, 1);

  assert.equal(merged[0].authorization, 'current-one-auth');
  assert.equal(merged[0].headers[0].value, 'current-one-header');
  assert.equal(merged[0].headers[1].value, '');

  assert.equal(merged[1].authorization, '');
  assert.equal(merged[1].headers[0].value, '');

  assert.equal(merged[2].authorization, 'current-label-auth');
  assert.equal(merged[2].headers[0].value, 'current-label-header');

  assert.equal(merged[3].authorization, '');
  assert.equal(merged[3].headers[0].value, '');

  assert.equal(merged[4].authorization, 'imported-auth');
  assert.equal(merged[4].headers[0].value, 'imported-header');
});

test('MCP import accepts an array and replaces servers with an empty array', function() {
  var item = createHarness();
  var result = item.importSettingsText(JSON.stringify({ McpServersJson: [] }));

  assert.equal(result.ok, true);
  assert.equal(item.items.McpServersJson.get(), '[]');
});

test('plugin source and action selections roundtrip without catalogue metadata', function() {
  var item = createHarness();
  var selected = '[{"plugin":"00000000-0000-0000-0001-000000000007","category":"calendar","item":"today"}]';
  var selectedActions = '[{"plugin":"00000000-0000-0000-0001-000000000007","action":"set_on"},{"plugin":"00000000-0000-0000-0001-000000000008","action":"legacy_action"},{"plugin":"00000000-0000-0000-0001-000000000009","action":"ask_action","confirm":true}]';
  var key = 'PluginSourcesJson';
  var actionKey = 'PluginActionsJson';
  item.items[key] = fakeItem('plugin_sources', { messageKey: key }, selected);
  item.items[actionKey] = fakeItem('plugin_actions', { messageKey: actionKey }, selectedActions);
  var exported = item.buildExportSettings();
  var restored = createHarness();
  restored.items[key] = fakeItem('plugin_sources', { messageKey: key }, '[]');
  restored.items[actionKey] = fakeItem('plugin_actions', { messageKey: actionKey }, '[]');

  assert.equal(exported.settings[key], selected);
  assert.equal(exported.settings[actionKey], selectedActions);
  assert.equal(Object.keys(exported.settings).some(function(name) { return /catalogue/i.test(name); }), false);
  assert.equal(restored.importSettingsText(JSON.stringify(exported)).ok, true);
  assert.equal(restored.items[key].get(), selected);
  assert.equal(restored.items[actionKey].get(), selectedActions);
});

test('import rejects empty, oversized, malformed, array, primitive, and wrong-version input', function() {
  var item = createHarness();
  var cases = [
    ['   ', /Paste settings JSON/],
    ['{bad', /Invalid JSON/],
    ['[]', /must be an object/],
    ['null', /must be an object/],
    ['42', /must be an object/],
    ['"text"', /must be an object/],
    [JSON.stringify({ app: 'other', version: 1, settings: { Endpoint: 'x' } }), /different app/],
    [JSON.stringify({ app: 'llm_thing', version: 2, settings: { Endpoint: 'x' } }), /Unsupported settings version/],
    [JSON.stringify({ app: 'llm_thing', version: 1, settings: [] }), /settings object/],
    [JSON.stringify({ value: 'not json' }), /Invalid JSON in value/],
    [JSON.stringify({ Endpoint: 'x'.repeat(512 * 1024) }), /too large/]
  ];

  cases.forEach(function(entry) {
    var before = item.items.Endpoint.get();
    var result = item.importSettingsText(entry[0]);

    assert.equal(result.ok, false);
    assert.match(item.status.textContent, entry[1]);
    assert.equal(item.items.Endpoint.get(), before);
  });
});

test('nothing supported produces an error and malformed MCP is skipped', function() {
  var item = createHarness();
  var result = item.importSettingsText(JSON.stringify({ UnknownSetting: 'value' }));

  assert.equal(result.ok, false);
  assert.match(item.status.textContent, /No supported settings/);

  result = item.importSettingsText(JSON.stringify({
    Endpoint: 'https://valid.example/v1/responses',
    McpServersJson: '{bad'
  }));
  assert.equal(result.ok, true);
  assert.equal(result.applied, 1);
  assert.equal(result.skipped, 1);
  assert.equal(item.items.Endpoint.get(), 'https://valid.example/v1/responses');
  assert.equal(JSON.parse(item.items.McpServersJson.get())[0].label, 'One');
  assert.match(item.status.textContent, /Ignored 1 unsupported value\./);
});

function restoreGlobal(name, value) {
  if (value === undefined) {
    delete global[name];
  } else {
    global[name] = value;
  }
}

function createPinnedClay(config) {
  var host = new JSDOM(
    '<!doctype html><html><body><form id="main-form" class="inputs"></form></body></html>',
    { url: 'http://localhost/' }
  );
  var previous = {
    window: global.window,
    document: global.document,
    Pebble: global.Pebble
  };
  var localStorageDescriptor = Object.getOwnPropertyDescriptor(global, 'localStorage');
  var Clay;
  var clay;
  var url;
  var html;

  global.window = host.window;
  global.document = host.window.document;
  global.localStorage = host.window.localStorage;
  global.Pebble = {
    platform: 'phone',
    addEventListener: function() {}
  };

  try {
    Clay = load.loadWithStubs('@rebble/clay/dist/js/index.js', { message_keys: {} });
    clay = new Clay(config, function() {
      window.__clay = this;
    });
    clay.registerComponent(component);
    url = clay.generateUrl();
  } finally {
    load.clearModule('@rebble/clay/dist/js/index.js');
    restoreGlobal('window', previous.window);
    restoreGlobal('document', previous.document);
    restoreGlobal('Pebble', previous.Pebble);
    if (localStorageDescriptor) {
      Object.defineProperty(global, 'localStorage', localStorageDescriptor);
    } else {
      delete global.localStorage;
    }
    host.window.close();
  }

  html = decodeURIComponent(url.slice(url.indexOf(',') + 1));
  host = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'http://localhost/'
  });
  return { dom: host, clay: host.window.__clay };
}

test('pinned Clay 1.0.10 export matches getAllItems item.get and serialize wrappers', function() {
  var excludedKeys = ['ApiKey', 'ConfigAction', 'MemoriesJson'];
  var harness = createPinnedClay([{
    type: 'section',
    items: [{
      type: 'input',
      messageKey: 'Endpoint',
      defaultValue: 'https://initial.example/v1/responses'
    }, {
      type: 'input',
      messageKey: 'ApiKey',
      defaultValue: 'sk-pinned-secret'
    }, {
      type: 'toggle',
      messageKey: 'ShowThinking',
      defaultValue: false
    }, {
      type: 'select',
      messageKey: 'ApiMode',
      defaultValue: 'auto',
      options: [
        { label: 'Auto', value: 'auto' },
        { label: 'Responses', value: 'responses' }
      ]
    }, {
      type: 'input',
      messageKey: 'McpServersJson',
      defaultValue: JSON.stringify([{
        label: 'One',
        url: 'https://one.example/mcp',
        authorization: 'pinned-auth-secret',
        headers: [{ name: 'X-Key', value: 'pinned-header-secret' }]
      }])
    }, {
      type: 'input',
      messageKey: 'MemoriesJson',
      defaultValue: '[{"text":"pinned-memory"}]'
    }, {
      type: 'input',
      messageKey: 'ConfigAction',
      defaultValue: ''
    }, {
      type: 'settings_io',
      id: 'SettingsIo',
      defaultValue: ''
    }]
  }]);

  try {
    var clay = harness.clay;
    var io;
    var serialized;
    var exported;
    var servers;
    var result;

    assert.ok(clay, 'pinned Clay config page built');
    io = clay.getItemById('SettingsIo');
    assert.ok(io);
    assert.equal(typeof io.buildExportSettings, 'function');

    serialized = clay.serialize();
    exported = io.buildExportSettings();

    assert.deepEqual(Object.keys(exported.settings).sort(), [
      'ApiMode',
      'Endpoint',
      'McpServersJson',
      'ShowThinking'
    ]);

    Object.keys(serialized).forEach(function(key) {
      if (excludedKeys.indexOf(key) !== -1) {
        assert.equal(Object.prototype.hasOwnProperty.call(exported.settings, key), false, key);
        return;
      }
      if (key === 'McpServersJson') {
        return;
      }
      assert.equal(exported.settings[key], serialized[key].value, key);
    });

    servers = JSON.parse(exported.settings.McpServersJson);
    assert.equal(servers[0].label, 'One');
    assert.equal(servers[0].url, 'https://one.example/mcp');
    assert.equal(servers[0].authorization, '');
    assert.equal(servers[0].headers[0].value, '');
    assert.equal(
      JSON.parse(serialized.McpServersJson.value)[0].authorization,
      'pinned-auth-secret'
    );

    clay.getItemByMessageKey('Endpoint').set('https://changed.example/v1/responses');
    clay.getItemByMessageKey('ShowThinking').set(true);
    serialized = clay.serialize();
    exported = io.buildExportSettings();

    assert.equal(exported.settings.Endpoint, serialized.Endpoint.value);
    assert.equal(exported.settings.ShowThinking, serialized.ShowThinking.value);
    assert.equal(exported.settings.Endpoint, 'https://changed.example/v1/responses');
    assert.equal(exported.settings.ShowThinking, true);

    result = io.importSettingsText(JSON.stringify({
      Endpoint: 'https://imported.example/v1/responses',
      ShowThinking: false,
      ApiKey: 'pinned-import-secret'
    }));
    assert.equal(result.ok, true);
    assert.equal(result.applied, 2);
    assert.equal(result.keptApiKey, true);
    assert.equal(
      clay.getItemByMessageKey('Endpoint').get(),
      'https://imported.example/v1/responses'
    );
    assert.equal(clay.getItemByMessageKey('ShowThinking').get(), false);
    assert.equal(clay.getItemByMessageKey('ApiKey').get(), 'sk-pinned-secret');
    assert.equal(clay.serialize().Endpoint.value, 'https://imported.example/v1/responses');

    result = io.importSettingsText(JSON.stringify({
      Endpoint: 'https://imported-again.example/v1/responses'
    }));
    assert.equal(result.ok, true);
    assert.equal(
      clay.getItemByMessageKey('Endpoint').get(),
      'https://imported-again.example/v1/responses'
    );
    assert.equal(
      io.buildExportSettings().settings.Endpoint,
      'https://imported-again.example/v1/responses'
    );
  } finally {
    harness.dom.window.close();
  }
});
