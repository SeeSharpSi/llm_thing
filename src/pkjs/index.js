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
    var deleteAllButton = self.getItemById('DeleteAllPastChats');
    var deleteAllFlag = self.getItemByMessageKey('DeleteAllPastChats');

    if (deleteAllFlag) {
      deleteAllFlag.hide();
      deleteAllFlag.set('0');
    }

    if (deleteAllButton && deleteAllFlag) {
      deleteAllButton.on('click', function() {
        var submitButton;

        if (!confirm('Delete all saved chats from this phone?')) {
          return;
        }

        deleteAllFlag.set('1');
        submitButton = document.querySelector('.component-submit button');
        if (submitButton) {
          submitButton.click();
        }
      });
    }

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
  var normalizedSettings;

  if (!e || !e.response) {
    settings.logDebug('configuration closed without response');
    return;
  }

  settings.logDebug('configuration saved');
  savedSettings = clay.getSettings(e.response, false);
  normalizedSettings = settings.extend(settings.DEFAULT_SETTINGS, savedSettings);
  if (normalizedSettings.DeleteAllPastChats) {
    settings.logDebug('delete all saved chats from settings');
    model.deleteAllSavedChats();
    normalizedSettings.DeleteAllPastChats = false;
  }
  settings.saveSettings(normalizedSettings);
  watch.syncWatchSettings(normalizedSettings);
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

  if (dict.PastChatsRequest) {
    var listSettings = settings.loadSettings();
    settings.logDebug('appmessage past chats request preserve=' + (listSettings.PreserveChats ? '1' : '0'));
    if (!listSettings.PreserveChats) {
      watch.sendPastChatsError('Enable Preserve Chats in settings.');
      return;
    }
    watch.sendPastChats(model.listSavedChats());
    return;
  }

  if (dict.PastChatLoad) {
    var loadSettings = settings.loadSettings();
    var chat = null;

    settings.logDebug('appmessage past chat load id=' + dict.PastChatLoad);
    if (!loadSettings.PreserveChats) {
      watch.sendPastChatsError('Enable Preserve Chats in settings.');
      return;
    }

    chat = model.loadSavedChat(dict.PastChatLoad);
    if (!chat) {
      watch.sendPastChatsError('Saved chat not found.');
      return;
    }
    watch.sendPastChatTranscript(chat, loadSettings);
    return;
  }

  if (dict.PastChatDelete) {
    settings.logDebug('appmessage past chat delete id=' + dict.PastChatDelete);
    model.deleteSavedChat(dict.PastChatDelete);
    watch.sendPastChatDeleted(dict.PastChatDelete);
    watch.sendPastChats(model.listSavedChats());
    return;
  }

  if (dict.RequestText) {
    settings.logDebug('appmessage request id=' + requestId + ' textChars=' + String(dict.RequestText || '').length);
    model.requestCompletion(requestId, dict.RequestText);
  }
});
