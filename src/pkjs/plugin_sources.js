var watch = require('./watch');

var MAX_SOURCES = 128;
var MAX_CATALOGUE_WORK = 8192;
var MAX_SHAPES_PER_PROPERTY = 32;
var MAX_ENABLED = 16;
var MAX_ENABLED_SCAN = 256;
var MAX_SCAN_INSTANCES = 512;
var MAX_PROPERTIES = 32;
var MAX_SERIES_VALUES = 128;
var MAX_RESULT_CHARS = 6000;
var TIMEOUT_MS = 15000;
var s_live = Object.create(null);

function own(object, key) {
  return object !== null && object !== undefined && Object.prototype.hasOwnProperty.call(object, key);
}

function object(value) {
  return value && typeof value === 'object' && Object.prototype.toString.call(value) !== '[object Array]';
}

function bounded(value, limit) {
  return String(value).substring(0, limit);
}

function integer(value) {
  return typeof value === 'number' && isFinite(value) && Math.floor(value) === value;
}

function safeName(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 120 ? value : '';
}

function validUuid(value) {
  return typeof value === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value);
}

var SAFE_SHAPES = { shortText: true, longText: true, numericValue: true, boolean: true, timestamp: true };

function takeCatalogueWork(work) {
  if (work.steps >= MAX_CATALOGUE_WORK) { work.limited = true; return false; }
  work.steps += 1;
  return true;
}

function supportedShapes(declarations, work) {
  var safe = [];
  var i;
  var name;
  if (Object.prototype.toString.call(declarations) !== '[object Array]') {
    declarations = typeof declarations === 'string' ? [declarations] : [];
  }
  if (declarations.length > MAX_SHAPES_PER_PROPERTY) { work.limited = true; }
  for (i = 0; i < declarations.length && i < MAX_SHAPES_PER_PROPERTY; i += 1) {
    if (!takeCatalogueWork(work)) { break; }
    name = declarations[i];
    if (typeof name !== 'string') { continue; }
    if (own(SAFE_SHAPES, name) && safe.indexOf(name) === -1) { safe.push(name); }
    if (name.indexOf('series.') === 0 && own(SAFE_SHAPES, name.substring(7)) && safe.indexOf(name) === -1) { safe.push(name); }
  }
  return safe;
}

function enumerateCatalogue() {
  var result = { sources: [], status: '' };
  var plugins;
  var i;
  var j;
  var k;
  var plugin;
  var source;
  var names;
  var propertyShapes;
  var category;
  var item;
  var inspectedItems = 0;
  var work = { steps: 0, limited: false };
  var seenTuples = Object.create(null);
  if (typeof Pebble === 'undefined' || !Pebble || typeof Pebble.enumeratePlugins !== 'function') {
    result.status = 'Pebble plugin source API unavailable; update Pebble app to enable plugins';
    return result;
  }
  try { plugins = Pebble.enumeratePlugins(); } catch (e) {
    result.status = 'Pebble plugin enumeration failed; update Pebble app and retry';
    return result;
  }
  if (Object.prototype.toString.call(plugins) !== '[object Array]') {
    result.status = 'Pebble plugin catalogue unavailable';
    return result;
  }
  for (i = 0; i < plugins.length && result.sources.length < MAX_SOURCES && !work.limited; i += 1) {
    if (!takeCatalogueWork(work)) { break; }
    plugin = plugins[i];
    if (!object(plugin) || !validUuid(plugin.uuid) ||
        Object.prototype.toString.call(plugin.sources) !== '[object Array]') { continue; }
    for (j = 0; j < plugin.sources.length && result.sources.length < MAX_SOURCES && !work.limited; j += 1) {
      if (!takeCatalogueWork(work)) { break; }
      source = plugin.sources[j];
      if (!object(source) || typeof source.category !== 'string' || typeof source.items !== 'object' ||
          Object.prototype.toString.call(source.items) !== '[object Array]' || !object(source.properties)) { continue; }
      names = [];
      propertyShapes = Object.create(null);
      var propertyCount = 0;
      for (k in source.properties) {
        if (!takeCatalogueWork(work)) { break; }
        if (!own(source.properties, k)) { continue; }
        propertyCount += 1;
        if (propertyCount > 128) { work.limited = true; break; }
        if (k.length <= 80 && k !== '__proto__' && k !== 'iconPixelSize') {
          propertyShapes[k] = supportedShapes(source.properties[k], work);
          if (propertyShapes[k].length) { names.push(k); }
        }
      }
      if (!names.length) { continue; }
      category = safeName(source.category);
      if (!category) { continue; }
      for (k = 0; k < source.items.length && result.sources.length < MAX_SOURCES && inspectedItems < MAX_SOURCES * 4 && !work.limited; k += 1) {
        if (!takeCatalogueWork(work)) { break; }
        inspectedItems += 1;
        item = safeName(source.items[k]);
        if (!item) { continue; }
        var tuple = JSON.stringify([plugin.uuid.toLowerCase(), category, item]);
        var tupleKey = 'tuple:' + tuple;
        if (!own(seenTuples, tupleKey)) {
          seenTuples[tupleKey] = true;
          var safeProperties = names.slice(0, MAX_PROPERTIES);
          var safeShapes = Object.create(null);
          var p;
          for (p = 0; p < safeProperties.length; p += 1) { safeShapes[safeProperties[p]] = propertyShapes[safeProperties[p]]; }
          result.sources.push({ plugin: plugin.uuid.toLowerCase(), pluginName: safeName(plugin.name) || 'Pebble plugin', category: category, item: item, properties: safeProperties, shapes: safeShapes });
        }
      }
    }
  }
  if (result.sources.length >= MAX_SOURCES || inspectedItems >= MAX_SOURCES * 4) { work.limited = true; }
  result.status = result.sources.length ? 'Pebble plugin sources available' : 'No supported Pebble plugin sources found; update Pebble app and installed plugins if plugins are expected';
  if (work.limited) { result.status += '; catalogue scan stopped at a bounded work cap (maximum ' + MAX_CATALOGUE_WORK + ' work units; source, item, property, and shape subcaps apply)'; }
  return result;
}

