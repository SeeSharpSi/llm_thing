module.exports = {
  name: 'settings_io',
  template: '<div class="component component-settings-io"><p class="settings-io-help">Copy settings as JSON for backup, or paste a backup to restore values. API keys, MCP credentials, and Pebble Memory notes are not exported. Endpoint URLs are exported as entered. Review imported values, then tap Save Settings.</p><textarea class="settings-io-textarea" data-settings-json rows="8" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Backup JSON" placeholder="Settings JSON"></textarea><div class="settings-io-actions"><button type="button" class="settings-io-button" data-settings-export>Export &amp; Copy</button><button type="button" class="settings-io-button" data-settings-import>Import JSON</button></div><p class="settings-io-status" data-settings-status role="status" aria-live="polite"></p><input data-manipulator-target type="hidden" /></div>',
  style: '.component-settings-io{padding:.9rem 1rem}.component-settings-io .settings-io-help{margin:.1rem 0 .7rem;color:#aeb9c7;font-size:.82rem;line-height:1.45}.component-settings-io .settings-io-textarea{display:block;box-sizing:border-box;width:100%;min-height:9rem;padding:.6rem .65rem;background:#0f1822;border:1px solid #405064;border-radius:.45rem;color:#f5f7fa;font:inherit;font-family:monospace;font-size:.8rem;line-height:1.4;resize:vertical}.component-settings-io .settings-io-textarea:focus{border-color:#f0a94b;box-shadow:0 0 0 2px rgba(240,169,75,.25);outline:0}.component-settings-io .settings-io-actions{display:flex;flex-wrap:wrap;gap:.55rem;margin-top:.65rem}.component-settings-io .settings-io-button{flex:1 1 10rem;min-width:0;min-height:44px;margin:0;padding:.55rem .75rem;background:#263648;border:1px solid #52657b;border-radius:.45rem;color:#f5f7fa;font:inherit;font-weight:600;text-transform:none}.component-settings-io .settings-io-button[data-settings-export]{background:#f0a94b;border-color:#f0a94b;color:#17202a}.component-settings-io .settings-io-button:focus{border-color:#f0a94b;box-shadow:0 0 0 2px rgba(240,169,75,.25);outline:0}.component-settings-io .settings-io-status{min-height:1.3rem;margin:.55rem 0 0;color:#aeb9c7;font-size:.8rem;line-height:1.45}.component-settings-io .settings-io-error{color:#e6a9af}.component-settings-io .settings-io-ok{color:#b8d8a8}',
  manipulator: {
    get: function() {
      return '';
    },
    set: function(value) {
      return this.trigger('change');
    },
    hide: function() {
      this.$element.set('+hide');
      return this.trigger('hide');
    },
    show: function() {
      this.$element.set('-hide');
      return this.trigger('show');
    }
  },
  initialize: function(utils, clayInstance) {
    var item = this;
    var root = item.$element[0];
    var doc = root.ownerDocument;
    var win = doc.defaultView || {};
    var textarea = root.querySelector('[data-settings-json]');
    var status = root.querySelector('[data-settings-status]');
    var excludedKeys = ['ApiKey', 'ConfigAction', 'MemoriesJson'];
    var maxBytes = 512 * 1024;
    var clay = clayInstance || (utils && typeof utils.getAllItems === 'function' ? utils : null) || null;

    function trim(value) {
      return String(value === undefined || value === null ? '' : value).replace(/^\s+|\s+$/g, '');
    }

    function hasOwn(object, key) {
      return Object.prototype.hasOwnProperty.call(object || {}, key);
    }

    function isPlainObject(value) {
      return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function cloneJson(value) {
      return JSON.parse(JSON.stringify(value));
    }

    function utf8ByteLength(value) {
      var length = 0;
      var i;
      var code;

      for (i = 0; i < value.length; i += 1) {
        code = value.charCodeAt(i);
        if (code < 0x80) {
          length += 1;
        } else if (code < 0x800) {
          length += 2;
        } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
          code = value.charCodeAt(i + 1);
          if (code >= 0xdc00 && code <= 0xdfff) {
            length += 4;
            i += 1;
          } else {
            length += 3;
          }
        } else {
          length += 3;
        }
      }

      return length;
    }

    function setStatus(message, isError) {
      status.textContent = message || '';
      status.className = 'settings-io-status' + (isError ? ' settings-io-error' : ' settings-io-ok');
    }

    function setItemValue(settingItem, value) {
      try {
        settingItem.set(value);
        return true;
      } catch (e) {
        return false;
      }
    }

    function normalizeToggle(value) {
      var text;

      if (value === true || value === 1) {
        return true;
      }
      if (value === false || value === 0) {
        return false;
      }
      if (typeof value !== 'string') {
        return null;
      }

      text = trim(value).toLowerCase();
      if (text === '1' || text === 'true') {
        return true;
      }
      if (text === '' || text === '0' || text === 'false') {
        return false;
      }
      return null;
    }

    function isFiniteNumberValue(value) {
      var text;

      if (typeof value === 'number') {
        return isFinite(value);
      }
      if (typeof value !== 'string') {
        return false;
      }
      text = trim(value);
      if (!text || !/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) {
        return false;
      }
      return isFinite(Number(text));
    }

    function isColorValue(value) {
      var number;

      if (!isFiniteNumberValue(value)) {
        return false;
      }
      number = Number(value);
      return number >= 0 && number <= 16777215;
    }

    function matchedOption(options, value) {
      var stringValue = String(value);
      var i;

      if (!options || !options.length || value === null || typeof value === 'object') {
        return null;
      }
      for (i = 0; i < options.length; i += 1) {
        if (String(options[i].value) === stringValue) {
          return options[i];
        }
      }
      return null;
    }

    function applyImportedValue(settingItem, value) {
      var config = settingItem.config || {};
      var type = config.type;
      var normalized;
      var option;

      if (type === 'toggle') {
        normalized = normalizeToggle(value);
        return normalized === null ? false : setItemValue(settingItem, normalized);
      }

      if (value === null || typeof value === 'object') {
        return false;
      }

      if (type === 'select') {
        option = matchedOption(config.options, value);
        return option ? setItemValue(settingItem, String(option.value)) : false;
      }

      if (type === 'color') {
        return isColorValue(value) ? setItemValue(settingItem, Number(value)) : false;
      }

      if (config.attributes && config.attributes.type === 'number') {
        return isFiniteNumberValue(value) ? setItemValue(settingItem, Number(value)) : false;
      }

      return setItemValue(settingItem, String(value));
    }

    function parseServerArray(value) {
      var parsed = value;

      if (typeof value === 'string') {
        try {
          parsed = JSON.parse(value || '[]');
        } catch (e) {
          return [];
        }
      }
      return Array.isArray(parsed) ? parsed : [];
    }

    function redactMcpServers(servers) {
      return parseServerArray(servers).map(function(server) {
        var copy;
        var i;

        if (!isPlainObject(server)) {
          return server;
        }
        copy = cloneJson(server);
        copy.authorization = '';
        if (Array.isArray(copy.headers)) {
          for (i = 0; i < copy.headers.length; i += 1) {
            if (isPlainObject(copy.headers[i])) {
              copy.headers[i].value = '';
            }
          }
        }
        return copy;
      });
    }

    function itemsByMessageKey() {
      var items = {};
      var allItems;
      var i;

      if (!clay || typeof clay.getAllItems !== 'function') {
        return items;
      }

      try {
        allItems = clay.getAllItems() || [];
      } catch (e) {
        allItems = [];
      }

      for (i = 0; i < allItems.length; i += 1) {
        if (allItems[i] && allItems[i].messageKey) {
          items[allItems[i].messageKey] = allItems[i];
        }
      }
      return items;
    }

    function buildExportSettings() {
      var items = itemsByMessageKey();
      var settings = {};

      Object.keys(items).forEach(function(key) {
        var value;

        if (excludedKeys.indexOf(key) !== -1) {
          return;
        }

        try {
          value = typeof items[key].get === 'function' ? items[key].get() : undefined;
        } catch (e) {
          value = undefined;
        }

        if (key === 'McpServersJson') {
          settings[key] = JSON.stringify(redactMcpServers(value));
        } else if (value !== undefined) {
          settings[key] = value;
        }
      });

      return {
        app: 'llm_thing',
        version: 1,
        settings: settings
      };
    }

    function parseCurrentServers(settingItem) {
      var current;
      var parsed;

      try {
        current = settingItem.get();
      } catch (e) {
        return [];
      }
      if (typeof current === 'string') {
        try {
          parsed = JSON.parse(current || '[]');
        } catch (e) {
          parsed = [];
        }
      } else {
        parsed = current;
      }
      return Array.isArray(parsed) ? parsed : [];
    }

    function importedServerMatch(server, currentServers) {
      var url = isPlainObject(server) ? trim(server.url) : '';
      var label = isPlainObject(server) ? trim(server.label).toLowerCase() : '';
      var i;
      var current;
      var currentUrl;

      for (i = 0; i < currentServers.length; i += 1) {
        current = currentServers[i];
        if (!isPlainObject(current)) {
          continue;
        }
        currentUrl = trim(current.url);
        if (url) {
          if (currentUrl === url) {
            return current;
          }
        } else if (!currentUrl && label && trim(current.label).toLowerCase() === label) {
          return current;
        }
      }
      return null;
    }

    function mergeHeaderSecrets(importedHeaders, currentHeaders) {
      var i;
      var header;
      var current;
      var j;

      if (!Array.isArray(importedHeaders) || !Array.isArray(currentHeaders)) {
        return;
      }
      for (i = 0; i < importedHeaders.length; i += 1) {
        header = importedHeaders[i];
        if (!isPlainObject(header)) {
          continue;
        }
        if (trim(header.value) !== '') {
          continue;
        }
        for (j = 0; j < currentHeaders.length; j += 1) {
          current = currentHeaders[j];
          if (isPlainObject(current) &&
              trim(current.name).toLowerCase() === trim(header.name).toLowerCase() &&
              trim(current.value) !== '') {
            header.value = current.value;
            break;
          }
        }
      }
    }

    function mergeMcpSecrets(importedServers, currentServers) {
      return importedServers.map(function(server) {
        var copy;
        var match;

        if (!isPlainObject(server)) {
          return server;
        }
        copy = cloneJson(server);
        match = importedServerMatch(server, currentServers);
        if (!match) {
          return copy;
        }

        if (trim(copy.authorization) === '' && trim(match.authorization) !== '') {
          copy.authorization = match.authorization;
        }
        mergeHeaderSecrets(copy.headers, match.headers);
        return copy;
      });
    }

    function applyMcpServers(settingItem, value) {
      var imported;
      var current;
      var merged;

      if (typeof value === 'string') {
        try {
          imported = JSON.parse(value);
        } catch (e) {
          return false;
        }
      } else {
        imported = value;
      }
      if (!Array.isArray(imported)) {
        return false;
      }

      current = parseCurrentServers(settingItem);
      merged = mergeMcpSecrets(imported, current);
      return setItemValue(settingItem, JSON.stringify(merged));
    }

    function parseImportEnvelope(text) {
      var parsed;
      var settings;
      var parsedValue;

      if (!text) {
        throw new Error('Paste settings JSON to import.');
      }
      if (utf8ByteLength(text) > maxBytes) {
        throw new Error('Settings JSON is too large (maximum 512 KiB).');
      }

      try {
        parsed = JSON.parse(text);
      } catch (e) {
        throw new Error('Invalid JSON: ' + String(e && e.message || 'parse error'));
      }

      parsedValue = parsed;
      while (isPlainObject(parsedValue) && hasOwn(parsedValue, 'value')) {
        parsedValue = parsedValue.value;
        if (typeof parsedValue === 'string') {
          try {
            parsedValue = JSON.parse(parsedValue);
          } catch (e) {
            throw new Error('Invalid JSON in value: ' + String(e && e.message || 'parse error'));
          }
        }
      }

      if (!isPlainObject(parsedValue)) {
        throw new Error('Settings JSON must be an object.');
      }

      if (hasOwn(parsedValue, 'settings')) {
        if (hasOwn(parsedValue, 'app') && parsedValue.app !== 'llm_thing') {
          throw new Error('Settings backup is for a different app.');
        }
        if (hasOwn(parsedValue, 'version') && parsedValue.version !== 1 && parsedValue.version !== '1') {
          throw new Error('Unsupported settings version.');
        }
        settings = parsedValue.settings;
        if (isPlainObject(settings) && hasOwn(settings, 'value')) {
          settings = settings.value;
          if (typeof settings === 'string') {
            try {
              settings = JSON.parse(settings);
            } catch (e) {
              throw new Error('Invalid settings object.');
            }
          }
        }
        if (!isPlainObject(settings)) {
          throw new Error('Settings envelope must contain a settings object.');
        }
        return settings;
      }

      if (hasOwn(parsedValue, 'app') || hasOwn(parsedValue, 'version')) {
        throw new Error('Settings envelope is missing a settings object.');
      }

      return parsedValue;
    }

    function importSettingsText(text) {
      var settings;
      var items;
      var applied = 0;
      var skipped = 0;
      var keptApiKey = false;
      var message;
      var result;

      try {
        settings = parseImportEnvelope(trim(text));
      } catch (error) {
        message = String(error && error.message || error);
        setStatus(message, true);
        return { ok: false, applied: 0, skipped: 0, keptApiKey: false, error: message, status: message };
      }

      items = itemsByMessageKey();

      Object.keys(settings).forEach(function(key) {
        var settingItem;

        if (key === 'ApiKey') {
          keptApiKey = true;
          return;
        }
        if (excludedKeys.indexOf(key) !== -1) {
          return;
        }

        settingItem = items[key];
        if (!settingItem || typeof settingItem.set !== 'function') {
          skipped += 1;
          return;
        }

        if (key === 'McpServersJson') {
          if (applyMcpServers(settingItem, settings[key])) {
            applied += 1;
          } else {
            skipped += 1;
          }
          return;
        }

        if (applyImportedValue(settingItem, settings[key])) {
          applied += 1;
        } else {
          skipped += 1;
        }
      });

      if (!applied) {
        message = 'No supported settings to import.';
        if (keptApiKey) {
          message += ' Your API key was kept.';
        }
        if (skipped) {
          message += ' Ignored ' + skipped + ' unsupported value' + (skipped === 1 ? '' : 's') + '.';
        }
        setStatus(message, true);
        return {
          ok: false,
          applied: applied,
          skipped: skipped,
          keptApiKey: keptApiKey,
          error: message,
          status: message
        };
      }

      message = 'Imported ' + applied + ' setting' + (applied === 1 ? '' : 's') + '. Tap Save Settings to apply.';
      if (keptApiKey) {
        message += ' Your API key was kept.';
      }
      if (skipped) {
        message += ' Ignored ' + skipped + ' unsupported value' + (skipped === 1 ? '' : 's') + '.';
      }
      setStatus(message, false);
      result = {
        ok: true,
        applied: applied,
        skipped: skipped,
        keptApiKey: keptApiKey,
        status: message
      };
      return result;
    }

    function execCommandCopy(text) {
      var body = doc.body;
      var temporary;
      var copied = false;

      if (!body || typeof doc.createElement !== 'function') {
        return false;
      }

      temporary = doc.createElement('textarea');
      temporary.value = text;
      temporary.setAttribute('readonly', 'readonly');
      temporary.style.position = 'fixed';
      temporary.style.top = '-1000px';
      temporary.style.opacity = '0';
      body.appendChild(temporary);
      try {
        temporary.focus();
        temporary.select();
        copied = typeof doc.execCommand === 'function' && doc.execCommand('copy') !== false;
      } catch (e) {
        copied = false;
      }
      body.removeChild(temporary);
      return copied;
    }

    function copyText(text, callback) {
      var navigator = win.navigator || {};
      var clipboard = navigator.clipboard;
      var finished = false;

      function finish(ok) {
        if (finished) {
          return;
        }
        finished = true;
        callback(ok);
      }

      function fallback() {
        finish(execCommandCopy(text));
      }

      if (clipboard && typeof clipboard.writeText === 'function') {
        try {
          var result = clipboard.writeText(text);
          if (result && typeof result.then === 'function') {
            result.then(function() {
              finish(true);
            }, fallback);
          } else {
            finish(true);
          }
        } catch (e) {
          fallback();
        }
        return;
      }

      fallback();
    }

    function selectedManualCopy() {
      try {
        textarea.focus();
        textarea.select();
      } catch (e) {
        // Ignore selection failures and still show the error.
      }
      setStatus('Copy failed. Settings JSON is selected; copy it manually.', true);
    }

    function exportToTextarea() {
      var text = JSON.stringify(buildExportSettings(), null, 2);

      textarea.value = text;
      copyText(text, function(copied) {
        if (copied) {
          setStatus('Settings JSON copied to clipboard.', false);
        } else {
          selectedManualCopy();
        }
      });
      return text;
    }

    function closestByAttr(element, attr) {
      while (element && element !== root) {
        if (element.getAttribute && element.getAttribute(attr) !== null) {
          return element;
        }
        element = element.parentNode;
      }
      return null;
    }

    item.buildExportSettings = buildExportSettings;
    item.importSettingsText = importSettingsText;
    item.exportToTextarea = exportToTextarea;
    item.copyText = copyText;
    item.redactMcpServers = redactMcpServers;
    item.mergeMcpSecrets = mergeMcpSecrets;

    root.addEventListener('click', function(e) {
      var exportButton = closestByAttr(e.target, 'data-settings-export');
      var importButton = closestByAttr(e.target, 'data-settings-import');

      if (exportButton) {
        if (e.preventDefault) {
          e.preventDefault();
        }
        exportToTextarea();
        return;
      }
      if (importButton) {
        if (e.preventDefault) {
          e.preventDefault();
        }
        importSettingsText(textarea.value);
      }
    });
  },
  defaults: {
    defaultValue: ''
  }
};
