'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var path = require('node:path');
var timers = require('./helpers/fake_timers');
var load = require('./helpers/load_with_stubs');
var modulePath = path.resolve(__dirname, '../../src/pkjs/plugin_sources');
var PLUGIN_ID = '00000000-0000-0000-0001-000000000007';

function setup(manifest) {
  var requests = [];
  var handles = [];
  var watch = {
    current: true,
    isCurrentRequest: function() { return watch.current; },
    trackXhr: function(id, handle) { handles.push(handle); return true; },
    untrackXhr: function(id, handle) { var i = handles.indexOf(handle); if (i !== -1) { handles.splice(i, 1); } }
  };
  global.Pebble = {
    enumeratePlugins: function() { return manifest; },
    subscribeToSource: function(request) { requests.push(request); return { unsubscribe: function() { request.unsubscribed = (request.unsubscribed || 0) + 1; } }; }
  };
  return { api: load.loadWithStubs(modulePath, { './watch': watch }), requests: requests, watch: watch, handles: handles };
}

function manifest() {
  return [{ uuid: PLUGIN_ID, name: 'Weather', sources: [{ category: '__proto__', items: ['now', 'now'], properties: {
    temperature: ['numericValue', 'shortText'], label: ['shortText', 'longText'], graph: ['image', 'series.numericValue', 'series.shortText', 'series.timestamp', 'series.image'], at: ['timestamp'], image: ['image'], iconPixelSize: ['numericValue']
  } }] }];
}

test('catalogue is enumeration-only, bounded, and handles unsupported or malformed APIs', function() {
  var h = setup(manifest());
  var catalogue = h.api.getCatalogue();
  assert.equal(h.requests.length, 0);
  assert.equal(catalogue.sources.length, 1);
  assert.deepEqual(catalogue.sources[0].properties, ['temperature', 'label', 'graph', 'at']);
  assert.equal(catalogue.sources[0].category, '__proto__');
  global.Pebble.enumeratePlugins = function() { throw new Error('private details'); };
  assert.match(h.api.getCatalogue().status, /enumeration failed/);
  global.Pebble.enumeratePlugins = undefined;
  assert.equal(h.api.getCatalogue().sources.length, 0);
});

