'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var path = require('node:path');
var createFakePebble = require('./helpers/fake_pebble');
var installFakeTimers = require('./helpers/fake_timers');
var load = require('./helpers/load_with_stubs');

var watchPath = path.resolve(__dirname, '../../src/pkjs/watch');

function freshWatch(options) {
  global.Pebble = createFakePebble(options);
  load.clearModule(watchPath);
  return require(watchPath);
}

test.afterEach(function() {
  delete global.Pebble;
  load.clearModule(watchPath);
});

test('syncWatchSettings sends normalized watch-facing dictionary', function() {
  var watch = freshWatch();

  watch.syncWatchSettings({
    FontSize: 24,
    BuzzStrength: 2,
    ScrollLines: 4,
    TouchScrollEnabled: true,
    ShowInputContextSize: false,
    ShowOutputContextSize: true,
    PreserveChats: true,
    StartDictationQuickLaunch: false,
    TextColor: 1,
    BackgroundColor: 2,
    PromptBackgroundColor: 3,
    BoldTextColor: 4
  });

  assert.deepEqual(global.Pebble.messages[0], {
    FontSize: 24,
    BuzzStrength: 2,
    ScrollLines: 4,
    TouchScrollEnabled: 1,
    ShowInputContextSize: 0,
    ShowOutputContextSize: 1,
    PreserveChats: 1,
    StartDictationQuickLaunch: 0,
    TextColor: 1,
    BackgroundColor: 2,
    PromptBackgroundColor: 3,
    BoldTextColor: 4
  });
});

test('sendResponse serializes reset, formatted chunks, and done', function() {
  var watch = freshWatch();
  var text = '**bold** ' + new Array(850).join('x');
  var chunks;
  var done = 0;

  watch.beginRequestLifecycle(7);
  watch.sendResponse(7, { FontSize: 18 }, text, function() { done += 1; });

  assert.equal(global.Pebble.messages[0].ResponseReset, 1);
  chunks = global.Pebble.messages.filter(function(message) { return message.ResponseChunk !== undefined; });
  assert.equal(chunks.length, 3);
  assert.ok(chunks.every(function(message) { return message.ResponseChunk.length <= 400; }));
  assert.equal(chunks.map(function(message) { return message.ResponseChunk; }).join('').indexOf('\u0001bold\u0002 '), 0);
  assert.equal(global.Pebble.messages[global.Pebble.messages.length - 1].ResponseDone, 1);
  assert.equal(done, 1);
});

test('response limits vary by selected watch font', function() {
  var watch = freshWatch();
  var text = new Array(7000).join('x');
  var joined;

  watch.beginRequestLifecycle(1);
  watch.sendResponse(1, { FontSize: 28 }, text);
  joined = global.Pebble.messages.filter(function(message) {
    return message.ResponseChunk !== undefined;
  }).map(function(message) {
    return message.ResponseChunk;
  }).join('');

  assert.equal(joined.length, 2400);
  assert.match(joined, /\[Truncated\]$/);
});

test('new request aborts stale XHR and suppresses queued stale messages', function() {
  var watch = freshWatch({ manualSends: true });
  var xhr = { aborted: 0, abort: function() { this.aborted += 1; } };

  watch.beginRequestLifecycle(1);
  assert.equal(watch.trackXhr(1, xhr), true);
  watch.sendMessage({ RequestId: 1, ProgressText: 'in flight' });
  watch.sendMessage({ RequestId: 1, ProgressText: 'queued' });
  assert.equal(global.Pebble.pendingSendCount(), 1);

  watch.beginRequestLifecycle(2);
  assert.equal(xhr.aborted, 1);
  global.Pebble.flushNextSend();
  assert.equal(global.Pebble.pendingSendCount(), 0);
  assert.equal(global.Pebble.messages.length, 1);
});

