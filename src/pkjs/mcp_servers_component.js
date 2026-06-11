module.exports = {
  name: 'mcp_servers',
  template: '<div class="component component-mcp-servers"><button type="button" class="mcp-toggle" data-mcp-toggle>MCP Servers</button><div class="mcp-body" data-mcp-body style="display:none;"><p class="mcp-help">Optional remote MCP servers for the OpenAI Responses API. Only add servers you trust; tool calls may share prompt context with them.</p><div data-mcp-list></div><button type="button" class="mcp-add" data-mcp-add>+ Add MCP Server</button><input data-manipulator-target type="hidden" /></div></div>',
  style: '.component-mcp-servers .mcp-toggle{display:block;width:100%;background:#222;color:#fff;border:0;border-radius:.25rem;padding:.7rem;text-align:left;font-size:1rem}.component-mcp-servers .mcp-toggle:after{content:"+";float:right}.component-mcp-servers.open .mcp-toggle:after{content:"-"}.component-mcp-servers .mcp-help{font-size:.85rem;color:#ccc;line-height:1.35}.component-mcp-servers .mcp-server{border:1px solid #444;border-radius:.25rem;margin:.7rem 0;padding:.7rem}.component-mcp-servers .mcp-server-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem}.component-mcp-servers .mcp-server-title{font-weight:bold}.component-mcp-servers .mcp-delete{background:#5b1f1f;color:#fff;border:0;border-radius:.25rem;padding:.35rem .5rem}.component-mcp-servers label{display:block;margin:.55rem 0}.component-mcp-servers .mcp-label{display:block;margin-bottom:.25rem}.component-mcp-servers input[type="text"],.component-mcp-servers input[type="url"],.component-mcp-servers input[type="password"]{display:block;width:100%;background:#333;border:0;border-radius:.25rem;color:#fff;font-size:inherit;min-height:2.1rem;padding:.35rem .375rem;box-sizing:border-box}.component-mcp-servers .mcp-add{display:block;width:100%;background:#333;color:#fff;border:0;border-radius:.25rem;padding:.7rem;margin-top:.7rem}',
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
      return String(value || '').replace(/^\s+|\s+$/g, '');
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
          authorization: trim(server.authorization)
        });
      }

      if (!servers.length) {
        servers.push({ enabled: false, label: '', url: '', description: '', allowedTools: '', authorization: '' });
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
          authorization: trim(cards[i].querySelector('[data-mcp-field="authorization"]').value)
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
          '<div class="mcp-server-header"><span class="mcp-server-title">Server ' + (i + 1) + '</span><button type="button" class="mcp-delete" data-mcp-delete>Delete</button></div>' +
          '<label><input type="checkbox" data-mcp-field="enabled"' + (server.enabled ? ' checked' : '') + ' /> Enabled</label>' +
          '<label><span class="mcp-label">Label</span><input type="text" data-mcp-field="label" placeholder="deepwiki" value="' + escapeHtml(server.label) + '" /></label>' +
          '<label><span class="mcp-label">URL</span><input type="url" data-mcp-field="url" placeholder="https://example.com/mcp" value="' + escapeHtml(server.url) + '" /></label>' +
          '<label><span class="mcp-label">Description</span><input type="text" data-mcp-field="description" placeholder="What this server helps with" value="' + escapeHtml(server.description) + '" /></label>' +
          '<label><span class="mcp-label">Allowed Tools</span><input type="text" data-mcp-field="allowedTools" placeholder="ask_question,read_wiki_structure" value="' + escapeHtml(server.allowedTools) + '" /></label>' +
          '<label><span class="mcp-label">Auth Token</span><input type="password" data-mcp-field="authorization" placeholder="Optional OAuth token" value="' + escapeHtml(server.authorization) + '" /></label>' +
          '</div>';
      }

      list.innerHTML = html;
      item.$manipulatorTarget.set('value', JSON.stringify(item.collectServers()));
    };

    function syncValue() {
      item.$manipulatorTarget.set('value', JSON.stringify(item.collectServers()));
      item.trigger('change');
    }

    root.addEventListener('click', function(e) {
      var servers;

      if (e.target.getAttribute('data-mcp-toggle') !== null) {
        if (body.style.display === 'none') {
          body.style.display = 'block';
          root.className += ' open';
        } else {
          body.style.display = 'none';
          root.className = root.className.replace(/\s*open/g, '');
        }
        return;
      }

      if (e.target.getAttribute('data-mcp-add') !== null) {
        servers = item.collectServers();
        servers.push({ enabled: false, label: '', url: '', description: '', allowedTools: '', authorization: '' });
        item.renderServers(servers);
        syncValue();
        return;
      }

      if (e.target.getAttribute('data-mcp-delete') !== null) {
        servers = item.collectServers();
        servers.splice(Array.prototype.indexOf.call(root.querySelectorAll('[data-mcp-delete]'), e.target), 1);
        if (!servers.length) {
          servers.push({ enabled: false, label: '', url: '', description: '', allowedTools: '', authorization: '' });
        }
        item.renderServers(servers);
        syncValue();
      }
    });

    root.addEventListener('input', syncValue);
    root.addEventListener('change', syncValue);
  },
  defaults: {
    defaultValue: ''
  }
};
