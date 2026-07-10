'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var path = require('node:path');
var common = require('../../src/pkjs/settings');
var FakeXMLHttpRequest = require('./helpers/fake_xhr');
var load = require('./helpers/load_with_stubs');

var modelPath = path.resolve(__dirname, '../../src/pkjs/model');

function createHarness(overrides) {
  overrides = overrides || {};
  FakeXMLHttpRequest.reset();
  global.XMLHttpRequest = FakeXMLHttpRequest;

  var settings = common.extend(common.DEFAULT_SETTINGS, {
    Endpoint: 'https://api.example.test/v1/responses',
    ApiKey: 'test-key',
    Model: 'test-model',
    MaxToolCalls: 0
  });
  Object.keys(overrides.settings || {}).forEach(function(key) {
    settings[key] = overrides.settings[key];
  });

  var commonStub = {};
  Object.keys(common).forEach(function(key) { commonStub[key] = common[key]; });
  commonStub.loadSettings = function() { return settings; };
  commonStub.logDebug = function() {};

  var currentRequest = 0;
  var watch = {
    errors: [],
    responses: [],
    progress: [],
    beginRequestLifecycle: function(id) { currentRequest = id; },
    finishRequestLifecycle: function() {},
    isCurrentRequest: function(id) { return id === currentRequest; },
    trackXhr: function(id) { return id === currentRequest; },
    untrackXhr: function() {},
    syncWatchSettings: function() {},
    progressStart: function() {},
    progressSet: function(id, title, detail) { watch.progress.push([title, detail]); },
    progressDone: function() {},
    progressToolStart: function() {},
    progressSetContextSizes: function() {},
    sendError: function(id, message) { watch.errors.push(message); },
    sendResponse: function(id, currentSettings, text, callback) {
      watch.responses.push(text);
      if (callback) {
        callback();
      }
    }
  };

  var tools = overrides.tools || {
    discoverPhoneTools: function(currentSettings, id, callback) { callback(null, [], {}); },
    runToolCalls: function(id, calls, map, callback) { callback([]); },
    formatToolCallLabel: function(call) { return call.name || 'tool'; }
  };
  var chatStore = overrides.chatStore || {
    saved: [],
    listChats: function() { return []; },
    getChat: function() { return null; },
    deleteChat: function() { return false; },
    deleteAllChats: function() {},
    saveChatHistory: function(id, messages) {
      this.saved.push(messages);
      return { id: id || 'saved-1', title: 'Saved' };
    }
  };

  var model = load.loadWithStubs(modelPath, {
    './settings': commonStub,
    './watch': watch,
    './tools': tools,
    './chat_store': chatStore
  });

  return { model: model, settings: settings, watch: watch, tools: tools, chatStore: chatStore };
}

test.afterEach(function() {
  delete global.XMLHttpRequest;
  load.clearModule(modelPath);
});

test('Responses request uses input shape, timeout, auth, and parsed output', function() {
  var harness = createHarness();

  harness.model.requestCompletion(1, 'Hello');
  var request = FakeXMLHttpRequest.last();
  var body = JSON.parse(request.body);

  assert.equal(request.method, 'POST');
  assert.equal(request.url, harness.settings.Endpoint);
  assert.equal(request.timeout, 60000);
  assert.equal(request.headers.Authorization, 'Bearer test-key');
  assert.equal(body.model, 'test-model');
  assert.deepEqual(body.input.map(function(message) { return message.role; }), ['system', 'user']);
  assert.equal(body.messages, undefined);

  request.respond(200, { output_text: 'Watch answer' });
  assert.deepEqual(harness.watch.responses, ['Watch answer']);
});

test('Chat Completions endpoint uses messages and never requests reasoning summary', function() {
  var harness = createHarness({ settings: {
    Endpoint: 'https://api.example.test/v1/chat/completions',
    ShowThinking: true,
    RequestTimeoutMs: 12345
  } });

  harness.model.requestCompletion(2, 'Hello');
  var request = FakeXMLHttpRequest.last();
  var body = JSON.parse(request.body);

  assert.equal(request.timeout, 12345);
  assert.ok(body.messages);
  assert.equal(body.input, undefined);
  assert.equal(body.reasoning, undefined);

  request.respond(200, { choices: [{ message: { content: 'Chat answer' } }] });
  assert.deepEqual(harness.watch.responses, ['Chat answer']);
});