test('catalogue work budget stops massive malformed manifests with explicit status', function() {
  var plugins = [];
  for (var i = 0; i < 9000; i += 1) { plugins.push({ uuid: 'not-a-uuid', sources: [] }); }
  var h = setup(plugins);
  var catalogue = h.api.getCatalogue();
  assert.equal(catalogue.sources.length, 0);
  assert.match(catalogue.status, /stopped at a bounded work cap \(maximum 8192 work units/);
  assert.equal(h.requests.length, 0);
  var duplicates = [];
  for (i = 0; i < 10000; i += 1) { duplicates.push('same'); }
  global.Pebble.enumeratePlugins = function() {
    return [{ uuid: PLUGIN_ID, name: 'Duplicate fixture', sources: [{ category: 'duplicate', items: duplicates, properties: { value: ['shortText'] } }] }];
  };
  catalogue = h.api.getCatalogue();
  assert.equal(catalogue.sources.length, 1);
  assert.match(catalogue.status, /bounded work cap/);
  global.Pebble.enumeratePlugins = function() {
    return [{ uuid: PLUGIN_ID, name: 'Shape fixture', sources: [{ category: 'shape', items: ['item'], properties: { value: new Array(10000).fill('image') } }] }];
  };
  catalogue = h.api.getCatalogue();
  assert.equal(catalogue.sources.length, 0);
  assert.match(catalogue.status, /bounded work cap/);
});

test('built-in Watch State UUID opts in for discovery and read; deduplicates and drops removed source', function() {
  var h = setup(manifest());
  var tools = h.api.getTools({ PluginSourcesJson: JSON.stringify([
    { plugin: PLUGIN_ID.toUpperCase(), category: '__proto__', item: 'now' },
    { plugin: PLUGIN_ID, category: '__proto__', item: 'now' },
    { plugin: 'gone', category: 'x', item: 'y' }
  ]) });
  assert.equal(tools.length, 1);
  assert.ok(tools[0].name.indexOf('pebble_plugin_') === 0 && tools[0].name.length <= 64);
  assert.equal(tools[0].parameters.additionalProperties, false);
  assert.deepEqual(tools[0].parameters.properties.properties.items.enum, ['temperature', 'label', 'graph', 'at']);
  var response;
  tools[0].call({}, 42, function(error, result) { response = [error, result]; });
  h.requests[0].onData({ pluginUuid: PLUGIN_ID, instances: [{ instanceId: 'watch', properties: { label: { shortText: { text: 'awake' } } } }] });
  assert.equal(JSON.parse(response[1]).instances[0].properties.label.shortText.text, 'awake');
});

test('plugin tool identities stay stable across selection order and differ across plugins', function() {
  var p1 = '00000000-0000-0000-0001-000000000001';
  var p2 = '00000000-0000-0000-0001-000000000002';
  var h = setup([
    { uuid: p1, name: 'One', sources: [{ category: 'weather', items: ['location'], properties: { name: ['shortText'] } }] },
    { uuid: p2, name: 'Two', sources: [{ category: 'weather', items: ['location'], properties: { name: ['shortText'] } }] }
  ]);
  var list = [{ plugin: p1, category: 'weather', item: 'location' }, { plugin: p2, category: 'weather', item: 'location' }];
  var first = h.api.getTools({ PluginSourcesJson: JSON.stringify(list) });
  var second = h.api.getTools({ PluginSourcesJson: JSON.stringify(list.reverse()) });
  assert.equal(first[0].name, second[1].name);
  assert.equal(first[1].name, second[0].name);
  assert.notEqual(first[0].name, first[1].name);
  var collisionPair = setup([{ uuid: p1, name: 'One', sources: [
    { category: 'a|b', items: ['c'], properties: { name: ['shortText'] } },
    { category: 'a', items: ['b|c'], properties: { name: ['shortText'] } }
  ] }]);
  var collisionTools = collisionPair.api.getTools({ PluginSourcesJson: JSON.stringify([
    { plugin: p1, category: 'a|b', item: 'c' }, { plugin: p1, category: 'a', item: 'b|c' }
  ]) });
  var collisionReverse = collisionPair.api.getTools({ PluginSourcesJson: JSON.stringify([
    { plugin: p1, category: 'a', item: 'b|c' }, { plugin: p1, category: 'a|b', item: 'c' }
  ]) });
  assert.notEqual(collisionTools[0].name, collisionTools[1].name);
  assert.equal(collisionTools[0].name, collisionReverse[1].name);
  assert.equal(collisionTools[1].name, collisionReverse[0].name);
});

test('alphabetic UUID metadata, opt-in, and envelope matching normalize case', function() {
  var uuid = 'abcdefab-cdef-abcd-efab-cdefabcdefab';
  var h = setup([{ uuid: uuid, name: 'Case Fixture', sources: [{ category: 'case', items: ['item'], properties: { value: ['shortText'] } }] }]);
  var tool = h.api.getTools({ PluginSourcesJson: JSON.stringify([{ plugin: uuid.toUpperCase(), category: 'case', item: 'item' }]) })[0];
  var result;
  assert.ok(tool);
  tool.call({}, 77, function(error, json) { assert.ifError(error); result = JSON.parse(json); });
  assert.equal(h.requests[0].plugin, uuid);
  h.requests[0].onData({ pluginUuid: uuid.toUpperCase(), instances: [{ instanceId: 'x', properties: { value: { shortText: { text: 'ok' } } } }] });
  assert.equal(result.instances[0].properties.value.shortText.text, 'ok');
});

test('source reads sanitize values, strip binary fields, paginate, and reject plugin fallback', function() {
  var h = setup(manifest());
  var tool = h.api.getTools({ PluginSourcesJson: JSON.stringify([{ plugin: PLUGIN_ID, category: '__proto__', item: 'now' }]) })[0];
  var response;
  tool.call({ offset: 1, limit: 1 }, 7, function(error, result) { response = { error: error, result: result }; });
  assert.deepEqual(h.requests[0].properties, ['temperature', 'label', 'graph', 'at']);
  h.requests[0].onData({ pluginUuid: PLUGIN_ID, validUntilMs: 123, instances: [
    { instanceId: 'one', properties: { temperature: { numericValue: { value: 22, unit: 'C' } } } },
    { instanceId: 'two', properties: { temperature: { numericValue: { value: 23 }, binary: 'data:image/png;base64,secret' }, at: { timestamp: { value: 1716940800 } }, graph: { series: { start: 1729468800, stepSec: 3600, numericValue: { values: [14, 15, null, 16], unit: 'C' }, shortText: { values: ['14C', null, '16C'] }, timestamp: { values: [1798354800, null] }, image: { values: ['secret'] } } } } }
  ] });
  assert.equal(h.requests[0].unsubscribed, 1);
  var parsed = JSON.parse(response.result);
  assert.equal(parsed.instances[0].instanceId, 'two');
  assert.equal(parsed.hasMore, false);
  assert.deepEqual(parsed.instances[0].properties.graph.series.numericValue.values, [14, 15, null, 16]);
  assert.deepEqual(parsed.instances[0].properties.graph.series.shortText.values, ['14C', null, '16C']);
  assert.equal(parsed.instances[0].properties.graph.series.start, 1729468800);
  assert.equal(parsed.instances[0].properties.graph.series.numericValue.unit, 'C');
  assert.equal(parsed.instances[0].properties.at.timestamp.value, 1716940800);
  assert.equal(JSON.stringify(parsed).indexOf('secret'), -1);

  response = null;
  tool.call({ properties: ['label'] }, 7, function(error, result) { response = { error: error, result: result }; });
  assert.deepEqual(h.requests[1].properties, ['label']);
  h.requests[1].onData({ pluginUuid: PLUGIN_ID, instances: [{ instanceId: 'subset', properties: { label: { shortText: { text: 'only' }, image: 'binary' }, temperature: { numericValue: { value: 99 } } } }] });
  assert.equal(JSON.parse(response.result).instances[0].properties.temperature, undefined);

  response = null;
  tool.call({}, 7, function(error) { response = error; });
  h.requests[2].onData({ pluginUuid: 'fallback-plugin', instances: [] });
  assert.match(response, /unexpected plugin/);
});

test('malformed envelopes fail; oversized property payloads become bounded JSON omissions', function() {
  var h = setup(manifest());
  var tool = h.api.getTools({ PluginSourcesJson: JSON.stringify([{ plugin: PLUGIN_ID, category: '__proto__', item: 'now' }]) })[0];
  var response;
  tool.call({ instanceId: 'wanted' }, 8, function(error, result) { response = [error, result]; });
  h.requests[0].onData({ pluginUuid: PLUGIN_ID, instances: [null] });
  assert.match(response[0], /Malformed/);
  tool.call({}, 8, function(error, result) { response = [error, result]; });
  var hugeInstances = [];
  for (var i = 0; i < 14; i += 1) { hugeInstances.push({ instanceId: 'huge-' + i, properties: { label: { longText: { text: new Array(1025).join('x') } } } }); }
  h.requests[1].onData({ pluginUuid: PLUGIN_ID, instances: hugeInstances });
  assert.equal(response[0], null);
  assert.ok(response[1].length <= 6000);
  var page = JSON.parse(response[1]);
  assert.equal(page.truncated, true);
  assert.equal(page.hasMore, true);
  assert.equal(page.nextOffset, page.instances.length);
  assert.ok(page.instances.length > 0 && page.instances.length < hugeInstances.length);

  var callbackCount = 0;
  tool.call({}, 9, function(error) { callbackCount += 1; assert.match(error, /Malformed/); });
  var malformedInstance = { instanceId: 'bad' };
  Object.defineProperty(malformedInstance, 'properties', { get: function() { throw new Error('malformed fixture'); } });
  h.requests[2].onData({ pluginUuid: PLUGIN_ID, instances: [malformedInstance] });
  h.requests[2].onData({ pluginUuid: PLUGIN_ID, instances: [] });
  assert.equal(callbackCount, 1);
  assert.equal(h.requests[2].unsubscribed, 1);
});

test('series and pagination retain safe metadata; permission, timeout, cancellation and stale requests settle safely', function() {
  var clock = timers();
  try {
    var h = setup(manifest());
    var tool = h.api.getTools({ PluginSourcesJson: JSON.stringify([{ plugin: PLUGIN_ID, category: '__proto__', item: 'now' }]) })[0];
    var response;
    tool.call({ limit: 1 }, 1, function(error, result) { response = [error, result]; });
    h.requests[0].onData({ pluginUuid: PLUGIN_ID.toUpperCase(), validUntilMs: 99, instances: [
      { instanceId: 'a', properties: { graph: { series: { start: 1, stepSec: 3, numericValue: { values: [1, null, 2], unit: 'C' }, shortText: { values: ['one', null, 'two'] }, timestamp: { values: [10, null, 12] } } } } },
      { instanceId: 'b', properties: {} }
    ] });
    var page = JSON.parse(response[1]);
    assert.equal(page.hasMore, true);
    assert.equal(page.nextOffset, 1);
    assert.equal(page.validUntilMs, 99);
    assert.deepEqual(page.instances[0].properties.graph.series.numericValue.values, [1, null, 2]);
    assert.deepEqual(page.instances[0].properties.graph.series.shortText.values, ['one', null, 'two']);

    tool.call({}, 2, function(error) { response = error; });
    h.requests[1].onError({ code: 'PERMISSION_DENIED' });
    assert.match(response, /Approve access in Pebble app/);
    assert.equal(h.requests[1].unsubscribed, 1);
    tool.call({}, 3, function(error) { response = error; });
    clock.run(3);
    assert.match(response, /timed out/);
    tool.call({}, 4, function() { assert.fail('canceled callback fired'); });
    h.api.cancelRequest(4);
    assert.equal(h.requests[3].unsubscribed, 1);
    tool.call({}, 5, function() { assert.fail('stale callback fired'); });
    h.watch.current = false;
    h.requests[4].onData({ pluginUuid: PLUGIN_ID, instances: [] });
    assert.equal(h.requests[4].unsubscribed, 1);
  } finally { clock.restore(); }
});

test('series preserves null positions and reports clipped text, metadata, and sample omissions', function() {
  var h = setup(manifest());
  var tool = h.api.getTools({ PluginSourcesJson: JSON.stringify([{ plugin: PLUGIN_ID, category: '__proto__', item: 'now' }]) })[0];
  var result;
  tool.call({}, 70, function(error, json) { assert.ifError(error); result = JSON.parse(json); });
  var longText = new Array(140).join('t');
  var boundaryLongText = new Array(512).join('l') + '\ud83d\ude00x';
  var boundarySeriesText = new Array(128).join('s') + '\ud83d\ude00';
  var longInstanceId = new Array(140).join('i');
  var values = [];
  for (var i = 0; i < 130; i += 1) { values.push(i === 3 ? null : i); }
  h.requests[0].onData({ pluginUuid: PLUGIN_ID, instances: [{ instanceId: longInstanceId, properties: {
    label: { shortText: { text: longText }, longText: { text: boundaryLongText } },
    temperature: { timestamp: { value: 'not epoch' }, numericValue: { value: Infinity, unit: new Array(60).join('u') } },
    graph: { series: { start: Infinity, stepSec: 3600, numericValue: { values: values, unit: new Array(60).join('u') }, shortText: { values: [boundarySeriesText, null] }, timestamp: { values: [Infinity, null] }, image: { values: ['binary'] }, unknown: { values: [1] } } }
  } }] });
  var instance = result.instances[0];
  assert.equal(instance.instanceId, undefined);
  assert.equal(instance.instanceIdOmitted, true);
  assert.equal(instance.properties.temperature, undefined);
  assert.equal(instance.properties.graph.series.start, undefined);
  assert.deepEqual(instance.properties.graph.series.numericValue.values.slice(0, 5), [0, 1, 2, null, 4]);
  assert.equal(instance.properties.graph.series.numericValue.values.length, 128);
  assert.equal(instance.properties.graph.series.numericValue.unit.length, 48);
  assert.equal(instance.omittedSeriesValues, 3);
  assert.equal(result.truncated, true);
  assert.ok(instance.truncatedProperties.indexOf('label') !== -1);
  assert.ok(instance.truncatedProperties.indexOf('graph') !== -1);
  assert.equal(instance.properties.label.longText.text.length, 511);
  assert.equal(instance.properties.label.longText.text.charCodeAt(510), 'l'.charCodeAt(0));
  assert.equal(instance.properties.graph.series.shortText.values[0].length, 127);
  assert.equal(instance.properties.graph.series.shortText.values[0].charCodeAt(126), 's'.charCodeAt(0));
  assert.equal(JSON.stringify(result).indexOf('binary'), -1);
});

test('property fitting retains later useful data; unfiltered offsets reach beyond512 and filtered cap reports tail', function() {
  var properties = { massive: ['series.longText'], temperature: ['numericValue'] };
  var propertyNames = ['massive', 'temperature'];
  var i;
  for (i = 0; i < 24; i += 1) { properties['field' + i] = ['longText']; propertyNames.push('field' + i); }
  var h = setup([{ uuid: PLUGIN_ID, name: 'Large', sources: [{ category: 'large', items: ['item'], properties: properties }] }]);
  var tool = h.api.getTools({ PluginSourcesJson: JSON.stringify([{ plugin: PLUGIN_ID, category: 'large', item: 'item' }]) })[0];
  var response;
  tool.call({}, 90, function(error, result) { assert.ifError(error); response = JSON.parse(result); });
  var propertyValues = {};
  var seriesText = [];
  for (i = 0; i < 128; i += 1) { seriesText.push(new Array(513).join('x')); }
  propertyValues.massive = { series: { longText: { values: seriesText } } };
  propertyValues.temperature = { numericValue: { value: 21, unit: 'C' } };
  for (i = 2; i < propertyNames.length; i += 1) { propertyValues[propertyNames[i]] = { longText: { text: new Array(513).join('x') } }; }
  h.requests[0].onData({ pluginUuid: PLUGIN_ID, instances: [{ instanceId: 'large', properties: propertyValues }] });
  assert.ok(JSON.stringify(response).length <= 6000);
  assert.equal(response.instances.length, 1);
  assert.equal(response.instances[0].properties.massive, undefined);
  assert.equal(response.instances[0].properties.temperature.numericValue.value, 21);
  assert.ok(Object.keys(response.instances[0].properties).length > 1);
  assert.ok(response.instances[0].omittedProperties.indexOf('massive') !== -1);
  assert.equal(response.truncated, true);

  response = null;
  tool.call({ offset: 512 }, 91, function(error, result) { assert.ifError(error); response = JSON.parse(result); });
  var many = [];
  for (i = 0; i < 520; i += 1) { many.push({ instanceId: String(i), properties: {} }); }
  h.requests[1].onData({ pluginUuid: PLUGIN_ID, instances: many });
  assert.equal(response.instances.length, 8);
  assert.equal(response.scanTruncated, undefined);
  assert.equal(response.truncated, false);
  assert.equal(response.hasMore, false);

  response = null;
  tool.call({ instanceId: 'absent' }, 92, function(error, result) { assert.ifError(error); response = JSON.parse(result); });
  h.requests[2].onData({ pluginUuid: PLUGIN_ID, instances: many });
  assert.equal(response.scanTruncated, true);
  assert.equal(response.omittedInstancesAtLeast, 8);
  assert.equal(response.hasMore, false);
  assert.equal(response.truncated, true);
  assert.match(response.omission, /later instances were not searched/);
});

test('budget-dropped records resume at exact offset without later-record skip or duplication', function() {
  var properties = {};
  var largeNames = [];
  var values = [];
  var firstProperties = {};
  var oversizedProperties = {};
  var i;
  for (i = 0; i < 32; i += 1) {
    var name = ('field' + i + '_' + new Array(90).join('x')).substring(0, 80);
    properties[name] = ['longText', 'series.longText'];
    largeNames.push(name);
    firstProperties[name] = { longText: { text: new Array(513).join('x') } };
    oversizedProperties[name] = { series: { longText: { values: values } } };
  }
  for (i = 0; i < 128; i += 1) { values.push(new Array(513).join('z')); }
  for (i = 0; i < largeNames.length; i += 1) { oversizedProperties[largeNames[i]].series.longText.values = values; }
  var envelope = { pluginUuid: PLUGIN_ID, instances: [
    { instanceId: 'first', properties: firstProperties },
    { instanceId: 'budget-dropped', properties: oversizedProperties },
    { instanceId: 'last', properties: { [largeNames[0]]: { longText: { text: 'small' } } } }
  ] };
  var h = setup([{ uuid: PLUGIN_ID, name: 'Budget fixture', sources: [{ category: 'budget', items: ['item'], properties: properties }] }]);
  var tool = h.api.getTools({ PluginSourcesJson: JSON.stringify([{ plugin: PLUGIN_ID, category: 'budget', item: 'item' }]) })[0];
  var seen = [];
  var offset = 0;
  var pageCount = 0;
  var done = false;
  while (!done && pageCount < 8) {
    var response;
    tool.call({ offset: offset, limit: 16 }, 110 + pageCount, function(error, json) {
      assert.ifError(error);
      assert.ok(json.length <= 6000);
      response = JSON.parse(json);
    });
    h.requests[pageCount].onData(envelope);
    assert.ok(response);
    var ids = response.instances.map(function(instance) { return instance.instanceId; });
    if (pageCount === 0) { assert.deepEqual(ids, ['first']); }
    seen = seen.concat(ids);
    if (!response.hasMore) {
      done = true;
    } else {
      assert.ok(response.nextOffset > offset);
      offset = response.nextOffset;
    }
    pageCount += 1;
  }
  assert.equal(done, true);
  assert.deepEqual(seen, ['first', 'budget-dropped', 'last']);
});

test('escaped long property names and metadata never exceed result budget after fitting', function() {
  var properties = {};
  var values = {};
  for (var i = 0; i < 32; i += 1) {
    var name = ('"\\' + i + new Array(80).join('q')).substring(0, 80);
    properties[name] = ['longText'];
    values[name] = { longText: { text: new Array(513).join('v') } };
  }
  var h = setup([{ uuid: PLUGIN_ID, name: 'Escaping fixture', sources: [{ category: 'escape', items: ['item'], properties: properties }] }]);
  var tool = h.api.getTools({ PluginSourcesJson: JSON.stringify([{ plugin: PLUGIN_ID, category: 'escape', item: 'item' }]) })[0];
  var response;
  tool.call({}, 119, function(error, json) {
    assert.ifError(error);
    assert.ok(json.length <= 6000);
    response = JSON.parse(json);
  });
  h.requests[0].onData({ pluginUuid: PLUGIN_ID, instances: [{ instanceId: 'escaped', properties: values }] });
  assert.ok(response);
  assert.ok(Object.keys(response.instances[0].properties).length > 0);
  assert.equal(response.truncated, true);
});

test('watch lifecycle abort immediately unsubscribes, clears timeout, and suppresses callback', function() {
  var clock = timers();
  try {
    var h = setup(manifest());
    var tool = h.api.getTools({ PluginSourcesJson: JSON.stringify([{ plugin: PLUGIN_ID, category: '__proto__', item: 'now' }]) })[0];
    var calls = 0;
    tool.call({}, 11, function() { calls += 1; });
    assert.equal(h.handles.length, 1);
    var deadline = clock.timers.filter(function(timer) { return timer.delay === 15000; })[0];
    assert.ok(deadline);
    h.handles[0].abort();
    assert.equal(h.handles.length, 0);
    assert.equal(h.requests[0].unsubscribed, 1);
    assert.equal(deadline.cleared, true);
    assert.equal(calls, 0);
  } finally { clock.restore(); }
});

test('synchronous callbacks clean up returned subscription and duplicate callbacks are ignored', function() {
  var watch = { isCurrentRequest: function() { return true; } };
  var unsubscribed = 0;
  global.Pebble = {
    enumeratePlugins: function() { return manifest(); },
    subscribeToSource: function(request) {
      request.onData({ pluginUuid: PLUGIN_ID, instances: [] });
      request.onData({ pluginUuid: PLUGIN_ID, instances: [{ instanceId: 'duplicate', properties: {} }] });
      return { unsubscribe: function() { unsubscribed += 1; } };
    }
  };
  var api = load.loadWithStubs(modulePath, { './watch': watch });
  var calls = 0;
  api.getTools({ PluginSourcesJson: JSON.stringify([{ plugin: PLUGIN_ID, category: '__proto__', item: 'now' }]) })[0].call({}, 1, function() { calls += 1; });
  assert.equal(calls, 1);
  assert.equal(unsubscribed, 1);
});
