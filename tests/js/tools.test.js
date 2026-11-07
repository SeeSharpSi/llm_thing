'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var path = require('node:path');
var common = require('../../src/pkjs/settings');
var createFakePebble = require('./helpers/fake_pebble');
var FakeXMLHttpRequest = require('./helpers/fake_xhr');
var FakeLocalStorage = require('./helpers/fake_local_storage');
var installFakeTimers = require('./helpers/fake_timers');
var load = require('./helpers/load_with_stubs');

var toolsPath = path.resolve(__dirname, '../../src/pkjs/tools');
var watchPath = path.resolve(__dirname, '../../src/pkjs/watch');
var timelineStorePath = path.resolve(__dirname, '../../src/pkjs/timeline_store');
var webFetchPath = path.resolve(__dirname, '../../src/pkjs/web_fetch');
var memoryStorePath = path.resolve(__dirname, '../../src/pkjs/memory_store');

function createHarness() {
  FakeXMLHttpRequest.reset();
  global.XMLHttpRequest = FakeXMLHttpRequest;
  global.localStorage = new FakeLocalStorage();

  var watch = {
    progress: [],
    lifecycleCalls: [],
    xhrCalls: [],
    healthQueries: [],
    healthResponse: function() { return { stepCount: 5 }; },
    isCurrentRequest: function() { return true; },
    beginRequestLifecycle: function(id) { watch.lifecycleCalls.push(['begin', id]); },
    trackXhr: function(id) { watch.xhrCalls.push(['track', id]); return true; },
    untrackXhr: function() {},
    progressToolStart: function(id, name, detail) { watch.progress.push(['start', name, detail]); },
    progressDone: function(id, name, detail) { watch.progress.push(['done', name, detail]); },
    requestHealthInfo: function(query, id, callback) {
      watch.healthQueries.push(query);
      callback(null, JSON.stringify(watch.healthResponse(query)));
    }
  };
  var commonStub = {};
  Object.keys(common).forEach(function(key) { commonStub[key] = common[key]; });
  commonStub.logDebug = function() {};

  var tools = load.loadWithStubs(toolsPath, {
    './settings': commonStub,
    './watch': watch
  });
  return { tools: tools, watch: watch, commonStub: commonStub };
}

function mcpSettings(servers, maxToolCalls) {
  return {
    McpServersJson: JSON.stringify(servers),
    MaxToolCalls: maxToolCalls === undefined ? 6 : maxToolCalls,
    GeolocationToolEnabled: false,
    TimelineToolEnabled: false,
    HealthToolEnabled: false
  };
}

function discoverMcpLookup(harness, label) {
  var discovered;
  harness.tools.discoverPhoneTools(mcpSettings([{
    enabled: true,
    label: label,
    url: 'https://mcp.example.test'
  }]), 900, function(error, definitions, map) {
    discovered = { error: error, definitions: definitions, map: map };
  });
  FakeXMLHttpRequest.instances[0].respond(200, { result: { protocolVersion: '2025-06-18' } });
  FakeXMLHttpRequest.instances[1].respond(202, '');
  FakeXMLHttpRequest.instances[2].respond(200, {
    result: { tools: [{ name: 'lookup', inputSchema: { type: 'object', properties: {} } }] }
  });
  assert.equal(discovered.error, null);
  return { map: discovered.map, toolName: discovered.definitions[0].name };
}

function callMcpLookup(harness, discovered, requestId, result) {
  var output;
  harness.tools.runToolCalls(requestId, [{ id: 'mcp-' + requestId, name: discovered.toolName, arguments: {} }], discovered.map, function(results) {
    output = results[0];
  });
  FakeXMLHttpRequest.last().respond(200, { result: result });
  return output;
}

test.afterEach(function() {
  delete global.XMLHttpRequest;
  delete global.navigator;
  delete global.Pebble;
  delete global.localStorage;
  load.clearModule(toolsPath);
  load.clearModule(watchPath);
  load.clearModule(timelineStorePath);
  load.clearModule(webFetchPath);
  load.clearModule(memoryStorePath);
});

test('discoverPhoneTools returns enabled built-ins in stable name order', function() {
  var harness = createHarness();
  var result;

  harness.tools.discoverPhoneTools({
    McpServersJson: '[]',
    GeolocationToolEnabled: true,
    TimelineToolEnabled: true,
    HealthToolEnabled: true
  }, 1, function(error, definitions, map) {
    result = { error: error, definitions: definitions, map: map };
  });

  assert.equal(result.error, null);
  assert.deepEqual(result.definitions.map(function(tool) { return tool.name; }), [
    'pebble_get_location',
    'pebble_health_info',
    'pebble_timeline_create_pin',
    'pebble_timeline_create_reminder',
    'pebble_timeline_delete_pin',
    'pebble_timeline_edit_pin',
    'pebble_timeline_list_pins'
  ]);
  assert.equal(result.map.pebble_get_location.kind, 'builtin');
});

test('memory built-ins expose bounded schemas and execute locally', function() {
  var harness = createHarness();
  var result;
  var calls;
  harness.tools.discoverPhoneTools({ McpServersJson: '[]', PebbleMemoryToolEnabled: true }, 1, function(error, definitions, map) {
    result = { error: error, definitions: definitions, map: map };
  });
  assert.equal(result.error, null);
  assert.deepEqual(result.definitions.map(function(tool) { return tool.name; }), [
    'pebble_memory_delete', 'pebble_memory_save', 'pebble_memory_search'
  ]);
  assert.equal(result.map.pebble_memory_save.parameters.additionalProperties, false);
  assert.equal(result.map.pebble_memory_save.parameters.properties.text.maxLength, 500);
  assert.deepEqual(result.map.pebble_memory_save.parameters.required, ['text']);
  assert.equal(result.map.pebble_memory_search.parameters.properties.limit.maximum, 32);
  assert.equal(result.map.pebble_memory_search.parameters.properties.cursor.maxLength, 512);
  assert.equal(result.map.pebble_memory_delete.parameters.properties.id.maxLength, 64);

  harness.tools.runToolCalls(1, [{ id: 'save', name: 'pebble_memory_save', arguments: { text: 'Remember this' } }], result.map, function(value) { calls = value; });
  assert.equal(JSON.parse(calls[0].result).status, 'saved');
  var id = JSON.parse(calls[0].result).memory.id;
  harness.tools.runToolCalls(1, [{ id: 'search', name: 'pebble_memory_search', arguments: { query: 'remember' } }], result.map, function(value) { calls = value; });
  assert.equal(JSON.parse(calls[0].result).items[0].id, id);
  harness.tools.runToolCalls(1, [{ id: 'delete', name: 'pebble_memory_delete', arguments: { id: id } }], result.map, function(value) { calls = value; });
  assert.equal(JSON.parse(calls[0].result).status, 'deleted');
  harness.tools.runToolCalls(1, [{ id: 'missing', name: 'pebble_memory_delete', arguments: {} }], result.map, function(value) { calls = value; });
  assert.match(calls[0].error, /required/);
});

test('memory built-ins stay hidden unless explicitly enabled', function() {
  var harness = createHarness();
  var names;

  harness.tools.discoverPhoneTools({ McpServersJson: '[]', PebbleMemoryToolEnabled: false }, 1, function(error, definitions) {
    assert.equal(error, null);
    names = definitions.map(function(tool) { return tool.name; });
  });

  assert.equal(names.some(function(name) { return name.indexOf('pebble_memory_') === 0; }), false);
});

test('memory search paginates all max-length escaped notes in stable order within result budget', function() {
  var harness = createHarness();
  var memoryStore = require('../../src/pkjs/memory_store');
  var definitions;
  var toolMap;
  var records = [];
  var expected = [];
  var actual = [];
  var cursor = null;
  var seenCursors = {};
  var pageCount = 0;
  var i;

  for (i = 0; i < 32; i += 1) {
    var text = 'match-' + i + ' ';
    while (text.length < 500) { text += '"\\\u0001'; }
    text = text.substring(0, 500);
    records.push({ id: 'memory-' + i, text: text, createdAt: i + 1, updatedAt: i + 1 });
    expected.unshift('memory-' + i);
  }
  assert.equal(memoryStore.replaceMemories(records), true);
  harness.tools.discoverPhoneTools({ McpServersJson: '[]', PebbleMemoryToolEnabled: true }, 10, function(error, tools, map) {
    assert.equal(error, null);
    definitions = tools;
    toolMap = map;
  });

  while (pageCount < 32) {
    var results;
    var searchArgs = { query: 'match', limit: 32 };
    if (cursor) { searchArgs.cursor = cursor; }
    harness.tools.runToolCalls(10, [{ id: 'search-' + pageCount, name: 'pebble_memory_search', arguments: searchArgs }], toolMap, function(value) { results = value; });
    assert.equal(results[0].error, undefined);
    var page = JSON.parse(results[0].result);
    assert.deepEqual(Object.keys(page), ['items', 'hasMore', 'nextCursor']);
    assert.ok(JSON.stringify(page).length <= 6000);
    page.items.forEach(function(item) {
      assert.equal(item.text.length, 500);
      actual.push(item.id);
    });
    pageCount += 1;
    if (!page.hasMore) {
      assert.equal(page.nextCursor, null);
      break;
    }
    assert.equal(typeof page.nextCursor, 'string');
    assert.equal(seenCursors[page.nextCursor], undefined, 'cursor always advances');
    seenCursors[page.nextCursor] = true;
    cursor = page.nextCursor;
  }

  assert.ok(pageCount > 1);
  assert.deepEqual(actual, expected);
  assert.equal(new Set(actual).size, 32);
});

test('memory cursors reject invalid, expired, changed-data, and mismatched-query requests', function() {
  var harness = createHarness();
  var memoryStore = require('../../src/pkjs/memory_store');
  var toolMap;
  var first;
  var results;
  var originalNow = Date.now;
  var cursor;

  assert.equal(memoryStore.replaceMemories([
    { id: 'a', text: 'match a', createdAt: 1, updatedAt: 2 },
    { id: 'b', text: 'match b', createdAt: 1, updatedAt: 1 }
  ]), true);
  harness.tools.discoverPhoneTools({ McpServersJson: '[]', PebbleMemoryToolEnabled: true }, 11, function(error, tools, map) { toolMap = map; });

  function search(args) {
    harness.tools.runToolCalls(11, [{ id: 'page', name: 'pebble_memory_search', arguments: args }], toolMap, function(value) { results = value; });
    return results[0];
  }

  first = search({ query: 'match', limit: 1 });
  cursor = JSON.parse(first.result).nextCursor;
  assert.equal(typeof cursor, 'string');
  assert.match(search({ query: 'match', limit: 1, cursor: 'invalid' }).error, /Invalid pagination cursor/);
  assert.match(search({ query: 'match', limit: 1, cursor: '' }).error, /Invalid pagination cursor/);
  assert.match(search({ query: 'match', limit: 1, cursor: cursor.substring(0, 4) + (cursor.charAt(4) === 'A' ? 'B' : 'A') + cursor.substring(5) }).error, /Invalid pagination cursor/);
  assert.match(search({ query: 'different', limit: 1, cursor: cursor }).error, /does not match this query/);

  assert.ok(memoryStore.addMemory('match c'));
  assert.match(search({ query: 'match', limit: 1, cursor: cursor }).error, /data changed/);

  first = search({ query: 'match', limit: 1 });
  cursor = JSON.parse(first.result).nextCursor;
  Date.now = function() { return originalNow() + 31 * 60 * 1000; };
  try {
    assert.match(search({ query: 'match', limit: 1, cursor: cursor }).error, /expired/);
  } finally {
    Date.now = originalNow;
  }

  assert.equal(memoryStore.replaceMemories([{ id: 'only', text: 'match exact', createdAt: 1, updatedAt: 1 }]), true);
  var exact = JSON.parse(search({ query: 'match', limit: 1 }).result);
  assert.deepEqual(exact, { items: [{ id: 'only', text: 'match exact', createdAt: 1, updatedAt: 1 }], hasMore: false, nextCursor: null });
  var empty = JSON.parse(search({ query: 'missing', limit: 1 }).result);
  assert.deepEqual(empty, { items: [], hasMore: false, nextCursor: null });
});

test('timeline listing pages all 64 records and bounds escaped legacy fields', function() {
  var harness = createHarness();
  var timelineStore = require('../../src/pkjs/timeline_store');
  var records = [];
  var expected = [];
  var actual = [];
  var toolMap;
  var cursor = null;
  var staleCursor = null;
  var pages = 0;
  var i;
  var longField = '';
  for (i = 0; i < 5000; i += 1) { longField += '"\\\u0001'; }
  longField = longField.substring(0, 5000);

  for (i = 0; i < 64; i += 1) {
    var id = 'pin-' + (i < 10 ? '0' : '') + i;
    var title = i === 63 ? longField : 'Title ' + i;
    var time = i === 63 ? longField.substring(0, 2000) : '2030-01-01T00:00:00.000Z';
    records.push({
      id: id,
      kind: i % 2 ? 'reminder' : 'pin',
      pin: { id: id, time: time, layout: { type: 'genericPin', title: title } },
      args: { id: id, title: title },
      createdAt: i + 1,
      updatedAt: i + 1
    });
    expected.unshift(id);
  }
  global.localStorage.setItem(timelineStore.STORE_KEY, JSON.stringify({ version: 1, pins: records }));
  harness.tools.discoverPhoneTools({ McpServersJson: '[]', TimelineToolEnabled: true }, 12, function(error, tools, map) { toolMap = map; });

  while (pages < 64) {
    var results;
    var pageArgs = { limit: 64 };
    if (cursor) { pageArgs.cursor = cursor; }
    harness.tools.runToolCalls(12, [{ id: 'pins-' + pages, name: 'pebble_timeline_list_pins', arguments: pageArgs }], toolMap, function(value) { results = value; });
    assert.equal(results[0].error, undefined);
    var page = JSON.parse(results[0].result);
    assert.deepEqual(Object.keys(page), ['items', 'hasMore', 'nextCursor']);
    assert.ok(JSON.stringify(page).length <= 6000);
    page.items.forEach(function(item) {
      actual.push(item.id);
      assert.ok(item.title.length <= 384);
      assert.ok(item.time.length <= 128);
      if (item.id === 'pin-63') {
        assert.equal(item.titleTruncated, true);
        assert.equal(item.timeTruncated, true);
      }
    });
    pages += 1;
    if (!page.hasMore) {
      assert.equal(page.nextCursor, null);
      break;
    }
    assert.equal(typeof page.nextCursor, 'string');
    if (!staleCursor) { staleCursor = page.nextCursor; }
    cursor = page.nextCursor;
  }

  assert.ok(pages > 1);
  assert.deepEqual(actual, expected);
  assert.equal(new Set(actual).size, 64);
  var current = JSON.parse(global.localStorage.getItem(timelineStore.STORE_KEY));
  current.pins[63].pin.layout.title = current.pins[63].pin.layout.title.substring(0, 384) + 'changed after page one';
  global.localStorage.setItem(timelineStore.STORE_KEY, JSON.stringify(current));
  var stale;
  harness.tools.runToolCalls(12, [{ id: 'stale', name: 'pebble_timeline_list_pins', arguments: { limit: 64, cursor: staleCursor } }], toolMap, function(value) { stale = value; });
  assert.match(stale[0].error, /data changed/);
});

test('empty timeline pages have null cursor and malformed cursors stop without another page', function() {
  var harness = createHarness();
  var toolMap;
  var results;
  harness.tools.discoverPhoneTools({ McpServersJson: '[]', TimelineToolEnabled: true }, 13, function(error, tools, map) { toolMap = map; });
  harness.tools.runToolCalls(13, [{ id: 'empty', name: 'pebble_timeline_list_pins', arguments: {} }], toolMap, function(value) { results = value; });
  assert.deepEqual(JSON.parse(results[0].result), { items: [], hasMore: false, nextCursor: null });
  harness.tools.runToolCalls(13, [{ id: 'bad', name: 'pebble_timeline_list_pins', arguments: { cursor: 'bad' } }], toolMap, function(value) { results = value; });
  assert.match(results[0].error, /Invalid pagination cursor/);
});

test('Health Info discovery exposes required metrics schema and label', function() {
  var harness = createHarness();
  var result;
  harness.tools.discoverPhoneTools({ McpServersJson: '[]', HealthToolEnabled: true }, 1, function(error, definitions, map) {
    result = { error: error, definitions: definitions, map: map };
  });
  assert.equal(result.error, null);
  assert.equal(result.definitions[0].name, 'pebble_health_info');
  assert.deepEqual(result.definitions[0].parameters.required, ['metrics']);
  assert.equal(result.definitions[0].parameters.additionalProperties, false);
  assert.deepEqual(result.definitions[0].parameters.properties.metrics.items.enum, [
    'steps', 'active_time', 'distance', 'sleep', 'restful_sleep', 'resting_calories',
    'active_calories', 'heart_rate', 'activity_sessions', 'sleep_sessions'
  ]);
  assert.equal(result.map.pebble_health_info.label, 'Health Info');
});

test('Health Info selects requested totals and omits unrequested fake data', function() {
  var harness = createHarness();
  var results;
  harness.watch.healthResponse = function() {
    return { stepCount: 12, activeSeconds: 99, heartRateAverageBPM: 64, distanceMeters: 44 };
  };
  harness.tools.discoverPhoneTools({ McpServersJson: '[]', HealthToolEnabled: true }, 101, function(error, definitions, map) {
    harness.tools.runToolCalls(101, [{ id: 'health', name: 'pebble_health_info', arguments: { metrics: ['heart_rate', 'steps'] } }], map, function(value) { results = value; });
  });
  assert.equal(harness.watch.healthQueries[0].queryMask, 129);
  assert.deepEqual(JSON.parse(results[0].result).totals, { steps: 12, heartRate: { averageBpm: 64 } });
  assert.equal(JSON.parse(results[0].result).totals.activeSeconds, undefined);
});

test('Health Info maps every scalar metric and requests its exact mask', function() {
  var harness = createHarness();
  var results;
  var toolMap;
  var metrics = ['steps', 'active_time', 'distance', 'sleep', 'restful_sleep', 'resting_calories', 'active_calories'];

  harness.watch.healthResponse = function() {
    return {
      stepCount: 0,
      activeSeconds: 61,
      walkedDistanceMeters: 202,
      sleepSeconds: 303,
      sleepRestfulSeconds: 0,
      restingKCalories: 55,
      activeKCalories: 66,
      heartRateAverageBPM: 77
    };
  };
  harness.tools.discoverPhoneTools({ McpServersJson: '[]', HealthToolEnabled: true }, 107, function(error, definitions, map) {
    toolMap = map;
    harness.tools.runToolCalls(107, [{ id: 'health', name: 'pebble_health_info', arguments: { metrics: metrics } }], map, function(value) { results = value; });
  });
  assert.equal(harness.watch.healthQueries[0].queryMask, 127);
  assert.deepEqual(JSON.parse(results[0].result).totals, {
    steps: 0,
    activeSeconds: 61,
    distanceMeters: 202,
    sleepSeconds: 303,
    restfulSleepSeconds: 0,
    restingCaloriesKcal: 55,
    activeCaloriesKcal: 66
  });

  harness.watch.healthResponse = function() {
    return { stepCount: 5, activeSeconds: null, walkedDistanceMeters: undefined, sleepSeconds: 0 };
  };
  harness.tools.runToolCalls(107, [{ id: 'sparse', name: 'pebble_health_info', arguments: { metrics: ['steps', 'active_time', 'distance', 'sleep'] } }], toolMap, function(value) { results = value; });
  assert.deepEqual(JSON.parse(results[0].result).totals, { steps: 5, sleepSeconds: 0 });
});

test('Health Info custom hourly range queries contiguous buckets serially', function() {
  var harness = createHarness();
  var results;
  harness.tools.discoverPhoneTools({ McpServersJson: '[]', HealthToolEnabled: true }, 102, function(error, definitions, map) {
    harness.tools.runToolCalls(102, [{ id: 'health', name: 'pebble_health_info', arguments: {
      metrics: ['steps'], range: 'custom', startTime: '1970-01-01T01:00:00Z', endTime: '1970-01-01T04:20:00Z', granularity: 'hour'
    } }], map, function(value) { results = value; });
  });
  assert.deepEqual(harness.watch.healthQueries.map(function(query) { return [query.startUnix, query.endUnix]; }), [
    [3600, 15600], [3600, 7200], [7200, 10800], [10800, 14400], [14400, 15600]
  ]);
  assert.equal(JSON.parse(results[0].result).buckets.length, 4);
});

test('Health Info day granularity uses local calendar boundaries', function() {
  var harness = createHarness();
  var start = Math.floor(new Date(2020, 0, 1).getTime() / 1000);
  var middle = Math.floor(new Date(2020, 0, 2).getTime() / 1000);
  var end = Math.floor(new Date(2020, 0, 3).getTime() / 1000);
  var results;
  harness.tools.discoverPhoneTools({ McpServersJson: '[]', HealthToolEnabled: true }, 105, function(error, definitions, map) {
    harness.tools.runToolCalls(105, [{ id: 'health', name: 'pebble_health_info', arguments: {
      metrics: ['steps'], range: 'custom', startTime: String(start), endTime: String(end), granularity: 'day'
    } }], map, function(value) { results = value; });
  });
  assert.deepEqual(harness.watch.healthQueries.map(function(query) { return [query.startUnix, query.endUnix]; }), [
    [start, end], [start, middle], [middle, end]
  ]);
  assert.equal(JSON.parse(results[0].result).buckets.length, 2);
});

