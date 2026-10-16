'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var path = require('node:path');
var FakeLocalStorage = require('./helpers/fake_local_storage');
var load = require('./helpers/load_with_stubs');
var common = require('../../src/pkjs/settings');

var timelineStorePath = path.resolve(__dirname, '../../src/pkjs/timeline_store');

function loadStore() {
  global.localStorage = new FakeLocalStorage();
  var commonStub = {};
  Object.keys(common).forEach(function(k) { commonStub[k] = common[k]; });
  commonStub.logDebug = function() {};
  var store = load.loadWithStubs(timelineStorePath, { './settings': commonStub });
  return { store: store, commonStub: commonStub };
}

test.afterEach(function() {
  delete global.localStorage;
  load.clearModule(timelineStorePath);
});

test('corrupt storage returns empty without throwing', function() {
  var loaded = loadStore();
  global.localStorage.setItem(loaded.store.STORE_KEY, 'not-json {');
  var list = loaded.store.listTimelinePins();
  assert.deepEqual(list, []);
  var got = loaded.store.getTimelinePin('any');
  assert.equal(got, null);
});

test('empty storage returns empty', function() {
  var loaded = loadStore();
  assert.deepEqual(loaded.store.listTimelinePins(), []);
});

test('pin id sequence remains monotonic across module reloads and storage write failures', function() {
  var loaded = loadStore();
  var first = loaded.store.nextTimelinePinIdSequence();
  var second = loaded.store.nextTimelinePinIdSequence();
  var commonStub = {};
  var reloaded;
  var third;
  var fourth;

  assert.equal(second, first + 1);
  load.clearModule(timelineStorePath);
  Object.keys(common).forEach(function(key) { commonStub[key] = common[key]; });
  commonStub.logDebug = function() {};
  reloaded = load.loadWithStubs(timelineStorePath, { './settings': commonStub });
  third = reloaded.nextTimelinePinIdSequence();
  assert.equal(third, second + 1);

  global.localStorage.failWrites = 1;
  fourth = reloaded.nextTimelinePinIdSequence();
  assert.equal(fourth, third + 1, 'failed persistence still advances in-memory sequence');
  assert.equal(reloaded.nextTimelinePinIdSequence(), fourth + 1);
});

test('unavailable storage does not throw', function() {
  var loaded = loadStore();
  delete global.localStorage;

  assert.deepEqual(loaded.store.listTimelinePins(), []);
  assert.equal(loaded.store.getTimelinePin('missing'), null);
  assert.equal(loaded.store.saveTimelinePin('id', 'pin', {
    id: 'id',
    time: new Date(Date.now() + 3600000).toISOString(),
    layout: { type: 'genericPin', title: 'Title' }
  }, { id: 'id', title: 'Title' }), false);
});

test('save and get uses defensive copies', function() {
  var loaded = loadStore();
  var pin = { id: 'id1', time: new Date(Date.now() + 3600000).toISOString(), layout: { type: 'genericPin', title: 'Hello', tinyIcon: 'system://images/NOTIFICATION_REMINDER' } };
  var args = { id: 'id1', title: 'Hello', time: pin.time, body: 'Body' };
  var ok = loaded.store.saveTimelinePin('id1', 'pin', pin, args);
  assert.equal(ok, true);

  pin.layout.title = 'Mutated';
  args.title = 'Mutated';

  var got = loaded.store.getTimelinePin('id1');
  assert.equal(got.pin.layout.title, 'Hello');
  assert.equal(got.args.title, 'Hello');

  got.pin.layout.title = 'Mut2';
  var got2 = loaded.store.getTimelinePin('id1');
  assert.equal(got2.pin.layout.title, 'Hello');
});

test('save get list remove work and list is compact', function() {
  var loaded = loadStore();
  var pin1 = { id: 'p1', time: new Date(Date.now() + 3600000).toISOString(), layout: { type: 'genericPin', title: 'First', tinyIcon: 'system://images/NOTIFICATION_REMINDER' } };
  var args1 = { id: 'p1', title: 'First', time: pin1.time };
  var pin2 = { id: 'p2', time: new Date(Date.now() + 7200000).toISOString(), layout: { type: 'genericPin', title: 'Second', tinyIcon: 'system://images/NOTIFICATION_REMINDER' } };
  var args2 = { id: 'p2', title: 'Second', time: pin2.time };

  loaded.store.saveTimelinePin('p1', 'pin', pin1, args1);
  loaded.store.saveTimelinePin('p2', 'reminder', pin2, args2);

  var list = loaded.store.listTimelinePins();
  assert.equal(list.length, 2);
  list.forEach(function(item) {
    assert.ok(item.id);
    assert.ok(item.kind);
    assert.ok(typeof item.title === 'string');
    assert.ok(typeof item.time === 'string');
    assert.ok(typeof item.createdAt === 'number');
    assert.ok(typeof item.updatedAt === 'number');
  });
  var ids = list.map(function(x){ return x.id; });
  assert.ok(ids.indexOf('p1') !== -1);
  assert.ok(ids.indexOf('p2') !== -1);

  list[0].title = 'Hacked';
  var list2 = loaded.store.listTimelinePins();
  assert.notEqual(list2[0].title, 'Hacked');

  assert.equal(loaded.store.removeTimelinePin('p1'), true);
  assert.equal(loaded.store.listTimelinePins().length, 1);
  assert.equal(loaded.store.getTimelinePin('p1'), null);
  assert.equal(loaded.store.removeTimelinePin('nonexistent'), false);
});

