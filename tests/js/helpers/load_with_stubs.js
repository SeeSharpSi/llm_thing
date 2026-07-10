'use strict';

var Module = require('node:module');

function clearModule(modulePath) {
  var resolved = require.resolve(modulePath);
  delete require.cache[resolved];
  return resolved;
}

function loadWithStubs(modulePath, stubs) {
  var resolved = clearModule(modulePath);
  var originalLoad = Module._load;

  Module._load = function(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(stubs || {}, request)) {
      return stubs[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(resolved);
  } finally {
    Module._load = originalLoad;
  }
}

module.exports = {
  clearModule: clearModule,
  loadWithStubs: loadWithStubs
};
