var Clay = require('@rebble/clay');
var clayConfig = require('./config');
var mcpServersComponent = require('./mcp_servers_component');
var settings = require('./settings');
var watch = require('./watch');
var model = require('./model');

function clayCustomFn() {
  var self = this;
  var watchDisplayKeys = [
    'FontSize',
    'BuzzStrength',
    'ScrollLines',
    'TouchScrollEnabled',
    'TextColor',
    'BackgroundColor',
    'PromptBackgroundColor',
    'BoldTextColor',
    'StartDictationQuickLaunch'
  ];

  self.on(self.EVENTS.AFTER_BUILD, function() {
    var resetButton = self.getItemById('ResetWatchDisplay');
    if (!resetButton) {
      return;
    }

    resetButton.on('click', function() {
      watchDisplayKeys.forEach(function(key) {
        var item = self.getItemByMessageKey(key);
        if (item) {
          item.set(item.config.defaultValue);
        }
      });
    });
  });
}

var clay = new Clay(clayConfig, clayCustomFn, { autoHandleEvents: false });
clay.registerComponent(mcpServersComponent);

Pebble.addEventListener('ready', function() {
  settings.logDebug('ready');
  model.resetChatHistory();
  watch.syncWatchSettings(settings.loadSettings());
});

Pebble.addEventListener('showConfiguration', function() {
  settings.logDebug('show configuration');
  clay.setSettings(settings.loadSettings());
  Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener('webviewclosed', function(e) {
  var savedSettings;

  if (!e || !e.response) {
    settings.logDebug('configuration closed without response');
    return;
  }

  settings.logDebug('configuration saved');
  savedSettings = clay.getSettings(e.response, false);
  settings.saveSettings(savedSettings);
  watch.syncWatchSettings(settings.extend(settings.DEFAULT_SETTINGS, savedSettings));
});

Pebble.addEventListener('appmessage', function(e) {
  var dict = e.payload || {};
  var requestId = dict.RequestId || 0;

  if (dict.HealthSummaryRequest && (dict.HealthSummaryJson !== undefined || dict.HealthSummaryError !== undefined)) {
    watch.handleHealthSummaryResponse(dict);
    return;
  }

  if (dict.ChatReset) {
    settings.logDebug('appmessage chat reset');
    model.resetChatHistory();
  }

  if (dict.RequestText) {
    settings.logDebug('appmessage request id=' + requestId + ' textChars=' + String(dict.RequestText || '').length);
    model.requestCompletion(requestId, dict.RequestText);
  }
});
