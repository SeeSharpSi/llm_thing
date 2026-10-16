'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var FakeXMLHttpRequest = require('./helpers/fake_xhr');
var FakeLocalStorage = require('./helpers/fake_local_storage');
var discovery = require('../../src/pkjs/model_discovery');
var opencodeSession = require('../../src/pkjs/opencode_session');
var discoveryPath = require.resolve('../../src/pkjs/model_discovery');

test.beforeEach(function() {
  FakeXMLHttpRequest.reset();
  opencodeSession.resetForTests();
  global.XMLHttpRequest = FakeXMLHttpRequest;
  global.localStorage = new FakeLocalStorage();
});

test.afterEach(function() {
  delete global.XMLHttpRequest;
  delete global.localStorage;
  opencodeSession.resetForTests();
});

test('derives model URLs and normalizes OpenAI model lists', function() {
  assert.equal(discovery.deriveModelsUrl('https://api.openai.com/v1/responses'), 'https://api.openai.com/v1/models');
  assert.equal(discovery.deriveModelsUrl('https://example.test/openai/v1/chat/completions/'), 'https://example.test/openai/v1/models');
  assert.equal(discovery.deriveModelsUrl('https://example.test/v1/messages'), 'https://example.test/v1/models');
  assert.equal(discovery.deriveModelsUrl('https://example.test/messages'), 'https://example.test/models');
  assert.equal(discovery.deriveModelsUrl('https://example.test/v1/Messages/'), 'https://example.test/v1/models');
  assert.equal(discovery.deriveModelsUrl('HTTPS://Example.Test/v1/messages?ignored=1#frag'), 'HTTPS://Example.Test/v1/models');
  assert.equal(discovery.deriveModelsUrl('https://example.test/v1/models?ignored=1'), 'https://example.test/v1/models');
  assert.equal(discovery.deriveModelsUrl('https://user:secret@example.test/v1/messages'), 'https://user:secret@example.test/v1/models');
  assert.equal(discovery.deriveModelsUrl('https://Messages.example.test/V1/Messages/'), 'https://Messages.example.test/V1/models');

  assert.equal(discovery.deriveModelsUrl('https://messages'), '');
  assert.equal(discovery.deriveModelsUrl('https://messages/'), '');
  assert.equal(discovery.deriveModelsUrl('https://responses/'), '');
  assert.equal(discovery.deriveModelsUrl('https://chat/completions'), '');

  assert.equal(discovery.deriveModelsUrl(''), '');
  assert.equal(discovery.deriveModelsUrl('   '), '');
  assert.equal(discovery.deriveModelsUrl('https://'), '');
  assert.equal(discovery.deriveModelsUrl('https:///v1/messages'), '');
  assert.equal(discovery.deriveModelsUrl('//example.test/v1/responses'), '');
  assert.equal(discovery.deriveModelsUrl('ftp://example.test/v1/responses'), '');
  assert.equal(discovery.deriveModelsUrl('not-a-url'), '');

  assert.equal(discovery.deriveModelsUrl('https://example.test/v1/completions'), '');
  assert.equal(discovery.deriveModelsUrl('https://example.test/v1/messages.txt'), '');
  assert.equal(discovery.deriveModelsUrl('https://example.test/v1/messages/extra'), '');

  assert.deepEqual(discovery.parseModels(JSON.stringify({
    data: [{ id: ' model-b ' }, { id: 'model-a' }, { id: 'model-b' }, { id: 'constructor' }, {}]
  })), ['constructor', 'model-a', 'model-b']);
  assert.deepEqual(discovery.parseModels('{bad'), []);
});

