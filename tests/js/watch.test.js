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

function approvalSpec(args) {
  return { plugin: 'abcdefab-cdef-abcd-efab-cdefabcdefab', pluginName: 'Fixture', action: 'setMode', args: args || { mode: 'on' } };
}

test('action approval sends scoped prompt and accepts only matching numeric decision once', function() {
  var watch = freshWatch();
  var callbackValues = [];
  watch.beginRequestLifecycle(501);
  watch.requestActionApproval(approvalSpec(), 501, function(error, approved) { callbackValues.push([error, approved]); });
  var prompt = global.Pebble.messages[0];
  assert.equal(prompt.RequestId, 501);
  assert.equal(prompt.ApprovalRequest, 1);
  assert.ok(prompt.ApprovalId > 0);
  assert.equal(prompt.ApprovalTitle, 'Confirm action');
  assert.ok(prompt.ApprovalDetail.indexOf('Plugin:') < prompt.ApprovalDetail.indexOf('Action:'));
  assert.ok(prompt.ApprovalDetail.indexOf('Action:') < prompt.ApprovalDetail.indexOf('Arguments:'));
  assert.ok(prompt.ApprovalDetail.indexOf('Arguments:') < prompt.ApprovalDetail.indexOf('Plugin UUID:'));
  assert.match(prompt.ApprovalDetail, /Plugin UUID:/);
  assert.match(prompt.ApprovalDetail, /Plugin: Fixture\nAction: setMode\nArguments:\nmode: on\n/);
  assert.equal(prompt.ApprovalDetail.indexOf('{"mode":"on"}'), -1, 'raw JSON arguments are not shown');
  assert.equal(watch.handleActionApprovalResponse({ ApprovalId: prompt.ApprovalId, ApprovalDecision: 1 }), false, 'missing RequestId rejected');
  assert.equal(watch.handleActionApprovalResponse({ RequestId: 501, ApprovalId: prompt.ApprovalId, ApprovalDecision: '1' }), false, 'string allow rejected');
  assert.equal(watch.handleActionApprovalResponse({ RequestId: 501, ApprovalId: prompt.ApprovalId + 1, ApprovalDecision: 1 }), false, 'mismatched ID rejected');
  assert.equal(watch.handleActionApprovalResponse({ RequestId: 500, ApprovalId: prompt.ApprovalId, ApprovalDecision: 1 }), false, 'stale request rejected');
  [-1, 1.5, '501', 4294967296].forEach(function(requestId) {
    assert.equal(watch.handleActionApprovalResponse({ RequestId: requestId, ApprovalId: prompt.ApprovalId, ApprovalDecision: 1 }), false,
      'invalid RequestId rejected: ' + requestId);
  });
  assert.equal(callbackValues.length, 0);
  assert.equal(watch.handleActionApprovalResponse({ RequestId: 501, ApprovalId: prompt.ApprovalId, ApprovalDecision: 1 }), true);
  assert.deepEqual(callbackValues, [[null, true]]);
  assert.equal(watch.handleActionApprovalResponse({ RequestId: 501, ApprovalId: prompt.ApprovalId, ApprovalDecision: 0 }), false, 'duplicate response ignored');
  assert.equal(callbackValues.length, 1);
  assert.ok(global.Pebble.messages.some(function(message) { return message.ApprovalCancel === 1 && message.ApprovalId === prompt.ApprovalId; }));
  [-1, 1.5, '501', 4294967296].forEach(function(requestId) {
    var count = global.Pebble.messages.filter(function(message) { return message.ApprovalRequest === 1; }).length;
    var error;
    watch.requestActionApproval(approvalSpec(), requestId, function(value) { error = value; });
    assert.match(error, /stale; action was not run/);
    assert.equal(global.Pebble.messages.filter(function(message) { return message.ApprovalRequest === 1; }).length, count);
  });
});

