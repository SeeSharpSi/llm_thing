var DEFAULT_OFFSET = 0;
var DEFAULT_LIMIT = 3000;
var MAX_OFFSET = 500000;
var MAX_LIMIT = 6000;
var MAX_SOURCE_CHARS = 120000;
var REQUEST_TIMEOUT_MS = 30000;
var TRUNCATION = '... [truncated]';

function trim(value) {
  return String(value || '').replace(/^\s+|\s+$/g, '');
}

function decodeEntities(value) {
  var entities = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, function(match, name) {
    var lower = name.toLowerCase();
    var number;
    if (lower.charAt(0) === '#') {
      number = lower.charAt(1) === 'x' ? parseInt(lower.substring(2), 16) : parseInt(lower.substring(1), 10);
      if (isNaN(number) || number < 0 || number > 0x10FFFF || number >= 0xD800 && number <= 0xDFFF) {
        return match;
      }
      if (number > 0xFFFF) {
        number -= 0x10000;
        return String.fromCharCode(0xD800 + Math.floor(number / 0x400), 0xDC00 + number % 0x400);
      }
      return String.fromCharCode(number);
    }
    return entities[lower] === undefined ? match : entities[lower];
  });
}

function normalizeText(value) {
  return decodeEntities(String(value || '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' '));
}

function htmlToMarkdown(source) {
  var text = String(source || '').substring(0, MAX_SOURCE_CHARS);
  var title = '';
  var links = [];
  var match;

  text = text.replace(/<!--[\s\S]*?-->/g, '');
  text = text.replace(/<title\b[^>]*>([\s\S]*?)<\/title>/i, function(all, value) {
    title = normalizeText(value).replace(/\s+/g, ' ');
    return '';
  });
  text = text.replace(/<\s*(script|style|noscript|template|head)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  text = text.replace(/<a\b[^>]*href\s*=\s*(?:["']([^"']+)["']|([^\s>]+))[^>]*>([\s\S]*?)<\s*\/\s*a\s*>/gi, function(all, quotedHref, bareHref, value) {
    var href = quotedHref || bareHref;
    href = decodeEntities(trim(href));
    if (!/^https?:\/\//i.test(href)) {
      return normalizeText(value);
    }
    links.push({ href: href, text: normalizeText(value.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ') });
    return '\u0000' + (links.length - 1) + '\u0000';
  });
  text = text.replace(/<\s*(h[1-6])\b[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, function(all, tag, value) {
    return '\n\n' + new Array(parseInt(tag.substring(1), 10) + 1).join('#') + ' ' + normalizeText(value) + '\n\n';
  });
  text = text.replace(/<\s*(p|div|section|article|header|footer)\b[^>]*>/gi, '\n\n').replace(/<\s*\/\s*(p|div|section|article|header|footer)\s*>/gi, '\n\n');
  text = text.replace(/<\s*br\s*\/?>/gi, '\n');
  text = text.replace(/<\s*(strong|b)\b[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, '**$2**');
  text = text.replace(/<\s*(em|i)\b[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, '*$2*');
  text = text.replace(/<\s*blockquote\b[^>]*>([\s\S]*?)<\s*\/\s*blockquote\s*>/gi, function(all, value) {
    return '\n\n> ' + normalizeText(value).replace(/\n+/g, '\n> ') + '\n\n';
  });
  text = text.replace(/<\s*pre\b[^>]*>([\s\S]*?)<\s*\/\s*pre\s*>/gi, function(all, value) {
    return '\n\n```\n' + value.replace(/<[^>]+>/g, '') + '\n```\n\n';
  });
  text = text.replace(/<\s*(ul|ol)\b[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, function(all, kind, value) {
    var item = 0;
    return '\n\n' + value.replace(/<\s*li\b[^>]*>([\s\S]*?)<\s*\/\s*li\s*>/gi, function(itemAll, itemValue) {
      item += 1;
      return '\n' + (kind.toLowerCase() === 'ol' ? item + '.' : '-') + ' ' + normalizeText(itemValue) + '\n';
    }) + '\n\n';
  });
  text = text.replace(/<\s*img\b[^>]*>/gi, '');
  text = text.replace(/<[^>]+>/g, '');
  text = normalizeText(text).replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n');
  if (title && text.indexOf(title) !== 0) {
    text = '# ' + title + (text ? '\n\n' + text : '');
  }
  text = text.replace(/\u0000(\d+)\u0000/g, function(all, index) {
    var link = links[parseInt(index, 10)];
    return '[' + link.text + '](' + link.href + ')';
  });
  return trim(text).replace(/\n{3,}/g, '\n\n');
}

function boundedNumber(value, min, max, fallback) {
  return typeof value === 'number' && isFinite(value) && Math.floor(value) === value ? Math.max(min, Math.min(max, value)) : fallback;
}

function isPrivateIpv4(host) {
  var parts;
  var i;
  var value;

  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    return false;
  }
  parts = host.split('.');
  for (i = 0; i < parts.length; i += 1) {
    value = parseInt(parts[i], 10);
    if (value > 255) {
      return true;
    }
  }
  value = parseInt(parts[0], 10);
  return value === 0 || value === 10 || value === 127 || value >= 224 ||
    value === 169 && parseInt(parts[1], 10) === 254 ||
    value === 172 && parseInt(parts[1], 10) >= 16 && parseInt(parts[1], 10) <= 31 ||
    value === 192 && parseInt(parts[1], 10) === 168 ||
    value === 100 && parseInt(parts[1], 10) >= 64 && parseInt(parts[1], 10) <= 127;
}

function isSafeUrl(url) {
  var match = /^(https?):\/\/([^\/?#\s]+)(?:[\/?#]|$)/i.exec(url);
  var hostPort;
  var host;
  var port;

  if (!match || !match[2] || match[2].indexOf('@') !== -1) {
    return false;
  }
  hostPort = match[2];
  if (hostPort.charAt(0) === '[') {
    return false;
  }
  host = hostPort;
  if (hostPort.indexOf(':') !== -1) {
    if (!/^([^:]+):(\d+)$/.test(hostPort)) {
      return false;
    }
    host = hostPort.substring(0, hostPort.lastIndexOf(':'));
    port = parseInt(hostPort.substring(hostPort.lastIndexOf(':') + 1), 10);
    if (port < 1 || port > 65535) {
      return false;
    }
  }
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host) || host.indexOf('..') !== -1) {
    return false;
  }
  host = host.toLowerCase();
  if (host === 'localhost' || /\.localhost$|\.local$/.test(host) || host === 'metadata.google.internal') {
    return false;
  }
  return !isPrivateIpv4(host);
}

function safeSlice(text, offset, limit) {
  var start = offset;
  var end = Math.min(text.length, offset + limit);

  if (start < text.length && text.charAt(start) >= '\udc00' && text.charAt(start) <= '\udfff') {
    start += 1;
  }
  if (end > start && end < text.length && text.charAt(end - 1) >= '\ud800' && text.charAt(end - 1) <= '\udbff') {
    end -= 1;
  }
  return text.substring(start, end);
}

function sliceResult(text, offset, limit, sourceMayContinue) {
  var truncated = offset < text.length && offset + limit < text.length || sourceMayContinue;
  var value;

  if (!truncated || limit <= TRUNCATION.length) {
    return safeSlice(text, offset, limit);
  }
  value = safeSlice(text, offset, limit - TRUNCATION.length);
  if (value && value.length + TRUNCATION.length <= limit) {
    value += TRUNCATION;
  }
  return value;
}

function fetchUrl(args, requestId, watch, callback) {
  var url = trim(args && args.url);
  var offset = boundedNumber(args && args.offset, 0, MAX_OFFSET, DEFAULT_OFFSET);
  var limit = boundedNumber(args && args.limit, 1, MAX_LIMIT, DEFAULT_LIMIT);
  var request;

  if (!isSafeUrl(url)) {
    callback('URL must be a valid HTTP(S) URL');
    return;
  }
  request = new XMLHttpRequest();
  try {
    request.open('GET', url, true);
    request.setRequestHeader('Accept', 'text/html, text/plain;q=0.9, */*;q=0.1');
    request.timeout = REQUEST_TIMEOUT_MS;
  } catch (e) {
    callback('Unable to open web fetch URL');
    return;
  }
  if (!watch.trackXhr(requestId, request)) {
    return;
  }
  request.onload = function() {
    var source;
    watch.untrackXhr(requestId, request);
    if (!watch.isCurrentRequest(requestId)) { return; }
    if (request.status < 200 || request.status >= 300) {
      callback('Web fetch HTTP ' + request.status);
      return;
    }
    source = String(request.responseText || '');
    callback(null, sliceResult(htmlToMarkdown(source), offset, limit, source.length > MAX_SOURCE_CHARS));
  };
  request.onerror = function() {
    watch.untrackXhr(requestId, request);
    if (watch.isCurrentRequest(requestId)) { callback('Web fetch network error'); }
  };
  request.ontimeout = function() {
    watch.untrackXhr(requestId, request);
    if (watch.isCurrentRequest(requestId)) { callback('Web fetch request timed out'); }
  };
  request.onabort = function() { watch.untrackXhr(requestId, request); };
  try {
    request.send(null);
  } catch (e) {
    watch.untrackXhr(requestId, request);
    if (watch.isCurrentRequest(requestId)) {
      callback('Unable to send web fetch request');
    }
  }
}

module.exports = {
  fetch: fetchUrl,
  htmlToMarkdown: htmlToMarkdown,
  DEFAULT_LIMIT: DEFAULT_LIMIT,
  MAX_LIMIT: MAX_LIMIT,
  MAX_OFFSET: MAX_OFFSET
};
