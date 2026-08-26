'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var path = require('node:path');
var FakeLocalStorage = require('./helpers/fake_local_storage');
var load = require('./helpers/load_with_stubs');

var storePath = path.resolve(__dirname, '../../src/pkjs/endpoint_cache');
var STORE_KEY = 'llm_thing_endpoint_cache_v1';
var dateRestore = null;

function loadCache(initial) {
  global.localStorage = new FakeLocalStorage(initial);
  load.clearModule(storePath);
  return require(storePath);
}

function installFakeClock(startMs, stepMs) {
  var OriginalDate = global.Date;
  var tick = startMs;

  global.Date = function FakeDate() {
    this.getTime = function() {
      tick += stepMs;
      return tick;
    };
  };

  return function() {
    global.Date = OriginalDate;
  };
}

function readRawEntries() {
  var parsed = JSON.parse(global.localStorage.getItem(STORE_KEY));
  return parsed && Array.isArray(parsed.entries) ? parsed.entries : null;
}

test.afterEach(function() {
  delete global.localStorage;
  load.clearModule(storePath);
  if (dateRestore) {
    dateRestore();
    dateRestore = null;
  }
});

test('missing, corrupt, wrong-version, and throwing storage read as empty cache', function() {
  var cache = loadCache();

  assert.equal(cache.get('https://api.example.com/v1/responses', 'model-a'), '');

  cache.remember('https://api.example.com/v1', 'model-a', 'responses');

  cache = loadCache({ llm_thing_endpoint_cache_v1: '{"version":2,"entries":[]}' });
  assert.equal(cache.get('https://api.example.com/v1', 'model-a'), '');

  cache = loadCache({ llm_thing_endpoint_cache_v1: '{not json at all' });
  assert.equal(cache.get('https://api.example.com/v1', 'model-a'), '');

  cache = loadCache({
    llm_thing_endpoint_cache_v1: JSON.stringify({
      version: 1,
      entries: [
        { provider: 'https://x.test/v1', model: 'm', protocol: 'nonsense', updatedAt: 5 },
        { provider: '', model: 'm', protocol: 'responses', updatedAt: 6 },
        { provider: 'https://y.test/v1', model: 7, protocol: 'responses', updatedAt: 7 },
        { provider: 'https://z.test/v1', model: 'm', protocol: 'responses', updatedAt: 'soon' }
      ]
    })
  });
  assert.equal(cache.get('https://x.test/v1', 'm'), '');
  assert.equal(cache.get('https://z.test/v1', 'm'), '');

  cache = loadCache();
  global.localStorage.getItem = function() {
    throw new Error('getItem failed');
  };
  assert.doesNotThrow(function() {
    assert.equal(cache.get('https://api.example.com/v1', 'model-a'), '');
  });
});

test('remember and get round trip for every valid protocol', function() {
  var cache = loadCache();

  assert.equal(cache.remember('https://a.test/v1', 'model-responses', 'responses'), true);
  assert.equal(cache.remember('https://b.test/v1', 'model-chat', 'chat-completions'), true);
  assert.equal(cache.remember('https://c.test/v1', 'model-messages', 'messages'), true);

  assert.equal(cache.get('https://a.test/v1', 'model-responses'), 'responses');
  assert.equal(cache.get('https://b.test/v1', 'model-chat'), 'chat-completions');
  assert.equal(cache.get('https://c.test/v1', 'model-messages'), 'messages');
  assert.equal(cache.get('https://a.test/v1', 'model-chat'), '');
});

test('invalid endpoint, model, and protocol are rejected without entries', function() {
  var cache = loadCache();

  assert.equal(cache.remember('https://a.test/v1', 'model-a', 'auto'), false);
  assert.equal(cache.remember('https://a.test/v1', 'model-a', 'Chat-Completions'), false);
  assert.equal(cache.remember('   ', 'model-a', 'responses'), false);
  assert.equal(cache.remember('', 'model-a', 'responses'), false);
  assert.equal(cache.remember('https://a.test/v1', '   ', 'responses'), false);
  assert.equal(cache.remember('https://a.test/v1', '', 'responses'), false);

  assert.deepEqual(JSON.parse(global.localStorage.getItem(STORE_KEY) || '{}'), {});
  assert.equal(cache.get('https://a.test/v1', 'model-a'), '');
});

