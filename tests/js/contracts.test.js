'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var createFakePebble = require('./helpers/fake_pebble');
var load = require('./helpers/load_with_stubs');

var root = path.resolve(__dirname, '../..');
var watchPath = path.join(root, 'src/pkjs/watch');
var packageJson = require('../../package.json');
var config = require('../../src/pkjs/config');
var settings = require('../../src/pkjs/settings');

function configItems(items, result) {
  result = result || [];
  (items || []).forEach(function(item) {
    if (item.messageKey) {
      result.push(item);
    }
    if (item.items) {
      configItems(item.items, result);
    }
  });
  return result;
}

function allConfigItems(items, result) {
  result = result || [];
  (items || []).forEach(function(item) {
    result.push(item);
    if (item.items) {
      allConfigItems(item.items, result);
    }
  });
  return result;
}

test.afterEach(function() {
  delete global.Pebble;
  load.clearModule(watchPath);
});

test('configuration keys are unique and declared in manifest', function() {
  var manifestKeys = packageJson.pebble.messageKeys;
  var configured = configItems(config);
  var configuredKeys = configured.map(function(item) { return item.messageKey; });

  assert.equal(new Set(manifestKeys).size, manifestKeys.length);
  assert.equal(new Set(configuredKeys).size, configuredKeys.length);
  configuredKeys.forEach(function(key) {
    assert.ok(manifestKeys.indexOf(key) !== -1, key + ' missing from package.json');
  });
});

test('configuration defaults normalize to runtime defaults', function() {
  var values = {};
  configItems(config).forEach(function(item) {
    values[item.messageKey] = item.defaultValue;
  });

  var normalized = settings.extend(settings.DEFAULT_SETTINGS, values);
  Object.keys(settings.DEFAULT_SETTINGS).forEach(function(key) {
    assert.deepEqual(normalized[key], settings.DEFAULT_SETTINGS[key], key + ' default differs');
  });
});

test('model configuration uses the dynamic selector', function() {
  var modelItem = configItems(config).filter(function(item) {
    return item.messageKey === 'Model';
  })[0];

  assert.equal(modelItem.type, 'model_selector');
  assert.equal(modelItem.defaultValue, settings.DEFAULT_SETTINGS.Model);
});

test('transient ConfigAction replaces the persistent DeleteAllPastChats control', function() {
  var manifestKeys = packageJson.pebble.messageKeys;
  var configured = configItems(config);
  var configuredKeys = configured.map(function(item) { return item.messageKey; });
  var actionItems = configured.filter(function(item) { return item.messageKey === 'ConfigAction'; });
  var allItems = allConfigItems(config);
  var deleteButtons = allItems.filter(function(item) {
    return item.type === 'button' && item.id === 'DeleteAllPastChats';
  });

  assert.ok(manifestKeys.indexOf('ConfigAction') !== -1, 'ConfigAction missing from package.json');
  assert.equal(actionItems.length, 1);
  assert.equal(actionItems[0].attributes.type, 'hidden');
  assert.equal(actionItems[0].defaultValue, '');

  assert.equal(manifestKeys.indexOf('DeleteAllPastChats'), -1);
  configured.forEach(function(item) {
    assert.notEqual(item.messageKey, 'DeleteAllPastChats');
    assert.ok(!('messageKey' in item && item.defaultValue === '0' && item.attributes && item.attributes.type === 'hidden'),
      'legacy hidden DeleteAllPastChats control remains');
  });
  assert.equal(deleteButtons.length, 1);
  assert.equal(deleteButtons[0].messageKey, undefined);

  assert.equal(settings.DEFAULT_SETTINGS.DeleteAllPastChats, undefined);
  assert.equal(settings.DEFAULT_SETTINGS.ConfigAction, undefined);
});

test('watch settings sync excludes phone-only settings and secrets', function() {
  global.Pebble = createFakePebble();
  var watch = require(watchPath);

  watch.syncWatchSettings(settings.DEFAULT_SETTINGS);

  assert.deepEqual(Object.keys(global.Pebble.messages[0]).sort(), [
    'BackgroundColor', 'BoldTextColor', 'BuzzStrength', 'FontSize',
    'PreserveChats', 'PromptBackgroundColor', 'ScrollLines',
    'ShowInputContextSize', 'ShowOutputContextSize', 'StartDictationQuickLaunch',
    'TextColor', 'TouchScrollEnabled'
  ].sort());
  assert.equal(global.Pebble.messages[0].ApiKey, undefined);
  assert.equal(global.Pebble.messages[0].McpServersJson, undefined);
  assert.equal(global.Pebble.messages[0].DeleteAllPastChats, undefined);
  assert.equal(global.Pebble.messages[0].ConfigAction, undefined);
});

test('generated message-key artifacts are internally consistent', function() {
  var expected = packageJson.pebble.messageKeys.slice().sort();
  var appInfo = JSON.parse(fs.readFileSync(path.join(root, 'build/appinfo.json'), 'utf8'));
  var jsKeys = JSON.parse(fs.readFileSync(path.join(root, 'build/js/message_keys.json'), 'utf8'));
  var header = fs.readFileSync(path.join(root, 'build/include/message_keys.auto.h'), 'utf8');
  var headerKeys = [];
  var match;
  var pattern = /MESSAGE_KEY_([A-Za-z0-9_]+)/g;

  while ((match = pattern.exec(header)) !== null) {
    headerKeys.push(match[1]);
  }

  var generatedKeys = Object.keys(jsKeys).sort();
  var cSource = fs.readFileSync(path.join(root, 'src/c/llm_thing2.c'), 'utf8');
  var referencedCKeys = [];
  var referencePattern = /MESSAGE_KEY_([A-Za-z0-9_]+)/g;

  while ((match = referencePattern.exec(cSource)) !== null) {
    if (referencedCKeys.indexOf(match[1]) === -1) {
      referencedCKeys.push(match[1]);
    }
  }

  assert.deepEqual(Object.keys(appInfo.appKeys).sort(), expected);
  assert.deepEqual(headerKeys.sort(), generatedKeys);
  assert.deepEqual(generatedKeys, expected);
  generatedKeys.forEach(function(key) {
    assert.ok(expected.indexOf(key) !== -1, key + ' generated but undeclared');
  });
  referencedCKeys.forEach(function(key) {
    assert.ok(generatedKeys.indexOf(key) !== -1, key + ' used by C but not generated');
  });
});

test('watch text protocol marker constants match C renderer', function() {
  var watchSource = fs.readFileSync(path.join(root, 'src/pkjs/watch.js'), 'utf8');
  var cSource = fs.readFileSync(path.join(root, 'src/c/llm_thing2.c'), 'utf8');
  var pairs = [
    ['WATCH_BOLD_ON', 'TEXT_BOLD_ON', '0001', '01'],
    ['WATCH_BOLD_OFF', 'TEXT_BOLD_OFF', '0002', '02'],
    ['WATCH_PROMPT_ON', 'TEXT_PROMPT_ON', '0003', '03'],
    ['WATCH_PROMPT_OFF', 'TEXT_PROMPT_OFF', '0004', '04'],
    ['WATCH_SMALL_ON', 'TEXT_SMALL_ON', '0005', '05'],
    ['WATCH_SMALL_OFF', 'TEXT_SMALL_OFF', '0006', '06']
  ];

  pairs.forEach(function(pair) {
    assert.match(watchSource, new RegExp(pair[0] + " = '\\\\u" + pair[2] + "'"));
    assert.match(cSource, new RegExp(pair[1] + " '\\\\x" + pair[3] + "'"));
  });
});
