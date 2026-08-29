'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var path = require('node:path');
var FakeLocalStorage = require('./helpers/fake_local_storage');
var load = require('./helpers/load_with_stubs');

var storePath = path.resolve(__dirname, '../../src/pkjs/memory_store');

function loadStore(initial) {
  global.localStorage = new FakeLocalStorage(initial);
  return load.loadWithStubs(storePath, {});
}

test.afterEach(function() {
  delete global.localStorage;
  load.clearModule(storePath);
});

test('empty, corrupt, and unavailable storage are safe', function() {
  var store = loadStore();
  assert.deepEqual(store.listMemories(), []);
  global.localStorage.setItem(store.STORE_KEY, '{bad');
  assert.deepEqual(store.listMemories(), []);
  delete global.localStorage;
  assert.deepEqual(store.searchMemories('x'), []);
  assert.equal(store.addMemory('x'), null);
});

test('CRUD trims text and returns defensive copies', function() {
  var store = loadStore();
  var memory = store.addMemory('  Buy milk  ');
  assert.equal(memory.text, 'Buy milk');
  memory.text = 'changed';
  assert.equal(store.getMemory(memory.id).text, 'Buy milk');
  assert.equal(store.updateMemory(memory.id, '  Buy bread ' ).text, 'Buy bread');
  assert.equal(store.deleteMemory(memory.id), true);
  assert.equal(store.getMemory(memory.id), null);
  assert.equal(store.deleteMemory(memory.id), false);
});

test('bounds, search, ordering, and cap are enforced', function() {
  var store = loadStore();
  var i;
  var records = [];
  assert.equal(store.addMemory('   '), null);
  assert.equal(store.addMemory(new Array(502).join('x')), null);
  for (i = 0; i < 130; i += 1) {
    records.push({ id: 'id-' + i, text: 'note ' + i, createdAt: i + 1, updatedAt: i + 1 });
  }
  assert.equal(store.replaceMemories(records), true);
  assert.equal(store.listMemories().length, 128);
  assert.equal(store.listMemories(2)[0].id, 'id-129');
  assert.deepEqual(store.searchMemories('NOTE 12', 32).map(function(x) { return x.id; }), ['id-129', 'id-128', 'id-127', 'id-126', 'id-125', 'id-124', 'id-123', 'id-122', 'id-121', 'id-120', 'id-12']);
});

test('replace validates whole payload, preserves records, and clears atomically', function() {
  var store = loadStore();
  var record = { id: 'keep', text: 'Keep', createdAt: 10, updatedAt: 20, extra: 'drop' };
  assert.equal(store.replaceMemories([record]), true);
  assert.deepEqual(store.getMemory('keep'), { id: 'keep', text: 'Keep', createdAt: 10, updatedAt: 20 });
  assert.equal(store.replaceMemories([{ id: 'bad', text: 'x', createdAt: 0, updatedAt: 1 }]), false);
  assert.ok(store.getMemory('keep'));
  assert.equal(store.replaceMemories([]), true);
  assert.deepEqual(store.listMemories(), []);
  global.localStorage.failWrites = 1;
  assert.equal(store.replaceMemories([record]), false);
  assert.deepEqual(store.listMemories(), []);
});

test('equal timestamps sort deterministically by id', function() {
  var store = loadStore();
  assert.equal(store.replaceMemories([
    { id: 'z', text: 'z', createdAt: 1, updatedAt: 5 },
    { id: 'a', text: 'a', createdAt: 1, updatedAt: 5 }
  ]), true);
  assert.deepEqual(store.listMemories().map(function(x) { return x.id; }), ['a', 'z']);
});

test('load skips invalid records and keeps newest duplicate id', function() {
  var key = 'llm_thing_memories_v1';
  var initial = {};
  initial[key] = JSON.stringify({ version: 1, memories: [
    { id: 'same', text: 'older', createdAt: 1, updatedAt: 2 },
    { id: '', text: 'invalid', createdAt: 1, updatedAt: 3 },
    { id: 'same', text: 'newer', createdAt: 1, updatedAt: 4 }
  ] });
  var store = loadStore(initial);

  assert.deepEqual(store.listMemories(), [
    { id: 'same', text: 'newer', createdAt: 1, updatedAt: 4 }
  ]);
});