test('equivalent endpoint variants share one learned entry', function() {
  var variants = [
    'https://api.example.com/v1',
    'HTTPS://API.EXAMPLE.COM/v1/',
    '   https://api.exAmple.COM/v1?api_key=sk-secret-key#fragment   ',
    'https://api.example.com/v1//',
    'https://api.example.com/v1/responses',
    'https://api.example.com/v1/chat/completions/',
    'https://api.example.com/v1/MESSAGES'
  ];
  var i;
  var cache = loadCache();

  assert.equal(cache.remember(variants[0], 'shared-model', 'chat-completions'), true);

  for (i = 1; i < variants.length; i += 1) {
    cache.remember(variants[i], 'other-model', 'responses');
  }

  for (i = 0; i < variants.length; i += 1) {
    assert.equal(cache.get(variants[i], 'shared-model'), 'chat-completions');
  }

  assert.equal(readRawEntries().length, 2);
  assert.equal(cache.get('http://api.example.com/v1', 'shared-model'), '');
});

test('different provider roots and model names do not collide, userinfo is ignored', function() {
  var entries;
  var cache = loadCache();

  cache.remember('https://one.test/v1', 'gpt-4', 'responses');
  cache.remember('https://two.test/v1', 'gpt-4', 'chat-completions');
  cache.remember('https://one.test/v2', 'gpt-4', 'messages');
  cache.remember('https://one.test/v1', 'GPT-4', 'messages');

  assert.equal(cache.get('https://ONE.TEST/v1/', ' gpt-4 '), 'responses');
  assert.equal(cache.get('https://two.test/v1', 'gpt-4'), 'chat-completions');
  assert.equal(cache.get('https://one.test/v2', 'gpt-4'), 'messages');
  assert.equal(cache.get('https://one.test/v1', 'GPT-4'), 'messages');

  entries = readRawEntries();
  assert.equal(entries.length, 4);
  assert.ok(entries.every(function(entry) { return entry.provider.indexOf('@') === -1; }));

  cache.remember('https://watch-user:sk-secret@one.test/v1', 'gpt-4', 'chat-completions');
  assert.equal(cache.get('https://user:other-secret@one.test/v1', 'gpt-4'), 'chat-completions');
  assert.equal(cache.get('https://one.test/v1', 'gpt-4'), 'chat-completions');
  assert.equal(readRawEntries().length, 4);
  assert.equal(cache.get('https://one.test:443/v1', 'gpt-4'), '');
});

test('protocol-named hostnames stay distinct identities', function() {
  var cache = loadCache();

  cache.remember('https://responses', 'model-a', 'responses');
  cache.remember('https://messages', 'model-a', 'chat-completions');

  assert.equal(readRawEntries().length, 2);
  assert.equal(cache.get('https://RESPONSES', 'model-a'), 'responses');
  assert.equal(cache.get('https://messages/', 'model-a'), 'chat-completions');
});

test('remember replaces the matching entry with the latest protocol and timestamp', function() {
  var cache = loadCache();

  cache.remember('https://api.example.com/v1/responses', 'model-a', 'responses');
  cache.remember('https://api.example.com/v1/chat/completions', 'model-a', 'chat-completions');
  cache.remember('https://api.example.com/v1/responses', 'model-b', 'messages');

  assert.equal(cache.get('https://api.example.com/v1', 'model-a'), 'chat-completions');
  assert.equal(cache.get('https://api.example.com/v1', 'model-b'), 'messages');
  assert.equal(readRawEntries().length, 2);
});

