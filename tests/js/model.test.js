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

test('HTTP 500 retries once then fails on second 500', function() {
  var harness = createHarness({ settings: { MaxToolCalls: 0 } });
  harness.model.requestCompletion(41, 'Hi');
  FakeXMLHttpRequest.instances[0].respond(500, 'err');
  FakeXMLHttpRequest.instances[1].respond(500, 'err');
  assert.deepEqual(harness.watch.errors, ['HTTP 500: err']);
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
      callback(null, [{ name: 'lookup', description: 'Lookup', parameters: { type: 'object', properties: {} } }], {
        lookup: { kind: 'builtin', parameters: { type: 'object', properties: {} } }
      });
    },
    runToolCalls: function() {},
    formatToolCallLabel: function() { return 'Lookup'; }
  };
}

test('Responses with WebSearchEnabled adds hosted web_search tool alongside function tools', function() {
  var harness = createHarness({ settings: { MaxToolCalls: 2, WebSearchEnabled: true }, tools: webToolsStub() });
  harness.model.requestCompletion(44, 'Hi');
  var body = JSON.parse(FakeXMLHttpRequest.instances[0].body);
  assert.ok(body.tools.some(function(t) { return t.type === 'web_search'; }));
  assert.ok(body.tools.some(function(t) { return t.type === 'function' && t.name === 'lookup'; }));
});

test('Chat Completions keeps web search prompt-only (no hosted tool)', function() {
  var harness = createHarness({ settings: { Endpoint: 'https://api.example.test/v1/chat/completions', MaxToolCalls: 2, WebSearchEnabled: true }, tools: webToolsStub() });
  harness.model.requestCompletion(45, 'Hi');
  var body = JSON.parse(FakeXMLHttpRequest.instances[0].body);
  assert.equal(body.tools.filter(function(t) { return t.type === 'web_search'; }).length, 0);
  assert.ok(body.messages[0].content.indexOf('web search') !== -1);
});

test('web search fallback on 400 removes hosted tool but keeps function tools', function() {
  var harness = createHarness({ settings: { MaxToolCalls: 2, WebSearchEnabled: true }, tools: webToolsStub() });
  harness.model.requestCompletion(46, 'Hi');
  FakeXMLHttpRequest.instances[0].respond(400, 'web search unsupported');
  var retry = JSON.parse(FakeXMLHttpRequest.instances[1].body);
  assert.equal(retry.tools.filter(function(t) { return t.type === 'web_search'; }).length, 0);
  assert.ok(retry.tools.some(function(t) { return t.type === 'function' && t.name === 'lookup'; }));
  FakeXMLHttpRequest.instances[1].respond(200, { output_text: 'done' });
});

test('Responses web search citations appended to answer', function() {
  var harness = createHarness({ settings: { WebSearchEnabled: true, MaxToolCalls: 0 } });
  harness.model.requestCompletion(47, 'Search');
  FakeXMLHttpRequest.last().respond(200, {
    output_text: 'The sky is blue.',
    output: [{ type: 'message', content: [{ type: 'output_text', text: 'The sky is blue.', annotations: [{ type: 'url_citation', url: 'https://example.com/a' }] }] }]
  });
  assert.match(harness.watch.responses[0], /The sky is blue\.\n\nSources:\n- https:\/\/example\.com\/a/);
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