test('Health Info baseline scopes and validation avoid invalid watch calls', function() {
  var harness = createHarness();
  var results;
  var baselineResults = [];
  harness.watch.healthResponse = function(query) {
    return query.averageScope === 1 ? { stepCount: 5, uns: 1 } : { stepCount: 5 };
  };
  harness.tools.discoverPhoneTools({ McpServersJson: '[]', HealthToolEnabled: true }, 103, function(error, definitions, map) {
    ['daily', 'weekday_or_weekend', 'same_weekday'].forEach(function(scope) {
      harness.tools.runToolCalls(103, [{ id: scope, name: 'pebble_health_info', arguments: { metrics: ['steps'], range: 'last_24h', baseline: scope } }], map, function(value) { baselineResults.push(value[0]); });
    });
    harness.tools.runToolCalls(103, [
      { id: 'empty', name: 'pebble_health_info', arguments: { metrics: [] } },
      { id: 'duplicate', name: 'pebble_health_info', arguments: { metrics: ['steps', 'steps'] } },
      { id: 'long', name: 'pebble_health_info', arguments: { metrics: ['steps'], range: 'custom', startTime: '1', endTime: String(8 * 86400 + 1) } },
      { id: 'hour-long', name: 'pebble_health_info', arguments: { metrics: ['steps'], range: 'custom', startTime: '1', endTime: '86402', granularity: 'hour' } },
      { id: 'too-many', name: 'pebble_health_info', arguments: { metrics: ['steps', 'active_time', 'distance'], range: 'custom', startTime: '1', endTime: '86401', granularity: 'hour' } }
    ], map, function(value) { results = value; });
  });
  assert.deepEqual(harness.watch.healthQueries.map(function(query) { return query.averageScope; }), [0, 1, 0, 2, 0, 3]);
  assert.deepEqual(baselineResults.map(function(item) { return JSON.parse(item.result).baseline.scope; }), ['daily', 'weekday_or_weekend', 'same_weekday']);
  assert.deepEqual(JSON.parse(baselineResults[0].result).baseline.unavailable, [{ metric: 'steps', reason: 'not_supported' }]);
  assert.match(results[0].error, /nonempty/);
  assert.match(results[1].error, /unique/);
  assert.match(results[2].error, /cannot exceed 7 days/);
  assert.match(results[3].error, /cannot exceed 24 hours/);
  assert.match(results[4].error, /too many bucket values/);
  assert.equal(harness.watch.healthQueries.length, 6);
});

test('Health Info sessions page, maps types, and reports unavailable context', function() {
  var harness = createHarness();
  var results;
  harness.watch.healthResponse = function(query) {
    if (query.queryMask !== 15872) { return { stepCount: 1, currentActivities: 'walking, running' }; }
    if (query.sessionOffset === 0) { return { sessions: [[4, 10, 20]], hasMore: true, und: 2048 }; }
    return { sessions: [[8, 30, 50]], hasMore: false, unp: 4096 };
  };
  harness.tools.discoverPhoneTools({ McpServersJson: '[]', HealthToolEnabled: true }, 104, function(error, definitions, map) {
    harness.tools.runToolCalls(104, [{ id: 'health', name: 'pebble_health_info', arguments: { metrics: ['activity_sessions', 'sleep_sessions'] } }], map, function(value) { results = value; });
  });
  assert.deepEqual(harness.watch.healthQueries.map(function(query) { return [query.queryMask, query.sessionOffset]; }), [[256, 0], [15872, 0], [15872, 1]]);
  assert.deepEqual(JSON.parse(results[0].result).sessions.map(function(session) { return session.type; }), ['walk', 'run']);
  assert.deepEqual(JSON.parse(results[0].result).currentActivities, ['walking', 'running']);
  assert.deepEqual(JSON.parse(results[0].result).unavailable, [
    { metric: 'activity_sessions', reason: 'no_data' },
    { metric: 'activity_sessions', reason: 'permission_denied' }
  ]);
});

test('Health Info marks sessions truncated when final page exceeds cap', function() {
  var harness = createHarness();
  var results;
  harness.watch.healthResponse = function(query) {
    var sessions = [];
    var i;
    if (query.queryMask === 256) { return { currentActivities: '' }; }
    for (i = 0; i < (query.sessionOffset === 30 ? 4 : 5); i += 1) {
      sessions.push([4, query.sessionOffset + i, query.sessionOffset + i + 1]);
    }
    return { sessions: sessions, hasMore: query.sessionOffset < 30 };
  };
  harness.tools.discoverPhoneTools({ McpServersJson: '[]', HealthToolEnabled: true }, 106, function(error, definitions, map) {
    harness.tools.runToolCalls(106, [{ id: 'health', name: 'pebble_health_info', arguments: { metrics: ['activity_sessions'] } }], map, function(value) { results = value; });
  });
  assert.equal(JSON.parse(results[0].result).sessions.length, 32);
  assert.equal(JSON.parse(results[0].result).truncated, true);
  assert.deepEqual(harness.watch.healthQueries.map(function(query) { return query.sessionOffset; }), [0, 0, 5, 10, 15, 20, 25, 30]);
});

test('WebSearchEnabled discovers web_fetch with bounded schema', function() {
  var harness = createHarness();
  var result;

  harness.tools.discoverPhoneTools({ McpServersJson: '[]', WebSearchEnabled: true }, 1, function(error, definitions, map) {
    result = { error: error, definitions: definitions, map: map };
  });

  assert.equal(result.error, null);
  assert.equal(result.definitions.length, 1);
  assert.equal(result.definitions[0].name, 'web_fetch');
  assert.deepEqual(result.definitions[0].parameters.required, ['url']);
  assert.equal(result.definitions[0].parameters.additionalProperties, false);
  assert.equal(result.map.web_fetch.kind, 'builtin');
});

test('web_fetch GET sends headers and returns HTML Markdown within offset and limit', function() {
  var harness = createHarness();
  var results;

  harness.tools.discoverPhoneTools({ McpServersJson: '[]', WebSearchEnabled: true }, 2, function(error, definitions, map) {
    harness.tools.runToolCalls(2, [{ id: 'fetch', name: 'web_fetch', arguments: { url: 'https://example.test/page', offset: 2, limit: 12 } }], map, function(value) { results = value; });
  });
  assert.equal(FakeXMLHttpRequest.last().method, 'GET');
  assert.match(FakeXMLHttpRequest.last().headers.Accept, /text\/html/);
  FakeXMLHttpRequest.last().respond(200, '<title>Page</title><h1>Hello</h1><p>World &amp; all</p>');

  assert.equal(results[0].error, undefined);
  assert.ok(results[0].result.length <= 12);
  assert.equal(results[0].result, 'Page\n\n# Hell');
});

test('web_fetch converts useful HTML and rejects invalid URLs and HTTP failures', function() {
  var harness = createHarness();
  var results;
  var markdown = require('../../src/pkjs/web_fetch').htmlToMarkdown('<h2>T</h2><strong>bold</strong><em>it</em><ul><li>one</li></ul><ol><li>two</li></ol><a href=https://x.test><strong>link</strong></a><pre>&amp;amp;</pre><script>bad</script>');
  assert.match(markdown, /## T/);
  assert.match(markdown, /\*\*bold\*\*/);
  assert.match(markdown, /- one/);
  assert.match(markdown, /1\. two/);
  assert.match(markdown, /\[link\]\(https:\/\/x\.test\)/);
  assert.match(markdown, /```\n&amp;\n```/);
  assert.doesNotMatch(markdown, /bad/);

  harness.tools.discoverPhoneTools({ McpServersJson: '[]', WebSearchEnabled: true }, 3, function(error, definitions, map) {
    harness.tools.runToolCalls(3, [{ id: 'bad', name: 'web_fetch', arguments: { url: 'ftp://example.test' } }, { id: 'http', name: 'web_fetch', arguments: { url: 'https://example.test' } }], map, function(value) { results = value; });
  });
  FakeXMLHttpRequest.last().respond(503, 'down');
  assert.match(results[0].error, /HTTP\(S\)/);
  assert.match(results[1].error, /HTTP 503/);
});

test('web_fetch never exceeds small limits and preserves entity Unicode', function() {
  var harness = createHarness();
  var results;
  var markdown = require('../../src/pkjs/web_fetch').htmlToMarkdown('A &#x1F600; &amp;amp;');

  assert.equal(markdown, 'A 😀 &amp;');
  harness.tools.discoverPhoneTools({ McpServersJson: '[]', WebSearchEnabled: true }, 5, function(error, definitions, map) {
    harness.tools.runToolCalls(5, [{ id: 'small', name: 'web_fetch', arguments: { url: 'https://example.test', limit: 1 } }], map, function(value) { results = value; });
  });
  FakeXMLHttpRequest.last().respond(200, 'long content');

  assert.equal(results[0].result.length, 1);
});

test('web_fetch rejects malformed and private URLs before creating a request', function() {
  var harness = createHarness();
  var results;

  harness.tools.discoverPhoneTools({ McpServersJson: '[]', WebSearchEnabled: true }, 6, function(error, definitions, map) {
    harness.tools.runToolCalls(6, [
      { id: 'malformed', name: 'web_fetch', arguments: { url: 'https://?' } },
      { id: 'private', name: 'web_fetch', arguments: { url: 'http://127.0.0.1/' } }
    ], map, function(value) { results = value; });
  });

  assert.equal(FakeXMLHttpRequest.instances.length, 0);
  assert.match(results[0].error, /valid HTTP\(S\)/);
  assert.match(results[1].error, /valid HTTP\(S\)/);
});

test('plugin source builtin integrates schema, progress, execution, and request cancellation', function() {
  var harness = createHarness();
  var sourceRequest;
  var unsubscribed = 0;
  var definitions;
  var toolMap;
  var result;
  var invalid;
  global.Pebble = {
    enumeratePlugins: function() {
      return [{ uuid: '00000000-0000-0000-0001-000000000007', name: 'Fixture', sources: [{ category: 'status', items: ['current'], properties: { value: ['shortText'] } }] }];
    },
    subscribeToSource: function(request) {
      sourceRequest = request;
      return { unsubscribe: function() { unsubscribed += 1; } };
    }
  };
  harness.tools.discoverPhoneTools({
    McpServersJson: '[]', PluginSourcesJson: '[{"plugin":"00000000-0000-0000-0001-000000000007","category":"status","item":"current"}]',
    MaxToolCalls: 2, GeolocationToolEnabled: false, TimelineToolEnabled: false, HealthToolEnabled: false
  }, 99, function(error, found, map) { assert.ifError(error); definitions = found; toolMap = map; });
  var sourceTool = definitions.filter(function(definition) { return definition.name.indexOf('pebble_plugin_') === 0; })[0];
  assert.ok(sourceTool);
  assert.equal(sourceTool.parameters.additionalProperties, false);
  assert.match(sourceTool.parameters.properties.offset.description, /nextOffset/);
  assert.match(sourceTool.description, /properties filter/);
  harness.tools.runToolCalls(99, [{ id: 'source-call', name: sourceTool.name, arguments: {} }], toolMap, function(results) { result = results; });
  assert.equal(harness.watch.progress[0][0], 'start');
  sourceRequest.onData({ pluginUuid: '00000000-0000-0000-0001-000000000007', instances: [{ instanceId: 'phone', properties: { value: { shortText: { text: 'ready' } } } }] });
  assert.equal(JSON.parse(result[0].result).instances[0].properties.value.shortText.text, 'ready');
  assert.equal(result[0]._structuredResult, true);
  assert.ok(harness.watch.progress.some(function(event) { return event[0] === 'done'; }));
  harness.tools.runToolCalls(99, [{ id: 'invalid-source-call', name: sourceTool.name, arguments: { unexpected: true } }], toolMap, function(results) { invalid = results; });
  assert.match(invalid[0].error, /unexpected/);
  assert.equal(unsubscribed, 1);

  result = null;
  harness.tools.runToolCalls(99, [{ id: 'cancel-source-call', name: sourceTool.name, arguments: {} }], toolMap, function(results) { result = results; });
  harness.tools.cancelMcpRequest(99);
  assert.equal(unsubscribed, 2);
  assert.equal(result, null);
});

test('web_fetch reports network and timeout errors', function() {
  var harness = createHarness();
  var results;
  harness.tools.discoverPhoneTools({ McpServersJson: '[]', WebSearchEnabled: true }, 4, function(error, definitions, map) {
    harness.tools.runToolCalls(4, [{ id: 'fetch', name: 'web_fetch', arguments: { url: 'https://example.test' } }], map, function(value) { results = value; });
  });
  assert.equal(FakeXMLHttpRequest.last().timeout, 30000);
  FakeXMLHttpRequest.last().timeOut();
  assert.match(results[0].error, /timed out/);
});

test('web_fetch runs independent reads with a bound and returns results in call order', function() {
  var harness = createHarness();
  var results;
  var callbackCount = 0;

  harness.tools.discoverPhoneTools({ McpServersJson: '[]', WebSearchEnabled: true }, 601, function(error, definitions, map) {
    harness.tools.runToolCalls(601, [
      { id: 'first', name: 'web_fetch', arguments: { url: 'https://example.test/first' } },
      { id: 'second', name: 'web_fetch', arguments: { url: 'https://example.test/second' } },
      { id: 'third', name: 'web_fetch', arguments: { url: 'https://example.test/third' } }
    ], map, function(value) {
      callbackCount += 1;
      results = value;
    });
  });

  assert.equal(FakeXMLHttpRequest.instances.length, 2, 'only two reads start initially');
  FakeXMLHttpRequest.instances[1].respond(200, '<p>second result</p>');
  assert.equal(FakeXMLHttpRequest.instances.length, 3, 'next read starts when one slot frees');
  FakeXMLHttpRequest.instances[2].respond(200, '<p>third result</p>');
  assert.equal(results, undefined, 'batch waits for first read despite reversed completion');
  FakeXMLHttpRequest.instances[0].respond(200, '<p>first result</p>');

  assert.equal(callbackCount, 1);
  assert.deepEqual(results.map(function(item) { return item.id; }), ['first', 'second', 'third']);
  assert.deepEqual(results.map(function(item) { return item.result; }), ['first result', 'second result', 'third result']);
});

test('parallel web_fetch completions update shared progress by unique execution identity', function() {
  var commonStub = {};
  var watch;
  var tools;
  var results;
  var callbackCount = 0;
  var requestId = 607;
  var latestProgress;
  var i;

  FakeXMLHttpRequest.reset();
  global.XMLHttpRequest = FakeXMLHttpRequest;
  global.localStorage = new FakeLocalStorage();
  global.Pebble = createFakePebble();
  Object.keys(common).forEach(function(key) { commonStub[key] = common[key]; });
  commonStub.logDebug = function() {};
  watch = load.loadWithStubs(watchPath, { './settings': commonStub });
  tools = load.loadWithStubs(toolsPath, { './settings': commonStub, './watch': watch });

  watch.beginRequestLifecycle(requestId);
  watch.progressStart(requestId, 'thinking', 'tools');
  tools.discoverPhoneTools({ McpServersJson: '[]', WebSearchEnabled: true }, requestId, function(error, definitions, map) {
    tools.runToolCalls(requestId, [
      { id: 'duplicate-model-id', name: 'web_fetch', arguments: { url: 'https://example.test/first' } },
      { id: 'duplicate-model-id', name: 'web_fetch', arguments: { url: 'https://example.test/second' } }
    ], map, function(value) {
      callbackCount += 1;
      results = value;
    });
  });

  assert.equal(FakeXMLHttpRequest.instances.length, 2);
  FakeXMLHttpRequest.instances[1].respond(200, '<p>second result</p>');
  latestProgress = global.Pebble.messages[global.Pebble.messages.length - 1];
  assert.equal(latestProgress.ProgressHistory, 'Web Fetch');
  assert.match(latestProgress.ProgressDetail, /first/);
  assert.doesNotMatch(latestProgress.ProgressDetail, /chars/);
  assert.equal(results, undefined, 'first read remains active after reversed completion');

  FakeXMLHttpRequest.instances[0].respond(200, '<p>first result</p>');
  for (i = global.Pebble.messages.length - 1; i >= 0; i -= 1) {
    if (global.Pebble.messages[i].ProgressHistory !== undefined) {
      latestProgress = global.Pebble.messages[i];
      break;
    }
  }

  assert.equal(latestProgress.ProgressHistory, 'Web Fetch 2x');
  assert.equal(callbackCount, 1);
  assert.deepEqual(results.map(function(item) { return item.id; }), ['duplicate-model-id', 'duplicate-model-id']);
});

test('web_fetch batches stop at serial barriers before mutations and resume afterward', function() {
  var harness = createHarness();
  var results;
  var mutationCallback;
  var mutationCalls = 0;

  harness.tools.discoverPhoneTools({ McpServersJson: '[]', WebSearchEnabled: true }, 602, function(error, definitions, map) {
    map.mutate = {
      kind: 'builtin',
      name: 'mutate',
      builtinName: 'mutate',
      executionClass: 'independent_read',
      label: 'Mutation',
      parameters: { type: 'object', properties: {} },
      call: function(args, requestId, callback) {
        mutationCalls += 1;
        mutationCallback = callback;
      }
    };
    harness.tools.runToolCalls(602, [
      { id: 'read-1', name: 'web_fetch', arguments: { url: 'https://example.test/1' } },
      { id: 'read-2', name: 'web_fetch', arguments: { url: 'https://example.test/2' } },
      { id: 'mutation', name: 'mutate', arguments: {} },
      { id: 'read-3', name: 'web_fetch', arguments: { url: 'https://example.test/3' } },
      { id: 'read-4', name: 'web_fetch', arguments: { url: 'https://example.test/4' } }
    ], map, function(value) { results = value; });
  });

  assert.equal(FakeXMLHttpRequest.instances.length, 2);
  FakeXMLHttpRequest.instances[0].respond(200, '<p>one</p>');
  assert.equal(FakeXMLHttpRequest.instances.length, 2, 'read after barrier does not start early');
  assert.equal(mutationCalls, 0, 'mutation waits for entire first read batch');
  FakeXMLHttpRequest.instances[1].respond(200, '<p>two</p>');
  assert.equal(mutationCalls, 1, 'mutation starts after first batch drains');
  assert.equal(FakeXMLHttpRequest.instances.length, 2);

  mutationCallback(null, 'changed');
  assert.equal(FakeXMLHttpRequest.instances.length, 4, 'second read batch starts after mutation completes');
  FakeXMLHttpRequest.instances[3].respond(200, '<p>four</p>');
  assert.equal(results, undefined, 'second batch also waits for every read');
  FakeXMLHttpRequest.instances[2].respond(200, '<p>three</p>');

  assert.deepEqual(results.map(function(item) { return item.id; }), ['read-1', 'read-2', 'mutation', 'read-3', 'read-4']);
  assert.equal(results[2].result, 'changed');
});

test('health, MCP, and memory calls stay serial even with parallel annotations', function() {
  var harness = createHarness();
  var results;
  var healthCallback;
  var memoryCallback;
  var mcpToolName = 'Remote__lookup';
  var mcpToolInfo = {
    kind: 'mcp',
    name: mcpToolName,
    executionClass: 'independent_read',
    server: { label: 'Remote', url: 'https://mcp.example.test', sessionId: '' },
    toolName: 'lookup',
    parameters: { type: 'object', properties: {} }
  };

  harness.tools.discoverPhoneTools({
    McpServersJson: '[]',
    WebSearchEnabled: true,
    HealthToolEnabled: true,
    PebbleMemoryToolEnabled: true
  }, 603, function(error, definitions, map) {
    map.pebble_health_info.call = function(args, requestId, callback) { healthCallback = callback; };
    map.pebble_memory_search.call = function(args, requestId, callback) { memoryCallback = callback; };
    assert.equal(map.pebble_health_info.executionClass, 'serial');
    assert.equal(map.pebble_memory_search.executionClass, 'serial');
    map[mcpToolName] = mcpToolInfo;

    harness.tools.runToolCalls(603, [
      { id: 'web-1', name: 'web_fetch', arguments: { url: 'https://example.test/1' } },
      { id: 'health', name: 'pebble_health_info', arguments: { metrics: ['steps'] } },
      { id: 'web-2', name: 'web_fetch', arguments: { url: 'https://example.test/2' } },
      { id: 'mcp', name: mcpToolName, arguments: {} },
      { id: 'web-3', name: 'web_fetch', arguments: { url: 'https://example.test/3' } },
      { id: 'memory', name: 'pebble_memory_search', arguments: {} },
      { id: 'web-4', name: 'web_fetch', arguments: { url: 'https://example.test/4' } }
    ], map, function(value) { results = value; });
  });

  assert.equal(FakeXMLHttpRequest.instances.length, 1);
  FakeXMLHttpRequest.instances[0].respond(200, '<p>one</p>');
  assert.equal(typeof healthCallback, 'function');
  assert.equal(FakeXMLHttpRequest.instances.length, 1, 'health call blocks later reads');
  healthCallback(null, 'health result');
  assert.equal(FakeXMLHttpRequest.instances.length, 2);

  FakeXMLHttpRequest.instances[1].respond(200, '<p>two</p>');
  assert.equal(FakeXMLHttpRequest.instances.length, 3, 'MCP call starts only after preceding read');
  var mcpRequest = FakeXMLHttpRequest.instances[2];
  assert.equal(mcpRequest.url, 'https://mcp.example.test');
  var mcpId = JSON.parse(mcpRequest.body).id;
  mcpRequest.respond(200, { jsonrpc: '2.0', id: mcpId, result: { content: [{ type: 'text', text: 'mcp result' }] } });
  assert.equal(FakeXMLHttpRequest.instances.length, 4, 'read after MCP starts only after MCP completion');

  FakeXMLHttpRequest.instances[3].respond(200, '<p>three</p>');
  assert.equal(typeof memoryCallback, 'function');
  assert.equal(FakeXMLHttpRequest.instances.length, 4, 'memory call blocks later reads');
  memoryCallback(null, 'memory result');
  assert.equal(FakeXMLHttpRequest.instances.length, 5);
  FakeXMLHttpRequest.instances[4].respond(200, '<p>four</p>');

  assert.deepEqual(results.map(function(item) { return item.id; }), ['web-1', 'health', 'web-2', 'mcp', 'web-3', 'memory', 'web-4']);
});

test('validation errors preserve result order and break independent read batches', function() {
  var harness = createHarness();
  var results;

  harness.tools.discoverPhoneTools({ McpServersJson: '[]', WebSearchEnabled: true }, 604, function(error, definitions, map) {
    harness.tools.runToolCalls(604, [
      { id: 'first', name: 'web_fetch', arguments: { url: 'https://example.test/first' } },
      { id: 'unknown', name: 'missing', arguments: {} },
      { id: 'second', name: 'web_fetch', arguments: { url: 'https://example.test/second' } },
      { id: 'invalid', name: 'web_fetch', arguments: { url: 'https://example.test/invalid', extra: true } },
      { id: 'third', name: 'web_fetch', arguments: { url: 'https://example.test/third' } }
    ], map, function(value) { results = value; });
  });

  assert.equal(FakeXMLHttpRequest.instances.length, 1, 'unknown call separates first and second reads');
  FakeXMLHttpRequest.instances[0].respond(200, '<p>first</p>');
  assert.equal(FakeXMLHttpRequest.instances.length, 2);
  FakeXMLHttpRequest.instances[1].respond(200, '<p>second</p>');
  assert.equal(FakeXMLHttpRequest.instances.length, 3, 'invalid read separates second and third reads');
  FakeXMLHttpRequest.instances[2].respond(200, '<p>third</p>');

  assert.deepEqual(results.map(function(item) { return item.id; }), ['first', 'unknown', 'second', 'invalid', 'third']);
  assert.equal(results[1].error, 'Unknown or unavailable tool');
  assert.equal(results[3].error, 'Unsupported tool argument: extra');
});

test('mixed unknown, invalid, and successful calls report exact progress once in call order', function() {
  var harness = createHarness();
  var results;
  var callbackCount = 0;
  var toolMap = {
    echo: {
      kind: 'builtin',
      name: 'echo',
      builtinName: 'echo',
      label: 'Echo',
      executionClass: 'serial',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
        additionalProperties: false
      },
      call: function(args, requestId, callback) {
        callback(null, args.text);
      }
    }
  };

  harness.tools.runToolCalls(608, [
    { id: 'unknown', name: 'missing', arguments: {} },
    { id: 'invalid', name: 'echo', arguments: {} },
    { id: 'ok', name: 'echo', arguments: { text: 'hello' } }
  ], toolMap, function(value) {
    callbackCount += 1;
    results = value;
  });

  assert.equal(callbackCount, 1);
  assert.deepEqual(results.map(function(item) { return item.id; }), ['unknown', 'invalid', 'ok']);
  assert.equal(results[0].error, 'Unknown or unavailable tool');
  assert.equal(results[1].error, 'Missing required tool argument: text');
  assert.equal(results[2].result, 'hello');
  assert.deepEqual(harness.watch.progress, [
    ['done', 'missing', 'unknown tool'],
    ['start', 'Echo', 'invalid arguments'],
    ['done', 'Echo', 'error: Missing required tool argument: text'],
    ['start', 'Echo', 'echo: { text:hello }'],
    ['done', 'Echo', '5 chars']
  ]);
});

