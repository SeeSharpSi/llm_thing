'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var path = require('node:path');
var common = require('../../src/pkjs/settings');
var FakeXMLHttpRequest = require('./helpers/fake_xhr');
var load = require('./helpers/load_with_stubs');

var modelPath = path.resolve(__dirname, '../../src/pkjs/model');
var originalSetTimeout = global.setTimeout;

function createHarness(overrides) {
  overrides = overrides || {};
  FakeXMLHttpRequest.reset();
  global.XMLHttpRequest = FakeXMLHttpRequest;
  global.setTimeout = function(callback) { callback(); };

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

  var endpointCache = overrides.endpointCache || {
    getCalls: [],
    rememberCalls: [],
    memory: {},
    cacheGetHook: overrides.cacheGet || null,
    get: function(endpoint, model) {
      this.getCalls.push({ endpoint: endpoint, model: model });
      if (this.cacheGetHook) {
        return this.cacheGetHook(endpoint, model);
      }
      return Object.prototype.hasOwnProperty.call(this.memory, model) ? this.memory[model] : '';
    },
    remember: function(endpoint, model, protocol) {
      this.rememberCalls.push({ endpoint: endpoint, model: model, protocol: protocol });
      this.memory[model] = protocol;
      return true;
    }
  };

  var model = load.loadWithStubs(modelPath, {
    './settings': commonStub,
    './watch': watch,
    './tools': tools,
    './chat_store': chatStore,
    './endpoint_cache': endpointCache
  });

  return { model: model, settings: settings, watch: watch, tools: tools, chatStore: chatStore, endpointCache: endpointCache };
}

