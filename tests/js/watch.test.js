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
    SpeakerFeedbackEnabled: true,
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
    SpeakerFeedbackEnabled: 1,
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

test('finish lifecycle cleans request state without marking request canceled', function() {
  var watch = freshWatch();

  watch.beginRequestLifecycle(25);
  watch.finishRequestLifecycle(25);

  assert.equal(watch.isCurrentRequest(25), true);
  assert.equal(watch.sendMessage({ RequestId: 25, ProgressText: 'still current' }), true);
  assert.deepEqual(global.Pebble.messages, [{ RequestId: 25, ProgressText: 'still current' }]);
});

test('cancel lifecycle handles request id zero, abort mutation, health timer, and preserves ID-less queue', function() {
  var timers = installFakeTimers();
  var watch;
  var healthResult;
  var xhrOne;
  var xhrTwo;

  try {
    watch = freshWatch({ manualSends: true });
    assert.equal(watch.isCurrentRequest(0), false, 'request id zero is inactive before begin');
    watch.beginRequestLifecycle(0);
    assert.equal(watch.isCurrentRequest(0), true);

    watch.syncWatchSettings({ FontSize: 18 });
    watch.requestHealthInfo({ startUnix: 1, endUnix: 2, queryMask: 1 }, 0, function(error) {
      healthResult = error;
    });
    watch.sendMessage({ RequestId: 0, ProgressText: 'old queued' });
    watch.progressStart(0, 'thinking', 'old');

    xhrOne = { aborted: 0, abort: function() {
      this.aborted += 1;
      watch.untrackXhr(0, this);
    } };
    xhrTwo = { aborted: 0, abort: function() { this.aborted += 1; } };
    assert.equal(watch.trackXhr(0, xhrOne), true);
    assert.equal(watch.trackXhr(0, xhrTwo), true);
    assert.equal(timers.timers.filter(function(timer) { return timer.delay === 8000; }).length, 1);

    assert.equal(watch.cancelRequestLifecycle(0), true);
    assert.equal(watch.cancelRequestLifecycle(0), false, 'repeat cancel cannot cancel a newer/inactive lifecycle');
    assert.equal(watch.isCurrentRequest(0), false);
    assert.equal(xhrOne.aborted, 1);
    assert.equal(xhrTwo.aborted, 1, 'abort iteration survives registry mutation');
    assert.equal(timers.timers.filter(function(timer) { return timer.delay === 8000; })[0].cleared, true);
    assert.equal(healthResult, undefined, 'cancellation discards pending health callback');

    watch.progressSet(0, 'stale', 'must not restart progress');
    watch.beginRequestLifecycle(1);
    watch.sendMessage({ RequestId: 1, ProgressText: 'new request' });
    assert.equal(global.Pebble.pendingSendCount(), 1, 'only original ID-less send remains in flight');
    global.Pebble.flushNextSend();

    assert.equal(global.Pebble.messages.length, 2);
    assert.equal(global.Pebble.messages[0].FontSize, 18);
    assert.equal(global.Pebble.messages[1].RequestId, 1);
    assert.equal(global.Pebble.messages[1].ProgressText, 'new request');
    assert.equal(global.Pebble.messages.some(function(message) {
      return message.HealthSummaryRequest || message.ProgressReset || message.ProgressText === 'old queued';
    }), false);
  } finally {
    timers.restore();
  }
});

