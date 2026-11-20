'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var path = require('node:path');
var FakeLocalStorage = require('./helpers/fake_local_storage');
var load = require('./helpers/load_with_stubs');

var settingsPath = path.resolve(__dirname, '../../src/pkjs/settings');

test.afterEach(function() {
  delete global.localStorage;
  load.clearModule(settingsPath);
});

test('DEFAULT_SETTINGS owns no transient configuration action fields', function() {
  var settings = require(settingsPath);

  assert.ok(!('DeleteAllPastChats' in settings.DEFAULT_SETTINGS));
  assert.ok(!('ConfigAction' in settings.DEFAULT_SETTINGS));
  assert.equal(settings.DEFAULT_SETTINGS.PreserveChats, false);
  assert.equal(settings.DEFAULT_SETTINGS.PebbleMemoryToolEnabled, false);
  assert.equal(settings.DEFAULT_SETTINGS.SleepToolEnabled, false);
  assert.equal(settings.DEFAULT_SETTINGS.SpeakerFeedbackEnabled, false);
  assert.equal(settings.DEFAULT_SETTINGS.PluginSourcesJson, '[]');
  assert.equal(settings.DEFAULT_SETTINGS.PluginActionsJson, '[]');
  assert.equal(settings.DEFAULT_SETTINGS.McpDiscoveryTimeoutMs, 3000);
});

test('extend applies defaults, unwraps Clay values, and normalizes toggles', function() {
  var settings = require(settingsPath);
  var result = settings.extend(settings.DEFAULT_SETTINGS, {
    ShowThinking: { value: '1' },
    PreserveChats: 1,
    TimelineToolEnabled: 'true',
    SleepToolEnabled: 1,
    PebbleMemoryToolEnabled: 1,
    SpeakerFeedbackEnabled: { value: '1' },
    TouchScrollEnabled: 0,
    Model: { value: 'custom-model' },
    ApiKey: '[object Object]'
  });

  assert.equal(result.ShowThinking, true);
  assert.equal(result.PreserveChats, true);
  assert.equal(result.TimelineToolEnabled, false);
  assert.equal(result.SleepToolEnabled, true);
  assert.equal(result.PebbleMemoryToolEnabled, true);
  assert.equal(result.SpeakerFeedbackEnabled, true);
  assert.equal(result.TouchScrollEnabled, false);
  assert.equal(result.Model, 'custom-model');
  assert.equal(result.ApiKey, '');
  assert.equal(result.Endpoint, settings.DEFAULT_SETTINGS.Endpoint);
});

test('SpeakerFeedbackEnabled normalizes boolean and Clay toggle values', function() {
  var settings = require(settingsPath);
  var values = [
    [true, true],
    [1, true],
    ['1', true],
    [{ value: true }, true],
    [{ value: '1' }, true],
    [false, false],
    [0, false],
    ['0', false],
    [{ value: false }, false],
    [{ value: '0' }, false],
    ['true', false],
    ['false', false]
  ];

  values.forEach(function(entry) {
    assert.equal(
      settings.extend(settings.DEFAULT_SETTINGS, { SpeakerFeedbackEnabled: entry[0] }).SpeakerFeedbackEnabled,
      entry[1],
      JSON.stringify(entry[0]) + ' normalizes to ' + entry[1]
    );
  });
});

