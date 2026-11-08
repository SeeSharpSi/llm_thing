module.exports = {
  name: 'plugin_sources',
  template: '<div class="component component-plugin-sources"><button type="button" class="plugin-sources-toggle" data-plugin-toggle aria-expanded="false"><span class="plugin-sources-title">Plugin Sources</span><span class="plugin-sources-subtitle">Optional read-only data sources</span></button><div class="plugin-sources-body" data-plugin-body style="display:none;"><p class="plugin-sources-warning">Enabled sources are read automatically. Returned data is sent to your configured model provider. Pebble OS permissions may still need approval.</p><p class="plugin-sources-status" data-plugin-status role="status" aria-live="polite"></p><div data-plugin-list></div><input data-manipulator-target type="hidden" /></div></div>',
  style: '.component-plugin-sources{box-sizing:border-box;min-width:0;max-width:100%;padding:.75rem 1rem;color:#f5f7fa}.component-plugin-sources .plugin-sources-toggle{position:relative;display:block;box-sizing:border-box;width:100%;min-width:0;min-height:52px;margin:0;padding:.65rem 2.7rem .65rem .75rem;background:#182431;border:1px solid #405064;border-radius:.45rem;color:#fff;font:inherit;text-align:left;text-transform:none;box-shadow:none}.component-plugin-sources .plugin-sources-toggle:after{content:"+";position:absolute;top:50%;right:.7rem;width:1.5rem;height:1.5rem;margin-top:-.75rem;border-radius:50%;background:#f0a94b;color:#17202a;font-size:1rem;font-weight:700;line-height:1.5rem;text-align:center}.component-plugin-sources.open .plugin-sources-toggle:after{content:"-"}.component-plugin-sources .plugin-sources-toggle:focus,.component-plugin-sources button:focus{outline:2px solid #f0a94b;outline-offset:2px}.component-plugin-sources .plugin-sources-title{display:block;font-size:1rem;font-weight:700}.component-plugin-sources .plugin-sources-subtitle{display:block;margin-top:.12rem;color:#aeb9c7;font-size:.78rem}.component-plugin-sources .plugin-sources-body{box-sizing:border-box;min-width:0;max-width:100%;padding:.7rem 0 0}.component-plugin-sources .plugin-sources-warning,.component-plugin-sources .plugin-sources-status{max-width:100%;margin:.15rem 0 .55rem;color:#bdc7d3;font-size:.82rem;line-height:1.45;overflow-wrap:anywhere}.component-plugin-sources .plugin-sources-status{color:#d6dce4}.component-plugin-sources .plugin-source-group{box-sizing:border-box;min-width:0;max-width:100%;margin:.65rem 0 0;padding:0 0 .55rem;border-bottom:1px solid #344252}.component-plugin-sources .plugin-source-group-title{position:static;margin:0;padding:.25rem 0 .35rem;color:#fff;font-size:.9rem;font-weight:700;line-height:1.35;letter-spacing:normal;text-align:left;text-transform:none;transform:none;overflow-wrap:anywhere}.component-plugin-sources .plugin-source-row{display:grid;grid-template-columns:minmax(0,1fr) 48px;align-items:center;justify-content:initial;box-sizing:border-box;width:100%;min-width:0;min-height:50px;margin:0;padding:.25rem 0;border:0;border-bottom:1px solid #2b3948;border-radius:0;background:transparent;color:#f5f7fa;text-align:left;line-height:normal;overflow-wrap:anywhere}.component-plugin-sources label.plugin-source-row{display:grid;flex-direction:initial;flex-wrap:initial;align-items:center;justify-content:initial;box-sizing:border-box;width:100%;min-width:0;max-width:none;min-height:50px;margin:0;padding:.25rem 0;border:0;background:transparent;color:#f5f7fa;text-align:left;text-transform:none;line-height:normal;white-space:normal;cursor:pointer}.component-plugin-sources .plugin-source-title{display:block;min-width:0;max-width:100%;overflow-wrap:anywhere}.component-plugin-sources .plugin-source-switch{position:relative;display:block;box-sizing:border-box;width:48px;height:44px;justify-self:end}.component-plugin-sources .plugin-source-switch input{position:absolute;z-index:2;inset:0;box-sizing:border-box;width:48px;height:44px;margin:0;opacity:0;cursor:pointer}.component-plugin-sources .plugin-source-track{position:absolute;top:10px;right:2px;display:block;box-sizing:border-box;width:42px;height:24px;border:1px solid #718095;border-radius:999px;background:#283544;pointer-events:none}.component-plugin-sources .plugin-source-track:after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#c5ced8;transition:transform .12s ease,background-color .12s ease}.component-plugin-sources .plugin-source-switch input:checked+.plugin-source-track{border-color:#d89132;background:#b8751c}.component-plugin-sources .plugin-source-switch input:checked+.plugin-source-track:after{transform:translateX(18px);background:#fff}.component-plugin-sources .plugin-source-switch input:focus+.plugin-source-track{outline:2px solid #f0a94b;outline-offset:2px}.component-plugin-sources .plugin-source-details{min-width:0;margin:.2rem 0 0;color:#aeb9c7;font-size:.78rem;line-height:1.4}.component-plugin-sources .plugin-source-details summary{box-sizing:border-box;min-height:44px;padding:.6rem 0;color:#c5ced8;cursor:pointer;overflow-wrap:anywhere}.component-plugin-sources .plugin-source-detail-list{margin:0;padding:0 0 0 1.1rem;overflow-wrap:anywhere}.component-plugin-sources .plugin-source-detail-list li{margin:.2rem 0}.component-plugin-sources .plugin-source-unavailable{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:.5rem;min-width:0;min-height:50px;padding:.25rem 0;border-bottom:1px solid #2b3948}.component-plugin-sources .plugin-source-remove{box-sizing:border-box;min-width:48px;min-height:44px;margin:0;padding:.35rem .55rem;border:1px solid #70404a;border-radius:.35rem;background:#302125;color:#f0b5bb;font:inherit;font-size:.78rem;text-transform:none}',
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
    var body = root.querySelector('[data-plugin-body]');
    var actionsMode = root.getAttribute('data-plugin-kind') === 'actions';
    var catalogue = parseCatalogue(item.config && item.config.catalogueEncoded).map(catalogueEntry).filter(function(entry) { return !!entry; });
    var selected;
    var MAX_ENABLED = 16;

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
      entry = actionsMode
        ? { plugin: trim(entry.plugin).toLowerCase(), action: identifier }
        : { plugin: trim(entry.plugin).toLowerCase(), category: entry.category, item: identifier };
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

    function createElement(tag, className, text) {
      var element = root.ownerDocument.createElement(tag);
      if (className) { element.className = className; }
      if (text !== undefined) { element.textContent = text; }
      return element;
    }

    function findGroup(groups, plugin) {
      var i;
      for (i = 0; i < groups.length; i += 1) {
        if (groups[i].plugin === plugin) { return groups[i]; }
      }
      return null;
    }

    function addGroup(groups, plugin, pluginName) {
      var group = { plugin: plugin, root: createElement('section', 'plugin-source-group'), rows: null, details: null, detailList: null };
      var heading = createElement('h3', 'plugin-source-group-title', pluginName);
      group.root.setAttribute('data-plugin-group', plugin);
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
      var label = createElement('label', 'plugin-source-row');
      var identifier = sourceIdentifier(source);
      var title = createElement('span', 'plugin-source-title', humanize(identifier));
      var switchWrap = createElement('span', 'plugin-source-switch');
      var checkbox = createElement('input');
      var track = createElement('span', 'plugin-source-track');
      var key = keyFor(source);

      checkbox.type = 'checkbox';
      checkbox.setAttribute('data-plugin-index', String(catalogueIndex));
      checkbox.setAttribute('aria-label', source.pluginName + ': ' + humanize(identifier));
      checkbox.checked = selected.some(function(choice) { return sameEntry(choice, source); });
      switchWrap.appendChild(checkbox);
      switchWrap.appendChild(track);
      label.appendChild(title);
      label.appendChild(switchWrap);
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
      var remove = createElement('button', 'plugin-source-remove', 'Remove');
      var key = keyFor(choice);

      row.setAttribute('data-unavailable-key', key);
      remove.type = 'button';
      remove.setAttribute('data-plugin-remove', key);
      remove.setAttribute('aria-label', 'Remove unavailable ' + (actionsMode ? 'action ' + choice.action : 'source ' + choice.category + ' / ' + choice.item));
      row.appendChild(label);
      row.appendChild(remove);
      group.rows.appendChild(row);
      addDetail(group, actionsMode ? 'Action ID: ' + choice.action + ' (unavailable)' : choice.category + ' / ' + choice.item + ' (unavailable)', key);
    }

    function setExpanded(expanded) {
      var controls = body.querySelectorAll('input, button');
      var toggle = root.querySelector('[data-plugin-toggle]');
      var i;
      body.style.display = expanded ? 'block' : 'none';
      root.className = root.className.replace(/\s*open/g, '') + (expanded ? ' open' : '');
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      for (i = 0; i < controls.length; i += 1) {
        if (controls[i].getAttribute('data-manipulator-target') === null) {
          controls[i].disabled = !expanded;
        }
      }
    }

    function updateStatus(message) {
      var status = root.querySelector('[data-plugin-status]');
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
      var entry;
      try {
        parsed = typeof value === 'string' ? JSON.parse(value || '[]') : value;
      } catch (e) {
        parsed = [];
      }
      if (!Array.isArray(parsed)) { return result; }
      for (i = 0; i < parsed.length && result.length < MAX_ENABLED; i += 1) {
        entry = cleanEntry(parsed[i]);
        if (entry && !result.some(function(existing) { return sameEntry(existing, entry); })) { result.push(entry); }
      }
      return result;
    };

    selected = item.parseSources(item.config && item.config.defaultValue || '[]');

    item.collectSources = function() {
      return selected.slice(0, MAX_ENABLED);
    };

    item.renderSources = function(sources) {
      var list = root.querySelector('[data-plugin-list]');
      var groups = [];
      var group;
      var source;
      var i;

      selected = item.parseSources(sources);
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
      item.$manipulatorTarget.set('value', JSON.stringify(selected));
      updateStatus();
      setExpanded(body.style.display !== 'none');
    };

    function syncValue() {
      item.$manipulatorTarget.set('value', JSON.stringify(selected));
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

    root.addEventListener('click', function(event) {
      var toggle = closestByAttr(event.target, 'data-plugin-toggle');
      var removeButton = closestByAttr(event.target, 'data-plugin-remove');
      var key = removeButton && removeButton.getAttribute('data-plugin-remove');
      var selectedIndex;
      var row;
      var group;
      var rowGroup;
      var nextFocus;
      var detailRows;
      var detailIndex;

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
      if (group && !group.querySelector('.plugin-source-row, .plugin-source-unavailable')) {
        nextFocus = group.nextSibling && group.nextSibling.querySelector('[data-plugin-remove]');
        if (!nextFocus && group.previousSibling) { nextFocus = group.previousSibling.querySelector('[data-plugin-remove]'); }
        if (group.parentNode) { group.parentNode.removeChild(group); }
      } else {
        nextFocus = rowGroup && rowGroup.querySelector('[data-plugin-remove]');
      }
      if (!nextFocus) { nextFocus = root.querySelector('[data-plugin-toggle]'); }
      if (nextFocus && nextFocus.focus) { nextFocus.focus(); }
      syncValue();
    });

    root.addEventListener('change', function(event) {
      var sourceIndex = event.target.getAttribute && event.target.getAttribute('data-plugin-index');
      var source;
      var selectedIndex;
      if (sourceIndex === null || sourceIndex === undefined) { return; }
      source = catalogue[parseInt(sourceIndex, 10)];
      if (!source) { return; }
      selectedIndex = -1;
      selected.some(function(choice, index) { if (sameEntry(choice, source)) { selectedIndex = index; return true; } return false; });
      if (event.target.checked && selectedIndex < 0) {
        if (selected.length >= MAX_ENABLED) {
          event.target.checked = false;
          updateStatus('Maximum of 16 enabled plugin ' + (actionsMode ? 'actions' : 'sources') + ' reached.');
          return;
        }
        selected.push(actionsMode
          ? { plugin: source.plugin, action: source.action }
          : { plugin: source.plugin, category: source.category, item: source.item });
      } else if (!event.target.checked && selectedIndex >= 0) {
        selected.splice(selectedIndex, 1);
      }
      syncValue();
    });
    item.renderSources(selected);
    setExpanded(false);
  },
  defaults: { defaultValue: '[]' }
};