function getCatalogue() {
  var catalogue = enumerateCatalogue();
  var sources = [];
  var i;
  var entry;
  for (i = 0; i < catalogue.sources.length; i += 1) {
    entry = catalogue.sources[i];
    sources.push({ plugin: entry.plugin, pluginName: entry.pluginName, category: entry.category, item: entry.item, properties: entry.properties.slice() });
  }
  return { sources: sources, status: catalogue.status };
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'source';
}

function hash(value) {
  var h = 2166136261;
  var i;
  for (i = 0; i < value.length; i += 1) { h = ((h ^ value.charCodeAt(i)) * 16777619) >>> 0; }
  return h.toString(36);
}

function parseEnabled(settings) {
  var parsed;
  var enabled = [];
  var seen = Object.create(null);
  var i;
  var entry;
  var key;
  try { parsed = JSON.parse(settings && settings.PluginSourcesJson || '[]'); } catch (e) { return enabled; }
  if (Object.prototype.toString.call(parsed) !== '[object Array]') { return enabled; }
  for (i = 0; i < parsed.length && i < MAX_ENABLED_SCAN && enabled.length < MAX_ENABLED; i += 1) {
    entry = parsed[i];
    if (!object(entry) || !validUuid(entry.plugin) || typeof entry.category !== 'string' || typeof entry.item !== 'string') { continue; }
    key = JSON.stringify([entry.plugin.toLowerCase(), entry.category, entry.item]);
    if (!own(seen, key)) { seen[key] = true; enabled.push({ plugin: entry.plugin.toLowerCase(), category: entry.category, item: entry.item }); }
  }
  return enabled;
}

function definitionName(source, used) {
  var suffix = '_' + hash(JSON.stringify([source.plugin, source.category, source.item]));
  var base = 'pebble_plugin_' + slug(source.category) + '_' + slug(source.item);
  var candidate = base.substring(0, 64 - suffix.length) + suffix;
  var n = 2;
  while (own(used, candidate)) { candidate = base.substring(0, 58) + '_' + n; n += 1; }
  used[candidate] = true;
  return candidate;
}

function sourceSchema(source) {
  var propertyList = source.properties.join(', ');
  return {
    type: 'object', additionalProperties: false,
    properties: {
      instanceId: { type: 'string', maxLength: 128, description: 'Optional exact instance id filter.' },
      properties: { type: 'array', uniqueItems: true, maxItems: MAX_PROPERTIES, items: { type: 'string', enum: source.properties }, description: 'Optional subset of declared properties: ' + propertyList + '. Filter properties to recover from truncation.' },
      offset: { type: 'integer', minimum: 0, description: 'Page offset in instances; default 0. Continue at nextOffset when hasMore is true.' },
      limit: { type: 'integer', minimum: 1, maximum: 16, description: 'Page size; default 16, maximum 16.' }
    }
  };
}