test('stale read callbacks cannot start queued reads or mutations', function() {
  var harness = createHarness();
  var requestId = 605;
  var results;
  var mutationCalls = 0;

  harness.watch.isCurrentRequest = function(id) { return id === requestId; };
  harness.tools.discoverPhoneTools({ McpServersJson: '[]', WebSearchEnabled: true }, requestId, function(error, definitions, map) {
    map.mutate = {
      kind: 'builtin',
      name: 'mutate',
      builtinName: 'mutate',
      executionClass: 'serial',
      parameters: { type: 'object', properties: {} },
      call: function(args, id, callback) { mutationCalls += 1; callback(null, 'mutated'); }
    };
    harness.tools.runToolCalls(requestId, [
      { id: 'read-1', name: 'web_fetch', arguments: { url: 'https://example.test/1' } },
      { id: 'read-2', name: 'web_fetch', arguments: { url: 'https://example.test/2' } },
      { id: 'read-3', name: 'web_fetch', arguments: { url: 'https://example.test/3' } },
      { id: 'mutation', name: 'mutate', arguments: {} }
    ], map, function(value) { results = value; });
  });

  assert.equal(FakeXMLHttpRequest.instances.length, 2);
  requestId = 606;
  FakeXMLHttpRequest.instances[0].respond(200, '<p>stale</p>');
  FakeXMLHttpRequest.instances[1].respond(200, '<p>stale</p>');

  assert.equal(FakeXMLHttpRequest.instances.length, 2, 'queued third read never starts after cancellation');
  assert.equal(mutationCalls, 0, 'mutation never starts after cancellation');
  assert.equal(results, undefined, 'stale batch callback remains suppressed');
});

test('duplicate tool callbacks settle once and synchronous throws do not block later tools', function() {
  var harness = createHarness();
  var results;
  var callbackCount = 0;
  var pendingReads = [];

  harness.tools.discoverPhoneTools({ McpServersJson: '[]', WebSearchEnabled: true }, 606, function(error, definitions, map) {
    map.sync_throw = {
      kind: 'builtin',
      name: 'sync_throw',
      builtinName: 'sync_throw',
      executionClass: 'serial',
      parameters: { type: 'object', properties: {} },
      call: function() { throw new Error('synthetic tool failure'); }
    };
    map.web_fetch.call = function(args, requestId, callback) { pendingReads.push(callback); };
    harness.tools.runToolCalls(606, [
      { id: 'throws', name: 'sync_throw', arguments: {} },
      { id: 'read-1', name: 'web_fetch', arguments: { url: 'https://example.test/1' } },
      { id: 'read-2', name: 'web_fetch', arguments: { url: 'https://example.test/2' } }
    ], map, function(value) {
      callbackCount += 1;
      results = value;
    });
  });

  assert.equal(pendingReads.length, 2, 'later reads start after synchronous exception is captured');
  pendingReads[0](null, 'one');
  pendingReads[0](null, 'duplicate');
  assert.equal(callbackCount, 0);
  pendingReads[1](null, 'two');
  pendingReads[1](null, 'duplicate');

  assert.equal(callbackCount, 1);
  assert.deepEqual(results.map(function(item) { return item.id; }), ['throws', 'read-1', 'read-2']);
  assert.match(results[0].error, /synthetic tool failure/);
  assert.deepEqual(results.slice(1).map(function(item) { return item.result; }), ['one', 'two']);
});

test('MCP discovery initializes session and exposes filtered tools', function() {
  var harness = createHarness();
  var result;
  var settings = {
    McpServersJson: JSON.stringify([{
      enabled: true,
      label: 'Docs',
      url: 'https://mcp.example.test',
      allowedTools: 'search',
      maxToolCalls: '2',
      authorization: 'secret',
      headers: [{ name: 'X-Test', value: 'yes' }]
    }]),
    GeolocationToolEnabled: false,
    TimelineToolEnabled: false,
    HealthToolEnabled: false
  };

  harness.tools.discoverPhoneTools(settings, 2, function(error, definitions, map) {
    result = { error: error, definitions: definitions, map: map };
  });

  assert.equal(FakeXMLHttpRequest.instances.length, 1);
  assert.equal(FakeXMLHttpRequest.instances[0].headers.Authorization, 'Bearer secret');
  assert.equal(FakeXMLHttpRequest.instances[0].headers['X-Test'], 'yes');
  FakeXMLHttpRequest.instances[0].respond(200, { result: { protocolVersion: '2025-06-18' } }, {
    'Mcp-Session-Id': 'session-1'
  });

  assert.equal(FakeXMLHttpRequest.instances.length, 2);
  assert.equal(FakeXMLHttpRequest.instances[1].headers['Mcp-Session-Id'], 'session-1');
  FakeXMLHttpRequest.instances[1].respond(202, '');

  assert.equal(FakeXMLHttpRequest.instances.length, 3);
  FakeXMLHttpRequest.instances[2].respond(200, { result: { tools: [
    { name: 'search', description: 'Search docs', inputSchema: { type: 'object', properties: {} } },
    { name: 'hidden', description: 'Hidden' }
  ] } });

  assert.equal(result.error, null);
  assert.deepEqual(result.definitions.map(function(tool) { return tool.name; }), ['Docs__search']);
  assert.equal(result.map.Docs__search.server.sessionId, 'session-1');
  assert.equal(result.map.Docs__search.server.maxToolCalls, 2);
});

test('runToolCalls validates unknown and malformed calls while preserving order', function() {
  var harness = createHarness();
  var results;
  var toolMap = {
    known: {
      kind: 'builtin',
      builtinName: 'health',
      name: 'known',
      parameters: { type: 'object', required: ['range'], properties: { range: {} }, additionalProperties: false }
    }
  };

  harness.tools.runToolCalls(3, [
    { id: 'one', name: 'missing', arguments: {} },
    { id: 'two', name: 'known', arguments: '{bad' },
    { id: 'three', name: 'known', arguments: {} }
  ], toolMap, function(value) { results = value; });

  assert.deepEqual(results.map(function(item) { return item.error; }), [
    'Unknown or unavailable tool',
    'Malformed tool arguments JSON',
    'Missing required tool argument: range'
  ]);
});

test('geolocation built-in returns serialized coordinates', function() {
  var harness = createHarness();
  var results;
  global.navigator = {
    geolocation: {
      getCurrentPosition: function(success, failure, options) {
        assert.equal(options.enableHighAccuracy, true);
        success({
          coords: { latitude: 1.25, longitude: -2.5, accuracy: 8, altitude: null, heading: null, speed: null },
          timestamp: 123
        });
      }
    }
  };

  harness.tools.discoverPhoneTools({
    McpServersJson: '[]',
    GeolocationToolEnabled: true,
    TimelineToolEnabled: false,
    HealthToolEnabled: false
  }, 4, function(error, definitions, map) {
    harness.tools.runToolCalls(4, [{
      id: 'geo',
      name: 'pebble_get_location',
      arguments: { enableHighAccuracy: true }
    }], map, function(value) { results = value; });
  });

  var location = JSON.parse(results[0].result);
  assert.equal(location.latitude, 1.25);
  assert.equal(location.longitude, -2.5);
  assert.equal(location.accuracyMeters, 8);
});

test('Timeline rejects pins outside API date range before network request', function() {
  var harness = createHarness();
  var results;

  harness.tools.discoverPhoneTools({
    McpServersJson: '[]',
    GeolocationToolEnabled: false,
    TimelineToolEnabled: true,
    HealthToolEnabled: false
  }, 40, function(error, definitions, map) {
    harness.tools.runToolCalls(40, [{
      id: 'old',
      name: 'pebble_timeline_create_pin',
      arguments: { title: 'Old', time: '2000-01-01T00:00:00Z' }
    }, {
      id: 'future',
      name: 'pebble_timeline_create_pin',
      arguments: { title: 'Future', time: '2100-01-01T00:00:00Z' }
    }], map, function(value) { results = value; });
  });

  assert.match(results[0].error, /2 days in the past/);
  assert.match(results[1].error, /1 year in the future/);
  assert.equal(FakeXMLHttpRequest.instances.length, 0);
});

test('Timeline retries one transient PUT using Retry-After', function() {
  var timers = installFakeTimers();
  var harness = createHarness();
  var results;
  var initialUrl;
  var initialId;
  global.Pebble = {
    getTimelineToken: function(callback) { callback('timeline-token'); }
  };

  try {
    harness.tools.discoverPhoneTools({
      McpServersJson: '[]',
      GeolocationToolEnabled: false,
      TimelineToolEnabled: true,
      HealthToolEnabled: false
    }, 41, function(error, definitions, map) {
      harness.tools.runToolCalls(41, [{
        id: 'pin',
        name: 'pebble_timeline_create_pin',
        arguments: {
          title: 'Retry',
          time: new Date(new Date().getTime() + 60 * 60 * 1000).toISOString()
        }
      }], map, function(value) { results = value; });
    });

    assert.equal(FakeXMLHttpRequest.instances.length, 1);
    initialUrl = FakeXMLHttpRequest.instances[0].url;
    initialId = JSON.parse(FakeXMLHttpRequest.instances[0].body).id;
    FakeXMLHttpRequest.instances[0].respond(429, 'busy', { 'Retry-After': '0' });
    timers.runAll();
    assert.equal(FakeXMLHttpRequest.instances.length, 2);
    assert.equal(FakeXMLHttpRequest.instances[1].url, initialUrl, 'retry uses exact same generated pin URL');
    assert.equal(JSON.parse(FakeXMLHttpRequest.instances[1].body).id, initialId, 'retry uses exact same generated id');
    FakeXMLHttpRequest.instances[1].respond(200, '');
    assert.equal(results[0].error, undefined);
    var parsed = JSON.parse(results[0].result);
    assert.equal(parsed.status, 'success');
    assert.equal(parsed.id, initialId);
    assert.equal(parsed.editable, true);
  } finally {
    timers.restore();
  }
});

test('Timeline create rejects unknown arguments by schema before any timeline call', function() {
  var harness = createHarness();
  var results;
  var tokenRequests = 0;
  global.Pebble = {
    getTimelineToken: function(callback) {
      tokenRequests += 1;
      callback('timeline-token');
    }
  };

  harness.tools.discoverPhoneTools({
    McpServersJson: '[]',
    GeolocationToolEnabled: false,
    TimelineToolEnabled: true,
    HealthToolEnabled: false
  }, 42, function(error, definitions, map) {
    harness.tools.runToolCalls(42, [{
      id: 'pin',
      name: 'pebble_timeline_create_pin',
      arguments: {
        title: 'Unknown',
        time: new Date(new Date().getTime() + 60 * 60 * 1000).toISOString(),
        sneakyExtra: true
      }
    }], map, function(value) { results = value; });
  });

  assert.equal(results[0].error, 'Unsupported tool argument: sneakyExtra');
  assert.equal(FakeXMLHttpRequest.instances.length, 0);
  assert.equal(tokenRequests, 0);
});

test('Timeline creation generates ids, rejects supplied ids, and retires ambiguous tool name', function() {
  var harness = createHarness();
  var timelineStore = require('../../src/pkjs/timeline_store');
  var discovered;
  var results;
  var apiCalls = 0;
  var future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  global.Pebble = {
    getTimelineToken: function(callback) { apiCalls += 1; callback('timeline-token'); },
    insertTimelinePin: function() { apiCalls += 1; }
  };

  harness.tools.discoverPhoneTools({
    McpServersJson: '[]',
    GeolocationToolEnabled: false,
    TimelineToolEnabled: true,
    HealthToolEnabled: false
  }, 44, function(error, definitions, map) {
    discovered = { definitions: definitions, map: map };
  });

  assert.deepEqual(discovered.definitions.map(function(tool) { return tool.name; }), [
    'pebble_timeline_create_pin',
    'pebble_timeline_create_reminder',
    'pebble_timeline_delete_pin',
    'pebble_timeline_edit_pin',
    'pebble_timeline_list_pins'
  ]);
  var createDescription = discovered.definitions.filter(function(tool) { return tool.name === 'pebble_timeline_create_pin'; })[0].description;
  var reminderDescription = discovered.definitions.filter(function(tool) { return tool.name === 'pebble_timeline_create_reminder'; })[0].description;
  var editDescription = discovered.definitions.filter(function(tool) { return tool.name === 'pebble_timeline_edit_pin'; })[0].description;
  var listDescription = discovered.definitions.filter(function(tool) { return tool.name === 'pebble_timeline_list_pins'; })[0].description;
  assert.match(createDescription, /generates a new id/);
  assert.match(createDescription, /pebble_timeline_edit_pin/);
  assert.match(reminderDescription, /pebble_timeline_create_pin/);
  assert.match(reminderDescription, /scheduled reminder notification attached to the pin/i);
  assert.match(reminderDescription, /does not create an OS\/system alarm/i);
  assert.doesNotMatch(reminderDescription, /use for [^.;]*\balarm/i);
  assert.match(editDescription, /Only supplied fields change/);
  assert.match(editDescription, /integer or enum fields/);
  assert.match(editDescription, /clearReminder:true/);
  assert.match(listDescription, /nextCursor/);
  assert.match(listDescription, /titleTruncated\/timeTruncated/);
  ['pebble_timeline_create_pin', 'pebble_timeline_create_reminder'].forEach(function(name) {
    assert.equal(discovered.map[name].parameters.additionalProperties, false);
    assert.equal(discovered.map[name].parameters.properties.id, undefined);
  });
  Object.keys(discovered.map).forEach(function(name) {
    assert.equal(discovered.map[name].parameters.additionalProperties, false, name + ' rejects unknown root fields');
  });

  harness.tools.runToolCalls(44, [
    { id: 'create-id', name: 'pebble_timeline_create_pin', arguments: { id: 'caller-pin', title: 'Pin', time: future } },
    { id: 'reminder-id', name: 'pebble_timeline_create_reminder', arguments: { pinId: 'caller-reminder', title: 'Reminder', time: future } },
    { id: 'legacy', name: 'pebble_timeline_create_or_update_pin', arguments: { title: 'Legacy', time: future } }
  ], discovered.map, function(value) { results = value; });

  assert.match(results[0].error, /generates a new pin id/);
  assert.match(results[1].error, /generates a new pin id/);
  assert.equal(results[2].error, 'Unknown or unavailable tool');
  assert.equal(apiCalls, 0);
  assert.equal(FakeXMLHttpRequest.instances.length, 0);
  assert.equal(timelineStore.listTimelinePins().length, 0);
});

test('Timeline reminder rejects raw Pebble pin payload keys', function() {
  var harness = createHarness();
  var results;
  global.Pebble = {
    getTimelineToken: function(callback) { callback('timeline-token'); }
  };

  harness.tools.discoverPhoneTools({
    McpServersJson: '[]',
    GeolocationToolEnabled: false,
    TimelineToolEnabled: true,
    HealthToolEnabled: false
  }, 43, function(error, definitions, map) {
    harness.tools.runToolCalls(43, [{
      id: 'pin',
      name: 'pebble_timeline_create_reminder',
      arguments: {
        title: 'Raw',
        time: new Date(new Date().getTime() + 60 * 60 * 1000).toISOString(),
        reminders: [{ time: '2026-01-01T00:00:00Z' }]
      }
    }], map, function(value) { results = value; });
  });

  assert.equal(results[0].error, 'Unsupported tool argument: reminders');
  assert.equal(FakeXMLHttpRequest.instances.length, 0);
});