test('cancel resumes retained ID-less queue after removing request retry head', function() {
  var timers = installFakeTimers();
  var watch;
  var failureCount = 0;

  try {
    watch = freshWatch({ manualSends: true });
    watch.beginRequestLifecycle(36);
    watch.sendMessage({ RequestId: 36, ProgressText: 'retry me' }, null, function() {
      failureCount += 1;
    });
    global.Pebble.flushNextSend({ error: 'temporary failure' });
    assert.equal(timers.timers.filter(function(timer) {
      return timer.delay === 100 && !timer.cleared;
    }).length, 1);

    watch.syncWatchSettings({ FontSize: 18 });
    assert.equal(global.Pebble.messages.length, 1, 'retry delay blocks queued settings until cancellation');
    assert.equal(watch.cancelRequestLifecycle(36), true);

    assert.equal(failureCount, 1);
    assert.equal(timers.timers.filter(function(timer) { return timer.delay === 100; })[0].cleared, true);
    assert.equal(global.Pebble.pendingSendCount(), 1, 'ID-less settings starts immediately after canceled retry is removed');
    assert.equal(global.Pebble.messages.length, 2);
    assert.equal(global.Pebble.messages[1].FontSize, 18);

    global.Pebble.flushNextSend();
    assert.equal(global.Pebble.pendingSendCount(), 0, 'retained settings send drains without another enqueue');
  } finally {
    timers.restore();
  }
});

test('late canceled AppMessage acknowledgement fails transfer once and releases queue for next request', function() {
  var watch = freshWatch({ manualSends: true });
  var completions = [];

  watch.beginRequestLifecycle(31);
  watch.sendResponse(31, { FontSize: 18 }, 'answer', function(error) {
    completions.push(error);
  });
  assert.deepEqual(global.Pebble.messages[0], { ResponseReset: 1, RequestId: 31 });

  assert.equal(watch.cancelRequestLifecycle(31), true);
  watch.beginRequestLifecycle(32);
  watch.syncWatchSettings({ FontSize: 20 });
  watch.sendMessage({ RequestId: 32, ProgressText: 'fresh' });

  assert.equal(completions.length, 1, 'cancellation settles transfer without waiting for unsendable ACK');
  assert.ok(completions[0]);
  global.Pebble.flushNextSend();
  assert.equal(completions.length, 1);
  assert.ok(completions[0]);
  assert.equal(global.Pebble.pendingSendCount(), 1, 'ID-less settings send continues after canceled ACK');
  global.Pebble.flushNextSend();
  assert.equal(global.Pebble.pendingSendCount(), 1, 'new request reaches queue head');
  global.Pebble.flushNextSend();

  assert.equal(completions.length, 1, 'late ACK cannot complete transfer twice');
  assert.equal(global.Pebble.messages.length, 3);
  assert.deepEqual(global.Pebble.messages[0], { ResponseReset: 1, RequestId: 31 });
  assert.equal(global.Pebble.messages[1].FontSize, 20);
  assert.equal(global.Pebble.messages[2].RequestId, 32);
  assert.equal(global.Pebble.messages[2].ProgressText, 'fresh');
});

test('sendError completes once after reset and error messages are acknowledged', function() {
  var watch = freshWatch({ manualSends: true });
  var completions = [];

  watch.beginRequestLifecycle(37);
  watch.sendError(37, 'model failed', function(error) { completions.push(error); });
  assert.deepEqual(global.Pebble.messages[0], { ResponseReset: 1, RequestId: 37 });
  global.Pebble.flushNextSend();
  assert.equal(global.Pebble.messages[1].ResponseError, 'model failed');
  assert.deepEqual(completions, []);
  global.Pebble.flushNextSend();
  assert.deepEqual(completions, [null]);
});

test('sendError settles once when canceled while error message is in flight', function() {
  var watch = freshWatch({ manualSends: true });
  var completions = [];

  watch.beginRequestLifecycle(38);
  watch.sendError(38, 'model failed', function(error) { completions.push(error); });
  global.Pebble.flushNextSend();
  assert.equal(global.Pebble.messages[1].ResponseError, 'model failed');

  assert.equal(watch.cancelRequestLifecycle(38), true);
  assert.equal(completions.length, 1, 'cancellation settles optional callback immediately');
  assert.ok(completions[0]);
  global.Pebble.flushNextSend();
  assert.equal(completions.length, 1);
  assert.ok(completions[0]);
  assert.deepEqual(global.Pebble.messages.map(function(message) {
    return message.ResponseError || message.ResponseReset;
  }), [1, 'model failed']);
});

