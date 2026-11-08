'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var JSDOM = require('jsdom').JSDOM;
var vm = require('node:vm');
var component = require('../../src/pkjs/plugin_sources_component');

var catalogue = [
  { plugin: '00000000-0000-0000-0001-000000000007', pluginName: 'Calendar <img src=x>', category: 'event', item: 'today', properties: ['title', 'start'] },
  { plugin: '22222222-2222-4222-8222-222222222222', pluginName: 'Health', category: 'activity', item: 'steps', properties: ['count'] }
];

function createItem(config, initialize) {
  var dom = new JSDOM('<!doctype html><html><body>' + component.template + '</body></html>');
  var root = dom.window.document.querySelector('.component-plugin-sources');
  var target = root.querySelector('[data-manipulator-target]');
  var events = [];
  var item = {
    config: Object.assign({ defaultValue: '[]', catalogueEncoded: encodeURIComponent(JSON.stringify(catalogue)), catalogueStatus: '' }, config || {}),
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

function openPlugin(item, plugin) {
  var group = item.root.querySelector('[data-plugin-group="' + plugin + '"]');
  group.open = true;
  return group;
}

test('source selection defaults disabled and serializes checkbox changes', function() {
  var item = createItem();
  var checkbox = item.root.querySelector('[data-plugin-index="0"]');
  assert.equal(checkbox.checked, false);
  checkbox.checked = true;
  checkbox.dispatchEvent(new item.window.Event('change', { bubbles: true }));
  assert.deepEqual(JSON.parse(component.manipulator.get.call(item)), [{ plugin: catalogue[0].plugin, category: 'event', item: 'today' }]);
  assert.equal(item.root.querySelector('[data-plugin-group="' + catalogue[0].plugin + '"] .plugin-count-sources').textContent, '1/1 sources');
  checkbox = item.root.querySelector('[data-plugin-index="0"]');
  checkbox.checked = false;
  checkbox.dispatchEvent(new item.window.Event('change', { bubbles: true }));
  assert.deepEqual(JSON.parse(item.target.value), []);
});

test('saved enabled source remains selected while its plugin starts collapsed', function() {
  var selected = [{ plugin: catalogue[0].plugin, category: 'event', item: 'today' }];
  var item = createItem({ defaultValue: JSON.stringify(selected) });
  var group = item.root.querySelector('[data-plugin-group="' + catalogue[0].plugin + '"]');

  assert.equal(group.open, false);
  assert.equal(group.querySelector('[data-plugin-index="0"]').checked, true);
  assert.equal(group.querySelector('.plugin-count-sources').textContent, '1/1 sources');
  setValue(item, JSON.stringify(selected));
  assert.equal(item.root.querySelector('[data-plugin-group="' + catalogue[0].plugin + '"]').open, false, 'import while collapsed stays collapsed');
});

test('nested action events cannot select source catalogue entries', function() {
  var item = createItem();
  var actionRoot = item.window.document.createElement('div');
  var actionList = item.window.document.createElement('div');
  var actionCheckbox = item.window.document.createElement('input');
  var sourceList = item.root.querySelector('[data-plugin-list="sources"]');
  actionRoot.setAttribute('data-plugin-kind', 'actions');
  actionList.setAttribute('data-plugin-list', 'actions');
  actionCheckbox.type = 'checkbox';
  actionCheckbox.setAttribute('data-plugin-index', '0');
  actionList.appendChild(actionCheckbox);
  actionRoot.appendChild(actionList);

  assert.equal(typeof item.appendActions, 'function');
  assert.equal(item.appendActions(actionRoot), true);
  assert.equal(actionRoot.previousElementSibling, sourceList);
  assert.equal(item.root.querySelectorAll('[data-plugin-toggle]').length, 1);
  item.root.querySelector('[data-plugin-toggle]').click();
  actionCheckbox.checked = true;
  actionCheckbox.dispatchEvent(new item.window.Event('change', { bubbles: true }));

  assert.deepEqual(item.collectSources(), []);
  assert.deepEqual(JSON.parse(item.target.value), []);
});

test('uses text nodes for untrusted catalogue metadata', function() {
  var item = createItem();
  assert.equal(item.root.querySelector('img'), null);
  assert.equal(item.root.querySelector('.plugin-source-group-name').textContent, 'Calendar <img src=x>');
  assert.match(item.root.querySelector('.plugin-sources-warning').textContent, /sent to your configured model provider/);
});

test('groups plugin sources and humanizes row titles while keeping IDs in disclosure', function() {
  var plugin = 'abcdefab-cdef-abcd-efab-cdefabcdefab';
  var sources = ['switch_setting', 'number_setting', 'text_setting', 'app_setting'].map(function(name) {
    return { plugin: plugin, pluginName: 'Watch Settings', category: 'watch-settings', item: name, properties: ['value', 'updated_at'] };
  });
  var item = createItem({ catalogueEncoded: encodeURIComponent(JSON.stringify(sources)), catalogueStatus: '4 sources available.' });
  var group = item.root.querySelector('.plugin-source-group');
  var titles = Array.prototype.map.call(group.querySelectorAll('.plugin-source-title'), function(title) { return title.textContent; });
  var details = group.querySelector('.plugin-source-details');

  assert.equal(item.root.querySelectorAll('.plugin-source-group').length, 1);
  assert.equal(group.querySelectorAll('.plugin-source-group-title').length, 1);
  assert.deepEqual(titles, ['Switch setting', 'Number setting', 'Text setting', 'App setting']);
  assert.equal(details.open, false);
  assert.match(details.textContent, /watch-settings \/ switch_setting/);
  assert.match(details.textContent, /updated_at/);
  assert.doesNotMatch(group.querySelector('.plugin-source-rows').textContent, /watch-settings|switch_setting/);
  assert.match(item.root.querySelector('[data-plugin-status]').textContent, /0 of 16 selected\. 4 sources available\./);
});

test('normal catalogue status is suppressed while trailing catalogue warnings remain visible', function() {
  var healthy = createItem({ catalogueStatus: 'Pebble plugin sources available' });
  var warning = createItem({ catalogueStatus: 'Pebble plugin sources available; 2 sources skipped for safety.' });

  assert.equal(healthy.root.querySelector('[data-plugin-status]').textContent, '0 of 16 selected.');
  assert.equal(warning.root.querySelector('[data-plugin-status]').textContent, '0 of 16 selected. 2 sources skipped for safety.');
});

test('unavailable selected entries remain visible and removable', function() {
  var item = createItem({ catalogueEncoded: encodeURIComponent(JSON.stringify([catalogue[0]])) });
  var selected = [
    { plugin: catalogue[0].plugin, category: 'event', item: 'today' },
    { plugin: '33333333-3333-4333-8333-333333333333', category: 'old', item: 'source' }
  ];
  setValue(item, JSON.stringify(selected));
  assert.equal(item.root.querySelectorAll('.plugin-source-unavailable').length, 1);
  assert.equal(item.root.querySelector('[data-plugin-group="' + selected[1].plugin + '"] .plugin-count-sources').textContent, '1/1 sources');
  assert.deepEqual(JSON.parse(component.manipulator.get.call(item)), selected);
  item.root.querySelector('[data-plugin-remove]').dispatchEvent(new item.window.Event('click', { bubbles: true }));
  assert.deepEqual(JSON.parse(item.target.value), [selected[0]]);
});

test('removing one unavailable source in installed plugin group preserves others and focus', function() {
  var plugin = catalogue[0].plugin;
  var selected = [
    { plugin: plugin, category: 'event', item: 'today' },
    { plugin: plugin, category: 'old', item: 'missing-one' },
    { plugin: plugin, category: 'old', item: 'missing-two' }
  ];
  var item = createItem({ catalogueEncoded: encodeURIComponent(JSON.stringify([catalogue[0]])) });
  var group;
  var details;
  var remove;
  var focused;

  setValue(item, JSON.stringify(selected));
  item.root.querySelector('[data-plugin-toggle]').click();
  group = item.root.querySelector('.plugin-source-group');
  group.open = true;
  assert.equal(group.querySelector('.plugin-count-sources').textContent, '3/3 sources');
  details = group.querySelector('.plugin-source-details');
  details.open = true;
  remove = group.querySelector('[data-plugin-remove]');
  remove.focus();
  remove.dispatchEvent(new item.window.Event('click', { bubbles: true }));

  assert.deepEqual(JSON.parse(item.target.value), [selected[0], selected[2]]);
  assert.equal(group.querySelector('.plugin-count-sources').textContent, '2/2 sources');
  assert.equal(item.root.querySelectorAll('.plugin-source-group').length, 1);
  assert.equal(item.root.querySelectorAll('.plugin-source-unavailable').length, 1);
  assert.equal(group.querySelector('.plugin-source-details'), details);
  assert.equal(details.open, true);
  focused = item.root.ownerDocument.activeElement;
  assert.equal(focused, group.querySelector('[data-plugin-remove]'));
  assert.ok(item.root.contains(focused), 'focus remains on a live control');
});

test('removing final unavailable source focuses closed sibling summary', function() {
  var firstPlugin = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  var secondPlugin = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  var item = createItem({ catalogueEncoded: encodeURIComponent('[]') });
  var selected = [
    { plugin: firstPlugin, category: 'old', item: 'gone' },
    { plugin: secondPlugin, category: 'old', item: 'gone' }
  ];
  var firstGroup;
  var secondGroup;
  var summary;

  setValue(item, JSON.stringify(selected));
  item.root.querySelector('[data-plugin-toggle]').click();
  firstGroup = item.root.querySelector('[data-plugin-group="' + firstPlugin + '"]');
  secondGroup = item.root.querySelector('[data-plugin-group="' + secondPlugin + '"]');
  firstGroup.open = true;
  assert.equal(secondGroup.open, false);
  assert.equal(secondGroup.querySelector('.plugin-count-sources').textContent, '1/1 sources');
  firstGroup.querySelector('[data-plugin-remove]').focus();
  firstGroup.querySelector('[data-plugin-remove]').click();

  secondGroup = item.root.querySelector('[data-plugin-group="' + secondPlugin + '"]');
  summary = secondGroup.querySelector(':scope > .plugin-source-group-title');
  assert.deepEqual(JSON.parse(item.target.value), [selected[1]]);
  assert.equal(secondGroup.open, false, 'focus transfer does not open sibling');
  assert.equal(secondGroup.querySelector('.plugin-count-sources').textContent, '1/1 sources');
  assert.equal(item.root.ownerDocument.activeElement, summary);
  assert.notEqual(item.root.ownerDocument.activeElement, item.root.ownerDocument.body);
});

test('malformed catalogue reports unavailable while preserving saved selections', function() {
  var item = createItem({ catalogueEncoded: '%bad', catalogueStatus: 'Unsupported on this phone.' });
  var selected = [{ plugin: '44444444-4444-4444-8444-444444444444', category: 'old', item: 'data' }];
  setValue(item, JSON.stringify(selected));
  assert.match(item.root.querySelector('[data-plugin-status]').textContent, /Unsupported on this phone\./);
  assert.deepEqual(JSON.parse(component.manipulator.get.call(item)), selected);
  assert.equal(item.root.querySelectorAll('.plugin-source-unavailable').length, 1);
});

test('malformed settings become empty and selected sources are deduplicated and capped at 16', function() {
  var item = createItem();
  var values = [];
  var i;
  assert.deepEqual(item.parseSources('{bad'), []);
  for (i = 0; i < 20; i += 1) {
    values.push({ plugin: '00000000-0000-0000-0000-' + ('00000000000' + i.toString(16)).slice(-12), category: 'category', item: 'item' });
  }
  values.push(values[0]);
  setValue(item, JSON.stringify(values));
  assert.equal(JSON.parse(component.manipulator.get.call(item)).length, 16);
  assert.equal(item.parseSources(JSON.stringify([values[0], values[0]])).length, 1);
  assert.equal(item.parseSources(JSON.stringify([{ plugin: 'plugin-id', category: 'category', item: 'item' }])).length, 0);
  assert.equal(item.parseSources(JSON.stringify([{ plugin: 'abcdefab-cdef-abcd-efab-cdefabcdefab', category: '', item: 'item' }])).length, 0);
  assert.equal(item.parseSources(JSON.stringify([{ plugin: 'abcdefab-cdef-abcd-efab-cdefabcdefab', action: 'set_on' }])).length, 0);
});

test('uppercase UUID selections normalize and deduplicate with lowercase catalogue IDs', function() {
  var letterUuid = 'abcdefab-cdef-abcd-efab-cdefabcdefab';
  var item = createItem({ catalogueEncoded: encodeURIComponent(JSON.stringify([{
    plugin: letterUuid, pluginName: 'Letters', category: 'event', item: 'today', properties: ['title']
  }])) });
  var lower = letterUuid;
  var uppercase = lower.toUpperCase();
  assert.notEqual(uppercase, lower);
  var choices = item.parseSources(JSON.stringify([
    { plugin: uppercase, category: 'event', item: 'today' },
    { plugin: lower, category: 'event', item: 'today' }
  ]));
  assert.deepEqual(choices, [{ plugin: lower, category: 'event', item: 'today' }]);
  setValue(item, JSON.stringify([{ plugin: uppercase, category: 'event', item: 'today' }]));
  openPlugin(item, lower);
  assert.equal(item.root.querySelectorAll('.plugin-source-unavailable').length, 0);
  assert.equal(item.root.querySelector('[data-plugin-index="0"]').checked, true);
});

test('metadata-to-selection roundtrip preserves opaque category and item whitespace', function() {
  var source = {
    plugin: 'abcdefab-cdef-abcd-efab-cdefabcdefab',
    pluginName: 'Opaque source',
    category: ' category ',
    item: ' item ',
    properties: ['value']
  };
  var item = createItem({ catalogueEncoded: encodeURIComponent(JSON.stringify([source])) });
  var checkbox = item.root.querySelector('[data-plugin-toggle]');
  checkbox.dispatchEvent(new item.window.Event('click', { bubbles: true }));
  openPlugin(item, source.plugin);
  checkbox = item.root.querySelector('[data-plugin-index="0"]');
  checkbox.checked = true;
  checkbox.dispatchEvent(new item.window.Event('change', { bubbles: true }));

  assert.deepEqual(JSON.parse(component.manipulator.get.call(item)), [{
    plugin: source.plugin,
    category: source.category,
    item: source.item
  }]);
});

test('checkbox change preserves checked state, keyboard focus, and open disclosure', function() {
  var item = createItem();
  var checkbox = item.root.querySelector('[data-plugin-index="0"]');
  var details = item.root.querySelector('.plugin-source-details');
  var group = item.root.querySelector('.plugin-source-group');
  item.root.querySelector('[data-plugin-toggle]').click();
  group.open = true;
  details.open = true;
  checkbox = item.root.querySelector('[data-plugin-index="0"]');
  checkbox.focus();
  checkbox.checked = true;
  checkbox.dispatchEvent(new item.window.Event('change', { bubbles: true }));

  assert.equal(item.root.ownerDocument.activeElement, checkbox);
  assert.equal(checkbox.checked, true);
  assert.equal(details.open, true);
  assert.equal(item.root.querySelectorAll('.plugin-source-group')[0], group);
});

test('interactive selection rejects seventeenth source and displays limit message', function() {
  var sources = [];
  var i;
  for (i = 0; i < 17; i += 1) {
    sources.push({ plugin: '00000000-0000-0000-0000-' + ('00000000000' + i.toString(16)).slice(-12), pluginName: 'Source ' + i, category: 'category', item: 'item-' + i, properties: [] });
  }
  var item = createItem({ catalogueEncoded: encodeURIComponent(JSON.stringify(sources)) });
  item.root.querySelector('[data-plugin-toggle]').dispatchEvent(new item.window.Event('click', { bubbles: true }));
  for (i = 0; i < 17; i += 1) {
    var checkbox = item.root.querySelector('[data-plugin-index="' + i + '"]');
    assert.equal(checkbox.disabled, false);
    checkbox.checked = true;
    checkbox.dispatchEvent(new item.window.Event('change', { bubbles: true }));
  }
  assert.equal(JSON.parse(component.manipulator.get.call(item)).length, 16);
  assert.equal(item.root.querySelector('[data-plugin-index="16"]').checked, false);
  assert.match(item.root.querySelector('[data-plugin-status]').textContent, /Maximum of 16/);
});

test('initialize runs from serialized source without module-scope helpers', function() {
  var source = '(' + component.initialize.toString() + ')';
  var initialize = vm.runInNewContext(source, {});
  var item = createItem(null, initialize);
  assert.equal(item.root.querySelectorAll('[data-plugin-index]').length, catalogue.length);
  assert.deepEqual(JSON.parse(component.manipulator.get.call(item)), []);
});

test('toggle and checkbox controls remain accessible and at least 44px tall', function() {
  var item = createItem();
  var toggle = item.root.querySelector('[data-plugin-toggle]');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.match(component.style, /min-height:52px/);
  assert.match(component.style, /width:48px;height:44px/);
  assert.match(component.style, /plugin-source-group-title\{[^}]*letter-spacing:normal;[^}]*text-transform:none;[^}]*transform:none/);
  assert.ok(item.root.querySelector('[data-plugin-index="0"]').getAttribute('aria-label'));
  toggle.dispatchEvent(new item.window.Event('click', { bubbles: true }));
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
});

