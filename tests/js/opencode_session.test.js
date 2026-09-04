'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var session = require('../../src/pkjs/opencode_session');

test.beforeEach(function() {
  session.resetForTests();
});

test.afterEach(function() {
  session.resetForTests();
});

test('session id is stable until rotated', function() {
  var first = session.getConversationSessionId();
  var second = session.getConversationSessionId();

  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(second, first);
  assert.notEqual(session.rotateConversationSessionId(), first);
  assert.equal(session.getConversationSessionId(), session.getConversationSessionId());
});

test('detects opencode endpoints by host', function() {
  assert.equal(session.isOpencodeEndpoint('https://opencode.ai/zen/go/v1/responses'), true);
  assert.equal(session.isOpencodeEndpoint('https://foo.opencode.ai/zen/go/v1/chat/completions'), true);
  assert.equal(session.isOpencodeEndpoint('https://OPENCODE.AI/zen/go/v1/models'), true);
  assert.equal(session.isOpencodeEndpoint('https://api.openai.com/v1/responses'), false);
  assert.equal(session.isOpencodeEndpoint('https://notopencode.ai.example.test/v1/responses'), false);
  assert.equal(session.isOpencodeEndpoint(''), false);
  assert.equal(session.isOpencodeEndpoint(null), false);
});

test('applies session header only to opencode endpoints', function() {
  var headers = {};
  var request = {
    setRequestHeader: function(name, value) { headers[name] = value; }
  };

  assert.equal(session.applySessionHeader(request, 'https://opencode.ai/zen/go/v1/responses'), true);
  assert.equal(headers[session.SESSION_HEADER], session.getConversationSessionId());

  headers = {};
  assert.equal(session.applySessionHeader(request, 'https://api.openai.com/v1/responses'), false);
  assert.equal(headers[session.SESSION_HEADER], undefined);

  assert.equal(session.applySessionHeader(null, 'https://opencode.ai/zen/go/v1/responses'), false);
  assert.equal(session.applySessionHeader({}, 'https://opencode.ai/zen/go/v1/responses'), false);
});
