var MAX_RESULT_CHARS = 6000;
var CURSOR_TTL_MS = 30 * 60 * 1000;
var CURSOR_PREFIX = 'pg1_';
var BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
var CURSOR_SECRET = String(Date.now()) + ':' + String(Math.random()) + ':' + String(Math.random());

function padHex(value) {
  var text = (value >>> 0).toString(16);
  while (text.length < 8) { text = '0' + text; }
  return text;
}

function addHashCode(state, code) {
  state.first ^= code;
  state.first += (state.first << 1) + (state.first << 4) + (state.first << 7) + (state.first << 8) + (state.first << 24);
  state.second = ((state.second << 5) - state.second + code) >>> 0;
}

function addHashPart(state, value) {
  var text = String(value);
  var lengthText = String(text.length) + ':';
  var j;
  for (j = 0; j < lengthText.length; j += 1) { addHashCode(state, lengthText.charCodeAt(j)); }
  for (j = 0; j < text.length; j += 1) { addHashCode(state, text.charCodeAt(j)); }
  addHashCode(state, 31);
}

function finishHash(state) {
  return padHex(state.first) + padHex(state.second);
}

function hashParts(parts) {
  var state = { first: 2166136261, second: 5381 };
  var i;
  for (i = 0; i < parts.length; i += 1) { addHashPart(state, parts[i]); }
  return finishHash(state);
}

function hashItems(items) {
  var state = { first: 2166136261, second: 5381 };
  var serialized;
  var i;
  for (i = 0; i < items.length; i += 1) {
    serialized = JSON.stringify(items[i]);
    if (typeof serialized !== 'string') { throw new Error('Unable to serialize dataset item'); }
    addHashPart(state, serialized);
  }
  return finishHash(state);
}

function hashText(text) {
  return hashParts([text]);
}

function cursorSignature(state) {
  return hashParts([CURSOR_SECRET, JSON.stringify({
    v: state.v,
    s: state.s,
    q: state.q,
    d: state.d,
    o: state.o,
    t: state.t
  })]);
}

