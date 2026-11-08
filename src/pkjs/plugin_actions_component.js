var sourceComponent = require('./plugin_sources_component');
var component = {};

Object.keys(sourceComponent).forEach(function(key) {
  component[key] = sourceComponent[key];
});

component.name = 'plugin_actions';
component.style = '';
component.template = '<div class="component component-plugin-sources component-plugin-actions" data-plugin-kind="actions"><p class="plugin-sources-warning">Sources are read-only. Enabled actions run automatically without confirmation unless Ask first is on. Ask first requires Confirm or Deny on watch. Actions can change external services. Arguments and results go to your model provider. Pebble may ask for permission. Canceling cannot undo an action already started.</p><p class="plugin-sources-status" data-plugin-status role="status" aria-live="polite"></p><div data-plugin-list="actions"></div><input data-manipulator-target type="hidden" /></div>';

module.exports = component;
