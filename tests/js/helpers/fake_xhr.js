'use strict';

function FakeXMLHttpRequest() {
  this.method = '';
  this.url = '';
  this.async = true;
  this.headers = {};
  this.timeout = 0;
  this.status = 0;
  this.responseText = '';
  this.responseHeaders = {};
  this.body = null;
  this.aborted = false;
  FakeXMLHttpRequest.instances.push(this);
}

FakeXMLHttpRequest.instances = [];

FakeXMLHttpRequest.reset = function() {
  FakeXMLHttpRequest.instances = [];
};

FakeXMLHttpRequest.last = function() {
  return FakeXMLHttpRequest.instances[FakeXMLHttpRequest.instances.length - 1];
};

FakeXMLHttpRequest.prototype.open = function(method, url, async) {
  this.method = method;
  this.url = url;
  this.async = async;
};

FakeXMLHttpRequest.prototype.setRequestHeader = function(name, value) {
  this.headers[name] = value;
};

FakeXMLHttpRequest.prototype.getResponseHeader = function(name) {
  var lower = String(name).toLowerCase();
  var key;
  for (key in this.responseHeaders) {
    if (Object.prototype.hasOwnProperty.call(this.responseHeaders, key) && key.toLowerCase() === lower) {
      return this.responseHeaders[key];
    }
  }
  return null;
};

FakeXMLHttpRequest.prototype.send = function(body) {
  this.body = body;
};

FakeXMLHttpRequest.prototype.abort = function() {
  this.aborted = true;
  if (this.onabort) {
    this.onabort();
  }
};

FakeXMLHttpRequest.prototype.respond = function(status, body, headers) {
  this.status = status;
  this.responseText = typeof body === 'string' ? body : JSON.stringify(body || {});
  this.responseHeaders = headers || {};
  if (this.onload) {
    this.onload();
  }
};

FakeXMLHttpRequest.prototype.networkError = function() {
  if (this.onerror) {
    this.onerror();
  }
};

FakeXMLHttpRequest.prototype.timeOut = function() {
  if (this.ontimeout) {
    this.ontimeout();
  }
};

module.exports = FakeXMLHttpRequest;