test('approval detail formats arguments as safe key value lines', function() {
  var watch = freshWatch();
  var values = [];
  watch.beginRequestLifecycle(511);
  watch.requestActionApproval({
    plugin: 'abcdefab-cdef-abcd-efab-cdefabcdefab',
    pluginName: 'Calendar',
    action: 'create_event',
    args: {
      title: 'Lunch',
      starts_at: '2026-11-10T12:00:00Z',
      all_day: false,
      reminder_minutes: 15,
      options: { calendar: 'work', notify: true },
      tags: ['meal', 'work'],
      note: 'line\nbreak\u202e',
      optional: null
    }
  }, 511, function() {});
  values.push(global.Pebble.messages[0].ApprovalDetail);
  assert.match(values[0], /Arguments:\ntitle: Lunch\nstarts_at: 2026-11-10T12:00:00Z\nall_day: false\nreminder_minutes: 15\n/);
  assert.match(values[0], /options: \{"calendar":"work","notify":true\}\n/);
  assert.match(values[0], /tags: \["meal","work"\]\n/);
  assert.match(values[0], /note: line\\nbreak\\u202e\n/);
  assert.match(values[0], /optional: null\n/);
  assert.equal(values[0].indexOf('{"title"'), -1, 'top-level arguments are not raw JSON');
  watch.handleActionApprovalResponse({ RequestId: 511, ApprovalId: global.Pebble.messages[0].ApprovalId, ApprovalDecision: 0 });

  watch.requestActionApproval({ plugin: 'abcdefab-cdef-abcd-efab-cdefabcdefab', pluginName: 'Calendar', action: 'list_events', args: {} }, 511, function() {});
  values.push(global.Pebble.messages.filter(function(message) { return message.ApprovalRequest === 1; }).slice(-1)[0].ApprovalDetail);
  assert.match(values[1], /Arguments:\n\(none\)\n\nPlugin UUID:/);
  watch.handleActionApprovalResponse({ RequestId: 511, ApprovalId: global.Pebble.messages.filter(function(message) { return message.ApprovalRequest === 1; }).slice(-1)[0].ApprovalId, ApprovalDecision: 0 });
  watch.finishRequestLifecycle(511);
});

test('approval denial, timeout, send exhaustion, and lifecycle cancellation settle fail closed', function() {
  var timers = installFakeTimers();
  var originalLog = console.log;
  try {
    var watch = freshWatch();
    var prompt;
    var result;
    watch.beginRequestLifecycle(502);
    watch.requestActionApproval(approvalSpec(), 502, function(error, approved) { result = [error, approved]; });
    prompt = global.Pebble.messages[0];
    watch.handleActionApprovalResponse({ RequestId: 502, ApprovalId: prompt.ApprovalId, ApprovalDecision: 0 });
    assert.deepEqual(result, [null, false]);

    watch.requestActionApproval(approvalSpec(), 502, function(error, approved) { result = [error, approved]; });
    prompt = global.Pebble.messages.filter(function(message) { return message.ApprovalRequest === 1; })[1];
    var approvalTimer = timers.timers.filter(function(timer) { return timer.delay === 60000 && !timer.cleared; })[0];
    timers.run(approvalTimer.id);
    assert.match(result[0], /timed out; action was not run/);
    assert.equal(result[1], false);
    assert.equal(watch.handleActionApprovalResponse({ RequestId: 502, ApprovalId: prompt.ApprovalId, ApprovalDecision: 1 }), false);

    var pebble = global.Pebble;
    pebble.queueSendFailure({ error: 'secret ApprovalDetail sensitive-argument' });
    pebble.queueSendFailure({ error: 'secret ApprovalDetail sensitive-argument' });
    pebble.queueSendFailure({ error: 'secret ApprovalDetail sensitive-argument' });
    var logs = [];
    console.log = function(message) { logs.push(String(message)); };
    watch.requestActionApproval(approvalSpec({ value: 'sensitive-argument' }), 502, function(error, approved) { result = [error, approved]; });
    timers.run(timers.timers.filter(function(timer) { return timer.delay === 100 && !timer.cleared; })[0].id);
    timers.run(timers.timers.filter(function(timer) { return timer.delay === 100 && !timer.cleared; })[0].id);
    console.log = originalLog;
    assert.match(result[0], /Could not send watch confirmation; action was not run/);
    assert.equal(result[1], false);
    assert.doesNotMatch(logs.join('\n'), /ApprovalDetail|sensitive-argument/);

    var callbackCount = 0;
    watch.requestActionApproval(approvalSpec(), 502, function() { callbackCount += 1; });
    prompt = global.Pebble.messages.filter(function(message) { return message.ApprovalRequest === 1; }).slice(-1)[0];
    watch.cancelRequestLifecycle(502);
    assert.equal(callbackCount, 0, 'lifecycle cancel suppresses callback');
    assert.equal(watch.handleActionApprovalResponse({ RequestId: 502, ApprovalId: prompt.ApprovalId, ApprovalDecision: 1 }), false, 'late allow ignored');
  } finally { console.log = originalLog; timers.restore(); }
});

