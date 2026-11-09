'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var packageJson = require('../../package.json');

test('plugin consumer declares required permissions and persisted message key', function() {
  var messageKeys = packageJson.pebble.messageKeys;
  var pluginSourcesIndex = messageKeys.indexOf('PluginSourcesJson');
  var pluginActionsIndex = messageKeys.indexOf('PluginActionsJson');
  var approvalStart = messageKeys.indexOf('ApprovalRequest');
  var approvalKeys = [
    'ApprovalRequest',
    'ApprovalId',
    'ApprovalTitle',
    'ApprovalDetail',
    'ApprovalDecision',
    'ApprovalCancel'
  ];

  assert.deepEqual(packageJson.pebble.usesPermissions, [
    'Internet',
    'LocalNetwork',
    'Location',
    'Timeline',
    'Health',
    'ShowNotifications'
  ]);
  assert.notEqual(pluginSourcesIndex, -1, 'PluginSourcesJson must remain declared');
  assert.ok(pluginSourcesIndex < pluginActionsIndex, 'PluginActionsJson must follow PluginSourcesJson');
  assert.ok(approvalStart > pluginActionsIndex, 'approval keys must follow PluginActionsJson');
  assert.deepEqual(messageKeys.slice(approvalStart, approvalStart + approvalKeys.length), approvalKeys);
});