function getTools(settings) {
  var catalogue = enumerateCatalogue().sources;
  var enabled = parseEnabled(settings);
  var tools = [];
  var used = Object.create(null);
  var i;
  var j;
  var source;
  var match;
  for (i = 0; i < enabled.length; i += 1) {
    match = null;
    for (j = 0; j < catalogue.length; j += 1) {
      source = catalogue[j];
      if (source.plugin === enabled[i].plugin && source.category === enabled[i].category && source.item === enabled[i].item) { match = source; break; }
    }
    if (!match) { continue; }
    (function(selected) {
      tools.push({
        name: definitionName(selected, used), label: 'Plugin: ' + selected.pluginName,
        description: 'Read current data from installed Pebble plugin ' + selected.pluginName + ' (' + selected.category + '/' + selected.item + '). Read-only. Properties: ' + selected.properties.join(', ') + '. Results page instances (default 16); use nextOffset while hasMore is true. Use properties filter to recover from truncation.',
        parameters: sourceSchema(selected),
        call: function(args, requestId, callback) { callSource(selected, args, requestId, callback); }
      });
    }(match));
  }
  return tools;
}

function addUnique(list, value) {
  if (list.indexOf(value) === -1) { list.push(value); }
}

function boundedText(value, maxLength, flags) {
  var end;
  if (value.length <= maxLength) { return value; }
  flags.truncated = true;
  end = maxLength;
  if (end > 0 && end < value.length && value.charCodeAt(end - 1) >= 0xD800 && value.charCodeAt(end - 1) <= 0xDBFF &&
      value.charCodeAt(end) >= 0xDC00 && value.charCodeAt(end) <= 0xDFFF) { end -= 1; }
  return value.substring(0, end);
}

function copyNumericMetadata(input, output, flags) {
  if (typeof input.unit === 'string') { output.unit = boundedText(input.unit, 48, flags); }
  if (typeof input.min === 'number' && isFinite(input.min)) { output.min = input.min; }
  if (typeof input.max === 'number' && isFinite(input.max)) { output.max = input.max; }
}

function scalarShape(shape, input, flags) {
  var output;
  if (!object(input)) { return null; }
  if (shape === 'shortText' || shape === 'longText') {
    if (typeof input.text !== 'string') { return null; }
    output = { text: boundedText(input.text, shape === 'shortText' ? 128 : 512, flags) };
    return output;
  }
  if (shape === 'numericValue') {
    if (typeof input.value !== 'number' || !isFinite(input.value)) { return null; }
    output = { value: input.value };
    copyNumericMetadata(input, output, flags);
    return output;
  }
  if (shape === 'boolean') { return typeof input.value === 'boolean' ? { value: input.value } : null; }
  if (shape === 'timestamp') { return typeof input.value === 'number' && isFinite(input.value) ? { value: input.value } : null; }
  return null;
}

function seriesShape(shape, input, flags) {
  var values;
  var output;
  var result = [];
  var i;
  var value;
  var max;
  if (!object(input) || Object.prototype.toString.call(input.values) !== '[object Array]') { return null; }
  values = input.values;
  max = Math.min(values.length, MAX_SERIES_VALUES);
  for (i = 0; i < max; i += 1) {
    value = values[i];
    if (value === null) { result.push(null); continue; }
    if ((shape === 'shortText' || shape === 'longText') && typeof value === 'string') {
      result.push(boundedText(value, shape === 'shortText' ? 128 : 512, flags));
    } else if ((shape === 'numericValue' || shape === 'timestamp') && typeof value === 'number' && isFinite(value)) {
      result.push(value);
    } else if (shape === 'boolean' && typeof value === 'boolean') {
      result.push(value);
    } else {
      result.push(null);
      flags.omittedValues += 1;
      flags.truncated = true;
    }
  }
  if (values.length > max) { flags.omittedValues += values.length - max; flags.truncated = true; }
  output = { values: result };
  if (shape === 'numericValue') { copyNumericMetadata(input, output, flags); }
  return output;
}