test('approval detail enforces exact UTF-8 byte limit and escapes display controls without changing input', function() {
  var watch = freshWatch();
  watch.beginRequestLifecycle(503);
  var prefix = 'Plugin: Fixture\nAction: setMode\nArguments:\n';
  var suffix = '\n\nPlugin UUID: abcdefab-cdef-abcd-efab-cdefabcdefab';
  var valueLength = 600 - prefix.length - 'x: '.length - suffix.length;
  var result;
  watch.requestActionApproval(approvalSpec({ x: new Array(valueLength + 1).join('x') }), 503, function(error, approved) { result = [error, approved]; });
  assert.equal(global.Pebble.messages[0].ApprovalDetail.length, 600, '600-byte ASCII detail accepted');
  var firstPrompt = global.Pebble.messages[0];
  assert.match(firstPrompt.ApprovalDetail, /Arguments:\nx: x+/);
  assert.ok(firstPrompt.ApprovalDetail.indexOf('Arguments:') < firstPrompt.ApprovalDetail.indexOf('Plugin UUID:'));
  watch.handleActionApprovalResponse({ RequestId: 503, ApprovalId: firstPrompt.ApprovalId, ApprovalDecision: 0 });
  var tooLong = { plugin: 'abcdefab-cdef-abcd-efab-cdefabcdefab', pluginName: 'Fixture', action: 'setMode', args: { x: new Array(valueLength + 2).join('x') } };
  watch.requestActionApproval(tooLong, 503, function(error, approved) { result = [error, approved]; });
  assert.match(result[0], /shorten arguments/);
  assert.equal(global.Pebble.messages.filter(function(message) { return message.ApprovalRequest === 1; }).length, 1);
  watch.requestActionApproval(approvalSpec({ x: new Array(141).join('\ud83d\ude00') }), 503, function(error) { result = [error, false]; });
  assert.match(result[0], /shorten arguments/, 'multibyte arguments counted by UTF-8 bytes');
  assert.equal(global.Pebble.messages.filter(function(message) { return message.ApprovalRequest === 1; }).length, 1);

  var quotedValue = new Array(20).join('"') + new Array(181).join('\\');
  var quoteDetail = function(value) {
    return prefix + 'x: ' + value + suffix;
  };
  while (quoteDetail(quotedValue).length < 600) { quotedValue += 'x'; }
  assert.equal(quoteDetail(quotedValue).length, 600);
  watch.requestActionApproval(approvalSpec({ x: quotedValue }), 503, function(error) { result = [error, false]; });
  var quotedPrompt = global.Pebble.messages.filter(function(message) { return message.ApprovalRequest === 1; }).slice(-1)[0];
  assert.ok(quotedPrompt, '600-byte detail with quotes and backslashes accepted');
  assert.ok(JSON.stringify(quotedPrompt).length > quotedPrompt.ApprovalDetail.length + 150, 'JSON envelope expansion is bounded separately');
  assert.ok(quotedPrompt.ApprovalDetail.indexOf('x: ' + quotedValue) !== -1, 'full quoted argument represented');
  watch.handleActionApprovalResponse({ RequestId: 503, ApprovalId: quotedPrompt.ApprovalId, ApprovalDecision: 0 });

  var hostileName = 'name\u202e\u0001\ud800';
  var hostileArgs = { value: '\u2066hidden\u2069\udc00\u0085\u2028' };
  watch.requestActionApproval({ plugin: 'abcdefab-cdef-abcd-efab-cdefabcdefab', pluginName: hostileName, action: 'setMode', args: hostileArgs }, 503, function() {});
  var escaped = global.Pebble.messages.filter(function(message) { return message.ApprovalRequest === 1; }).slice(-1)[0].ApprovalDetail;
  assert.match(escaped, /\\u202e/);
  assert.match(escaped, /\\u0001/);
  assert.match(escaped, /\\ud800/);
  assert.match(escaped, /\\u2066/);
  assert.match(escaped, /\\udc00/);
  assert.match(escaped, /\\u0085/);
  assert.match(escaped, /\\u2028/);
  assert.equal(hostileArgs.value, '\u2066hidden\u2069\udc00\u0085\u2028', 'display escaping does not mutate original arguments');
  watch.finishRequestLifecycle(503);
});