test('sendError settles after terminal reset retry failure', function() {
  var timers = installFakeTimers();
  var watch;
  var completions = [];
  var errorWatch;
  var errorCompletions = [];

  try {
    watch = freshWatch({ manualSends: true });
    watch.beginRequestLifecycle(39);
    watch.sendError(39, 'model failed', function(error) { completions.push(error); });

    global.Pebble.flushNextSend({ error: 'first' });
    timers.run(timers.timers.filter(function(timer) { return timer.delay === 100; })[0].id);
    global.Pebble.flushNextSend({ error: 'second' });
    timers.run(timers.timers.filter(function(timer) {
      return timer.delay === 100 && !timer.cleared;
    })[0].id);
    global.Pebble.flushNextSend({ error: 'third' });

    assert.equal(completions.length, 1);
    assert.ok(completions[0]);
    assert.equal(global.Pebble.messages.length, 3, 'reset retries retain existing terminal failure behavior');
    assert.equal(global.Pebble.messages.some(function(message) { return message.ResponseError; }), false);

    errorWatch = freshWatch({ manualSends: true });
    errorWatch.beginRequestLifecycle(40);
    errorWatch.sendError(40, 'model failed', function(error) { errorCompletions.push(error); });
    global.Pebble.flushNextSend();
    global.Pebble.flushNextSend({ error: 'error-one' });
    timers.run(timers.timers.filter(function(timer) {
      return timer.delay === 100 && !timer.cleared;
    })[0].id);
    global.Pebble.flushNextSend({ error: 'error-two' });
    timers.run(timers.timers.filter(function(timer) {
      return timer.delay === 100 && !timer.cleared;
    })[0].id);
    global.Pebble.flushNextSend({ error: 'error-three' });

    assert.equal(errorCompletions.length, 1);
    assert.ok(errorCompletions[0]);
    assert.equal(global.Pebble.messages.filter(function(message) { return message.ResponseError; }).length, 3);
  } finally {
    timers.restore();
  }
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

test('Health Info request handles response and timeout', function() {
  var timers = installFakeTimers();
  var watch = freshWatch();
  var result;

  try {
    watch.beginRequestLifecycle(9);
    watch.requestHealthInfo({ startUnix: 10, endUnix: 20, queryMask: 129, averageScope: 2, sessionOffset: 3 }, 9, function(error, json) {
      result = { error: error, json: json };
    });
    assert.deepEqual(global.Pebble.messages[0], {
      RequestId: 9,
      HealthSummaryRequest: 1,
      HealthStartUnix: 10,
      HealthEndUnix: 20,
      HealthQueryMask: 129,
      HealthAverageScope: 2,
      HealthSessionOffset: 3
    });
    watch.handleHealthInfoResponse({
      RequestId: 9,
      HealthSummaryRequest: 1,
      HealthSummaryJson: '{"stepCount":12}'
    });
    assert.deepEqual(result, { error: null, json: '{"stepCount":12}' });

    result = null;
    watch.requestHealthInfo({ startUnix: 20, endUnix: 30, queryMask: 1 }, 9, function(error) {
      result = error;
    });
    timers.runAll();
    assert.equal(result, 'Health Info request timed out');
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

test('mismatched Health Info RequestId leaves matching pending request active', function() {
  var watch = freshWatch();
  var result;

  watch.beginRequestLifecycle(13);
  watch.requestHealthInfo({ startUnix: 10, endUnix: 20, queryMask: 1 }, 13, function(error, json) {
    result = { error: error, json: json };
  });
  watch.handleHealthInfoResponse({
    RequestId: 99,
    HealthSummaryRequest: 1,
    HealthSummaryJson: '{"wrong":true}'
  });
  assert.equal(result, undefined);
  watch.handleHealthInfoResponse({
    RequestId: 13,
    HealthSummaryRequest: 1,
    HealthSummaryJson: '{"stepCount":5}'
  });
  assert.deepEqual(result, { error: null, json: '{"stepCount":5}' });
});

test('Health Info response error and AppMessage send failure reach callback', function() {
  var timers = installFakeTimers();
  var watch = freshWatch();
  var error;
  try {
    global.Pebble.queueSendFailure({ error: 'no route' });
    global.Pebble.queueSendFailure({ error: 'no route' });
    global.Pebble.queueSendFailure({ error: 'no route' });
    watch.beginRequestLifecycle(14);
    watch.requestHealthInfo({ startUnix: 10, endUnix: 20, queryMask: 1 }, 14, function(value) { error = value; });
    timers.timers.filter(function(timer) { return timer.delay === 100; }).forEach(function(timer) { timers.run(timer.id); });
    timers.timers.filter(function(timer) { return timer.delay === 100; }).forEach(function(timer) { timers.run(timer.id); });
    timers.timers.filter(function(timer) { return timer.delay === 100; }).forEach(function(timer) { timers.run(timer.id); });
    assert.equal(error, 'Health Info send failed: no route');

    watch.requestHealthInfo({ startUnix: 10, endUnix: 20, queryMask: 1 }, 14, function(value) { error = value; });
    watch.handleHealthInfoResponse({ RequestId: 14, HealthSummaryRequest: 2, HealthSummaryError: 'permission denied' });
    assert.equal(error, 'permission denied');
  } finally {
    timers.restore();
  }
});

test('saved transcript transfers multibyte text in byte-safe sequential chunks', function() {
  var watch = freshWatch();
  var content = new Array(301).join('漢') + new Array(51).join('😀');
  var resetMessages;
  var doneMessages;
  var chunks;
  var completions = [];

  watch.sendPastChatTranscript({
    messages: [{ role: 'assistant', content: content }]
  }, {}, function(error) {
    completions.push(error);
  });

  chunks = global.Pebble.messages.filter(function(message) {
    return message.PastChatTextChunk !== undefined;
  });

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(function(message) {
    return Buffer.byteLength(message.PastChatTextChunk, 'utf8') <= 400 &&
      !/[\ud800-\udbff]$/.test(message.PastChatTextChunk) &&
      !/^[\udc00-\udfff]/.test(message.PastChatTextChunk) &&
      message.PastChatTextChunk.indexOf('\uFFFD') === -1;
  }));
  assert.ok(chunks.every(function(message) {
    assert.deepEqual(Object.keys(message), ['PastChatTextChunk']);
    return true;
  }));
  assert.equal(
    chunks.map(function(message) { return message.PastChatTextChunk; }).join(''),
    content
  );

  resetMessages = global.Pebble.messages.filter(function(message) {
    return message.PastChatTextReset !== undefined;
  });
  assert.equal(resetMessages.length, 1);
  assert.deepEqual(global.Pebble.messages[0], { PastChatTextReset: 1 });

  doneMessages = global.Pebble.messages.filter(function(message) {
    return message.PastChatTextDone !== undefined;
  });
  assert.equal(doneMessages.length, 1);
  assert.deepEqual(
    global.Pebble.messages[global.Pebble.messages.length - 1],
    { PastChatTextDone: 1 }
  );

  assert.ok(global.Pebble.messages.every(function(message) {
    return message.RequestId === undefined &&
      message.ResponseChunkIndex === undefined &&
      message.ResponseChunk === undefined &&
      message.ResponseDone === undefined &&
      message.ResponseError === undefined;
  }));

  assert.deepEqual(completions, [undefined]);
});

test('saved transcript emits exact 400-byte chunks ending on emoji boundaries', function() {
  var watch = freshWatch();
  var content = new Array(351).join('😀');
  var chunks;

  watch.sendPastChatTranscript({
    messages: [{ role: 'assistant', content: content }]
  }, {}, function() {});

  chunks = global.Pebble.messages.filter(function(message) {
    return message.PastChatTextChunk !== undefined;
  });

  assert.equal(chunks.length, 4);
  assert.deepEqual(chunks.map(function(message) {
    return Buffer.byteLength(message.PastChatTextChunk, 'utf8');
  }), [400, 400, 400, 200]);
  assert.ok(chunks.every(function(message) {
    return !/[\ud800-\udbff]$/.test(message.PastChatTextChunk) &&
      !/^[\udc00-\udfff]/.test(message.PastChatTextChunk) &&
      message.PastChatTextChunk.indexOf('\uFFFD') === -1;
  }));
  assert.equal(
    chunks.map(function(message) { return message.PastChatTextChunk; }).join(''),
    content
  );
});

test('formatted output exact-fit keeps full text without truncation notice', function() {
  var watch = freshWatch();
  var text = new Array(2401).join('x');

  watch.beginRequestLifecycle(51);
  watch.sendResponse(51, { FontSize: 28 }, text);

  text = global.Pebble.messages.filter(function(message) {
    return message.ResponseChunk !== undefined;
  }).map(function(message) {
    return message.ResponseChunk;
  }).join('');
  assert.equal(text.length, 2400);
  assert.equal(text.indexOf('[Truncated]'), -1);
});

test('selected font budgets include bold, thinking, and Unicode formatting output', function() {
  var watch = freshWatch();
  var cases = [
    { id: 52, fontSize: 28, text: '**' + new Array(1501).join('😀') + '**', limit: 2400 },
    { id: 53, fontSize: 24, text: 'Thinking:\n' + new Array(1700).join('t') + '\n\nAnswer:\n' + new Array(1700).join('a'), limit: 3200 }
  ];
  var i;
  var output;

  for (i = 0; i < cases.length; i += 1) {
    watch = freshWatch();
    watch.beginRequestLifecycle(cases[i].id);
    watch.sendResponse(cases[i].id, { FontSize: cases[i].fontSize }, cases[i].text);
    output = global.Pebble.messages.filter(function(message) {
      return message.ResponseChunk !== undefined;
    }).map(function(message) {
      return message.ResponseChunk;
    }).join('');

    assert.ok(output.length <= cases[i].limit);
    assert.ok(output.length >= cases[i].limit - 1);
    assert.match(output, /\[Truncated\]$/);
    assert.doesNotMatch(output, /[\ud800-\udbff](?![\udc00-\udfff])/);
    assert.doesNotMatch(output, /(?<![\ud800-\udbff])[\udc00-\udfff]/);
  }
});

test('truncation closes bold and thinking styles before plain notice', function() {
  var watch = freshWatch();
  var text = 'Thinking:\n**' + new Array(2601).join('b') + '**\n\nAnswer:\nanswer';
  var output;
  var noticeIndex;

  watch.beginRequestLifecycle(54);
  watch.sendResponse(54, { FontSize: 28 }, text);
  output = global.Pebble.messages.filter(function(message) {
    return message.ResponseChunk !== undefined;
  }).map(function(message) {
    return message.ResponseChunk;
  }).join('');
  noticeIndex = output.indexOf('\n\n[Truncated]');

  assert.equal(output.length, 2400);
  assert.ok(noticeIndex > 0);
  assert.equal(output.substring(0, noticeIndex).split('\u0001').length - 1,
    output.substring(0, noticeIndex).split('\u0002').length - 1);
  assert.equal(output.substring(0, noticeIndex).split('\u0005').length - 1,
    output.substring(0, noticeIndex).split('\u0006').length - 1);
  assert.equal(output.substring(noticeIndex).indexOf('\u0001'), -1);
  assert.equal(output.substring(noticeIndex).indexOf('\u0005'), -1);
});

test('response and saved transcript strip raw watch markers but preserve generated formatting', function() {
  var watch = freshWatch();
  var markers = '\u0001\u0002\u0003\u0004\u0005\u0006';
  var response;
  var transcript;

  watch.beginRequestLifecycle(55);
  watch.sendResponse(55, { FontSize: 18 }, 'before' + markers + '**bold**after');
  response = global.Pebble.messages.filter(function(message) {
    return message.ResponseChunk !== undefined;
  }).map(function(message) {
    return message.ResponseChunk;
  }).join('');
  assert.equal(response, 'before\u0001bold\u0002after');

  watch = freshWatch();
  watch.sendPastChatTranscript({ messages: [
    { role: 'user', content: markers + '**prompt**' + markers },
    { role: 'assistant', content: markers + 'Thinking:\n**thought**\n\nAnswer:\nanswer' + markers }
  ] }, {}, function() {});
  transcript = global.Pebble.messages.filter(function(message) {
    return message.PastChatTextChunk !== undefined;
  }).map(function(message) {
    return message.PastChatTextChunk;
  }).join('');

  assert.equal(transcript.indexOf(markers), -1);
  assert.ok(transcript.indexOf('\u0003\u0001prompt\u0002\u0004') !== -1);
  assert.ok(transcript.indexOf('\u0005Thinking:\n\u0001thought\u0002\u0006\n\nAnswer:\nanswer') !== -1);
});

test('truncation at emoji boundary preserves whole code point before plain notice', function() {
  var watch = freshWatch();
  var text = new Array(2386).join('x') + '😀' + new Array(20).join('z');
  var output;

  watch.beginRequestLifecycle(56);
  watch.sendResponse(56, { FontSize: 28 }, text);
  output = global.Pebble.messages.filter(function(message) {
    return message.ResponseChunk !== undefined;
  }).map(function(message) {
    return message.ResponseChunk;
  }).join('');

  assert.equal(output.length, 2400);
  assert.ok(output.indexOf('😀\n\n[Truncated]') !== -1);
  assert.doesNotMatch(output, /[\ud800-\udbff](?![\udc00-\udfff])/);
  assert.doesNotMatch(output, /(?<![\ud800-\udbff])[\udc00-\udfff]/);
});

test('saved transcript skips unsupported and empty messages without false truncation', function() {
  var watch = freshWatch();
  var transcript;

  watch.sendPastChatTranscript({ messages: [
    { role: 'system', content: new Array(7001).join('x') },
    { role: 'user', content: '\u0001\u0002\u0003\u0004\u0005\u0006' },
    { role: 'assistant', content: '' },
    { role: 'assistant', content: 'answer' }
  ] }, { FontSize: 28 }, function() {});
  transcript = global.Pebble.messages.filter(function(message) {
    return message.PastChatTextChunk !== undefined;
  }).map(function(message) {
    return message.PastChatTextChunk;
  }).join('');

  assert.equal(transcript, 'answer');
});

test('oversized final saved prompt and assistant both report truncation', function() {
  var watch = freshWatch();
  var chats = [
    { messages: [{ role: 'assistant', content: 'earlier' }, { role: 'user', content: '**' + new Array(7001).join('p') + '**' }] },
    { messages: [{ role: 'user', content: 'earlier' }, { role: 'assistant', content: new Array(7001).join('a') }] }
  ];
  var i;
  var transcript;

  for (i = 0; i < chats.length; i += 1) {
    watch = freshWatch();
    watch.sendPastChatTranscript(chats[i], { FontSize: 18 }, function() {});
    transcript = global.Pebble.messages.filter(function(message) {
      return message.PastChatTextChunk !== undefined;
    }).map(function(message) {
      return message.PastChatTextChunk;
    }).join('');
    assert.equal(transcript.length, 6000);
    assert.match(transcript, /\[Truncated\]$/);
    assert.equal(transcript.substring(transcript.indexOf('\n\n[Truncated]') - (i === 0 ? 2 : 1),
      transcript.indexOf('\n\n[Truncated]')),
      i === 0 ? '\u0002\u0004' : 'a');
  }
});
