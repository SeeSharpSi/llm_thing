'use strict';

function FakeLocalStorage(initial) {
  this.values = {};
  this.failWrites = 0;
  this.failRemoves = 0;

  Object.keys(initial || {}).forEach(function(key) {
    this.values[key] = String(initial[key]);
  }, this);
}

FakeLocalStorage.prototype.getItem = function(key) {
  return Object.prototype.hasOwnProperty.call(this.values, key) ? this.values[key] : null;
};

FakeLocalStorage.prototype.setItem = function(key, value) {
  if (this.failWrites > 0) {
    this.failWrites -= 1;
    throw new Error('Quota exceeded');
  }
  this.values[key] = String(value);
};

FakeLocalStorage.prototype.removeItem = function(key) {
  if (this.failRemoves > 0) {
    this.failRemoves -= 1;
    throw new Error('Remove failed');
  }
  delete this.values[key];
};

FakeLocalStorage.prototype.clear = function() {
  this.values = {};
};

module.exports = FakeLocalStorage;
