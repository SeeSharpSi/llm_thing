'use strict';

function installFakeTimers() {
  var originalSetTimeout = global.setTimeout;
  var originalClearTimeout = global.clearTimeout;
  var timers = [];
  var nextId = 1;

  global.setTimeout = function(callback, delay) {
    var timer = { id: nextId, callback: callback, delay: delay, cleared: false };
    nextId += 1;
    timers.push(timer);
    return timer.id;
  };

  global.clearTimeout = function(id) {
    timers.forEach(function(timer) {
      if (timer.id === id) {
        timer.cleared = true;
      }
    });
  };

  return {
    timers: timers,
    run: function(id) {
      var timer = timers.filter(function(candidate) { return candidate.id === id; })[0];
      if (timer && !timer.cleared) {
        timer.cleared = true;
        timer.callback();
      }
    },
    runAll: function() {
      timers.slice().forEach(function(timer) {
        if (!timer.cleared) {
          timer.cleared = true;
          timer.callback();
        }
      });
    },
    restore: function() {
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
    }
  };
}

module.exports = installFakeTimers;
