'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var JSDOM = require('jsdom').JSDOM;
var component = require('../../src/pkjs/model_selector_component');
var clayConfig = require('../../src/pkjs/config');

function createConfigItem(value) {
  var listeners = [];

  return {
    get: function() { return value; },
    set: function(nextValue) { value = nextValue; },
    on: function(name, listener) {
      if (name === 'change') {
        listeners.push(listener);
      }
    },
    setValue: function(nextValue) {
      value = nextValue;
      listeners.forEach(function(listener) { listener(); });
    }
  };
}

function createItem(options) {
  var dom = new JSDOM('<!doctype html><html><body>' + component.template + '<div class="component-submit"><button type="button">Submit</button></div></body></html>');
  var root = dom.window.document.querySelector('.component-model-selector');
  var target = root.querySelector('[data-manipulator-target]');
  var events = [];
  var afterBuild = [];
  var endpoint = createConfigItem(options && options.endpoint);
  var apiKey = createConfigItem(options && options.apiKey);
  var reloadModels = createConfigItem('');
  var configItems = { Endpoint: endpoint, ApiKey: apiKey, ConfigAction: reloadModels };
  var submitCount = 0;
  var clay = {
    EVENTS: { AFTER_BUILD: 'AFTER_BUILD' },
    on: function(name, listener) {
      if (name === 'AFTER_BUILD') {
        afterBuild.push(listener);
      }
    },
    getItemByMessageKey: function(key) { return configItems[key]; }
  };
  var item = {
    config: {
      modelsEncoded: options && options.modelsEncoded || '',
      modelsStatus: options && options.modelsStatus || ''
    },
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

  component.initialize.call(item, null, clay);
  afterBuild.forEach(function(listener) { listener(); });
  dom.window.document.querySelector('.component-submit button').addEventListener('click', function() {
    submitCount += 1;
  });
  item.events = events;
  item.window = dom.window;
  item.root = root;
  item.target = target;
  item.endpoint = endpoint;
  item.apiKey = apiKey;
  item.reloadModelsItem = reloadModels;
  item.submitCount = function() { return submitCount; };
  return item;
}

function setValue(item, value) {
  return component.manipulator.set.call(item, value);
}

function click(item, selector) {
  item.root.querySelector(selector).dispatchEvent(new item.window.Event('click', { bubbles: true }));
}

test('manual input remains the serialized model value', function() {
  var item = createItem();
  var customInput = item.root.querySelector('[data-model-custom]');

  setValue(item, ' saved-model ');
  assert.equal(component.manipulator.get.call(item), 'saved-model');
  assert.equal(item.target.value, 'saved-model');
  assert.equal(customInput.value, 'saved-model');

  customInput.value = 'custom-model';
  customInput.dispatchEvent(new item.window.Event('input', { bubbles: true }));
  assert.equal(component.manipulator.get.call(item), 'custom-model');
  assert.equal(item.target.value, 'custom-model');
  assert.ok(item.events.filter(function(name) { return name === 'change'; }).length >= 2);
});

test('renders phone-side preloaded models', function() {
  var item = createItem({
    modelsEncoded: encodeURIComponent(JSON.stringify(['model-a', 'model-b'])),
    modelsStatus: 'Preloaded on phone.'
  });
  var select = item.root.querySelector('[data-model-select]');

  setValue(item, 'model-b');

  assert.deepEqual(Array.from(select.options).map(function(option) { return option.value; }), ['', 'model-a', 'model-b']);
  assert.equal(select.value, 'model-b');
  assert.equal(select.disabled, false);
  assert.equal(item.root.querySelector('[data-model-custom-row]').style.display, 'none');
  assert.equal(item.root.querySelector('[data-model-status]').textContent, 'Preloaded on phone.');
});

test('selecting a preloaded model updates the serialized value', function() {
  var item = createItem({
    modelsEncoded: encodeURIComponent(JSON.stringify(['model-a', 'model-b']))
  });
  var select = item.root.querySelector('[data-model-select]');

  setValue(item, 'model-b');
  select.value = 'model-a';
  select.dispatchEvent(new item.window.Event('change', { bubbles: true }));
  assert.equal(component.manipulator.get.call(item), 'model-a');
  assert.equal(item.target.value, 'model-a');
});

test('keeps saved custom model when preloaded list does not contain it', function() {
  var item = createItem({
    modelsEncoded: encodeURIComponent(JSON.stringify(['listed-model']))
  });
  var select = item.root.querySelector('[data-model-select]');

  setValue(item, 'provider-custom');

  assert.equal(select.value, '');
  assert.equal(item.root.querySelector('[data-model-custom-row]').style.display, 'block');
  assert.equal(item.root.querySelector('[data-model-custom]').value, 'provider-custom');
  assert.equal(component.manipulator.get.call(item), 'provider-custom');
});

test('endpoint changes invalidate models and Save & Refresh submits the explicit refresh flow', function() {
  var item = createItem({
    endpoint: 'https://old.example/v1/responses',
    apiKey: 'test-secret',
    modelsEncoded: encodeURIComponent(JSON.stringify(['old-model']))
  });
  var select = item.root.querySelector('[data-model-select]');

  item.endpoint.setValue('https://new.example/v1/responses');
  assert.equal(select.disabled, true);
  assert.match(item.root.querySelector('[data-model-status]').textContent, /Save & Refresh Models/);
  assert.match(item.root.querySelector('[data-model-status]').textContent, /reopen settings/);

  click(item, '[data-model-load]');
  assert.equal(item.root.querySelector('[data-model-load]').textContent, 'Save & Refresh Models');
  assert.equal(item.reloadModelsItem.get(), 'reload_models');
  assert.equal(item.submitCount(), 1);
  assert.equal(item.root.querySelector('[data-model-load]').disabled, true);
  assert.equal(item.root.querySelector('[data-model-status]').textContent,
    'Saving settings and refreshing models. Reopen settings to select the updated list.');
});

test('manual entry and reopen-after-refresh instructions are available without a model list', function() {
  var item = createItem();
  var customInput = item.root.querySelector('[data-model-custom]');
  var select = item.root.querySelector('[data-model-select]');

  assert.equal(select.disabled, true);
  assert.equal(customInput.parentNode.style.display, 'block');
  assert.match(component.defaults.description, /reopen settings/i);
  assert.match(JSON.stringify(clayConfig), /Save & Refresh Models.*reopen settings/i);
  customInput.value = 'manual-provider-model';
  customInput.dispatchEvent(new item.window.Event('input', { bubbles: true }));
  assert.equal(component.manipulator.get.call(item), 'manual-provider-model');
});
