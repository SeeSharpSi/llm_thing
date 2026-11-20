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
  var timers = pluginOptions && pluginOptions.timers;
  var sandbox = {
    Pebble: pebble,
    localStorage: localStorage,
    XMLHttpRequest: FakeXMLHttpRequest,
    navigator: {},
    console: { log: function() {}, error: function() {}, warn: function() {} },
    setTimeout: timers ? timers.setTimeout : setTimeout,
    clearTimeout: timers ? timers.clearTimeout : clearTimeout,
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
    pebble.actionInvocations = [];
    pebble.invokeAction = function(request) {
      var invocation = { plugin: request.plugin, action: request.action, args: request.args };
      var resolveResult;
      var rejectResult;
      var pending = {
        request: invocation,
        resolve: function(value) { if (resolveResult) { resolveResult(value); } },
        reject: function(error) { if (rejectResult) { rejectResult(error); } }
      };
      pebble.actionInvocations.push(pending);
      return {
        then: function(resolve, reject) {
          resolveResult = resolve;
          rejectResult = reject;
          return this;
        },
        catch: function(reject) {
          rejectResult = reject;
          return this;
        }
      };
    };
  }
  vm.runInNewContext(source, sandbox, { filename: 'build/pebble-js-app.js' });

  return {
    pebble: pebble,
    localStorage: localStorage,
    timers: timers
  };
}