function sanitizedProperty(value, declarations, flags) {
  var result = {};
  var shapes = ['shortText', 'longText', 'numericValue', 'boolean', 'timestamp'];
  var i;
  var shape;
  var clean;
  var hasSeries = object(value) && object(value.series);
  if (!object(value)) { return null; }
  for (i = 0; i < shapes.length; i += 1) {
    shape = shapes[i];
    if (declarations.indexOf(shape) === -1 || !own(value, shape)) { continue; }
    clean = scalarShape(shape, value[shape], flags);
    if (clean) { result[shape] = clean; }
  }
  if (hasSeries) {
    var series = {};
    var seriesNames = ['shortText', 'longText', 'numericValue', 'boolean', 'timestamp'];
    for (i = 0; i < seriesNames.length; i += 1) {
      shape = seriesNames[i];
      if (declarations.indexOf('series.' + shape) === -1 || !own(value.series, shape)) { continue; }
      clean = seriesShape(shape, value.series[shape], flags);
      if (clean) { series[shape] = clean; }
    }
    if (Object.keys(series).length) {
      if (typeof value.series.start === 'number' && isFinite(value.series.start)) { series.start = value.series.start; }
      if (typeof value.series.stepSec === 'number' && isFinite(value.series.stepSec)) { series.stepSec = value.series.stepSec; }
      result.series = series;
    }
  }
  return Object.keys(result).length ? result : null;
}

