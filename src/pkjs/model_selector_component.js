var settingsTheme = require('./settings_theme');

module.exports = {
  name: 'model_selector',
  template: '<div class="component component-model-selector"><span class="model-selector-label">{{{label}}}</span><div class="model-selector-controls"><button type="button" data-model-load>Load Models</button><select data-model-select disabled><option value="">Load models to choose</option></select></div><label class="model-selector-custom" data-model-custom-row><span>Custom model</span><input type="text" data-model-custom placeholder="{{placeholder}}" /></label><div class="model-selector-status" data-model-status>{{{description}}}</div><input data-manipulator-target type="hidden" /></div>',
  style: settingsTheme + '.component-model-selector{padding:.9rem 1rem}.component-model-selector .model-selector-label{display:block;margin-bottom:.5rem;color:#f2f5f8;font-size:.94rem}.component-model-selector .model-selector-controls{display:flex;align-items:stretch;gap:.5rem}.component-model-selector button{flex:0 0 auto;min-width:8.25rem;min-height:44px;margin:0;padding:.55rem .75rem;background:#263648;border:1px solid #52657b;border-radius:.4rem;color:#f5f7fa;font:inherit;font-weight:600;text-transform:none}.component-model-selector button:disabled{opacity:.55}.component-model-selector select,.component-model-selector input{box-sizing:border-box;width:100%;min-height:44px;padding:.55rem .65rem;background:#0f1822;border:1px solid #405064;border-radius:.4rem;color:#f5f7fa;font:inherit}.component-model-selector select{min-width:0;flex:1 1 auto}.component-model-selector select:focus,.component-model-selector input:focus,.component-model-selector button:focus{border-color:#f0a94b;box-shadow:0 0 0 2px rgba(240,169,75,.25);outline:0}.component-model-selector input::-webkit-input-placeholder{color:#8492a2}.component-model-selector input::placeholder{color:#8492a2;opacity:1}.component-model-selector .model-selector-custom{display:block;margin-top:.65rem;padding:0}.component-model-selector .model-selector-custom span{display:block;margin-bottom:.3rem;color:#aeb9c7;font-size:.8rem}.component-model-selector .model-selector-status{min-height:1.05rem;margin-top:.5rem;color:#aeb9c7;font-size:.78rem;line-height:1.4}@media(max-width:34rem){.component-model-selector .model-selector-controls{display:block}.component-model-selector .model-selector-controls button{width:100%;margin-bottom:.5rem}.component-model-selector .model-selector-controls select{display:block;width:100%}}',
  defaults: {
    label: 'Model',
    placeholder: 'gpt-4.1-mini',
    description: 'Enter a model or load models from the endpoint.',
    modelsEncoded: '',
    modelsStatus: ''
  },
  manipulator: {
    get: function() {
      return this.currentModel || '';
    },
    set: function(value) {
      this.setModel(value);
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
  initialize: function(unused, clay) {
    var item = this;
    var root = item.$element[0];
    var loadButton = root.querySelector('[data-model-load]');
    var select = root.querySelector('[data-model-select]');
    var customRow = root.querySelector('[data-model-custom-row]');
    var customInput = root.querySelector('[data-model-custom]');
    var status = root.querySelector('[data-model-status]');

    function trim(value) {
      return String(value === undefined || value === null ? '' : value).replace(/^\s+|\s+$/g, '');
    }

    function setStatus(message) {
      status.textContent = message;
    }

    function clearSelect() {
      var option;

      while (select.firstChild) {
        select.removeChild(select.firstChild);
      }
      option = root.ownerDocument.createElement('option');
      option.value = '';
      option.textContent = 'Load models to choose';
      select.appendChild(option);
      select.disabled = true;
      select.value = '';
      customRow.style.display = 'block';
    }

    item.currentModel = '';

    item.setModel = function(value, forceCustom) {
      var found = false;
      var i;

      item.currentModel = trim(value);
      item.$manipulatorTarget.set('value', item.currentModel);
      if (!select.disabled && !forceCustom) {
        for (i = 1; i < select.options.length; i += 1) {
          if (select.options[i].value === item.currentModel) {
            found = true;
            break;
          }
        }
      }
      select.value = found ? item.currentModel : '';
      customRow.style.display = found ? 'none' : 'block';
      if (!found) {
        customInput.value = item.currentModel;
      }
    };

    item.renderModels = function(models) {
      var selectedFound = false;
      var option;
      var i;

      while (select.firstChild) {
        select.removeChild(select.firstChild);
      }
      option = root.ownerDocument.createElement('option');
      option.value = '';
      option.textContent = 'Custom model...';
      select.appendChild(option);

      for (i = 0; i < models.length; i += 1) {
        option = root.ownerDocument.createElement('option');
        option.value = models[i];
        option.textContent = models[i];
        select.appendChild(option);
        if (models[i] === item.currentModel) {
          selectedFound = true;
        }
      }

      select.disabled = false;
      item.setModel(item.currentModel, !selectedFound);
      setStatus(models.length + (models.length === 1 ? ' model loaded.' : ' models loaded.'));
    };

    item.invalidateModels = function(message) {
      loadButton.disabled = false;
      clearSelect();
      if (message) {
        setStatus(message);
      }
    };

    item.reloadModels = function() {
      var configActionItem = clay && clay.getItemByMessageKey && clay.getItemByMessageKey('ConfigAction');
      var submitButton = root.ownerDocument.querySelector('.component-submit button');

      if (!configActionItem || !submitButton) {
        setStatus('Save settings, then reopen them to refresh models.');
        return;
      }
      loadButton.disabled = true;
      setStatus('Saving settings and loading models...');
      configActionItem.set('reload_models');
      submitButton.click();
    };

    loadButton.addEventListener('click', function() {
      item.reloadModels();
    });
    select.addEventListener('change', function() {
      if (select.value) {
        item.setModel(select.value);
        customRow.style.display = 'none';
      } else {
        customRow.style.display = 'block';
        item.setModel(customInput.value, true);
      }
      item.trigger('change');
    });
    customInput.addEventListener('input', function() {
      if (select.disabled || !select.value) {
        item.setModel(customInput.value, true);
        item.trigger('change');
      }
    });

    if (clay && clay.on && clay.EVENTS) {
      clay.on(clay.EVENTS.AFTER_BUILD, function() {
        var endpointItem = clay.getItemByMessageKey('Endpoint');
        var apiKeyItem = clay.getItemByMessageKey('ApiKey');
        var invalidate = function() {
          item.invalidateModels('Endpoint or API key changed. Select Load Models to save and refresh.');
        };

        if (endpointItem && endpointItem.on) {
          endpointItem.on('change', invalidate);
        }
        if (apiKeyItem && apiKeyItem.on) {
          apiKeyItem.on('change', invalidate);
        }
      });
    }

    try {
      var initialModels = JSON.parse(decodeURIComponent(item.config.modelsEncoded || ''));
      if (Array.isArray(initialModels) && initialModels.length) {
        item.renderModels(initialModels);
      }
    } catch (e) {
      clearSelect();
    }
    if (item.config.modelsStatus) {
      setStatus(item.config.modelsStatus);
    }
  }
};
