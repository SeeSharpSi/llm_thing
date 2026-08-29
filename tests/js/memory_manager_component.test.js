'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var JSDOM = require('jsdom').JSDOM;
var component = require('../../src/pkjs/memory_manager_component');

function createItem() {
  var dom = new JSDOM('<!doctype html><html><body>' + component.template + '</body></html>');
  var root = dom.window.document.querySelector('.component-memory-manager');
  var target = root.querySelector('[data-manipulator-target]');
  var events = [];
  var item = { $element: [root], $manipulatorTarget: { set: function(name, value) { if (name === 'value') { target.value = value; } } }, trigger: function(name) { events.push(name); return item; } };
  component.initialize.call(item);
  item.root = root; item.target = target; item.window = dom.window; item.events = events;
  return item;
}

function setValue(item, value) { component.manipulator.set.call(item, value); }

test('empty and malformed values render safely', function() {
  var item = createItem();
  setValue(item, '{bad');
  assert.equal(item.root.querySelectorAll('[data-memory-note]').length, 0);
  setValue(item, JSON.stringify([{ id: 'one', text: 'hello', createdAt: 10, updatedAt: 11 }]));
  assert.equal(item.root.querySelector('[data-memory-field="text"]').value, 'hello');
});

test('escapes and serializes notes, dropping empty text and preserving metadata', function() {
  var item = createItem();
  setValue(item, JSON.stringify([{ id: 'x', text: '<b>&"', createdAt: 10, updatedAt: 11 }, { id: 'empty', text: '   ', createdAt: 1, updatedAt: 2 }]));
  assert.equal(item.root.querySelector('[data-memory-field="text"]').textContent, '<b>&"');
  assert.deepEqual(JSON.parse(component.manipulator.get.call(item)), [{ id: 'x', text: '<b>&"', createdAt: 10, updatedAt: 11 }]);
});

test('add, edit, and delete use delegated events and bounded text', function() {
  var item = createItem();
  var Event = item.window.Event;
  item.root.querySelector('[data-memory-toggle]').dispatchEvent(new Event('click', { bubbles: true }));
  item.root.querySelector('[data-memory-add]').dispatchEvent(new Event('click', { bubbles: true }));
  var field = item.root.querySelector('[data-memory-field="text"]');
  assert.equal(field.maxLength, 500);
  field.value = Array(503).join('x');
  field.dispatchEvent(new Event('input', { bubbles: true }));
  assert.equal(JSON.parse(item.target.value)[0].text.length, 500);
  item.root.querySelector('[data-memory-delete]').dispatchEvent(new Event('click', { bubbles: true }));
  assert.deepEqual(JSON.parse(item.target.value), []);
  assert.ok(item.events.indexOf('change') !== -1);
});

test('collapsed controls are disabled but hidden target stays enabled and list scrolls', function() {
  var item = createItem();
  assert.equal(item.root.querySelector('[data-memory-body]').style.display, 'none');
  assert.equal(item.root.querySelector('[data-memory-add]').disabled, true);
  assert.equal(item.target.disabled, false);
  assert.match(component.style, /max-height:[^;]+;overflow-y:auto/);
  item.root.querySelector('[data-memory-toggle]').dispatchEvent(new item.window.Event('click', { bubbles: true }));
  assert.equal(item.root.querySelector('[data-memory-add]').disabled, false);
});
