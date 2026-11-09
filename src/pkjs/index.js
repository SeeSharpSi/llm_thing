var Clay = require('@rebble/clay');
var clayConfig = require('./config');
var builtinToolsComponent = require('./builtin_tools_component');
var settingsIoComponent = require('./settings_io_component');
var pluginSourcesComponent = require('./plugin_sources_component');
var pluginActionsComponent = require('./plugin_actions_component');
var mcpServersComponent = require('./mcp_servers_component');
var memoryManagerComponent = require('./memory_manager_component');
var modelDiscovery = require('./model_discovery');
var modelSelectorComponent = require('./model_selector_component');
var settings = require('./settings');
var watch = require('./watch');
var model = require('./model');
var memoryStore = require('./memory_store');
var tools = require('./tools');
var pluginSources = require('./plugin_sources');
var pluginActions = require('./plugin_actions');

function clayCustomFn() {
  var self = this;
  var watchDisplayKeys = [
    'FontSize',
    'BuzzStrength',
    'SpeakerFeedbackEnabled',
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
    var memoryToggle = self.getItemByMessageKey('PebbleMemoryToolEnabled');
    var memoryManager = self.getItemByMessageKey('MemoriesJson');
    var pluginSourcesItem = self.getItemByMessageKey('PluginSourcesJson');
    var pluginActionsItem = self.getItemByMessageKey('PluginActionsJson');
    var builtinTools = self.getItemById('BuiltinTools');
    var builtinToolKeys = [
      'WebSearchEnabled',
      'GeolocationToolEnabled',
      'TimelineToolEnabled',
      'HealthToolEnabled',
      'SleepToolEnabled',
      'PebbleMemoryToolEnabled',
      'MaxToolCalls'
    ];
    var toolRoots = [];

    function memoryEnabled() {
      var value = memoryToggle && memoryToggle.get ? memoryToggle.get() : false;
      return value === true || value === 1 || value === '1';
    }

    function updateMemoryVisibility() {
      if (!memoryManager) {
        return;
      }
      if (memoryEnabled()) {
        memoryManager.show();
      } else {
        memoryManager.hide();
      }
    }

    if (memoryToggle) {
      memoryToggle.on('change', updateMemoryVisibility);
    }
    updateMemoryVisibility();

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

    if (builtinTools && typeof builtinTools.appendItems === 'function') {
      builtinToolKeys.forEach(function(key) {
        var toolItem = self.getItemByMessageKey(key);
        if (toolItem && toolItem.$element && toolItem.$element[0]) {
          toolRoots.push(toolItem.$element[0]);
        }
      });
      builtinTools.appendItems(toolRoots);
    }

    if (pluginActionsItem && pluginActionsItem.$element && pluginActionsItem.$element[0]) {
      if (pluginSourcesItem && typeof pluginSourcesItem.appendActions === 'function') {
        if (pluginActionsItem.show) { pluginActionsItem.show(); }
        if (!pluginSourcesItem.appendActions(pluginActionsItem.$element[0]) && pluginActionsItem.hide) {
          pluginActionsItem.hide();
        }
      } else if (pluginActionsItem.hide) {
        pluginActionsItem.hide();
      }
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
clay.registerComponent(memoryManagerComponent);
clay.registerComponent(builtinToolsComponent);
clay.registerComponent(settingsIoComponent);
clay.registerComponent(pluginSourcesComponent);
clay.registerComponent(pluginActionsComponent);

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

function setPluginSourceCatalogue() {
  var item = findConfigItem(clay.config, 'PluginSourcesJson');
  var result;

  if (!item) {
    return;
  }
  try {
    if (!pluginSources || typeof pluginSources.getCatalogue !== 'function') {
      throw new Error('Plugin source catalogue is not supported by this phone.');
    }
    result = pluginSources.getCatalogue() || {};
    item.catalogueEncoded = encodeURIComponent(JSON.stringify(Array.isArray(result.sources) ? result.sources : []));
    item.catalogueStatus = result.status || '';
  } catch (error) {
    item.catalogueEncoded = encodeURIComponent('[]');
    item.catalogueStatus = String(error && error.message || 'Plugin source catalogue unavailable on this phone.');
  }
}

function setPluginActionCatalogue() {
  var item = findConfigItem(clay.config, 'PluginActionsJson');
  var result;

  if (!item) {
    return;
  }
  try {
    result = pluginActions.getCatalogue() || {};
    item.catalogueEncoded = encodeURIComponent(JSON.stringify(Array.isArray(result.actions) ? result.actions : []));
    item.catalogueStatus = result.status || '';
  } catch (error) {
    item.catalogueEncoded = encodeURIComponent('[]');
    item.catalogueStatus = String(error && error.message || 'Plugin action catalogue unavailable on this phone.');
  }
}

function openConfiguration(currentSettings) {
  var configurationSettings = settings.extend(currentSettings, {});
  if (memoryStore && memoryStore.listMemories) {
    try {
      configurationSettings.MemoriesJson = JSON.stringify(memoryStore.listMemories(memoryStore.MAX_MEMORIES));
    } catch (error) {
      settings.logDebug('memory listing failed: ' + String(error && error.message || error));
    }
  }
  clay.setSettings(configurationSettings);
  setDiscoveredModels(modelDiscovery.getCached(currentSettings));
  setPluginSourceCatalogue();
  setPluginActionCatalogue();
  Pebble.openURL(clay.generateUrl());
}

Pebble.addEventListener('ready', function() {
  var startupSettings = settings.loadSettings();

  settings.logDebug('ready');
  model.resetChatHistory();
  watch.syncWatchSettings(startupSettings, true);
  tools.warmMcpTools(startupSettings);
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
  var memoryJson;
  var memoryRecords;

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
  if (savedSettings.MemoriesJson !== undefined) {
    memoryJson = savedSettings.MemoriesJson;
    if (memoryJson && typeof memoryJson === 'object' && memoryJson.value !== undefined) {
      memoryJson = memoryJson.value;
    }
    try {
      memoryRecords = JSON.parse(memoryJson);
      if (Array.isArray(memoryRecords)) {
        if (memoryStore && memoryStore.replaceMemories) {
          if (!memoryStore.replaceMemories(memoryRecords)) {
            settings.logDebug('memory replacement failed');
          }
        }
      }
    } catch (error) {
      settings.logDebug('memory replacement failed: ' + String(error && error.message || error));
    }
    delete savedSettings.MemoriesJson;
  }
  normalizedSettings = settings.extend(settings.DEFAULT_SETTINGS, savedSettings);
  if (settingsAction === 'delete_saved_chats') {
    settings.logDebug('delete all saved chats from settings');
    model.deleteAllSavedChats();
  } else if (settingsAction === 'reload_models') {
    settings.logDebug('refreshing model list after configuration save');
  } else if (settingsAction) {
    settings.logDebug('ignored unknown configuration action');
    settingsAction = '';
  }
  settings.saveSettings(normalizedSettings);
  watch.syncWatchSettings(normalizedSettings);
  tools.warmMcpTools(normalizedSettings);
  if (settingsAction === 'reload_models') {
    modelDiscovery.refresh(normalizedSettings, function(result) {
      settings.logDebug('configuration model discovery count=' + result.models.length);
    });
  }
});

Pebble.addEventListener('appmessage', function(e) {
  var dict = e.payload || {};
  var requestId = dict.RequestId || 0;

  if (dict.ApprovalDecision !== undefined && dict.ApprovalDecision !== null) {
    watch.handleActionApprovalResponse(dict);
    return;
  }

  if (dict.HealthSummaryRequest) {
    watch.handleHealthInfoResponse(dict);
    return;
  }

  if (dict.RequestCancel) {
    settings.logDebug('appmessage request cancel id=' + requestId);
    model.cancelCompletion(requestId);
    return;
  }

  if (dict.RequestRetry !== undefined && dict.RequestRetry !== null) {
    settings.logDebug('appmessage request retry id=' + requestId + ' failed_id=' + dict.RequestRetry);
    model.retryCompletion(requestId, dict.RequestRetry);
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
