'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var path = require('node:path');
var FakeLocalStorage = require('./helpers/fake_local_storage');
var load = require('./helpers/load_with_stubs');

var storePath = path.resolve(__dirname, '../../src/pkjs/chat_store');

function loadStore(initial) {
  global.localStorage = new FakeLocalStorage(initial);
  load.clearModule(storePath);
  return require(storePath);
}

test.afterEach(function() {
  delete global.localStorage;
  load.clearModule(storePath);
});

test('save, list, load, update, and delete chat history', function() {
  var store = loadStore();
  var saved = store.saveChatHistory(null, [
    { role: 'system', content: 'ignored' },
    { role: 'user', content: 'What time is it? Extra text' },
    { role: 'assistant', content: 'Noon' }
  ]);
  var loaded;

  assert.ok(saved.id);
  assert.equal(saved.title, 'What time is it?');
  assert.equal(store.listChats().length, 1);

  loaded = store.getChat(saved.id);
  assert.deepEqual(loaded.messages, [
    { role: 'user', content: 'What time is it? Extra text' },
    { role: 'assistant', content: 'Noon' }
  ]);

  store.saveChatHistory(saved.id, loaded.messages.concat([
    { role: 'user', content: 'Again' },
    { role: 'assistant', content: 'Still noon' }
  ]));
  assert.equal(store.getChat(saved.id).messages.length, 4);
  assert.equal(store.deleteChat(saved.id), true);
  assert.equal(store.deleteChat(saved.id), false);
  assert.equal(store.getChat(saved.id), null);
});

test('loading normalizes corrupt records, roles, lengths, and ordering', function() {
  var longText = new Array(1300).join('x');
  var initial = {
    llm_thing_saved_chats_v1: JSON.stringify({
      version: 1,
      chats: [
        { id: 'old', updatedAt: 10, messages: [{ role: 'user', content: longText }] },
        { id: 'invalid', messages: [{ role: 'system', content: 'ignored' }] },
        { id: 'new', updatedAt: 20, messages: [{ role: 'assistant', content: 'answer' }] }
      ]
    })
  };
  var store = loadStore(initial);
  var listed = store.listChats();

  assert.deepEqual(listed.map(function(chat) { return chat.id; }), ['new', 'old']);
  assert.equal(store.getChat('old').messages[0].content.length, 1200);
  assert.equal(store.getChat('invalid'), null);
});

test('store caps chat count and evicts oldest chats on quota failure', function() {
  var chats = [];
  var i;
  var store;
  var saved;

  for (i = 0; i < 22; i += 1) {
    chats.push({
      id: 'chat-' + i,
      title: 'Chat ' + i,
      createdAt: i + 1,
      updatedAt: i + 1,
      messages: [{ role: 'user', content: String(i) }]
    });
  }

  store = loadStore({ llm_thing_saved_chats_v1: JSON.stringify({ version: 1, chats: chats }) });
  assert.equal(store.listChats().length, 20);
  assert.equal(store.listChats()[0].id, 'chat-21');

  global.localStorage.failWrites = 1;
  saved = store.saveChatHistory(null, [{ role: 'user', content: 'new chat' }]);
  assert.ok(saved);
  assert.equal(store.listChats().length, 19);
  assert.equal(store.getChat('chat-2'), null);
  assert.equal(store.getChat('chat-3'), null);
});

test('deleteAllChats falls back to writing an empty store', function() {
  var store = loadStore({ llm_thing_saved_chats_v1: '{"version":1,"chats":[]}' });
  global.localStorage.failRemoves = 1;

  store.deleteAllChats();

  assert.deepEqual(JSON.parse(global.localStorage.getItem('llm_thing_saved_chats_v1')), {
    version: 1,
    chats: []
  });
});
