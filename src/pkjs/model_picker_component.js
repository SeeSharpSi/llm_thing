module.exports = {
  name: 'model_picker',
  template: '<div class="component component-model-picker"><label class="tap-highlight"><span class="label">{{{label}}}</span><span class="model-picker-select-wrap"><select data-model-select></select></span><span class="model-picker-input-wrap" style="display:none;"><input type="text" data-model-input placeholder="gpt-4.1-mini" /></span><input data-manipulator-target type="hidden" /></label><button type="button" class="model-picker-refresh" data-model-refresh>Refresh Models</button><div class="description" data-model-status>{{{description}}}</div></div>',
  style: '.component-model-picker label{display:block}.component-model-picker select,.component-model-picker input[type="text"]{display:block;width:100%;background:#333;border:0;border-radius:.25rem;color:#fff;font-size:inherit;min-height:2.1rem;padding:.35rem .375rem;-webkit-appearance:none;appearance:none}.component-model-picker .model-picker-select-wrap,.component-model-picker .model-picker-input-wrap{display:block;position:relative;min-width:100%;margin-top:.7rem}.component-model-picker .model-picker-refresh{background:#263241;border:1px solid #465568;border-radius:.35rem;color:#dce4f0;font-size:.85rem;margin:.6rem 0 0;padding:.35rem .65rem}.component-model-picker .model-picker-refresh:disabled{color:#788393;border-color:#343d4a}.component-model-picker .description{margin-top:.45rem}',
  manipulator: {
    get: function() {
      return this.$manipulatorTarget.get('value');
    },
    set: function(value) {
      value = String(value || '');
      if (this.get() === value) {
        return this;
      }
      this.$manipulatorTarget.set('value', value);
      if (this.setControlValue) {
        this.setControlValue(value);
      }
      return this.trigger('change');
    },
    disable: function() {
      this.$element.set('+disabled');
      this.$manipulatorTarget.set('disabled', true);
      return this.trigger('disabled');
    },
    enable: function() {
      this.$element.set('-disabled');
      this.$manipulatorTarget.set('disabled', false);
      return this.trigger('enabled');
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
  initialize: function(minified, clay) {
    var item = this;
    var root = item.$element[0];
    var select = root.querySelector('[data-model-select]');
    var input = root.querySelector('[data-model-input]');
    var selectWrap = root.querySelector('.model-picker-select-wrap');
    var inputWrap = root.querySelector('.model-picker-input-wrap');
    var refreshButton = root.querySelector('[data-model-refresh]');
    var status = root.querySelector('[data-model-status]');
    var defaultDescription = status ? status.innerHTML : '';
    var endpointItem = null;
    var apiKeyItem = null;
    var customItem = null;
    var fetchTimer = null;
    var fetchId = 0;
    var models = [];
    var preloadedError = '';
    var preloadedEndpoint = '';
    var preloadedUrl = '';

    function trim(value) {
      return String(value || '').replace(/^\s+|\s+$/g, '');
    }

    function escapeHtml(value) {
      return String(value || '').replace(/[&<>"']/g, function(ch) {
        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[ch];
      });
    }

    function setStatus(message, isError) {
      if (!status) {
        return;
      }
      status.innerHTML = message ? escapeHtml(message) : defaultDescription;
      status.style.color = isError ? '#ffb8c0' : '';
    }

    function setStoredModel(value) {
      value = trim(value);
      item.$manipulatorTarget.set('value', value);
      item.trigger('change');
    }

    function currentModel() {
      return trim(item.$manipulatorTarget.get('value'));
    }

    function currentEndpoint() {
      return trim(endpointItem && endpointItem.get ? endpointItem.get() : '');
    }

    function isCustomMode() {
      return !!(customItem && customItem.get && customItem.get());
    }

    function modelsUrlForEndpoint(endpoint) {
      var url = trim(endpoint).replace(/[?#].*$/, '').replace(/\/+$/, '');

      if (!url) {
        return '';
      }
      if (/\/models$/i.test(url)) {
        return url;
      }
      if (/\/chat\/completions$/i.test(url)) {
        return url.replace(/\/chat\/completions$/i, '/models');
      }
      if (/\/responses$/i.test(url)) {
        return url.replace(/\/responses$/i, '/models');
      }
      if (/\/completions$/i.test(url)) {
        return url.replace(/\/completions$/i, '/models');
      }

      return url + '/models';
    }

    function setSelectOptions(values, selected) {
      var html = '';
      var seen = {};
      var i;
      var value;

      selected = trim(selected);
      if (selected) {
        seen[selected] = true;
        html += '<option value="' + escapeHtml(selected) + '">Current: ' + escapeHtml(selected) + '</option>';
      }

      for (i = 0; i < values.length; i += 1) {
        value = trim(values[i]);
        if (!value || seen[value]) {
          continue;
        }
        seen[value] = true;
        html += '<option value="' + escapeHtml(value) + '">' + escapeHtml(value) + '</option>';
      }

      if (!html) {
        html = '<option value="">No models loaded</option>';
      }

      select.innerHTML = html;
      select.value = selected || (values.length ? values[0] : '');
      if (!selected && select.value) {
        setStoredModel(select.value);
      }
    }

    function syncMode() {
      var custom = isCustomMode();
      var model = currentModel();

      selectWrap.style.display = custom ? 'none' : 'block';
      inputWrap.style.display = custom ? 'block' : 'none';
      refreshButton.style.display = custom ? 'none' : 'inline-block';
      input.value = model;

      if (!custom) {
        setSelectOptions(models, model);
        if (models.length) {
          setStatus('Loaded ' + models.length + ' models from ' + (preloadedUrl || '/models') + '.', false);
        } else if (preloadedError) {
          setStatus(preloadedError, true);
        } else {
          setStatus('Save settings and reopen to load models for this endpoint.', false);
        }
      }
    }

    function handleEndpointChanged() {
      if (isCustomMode()) {
        return;
      }
      if (currentEndpoint() !== trim(preloadedEndpoint)) {
        models = [];
        preloadedError = '';
        setSelectOptions(models, currentModel());
        setStatus('Save settings and reopen to load models for this endpoint.', false);
      }
    }

    item.setControlValue = function(value) {
      value = trim(value);
      input.value = value;
      if (select.value !== value) {
        setSelectOptions(models, value);
      }
    };

    function parseModels(responseText) {
      var json;
      var data;
      var result = [];
      var i;
      var value;

      json = JSON.parse(responseText || '{}');
      data = json.data || json.models || [];
      if (!Array.isArray(data)) {
        return result;
      }

      for (i = 0; i < data.length; i += 1) {
        value = typeof data[i] === 'string' ? data[i] : data[i] && data[i].id;
        value = trim(value);
        if (value) {
          result.push(value);
        }
      }

      result.sort();
      return result;
    }

    function normalizeModelList(value) {
      var result = [];
      var seen = {};
      var i;
      var model;

      if (!Array.isArray(value)) {
        return result;
      }
      for (i = 0; i < value.length; i += 1) {
        model = trim(value[i]);
        if (model && !seen[model]) {
          seen[model] = true;
          result.push(model);
        }
      }
      result.sort();
      return result;
    }

    function fetchModels() {
      var endpoint = endpointItem && endpointItem.get ? endpointItem.get() : '';
      var apiKey = apiKeyItem && apiKeyItem.get ? apiKeyItem.get() : '';
      var url = modelsUrlForEndpoint(endpoint);
      var myFetchId;

      if (isCustomMode()) {
        return;
      }
      if (!url) {
        models = [];
        setSelectOptions(models, currentModel());
        setStatus('Enter an endpoint URL to load models.', false);
        return;
      }

      fetchId += 1;
      myFetchId = fetchId;
      setStatus('Loading models...', false);
      refreshButton.disabled = true;

      function sendRequest(useAuth) {
        var request = new XMLHttpRequest();
        request.open('GET', url, true);
        if (useAuth && trim(apiKey)) {
          request.setRequestHeader('Authorization', 'Bearer ' + trim(apiKey));
        }
        request.timeout = 30000;

        request.onload = function() {
          if (myFetchId !== fetchId) {
            return;
          }
          if (!useAuth && trim(apiKey) && (request.status === 401 || request.status === 403)) {
            sendRequest(true);
            return;
          }
          refreshButton.disabled = false;
          if (request.status < 200 || request.status >= 300) {
            setStatus('Could not load models: HTTP ' + request.status + '.', true);
            setSelectOptions(models, currentModel());
            return;
          }
          try {
            models = parseModels(request.responseText);
          } catch (e) {
            setStatus('Could not load models: bad JSON.', true);
            setSelectOptions(models, currentModel());
            return;
          }
          preloadedError = '';
          preloadedEndpoint = currentEndpoint();
          preloadedUrl = url;
          setSelectOptions(models, currentModel());
          setStatus(models.length ? ('Loaded ' + models.length + ' models.') : 'No models returned by endpoint.', !models.length);
        };

        request.onerror = function() {
          if (myFetchId !== fetchId) {
            return;
          }
          if (!useAuth && trim(apiKey)) {
            sendRequest(true);
            return;
          }
          refreshButton.disabled = false;
          setStatus('Live refresh failed. Save settings and reopen to load models from phone.', true);
          setSelectOptions(models, currentModel());
        };

        request.ontimeout = function() {
          if (myFetchId !== fetchId) {
            return;
          }
          if (!useAuth && trim(apiKey)) {
            sendRequest(true);
            return;
          }
          refreshButton.disabled = false;
          setStatus('Live refresh timed out. Save settings and reopen to load models from phone.', true);
          setSelectOptions(models, currentModel());
        };

        request.send();
      }

      sendRequest(false);
    }

    function scheduleFetch(delay) {
      if (fetchTimer) {
        clearTimeout(fetchTimer);
      }
      fetchTimer = setTimeout(fetchModels, delay);
    }

    select.addEventListener('change', function() {
      setStoredModel(select.value);
    });

    input.addEventListener('input', function() {
      setStoredModel(input.value);
    });

    refreshButton.addEventListener('click', function() {
      scheduleFetch(0);
    });

    clay.on(clay.EVENTS.AFTER_BUILD, function() {
      var userData = clay.meta && clay.meta.userData ? clay.meta.userData : {};

      endpointItem = clay.getItemByMessageKey('Endpoint');
      apiKeyItem = clay.getItemByMessageKey('ApiKey');
      customItem = clay.getItemByMessageKey('UseCustomModel');
      models = normalizeModelList(userData.ModelOptions);
      preloadedError = trim(userData.ModelOptionsError);
      preloadedEndpoint = trim(userData.ModelOptionsEndpoint);
      preloadedUrl = trim(userData.ModelOptionsUrl);

      if (endpointItem) {
        endpointItem.on('change input', handleEndpointChanged);
      }
      if (apiKeyItem) {
        apiKeyItem.on('change input', function() {
          if (isCustomMode()) {
            return;
          }
          models = [];
          preloadedError = '';
          setSelectOptions(models, currentModel());
          setStatus('Save settings and reopen to load models with this API key.', false);
        });
      }
      if (customItem) {
        customItem.on('change', syncMode);
      }

      syncMode();
    });
  },
  defaults: {
    label: '',
    description: '',
    defaultValue: ''
  }
};
