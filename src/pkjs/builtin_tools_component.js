module.exports = {
  name: 'builtin_tools',
  template: '<div class="component component-builtin-tools"><button type="button" class="builtin-toggle" data-builtin-toggle><span class="builtin-toggle-title">Built-in Tools</span><span class="builtin-toggle-subtitle">Phone-side tools the model may call</span></button><div class="builtin-body" data-builtin-body style="display:none;"><p class="builtin-help">These tools run on this phone. Toggle them below; changes save with your settings.</p><div class="builtin-list" data-builtin-list></div></div><input data-manipulator-target type="hidden" /></div>',
  style: '.component-builtin-tools{padding:.9rem 1rem}.component-builtin-tools .builtin-toggle{position:relative;display:block;width:100%;min-width:0;min-height:52px;margin:0;padding:.75rem 2.7rem .75rem .85rem;background:linear-gradient(135deg,#1c2a39,#111a24);border:1px solid #405064;border-radius:.55rem;box-shadow:0 .2rem .7rem rgba(0,0,0,.22);color:#fff;font:inherit;text-align:left;text-transform:none}.component-builtin-tools .builtin-toggle:after{content:"+";position:absolute;top:50%;right:.8rem;width:1.55rem;height:1.55rem;margin-top:-.775rem;background:#f0a94b;border-radius:999px;color:#17202a;font-size:1rem;font-weight:700;line-height:1.48rem;text-align:center}.component-builtin-tools.open .builtin-toggle:after{content:"-"}.component-builtin-tools .builtin-toggle:focus{border-color:#f0a94b;box-shadow:0 0 0 2px rgba(240,169,75,.25);outline:0}.component-builtin-tools .builtin-toggle-title{display:block;font-size:1rem;font-weight:700;letter-spacing:.01em}.component-builtin-tools .builtin-toggle-subtitle{display:block;margin-top:.12rem;color:#aeb9c7;font-size:.78rem}.component-builtin-tools .builtin-body{padding:.75rem 0 0}.component-builtin-tools .builtin-help{margin:.1rem 0 .8rem;color:#aeb9c7;font-size:.82rem;line-height:1.45}.component-builtin-tools .builtin-list{max-height:24rem;overflow-y:auto;padding-right:.2rem}.component-builtin-tools button{min-width:0;margin:0;font:inherit;text-transform:none}',
  manipulator: {
    get: function() {
      return '';
    },
    set: function() {
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
    var body = root.querySelector('[data-builtin-body]');
    var list = root.querySelector('[data-builtin-list]');

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
      var controls = body.querySelectorAll('input, select, textarea, button');
      var i;

      body.style.display = expanded ? 'block' : 'none';
      root.className = root.className.replace(/\s*open/g, '') + (expanded ? ' open' : '');
      for (i = 0; i < controls.length; i += 1) {
        controls[i].disabled = !expanded;
      }
    }

    item.appendItems = function(elements) {
      var items = elements || [];
      var count = 0;
      var i;

      for (i = 0; i < items.length; i += 1) {
        if (items[i]) {
          list.appendChild(items[i]);
          count += 1;
        }
      }

      setExpanded(body.style.display !== 'none');
      return count;
    };

    root.addEventListener('click', function(e) {
      if (closestByAttr(e.target, 'data-builtin-toggle')) {
        setExpanded(body.style.display === 'none');
      }
    });

    setExpanded(false);
  },
  defaults: {
    defaultValue: ''
  }
};
