var common = require('./settings');

var STORE_KEY = 'llm_thing_timeline_pins_v1';
var MAX_TIMELINE_PINS = 64;

function nowMs() {
  return (new Date()).getTime();
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (e) {
    return null;
  }
}

function isValidId(value) {
  var text = common.trim(value);
  return text && text.length <= 64;
}

function normalizeRecord(raw) {
  var args;
  var id;
  var time;
  var pin;
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  id = common.trim(raw.id);
  if (!isValidId(id)) {
    return null;
  }
  if (raw.kind !== 'pin' && raw.kind !== 'reminder') {
    return null;
  }
  pin = cloneJson(raw.pin);
  if (!pin || typeof pin !== 'object') {
    return null;
  }
  if (common.trim(pin.id) !== id) {
    return null;
  }
  if (!common.trim(pin.time)) {
    return null;
  }
  if (!pin.layout || typeof pin.layout !== 'object' || !common.trim(pin.layout.title)) {
    return null;
  }
  args = cloneJson(raw.args);
  if (!args || typeof args !== 'object') {
    return null;
  }
  time = parseInt(raw.createdAt, 10);
  if (isNaN(time) || time <= 0) {
    return null;
  }
  time = parseInt(raw.updatedAt, 10);
  if (isNaN(time) || time <= 0) {
    return null;
  }
  pin.id = id;
  args.id = id;
  return {
    id: id,
    kind: raw.kind,
    pin: pin,
    args: args,
    createdAt: parseInt(raw.createdAt, 10),
    updatedAt: parseInt(raw.updatedAt, 10)
  };
}

function sortNewestFirst(records) {
  records.sort(function(a, b) {
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
}

function loadStore() {
  var raw;
  var parsed;
  var store = { version: 1, pins: [] };
  var list;
  var i;
  var rec;

  try {
    raw = localStorage.getItem(STORE_KEY) || '';
    parsed = raw ? JSON.parse(raw) : null;
  } catch (e) {
    common.logDebug('timeline store parse failed');
    return store;
  }

  if (!parsed) {
    return store;
  }
  if (parsed.pins && Object.prototype.toString.call(parsed.pins) === '[object Array]') {
    list = parsed.pins;
  } else if (Object.prototype.toString.call(parsed) === '[object Array]') {
    list = parsed;
  } else {
    list = [];
  }

  for (i = 0; i < list.length; i += 1) {
    rec = normalizeRecord(list[i]);
    if (rec) {
      store.pins.push(rec);
    }
  }

  sortNewestFirst(store.pins);
  while (store.pins.length > MAX_TIMELINE_PINS) {
    store.pins.pop();
  }

  return store;
}

function saveStore(store) {
  sortNewestFirst(store.pins);
  while (store.pins.length > MAX_TIMELINE_PINS) {
    store.pins.pop();
  }

  while (store.pins.length >= 0) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        version: 1,
        pins: store.pins
      }));
      return true;
    } catch (e) {
      if (!store.pins.length) {
        common.logDebug('timeline store write failed empty');
        return false;
      }
      store.pins.pop();
    }
  }

  return false;
}

function findIndex(store, id) {
  var target = common.trim(id);
  var i;
  for (i = 0; i < store.pins.length; i += 1) {
    if (store.pins[i].id === target) {
      return i;
    }
  }
  return -1;
}

function saveTimelinePin(id, kind, pin, args) {
  var store;
  var index;
  var time = nowMs();
  var pinClone;
  var argsClone;
  var rec;

  id = common.trim(id);
  if (!isValidId(id)) {
    return false;
  }
  if (kind !== 'pin' && kind !== 'reminder') {
    return false;
  }
  pinClone = cloneJson(pin);
  argsClone = cloneJson(args);
  if (!pinClone || !argsClone) {
    return false;
  }
  if (common.trim(pinClone.id) !== common.trim(id)) {
    pinClone.id = id;
  }
  if (common.trim(argsClone.id) !== common.trim(id)) {
    argsClone.id = id;
  }

  try {
    store = loadStore();
  } catch (e) {
    store = { version: 1, pins: [] };
  }

  index = findIndex(store, id);
  if (index === -1) {
    rec = {
      id: id,
      kind: kind,
      pin: pinClone,
      args: argsClone,
      createdAt: time,
      updatedAt: time
    };
    store.pins.push(rec);
  } else {
    rec = store.pins[index];
    rec.kind = kind;
    rec.pin = pinClone;
    rec.args = argsClone;
    rec.updatedAt = time;
    if (!rec.createdAt) {
      rec.createdAt = time;
    }
  }

  try {
    return saveStore(store);
  } catch (e) {
    common.logDebug('timeline store save failed');
    return false;
  }
}

function getTimelinePin(id) {
  var store;
  var index;
  var rec;
  try {
    store = loadStore();
  } catch (e) {
    return null;
  }
  index = findIndex(store, id);
  if (index === -1) {
    return null;
  }
  rec = store.pins[index];
  return {
    id: rec.id,
    kind: rec.kind,
    pin: cloneJson(rec.pin),
    args: cloneJson(rec.args),
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt
  };
}

function listTimelinePins() {
  var store;
  var result = [];
  var i;
  var rec;
  try {
    store = loadStore();
  } catch (e) {
    return result;
  }
  for (i = 0; i < store.pins.length; i += 1) {
    rec = store.pins[i];
    result.push({
      id: rec.id,
      kind: rec.kind,
      title: rec.pin && rec.pin.layout ? String(rec.pin.layout.title || '') : '',
      time: rec.pin ? String(rec.pin.time || '') : '',
      createdAt: rec.createdAt,
      updatedAt: rec.updatedAt
    });
  }
  return result;
}

function removeTimelinePin(id) {
  var store;
  var index;
  try {
    store = loadStore();
  } catch (e) {
    return false;
  }
  index = findIndex(store, id);
  if (index === -1) {
    return false;
  }
  store.pins.splice(index, 1);
  try {
    return saveStore(store);
  } catch (e) {
    return false;
  }
}

module.exports = {
  MAX_TIMELINE_PINS: MAX_TIMELINE_PINS,
  STORE_KEY: STORE_KEY,
  saveTimelinePin: saveTimelinePin,
  getTimelinePin: getTimelinePin,
  listTimelinePins: listTimelinePins,
  removeTimelinePin: removeTimelinePin
};
