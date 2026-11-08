'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var JSDOM = require('jsdom').JSDOM;
var vm = require('node:vm');
var component = require('../../src/pkjs/plugin_actions_component');
var sourceComponent = require('../../src/pkjs/plugin_sources_component');

var actions = [
  { plugin: 'abcdefab-cdef-abcd-efab-cdefabcdefab', pluginName: 'Home <img src=x>', action: 'set_on', description: '<img src=x> Turn device on.', arguments: ['device_id', '<b>value</b>'] },
  { plugin: 'abcdefab-cdef-abcd-efab-cdefabcdefab', pluginName: 'Home <img src=x>', action: 'find-device', description: 'Find a device.', arguments: ['query'] },
  { plugin: '22222222-2222-4222-8222-222222222222', pluginName: 'Lights', action: 'turn_off', description: 'Turn light off.', arguments: [] }
];

function createItem(config, initialize) {
  var dom = new JSDOM('<!doctype html><html><body>' + component.template + '</body></html>');
  var root = dom.window.document.querySelector('.component-plugin-actions');
  var target = root.querySelector('[data-manipulator-target]');
  var events = [];
  var item = {
    config: Object.assign({ defaultValue: '[]', catalogueEncoded: encodeURIComponent(JSON.stringify(actions)), catalogueStatus: 'Pebble plugin actions available' }, config || {}),
    $element: [root],
    $manipulatorTarget: { set: function(name, value) { if (name === 'value') { target.value = value; } } },
    trigger: function(name) { events.push(name); return item; }
  };
  (initialize || component.initialize).call(item);
  item.events = events;
  item.window = dom.window;
  item.root = root;
  item.target = target;
  return item;
}

function setValue(item, value) {
  return component.manipulator.set.call(item, value);
}

test('Plugin Actions defaults off, uses distinct warning, and does not reuse source selections', function() {
  var item = createItem();
  assert.equal(component.name, 'plugin_actions');
  assert.match(item.root.querySelector('.plugin-sources-warning').textContent, /run automatically without confirmation and can change external services/);
  assert.match(item.root.querySelector('.plugin-sources-warning').textContent, /Canceling cannot undo an action already started/);
  assert.ok(item.root.querySelector('.plugin-source-group'));
  assert.equal(item.root.querySelector('[data-plugin-index="0"]').checked, false);
  assert.equal(item.root.querySelector('[data-plugin-status]').textContent, '0 of 16 selected.');
  assert.deepEqual(item.parseSources(JSON.stringify([{ plugin: actions[0].plugin, category: 'switch', item: 'state' }])), []);
  assert.deepEqual(item.parseSources(JSON.stringify([{ plugin: actions[0].plugin, action: '', category: 'switch', item: 'state' }])), []);
  assert.equal(JSON.parse(component.manipulator.get.call(item)).length, 0);
  assert.doesNotMatch(component.initialize.toString(), /invokeAction/);
});

test('groups actions by plugin and reveals exact IDs, description, and argument names in details', function() {
  var item = createItem();
  var groups = item.root.querySelectorAll('.plugin-source-group');
  var firstGroup = groups[0];
  var titles = Array.prototype.map.call(firstGroup.querySelectorAll('.plugin-source-title'), function(title) { return title.textContent; });
  var details = firstGroup.querySelector('.plugin-source-details');

  assert.equal(groups.length, 2);
  assert.equal(firstGroup.querySelectorAll('.plugin-source-group-title').length, 1);
  assert.equal(firstGroup.querySelector('.plugin-source-group-title').textContent, 'Home <img src=x>');
  assert.equal(item.root.querySelector('img'), null);
  assert.deepEqual(titles, ['Set on', 'Find device']);
  assert.equal(details.querySelector('summary').textContent, 'Action details');
  assert.equal(details.open, false);
  assert.match(details.textContent, /Action ID: set_on/);
  assert.match(details.textContent, /<img src=x> Turn device on\./);
  assert.match(details.textContent, /device_id, <b>value<\/b>/);
  assert.equal(details.querySelector('img, b'), null);
  assert.match(details.textContent, /Plugin UUID: abcdefab-cdef-abcd-efab-cdefabcdefab/);
  assert.doesNotMatch(firstGroup.querySelector('.plugin-source-rows').textContent, /set_on|Turn device on|device_id/);
});