function formatEnvelope(source, envelope, args) {
  var input = envelope.instances;
  var offset = args.offset || 0;
  var limit = args.limit || 16;
  var allowed = args.properties || source.properties;
  var selected = [];
  var output = { pluginUuid: source.plugin, category: source.category, item: source.item, instances: [] };
  var i;
  var j;
  var instance;
  var properties;
  var key;
  var clean;
  var flags;
  var rendered;
  var candidate;
  var stoppedForBudget = false;
  var filtered = args.instanceId !== undefined;
  var scanCount = filtered ? Math.min(input.length, MAX_SCAN_INSTANCES) : 0;
  var incompleteScan = filtered && input.length > scanCount;
  var pageStart;
  var pageEnd;
  var overallTruncated = incompleteScan;
  var finalPage = null;
  if (typeof envelope.validUntilMs === 'number' && isFinite(envelope.validUntilMs)) { output.validUntilMs = envelope.validUntilMs; }
  if (incompleteScan) {
    output.scanTruncated = true;
    output.omittedInstancesAtLeast = input.length - scanCount;
    output.omission = 'Instance filter search stopped after ' + MAX_SCAN_INSTANCES + ' instances; later instances were not searched';
  }
  if (filtered) {
    for (i = 0; i < scanCount; i += 1) {
      instance = input[i];
      if (!object(instance) || typeof instance.instanceId !== 'string' || !object(instance.properties)) { return null; }
      if (instance.instanceId === args.instanceId) { selected.push({ entry: instance, sourceIndex: i }); }
    }
    pageStart = offset;
    pageEnd = Math.min(selected.length, offset + limit);
  } else {
    pageStart = Math.min(offset, input.length);
    pageEnd = Math.min(input.length, offset + limit);
    for (i = pageStart; i < pageEnd; i += 1) {
      instance = input[i];
      if (!object(instance) || typeof instance.instanceId !== 'string' || !object(instance.properties)) { return null; }
      selected.push({ entry: instance, sourceIndex: i });
    }
    pageStart = 0;
    pageEnd = selected.length;
  }
  for (i = pageStart; i < pageEnd; i += 1) {
    finalPage = null;
    var selectedIndex = i;
    instance = selected[selectedIndex].entry;
    properties = Object.create(null);
    flags = { truncated: false, omittedValues: 0 };
    var truncatedProperties = [];
    var omittedProperties = [];
    rendered = { properties: properties };
    if (instance.instanceId.length <= 128) { rendered.instanceId = instance.instanceId; }
    else { rendered.instanceIdOmitted = true; flags.truncated = true; }
    if (flags.truncated) { overallTruncated = true; rendered.truncated = true; }
    output.instances.push(rendered);
    for (j = 0; j < allowed.length && j < MAX_PROPERTIES; j += 1) {
      key = allowed[j];
      if (!own(instance.properties, key)) { continue; }
      var propertyFlags = { truncated: false, omittedValues: 0 };
      clean = sanitizedProperty(instance.properties[key], source.shapes[key] || [], propertyFlags);
      if (clean) { properties[key] = clean; }
      if (propertyFlags.truncated) { addUnique(truncatedProperties, key); }
      flags.omittedValues += propertyFlags.omittedValues;
      var propertyOmitted = !clean;
      if (propertyOmitted) { addUnique(omittedProperties, key); }
      syncInstanceMetadata(rendered, truncatedProperties, omittedProperties, flags);
      var pageHasMore = filtered ? selectedIndex + 1 < selected.length : offset + output.instances.length < input.length;
      var pageNextOffset = offset + output.instances.length;
      candidate = serializePage(output, offset, pageHasMore, pageNextOffset, overallTruncated || flags.truncated || propertyOmitted);
      if (!candidate) {
        if (clean) { delete properties[key]; }
        addUnique(omittedProperties, key);
        flags.omittedValues -= propertyFlags.omittedValues;
        if (propertyFlags.truncated) { truncatedProperties.splice(truncatedProperties.indexOf(key), 1); }
        syncInstanceMetadata(rendered, truncatedProperties, omittedProperties, flags);
        overallTruncated = true;
        pageHasMore = filtered ? selectedIndex + 1 < selected.length : offset + output.instances.length < input.length;
        candidate = serializePage(output, offset, pageHasMore, pageNextOffset, true);
        if (!candidate) {
          output.instances.pop();
          rendered = {
            properties: properties,
            omittedProperties: omittedProperties.slice(),
            truncated: true,
            omission: 'Some properties omitted to fit result; retry with properties filter'
          };
          if (instance.instanceId.length <= 128) { rendered.instanceId = instance.instanceId; }
          else { rendered.instanceIdOmitted = true; }
          if (output.instances.length) {
            candidate = serializePage(output, offset, true, offset + output.instances.length, true);
            finalPage = candidate;
            stoppedForBudget = true;
            break;
          }
          var retainedKeys = Object.keys(properties);
          while (!candidate) {
            output.instances.push(rendered);
            candidate = serializePage(output, offset, pageHasMore, offset + 1, true);
            if (candidate) { break; }
            output.instances.pop();
            if (!retainedKeys.length) { break; }
            key = retainedKeys.pop();
            delete properties[key];
            addUnique(omittedProperties, key);
            rendered.omittedProperties = omittedProperties.slice();
          }
          if (!candidate) { return null; }
        } else {
          candidate.instances[candidate.instances.length - 1] = rendered;
        }
      }
      finalPage = candidate;
      if (propertyOmitted || propertyFlags.truncated || !clean) { overallTruncated = true; }
    }
    if (stoppedForBudget) { break; }
    syncInstanceMetadata(rendered, truncatedProperties, omittedProperties, flags);
    if (!finalPage) {
      var hasMore = filtered ? selectedIndex + 1 < selected.length : offset + output.instances.length < input.length;
      finalPage = serializePage(output, offset, hasMore, offset + output.instances.length, overallTruncated);
    }
  }
  if (stoppedForBudget) { overallTruncated = true; }
  if (!finalPage) {
    var emptyHasMore = filtered ? offset < selected.length : offset < input.length;
    finalPage = serializePage(output, offset, emptyHasMore, offset, overallTruncated);
  }
  if (overallTruncated && finalPage) { finalPage.truncated = true; }
  var json = JSON.stringify(finalPage);
  return json.length <= MAX_RESULT_CHARS ? json : null;
}

function syncInstanceMetadata(instance, truncatedProperties, omittedProperties, flags) {
  if (truncatedProperties.length) { instance.truncatedProperties = truncatedProperties.slice(); }
  else { delete instance.truncatedProperties; }
  if (omittedProperties.length) { instance.omittedProperties = omittedProperties.slice(); }
  else { delete instance.omittedProperties; }
  if (flags.omittedValues) { instance.omittedSeriesValues = flags.omittedValues; }
  else { delete instance.omittedSeriesValues; }
  if (flags.truncated || truncatedProperties.length || omittedProperties.length) { instance.truncated = true; }
  else { delete instance.truncated; }
}