function encodeCursor(state) {
  var text;
  var encoded = '';
  var first;
  var second;
  var third;
  var i;
  state.sig = cursorSignature(state);
  text = JSON.stringify(state);
  for (i = 0; i < text.length; i += 3) {
    first = text.charCodeAt(i);
    second = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
    third = i + 2 < text.length ? text.charCodeAt(i + 2) : 0;
    encoded += BASE64_CHARS.charAt(first >> 2);
    encoded += BASE64_CHARS.charAt(((first & 3) << 4) | (second >> 4));
    encoded += i + 1 < text.length ? BASE64_CHARS.charAt(((second & 15) << 2) | (third >> 6)) : '=';
    encoded += i + 2 < text.length ? BASE64_CHARS.charAt(third & 63) : '=';
  }
  return CURSOR_PREFIX + encoded.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function decodeCursor(cursor) {
  var text = '';
  var encoded;
  var a;
  var b;
  var c;
  var d;
  var cValue;
  var dValue;
  var i;
  if (typeof cursor !== 'string' || cursor.length > 512 || cursor.indexOf(CURSOR_PREFIX) !== 0) {
    return null;
  }
  encoded = cursor.substring(CURSOR_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
  if (!encoded || encoded.length % 4 === 1 || !/^[A-Za-z0-9+/]+$/.test(encoded)) { return null; }
  while (encoded.length % 4) { encoded += '='; }
  for (i = 0; i < encoded.length; i += 4) {
    a = BASE64_CHARS.indexOf(encoded.charAt(i));
    b = BASE64_CHARS.indexOf(encoded.charAt(i + 1));
    c = encoded.charAt(i + 2);
    d = encoded.charAt(i + 3);
    cValue = c === '=' ? 0 : BASE64_CHARS.indexOf(c);
    dValue = d === '=' ? 0 : BASE64_CHARS.indexOf(d);
    if (a < 0 || b < 0 || cValue < 0 || dValue < 0) { return null; }
    text += String.fromCharCode((a << 2) | (b >> 4));
    if (c !== '=') { text += String.fromCharCode(((b & 15) << 4) | (cValue >> 2)); }
    if (d !== '=') { text += String.fromCharCode(((cValue & 3) << 6) | dValue); }
  }
  try { return JSON.parse(text); } catch (e) { return null; }
}

function envelope(items, hasMore, nextCursor) {
  return { items: items, hasMore: hasMore, nextCursor: nextCursor };
}

function errorResult(message) {
  return { error: message };
}

function paginate(items, options) {
  var scope = options.scope;
  var queryHash = hashText(String(options.query || ''));
  var datasetHash;
  var cursorState = null;
  var offset = 0;
  var limit = options.limit;
  var pageItems = [];
  var candidate;
  var nextOffset;
  var nextCursor;
  var hasMore;
  var i;
  var serialized;

  if (Object.prototype.toString.call(items) !== '[object Array]') { items = []; }
  if (limit === undefined || limit === null) { limit = options.defaultLimit; }
  if (typeof limit !== 'number' || !isFinite(limit) || Math.floor(limit) !== limit ||
      limit < 1 || limit > options.maxLimit) {
    return errorResult('Page limit must be an integer from 1 to ' + options.maxLimit);
  }

  if (typeof options.datasetHash === 'string' && options.datasetHash) {
    datasetHash = options.datasetHash;
  } else {
    try { datasetHash = hashItems(items); } catch (e) {
      return errorResult('Unable to create stable pagination snapshot');
    }
  }

  if (options.cursor !== undefined && options.cursor !== null) {
    cursorState = decodeCursor(options.cursor);
    if (!cursorState || cursorState.v !== 1 || cursorState.s !== scope ||
        typeof cursorState.q !== 'string' || typeof cursorState.d !== 'string' ||
        typeof cursorState.o !== 'number' || Math.floor(cursorState.o) !== cursorState.o ||
        typeof cursorState.t !== 'number' || !isFinite(cursorState.t) ||
        typeof cursorState.sig !== 'string' || cursorState.sig !== cursorSignature(cursorState)) {
      return errorResult('Invalid pagination cursor. Restart from the first page.');
    }
    if (Date.now() - cursorState.t > CURSOR_TTL_MS || cursorState.t > Date.now() + 60000) {
      return errorResult('Pagination cursor expired. Restart from the first page.');
    }
    if (cursorState.q !== queryHash) {
      return errorResult('Pagination cursor does not match this query. Restart from the first page.');
    }
    if (cursorState.d !== datasetHash) {
      return errorResult('Pagination data changed. Restart from the first page.');
    }
    if (cursorState.o < 1 || cursorState.o >= items.length) {
      return errorResult('Pagination cursor position is invalid. Restart from the first page.');
    }
    offset = cursorState.o;
  }

  for (i = offset; i < items.length && pageItems.length < limit; i += 1) {
    nextOffset = i + 1;
    hasMore = nextOffset < items.length;
    nextCursor = hasMore ? encodeCursor({
      v: 1,
      s: scope,
      q: queryHash,
      d: datasetHash,
      o: nextOffset,
      t: Date.now()
    }) : null;
    candidate = envelope(pageItems.concat([items[i]]), hasMore, nextCursor);
    try { serialized = JSON.stringify(candidate); } catch (e2) { serialized = ''; }
    if (!serialized || serialized.length > MAX_RESULT_CHARS) {
      if (!pageItems.length) {
        return errorResult('A record exceeds the safe page size. Restart with a smaller limit.');
      }
      break;
    }
    pageItems.push(items[i]);
  }

  nextOffset = offset + pageItems.length;
  hasMore = nextOffset < items.length;
  nextCursor = hasMore ? encodeCursor({
    v: 1,
    s: scope,
    q: queryHash,
    d: datasetHash,
    o: nextOffset,
    t: Date.now()
  }) : null;
  candidate = envelope(pageItems, hasMore, nextCursor);
  try { serialized = JSON.stringify(candidate); } catch (e3) { serialized = ''; }
  if (!serialized || serialized.length > MAX_RESULT_CHARS) {
    return errorResult('Unable to fit page within safe result size. Restart with a smaller limit.');
  }
  return { value: candidate };
}

module.exports = {
  MAX_RESULT_CHARS: MAX_RESULT_CHARS,
  hashParts: hashParts,
  paginate: paginate
};
