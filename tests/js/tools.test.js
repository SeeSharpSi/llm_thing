'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var path = require('node:path');
var common = require('../../src/pkjs/settings');
var FakeXMLHttpRequest = require('./helpers/fake_xhr');
var FakeLocalStorage = require('./helpers/fake_local_storage');
var installFakeTimers = require('./helpers/fake_timers');
var load = require('./helpers/load_with_stubs');

var toolsPath = path.resolve(__dirname, '../../src/pkjs/tools');
var timelineStorePath = path.resolve(__dirname, '../../src/pkjs/timeline_store');
var webFetchPath = path.resolve(__dirname, '../../src/pkjs/web_fetch');

function createHarness() {
  FakeXMLHttpRequest.reset();
  global.XMLHttpRequest = FakeXMLHttpRequest;
  global.localStorage = new FakeLocalStorage();

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
  return { tools: tools, watch: watch, commonStub: commonStub };
}

test.afterEach(function() {
  delete global.XMLHttpRequest;
  delete global.navigator;
  delete global.Pebble;
  delete global.localStorage;
  load.clearModule(toolsPath);
  load.clearModule(timelineStorePath);
  load.clearModule(webFetchPath);
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
    'pebble_timeline_delete_pin',
    'pebble_timeline_edit_pin',
    'pebble_timeline_list_pins'
  ]);
  assert.equal(result.map.pebble_get_location.kind, 'builtin');
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
      name: 'pebble_timeline_create_or_update_pin',
      arguments: { id: 'old', title: 'Old', time: '2000-01-01T00:00:00Z' }
    }, {
      id: 'future',
      name: 'pebble_timeline_create_or_update_pin',
      arguments: { id: 'future', title: 'Future', time: '2100-01-01T00:00:00Z' }
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
        name: 'pebble_timeline_create_or_update_pin',
        arguments: {
          id: 'retry-pin',
          title: 'Retry',
          time: new Date(new Date().getTime() + 60 * 60 * 1000).toISOString()
        }
      }], map, function(value) { results = value; });
    });

    assert.equal(FakeXMLHttpRequest.instances.length, 1);
    FakeXMLHttpRequest.instances[0].respond(429, 'busy', { 'Retry-After': '0' });
    timers.runAll();
    assert.equal(FakeXMLHttpRequest.instances.length, 2);
    FakeXMLHttpRequest.instances[1].respond(200, '');
    assert.equal(results[0].error, undefined);
    var parsed = JSON.parse(results[0].result);
    assert.equal(parsed.status, 'success');
    assert.equal(parsed.id, 'retry-pin');
    assert.equal(parsed.editable, true);
  } finally {
    timers.restore();
  }
});

test('Timeline upsert rejects unknown arguments by schema before any timeline call', function() {
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
      name: 'pebble_timeline_create_or_update_pin',
      arguments: {
        id: 'unknown-arg',
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

  assert.equal(results[0].error, 'Use structured timeline arguments, not raw Pebble pin JSON');
  assert.equal(FakeXMLHttpRequest.instances.length, 0);
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
      isError: true
    }
  });

  assert.equal(results[0].error, 'Tool failed: missing required argument');
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

test('MCP result text longer than the cap is truncated with a suffix', function() {
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
  var longText = new Array(12002).join('x');
  assert.equal(longText.length, 12001);
  FakeXMLHttpRequest.last().respond(200, {
    result: { content: [{ type: 'text', text: longText }] }
  });

  assert.equal(results[0].result.length, 12000);
  assert.ok(/\. \.\. \[truncated\]$|^\.\.\. \[truncated\]$/.test(results[0].result.substring(results[0].result.length - 16)) ||
    results[0].result.substring(results[0].result.length - 15) === '... [truncated]');
  assert.equal(results[0].result.substring(results[0].result.length - 15), '... [truncated]');
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
      name: 'pebble_timeline_create_or_update_pin',
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
  assert.equal(list.length, 1);
  assert.equal(list[0].id, parsed.id);
  assert.equal(list[0].title, 'Generated');
  assert.equal(list[0].kind, 'pin');
  assert.equal(FakeXMLHttpRequest.instances.length, 1);
});

test('Timeline edit with only changed title preserves original time/body and uses same ID', function() {
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
      name: 'pebble_timeline_create_or_update_pin',
      arguments: { title: 'Original', time: future, body: 'KeepMe', subtitle: 'Sub' }
    }], map, function(value) { results = value; });
  });

  FakeXMLHttpRequest.instances[0].respond(200, '');
  var firstId = JSON.parse(results[0].result).id;
  var firstBody = JSON.parse(FakeXMLHttpRequest.instances[0].body);
  assert.equal(firstBody.layout.body, 'KeepMe');
  assert.equal(firstBody.layout.subtitle, 'Sub');

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
  assert.equal(secondBody.time, firstBody.time);

  FakeXMLHttpRequest.instances[0].respond(200, '');
  assert.equal(editResults[0].error, undefined);
  var parsedEdit = JSON.parse(editResults[0].result);
  assert.equal(parsedEdit.id, firstId);
  assert.equal(parsedEdit.title, 'Changed');
  assert.equal(parsedEdit.editable, true);
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
  assert.equal(list.length, 0);
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
    harness.tools.runToolCalls(100, [{ id: 'c', name: 'pebble_timeline_create_or_update_pin', arguments: { title: 'FailStore', time: future } }], map, function(value) { results = value; });
  });
  FakeXMLHttpRequest.instances[0].respond(200, '');
  assert.equal(results[0].error, undefined);
  var parsed = JSON.parse(results[0].result);
  assert.equal(parsed.editable, false);
  assert.ok(parsed.warning);
});