test('extend clamps numeric settings and enforces font choices', function() {
  var settings = require(settingsPath);

  assert.equal(settings.extend(settings.DEFAULT_SETTINGS, { MaxToolCalls: -4 }).MaxToolCalls, 0);
  assert.equal(settings.extend(settings.DEFAULT_SETTINGS, { MaxToolCalls: 99 }).MaxToolCalls, 16);
  assert.equal(settings.extend(settings.DEFAULT_SETTINGS, { RequestTimeoutMs: 50 }).RequestTimeoutMs, 1000);
  assert.equal(settings.extend(settings.DEFAULT_SETTINGS, { RequestTimeoutMs: 'bad' }).RequestTimeoutMs, 60000);
  assert.equal(settings.extend(settings.DEFAULT_SETTINGS, { McpDiscoveryTimeoutMs: '7250' }).McpDiscoveryTimeoutMs, 7250);
  assert.equal(settings.extend(settings.DEFAULT_SETTINGS, { McpDiscoveryTimeoutMs: 0 }).McpDiscoveryTimeoutMs, 1000);
  assert.equal(settings.extend(settings.DEFAULT_SETTINGS, { McpDiscoveryTimeoutMs: 50000 }).McpDiscoveryTimeoutMs, 30000);
  assert.equal(settings.extend(settings.DEFAULT_SETTINGS, { McpDiscoveryTimeoutMs: 'bad' }).McpDiscoveryTimeoutMs, 3000);
  assert.equal(settings.extend(settings.DEFAULT_SETTINGS, { FontSize: 19 }).FontSize, 18);
  assert.equal(settings.extend(settings.DEFAULT_SETTINGS, { FontSize: 28 }).FontSize, 28);
  assert.equal(settings.extend(settings.DEFAULT_SETTINGS, { BuzzStrength: 9 }).BuzzStrength, 3);
  assert.equal(settings.extend(settings.DEFAULT_SETTINGS, { ScrollLines: 0 }).ScrollLines, 1);
});

test('loadSettings falls back after missing or corrupt storage', function() {
  var settings;

  global.localStorage = new FakeLocalStorage({ llm_thing_settings: '{broken' });
  settings = require(settingsPath);
  assert.deepEqual(settings.loadSettings(), settings.DEFAULT_SETTINGS);

  global.localStorage.setItem('llm_thing_settings', JSON.stringify({ Model: 'stored', ShowThinking: '1' }));
  assert.equal(settings.loadSettings().Model, 'stored');
  assert.equal(settings.loadSettings().ShowThinking, true);
  assert.equal(settings.loadSettings().SpeakerFeedbackEnabled, false, 'old settings migrate to sound disabled');
});

test('saveSettings stores normalized settings', function() {
  var settings;
  var stored;

  global.localStorage = new FakeLocalStorage();
  settings = require(settingsPath);
  settings.saveSettings({ FontSize: 17, TouchScrollEnabled: '0', MaxToolCalls: -1 });
  stored = JSON.parse(global.localStorage.getItem('llm_thing_settings'));

  assert.equal(stored.FontSize, 18);
  assert.equal(stored.TouchScrollEnabled, false);
  assert.equal(stored.MaxToolCalls, 0);
  assert.equal(stored.Endpoint, settings.DEFAULT_SETTINGS.Endpoint);
});

test('PluginSourcesJson persists as phone-side JSON setting', function() {
  var settings;
  var selected = '[{"plugin":"00000000-0000-0000-0001-000000000007","category":"calendar","item":"today"}]';
  global.localStorage = new FakeLocalStorage();
  settings = require(settingsPath);
  settings.saveSettings({ PluginSourcesJson: selected });
  assert.equal(JSON.parse(global.localStorage.getItem('llm_thing_settings')).PluginSourcesJson, selected);
  assert.equal(settings.loadSettings().PluginSourcesJson, selected);
});

test('PluginActionsJson persists independently as phone-side JSON setting', function() {
  var settings;
  var selected = '[{"plugin":"00000000-0000-0000-0001-000000000007","action":"set_on"}]';
  global.localStorage = new FakeLocalStorage();
  settings = require(settingsPath);
  settings.saveSettings({ PluginSourcesJson: '[{"plugin":"00000000-0000-0000-0001-000000000007","category":"switch","item":"state"}]', PluginActionsJson: selected });
  assert.equal(JSON.parse(global.localStorage.getItem('llm_thing_settings')).PluginActionsJson, selected);
  assert.equal(settings.loadSettings().PluginActionsJson, selected);
  assert.equal(JSON.parse(global.localStorage.getItem('llm_thing_settings')).PluginSourcesJson.indexOf('action'), -1);
});