test('discovers models through phone-side XHR', function() {
  var result;

  discovery.discover({
    Endpoint: 'https://example.test/v1/responses',
    ApiKey: 'test-secret'
  }, function(value) {
    result = value;
  });
  var request = FakeXMLHttpRequest.last();

  assert.equal(request.method, 'GET');
  assert.equal(request.url, 'https://example.test/v1/models');
  assert.equal(request.headers.Authorization, 'Bearer test-secret');
  assert.equal(request.headers[opencodeSession.SESSION_HEADER], undefined);
  assert.equal(request.timeout, 15000);
  request.respond(200, { data: [{ id: 'model-b' }, { id: 'model-a' }] });

  assert.deepEqual(result.models, ['model-a', 'model-b']);
  assert.equal(result.status, '2 models loaded.');
});

test('OpenCode Go model discovery sends the session header', function() {
  var result;

  discovery.discover({
    Endpoint: 'https://opencode.ai/zen/go/v1/responses',
    ApiKey: 'test-secret'
  }, function(value) {
    result = value;
  });
  var request = FakeXMLHttpRequest.last();

  assert.equal(request.method, 'GET');
  assert.equal(request.url, 'https://opencode.ai/zen/go/v1/models');
  assert.equal(request.headers.Authorization, 'Bearer test-secret');
  assert.equal(request.headers[opencodeSession.SESSION_HEADER], opencodeSession.getConversationSessionId());
  request.respond(200, { data: [{ id: 'model-a' }] });

  assert.deepEqual(result.models, ['model-a']);
});

test('returns manual-entry status for missing settings and provider failures', function() {
  var result;

  discovery.discover({ Endpoint: '', ApiKey: 'secret' }, function(value) { result = value; });
  assert.equal(FakeXMLHttpRequest.instances.length, 0);
  assert.match(result.status, /Enter an endpoint/);

  discovery.discover({ Endpoint: 'https://example.test/v1/responses', ApiKey: 'secret' }, function(value) { result = value; });
  FakeXMLHttpRequest.last().respond(403, { error: { message: 'secret response' } });
  assert.equal(result.status, 'Could not load models (HTTP 403). Manual entry remains available.');
  assert.doesNotMatch(result.status, /secret response/);

  discovery.discover({ Endpoint: 'https://example.test/v1/responses', ApiKey: 'secret' }, function(value) { result = value; });
  FakeXMLHttpRequest.last().networkError();
  assert.match(result.status, /Manual entry remains available/);

  discovery.discover({ Endpoint: 'https://example.test/v1/responses', ApiKey: 'secret' }, function(value) { result = value; });
  FakeXMLHttpRequest.last().timeOut();
  assert.match(result.status, /timed out/);
});

test('cached lookup gives immediate manual-entry guidance for missing or invalid settings', function() {
  assert.match(discovery.getCached({ Endpoint: '', ApiKey: 'secret' }).status, /endpoint/);
  assert.match(discovery.getCached({ Endpoint: 'https://example.test/v1/responses', ApiKey: '' }).status, /API key/);
  assert.match(discovery.getCached({ Endpoint: 'https://example.test/v1/completions', ApiKey: 'secret' }).status, /derive a models URL/);
  assert.equal(FakeXMLHttpRequest.instances.length, 0);
});

test('refresh caches bounded normalized model lists without storing credentials and survives module reload', function() {
  var result;
  var settings = { Endpoint: 'https://example.test/v1/responses', ApiKey: 'private-test-key' };
  var stored;
  var reloaded;

  discovery.refresh(settings, function(value) { result = value; });
  FakeXMLHttpRequest.last().respond(200, { data: [{ id: 'model-b' }, { id: 'model-a' }, { id: 'model-a' }] });
  assert.deepEqual(result.models, ['model-a', 'model-b']);
  assert.match(result.status, /cached models/);

  stored = global.localStorage.getItem(discovery.cacheKey);
  assert.ok(stored);
  assert.equal(stored.indexOf(settings.ApiKey), -1, 'raw API key is absent from cache contents');
  assert.equal(Object.keys(global.localStorage.values).some(function(key) { return key.indexOf(settings.ApiKey) !== -1; }), false,
    'raw API key is absent from storage keys');

  delete require.cache[discoveryPath];
  reloaded = require('../../src/pkjs/model_discovery');
  assert.deepEqual(reloaded.getCached(settings), result);
  assert.equal(FakeXMLHttpRequest.instances.length, 1, 'opening cached data makes no request');
});

