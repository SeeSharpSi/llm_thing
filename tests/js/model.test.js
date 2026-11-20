'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var path = require('node:path');
var common = require('../../src/pkjs/settings');
var FakeXMLHttpRequest = require('./helpers/fake_xhr');
var installFakeTimers = require('./helpers/fake_timers');
var load = require('./helpers/load_with_stubs');
var opencodeSession = require('../../src/pkjs/opencode_session');

var modelPath = path.resolve(__dirname, '../../src/pkjs/model');
var toolsPath = path.resolve(__dirname, '../../src/pkjs/tools');
var originalSetTimeout = global.setTimeout;
var originalClearTimeout = global.clearTimeout;
var TEST_TOOL_CAP_NOTICE = 'Tool call budget exhausted. FINAL ANSWER ONLY. Use output.';

function createHarness(overrides) {
  overrides = overrides || {};
  FakeXMLHttpRequest.reset();
  opencodeSession.resetForTests();
  global.XMLHttpRequest = FakeXMLHttpRequest;
  if (!overrides.useGlobalTimers) {
    global.setTimeout = function(callback) { callback(); };
  }

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

  var currentRequest = null;
  var trackedXhrs = {};
  var watch = {
    errors: [],
    retryAvailableErrors: [],
    responses: [],
    preparedResponses: [],
    progress: [],
    syncSettings: [],
    canceledRequestIds: [],
    finishedRequestIds: [],
    beginRequestLifecycle: function(id) { currentRequest = id; trackedXhrs[id] = trackedXhrs[id] || []; },
    finishRequestLifecycle: function(id) { watch.finishedRequestIds.push(id); },
    cancelRequestLifecycle: function(id) {
      var requests;
      var i;
      if (id !== currentRequest) { return false; }
      currentRequest = null;
      watch.canceledRequestIds.push(id);
      requests = (trackedXhrs[id] || []).slice();
      delete trackedXhrs[id];
      for (i = 0; i < requests.length; i += 1) { requests[i].abort(); }
      return true;
    },
    isCurrentRequest: function(id) { return currentRequest !== null && id === currentRequest; },
    trackXhr: function(id, request) {
      if (id !== currentRequest) { request.abort(); return false; }
      trackedXhrs[id] = trackedXhrs[id] || [];
      trackedXhrs[id].push(request);
      return true;
    },
    untrackXhr: function(id, request) {
      var requests = trackedXhrs[id] || [];
      var index = requests.indexOf(request);
      if (index !== -1) { requests.splice(index, 1); }
    },
    syncWatchSettings: function(value) { watch.syncSettings.push(value); },
    progressStart: function() {},
    progressSet: function(id, title, detail) { watch.progress.push([title, detail]); },
    progressDone: function() {},
    progressToolStart: function() {},
    progressSetContextSizes: function() {},
    sendError: function(id, message, callback, retryAvailable) {
      watch.errors.push(message);
      watch.retryAvailableErrors.push(retryAvailable === true);
      if (callback) { callback(null); }
    },
    sendResponse: function(id, currentSettings, text, callback) {
      watch.responses.push(text);
      if (callback) {
        callback();
      }
    },
    sendPreparedResponse: function(id, text, callback) {
      watch.preparedResponses.push(text);
      watch.responses.push(text);
      if (callback) {
        callback(null);
      }
    }
  };

  var tools = overrides.tools || (overrides.createTools && overrides.createTools(watch)) || {
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

function createRealMcpTools(settings, lifecycleWatch) {
  var commonStub = {};
  var watchStub = lifecycleWatch || {
    isCurrentRequest: function() { return true; },
    trackXhr: function() { return true; },
    untrackXhr: function() {},
    progressToolStart: function() {},
    progressDone: function() {}
  };

  Object.keys(common).forEach(function(key) { commonStub[key] = common[key]; });
  commonStub.loadSettings = function() { return settings; };
  commonStub.logDebug = function() {};
  return load.loadWithStubs(toolsPath, {
    './settings': commonStub,
    './watch': watchStub
  });
}

function runMcpIsErrorModelScenario(useTextFallback) {
  var message = 'MCP tool failed: access denied for client';
  var errorEnvelope = JSON.stringify({
    mcpResult: true,
    text: message,
    structuredContent: { code: 'ACCESS_DENIED' }
  });
  var settings = common.extend(common.DEFAULT_SETTINGS, {
    ApiMode: useTextFallback ? 'chat-completions' : 'responses',
    Endpoint: useTextFallback ? 'https://api.example.test/v1/chat/completions' : 'https://api.example.test/v1/responses',
    ApiKey: 'test-key',
    Model: 'test-model',
    MaxToolCalls: 1,
    McpServersJson: JSON.stringify([{ enabled: true, label: 'ErrorServer', url: 'https://mcp.example.test' }])
  });
  var tools = createRealMcpTools(settings);
  var harness = createHarness({ settings: settings, tools: tools, useGlobalTimers: true });
  var providerRequest;
  var toolRequest;
  var followUpRequest;
  var followUpBody;
  var calls;
  var error;
  var i;
  var item;
  var content;
  var marker;
  var end;

  harness.model.requestCompletion(useTextFallback ? 1201 : 1200, 'Try MCP tool');
  FakeXMLHttpRequest.instances[0].respond(200, { result: { protocolVersion: '2025-06-18' } });
  FakeXMLHttpRequest.instances[1].respond(202, '');
  FakeXMLHttpRequest.instances[2].respond(200, {
    result: { tools: [{ name: 'fail', description: 'MCP failure', inputSchema: { type: 'object', properties: {} } }] }
  });
  providerRequest = FakeXMLHttpRequest.instances[3];

  if (useTextFallback) {
    providerRequest.respond(400, 'native tools unsupported');
    assert.equal(FakeXMLHttpRequest.instances.length, 5, 'HTTP 400 retries prompt in text-tool mode');
    FakeXMLHttpRequest.instances[4].respond(200, {
      choices: [{ message: { content: '{"tool_calls":[{"id":"error-call","name":"ErrorServer__fail","arguments":{}}]}' } }]
    });
    toolRequest = FakeXMLHttpRequest.instances[5];
  } else {
    providerRequest.respond(200, {
      output: [{ type: 'function_call', call_id: 'error-call', name: 'ErrorServer__fail', arguments: '{}' }]
    });
    toolRequest = FakeXMLHttpRequest.instances[4];
  }

  assert.equal(JSON.parse(toolRequest.body).method, 'tools/call');
  toolRequest.respond(200, {
    result: {
      content: [{ type: 'text', text: message }],
      structuredContent: { code: 'ACCESS_DENIED' },
      isError: true
    }
  });
  followUpRequest = FakeXMLHttpRequest.last();
  followUpBody = JSON.parse(followUpRequest.body);

  if (!useTextFallback) {
    calls = followUpBody.input.filter(function(value) { return value.type === 'function_call_output'; });
    error = JSON.parse(calls[0].output).error;
  } else {
    for (i = 0; i < followUpBody.messages.length; i += 1) {
      item = followUpBody.messages[i] || {};
      content = item.content;
      if (item.role !== 'user' || typeof content !== 'string') { continue; }
      marker = content.indexOf('Tool results:\n');
      if (marker === 0) {
        content = content.substring('Tool results:\n'.length);
        end = content.indexOf('\nTool call budget exhausted');
        if (end !== -1) { content = content.substring(0, end); }
        calls = JSON.parse(content);
        error = calls[0].error;
        break;
      }
    }
  }

  assert.equal(errorEnvelope.length, 114);
  assert.equal(error, errorEnvelope, 'complete MCP message and code survive model error budgeting');
  followUpRequest.respond(200, { output_text: 'Handled MCP error' });
  assert.deepEqual(harness.watch.responses, ['Handled MCP error']);
}

test.afterEach(function() {
  delete global.XMLHttpRequest;
  global.setTimeout = originalSetTimeout;
  global.clearTimeout = originalClearTimeout;
  opencodeSession.resetForTests();
  load.clearModule(modelPath);
  load.clearModule(toolsPath);
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
  assert.deepEqual(body.input[0].content, [{ type: 'input_text', text: body.input[0].content[0].text }]);
  assert.deepEqual(body.input[1].content, [{ type: 'input_text', text: 'Hello' }]);
  assert.equal(body.messages, undefined);
  assert.deepEqual(harness.watch.syncSettings, [], 'prompts do not trigger full watch settings sync');

  request.respond(200, { output_text: 'Watch answer' });
  assert.deepEqual(harness.watch.responses, ['Watch answer']);
});

test('non-OpenCode endpoints omit the OpenCode session header', function() {
  var harness = createHarness();

  harness.model.requestCompletion(1, 'Hello');
  var request = FakeXMLHttpRequest.last();

  assert.equal(request.headers.Authorization, 'Bearer test-key');
  assert.equal(request.headers[opencodeSession.SESSION_HEADER], undefined);

  request.respond(200, { output_text: 'Watch answer' });
  assert.deepEqual(harness.watch.responses, ['Watch answer']);
});

test('OpenCode Go requests send a stable per-conversation session header', function() {
  var harness = createHarness({ settings: {
    Endpoint: 'https://opencode.ai/zen/go/v1/responses',
    MaxToolCalls: 0
  } });

  harness.model.requestCompletion(1, 'Hello');
  var first = FakeXMLHttpRequest.last();
  var sessionId = first.headers[opencodeSession.SESSION_HEADER];

  assert.match(sessionId, /^[0-9a-f-]{36}$/);
  assert.equal(first.headers.Authorization, 'Bearer test-key');
  first.respond(200, { output_text: 'One' });

  harness.model.requestCompletion(2, 'Again');
  var second = FakeXMLHttpRequest.last();

  assert.equal(second.headers[opencodeSession.SESSION_HEADER], sessionId);
  second.respond(200, { output_text: 'Two' });
  assert.deepEqual(harness.watch.responses, ['One', 'Two']);
});

test('OpenCode Go session header is stable across retries and rotates on chat reset', function() {
  var harness = createHarness({ settings: {
    Endpoint: 'https://opencode.ai/zen/go/v1/responses',
    MaxToolCalls: 0
  } });

  harness.model.requestCompletion(40, 'Hi');
  var firstId = FakeXMLHttpRequest.instances[0].headers[opencodeSession.SESSION_HEADER];
  assert.ok(firstId);
  FakeXMLHttpRequest.instances[0].respond(429, 'rate limited', { 'Retry-After': '0' });
  assert.equal(FakeXMLHttpRequest.instances[1].headers[opencodeSession.SESSION_HEADER], firstId);
  FakeXMLHttpRequest.instances[1].respond(200, { output_text: 'OK' });
  assert.deepEqual(harness.watch.responses, ['OK']);

  harness.model.resetChatHistory();
  harness.model.requestCompletion(41, 'Fresh');
  var rotatedId = FakeXMLHttpRequest.last().headers[opencodeSession.SESSION_HEADER];
  assert.ok(rotatedId);
  assert.notEqual(rotatedId, firstId);
  FakeXMLHttpRequest.last().respond(200, { output_text: 'New' });
  assert.deepEqual(harness.watch.responses, ['OK', 'New']);
});

test('Responses multi-turn history uses input_text and output_text blocks', function() {
  var harness = createHarness();

  harness.model.requestCompletion(90, 'First');
  FakeXMLHttpRequest.last().respond(200, { output_text: 'One' });
  harness.model.requestCompletion(91, 'Second');

  var input = JSON.parse(FakeXMLHttpRequest.last().body).input;
  assert.equal(input[0].role, 'system');
  assert.equal(input[0].content[0].type, 'input_text');
  assert.equal(input[1].content[0].type, 'input_text');
  assert.equal(input[2].content[0].type, 'output_text');
  assert.equal(input[2].content[0].text, 'One');
  assert.equal(input[3].content[0].type, 'input_text');
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
    { role: 'user', content: [{ type: 'input_text', text: 'First' }] },
    { role: 'assistant', content: [{ type: 'output_text', text: 'One' }] },
    { role: 'user', content: [{ type: 'input_text', text: 'Second' }] }
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

test('exhausted tool budget finalizes without tool definitions across native API modes', function() {
  var modes = [
    { name: 'responses', settings: { MaxToolCalls: 1 }, call: { output: [
      { type: 'function_call', call_id: 'call-1', name: 'lookup', arguments: '{}' }
    ] } },
    { name: 'chat', settings: {
      ApiMode: 'chat-completions', Endpoint: 'https://api.example.test/v1/chat/completions', MaxToolCalls: 1
    }, call: { choices: [{ message: { tool_calls: [
      { id: 'call-1', type: 'function', function: { name: 'lookup', arguments: '{}' } }
    ] } }] } },
    { name: 'messages', settings: {
      ApiMode: 'messages', Endpoint: 'https://api.example.test/v1/messages', MaxToolCalls: 1
    }, call: { content: [
      { type: 'thinking', thinking: 'reason', signature: 'signed-reasoning' },
      { type: 'tool_use', id: 'call-1', name: 'lookup', input: {} }
    ] } }
  ];
  var i;

  for (i = 0; i < modes.length; i += 1) {
    (function(modeCase) {
      var tools = {
        discoverPhoneTools: function(settings, id, callback) {
          callback(null, [{ name: 'lookup', description: 'Lookup', parameters: { type: 'object', properties: {} } }], {
            lookup: { kind: 'builtin', parameters: { type: 'object', properties: {} } }
          });
        },
        runToolCalls: function(id, calls, map, callback) {
          callback([{ id: calls[0].id, call_id: calls[0].call_id, name: 'lookup', result: 'gathered result' }]);
        },
        formatToolCallLabel: function() { return 'Lookup'; }
      };
      var harness = createHarness({ settings: modeCase.settings, tools: tools });
      var initialBody;
      var finalBody;

      harness.model.requestCompletion(101 + i, 'Use lookup');
      FakeXMLHttpRequest.instances[0].respond(200, modeCase.call);
      initialBody = JSON.parse(FakeXMLHttpRequest.instances[0].body);
      finalBody = JSON.parse(FakeXMLHttpRequest.instances[1].body);
      if (modeCase.name === 'responses') {
        assert.ok(initialBody.tools, 'initial request offers tools');
        assert.ok(finalBody.input.some(function(item) { return item.type === 'function_call_output'; }), 'native tool result replayed');
      } else if (modeCase.name === 'chat') {
        assert.ok(initialBody.tools, 'initial request offers tools');
        assert.ok(finalBody.messages.some(function(item) { return item.role === 'tool'; }), 'native tool result replayed');
      } else {
        assert.ok(initialBody.tools, 'initial request offers tools');
        assert.ok(finalBody.messages[2].content.some(function(item) { return item.type === 'tool_result'; }), 'native tool result replayed');
        assert.ok(finalBody.messages[1].content.some(function(item) {
          return item.type === 'thinking' && item.signature === 'signed-reasoning';
        }), 'reasoning signature preserved in provider replay');
      }
      assert.equal(finalBody.tools, undefined, modeCase.name + ' final-only request omits definitions');
      if (modeCase.name === 'responses') {
        assert.match(finalBody.input[finalBody.input.length - 1].content[0].text, /FINAL ANSWER ONLY/);
        FakeXMLHttpRequest.instances[1].respond(200, { output_text: 'Final from results' });
      } else if (modeCase.name === 'chat') {
        assert.match(finalBody.messages[finalBody.messages.length - 1].content, /FINAL ANSWER ONLY/);
        FakeXMLHttpRequest.instances[1].respond(200, { choices: [{ message: { content: 'Final from results' } }] });
      } else {
        assert.match(finalBody.messages[finalBody.messages.length - 1].content.slice(-1)[0].text, /FINAL ANSWER ONLY/);
        assert.ok(finalBody.messages[1].content.some(function(item) {
          return item.type === 'thinking' && item.signature === 'signed-reasoning';
        }), 'final-only request still replays signed reasoning');
        FakeXMLHttpRequest.instances[1].respond(200, { content: [{ type: 'text', text: 'Final from results' }] });
      }
      assert.deepEqual(harness.watch.responses, ['Final from results']);
    }(modes[i]));
  }
});

test('text fallback finalization overrides tool JSON instructions and treats JSON answer as text', function() {
  var tools = {
    discoverPhoneTools: function(settings, id, callback) {
      callback(null, [{ name: 'lookup', description: 'Lookup', parameters: { type: 'object', properties: {} } }], {
        lookup: { kind: 'builtin', parameters: { type: 'object', properties: {} } }
      });
    },
    runToolCalls: function(id, calls, map, callback) {
      callback([{ id: calls[0].id, call_id: calls[0].call_id, name: 'lookup', result: 'gathered result' }]);
    },
    formatToolCallLabel: function() { return 'Lookup'; }
  };
  var harness = createHarness({ settings: {
    ApiMode: 'chat-completions', Endpoint: 'https://api.example.test/v1/chat/completions', MaxToolCalls: 1
  }, tools: tools });
  var finalBody;
  var answer = '{"tool_calls":[{"name":"lookup","arguments":{}}]}';

  harness.model.requestCompletion(104, 'Use lookup');
  FakeXMLHttpRequest.instances[0].respond(400, 'native tools unsupported');
  FakeXMLHttpRequest.instances[1].respond(200, {
    output_text: '{"tool_calls":[{"id":"call-1","name":"lookup","arguments":{}}]}'
  });
  assert.equal(FakeXMLHttpRequest.instances.length, 3, 'one tool batch runs, then final-only request starts');
  finalBody = JSON.parse(FakeXMLHttpRequest.instances[2].body);
  assert.equal(finalBody.tools, undefined);
  assert.ok(JSON.parse(FakeXMLHttpRequest.instances[1].body).messages[0].content.indexOf('only JSON') !== -1,
    'initial text fallback request has tool JSON instructions');
  assert.equal(finalBody.messages[0].content.indexOf('only JSON'), -1,
    'final-only system prompt removes tool JSON instructions');
  assert.match(finalBody.messages[finalBody.messages.length - 1].content, /FINAL ANSWER ONLY\. Use output\./);
  FakeXMLHttpRequest.instances[2].respond(200, { choices: [{ message: { content: answer } }] });
  assert.deepEqual(harness.watch.responses, [answer], 'tool_calls-shaped final JSON is not treated as another tool request');
  assert.equal(FakeXMLHttpRequest.instances.length, 3, 'finalization never runs another tool');
});

test('unexpected native tool call during finalization is rejected without execution', function() {
  var runCount = 0;
  var tools = {
    discoverPhoneTools: function(settings, id, callback) {
      callback(null, [{ name: 'lookup', description: 'Lookup', parameters: { type: 'object', properties: {} } }], {
        lookup: { kind: 'builtin', parameters: { type: 'object', properties: {} } }
      });
    },
    runToolCalls: function(id, calls, map, callback) {
      runCount += calls.length;
      callback([{ id: calls[0].id, call_id: calls[0].call_id, name: 'lookup', result: 'gathered result' }]);
    },
    formatToolCallLabel: function() { return 'Lookup'; }
  };
  var harness = createHarness({ settings: { MaxToolCalls: 1 }, tools: tools });

  harness.model.requestCompletion(105, 'Use lookup');
  FakeXMLHttpRequest.instances[0].respond(200, {
    output: [{ type: 'function_call', call_id: 'first', name: 'lookup', arguments: '{}' }]
  });
  FakeXMLHttpRequest.instances[1].respond(200, {
    output: [{ type: 'function_call', call_id: 'unexpected', name: 'lookup', arguments: '{}' }]
  });

  assert.equal(runCount, 1, 'final-only native call does not execute');
  assert.equal(FakeXMLHttpRequest.instances.length, 2, 'no tool replay request is sent');
  assert.match(harness.watch.responses[0], /out of tool calls/);
});

test('MCP discovery unavailable labels appear in first model progress only when present', function() {
  function run(labels, expected, requestId, retryNative) {
    var tools = {
      discoverPhoneTools: function(settings, id, callback) { callback(null, [], {}, labels); },
      runToolCalls: function(id, calls, map, callback) { callback([]); },
      formatToolCallLabel: function() { return 'Tool'; }
    };
    var harness = createHarness({ settings: { MaxToolCalls: 1 }, tools: tools });

    harness.model.requestCompletion(requestId, 'Hi');
    assert.ok(harness.watch.progress.some(function(entry) {
      return entry[0] === 'thinking' && entry[1] === expected;
    }), 'model progress detail is formatted as expected');
    assert.ok(harness.watch.progress.some(function(entry) {
      return entry[0] === 'thinking' && entry[1].length <= 60;
    }), 'detail fits compact watch progress budget');
    if (retryNative) {
      FakeXMLHttpRequest.last().respond(400, 'native tools unsupported');
      assert.ok(harness.watch.progress.some(function(entry) {
        return entry[0] === 'thinking' && entry[1] === expected;
      }), 'unavailable detail survives native compatibility fallback');
    }
    FakeXMLHttpRequest.last().respond(200, { output_text: 'Done' });
    assert.ok(harness.watch.progress.some(function(entry) {
      return entry[0] === 'thinking' && entry[1] === 'with tool results';
    }) === false, 'discovery detail is not reused in later rounds');
  }

  run(['Slow', 'Bad\nServer'], 'MCP unavailable: Slow, Bad Server', 106, true);
  run([], '', 107);
  run([new Array(101).join('L')], 'MCP unavailable: ' + new Array(43).join('L') + '…', 110);
});

test('superseding request cancels only pending discovery foreground wait', function() {
  var discoveryCallbacks = [];
  var canceled = [];
  var tools = {
    discoverPhoneTools: function(settings, id, callback) { discoveryCallbacks.push(callback); },
    cancelMcpRequest: function(id) { canceled.push(id); },
    runToolCalls: function(id, calls, map, callback) { callback([]); },
    formatToolCallLabel: function() { return 'Tool'; }
  };
  var harness = createHarness({ settings: { MaxToolCalls: 1 }, tools: tools });

  harness.model.requestCompletion(108, 'First');
  harness.model.requestCompletion(109, 'Second');

  assert.deepEqual(canceled, [108]);
  discoveryCallbacks[0](null, [], {}, ['Slow']);
  discoveryCallbacks[1](null, [], {}, []);
  assert.equal(FakeXMLHttpRequest.instances.length, 1, 'stale discovery callback does not start a model request');
});

test('structured null tool result remains visible through model budget handling', function() {
  var tools = {
    discoverPhoneTools: function(settings, id, callback) {
      callback(null, [{ name: 'lookup', description: 'Lookup', parameters: { type: 'object', properties: {} } }], {
        lookup: { kind: 'builtin', parameters: { type: 'object', properties: {} } }
      });
    },
    runToolCalls: function(id, calls, map, callback) {
      callback([{ id: calls[0].id, call_id: calls[0].call_id, name: 'lookup', result: 'null', _structuredResult: true }]);
    },
    formatToolCallLabel: function(call) { return call.name || 'tool'; }
  };
  var harness = createHarness({ settings: { MaxToolCalls: 1 }, tools: tools });

  harness.model.requestCompletion(111, 'Use tool');
  FakeXMLHttpRequest.instances[0].respond(200, {
    output: [{ type: 'function_call', call_id: 'null-call', name: 'lookup', arguments: '{}' }]
  });

  assert.equal(FakeXMLHttpRequest.instances.length, 2);
  var followUp = JSON.parse(FakeXMLHttpRequest.instances[1].body);
  var output = followUp.input.filter(function(item) { return item.type === 'function_call_output'; })[0];
  assert.deepEqual(JSON.parse(output.output), { result: null });
});

test('MCP isError message and code survive native and text-tool model flows', function() {
  runMcpIsErrorModelScenario(false);
  runMcpIsErrorModelScenario(true);
});

test('only trusted MCP envelopes are reduced; provider lookalikes retain extra fields', function() {
  var definitions = [];
  var toolMap = {};
  var names = ['structured', 'plain', 'largeStructured', 'adapter'];
  var lookalike = {
    mcpResult: true,
    text: 'provider-owned text',
    structuredContent: { value: 1 },
    extra: 'must survive'
  };
  var results = {};
  var tools;
  var harness;
  var i;
  var outputs;
  var providerResults;

  tools = {
    discoverPhoneTools: function(settings, id, callback) { callback(null, definitions, toolMap); },
    runToolCalls: function(id, calls, map, callback) {
      callback(calls.map(function(call) {
        if (call.name === 'structured') {
          return { id: call.id, call_id: call.call_id, name: call.name, result: JSON.stringify(lookalike), _structuredResult: true };
        }
        if (call.name === 'plain') {
          return { id: call.id, call_id: call.call_id, name: call.name, result: JSON.stringify(lookalike) };
        }
        if (call.name === 'largeStructured') {
          return {
            id: call.id,
            call_id: call.call_id,
            name: call.name,
            result: JSON.stringify({
              mcpResult: true,
              text: new Array(7001).join('x'),
              structuredContent: { value: 2 },
              extra: 'provider data'
            }),
            _structuredResult: true
          };
        }
        return {
          id: call.id,
          call_id: call.call_id,
          name: call.name,
          result: JSON.stringify({
            mcpResult: true,
            text: new Array(7001).join('x'),
            structuredContent: { value: 3 }
          }),
          _structuredResult: true,
          _mcpResultEnvelope: true
        };
      }));
    },
    formatToolCallLabel: function(call) { return call.name; }
  };
  for (i = 0; i < names.length; i += 1) {
    definitions.push({ name: names[i], description: names[i], parameters: { type: 'object', properties: {} } });
    toolMap[names[i]] = { kind: 'builtin', parameters: { type: 'object', properties: {} } };
  }
  harness = createHarness({ settings: { MaxToolCalls: 4 }, tools: tools });
  harness.model.requestCompletion(112, 'Use all tools');
  FakeXMLHttpRequest.instances[0].respond(200, { output: names.map(function(name, index) {
    return { type: 'function_call', call_id: 'lookalike-' + index, name: name, arguments: '{}' };
  }) });

  outputs = JSON.parse(FakeXMLHttpRequest.instances[1].body).input.filter(function(item) {
    return item.type === 'function_call_output';
  });
  for (i = 0; i < outputs.length; i += 1) {
    results[names[i]] = JSON.parse(outputs[i].output).result;
  }
  assert.equal(results.structured.extra, 'must survive', 'structured provider object keeps unknown key');
  assert.equal(JSON.parse(results.plain).extra, 'must survive', 'plain JSON-looking text stays opaque');
  assert.match(results.largeStructured.error, /per-result limit exceeded/, 'untrusted lookalike is not rebuilt as adapter envelope');
  assert.equal(results.adapter.mcpResult, true);
  assert.equal(results.adapter.structuredContent.value, 3);
  assert.equal(results.adapter.textTruncated, true, 'trusted adapter envelope can be reduced within budget');
  assert.equal(results.adapter._mcpResultEnvelope, undefined, 'internal provenance flag is not exposed to model');
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
  assert.equal(JSON.parse(outputs[1].output).result.length, 5846);
  assert.equal(JSON.parse(outputs[2].output).result.length, 96);
  assert.match(JSON.parse(outputs[1].output).result, /\[truncated\]$/);
  assert.match(JSON.parse(outputs[2].output).result, /\[truncated\]$/);
  var emittedChars = JSON.parse(outputs[0].output).result.length +
    JSON.parse(outputs[1].output).result.length + JSON.parse(outputs[2].output).result.length +
    TEST_TOOL_CAP_NOTICE.length;
  assert.equal(emittedChars, 12000);
  FakeXMLHttpRequest.instances[1].respond(200, { output_text: 'Final' });
  assert.deepEqual(harness.watch.responses, ['Final']);
});

test('large structured tool results stay parseable and obey budgets across provider formats', function() {
  var providers = ['responses', 'chat', 'messages', 'text'];
  var fullResult = JSON.stringify({
    mcpResult: true,
    text: 'Readable MCP text remains alongside data.',
    structuredContent: { data: new Array(5590).join('x') }
  });
  var oversizedResult = JSON.stringify({
    mcpResult: true,
    text: 'Readable text survives budget reduction.',
    structuredContent: { data: new Array(7001).join('y') }
  });
  var i;
  assert.ok(fullResult.length > 5600 && fullResult.length < 6000);
  assert.ok(oversizedResult.length > 6000);

  function responseFor(provider, calls) {
    if (provider === 'chat') {
      return { choices: [{ message: { tool_calls: calls.map(function(call) {
        return { id: call.id, type: 'function', function: { name: call.name, arguments: '{}' } };
      }) } }] };
    }
    if (provider === 'messages') {
      return { content: calls.map(function(call) { return { type: 'tool_use', id: call.id, name: call.name, input: {} }; }) };
    }
    if (provider === 'text') {
      return { output_text: JSON.stringify({ tool_calls: calls.map(function(call) {
        return { id: call.id, name: call.name, arguments: {} };
      }) }) };
    }
    return { output: calls.map(function(call) {
      return { type: 'function_call', call_id: call.id, name: call.name, arguments: '{}' };
    }) };
  }

  function outputsFrom(provider, requestBody) {
    var body = JSON.parse(requestBody);
    var outputs = [];
    var i;
    var item;
    var content;
    if (provider === 'responses') {
      for (i = 0; i < body.input.length; i += 1) {
        item = body.input[i];
        if (item.type === 'function_call_output') { outputs.push(JSON.parse(item.output)); }
      }
      return outputs;
    }
    if (provider === 'chat') {
      for (i = 0; i < body.messages.length; i += 1) {
        item = body.messages[i];
        if (item.role === 'tool') { outputs.push(JSON.parse(item.content)); }
      }
      return outputs;
    }
    if (provider === 'messages') {
      content = body.messages[body.messages.length - 1].content;
      for (i = 0; i < content.length; i += 1) {
        if (content[i].type === 'tool_result') { outputs.push(JSON.parse(content[i].content)); }
      }
      return outputs;
    }
    for (i = 0; i < body.input.length; i += 1) {
      item = body.input[i];
      if (item.role === 'user') {
        if (typeof item.content === 'string' && item.content.indexOf('Tool results:\n') === 0) {
          content = item.content;
        } else if (item.content && item.content.length) {
          content = '';
          for (var partIndex = 0; partIndex < item.content.length; partIndex += 1) {
            if (item.content[partIndex].text) { content += item.content[partIndex].text; }
          }
        } else {
          content = '';
        }
        if (content.indexOf('Tool results:\n') === 0) {
          var endAt;
          content = content.substring('Tool results:\n'.length);
          endAt = content.indexOf('\nUse these results');
          if (endAt === -1) { endAt = content.indexOf('\nTool call budget exhausted'); }
          if (endAt !== -1) { content = content.substring(0, endAt); }
          return JSON.parse(content);
        }
      }
    }
    return outputs;
  }

  for (i = 0; i < providers.length; i += 1) {
    (function(provider) {
      var definitions = [];
      var toolMap = {};
      var names = ['lookup1', 'lookup2', 'lookup3'];
      var calls = [];
      var tools = {
        discoverPhoneTools: function(settings, requestId, callback) { callback(null, definitions, toolMap); },
        runToolCalls: function(requestId, requested, map, callback) {
          callback(requested.map(function(call, index) {
            return {
              id: call.id || call.call_id,
              call_id: call.call_id || call.id,
              name: call.name,
              result: index === 2 ? oversizedResult : fullResult,
              _structuredResult: true,
              _mcpResultEnvelope: true
            };
          }));
        },
        formatToolCallLabel: function(call) { return call.name; }
      };
      var settings = { MaxToolCalls: 3 };
      var endpoint = 'https://api.example.test/v1/responses';
      var harness;
      var outputs;
      var callIndex;

      if (provider === 'chat') {
        settings.ApiMode = 'chat-completions';
        endpoint = 'https://api.example.test/v1/chat/completions';
      } else if (provider === 'messages') {
        settings.ApiMode = 'messages';
        endpoint = 'https://api.anthropic.example.test/v1/messages';
      }
      settings.Endpoint = endpoint;
      for (callIndex = 0; callIndex < names.length; callIndex += 1) {
        definitions.push({ name: names[callIndex], description: 'Lookup', parameters: { type: 'object', properties: {} } });
        toolMap[names[callIndex]] = { kind: 'builtin', parameters: { type: 'object', properties: {} } };
        calls.push({ id: 'call-' + (callIndex + 1), name: names[callIndex] });
      }
      harness = createHarness({ settings: settings, tools: tools });
      harness.model.requestCompletion(110 + providers.indexOf(provider), 'Use structured tools');
      FakeXMLHttpRequest.instances[0].respond(200, responseFor(provider, calls));
      assert.equal(FakeXMLHttpRequest.instances.length, 2, provider + ' sends one follow-up request');
      outputs = outputsFrom(provider, FakeXMLHttpRequest.instances[1].body);
      assert.equal(outputs.length, 3, provider + ' returns every tool result');
       assert.equal(outputs[0].result.text, 'Readable MCP text remains alongside data.', provider + ' keeps mixed text');
       assert.equal(outputs[0].result.structuredContent.data.length, 5589, provider + ' keeps first structured JSON intact');
       assert.equal(outputs[1].result.text, 'Readable MCP text remains alongside data.', provider + ' keeps mixed text');
       assert.equal(outputs[1].result.structuredContent.data.length, 5589, provider + ' keeps second structured JSON intact');
       assert.match(outputs[2].result.structuredContent.error, /omitted/);
       assert.equal(outputs[2].result.text, 'Readable text survives budget reduction.', provider + ' keeps readable text when structure exceeds remaining budget');
      var payloadChars = 0;
      outputs.forEach(function(output) {
        payloadChars += output.error ? output.error.length : JSON.stringify(output.result).length;
      });
      payloadChars += TEST_TOOL_CAP_NOTICE.length;
       assert.ok(payloadChars <= 12000, provider + ' error/omission payloads count against total budget');
       assert.equal(JSON.parse(JSON.stringify(outputs[0])).result.structuredContent.data.length, 5589, provider + ' output remains serializable');
    }(providers[i]));
  }
});

test('oversized structured output becomes valid omission while plain text still truncates', function() {
  var definitions = [{ name: 'lookup', description: 'Lookup', parameters: { type: 'object', properties: {} } }];
  var toolMap = { lookup: { kind: 'builtin', parameters: { type: 'object', properties: {} } } };
  var tools = {
    discoverPhoneTools: function(settings, id, callback) { callback(null, definitions, toolMap); },
    runToolCalls: function(id, calls, map, callback) {
      callback([
        { id: 'structured', call_id: 'structured', name: 'lookup', result: JSON.stringify({ data: new Array(7001).join('x') }), _structuredResult: true },
        { id: 'plain', call_id: 'plain', name: 'lookup', result: new Array(7001).join('p') }
      ]);
    },
    formatToolCallLabel: function(call) { return call.name; }
  };
  var harness = createHarness({ settings: { MaxToolCalls: 2 }, tools: tools });
  harness.model.requestCompletion(111, 'Use tool');
  FakeXMLHttpRequest.instances[0].respond(200, { output: [
    { type: 'function_call', call_id: 'structured', name: 'lookup', arguments: '{}' },
    { type: 'function_call', call_id: 'plain', name: 'lookup', arguments: '{}' }
  ] });
  var followUp = JSON.parse(FakeXMLHttpRequest.instances[1].body);
  var outputs = followUp.input.filter(function(item) { return item.type === 'function_call_output'; });
  var structured = JSON.parse(outputs[0].output);
  var plain = JSON.parse(outputs[1].output);
  assert.match(structured.result.error, /per-result limit exceeded/);
  assert.equal(plain.result.length, 6000);
  assert.match(plain.result, /\[truncated\]$/);
});

test('tool-result reserve preserves complete errors at exact aggregate boundary across rounds', function() {
  var definitions = [];
  var toolMap = {};
  var names = ['lookup1', 'lookup2', 'lookup3', 'lookup4'];
  var fullError = new Array(97).join('E');
  var tools = {
    discoverPhoneTools: function(settings, requestId, callback) { callback(null, definitions, toolMap); },
    runToolCalls: function(requestId, calls, map, callback) {
      callback(calls.map(function(call) {
        if (call.name === 'lookup1' || call.name === 'lookup2') {
          return { id: call.id, call_id: call.call_id, name: call.name, result: new Array(7001).join('s') };
        }
        return { id: call.id, call_id: call.call_id, name: call.name, error: fullError };
      }));
    },
    formatToolCallLabel: function(call) { return call.name; }
  };
  var harness;
  var i;
  var firstFollowUp;
  var secondFollowUp;
  var outputs;
  var outputChars;
  for (i = 0; i < names.length; i += 1) {
    definitions.push({ name: names[i], description: names[i], parameters: { type: 'object', properties: {} } });
    toolMap[names[i]] = { kind: 'builtin', parameters: { type: 'object', properties: {} } };
  }
  harness = createHarness({ settings: { MaxToolCalls: 4 }, tools: tools });
  harness.model.requestCompletion(112, 'Use four tools');
  FakeXMLHttpRequest.instances[0].respond(200, { output: [
    { type: 'function_call', call_id: 'call-1', name: 'lookup1', arguments: '{}' },
    { type: 'function_call', call_id: 'call-2', name: 'lookup2', arguments: '{}' }
  ] });

  firstFollowUp = JSON.parse(FakeXMLHttpRequest.instances[1].body);
  outputs = firstFollowUp.input.filter(function(item) { return item.type === 'function_call_output'; });
  assert.equal(JSON.parse(outputs[0].output).result.length, 6000);
  assert.equal(JSON.parse(outputs[1].output).result.length, 5750);
  assert.match(JSON.parse(outputs[0].output).result, /\[truncated\]$/);
  assert.match(JSON.parse(outputs[1].output).result, /\[truncated\]$/);

  FakeXMLHttpRequest.instances[1].respond(200, { output: [
    { type: 'function_call', call_id: 'call-3', name: 'lookup3', arguments: '{}' },
    { type: 'function_call', call_id: 'call-4', name: 'lookup4', arguments: '{}' }
  ] });
  secondFollowUp = JSON.parse(FakeXMLHttpRequest.instances[2].body);
  outputs = secondFollowUp.input.filter(function(item) { return item.type === 'function_call_output'; });
  assert.equal(outputs.length, 4);
  assert.equal(JSON.parse(outputs[2].output).error, fullError);
  assert.equal(JSON.parse(outputs[3].output).error, fullError);
  outputChars = JSON.parse(outputs[0].output).result.length +
    JSON.parse(outputs[1].output).result.length +
    JSON.parse(outputs[2].output).error.length +
    JSON.parse(outputs[3].output).error.length +
    TEST_TOOL_CAP_NOTICE.length;
  assert.equal(outputChars, 12000);
  FakeXMLHttpRequest.instances[2].respond(200, { output_text: 'Done' });
  assert.deepEqual(harness.watch.responses, ['Done']);
});

test('many tool errors and skipped-call errors share bounded aggregate budget', function() {
  var definitions = [];
  var toolMap = {};
  var longError = new Array(1001).join('X');
  var tools;
  var harness;
  var i;
  var results;
  var body;
  var outputs;
  var totalErrorChars = 0;
  for (i = 0; i < 8; i += 1) {
    var name = 'lookup' + i;
    definitions.push({ name: name, description: name, parameters: { type: 'object', properties: {} } });
    toolMap[name] = { kind: 'builtin', parameters: { type: 'object', properties: {} } };
  }
  tools = {
    discoverPhoneTools: function(settings, requestId, callback) { callback(null, definitions, toolMap); },
    runToolCalls: function(requestId, calls, map, callback) {
      callback(calls.map(function(call) {
        return { id: call.id, call_id: call.call_id, name: call.name, error: longError };
      }));
    },
    formatToolCallLabel: function(call) { return call.name; }
  };
  harness = createHarness({ settings: { MaxToolCalls: 4 }, tools: tools });
  harness.model.requestCompletion(113, 'Use eight tools');
  FakeXMLHttpRequest.instances[0].respond(200, { output: definitions.map(function(definition, index) {
    return { type: 'function_call', call_id: 'call-' + index, name: definition.name, arguments: '{}' };
  }) });

  body = JSON.parse(FakeXMLHttpRequest.instances[1].body);
  outputs = body.input.filter(function(item) { return item.type === 'function_call_output'; });
  assert.equal(outputs.length, 8);
  outputs.forEach(function(item, index) {
    var error = JSON.parse(item.output).error;
    if (index < 4) {
      assert.equal(error, longError, 'current error may consume unreserved data after minimum slots are protected');
    } else {
      assert.equal(error, 'Tool call budget exhausted');
    }
    totalErrorChars += error.length;
  });
  totalErrorChars += TEST_TOOL_CAP_NOTICE.length;
  assert.ok(totalErrorChars <= 12000);
  assert.notEqual(JSON.stringify(body.input).indexOf(TEST_TOOL_CAP_NOTICE), -1,
    'cap notice stays fixed-size and does not include growing skipped-call counts');
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
  assert.doesNotMatch(JSON.stringify(body.input[0].content), /Only tools listed here are enabled/);
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
    { role: 'user', content: [{ type: 'input_text', text: 'Q1' }] },
    { role: 'assistant', content: [{ type: 'output_text', text: 'A1' }] },
    { role: 'user', content: [{ type: 'input_text', text: 'Q2' }] }
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
  assert.equal(history[0].content[0].text, 'q2', 'oldest pair evicted');
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

test('Timeline native and text guidance consistently separates creation from editing', function() {
  var definitions = [
    { name: 'pebble_timeline_create_pin', description: 'Create a new pin.', parameters: { type: 'object', properties: {} } },
    { name: 'pebble_timeline_create_reminder', description: 'Create a new reminder.', parameters: { type: 'object', properties: {} } },
    { name: 'pebble_timeline_list_pins', description: 'List editable pins.', parameters: { type: 'object', properties: {} } },
    { name: 'pebble_timeline_edit_pin', description: 'Edit an existing pin; only supplied fields change.', parameters: { type: 'object', properties: {} } }
  ];
  var toolMap = {};
  var tools = {
    discoverPhoneTools: function(settings, requestId, callback) { callback(null, definitions, toolMap); },
    runToolCalls: function(requestId, calls, map, callback) { callback([]); },
    formatToolCallLabel: function(call) { return call.name; }
  };
  var harness = createHarness({ settings: { MaxToolCalls: 5 }, tools: tools });
  var nativeBody;
  var nativeSystem;
  var textBody;
  var textSystem;
  var expectedNames = definitions.map(function(tool) { return tool.name; });

  expectedNames.forEach(function(name) { toolMap[name] = { kind: 'builtin', parameters: { type: 'object', properties: {} } }; });
  harness.model.requestCompletion(64, 'Change calendar event');
  nativeBody = JSON.parse(FakeXMLHttpRequest.instances[0].body);
  nativeSystem = nativeBody.input[0].content[0].text;
  assert.deepEqual(nativeBody.tools.map(function(tool) { return tool.name; }), expectedNames);
  assert.match(nativeSystem, /pebble_timeline_create_pin/);
  assert.match(nativeSystem, /pebble_timeline_create_reminder/);
  assert.match(nativeSystem, /scheduled Pebble Timeline reminder notification attached to a pin, not an OS\/system alarm/i);
  assert.match(nativeSystem, /alarm request.*explain this limitation/i);
  assert.match(nativeSystem, /pebble_timeline_edit_pin/);
  assert.match(nativeSystem, /Only supplied fields change/);
  assert.match(nativeSystem, /Local acceptance does not confirm watch delivery/i);
  assert.doesNotMatch(nativeSystem, /watch delivery (?:is )?confirmed/i);
  assert.doesNotMatch(nativeSystem, /pebble_timeline_create_or_update_pin/);

  FakeXMLHttpRequest.instances[0].respond(400, 'no native tools');
  textBody = JSON.parse(FakeXMLHttpRequest.instances[1].body);
  textSystem = textBody.input[0].content[0].text;
  assert.match(textSystem, /Available tools:/);
  expectedNames.forEach(function(name) { assert.ok(textSystem.indexOf(name) !== -1, name + ' appears in text guidance'); });
  assert.match(textSystem, /not an OS\/system alarm/i);
  assert.match(textSystem, /Local acceptance does not confirm watch delivery/i);
  assert.doesNotMatch(textSystem, /pebble_timeline_create_or_update_pin/);
  FakeXMLHttpRequest.instances[1].respond(200, { output_text: 'Updated.' });
  assert.deepEqual(harness.watch.responses, ['Updated.']);
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
  assert.match(resultBlocks[3].text, /FINAL ANSWER ONLY/);

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

test('reset, successful load, and delete-all cancel held model requests', function() {
  var scenarios = [
    {
      name: 'reset',
      run: function(model) { model.resetChatHistory(); }
    },
    {
      name: 'load',
      chatStore: {
        listChats: function() { return []; },
        getChat: function(id) { return { id: id, messages: [{ role: 'user', content: 'loaded' }] }; },
        deleteChat: function() { return false; },
        deleteAllChats: function() {},
        saveChatHistory: function() { return null; }
      },
      run: function(model) { assert.ok(model.loadSavedChat('saved')); }
    },
    {
      name: 'delete-all',
      run: function(model) { model.deleteAllSavedChats(); }
    }
  ];
  var i;
  var harness;
  var xhr;

  for (i = 0; i < scenarios.length; i += 1) {
    harness = createHarness({
      settings: { Endpoint: 'https://opencode.ai/zen/go/v1/responses', MaxToolCalls: 0 },
      chatStore: scenarios[i].chatStore
    });
    harness.model.requestCompletion(600 + i, 'held ' + scenarios[i].name);
    xhr = FakeXMLHttpRequest.last();
    scenarios[i].run(harness.model);

    assert.equal(xhr.aborted, true, scenarios[i].name + ' aborts held request');
    xhr.respond(200, { output_text: 'late answer' });
    assert.deepEqual(harness.watch.responses, [], scenarios[i].name + ' suppresses late answer');
    assert.deepEqual(harness.watch.canceledRequestIds, [600 + i]);
  }
});

test('active saved-chat deletion cancels completion, rotates session, and keeps live history', function() {
  var chatStore = {
    saved: [],
    listChats: function() { return []; },
    getChat: function() { return null; },
    deleteChat: function() { return true; },
    deleteAllChats: function() {},
    saveChatHistory: function(id, messages) {
      this.saved.push(messages);
      return { id: 'active-chat', title: 'Saved' };
    }
  };
  var harness = createHarness({
    settings: {
      Endpoint: 'https://opencode.ai/zen/go/v1/responses',
      MaxToolCalls: 0,
      PreserveChats: true
    },
    chatStore: chatStore
  });

  harness.model.requestCompletion(610, 'live prompt');
  var firstSession = FakeXMLHttpRequest.last().headers[opencodeSession.SESSION_HEADER];
  FakeXMLHttpRequest.last().respond(200, { output_text: 'live answer' });
  harness.model.requestCompletion(611, 'must not commit');
  var held = FakeXMLHttpRequest.last();

  assert.equal(harness.model.deleteSavedChat('active-chat'), true);
  assert.equal(held.aborted, true);
  held.respond(200, { output_text: 'stale answer' });

  harness.model.requestCompletion(612, 'after deletion');
  var next = FakeXMLHttpRequest.last();
  var body = JSON.parse(next.body);
  var session = next.headers[opencodeSession.SESSION_HEADER];
  var texts = body.input.slice(1).map(function(message) { return message.content[0].text; });

  assert.notEqual(session, firstSession);
  assert.deepEqual(texts, ['live prompt', 'live answer', 'after deletion']);
  assert.equal(chatStore.saved.length, 1, 'late completion never saves deleted-chat turn');
});

test('missing load and inactive-chat deletion leave active completion untouched', function() {
  var harness = createHarness({ settings: { MaxToolCalls: 0 } });

  harness.model.requestCompletion(620, 'kept prompt');
  var pending = FakeXMLHttpRequest.last();
  assert.equal(harness.model.loadSavedChat('missing'), null);
  assert.equal(harness.model.deleteSavedChat('inactive'), false);
  assert.equal(pending.aborted, false);

  pending.respond(200, { output_text: 'kept answer' });
  harness.model.requestCompletion(621, 'next');
  var input = JSON.parse(FakeXMLHttpRequest.last().body).input;

  assert.deepEqual(harness.watch.canceledRequestIds, []);
  assert.deepEqual(input.slice(1).map(function(message) { return message.content[0].text; }), [
    'kept prompt', 'kept answer', 'next'
  ]);
});

test('delayed discovery and tool callbacks cannot advance after reset', function() {
  var discoveryCallback;
  var discoveryTools = {
    discoverPhoneTools: function(settings, id, callback) { discoveryCallback = callback; },
    runToolCalls: function() {},
    formatToolCallLabel: function() { return 'Lookup'; }
  };
  var discoveryHarness = createHarness({ settings: { MaxToolCalls: 2 }, tools: discoveryTools });

  discoveryHarness.model.requestCompletion(630, 'discover');
  discoveryHarness.model.resetChatHistory();
  discoveryCallback(null, [], {});
  assert.equal(FakeXMLHttpRequest.instances.length, 0, 'stale discovery starts no model request');

  var runCallback;
  var runTools = {
    discoverPhoneTools: function(settings, id, callback) {
      callback(null, [{ name: 'lookup', description: 'Lookup', parameters: { type: 'object', properties: {} } }], {
        lookup: { kind: 'builtin', parameters: { type: 'object', properties: {} } }
      });
    },
    runToolCalls: function(id, calls, map, callback) { runCallback = callback; },
    formatToolCallLabel: function() { return 'Lookup'; }
  };
  var runHarness = createHarness({ settings: { MaxToolCalls: 2 }, tools: runTools });

  runHarness.model.requestCompletion(631, 'run tool');
  FakeXMLHttpRequest.last().respond(200, {
    output: [{ type: 'function_call', call_id: 'call-1', name: 'lookup', arguments: '{}' }]
  });
  assert.equal(FakeXMLHttpRequest.instances.length, 1);
  runHarness.model.resetChatHistory();
  runCallback([{ id: 'call-1', call_id: 'call-1', name: 'lookup', result: 'late' }]);
  assert.equal(FakeXMLHttpRequest.instances.length, 1, 'stale tool result starts no follow-up');
  assert.deepEqual(runHarness.watch.responses, []);
});

test('late watch send acknowledgement cannot commit history after reset', function() {
  var chatStore = {
    saved: [],
    listChats: function() { return []; },
    getChat: function() { return null; },
    deleteChat: function() { return false; },
    deleteAllChats: function() {},
    saveChatHistory: function(id, messages) { this.saved.push(messages); return { id: 'saved' }; }
  };
  var acknowledgement;
  var harness = createHarness({
    settings: { MaxToolCalls: 0, PreserveChats: true },
    chatStore: chatStore
  });

  harness.watch.sendResponse = function(id, settings, text, callback) { acknowledgement = callback; };
  harness.model.requestCompletion(640, 'unacked prompt');
  FakeXMLHttpRequest.last().respond(200, { output_text: 'unacked answer' });
  assert.equal(chatStore.saved.length, 0);

  harness.model.resetChatHistory();
  acknowledgement(null);
  assert.equal(chatStore.saved.length, 0);

  harness.model.requestCompletion(641, 'fresh prompt');
  var input = JSON.parse(FakeXMLHttpRequest.last().body).input;
  assert.deepEqual(input.slice(1).map(function(message) { return message.content[0].text; }), ['fresh prompt']);
});

test('model error completion remains active through watch acknowledgement and reset invalidates it', function() {
  var harness = createHarness({ settings: { MaxToolCalls: 0 } });
  var errorAcknowledgement;

  harness.watch.sendError = function(id, message, callback) {
    harness.watch.errors.push(message);
    errorAcknowledgement = callback;
  };
  harness.model.requestCompletion(645, 'unauthorized');
  FakeXMLHttpRequest.last().respond(401, 'unauthorized');

  assert.deepEqual(harness.watch.errors, ['HTTP 401: unauthorized']);
  assert.deepEqual(harness.watch.finishedRequestIds, [], 'error lifecycle waits for watch transfer');
  assert.equal(harness.watch.isCurrentRequest(645), true);

  harness.model.resetChatHistory();
  assert.deepEqual(harness.watch.canceledRequestIds, [645]);
  errorAcknowledgement(null);
  assert.deepEqual(harness.watch.finishedRequestIds, [], 'late error ACK cannot finish a later lifecycle');

  harness.model.requestCompletion(646, 'fresh');
  FakeXMLHttpRequest.last().respond(200, { output_text: 'fresh answer' });
  assert.deepEqual(harness.watch.responses, ['fresh answer']);
  assert.deepEqual(harness.watch.finishedRequestIds, [646]);
});

test('delivered model error finishes lifecycle without retaining active context', function() {
  var harness = createHarness({ settings: { MaxToolCalls: 0 } });

  harness.model.requestCompletion(647, 'unauthorized');
  FakeXMLHttpRequest.last().respond(401, 'unauthorized');
  assert.deepEqual(harness.watch.finishedRequestIds, [647]);

  harness.model.requestCompletion(648, 'next');
  FakeXMLHttpRequest.last().respond(200, { output_text: 'answer' });
  assert.deepEqual(harness.watch.finishedRequestIds, [647, 648]);
});

test('reset clears transient retry timer and next OpenCode request uses rotated session', function() {
  var timers = installFakeTimers();
  var harness;
  var firstSession;
  var nextSession;

  try {
    harness = createHarness({
      useGlobalTimers: true,
      settings: { Endpoint: 'https://opencode.ai/zen/go/v1/responses', MaxToolCalls: 0 }
    });
    harness.model.requestCompletion(650, 'retry later');
    firstSession = FakeXMLHttpRequest.last().headers[opencodeSession.SESSION_HEADER];
    FakeXMLHttpRequest.last().respond(429, 'rate limited', { 'Retry-After': '5' });
    assert.equal(timers.timers.length, 1);
    harness.model.resetChatHistory();
    assert.equal(timers.timers[0].cleared, true);
    timers.runAll();
    assert.equal(FakeXMLHttpRequest.instances.length, 1, 'canceled retry sends no XHR');

    harness.model.requestCompletion(651, 'fresh session');
    nextSession = FakeXMLHttpRequest.last().headers[opencodeSession.SESSION_HEADER];
    assert.notEqual(nextSession, firstSession);
    assert.equal(FakeXMLHttpRequest.instances.length, 2);
  } finally {
    timers.restore();
  }
});

test('cancel aborts current model XHR, suppresses late response, and is idempotent', function() {
  var harness = createHarness({ settings: { MaxToolCalls: 0 } });
  var request;

  harness.model.requestCompletion(660, 'cancel this');
  request = FakeXMLHttpRequest.last();
  assert.equal(harness.model.cancelCompletion(660), true);
  assert.equal(request.aborted, true);
  assert.equal(harness.model.cancelCompletion(660), false, 'duplicate cancel is ignored');
  request.respond(200, { output_text: 'late answer' });

  assert.deepEqual(harness.watch.responses, []);
  assert.deepEqual(harness.watch.errors, []);
  assert.deepEqual(harness.watch.canceledRequestIds, [660]);
});

test('cancel clears scheduled model retry timer before another HTTP attempt', function() {
  var timers = installFakeTimers();
  var harness;

  try {
    harness = createHarness({
      useGlobalTimers: true,
      settings: { ApiMode: 'responses', MaxToolCalls: 0 }
    });
    harness.model.requestCompletion(661, 'cancel retry');
    FakeXMLHttpRequest.last().respond(429, 'rate limited', { 'Retry-After': '5' });
    assert.equal(timers.timers.length, 1);
    assert.equal(harness.model.cancelCompletion(661), true);
    assert.equal(timers.timers[0].cleared, true);
    timers.runAll();
    assert.equal(FakeXMLHttpRequest.instances.length, 1);
    assert.deepEqual(harness.watch.errors, []);
  } finally {
    timers.restore();
  }
});

test('cancel aborts MCP discovery request and prevents later discovery stages', function() {
  var timers = installFakeTimers();
  var settings = common.extend(common.DEFAULT_SETTINGS, {
    Endpoint: 'https://api.example.test/v1/responses',
    ApiKey: 'test-key',
    Model: 'test-model',
    MaxToolCalls: 2,
    McpServersJson: JSON.stringify([{ enabled: true, label: 'Server', url: 'https://mcp.example.test' }])
  });
  var harness;
  var request;

  try {
    harness = createHarness({
      useGlobalTimers: true,
      settings: settings,
      createTools: function(watch) { return createRealMcpTools(settings, watch); }
    });
    harness.model.requestCompletion(662, 'cancel MCP discovery');
    request = FakeXMLHttpRequest.last();
    assert.match(request.url, /mcp\.example\.test/);
    assert.equal(harness.model.cancelCompletion(662), true);
    assert.equal(request.aborted, true);
    request.respond(200, { result: { protocolVersion: '2025-06-18' } });
    timers.runAll();
    assert.equal(FakeXMLHttpRequest.instances.length, 1);
    assert.deepEqual(harness.watch.responses, []);
    assert.deepEqual(harness.watch.errors, []);
  } finally {
    timers.restore();
  }
});

test('setup failure retries with corrected settings and model failure retries same user turn', function() {
  var setupHarness = createHarness({ settings: { Endpoint: '', MaxToolCalls: 0 } });

  setupHarness.model.requestCompletion(670, 'setup prompt');
  assert.deepEqual(setupHarness.watch.retryAvailableErrors, [true]);
  setupHarness.settings.Endpoint = 'https://api.example.test/v1/responses';
  assert.equal(setupHarness.model.retryCompletion(671, 670), true);
  assert.equal(FakeXMLHttpRequest.instances.length, 1);
  assert.deepEqual(JSON.parse(FakeXMLHttpRequest.last().body).input[1].content[0].text,
      'setup prompt');
  FakeXMLHttpRequest.last().respond(200, { output_text: 'setup fixed' });

  var modelHarness = createHarness({ settings: { ApiMode: 'responses', MaxToolCalls: 0 } });
  modelHarness.model.requestCompletion(672, 'same prompt');
  FakeXMLHttpRequest.last().respond(401, 'unauthorized');
  assert.deepEqual(modelHarness.watch.retryAvailableErrors, [true]);
  assert.equal(modelHarness.model.retryCompletion(673, 672), true);
  assert.equal(JSON.parse(FakeXMLHttpRequest.last().body).input[1].content[0].text,
      'same prompt');
  FakeXMLHttpRequest.last().respond(200, { output_text: 'retried answer' });
  assert.deepEqual(modelHarness.watch.responses, ['retried answer']);
  assert.deepEqual(modelHarness.watch.finishedRequestIds, [672, 673]);
});

test('before-tools retry accepts changed tool settings and rediscovers against original history', function() {
  var discoveries = [];
  var tools = {
    discoverPhoneTools: function(settings, requestId, callback) {
      var name = settings.WebSearchEnabled ? 'fresh_web_tool' : 'old_web_tool';
      var definition = { name: name, description: name, parameters: { type: 'object', properties: {} } };
      var map = {};
      discoveries.push({
        MaxToolCalls: settings.MaxToolCalls,
        WebSearchEnabled: settings.WebSearchEnabled,
        McpServersJson: settings.McpServersJson
      });
      map[name] = { kind: 'builtin', parameters: definition.parameters };
      callback(null, [definition], map);
    },
    runToolCalls: function(requestId, calls, map, callback) { callback([]); },
    formatToolCallLabel: function(call) { return call.name; }
  };
  var harness = createHarness({
    settings: { ApiMode: 'responses', MaxToolCalls: 0 },
    tools: tools
  });
  var retryBody;

  harness.model.requestCompletion(674, 'First turn');
  FakeXMLHttpRequest.last().respond(200, { output_text: 'First answer' });

  harness.settings.MaxToolCalls = 1;
  harness.settings.WebSearchEnabled = false;
  harness.settings.McpServersJson = '[]';
  harness.model.requestCompletion(675, 'Retry this turn');
  FakeXMLHttpRequest.last().respond(401, 'unauthorized before tool use');
  assert.deepEqual(discoveries, [{ MaxToolCalls: 1, WebSearchEnabled: false, McpServersJson: '[]' }]);

  harness.settings.MaxToolCalls = 4;
  harness.settings.WebSearchEnabled = true;
  harness.settings.McpServersJson = JSON.stringify([
    { enabled: true, label: 'Fresh', url: 'https://fresh.example.test' }
  ]);
  assert.equal(harness.model.retryCompletion(676, 675), true);
  assert.deepEqual(discoveries[1], {
    MaxToolCalls: 4,
    WebSearchEnabled: true,
    McpServersJson: harness.settings.McpServersJson
  });

  retryBody = JSON.parse(FakeXMLHttpRequest.last().body);
  assert.ok(retryBody.tools.some(function(tool) { return tool.name === 'fresh_web_tool'; }));
  assert.ok(!retryBody.tools.some(function(tool) { return tool.name === 'old_web_tool'; }));
  assert.deepEqual(retryBody.input.slice(1), [
    { role: 'user', content: [{ type: 'input_text', text: 'First turn' }] },
    { role: 'assistant', content: [{ type: 'output_text', text: 'First answer' }] },
    { role: 'user', content: [{ type: 'input_text', text: 'Retry this turn' }] }
  ]);
});

test('stale retry, canceled retry, and new prompt cannot reuse a failed request capsule', function() {
  var staleHarness = createHarness({ settings: { ApiMode: 'responses', MaxToolCalls: 0 } });
  staleHarness.model.requestCompletion(680, 'failed');
  FakeXMLHttpRequest.last().respond(401, 'unauthorized');
  assert.equal(staleHarness.model.retryCompletion(682, 681), false);
  assert.equal(staleHarness.model.retryCompletion(682, 680), true);
  FakeXMLHttpRequest.last().respond(200, { output_text: 'ok' });
  assert.equal(staleHarness.model.retryCompletion(683, 680), false,
      'old terminal request cannot retry after successful retry');

  var activeHarness = createHarness({ settings: { ApiMode: 'responses', MaxToolCalls: 0 } });
  activeHarness.model.requestCompletion(679, 'keep active request');
  var activeXhr = FakeXMLHttpRequest.last();
  assert.equal(activeHarness.model.retryCompletion(681, 679), false,
      'invalid retry cannot replace unrelated active completion');
  assert.equal(activeXhr.aborted, false);
  activeXhr.respond(200, { output_text: 'active request survived' });
  assert.deepEqual(activeHarness.watch.responses, ['active request survived']);

  var cancelHarness = createHarness({ settings: { ApiMode: 'responses', MaxToolCalls: 0 } });
  cancelHarness.model.requestCompletion(684, 'failed then canceled');
  FakeXMLHttpRequest.last().respond(401, 'unauthorized');
  assert.equal(cancelHarness.model.cancelCompletion(684), true);
  assert.equal(cancelHarness.model.retryCompletion(685, 684), false);
  assert.equal(cancelHarness.model.retryCompletion(686, 684), false);
  assert.equal(FakeXMLHttpRequest.instances.length, 1,
      'repeated canceled retries start no model request');

  var newPromptHarness = createHarness({ settings: { ApiMode: 'responses', MaxToolCalls: 0 } });
  newPromptHarness.model.requestCompletion(686, 'failed');
  FakeXMLHttpRequest.last().respond(401, 'unauthorized');
  newPromptHarness.model.requestCompletion(687, 'new prompt');
  assert.equal(newPromptHarness.model.retryCompletion(688, 686), false);
  assert.equal(FakeXMLHttpRequest.instances.length, 2);

  var expiredHarness = createHarness({ settings: { ApiMode: 'responses', MaxToolCalls: 0 } });
  expiredHarness.model.requestCompletion(689, 'expired');
  FakeXMLHttpRequest.last().respond(401, 'unauthorized');
  assert.equal(expiredHarness.watch.retryAvailableErrors[0], true);
  expiredHarness.model.resetChatHistory();
  assert.equal(expiredHarness.model.retryCompletion(691, 689), true);
  assert.equal(expiredHarness.watch.retryAvailableErrors[1], false);
  assert.equal(expiredHarness.model.retryCompletion(692, 691), true);
  assert.equal(expiredHarness.watch.retryAvailableErrors[2], false);
  assert.equal(FakeXMLHttpRequest.instances.length, 1,
      'expired-generation retries start no model request');
});

function recoveryMutationTools(calls, discoveries) {
  return {
    discoverPhoneTools: function(settings, requestId, callback) {
      if (discoveries) {
        discoveries.push(requestId);
      }
      callback(null, [{
        name: 'pebble_timeline_create_pin',
        description: 'Create a Timeline pin',
        parameters: { type: 'object', properties: { title: { type: 'string' } } }
      }], {
        pebble_timeline_create_pin: { kind: 'builtin', parameters: { type: 'object', properties: {} } }
      });
    },
    runToolCalls: function(requestId, toolCalls, toolMap, callback) {
      calls.push(toolCalls.map(function(call) { return call.name; }));
      callback(toolCalls.map(function(call) {
        return {
          id: call.id,
          call_id: call.call_id,
          name: call.name,
          result: JSON.stringify({ status: 'success', id: 'pin-1', title: 'Event' })
        };
      }));
    },
    formatToolCallLabel: function(call) { return call.name; }
  };
}

function recoveryToolResponse(protocol, asText) {
  var call = {
    id: 'call-recovery',
    name: 'pebble_timeline_create_pin',
    arguments: { title: 'Event' }
  };
  if (asText) {
    return { output_text: JSON.stringify({ tool_calls: [call] }) };
  }
  if (protocol === 'responses') {
    return { output: [{
      type: 'function_call', call_id: call.id, name: call.name,
      arguments: JSON.stringify(call.arguments)
    }] };
  }
  if (protocol === 'chat') {
    return { choices: [{ message: { tool_calls: [{
      id: call.id,
      type: 'function',
      function: { name: call.name, arguments: JSON.stringify(call.arguments) }
    }] } }] };
  }
  return { content: [{ type: 'tool_use', id: call.id, name: call.name, input: call.arguments }] };
}

test('post-mutation model failure retries final-answer-only across provider shapes', function() {
  var cases = [
    { name: 'Responses native', protocol: 'responses', apiMode: 'responses', endpoint: 'https://api.example.test/v1/responses' },
    { name: 'Chat Completions native', protocol: 'chat', apiMode: 'chat-completions', endpoint: 'https://api.example.test/v1/chat/completions' },
    { name: 'Messages native', protocol: 'messages', apiMode: 'messages', endpoint: 'https://api.anthropic.example.test/v1/messages' },
    { name: 'Responses text fallback', protocol: 'responses', apiMode: 'responses', endpoint: 'https://api.example.test/v1/responses', textFallback: true }
  ];
  var i;
  var item;
  var mutationCalls;
  var harness;
  var firstModelIndex;
  var followUp;
  var recovery1;
  var recovery2;
  var body;
  var userTexts;

  for (i = 0; i < cases.length; i += 1) {
    item = cases[i];
    mutationCalls = [];
    harness = createHarness({
      settings: { ApiMode: item.apiMode, Endpoint: item.endpoint, MaxToolCalls: 2 },
      tools: recoveryMutationTools(mutationCalls)
    });
    harness.model.requestCompletion(690 + i * 10, 'Create one event');
    firstModelIndex = 0;
    if (item.textFallback) {
      FakeXMLHttpRequest.instances[0].respond(400, 'native tools unsupported');
      firstModelIndex = 1;
    }
    FakeXMLHttpRequest.instances[firstModelIndex].respond(200,
        recoveryToolResponse(item.protocol, item.textFallback));
    followUp = FakeXMLHttpRequest.last();
    assert.equal(mutationCalls.length, 1, item.name + ': mutation completed once');
    followUp.respond(401, 'model failed after mutation');
    assert.equal(harness.watch.retryAvailableErrors[harness.watch.retryAvailableErrors.length - 1], true,
        item.name + ': bounded tool results allow safe final-only retry');

    assert.equal(harness.model.retryCompletion(691 + i * 10, 690 + i * 10), true);
    recovery1 = FakeXMLHttpRequest.last();
    body = JSON.parse(recovery1.body);
    assert.equal(body.tools, undefined, item.name + ': first manual recovery cannot execute tools');
    if (item.textFallback) {
      assert.match(common.safeJson(body.input), /Tool results:/,
          item.name + ': recorded text-tool result is replayed');
      assert.match(common.safeJson(body.input), /pin-1/,
          item.name + ': recorded mutation result is retained');
    } else if (item.protocol === 'responses') {
      assert.ok(body.input.some(function(entry) { return entry.type === 'function_call_output'; }),
          item.name + ': recorded Responses tool result is replayed');
    } else if (item.protocol === 'chat') {
      assert.ok(body.messages.some(function(entry) { return entry.role === 'tool'; }),
          item.name + ': recorded Chat tool result is replayed');
    } else {
      assert.ok(body.messages.some(function(entry) {
        return entry.role === 'user' && Array.isArray(entry.content) &&
          entry.content.some(function(part) { return part.type === 'tool_result'; });
      }), item.name + ': recorded Messages tool result is replayed');
    }
    recovery1.respond(401, 'recovery model failed');
    assert.equal(harness.watch.retryAvailableErrors[harness.watch.retryAvailableErrors.length - 1], true,
        item.name + ': failed recovery retains same final-only capsule');

    assert.equal(harness.model.retryCompletion(692 + i * 10, 691 + i * 10), true);
    recovery2 = FakeXMLHttpRequest.last();
    assert.equal(JSON.parse(recovery2.body).tools, undefined,
        item.name + ': second manual recovery still has no executable tools');
    recovery2.respond(200, recoveryToolResponse(item.protocol, item.textFallback));
    assert.equal(mutationCalls.length, 1, item.name + ': generated recovery call never repeats mutation');
    assert.match(harness.watch.responses[harness.watch.responses.length - 1], /No additional actions were run/,
        item.name + ': recovery tool request gets bounded honest notice');

    harness.model.requestCompletion(693 + i * 10, 'What happened?');
    body = JSON.parse(FakeXMLHttpRequest.last().body);
    if (item.protocol === 'responses') {
      userTexts = body.input.filter(function(entry) { return entry.role === 'user'; }).map(function(entry) {
        return entry.content.map(function(part) { return part.text; }).join('');
      });
    } else {
      userTexts = body.messages.filter(function(entry) { return entry.role === 'user'; }).map(function(entry) {
        return typeof entry.content === 'string' ? entry.content : '';
      });
    }
    assert.equal(userTexts.filter(function(text) { return text === 'Create one event'; }).length, 1,
        item.name + ': successful retry stores one user turn');
    assert.equal(harness.watch.finishedRequestIds.filter(function(id) {
      return id === 691 + i * 10 || id === 692 + i * 10;
    }).length, 2, item.name + ': retry lifecycle terminals are idempotent');
  }
});

test('watch-delivery retry resends prepared text without a model or tool call and saves one turn', function() {
  var chatStore = {
    saved: [],
    listChats: function() { return []; },
    getChat: function() { return null; },
    deleteChat: function() { return false; },
    deleteAllChats: function() {},
    saveChatHistory: function(id, messages) {
      this.saved.push(messages);
      return { id: 'delivery-chat', title: 'Delivery' };
    }
  };
  var harness = createHarness({
    settings: { ApiMode: 'responses', MaxToolCalls: 0, PreserveChats: true },
    chatStore: chatStore
  });
  var sendCount = 0;
  var offered = false;

  harness.watch.sendResponse = function(id, settings, text, callback, onTransferFailure) {
    sendCount += 1;
    if (sendCount === 1) {
      offered = onTransferFailure(new Error('watch unavailable'), 'Prepared: delivery answer');
      callback(new Error('watch unavailable'));
      return;
    }
    harness.watch.responses.push(text);
    callback(null);
  };
  harness.watch.sendPreparedResponse = function(id, text, callback) {
    harness.watch.preparedResponses.push(text);
    harness.watch.responses.push(text);
    callback(null);
  };

  harness.model.requestCompletion(710, 'deliver this');
  FakeXMLHttpRequest.last().respond(200, { output_text: 'delivery answer' });
  assert.equal(offered, true);
  assert.equal(harness.watch.finishedRequestIds[0], 710);
  assert.equal(harness.model.retryCompletion(711, 710), true);
  assert.deepEqual(harness.watch.preparedResponses, ['Prepared: delivery answer']);
  assert.equal(FakeXMLHttpRequest.instances.length, 1, 'delivery retry makes no model request');
  assert.equal(chatStore.saved.length, 1, 'successful transfer commits one saved turn');
  assert.deepEqual(chatStore.saved[0].slice(-2), [
    { role: 'user', content: 'deliver this' },
    { role: 'assistant', content: 'delivery answer' }
  ]);

  harness.model.requestCompletion(712, 'next');
  var input = JSON.parse(FakeXMLHttpRequest.last().body).input;
  assert.deepEqual(input.slice(1).map(function(entry) {
    return entry.content[0].text;
  }), ['deliver this', 'delivery answer', 'next']);
});

test('oversized retry capsules disable retry without truncating recovery records', function() {
  var large = new Array(500001).join('x');
  var setupHarness = createHarness({ settings: { Endpoint: '' } });
  var beforeToolsHarness;
  var beforeToolDiscoveries = [];
  var beforeToolMutations = [];
  var cases = [
    {
      name: '500KB function arguments',
      apiMode: 'responses',
      endpoint: 'https://api.example.test/v1/responses',
      response: { output: [{
        type: 'function_call', call_id: 'large-call', name: 'pebble_timeline_create_pin',
        arguments: JSON.stringify({ title: 'Event', metadata: large })
      }] }
    },
    {
      name: '500KB encrypted reasoning',
      apiMode: 'responses',
      endpoint: 'https://api.example.test/v1/responses',
      response: { output: [
        { type: 'reasoning', encrypted_content: large },
        { type: 'function_call', call_id: 'reasoning-call', name: 'pebble_timeline_create_pin', arguments: '{}' }
      ] }
    },
    {
      name: 'oversized settings snapshot',
      apiMode: 'responses',
      endpoint: 'https://api.example.test/v1/responses',
      systemPrompt: large,
      response: { output: [{
        type: 'function_call', call_id: 'settings-call', name: 'pebble_timeline_create_pin', arguments: '{}'
      }] }
    },
    {
      name: 'deep provider metadata',
      apiMode: 'messages',
      endpoint: 'https://api.example.test/v1/messages',
      response: null
    }
  ];
  var i;
  var item;
  var mutationCalls;
  var harness;
  var deepInput;
  var cursor;
  var j;
  var requestId;
  var xhrCount;
  var caseSettings;
  var retryFailedId;
  var retryAttempt;
  var discoveries;
  var freshBody;

  setupHarness.model.requestCompletion(730, large);
  assert.deepEqual(setupHarness.watch.retryAvailableErrors, [false],
      'oversized setup prompt has no retry capsule');
  setupHarness.settings.Endpoint = 'https://api.example.test/v1/responses';
  assert.equal(setupHarness.model.retryCompletion(732, 730), true,
      'missing setup capsule returns explicit unavailable error');
  assert.equal(setupHarness.watch.retryAvailableErrors[1], false);
  assert.equal(setupHarness.model.retryCompletion(733, 732), true,
      'unavailable setup retry cannot re-arm itself');
  assert.equal(setupHarness.watch.retryAvailableErrors[2], false);
  assert.equal(setupHarness.model.retryCompletion(734, 733), true,
      'repeated unavailable setup retry remains unavailable');
  assert.equal(setupHarness.watch.retryAvailableErrors[3], false);
  assert.equal(FakeXMLHttpRequest.instances.length, 0,
      'unavailable setup retries send no model request');
  setupHarness.model.requestCompletion(735, 'Fresh setup follow-up');
  freshBody = JSON.parse(FakeXMLHttpRequest.last().body);
  assert.deepEqual(freshBody.input.slice(1), [
    { role: 'user', content: [{ type: 'input_text', text: 'Fresh setup follow-up' }] }
  ], 'unavailable retries add no empty or fabricated history turn');
  FakeXMLHttpRequest.last().respond(200, { output_text: 'fresh answer' });

  beforeToolsHarness = createHarness({
    settings: { ApiMode: 'responses', MaxToolCalls: 2 },
    tools: recoveryMutationTools(beforeToolMutations, beforeToolDiscoveries)
  });
  beforeToolsHarness.model.requestCompletion(731, large);
  FakeXMLHttpRequest.last().respond(401, 'large prompt failed before tools');
  assert.equal(beforeToolsHarness.watch.retryAvailableErrors[0], false,
      'oversized before-tools prompt has no retry capsule');
  assert.equal(beforeToolDiscoveries.length, 1);
  xhrCount = FakeXMLHttpRequest.instances.length;
  retryFailedId = 731;
  for (retryAttempt = 0; retryAttempt < 3; retryAttempt += 1) {
    assert.equal(beforeToolsHarness.model.retryCompletion(retryFailedId + 1, retryFailedId), true,
        'repeated unavailable before-tools retry is handled without running work');
    assert.equal(beforeToolsHarness.watch.retryAvailableErrors[retryAttempt + 1], false);
    retryFailedId += 1;
  }
  assert.equal(FakeXMLHttpRequest.instances.length, xhrCount,
      'unavailable before-tools retries send no model request');
  assert.equal(beforeToolDiscoveries.length, 1,
      'unavailable before-tools retries do not rediscover tools');
  assert.equal(beforeToolMutations.length, 0,
      'unavailable before-tools retries execute no tools');

  for (i = 0; i < cases.length; i += 1) {
    item = cases[i];
    if (item.name === 'deep provider metadata') {
      deepInput = {};
      cursor = deepInput;
      for (j = 0; j < 40; j += 1) {
        cursor.next = {};
        cursor = cursor.next;
      }
      item.response = { content: [{
        type: 'tool_use', id: 'deep-call', name: 'pebble_timeline_create_pin', input: deepInput
      }] };
    }
    mutationCalls = [];
    discoveries = [];
    caseSettings = {
      ApiMode: item.apiMode,
      Endpoint: item.endpoint,
      MaxToolCalls: 2
    };
    if (item.systemPrompt) {
      caseSettings.SystemPrompt = item.systemPrompt;
    }
    harness = createHarness({
      settings: caseSettings,
      tools: recoveryMutationTools(mutationCalls, discoveries)
    });
    requestId = 740 + i * 2;
    harness.model.requestCompletion(requestId, 'Create one event');
    FakeXMLHttpRequest.last().respond(200, item.response);
    assert.equal(mutationCalls.length, 1, item.name + ': tool action completes once');
    FakeXMLHttpRequest.last().respond(401, 'model failed after tool action');

    assert.equal(harness.watch.retryAvailableErrors[harness.watch.retryAvailableErrors.length - 1], false,
        item.name + ': oversized or too-deep complete record disables retry');
    xhrCount = FakeXMLHttpRequest.instances.length;
    retryFailedId = requestId;
    for (retryAttempt = 0; retryAttempt < 3; retryAttempt += 1) {
      assert.equal(harness.model.retryCompletion(retryFailedId + 1, retryFailedId), true,
          item.name + ': forced retry receives explicit unavailable response');
      assert.equal(harness.watch.retryAvailableErrors[harness.watch.retryAvailableErrors.length - 1], false,
          item.name + ': unavailable retry cannot re-arm retry eligibility');
      assert.match(harness.watch.errors[harness.watch.errors.length - 1], /Retry is no longer available/);
      retryFailedId += 1;
    }
    assert.equal(FakeXMLHttpRequest.instances.length, xhrCount,
        item.name + ': repeated retry sends no incomplete or oversized model request');
    assert.equal(discoveries.length, 1,
        item.name + ': unavailable retries do not rediscover tools');
    assert.equal(mutationCalls.length, 1, item.name + ': rejected retry never repeats side effect');
  }

  var deliveryHarness = createHarness({ settings: { ApiMode: 'responses', MaxToolCalls: 0 } });
  deliveryHarness.watch.sendResponse = function(id, settings, text, callback, onTransferFailure) {
    var retryAvailable = onTransferFailure(new Error('watch unavailable'), large);
    deliveryHarness.watch.sendError(id, 'delivery failed', callback, retryAvailable);
  };
  deliveryHarness.model.requestCompletion(790, 'deliver safely');
  FakeXMLHttpRequest.last().respond(200, { output_text: 'small answer' });
  assert.deepEqual(deliveryHarness.watch.retryAvailableErrors, [false],
      'oversized prepared delivery text cannot be clipped into a retry capsule');
});
