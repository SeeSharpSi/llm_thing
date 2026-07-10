'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var JSDOM = require('jsdom').JSDOM;
var component = require('../../src/pkjs/mcp_servers_component');

function createItem() {
  var dom = new JSDOM('<!doctype html><html><body>' + component.template + '</body></html>');
  var root = dom.window.document.querySelector('.component-mcp-servers');
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
  return item;
}

function setValue(item, value) {
  return component.manipulator.set.call(item, value);
}

test('parses malformed and empty values into one blank server', function() {
  var item = createItem();

  assert.equal(item.parseServers('{bad').length, 1);
  assert.equal(item.parseServers('{}').length, 1);
  assert.deepEqual(item.parseServers('[]')[0], {
    enabled: false,
    label: '',
    url: '',
    description: '',
    allowedTools: '',
    maxToolCalls: '',
    authorization: '',
    headers: []
  });
});

test('renders, escapes, collects, and serializes server data', function() {
  var item = createItem();
  var value = JSON.stringify([{
    enabled: '1',
    label: ' Docs <main> ',
    url: ' https://example.test/mcp ',
    description: ' Search & read ',
    allowedTools: ' search ',
    maxToolCalls: ' 0 ',
    authorization: ' secret ',
    headers: [{ name: ' X-Key ', value: ' value "quoted" ' }]
  }]);

  setValue(item, value);
  var collected = item.collectServers();

  assert.deepEqual(collected, [{
    enabled: true,
    label: 'Docs <main>',
    url: 'https://example.test/mcp',
    description: 'Search & read',
    allowedTools: 'search',
    maxToolCalls: '0',
    authorization: 'secret',
    headers: [{ name: 'X-Key', value: 'value "quoted"' }]
  }]);
  assert.equal(item.root.querySelector('[data-mcp-field="label"]').value, 'Docs <main>');
  assert.deepEqual(JSON.parse(component.manipulator.get.call(item)), collected);
});

test('direct buttons toggle, add, and delete servers and headers', function() {
  var item = createItem();
  setValue(item, '[]');
  var Event = item.window.Event;
  var toggle = item.root.querySelector('[data-mcp-toggle]');

  toggle.dispatchEvent(new Event('click', { bubbles: true }));
  assert.equal(item.root.querySelector('[data-mcp-body]').style.display, 'block');

  item.root.querySelector('[data-mcp-add]').dispatchEvent(new Event('click', { bubbles: true }));
  assert.equal(item.root.querySelectorAll('[data-mcp-server]').length, 2);

  item.root.querySelector('[data-mcp-header-add]').dispatchEvent(new Event('click', { bubbles: true }));
  assert.equal(item.root.querySelectorAll('[data-mcp-header-row]').length, 1);
  item.root.querySelector('[data-mcp-header-delete]').dispatchEvent(new Event('click', { bubbles: true }));
  assert.equal(item.root.querySelectorAll('[data-mcp-header-row]').length, 0);

  item.root.querySelector('[data-mcp-delete]').dispatchEvent(new Event('click', { bubbles: true }));
  assert.equal(item.root.querySelectorAll('[data-mcp-server]').length, 1);
});

test('input and change events synchronize hidden Clay value', function() {
  var item = createItem();
  setValue(item, '[]');
  var input = item.root.querySelector('[data-mcp-field="label"]');
  input.value = 'Updated';
  input.dispatchEvent(new item.window.Event('input', { bubbles: true }));

  assert.equal(JSON.parse(item.target.value)[0].label, 'Updated');
  assert.ok(item.events.filter(function(name) { return name === 'change'; }).length >= 2);
});

test.todo('clicking nested MCP title and subtitle toggles expander');
test.todo('clicking nested plus icon adds MCP server');
test.todo('collapsed invalid MCP fields do not block settings submission invisibly');