test('cap store at 64 newest records', function() {
  var loaded = loadStore();
  var i;
  var pin;
  var args;
  var base = Date.now();
  for (i = 0; i < 65; i += 1) {
    pin = { id: 'id_' + i, time: new Date(base + 3600000).toISOString(), layout: { type: 'genericPin', title: 'T' + i, tinyIcon: 'system://images/NOTIFICATION_REMINDER' } };
    args = { id: 'id_' + i, title: 'T' + i, time: pin.time };
    loaded.store.saveTimelinePin('id_' + i, 'pin', pin, args);
  }
  var list = loaded.store.listTimelinePins();
  assert.equal(list.length, 64);
});

test('quota failing storage does not throw and returns false', function() {
  var loaded = loadStore();
  global.localStorage.failWrites = 100;
  var pin = { id: 'q1', time: new Date(Date.now() + 3600000).toISOString(), layout: { type: 'genericPin', title: 'Q', tinyIcon: 'system://images/NOTIFICATION_REMINDER' } };
  var args = { id: 'q1', title: 'Q', time: pin.time };
  var ok = loaded.store.saveTimelinePin('q1', 'pin', pin, args);
  assert.equal(ok, false);
  assert.doesNotThrow(function() { loaded.store.listTimelinePins(); });
});

test('update overwrites and preserves createdAt', function() {
  var loaded = loadStore();
  var pin = { id: 'u1', time: new Date(Date.now() + 3600000).toISOString(), layout: { type: 'genericPin', title: 'Orig', tinyIcon: 'system://images/NOTIFICATION_REMINDER' } };
  var args = { id: 'u1', title: 'Orig', time: pin.time };
  loaded.store.saveTimelinePin('u1', 'pin', pin, args);
  var first = loaded.store.getTimelinePin('u1');
  var created = first.createdAt;

  var pin2 = { id: 'u1', time: pin.time, layout: { type: 'genericPin', title: 'Updated', tinyIcon: 'system://images/NOTIFICATION_REMINDER' } };
  var args2 = { id: 'u1', title: 'Updated', time: pin.time, body: 'new' };
  loaded.store.saveTimelinePin('u1', 'pin', pin2, args2);

  var second = loaded.store.getTimelinePin('u1');
  assert.equal(second.pin.layout.title, 'Updated');
  assert.equal(second.args.body, 'new');
  assert.equal(second.createdAt, created);
  assert.ok(second.updatedAt >= first.updatedAt);
});

test('saved reminder removal marker survives reload with other edit arguments', function() {
  var loaded = loadStore();
  var pin = {
    id: 'removed-reminder',
    time: new Date(Date.now() + 3600000).toISOString(),
    layout: { type: 'genericPin', title: 'Removed', tinyIcon: 'system://images/NOTIFICATION_REMINDER' }
  };
  var args = {
    id: 'removed-reminder',
    title: 'Removed',
    time: pin.time,
    body: 'KeepMe',
    _timelineReminderRemoved: true
  };

  assert.equal(loaded.store.saveTimelinePin(pin.id, 'reminder', pin, args), true);
  load.clearModule(timelineStorePath);
  var reloaded = load.loadWithStubs(timelineStorePath, { './settings': loaded.commonStub });
  var record = reloaded.getTimelinePin(pin.id);

  assert.equal(record.kind, 'reminder');
  assert.equal(record.args._timelineReminderRemoved, true);
  assert.equal(record.args.body, 'KeepMe');
  assert.equal(record.pin.layout.title, 'Removed');
});

test('invalid records are ignored on load', function() {
  var loaded = loadStore();
  var now = Date.now();
  var bad = [
    null,
    { id: '', kind: 'pin', pin: {}, args: {} },
    { id: 'good', kind: 'pin', pin: { id: 'good', time: new Date(now + 3600000).toISOString(), layout: { title: 'ok' } }, args: { id: 'good', title: 'ok' }, createdAt: now, updatedAt: now },
    { id: 'badKind', kind: 'bad', pin: { id: 'badKind', time: new Date().toISOString(), layout: { title: 'x' } }, args: { id: 'badKind' }, createdAt: now, updatedAt: now }
  ];
  global.localStorage.setItem(loaded.store.STORE_KEY, JSON.stringify({ version: 1, pins: bad }));
  load.clearModule(timelineStorePath);
  var commonStub = {};
  Object.keys(common).forEach(function(k) { commonStub[k] = common[k]; });
  commonStub.logDebug = function() {};
  var store2 = load.loadWithStubs(timelineStorePath, { './settings': commonStub });
  var list = store2.listTimelinePins();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'good');
});
