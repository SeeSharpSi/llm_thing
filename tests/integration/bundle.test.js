'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');
var createFakePebble = require('../js/helpers/fake_pebble');
var FakeLocalStorage = require('../js/helpers/fake_local_storage');
var FakeXMLHttpRequest = require('../js/helpers/fake_xhr');

var root = path.resolve(__dirname, '../..');

function createBundleHarness(storageValues, manualSends, pluginOptions) {
  var source = fs.readFileSync(path.join(root, 'build/pebble-js-app.js'), 'utf8');
  var pebble = createFakePebble({ manualSends: !!manualSends });
  var localStorage = new FakeLocalStorage(storageValues);
  var sandbox = {
    Pebble: pebble,
    localStorage: localStorage,
    XMLHttpRequest: FakeXMLHttpRequest,
    navigator: {},
    console: { log: function() {}, error: function() {}, warn: function() {} },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Date: Date,
    Math: Math,
    JSON: JSON,
    encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent
  };

  FakeXMLHttpRequest.reset();
  if (pluginOptions) {
    pebble.enumeratePlugins = function() { return pluginOptions.plugins || []; };
    pebble.pluginSubscriptions = [];
    pebble.subscribeToSource = function(request) {
      var subscription = { request: request, unsubscribed: false };
      subscription.unsubscribe = function() { subscription.unsubscribed = true; };
      pebble.pluginSubscriptions.push(subscription);
      return subscription;
    };
  }
  vm.runInNewContext(source, sandbox, { filename: 'build/pebble-js-app.js' });

  return {
    pebble: pebble,
    localStorage: localStorage
  };
}

function flushManualSends(pebble) {
  var sends = 0;
  var maxSends = 1000;

  while (pebble.pendingSendCount()) {
    assert.ok(sends < maxSends, 'AppMessage queue drained within ' + maxSends + ' sends');
    pebble.flushNextSend();
    sends += 1;
  }
}

function collectStringValues(value) {
  var result = '';
  var key;

  if (typeof value === 'string') {
    return value;
  }
  if (!value || typeof value !== 'object') {
    return result;
  }
  for (key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      result += collectStringValues(value[key]);
    }
  }
  return result;
}

