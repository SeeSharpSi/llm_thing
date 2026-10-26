'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var JSDOM = require('jsdom').JSDOM;
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
    serialize: function() {
      var result = {};
      Object.keys(items).forEach(function(key) {
        result[key] = { value: items[key].get() };
      });
      return result;
    },
    getAllItems: function() {
      return Object.keys(items).map(function(key) { return items[key]; });
    },
    getItemByMessageKey: function(key) {
      return items[key] || null;
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
