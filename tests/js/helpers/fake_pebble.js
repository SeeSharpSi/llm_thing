'use strict';

function createFakePebble(options) {
  options = options || {};

  var listeners = {};
  var messages = [];
  var pendingSends = [];
  var outcomes = [];

  function settle(send, outcome) {
    if (outcome && outcome.error) {
      if (send.failure) {
        send.failure(outcome.error);
      }
      return;
    }
    if (send.success) {
      send.success();
    }
  }

  var pebble = {
    listeners: listeners,
    messages: messages,
    openedUrls: [],
    addEventListener: function(name, callback) {
      if (!listeners[name]) {
        listeners[name] = [];
      }
      listeners[name].push(callback);
    },
    removeEventListener: function(name, callback) {
      if (!listeners[name]) {
        return;
      }
      listeners[name] = listeners[name].filter(function(candidate) {
        return candidate !== callback;
      });
    },
    emit: function(name, event) {
      (listeners[name] || []).slice().forEach(function(callback) {
        callback(event || {});
      });
    },
    openURL: function(url) {
      pebble.openedUrls.push(url);
    },
    sendAppMessage: function(dict, success, failure) {
      var send = { dict: dict, success: success, failure: failure };
      messages.push(dict);
      if (options.manualSends) {
        pendingSends.push(send);
        return;
      }
      settle(send, outcomes.length ? outcomes.shift() : null);
    },
    queueSendFailure: function(error) {
      outcomes.push({ error: error || { error: 'failed' } });
    },
    flushNextSend: function(error) {
      var send = pendingSends.shift();
      if (!send) {
        throw new Error('No pending AppMessage');
      }
      settle(send, error ? { error: error } : null);
    },
    pendingSendCount: function() {
      return pendingSends.length;
    },
    getTimelineToken: function(callback) {
      callback(options.timelineToken || 'timeline-token');
    },
    getActiveWatchInfo: function() {
      return options.watchInfo || { platform: 'emery', model: 'emery' };
    },
    getAccountToken: function() {
      return 'account-token';
    },
    getWatchToken: function() {
      return 'watch-token';
    }
  };

  return pebble;
}

module.exports = createFakePebble;