test('scoped component rules override Clay base label layout and reset inherited label styles', function() {
  var clayBasePath = path.resolve(__dirname, '../../node_modules/@rebble/clay/src/styles/clay/_base.scss');
  var clayBase = fs.readFileSync(clayBasePath, 'utf8');
  var dom = new JSDOM('<!doctype html><html><head></head><body>' + component.template + '</body></html>');
  var baseStyle = dom.window.document.createElement('style');
  var componentStyle = dom.window.document.createElement('style');
  var root = dom.window.document.querySelector('.component-plugin-sources');
  var label;
  var computed;

  assert.match(clayBase, /label\s*\{[^}]*display:\s*flex;[^}]*justify-content:\s*space-between;[^}]*align-items:\s*center;[^}]*padding:/s,
    'test baseline tracks vendored Clay base label rule');
  baseStyle.textContent = 'label{display:flex;justify-content:space-between;align-items:center;padding:20px 24px;text-align:center;line-height:2}';
  componentStyle.textContent = component.style;
  dom.window.document.head.appendChild(baseStyle);
  dom.window.document.head.appendChild(componentStyle);
  label = dom.window.document.createElement('label');
  label.className = 'plugin-source-row';
  root.appendChild(label);
  computed = dom.window.getComputedStyle(label);

  assert.equal(computed.display, 'grid');
  assert.notEqual(computed.justifyContent, 'space-between');
  assert.equal(computed.paddingTop, '0.25rem');
  assert.equal(computed.textAlign, 'left');
  assert.equal(computed.lineHeight, 'normal');
});