function serializePage(output, offset, hasMore, nextOffset, truncated) {
  var candidate = {};
  var key;
  for (key in output) { if (own(output, key)) { candidate[key] = output[key]; } }
  candidate.offset = offset;
  candidate.hasMore = hasMore;
  delete candidate.nextOffset;
  if (hasMore && nextOffset !== undefined) { candidate.nextOffset = nextOffset; }
  candidate.truncated = truncated === true;
  var text;
  try { text = JSON.stringify(candidate); } catch (e) { return null; }
  return text.length <= MAX_RESULT_CHARS ? candidate : null;
}

function callSource(source, args, requestId, callback) {
  var key = String(requestId);
  var done = false;
  var subscription = null;
  var timer = null;
  var cancelEntry = { cancel: cancel };
  var abortHandle = { abort: cancel };
  var tracked = false;
  args = args || {};
  if (!watch.isCurrentRequest(requestId)) { return; }
  if (!object(args) || (args.offset !== undefined && (!integer(args.offset) || args.offset < 0)) ||
      (args.limit !== undefined && (!integer(args.limit) || args.limit < 1 || args.limit > 16)) ||
      (args.instanceId !== undefined && typeof args.instanceId !== 'string') ||
      (args.properties !== undefined && (!Array.isArray(args.properties) || args.properties.length > MAX_PROPERTIES || args.properties.some(function(name) { return source.properties.indexOf(name) === -1; })))) {
    callback('Invalid Pebble plugin source arguments', null);
    return;
  }
  function cleanup() {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    if (subscription && typeof subscription.unsubscribe === 'function') { try { subscription.unsubscribe(); } catch (e) {} }
    if (tracked) {
      tracked = false;
      try { watch.untrackXhr(requestId, abortHandle); } catch (e2) {}
    }
    if (s_live[key] === cancelEntry) { delete s_live[key]; }
  }
  function finish(error, result) {
    if (done) { return; }
    done = true;
    cleanup();
    if (watch.isCurrentRequest(requestId)) { callback(error, result); }
  }
  function cancel() { if (done) { return; } done = true; cleanup(); }
  s_live[key] = cancelEntry;
  if (typeof watch.trackXhr === 'function') {
    tracked = true;
    if (!watch.trackXhr(requestId, abortHandle)) {
      tracked = false;
      cancel();
      return;
    }
  }
  timer = setTimeout(function() { finish('Pebble plugin source timed out', null); }, TIMEOUT_MS);
  try {
    if (typeof Pebble === 'undefined' || !Pebble || typeof Pebble.subscribeToSource !== 'function') { finish('Pebble plugin source API unsupported', null); return; }
    subscription = Pebble.subscribeToSource({
      plugin: source.plugin, category: source.category, item: source.item,
      properties: source.properties.filter(function(name) { return name !== 'iconPixelSize' && (!args.properties || args.properties.indexOf(name) !== -1); }),
      onData: function(envelope) {
        var json;
        if (done) { return; }
        if (!watch.isCurrentRequest(requestId)) { cancel(); return; }
        try {
          if (!object(envelope) || typeof envelope.pluginUuid !== 'string' || envelope.pluginUuid.toLowerCase() !== source.plugin.toLowerCase()) {
            finish('Pebble plugin returned data from unexpected plugin', null);
            return;
          }
          if (!Array.isArray(envelope.instances)) { finish('Malformed Pebble plugin source response', null); return; }
          json = formatEnvelope(source, envelope, args);
          if (json === null) { finish('Malformed Pebble plugin source response', null); return; }
          finish(null, json);
        } catch (e) { finish('Malformed Pebble plugin source response', null); }
      },
      onError: function(error) {
        if (done) { return; }
        if (!watch.isCurrentRequest(requestId)) { cancel(); return; }
        var code = error && error.code;
        var message = error && (error.message || error.error) || (typeof error === 'string' ? error : 'Source request failed');
        if (code === 'PERMISSION_DENIED' || /permission|authori[sz]|approval/i.test(message)) { message = 'Plugin source permission denied. Approve access in Pebble app, then retry.'; }
        finish('Pebble plugin source error: ' + bounded(message, 240), null);
      }
    });
    if (done && subscription && typeof subscription.unsubscribe === 'function') { try { subscription.unsubscribe(); } catch (e2) {} }
  } catch (e3) { finish('Pebble plugin source request failed', null); }
}

function cancelRequest(requestId) {
  var key = String(requestId);
  if (s_live[key]) { s_live[key].cancel(); }
}

module.exports = { getCatalogue: getCatalogue, getTools: getTools, cancelRequest: cancelRequest };
