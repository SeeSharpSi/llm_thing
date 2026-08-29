module.exports = {
  name: 'memory_manager',
  template: '<div class="component component-memory-manager"><button type="button" class="memory-toggle" data-memory-toggle><span class="memory-toggle-title">Pebble Memory</span><span class="memory-toggle-subtitle">Phone-local intentional notes</span></button><div class="memory-body" data-memory-body style="display:none"><p class="memory-help">Edit notes available to model. Empty notes are removed when saved.</p><div class="memory-list" data-memory-list></div><button type="button" class="memory-add" data-memory-add>+ New Note</button><input data-manipulator-target type="hidden" /></div></div>',
  style: '.component-memory-manager{padding:.9rem 1rem}.component-memory-manager .memory-toggle{position:relative;display:block;width:100%;min-height:52px;padding:.75rem 2.7rem .75rem .85rem;background:linear-gradient(135deg,#1c2a39,#111a24);border:1px solid #405064;border-radius:.55rem;color:#fff;font:inherit;text-align:left;text-transform:none}.component-memory-manager .memory-toggle:after{content:"+";position:absolute;top:50%;right:.8rem;width:1.55rem;height:1.55rem;margin-top:-.775rem;background:#f0a94b;border-radius:999px;color:#17202a;font-weight:700;line-height:1.48rem;text-align:center}.component-memory-manager.open .memory-toggle:after{content:"-"}.component-memory-manager .memory-toggle-title{display:block;font-size:1rem;font-weight:700}.component-memory-manager .memory-toggle-subtitle{display:block;margin-top:.12rem;color:#aeb9c7;font-size:.78rem}.component-memory-manager .memory-body{padding:.75rem 0 0}.component-memory-manager .memory-help{margin:.1rem 0 .8rem;color:#aeb9c7;font-size:.82rem;line-height:1.45}.component-memory-manager .memory-list{max-height:16rem;overflow-y:auto;padding-right:.2rem}.component-memory-manager .memory-note{margin:.65rem 0;padding:.7rem;background:#111b25;border:1px solid #36485a;border-radius:.6rem}.component-memory-manager .memory-note textarea{display:block;box-sizing:border-box;width:100%;min-height:4.5rem;resize:vertical;font:inherit}.component-memory-manager button{min-width:0;margin:0;font:inherit;text-transform:none}.component-memory-manager .memory-delete{margin-top:.45rem;padding:.35rem .65rem;background:#302125;border:1px solid #70404a;border-radius:999px;color:#e6a9af;font-size:.78rem}.component-memory-manager .memory-add{padding:.55rem .8rem;background:#f0a94b;border:0;border-radius:.4rem;color:#17202a;font-weight:700}',
  manipulator: {
    get: function() { return JSON.stringify(this.collectMemories()); },
    set: function(value) { this.renderMemories(this.parseMemories(value)); return this.trigger('change'); },
    hide: function() { this.$element.set('+hide'); return this.trigger('hide'); },
    show: function() { this.$element.set('-hide'); return this.trigger('show'); }
  },
  initialize: function() {
    var item = this;
    var root = item.$element[0];
    var body = root.querySelector('[data-memory-body]');
    var maxMemories = 128;
    function trim(value) { return String(value === undefined || value === null ? '' : value).replace(/^\s+|\s+$/g, ''); }
    function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, function(ch) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]; }); }
    function stamp(value) { var number = typeof value === 'number' ? value : parseInt(value, 10); return isFinite(number) && number > 0 ? number : Date.now(); }
    function makeId(value) { value = trim(value); return value && value.length <= 64 ? value : 'memory-' + Date.now() + '-' + Math.floor(Math.random() * 1000000); }
    function closest(element, attr) { while (element && element !== root) { if (element.getAttribute && element.getAttribute(attr) !== null) { return element; } element = element.parentNode; } return null; }
    function expand(value) {
      var controls = body.querySelectorAll('input, textarea, button');
      var i;
      body.style.display = value ? 'block' : 'none';
      root.className = root.className.replace(/\s*open/g, '') + (value ? ' open' : '');
      for (i = 0; i < controls.length; i += 1) { if (controls[i].getAttribute('data-manipulator-target') === null) { controls[i].disabled = !value; } }
    }
    function sync() { item.$manipulatorTarget.set('value', JSON.stringify(item.collectMemories())); item.trigger('change'); }
    item.parseMemories = function(value) {
      var parsed;
      var result = [];
      try { parsed = JSON.parse(value || '[]'); } catch (e) { parsed = []; }
      if (!Array.isArray(parsed)) { parsed = []; }
      parsed.slice(0, maxMemories).forEach(function(memory) { memory = memory || {}; result.push({ id: makeId(memory.id), text: String(memory.text || '').substring(0, 500), createdAt: stamp(memory.createdAt), updatedAt: stamp(memory.updatedAt) }); });
      return result;
    };
    item.collectMemories = function() {
      var notes = root.querySelectorAll('[data-memory-note]');
      var result = [];
      var i;
      var note;
      var text;
      for (i = 0; i < notes.length; i += 1) { note = notes[i]; text = trim(note.querySelector('[data-memory-field="text"]').value).substring(0, 500); if (text) { result.push({ id: makeId(note.getAttribute('data-memory-id')), text: text, createdAt: stamp(note.getAttribute('data-memory-created')), updatedAt: stamp(note.getAttribute('data-memory-updated')) }); } }
      return result;
    };
    item.renderMemories = function(memories) {
      var list = root.querySelector('[data-memory-list]');
      var html = '';
      memories.forEach(function(memory) { html += '<div class="memory-note" data-memory-note data-memory-id="' + escapeHtml(memory.id) + '" data-memory-created="' + escapeHtml(memory.createdAt) + '" data-memory-updated="' + escapeHtml(memory.updatedAt) + '"><textarea maxlength="500" data-memory-field="text">' + escapeHtml(memory.text) + '</textarea><button type="button" class="memory-delete" data-memory-delete>- Delete Note</button></div>'; });
      list.innerHTML = html;
      item.$manipulatorTarget.set('value', JSON.stringify(item.collectMemories()));
      expand(body.style.display !== 'none');
    };
    root.addEventListener('click', function(e) {
      var notes;
      var note;
      if (closest(e.target, 'data-memory-toggle')) { expand(body.style.display === 'none'); return; }
      if (closest(e.target, 'data-memory-add')) { notes = item.collectMemories(); if (notes.length < maxMemories) { notes.push({ id: makeId(), text: '', createdAt: stamp(), updatedAt: stamp() }); } item.renderMemories(notes); expand(true); sync(); return; }
      if (e.target.getAttribute('data-memory-delete') !== null) { note = closest(e.target, 'data-memory-note'); note.parentNode.removeChild(note); sync(); }
    });
    root.addEventListener('input', function(e) { var note = closest(e.target, 'data-memory-note'); if (note) { note.setAttribute('data-memory-updated', stamp()); } sync(); });
    root.addEventListener('change', function(e) { var note = closest(e.target, 'data-memory-note'); if (note) { note.setAttribute('data-memory-updated', stamp()); } sync(); });
    item.renderMemories([]);
    expand(false);
  },
  defaults: { defaultValue: '' }
};
