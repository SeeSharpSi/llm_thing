'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');
var createFakePebble = require('../js/helpers/fake_pebble');
var FakeLocalStorage = require('../js/helpers/fake_local_storage');
var FakeXMLHttpRequest = require('../js/helpers/fake_xhr');

var root = path.resolve(__dirname, '../..');

test('built PebbleKit bundle loads and registers runtime handlers', function() {
  var source = fs.readFileSync(path.join(root, 'build/pebble-js-app.js'), 'utf8');
  var pebble = createFakePebble();
  var sandbox = {
    Pebble: pebble,
    localStorage: new FakeLocalStorage(),
    XMLHttpRequest: FakeXMLHttpRequest,
    navigator: {},
    console: { log: function() {}, error: function() {}, warn: function() {} },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Date: Date,
    Math: Math,
    JSON: JSON,
    encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent
  };

  vm.runInNewContext(source, sandbox, { filename: 'build/pebble-js-app.js' });

  ['ready', 'showConfiguration', 'webviewclosed', 'appmessage'].forEach(function(name) {
    assert.ok(pebble.listeners[name] && pebble.listeners[name].length > 0, name + ' listener missing');
  });

  pebble.emit('ready');
  assert.ok(pebble.messages.length > 0);
  assert.equal(pebble.messages[0].FontSize, 18);
  assert.equal(pebble.messages[0].TouchScrollEnabled, 1);

  pebble.emit('showConfiguration');
  assert.equal(pebble.openedUrls.length, 1);
  assert.match(pebble.openedUrls[0], /^data:text\/html/);
  var configHtml = decodeURIComponent(pebble.openedUrls[0].split(',').slice(1).join(','));
  var componentEnd = configHtml.indexOf('item.reloadModels = function');
  var firstScriptEnd = configHtml.indexOf('</script>');

  assert.ok(componentEnd > 0, 'model selector source missing');
  assert.ok(componentEnd < firstScriptEnd, 'model selector source escaped its script');
});