test('expired queued approval is removed before it can reach watch', function() {
  var timers = installFakeTimers();
  try {
    var watch = freshWatch({ manualSends: true });
    var callbackError;
    watch.beginRequestLifecycle(504);
    watch.sendMessage({ RequestId: 504, Hold: 1 });
    watch.requestActionApproval(approvalSpec(), 504, function(error) { callbackError = error; });
    timers.run(timers.timers.filter(function(timer) { return timer.delay === 60000; })[0].id);
    assert.match(callbackError, /timed out/);
    global.Pebble.flushNextSend();
    assert.equal(global.Pebble.messages.some(function(message) { return message.ApprovalRequest === 1; }), false);
  } finally { timers.restore(); }
});

test('synchronous approval transport throws retry three times and clear timeout', function() {
  var timers = installFakeTimers();
  try {
    var watch = freshWatch();
    var pebble = global.Pebble;
    var attempts = 0;
    var result;
    watch.beginRequestLifecycle(505);
    pebble.sendAppMessage = function(dict, success) {
      if (dict.ApprovalRequest === 1) {
        attempts += 1;
        throw new Error('sensitive transport error');
      }
      success();
    };
    watch.requestActionApproval(approvalSpec(), 505, function(error, approved) { result = [error, approved]; });
    timers.run(timers.timers.filter(function(timer) { return timer.delay === 100 && !timer.cleared; })[0].id);
    timers.run(timers.timers.filter(function(timer) { return timer.delay === 100 && !timer.cleared; })[0].id);
    assert.equal(attempts, 3);
    assert.match(result[0], /Could not send watch confirmation/);
    assert.equal(result[1], false);
    assert.equal(timers.timers.some(function(timer) { return timer.delay === 60000 && !timer.cleared; }), false);
  } finally { timers.restore(); }
});

test('new-request and finish lifecycle clear approvals, timers, and late responses', function() {
  var timers = installFakeTimers();
  try {
    var watch = freshWatch();
    var resultCount = 0;
    watch.beginRequestLifecycle(506);
    watch.requestActionApproval(approvalSpec(), 506, function() { resultCount += 1; });
    var first = global.Pebble.messages.filter(function(message) { return message.ApprovalRequest === 1; })[0];
    var firstTimer = timers.timers.filter(function(timer) { return timer.delay === 60000 && !timer.cleared; })[0];
    watch.beginRequestLifecycle(507);
    assert.equal(firstTimer.cleared, true);
    assert.equal(resultCount, 0);
    assert.equal(watch.handleActionApprovalResponse({ RequestId: 506, ApprovalId: first.ApprovalId, ApprovalDecision: 1 }), false);

    watch.requestActionApproval(approvalSpec(), 507, function() { resultCount += 1; });
    var second = global.Pebble.messages.filter(function(message) { return message.ApprovalRequest === 1; })[1];
    var secondTimer = timers.timers.filter(function(timer) { return timer.delay === 60000 && !timer.cleared; })[0];
    watch.finishRequestLifecycle(507);
    assert.equal(secondTimer.cleared, true);
    assert.equal(resultCount, 0);
    assert.equal(watch.handleActionApprovalResponse({ RequestId: 507, ApprovalId: second.ApprovalId, ApprovalDecision: 1 }), false);
  } finally { timers.restore(); }
});