test('progress messages track tools, history, and context for current request', function() {
  var watch = freshWatch();

  watch.beginRequestLifecycle(5);
  watch.progressStart(5, 'thinking', 'start');
  watch.progressToolStart(5, 'MCP Search', 'query');
  watch.progressDone(5);
  watch.progressToolStart(5, 'MCP Search', 'second query');
  watch.progressDone(5);
  watch.progressSetContextSizes(5, '100', '20');
  watch.progressSet(4, 'stale', 'ignored');

  assert.equal(global.Pebble.messages[0].ProgressReset, 1);
  assert.equal(global.Pebble.messages[global.Pebble.messages.length - 1].ProgressHistory, 'MCP Search 2x');
  assert.equal(global.Pebble.messages[global.Pebble.messages.length - 1].ProgressInputContextSize, '100');
  assert.equal(global.Pebble.messages.some(function(message) { return message.ProgressText === 'stale'; }), false);
});

test('health summary request handles response and timeout', function() {
  var timers = installFakeTimers();
  var watch = freshWatch();
  var result;

  try {
    watch.beginRequestLifecycle(9);
    watch.requestHealthSummary({ startUnix: 10, endUnix: 20, includeHeartRate: true }, 9, function(error, json) {
      result = { error: error, json: json };
    });
    assert.deepEqual(global.Pebble.messages[0], {
      RequestId: 9,
      HealthSummaryRequest: 1,
      HealthStartUnix: 10,
      HealthEndUnix: 20,
      HealthIncludeHeartRate: 1
    });
    watch.handleHealthSummaryResponse({
      RequestId: 9,
      HealthSummaryRequest: 1,
      HealthSummaryJson: '{"stepCount":12}'
    });
    assert.deepEqual(result, { error: null, json: '{"stepCount":12}' });

    result = null;
    watch.requestHealthSummary({ startUnix: 20, endUnix: 30 }, 9, function(error) {
      result = error;
    });
    timers.runAll();
    assert.equal(result, 'Health summary request timed out');
  } finally {
    timers.restore();
  }
});

test('response chunks use UTF-8 byte limits and never split surrogate pairs', function() {
  var watch = freshWatch();
  var text = new Array(301).join('漢') + new Array(151).join('😀');
  var chunks;

  watch.beginRequestLifecycle(11);
  watch.sendResponse(11, { FontSize: 18 }, text);
  chunks = global.Pebble.messages.filter(function(message) {
    return message.ResponseChunk !== undefined;
  });

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(function(message) {
    return Buffer.byteLength(message.ResponseChunk, 'utf8') <= 400 &&
      !/[\ud800-\udbff]$/.test(message.ResponseChunk) &&
      !/^[\udc00-\udfff]/.test(message.ResponseChunk);
  }));
  assert.deepEqual(chunks.map(function(message) { return message.ResponseChunkIndex; }),
    chunks.map(function(message, index) { return index; }));
  assert.equal(chunks.map(function(message) { return message.ResponseChunk; }).join(''), text);
});

test('AppMessage failure terminates completion lifecycle exactly once', function() {
  var timers = installFakeTimers();
  var watch = freshWatch();
  var completions = [];

  try {
    global.Pebble.queueSendFailure({ error: 'one' });
    global.Pebble.queueSendFailure({ error: 'two' });
    global.Pebble.queueSendFailure({ error: 'three' });
    watch.beginRequestLifecycle(12);
    watch.sendResponse(12, { FontSize: 18 }, 'answer', function(error) {
      completions.push(error);
    });
    timers.runAll();
    timers.runAll();

    assert.equal(completions.length, 1);
    assert.ok(completions[0]);
    assert.equal(global.Pebble.messages.some(function(message) { return message.ResponseDone; }), false);
    assert.equal(global.Pebble.messages.some(function(message) { return message.ResponseError; }), true);
  } finally {
    timers.restore();
  }
});

test('mismatched health RequestId leaves matching pending request active', function() {
  var watch = freshWatch();
  var result;

  watch.beginRequestLifecycle(13);
  watch.requestHealthSummary({ startUnix: 10, endUnix: 20 }, 13, function(error, json) {
    result = { error: error, json: json };
  });
  watch.handleHealthSummaryResponse({
    RequestId: 99,
    HealthSummaryRequest: 1,
    HealthSummaryJson: '{"wrong":true}'
  });
  assert.equal(result, undefined);
  watch.handleHealthSummaryResponse({
    RequestId: 13,
    HealthSummaryRequest: 1,
    HealthSummaryJson: '{"stepCount":5}'
  });
  assert.deepEqual(result, { error: null, json: '{"stepCount":5}' });
});
