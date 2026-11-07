'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var packageJson = require('../../package.json');

test('plugin consumer declares required permissions and persisted message key', function() {
  assert.deepEqual(packageJson.pebble.usesPermissions, [
    'Internet',
    'LocalNetwork',
    'Location',
    'Timeline',
    'Health',
    'ShowNotifications'
  ]);
  assert.equal(packageJson.pebble.messageKeys[packageJson.pebble.messageKeys.length - 1], 'PluginSourcesJson');
});
