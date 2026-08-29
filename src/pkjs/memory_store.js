var STORE_KEY = 'llm_thing_memories_v1';
var MAX_MEMORIES = 128;
var MAX_MEMORY_LENGTH = 500;
var MAX_ID_LENGTH = 64;
var MAX_SEARCH_RESULTS = 32;

function clone(value) {
  try { return JSON.parse(JSON.stringify(value)); } catch (e) { return null; }
}

function validText(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= MAX_MEMORY_LENGTH;
}

function validId(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= MAX_ID_LENGTH;
}

function validTime(value) {
  return typeof value === 'number' && isFinite(value) && value > 0;
}

function normalize(raw, requireTimes) {
  if (!raw || typeof raw !== 'object' || !validId(raw.id) || !validText(raw.text)) { return null; }
  if (requireTimes && (!validTime(raw.createdAt) || !validTime(raw.updatedAt))) { return null; }
  return {
    id: raw.id.trim(),
    text: raw.text.trim(),
    createdAt: validTime(raw.createdAt) ? raw.createdAt : Date.now(),
    updatedAt: validTime(raw.updatedAt) ? raw.updatedAt : Date.now()
  };
}

function sort(records) {
  records.sort(function(a, b) {
    if (b.updatedAt !== a.updatedAt) { return b.updatedAt - a.updatedAt; }
    if (b.createdAt !== a.createdAt) { return b.createdAt - a.createdAt; }
    return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
  });
}

function load() {
  var parsed;
  var list;
  var normalized = [];
  var result = [];
  var seen = {};
  var i;
  var record;
  try {
    parsed = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
  } catch (e) { return result; }
  if (!parsed || parsed.version !== 1 || Object.prototype.toString.call(parsed.memories) !== '[object Array]') { return result; }
  list = parsed.memories;
  for (i = 0; i < list.length; i += 1) {
    record = normalize(list[i], true);
    if (record) { normalized.push(record); }
  }
  sort(normalized);
  for (i = 0; i < normalized.length && result.length < MAX_MEMORIES; i += 1) {
    if (!seen[normalized[i].id]) {
      seen[normalized[i].id] = true;
      result.push(normalized[i]);
    }
  }
  return result;
}

function write(records) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ version: 1, memories: records }));
    return true;
  } catch (e) { return false; }
}

function find(records, id) {
  var target = typeof id === 'string' ? id.trim() : '';
  var i;
  for (i = 0; i < records.length; i += 1) { if (records[i].id === target) { return i; } }
  return -1;
}

function newId(records) {
  var base = String(Date.now()) + '-' + String(Math.floor(Math.random() * 1000000000));
  var id = base;
  var suffix = 2;
  while (find(records, id) !== -1) {
    id = base + '-' + String(suffix);
    suffix += 1;
  }
  return id.substring(0, MAX_ID_LENGTH);
}

function addMemory(text) {
  var records;
  var now;
  var record;
  if (!validText(text)) { return null; }
  records = load();
  now = Date.now();
  record = { id: newId(records), text: text.trim(), createdAt: now, updatedAt: now };
  records.push(record);
  sort(records);
  if (!write(records.slice(0, MAX_MEMORIES))) { return null; }
  return clone(record);
}

function updateMemory(id, text) {
  var records = load();
  var index = find(records, id);
  if (index < 0 || !validText(text)) { return null; }
  records[index].text = text.trim();
  records[index].updatedAt = Date.now();
  sort(records);
  if (!write(records)) { return null; }
  return clone(records[find(records, id)]);
}

function deleteMemory(id) {
  var records = load();
  var index = find(records, id);
  if (index < 0) { return false; }
  records.splice(index, 1);
  return write(records);
}

function getMemory(id) {
  var records = load();
  var index = find(records, id);
  return index < 0 ? null : clone(records[index]);
}

function listMemories(limit) {
  var records = load();
  var count = typeof limit === 'number' && isFinite(limit) ? Math.floor(limit) : MAX_MEMORIES;
  var result = [];
  var i;
  if (count < 0) { count = 0; }
  count = Math.min(count, MAX_MEMORIES);
  for (i = 0; i < count && i < records.length; i += 1) { result.push(clone(records[i])); }
  return result;
}

function searchMemories(query, limit) {
  var records = load();
  var needle = typeof query === 'string' ? query.trim().toLowerCase() : '';
  var count = typeof limit === 'number' && isFinite(limit) ? Math.floor(limit) : MAX_SEARCH_RESULTS;
  var result = [];
  var i;
  if (count < 0) { count = 0; }
  count = Math.min(count, MAX_SEARCH_RESULTS);
  for (i = 0; i < records.length && result.length < count; i += 1) {
    if (!needle || records[i].text.toLowerCase().indexOf(needle) !== -1) { result.push(clone(records[i])); }
  }
  return result;
}

function replaceMemories(records) {
  var normalized = [];
  var seen = {};
  var i;
  var record;
  if (Object.prototype.toString.call(records) !== '[object Array]') { return false; }
  for (i = 0; i < records.length; i += 1) {
    record = normalize(records[i], true);
    if (!record || seen[record.id]) { return false; }
    seen[record.id] = true;
    normalized.push(record);
  }
  sort(normalized);
  return write(normalized.slice(0, MAX_MEMORIES));
}

module.exports = {
  STORE_KEY: STORE_KEY,
  MAX_MEMORIES: MAX_MEMORIES,
  MAX_MEMORY_LENGTH: MAX_MEMORY_LENGTH,
  MAX_ID_LENGTH: MAX_ID_LENGTH,
  MAX_SEARCH_RESULTS: MAX_SEARCH_RESULTS,
  addMemory: addMemory,
  updateMemory: updateMemory,
  deleteMemory: deleteMemory,
  getMemory: getMemory,
  listMemories: listMemories,
  searchMemories: searchMemories,
  replaceMemories: replaceMemories
};
