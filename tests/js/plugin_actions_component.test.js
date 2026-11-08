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

function createItem(config, initialize, sourceCatalogue, actionCatalogue, skipMount) {
  var dom = new JSDOM('<!doctype html><html><body>' + sourceComponent.template + component.template + '</body></html>');
  var masterRoot = dom.window.document.querySelector('.component-plugin-sources:not(.component-plugin-actions)');
  var root = dom.window.document.querySelector('.component-plugin-actions');
  var target = root.querySelector('[data-manipulator-target]');
  var sourceTarget = masterRoot.querySelector('[data-manipulator-target]');
  var events = [];
  var sourceItem = {
    config: { defaultValue: '[]', catalogueEncoded: encodeURIComponent(JSON.stringify(sourceCatalogue || [])), catalogueStatus: '' },
    $element: [masterRoot],
    $manipulatorTarget: { set: function(name, value) { if (name === 'value') { sourceTarget.value = value; } } },
    trigger: function() { return sourceItem; }
  };
  var item = {
    config: Object.assign({ defaultValue: '[]', catalogueEncoded: encodeURIComponent(JSON.stringify(actionCatalogue || actions)), catalogueStatus: 'Pebble plugin actions available' }, config || {}),
    $element: [root],
    $manipulatorTarget: { set: function(name, value) { if (name === 'value') { target.value = value; } } },
    trigger: function(name) { events.push(name); return item; }
  };
  sourceComponent.initialize.call(sourceItem);
  (initialize || component.initialize).call(item);
  if (!skipMount) { sourceItem.appendActions(root); }
  item.events = events;
  item.window = dom.window;
  item.root = root;
  item.viewRoot = masterRoot;
  item.masterRoot = masterRoot;
  item.sourceItem = sourceItem;
  item.target = target;
  return item;
}

function setValue(item, value) {
  return component.manipulator.set.call(item, value);
}

function openPlugin(item, plugin) {
  var group = item.viewRoot.querySelector('[data-plugin-group="' + plugin + '"]');
  group.open = true;
  return group;
}