test('action selection serializes only plugin and action, normalizes UUID case, and preserves focus', function() {
  var item = createItem();
  var checkbox = item.root.querySelector('[data-plugin-index="0"]');
  var details = item.root.querySelector('.plugin-source-details');
  var upper = actions[0].plugin.toUpperCase();
  assert.notEqual(upper, actions[0].plugin);
  assert.deepEqual(item.parseSources(JSON.stringify([
    { plugin: upper, action: 'set_on' },
    { plugin: actions[0].plugin, action: 'set_on' }
  ])), [{ plugin: actions[0].plugin, action: 'set_on' }]);

  item.root.querySelector('[data-plugin-toggle]').click();
  details.open = true;
  checkbox = item.root.querySelector('[data-plugin-index="0"]');
  checkbox.focus();
  checkbox.checked = true;
  checkbox.dispatchEvent(new item.window.Event('change', { bubbles: true }));
  assert.deepEqual(JSON.parse(component.manipulator.get.call(item)), [{ plugin: actions[0].plugin, action: 'set_on' }]);
  assert.equal(item.root.ownerDocument.activeElement, checkbox);
  assert.equal(item.root.querySelector('.plugin-source-details'), details);
  assert.equal(details.open, true);
});

test('unavailable selected actions stay removable alongside current actions', function() {
  var selected = [
    { plugin: actions[0].plugin, action: 'set_on' },
    { plugin: actions[0].plugin, action: 'retired_action' }
  ];
  var item = createItem({ catalogueEncoded: encodeURIComponent(JSON.stringify([actions[0]])) });
  setValue(item, JSON.stringify(selected));
  assert.equal(item.root.querySelectorAll('.plugin-source-unavailable').length, 1);
  assert.deepEqual(JSON.parse(component.manipulator.get.call(item)), selected);
  item.root.querySelector('[data-plugin-toggle]').click();
  item.root.querySelector('[data-plugin-remove]').click();
  assert.deepEqual(JSON.parse(item.target.value), [selected[0]]);
});

test('action catalogue warning remains visible and malformed settings fail closed', function() {
  var item = createItem({ catalogueStatus: '3 unsupported actions omitted.' });
  assert.match(item.root.querySelector('[data-plugin-status]').textContent, /3 unsupported actions omitted/);
  assert.deepEqual(item.parseSources('{bad'), []);
  assert.deepEqual(item.parseSources(JSON.stringify([{ plugin: 'not-a-uuid', action: 'set_on' }])), []);
});

test('interactive action selection enforces 16-action cap', function() {
  var catalogue = [];
  var i;
  for (i = 0; i < 17; i += 1) {
    catalogue.push({ plugin: '00000000-0000-0000-0000-' + ('00000000000' + i.toString(16)).slice(-12), pluginName: 'Plugin ' + i, action: 'action_' + i, description: 'Test action.', arguments: [] });
  }
  var item = createItem({ catalogueEncoded: encodeURIComponent(JSON.stringify(catalogue)) });
  item.root.querySelector('[data-plugin-toggle]').click();
  for (i = 0; i < 17; i += 1) {
    var checkbox = item.root.querySelector('[data-plugin-index="' + i + '"]');
    assert.equal(checkbox.disabled, false);
    checkbox.checked = true;
    checkbox.dispatchEvent(new item.window.Event('change', { bubbles: true }));
  }
  assert.equal(JSON.parse(component.manipulator.get.call(item)).length, 16);
  assert.equal(item.root.querySelector('[data-plugin-index="16"]').checked, false);
  assert.match(item.root.querySelector('[data-plugin-status]').textContent, /Maximum of 16 enabled plugin actions reached/);
});

test('blank humanized action identifiers use Action fallback', function() {
  var blankAction = { plugin: actions[0].plugin, pluginName: 'Home', action: '   ', description: 'Blank ID fixture.', arguments: [] };
  var item = createItem({ catalogueEncoded: encodeURIComponent(JSON.stringify([blankAction])) });
  assert.equal(item.root.querySelector('.plugin-source-title').textContent, 'Action');
});

test('action initialize serializes independently and reuses scoped Clay switch styling', function() {
  var initialize = vm.runInNewContext('(' + component.initialize.toString() + ')', {});
  var item = createItem(null, initialize);
  assert.deepEqual(JSON.parse(component.manipulator.get.call(item)), []);
  assert.equal(component.style, '', 'the registered source component supplies shared UI rules first');
  assert.match(sourceComponent.style, /plugin-source-switch input:checked\+\.plugin-source-track/);
});
