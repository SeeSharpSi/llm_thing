var Clay = require('@rebble/clay');
var clayConfig = require('./config');
var mcpServersComponent = require('./mcp_servers_component');
var modelDiscovery = require('./model_discovery');
var modelSelectorComponent = require('./model_selector_component');
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
    var configAction = self.getItemByMessageKey('ConfigAction');

    if (configAction) {
      configAction.hide();
      configAction.set('');
    }

    if (deleteAllButton && configAction) {
      deleteAllButton.on('click', function() {
        var submitButton;

        if (!confirm('Delete all saved chats from this phone?')) {
          return;
        }

        configAction.set('delete_saved_chats');
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
clay.registerComponent(modelSelectorComponent);

function findConfigItem(items, messageKey) {
  var found = null;

  (items || []).some(function(item) {
    if (item.messageKey === messageKey) {
      found = item;
      return true;
    }
    found = findConfigItem(item.items, messageKey);
    return !!found;
  });
  return found;
}

function setDiscoveredModels(result) {
  var modelItem = findConfigItem(clay.config, 'Model');

  if (!modelItem) {
    return;
  }
  modelItem.modelsEncoded = encodeURIComponent(JSON.stringify(result.models || []));
  modelItem.modelsStatus = result.status || '';
}

function openConfiguration(currentSettings) {
  clay.setSettings(currentSettings);
  modelDiscovery.discover(currentSettings, function(result) {
    settings.logDebug('configuration model discovery count=' + result.models.length);
    setDiscoveredModels(result);
    Pebble.openURL(clay.generateUrl());
  });
}

Pebble.addEventListener('ready', function() {
  settings.logDebug('ready');
  model.resetChatHistory();
  watch.syncWatchSettings(settings.loadSettings());
});

Pebble.addEventListener('showConfiguration', function() {
  var currentSettings = settings.loadSettings();

  settings.logDebug('show configuration');
  openConfiguration(currentSettings);
});

Pebble.addEventListener('webviewclosed', function(e) {
  var savedSettings;
  var normalizedSettings;
  var settingsAction;

  if (!e || !e.response) {
    settings.logDebug('configuration closed without response');
    return;
  }

  settings.logDebug('configuration saved');
  try {
    savedSettings = clay.getSettings(e.response, false);
  } catch (error) {
    settings.logDebug('configuration response invalid: ' + String(error && error.message || error));
    return;
  }
  settingsAction = savedSettings.ConfigAction;
  if (settingsAction && typeof settingsAction === 'object' && settingsAction.value !== undefined) {
    settingsAction = settingsAction.value;
  }
  delete savedSettings.ConfigAction;
  normalizedSettings = settings.extend(settings.DEFAULT_SETTINGS, savedSettings);
  if (settingsAction === 'delete_saved_chats') {
    settings.logDebug('delete all saved chats from settings');
    model.deleteAllSavedChats();
  } else if (settingsAction === 'reload_models') {
    settings.logDebug('reopening configuration with refreshed models');
  } else if (settingsAction) {
    settings.logDebug('ignored unknown configuration action');
    settingsAction = '';
  }
  settings.saveSettings(normalizedSettings);
  watch.syncWatchSettings(normalizedSettings);
  if (settingsAction === 'reload_models') {
    openConfiguration(normalizedSettings);
  }
});

Pebble.addEventListener('appmessage', function(e) {
  var dict = e.payload || {};
  var requestId = dict.RequestId || 0;

  if (dict.HealthSummaryRequest) {
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