test('every enabled built-in rejects unknown fields before side effects', function() {
  var harness = createHarness();
  var future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  var storage = global.localStorage;
  var originalGetItem = storage.getItem;
  var originalSetItem = storage.setItem;
  var storageCalls = 0;
  var sideEffects = { location: 0, timeline: 0 };
  var discovered;
  var results;

  storage.getItem = function(key) {
    storageCalls += 1;
    return originalGetItem.call(storage, key);
  };
  storage.setItem = function(key, value) {
    storageCalls += 1;
    return originalSetItem.call(storage, key, value);
  };
  global.navigator = {
    geolocation: {
      getCurrentPosition: function() { sideEffects.location += 1; }
    }
  };
  global.Pebble = {
    getTimelineToken: function(callback) { sideEffects.timeline += 1; callback('timeline-token'); },
    insertTimelinePin: function() { sideEffects.timeline += 1; },
    deleteTimelinePin: function() { sideEffects.timeline += 1; }
  };

  harness.tools.discoverPhoneTools({
    McpServersJson: '[]',
    PebbleMemoryToolEnabled: true,
    WebSearchEnabled: true,
    GeolocationToolEnabled: true,
    TimelineToolEnabled: true,
    HealthToolEnabled: true
  }, 450, function(error, definitions, map) {
    assert.equal(error, null);
    discovered = { definitions: definitions, map: map };
  });

  assert.equal(discovered.definitions.length, 11);
  discovered.definitions.forEach(function(definition) {
    assert.equal(definition.parameters.additionalProperties, false, definition.name + ' has strict root schema');
  });

  harness.tools.runToolCalls(450, [
    { name: 'pebble_memory_save', arguments: { text: 'note', unsupportedField: true } },
    { name: 'pebble_memory_search', arguments: { query: 'note', unsupportedField: true } },
    { name: 'pebble_memory_delete', arguments: { id: 'memory-id', unsupportedField: true } },
    { name: 'web_fetch', arguments: { url: 'https://example.test', unsupportedField: true } },
    { name: 'pebble_get_location', arguments: { timeoutMs: 1000, unsupportedField: true } },
    { name: 'pebble_timeline_create_pin', arguments: { title: 'Pin', time: future, unsupportedField: true } },
    { name: 'pebble_timeline_create_reminder', arguments: { title: 'Reminder', time: future, reminderTim: future } },
    { name: 'pebble_timeline_delete_pin', arguments: { id: 'pin-id', unsupportedField: true } },
    { name: 'pebble_timeline_edit_pin', arguments: { id: 'pin-id', title: 'Edit', unsupportedField: true } },
    { name: 'pebble_timeline_list_pins', arguments: { cursor: 'opaque', unsupportedField: true } },
    { name: 'pebble_health_info', arguments: { metrics: ['steps'], unsupportedField: true } }
  ], discovered.map, function(value) { results = value; });

  assert.deepEqual(results.map(function(result) { return result.error; }), [
    'Unsupported tool argument: unsupportedField',
    'Unsupported tool argument: unsupportedField',
    'Unsupported tool argument: unsupportedField',
    'Unsupported tool argument: unsupportedField',
    'Unsupported tool argument: unsupportedField',
    'Unsupported tool argument: unsupportedField',
    'Unsupported tool argument: reminderTim',
    'Unsupported tool argument: unsupportedField',
    'Unsupported tool argument: unsupportedField',
    'Unsupported tool argument: unsupportedField',
    'Unsupported tool argument: unsupportedField'
  ]);
  assert.equal(FakeXMLHttpRequest.instances.length, 0, 'invalid web and Timeline calls do not start requests');
  assert.equal(storageCalls, 0, 'invalid memory and Timeline calls do not access storage');
  assert.deepEqual(sideEffects, { location: 0, timeline: 0 });
  assert.equal(harness.watch.healthQueries.length, 0, 'invalid health call does not query watch');
});

test('health metrics arrays and pagination cursor types validate with precise paths', function() {
  var harness = createHarness();
  var discovered;
  var results;

  harness.tools.discoverPhoneTools({
    McpServersJson: '[]',
    PebbleMemoryToolEnabled: true,
    GeolocationToolEnabled: false,
    TimelineToolEnabled: true,
    HealthToolEnabled: true
  }, 451, function(error, definitions, map) {
    discovered = { definitions: definitions, map: map };
  });

  harness.tools.runToolCalls(451, [
    { name: 'pebble_health_info', arguments: { metrics: ['steps', 3] } },
    { name: 'pebble_health_info', arguments: { metrics: ['steps', 'steps'] } },
    { name: 'pebble_health_info', arguments: { metrics: ['unsupported_metric'] } },
    { name: 'pebble_health_info', arguments: { metrics: ['steps', 'active_time', 'distance', 'sleep', 'restful_sleep', 'resting_calories', 'active_calories', 'heart_rate', 'activity_sessions', 'sleep_sessions', 'steps'] } },
    { name: 'pebble_timeline_list_pins', arguments: { cursor: 7 } },
    { name: 'pebble_memory_search', arguments: { cursor: 7 } },
    { name: 'pebble_health_info', arguments: { metrics: ['steps'] } }
  ], discovered.map, function(value) { results = value; });

  assert.deepEqual(results.map(function(result) { return result.error; }), [
    'metrics[1] must be a string',
    'metrics must contain unique items',
    'metrics[0] must be one of steps, active_time, distance, sleep, restful_sleep, resting_calories, active_calories, heart_rate, activity_sessions, sleep_sessions',
    'metrics must contain no more than 10 item(s)',
    'cursor must be a string',
    'cursor must be a string',
    undefined
  ]);
  assert.equal(harness.watch.healthQueries.length, 1, 'only valid metrics reach the health provider');
});

test('schema validation bounds recursive and array collection work', function() {
  var harness = createHarness();
  var schema = { type: 'object', additionalProperties: false, properties: { values: { type: 'array', items: { type: 'integer' } } } };
  var deepSchema = { type: 'object', additionalProperties: false, properties: {} };
  var deepArgs = {};
  var schemaNode = deepSchema;
  var argsNode = deepArgs;
  var tooManyValues = [];
  var toolMap = {
    bounded: {
      kind: 'builtin',
      name: 'bounded',
      parameters: schema,
      call: function(args, requestId, callback) { callback(null, 'executed'); }
    },
    deep: {
      kind: 'builtin',
      name: 'deep',
      parameters: deepSchema,
      call: function(args, requestId, callback) { callback(null, 'executed'); }
    }
  };
  var results;
  var i;

  for (i = 0; i < 2200; i += 1) {
    tooManyValues.push(i);
  }
  for (i = 0; i < 65; i += 1) {
    schemaNode.properties.child = { type: 'object', additionalProperties: false, properties: {} };
    schemaNode = schemaNode.properties.child;
    argsNode.child = {};
    argsNode = argsNode.child;
  }

  harness.tools.runToolCalls(452, [
    { name: 'bounded', arguments: { values: tooManyValues } },
    { name: 'deep', arguments: deepArgs }
  ], toolMap, function(value) { results = value; });

  assert.match(results[0].error, /^values\[\d+\] exceeds validation work limit 2048$/);
  assert.match(results[1].error, /exceeds maximum validation depth 64$/);
});

test('MCP nested strict objects reject extras while open objects remain open', function() {
  var harness = createHarness();
  var settings = {
    McpServersJson: JSON.stringify([{ enabled: true, label: 'Nested', url: 'https://nested.example.test' }]),
    GeolocationToolEnabled: false,
    TimelineToolEnabled: false,
    HealthToolEnabled: false
  };
  var discovered;
  var invalidResults;
  var validResults;
  var validArgs = {
    profile: { name: 'Ada' },
    metadata: { arbitrary: { nested: true } },
    extraTopLevel: { accepted: true }
  };

  harness.tools.discoverPhoneTools(settings, 453, function(error, definitions, map) {
    assert.equal(error, null);
    discovered = { definitions: definitions, map: map };
  });
  FakeXMLHttpRequest.instances[0].respond(200, { result: { protocolVersion: '2025-06-18' } });
  FakeXMLHttpRequest.instances[1].respond(202, '');
  FakeXMLHttpRequest.instances[2].respond(200, { result: { tools: [{
    name: 'lookup',
    inputSchema: {
      type: 'object',
      properties: {
        profile: {
          type: 'object',
          additionalProperties: false,
          properties: { name: { type: 'string' } }
        },
        metadata: {
          type: 'object',
          properties: { known: { type: 'string' } }
        }
      }
    }
  }] } });

  harness.tools.runToolCalls(453, [
    { name: 'Nested__lookup', arguments: { profile: { name: 'Ada', secret: 'reject' }, metadata: { arbitrary: true }, extraTopLevel: true } },
    { name: 'Nested__lookup', arguments: { profile: { name: 5 }, metadata: { arbitrary: true } } }
  ], discovered.map, function(value) { invalidResults = value; });

  assert.deepEqual(invalidResults.map(function(result) { return result.error; }), [
    'Unsupported tool argument: profile.secret',
    'profile.name must be a string'
  ]);
  assert.equal(FakeXMLHttpRequest.instances.length, 3, 'invalid nested args do not call MCP server');

  harness.tools.runToolCalls(453, [{ name: 'Nested__lookup', arguments: validArgs }], discovered.map, function(value) {
    validResults = value;
  });
  assert.equal(FakeXMLHttpRequest.instances.length, 4);
  assert.deepEqual(JSON.parse(FakeXMLHttpRequest.last().body).params.arguments, validArgs,
    'unconstrained MCP dictionaries and open top-level fields pass through');
  FakeXMLHttpRequest.last().respond(200, { result: { content: [{ type: 'text', text: 'ok' }] } });
  assert.equal(validResults[0].result, 'ok');
});

test('MCP arrays honor declared maxItems within shared validation work budget', function() {
  var harness = createHarness();
  var settings = {
    McpServersJson: JSON.stringify([{ enabled: true, label: 'Arrays', url: 'https://arrays.example.test' }]),
    GeolocationToolEnabled: false,
    TimelineToolEnabled: false,
    HealthToolEnabled: false
  };
  var discovered;
  var results;
  var validValues = [];
  var duplicateValues;
  var tooManyDeclaredValues;
  var oversizedValues = [];
  var i;

  for (i = 0; i < 257; i += 1) {
    validValues.push(i);
  }
  for (i = 0; i < 2200; i += 1) {
    oversizedValues.push(i);
  }
  duplicateValues = validValues.slice();
  duplicateValues[256] = duplicateValues[0];
  tooManyDeclaredValues = validValues.slice();
  for (i = 257; i <= 300; i += 1) {
    tooManyDeclaredValues.push(i);
  }

  harness.tools.discoverPhoneTools(settings, 454, function(error, definitions, map) {
    assert.equal(error, null);
    discovered = { definitions: definitions, map: map };
  });
  FakeXMLHttpRequest.instances[0].respond(200, { result: { protocolVersion: '2025-06-18' } });
  FakeXMLHttpRequest.instances[1].respond(202, '');
  FakeXMLHttpRequest.instances[2].respond(200, { result: { tools: [{
    name: 'bounded',
    inputSchema: {
      type: 'object',
      properties: {
        values: { type: 'array', maxItems: 300, uniqueItems: true, items: { type: 'integer' } }
      }
    }
  }, {
    name: 'unbounded',
    inputSchema: {
      type: 'object',
      properties: {
        values: { type: 'array', items: { type: 'integer' } }
      }
    }
  }] } });

  harness.tools.runToolCalls(454, [
    { name: 'Arrays__bounded', arguments: { values: validValues } },
    { name: 'Arrays__bounded', arguments: { values: tooManyDeclaredValues } },
    { name: 'Arrays__unbounded', arguments: { values: oversizedValues } },
    { name: 'Arrays__bounded', arguments: { values: duplicateValues } }
  ], discovered.map, function(value) { results = value; });

  assert.equal(FakeXMLHttpRequest.instances.length, 4, 'only valid bounded array reaches MCP');
  assert.equal(JSON.parse(FakeXMLHttpRequest.last().body).params.arguments.values.length, 257);
  FakeXMLHttpRequest.last().respond(200, { result: { content: [{ type: 'text', text: 'accepted' }] } });

  assert.equal(results[0].result, 'accepted');
  assert.equal(results[1].error, 'values must contain no more than 300 item(s)');
  assert.match(results[2].error, /^values\[\d+\] exceeds validation work limit 2048$/);
  assert.equal(results[3].error, 'values must contain unique items');
});

test('MCP parse and HTTP failures omit failed server without blocking discovery', function() {
  var harness = createHarness();
  var result;
  harness.tools.discoverPhoneTools({
    McpServersJson: JSON.stringify([{ enabled: true, label: 'Broken', url: 'https://mcp.invalid' }]),
    GeolocationToolEnabled: false,
    TimelineToolEnabled: false,
    HealthToolEnabled: false
  }, 5, function(error, definitions) {
    result = { error: error, definitions: definitions };
  });

  FakeXMLHttpRequest.last().respond(500, 'failure');
  assert.deepEqual(result, { error: null, definitions: [] });
});

test('prototype-property tool names are rejected as unknown tools', function() {
  var harness = createHarness();
  var results;
  var toolMap = {
    known: {
      kind: 'builtin',
      name: 'known',
      parameters: { type: 'object', properties: {} },
      call: function(args, requestId, callback) { callback(null, 'ok'); }
    },
    __proto__: null
  };

  harness.tools.runToolCalls(6, [
    { id: 'proto', name: 'toString', arguments: {} },
    { id: 'proto2', name: '__proto__', arguments: {} },
    { id: 'ok', name: 'known', arguments: {} }
  ], toolMap, function(value) { results = value; });

  assert.equal(results[0].error, 'Unknown or unavailable tool');
  assert.equal(results[1].error, 'Unknown or unavailable tool');
  assert.equal(results[2].result, 'ok');
});

test('MCP isError results become failed tool results', function() {
  var harness = createHarness();
  var settings = {
    McpServersJson: JSON.stringify([{ enabled: true, label: 'Err', url: 'https://err.example.test' }]),
    GeolocationToolEnabled: false,
    TimelineToolEnabled: false,
    HealthToolEnabled: false
  };
  var discovered;
  var results;

  harness.tools.discoverPhoneTools(settings, 7, function(error, definitions, map) {
    discovered = { error: error, definitions: definitions, map: map };
  });
  FakeXMLHttpRequest.instances[0].respond(200, { result: { protocolVersion: '2025-06-18' } }, {});
  FakeXMLHttpRequest.instances[1].respond(202, '');
  FakeXMLHttpRequest.instances[2].respond(200, {
    result: { tools: [{ name: 'boom', description: 'fail tool', inputSchema: { type: 'object', properties: {} } }] }
  });

  assert.equal(discovered.error, null);
  var toolName = discovered.definitions[0].name;

  harness.tools.runToolCalls(8, [{ id: 'c', name: toolName, arguments: {} }], discovered.map, function(value) {
    results = value;
  });
  FakeXMLHttpRequest.last().respond(200, {
    result: {
      content: [{ type: 'text', text: 'Tool failed: missing required argument' }],
      structuredContent: { code: 'missing_argument' },
      isError: true
    }
  });

  assert.match(results[0].error, /Tool failed: missing required argument/);
  assert.match(results[0].error, /"code":"missing_argument"/);
  assert.equal(results[0].result, undefined, 'MCP isError content remains an error, not a successful result');
});

test('duplicate MCP slugs are stable regardless of response order', function() {
  var harness = createHarness();
  var settings = {
    McpServersJson: JSON.stringify([
      { enabled: true, label: 'Docs', url: 'https://a.example.test' },
      { enabled: true, label: 'Docs', url: 'https://b.example.test' }
    ]),
    GeolocationToolEnabled: false,
    TimelineToolEnabled: false,
    HealthToolEnabled: false
  };
  var discovered;
  var listTool = JSON.stringify({
    name: 'search',
    description: 'search tool',
    inputSchema: { type: 'object', properties: {} }
  });

  harness.tools.discoverPhoneTools(settings, 9, function(error, definitions, map) {
    discovered = { error: error, definitions: definitions, map: map };
  });

  FakeXMLHttpRequest.instances[1].respond(200, { result: { protocolVersion: '2025-06-18' } }, {});
  FakeXMLHttpRequest.instances[2].respond(202, '');
  FakeXMLHttpRequest.instances[3].respond(200, { result: { tools: [JSON.parse(listTool)] } });
  FakeXMLHttpRequest.instances[0].respond(200, { result: { protocolVersion: '2025-06-18' } }, {});
  FakeXMLHttpRequest.instances[4].respond(202, '');
  FakeXMLHttpRequest.instances[5].respond(200, { result: { tools: [JSON.parse(listTool)] } });

  assert.equal(discovered.error, null);
  assert.deepEqual(
    discovered.definitions.map(function(tool) { return tool.name; }),
    ['Docs__search', 'Docs__search_2']
  );
  assert.equal(discovered.map['Docs__search'].server.url, 'https://a.example.test');
  assert.equal(discovered.map['Docs__search_2'].server.url, 'https://b.example.test');
});

test('initialized notification errors prevent tools/list discovery', function() {
  var harness = createHarness();
  var settings = {
    McpServersJson: JSON.stringify([{ enabled: true, label: 'NoNotif', url: 'https://nn.example.test' }]),
    GeolocationToolEnabled: false,
    TimelineToolEnabled: false,
    HealthToolEnabled: false
  };
  var discovered;

  harness.tools.discoverPhoneTools(settings, 10, function(error, definitions) {
    discovered = { error: error, definitions: definitions };
  });

  assert.equal(FakeXMLHttpRequest.instances.length, 1);
  FakeXMLHttpRequest.instances[0].respond(200, { result: { protocolVersion: '2025-06-18' } }, {});
  assert.equal(FakeXMLHttpRequest.instances.length, 2);
  FakeXMLHttpRequest.instances[1].respond(500, 'notif failed');

  assert.equal(FakeXMLHttpRequest.instances.length, 2);
  assert.equal(discovered.error, null);
  assert.deepEqual(discovered.definitions, []);
});

test('multi-event SSE response is parsed and notification/DONE ignored', function() {
  var harness = createHarness();
  var settings = {
    McpServersJson: JSON.stringify([{ enabled: true, label: 'Sse', url: 'https://sse.example.test' }]),
    GeolocationToolEnabled: false,
    TimelineToolEnabled: false,
    HealthToolEnabled: false
  };
  var discovered;

  harness.tools.discoverPhoneTools(settings, 11, function(error, definitions, map) {
    discovered = { error: error, definitions: definitions, map: map };
  });
  FakeXMLHttpRequest.instances[0].respond(200, { result: { protocolVersion: '2025-06-18' } }, {});
  FakeXMLHttpRequest.instances[1].respond(202, '');

  var listReq = FakeXMLHttpRequest.instances[2];
  var rpcId = JSON.parse(listReq.body).id;
  var notificationEvent = 'data: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progress":50}}';
  var missingIdEvent = 'data: {"jsonrpc":"2.0","result":{"tools":[{"name":"wrong"}]}}';
  var responseEvent =
    'data: {"jsonrpc":"2.0","id":' + rpcId +
    ',"result":{"tools":[{"name":"ping","description":"ping tool","inputSchema":{"type":"object","properties":{}}}]}}';
  var sseBody = 'data: [DONE]\n\n' + notificationEvent + '\n\n' + missingIdEvent + '\n\n' + responseEvent + '\n\n';
  listReq.respond(200, sseBody);

  assert.equal(discovered.error, null);
  assert.deepEqual(discovered.definitions.map(function(tool) { return tool.name; }), ['Sse__ping']);
});

test('tools/list pagination accumulates pages via nextCursor', function() {
  var harness = createHarness();
  var settings = {
    McpServersJson: JSON.stringify([{ enabled: true, label: 'Page', url: 'https://page.example.test' }]),
    GeolocationToolEnabled: false,
    TimelineToolEnabled: false,
    HealthToolEnabled: false
  };
  var discovered;

  harness.tools.discoverPhoneTools(settings, 12, function(error, definitions) {
    discovered = { error: error, definitions: definitions };
  });
  FakeXMLHttpRequest.instances[0].respond(200, { result: { protocolVersion: '2025-06-18' } }, {});
  FakeXMLHttpRequest.instances[1].respond(202, '');
  FakeXMLHttpRequest.instances[2].respond(200, {
    result: {
      tools: [
        { name: 'a', description: 'a', inputSchema: { type: 'object', properties: {} } },
        { name: 'b', description: 'b', inputSchema: { type: 'object', properties: {} } }
      ],
      nextCursor: 'cursor-2'
    }
  });

  assert.equal(FakeXMLHttpRequest.instances.length, 4);
  assert.equal(JSON.parse(FakeXMLHttpRequest.instances[3].body).params.cursor, 'cursor-2');
  FakeXMLHttpRequest.instances[3].respond(200, {
    result: { tools: [{ name: 'c', description: 'c', inputSchema: { type: 'object', properties: {} } }] }
  });

  assert.equal(discovered.error, null);
  assert.deepEqual(
    discovered.definitions.map(function(tool) { return tool.name; }),
    ['Page__a', 'Page__b', 'Page__c']
  );
});

test('initialize protocolVersion mismatch blocks discovery', function() {
  var harness = createHarness();
  var settings = {
    McpServersJson: JSON.stringify([{ enabled: true, label: 'Ver', url: 'https://ver.example.test' }]),
    GeolocationToolEnabled: false,
    TimelineToolEnabled: false,
    HealthToolEnabled: false
  };
  var discovered;

  harness.tools.discoverPhoneTools(settings, 13, function(error, definitions) {
    discovered = { error: error, definitions: definitions };
  });
  FakeXMLHttpRequest.instances[0].respond(200, { result: { protocolVersion: '2025-03-26' } }, {});

  assert.equal(FakeXMLHttpRequest.instances.length, 1);
  assert.equal(discovered.error, null);
  assert.deepEqual(discovered.definitions, []);
});