test('Plugin Actions defaults off, uses distinct warning, and does not reuse source selections', function() {
  var item = createItem();
  assert.equal(component.name, 'plugin_actions');
  var warnings = item.viewRoot.querySelectorAll('.plugin-sources-warning');
  assert.match(warnings[1].textContent, /run automatically without confirmation unless Ask first is on/);
  assert.match(warnings[1].textContent, /can change external services/);
  assert.match(warnings[1].textContent, /requires Confirm or Deny on watch/);
  assert.match(warnings[1].textContent, /Canceling cannot undo an action already started/);
  assert.ok(item.viewRoot.querySelector('.plugin-source-group'));
  assert.equal(item.root.querySelector('[data-plugin-toggle]'), null, 'actions has no second dropdown');
  assert.equal(item.masterRoot.querySelectorAll('[data-plugin-toggle]').length, 1);
  assert.equal(item.masterRoot.querySelector('.plugin-sources-title').textContent, 'Plugins');
  assert.match(sourceComponent.style, /\.component-plugin-actions\{[^}]*border-top:1px solid #[0-9a-f]+/i);
  assert.equal(item.viewRoot.querySelector('[data-plugin-list="sources"] .plugin-action-group'), item.viewRoot.querySelector('.plugin-source-group'));
  assert.equal(item.viewRoot.querySelector('[data-plugin-index="0"]').checked, false);
  assert.equal(item.viewRoot.querySelector('[data-plugin-kind="actions"] [data-plugin-status]'), null);
  assert.deepEqual(item.parseSources(JSON.stringify([{ plugin: actions[0].plugin, category: 'switch', item: 'state' }])), []);
  assert.deepEqual(item.parseSources(JSON.stringify([{ plugin: actions[0].plugin, action: '', category: 'switch', item: 'state' }])), []);
  assert.equal(JSON.parse(component.manipulator.get.call(item)).length, 0);
  assert.doesNotMatch(component.initialize.toString(), /invokeAction/);
});

test('saved enabled actions remain selected while standalone plugin starts collapsed', function() {
  var selected = [{ plugin: actions[0].plugin, action: actions[0].action, confirm: true }];
  var item = createItem({ defaultValue: JSON.stringify(selected) });
  var group = item.viewRoot.querySelector('[data-plugin-group="' + actions[0].plugin + '"]');
  var ask = group.querySelector('[data-ask-first-index="0"]');

  assert.equal(group.open, false);
  assert.equal(group.querySelector('[data-plugin-index="0"]').checked, true);
  assert.equal(ask.checked, true);
  assert.equal(group.querySelector('.plugin-count-actions').textContent, '1/2 actions');
  setValue(item, JSON.stringify(selected));
  assert.equal(item.viewRoot.querySelector('[data-plugin-group="' + actions[0].plugin + '"]').open, false, 'import while collapsed stays collapsed');
});

test('one plugin entry groups source rows, divider, and actions by UUID', function() {
  var calendar = '11111111-1111-4111-8111-111111111111';
  var calendarAgain = '33333333-3333-4333-8333-333333333333';
  var sourceOnly = '44444444-4444-4444-8444-444444444444';
  var actionOnly = '55555555-5555-4555-8555-555555555555';
  var sources = [
    { plugin: calendar, pluginName: 'Calendar', category: 'event', item: 'today', properties: ['title', 'start'] },
    { plugin: calendar, pluginName: 'Calendar', category: 'event', item: 'tomorrow', properties: ['title', 'start'] },
    { plugin: sourceOnly, pluginName: 'Forecast', category: 'weather', item: 'current', properties: ['temperature'] },
    { plugin: calendarAgain, pluginName: 'Calendar', category: 'event', item: 'week', properties: ['title'] }
  ];
  var actionCatalogue = [
    { plugin: calendar, pluginName: 'Calendar', action: 'create_event', description: 'Create an event.', arguments: ['title', 'start'] },
    { plugin: calendarAgain, pluginName: 'Calendar', action: 'import_event', description: 'Import an event.', arguments: ['event_id'] },
    { plugin: actionOnly, pluginName: 'Calendar', action: 'search_events', description: 'Search events.', arguments: ['query'] }
  ];
  var item = createItem(null, null, sources, actionCatalogue);
  var list = item.viewRoot.querySelector('[data-plugin-list="sources"]');
  var directGroups = Array.prototype.filter.call(list.children, function(child) { return child.classList.contains('plugin-source-group'); });
  var calendarGroup = item.viewRoot.querySelector('[data-plugin-group="' + calendar + '"]:not([data-plugin-kind="actions"])');
  var calendarActionGroup = calendarGroup.querySelector(':scope > .plugin-action-group');
  var sourceRows = calendarGroup.querySelector(':scope > .plugin-source-rows');
  var actionRows = calendarActionGroup.querySelector('.plugin-source-rows');
  var sourceRow = sourceRows.querySelector('[data-plugin-index="0"]');
  var actionRow = actionRows.querySelector('[data-plugin-index="0"]');
  var headings;
  var calendarTitles;
  var ids;

  assert.equal(item.masterRoot.querySelectorAll('[data-plugin-toggle]').length, 1);
  assert.equal(item.root.querySelector('[data-plugin-toggle]'), null);
  assert.equal(item.viewRoot.querySelectorAll('.plugin-section-title').length, 0);
  assert.equal(directGroups.length, 4);
  assert.ok(Array.prototype.every.call(directGroups, function(group) { return group.open === false; }), 'all plugin entries start collapsed');
  ids = directGroups.map(function(group) { return group.getAttribute('data-plugin-group'); });
  assert.equal(new Set(ids).size, ids.length, 'each plugin UUID has one visible entry');
  assert.deepEqual(ids.slice(0, 3), [calendar, sourceOnly, calendarAgain]);
  assert.equal(calendarGroup.querySelectorAll('.plugin-source-group-title:not([hidden])').length, 1);
  assert.equal(calendarActionGroup.querySelector('.plugin-source-group-title').hidden, true);
  assert.equal(calendarGroup.getAttribute('data-has-sources'), '');
  assert.ok(item.viewRoot.querySelector('[data-plugin-group="' + calendarAgain + '"]:not([data-plugin-kind="actions"]) > .plugin-action-group'), 'second mixed plugin also nests its actions');
  assert.ok(sourceRow.compareDocumentPosition(actionRow) & 4, 'source rows precede action rows');
  assert.match(sourceComponent.style, /\.plugin-source-group\[data-has-sources\]>\.plugin-action-group\{[^}]*border-top:1px solid #[0-9a-f]+/i);
  assert.equal(directGroups.filter(function(group) { return group.getAttribute('data-plugin-group') === sourceOnly; })[0].querySelector('.plugin-action-group'), null);
  assert.equal(directGroups.filter(function(group) { return group.getAttribute('data-plugin-group') === actionOnly; })[0].getAttribute('data-has-sources'), null);
  headings = item.viewRoot.querySelectorAll('.plugin-source-group > .plugin-source-group-title:not([hidden]) > .plugin-source-group-name');
  calendarTitles = Array.prototype.filter.call(headings, function(heading) { return heading.textContent === 'Calendar'; });
  assert.equal(calendarTitles.length, 3, 'same display name with different UUID stays separate');

  item.masterRoot.querySelector('[data-plugin-toggle]').click();
  openPlugin(item, calendar);
  assert.equal(calendarGroup.open, true);
  assert.equal(item.viewRoot.querySelector('[data-plugin-group="' + sourceOnly + '"]').open, false);
  assert.equal(item.viewRoot.querySelector('[data-plugin-group="' + actionOnly + '"]').open, false);
  actionRow.checked = true;
  actionRow.dispatchEvent(new item.window.Event('change', { bubbles: true }));
  assert.deepEqual(item.sourceItem.collectSources(), [], 'action catalogue index zero never selects source index zero');
  sourceRow.checked = true;
  sourceRow.dispatchEvent(new item.window.Event('change', { bubbles: true }));
  assert.deepEqual(JSON.parse(component.manipulator.get.call(item)), [{ plugin: calendar, action: 'create_event' }]);
  assert.deepEqual(JSON.parse(sourceComponent.manipulator.get.call(item.sourceItem)), [{ plugin: calendar, category: 'event', item: 'today' }]);

  var sourceDetails = calendarGroup.querySelector(':scope > .plugin-source-details');
  var ask = calendarActionGroup.querySelector('[data-ask-first-index="0"]');
  sourceDetails.open = true;
  ask.focus();
  setValue(item, JSON.stringify([{ plugin: calendar, action: 'create_event', confirm: true }]));
  assert.deepEqual(JSON.parse(sourceComponent.manipulator.get.call(item.sourceItem)), [{ plugin: calendar, category: 'event', item: 'today' }]);
  assert.equal(item.viewRoot.querySelector('[data-plugin-group="' + calendar + '"]:not([data-plugin-kind="actions"]) > .plugin-source-details'), sourceDetails);
  assert.equal(sourceDetails.open, true);

  calendarGroup = item.viewRoot.querySelector('[data-plugin-group="' + calendar + '"]:not([data-plugin-kind="actions"])');
  calendarActionGroup = calendarGroup.querySelector(':scope > .plugin-action-group');
  var actionDetails = calendarActionGroup.querySelector('.plugin-source-details');
  actionDetails.open = true;
  ask = calendarActionGroup.querySelector('[data-ask-first-index="0"]');
  ask.focus();
  sourceComponent.manipulator.set.call(item.sourceItem, JSON.stringify([{ plugin: calendar, category: 'event', item: 'today' }]));
  calendarGroup = item.viewRoot.querySelector('[data-plugin-group="' + calendar + '"]:not([data-plugin-kind="actions"])');
  calendarActionGroup = calendarGroup.querySelector(':scope > .plugin-action-group');
  ask = calendarActionGroup.querySelector('[data-ask-first-index="0"]');
  assert.equal(ask.checked, true, 'source updates preserve confirmation setting');
  assert.equal(ask.disabled, false);
  assert.equal(calendarActionGroup.querySelector('.plugin-source-details'), actionDetails);
  assert.equal(actionDetails.open, true);
  assert.equal(item.viewRoot.ownerDocument.activeElement, ask, 'source updates preserve focus in action controls');
  assert.deepEqual(JSON.parse(component.manipulator.get.call(item)), [{ plugin: calendar, action: 'create_event', confirm: true }]);

  item.sourceItem.appendActions(item.root);
  item.sourceItem.appendActions(item.root);
  assert.equal(Array.prototype.filter.call(list.children, function(group) { return group.getAttribute('data-plugin-group') === calendar; }).length, 1);
  assert.equal(item.viewRoot.querySelectorAll('[data-plugin-group="' + calendar + '"] .plugin-action-group').length, 1);
  ask = item.viewRoot.querySelector('[data-ask-first-index="0"]');
  ask.checked = false;
  ask.dispatchEvent(new item.window.Event('change', { bubbles: true }));
  assert.deepEqual(JSON.parse(component.manipulator.get.call(item)), [{ plugin: calendar, action: 'create_event' }], 'repeated mounts do not duplicate action handlers');
});

test('plugin summaries show independent source/action counts and preserve collapse state', function() {
  var calendar = '11111111-1111-4111-8111-111111111111';
  var phone = '44444444-4444-4444-8444-444444444444';
  var watch = '55555555-5555-4555-8555-555555555555';
  var sources = [
    { plugin: calendar, pluginName: 'Calendar', category: 'event', item: 'today', properties: ['title'] },
    { plugin: calendar, pluginName: 'Calendar', category: 'event', item: 'tomorrow', properties: ['title'] },
    { plugin: phone, pluginName: 'Phone State', category: 'phone', item: 'battery', properties: ['level'] }
  ];
  var actionCatalogue = [
    { plugin: calendar, pluginName: 'Calendar', action: 'create_event', description: 'Create event.', arguments: [] },
    { plugin: calendar, pluginName: 'Calendar', action: 'delete_event', description: 'Delete event.', arguments: [] },
    { plugin: watch, pluginName: 'Watch State', action: 'set_timer', description: 'Set timer.', arguments: [] }
  ];
  var item = createItem(null, null, sources, actionCatalogue);
  var calendarGroup = item.viewRoot.querySelector('[data-plugin-group="' + calendar + '"]');
  var phoneGroup = item.viewRoot.querySelector('[data-plugin-group="' + phone + '"]');
  var watchGroup = item.viewRoot.querySelector('[data-plugin-group="' + watch + '"]');
  var countText = function(group, kind) { return group.querySelector('.plugin-count-' + kind).textContent; };
  var actionEnable;
  var ask;

  assert.equal(calendarGroup.open, false);
  assert.equal(phoneGroup.open, false);
  assert.equal(watchGroup.open, false);
  assert.equal(countText(calendarGroup, 'sources'), '0/2 sources');
  assert.equal(countText(calendarGroup, 'actions'), '0/2 actions');
  assert.equal(countText(phoneGroup, 'sources'), '0/1 sources');
  assert.equal(countText(phoneGroup, 'actions'), '0/0 actions');
  assert.equal(countText(watchGroup, 'sources'), '0/0 sources');
  assert.equal(countText(watchGroup, 'actions'), '0/1 actions');

  item.masterRoot.querySelector('[data-plugin-toggle]').click();
  calendarGroup.open = true;
  assert.ok(calendarGroup.querySelector(':scope > .plugin-source-rows .plugin-source-row'));
  assert.ok(calendarGroup.querySelector(':scope > .plugin-action-group .plugin-action-row'));
  assert.equal(calendarGroup.querySelector(':scope > .plugin-action-group > .plugin-source-group-title').hidden, true);
  assert.equal(phoneGroup.open, false);
  assert.equal(watchGroup.open, false);

  actionEnable = calendarGroup.querySelector('.plugin-action-group [data-plugin-index="0"]');
  actionEnable.checked = true;
  actionEnable.dispatchEvent(new item.window.Event('change', { bubbles: true }));
  assert.equal(countText(calendarGroup, 'actions'), '1/2 actions');
  ask = calendarGroup.querySelector('.plugin-action-group [data-ask-first-index="0"]');
  ask.checked = true;
  ask.dispatchEvent(new item.window.Event('change', { bubbles: true }));
  assert.equal(countText(calendarGroup, 'actions'), '1/2 actions', 'Ask first does not affect enabled count');
  assert.equal(JSON.parse(component.manipulator.get.call(item))[0].confirm, true);

  var sourceEnable = calendarGroup.querySelector(':scope > .plugin-source-rows [data-plugin-index="0"]');
  sourceEnable.checked = true;
  sourceEnable.dispatchEvent(new item.window.Event('change', { bubbles: true }));
  assert.equal(countText(calendarGroup, 'sources'), '1/2 sources');
  assert.equal(calendarGroup.open, true, 'checkbox updates do not collapse open plugin');

  setValue(item, JSON.stringify([
    { plugin: calendar.toUpperCase(), action: 'create_event', confirm: true },
    { plugin: calendar, action: 'create_event' }
  ]));
  assert.equal(countText(calendarGroup, 'actions'), '1/2 actions', 'normalized duplicate imports count once');
  assert.equal(calendarGroup.open, true, 'expanded state survives imports');

  phoneGroup.open = true;
  setValue(item, JSON.stringify([{ plugin: calendar, action: 'create_event', confirm: true }]));
  assert.equal(calendarGroup.open, true);
  assert.equal(phoneGroup.open, true, 'expanded peer remains expanded through action import');
  assert.equal(countText(calendarGroup, 'actions'), '1/2 actions');
  assert.equal(calendarGroup.querySelector('.plugin-action-group [data-ask-first-index="0"]').checked, true);
});

test('unavailable source and action entries remain removable without crossing kinds', function() {
  var plugin = '77777777-7777-4777-8777-777777777777';
  var sources = [{ plugin: plugin, pluginName: 'Calendar', category: 'event', item: 'today', properties: ['title'] }];
  var actionCatalogue = [{ plugin: plugin, pluginName: 'Calendar', action: 'create_event', description: 'Create an event.', arguments: ['title'] }];
  var item = createItem(null, null, sources, actionCatalogue);
  var sourceSelection = [{ plugin: plugin, category: 'event', item: 'retired_source' }];
  var actionSelection = [{ plugin: plugin, action: 'retired_action', confirm: true }];
  var group;
  var sourceRemove;
  var actionRemove;

  sourceComponent.manipulator.set.call(item.sourceItem, JSON.stringify(sourceSelection));
  setValue(item, JSON.stringify(actionSelection));
  item.masterRoot.querySelector('[data-plugin-toggle]').click();
  group = item.viewRoot.querySelector('[data-plugin-group="' + plugin + '"]:not([data-plugin-kind="actions"])');
  assert.ok(group);
  group.open = true;
  assert.ok(group.querySelector(':scope > .plugin-action-group'));
  assert.equal(group.querySelectorAll('.plugin-source-unavailable').length, 2);
  sourceRemove = group.querySelector(':scope > .plugin-source-rows [data-plugin-remove]');
  actionRemove = group.querySelector(':scope > .plugin-action-group [data-plugin-remove]');

  sourceRemove.click();
  assert.deepEqual(JSON.parse(sourceComponent.manipulator.get.call(item.sourceItem)), []);
  assert.deepEqual(JSON.parse(component.manipulator.get.call(item)), actionSelection);
  assert.ok(item.viewRoot.querySelector('[data-plugin-group="' + plugin + '"] .plugin-source-unavailable'));

  actionRemove = item.viewRoot.querySelector('[data-plugin-group="' + plugin + '"] .plugin-action-group [data-plugin-remove]');
  actionRemove.click();
  assert.deepEqual(JSON.parse(component.manipulator.get.call(item)), []);
  assert.deepEqual(JSON.parse(sourceComponent.manipulator.get.call(item.sourceItem)), []);
  assert.ok(item.viewRoot.querySelector('[data-plugin-group="' + plugin + '"] > .plugin-source-rows .plugin-source-row'));
});

test('removing final unavailable source promotes remaining actions and clears separator', function() {
  var plugin = '88888888-8888-4888-8888-888888888888';
  var actionCatalogue = [{ plugin: plugin, pluginName: 'Calendar', action: 'create_event', description: 'Create an event.', arguments: ['title'] }];
  var item = createItem(null, null, [], actionCatalogue);
  sourceComponent.manipulator.set.call(item.sourceItem, JSON.stringify([{ plugin: plugin, category: 'event', item: 'retired_source' }]));
  setValue(item, JSON.stringify([{ plugin: plugin, action: 'create_event' }]));
  item.masterRoot.querySelector('[data-plugin-toggle]').click();

  var sourceGroup = item.viewRoot.querySelector('[data-plugin-group="' + plugin + '"]:not([data-plugin-kind="actions"])');
  assert.ok(sourceGroup);
  sourceGroup.open = true;
  assert.ok(sourceGroup.querySelector(':scope > .plugin-action-group'));
  sourceGroup.querySelector(':scope > .plugin-source-rows [data-plugin-remove]').click();

  var actionGroup = item.viewRoot.querySelector('[data-plugin-group="' + plugin + '"]');
  assert.ok(actionGroup);
  assert.equal(actionGroup.getAttribute('data-has-sources'), null);
  assert.equal(actionGroup.querySelector('.plugin-source-group-title').hidden, false);
  assert.equal(item.viewRoot.querySelector('[data-plugin-group="' + plugin + '"]:not([data-plugin-kind="actions"])'), null);
  assert.equal(item.viewRoot.querySelectorAll('[data-plugin-group="' + plugin + '"]').length, 1);
});

test('empty unavailable action groups stay removed after source updates and remounts', function() {
  var plugin = '99999999-9999-4999-8999-999999999999';
  var sourceSelection = [{ plugin: plugin, category: 'event', item: 'today' }];
  var actionSelection = [{ plugin: plugin, action: 'retired_action', confirm: true }];
  var sources = [{ plugin: plugin, pluginName: 'Calendar', category: 'event', item: 'today', properties: ['title'] }];
  var item = createItem({ defaultValue: JSON.stringify(actionSelection) }, null, sources, []);
  var list = item.viewRoot.querySelector('[data-plugin-list="sources"]');
  var sourceGroup;

  sourceComponent.manipulator.set.call(item.sourceItem, JSON.stringify(sourceSelection));
  item.masterRoot.querySelector('[data-plugin-toggle]').click();
  item.viewRoot.querySelector('[data-plugin-kind="actions"] [data-plugin-remove]').click();
  assert.deepEqual(JSON.parse(component.manipulator.get.call(item)), []);
  assert.equal(item.masterRoot.ownerDocument.activeElement, item.masterRoot.querySelector('[data-plugin-toggle]'));

  sourceComponent.manipulator.set.call(item.sourceItem, JSON.stringify(sourceSelection));
  item.sourceItem.appendActions(item.root);
  sourceGroup = list.querySelector('[data-plugin-group="' + plugin + '"]');
  assert.equal(list.querySelectorAll('[data-plugin-group="' + plugin + '"]').length, 1);
  assert.ok(sourceGroup);
  assert.equal(sourceGroup.querySelector('.plugin-action-group'), null);
  assert.equal(sourceGroup.querySelector('.plugin-action-row'), null);
  assert.equal(sourceGroup.querySelector('.plugin-action-group .plugin-source-details'), null);
  assert.deepEqual(JSON.parse(sourceComponent.manipulator.get.call(item.sourceItem)), sourceSelection);
  assert.deepEqual(JSON.parse(component.manipulator.get.call(item)), []);

  var actionOnly = createItem({ defaultValue: JSON.stringify(actionSelection) }, null, [], []);
  var actionOnlyList = actionOnly.viewRoot.querySelector('[data-plugin-list="sources"]');
  actionOnly.masterRoot.querySelector('[data-plugin-toggle]').click();
  actionOnly.viewRoot.querySelector('[data-plugin-kind="actions"] [data-plugin-remove]').click();
  actionOnly.sourceItem.appendActions(actionOnly.root);
  actionOnly.sourceItem.appendActions(actionOnly.root);
  assert.equal(actionOnlyList.querySelectorAll('.plugin-source-group').length, 0);
  assert.deepEqual(JSON.parse(component.manipulator.get.call(actionOnly)), []);
});

test('replacing action component detaches old render listener and preserves current groups', function() {
  var first = createItem();
  var second = createItem(null, null, null, null, true);
  var list = first.viewRoot.querySelector('[data-plugin-list="sources"]');
  first.sourceItem.appendActions(second.root);
  var visibleCount = list.querySelectorAll('.plugin-source-group').length;
  assert.ok(visibleCount > 0);

  setValue(first, JSON.stringify([{ plugin: actions[0].plugin, action: 'find-device' }]));
  assert.equal(list.querySelectorAll('.plugin-source-group').length, visibleCount);
  assert.equal(list.querySelectorAll('[data-plugin-kind="actions"] .plugin-action-row').length, actions.length);
  assert.deepEqual(JSON.parse(component.manipulator.get.call(second)), []);
});

test('groups actions by plugin and reveals exact IDs, description, and argument names in details', function() {
  var item = createItem();
  var groups = item.viewRoot.querySelectorAll('.plugin-source-group');
  var firstGroup = groups[0];
  var titles = Array.prototype.map.call(firstGroup.querySelectorAll('.plugin-source-title'), function(title) { return title.textContent; });
  var details = firstGroup.querySelector('.plugin-source-details');

  assert.equal(groups.length, 2);
  assert.equal(firstGroup.querySelectorAll('.plugin-source-group-title').length, 1);
  assert.equal(firstGroup.querySelector('.plugin-source-group-name').textContent, 'Home <img src=x>');
  assert.equal(item.viewRoot.querySelector('img'), null);
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
  var checkbox = item.viewRoot.querySelector('[data-plugin-index="0"]');
  var details = item.viewRoot.querySelector('.plugin-source-details');
  var upper = actions[0].plugin.toUpperCase();
  assert.notEqual(upper, actions[0].plugin);
  assert.deepEqual(item.parseSources(JSON.stringify([
    { plugin: upper, action: 'set_on' },
    { plugin: actions[0].plugin, action: 'set_on' }
  ])), [{ plugin: actions[0].plugin, action: 'set_on' }]);

  item.masterRoot.querySelector('[data-plugin-toggle]').click();
  openPlugin(item, actions[0].plugin);
  details.open = true;
  checkbox = item.viewRoot.querySelector('[data-plugin-index="0"]');
  checkbox.focus();
  checkbox.checked = true;
  checkbox.dispatchEvent(new item.window.Event('change', { bubbles: true }));
  assert.deepEqual(JSON.parse(component.manipulator.get.call(item)), [{ plugin: actions[0].plugin, action: 'set_on' }]);
  assert.equal(item.root.ownerDocument.activeElement, checkbox);
  assert.equal(item.viewRoot.querySelector('.plugin-action-group .plugin-source-details'), details);
  assert.equal(details.open, true);
});

test('Ask first is left of enable, hidden while disabled, and changes only confirmation flag', function() {
  var item = createItem();
  var row = item.viewRoot.querySelector('[data-action-row]');
  var enabled = row.querySelector('[data-plugin-index="0"]');
  var askLabel = row.querySelector('[data-ask-first-control]');
  var ask = row.querySelector('[data-ask-first-index="0"]');
  var details = item.viewRoot.querySelector('.plugin-action-group .plugin-source-details');

  assert.equal(askLabel.hidden, true);
  assert.equal(ask.disabled, true);
  assert.ok(askLabel.compareDocumentPosition(row.querySelector('.plugin-action-enable')) & 4);

  item.masterRoot.querySelector('[data-plugin-toggle]').click();
  openPlugin(item, actions[0].plugin);
  details.open = true;
  enabled.checked = true;
  enabled.dispatchEvent(new item.window.Event('change', { bubbles: true }));
  assert.equal(askLabel.hidden, false);
  assert.equal(ask.disabled, false);
  assert.deepEqual(JSON.parse(component.manipulator.get.call(item)), [{ plugin: actions[0].plugin, action: 'set_on' }]);

  ask.focus();
  ask.checked = true;
  ask.dispatchEvent(new item.window.Event('change', { bubbles: true }));
  assert.deepEqual(JSON.parse(component.manipulator.get.call(item)), [{ plugin: actions[0].plugin, action: 'set_on', confirm: true }]);
  assert.equal(item.root.ownerDocument.activeElement, ask);
  assert.equal(details.open, true);

  enabled.checked = false;
  enabled.dispatchEvent(new item.window.Event('change', { bubbles: true }));
  assert.equal(askLabel.hidden, true);
  assert.equal(JSON.parse(component.manipulator.get.call(item)).length, 0);
  enabled.checked = true;
  enabled.dispatchEvent(new item.window.Event('change', { bubbles: true }));
  assert.equal(ask.checked, false);
  assert.deepEqual(JSON.parse(component.manipulator.get.call(item)), [{ plugin: actions[0].plugin, action: 'set_on' }]);

  ask.checked = true;
  ask.dispatchEvent(new item.window.Event('change', { bubbles: true }));
  item.masterRoot.querySelector('[data-plugin-toggle]').click();
  assert.equal(ask.disabled, true);
  setValue(item, JSON.stringify([{ plugin: actions[0].plugin, action: 'set_on', confirm: true }]));
  ask = item.viewRoot.querySelector('[data-ask-first-index="0"]');
  assert.equal(ask.checked, true);
  assert.equal(ask.disabled, true, 'import while parent is collapsed must not enable nested control');
  item.masterRoot.querySelector('[data-plugin-toggle]').click();
  assert.equal(ask.disabled, false);
});

test('confirmation roundtrip preserves legacy entries and rejects invalid flags', function() {
  var item = createItem();
  var legacy = { plugin: actions[0].plugin, action: 'set_on' };
  var confirmed = { plugin: actions[0].plugin, action: 'find-device', confirm: true };
  assert.deepEqual(item.parseSources(JSON.stringify([legacy, confirmed])), [legacy, confirmed]);
  assert.deepEqual(item.parseSources(JSON.stringify([
    { plugin: actions[0].plugin, action: 'set_on', confirm: 'true' },
    { plugin: actions[0].plugin, action: 'find-device', confirm: 1 },
    { plugin: actions[0].plugin, action: 'turn_off', confirm: null }
  ])), []);
});

test('duplicate action confirmation merges conservatively across scanned entries', function() {
  var item = createItem();
  var base = { plugin: actions[0].plugin, action: 'set_on' };
  assert.deepEqual(item.parseSources(JSON.stringify([
    base,
    { plugin: actions[0].plugin.toUpperCase(), action: 'set_on', confirm: true },
    { plugin: actions[0].plugin, action: 'set_on', confirm: false }
  ])), [{ plugin: actions[0].plugin, action: 'set_on', confirm: true }]);
});

test('unavailable selected actions stay removable alongside current actions', function() {
  var selected = [
    { plugin: actions[0].plugin, action: 'set_on' },
    { plugin: actions[0].plugin, action: 'retired_action' }
  ];
  var item = createItem({ catalogueEncoded: encodeURIComponent(JSON.stringify([actions[0]])) });
  setValue(item, JSON.stringify(selected));
  assert.equal(item.viewRoot.querySelectorAll('.plugin-source-unavailable').length, 1);
  assert.equal(item.viewRoot.querySelector('[data-plugin-group="' + actions[0].plugin + '"] .plugin-count-actions').textContent, '2/2 actions');
  assert.deepEqual(JSON.parse(component.manipulator.get.call(item)), selected);
  item.masterRoot.querySelector('[data-plugin-toggle]').click();
  openPlugin(item, actions[0].plugin);
  item.viewRoot.querySelector('[data-plugin-remove]').click();
  assert.deepEqual(JSON.parse(item.target.value), [selected[0]]);
  assert.equal(item.viewRoot.querySelector('[data-plugin-group="' + actions[0].plugin + '"] .plugin-count-actions').textContent, '1/1 actions');
});

test('removing final unavailable action focuses closed sibling summary', function() {
  var firstPlugin = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  var secondPlugin = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  var item = createItem({ catalogueEncoded: encodeURIComponent('[]') });
  var selected = [
    { plugin: firstPlugin, action: 'gone' },
    { plugin: secondPlugin, action: 'gone' }
  ];
  var firstGroup;
  var secondGroup;
  var summary;

  setValue(item, JSON.stringify(selected));
  item.masterRoot.querySelector('[data-plugin-toggle]').click();
  firstGroup = item.viewRoot.querySelector('[data-plugin-group="' + firstPlugin + '"]');
  secondGroup = item.viewRoot.querySelector('[data-plugin-group="' + secondPlugin + '"]');
  firstGroup.open = true;
  assert.equal(secondGroup.open, false);
  assert.equal(secondGroup.querySelector('.plugin-count-actions').textContent, '1/1 actions');
  firstGroup.querySelector('[data-plugin-remove]').focus();
  firstGroup.querySelector('[data-plugin-remove]').click();

  secondGroup = item.viewRoot.querySelector('[data-plugin-group="' + secondPlugin + '"]');
  summary = secondGroup.querySelector(':scope > .plugin-source-group-title');
  assert.deepEqual(JSON.parse(item.target.value), [selected[1]]);
  assert.equal(secondGroup.open, false, 'focus transfer does not open sibling');
  assert.equal(secondGroup.querySelector('.plugin-count-actions').textContent, '1/1 actions');
  assert.equal(item.root.ownerDocument.activeElement, summary);
  assert.notEqual(item.root.ownerDocument.activeElement, item.root.ownerDocument.body);
});

test('action catalogue warning remains visible and malformed settings fail closed', function() {
  var item = createItem({ catalogueStatus: '3 unsupported actions omitted.' });
  assert.match(item.viewRoot.querySelectorAll('[data-plugin-status]')[1].textContent, /3 unsupported actions omitted/);
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
  item.masterRoot.querySelector('[data-plugin-toggle]').click();
  for (i = 0; i < 17; i += 1) {
    openPlugin(item, catalogue[i].plugin);
    var checkbox = item.viewRoot.querySelector('[data-plugin-index="' + i + '"]');
    assert.equal(checkbox.disabled, false);
    checkbox.checked = true;
    checkbox.dispatchEvent(new item.window.Event('change', { bubbles: true }));
  }
  assert.equal(JSON.parse(component.manipulator.get.call(item)).length, 16);
  assert.equal(item.viewRoot.querySelector('[data-plugin-index="16"]').checked, false);
  assert.match(item.viewRoot.querySelectorAll('[data-plugin-status]')[1].textContent, /Maximum of 16 enabled plugin actions reached/);
});

test('blank humanized action identifiers use Action fallback', function() {
  var blankAction = { plugin: actions[0].plugin, pluginName: 'Home', action: '   ', description: 'Blank ID fixture.', arguments: [] };
  var item = createItem({ catalogueEncoded: encodeURIComponent(JSON.stringify([blankAction])) });
  assert.equal(item.viewRoot.querySelector('.plugin-action-group .plugin-source-title').textContent, 'Action');
});

test('action initialize serializes independently and reuses scoped Clay switch styling', function() {
  var initialize = vm.runInNewContext('(' + component.initialize.toString() + ')', {});
  var item = createItem(null, initialize);
  assert.deepEqual(JSON.parse(component.manipulator.get.call(item)), []);
  assert.equal(component.style, '', 'the registered source component supplies shared UI rules first');
  assert.match(sourceComponent.style, /plugin-source-switch input:checked\+\.plugin-source-track/);
});