test('saveSettings and loadSettings persist SpeakerFeedbackEnabled on and off', function() {
  var settings;

  global.localStorage = new FakeLocalStorage();
  settings = require(settingsPath);

  settings.saveSettings({ SpeakerFeedbackEnabled: { value: '1' } });
  assert.equal(JSON.parse(global.localStorage.getItem('llm_thing_settings')).SpeakerFeedbackEnabled, true);
  assert.equal(settings.loadSettings().SpeakerFeedbackEnabled, true);

  settings.saveSettings({ SpeakerFeedbackEnabled: { value: '0' } });
  assert.equal(JSON.parse(global.localStorage.getItem('llm_thing_settings')).SpeakerFeedbackEnabled, false);
  assert.equal(settings.loadSettings().SpeakerFeedbackEnabled, false);
});

test('text and JSON helpers handle nested provider content', function() {
  var settings = require(settingsPath);
  var cyclic = {};
  cyclic.self = cyclic;

  assert.deepEqual(settings.splitCsv(' one, ,two, three '), ['one', 'two', 'three']);
  assert.equal(settings.truncate('abcdef', 5), 'ab...');
  assert.equal(settings.safeJson(cyclic), 'null');
  assert.equal(settings.collectTextFromContent([
    { text: 'one' },
    { content: [{ text: 'two' }, 'three'] }
  ]), 'onetwothree');
});

test('extend normalizes ApiMode, MaxOutputTokens, and ReasoningEffort', function() {
  var settings = require(settingsPath);

  assert.equal(settings.DEFAULT_SETTINGS.ApiMode, 'auto');
  assert.equal(settings.DEFAULT_SETTINGS.MaxOutputTokens, 0);
  assert.equal(settings.DEFAULT_SETTINGS.ReasoningEffort, '');

  assert.equal(settings.extend(settings.DEFAULT_SETTINGS, { ApiMode: 'chat-completions' }).ApiMode, 'chat-completions');
  assert.equal(settings.extend(settings.DEFAULT_SETTINGS, { ApiMode: 'responses' }).ApiMode, 'responses');
  assert.equal(settings.extend(settings.DEFAULT_SETTINGS, { ApiMode: 'messages' }).ApiMode, 'messages');
  assert.equal(settings.extend(settings.DEFAULT_SETTINGS, { ApiMode: 'bogus' }).ApiMode, 'auto');
  assert.equal(settings.extend(settings.DEFAULT_SETTINGS, { ApiMode: '' }).ApiMode, 'auto');

  assert.equal(settings.extend(settings.DEFAULT_SETTINGS, { MaxOutputTokens: 200000 }).MaxOutputTokens, 100000);
  assert.equal(settings.extend(settings.DEFAULT_SETTINGS, { MaxOutputTokens: -5 }).MaxOutputTokens, 0);
  assert.equal(settings.extend(settings.DEFAULT_SETTINGS, { MaxOutputTokens: 'bad' }).MaxOutputTokens, 0);
  assert.equal(settings.extend(settings.DEFAULT_SETTINGS, { MaxOutputTokens: 2048 }).MaxOutputTokens, 2048);

  assert.equal(settings.extend(settings.DEFAULT_SETTINGS, { ReasoningEffort: 'high' }).ReasoningEffort, 'high');
  assert.equal(settings.extend(settings.DEFAULT_SETTINGS, { ReasoningEffort: 'minimal' }).ReasoningEffort, 'minimal');
  assert.equal(settings.extend(settings.DEFAULT_SETTINGS, { ReasoningEffort: 'none' }).ReasoningEffort, 'none');
  assert.equal(settings.extend(settings.DEFAULT_SETTINGS, { ReasoningEffort: 'bogus' }).ReasoningEffort, '');
});
