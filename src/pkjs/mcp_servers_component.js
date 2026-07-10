module.exports = {
  name: 'mcp_servers',
  template: '<div class="component component-mcp-servers"><button type="button" class="mcp-toggle" data-mcp-toggle><span class="mcp-toggle-title">MCP Servers</span><span class="mcp-toggle-subtitle">Optional tool providers</span></button><div class="mcp-body" data-mcp-body style="display:none;"><p class="mcp-help">Remote MCP servers can receive prompt context during tool calls. Add only servers you trust.</p><div data-mcp-list></div><button type="button" class="mcp-add" data-mcp-add><span class="mcp-add-plus">+</span> Add MCP Server</button><input data-manipulator-target type="hidden" /></div></div>',
  style: '.component-mcp-servers{margin-top:.25rem}.component-mcp-servers .mcp-toggle{display:block;position:relative;width:100%;background:linear-gradient(135deg,#202633,#141820);color:#fff;border:1px solid #394253;border-radius:.55rem;padding:.8rem 2.4rem .8rem .9rem;text-align:left;box-shadow:0 .15rem .55rem rgba(0,0,0,.25)}.component-mcp-servers .mcp-toggle:after{content:"+";position:absolute;right:.85rem;top:50%;margin-top:-.7rem;width:1.4rem;height:1.4rem;border-radius:1.4rem;background:#38465d;color:#fff;text-align:center;line-height:1.35rem;font-weight:bold}.component-mcp-servers.open .mcp-toggle:after{content:"-"}.component-mcp-servers .mcp-toggle-title{display:block;font-size:1.05rem;font-weight:bold;letter-spacing:.01rem}.component-mcp-servers .mcp-toggle-subtitle{display:block;margin-top:.15rem;color:#aeb8c9;font-size:.78rem}.component-mcp-servers .mcp-body{padding:.75rem .05rem 0}.component-mcp-servers .mcp-help{margin:.15rem .2rem .8rem;color:#b9c2d0;font-size:.84rem;line-height:1.35}.component-mcp-servers .mcp-server{background:#20242c;border:1px solid #3a4352;border-radius:.55rem;margin:.75rem 0;padding:.75rem;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}.component-mcp-servers .mcp-server-header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #333b49;margin:-.1rem 0 .65rem;padding-bottom:.55rem}.component-mcp-servers .mcp-server-title{font-weight:bold;color:#fff}.component-mcp-servers .mcp-delete{background:#3a2024;color:#ffb8c0;border:1px solid #65343b;border-radius:1rem;padding:.25rem .65rem;font-size:.82rem}.component-mcp-servers .mcp-enabled{display:flex;align-items:center;justify-content:space-between;background:#171b22;border:1px solid #333b49;border-radius:.45rem;margin:.45rem 0 .7rem;padding:.55rem .65rem;color:#dce4f0}.component-mcp-servers .mcp-enabled input{width:1.1rem;height:1.1rem}.component-mcp-servers label{display:block;margin:.6rem 0}.component-mcp-servers .mcp-label{display:block;margin-bottom:.28rem;color:#d7deeb;font-size:.82rem;font-weight:bold}.component-mcp-servers input[type="text"],.component-mcp-servers input[type="url"],.component-mcp-servers input[type="password"],.component-mcp-servers input[type="number"]{display:block;width:100%;background:#11151b;border:1px solid #354052;border-radius:.45rem;color:#fff;font-size:inherit;min-height:2.25rem;padding:.45rem .55rem;box-sizing:border-box}.component-mcp-servers input[type="text"]:focus,.component-mcp-servers input[type="url"]:focus,.component-mcp-servers input[type="password"]:focus,.component-mcp-servers input[type="number"]:focus{border-color:#6a87b8;outline:none}.component-mcp-servers input::-webkit-input-placeholder{color:#697386}.component-mcp-servers .mcp-add{display:block;width:100%;background:#1d2d46;color:#dceaff;border:1px solid #40618f;border-radius:.55rem;padding:.75rem;margin-top:.8rem;font-weight:bold}.component-mcp-servers .mcp-add-plus{display:inline-block;width:1.2rem;height:1.2rem;margin-right:.35rem;border-radius:1.2rem;background:#4a76b3;color:#fff;line-height:1.15rem;text-align:center}',
  manipulator: {
    get: function() {
      return JSON.stringify(this.collectServers());
    },
    set: function(value) {
      this.renderServers(this.parseServers(value));
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
    var body = root.querySelector('[data-mcp-body]');

    function trim(value) {
      return String(value === undefined || value === null ? '' : value).replace(/^\s+|\s+$/g, '');
    }

    function escapeHtml(value) {
      return String(value || '').replace(/[&<>"]/g, function(ch) {
        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;'
        }[ch];
      });
    }

    function emptyServer() {
      return { enabled: false, label: '', url: '', description: '', allowedTools: '', maxToolCalls: '', authorization: '', headers: [] };
    }

    function normalizeHeaders(value) {
      var headers = [];
      var i;
      var header;

      if (!value || !value.length) {
        return headers;
      }

      for (i = 0; i < value.length; i += 1) {
        header = value[i] || {};
        headers.push({
          name: trim(header.name),
          value: trim(header.value)
        });
      }

      return headers;
    }

    function collectHeaders(card) {
      var rows = card.querySelectorAll('[data-mcp-header-row]');
      var headers = [];
      var i;

      for (i = 0; i < rows.length; i += 1) {
        headers.push({
          name: trim(rows[i].querySelector('[data-mcp-header-field="name"]').value),
          value: trim(rows[i].querySelector('[data-mcp-header-field="value"]').value)
        });
      }

      return headers;
    }

    function renderHeaders(headers) {
      var html = '';
      var i;
      var header;

      headers = headers || [];
      for (i = 0; i < headers.length; i += 1) {
        header = headers[i] || {};
        html += '<div class="mcp-header-row" data-mcp-header-row>' +
          '<label><span class="mcp-label">Header Name</span><input type="text" data-mcp-header-field="name" placeholder="X-API-Key" value="' + escapeHtml(header.name) + '" /></label>' +
          '<label><span class="mcp-label">Header Value</span><input type="password" data-mcp-header-field="value" placeholder="Secret value" value="' + escapeHtml(header.value) + '" /></label>' +
          '<button type="button" class="mcp-delete" data-mcp-header-delete>- Delete Header</button>' +
          '</div>';
      }

      return html;
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

    function setExpanded(expanded) {
      var controls = body.querySelectorAll('input, button');
      var i;

      body.style.display = expanded ? 'block' : 'none';
      root.className = root.className.replace(/\s*open/g, '') + (expanded ? ' open' : '');
      for (i = 0; i < controls.length; i += 1) {
        if (controls[i].getAttribute('data-manipulator-target') === null) {
          controls[i].disabled = !expanded;
        }
      }
    }

    function serverIndex(card) {
      var cards = root.querySelectorAll('[data-mcp-server]');
      var i;

      for (i = 0; i < cards.length; i += 1) {
        if (cards[i] === card) {
          return i;
        }
      }

      return -1;
    }

    function headerIndex(card, row) {
      var rows = card.querySelectorAll('[data-mcp-header-row]');
      var i;

      for (i = 0; i < rows.length; i += 1) {
        if (rows[i] === row) {
          return i;
        }
      }

      return -1;
    }

    item.parseServers = function(value) {
      var parsed;
      var servers = [];
      var i;
      var server;

      try {
        parsed = JSON.parse(value || '[]');
      } catch (e) {
        parsed = [];
      }

      if (!Array.isArray(parsed)) {
        parsed = [];
      }

      for (i = 0; i < parsed.length; i += 1) {
        server = parsed[i] || {};
        servers.push({
          enabled: server.enabled === true || server.enabled === 1 || server.enabled === '1',
          label: trim(server.label),
          url: trim(server.url),
          description: trim(server.description),
          allowedTools: trim(server.allowedTools),
          maxToolCalls: trim(server.maxToolCalls),
          authorization: trim(server.authorization),
          headers: normalizeHeaders(server.headers)
        });
      }

      if (!servers.length) {
        servers.push(emptyServer());
      }

      return servers;
    };

    item.collectServers = function() {
      var cards = root.querySelectorAll('[data-mcp-server]');
      var servers = [];
      var i;

      for (i = 0; i < cards.length; i += 1) {
        servers.push({
          enabled: !!cards[i].querySelector('[data-mcp-field="enabled"]').checked,
          label: trim(cards[i].querySelector('[data-mcp-field="label"]').value),
          url: trim(cards[i].querySelector('[data-mcp-field="url"]').value),
          description: trim(cards[i].querySelector('[data-mcp-field="description"]').value),
          allowedTools: trim(cards[i].querySelector('[data-mcp-field="allowedTools"]').value),
          maxToolCalls: trim(cards[i].querySelector('[data-mcp-field="maxToolCalls"]').value),
          authorization: trim(cards[i].querySelector('[data-mcp-field="authorization"]').value),
          headers: collectHeaders(cards[i])
        });
      }

      return servers;
    };

    item.renderServers = function(servers) {
      var list = root.querySelector('[data-mcp-list]');
      var html = '';
      var i;
      var server;

      for (i = 0; i < servers.length; i += 1) {
        server = servers[i];
        html += '<div class="mcp-server" data-mcp-server>' +
          '<div class="mcp-server-header"><span class="mcp-server-title">Server ' + (i + 1) + '</span><button type="button" class="mcp-delete" data-mcp-delete>- Delete</button></div>' +
          '<label class="mcp-enabled"><span>Enabled</span><input type="checkbox" data-mcp-field="enabled"' + (server.enabled ? ' checked' : '') + ' /></label>' +
          '<label><span class="mcp-label">Label</span><input type="text" data-mcp-field="label" placeholder="deepwiki" value="' + escapeHtml(server.label) + '" /></label>' +
          '<label><span class="mcp-label">URL</span><input type="url" data-mcp-field="url" placeholder="https://example.com/mcp" value="' + escapeHtml(server.url) + '" /></label>' +
          '<label><span class="mcp-label">Description</span><input type="text" data-mcp-field="description" placeholder="What this server helps with" value="' + escapeHtml(server.description) + '" /></label>' +
          '<label><span class="mcp-label">Allowed Tools</span><input type="text" data-mcp-field="allowedTools" placeholder="ask_question,read_wiki_structure" value="' + escapeHtml(server.allowedTools) + '" /></label>' +
          '<label><span class="mcp-label">Max Tool Calls</span><input type="number" data-mcp-field="maxToolCalls" min="0" step="1" placeholder="Global only" value="' + escapeHtml(server.maxToolCalls) + '" /></label>' +
          '<label><span class="mcp-label">Auth Token</span><input type="password" data-mcp-field="authorization" placeholder="Optional OAuth token" value="' + escapeHtml(server.authorization) + '" /></label>' +
          '<div class="mcp-header-list" data-mcp-header-list>' + renderHeaders(server.headers) + '</div>' +
          '<button type="button" class="mcp-add" data-mcp-header-add>+ Add Custom Header</button>' +
          '</div>';
      }

      list.innerHTML = html;
      item.$manipulatorTarget.set('value', JSON.stringify(item.collectServers()));
      setExpanded(body.style.display !== 'none');
    };

    function syncValue() {
      item.$manipulatorTarget.set('value', JSON.stringify(item.collectServers()));
      item.trigger('change');
    }

    root.addEventListener('click', function(e) {
      var servers;
      var card;
      var row;
      var index;
      var header;

      if (closestByAttr(e.target, 'data-mcp-toggle')) {
        setExpanded(body.style.display === 'none');
        return;
      }

      if (closestByAttr(e.target, 'data-mcp-add')) {
        servers = item.collectServers();
        servers.push(emptyServer());
        item.renderServers(servers);
        syncValue();
        return;
      }

      if (e.target.getAttribute('data-mcp-header-add') !== null) {
        card = closestByAttr(e.target, 'data-mcp-server');
        index = serverIndex(card);
        if (index >= 0) {
          servers = item.collectServers();
          servers[index].headers.push({ name: '', value: '' });
          item.renderServers(servers);
          syncValue();
        }
        return;
      }

      if (e.target.getAttribute('data-mcp-header-delete') !== null) {
        card = closestByAttr(e.target, 'data-mcp-server');
        row = closestByAttr(e.target, 'data-mcp-header-row');
        index = serverIndex(card);
        header = card ? headerIndex(card, row) : -1;
        if (index >= 0 && header >= 0) {
          servers = item.collectServers();
          servers[index].headers.splice(header, 1);
          item.renderServers(servers);
          syncValue();
        }
        return;
      }

      if (e.target.getAttribute('data-mcp-delete') !== null) {
        servers = item.collectServers();
        servers.splice(Array.prototype.indexOf.call(root.querySelectorAll('[data-mcp-delete]'), e.target), 1);
        if (!servers.length) {
          servers.push(emptyServer());
        }
        item.renderServers(servers);
        syncValue();
      }
    });

    root.addEventListener('input', syncValue);
    root.addEventListener('change', syncValue);
    setExpanded(false);
  },
  defaults: {
    defaultValue: ''
  }
};