function hasUnpairedSurrogate(value) {
  var i;
  var code;
  var next;

  for (i = 0; i < value.length; i += 1) {
    code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return true;
      }
      i += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function savedChatsFixture() {
  return JSON.stringify({
    version: 1,
    chats: [
      {
        id: 'old-fixture',
        title: 'Old fixture',
        createdAt: 50,
        updatedAt: 100,
        messages: [
          { role: 'user', content: 'old loaded user history' },
          { role: 'assistant', content: 'old loaded assistant history' }
        ]
      },
      {
        id: 'saved-fixture',
        title: 'Loaded fixture',
        createdAt: 150,
        updatedAt: 200,
        messages: [
          { role: 'user', content: 'loaded user history' },
          { role: 'assistant', content: 'loaded assistant history' }
        ]
      }
    ]
  });
}

test('built PebbleKit bundle loads and registers runtime handlers', function() {
  var harness = createBundleHarness();
  var pebble = harness.pebble;

  ['ready', 'showConfiguration', 'webviewclosed', 'appmessage'].forEach(function(name) {
    assert.ok(pebble.listeners[name] && pebble.listeners[name].length > 0, name + ' listener missing');
  });

  pebble.emit('ready');
  assert.ok(pebble.messages.length > 0);
  assert.equal(pebble.messages[0].FontSize, 18);
  assert.equal(pebble.messages[0].TouchScrollEnabled, 1);
  assert.equal(pebble.messages[0].SpeakerFeedbackEnabled, 0);

  pebble.emit('showConfiguration');
  assert.equal(pebble.openedUrls.length, 1);
  assert.match(pebble.openedUrls[0], /^data:text\/html/);
  var configHtml = decodeURIComponent(pebble.openedUrls[0].split(',').slice(1).join(','));
  var componentEnd = configHtml.indexOf('item.reloadModels = function');
  var settingsIoMarker = configHtml.indexOf('item.buildExportSettings = buildExportSettings');
  var firstScriptEnd = configHtml.indexOf('</script>');

  assert.ok(componentEnd > 0, 'model selector source missing');
  assert.ok(componentEnd < firstScriptEnd, 'model selector source escaped its script');
  assert.match(configHtml, /Health Info/);

  assert.ok(configHtml.indexOf('Settings Backup') !== -1, 'settings backup section missing');
  assert.ok(configHtml.indexOf('component-settings-io') !== -1, 'settings backup component missing');
  assert.ok(settingsIoMarker > 0, 'settings backup component source missing');
  assert.ok(settingsIoMarker < firstScriptEnd, 'settings backup component source escaped its script');
});

test('built bundle supplies encoded plugin catalogue to plugin sources Clay component', function() {
  var plugin = {
    uuid: '12345678-1234-4234-8234-123456789abc',
    name: 'Weather <script>alert(1)</script>',
    sources: [{ category: 'weather', items: ['location'], properties: { temperature: ['numericValue', 'shortText'] } }]
  };
  var harness = createBundleHarness({}, false, { plugins: [plugin] });
  var pebble = harness.pebble;
  var html;

  pebble.emit('showConfiguration');
  html = decodeURIComponent(pebble.openedUrls[0].split(',').slice(1).join(','));

  assert.match(html, /plugin_sources/);
  assert.match(html, /catalogueEncoded/);
  assert.ok(html.indexOf(plugin.uuid) !== -1, 'plugin catalogue reaches generated settings');
  assert.equal(html.indexOf('<script>alert(1)</script>'), -1, 'plugin name is not injected as executable markup');
  assert.equal(pebble.pluginSubscriptions.length, 0, 'catalogue discovery does not read source data');
});

test('selected plugin source is read on model call and returned to model and watch', function() {
  var uuid = '12345678-1234-4234-8234-123456789abc';
  var endpoint = 'https://offline.invalid/v1/responses';
  var plugins = [{
    uuid: uuid,
    name: 'Weather',
    sources: [
      { category: 'weather', items: ['location'], properties: { temperature: ['numericValue', 'shortText'] } },
      { category: 'weather', items: ['forecast'], properties: { summary: ['shortText'] } }
    ]
  }];
  var harness = createBundleHarness({
    llm_thing_settings: JSON.stringify({
      Endpoint: endpoint,
      ApiKey: 'offline-key',
      Model: 'offline-model',
      MaxToolCalls: 1,
      PluginSourcesJson: JSON.stringify([{ plugin: uuid, category: 'weather', item: 'location' }])
    })
  }, true, { plugins: plugins });
  var pebble = harness.pebble;
  var request;
  var body;
  var selectedTool;
  var toolName;
  var followUp;
  var outputs;
  var sourceEnvelope;
  var sourceResult;
  var responseText;

  pebble.emit('ready');
  flushManualSends(pebble);
  assert.equal(pebble.pluginSubscriptions.length, 0, 'settings sync does not read source data');
  pebble.emit('appmessage', { payload: { RequestId: 31, RequestText: 'What is temperature at home?' } });
  request = FakeXMLHttpRequest.last();
  body = JSON.parse(request.body);
  assert.equal(pebble.pluginSubscriptions.length, 0, 'tool discovery does not read source data');
  selectedTool = body.tools.filter(function(tool) {
    return tool.type === 'function' && tool.name.indexOf('pebble_plugin_') === 0;
  });
  assert.equal(selectedTool.length, 1, 'only selected plugin source exposed');
  toolName = selectedTool[0].name;
  assert.equal(JSON.stringify(body.tools).indexOf('forecast'), -1, 'unselected source is absent');

  request.respond(200, {
    output: [{ type: 'function_call', call_id: 'plugin-call', name: toolName, arguments: '{}' }]
  });
  assert.equal(pebble.pluginSubscriptions.length, 1, 'tool call starts one short-lived source subscription');
  assert.equal(pebble.pluginSubscriptions[0].request.plugin, uuid);
  assert.equal(pebble.pluginSubscriptions[0].request.category, 'weather');
  assert.equal(pebble.pluginSubscriptions[0].request.item, 'location');
  pebble.pluginSubscriptions[0].request.onData({
    pluginUuid: uuid,
    validUntilMs: Date.now() + 60000,
    instances: [{ instanceId: 'home', properties: { temperature: { numericValue: { value: 21, unit: 'C' } } } }]
  });

  followUp = FakeXMLHttpRequest.last();
  body = JSON.parse(followUp.body);
  outputs = body.input.filter(function(item) { return item.type === 'function_call_output'; });
  assert.equal(outputs.length, 1, 'source result is sent as function output');
  sourceEnvelope = JSON.parse(outputs[0].output);
  assert.equal(sourceEnvelope.error, undefined, 'source result has no tool error');
  assert.ok(sourceEnvelope.result && typeof sourceEnvelope.result === 'object', 'tool result uses object wrapper');
  sourceResult = sourceEnvelope.result;
  assert.equal(sourceResult.pluginUuid, uuid);
  assert.equal(sourceResult.category, 'weather');
  assert.equal(sourceResult.item, 'location');
  assert.equal(sourceResult.instances[0].instanceId, 'home');
  assert.equal(sourceResult.instances[0].properties.temperature.numericValue.value, 21);
  assert.equal(sourceResult.instances[0].properties.temperature.numericValue.unit, 'C');
  assert.equal(pebble.pluginSubscriptions[0].unsubscribed, true, 'source subscription is unsubscribed after data');

  followUp.respond(200, { output_text: 'It is 21 C at home.' });
  flushManualSends(pebble);
  responseText = pebble.messages.filter(function(message) { return message.ResponseChunk !== undefined; })
    .map(function(message) { return message.ResponseChunk; }).join('');
  assert.match(responseText, /21 C at home/);
  assert.ok(pebble.messages.some(function(message) { return message.ResponseDone === 1; }), 'final answer delivered to watch');
});

test('canceling plugin source request unsubscribes and ignores late source data', function() {
  var uuid = '12345678-1234-4234-8234-123456789abc';
  var harness = createBundleHarness({
    llm_thing_settings: JSON.stringify({
      Endpoint: 'https://offline.invalid/v1/responses',
      ApiKey: 'offline-key',
      Model: 'offline-model',
      MaxToolCalls: 1,
      PluginSourcesJson: JSON.stringify([{ plugin: uuid, category: 'weather', item: 'location' }])
    })
  }, true, { plugins: [{
    uuid: uuid,
    name: 'Weather',
    sources: [{ category: 'weather', items: ['location'], properties: { temperature: ['numericValue', 'shortText'] } }]
  }] });
  var pebble = harness.pebble;
  var request;
  var body;
  var toolName;
  var subscription;
  var messagesAfterCancel;

  pebble.emit('ready');
  flushManualSends(pebble);
  pebble.emit('appmessage', { payload: { RequestId: 34, RequestText: 'weather?' } });
  request = FakeXMLHttpRequest.last();
  body = JSON.parse(request.body);
  toolName = body.tools.filter(function(tool) {
    return tool.type === 'function' && tool.name.indexOf('pebble_plugin_') === 0;
  })[0].name;
  request.respond(200, {
    output: [{ type: 'function_call', call_id: 'cancel-plugin-call', name: toolName, arguments: '{}' }]
  });
  assert.equal(pebble.pluginSubscriptions.length, 1, 'tool call starts plugin source subscription');
  subscription = pebble.pluginSubscriptions[0];

  pebble.emit('appmessage', { payload: { RequestCancel: 1, RequestId: 34 } });
  assert.equal(subscription.unsubscribed, true, 'watch cancellation immediately unsubscribes source');
  messagesAfterCancel = pebble.messages.length;
  subscription.request.onData({
    pluginUuid: uuid,
    validUntilMs: Date.now() + 60000,
    instances: [{ instanceId: 'home', properties: { temperature: { numericValue: { value: 21, unit: 'C' } } } }]
  });

  assert.equal(FakeXMLHttpRequest.instances.length, 1, 'late source data does not trigger model follow-up request');
  assert.equal(pebble.messages.length, messagesAfterCancel, 'late source data does not deliver a watch response');
});

test('unselected plugin sources are not exposed when tool budget is available', function() {
  var uuid = '12345678-1234-4234-8234-123456789abc';
  var harness = createBundleHarness({
    llm_thing_settings: JSON.stringify({
      Endpoint: 'https://offline.invalid/v1/responses',
      ApiKey: 'offline-key',
      Model: 'offline-model',
      MaxToolCalls: 4,
      PluginSourcesJson: '[]'
    })
  }, true, { plugins: [{
    uuid: uuid,
    name: 'Weather',
    sources: [{ category: 'weather', items: ['location'], properties: { temperature: ['numericValue'] } }]
  }] });
  var pebble = harness.pebble;
  var request;
  var body;

  pebble.emit('ready');
  flushManualSends(pebble);
  pebble.emit('appmessage', { payload: { RequestId: 32, RequestText: 'weather?' } });
  request = FakeXMLHttpRequest.last();
  body = JSON.parse(request.body);
  assert.equal((body.tools || []).some(function(tool) {
    return typeof tool.name === 'string' && tool.name.indexOf('pebble_plugin_') === 0;
  }), false);
  assert.equal(pebble.pluginSubscriptions.length, 0);
});

test('zero tool budget blocks explicitly selected plugin sources', function() {
  var uuid = '12345678-1234-4234-8234-123456789abc';
  var harness = createBundleHarness({
    llm_thing_settings: JSON.stringify({
      Endpoint: 'https://offline.invalid/v1/responses',
      ApiKey: 'offline-key',
      Model: 'offline-model',
      MaxToolCalls: 0,
      PluginSourcesJson: JSON.stringify([{ plugin: uuid, category: 'weather', item: 'location' }])
    })
  }, true, { plugins: [{
    uuid: uuid,
    name: 'Weather',
    sources: [{ category: 'weather', items: ['location'], properties: { temperature: ['numericValue'] } }]
  }] });
  var pebble = harness.pebble;
  var request;
  var body;

  pebble.emit('ready');
  flushManualSends(pebble);
  pebble.emit('appmessage', { payload: { RequestId: 33, RequestText: 'weather?' } });
  request = FakeXMLHttpRequest.last();
  body = JSON.parse(request.body);
  assert.equal((body.tools || []).some(function(tool) {
    return typeof tool.name === 'string' && tool.name.indexOf('pebble_plugin_') === 0;
  }), false);
  assert.equal(pebble.pluginSubscriptions.length, 0);
});

test('built PebbleKit bundle syncs stored Response Sound setting on ready', function() {
  var harness = createBundleHarness({
    llm_thing_settings: JSON.stringify({ SpeakerFeedbackEnabled: true })
  });

  harness.pebble.emit('ready');

  assert.equal(harness.pebble.messages[0].SpeakerFeedbackEnabled, 1);
});

test('built PebbleKit bundle normalizes and persists Response Sound webview changes', function() {
  var harness = createBundleHarness();
  var pebble = harness.pebble;
  var stored;

  pebble.emit('ready');
  pebble.emit('webviewclosed', {
    response: JSON.stringify({ SpeakerFeedbackEnabled: { value: '1' } })
  });
  stored = JSON.parse(harness.localStorage.getItem('llm_thing_settings'));
  assert.equal(stored.SpeakerFeedbackEnabled, true);
  assert.equal(pebble.messages[pebble.messages.length - 1].SpeakerFeedbackEnabled, 1);

  pebble.emit('webviewclosed', {
    response: JSON.stringify({ SpeakerFeedbackEnabled: { value: '0' } })
  });
  stored = JSON.parse(harness.localStorage.getItem('llm_thing_settings'));
  assert.equal(stored.SpeakerFeedbackEnabled, false);
  assert.equal(pebble.messages[pebble.messages.length - 1].SpeakerFeedbackEnabled, 0);
});

test('loading saved chat cancels pending model error delivery and replaces history', function() {
  var endpoint = 'https://offline.invalid/v1/responses';
  var harness = createBundleHarness({
    llm_thing_settings: JSON.stringify({
      Endpoint: endpoint,
      ApiKey: 'offline-key',
      Model: 'offline-model',
      PreserveChats: true,
      MaxToolCalls: 0
    }),
    llm_thing_saved_chats_v1: savedChatsFixture()
  }, true);
  var pebble = harness.pebble;
  var request;
  var body;
  var transcript;
  var messagesBeforeLoad;
  var loadedMessages;
  var nextRequest;
  var nextBody;

  pebble.emit('ready');
  flushManualSends(pebble);

  pebble.emit('appmessage', { payload: { PastChatLoad: 'old-fixture' } });
  flushManualSends(pebble);

  pebble.emit('appmessage', { payload: { RequestId: 1, RequestText: 'waiting for model response' } });
  assert.equal(FakeXMLHttpRequest.instances.length, 1, 'request reaches bundled XHR adapter');
  request = FakeXMLHttpRequest.last();
  assert.equal(request.url, endpoint);
  body = JSON.parse(request.body);
  body = JSON.stringify(body.input);
  assert.ok(body.indexOf('old loaded user history') !== -1, 'in-flight request starts with old saved history');
  assert.ok(body.indexOf('waiting for model response') !== -1, 'in-flight request includes its prompt');
  flushManualSends(pebble);

  request.respond(401, { error: { message: 'offline unauthorized' } });
  assert.ok(pebble.pendingSendCount() > 0, 'model error awaits AppMessage delivery');

  messagesBeforeLoad = pebble.messages.length;
  pebble.emit('appmessage', { payload: { PastChatLoad: 'saved-fixture' } });
  flushManualSends(pebble);

  assert.equal(pebble.messages.some(function(message) {
    return message.ResponseError !== undefined && Number(message.RequestId) === 1;
  }), false, 'cancelled model error never arrives after saved-chat load');
  loadedMessages = pebble.messages.slice(messagesBeforeLoad);
  transcript = loadedMessages.filter(function(message) {
    return message.PastChatTextChunk !== undefined;
  }).map(function(message) {
    return message.PastChatTextChunk;
  }).join('');
  assert.ok(transcript.indexOf('loaded user history') !== -1, 'saved user message delivered');
  assert.ok(transcript.indexOf('loaded assistant history') !== -1, 'saved assistant message delivered');
  assert.ok(pebble.messages.some(function(message) { return message.PastChatTextDone === 1; }), 'saved transcript completed');

  pebble.emit('appmessage', { payload: { RequestId: 2, RequestText: 'prompt two' } });
  assert.equal(FakeXMLHttpRequest.instances.length, 2, 'next prompt reaches bundled XHR adapter');
  nextRequest = FakeXMLHttpRequest.last();
  nextBody = JSON.parse(nextRequest.body);
  body = JSON.stringify(nextBody.input);
  assert.ok(body.indexOf('loaded user history') !== -1, 'next request includes loaded user history');
  assert.ok(body.indexOf('loaded assistant history') !== -1, 'next request includes loaded assistant history');
  assert.ok(body.indexOf('prompt two') !== -1, 'next request includes new prompt');
  assert.equal(body.indexOf('old loaded user history'), -1, 'old chat history was replaced');
  assert.equal(body.indexOf('old loaded assistant history'), -1, 'old assistant history was replaced');
  assert.equal(body.indexOf('waiting for model response'), -1, 'failed request prompt was not added to new history');
});

test('live bundle response formats large thinking and bold text within font-size budget', function() {
  var endpoint = 'https://offline.invalid/v1/responses';
  var promptControls = '\u0003\u0004';
  var rawControls = '\u0001\u0002\u0003\u0004\u0005\u0006';
  var thinking = 'analysis ' + new Array(31).join('thought ');
  var answer = '**' + rawControls + new Array(401).join('\ud83d\ude00bold text ') + '**';
  var harness = createBundleHarness({
    llm_thing_settings: JSON.stringify({
      Endpoint: endpoint,
      ApiKey: 'offline-key',
      Model: 'offline-model',
      MaxToolCalls: 0,
      ShowThinking: true,
      FontSize: 28
    })
  }, true);
  var pebble = harness.pebble;
  var prompt = 'question ' + promptControls;
  var request;
  var requestBody;
  var chunks;
  var reconstructed;
  var noticeIndex;
  var styles;
  var i;

  pebble.emit('ready');
  flushManualSends(pebble);
  pebble.emit('appmessage', { payload: { RequestId: 7, RequestText: prompt } });
  assert.equal(FakeXMLHttpRequest.instances.length, 1, 'live request uses fake XHR');
  request = FakeXMLHttpRequest.last();
  requestBody = JSON.parse(request.body);
  assert.ok(collectStringValues(requestBody.input).indexOf(promptControls) !== -1, 'input prompt control markers reach model request');
  flushManualSends(pebble);

  request.respond(200, {
    output_text: answer,
    output: [{ type: 'reasoning', summary: [{ text: thinking }] }]
  });
  flushManualSends(pebble);

  chunks = pebble.messages.filter(function(message) {
    return message.ResponseChunk !== undefined;
  }).map(function(message) {
    return message.ResponseChunk;
  });
  reconstructed = chunks.join('');
  assert.ok(chunks.length > 1, 'response is delivered in chunks');
  chunks.forEach(function(chunk) {
    assert.ok(Buffer.byteLength(chunk, 'utf8') <= 400, 'chunk stays within AppMessage byte limit');
    assert.equal(hasUnpairedSurrogate(chunk), false, 'chunk contains no unpaired surrogate');
    assert.equal(/[\ud800-\udbff]$/.test(chunk), false, 'chunk does not end with high surrogate');
    assert.equal(/^[\udc00-\udfff]/.test(chunk), false, 'chunk does not start with low surrogate');
  });
  assert.ok(reconstructed.length <= 2400, 'FontSize 28 response respects character budget');
  assert.ok(reconstructed.indexOf('\n\n[Truncated]') !== -1, 'truncation notice is present');
  assert.equal(/[\u0003\u0004]/.test(reconstructed), false, 'raw prompt markers do not leak into display output');
  assert.ok(reconstructed.indexOf('\u0001') !== -1 && reconstructed.indexOf('\u0002') !== -1, 'formatted bold markers remain');
  assert.ok(reconstructed.indexOf('\u0005') !== -1 && reconstructed.indexOf('\u0006') !== -1, 'thinking style markers remain balanced');
  assert.ok(pebble.messages.some(function(message) {
    return message.ResponseDone === 1 && Number(message.RequestId) === 7;
  }), 'formatted response transfer completes');

  noticeIndex = reconstructed.indexOf('\n\n[Truncated]');
  styles = { bold: false, small: false, prompt: false };
  for (i = 0; i < noticeIndex; i += 1) {
    if (reconstructed.charAt(i) === '\u0001') {
      styles.bold = true;
    } else if (reconstructed.charAt(i) === '\u0002') {
      styles.bold = false;
    } else if (reconstructed.charAt(i) === '\u0003') {
      styles.prompt = true;
    } else if (reconstructed.charAt(i) === '\u0004') {
      styles.prompt = false;
    } else if (reconstructed.charAt(i) === '\u0005') {
      styles.small = true;
    } else if (reconstructed.charAt(i) === '\u0006') {
      styles.small = false;
    }
  }
  assert.deepEqual(styles, { bold: false, small: false, prompt: false }, 'truncation notice follows all style closers');
  assert.equal(reconstructed.substring(noticeIndex), '\n\n[Truncated]', 'truncation notice remains plain text at response end');
});