test('cache scope separates provider endpoint and API credential', function() {
  var settings = { Endpoint: 'https://one.example/v1/responses', ApiKey: 'key-one' };
  var result;

  discovery.refresh(settings, function(value) { result = value; });
  FakeXMLHttpRequest.last().respond(200, { data: [{ id: 'one-model' }] });
  assert.deepEqual(discovery.getCached(settings).models, ['one-model']);
  assert.deepEqual(discovery.getCached({ Endpoint: 'https://two.example/v1/responses', ApiKey: 'key-one' }).models, []);
  assert.deepEqual(discovery.getCached({ Endpoint: settings.Endpoint, ApiKey: 'key-two' }).models, []);
});

test('failed refresh retains last successful list and persists failure status', function() {
  var settings = { Endpoint: 'https://example.test/v1/responses', ApiKey: 'test-secret' };
  var result;

  discovery.refresh(settings, function(value) { result = value; });
  FakeXMLHttpRequest.last().respond(200, { data: [{ id: 'working-model' }] });

  discovery.refresh(settings, function(value) { result = value; });
  FakeXMLHttpRequest.last().respond(503, { error: { message: 'secret response' } });

  assert.deepEqual(result.models, ['working-model']);
  assert.match(result.status, /Refresh failed/);
  assert.match(result.status, /cached model/);
  assert.doesNotMatch(result.status, /secret response|test-secret/);
  assert.deepEqual(discovery.getCached(settings), result);
});

test('overlapping refreshes cannot store one provider list in another provider scope', function() {
  var first = { Endpoint: 'https://one.example/v1/responses', ApiKey: 'same-key' };
  var second = { Endpoint: 'https://two.example/v1/responses', ApiKey: 'same-key' };
  var firstResult;
  var secondResult;

  discovery.refresh(first, function(value) { firstResult = value; });
  var firstRequest = FakeXMLHttpRequest.last();
  discovery.refresh(second, function(value) { secondResult = value; });
  var secondRequest = FakeXMLHttpRequest.last();

  secondRequest.respond(200, { data: [{ id: 'second-model' }] });
  firstRequest.respond(200, { data: [{ id: 'first-model' }] });

  assert.deepEqual(discovery.getCached(first).models, ['first-model']);
  assert.deepEqual(discovery.getCached(second).models, ['second-model']);
  assert.deepEqual(firstResult.models, ['first-model']);
  assert.deepEqual(secondResult.models, ['second-model']);
});

test('older overlapping refresh cannot replace newer result for same provider scope', function() {
  var settings = { Endpoint: 'https://example.test/v1/responses', ApiKey: 'same-key' };
  var firstRequest;

  discovery.refresh(settings, function() {});
  firstRequest = FakeXMLHttpRequest.last();
  discovery.refresh(settings, function() {});
  FakeXMLHttpRequest.last().respond(200, { data: [{ id: 'newer-model' }] });
  firstRequest.respond(200, { data: [{ id: 'older-model' }] });

  assert.deepEqual(discovery.getCached(settings).models, ['newer-model']);
});

test('cache retains no more than configured entry limit', function() {
  var i;
  var settings;

  for (i = 0; i < discovery.maxCacheEntries + 2; i += 1) {
    settings = { Endpoint: 'https://provider-' + i + '.example/v1/responses', ApiKey: 'key-' + i };
    discovery.refresh(settings, function() {});
    FakeXMLHttpRequest.last().respond(200, { data: [{ id: 'model-' + i }] });
  }

  assert.equal(JSON.parse(global.localStorage.getItem(discovery.cacheKey)).length, discovery.maxCacheEntries);
});