test.afterEach(function() {
  delete global.XMLHttpRequest;
  global.setTimeout = originalSetTimeout;
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
  FakeXMLHttpRequest.instances[0].networkError();
  FakeXMLHttpRequest.instances[1].networkError();
  assert.deepEqual(harness.watch.errors, ['Network error']);

  harness.model.requestCompletion(5, 'Hello');
  FakeXMLHttpRequest.instances[2].timeOut();
  FakeXMLHttpRequest.instances[3].timeOut();
  assert.deepEqual(harness.watch.errors, ['Network error', 'Request timed out']);

  harness.model.requestCompletion(6, 'Hello');
  FakeXMLHttpRequest.instances[4].respond(200, 'not json');
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

test('tool results are capped by per-result and total context budgets', function() {
  var toolMap = {};
  var definitions = [];
  var i;
  var tools;
  var harness;
  var followUp;
  var outputs;

  for (i = 1; i <= 3; i += 1) {
    definitions.push({ name: 'lookup' + i, description: 'Lookup', parameters: { type: 'object', properties: {} } });
    toolMap['lookup' + i] = { kind: 'builtin', parameters: { type: 'object', properties: {} } };
  }
  tools = {
    discoverPhoneTools: function(settings, id, callback) { callback(null, definitions, toolMap); },
    runToolCalls: function(id, calls, map, callback) {
      callback(calls.map(function(call) {
        return { id: call.id, call_id: call.call_id, name: call.name, result: new Array(7001).join(call.name.substring(call.name.length - 1)) };
      }));
    },
    formatToolCallLabel: function(call) { return call.name; }
  };
  harness = createHarness({ settings: { MaxToolCalls: 3 }, tools: tools });

  harness.model.requestCompletion(11, 'Use three tools');
  FakeXMLHttpRequest.instances[0].respond(200, { output: [
    { type: 'function_call', call_id: 'call-1', name: 'lookup1', arguments: '{}' },
    { type: 'function_call', call_id: 'call-2', name: 'lookup2', arguments: '{}' },
    { type: 'function_call', call_id: 'call-3', name: 'lookup3', arguments: '{}' }
  ] });

  followUp = JSON.parse(FakeXMLHttpRequest.instances[1].body);
  outputs = followUp.input.filter(function(item) { return item.type === 'function_call_output'; });
  assert.equal(JSON.parse(outputs[0].output).result.length, 6000);
  assert.equal(JSON.parse(outputs[1].output).result.length, 6000);
  assert.match(JSON.parse(outputs[2].output).error, /total tool-result budget exhausted/);
  FakeXMLHttpRequest.instances[1].respond(200, { output_text: 'Final' });
  assert.deepEqual(harness.watch.responses, ['Final']);
});

test('ShowThinking false removes well-formed <think> blocks from answers', function() {
  var T = '<' + String.fromCharCode(116,104,105,110,107) + '>';
  var CT = '<' + '/' + String.fromCharCode(116,104,105,110,107) + '>';
  var harness = createHarness({ settings: { ShowThinking: false, MaxToolCalls: 0 } });

  harness.model.requestCompletion(20, 'Hi');
  FakeXMLHttpRequest.last().respond(200, { output_text: T + 'internal reasoning' + CT + ' visible answer' });
  assert.equal(harness.watch.responses[0], 'visible answer');
});

test('ShowThinking true does not duplicate <think> content in answer section', function() {
  var T = '<' + String.fromCharCode(116,104,105,110,107) + '>';
  var CT = '<' + '/' + String.fromCharCode(116,104,105,110,107) + '>';
  var harness = createHarness({ settings: { ShowThinking: true, MaxToolCalls: 0 } });

  harness.model.requestCompletion(21, 'Hi');
  FakeXMLHttpRequest.last().respond(200, { output_text: T + 'secret reasoning' + CT + 'public answer' });
  var resp = harness.watch.responses[0];
  assert.ok(resp.indexOf('Thinking:\nsecret reasoning') === 0, 'starts with thinking');
  var answerIdx = resp.indexOf('\n\nAnswer:\n');
  assert.notEqual(answerIdx, -1, 'has answer marker');
  var answerSection = resp.substring(answerIdx + '\n\nAnswer:\n'.length);
  assert.equal(answerSection, 'public answer');
  assert.equal(answerSection.indexOf('secret reasoning'), -1, 'reasoning not duplicated in answer');
});

test('text tool-call JSON parsing ignores surrounding <think> blocks', function() {
  var T = '<' + String.fromCharCode(116,104,105,110,107) + '>';
  var CT = '<' + '/' + String.fromCharCode(116,104,105,110,107) + '>';
  var runCalls = [];
  var tools = {
    discoverPhoneTools: function(currentSettings, id, callback) {
      callback(null, [{ name: 'lookup', description: 'Lookup', parameters: { type: 'object', properties: {} } }], {
        lookup: { kind: 'builtin', parameters: { type: 'object', properties: {} } }
      });
    },
    runToolCalls: function(id, calls, map, callback) {
      runCalls.push(calls);
      callback([{ id: calls[0].id, call_id: calls[0].call_id, name: 'lookup', result: 'ok' }]);
    },
    formatToolCallLabel: function() { return 'Lookup'; }
  };
  var harness = createHarness({ settings: { MaxToolCalls: 2 }, tools: tools });

  harness.model.requestCompletion(22, 'Use tool');
  FakeXMLHttpRequest.instances[0].respond(400, 'unsupported tools');
  var toolJson = '{"tool_calls":[{"id":"call_1","name":"lookup","arguments":{}}]}';
  FakeXMLHttpRequest.instances[1].respond(200, { output_text: T + 'let me call lookup' + CT + toolJson });
  assert.equal(runCalls.length, 1, 'tool parsed and run');
  assert.equal(runCalls[0][0].name, 'lookup');
  FakeXMLHttpRequest.instances[2].respond(200, { output_text: 'Final answer' });
  assert.deepEqual(harness.watch.responses, ['Final answer']);
});

test('ApiMode chat-completions forces messages even with Responses endpoint', function() {
  var harness = createHarness({ settings: { ApiMode: 'chat-completions', MaxToolCalls: 0 } });
  harness.model.requestCompletion(30, 'Hi');
  var body = JSON.parse(FakeXMLHttpRequest.last().body);
  assert.ok(body.messages);
  assert.equal(body.input, undefined);
});

test('ApiMode responses forces input even with Chat Completions endpoint', function() {
  var harness = createHarness({ settings: { ApiMode: 'responses', Endpoint: 'https://api.example.test/v1/chat/completions', MaxToolCalls: 0 } });
  harness.model.requestCompletion(31, 'Hi');
  var body = JSON.parse(FakeXMLHttpRequest.last().body);
  assert.ok(body.input);
  assert.equal(body.messages, undefined);
});

test('MaxOutputTokens sends max_output_tokens for Responses and omits when zero', function() {
  var harness = createHarness({ settings: { MaxOutputTokens: 500, MaxToolCalls: 0 } });
  harness.model.requestCompletion(32, 'Hi');
  assert.equal(JSON.parse(FakeXMLHttpRequest.last().body).max_output_tokens, 500);

  var harness2 = createHarness({ settings: { MaxToolCalls: 0 } });
  harness2.model.requestCompletion(33, 'Hi');
  assert.equal(JSON.parse(FakeXMLHttpRequest.last().body).max_output_tokens, undefined);
});

test('MaxOutputTokens sends max_completion_tokens for Chat Completions', function() {
  var harness = createHarness({ settings: { Endpoint: 'https://api.example.test/v1/chat/completions', MaxOutputTokens: 750, MaxToolCalls: 0 } });
  harness.model.requestCompletion(34, 'Hi');
  var body = JSON.parse(FakeXMLHttpRequest.last().body);
  assert.equal(body.max_completion_tokens, 750);
  assert.equal(body.max_output_tokens, undefined);
});

test('ReasoningEffort sends reasoning.effort on Responses', function() {
  var harness = createHarness({ settings: { ReasoningEffort: 'medium', MaxToolCalls: 0 } });
  harness.model.requestCompletion(35, 'Hi');
  var reasoning = JSON.parse(FakeXMLHttpRequest.last().body).reasoning;
  assert.equal(reasoning.effort, 'medium');
  assert.equal(reasoning.summary, undefined);
});

test('ReasoningEffort combines with reasoning.summary when ShowThinking', function() {
  var harness = createHarness({ settings: { ShowThinking: true, ReasoningEffort: 'high', MaxToolCalls: 0 } });
  harness.model.requestCompletion(36, 'Hi');
  var reasoning = JSON.parse(FakeXMLHttpRequest.last().body).reasoning;
  assert.equal(reasoning.summary, 'auto');
  assert.equal(reasoning.effort, 'high');
});

test('reasoning-summary rejection retries without summary but retains effort', function() {
  var harness = createHarness({ settings: { ShowThinking: true, ReasoningEffort: 'low' } });
  harness.model.requestCompletion(37, 'Reason');
  var first = JSON.parse(FakeXMLHttpRequest.instances[0].body).reasoning;
  assert.equal(first.summary, 'auto');
  assert.equal(first.effort, 'low');
  FakeXMLHttpRequest.instances[0].respond(422, 'unsupported summary');
  var retry = JSON.parse(FakeXMLHttpRequest.instances[1].body).reasoning;
  assert.equal(retry.summary, undefined);
  assert.equal(retry.effort, 'low');
  FakeXMLHttpRequest.instances[1].respond(200, { output_text: 'Answer' });
  assert.deepEqual(harness.watch.responses, ['Answer']);
});

test('official OpenAI Responses endpoint sets store false and encrypted_content', function() {
  var harness = createHarness({ settings: { Endpoint: 'https://api.openai.com/v1/responses', ShowThinking: true, MaxToolCalls: 0 } });
  harness.model.requestCompletion(38, 'Hi');
  var body = JSON.parse(FakeXMLHttpRequest.last().body);
  assert.equal(body.store, false);
  assert.equal(body.reasoning.encrypted_content, 'auto');
});

test('custom compatible endpoint omits store and encrypted_content', function() {
  var harness = createHarness({ settings: { ShowThinking: true, MaxToolCalls: 0 } });
  harness.model.requestCompletion(39, 'Hi');
  var body = JSON.parse(FakeXMLHttpRequest.last().body);
  assert.equal(body.store, undefined);
  assert.equal(body.reasoning.encrypted_content, undefined);
  assert.equal(body.reasoning.summary, 'auto');
});

test('HTTP 429 retries once honoring Retry-After then succeeds', function() {
  var harness = createHarness({ settings: { MaxToolCalls: 0 } });
  harness.model.requestCompletion(40, 'Hi');
  FakeXMLHttpRequest.instances[0].respond(429, 'rate limited', { 'Retry-After': '1' });
  FakeXMLHttpRequest.instances[1].respond(200, { output_text: 'OK' });
  assert.deepEqual(harness.watch.responses, ['OK']);
});

test('HTTP 500 rotates across known auto-mode endpoints and remembers only the success', function() {
  var harness = createHarness();
  harness.model.requestCompletion(41, 'Hi');

  var first = FakeXMLHttpRequest.instances[0];
  assert.equal(first.url, 'https://api.example.test/v1/responses');
  assert.deepEqual(harness.endpointCache.getCalls, [
    { endpoint: 'https://api.example.test/v1/responses', model: 'test-model' }
  ]);
  assert.equal(JSON.parse(first.body).reasoning, undefined);
  assert.ok(JSON.parse(first.body).input);
  assert.equal(first.headers.Authorization, 'Bearer test-key');
  assert.equal(harness.endpointCache.rememberCalls.length, 0, 'no remember before success');
  first.respond(500, 'err-a');

  var second = FakeXMLHttpRequest.instances[1];
  assert.equal(second.url, 'https://api.example.test/v1/chat/completions');
  assert.equal(second.headers.Authorization, 'Bearer test-key');
  assert.equal(second.headers['x-api-key'], undefined);
  assert.ok(JSON.parse(second.body).messages);
  assert.equal(JSON.parse(second.body).input, undefined);
  second.respond(500, 'err-b');

  var third = FakeXMLHttpRequest.instances[2];
  assert.equal(third.url, 'https://api.example.test/v1/messages');
  assert.equal(third.headers['x-api-key'], 'test-key');
  assert.equal(third.headers.Authorization, undefined);
  assert.equal(third.headers['anthropic-version'], '2023-06-01');
  var thirdBody = JSON.parse(third.body);
  assert.equal(thirdBody.max_tokens, 4096);
  assert.equal(typeof thirdBody.system, 'string');
  assert.equal(thirdBody.input, undefined);
  third.respond(200, { content: [{ type: 'text', text: 'Messages answer' }] });

  assert.equal(FakeXMLHttpRequest.instances.length, 3);
  assert.deepEqual(harness.watch.errors, [], 'no terminal error after rotation success');
  assert.deepEqual(harness.watch.responses, ['Messages answer']);
  assert.deepEqual(harness.endpointCache.rememberCalls, [
    { endpoint: 'https://api.example.test/v1/responses', model: 'test-model', protocol: 'messages' }
  ]);
});

test('HTTP 500 across all candidates stops once per candidate and never remembers', function() {
  var harness = createHarness();
  harness.model.requestCompletion(420, 'Hi');

  FakeXMLHttpRequest.instances[0].respond(500, 'err-a');
  assert.equal(FakeXMLHttpRequest.instances.length, 2);

  FakeXMLHttpRequest.instances[1].respond(500, 'err-b');
  assert.equal(FakeXMLHttpRequest.instances.length, 3, 'third candidate instantiated synchronously');

  FakeXMLHttpRequest.instances[2].respond(500, 'err-c');
  assert.equal(FakeXMLHttpRequest.instances.length, 3, 'one attempt per candidate, no duplicates');
  assert.deepEqual(
    FakeXMLHttpRequest.instances.map(function(r) { return r.url; }),
    [
      'https://api.example.test/v1/responses',
      'https://api.example.test/v1/chat/completions',
      'https://api.example.test/v1/messages'
    ]
  );
  assert.deepEqual(harness.watch.errors, ['HTTP 500: err-c']);
  assert.deepEqual(harness.watch.responses, []);
  assert.deepEqual(harness.endpointCache.rememberCalls, []);
});

test('ordinary HTTP 404 does not retry', function() {
  var harness = createHarness({ settings: { MaxToolCalls: 0 } });
  harness.model.requestCompletion(42, 'Hi');
  FakeXMLHttpRequest.instances[0].respond(404, 'not found');
  assert.equal(FakeXMLHttpRequest.instances.length, 1);
  assert.deepEqual(harness.watch.errors, ['HTTP 404: not found']);
});

test('HTTP 401 does not retry', function() {
  var harness = createHarness({ settings: { MaxToolCalls: 0 } });
  harness.model.requestCompletion(43, 'Hi');
  FakeXMLHttpRequest.instances[0].respond(401, 'unauthorized');
  assert.equal(FakeXMLHttpRequest.instances.length, 1);
  assert.deepEqual(harness.watch.errors, ['HTTP 401: unauthorized']);
});

function webToolsStub() {
  return {
    discoverPhoneTools: function(currentSettings, id, callback) {
      callback(null, [
        { name: 'lookup', description: 'Lookup', parameters: { type: 'object', properties: {} } },
        { name: 'web_fetch', description: 'Fetch pages in chunks', parameters: { type: 'object', additionalProperties: false, required: ['url'], properties: { url: { type: 'string' }, offset: { type: 'integer' }, limit: { type: 'integer' } } } }
      ], {
        lookup: { kind: 'builtin', parameters: { type: 'object', properties: {} } },
        web_fetch: { kind: 'builtin', parameters: { type: 'object' } }
      });
    },
    runToolCalls: function() {},
    formatToolCallLabel: function() { return 'Lookup'; }
  };
}

test('WebSearchEnabled adds native web_fetch function alongside function tools', function() {
  var harness = createHarness({ settings: { MaxToolCalls: 2, WebSearchEnabled: true }, tools: webToolsStub() });
  harness.model.requestCompletion(44, 'Hi');
  var body = JSON.parse(FakeXMLHttpRequest.instances[0].body);
  assert.equal(body.tools.filter(function(t) { return t.type === 'web_search'; }).length, 0);
  assert.ok(body.tools.some(function(t) { return t.type === 'function' && t.name === 'web_fetch'; }));
  assert.ok(body.tools.some(function(t) { return t.type === 'function' && t.name === 'lookup'; }));
  assert.doesNotMatch(body.input[0].content, /Only tools listed here are enabled/);
});

test('Chat Completions includes native web_fetch function', function() {
  var harness = createHarness({ settings: { Endpoint: 'https://chat-web-fetch.example.test/v1/chat/completions', ApiMode: 'chat-completions', Model: 'chat-web-fetch-model', MaxToolCalls: 2, WebSearchEnabled: true }, tools: webToolsStub() });
  harness.model.requestCompletion(45, 'Hi');
  var body = JSON.parse(FakeXMLHttpRequest.instances[0].body);
  assert.equal((body.tools || []).filter(function(t) { return t.type === 'web_search'; }).length, 0);
  assert.equal(body.messages[0].content.indexOf('Hosted web search'), -1);
});

test('web_fetch request has no hosted web_search fallback path', function() {
  var harness = createHarness({ settings: { MaxToolCalls: 2, WebSearchEnabled: true }, tools: webToolsStub() });
  harness.model.requestCompletion(46, 'Hi');
  assert.equal(FakeXMLHttpRequest.instances.length, 1);
  assert.ok(JSON.parse(FakeXMLHttpRequest.instances[0].body).tools.some(function(t) { return t.name === 'web_fetch'; }));
});

test('Responses refusal returns concise refusal text without shape diagnostics', function() {
  var harness = createHarness({ settings: { MaxToolCalls: 0 } });
  harness.model.requestCompletion(48, 'Bad');
  FakeXMLHttpRequest.last().respond(200, {
    output: [{ type: 'message', content: [{ type: 'refusal', text: 'I cannot help with that.' }] }]
  });
  assert.equal(harness.watch.responses[0], 'I cannot help with that.');
});

test('Responses incomplete returns concise incomplete reason', function() {
  var harness = createHarness({ settings: { MaxToolCalls: 0 } });
  harness.model.requestCompletion(49, 'Long');
  FakeXMLHttpRequest.last().respond(200, {
    status: 'incomplete',
    incomplete_details: { reason: 'max_output_tokens' },
    output_text: ''
  });
  assert.equal(harness.watch.responses[0], 'Response incomplete: max_output_tokens');
});

test('Chat Completions message.refusal returned concisely', function() {
  var harness = createHarness({ settings: { Endpoint: 'https://api.example.test/v1/chat/completions', MaxToolCalls: 0 } });
  harness.model.requestCompletion(50, 'Bad');
  FakeXMLHttpRequest.last().respond(200, { choices: [{ message: { refusal: 'Refused.' } }] });
  assert.equal(harness.watch.responses[0], 'Refused.');
});

test('empty Responses yields concise message not shape diagnostic', function() {
  var harness = createHarness({ settings: { MaxToolCalls: 0 } });
  harness.model.requestCompletion(51, 'X');
  FakeXMLHttpRequest.last().respond(200, { output: [] });
  assert.equal(harness.watch.responses[0], 'No response text.');
});

test('ShowThinking live history stores answer-only representation', function() {
  var harness = createHarness({ settings: { ShowThinking: true, MaxToolCalls: 0 } });
  harness.model.requestCompletion(52, 'Q1');
  FakeXMLHttpRequest.last().respond(200, { output_text: 'A1', output: [{ type: 'reasoning', summary: [{ text: 'R1' }] }] });
  assert.match(harness.watch.responses[0], /^Thinking:\nR1/);
  harness.model.requestCompletion(53, 'Q2');
  var input = JSON.parse(FakeXMLHttpRequest.last().body).input;
  assert.deepEqual(input.slice(1), [
    { role: 'user', content: 'Q1' },
    { role: 'assistant', content: 'A1' },
    { role: 'user', content: 'Q2' }
  ]);
});

test('history character budget evicts oldest user/assistant pairs', function() {
  var harness = createHarness({ settings: { MaxToolCalls: 0 } });
  var big = 'A' + new Array(3200).join('x');
  for (var i = 1; i <= 4; i += 1) {
    harness.model.requestCompletion(100 + i, 'q' + i);
    FakeXMLHttpRequest.last().respond(200, { output_text: big });
  }
  harness.model.requestCompletion(105, 'q5');
  var input = JSON.parse(FakeXMLHttpRequest.last().body).input;
  var history = input.slice(1, input.length - 1);
  assert.equal(history.length, 6, 'three pairs remain after budget eviction');
  assert.equal(history[0].content, 'q2', 'oldest pair evicted');
});

function nativeToolsStub(runCalls) {
  return {
    discoverPhoneTools: function(currentSettings, id, callback) {
      callback(null, [{ name: 'lookup', description: 'Lookup', parameters: { type: 'object', properties: {} } }], {
        lookup: { kind: 'builtin', parameters: { type: 'object', properties: {} } }
      });
    },
    runToolCalls: function(id, calls, map, callback) {
      runCalls.push(calls);
      callback([{ id: calls[0].id, call_id: calls[0].call_id, name: 'lookup', result: 'r' }]);
    },
    formatToolCallLabel: function() { return 'Lookup'; }
  };
}

test('native tool 400 caches unsupported so next prompt uses text mode directly', function() {
  var harness = createHarness({ settings: { MaxToolCalls: 2 }, tools: nativeToolsStub([]) });
  harness.model.requestCompletion(60, 'prompt one');
  FakeXMLHttpRequest.instances[0].respond(400, 'no native tools');
  FakeXMLHttpRequest.instances[1].respond(200, { output_text: 'answer one' });
  assert.deepEqual(harness.watch.responses, ['answer one']);

  harness.model.requestCompletion(61, 'prompt two');
  var secondFirst = JSON.parse(FakeXMLHttpRequest.instances[2].body);
  assert.equal(secondFirst.tools, undefined, 'second prompt skipped native attempt');
  FakeXMLHttpRequest.instances[2].respond(200, { output_text: 'answer two' });
  assert.deepEqual(harness.watch.responses, ['answer one', 'answer two']);
});

test('native tool 429 is not cached unsupported and retries transiently', function() {
  var harness = createHarness({ settings: { MaxToolCalls: 2 }, tools: webToolsStub() });
  harness.model.requestCompletion(62, 'p1');
  FakeXMLHttpRequest.instances[0].respond(429, 'rate', { 'Retry-After': '1' });
  FakeXMLHttpRequest.instances[1].respond(429, 'rate');
  assert.deepEqual(harness.watch.errors, ['HTTP 429: rate']);
  harness.model.requestCompletion(63, 'p2');
  var body2 = JSON.parse(FakeXMLHttpRequest.instances[2].body);
  assert.ok(body2.tools && body2.tools.some(function(t) { return t.type === 'function'; }), 'native attempted again');
});

test('auto mode detects /v1/messages endpoint and sends Anthropic Messages request', function() {
  var harness = createHarness({ settings: {
    Endpoint: 'https://api.anthropic.example.test/v1/messages',
    MaxToolCalls: 0
  } });

  harness.model.requestCompletion(70, 'Hello');
  var request = FakeXMLHttpRequest.last();
  var body = JSON.parse(request.body);

  assert.equal(request.method, 'POST');
  assert.equal(request.url, harness.settings.Endpoint);
  assert.equal(request.timeout, 60000);
  assert.equal(request.headers['x-api-key'], 'test-key');
  assert.equal(request.headers['anthropic-version'], '2023-06-01');
  assert.equal(request.headers.Authorization, undefined);
  assert.equal(body.model, 'test-model');
  assert.equal(body.max_tokens, 4096);
  assert.equal(typeof body.system, 'string');
  assert.ok(body.system.indexOf('helpful assistant') !== -1);
  assert.deepEqual(body.messages.map(function(m) { return m.role; }), ['user']);
  assert.equal(body.input, undefined);
  assert.equal(body.reasoning, undefined);
  assert.equal(body.store, undefined);
  assert.equal(body.include, undefined);
  assert.equal(body.max_output_tokens, undefined);
  assert.equal(body.max_completion_tokens, undefined);
  assert.equal(body.tools, undefined);

  request.respond(200, { content: [{ type: 'text', text: 'Messages answer' }] });
  assert.deepEqual(harness.watch.responses, ['Messages answer']);
});

test('/v1/messages detects trailing slash and query; hostname words do not classify', function() {
  var harness = createHarness({ settings: {
    Endpoint: 'https://api.example.test/v1/messages/?api_ver=2023',
    MaxToolCalls: 0
  } });
  harness.model.requestCompletion(71, 'Hi');
  var request = FakeXMLHttpRequest.last();
  assert.equal(request.url, 'https://api.example.test/v1/messages/?api_ver=2023');
  assert.equal(request.headers['x-api-key'], 'test-key');
  assert.deepEqual(JSON.parse(request.body).messages.map(function(m) { return m.role; }), ['user']);

  var trap = createHarness({ settings: {
    Endpoint: 'https://messages-proxy.example.test/v1/responses',
    MaxToolCalls: 0
  } });
  trap.model.requestCompletion(72, 'Hi');
  var trapRequest = FakeXMLHttpRequest.last();
  assert.equal(trapRequest.headers['x-api-key'], undefined);
  assert.equal(trapRequest.headers.Authorization, 'Bearer test-key');
  assert.ok(JSON.parse(trapRequest.body).input);

  var frag = createHarness({ settings: {
    Endpoint: 'https://api.example.test/v1/messages#section-a?x=1',
    MaxToolCalls: 0
  } });
  frag.model.requestCompletion(721, 'Hi');
  var fragRequest = FakeXMLHttpRequest.last();
  assert.equal(fragRequest.headers['x-api-key'], 'test-key');
  var fragBody = JSON.parse(fragRequest.body);
  assert.ok(fragBody.messages);
  assert.equal(fragBody.input, undefined);
});

test('ApiMode messages forces Messages body against a non-messages endpoint', function() {
  var harness = createHarness({ settings: {
    ApiMode: 'messages',
    Endpoint: 'https://api.example.test/v1/responses',
    MaxToolCalls: 0
  } });
  harness.model.requestCompletion(73, 'Hi');
  var request = FakeXMLHttpRequest.last();
  var body = JSON.parse(request.body);

  assert.equal(request.headers['x-api-key'], 'test-key');
  assert.equal(request.headers.Authorization, undefined);
  assert.equal(typeof body.system, 'string');
  assert.deepEqual(body.messages.map(function(m) { return m.role; }), ['user']);
  assert.equal(body.max_tokens, 4096);
  assert.equal(body.input, undefined);
  assert.equal(body.reasoning, undefined);
  assert.equal(body.store, undefined);
});

test('positive MaxOutputTokens maps to max_tokens in Messages mode', function() {
  var harness = createHarness({ settings: {
    ApiMode: 'messages',
    MaxOutputTokens: 512,
    MaxToolCalls: 0
  } });
  harness.model.requestCompletion(74, 'Hi');
  var body = JSON.parse(FakeXMLHttpRequest.last().body);
  assert.equal(body.max_tokens, 512);
  assert.equal(body.max_output_tokens, undefined);
  assert.equal(body.max_completion_tokens, undefined);
});

test('Messages thinking and text parse into ShowThinking wrapper without leaking signatures or redacted blocks', function() {
  var harness = createHarness({ settings: {
    Endpoint: 'https://api.anthropic.example.test/v1/messages',
    ShowThinking: true,
    MaxToolCalls: 0
  } });
  harness.model.requestCompletion(75, 'Think');
  FakeXMLHttpRequest.last().respond(200, {
    content: [
      { type: 'thinking', thinking: 'Deep thought', signature: 'sig-data-XYZ' },
      { type: 'redacted_thinking', data: 'opaque-secret' },
      { type: 'text', text: 'Visible reply' }
    ],
    stop_reason: 'end_turn'
  });
  assert.equal(harness.watch.responses[0], 'Thinking:\nDeep thought\n\nAnswer:\nVisible reply');
});

test('Messages stop_reason max_tokens surfaces incomplete reason', function() {
  var harness = createHarness({ settings: {
    Endpoint: 'https://api.anthropic.example.test/v1/messages',
    MaxToolCalls: 0
  } });
  harness.model.requestCompletion(76, 'Long');
  FakeXMLHttpRequest.last().respond(200, { content: [], stop_reason: 'max_tokens' });
  assert.equal(harness.watch.responses[0], 'Response incomplete: max_tokens');
});

test('Messages native tool round trip replays assistant blocks and tool_result user turn', function() {
  var tools = {
    discoverPhoneTools: function(currentSettings, id, callback) {
      callback(null, [{ name: 'lookup', description: 'Lookup', parameters: { type: 'object', properties: {} } }], {
        lookup: { kind: 'builtin', parameters: { type: 'object', properties: {} } }
      });
    },
    runToolCalls: function(id, calls, map, callback) {
      callback([{ id: calls[0].id, call_id: calls[0].call_id, name: calls[0].name, result: 'r' }]);
    },
    formatToolCallLabel: function() { return 'Lookup'; }
  };
  var harness = createHarness({
    settings: { Endpoint: 'https://api.anthropic.example.test/v1/messages', MaxToolCalls: 2 },
    tools: tools
  });

  harness.model.requestCompletion(77, 'Use tool');
  FakeXMLHttpRequest.instances[0].respond(200, {
    content: [
      { type: 'text', text: 'Calling tool.' },
      { type: 'tool_use', id: 'toolu_1', name: 'lookup', input: { q: 'watch' } }
    ]
  });

  var firstBody = JSON.parse(FakeXMLHttpRequest.instances[0].body);
  assert.deepEqual(firstBody.tools, [
    { name: 'lookup', description: 'Lookup', input_schema: { type: 'object', properties: {} } }
  ]);

  assert.equal(FakeXMLHttpRequest.instances.length, 2);
  var followUp = JSON.parse(FakeXMLHttpRequest.instances[1].body);
  assert.deepEqual(followUp.messages.map(function(m) { return m.role; }), ['user', 'assistant', 'user']);
  var assistantTurn = followUp.messages[1];
  assert.deepEqual(assistantTurn.content, [
    { type: 'text', text: 'Calling tool.' },
    { type: 'tool_use', id: 'toolu_1', name: 'lookup', input: { q: 'watch' } }
  ]);
  assert.deepEqual(followUp.messages[2].content, [
    { type: 'tool_result', tool_use_id: 'toolu_1', content: '{"result":"r"}' }
  ]);

  FakeXMLHttpRequest.instances[1].respond(200, {
    content: [{ type: 'text', text: 'Final answer' }]
  });
  assert.deepEqual(harness.watch.responses, ['Final answer']);
});

test('WebSearchEnabled in Messages mode includes native web_fetch', function() {
  var harness = createHarness({ settings: {
    ApiMode: 'messages',
    MaxToolCalls: 2,
    WebSearchEnabled: true
  }, tools: webToolsStub() });
  harness.model.requestCompletion(78, 'Hi');
  var body = JSON.parse(FakeXMLHttpRequest.instances[0].body);

  assert.ok(body.tools.some(function(t) { return t.name === 'web_fetch'; }));
  assert.ok(body.tools.every(function(t) {
    return !!t.name && !!t.description && !!t.input_schema && t.parameters === undefined;
  }));
  assert.equal(body.system.indexOf('Hosted web search'), -1);
});

function toolEchoStub() {
  return {
    discoverPhoneTools: function(currentSettings, id, callback) {
      callback(null, [{ name: 'lookup', description: 'Lookup', parameters: { type: 'object', properties: {} } }], {
        lookup: { kind: 'builtin', parameters: { type: 'object', properties: {} } }
      });
    },
    runToolCalls: function(id, calls, map, callback) {
      callback(calls.map(function(call, i) {
        return { id: call.id, call_id: call.call_id, name: call.name, result: 'r' + (i + 1) };
      }));
    },
    formatToolCallLabel: function(call) { return call.name; }
  };
}

test('Messages replay preserves redacted_thinking without displaying it or copying unknown fields', function() {
  var harness = createHarness({
    settings: {
      Endpoint: 'https://api.anthropic.example.test/v1/messages',
      ShowThinking: true,
      MaxToolCalls: 2
    },
    tools: toolEchoStub()
  });

  harness.model.requestCompletion(79, 'Use tool');
  FakeXMLHttpRequest.instances[0].respond(200, {
    content: [
      { type: 'redacted_thinking', data: 'opaque-secret', malicious: 'payload' },
      { type: 'redacted_thinking', data: 42 },
      { type: 'text', text: 'Preface.' },
      { type: 'tool_use', id: 'tu_r1', name: 'lookup', input: {} }
    ],
    stop_reason: 'tool_use'
  });

  var followUp = JSON.parse(FakeXMLHttpRequest.instances[1].body);
  assert.deepEqual(followUp.messages[1].content, [
    { type: 'redacted_thinking', data: 'opaque-secret' },
    { type: 'text', text: 'Preface.' },
    { type: 'tool_use', id: 'tu_r1', name: 'lookup', input: {} }
  ]);

  FakeXMLHttpRequest.instances[1].respond(200, {
    content: [{ type: 'text', text: 'Final clean answer' }]
  });
  assert.deepEqual(harness.watch.responses, ['Thinking:\n> lookup\n\nAnswer:\nFinal clean answer']);
  assert.equal(harness.watch.responses.join('\n').indexOf('opaque-secret'), -1, 'redacted data never displayed');
  assert.equal(harness.watch.responses.join('\n').indexOf('payload'), -1, 'unknown fields never displayed');
});

test('Messages response with two tool_use blocks yields two matched tool_result blocks in one user turn', function() {
  var harness = createHarness({
    settings: { Endpoint: 'https://api.anthropic.example.test/v1/messages', MaxToolCalls: 4 },
    tools: toolEchoStub()
  });

  harness.model.requestCompletion(80, 'Use two tools');
  FakeXMLHttpRequest.instances[0].respond(200, {
    content: [
      { type: 'tool_use', id: 'tu_a', name: 'lookup', input: { q: 1 } },
      { type: 'tool_use', id: 'tu_b', name: 'lookup', input: { q: 2 } }
    ]
  });

  assert.equal(FakeXMLHttpRequest.instances.length, 2);
  var followUp = JSON.parse(FakeXMLHttpRequest.instances[1].body);
  var assistantBlocks = followUp.messages[followUp.messages.length - 2].content;
  var resultBlocks = followUp.messages[followUp.messages.length - 1].content;

  assert.deepEqual(followUp.messages.map(function(m) { return m.role; }), ['user', 'assistant', 'user']);
  assert.deepEqual(assistantBlocks, [
    { type: 'tool_use', id: 'tu_a', name: 'lookup', input: { q: 1 } },
    { type: 'tool_use', id: 'tu_b', name: 'lookup', input: { q: 2 } }
  ]);
  assert.deepEqual(resultBlocks, [
    { type: 'tool_result', tool_use_id: 'tu_a', content: '{"result":"r1"}' },
    { type: 'tool_result', tool_use_id: 'tu_b', content: '{"result":"r2"}' }
  ]);

  FakeXMLHttpRequest.instances[1].respond(200, {
    content: [{ type: 'text', text: 'Done both' }]
  });
  assert.deepEqual(harness.watch.responses, ['Done both']);
});

test('Messages tool call budget cap adds per-call error results plus cap notice text block', function() {
  var harness = createHarness({
    settings: { Endpoint: 'https://api.anthropic.example.test/v1/messages', MaxToolCalls: 2 },
    tools: toolEchoStub()
  });

  harness.model.requestCompletion(81, 'Use three tools');
  FakeXMLHttpRequest.instances[0].respond(200, {
    content: [
      { type: 'tool_use', id: 'tu_c1', name: 'lookup', input: {} },
      { type: 'tool_use', id: 'tu_c2', name: 'lookup', input: {} },
      { type: 'tool_use', id: 'tu_c3', name: 'lookup', input: {} }
    ]
  });

  assert.equal(FakeXMLHttpRequest.instances.length, 2, 'cap reached before follow-up');
  var followUp = JSON.parse(FakeXMLHttpRequest.instances[1].body);
  var resultBlocks = followUp.messages[followUp.messages.length - 1].content;

  assert.equal(followUp.messages[followUp.messages.length - 2].content.length, 3,
    'assistant replay keeps all original tool_use blocks');
  assert.equal(resultBlocks.length, 4);
  assert.equal(resultBlocks[0].type, 'tool_result');
  assert.equal(resultBlocks[0].tool_use_id, 'tu_c1');
  assert.equal(resultBlocks[1].tool_use_id, 'tu_c2');
  assert.equal(resultBlocks[2].type, 'tool_result');
  assert.equal(resultBlocks[2].tool_use_id, 'tu_c3');
  assert.ok(JSON.parse(resultBlocks[2].content).error, 'skipped call carries error');
  assert.equal(JSON.parse(resultBlocks[2].content).result, undefined);
  assert.equal(resultBlocks[3].type, 'text');
  assert.match(resultBlocks[3].text, /Tool call budget exhausted/);

  FakeXMLHttpRequest.instances[1].respond(200, {
    content: [{ type: 'text', text: 'Final capped answer' }]
  });
  assert.deepEqual(harness.watch.responses, ['Final capped answer']);
});

test('remembered protocol is attempted first with derived URL (Messages and Chat)', function() {
  var harness = createHarness({ cacheGet: function() { return 'messages'; } });
  harness.model.requestCompletion(430, 'Hi');

  var request = FakeXMLHttpRequest.instances[0];
  assert.equal(FakeXMLHttpRequest.instances.length, 1, 'single candidate before response');
  assert.equal(request.url, 'https://api.example.test/v1/messages', 'derived URL without initial /responses attempt');
  assert.equal(request.headers['x-api-key'], 'test-key');
  var body = JSON.parse(request.body);
  assert.equal(body.max_tokens, 4096);
  assert.equal(body.input, undefined);

  request.respond(200, { content: [{ type: 'text', text: 'Messages answer' }] });
  assert.deepEqual(harness.watch.responses, ['Messages answer']);
  assert.equal(harness.endpointCache.getCalls.length, 1);
  assert.deepEqual(harness.endpointCache.rememberCalls, [
    { endpoint: 'https://api.example.test/v1/responses', model: 'test-model', protocol: 'messages' }
  ]);

  var chatHarness = createHarness({ cacheGet: function() { return 'chat-completions'; } });
  chatHarness.model.requestCompletion(431, 'Hi');
  var chatRequest = FakeXMLHttpRequest.last();
  assert.equal(chatRequest.url, 'https://api.example.test/v1/chat/completions', 'remembered Chat derived URL');
  assert.equal(chatRequest.headers.Authorization, 'Bearer test-key');
  var chatBody = JSON.parse(chatRequest.body);
  assert.ok(chatBody.messages);
  chatRequest.respond(200, { choices: [{ message: { content: 'Chat answer' } }] });
  assert.deepEqual(chatHarness.watch.responses, ['Chat answer']);
  assert.deepEqual(chatHarness.endpointCache.rememberCalls, [
    { endpoint: 'https://api.example.test/v1/responses', model: 'test-model', protocol: 'chat-completions' }
  ]);
});

test('cache lookup is per model; unknown models start from configured endpoint', function() {
  var harness = createHarness({
    cacheGet: function(endpoint, model) {
      return model === 'known-model' ? 'messages' : '';
    }
  });

  harness.model.requestCompletion(440, 'Hi');
  assert.equal(FakeXMLHttpRequest.instances[0].url, 'https://api.example.test/v1/responses');

  harness.settings.Model = 'known-model';
  harness.model.requestCompletion(441, 'Hi again');
  var remembered = FakeXMLHttpRequest.last();
  assert.equal(remembered.url, 'https://api.example.test/v1/messages');
  assert.deepEqual(
    harness.endpointCache.getCalls.map(function(call) { return call.model; }),
    ['test-model', 'known-model']
  );

  remembered.respond(200, { content: [{ type: 'text', text: 'M' }] });
  harness.settings.Model = 'fresh-model';
  harness.model.requestCompletion(442, 'Hi three');
  assert.equal(FakeXMLHttpRequest.last().url, 'https://api.example.test/v1/responses', 'model without entry uses configured protocol');
  FakeXMLHttpRequest.last().respond(200, { output_text: 'R' });
  assert.deepEqual(harness.watch.responses.slice(-2), ['M', 'R']);
});

test('success of the configured candidate remembers original endpoint with responses protocol', function() {
  var harness = createHarness();
  harness.model.requestCompletion(450, 'Hi');

  var request = FakeXMLHttpRequest.last();
  assert.equal(request.url, harness.settings.Endpoint);
  request.respond(200, { output_text: 'OK' });
  assert.deepEqual(harness.watch.responses, ['OK']);

  assert.equal(harness.settings.Endpoint, 'https://api.example.test/v1/responses', 'settings object never mutated');
  assert.deepEqual(harness.endpointCache.rememberCalls, [
    { endpoint: 'https://api.example.test/v1/responses', model: 'test-model', protocol: 'responses' }
  ]);
});

test('rotation preserves query and hash and never touches bare hostname endpoints', function() {
  var harness = createHarness({ settings: {
    Endpoint: 'https://api.example.test/v1/messages/?api_ver=2023#frag',
    MaxToolCalls: 0
  } });
  harness.model.requestCompletion(460, 'Hi');

  var first = FakeXMLHttpRequest.instances[0];
  assert.equal(first.url, 'https://api.example.test/v1/messages/?api_ver=2023#frag', 'configured URL exact');
  first.respond(500, 'err-a');

  var second = FakeXMLHttpRequest.instances[1];
  assert.equal(second.url, 'https://api.example.test/v1/responses?api_ver=2023#frag', 'suffix replaced, query/hash preserved');
  second.respond(500, 'err-b');

  var third = FakeXMLHttpRequest.instances[2];
  assert.equal(third.url, 'https://api.example.test/v1/chat/completions?api_ver=2023#frag', 'fixed order after configured messages');
  third.respond(200, { choices: [{ message: { content: 'ok' } }] });
  assert.deepEqual(harness.watch.responses, ['ok']);

  var bareHost = createHarness({ settings: {
    Endpoint: 'https://responses-proxy.internal.test',
    MaxToolCalls: 0
  } });
  bareHost.model.requestCompletion(461, 'Hi');
  var xhr = FakeXMLHttpRequest.instances[0];
  assert.equal(xhr.url, 'https://responses-proxy.internal.test');
  xhr.respond(500, 'err');
  assert.equal(FakeXMLHttpRequest.instances.length, 2);
  assert.equal(FakeXMLHttpRequest.instances[1].url, 'https://responses-proxy.internal.test', 'no rotation or guessed path for pathless endpoint');
  FakeXMLHttpRequest.instances[1].respond(500, 'err');
  assert.deepEqual(bareHost.watch.errors, ['HTTP 500: err']);
  assert.deepEqual(bareHost.endpointCache.getCalls, []);
  assert.deepEqual(bareHost.endpointCache.rememberCalls, []);
});

test('explicit ApiMode keeps single-endpoint transient retry without cache use or rotation', function() {
  var responsesHarness = createHarness({ settings: { ApiMode: 'responses', MaxToolCalls: 0 } });
  responsesHarness.model.requestCompletion(470, 'Hi');
  FakeXMLHttpRequest.instances[0].respond(500, 'err');
  assert.equal(FakeXMLHttpRequest.instances.length, 2);
  assert.equal(FakeXMLHttpRequest.instances[1].url, 'https://api.example.test/v1/responses', 'same endpoint retried');
  FakeXMLHttpRequest.instances[1].respond(500, 'err');
  assert.deepEqual(responsesHarness.watch.errors, ['HTTP 500: err']);
  assert.deepEqual(responsesHarness.endpointCache.getCalls, []);
  assert.deepEqual(responsesHarness.endpointCache.rememberCalls, []);

  var messagesHarness = createHarness({ settings: { ApiMode: 'messages', MaxToolCalls: 0 } });
  messagesHarness.model.requestCompletion(471, 'Hi');
  assert.equal(FakeXMLHttpRequest.instances[0].headers['x-api-key'], 'test-key');
  FakeXMLHttpRequest.instances[0].respond(500, 'err');
  assert.equal(FakeXMLHttpRequest.instances[1].url, FakeXMLHttpRequest.instances[0].url);
  FakeXMLHttpRequest.instances[1].respond(200, { content: [{ type: 'text', text: 'M' }] });
  assert.deepEqual(messagesHarness.watch.responses, ['M']);
  assert.deepEqual(messagesHarness.endpointCache.getCalls, []);
  assert.deepEqual(messagesHarness.endpointCache.rememberCalls, []);
});

test('unknown custom endpoint keeps same-endpoint retry, no cache calls, no guessed paths', function() {
  var harness = createHarness({ settings: {
    Endpoint: 'https://relay.internal.test/v1/generate',
    MaxToolCalls: 0
  } });
  harness.model.requestCompletion(480, 'Hi');

  var first = FakeXMLHttpRequest.instances[0];
  assert.equal(first.url, 'https://relay.internal.test/v1/generate');
  first.respond(500, 'err-a');

  var second = FakeXMLHttpRequest.instances[1];
  assert.equal(second.url, 'https://relay.internal.test/v1/generate', 'same endpoint retried once');
  second.respond(500, 'err-b');

  assert.equal(FakeXMLHttpRequest.instances.length, 2);
  assert.deepEqual(harness.watch.errors, ['HTTP 500: err-b']);
  assert.deepEqual(harness.endpointCache.getCalls, []);
  assert.deepEqual(harness.endpointCache.rememberCalls, []);
});

test('exact 502 retries the same auto-mode endpoint once without rotating or caching failures', function() {
  var successHarness = createHarness();
  successHarness.model.requestCompletion(490, 'Hi');
  FakeXMLHttpRequest.instances[0].respond(502, 'bad gateway');
  assert.equal(FakeXMLHttpRequest.instances[1].url, 'https://api.example.test/v1/responses', '502 does not rotate protocols');
  FakeXMLHttpRequest.instances[1].respond(200, { output_text: 'Back' });
  assert.deepEqual(successHarness.watch.responses, ['Back']);
  assert.deepEqual(successHarness.endpointCache.rememberCalls, [
    { endpoint: 'https://api.example.test/v1/responses', model: 'test-model', protocol: 'responses' }
  ]);

  var failHarness = createHarness();
  failHarness.model.requestCompletion(491, 'Hi');
  FakeXMLHttpRequest.instances[0].respond(502, 'bad gateway');
  FakeXMLHttpRequest.instances[1].respond(502, 'bad gateway');
  assert.equal(FakeXMLHttpRequest.instances.length, 2);
  assert.deepEqual(failHarness.watch.errors, ['HTTP 502: bad gateway']);
  assert.deepEqual(failHarness.endpointCache.rememberCalls, []);
});

test('bad JSON on a 2xx response does not remember anything', function() {
  var harness = createHarness();
  harness.model.requestCompletion(500, 'Hi');
  FakeXMLHttpRequest.instances[0].respond(200, 'not json');
  assert.deepEqual(harness.watch.errors, ['Bad JSON response']);
  assert.deepEqual(harness.endpointCache.rememberCalls, []);
});

test('stale responses during rotation neither cache nor deliver', function() {
  var harness = createHarness();
  harness.model.requestCompletion(510, 'Old');
  var staleXhr = FakeXMLHttpRequest.instances[0];

  harness.model.requestCompletion(511, 'New');
  staleXhr.respond(500, 'late 500');
  assert.equal(FakeXMLHttpRequest.instances.length, 2, 'stale 500 creates no rotated candidate');

  FakeXMLHttpRequest.instances[1].respond(200, { output_text: 'Fresh answer' });
  assert.deepEqual(harness.watch.responses, ['Fresh answer'], 'only current request delivered');
  assert.deepEqual(harness.endpointCache.rememberCalls, [
    { endpoint: 'https://api.example.test/v1/responses', model: 'test-model', protocol: 'responses' }
  ]);
});

test('remembered chat with configured unusual-case Messages endpoint orders chat, responses, exact messages', function() {
  var configured = 'https://api.example.test/v1/MESSAGES/?api_ver=2023#frag';
  var harness = createHarness({
    settings: { Endpoint: configured, MaxToolCalls: 0 },
    cacheGet: function() { return 'chat-completions'; }
  });

  harness.model.requestCompletion(520, 'Hi');

  assert.deepEqual(harness.endpointCache.getCalls, [
    { endpoint: configured, model: 'test-model' }
  ], 'cache consulted with original configured endpoint');

  var first = FakeXMLHttpRequest.instances[0];
  assert.equal(first.url, 'https://api.example.test/v1/chat/completions?api_ver=2023#frag', 'remembered chat candidate first, derived');
  assert.ok(JSON.parse(first.body).messages);
  first.respond(500, 'err-a');

  var second = FakeXMLHttpRequest.instances[1];
  assert.equal(second.url, 'https://api.example.test/v1/responses?api_ver=2023#frag', 'responses second in fixed order');
  assert.ok(JSON.parse(second.body).input);
  second.respond(500, 'err-b');

  var third = FakeXMLHttpRequest.instances[2];
  assert.equal(third.url, configured, 'configured protocol uses original endpoint byte-for-byte');
  assert.deepEqual(
    FakeXMLHttpRequest.instances.map(function(r) { return r.url; }),
    [
      'https://api.example.test/v1/chat/completions?api_ver=2023#frag',
      'https://api.example.test/v1/responses?api_ver=2023#frag',
      configured
    ]
  );
  third.respond(200, { content: [{ type: 'text', text: 'Messages answer' }] });

  assert.equal(FakeXMLHttpRequest.instances.length, 3);
  assert.deepEqual(harness.watch.responses, ['Messages answer']);
  assert.deepEqual(harness.endpointCache.rememberCalls, [
    { endpoint: configured, model: 'test-model', protocol: 'messages' }
  ]);
});

test('root-level https://host/messages rotates across three candidates without a /v1 prefix', function() {
  var harness = createHarness({ settings: {
    Endpoint: 'https://api.example.test/messages',
    MaxToolCalls: 0
  } });
  harness.model.requestCompletion(530, 'Hi');

  var first = FakeXMLHttpRequest.instances[0];
  assert.equal(first.url, 'https://api.example.test/messages', 'configured URL exact first');
  first.respond(500, 'err-a');

  var second = FakeXMLHttpRequest.instances[1];
  assert.equal(second.url, 'https://api.example.test/responses', 'derived without /v1 prefix');
  second.respond(500, 'err-b');

  var third = FakeXMLHttpRequest.instances[2];
  assert.equal(third.url, 'https://api.example.test/chat/completions', 'derived without /v1 prefix');
  FakeXMLHttpRequest.instances.forEach(function(r) {
    assert.equal(r.url.indexOf('https://api.example.test'), 0, 'hostname unchanged');
  });
  third.respond(200, { choices: [{ message: { content: 'ok' } }] });

  assert.equal(FakeXMLHttpRequest.instances.length, 3);
  assert.deepEqual(harness.watch.responses, ['ok']);
  assert.deepEqual(harness.endpointCache.rememberCalls, [
    { endpoint: 'https://api.example.test/messages', model: 'test-model', protocol: 'chat-completions' }
  ]);
});
