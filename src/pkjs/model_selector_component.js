module.exports = {
  name: 'model_selector',
  template: '<div class="component component-model-selector"><span class="model-selector-label">{{{label}}}</span><div class="model-selector-controls"><button type="button" data-model-load>Load Models</button><select data-model-select disabled><option value="">Load models to choose</option></select></div><label class="model-selector-custom" data-model-custom-row><span>Custom model</span><input type="text" data-model-custom placeholder="{{placeholder}}" /></label><div class="model-selector-status" data-model-status>{{{description}}}</div><input data-manipulator-target type="hidden" /></div>',
  style: '.component-model-selector{padding:.75rem .9rem}.component-model-selector .model-selector-label{display:block;color:#fff;font-size:.9rem;margin-bottom:.45rem}.component-model-selector .model-selector-controls{display:flex;gap:.45rem}.component-model-selector button{background:#38465d;border:1px solid #52627d;border-radius:.35rem;color:#fff;flex:0 0 auto;padding:.55rem .7rem}.component-model-selector button:disabled{opacity:.55}.component-model-selector select,.component-model-selector input{background:#171b22;border:1px solid #3a4352;border-radius:.35rem;box-sizing:border-box;color:#fff;font-size:.95rem;padding:.5rem;width:100%}.component-model-selector select{min-width:0}.component-model-selector .model-selector-custom{display:block;margin-top:.55rem}.component-model-selector .model-selector-custom span{color:#b9c2d0;display:block;font-size:.8rem;margin-bottom:.25rem}.component-model-selector .model-selector-status{color:#b9c2d0;font-size:.78rem;line-height:1.35;margin-top:.45rem;min-height:1.05rem}',
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
