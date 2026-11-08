module.exports = {
  name: 'plugin_sources',
  template: '<div class="component component-plugin-sources"><button type="button" class="plugin-sources-toggle" data-plugin-toggle aria-expanded="false"><span class="plugin-sources-title">Plugins</span><span class="plugin-sources-subtitle">Plugin data sources and optional actions</span></button><div class="plugin-sources-body" data-plugin-body style="display:none;"><p class="plugin-sources-warning">Enabled sources are read automatically. Returned data is sent to your configured model provider. Pebble OS permissions may still need approval.</p><p class="plugin-sources-status" data-plugin-status role="status" aria-live="polite"></p><div data-plugin-list="sources"></div><input data-manipulator-target type="hidden" /></div></div>',
  style: '.component-plugin-sources{box-sizing:border-box;min-width:0;max-width:100%;padding:.75rem 1rem;color:#f5f7fa}.component-plugin-sources .plugin-sources-toggle{position:relative;display:block;box-sizing:border-box;width:100%;min-width:0;min-height:52px;margin:0;padding:.65rem 2.7rem .65rem .75rem;background:#182431;border:1px solid #405064;border-radius:.45rem;color:#fff;font:inherit;text-align:left;text-transform:none;box-shadow:none}.component-plugin-sources .plugin-sources-toggle:after{content:"+";position:absolute;top:50%;right:.7rem;width:1.5rem;height:1.5rem;margin-top:-.75rem;border-radius:50%;background:#f0a94b;color:#17202a;font-size:1rem;font-weight:700;line-height:1.5rem;text-align:center}.component-plugin-sources.open .plugin-sources-toggle:after{content:"-"}.component-plugin-sources .plugin-sources-toggle:focus,.component-plugin-sources button:focus{outline:2px solid #f0a94b;outline-offset:2px}.component-plugin-sources .plugin-sources-title{display:block;font-size:1rem;font-weight:700}.component-plugin-sources .plugin-sources-subtitle{display:block;margin-top:.12rem;color:#aeb9c7;font-size:.78rem}.component-plugin-sources .plugin-sources-body{box-sizing:border-box;min-width:0;max-width:100%;padding:.7rem 0 0}.component-plugin-sources .plugin-section-title{margin:0;padding:.1rem 0 .35rem;color:#fff;font-size:.95rem;font-weight:700;line-height:1.35;text-transform:none;letter-spacing:normal}.component-plugin-sources .plugin-sources-warning,.component-plugin-sources .plugin-sources-status{max-width:100%;margin:.15rem 0 .55rem;color:#bdc7d3;font-size:.82rem;line-height:1.45;overflow-wrap:anywhere}.component-plugin-sources .plugin-sources-status{color:#d6dce4}.component-plugin-sources .plugin-source-group{box-sizing:border-box;min-width:0;max-width:100%;margin:.65rem 0 0;padding:0 0 .55rem;border-bottom:2px solid #8793a1}.component-plugin-sources .plugin-source-group-title{position:relative;display:flex;align-items:center;justify-content:space-between;gap:.55rem;box-sizing:border-box;min-width:0;min-height:44px;margin:0;padding:.35rem .2rem;color:#fff;font-size:.9rem;font-weight:700;line-height:1.3;letter-spacing:normal;text-align:left;text-transform:none;transform:none;overflow-wrap:anywhere;list-style:none;cursor:pointer}.component-plugin-sources .plugin-source-group-title::-webkit-details-marker{display:none}.component-plugin-sources .plugin-source-group-title:focus{outline:2px solid #f0a94b;outline-offset:1px}.component-plugin-sources .plugin-source-group-title:after{content:"";width:.5rem;height:.5rem;flex:0 0 .5rem;border-right:2px solid #aeb9c7;border-bottom:2px solid #aeb9c7;transform:rotate(45deg);transition:transform .12s ease}.component-plugin-sources .plugin-source-group[open]>.plugin-source-group-title:after{transform:rotate(225deg)}.component-plugin-sources .plugin-source-group-name{flex:1 1 7rem;min-width:0;overflow-wrap:anywhere}.component-plugin-sources .plugin-plugin-counts{display:flex;flex:0 1 auto;flex-wrap:wrap;justify-content:flex-end;gap:.15rem .55rem;min-width:0;color:#9aa4b0;font-size:.72rem;font-weight:400;line-height:1.25;text-align:right}.component-plugin-sources .plugin-plugin-count{white-space:nowrap}.component-plugin-sources .plugin-source-row{display:grid;grid-template-columns:minmax(0,1fr) 48px;align-items:center;justify-content:initial;box-sizing:border-box;width:100%;min-width:0;min-height:50px;margin:0;padding:.25rem 0;border:0;border-bottom:1px solid #2b3948;border-radius:0;background:transparent;color:#f5f7fa;text-align:left;line-height:normal;overflow-wrap:anywhere}.component-plugin-sources label.plugin-source-row{display:grid;flex-direction:initial;flex-wrap:initial;align-items:center;justify-content:initial;box-sizing:border-box;width:100%;min-width:0;max-width:none;min-height:50px;margin:0;padding:.25rem 0;border:0;background:transparent;color:#f5f7fa;text-align:left;text-transform:none;line-height:normal;white-space:normal;cursor:pointer}.component-plugin-sources .plugin-source-title{display:block;min-width:0;max-width:100%;overflow-wrap:anywhere}.component-plugin-sources .plugin-source-switch{position:relative;display:block;box-sizing:border-box;width:48px;height:44px;justify-self:end}.component-plugin-sources .plugin-source-switch input{position:absolute;z-index:2;inset:0;box-sizing:border-box;width:48px;height:44px;margin:0;opacity:0;cursor:pointer}.component-plugin-sources .plugin-source-track{position:absolute;top:10px;right:2px;display:block;box-sizing:border-box;width:42px;height:24px;border:1px solid #718095;border-radius:999px;background:#283544;pointer-events:none}.component-plugin-sources .plugin-source-track:after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#c5ced8;transition:transform .12s ease,background-color .12s ease}.component-plugin-sources .plugin-source-switch input:checked+.plugin-source-track{border-color:#d89132;background:#b8751c}.component-plugin-sources .plugin-source-switch input:checked+.plugin-source-track:after{transform:translateX(18px);background:#fff}.component-plugin-sources .plugin-source-switch input:focus+.plugin-source-track{outline:2px solid #f0a94b;outline-offset:2px}.component-plugin-sources .plugin-source-details{min-width:0;margin:.2rem 0 0;color:#aeb9c7;font-size:.78rem;line-height:1.4}.component-plugin-sources .plugin-source-details summary{box-sizing:border-box;min-height:44px;padding:.6rem 0;color:#c5ced8;cursor:pointer;overflow-wrap:anywhere}.component-plugin-sources .plugin-source-detail-list{margin:0;padding:0 0 0 1.1rem;overflow-wrap:anywhere}.component-plugin-sources .plugin-source-detail-list li{margin:.2rem 0}.component-plugin-sources .plugin-source-unavailable{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:.5rem;min-width:0;min-height:50px;padding:.25rem 0;border-bottom:1px solid #2b3948}.component-plugin-sources .plugin-source-unavailable-label{color:#9aa4b0;font-size:.7rem;line-height:1.2;white-space:nowrap}.component-plugin-sources .plugin-source-remove{box-sizing:border-box;min-width:48px;min-height:44px;margin:0;padding:.35rem .55rem;border:1px solid #70404a;border-radius:.35rem;background:#302125;color:#f0b5bb;font:inherit;font-size:.78rem;text-transform:none}.component-plugin-actions{box-sizing:border-box;min-width:0;max-width:100%;margin-top:.7rem;padding:.65rem 0 0;border-top:1px solid #747b84}.component-plugin-actions .plugin-section-title{padding-top:0}.component-plugin-actions .plugin-action-controls{display:flex;align-items:center;justify-self:end;gap:.2rem;min-width:0}.component-plugin-actions label.plugin-action-ask-first,.component-plugin-actions label.plugin-action-enable{display:flex;align-items:center;justify-content:flex-start;gap:.25rem;box-sizing:border-box;min-width:44px;min-height:44px;margin:0;padding:0;color:#d7dee7;font-size:.7rem;line-height:normal;text-align:left;text-transform:none;white-space:nowrap;cursor:pointer}.component-plugin-actions label.plugin-action-ask-first[hidden]{display:none}.component-plugin-actions .plugin-action-ask-first .plugin-source-switch{width:44px;height:44px;flex:0 0 44px}.component-plugin-actions .plugin-action-ask-first .plugin-source-switch input{width:44px;height:44px}.component-plugin-actions .plugin-action-ask-first .plugin-source-track{top:11px;right:2px;width:38px;height:22px}.component-plugin-actions .plugin-action-ask-first .plugin-source-track:after{width:16px;height:16px}.component-plugin-actions .plugin-action-ask-first input:checked+.plugin-source-track:after{transform:translateX(16px)}.component-plugin-actions .plugin-action-enable{flex:0 0 48px}.component-plugin-actions .plugin-action-row{grid-template-columns:minmax(0,1fr) auto;border-bottom:0}.component-plugin-actions .plugin-source-unavailable{border-bottom:0}.component-plugin-actions .plugin-action-enable:focus+.plugin-source-track{outline-offset:1px}.component-plugin-actions.plugin-action-group{box-sizing:border-box;max-width:100%;margin:.65rem 0 0;padding:0;color:inherit;border-top:0}.plugin-source-group[data-has-sources]>.plugin-action-group{margin:.45rem 0 0;padding:.45rem 0 0;border-top:1px solid #747b84;border-bottom:0}.plugin-source-group[data-has-sources]>.plugin-action-group>.plugin-source-group-title[hidden]{display:none}',
  manipulator: {
    get: function() {
      return JSON.stringify(this.collectSources());
    },
    set: function(value) {
      this.renderSources(this.parseSources(value));
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
  initialize: function() {
    var item = this;
    var root = item.$element[0];
    var actionsMode = root.getAttribute('data-plugin-kind') === 'actions';
    var body = actionsMode ? root : root.querySelector('[data-plugin-body]');
    var statusElement = root.querySelector('[data-plugin-status]');
    var catalogue = parseCatalogue(item.config && item.config.catalogueEncoded).map(catalogueEntry).filter(function(entry) { return !!entry; });
    var selected;
    var MAX_ENABLED = 16;
    var actionRoot = null;
    var mountedActionGroups = [];
    var actionMountListenerAdded = false;
    var actionFocus = null;
    var actionScrollTop = 0;
    var expandedByPlugin = {};
    var renderedGroups = [];

    function parseCatalogue(encoded) {
      var parsed;
      try {
        parsed = JSON.parse(decodeURIComponent(encoded || '[]'));
      } catch (e) {
        return [];
      }
      return Array.isArray(parsed) ? parsed : [];
    }

    function trim(value) {
      return String(value === undefined || value === null ? '' : value).replace(/^\s+|\s+$/g, '');
    }

    function cleanEntry(entry) {
      var identifier;
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.plugin !== 'string') {
        return null;
      }
      identifier = actionsMode ? entry.action : entry.item;
      if (actionsMode ? typeof identifier !== 'string' : (typeof entry.category !== 'string' || typeof identifier !== 'string')) {
        return null;
      }
      if (actionsMode && entry.confirm !== undefined && typeof entry.confirm !== 'boolean') { return null; }
      entry = actionsMode
        ? { plugin: trim(entry.plugin).toLowerCase(), action: identifier, confirm: entry.confirm === true }
        : { plugin: trim(entry.plugin).toLowerCase(), category: entry.category, item: identifier };
      if (actionsMode && !entry.confirm) { delete entry.confirm; }
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(entry.plugin) &&
        (actionsMode ? !!identifier : !!entry.category && !!identifier) ? entry : null;
    }

    function keyFor(entry) {
      return actionsMode
        ? JSON.stringify([entry.plugin, entry.action])
        : JSON.stringify([entry.plugin, entry.category, entry.item]);
    }

    function sameEntry(left, right) {
      return keyFor(left) === keyFor(right);
    }

    function catalogueEntry(entry) {
      var cleaned = cleanEntry(entry);
      if (!cleaned || typeof entry.pluginName !== 'string') {
        return null;
      }
      cleaned.pluginName = entry.pluginName;
      if (actionsMode) {
        if (typeof entry.description !== 'string' || !Array.isArray(entry.arguments)) { return null; }
        cleaned.description = entry.description;
        cleaned.arguments = entry.arguments.filter(function(argument) { return typeof argument === 'string'; });
      } else {
        if (!Array.isArray(entry.properties)) { return null; }
        cleaned.properties = entry.properties.filter(function(property) { return typeof property === 'string'; });
      }
      return cleaned;
    }

    function sourceIdentifier(entry) {
      return actionsMode ? entry.action : entry.item;
    }

    function humanize(value) {
      value = String(value).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
      return value ? value.charAt(0).toUpperCase() + value.substring(1) : (actionsMode ? 'Action' : 'Source');
    }

    function masterBody() {
      var node = root.parentNode;
      while (node) {
        if (node.getAttribute && node.getAttribute('data-plugin-body') !== null) { return node; }
        node = node.parentNode;
      }
      return null;
    }

    function masterExpanded() {
      var parentBody = masterBody();
      return !!parentBody && parentBody.style.display !== 'none';
    }

    function syncActionAskFirst(row, enabled) {
      var ask = row && row.querySelector('[data-ask-first-index]');
      var control = row && row.querySelector('[data-ask-first-control]');
      if (!ask || !control) { return; }
      control.hidden = !enabled;
      ask.disabled = !enabled || !masterExpanded();
      if (!enabled) { ask.checked = false; }
    }

    function createElement(tag, className, text) {
      var element = root.ownerDocument.createElement(tag);
      if (className) { element.className = className; }
      if (text !== undefined) { element.textContent = text; }
      return element;
    }

    function bindPluginToggle(groupRoot) {
      if (groupRoot._pluginToggleBound) { return; }
      groupRoot._pluginToggleBound = true;
      groupRoot.addEventListener('toggle', function() {
        var list = root.querySelector('[data-plugin-list="sources"]');
        if (groupRoot.parentNode === list) {
          expandedByPlugin[groupRoot.getAttribute('data-plugin-group')] = !!groupRoot.open;
        }
      });
    }

    function captureExpandedPlugins() {
      var list = root.querySelector('[data-plugin-list="sources"]');
      var entries = list ? list.children : [];
      var i;
      for (i = 0; i < entries.length; i += 1) {
        if (entries[i].getAttribute('data-plugin-group') !== null) {
          expandedByPlugin[entries[i].getAttribute('data-plugin-group')] = !!entries[i].open;
        }
      }
    }

    function countsByPlugin() {
      var counts = {};
      var counted = {};
      var entry;
      var count;
      var i;
      function forPlugin(plugin) {
        if (!counts[plugin]) { counts[plugin] = { selected: 0, total: 0 }; }
        return counts[plugin];
      }
      for (i = 0; i < catalogue.length; i += 1) {
        entry = catalogue[i];
        forPlugin(entry.plugin).total += 1;
      }
      for (i = 0; i < selected.length; i += 1) {
        entry = selected[i];
        if (counted[keyFor(entry)]) { continue; }
        counted[keyFor(entry)] = true;
        count = forPlugin(entry.plugin);
        count.selected += 1;
        if (!catalogue.some(function(candidate) { return sameEntry(candidate, entry); })) { count.total += 1; }
      }
      return counts;
    }

    function setPluginCount(groupRoot, kind, count) {
      var element = groupRoot && groupRoot._pluginCountElements && groupRoot._pluginCountElements[kind];
      if (!element) { return; }
      count = count || { selected: 0, total: 0 };
      element.textContent = count.selected + '/' + count.total + ' ' + kind;
      groupRoot._pluginCounts[kind] = { selected: count.selected, total: count.total };
    }

    function updateKindCounts() {
      var counts = countsByPlugin();
      var list;
      var entries;
      var plugin;
      var i;
      renderedGroups.forEach(function(groupRoot) {
        setPluginCount(groupRoot, actionsMode ? 'actions' : 'sources', counts[groupRoot.getAttribute('data-plugin-group')]);
      });
      if (!actionsMode) {
        list = root.querySelector('[data-plugin-list="sources"]');
        entries = list ? list.children : [];
        for (i = 0; i < entries.length; i += 1) {
          plugin = entries[i].getAttribute('data-plugin-group');
          if (plugin !== null) { setPluginCount(entries[i], 'sources', counts[plugin]); }
        }
      }
    }

    function findGroup(groups, plugin) {
      var i;
      for (i = 0; i < groups.length; i += 1) {
        if (groups[i].plugin === plugin) { return groups[i]; }
      }
      return null;
    }

    function addGroup(groups, plugin, pluginName) {
      var group = { plugin: plugin, root: createElement('details', 'plugin-source-group'), rows: null, details: null, detailList: null };
      var heading = createElement('summary', 'plugin-source-group-title');
      var name = createElement('span', 'plugin-source-group-name', pluginName);
      var counts = createElement('span', 'plugin-plugin-counts');
      var sourceCount = createElement('span', 'plugin-plugin-count plugin-count-sources', '0/0 sources');
      var actionCount = createElement('span', 'plugin-plugin-count plugin-count-actions', '0/0 actions');
      group.root.setAttribute('data-plugin-group', plugin);
      group.root.open = !actionsMode && expandedByPlugin[plugin] === true;
      group.root._pluginCountElements = { sources: sourceCount, actions: actionCount };
      group.root._pluginCounts = { sources: { selected: 0, total: 0 }, actions: { selected: 0, total: 0 } };
      if (actionsMode) {
        group.root.className += ' component-plugin-actions plugin-action-group';
        group.root.setAttribute('data-plugin-kind', 'actions');
        bindActionGroup(group.root);
      } else {
        group.root.setAttribute('data-has-sources', '');
        bindPluginToggle(group.root);
      }
      heading.appendChild(name);
      counts.appendChild(sourceCount);
      counts.appendChild(root.ownerDocument.createTextNode(' '));
      counts.appendChild(actionCount);
      heading.appendChild(counts);
      group.rows = createElement('div', 'plugin-source-rows');
      group.details = createElement('details', 'plugin-source-details');
      group.details.appendChild(createElement('summary', '', actionsMode ? 'Action details' : 'Source details'));
      group.detailList = createElement('ul', 'plugin-source-detail-list');
      group.details.appendChild(group.detailList);
      group.root.appendChild(heading);
      group.root.appendChild(group.rows);
      group.root.appendChild(group.details);
      groups.push(group);
      addDetail(group, 'Plugin UUID: ' + plugin);
      return group;
    }

    function addDetail(group, text, key) {
      var detail = createElement('li', '', text);
      if (key) { detail.setAttribute('data-source-key', key); }
      group.detailList.appendChild(detail);
    }

    function addAvailableSource(group, source, catalogueIndex) {
      var label = createElement(actionsMode ? 'div' : 'label', actionsMode ? 'plugin-source-row plugin-action-row' : 'plugin-source-row');
      var identifier = sourceIdentifier(source);
      var title = createElement('span', 'plugin-source-title', humanize(identifier));
      var switchWrap = createElement(actionsMode ? 'label' : 'span', 'plugin-source-switch plugin-action-enable');
      var checkbox = createElement('input');
      var track = createElement('span', 'plugin-source-track');
      var key = keyFor(source);

      checkbox.type = 'checkbox';
      checkbox.setAttribute('data-plugin-index', String(catalogueIndex));
      checkbox.setAttribute('aria-label', 'Enable ' + source.pluginName + ': ' + humanize(identifier));
      var selectedEntry = null;
      selected.some(function(choice) { if (sameEntry(choice, source)) { selectedEntry = choice; return true; } return false; });
      checkbox.checked = !!selectedEntry;
      if (actionsMode) {
        var controls = createElement('div', 'plugin-action-controls');
        var askControl = createElement('label', 'plugin-action-ask-first');
        var askText = createElement('span', 'plugin-ask-first-text', 'Ask first');
        var askSwitch = createElement('span', 'plugin-source-switch');
        var askCheckbox = createElement('input');
        var askTrack = createElement('span', 'plugin-source-track');
        label.setAttribute('data-action-row', '');
        switchWrap.setAttribute('aria-label', 'Enable ' + source.pluginName + ': ' + humanize(identifier));
        askControl.setAttribute('data-ask-first-control', '');
        askControl.hidden = !selectedEntry;
        askControl.setAttribute('title', 'Require Confirm or Deny on watch before this action runs.');
        askCheckbox.type = 'checkbox';
        askCheckbox.setAttribute('data-ask-first-index', String(catalogueIndex));
        askCheckbox.setAttribute('aria-label', 'Ask before ' + source.pluginName + ': ' + identifier);
        askCheckbox.checked = !!(selectedEntry && selectedEntry.confirm === true);
        askSwitch.appendChild(askCheckbox);
        askSwitch.appendChild(askTrack);
        askControl.appendChild(askText);
        askControl.appendChild(askSwitch);
        switchWrap.appendChild(checkbox);
        switchWrap.appendChild(track);
        controls.appendChild(askControl);
        controls.appendChild(switchWrap);
        label.appendChild(title);
        label.appendChild(controls);
      } else {
        switchWrap.appendChild(checkbox);
        switchWrap.appendChild(track);
        label.appendChild(title);
        label.appendChild(switchWrap);
      }
      group.rows.appendChild(label);
      if (actionsMode) {
        addDetail(group, 'Action ID: ' + source.action + '. ' + source.description + ' Arguments: ' + (source.arguments.length ? source.arguments.join(', ') : 'none'), key);
      } else {
        addDetail(group, source.category + ' / ' + source.item + ': ' + (source.properties.length ? source.properties.join(', ') : 'No properties listed'), key);
      }
    }

    function addUnavailableSource(group, choice) {
      var row = createElement('div', 'plugin-source-unavailable');
      var identifier = sourceIdentifier(choice);
      var label = createElement('span', 'plugin-source-title', humanize(identifier));
      var unavailable = createElement('span', 'plugin-source-unavailable-label', 'Unavailable');
      var remove = createElement('button', 'plugin-source-remove', 'Remove');
      var key = keyFor(choice);

      row.setAttribute('data-unavailable-key', key);
      remove.type = 'button';
      remove.setAttribute('data-plugin-remove', key);
      remove.setAttribute('aria-label', 'Remove unavailable ' + (actionsMode ? 'action ' + choice.action : 'source ' + choice.category + ' / ' + choice.item));
      row.appendChild(label);
      row.appendChild(unavailable);
      row.appendChild(remove);
      group.rows.appendChild(row);
      addDetail(group, actionsMode ? 'Action ID: ' + choice.action + ' (unavailable)' : choice.category + ' / ' + choice.item + ' (unavailable)', key);
    }

    function setExpanded(expanded) {
      var controls = body.querySelectorAll('input, button');
      var toggle;
      var i;
      var askControl;
      if (actionsMode) {
        expanded = masterExpanded();
        for (i = 0; i < controls.length; i += 1) {
          if (controls[i].getAttribute('data-manipulator-target') !== null) { continue; }
          if (controls[i].getAttribute('data-ask-first-index') !== null) {
            askControl = controls[i].parentNode && controls[i].parentNode.parentNode;
            controls[i].disabled = !expanded || !askControl || askControl.hidden;
          } else {
            controls[i].disabled = !expanded;
          }
        }
        return;
      }
      body.style.display = expanded ? 'block' : 'none';
      root.className = root.className.replace(/\s*open/g, '') + (expanded ? ' open' : '');
      toggle = root.querySelector('[data-plugin-toggle]');
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      for (i = 0; i < controls.length; i += 1) {
        if (controls[i].getAttribute('data-manipulator-target') === null) {
          if (controls[i].getAttribute('data-ask-first-index') !== null) {
            askControl = controls[i].parentNode && controls[i].parentNode.parentNode;
            controls[i].disabled = !expanded || !askControl || askControl.hidden;
          } else {
            controls[i].disabled = !expanded;
          }
        }
      }
    }

    function directActionGroups() {
      var list = actionRoot && actionRoot.querySelector('[data-plugin-list="actions"]');
      var groups = [];
      var children;
      var i;
      if (!list) { return groups; }
      children = list.children;
      for (i = 0; i < children.length; i += 1) {
        if (children[i].getAttribute('data-plugin-kind') === 'actions') { groups.push(children[i]); }
      }
      return groups;
    }

    function sourceGroupFor(plugin) {
      var list = root.querySelector('[data-plugin-list="sources"]');
      var children = list ? list.children : [];
      var i;
      for (i = 0; i < children.length; i += 1) {
        if (children[i].getAttribute('data-plugin-group') === plugin && children[i].getAttribute('data-plugin-kind') !== 'actions') {
          return children[i];
        }
      }
      return null;
    }

    function detachMountedActionGroups() {
      var i;
      var active = root.ownerDocument.activeElement;
      for (i = 0; i < mountedActionGroups.length; i += 1) {
        if (active && mountedActionGroups[i].contains && mountedActionGroups[i].contains(active)) { actionFocus = active; }
        if (mountedActionGroups[i].parentNode) { mountedActionGroups[i].parentNode.removeChild(mountedActionGroups[i]); }
      }
      if (body) { actionScrollTop = body.scrollTop; }
      mountedActionGroups = [];
    }

    function hasPluginRows(groupRoot) {
      var rows = directChildByClass(groupRoot, 'plugin-source-rows');
      return !!rows && !!rows.querySelector('.plugin-source-row, .plugin-source-unavailable');
    }

    function syncMountedActionCounts() {
      var list = root.querySelector('[data-plugin-list="sources"]');
      var entries = list ? list.children : [];
      var plugin;
      var actionGroup;
      var i;
      for (i = 0; i < entries.length; i += 1) {
        plugin = entries[i].getAttribute('data-plugin-group');
        if (plugin === null) { continue; }
        actionGroup = null;
        mountedActionGroups.some(function(group) {
          if (group.getAttribute('data-plugin-group') === plugin && hasPluginRows(group)) {
            actionGroup = group;
            return true;
          }
          return false;
        });
        setPluginCount(entries[i], 'actions', actionGroup && actionGroup._pluginCounts.actions);
      }
    }

    function mountActionGroups(groups) {
      var list = root.querySelector('[data-plugin-list="sources"]');
      var actionGroup;
      var sourceGroup;
      var heading;
      var sourceHeading;
      var details;
      var plugin;
      var i;
      if (!list) { return false; }
      captureExpandedPlugins();
      detachMountedActionGroups();
      groups = groups || directActionGroups();
      for (i = 0; i < groups.length; i += 1) {
        actionGroup = groups[i];
        if (!hasPluginRows(actionGroup)) { continue; }
        plugin = actionGroup.getAttribute('data-plugin-group');
        sourceGroup = sourceGroupFor(plugin);
        heading = actionGroup.querySelector('.plugin-source-group-title');
        if (sourceGroup) {
          sourceHeading = sourceGroup.querySelector('.plugin-source-group-title');
          var sourceName = sourceHeading && sourceHeading.querySelector('.plugin-source-group-name');
          var actionName = heading && heading.querySelector('.plugin-source-group-name');
          if (sourceName && (!trim(sourceName.textContent) || sourceName.textContent === 'Unavailable plugin') && actionName && trim(actionName.textContent)) {
            sourceName.textContent = actionName.textContent;
          }
          if (heading) { heading.hidden = true; }
          actionGroup.open = true;
          details = sourceGroup.querySelector('.plugin-source-details');
          sourceGroup.insertBefore(actionGroup, details || null);
        } else {
          if (heading) { heading.hidden = false; }
          actionGroup.open = expandedByPlugin[plugin] === true;
          bindPluginToggle(actionGroup);
          list.appendChild(actionGroup);
        }
        mountedActionGroups.push(actionGroup);
      }
      syncMountedActionCounts();
      if (actionFocus && mountedActionGroups.some(function(actionGroup) { return actionGroup.contains && actionGroup.contains(actionFocus); })) {
        if (actionFocus.focus) { actionFocus.focus(); }
        actionFocus = null;
      }
      if (body && actionScrollTop) { body.scrollTop = actionScrollTop; }
      setExpanded(body.style.display !== 'none');
      return true;
    }

    function actionsRendered() {
      mountActionGroups(directActionGroups());
    }

    function actionsCountsChanged() {
      syncMountedActionCounts();
    }

    function updateStatus(message) {
      var status = statusElement;
      var parts = [selected.length + ' of ' + MAX_ENABLED + ' selected.'];
      var catalogueStatus = item.config && item.config.catalogueStatus;
      var normalStatus = actionsMode ? 'Pebble plugin actions available' : 'Pebble plugin sources available';
      if (catalogueStatus === normalStatus) {
        catalogueStatus = '';
      } else if (catalogueStatus && catalogueStatus.indexOf(normalStatus) === 0) {
        catalogueStatus = catalogueStatus.substring(normalStatus.length).replace(/^[\s.;:,\-]+/, '');
      }
      if (catalogueStatus) { parts.push(catalogueStatus); }
      if (!catalogue.length && !catalogueStatus) { parts.push(actionsMode ? 'Plugin action catalogue unavailable on this phone.' : 'Plugin source catalogue unavailable on this phone.'); }
      if (message) { parts.push(message); }
      status.textContent = parts.join(' ');
    }

    item.parseSources = function(value) {
      var parsed;
      var result = [];
      var i;
      var j;
      var entry;
      var existingIndex;
      try {
        parsed = typeof value === 'string' ? JSON.parse(value || '[]') : value;
      } catch (e) {
        parsed = [];
      }
      if (!Array.isArray(parsed)) { return result; }
      for (i = 0; i < parsed.length && i < 256; i += 1) {
        entry = cleanEntry(parsed[i]);
        if (!entry) { continue; }
        existingIndex = -1;
        for (j = 0; j < result.length; j += 1) {
          if (sameEntry(result[j], entry)) { existingIndex = j; break; }
        }
        if (existingIndex >= 0) {
          if (actionsMode && entry.confirm === true) { result[existingIndex].confirm = true; }
        } else if (result.length < MAX_ENABLED) {
          result.push(entry);
        }
      }
      return result;
    };

    selected = item.parseSources(item.config && item.config.defaultValue || '[]');

    item.collectSources = function() {
      return selected.slice(0, MAX_ENABLED);
    };

    if (!actionsMode) {
      item.appendActions = function(incomingActionRoot) {
        var sourceList = root.querySelector('[data-plugin-list="sources"]');
        var actionWarning;
        var actionStatus;
        var groupsToMount;
        if (!incomingActionRoot || !body || !sourceList || !incomingActionRoot.querySelector('[data-plugin-list="actions"]')) { return false; }
        groupsToMount = mountedActionGroups.slice();
        if (actionRoot !== incomingActionRoot) {
          if (actionRoot && actionMountListenerAdded) {
            actionRoot.removeEventListener('plugin-actions-rendered', actionsRendered);
            actionRoot.removeEventListener('plugin-actions-counts-changed', actionsCountsChanged);
          }
          detachMountedActionGroups();
          groupsToMount = [];
          actionRoot = incomingActionRoot;
          actionMountListenerAdded = false;
        }
        actionRoot.setAttribute('data-plugin-kind', 'actions');
        body.insertBefore(actionRoot, sourceList.nextSibling);
        actionWarning = actionRoot.querySelector('.plugin-sources-warning');
        actionStatus = actionRoot.querySelector('[data-plugin-status]');
        if (actionWarning) { body.insertBefore(actionWarning, sourceList); }
        if (actionStatus) { body.insertBefore(actionStatus, sourceList); }
        if (!actionMountListenerAdded) {
          actionRoot.addEventListener('plugin-actions-rendered', actionsRendered);
          actionRoot.addEventListener('plugin-actions-counts-changed', actionsCountsChanged);
          actionMountListenerAdded = true;
        }
        actionRoot.style.display = 'none';
        groupsToMount = groupsToMount.concat(directActionGroups());
        mountActionGroups(groupsToMount);
        setExpanded(body.style.display !== 'none');
        return true;
      };
    }

    item.renderSources = function(sources) {
      var list = root.querySelector('[data-plugin-list]');
      var groups = [];
      var previousActionGroups = [];
      var group;
      var source;
      var renderedEvent;
      var i;

      selected = item.parseSources(sources);
      if (!actionsMode) {
        captureExpandedPlugins();
        previousActionGroups = mountedActionGroups.slice();
        detachMountedActionGroups();
      }
      list.textContent = '';
      for (i = 0; i < catalogue.length; i += 1) {
        source = catalogue[i];
        group = findGroup(groups, source.plugin);
        if (!group) { group = addGroup(groups, source.plugin, source.pluginName); }
        addAvailableSource(group, source, i);
      }
      selected.forEach(function(choice) {
        if (catalogue.some(function(entry) { return sameEntry(entry, choice); })) { return; }
        group = findGroup(groups, choice.plugin);
        if (!group) { group = addGroup(groups, choice.plugin, 'Unavailable plugin'); }
        addUnavailableSource(group, choice);
      });
      groups.forEach(function(entry) { list.appendChild(entry.root); });
      renderedGroups = groups.map(function(entry) { return entry.root; });
      item.$manipulatorTarget.set('value', JSON.stringify(selected));
      updateKindCounts();
      updateStatus();
      if (!actionsMode && actionRoot) {
        mountActionGroups(previousActionGroups.concat(directActionGroups()));
      }
      setExpanded(body.style.display !== 'none');
      if (actionsMode && root.dispatchEvent) {
        renderedEvent = root.ownerDocument.createEvent('Event');
        renderedEvent.initEvent('plugin-actions-rendered', true, false);
        root.dispatchEvent(renderedEvent);
      }
    };

    function syncValue() {
      item.$manipulatorTarget.set('value', JSON.stringify(selected));
      updateKindCounts();
      if (actionsMode && root.dispatchEvent) {
        var countEvent = root.ownerDocument.createEvent('Event');
        countEvent.initEvent('plugin-actions-counts-changed', true, false);
        root.dispatchEvent(countEvent);
      }
      updateStatus();
      item.trigger('change');
    }

    function closestByAttr(element, attr) {
      while (element && element !== root) {
        if (element.getAttribute && element.getAttribute(attr) !== null) { return element; }
        element = element.parentNode;
      }
      return null;
    }

    function directChildByClass(parent, className) {
      var children = parent ? parent.children : [];
      var i;
      for (i = 0; i < children.length; i += 1) {
        if (children[i].classList && children[i].classList.contains(className)) { return children[i]; }
      }
      return null;
    }

    function visibleFocusTarget(candidate) {
      var node = candidate;
      var children;
      var summary;
      var i;
      var blocked = false;
      while (node && node !== root) {
        if (node.hidden) { return null; }
        if (node.tagName && node.tagName.toLowerCase() === 'details' && !node.open) {
          children = node.children;
          summary = null;
          for (i = 0; i < children.length; i += 1) {
            if (children[i].tagName && children[i].tagName.toLowerCase() === 'summary') {
              summary = children[i];
              break;
            }
          }
          if (summary && !summary.hidden) { return candidate === summary ? candidate : summary; }
          blocked = true;
        }
        node = node.parentNode;
      }
      return blocked ? null : candidate;
    }

    function insideActionUi(element) {
      while (element && element !== root) {
        if (element.getAttribute && element.getAttribute('data-plugin-kind') === 'actions') { return true; }
        element = element.parentNode;
      }
      return false;
    }

    function bindActionGroup(groupRoot) {
      if (!actionsMode || groupRoot._pluginActionEventsBound) { return; }
      groupRoot._pluginActionEventsBound = true;
      ['click', 'change'].forEach(function(type) {
        groupRoot.addEventListener(type, function(event) {
          var forwarded;
          event.stopPropagation();
          forwarded = root.ownerDocument.createEvent('Event');
          forwarded.initEvent(type, true, false);
          forwarded.pluginActionTarget = event.target;
          root.dispatchEvent(forwarded);
        });
      });
    }

    root.addEventListener('click', function(event) {
      var target = event.pluginActionTarget || event.target;
      var toggle = closestByAttr(target, 'data-plugin-toggle');
      var removeButton = closestByAttr(target, 'data-plugin-remove');
      var key = removeButton && removeButton.getAttribute('data-plugin-remove');
      var selectedIndex;
      var row;
      var group;
      var rowGroup;
      var ownRows;
      var nestedActions;
      var nextFocus;
      var detailRows;
      var detailIndex;

      if (!actionsMode && insideActionUi(target)) { return; }
      if (toggle) {
        setExpanded(body.style.display === 'none');
        return;
      }
      if (!key) { return; }
      selectedIndex = -1;
      selected.some(function(choice, index) { if (keyFor(choice) === key) { selectedIndex = index; return true; } return false; });
      if (selectedIndex < 0) { return; }
      row = closestByAttr(removeButton, 'data-unavailable-key');
      rowGroup = row && row.parentNode;
      group = closestByAttr(removeButton, 'data-plugin-group');
      selected.splice(selectedIndex, 1);
      if (row && row.parentNode) { row.parentNode.removeChild(row); }
      detailRows = group ? group.querySelectorAll('[data-source-key]') : [];
      for (detailIndex = 0; detailIndex < detailRows.length; detailIndex += 1) {
        if (detailRows[detailIndex].getAttribute('data-source-key') === key) {
          detailRows[detailIndex].parentNode.removeChild(detailRows[detailIndex]);
          break;
        }
      }
      ownRows = directChildByClass(group, 'plugin-source-rows');
      if (group && (!ownRows || !ownRows.querySelector('.plugin-source-row, .plugin-source-unavailable'))) {
        nextFocus = group.nextSibling && group.nextSibling.querySelector('[data-plugin-remove]');
        if (!nextFocus && group.previousSibling) { nextFocus = group.previousSibling.querySelector('[data-plugin-remove]'); }
        if (!actionsMode) {
          nestedActions = directChildByClass(group, 'plugin-action-group');
          if (nestedActions && group.parentNode) {
            var actionHeading = nestedActions.querySelector('.plugin-source-group-title');
            if (actionHeading) { actionHeading.hidden = false; }
            expandedByPlugin[group.getAttribute('data-plugin-group')] = !!group.open;
            nestedActions.open = !!group.open;
            bindPluginToggle(nestedActions);
            group.parentNode.insertBefore(nestedActions, group.nextSibling);
            if (!nextFocus) { nextFocus = nestedActions.querySelector('[data-plugin-remove]'); }
          }
        }
        if (group.parentNode) { group.parentNode.removeChild(group); }
        if (actionsMode) {
          mountedActionGroups = mountedActionGroups.filter(function(actionGroup) { return actionGroup !== group; });
        }
      } else {
        nextFocus = rowGroup && rowGroup.querySelector('[data-plugin-remove]');
      }
      nextFocus = visibleFocusTarget(nextFocus);
      if (!nextFocus && actionsMode) {
        var parentBody = masterBody();
        var masterRoot = parentBody && parentBody.parentNode;
        nextFocus = masterRoot && masterRoot.querySelector('[data-plugin-toggle]');
      }
      if (!nextFocus) { nextFocus = root.querySelector('[data-plugin-toggle]'); }
      if (nextFocus && nextFocus.focus) { nextFocus.focus(); }
      syncValue();
    });

    root.addEventListener('change', function(event) {
      var target = event.pluginActionTarget || event.target;
      var askFirstIndex;
      var sourceIndex = target.getAttribute && target.getAttribute('data-plugin-index');
      var source;
      var selectedIndex;
      var actionRow;

      if (!actionsMode && insideActionUi(target)) { return; }
      if (actionsMode) {
        askFirstIndex = target.getAttribute && target.getAttribute('data-ask-first-index');
        if (askFirstIndex !== null && askFirstIndex !== undefined) {
          source = catalogue[parseInt(askFirstIndex, 10)];
          if (!source) { return; }
          selectedIndex = -1;
          selected.some(function(choice, index) { if (sameEntry(choice, source)) { selectedIndex = index; return true; } return false; });
          if (selectedIndex >= 0) {
            if (target.checked) { selected[selectedIndex].confirm = true; }
            else { delete selected[selectedIndex].confirm; }
            syncValue();
          }
          return;
        }
      }
      if (sourceIndex === null || sourceIndex === undefined) { return; }
      source = catalogue[parseInt(sourceIndex, 10)];
      if (!source) { return; }
      selectedIndex = -1;
      selected.some(function(choice, index) { if (sameEntry(choice, source)) { selectedIndex = index; return true; } return false; });
      if (target.checked && selectedIndex < 0) {
        if (selected.length >= MAX_ENABLED) {
          target.checked = false;
          updateStatus('Maximum of 16 enabled plugin ' + (actionsMode ? 'actions' : 'sources') + ' reached.');
          return;
        }
        selected.push(actionsMode
          ? { plugin: source.plugin, action: source.action }
          : { plugin: source.plugin, category: source.category, item: source.item });
      } else if (!target.checked && selectedIndex >= 0) {
        selected.splice(selectedIndex, 1);
      }
      if (actionsMode) {
        actionRow = closestByAttr(target, 'data-action-row');
        syncActionAskFirst(actionRow, target.checked);
      }
      syncValue();
    });
    item.renderSources(selected);
    setExpanded(false);
  },
  defaults: { defaultValue: '[]' }
};