test('reasoning-summary rejection retries once without reasoning field', function() {
  var harness = createHarness({ settings: { ShowThinking: true } });

  harness.model.requestCompletion(3, 'Reason');
  assert.deepEqual(JSON.parse(FakeXMLHttpRequest.instances[0].body).reasoning, { summary: 'auto' });
  FakeXMLHttpRequest.instances[0].respond(422, 'unsupported reasoning');

  assert.equal(FakeXMLHttpRequest.instances.length, 2);
  assert.equal(JSON.parse(FakeXMLHttpRequest.instances[1].body).reasoning, undefined);
  FakeXMLHttpRequest.instances[1].respond(200, { output_text: 'Answer' });
  assert.deepEqual(harness.watch.responses, ['Answer']);
});

test('model failures produce watch errors without a response', function() {
  var harness = createHarness();

  harness.model.requestCompletion(4, 'Hello');
  FakeXMLHttpRequest.last().networkError();
  assert.deepEqual(harness.watch.errors, ['Network error']);

  harness.model.requestCompletion(5, 'Hello');
  FakeXMLHttpRequest.last().timeOut();
  assert.deepEqual(harness.watch.errors, ['Network error', 'Request timed out']);

  harness.model.requestCompletion(6, 'Hello');
  FakeXMLHttpRequest.last().respond(200, 'not json');
  assert.deepEqual(harness.watch.errors, ['Network error', 'Request timed out', 'Bad JSON response']);
});

test('successful turns are included in following request history', function() {
  var harness = createHarness();

  harness.model.requestCompletion(7, 'First');
  FakeXMLHttpRequest.last().respond(200, { output_text: 'One' });
  harness.model.requestCompletion(8, 'Second');

  var input = JSON.parse(FakeXMLHttpRequest.last().body).input;
  assert.deepEqual(input.slice(1), [
    { role: 'user', content: 'First' },
    { role: 'assistant', content: 'One' },
    { role: 'user', content: 'Second' }
  ]);
});

test('preserved history strips formatted thinking wrapper', function() {
  var chatStore = {
    saved: [],
    listChats: function() { return []; },
    getChat: function() { return null; },
    deleteChat: function() { return false; },
    deleteAllChats: function() {},
    saveChatHistory: function(id, messages) {
      this.saved.push(JSON.parse(JSON.stringify(messages)));
      return { id: 'saved-1', title: 'Saved' };
    }
  };
  var harness = createHarness({ settings: { ShowThinking: true, PreserveChats: true }, chatStore: chatStore });

  harness.model.requestCompletion(9, 'Question');
  FakeXMLHttpRequest.last().respond(200, {
    output_text: 'Answer text',
    output: [{ type: 'reasoning', summary: [{ text: 'Reason text' }] }]
  });

  assert.match(harness.watch.responses[0], /^Thinking:\nReason text/);
  assert.deepEqual(chatStore.saved[0], [
    { role: 'user', content: 'Question' },
    { role: 'assistant', content: 'Answer text' }
  ]);
});

test('native tool result is sent into follow-up Responses request', function() {
  var tools = {
    discoverPhoneTools: function(settings, id, callback) {
      callback(null, [{ name: 'lookup', description: 'Lookup', parameters: { type: 'object', properties: {} } }], {
        lookup: { kind: 'builtin', parameters: { type: 'object', properties: {} } }
      });
    },
    runToolCalls: function(id, calls, map, callback) {
      callback([{ id: calls[0].id, call_id: calls[0].call_id, name: 'lookup', result: 'tool result' }]);
    },
    formatToolCallLabel: function() { return 'Lookup'; }
  };
  var harness = createHarness({ settings: { MaxToolCalls: 2 }, tools: tools });

  harness.model.requestCompletion(10, 'Use tool');
  FakeXMLHttpRequest.instances[0].respond(200, {
    output: [{ type: 'function_call', call_id: 'call-1', name: 'lookup', arguments: '{}' }]
  });

  assert.equal(FakeXMLHttpRequest.instances.length, 2);
  var followUp = JSON.parse(FakeXMLHttpRequest.instances[1].body);
  assert.equal(followUp.input[followUp.input.length - 1].type, 'function_call_output');
  assert.equal(followUp.input[followUp.input.length - 1].output, '{"result":"tool result"}');

  FakeXMLHttpRequest.instances[1].respond(200, { output_text: 'Final' });
  assert.deepEqual(harness.watch.responses, ['Final']);
});

test.todo('ShowThinking false removes well-formed <think> blocks from answers');
test.todo('ShowThinking true does not duplicate <think> content in answer section');
test.todo('text tool-call JSON parsing ignores surrounding <think> blocks');
