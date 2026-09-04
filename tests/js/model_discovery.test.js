'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var FakeXMLHttpRequest = require('./helpers/fake_xhr');
var discovery = require('../../src/pkjs/model_discovery');
var opencodeSession = require('../../src/pkjs/opencode_session');

test.beforeEach(function() {
  FakeXMLHttpRequest.reset();
  opencodeSession.resetForTests();
  global.XMLHttpRequest = FakeXMLHttpRequest;
});

test.afterEach(function() {
  delete global.XMLHttpRequest;
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