test('MCP discovery cache reuses session and definitions without new requests', function() {
  var harness = createHarness();
  var settings = {
    McpServersJson: JSON.stringify([{ enabled: true, label: 'Cache', url: 'https://cache.example.test' }]),
    GeolocationToolEnabled: false,
    TimelineToolEnabled: false,
    HealthToolEnabled: false
  };
  var first;
  var second;

  harness.tools.discoverPhoneTools(settings, 14, function(error, definitions, map) {
    first = { error: error, definitions: definitions, map: map };
  });
  FakeXMLHttpRequest.instances[0].respond(200, { result: { protocolVersion: '2025-06-18' } }, { 'Mcp-Session-Id': 'sess-1' });
  FakeXMLHttpRequest.instances[1].respond(202, '');
  FakeXMLHttpRequest.instances[2].respond(200, {
    result: { tools: [{ name: 'foo', description: 'foo tool', inputSchema: { type: 'object', properties: {} } }] }
  });

  assert.equal(first.error, null);
  assert.equal(first.map['Cache__foo'].server.sessionId, 'sess-1');
  var instanceCount = FakeXMLHttpRequest.instances.length;

  harness.tools.discoverPhoneTools(settings, 15, function(error, definitions, map) {
    second = { error: error, definitions: definitions, map: map };
  });

  assert.equal(FakeXMLHttpRequest.instances.length, instanceCount);
  assert.deepEqual(
    second.definitions.map(function(tool) { return tool.name; }),
    ['Cache__foo']
  );
  assert.equal(second.map['Cache__foo'].server.sessionId, 'sess-1');
});

test('MCP per-server cache retains successful discovery when another server fails', function() {
  var harness = createHarness();
  var settings = mcpSettings([
    { enabled: true, label: 'Good', url: 'https://good.example.test' },
    { enabled: true, label: 'Flaky', url: 'https://flaky.example.test' }
  ]);
  var first;
  var second;

  harness.tools.discoverPhoneTools(settings, 201, function(error, definitions) {
    first = { error: error, definitions: definitions };
  });
  FakeXMLHttpRequest.instances[0].respond(200, { result: { protocolVersion: '2025-06-18' } }, { 'Mcp-Session-Id': 'good-session' });
  FakeXMLHttpRequest.instances[1].respond(503, 'temporary failure');
  FakeXMLHttpRequest.instances[2].respond(202, '');
  FakeXMLHttpRequest.instances[3].respond(200, {
    result: { tools: [{ name: 'ping', description: 'Ping', inputSchema: { type: 'object', properties: {} } }] }
  });

  assert.equal(first.error, null);
  assert.deepEqual(first.definitions.map(function(tool) { return tool.name; }), ['Good__ping']);

  harness.tools.discoverPhoneTools(settings, 202, function(error, definitions) {
    second = { error: error, definitions: definitions };
  });
  assert.equal(FakeXMLHttpRequest.instances.length, 5, 'successful server uses cache while failed server retries');
  assert.equal(FakeXMLHttpRequest.instances[4].url, 'https://flaky.example.test');
  FakeXMLHttpRequest.instances[4].respond(503, 'still unavailable');

  assert.equal(second.error, null);
  assert.deepEqual(second.definitions.map(function(tool) { return tool.name; }), ['Good__ping']);
});

test('MCP per-server cache expires and changes identity when credentials change', function() {
  var harness = createHarness();
  var originalNow = Date.now;
  var now = 1000000;
  var settings = mcpSettings([{ enabled: true, label: 'Private', url: 'https://private.example.test', authorization: 'first-secret' }]);
  var changedSettings = mcpSettings([{ enabled: true, label: 'Private', url: 'https://private.example.test', authorization: 'second-secret' }]);
  var first;
  var cached;
  var changed;
  var expired;

  Date.now = function() { return now; };
  try {
    harness.tools.discoverPhoneTools(settings, 203, function(error, definitions, map) {
      first = { error: error, definitions: definitions, map: map };
    });
    FakeXMLHttpRequest.instances[0].respond(200, { result: { protocolVersion: '2025-06-18' } }, { 'Mcp-Session-Id': 'first-session' });
    FakeXMLHttpRequest.instances[1].respond(202, '');
    FakeXMLHttpRequest.instances[2].respond(200, {
      result: { tools: [{ name: 'lookup', inputSchema: { type: 'object', properties: {} } }] }
    });
    assert.equal(first.error, null);

    harness.tools.discoverPhoneTools(settings, 204, function(error, definitions) {
      cached = { error: error, definitions: definitions };
    });
    assert.equal(FakeXMLHttpRequest.instances.length, 3, 'unexpired same-config lookup is cached');
    assert.deepEqual(cached.definitions.map(function(tool) { return tool.name; }), ['Private__lookup']);

    harness.tools.discoverPhoneTools(changedSettings, 205, function(error, definitions) {
      changed = { error: error, definitions: definitions };
    });
    assert.equal(FakeXMLHttpRequest.instances.length, 4, 'credential change starts independent discovery');
    assert.equal(FakeXMLHttpRequest.instances[3].headers.Authorization, 'Bearer second-secret');
    FakeXMLHttpRequest.instances[3].respond(200, { result: { protocolVersion: '2025-06-18' } }, {});
    FakeXMLHttpRequest.instances[4].respond(202, '');
    FakeXMLHttpRequest.instances[5].respond(200, {
      result: { tools: [{ name: 'lookup', inputSchema: { type: 'object', properties: {} } }] }
    });
    assert.equal(changed.error, null);

    now += 5 * 60 * 1000 + 1;
    harness.tools.discoverPhoneTools(changedSettings, 206, function(error, definitions) {
      expired = { error: error, definitions: definitions };
    });
    assert.equal(FakeXMLHttpRequest.instances.length, 7, 'expired entry starts fresh discovery');
    FakeXMLHttpRequest.instances[6].respond(200, { result: { protocolVersion: '2025-06-18' } }, {});
    FakeXMLHttpRequest.instances[7].respond(202, '');
    FakeXMLHttpRequest.instances[8].respond(200, {
      result: { tools: [{ name: 'lookup', inputSchema: { type: 'object', properties: {} } }] }
    });
    assert.equal(expired.error, null);
  } finally {
    Date.now = originalNow;
  }
});

test('MCP no-tools capability is cached as a successful empty discovery', function() {
  var harness = createHarness();
  var settings = mcpSettings([{ enabled: true, label: 'Empty', url: 'https://empty.example.test' }]);
  var first;
  var second;

  harness.tools.discoverPhoneTools(settings, 207, function(error, definitions) {
    first = { error: error, definitions: definitions };
  });
  FakeXMLHttpRequest.instances[0].respond(200, {
    result: { protocolVersion: '2025-06-18', capabilities: {} }
  }, { 'Mcp-Session-Id': 'empty-session' });
  assert.deepEqual(first, { error: null, definitions: [] });

  harness.tools.discoverPhoneTools(settings, 208, function(error, definitions, map) {
    second = { error: error, definitions: definitions, map: map };
  });
  assert.equal(FakeXMLHttpRequest.instances.length, 1);
  assert.deepEqual(second.definitions, []);
});

test('foreground discovery and startup warmup share pending MCP initialization', function() {
  var harness = createHarness();
  var settings = mcpSettings([{ enabled: true, label: 'Shared', url: 'https://shared.example.test' }]);
  var foreground;
  var warmed;

  harness.tools.discoverPhoneTools(settings, 209, function(error, definitions) {
    foreground = { error: error, definitions: definitions };
  });
  harness.tools.warmMcpTools(settings, function(error, result) {
    warmed = { error: error, result: result };
  });
  assert.equal(FakeXMLHttpRequest.instances.length, 1, 'warmup joins in-flight initialize request');

  FakeXMLHttpRequest.instances[0].respond(200, { result: { protocolVersion: '2025-06-18' } }, { 'Mcp-Session-Id': 'shared-session' });
  FakeXMLHttpRequest.instances[1].respond(202, '');
  FakeXMLHttpRequest.instances[2].respond(200, {
    result: { tools: [{ name: 'ping', inputSchema: { type: 'object', properties: {} } }] }
  });

  assert.deepEqual(foreground.definitions.map(function(tool) { return tool.name; }), ['Shared__ping']);
  assert.equal(warmed.error, null);
  assert.equal(warmed.result.serverCount, 1);
  assert.deepEqual(harness.watch.lifecycleCalls, []);
  assert.deepEqual(harness.watch.xhrCalls, []);
  assert.deepEqual(harness.watch.progress, []);
});

test('canceling foreground MCP discovery preserves a shared warmup waiter', function() {
  var harness = createHarness();
  var settings = mcpSettings([{ enabled: true, label: 'Shared Cancel', url: 'https://shared-cancel.example.test' }]);
  var currentRequestId = 2101;
  var foreground;
  var warmed;

  harness.watch.isCurrentRequest = function(requestId) { return requestId === currentRequestId; };
  harness.tools.discoverPhoneTools(settings, currentRequestId, function(error, definitions) {
    foreground = { error: error, definitions: definitions };
  });
  harness.tools.warmMcpTools(settings, function(error, result) {
    warmed = { error: error, result: result };
  });
  currentRequestId = null;
  harness.tools.cancelMcpRequest(2101);

  assert.equal(FakeXMLHttpRequest.instances[0].aborted, false,
      'pending initialize stays alive while warmup still observes it');
  FakeXMLHttpRequest.instances[0].respond(200, { result: { protocolVersion: '2025-06-18' } }, {});
  FakeXMLHttpRequest.instances[1].respond(202, '');
  FakeXMLHttpRequest.instances[2].respond(200, {
    result: { tools: [{ name: 'ping', inputSchema: { type: 'object', properties: {} } }] }
  });

  assert.equal(foreground, undefined, 'canceled foreground callback stays suppressed');
  assert.equal(warmed.error, null);
  assert.equal(warmed.result.tools.length, 1);
});

test('stale foreground waiter cannot strand a joined warmup', function() {
  var harness = createHarness();
  var settings = mcpSettings([{ enabled: true, label: 'Stale', url: 'https://stale.example.test' }]);
  var currentRequestId = 210;
  var foreground;
  var warmed;

  harness.watch.isCurrentRequest = function(requestId) { return requestId === currentRequestId; };
  harness.tools.discoverPhoneTools(settings, currentRequestId, function(error, definitions) {
    foreground = { error: error, definitions: definitions };
  });
  harness.tools.warmMcpTools(settings, function(error, result) {
    warmed = { error: error, result: result };
  });
  currentRequestId = 211;

  FakeXMLHttpRequest.instances[0].respond(200, { result: { protocolVersion: '2025-06-18' } }, {});
  FakeXMLHttpRequest.instances[1].respond(202, '');
  FakeXMLHttpRequest.instances[2].respond(200, {
    result: { tools: [{ name: 'ping', inputSchema: { type: 'object', properties: {} } }] }
  });

  assert.equal(foreground, undefined, 'stale foreground callback is suppressed');
  assert.equal(warmed.error, null);
  assert.equal(warmed.result.tools.length, 1);
  assert.deepEqual(harness.watch.lifecycleCalls, []);
  assert.deepEqual(harness.watch.xhrCalls, []);
  assert.deepEqual(harness.watch.progress, []);
});

test('MCP warmup skips disabled global tool calls and absent servers', function() {
  var harness = createHarness();
  var zeroResult;
  var emptyResult;

  harness.tools.warmMcpTools(mcpSettings([
    { enabled: true, label: 'Unused', url: 'https://unused.example.test' }
  ], 0), function(error, result) { zeroResult = result; });
  harness.tools.warmMcpTools(mcpSettings([], 6), function(error, result) { emptyResult = result; });

  assert.deepEqual(zeroResult, { serverCount: 0, tools: [] });
  assert.deepEqual(emptyResult, { serverCount: 0, tools: [] });
  assert.equal(FakeXMLHttpRequest.instances.length, 0);
  assert.deepEqual(harness.watch.lifecycleCalls, []);
  assert.deepEqual(harness.watch.xhrCalls, []);
  assert.deepEqual(harness.watch.progress, []);
});

test('MCP pending discovery prunes stale foreground waiters before joining', function() {
  var harness = createHarness();
  var settings = mcpSettings([{ enabled: true, label: 'Waiters', url: 'https://waiters.example.test' }]);
  var currentRequestId = 300;
  var latest;
  var i;

  harness.watch.isCurrentRequest = function(requestId) { return requestId === currentRequestId; };
  for (i = 300; i < 345; i += 1) {
    currentRequestId = i;
    harness.tools.discoverPhoneTools(settings, i, function(error, definitions) {
      latest = { error: error, definitions: definitions };
    });
  }

  assert.equal(FakeXMLHttpRequest.instances.length, 1, 'stale waiters do not trigger duplicate initialization');
  FakeXMLHttpRequest.instances[0].respond(200, { result: { protocolVersion: '2025-06-18' } }, {});
  FakeXMLHttpRequest.instances[1].respond(202, '');
  FakeXMLHttpRequest.instances[2].respond(200, {
    result: { tools: [{ name: 'ping', inputSchema: { type: 'object', properties: {} } }] }
  });

  assert.equal(latest.error, null);
  assert.deepEqual(latest.definitions.map(function(tool) { return tool.name; }), ['Waiters__ping']);
});

test('MCP prunes stale pending requests before enforcing global single-flight limit', function() {
  var harness = createHarness();
  var currentRequestId = 400;
  var latest;
  var i;

  harness.watch.isCurrentRequest = function(requestId) { return requestId === currentRequestId; };
  for (i = 0; i < 18; i += 1) {
    currentRequestId = 400 + i;
    harness.tools.discoverPhoneTools(mcpSettings([{
      enabled: true,
      label: 'Pending' + i,
      url: 'https://pending' + i + '.example.test'
    }]), currentRequestId, function(error, definitions) {
      latest = { error: error, definitions: definitions };
    });
  }

  assert.equal(FakeXMLHttpRequest.instances.length, 18);
  for (i = 0; i < 17; i += 1) {
    assert.equal(FakeXMLHttpRequest.instances[i].aborted, true, 'stale request slot is released');
  }
  FakeXMLHttpRequest.instances[17].respond(200, { result: { protocolVersion: '2025-06-18' } }, {});
  FakeXMLHttpRequest.instances[18].respond(202, '');
  FakeXMLHttpRequest.instances[19].respond(200, {
    result: { tools: [{ name: 'ping', inputSchema: { type: 'object', properties: {} } }] }
  });

  assert.equal(latest.error, null);
  assert.deepEqual(latest.definitions.map(function(tool) { return tool.name; }), ['Pending17__ping']);
});

test('MCP XHR abort settles pending discovery and permits a later retry', function() {
  var harness = createHarness();
  var settings = mcpSettings([{ enabled: true, label: 'Abort', url: 'https://abort.example.test' }]);
  var first;
  var second;

  harness.tools.discoverPhoneTools(settings, 345, function(error, definitions) {
    first = { error: error, definitions: definitions };
  });
  FakeXMLHttpRequest.instances[0].abort();
  assert.deepEqual(first, { error: null, definitions: [] }, 'failed server omitted under existing partial-discovery policy');

  harness.tools.discoverPhoneTools(settings, 346, function(error, definitions) {
    second = { error: error, definitions: definitions };
  });
  assert.equal(FakeXMLHttpRequest.instances.length, 2, 'aborted single-flight slot was released');
  FakeXMLHttpRequest.instances[1].respond(200, { result: { protocolVersion: '2025-06-18' } }, {});
  FakeXMLHttpRequest.instances[2].respond(202, '');
  FakeXMLHttpRequest.instances[3].respond(200, {
    result: { tools: [{ name: 'ping', inputSchema: { type: 'object', properties: {} } }] }
  });

  assert.deepEqual(second.definitions.map(function(tool) { return tool.name; }), ['Abort__ping']);
});

test('MCP synchronous XHR setup/send failures release single-flight state and allow retry', function() {
  var harness = createHarness();
  var methods = ['open', 'setRequestHeader', 'send'];
  var logs = [];
  var i;

  harness.commonStub.logDebug = function(message) { logs.push(String(message)); };
  for (i = 0; i < methods.length; i += 1) {
    (function(method, index) {
      var settings = mcpSettings([{
        enabled: true,
        label: 'Throw' + index,
        url: 'https://throw' + index + '.example.test'
      }]);
      var originalMethod = FakeXMLHttpRequest.prototype[method];
      var requestStart = FakeXMLHttpRequest.instances.length;
      var callbacks = [];
      var failedRequest;
      var retryStart;

      FakeXMLHttpRequest.prototype[method] = function() {
        throw new Error('synthetic ' + method + ' failure');
      };
      try {
        harness.tools.discoverPhoneTools(settings, 500 + index * 2, function(error, definitions) {
          callbacks.push({ error: error, definitions: definitions });
        });
      } finally {
        FakeXMLHttpRequest.prototype[method] = originalMethod;
      }

      failedRequest = FakeXMLHttpRequest.instances[requestStart];
      assert.equal(failedRequest.aborted, true, method + ' failure aborts partial request');
      assert.equal(callbacks.length, 1, method + ' failure settles waiter once');
      assert.deepEqual(callbacks[0], { error: null, definitions: [] }, 'failed server follows partial-discovery policy');
      assert.ok(logs.some(function(message) { return message.indexOf('stage=' + (method === 'setRequestHeader' ? 'headers' : method)) !== -1; }), 'failure stage is logged without sensitive values');

      retryStart = FakeXMLHttpRequest.instances.length;
      harness.tools.discoverPhoneTools(settings, 501 + index * 2, function(error, definitions) {
        callbacks.push({ error: error, definitions: definitions });
      });
      assert.equal(FakeXMLHttpRequest.instances.length, retryStart + 1, 'failed slot permits a fresh initialize');
      FakeXMLHttpRequest.instances[retryStart].respond(200, { result: { protocolVersion: '2025-06-18' } }, {});
      FakeXMLHttpRequest.instances[retryStart + 1].respond(202, '');
      FakeXMLHttpRequest.instances[retryStart + 2].respond(200, {
        result: { tools: [{ name: 'ok', inputSchema: { type: 'object', properties: {} } }] }
      });

      failedRequest.onload();
      assert.equal(callbacks.length, 2, 'late terminal event cannot settle failed request twice');
      assert.equal(callbacks[1].error, null);
      assert.deepEqual(callbacks[1].definitions.map(function(tool) { return tool.name; }), ['Throw' + index + '__ok']);
    }(methods[i], i));
  }
});

test('MCP JavaScript deadline settles hanging warmup and clears timers on terminal events', function() {
  var timers = installFakeTimers();
  var harness = createHarness();
  var settings = mcpSettings([{ enabled: true, label: 'Deadline', url: 'https://deadline.example.test' }]);
  var warmCallbacks = [];
  var firstRequest;
  var firstTimer;
  var retryRequest;
  var retryTimer;

  try {
    harness.tools.warmMcpTools(settings, function(error, result) {
      warmCallbacks.push({ error: error, result: result });
    });
    firstRequest = FakeXMLHttpRequest.instances[0];
    firstTimer = timers.timers[0];
    assert.equal(firstTimer.delay, 30000);

    timers.run(firstTimer.id);
    assert.equal(firstRequest.aborted, true);
    assert.deepEqual(warmCallbacks[0], { error: null, result: { serverCount: 1, tools: [] } });
    assert.equal(firstTimer.cleared, true);

    firstRequest.respond(200, { result: { protocolVersion: '2025-06-18' } }, {});
    assert.equal(warmCallbacks.length, 1, 'late response after deadline is ignored');

    harness.tools.warmMcpTools(settings, function(error, result) {
      warmCallbacks.push({ error: error, result: result });
    });
    assert.equal(FakeXMLHttpRequest.instances.length, 2, 'timed-out pending slot permits retry');
    retryRequest = FakeXMLHttpRequest.instances[1];
    retryTimer = timers.timers[1];
    retryRequest.abort();
    assert.equal(retryTimer.cleared, true, 'abort clears explicit deadline timer');
    assert.equal(warmCallbacks.length, 2);
  } finally {
    timers.restore();
  }
});

