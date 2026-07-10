'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var path = require('node:path');
var common = require('../../src/pkjs/settings');
var FakeXMLHttpRequest = require('./helpers/fake_xhr');
var load = require('./helpers/load_with_stubs');

var toolsPath = path.resolve(__dirname, '../../src/pkjs/tools');

function createHarness() {
  FakeXMLHttpRequest.reset();
  global.XMLHttpRequest = FakeXMLHttpRequest;

  var watch = {
    progress: [],
    isCurrentRequest: function() { return true; },
    trackXhr: function() { return true; },
    untrackXhr: function() {},
    progressToolStart: function(id, name, detail) { watch.progress.push(['start', name, detail]); },
    progressDone: function(id, name, detail) { watch.progress.push(['done', name, detail]); },
    requestHealthSummary: function(range, id, callback) { callback(null, '{"stepCount":5}'); }
  };
  var commonStub = {};
  Object.keys(common).forEach(function(key) { commonStub[key] = common[key]; });
  commonStub.logDebug = function() {};

  var tools = load.loadWithStubs(toolsPath, {
    './settings': commonStub,
    './watch': watch
  });
  return { tools: tools, watch: watch };
}

test.afterEach(function() {
  delete global.XMLHttpRequest;
  delete global.navigator;
  delete global.Pebble;
  load.clearModule(toolsPath);
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
    'pebble_get_health_summary',
    'pebble_get_location',
    'pebble_timeline_create_or_update_pin',
    'pebble_timeline_create_reminder',
    'pebble_timeline_delete_pin'
  ]);
  assert.equal(result.map.pebble_get_location.kind, 'builtin');
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

test.todo('prototype-property tool names are rejected as unknown tools');
test.todo('MCP isError results become failed tool results');
test.todo('duplicate MCP slugs are stable regardless of response order');
test.todo('initialized notification errors prevent tools/list discovery');