function createManualTimers() {
  var scheduled = [];
  var nextId = 1;

  return {
    setTimeout: function(callback, delay) {
      var timer = { id: nextId, callback: callback, delay: delay, cleared: false };
      nextId += 1;
      scheduled.push(timer);
      return timer.id;
    },
    clearTimeout: function(id) {
      scheduled.forEach(function(timer) { if (timer.id === id) { timer.cleared = true; } });
    },
    activeDelays: function() {
      return scheduled.filter(function(timer) { return !timer.cleared; }).map(function(timer) { return timer.delay; });
    },
    runDelay: function(delay) {
      var timer = scheduled.filter(function(candidate) {
        return !candidate.cleared && candidate.delay === delay;
      })[0];
      if (timer) {
        timer.cleared = true;
        timer.callback();
        return true;
      }
      return false;
    }
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

function pluginAction(uuid, name, parameters, description) {
  return {
    uuid: uuid,
    name: 'Action test plugin',
    actions: [{ name: name, description: description || name, parameters: parameters }]
  };
}

function beginPluginActionCall(pebble, requestId, args) {
  var request;
  var body;
  var tools;

  pebble.emit('appmessage', { payload: { RequestId: requestId, RequestText: 'Run plugin action' } });
  request = FakeXMLHttpRequest.last();
  body = JSON.parse(request.body);
  tools = (body.tools || []).filter(function(tool) {
    return tool.type === 'function' && tool.name.indexOf('pebble_plugin_action_') === 0;
  });
  return { request: request, body: body, tools: tools, args: args };
}

function respondWithActionCall(request, tool, args, callId) {
  request.respond(200, {
    output: [{
      type: 'function_call',
      call_id: callId,
      name: tool.name,
      arguments: JSON.stringify(args)
    }]
  });
}

function actionApprovalMessage(pebble, requestId) {
  return pebble.messages.filter(function(message) {
    return message.ApprovalRequest === 1 && Number(message.RequestId) === requestId;
  }).slice(-1)[0];
}

function emitActionApproval(pebble, requestId, approvalId, decision) {
  pebble.emit('appmessage', { payload: {
    RequestId: requestId,
    ApprovalId: approvalId,
    ApprovalDecision: decision
  } });
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

test('foreground model discovery falls back while a warmed MCP server is still initializing', function() {
  var endpoint = 'https://offline.invalid/v1/responses';
  var timers = createManualTimers();
  var harness = createBundleHarness({
    llm_thing_settings: JSON.stringify({
      Endpoint: endpoint,
      ApiKey: 'offline-key',
      Model: 'offline-model',
      MaxToolCalls: 2,
      SleepToolEnabled: true,
      McpDiscoveryTimeoutMs: 7500,
      McpServersJson: JSON.stringify([{ enabled: true, label: 'Slow', url: 'https://slow.invalid/mcp' }])
    })
  }, true, { timers: timers });
  var pebble = harness.pebble;
  var initializeRequest;
  var modelRequest;
  var body;
  var progress;
  var responseText;

  pebble.emit('ready');
  flushManualSends(pebble);
  assert.equal(FakeXMLHttpRequest.instances.length, 1, 'ready starts MCP warm-up');
  initializeRequest = FakeXMLHttpRequest.last();
  assert.equal(initializeRequest.url, 'https://slow.invalid/mcp');
  assert.equal(JSON.parse(initializeRequest.body).method, 'initialize');

  pebble.emit('appmessage', { payload: { RequestId: 151, RequestText: 'What time is it?' } });
  assert.deepEqual(timers.activeDelays(), [30000, 7500], 'background warm-up timeout and saved foreground deadline are active');
  assert.equal(timers.activeDelays().indexOf(3000), -1, 'default foreground discovery timeout is not active');
  assert.equal(FakeXMLHttpRequest.instances.length, 1, 'provider waits for foreground discovery deadline');
  assert.equal(timers.runDelay(7500), true, 'saved foreground discovery deadline fires');

  modelRequest = FakeXMLHttpRequest.last();
  assert.notEqual(modelRequest, initializeRequest, 'provider request starts while MCP initialize remains pending');
  assert.equal(modelRequest.url, endpoint);
  body = JSON.parse(modelRequest.body);
  assert.ok(body.tools.some(function(tool) { return tool.name === 'sleep'; }), 'built-in sleep tool remains available');
  assert.equal(body.tools.some(function(tool) { return tool.name.indexOf('slow__') === 0; }), false,
    'unavailable MCP tools are omitted');

  flushManualSends(pebble);
  progress = pebble.messages.filter(function(message) {
    return message.ProgressDetail && Number(message.RequestId) === 151;
  });
  assert.ok(progress.some(function(message) { return /MCP unavailable: Slow/.test(message.ProgressDetail); }),
    'watch receives MCP unavailability detail during first model request');

  modelRequest.respond(200, { output_text: 'It is noon.' });
  flushManualSends(pebble);
  responseText = pebble.messages.filter(function(message) { return message.ResponseChunk !== undefined; })
    .map(function(message) { return message.ResponseChunk; }).join('');
  assert.match(responseText, /It is noon/);
  assert.ok(pebble.messages.some(function(message) {
    return message.ResponseDone === 1 && Number(message.RequestId) === 151;
  }), 'final answer is delivered to watch');
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
  assert.equal(pebble.messages.some(function(message) { return message.ApprovalRequest === 1; }), false,
    'read-only plugin source never asks for action approval');
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

test('plugin action catalogue reaches settings for action-only plugins without invocation', function() {
  var uuid = '22345678-1234-4234-8234-123456789abc';
  var plugin = pluginAction(uuid, 'set_switch', {
    type: 'object',
    properties: { on: { type: 'boolean' } },
    required: ['on']
  });
  var harness = createBundleHarness({}, false, { plugins: [plugin] });
  var pebble = harness.pebble;
  var html;

  pebble.emit('showConfiguration');
  html = decodeURIComponent(pebble.openedUrls[0].split(',').slice(1).join(','));

  assert.match(html, /plugin_actions/);
  assert.match(html, /catalogueEncoded/);
  assert.ok(html.indexOf(uuid) !== -1, 'action-only plugin appears in encoded catalogue');
  assert.equal(pebble.actionInvocations.length, 0, 'settings discovery never invokes native action');
});

test('selected plugin action alone is exposed and false/zero arguments reach native action', function() {
  var uuid = '32345678-1234-4234-8234-123456789abc';
  var plugin = {
    uuid: uuid,
    name: 'Actions and source',
    sources: [{ category: 'weather', items: ['location'], properties: { temperature: ['numericValue'] } }],
    actions: [
      { name: 'set_switch', description: 'Set switch', parameters: {
        type: 'object', properties: { on: { type: 'boolean' }, offset: { type: 'integer' } },
        required: ['on', 'offset'], additionalProperties: false
      } },
      { name: 'delete_switch', description: 'Delete switch', parameters: {
        type: 'object', properties: { instanceId: { type: 'string' } },
        required: ['instanceId'], additionalProperties: false
      } }
    ]
  };
  var harness = createBundleHarness({
    llm_thing_settings: JSON.stringify({
      Endpoint: 'https://offline.invalid/v1/responses', ApiKey: 'offline-key', Model: 'offline-model',
      MaxToolCalls: 2,
      PluginActionsJson: JSON.stringify([{ plugin: uuid, action: 'set_switch' }]),
      PluginSourcesJson: JSON.stringify([{ plugin: uuid, category: 'weather', item: 'location' }])
    })
  }, true, { plugins: [plugin] });
  var pebble = harness.pebble;
  var actionTools;
  var actionCall;
  var invocation;
  var followUp;
  var followUpBody;
  var outputs;
  var envelope;
  var answer;

  pebble.emit('ready');
  flushManualSends(pebble);
  actionCall = beginPluginActionCall(pebble, 41, { on: false, offset: 0 });
  actionTools = actionCall.tools;
  assert.equal(actionTools.length, 1, 'only selected plugin action is exposed');
  assert.equal(JSON.stringify(actionCall.body.tools).indexOf('delete_switch'), -1, 'unselected action is absent');
  assert.ok(actionCall.body.tools.some(function(tool) {
    return tool.type === 'function' && tool.name.indexOf('pebble_plugin_') === 0 &&
      tool.name.indexOf('pebble_plugin_action_') !== 0;
  }), 'source selection remains independently enabled');

  respondWithActionCall(actionCall.request, actionTools[0], { on: false, offset: 0 }, 'action-call');
  assert.equal(pebble.actionInvocations.length, 1, 'one native action invocation');
  invocation = pebble.actionInvocations[0];
  assert.equal(invocation.request.plugin, uuid);
  assert.equal(invocation.request.action, 'set_switch');
  assert.equal(JSON.stringify(invocation.request.args), JSON.stringify({ on: false, offset: 0 }),
    'boolean false and integer zero are preserved');
  invocation.resolve({ ok: true, text: 'Switch set', refreshed: ['switches'] });

  followUp = FakeXMLHttpRequest.last();
  followUpBody = JSON.parse(followUp.body);
  outputs = followUpBody.input.filter(function(item) { return item.type === 'function_call_output'; });
  assert.equal(outputs.length, 1);
  envelope = JSON.parse(outputs[0].output);
  assert.ok(envelope.result && typeof envelope.result === 'object', 'native result retains model wrapper');
  assert.equal(envelope.result.ok, true);
  assert.equal(envelope.result.pluginUuid, uuid);
  assert.equal(envelope.result.action, 'set_switch');
  assert.equal(envelope.result.text, 'Switch set');
  assert.equal(JSON.stringify(envelope.result.refreshed), JSON.stringify(['switches']));

  followUp.respond(200, { output_text: 'Switch is off.' });
  flushManualSends(pebble);
  answer = pebble.messages.filter(function(message) { return message.ResponseChunk !== undefined; })
    .map(function(message) { return message.ResponseChunk; }).join('');
  assert.match(answer, /Switch is off/);
  assert.ok(pebble.messages.some(function(message) { return message.ResponseDone === 1; }));
});

test('confirmed action waits for exact watch approval, ignores malformed decisions, and delivers result', function() {
  var uuid = '34345678-1234-4234-8234-123456789abc';
  var plugin = {
    uuid: uuid,
    name: 'Living Lights',
    actions: [{ name: 'set_light', description: 'Set a light', parameters: {
      type: 'object', properties: {
        item: { type: 'string', enum: ['light'] },
        instanceId: { type: 'string' },
        on: { type: 'boolean' },
        fadeMs: { type: 'integer', minimum: 0 }
      }, required: ['item', 'instanceId', 'on', 'fadeMs'], additionalProperties: false
    } }]
  };
  var args = { item: 'light', instanceId: 'living-room', on: false, fadeMs: 0 };
  var timers = createManualTimers();
  var harness = createBundleHarness({
    llm_thing_settings: JSON.stringify({
      Endpoint: 'https://offline.invalid/v1/responses', ApiKey: 'offline-key', Model: 'offline-model',
      MaxToolCalls: 2,
      PluginActionsJson: JSON.stringify([{ plugin: uuid, action: 'set_light', confirm: true }])
    })
  }, true, { plugins: [plugin], timers: timers });
  var pebble = harness.pebble;
  var call;
  var approval;
  var invocation;
  var followUp;
  var followUpBody;
  var outputs;
  var envelope;
  var answer;
  var promptOccurrences;

  pebble.emit('ready');
  flushManualSends(pebble);
  call = beginPluginActionCall(pebble, 101, args);
  respondWithActionCall(call.request, call.tools[0], args, 'confirmed-light');
  flushManualSends(pebble);
  approval = actionApprovalMessage(pebble, 101);
  assert.ok(approval, 'watch receives actual approval AppMessage');
  assert.equal(approval.ApprovalTitle, 'Confirm action');
  assert.ok(Number.isInteger(approval.ApprovalId) && approval.ApprovalId > 0 && approval.ApprovalId <= 0xffffffff,
    'watch approval carries positive uint32 ID');
  assert.ok(Buffer.byteLength(approval.ApprovalDetail, 'utf8') <= 600, 'approval detail stays within UTF-8 byte bound');
  assert.ok(approval.ApprovalDetail.indexOf(uuid) !== -1, 'approval shows complete plugin UUID');
  assert.ok(approval.ApprovalDetail.indexOf('Living Lights') !== -1, 'approval shows plugin name');
  assert.ok(approval.ApprovalDetail.indexOf('set_light') !== -1, 'approval shows exact action name');
  assert.match(approval.ApprovalDetail, /Arguments:\nitem: light\ninstanceId: living-room\non: false\nfadeMs: 0\n/);
  assert.equal(approval.ApprovalDetail.indexOf(JSON.stringify(args)), -1, 'approval does not show raw JSON arguments');
  assert.equal(pebble.actionInvocations.length, 0, 'confirmation blocks native invocation');
  assert.ok(timers.activeDelays().indexOf(60000) !== -1, 'approval waits with bounded 60-second timeout');

  pebble.emit('appmessage', { payload: { ApprovalId: approval.ApprovalId, ApprovalDecision: 1 } });
  pebble.emit('appmessage', { payload: { RequestId: 100, ApprovalId: approval.ApprovalId, ApprovalDecision: 1 } });
  pebble.emit('appmessage', { payload: { RequestId: 101, ApprovalId: approval.ApprovalId + 1, ApprovalDecision: 1 } });
  pebble.emit('appmessage', { payload: { RequestId: 101, ApprovalId: approval.ApprovalId, ApprovalDecision: '1' } });
  assert.equal(pebble.actionInvocations.length, 0, 'missing/stale/wrong-ID/string decisions are ignored');
  assert.equal(FakeXMLHttpRequest.instances.length, 1, 'malformed decisions do not replay prompt to model');

  emitActionApproval(pebble, 101, approval.ApprovalId, 1);
  assert.equal(pebble.actionInvocations.length, 1, 'valid numeric allow invokes exactly once');
  invocation = pebble.actionInvocations[0];
  assert.equal(invocation.request.plugin, uuid);
  assert.equal(invocation.request.action, 'set_light');
  assert.equal(JSON.stringify(invocation.request.args), JSON.stringify(args), 'invocation uses approved argument snapshot');
  assert.ok(timers.activeDelays().indexOf(30000) !== -1, 'native timeout starts only after approval');
  assert.ok(pebble.messages.some(function(message) {
    return message.ApprovalCancel === 1 && Number(message.RequestId) === 101 && message.ApprovalId === approval.ApprovalId;
  }), 'allow closes the watch approval prompt by ID');
  emitActionApproval(pebble, 101, approval.ApprovalId, 1);
  assert.equal(pebble.actionInvocations.length, 1, 'duplicate allow cannot invoke twice');
  invocation.resolve({ ok: true, text: 'Living room light is off', refreshed: ['lights'] });

  followUp = FakeXMLHttpRequest.last();
  followUpBody = JSON.parse(followUp.body);
  promptOccurrences = collectStringValues(followUpBody.input).split('Run plugin action').length - 1;
  assert.equal(promptOccurrences, 1, 'approval decisions do not replay original request text');
  outputs = followUpBody.input.filter(function(item) { return item.type === 'function_call_output'; });
  assert.equal(outputs.length, 1);
  envelope = JSON.parse(outputs[0].output);
  assert.equal(envelope.result.pluginUuid, uuid);
  assert.equal(envelope.result.action, 'set_light');
  assert.equal(envelope.result.text, 'Living room light is off');
  assert.equal(JSON.stringify(envelope.result.refreshed), JSON.stringify(['lights']));
  followUp.respond(200, { output_text: 'Living room light is off.' });
  flushManualSends(pebble);
  answer = pebble.messages.filter(function(message) { return message.ResponseChunk !== undefined; })
    .map(function(message) { return message.ResponseChunk; }).join('');
  assert.match(answer, /Living room light is off/);
  assert.ok(pebble.messages.some(function(message) { return message.ResponseDone === 1; }));
});

test('approval denial returns not-run result without native invocation or repeat prompt', function() {
  var uuid = '35345678-1234-4234-8234-123456789abc';
  var args = { on: true };
  var harness = createBundleHarness({
    llm_thing_settings: JSON.stringify({
      Endpoint: 'https://offline.invalid/v1/responses', ApiKey: 'offline-key', Model: 'offline-model',
      MaxToolCalls: 2,
      PluginActionsJson: JSON.stringify([{ plugin: uuid, action: 'turn_on', confirm: true }])
    })
  }, true, { plugins: [pluginAction(uuid, 'turn_on', {
    type: 'object', properties: { on: { type: 'boolean' } }, required: ['on']
  })] });
  var pebble = harness.pebble;
  var call;
  var approval;
  var deniedFollowUp;
  var secondFollowUp;
  var body;
  var outputs;
  var approvalCount;

  pebble.emit('ready');
  flushManualSends(pebble);
  call = beginPluginActionCall(pebble, 111, args);
  respondWithActionCall(call.request, call.tools[0], args, 'deny-once');
  flushManualSends(pebble);
  approval = actionApprovalMessage(pebble, 111);
  assert.ok(approval);
  emitActionApproval(pebble, 111, approval.ApprovalId, 0);
  deniedFollowUp = FakeXMLHttpRequest.last();
  assert.equal(pebble.actionInvocations.length, 0, 'numeric deny never invokes action');
  body = JSON.parse(deniedFollowUp.body);
  outputs = body.input.filter(function(entry) { return entry.type === 'function_call_output'; });
  assert.equal(outputs.length, 1);
  assert.match(outputs[0].output, /denied|declined|not run/i, 'model receives denied/not-run result');

  approvalCount = pebble.messages.filter(function(message) { return message.ApprovalRequest === 1; }).length;
  respondWithActionCall(deniedFollowUp, call.tools[0], args, 'deny-repeat');
  secondFollowUp = FakeXMLHttpRequest.last();
  assert.equal(pebble.actionInvocations.length, 0, 'denied action stays blocked for current request');
  assert.equal(pebble.messages.filter(function(message) { return message.ApprovalRequest === 1; }).length, approvalCount,
    'denied action is not prompted again');
  body = JSON.parse(secondFollowUp.body);
  outputs = body.input.filter(function(entry) { return entry.type === 'function_call_output'; });
  assert.ok(outputs.some(function(entry) { return /not run|denied|declined/i.test(entry.output); }));

  secondFollowUp.respond(200, { output_text: 'No changes were made.' });
  flushManualSends(pebble);
  assert.ok(pebble.messages.some(function(message) {
    return message.ResponseChunk !== undefined && /No changes were made/.test(message.ResponseChunk);
  }), 'final answer reaches watch');
});

test('expired confirmation clears approval and late allow cannot invoke action', function() {
  var uuid = '36345678-1234-4234-8234-123456789abc';
  var args = { on: false };
  var timers = createManualTimers();
  var harness = createBundleHarness({
    llm_thing_settings: JSON.stringify({
      Endpoint: 'https://offline.invalid/v1/responses', ApiKey: 'offline-key', Model: 'offline-model',
      MaxToolCalls: 1,
      PluginActionsJson: JSON.stringify([{ plugin: uuid, action: 'turn_off', confirm: true }])
    })
  }, true, { plugins: [pluginAction(uuid, 'turn_off', {
    type: 'object', properties: { on: { type: 'boolean' } }, required: ['on']
  })], timers: timers });
  var pebble = harness.pebble;
  var call;
  var approval;
  var requestCount;

  pebble.emit('ready');
  flushManualSends(pebble);
  call = beginPluginActionCall(pebble, 121, args);
  respondWithActionCall(call.request, call.tools[0], args, 'expired-confirmation');
  flushManualSends(pebble);
  approval = actionApprovalMessage(pebble, 121);
  assert.ok(approval);
  assert.equal(timers.runDelay(60000), true, 'approval deadline fires deterministically');
  assert.equal(pebble.actionInvocations.length, 0, 'approval timeout never invokes action');
  assert.ok(pebble.messages.some(function(message) {
    return message.ApprovalCancel === 1 && Number(message.RequestId) === 121 && message.ApprovalId === approval.ApprovalId;
  }), 'timeout closes the stale watch prompt by ID');
  assert.equal(FakeXMLHttpRequest.instances.length, 2, 'timeout returns not-run result to model');
  assert.ok(JSON.parse(FakeXMLHttpRequest.last().body).input.some(function(entry) {
    return entry.type === 'function_call_output' && /timed out|not run/i.test(entry.output);
  }), 'model receives timeout/not-run result');
  requestCount = FakeXMLHttpRequest.instances.length;
  emitActionApproval(pebble, 121, approval.ApprovalId, 1);
  assert.equal(pebble.actionInvocations.length, 0, 'late allow is stale after timeout');
  assert.equal(FakeXMLHttpRequest.instances.length, requestCount, 'late allow starts no provider request');
  assert.equal(timers.activeDelays().indexOf(60000), -1, 'expired approval timer is cleared');
  flushManualSends(pebble);
  assert.equal(pebble.messages.filter(function(message) { return message.ApprovalRequest === 1; }).length, 1,
    'expired approval cannot be requeued as a ghost prompt');
});

test('canceling approval then starting new request ignores late old allow', function() {
  var uuid = '37345678-1234-4234-8234-123456789abc';
  var args = { on: true };
  var harness = createBundleHarness({
    llm_thing_settings: JSON.stringify({
      Endpoint: 'https://offline.invalid/v1/responses', ApiKey: 'offline-key', Model: 'offline-model',
      MaxToolCalls: 1,
      PluginActionsJson: JSON.stringify([{ plugin: uuid, action: 'turn_on', confirm: true }])
    })
  }, true, { plugins: [pluginAction(uuid, 'turn_on', {
    type: 'object', properties: { on: { type: 'boolean' } }, required: ['on']
  })] });
  var pebble = harness.pebble;
  var call;
  var approval;
  var nextRequest;
  var answer;

  pebble.emit('ready');
  flushManualSends(pebble);
  call = beginPluginActionCall(pebble, 131, args);
  respondWithActionCall(call.request, call.tools[0], args, 'cancel-pending-approval');
  flushManualSends(pebble);
  approval = actionApprovalMessage(pebble, 131);
  assert.ok(approval);
  pebble.emit('appmessage', { payload: { RequestCancel: 1, RequestId: 131 } });
  assert.ok(pebble.messages.some(function(message) {
    return message.ApprovalCancel === 1 && Number(message.RequestId) === 131 && message.ApprovalId === approval.ApprovalId;
  }), 'request cancellation closes its watch prompt by ID');
  pebble.emit('appmessage', { payload: { RequestId: 132, RequestText: 'new safe prompt' } });
  nextRequest = FakeXMLHttpRequest.last();
  assert.equal(FakeXMLHttpRequest.instances.length, 2, 'new request proceeds independently');
  emitActionApproval(pebble, 131, approval.ApprovalId, 1);
  assert.equal(pebble.actionInvocations.length, 0, 'late approval cannot invoke canceled request action');
  assert.equal(FakeXMLHttpRequest.instances.length, 2, 'old approval does not disrupt current request');
  nextRequest.respond(200, { output_text: 'New request completed.' });
  flushManualSends(pebble);
  answer = pebble.messages.filter(function(message) { return message.ResponseChunk !== undefined; })
    .map(function(message) { return message.ResponseChunk; }).join('');
  assert.match(answer, /New request completed/);
});

test('oversized action confirmation detail fails closed without showing prompt or invoking', function() {
  var uuid = '38345678-1234-4234-8234-123456789abc';
  var args = { payload: new Array(701).join('x') };
  var harness = createBundleHarness({
    llm_thing_settings: JSON.stringify({
      Endpoint: 'https://offline.invalid/v1/responses', ApiKey: 'offline-key', Model: 'offline-model',
      MaxToolCalls: 1,
      PluginActionsJson: JSON.stringify([{ plugin: uuid, action: 'send_payload', confirm: true }])
    })
  }, true, { plugins: [pluginAction(uuid, 'send_payload', {
    type: 'object', properties: { payload: { type: 'string', maxLength: 1000 } },
    required: ['payload'], additionalProperties: false
  })] });
  var pebble = harness.pebble;
  var call;
  var followUp;
  var body;
  var outputs;

  pebble.emit('ready');
  flushManualSends(pebble);
  call = beginPluginActionCall(pebble, 141, args);
  respondWithActionCall(call.request, call.tools[0], args, 'oversized-confirm');
  assert.equal(pebble.messages.some(function(message) { return message.ApprovalRequest === 1; }), false,
    'oversized detail is never shown on watch');
  assert.equal(pebble.actionInvocations.length, 0, 'oversized detail fails closed');
  followUp = FakeXMLHttpRequest.last();
  assert.notEqual(followUp, call.request, 'model receives confirmation-detail error');
  body = JSON.parse(followUp.body);
  outputs = body.input.filter(function(entry) { return entry.type === 'function_call_output'; });
  assert.equal(outputs.length, 1);
  assert.match(outputs[0].output, /approval|confirm|detail|600|large|limit/i);
});

test('plugin source opt-in does not enable any plugin actions', function() {
  var uuid = '33345678-1234-4234-8234-123456789abc';
  var plugin = {
    uuid: uuid,
    name: 'Actions and source',
    sources: [{ category: 'weather', items: ['location'], properties: { temperature: ['numericValue'] } }],
    actions: [{ name: 'set_switch', description: 'Set switch', parameters: {
      type: 'object', properties: { on: { type: 'boolean' } }, required: ['on']
    } }]
  };
  var harness = createBundleHarness({
    llm_thing_settings: JSON.stringify({
      Endpoint: 'https://offline.invalid/v1/responses', ApiKey: 'offline-key', Model: 'offline-model',
      MaxToolCalls: 4,
      PluginActionsJson: '[]',
      PluginSourcesJson: JSON.stringify([{ plugin: uuid, category: 'weather', item: 'location' }])
    })
  }, true, { plugins: [plugin] });
  var pebble = harness.pebble;
  var call;

  pebble.emit('ready');
  flushManualSends(pebble);
  call = beginPluginActionCall(pebble, 42, {});
  assert.equal(call.tools.length, 0, 'source selection cannot implicitly select plugin action');
  assert.equal(pebble.actionInvocations.length, 0);
});

test('action schema rejects Hue enum, missing required, and Todoist conditional arguments before invocation', function() {
  var hueUuid = '42345678-1234-4234-8234-123456789abc';
  var todoUuid = '52345678-1234-4234-8234-123456789abc';
  var hueSchema = {
    type: 'object', properties: {
      item: { type: 'string', enum: ['home_lights', 'room_lights', 'light'] },
      instanceId: { type: 'string' }, on: { type: 'boolean' }
    }, required: ['item', 'instanceId', 'on']
  };
  var todoistSchema = {
    type: 'object', properties: {
      title: { type: 'string', minLength: 1 }, due_iso: { type: 'string', format: 'date-time' },
      timezone: { type: 'string', minLength: 1 }, notify_before_ms: { type: 'integer', minimum: 0 }
    }, required: ['title'],
    allOf: [{ if: { required: ['due_iso'] }, then: { required: ['timezone'] } }],
    additionalProperties: false
  };
  var cases = [
    { plugin: hueUuid, action: 'set_hue', schema: hueSchema,
      args: { item: 'invalid_lights', instanceId: 'living-room', on: false }, pattern: /one of/ },
    { plugin: hueUuid, action: 'set_hue', schema: hueSchema,
      args: { item: 'light', instanceId: 'living-room' }, pattern: /Missing required argument/ },
    { plugin: todoUuid, action: 'create_task', schema: todoistSchema,
      args: { title: 'Water plants', due_iso: '2026-11-08T09:30:00Z' }, pattern: /Missing required argument.*timezone/ }
  ];
  var i;
  var item;
  var plugin;
  var harness;
  var actionCall;
  var tool;
  var followUp;
  var body;
  var outputs;

  for (i = 0; i < cases.length; i += 1) {
    item = cases[i];
    plugin = pluginAction(item.plugin, item.action, item.schema);
    harness = createBundleHarness({
      llm_thing_settings: JSON.stringify({
        Endpoint: 'https://offline.invalid/v1/responses', ApiKey: 'offline-key', Model: 'offline-model',
        MaxToolCalls: 1,
        PluginActionsJson: JSON.stringify([{ plugin: item.plugin, action: item.action }])
      })
    }, true, { plugins: [plugin] });
    harness.pebble.emit('ready');
    flushManualSends(harness.pebble);
    actionCall = beginPluginActionCall(harness.pebble, 50 + i, item.args);
    assert.equal(actionCall.tools.length, 1, 'selected action is offered');
    tool = actionCall.tools[0];
    respondWithActionCall(actionCall.request, tool, item.args, 'invalid-action-' + i);
    assert.equal(harness.pebble.actionInvocations.length, 0, 'invalid arguments never reach native API');

    followUp = FakeXMLHttpRequest.last();
    assert.notEqual(followUp, actionCall.request, 'validation error is sent to model');
    body = JSON.parse(followUp.body);
    outputs = body.input.filter(function(entry) { return entry.type === 'function_call_output'; });
    assert.equal(outputs.length, 1);
    assert.match(outputs[0].output, item.pattern, 'model receives schema validation error');
  }
});

test('zero tool budget blocks selected plugin actions before native invocation', function() {
  var uuid = '62345678-1234-4234-8234-123456789abc';
  var harness = createBundleHarness({
    llm_thing_settings: JSON.stringify({
      Endpoint: 'https://offline.invalid/v1/responses', ApiKey: 'offline-key', Model: 'offline-model',
      MaxToolCalls: 0, PluginActionsJson: JSON.stringify([{ plugin: uuid, action: 'set_switch' }])
    })
  }, true, { plugins: [pluginAction(uuid, 'set_switch', { type: 'object', properties: {} })] });
  var call;

  harness.pebble.emit('ready');
  flushManualSends(harness.pebble);
  call = beginPluginActionCall(harness.pebble, 61, {});
  assert.equal(call.tools.length, 0);
  assert.equal(harness.pebble.actionInvocations.length, 0);
});

test('unknown plugin action failure is not retried and blocks repeated action in same request', function() {
  var uuid = '72345678-1234-4234-8234-123456789abc';
  var args = { enabled: true };
  var harness = createBundleHarness({
    llm_thing_settings: JSON.stringify({
      Endpoint: 'https://offline.invalid/v1/responses', ApiKey: 'offline-key', Model: 'offline-model',
      MaxToolCalls: 2, PluginActionsJson: JSON.stringify([{ plugin: uuid, action: 'enable_device' }])
    })
  }, true, { plugins: [pluginAction(uuid, 'enable_device', {
    type: 'object', properties: { enabled: { type: 'boolean' } }, required: ['enabled']
  })] });
  var pebble = harness.pebble;
  var call;
  var tool;
  var firstFollowUp;
  var secondFollowUp;
  var outputs;
  var body;

  pebble.emit('ready');
  flushManualSends(pebble);
  call = beginPluginActionCall(pebble, 71, args);
  tool = call.tools[0];
  respondWithActionCall(call.request, tool, args, 'unknown-result-1');
  assert.equal(pebble.actionInvocations.length, 1);
  pebble.actionInvocations[0].reject({ code: 'TIMEOUT', message: 'outcome unknown' });
  firstFollowUp = FakeXMLHttpRequest.last();
  assert.equal(FakeXMLHttpRequest.instances.length, 2, 'native failure does not cause automatic provider retry');

  respondWithActionCall(firstFollowUp, tool, args, 'unknown-result-2');
  secondFollowUp = FakeXMLHttpRequest.last();
  assert.equal(FakeXMLHttpRequest.instances.length, 3, 'blocked repeated call returns to model without native retry');
  assert.equal(pebble.actionInvocations.length, 1, 'uncertain action is not invoked twice in same request');
  body = JSON.parse(secondFollowUp.body);
  outputs = body.input.filter(function(entry) { return entry.type === 'function_call_output'; });
  assert.ok(outputs.some(function(entry) { return /unknown|uncertain|already|failed/i.test(entry.output); }),
    'model gets blocked/unknown-outcome explanation');

  secondFollowUp.respond(200, { output_text: 'The action result is unknown.' });
  flushManualSends(pebble);
});

test('canceling in-flight plugin action suppresses callbacks but does not claim action was undone', function() {
  var uuid = '82345678-1234-4234-8234-123456789abc';
  var args = { enabled: true };
  var harness = createBundleHarness({
    llm_thing_settings: JSON.stringify({
      Endpoint: 'https://offline.invalid/v1/responses', ApiKey: 'offline-key', Model: 'offline-model',
      MaxToolCalls: 1, PluginActionsJson: JSON.stringify([{ plugin: uuid, action: 'enable_device' }])
    })
  }, true, { plugins: [pluginAction(uuid, 'enable_device', {
    type: 'object', properties: { enabled: { type: 'boolean' } }, required: ['enabled']
  })] });
  var pebble = harness.pebble;
  var call;
  var afterCancel;

  pebble.emit('ready');
  flushManualSends(pebble);
  call = beginPluginActionCall(pebble, 81, args);
  respondWithActionCall(call.request, call.tools[0], args, 'cancel-action');
  assert.equal(pebble.actionInvocations.length, 1, 'action already entered native API');
  pebble.emit('appmessage', { payload: { RequestCancel: 1, RequestId: 81 } });
  afterCancel = pebble.messages.length;
  pebble.actionInvocations[0].resolve({ ok: true, text: 'Completed', refreshed: [] });

  assert.equal(FakeXMLHttpRequest.instances.length, 1, 'late resolution does not start provider follow-up');
  assert.equal(pebble.messages.length, afterCancel, 'late resolution does not produce watch answer');
  assert.equal(pebble.actionInvocations.length, 1, 'cancellation suppresses callbacks; it does not undo invocation');
});

test('action mutation recovery retry uses final-answer-only request and never reexecutes action', function() {
  var uuid = '92345678-1234-4234-8234-123456789abc';
  var args = { enabled: false };
  var harness = createBundleHarness({
    llm_thing_settings: JSON.stringify({
      Endpoint: 'https://offline.invalid/v1/responses', ApiKey: 'offline-key', Model: 'offline-model',
      MaxToolCalls: 2, PluginActionsJson: JSON.stringify([{ plugin: uuid, action: 'set_device', confirm: true }])
    })
  }, true, { plugins: [pluginAction(uuid, 'set_device', {
    type: 'object', properties: { enabled: { type: 'boolean' } }, required: ['enabled']
  })] });
  var pebble = harness.pebble;
  var call;
  var approval;
  var actionFollowUp;
  var failedResponseMessages;
  var retryRequest;
  var retryBody;
  var responseOutputs;

  pebble.emit('ready');
  flushManualSends(pebble);
  call = beginPluginActionCall(pebble, 91, args);
  respondWithActionCall(call.request, call.tools[0], args, 'retry-action');
  flushManualSends(pebble);
  approval = actionApprovalMessage(pebble, 91);
  assert.ok(approval, 'mutation waits for explicit watch approval');
  emitActionApproval(pebble, 91, approval.ApprovalId, 1);
  assert.equal(pebble.actionInvocations.length, 1);
  pebble.actionInvocations[0].resolve({ ok: true, text: 'Device updated', refreshed: ['devices'] });
  actionFollowUp = FakeXMLHttpRequest.last();
  actionFollowUp.respond(401, 'offline unauthorized');
  flushManualSends(pebble);
  assert.ok(pebble.messages.some(function(message) { return message.RetryAvailable === 1; }),
    'watch receives retry affordance for bounded action result');
  failedResponseMessages = pebble.messages.length;

  pebble.emit('appmessage', { payload: { RequestRetry: 91, RequestId: 92 } });
  retryRequest = FakeXMLHttpRequest.last();
  assert.equal(FakeXMLHttpRequest.instances.length, 3, 'watch retry starts one recovery model request');
  retryBody = JSON.parse(retryRequest.body);
  assert.equal(retryBody.tools, undefined, 'recovery request cannot execute tools');
  responseOutputs = retryBody.input.filter(function(entry) { return entry.type === 'function_call_output'; });
  assert.ok(responseOutputs.length > 0, 'completed action result remains in recovery context');
  assert.match(responseOutputs[0].output, /Device updated/);
  assert.equal(pebble.actionInvocations.length, 1, 'retry does not invoke completed action again');

  retryRequest.respond(200, { output_text: 'The device was updated.' });
  flushManualSends(pebble);
  assert.ok(pebble.messages.slice(failedResponseMessages).some(function(message) {
    return message.ResponseChunk !== undefined && /device was updated/i.test(message.ResponseChunk);
  }), 'recovery answer is delivered to watch');
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