test('cache caps at 32 entries and evicts least-recent while refreshed entries survive', function() {
  var i;
  var entries;

  dateRestore = installFakeClock(1000000, 10);
  var cache = loadCache();

  for (i = 0; i < 32; i += 1) {
    assert.equal(cache.remember('https://provider-' + i + '.test/v1', 'model-a', 'responses'), true);
  }
  assert.equal(readRawEntries().length, 32);
  assert.equal(cache.get('https://provider-0.test/v1', 'model-a'), 'responses');

  cache.remember('https://provider-0.test/v1', 'model-a', 'chat-completions');
  assert.equal(cache.remember('https://extra.test/v1', 'model-a', 'messages'), true);

  entries = readRawEntries();
  assert.equal(entries.length, 32);
  assert.equal(cache.get('https://provider-0.test/v1', 'model-a'), 'chat-completions');
  assert.equal(cache.get('https://provider-1.test/v1', 'model-a'), '');
  assert.equal(cache.get('https://extra.test/v1', 'model-a'), 'messages');
});

test('equal-timestamp eviction follows deterministic insertion order', function() {
  var seeds = {};
  var initialEntries = [];
  var i;
  var cache;

  for (i = 0; i < 33; i += 1) {
    initialEntries.push({
      provider: 'https://provider-' + i + '.test/v1',
      model: 'm',
      protocol: 'responses',
      updatedAt: 1000
    });
  }
  seeds.llm_thing_endpoint_cache_v1 = JSON.stringify({ version: 1, entries: initialEntries });

  cache = loadCache(seeds);
  cache.remember('https://fresh.test/v1', 'm', 'chat-completions');

  assert.equal(readRawEntries().length, 32);
  assert.equal(cache.get('https://provider-0.test/v1', 'm'), 'responses');
  assert.equal(cache.get('https://provider-30.test/v1', 'm'), 'responses');
  assert.equal(cache.get('https://provider-31.test/v1', 'm'), '');
  assert.equal(cache.get('https://provider-32.test/v1', 'm'), '');
  assert.equal(cache.get('https://fresh.test/v1', 'm'), 'chat-completions');
});

test('storage write failures return false without corrupting stored data', function() {
  var cache = loadCache();

  cache.remember('https://keep.test/v1', 'model-a', 'responses');

  global.localStorage.failWrites = 1;
  assert.doesNotThrow(function() {
    assert.equal(cache.remember('https://fresh.test/v1', 'model-b', 'responses'), false);
  });

  assert.equal(cache.get('https://keep.test/v1', 'model-a'), 'responses');
  assert.equal(readRawEntries().length, 1);
  assert.equal(global.localStorage.values['some_other_key'], undefined);

  delete global.localStorage.failWrites;
  assert.doesNotThrow(function() {
    assert.equal(cache.get('https://keep.test/v1', 'model-a'), 'responses');
  });
});

test('unavailable localStorage never throws', function() {
  var cache = loadCache();
  delete global.localStorage;

  assert.doesNotThrow(function() {
    assert.equal(cache.get('https://api.example.com/v1', 'model-a'), '');
    assert.equal(cache.remember('https://api.example.com/v1', 'model-a', 'responses'), false);
  });
});

test('serialized cache never stores query strings, hashes, or URL credentials', function() {
  var raw;
  var cache = loadCache();

  cache.remember('https://user:sk-api-secret@api.example.com/v1?api_key=sk-super-secret&token=abc123#credhash', 'model-a', 'messages');

  raw = global.localStorage.getItem(STORE_KEY);
  assert.ok(raw.indexOf('user:') === -1, 'username leaked into cache');
  assert.ok(raw.indexOf('sk-api-secret') === -1, 'password leaked into cache');
  assert.ok(raw.indexOf('@') === -1, 'userinfo leaked into cache');
  assert.ok(raw.indexOf('sk-super-secret') === -1, 'query string leaked into cache');
  assert.ok(raw.indexOf('abc123') === -1, 'query value leaked into cache');
  assert.ok(raw.indexOf('credhash') === -1, 'hash fragment leaked into cache');
  assert.ok(raw.indexOf('?') === -1, 'cache contains a query string');
  assert.ok(raw.indexOf('#') === -1, 'cache contains a hash fragment');

  assert.equal(cache.get('https://api.example.com/v1/responses', 'model-a'), 'messages');
});