test('generated approval IDs wrap within positive 31-bit range', function() {
  var originalNow = Date.now;
  Date.now = function() { return 2147483646; };
  var watch;
  try { watch = freshWatch(); } finally { Date.now = originalNow; }
  watch.beginRequestLifecycle(508);
  watch.requestActionApproval(approvalSpec(), 508, function() {});
  var first = global.Pebble.messages.filter(function(message) { return message.ApprovalRequest === 1; })[0];
  assert.equal(first.ApprovalId, 2147483647);
  watch.handleActionApprovalResponse({ RequestId: 508, ApprovalId: first.ApprovalId, ApprovalDecision: 0 });
  watch.requestActionApproval(approvalSpec(), 508, function() {});
  var second = global.Pebble.messages.filter(function(message) { return message.ApprovalRequest === 1; })[1];
  assert.equal(second.ApprovalId, 1);
  watch.finishRequestLifecycle(508);
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
  }, true);

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

test('syncWatchSettings skips semantically unchanged settings and sends changed settings', function() {
  var watch = freshWatch();
  var settings = {
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
  };

  watch.syncWatchSettings(settings, true);
  assert.equal(watch.syncWatchSettings({
    FontSize: '24',
    BuzzStrength: '2',
    SpeakerFeedbackEnabled: 1,
    ScrollLines: '4',
    TouchScrollEnabled: 1,
    ShowInputContextSize: 0,
    ShowOutputContextSize: 1,
    PreserveChats: 1,
    StartDictationQuickLaunch: 0,
    TextColor: '1',
    BackgroundColor: '2',
    PromptBackgroundColor: '3',
    BoldTextColor: '4'
  }), false);
  assert.equal(global.Pebble.messages.length, 1, 'normalized equivalent save does not transmit');

  settings.FontSize = 28;
  assert.equal(watch.syncWatchSettings(settings), true);
  assert.equal(global.Pebble.messages.length, 2);
  assert.equal(global.Pebble.messages[1].FontSize, 28);

  assert.equal(watch.syncWatchSettings(settings, true), true, 'startup force resends full snapshot for a new watch session');
  assert.equal(global.Pebble.messages.length, 3);
  assert.deepEqual(global.Pebble.messages[2], global.Pebble.messages[1]);
});

test('failed watch settings send does not cache snapshot and later save retries it', function() {
  var timers = installFakeTimers();
  var watch;
  var settings = { FontSize: 24 };

  try {
    watch = freshWatch();
    global.Pebble.queueSendFailure({ error: 'one' });
    global.Pebble.queueSendFailure({ error: 'two' });
    global.Pebble.queueSendFailure({ error: 'three' });
    watch.syncWatchSettings(settings, true);
    timers.runAll();
    timers.runAll();

    assert.equal(global.Pebble.messages.length, 3, 'initial send exhausts existing retries');
    assert.equal(watch.syncWatchSettings(settings), true);
    assert.equal(global.Pebble.messages.length, 4, 'failed snapshot is eligible for next save retry');
    assert.equal(watch.syncWatchSettings(settings), false, 'successful retry is deduplicated');
    assert.equal(global.Pebble.messages.length, 4);
  } finally {
    timers.restore();
  }
});

test('failed changed settings invalidate prior acknowledgement confidence', function() {
  var timers = installFakeTimers();
  var watch;
  var settingsA = { FontSize: 24 };

  try {
    watch = freshWatch();
    watch.syncWatchSettings(settingsA, true);
    global.Pebble.queueSendFailure({ error: 'one' });
    global.Pebble.queueSendFailure({ error: 'two' });
    global.Pebble.queueSendFailure({ error: 'three' });
    watch.syncWatchSettings({ FontSize: 28 });
    timers.runAll();
    timers.runAll();

    assert.equal(global.Pebble.messages.length, 4, 'changed snapshot exhausts bounded retries');
    assert.equal(watch.syncWatchSettings(settingsA), true, 'return to old ACK state is resent after ambiguous failure');
    assert.equal(global.Pebble.messages.length, 5);
    assert.equal(global.Pebble.messages[4].FontSize, 24);
  } finally {
    timers.restore();
  }
});