test('MCP warmup setting changes cancel obsolete warm-only requests and avoid stale cache writes', function() {
  var harness = createHarness();
  var oldSettings = mcpSettings([{ enabled: true, label: 'Rotate', url: 'https://rotate.example.test', authorization: 'old-secret' }]);
  var newSettings = mcpSettings([{ enabled: true, label: 'Rotate', url: 'https://rotate.example.test', authorization: 'new-secret' }]);
  var staleWarm;
  var currentWarm;
  var retryWarm;

  harness.tools.warmMcpTools(oldSettings, function(error, result) { staleWarm = { error: error, result: result }; });
  var oldInitialize = FakeXMLHttpRequest.instances[0];
  harness.tools.warmMcpTools(newSettings, function(error, result) { currentWarm = { error: error, result: result }; });

  assert.equal(oldInitialize.aborted, true, 'credential change aborts obsolete warm-only initialization');
  assert.equal(FakeXMLHttpRequest.instances.length, 2);
  assert.equal(FakeXMLHttpRequest.instances[1].headers.Authorization, 'Bearer new-secret');
  FakeXMLHttpRequest.instances[1].respond(200, { result: { protocolVersion: '2025-06-18' } }, {});
  FakeXMLHttpRequest.instances[2].respond(202, '');
  FakeXMLHttpRequest.instances[3].respond(200, {
    result: { tools: [{ name: 'current', inputSchema: { type: 'object', properties: {} } }] }
  });

  assert.equal(staleWarm, undefined);
  assert.equal(currentWarm.error, null);
  assert.equal(currentWarm.result.tools.length, 1);

  harness.tools.warmMcpTools(oldSettings, function(error, result) { retryWarm = { error: error, result: result }; });
  assert.equal(FakeXMLHttpRequest.instances.length, 5, 'aborted old warmup did not cache definitions');
  assert.equal(FakeXMLHttpRequest.instances[4].headers.Authorization, 'Bearer old-secret');
  FakeXMLHttpRequest.instances[4].abort();
  assert.deepEqual(retryWarm, { error: null, result: { serverCount: 1, tools: [] } }, 'active retry reports aborted server as omitted');
});

test('disabling MCP during warmup aborts list request and prevents later pages', function() {
  var harness = createHarness();
  var settings = mcpSettings([{ enabled: true, label: 'Removed', url: 'https://removed.example.test' }]);
  var staleWarm;
  var disabledResult;
  var listRequest;

  harness.tools.warmMcpTools(settings, function(error, result) { staleWarm = { error: error, result: result }; });
  FakeXMLHttpRequest.instances[0].respond(200, { result: { protocolVersion: '2025-06-18' } }, {});
  FakeXMLHttpRequest.instances[1].respond(202, '');
  listRequest = FakeXMLHttpRequest.instances[2];

  harness.tools.warmMcpTools(mcpSettings([], 0), function(error, result) { disabledResult = result; });
  assert.equal(listRequest.aborted, true, 'removed server loses obsolete warmup interest');
  assert.deepEqual(disabledResult, { serverCount: 0, tools: [] });
  listRequest.respond(200, { result: { tools: [], nextCursor: 'obsolete-page' } });
  assert.equal(FakeXMLHttpRequest.instances.length, 3, 'aborted list cannot start another page');
  assert.equal(staleWarm, undefined);
});

test('changing warm settings does not cancel shared current foreground discovery', function() {
  var harness = createHarness();
  var settings = mcpSettings([{ enabled: true, label: 'Foreground', url: 'https://foreground.example.test' }]);
  var currentRequestId = 347;
  var warmResult;
  var foreground;
  var initializeRequest;

  harness.watch.isCurrentRequest = function(requestId) { return requestId === currentRequestId; };
  harness.tools.warmMcpTools(settings, function(error, result) { warmResult = { error: error, result: result }; });
  initializeRequest = FakeXMLHttpRequest.instances[0];
  harness.tools.discoverPhoneTools(settings, currentRequestId, function(error, definitions) {
    foreground = { error: error, definitions: definitions };
  });

  harness.tools.warmMcpTools(mcpSettings([], 0));
  assert.equal(initializeRequest.aborted, false, 'current foreground waiter keeps shared transport alive');
  initializeRequest.respond(200, { result: { protocolVersion: '2025-06-18' } }, {});
  FakeXMLHttpRequest.instances[1].respond(202, '');
  FakeXMLHttpRequest.instances[2].respond(200, {
    result: { tools: [{ name: 'ping', inputSchema: { type: 'object', properties: {} } }] }
  });

  assert.deepEqual(foreground.definitions.map(function(tool) { return tool.name; }), ['Foreground__ping']);
  assert.equal(warmResult, undefined, 'obsolete warm callback is suppressed');
});

test('MCP cache sanitizes fields and bounds tool names, schemas, and aggregate size', function() {
  var harness = createHarness();
  var logs = [];
  var settings = mcpSettings([{ enabled: true, label: 'Bounded', url: 'https://bounded.example.test' }]);
  var first;
  var cached;
  var toolsFromServer = [{
    name: 'good',
    description: new Array(1502).join('d'),
    inputSchema: { type: 'object', properties: {} },
    ignoredExtra: new Array(500001).join('x')
  }, {
    name: new Array(130).join('n'),
    inputSchema: { type: 'object', properties: {} }
  }, {
    name: 'oversized-schema',
    inputSchema: { type: 'object', properties: { text: new Array(8200).join('x') } }
  }];
  var i;
  var originalStringify = JSON.stringify;
  var rawExtraCloneCount = 0;

  for (i = 0; i < 9; i += 1) {
    toolsFromServer.push({
      name: 'bulk-' + i,
      inputSchema: { type: 'object', description: new Array(8001).join('x') }
    });
  }
  harness.commonStub.logDebug = function(message) { logs.push(String(message)); };

  harness.tools.discoverPhoneTools(settings, 348, function(error, definitions, map) {
    first = { error: error, definitions: definitions, map: map };
  });
  FakeXMLHttpRequest.instances[0].respond(200, { result: { protocolVersion: '2025-06-18' } }, {});
  FakeXMLHttpRequest.instances[1].respond(202, '');
  JSON.stringify = function(value) {
    if (Array.isArray(value) && value.length && value[0] && value[0].ignoredExtra) {
      rawExtraCloneCount += 1;
    }
    return originalStringify.apply(JSON, arguments);
  };
  try {
    FakeXMLHttpRequest.instances[2].respond(200, JSON.stringify({ result: { tools: toolsFromServer } }));
  } finally {
    JSON.stringify = originalStringify;
  }

  assert.equal(first.error, null);
  assert.equal(rawExtraCloneCount, 0, 'raw server extras never enter cache or shared-result clones');
  assert.equal(first.definitions.filter(function(tool) { return tool.name === 'Bounded__good'; })[0].description.length, 1024);
  assert.deepEqual(Object.keys(first.map['Bounded__good']), ['kind', 'server', 'toolName', 'parameters']);
  assert.equal(first.map['Bounded__good'].parameters.type, 'object');
  assert.equal(first.definitions.some(function(tool) { return tool.name === 'Bounded__oversized_schema'; }), false);
  assert.ok(first.definitions.length < 11, 'per-server aggregate character budget omits excess definitions');
  assert.ok(logs.some(function(message) { return /skipped oversized name/.test(message); }));
  assert.ok(logs.some(function(message) { return /skipped oversized inputSchema/.test(message); }));
  assert.ok(logs.some(function(message) { return /server cache character limit/.test(message); }));

  harness.tools.discoverPhoneTools(settings, 349, function(error, definitions) {
    cached = { error: error, definitions: definitions };
  });
  assert.equal(FakeXMLHttpRequest.instances.length, 3);
  assert.deepEqual(cached.definitions.map(function(tool) { return tool.name; }), first.definitions.map(function(tool) { return tool.name; }));
});

test('schema validation enforces type, enum, range, and length before execution', function() {
  var harness = createHarness();
  var results;
  var toolMap = {
    schema_test: {
      kind: 'builtin',
      name: 'schema_test',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          n: { type: 'integer', minimum: 0, maximum: 10 },
          s: { type: 'string', maxLength: 5 },
          e: { type: 'string', enum: ['a', 'b', 'c'] },
          t: { type: 'boolean' }
        }
      },
      call: function(args, requestId, callback) { callback(null, 'executed'); }
    }
  };

  harness.tools.runToolCalls(16, [
    { id: '1', name: 'schema_test', arguments: { n: '5' } },
    { id: '2', name: 'schema_test', arguments: { n: 20 } },
    { id: '3', name: 'schema_test', arguments: { n: 3, s: 'toolong' } },
    { id: '4', name: 'schema_test', arguments: { e: 'z' } },
    { id: '5', name: 'schema_test', arguments: { t: 'yes' } },
    { id: '6', name: 'schema_test', arguments: { n: 4, s: 'ok', e: 'a', t: true } }
  ], toolMap, function(value) { results = value; });

  assert.deepEqual(results.map(function(r) { return r.error; }), [
    'n must be an integer',
    'n must be 10 or less',
    's exceeds max length 5',
    'e must be one of a, b, c',
    't must be a boolean',
    undefined
  ]);
  assert.equal(results[5].result, 'executed');
});

test('uniqueItems compares canonical object keys and keeps array order significant', function() {
  var harness = createHarness();
  var results;
  var executions = 0;
  var toolMap = {
    unique_test: {
      kind: 'builtin',
      name: 'unique_test',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          objects: { type: 'array', uniqueItems: true, items: { type: 'object' } },
          arrays: { type: 'array', uniqueItems: true },
          choice: { enum: [{ outer: { a: 1, b: 2 } }] }
        }
      },
      call: function(args, requestId, callback) {
        executions += 1;
        callback(null, 'executed');
      }
    }
  };

  harness.tools.runToolCalls(17, [
    {
      name: 'unique_test',
      arguments: { objects: [{ outer: { a: 1, b: 2 } }, { outer: { b: 2, a: 1 } }] }
    },
    {
      name: 'unique_test',
      arguments: {
        objects: [{ outer: { a: 1, b: 2 } }, { outer: { a: 1, b: 3 } }],
        arrays: [[1, 2], [2, 1]],
        choice: { outer: { b: 2, a: 1 } }
      }
    }
  ], toolMap, function(value) { results = value; });

  assert.equal(results[0].error, 'objects must contain unique items',
    'object property order does not make otherwise-equal objects distinct');
  assert.equal(results[1].result, 'executed', 'distinct objects, ordered arrays, and reordered enum objects remain valid');
  assert.equal(executions, 1);
});

test('MCP plain text result is capped at the model per-result limit', function() {
  var harness = createHarness();
  var settings = {
    McpServersJson: JSON.stringify([{ enabled: true, label: 'Big', url: 'https://big.example.test' }]),
    GeolocationToolEnabled: false,
    TimelineToolEnabled: false,
    HealthToolEnabled: false
  };
  var discovered;
  var results;

  harness.tools.discoverPhoneTools(settings, 17, function(error, definitions, map) {
    discovered = { error: error, definitions: definitions, map: map };
  });
  FakeXMLHttpRequest.instances[0].respond(200, { result: { protocolVersion: '2025-06-18' } }, {});
  FakeXMLHttpRequest.instances[1].respond(202, '');
  FakeXMLHttpRequest.instances[2].respond(200, {
    result: { tools: [{ name: 'fetch', description: 'f', inputSchema: { type: 'object', properties: {} } }] }
  });

  harness.tools.runToolCalls(18, [{ id: 'big', name: 'Big__fetch', arguments: {} }], discovered.map, function(value) {
    results = value;
  });
  var longText = new Array(6002).join('x');
  assert.equal(longText.length, 6001);
  FakeXMLHttpRequest.last().respond(200, {
    result: { content: [{ type: 'text', text: longText }] }
  });

  assert.equal(results[0].result.length, 6000);
  assert.ok(/\. \.\. \[truncated\]$|^\.\.\. \[truncated\]$/.test(results[0].result.substring(results[0].result.length - 16)) ||
    results[0].result.substring(results[0].result.length - 15) === '... [truncated]');
  assert.equal(results[0].result.substring(results[0].result.length - 15), '... [truncated]');
});

test('oversized structured MCP result becomes valid bounded JSON omission', function() {
  var harness = createHarness();
  var settings = {
    McpServersJson: JSON.stringify([{ enabled: true, label: 'Structured', url: 'https://structured.example.test' }]),
    GeolocationToolEnabled: false,
    TimelineToolEnabled: false,
    HealthToolEnabled: false
  };
  var discovered;
  var results;

  harness.tools.discoverPhoneTools(settings, 19, function(error, definitions, map) {
    discovered = { error: error, definitions: definitions, map: map };
  });
  FakeXMLHttpRequest.instances[0].respond(200, { result: { protocolVersion: '2025-06-18' } }, {});
  FakeXMLHttpRequest.instances[1].respond(202, '');
  FakeXMLHttpRequest.instances[2].respond(200, {
    result: { tools: [{ name: 'lookup', inputSchema: { type: 'object', properties: {} } }] }
  });
  harness.tools.runToolCalls(20, [{ id: 'large-structured', name: 'Structured__lookup', arguments: {} }], discovered.map, function(value) {
    results = value;
  });
  FakeXMLHttpRequest.last().respond(200, {
    result: { structuredContent: { records: new Array(13001).join('x') } }
  });

  assert.equal(results[0]._structuredResult, true);
  assert.ok(results[0].result.length < 6000);
  assert.match(JSON.parse(results[0].result).error, /omitted/);
});

test('MCP result text blocks remain separated and non-text blocks are explicit without binary payloads', function() {
  var harness = createHarness();
  var discovered = discoverMcpLookup(harness, 'Adapter');
  var binary = new Array(12001).join('A');
  var result = callMcpLookup(harness, discovered, 901, {
    content: [
      { type: 'text', text: 'First paragraph' },
      { type: 'text', text: 'Second paragraph' },
      { type: 'resource', resource: { uri: 'file:///notes/readme.txt', mimeType: 'text/plain', text: 'Embedded resource text' } },
      { type: 'image', uri: 'asset://chart', mimeType: 'image/png', data: binary },
      { type: 'audio', mimeType: 'audio/wav', data: binary },
      { type: 'resource_link', uri: 'https://example.test/report', mimeType: 'text/html' },
      { type: 'future_block', uri: 'urn:future:payload', mimeType: 'application/example', payload: binary }
    ]
  });

  assert.equal(result._structuredResult, undefined);
  assert.ok(result.result.indexOf('First paragraph\n\nSecond paragraph') !== -1);
  assert.match(result.result, /MCP embedded resource text \(uri=file:\/\/\/notes\/readme\.txt; mimeType=text\/plain\):\nEmbedded resource text/);
  assert.match(result.result, /MCP image content omitted \(uri=asset:\/\/chart; mimeType=image\/png\); binary data omitted/);
  assert.match(result.result, /MCP audio content omitted \(mimeType=audio\/wav\); binary data omitted/);
  assert.match(result.result, /resource_link reference only \(uri=https:\/\/example\.test\/report; mimeType=text\/html\); content not fetched/);
  assert.match(result.result, /unsupported content block type=future_block \(uri=urn:future:payload; mimeType=application\/example\); payload omitted/);
  assert.equal(result.result.indexOf(binary), -1, 'image/audio/unknown binary strings never enter output');
});

test('MCP mixed results preserve text and structured content in bounded JSON envelope', function() {
  var harness = createHarness();
  var discovered = discoverMcpLookup(harness, 'Mixed');
  var result = callMcpLookup(harness, discovered, 902, {
    content: [
      { type: 'text', text: 'Readable server explanation' },
      { type: 'text', text: 'A second explanation block' }
    ],
    structuredContent: { answer: 42, valid: true }
  });
  var parsed = JSON.parse(result.result);

  assert.equal(result._structuredResult, true);
  assert.equal(result._mcpResultEnvelope, true, 'adapter provenance is carried as internal result metadata');
  assert.ok(result.result.length <= 6000);
  assert.equal(parsed.mcpResult, true);
  assert.equal(parsed.text, 'Readable server explanation\n\nA second explanation block');
  assert.deepEqual(parsed.structuredContent, { answer: 42, valid: true });
});

test('MCP structured-only results preserve falsy JSON values including null', function() {
  var harness = createHarness();
  var discovered = discoverMcpLookup(harness, 'Falsy');
  var values = [0, false, null, {}];
  var i;
  var output;

  for (i = 0; i < values.length; i += 1) {
    output = callMcpLookup(harness, discovered, 910 + i, { structuredContent: values[i] });
    assert.equal(output._structuredResult, true);
    assert.equal(output._mcpResultEnvelope, undefined, 'structured-only provider data is not marked as adapter envelope');
    assert.ok(output.result.length <= 6000);
    assert.deepEqual(JSON.parse(output.result), values[i]);
  }
});

test('MCP provider lookalikes remain opaque and do not receive trusted envelope metadata', function() {
  var harness = createHarness();
  var discovered = discoverMcpLookup(harness, 'Lookalike');
  var providerValue = {
    mcpResult: true,
    text: 'provider text',
    structuredContent: { value: 1 },
    extra: 'must survive'
  };
  var structured = callMcpLookup(harness, discovered, 915, { structuredContent: providerValue });
  var plainText = JSON.stringify(providerValue);
  var plain = callMcpLookup(harness, discovered, 916, { content: [{ type: 'text', text: plainText }] });

  assert.equal(structured._mcpResultEnvelope, undefined);
  assert.deepEqual(JSON.parse(structured.result), providerValue);
  assert.equal(structured._structuredResult, true);
  assert.equal(plain._mcpResultEnvelope, undefined);
  assert.equal(plain._structuredResult, undefined);
  assert.equal(plain.result, plainText);
});

test('MCP empty text blocks do not hide falsy structured content', function() {
  var harness = createHarness();
  var discovered = discoverMcpLookup(harness, 'EmptyText');
  var values = [0, false, null, {}];
  var i;
  var output;
  var parsed;

  for (i = 0; i < values.length; i += 1) {
    output = callMcpLookup(harness, discovered, 930 + i, {
      content: [{ type: 'text', text: '' }],
      structuredContent: values[i]
    });
    parsed = JSON.parse(output.result);
    assert.equal(output._structuredResult, true);
    assert.equal(parsed.mcpResult, true);
    assert.equal(parsed.text, '');
    assert.deepEqual(parsed.structuredContent, values[i]);
  }
});

test('oversized mixed MCP content keeps structured value and records text truncation', function() {
  var harness = createHarness();
  var discovered = discoverMcpLookup(harness, 'Priority');
  var result = callMcpLookup(harness, discovered, 920, {
    content: [{ type: 'text', text: new Array(12001).join('Long readable text ') }],
    structuredContent: { id: 'preserve-me', count: 7 }
  });
  var parsed = JSON.parse(result.result);

  assert.equal(result._structuredResult, true);
  assert.ok(result.result.length <= 6000);
  assert.deepEqual(parsed.structuredContent, { id: 'preserve-me', count: 7 });
  assert.equal(parsed.textTruncated, true);
  assert.ok(parsed.text.length > 0);
});

test('oversized mixed MCP structure becomes explicit valid omission while bounded text survives', function() {
  var harness = createHarness();
  var discovered = discoverMcpLookup(harness, 'MixedLarge');
  var result = callMcpLookup(harness, discovered, 921, {
    content: [{ type: 'text', text: 'Keep this readable error-free explanation' }],
    structuredContent: { records: new Array(13001).join('x') }
  });
  var parsed = JSON.parse(result.result);

  assert.equal(result._structuredResult, true);
  assert.ok(result.result.length <= 6000);
  assert.equal(parsed.text, 'Keep this readable error-free explanation');
  assert.equal(parsed.structuredContentOmitted, true);
  assert.match(parsed.structuredContent.error, /omitted/);
});

test('MCP tool call 404 with session reinitializes once and retries', function() {
  var harness = createHarness();
  var settings = {
    McpServersJson: JSON.stringify([{ enabled: true, label: 'Retry', url: 'https://retry.example.test' }]),
    GeolocationToolEnabled: false,
    TimelineToolEnabled: false,
    HealthToolEnabled: false
  };
  var discovered;
  var results;

  harness.tools.discoverPhoneTools(settings, 19, function(error, definitions, map) {
    discovered = { error: error, definitions: definitions, map: map };
  });
  FakeXMLHttpRequest.instances[0].respond(200, { result: { protocolVersion: '2025-06-18' } }, { 'Mcp-Session-Id': 'sess-1' });
  FakeXMLHttpRequest.instances[1].respond(202, '');
  FakeXMLHttpRequest.instances[2].respond(200, {
    result: { tools: [{ name: 'fetch', description: 'f', inputSchema: { type: 'object', properties: {} } }] }
  });
  assert.equal(discovered.map['Retry__fetch'].server.sessionId, 'sess-1');

  harness.tools.runToolCalls(20, [{ id: 'call', name: 'Retry__fetch', arguments: {} }], discovered.map, function(value) {
    results = value;
  });
  FakeXMLHttpRequest.instances[3].respond(404, 'gone');
  FakeXMLHttpRequest.instances[4].respond(200, { result: { protocolVersion: '2025-06-18' } }, { 'Mcp-Session-Id': 'sess-2' });
  FakeXMLHttpRequest.instances[5].respond(202, '');
  FakeXMLHttpRequest.instances[6].respond(200, { result: { content: [{ type: 'text', text: 'retried ok' }] } });

  assert.equal(results.length, 1);
  assert.equal(results[0].result, 'retried ok');

  var requestsAfterRetry = FakeXMLHttpRequest.instances.length;
  var refreshed;
  harness.tools.discoverPhoneTools(settings, 23, function(error, definitions, map) {
    refreshed = { error: error, definitions: definitions, map: map };
  });
  assert.equal(FakeXMLHttpRequest.instances.length, requestsAfterRetry, '404 refresh updates existing per-server cache');
  assert.equal(refreshed.map['Retry__fetch'].server.sessionId, 'sess-2');
});

