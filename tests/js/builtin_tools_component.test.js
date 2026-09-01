'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var JSDOM = require('jsdom').JSDOM;
var component = require('../../src/pkjs/builtin_tools_component');

function createItem() {
  var dom = new JSDOM('<!doctype html><html><body>' + component.template + '</body></html>');
  var root = dom.window.document.querySelector('.component-builtin-tools');
  var target = root.querySelector('[data-manipulator-target]');
  var events = [];
  var item = {
    $element: [root],
    $manipulatorTarget: {
      set: function(name, value) {
        if (name === 'value') {
          target.value = value;
        }
      }
    },
    trigger: function(name) {
      events.push(name);
      return item;
    }
  };

  component.initialize.call(item);
  item.events = events;
  item.window = dom.window;
  item.root = root;
  item.target = target;
  item.body = root.querySelector('[data-builtin-body]');
  return item;
}

function fakeToolRoot(window, label) {
  var root = window.document.createElement('div');

  root.className = 'component component-fake-tool';
  root.setAttribute('data-fake-tool', label);
  root.innerHTML = '<label><input data-manipulator-target type="checkbox" /> ' + label + '</label>';
  return root;
}

function click(item, element) {
  element.dispatchEvent(new item.window.Event('click', { bubbles: true }));
}

function appendedControls(item) {
  return Array.prototype.slice.call(item.body.querySelectorAll('[data-fake-tool] input, [data-fake-tool] button'));
}

test('renders header, subtitle, hidden body, and hidden manipulator target', function() {
  var item = createItem();

  assert.equal(item.root.querySelector('.builtin-toggle-title').textContent, 'Built-in Tools');
  assert.ok(item.root.querySelector('.builtin-toggle-subtitle').textContent.length > 0);
  assert.equal(item.body.style.display, 'none');
  assert.equal(item.target.getAttribute('type'), 'hidden');
});

test('starts collapsed without the open class', function() {
  var item = createItem();

  assert.equal(item.body.style.display, 'none');
  assert.equal(item.root.className.indexOf('open'), -1);
});

test('appendItems disables appended controls while collapsed and keeps target enabled', function() {
  var item = createItem();
  var controls;

  assert.equal(item.appendItems([fakeToolRoot(item.window, 'Web Fetch'), fakeToolRoot(item.window, 'Max Tool Calls')]), 2);

  controls = appendedControls(item);
  assert.equal(controls.length, 2);
  controls.forEach(function(control) {
    assert.equal(control.disabled, true);
  });
  assert.equal(item.target.disabled, false);
  assert.equal(item.body.style.display, 'none');

  click(item, item.root.querySelector('[data-builtin-toggle]'));
  assert.equal(item.body.style.display, 'block');
  appendedControls(item).forEach(function(control) {
    assert.equal(control.disabled, false);
  });
});

test('delegated clicks on the toggle button and nested title and subtitle expand and collapse', function() {
  var item = createItem();

  click(item, item.root.querySelector('[data-builtin-toggle]'));
  assert.equal(item.body.style.display, 'block');
  assert.ok(item.root.className.indexOf('open') !== -1);

  click(item, item.root.querySelector('.builtin-toggle-title'));
  assert.equal(item.body.style.display, 'none');
  assert.equal(item.root.className.indexOf('open'), -1);

  click(item, item.root.querySelector('.builtin-toggle-subtitle'));
  assert.equal(item.body.style.display, 'block');
  assert.ok(item.root.className.indexOf('open') !== -1);

  click(item, item.root.querySelector('[data-builtin-toggle]'));
  assert.equal(item.body.style.display, 'none');
});

test('appendItems moves Clay item roots into the body and respects expanded state', function() {
  var item = createItem();
  var first = fakeToolRoot(item.window, 'Geolocation');
  var second = fakeToolRoot(item.window, 'Timeline');

  click(item, item.root.querySelector('[data-builtin-toggle]'));
  assert.equal(item.appendItems([first]), 1);
  assert.equal(first.parentNode, item.root.querySelector('[data-builtin-list]'));
  assert.ok(item.body.contains(first));
  assert.equal(first.querySelector('input').disabled, false);

  assert.equal(item.appendItems([second, null, undefined]), 1);
  assert.ok(item.body.contains(second));
  assert.equal(second.querySelector('input').disabled, false);

  click(item, item.root.querySelector('[data-builtin-toggle]'));
  assert.equal(item.body.style.display, 'none');
  assert.equal(first.querySelector('input').disabled, true);
  assert.equal(second.querySelector('input').disabled, true);
  assert.equal(item.target.disabled, false);
});

test('clicks inside appended tool content do not toggle the expander', function() {
  var item = createItem();
  var tool = fakeToolRoot(item.window, 'Health');

  item.appendItems([tool]);
  click(item, tool.querySelector('input'));
  assert.equal(item.body.style.display, 'none');
});