test('forced startup sync queues another full snapshot for a reconnect during an in-flight send', function() {
  var watch = freshWatch({ manualSends: true });
  var settings = { FontSize: 24 };

  watch.syncWatchSettings(settings, true);
  watch.syncWatchSettings(settings, true);
  watch.syncWatchSettings({ FontSize: '24' });
  assert.equal(global.Pebble.messages.length, 1);
  global.Pebble.flushNextSend();
  assert.equal(global.Pebble.messages.length, 2);
  assert.deepEqual(global.Pebble.messages[1], global.Pebble.messages[0]);
  global.Pebble.flushNextSend();
  assert.equal(global.Pebble.pendingSendCount(), 0);
});

test('normal sync updates forced pending snapshot without dropping force intent', function() {
  var watch = freshWatch({ manualSends: true });

  watch.syncWatchSettings({ FontSize: 24 }, true);
  watch.syncWatchSettings({ FontSize: 28 }, true);
  watch.syncWatchSettings({ FontSize: '24' });
  global.Pebble.flushNextSend();

  assert.equal(global.Pebble.messages.length, 2);
  assert.equal(global.Pebble.messages[1].FontSize, 24, 'latest normalized desired state replaces differing queued snapshot');
  global.Pebble.flushNextSend();
  assert.equal(global.Pebble.pendingSendCount(), 0);
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

test('begin new request drains retained ID-less queue after pruning stale retry head', function() {
  var timers = installFakeTimers();
  var watch;
  var failureCount = 0;

  try {
    watch = freshWatch({ manualSends: true });
    watch.beginRequestLifecycle(42);
    watch.sendMessage({ RequestId: 42, ProgressText: 'retry me' }, null, function() {
      failureCount += 1;
    });
    global.Pebble.flushNextSend({ error: 'temporary failure' });
    assert.equal(timers.timers.filter(function(timer) {
      return timer.delay === 100 && !timer.cleared;
    }).length, 1);

    watch.syncWatchSettings({ FontSize: 18 });
    assert.equal(global.Pebble.messages.length, 1, 'retry delay blocks queued settings until next request lifecycle');
    assert.equal(global.Pebble.pendingSendCount(), 0);

    watch.beginRequestLifecycle(43);

    assert.equal(failureCount, 1);
    assert.equal(timers.timers.filter(function(timer) { return timer.delay === 100; })[0].cleared, true);
    assert.equal(global.Pebble.pendingSendCount(), 1, 'ID-less settings drains immediately without an extra enqueue');
    assert.equal(global.Pebble.messages.length, 2);
    assert.equal(global.Pebble.messages[1].FontSize, 18);

    global.Pebble.flushNextSend();
    assert.equal(global.Pebble.pendingSendCount(), 0, 'retained settings send drains without another trigger');
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
  watch.syncWatchSettings({ FontSize: 24 });
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
  assert.equal(global.Pebble.messages[1].FontSize, 24);
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

test('sendError carries retry eligibility with terminal error', function() {
  var watch = freshWatch();

  watch.beginRequestLifecycle(41);
  watch.sendError(41, 'safe to retry', null, true);

  assert.deepEqual(global.Pebble.messages, [
    { ResponseReset: 1, RequestId: 41 },
    { ResponseError: 'safe to retry', RetryAvailable: 1, RequestId: 41 }
  ]);
});

test('progress messages track tools, history, and context for current request', function() {
  var watch = freshWatch();

  watch.beginRequestLifecycle(5);
  watch.progressStart(5, 'thinking', 'start');
  watch.progressToolStart(5, 'Running Search: Lookup', 'query', null, 'MCP Search');
  watch.progressDone(5);
  watch.progressToolStart(5, 'Running Search: Lookup', 'second query', null, 'MCP Search');
  watch.progressDone(5);
  watch.progressSetContextSizes(5, '100', '20');
  watch.progressSet(4, 'stale', 'ignored');

  assert.equal(global.Pebble.messages[0].ProgressReset, 1);
  assert.equal(global.Pebble.messages[global.Pebble.messages.length - 1].ProgressText, 'Running Search: Lookup');
  assert.equal(global.Pebble.messages[global.Pebble.messages.length - 1].ProgressHistory, 'MCP Search 2x');
  assert.equal(global.Pebble.messages[global.Pebble.messages.length - 1].ProgressInputContextSize, '100');
  assert.equal(global.Pebble.messages.some(function(message) { return message.ProgressText === 'stale'; }), false);
});

test('identified overlapping tool progress counts each completion and retains active detail', function() {
  var watch = freshWatch();
  var latest;

  watch.beginRequestLifecycle(50);
  watch.progressStart(50, 'thinking', 'start');
  watch.progressToolStart(50, 'Running Web Fetch', 'url: first', 'fetch-call-1', 'Web Fetch');
  watch.progressToolStart(50, 'Running Web Fetch', 'url: second', 'fetch-call-2', 'Web Fetch');

  watch.progressDone(50, 'Web Fetch', '12 chars', 'fetch-call-2');
  latest = global.Pebble.messages[global.Pebble.messages.length - 1];
  assert.equal(latest.ProgressHistory, 'Web Fetch');
  assert.equal(latest.ProgressText, 'Running Web Fetch');
  assert.match(latest.ProgressDetail, /first/);
  assert.doesNotMatch(latest.ProgressDetail, /12 chars/);

  watch.progressDone(50, 'Web Fetch', '12 chars', 'fetch-call-2');
  watch.progressDone(50, 'Web Fetch', '10 chars', 'fetch-call-1');
  watch.progressDone(50);

  latest = global.Pebble.messages[global.Pebble.messages.length - 1];
  assert.equal(latest.ProgressHistory, 'Web Fetch 2x');
  assert.equal(latest.ProgressText, 'Running Web Fetch');
  assert.match(latest.ProgressDetail, /first/);
});

test('progress keeps active title and history label separate and sanitizes control characters', function() {
  var watch = freshWatch();
  var latest;

  watch.beginRequestLifecycle(60);
  watch.progressStart(60, 'thinking', 'start');
  watch.progressToolStart(60, 'Running Bad\nTool', 'key: value', 'call-1', 'Hist\rLabel');
  latest = global.Pebble.messages[global.Pebble.messages.length - 1];
  assert.equal(latest.ProgressText, 'Running Bad Tool');
  assert.equal(latest.ProgressDetail, 'key: value');

  watch.progressDone(60, 'Running Bad Tool', '4 chars', 'call-1');
  latest = global.Pebble.messages[global.Pebble.messages.length - 1];
  assert.equal(latest.ProgressHistory, 'Hist Label');
});

test('progress history labels stay independent when switching identified and legacy tool runs', function() {
  var watch = freshWatch();
  var latest;

  watch.beginRequestLifecycle(61);
  watch.progressStart(61, 'thinking', 'start');
  watch.progressToolStart(61, 'Running Legacy', 'first', null, 'Legacy One');
  watch.progressDone(61);
  watch.progressToolStart(61, 'Running Identified', 'second', 'call-1', 'Identified One');
  watch.progressDone(61, 'Running Identified', 'ok', 'call-1');
  watch.progressToolStart(61, 'Running Legacy Again', 'third', null, 'Legacy Two');
  watch.progressDone(61);
  watch.progressSetContextSizes(61, '1', '2');

  latest = global.Pebble.messages[global.Pebble.messages.length - 1];
  assert.equal(latest.ProgressText, 'Running Legacy Again');
  assert.equal(latest.ProgressHistory, 'Legacy One\nIdentified One\nLegacy Two');
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