test('MCP non-404 tool errors are not retried', function() {
  var harness = createHarness();
  var settings = {
    McpServersJson: JSON.stringify([{ enabled: true, label: 'Noretry', url: 'https://noretry.example.test' }]),
    GeolocationToolEnabled: false,
    TimelineToolEnabled: false,
    HealthToolEnabled: false
  };
  var discovered;
  var results;

  harness.tools.discoverPhoneTools(settings, 21, function(error, definitions, map) {
    discovered = { error: error, definitions: definitions, map: map };
  });
  FakeXMLHttpRequest.instances[0].respond(200, { result: { protocolVersion: '2025-06-18' } }, { 'Mcp-Session-Id': 'sess-1' });
  FakeXMLHttpRequest.instances[1].respond(202, '');
  FakeXMLHttpRequest.instances[2].respond(200, {
    result: { tools: [{ name: 'fetch', description: 'f', inputSchema: { type: 'object', properties: {} } }] }
  });

  harness.tools.runToolCalls(22, [{ id: 'call', name: 'Noretry__fetch', arguments: {} }], discovered.map, function(value) {
    results = value;
  });
  var callIndex = FakeXMLHttpRequest.instances.length - 1;
  FakeXMLHttpRequest.instances[callIndex].respond(500, 'server error');

  assert.equal(results.length, 1);
  assert.match(results[0].error, /MCP HTTP 500/);
  assert.equal(FakeXMLHttpRequest.instances.length, callIndex + 1);
});

test('MCP server with http url for localhost is accepted', function() {
  var harness = createHarness();
  var discovered;

  harness.tools.discoverPhoneTools({
    McpServersJson: JSON.stringify([{ enabled: true, label: 'Local', url: 'http://localhost:8080/mcp' }]),
    GeolocationToolEnabled: false,
    TimelineToolEnabled: false,
    HealthToolEnabled: false
  }, 23, function(error, definitions, map) {
    discovered = { error: error, definitions: definitions, map: map };
  });

  assert.equal(FakeXMLHttpRequest.instances.length, 1);
  assert.equal(FakeXMLHttpRequest.instances[0].url, 'http://localhost:8080/mcp');
  FakeXMLHttpRequest.instances[0].respond(200, { result: { protocolVersion: '2025-06-18' } }, {});
  FakeXMLHttpRequest.instances[1].respond(202, '');
  FakeXMLHttpRequest.instances[2].respond(200, {
    result: { tools: [{ name: 'ping', description: 'p', inputSchema: { type: 'object', properties: {} } }] }
  });

  assert.equal(discovered.error, null);
  assert.deepEqual(discovered.definitions.map(function(tool) { return tool.name; }), ['Local__ping']);
});

test('MCP server with insecure non-localhost http url is omitted', function() {
  var harness = createHarness();
  var discovered;

  harness.tools.discoverPhoneTools({
    McpServersJson: JSON.stringify([{ enabled: true, label: 'Insecure', url: 'http://remote.example.test/mcp' }]),
    GeolocationToolEnabled: false,
    TimelineToolEnabled: false,
    HealthToolEnabled: false
  }, 24, function(error, definitions) {
    discovered = { error: error, definitions: definitions };
  });

  assert.equal(FakeXMLHttpRequest.instances.length, 0);
  assert.equal(discovered.error, null);
  assert.deepEqual(discovered.definitions, []);
});

test('Timeline create without id generates ID, returns editable JSON and persists', function() {
  var harness = createHarness();
  var results;
  var listResult;
  global.Pebble = {
    getTimelineToken: function(callback) { callback('timeline-token'); }
  };
  var future = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

  harness.tools.discoverPhoneTools({
    McpServersJson: '[]',
    GeolocationToolEnabled: false,
    TimelineToolEnabled: true,
    HealthToolEnabled: false
  }, 50, function(error, definitions, map) {
    harness.tools.runToolCalls(50, [{
      id: 'gen1',
      name: 'pebble_timeline_create_pin',
      arguments: { title: 'Generated', time: future, body: 'KeepMe' }
    }], map, function(value) { results = value; });
  });

  assert.equal(FakeXMLHttpRequest.instances.length, 1);
  var putBody = JSON.parse(FakeXMLHttpRequest.instances[0].body);
  assert.ok(putBody.id);
  assert.equal(putBody.layout.title, 'Generated');
  FakeXMLHttpRequest.instances[0].respond(200, '');

  assert.equal(results[0].error, undefined);
  var parsed = JSON.parse(results[0].result);
  assert.equal(parsed.status, 'success');
  assert.equal(parsed.title, 'Generated');
  assert.equal(parsed.time, putBody.time);
  assert.equal(parsed.editable, true);
  assert.ok(parsed.id);
  assert.equal(parsed.id, putBody.id);

  harness.tools.discoverPhoneTools({
    McpServersJson: '[]',
    GeolocationToolEnabled: false,
    TimelineToolEnabled: true,
    HealthToolEnabled: false
  }, 51, function(error, definitions, map) {
    harness.tools.runToolCalls(51, [{ id: 'list1', name: 'pebble_timeline_list_pins', arguments: {} }], map, function(value) { listResult = value; });
  });
  assert.equal(listResult[0].error, undefined);
  var list = JSON.parse(listResult[0].result);
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].id, parsed.id);
  assert.equal(list.items[0].title, 'Generated');
  assert.equal(list.items[0].kind, 'pin');
  assert.equal(FakeXMLHttpRequest.instances.length, 1);
});

test('Timeline generated ids stay unique with frozen clock/random across inflight calls and reloads', function() {
  var harness = createHarness();
  var timelineStore = require('../../src/pkjs/timeline_store');
  var NativeDate = Date;
  var originalRandom = Math.random;
  var fixedNow = new NativeDate().getTime();
  var future = new NativeDate(fixedNow + 2 * 60 * 60 * 1000).toISOString();
  var existingId = 'llm_collision_' + fixedNow.toString(36) + '_1';
  var existingPin = {
    id: existingId,
    time: future,
    layout: { type: 'genericPin', title: 'Collision', tinyIcon: 'system://images/NOTIFICATION_REMINDER' }
  };
  var settings = {
    McpServersJson: '[]',
    GeolocationToolEnabled: false,
    TimelineToolEnabled: true,
    HealthToolEnabled: false
  };
  var definitions;
  var toolMap;
  var resultByCall = {};
  var generatedIds = [];
  var calls = [
    { callId: 'pin-1', tool: 'pebble_timeline_create_pin' },
    { callId: 'reminder-1', tool: 'pebble_timeline_create_reminder' },
    { callId: 'pin-2', tool: 'pebble_timeline_create_pin' },
    { callId: 'reminder-2', tool: 'pebble_timeline_create_reminder' }
  ];
  var i;

  function FixedDate(value) {
    if (!(this instanceof FixedDate)) {
      return new NativeDate(fixedNow).toString();
    }
    return arguments.length ? new NativeDate(value) : new NativeDate(fixedNow);
  }
  FixedDate.prototype = NativeDate.prototype;
  FixedDate.now = function() { return fixedNow; };
  FixedDate.parse = NativeDate.parse;
  FixedDate.UTC = NativeDate.UTC;

  function discover(id, callback) {
    harness.tools.discoverPhoneTools(settings, id, callback);
  }

  function startCreate(call, requestId) {
    harness.tools.runToolCalls(requestId, [{
      id: call.callId,
      name: call.tool,
      arguments: { title: 'Collision', time: future }
    }], toolMap, function(results) {
      resultByCall[call.callId] = results[0];
    });
  }

  try {
    global.Date = FixedDate;
    Math.random = function() { return 0; };
    assert.equal(timelineStore.saveTimelinePin(existingId, 'pin', existingPin, { title: 'Collision', time: future }), true);
    global.Pebble = {
      getTimelineToken: function(callback) { callback('timeline-token'); }
    };

    discover(501, function(error, tools, map) {
      definitions = tools;
      toolMap = map;
    });
    for (i = 0; i < calls.length; i += 1) {
      startCreate(calls[i], 501 + i);
      generatedIds.push(JSON.parse(FakeXMLHttpRequest.instances[i].body).id);
    }

    assert.equal(new Set(generatedIds).size, calls.length, 'IDs differ while prior requests remain inflight');
    assert.equal(generatedIds.indexOf(existingId), -1, 'preexisting candidate is skipped');
    for (i = 0; i < calls.length; i += 1) {
      assert.equal(FakeXMLHttpRequest.instances[i].url, 'https://timeline-api.getpebble.com/v1/user/pins/' + encodeURIComponent(generatedIds[i]));
      FakeXMLHttpRequest.instances[i].respond(200, '');
      assert.equal(resultByCall[calls[i].callId].error, undefined);
      assert.equal(JSON.parse(resultByCall[calls[i].callId].result).id, generatedIds[i]);
      assert.equal(timelineStore.getTimelinePin(generatedIds[i]).kind, calls[i].tool === 'pebble_timeline_create_pin' ? 'pin' : 'reminder');
    }
    assert.equal(timelineStore.listTimelinePins().length, calls.length + 1);

    harness.tools.runToolCalls(505, [{
      id: 'delete-generated',
      name: 'pebble_timeline_delete_pin',
      arguments: { id: generatedIds[0] }
    }], toolMap, function(results) {
      resultByCall['delete-generated'] = results[0];
    });
    assert.equal(FakeXMLHttpRequest.instances[4].method, 'DELETE');
    FakeXMLHttpRequest.instances[4].respond(200, '');
    assert.equal(resultByCall['delete-generated'].error, undefined);
    assert.equal(timelineStore.getTimelinePin(generatedIds[0]), null);

    load.clearModule(toolsPath);
    FakeXMLHttpRequest.reset();
    harness.tools = load.loadWithStubs(toolsPath, {
      './settings': harness.commonStub,
      './watch': harness.watch
    });
    discover(506, function(error, tools, map) {
      definitions = tools;
      toolMap = map;
    });
    startCreate({ callId: 'after-reload', tool: 'pebble_timeline_create_pin' }, 506);
    var reloadedId = JSON.parse(FakeXMLHttpRequest.instances[0].body).id;
    assert.equal(generatedIds.indexOf(reloadedId), -1, 'persistent sequence avoids reusing ids after module reload');
    FakeXMLHttpRequest.instances[0].respond(200, '');
    assert.equal(resultByCall['after-reload'].error, undefined);
    assert.equal(timelineStore.listTimelinePins().length, calls.length + 1);
  } finally {
    global.Date = NativeDate;
    Math.random = originalRandom;
  }
});

test('Timeline edit changes supplied fields, preserves others, and clears supported text fields', function() {
  var harness = createHarness();
  var results;
  var editResults;
  global.Pebble = {
    getTimelineToken: function(callback) { callback('timeline-token'); }
  };
  var future = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();

  harness.tools.discoverPhoneTools({
    McpServersJson: '[]',
    GeolocationToolEnabled: false,
    TimelineToolEnabled: true,
    HealthToolEnabled: false
  }, 60, function(error, definitions, map) {
    harness.tools.runToolCalls(60, [{
      id: 'c1',
      name: 'pebble_timeline_create_pin',
      arguments: { title: 'Original', time: future, durationMinutes: 30, body: 'KeepMe', subtitle: 'Sub', locationName: 'Keep Location' }
    }], map, function(value) { results = value; });
  });

  FakeXMLHttpRequest.instances[0].respond(200, '');
  var firstId = JSON.parse(results[0].result).id;
  var firstBody = JSON.parse(FakeXMLHttpRequest.instances[0].body);
  assert.equal(firstBody.layout.body, 'KeepMe');
  assert.equal(firstBody.layout.subtitle, 'Sub');
  assert.equal(firstBody.layout.locationName, 'Keep Location');

  FakeXMLHttpRequest.reset();
  var map2;
  harness.tools.discoverPhoneTools({
    McpServersJson: '[]',
    GeolocationToolEnabled: false,
    TimelineToolEnabled: true,
    HealthToolEnabled: false
  }, 61, function(error, definitions, m) { map2 = m; });

  harness.tools.runToolCalls(61, [{ id: 'edit1', name: 'pebble_timeline_edit_pin', arguments: { id: firstId, title: 'Changed' } }], map2, function(value) { editResults = value; });

  assert.equal(FakeXMLHttpRequest.instances.length, 1);
  var secondBody = JSON.parse(FakeXMLHttpRequest.instances[0].body);
  assert.equal(secondBody.id, firstId);
  assert.equal(secondBody.layout.title, 'Changed');
  assert.equal(secondBody.layout.body, 'KeepMe');
  assert.equal(secondBody.layout.subtitle, 'Sub');
  assert.equal(secondBody.layout.locationName, 'Keep Location');
  assert.equal(secondBody.time, firstBody.time);
  assert.equal(secondBody.duration, 30);

  FakeXMLHttpRequest.instances[0].respond(200, '');
  assert.equal(editResults[0].error, undefined);
  var parsedEdit = JSON.parse(editResults[0].result);
  assert.equal(parsedEdit.id, firstId);
  assert.equal(parsedEdit.title, 'Changed');
  assert.equal(parsedEdit.editable, true);

  harness.tools.runToolCalls(62, [{
    id: 'clear-text',
    name: 'pebble_timeline_edit_pin',
    arguments: { id: firstId, body: '', subtitle: '', locationName: '' }
  }], map2, function(value) { editResults = value; });
  var clearBody = JSON.parse(FakeXMLHttpRequest.instances[1].body);
  assert.equal(clearBody.id, firstId);
  assert.equal(clearBody.layout.title, 'Changed');
  assert.equal(clearBody.layout.body, undefined);
  assert.equal(clearBody.layout.subtitle, undefined);
  assert.equal(clearBody.layout.locationName, undefined);
  assert.equal(clearBody.duration, 30);
  FakeXMLHttpRequest.instances[1].respond(200, '');

  harness.tools.runToolCalls(63, [
    { id: 'clear-number', name: 'pebble_timeline_edit_pin', arguments: { id: firstId, durationMinutes: '' } },
    { id: 'clear-enum', name: 'pebble_timeline_edit_pin', arguments: { id: firstId, pinType: '' } }
  ], map2, function(value) { editResults = value; });
  assert.match(editResults[0].error, /durationMinutes must be an integer/);
  assert.match(editResults[1].error, /pinType must be one of/);
  assert.equal(FakeXMLHttpRequest.instances.length, 2, 'unsupported empty numeric/enum values do not call Timeline API');
});

test('Timeline edit unknown ID fails before token or network', function() {
  var harness = createHarness();
  var results;
  var tokenRequests = 0;
  global.Pebble = {
    getTimelineToken: function(callback) {
      tokenRequests += 1;
      callback('timeline-token');
    }
  };

  harness.tools.discoverPhoneTools({
    McpServersJson: '[]',
    GeolocationToolEnabled: false,
    TimelineToolEnabled: true,
    HealthToolEnabled: false
  }, 70, function(error, definitions, map) {
    harness.tools.runToolCalls(70, [{ id: 'e1', name: 'pebble_timeline_edit_pin', arguments: { id: 'unknown123', title: 'NewTitle' } }], map, function(value) { results = value; });
  });

  assert.match(results[0].error, /Unknown pin id/);
  assert.match(results[0].error, /pebble_timeline_list_pins/);
  assert.equal(FakeXMLHttpRequest.instances.length, 0);
  assert.equal(tokenRequests, 0);
});

test('Timeline delete removes stored record and returns JSON', function() {
  var harness = createHarness();
  var createRes;
  var deleteRes;
  var listAfter;
  global.Pebble = {
    getTimelineToken: function(callback) { callback('timeline-token'); }
  };
  var future = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

  harness.tools.discoverPhoneTools({
    McpServersJson: '[]',
    GeolocationToolEnabled: false,
    TimelineToolEnabled: true,
    HealthToolEnabled: false
  }, 80, function(error, definitions, map) {
    harness.tools.runToolCalls(80, [{ id: 'c', name: 'pebble_timeline_create_reminder', arguments: { title: 'ToDelete', time: future } }], map, function(value) { createRes = value; });
  });
  FakeXMLHttpRequest.instances[0].respond(200, '');
  var delId = JSON.parse(createRes[0].result).id;

  harness.tools.discoverPhoneTools({
    McpServersJson: '[]',
    GeolocationToolEnabled: false,
    TimelineToolEnabled: true,
    HealthToolEnabled: false
  }, 81, function(error, definitions, map) {
    harness.tools.runToolCalls(81, [{ id: 'd', name: 'pebble_timeline_delete_pin', arguments: { id: delId } }], map, function(value) { deleteRes = value; });
  });
  var delReq = FakeXMLHttpRequest.instances[FakeXMLHttpRequest.instances.length - 1];
  assert.equal(delReq.method, 'DELETE');
  delReq.respond(200, '');
  assert.equal(deleteRes[0].error, undefined);
  var delParsed = JSON.parse(deleteRes[0].result);
  assert.equal(delParsed.status, 'deleted');
  assert.equal(delParsed.id, delId);

  harness.tools.discoverPhoneTools({
    McpServersJson: '[]',
    GeolocationToolEnabled: false,
    TimelineToolEnabled: true,
    HealthToolEnabled: false
  }, 82, function(error, definitions, map) {
    harness.tools.runToolCalls(82, [{ id: 'l', name: 'pebble_timeline_list_pins', arguments: {} }], map, function(value) { listAfter = value; });
  });
  var list = JSON.parse(listAfter[0].result);
  assert.equal(list.items.length, 0);
});

test('Timeline edit preserves stored reminder kind and rebuilds reminder time when changing pin time', function() {
  var harness = createHarness();
  var createRes;
  var editRes;
  global.Pebble = {
    getTimelineToken: function(callback) { callback('timeline-token'); }
  };
  var future = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();
  var future2 = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();

  harness.tools.discoverPhoneTools({
    McpServersJson: '[]',
    GeolocationToolEnabled: false,
    TimelineToolEnabled: true,
    HealthToolEnabled: false
  }, 90, function(error, definitions, map) {
    harness.tools.runToolCalls(90, [{ id: 'c', name: 'pebble_timeline_create_reminder', arguments: { title: 'Rem', time: future } }], map, function(value) { createRes = value; });
  });
  FakeXMLHttpRequest.instances[0].respond(200, '');
  var remId = JSON.parse(createRes[0].result).id;
  var firstPin = JSON.parse(FakeXMLHttpRequest.instances[0].body);
  assert.ok(firstPin.reminders && firstPin.reminders.length === 1);
  assert.equal(firstPin.reminders[0].time, firstPin.time);

  harness.tools.discoverPhoneTools({
    McpServersJson: '[]',
    GeolocationToolEnabled: false,
    TimelineToolEnabled: true,
    HealthToolEnabled: false
  }, 91, function(error, definitions, map) {
    harness.tools.runToolCalls(91, [{ id: 'e', name: 'pebble_timeline_edit_pin', arguments: { id: remId, time: future2 } }], map, function(value) { editRes = value; });
  });
  var secondPin = JSON.parse(FakeXMLHttpRequest.instances[FakeXMLHttpRequest.instances.length - 1].body);
  FakeXMLHttpRequest.instances[FakeXMLHttpRequest.instances.length - 1].respond(200, '');
  assert.equal(Date.parse(secondPin.time), Date.parse(future2) - (Date.parse(future2) % 1000));
  assert.ok(secondPin.reminders && secondPin.reminders.length === 1);
  assert.equal(secondPin.reminders[0].time, secondPin.time);
});

test('Timeline create with storage failure still succeeds but editable false with warning', function() {
  var harness = createHarness();
  var results;
  global.Pebble = {
    getTimelineToken: function(callback) { callback('timeline-token'); }
  };
  var future = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  global.localStorage.failWrites = 100;

  harness.tools.discoverPhoneTools({
    McpServersJson: '[]',
    GeolocationToolEnabled: false,
    TimelineToolEnabled: true,
    HealthToolEnabled: false
  }, 100, function(error, definitions, map) {
    harness.tools.runToolCalls(100, [{ id: 'c', name: 'pebble_timeline_create_pin', arguments: { title: 'FailStore', time: future } }], map, function(value) { results = value; });
  });
  FakeXMLHttpRequest.instances[0].respond(200, '');
  assert.equal(results[0].error, undefined);
  var parsed = JSON.parse(results[0].result);
  assert.equal(parsed.editable, false);
  assert.ok(parsed.warning);
});

