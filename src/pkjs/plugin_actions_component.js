var sourceComponent = require('./plugin_sources_component');
var component = {};

Object.keys(sourceComponent).forEach(function(key) {
  component[key] = sourceComponent[key];
});

component.name = 'plugin_actions';
component.style = '';
component.template = sourceComponent.template
  .replace('class="component component-plugin-sources"', 'class="component component-plugin-sources component-plugin-actions" data-plugin-kind="actions"')
  .replace('Plugin Sources', 'Plugin Actions')
  .replace('Optional read-only data sources', 'Optional actions that can change things')
  .replace('Enabled sources are read automatically. Returned data is sent to your configured model provider. Pebble OS permissions may still need approval.', 'Enabled actions run automatically without confirmation and can change external services. Arguments and results are sent to your model provider. Pebble may ask for permission. Canceling cannot undo an action already started.');

module.exports = component;