test('plugin separators distinguish plugin boundaries from source-action divider', function() {
  var dom = new JSDOM('<!doctype html><html><head><style>' + component.style + '</style></head><body>' +
    '<div class="component-plugin-sources">' +
      '<section class="plugin-source-group" data-has-sources><section class="plugin-source-group component-plugin-actions plugin-action-group" data-plugin-kind="actions"></section></section>' +
      '<section class="plugin-source-group" data-has-sources></section>' +
      '<section class="plugin-source-group component-plugin-actions plugin-action-group" data-plugin-kind="actions"></section>' +
    '</div></body></html>');
  var groups = dom.window.document.querySelectorAll('.component-plugin-sources > .plugin-source-group');
  var mixedAction = groups[0].querySelector('.plugin-action-group');
  var sourceOnly = groups[1];
  var actionOnly = groups[2];
  var style = dom.window.getComputedStyle;
  var actionRow = dom.window.document.createElement('div');
  var unavailableAction = dom.window.document.createElement('div');
  actionRow.className = 'plugin-source-row plugin-action-row';
  unavailableAction.className = 'plugin-source-unavailable';
  mixedAction.appendChild(actionRow);
  mixedAction.appendChild(unavailableAction);

  assert.equal(style(groups[0]).borderBottomWidth, '2px');
  assert.equal(style(groups[0]).borderBottomColor, 'rgb(135, 147, 161)');
  assert.equal(style(sourceOnly).borderBottomWidth, '2px');
  assert.equal(style(actionOnly).borderBottomWidth, '2px');
  assert.equal(style(mixedAction).borderTopWidth, '1px');
  assert.equal(style(mixedAction).borderTopColor, 'rgb(116, 123, 132)');
  assert.equal(style(mixedAction).borderBottomWidth, '0px');
  assert.equal(style(actionRow).borderBottomWidth, '0px');
  assert.equal(style(unavailableAction).borderBottomWidth, '0px');
});

test('narrow viewport rules allow rows and long metadata to wrap without fixed overflow', function() {
  assert.match(component.style, /\.component-plugin-sources\{[^}]*min-width:0;max-width:100%/);
  assert.match(component.style, /grid-template-columns:minmax\(0,1fr\) 48px/);
  assert.match(component.style, /overflow-wrap:anywhere/);
  [320, 360].forEach(function(width) {
    var dom = new JSDOM('<!doctype html><html><body>' + component.template + '</body></html>', { pretendToBeVisual: true });
    dom.window.document.body.style.width = width + 'px';
    assert.equal(parseInt(dom.window.document.body.style.width, 10), width);
    assert.match(component.style, /max-width:100%/);
  });
});