test('Timeline local APIs create, edit, and delete without token or HTTP requests', function() {
  var harness = createHarness();
  var timelineStore = require('../../src/pkjs/timeline_store');
  var localCalls = [];
  var tokenRequests = 0;
  var createResults;
  var editResults;
  var deleteResults;
  var createdPinId;
  var future = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

  global.Pebble = {
    getTimelineToken: function(callback) {
      tokenRequests += 1;
      callback('timeline-token');
    },
    insertTimelinePin: function(pin) {
      localCalls.push({ method: 'insert', pin: JSON.parse(JSON.stringify(pin)) });
    },
    deleteTimelinePin: function(id) {
      localCalls.push({ method: 'delete', id: id });
    }
  };

  harness.tools.discoverPhoneTools({
    McpServersJson: '[]',
    GeolocationToolEnabled: false,
    TimelineToolEnabled: true,
    HealthToolEnabled: false
  }, 110, function(error, definitions, map) {
    harness.tools.runToolCalls(110, [{
      id: 'create',
      name: 'pebble_timeline_create_pin',
      arguments: { title: 'Local', time: future, body: 'KeepMe' }
    }], map, function(value) { createResults = value; });
  });

  assert.equal(createResults[0].error, undefined);
  var created = JSON.parse(createResults[0].result);
  createdPinId = created.id;
  assert.equal(created.status, 'accepted');
  assert.ok(createdPinId);
  assert.equal(created.editable, true);
  assert.equal(created.deliveryAcknowledged, false);
  assert.match(created.message, /watch delivery is not acknowledged/);
  assert.equal(localCalls[0].method, 'insert');
  assert.equal(localCalls[0].pin.id, createdPinId);
  assert.equal(localCalls[0].pin.layout.body, 'KeepMe');
  assert.equal(timelineStore.listTimelinePins().length, 1);

  harness.tools.discoverPhoneTools({
    McpServersJson: '[]',
    GeolocationToolEnabled: false,
    TimelineToolEnabled: true,
    HealthToolEnabled: false
  }, 111, function(error, definitions, map) {
    harness.tools.runToolCalls(111, [{
      id: 'edit',
      name: 'pebble_timeline_edit_pin',
      arguments: { id: createdPinId, title: 'Edited' }
    }], map, function(value) { editResults = value; });
  });

  assert.equal(editResults[0].error, undefined);
  assert.equal(JSON.parse(editResults[0].result).status, 'accepted');
  assert.equal(localCalls[1].method, 'insert');
  assert.equal(localCalls[1].pin.id, createdPinId);
  assert.equal(localCalls[1].pin.layout.title, 'Edited');
  assert.equal(localCalls[1].pin.layout.body, 'KeepMe');
  assert.equal(timelineStore.listTimelinePins()[0].title, 'Edited');

  harness.tools.discoverPhoneTools({
    McpServersJson: '[]',
    GeolocationToolEnabled: false,
    TimelineToolEnabled: true,
    HealthToolEnabled: false
  }, 112, function(error, definitions, map) {
    harness.tools.runToolCalls(112, [{
      id: 'delete',
      name: 'pebble_timeline_delete_pin',
      arguments: { id: createdPinId }
    }], map, function(value) { deleteResults = value; });
  });

  assert.equal(deleteResults[0].error, undefined);
  var deleted = JSON.parse(deleteResults[0].result);
  assert.equal(deleted.status, 'accepted');
  assert.equal(deleted.deliveryAcknowledged, false);
  assert.equal(localCalls[2].method, 'delete');
  assert.equal(localCalls[2].id, createdPinId);
  assert.equal(timelineStore.listTimelinePins().length, 0);
  assert.equal(tokenRequests, 0);
  assert.equal(FakeXMLHttpRequest.instances.length, 0);
});

test('Timeline local API exceptions fail without fallback or successful store mutation', function() {
  var harness = createHarness();
  var timelineStore = require('../../src/pkjs/timeline_store');
  var tokenRequests = 0;
  var insertThrows = true;
  var createResults;
  var deleteResults;
  var future = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

  global.Pebble = {
    getTimelineToken: function(callback) {
      tokenRequests += 1;
      callback('timeline-token');
    },
    insertTimelinePin: function() {
      if (insertThrows) {
        throw new Error('insert failed');
      }
    },
    deleteTimelinePin: function() {
      throw new Error('delete failed');
    }
  };

  harness.tools.discoverPhoneTools({
    McpServersJson: '[]', GeolocationToolEnabled: false, TimelineToolEnabled: true, HealthToolEnabled: false
  }, 113, function(error, definitions, map) {
    harness.tools.runToolCalls(113, [{
      id: 'failed-create',
      name: 'pebble_timeline_create_pin',
      arguments: { title: 'Failed', time: future }
    }], map, function(value) { createResults = value; });
  });

  assert.match(createResults[0].error, /Local Timeline API error: insert failed/);
  assert.equal(timelineStore.listTimelinePins().length, 0);

  insertThrows = false;
  harness.tools.discoverPhoneTools({
    McpServersJson: '[]', GeolocationToolEnabled: false, TimelineToolEnabled: true, HealthToolEnabled: false
  }, 114, function(error, definitions, map) {
    harness.tools.runToolCalls(114, [{
      id: 'create',
      name: 'pebble_timeline_create_pin',
      arguments: { title: 'Stored', time: future }
    }], map, function(value) { createResults = value; });
  });
  var storedPinId = JSON.parse(createResults[0].result).id;
  assert.equal(JSON.parse(createResults[0].result).editable, true);

  harness.tools.discoverPhoneTools({
    McpServersJson: '[]', GeolocationToolEnabled: false, TimelineToolEnabled: true, HealthToolEnabled: false
  }, 115, function(error, definitions, map) {
    harness.tools.runToolCalls(115, [{
      id: 'delete',
      name: 'pebble_timeline_delete_pin',
      arguments: { id: storedPinId }
    }], map, function(value) { deleteResults = value; });
  });

  assert.match(deleteResults[0].error, /Local Timeline API error: delete failed/);
  assert.equal(timelineStore.listTimelinePins().length, 1);
  assert.equal(tokenRequests, 0);
  assert.equal(FakeXMLHttpRequest.instances.length, 0);
});

test('stale Timeline calls do not invoke local APIs or mutate stored pins', function() {
  var harness = createHarness();
  var timelineStore = require('../../src/pkjs/timeline_store');
  var activeRequestId = 116;
  var localCalls = 0;
  var tokenRequests = 0;
  var results;
  var map;

  harness.watch.isCurrentRequest = function(requestId) { return requestId === activeRequestId; };
  global.Pebble = {
    getTimelineToken: function(callback) {
      tokenRequests += 1;
      callback('timeline-token');
    },
    insertTimelinePin: function() { localCalls += 1; },
    deleteTimelinePin: function() { localCalls += 1; }
  };

  harness.tools.discoverPhoneTools({
    McpServersJson: '[]', GeolocationToolEnabled: false, TimelineToolEnabled: true, HealthToolEnabled: false
  }, 116, function(error, definitions, discoveredMap) { map = discoveredMap; });
  activeRequestId = 117;
  harness.tools.runToolCalls(116, [{
    id: 'stale',
    name: 'pebble_timeline_create_pin',
    arguments: { title: 'Stale', time: new Date(Date.now() + 60 * 60 * 1000).toISOString() }
  }], map, function(value) { results = value; });

  assert.equal(results, undefined);
  assert.equal(localCalls, 0);
  assert.equal(tokenRequests, 0);
  assert.equal(FakeXMLHttpRequest.instances.length, 0);
  assert.equal(timelineStore.listTimelinePins().length, 0);
});

test('Timeline falls back per operation when matching local method is unavailable', function() {
  var harness = createHarness();
  var tokenRequests = 0;
  var createResults;
  var deleteResults;
  var future = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  global.Pebble = {
    getTimelineToken: function(callback) {
      tokenRequests += 1;
      callback('timeline-token');
    },
    insertTimelinePin: function() {}
  };

  harness.tools.discoverPhoneTools({
    McpServersJson: '[]', GeolocationToolEnabled: false, TimelineToolEnabled: true, HealthToolEnabled: false
  }, 118, function(error, definitions, map) {
    harness.tools.runToolCalls(118, [{
      id: 'create',
      name: 'pebble_timeline_create_pin',
      arguments: { title: 'Fallback', time: future }
    }], map, function(value) { createResults = value; });
  });
  var fallbackPinId = JSON.parse(createResults[0].result).id;
  assert.equal(JSON.parse(createResults[0].result).status, 'accepted');
  assert.equal(FakeXMLHttpRequest.instances.length, 0);

  harness.tools.discoverPhoneTools({
    McpServersJson: '[]', GeolocationToolEnabled: false, TimelineToolEnabled: true, HealthToolEnabled: false
  }, 119, function(error, definitions, map) {
    harness.tools.runToolCalls(119, [{
      id: 'delete',
      name: 'pebble_timeline_delete_pin',
      arguments: { id: fallbackPinId }
    }], map, function(value) { deleteResults = value; });
  });

  assert.equal(FakeXMLHttpRequest.instances.length, 1);
  assert.equal(FakeXMLHttpRequest.instances[0].method, 'DELETE');
  FakeXMLHttpRequest.instances[0].respond(200, '');
  assert.equal(deleteResults[0].error, undefined);
  assert.equal(JSON.parse(deleteResults[0].result).status, 'deleted');
  assert.equal(tokenRequests, 1);
});

test('Timeline local result warns when create notifications are ignored and preserves reminders', function() {
  var harness = createHarness();
  var localPin;
  var tokenRequests = 0;
  var definitions;
  var results;
  var future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  global.Pebble = {
    getTimelineToken: function(callback) {
      tokenRequests += 1;
      callback('timeline-token');
    },
    insertTimelinePin: function(pin) {
      localPin = JSON.parse(JSON.stringify(pin));
    }
  };

  harness.tools.discoverPhoneTools({
    McpServersJson: '[]',
    GeolocationToolEnabled: false,
    TimelineToolEnabled: true,
    HealthToolEnabled: false
  }, 120, function(error, discoveredDefinitions, map) {
    definitions = discoveredDefinitions;
    harness.tools.runToolCalls(120, [{
      id: 'reminder',
      name: 'pebble_timeline_create_reminder',
      arguments: {
        title: 'Reminder',
        time: future,
        remindMinutesBefore: 10,
        createNotificationTitle: 'Reminder created',
        createNotificationBody: 'The pin was added'
      }
    }], map, function(value) { results = value; });
  });

  var notificationContract = 'legacy HTTP Timeline API only; ignored on local pins';
  assert.match(definitions.filter(function(tool) { return tool.name === 'pebble_timeline_create_reminder'; })[0].parameters.properties.createNotificationTitle.description, new RegExp(notificationContract));
  assert.match(definitions.filter(function(tool) { return tool.name === 'pebble_timeline_edit_pin'; })[0].parameters.properties.createNotificationBody.description, new RegExp(notificationContract));
  assert.equal(results[0].error, undefined);
  var parsed = JSON.parse(results[0].result);
  assert.equal(parsed.status, 'accepted');
  assert.equal(parsed.deliveryAcknowledged, false);
  assert.match(parsed.warning, /createNotification\/updateNotification/);
  assert.match(parsed.warning, /no notification was created/);
  assert.ok(parsed.warning.length <= 256);
  assert.equal(localPin.reminders.length, 1);
  assert.equal(Date.parse(localPin.reminders[0].time), Date.parse(localPin.time) - 10 * 60 * 1000);
  assert.equal(tokenRequests, 0);
  assert.equal(FakeXMLHttpRequest.instances.length, 0);
});

function runTimelineReminderEditScenario(useLocalApi) {
  var settings = {
    McpServersJson: '[]',
    GeolocationToolEnabled: false,
    TimelineToolEnabled: true,
    HealthToolEnabled: false
  };
  var harness;
  var timelineStore;
  var localPins = [];
  var tokenRequests = 0;
  var requestId = useLocalApi ? 700 : 800;
  var eventTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  var exactTime = new Date(Date.now() + 90 * 60 * 1000).toISOString();
  var nextExactTime = new Date(Date.now() + 100 * 60 * 1000).toISOString();

  load.clearModule(timelineStorePath);
  harness = createHarness();
  timelineStore = require('../../src/pkjs/timeline_store');
  global.Pebble = {
    getTimelineToken: function(callback) {
      tokenRequests += 1;
      callback('timeline-token');
    }
  };
  if (useLocalApi) {
    global.Pebble.insertTimelinePin = function(pin) {
      localPins.push(JSON.parse(JSON.stringify(pin)));
    };
  }

  function invoke(toolName, args) {
    var callResults;
    var submittedPin = null;
    var requestCount = FakeXMLHttpRequest.instances.length;
    var request;

    harness.tools.discoverPhoneTools(settings, requestId, function(error, definitions, map) {
      assert.equal(error, null);
      harness.tools.runToolCalls(requestId, [{
        id: 'timeline-' + requestId,
        name: toolName,
        arguments: args
      }], map, function(results) {
        callResults = results;
      });
    });
    requestId += 1;

    if (!useLocalApi && FakeXMLHttpRequest.instances.length > requestCount) {
      request = FakeXMLHttpRequest.instances[FakeXMLHttpRequest.instances.length - 1];
      assert.equal(request.method, 'PUT');
      submittedPin = JSON.parse(request.body);
      request.respond(200, '');
    }

    assert.ok(callResults && callResults.length === 1, 'timeline tool call settles synchronously in test harness');
    return {
      error: callResults[0].error,
      result: callResults[0].result ? JSON.parse(callResults[0].result) : null,
      pin: submittedPin || (localPins.length ? localPins[localPins.length - 1] : null)
    };
  }

  function assertTime(value, expected) {
    assert.equal(Date.parse(value), Math.floor(Date.parse(expected) / 1000) * 1000);
  }

  var requestsBeforeAmbiguousCreate = FakeXMLHttpRequest.instances.length;
  var ambiguousCreate = invoke('pebble_timeline_create_reminder', {
    title: 'Ambiguous',
    time: eventTime,
    reminderTime: exactTime,
    remindMinutesBefore: 0
  });
  assert.match(ambiguousCreate.error, /either reminderTime or remindMinutesBefore/);
  assert.equal(FakeXMLHttpRequest.instances.length, requestsBeforeAmbiguousCreate);

  var created = invoke('pebble_timeline_create_reminder', {
    title: 'Original',
    time: eventTime,
    reminderTime: exactTime,
    body: 'Keep body',
    locationName: 'Keep location',
    createNotificationTitle: 'Delivered separately',
    createNotificationBody: 'Keep delivery notice'
  });
  assert.equal(created.error, undefined);
  var reminderId = created.result.id;
  assertTime(created.pin.reminders[0].time, exactTime);

  var relative = invoke('pebble_timeline_edit_pin', { id: reminderId, remindMinutesBefore: 15 });
  assert.equal(relative.error, undefined);
  assert.equal(relative.pin.id, reminderId);
  assert.equal(Date.parse(relative.pin.reminders[0].time), Date.parse(relative.pin.time) - 15 * 60 * 1000);
  assert.equal(relative.pin.layout.body, 'Keep body');
  assert.equal(relative.pin.layout.locationName, 'Keep location');

  var exact = invoke('pebble_timeline_edit_pin', { id: reminderId, reminderTime: nextExactTime });
  assert.equal(exact.error, undefined);
  assertTime(exact.pin.reminders[0].time, nextExactTime);

  var atPinTime = invoke('pebble_timeline_edit_pin', { id: reminderId, remindMinutesBefore: 0 });
  assert.equal(atPinTime.error, undefined);
  assert.equal(atPinTime.pin.reminders[0].time, atPinTime.pin.time);

  var storedBeforeErrors = timelineStore.getTimelinePin(reminderId);
  var requestsBeforeErrors = FakeXMLHttpRequest.instances.length;
  var bothModes = invoke('pebble_timeline_edit_pin', {
    id: reminderId,
    reminderTime: nextExactTime,
    remindMinutesBefore: 1
  });
  assert.match(bothModes.error, /either reminderTime or remindMinutesBefore/);
  var clearAndMode = invoke('pebble_timeline_edit_pin', {
    id: reminderId,
    clearReminder: true,
    remindMinutesBefore: 0
  });
  assert.match(clearAndMode.error, /clearReminder cannot be combined/);
  assert.equal(FakeXMLHttpRequest.instances.length, requestsBeforeErrors);
  assert.equal(timelineStore.getTimelinePin(reminderId).pin.reminders[0].time, storedBeforeErrors.pin.reminders[0].time);

  var cleared = invoke('pebble_timeline_edit_pin', { id: reminderId, clearReminder: true });
  assert.equal(cleared.error, undefined);
  assert.equal(cleared.pin.id, reminderId);
  assert.equal(cleared.pin.reminders, undefined);
  assert.equal(cleared.pin.layout.type, 'genericPin');
  assert.equal(cleared.pin.layout.body, 'Keep body');
  assert.equal(cleared.pin.layout.locationName, 'Keep location');
  assert.equal(cleared.pin.createNotification.layout.title, 'Delivered separately');
  assert.equal(cleared.pin.createNotification.layout.body, 'Keep delivery notice');

  var saved = timelineStore.getTimelinePin(reminderId);
  assert.equal(saved.args._timelineReminderRemoved, true);
  assert.equal(saved.args.reminderTime, undefined);
  assert.equal(saved.args.remindMinutesBefore, undefined);
  assert.equal(saved.args.reminders, undefined);
  load.clearModule(timelineStorePath);
  timelineStore = require('../../src/pkjs/timeline_store');
  assert.equal(timelineStore.getTimelinePin(reminderId).args._timelineReminderRemoved, true);

  var titleOnly = invoke('pebble_timeline_edit_pin', { id: reminderId, title: 'Still cleared' });
  assert.equal(titleOnly.error, undefined);
  assert.equal(titleOnly.pin.reminders, undefined);
  assert.equal(titleOnly.pin.layout.title, 'Still cleared');

  var falseOnly = invoke('pebble_timeline_edit_pin', { id: reminderId, clearReminder: false });
  assert.equal(falseOnly.error, undefined);
  assert.equal(falseOnly.pin.reminders, undefined);

  var restored = invoke('pebble_timeline_edit_pin', { id: reminderId, remindMinutesBefore: 0 });
  assert.equal(restored.error, undefined);
  assert.equal(restored.pin.reminders[0].time, restored.pin.time);
  assert.equal(timelineStore.getTimelinePin(reminderId).args._timelineReminderRemoved, undefined);

  var regularPin = invoke('pebble_timeline_create_pin', {
    title: 'Plain',
    time: eventTime,
    remindMinutesBefore: 0,
    body: 'Plain body'
  });
  assert.equal(regularPin.error, undefined);
  assert.equal(timelineStore.getTimelinePin(regularPin.result.id).kind, 'pin');
  assert.equal(regularPin.pin.reminders[0].time, regularPin.pin.time);

  var plainId = regularPin.result.id;
  var plainCleared = invoke('pebble_timeline_edit_pin', { id: plainId, clearReminder: true });
  assert.equal(plainCleared.error, undefined);
  assert.equal(plainCleared.pin.reminders, undefined);
  assert.equal(plainCleared.pin.layout.body, 'Plain body');
  var plainTitle = invoke('pebble_timeline_edit_pin', { id: plainId, title: 'Plain still clear' });
  assert.equal(plainTitle.error, undefined);
  assert.equal(plainTitle.pin.reminders, undefined);

  var legacyRecord = timelineStore.getTimelinePin(plainId);
  var legacyArgs = JSON.parse(JSON.stringify(legacyRecord.args));
  delete legacyArgs._timelineReminderRemoved;
  legacyArgs.minutesBefore = 7;
  assert.equal(timelineStore.saveTimelinePin(plainId, legacyRecord.kind, legacyRecord.pin, legacyArgs), true);
  var legacyAlias = invoke('pebble_timeline_edit_pin', { id: plainId, title: 'Legacy alias' });
  assert.equal(legacyAlias.error, undefined);
  assert.equal(Date.parse(legacyAlias.pin.reminders[0].time), Date.parse(legacyAlias.pin.time) - 7 * 60 * 1000);

  legacyRecord = timelineStore.getTimelinePin(plainId);
  legacyArgs = JSON.parse(JSON.stringify(legacyRecord.args));
  delete legacyArgs.minutesBefore;
  legacyArgs.reminders = [{ time: exactTime, title: 'Legacy nested reminder' }];
  assert.equal(timelineStore.saveTimelinePin(plainId, legacyRecord.kind, legacyRecord.pin, legacyArgs), true);
  var legacyArray = invoke('pebble_timeline_edit_pin', { id: plainId, title: 'Legacy array' });
  assert.equal(legacyArray.error, undefined);
  assertTime(legacyArray.pin.reminders[0].time, exactTime);

  var legacyCleared = invoke('pebble_timeline_edit_pin', { id: plainId, clearReminder: true });
  assert.equal(legacyCleared.error, undefined);
  assert.equal(legacyCleared.pin.reminders, undefined);
  assert.equal(timelineStore.getTimelinePin(plainId).args.reminders, undefined);
  assert.equal(timelineStore.getTimelinePin(plainId).args.minutesBefore, undefined);

  if (useLocalApi) {
    assert.equal(FakeXMLHttpRequest.instances.length, 0);
    assert.equal(tokenRequests, 0);
  } else {
    assert.equal(tokenRequests, FakeXMLHttpRequest.instances.length);
    FakeXMLHttpRequest.instances.forEach(function(request) {
      assert.equal(request.method, 'PUT');
    });
  }
}

test('Timeline reminder mode switching and removal persist through preferred local APIs', function() {
  runTimelineReminderEditScenario(true);
});

test('Timeline reminder mode switching and removal persist through legacy HTTP fallback', function() {
  runTimelineReminderEditScenario(false);
});
