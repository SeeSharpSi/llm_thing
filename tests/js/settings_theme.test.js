'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var theme = require('../../src/pkjs/settings_theme');
var modelComponent = require('../../src/pkjs/model_selector_component');

test('exports shared settings theme CSS', function() {
  assert.equal(typeof theme, 'string');
  assert.ok(theme.length > 0);
  assert.match(theme, /#main-form/);
  assert.match(theme, /\.section/);
  assert.match(theme, /\.component-submit/);
  assert.match(theme, /@media\s*\(max-width:\s*34rem\)/);
});

test('model component includes shared theme before local styles', function() {
  assert.ok(modelComponent.style.indexOf(theme) === 0);
});
