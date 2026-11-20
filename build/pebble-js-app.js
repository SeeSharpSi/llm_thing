/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId])
/******/ 			return installedModules[moduleId].exports;
/******/
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			exports: {},
/******/ 			id: moduleId,
/******/ 			loaded: false
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(0);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module, exports, __webpack_require__) {

	__webpack_require__(1);
	module.exports = __webpack_require__(2);


/***/ }),
/* 1 */
/***/ (function(module, exports) {

	/**
	 * Copyright 2024 Google LLC
	 *
	 * Licensed under the Apache License, Version 2.0 (the "License");
	 * you may not use this file except in compliance with the License.
	 * You may obtain a copy of the License at
	 *
	 *     http://www.apache.org/licenses/LICENSE-2.0
	 *
	 * Unless required by applicable law or agreed to in writing, software
	 * distributed under the License is distributed on an "AS IS" BASIS,
	 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
	 * See the License for the specific language governing permissions and
	 * limitations under the License.
	 */
	
	(function(p) {
	  if (!p === undefined) {
	    console.error('Pebble object not found!?');
	    return;
	  }
	
	  // Aliases:
	  p.on = p.addEventListener;
	  p.off = p.removeEventListener;
	
	  // For Android (WebView-based) pkjs, print stacktrace for uncaught errors:
	  if (typeof window !== 'undefined' && window.addEventListener) {
	    window.addEventListener('error', function(event) {
	      if (event.error && event.error.stack) {
	        console.error('' + event.error + '\n' + event.error.stack);
	      }
	    });
	  }
	
	})(Pebble);


/***/ }),
/* 2 */
/***/ (function(module, exports, __webpack_require__) {

	var Clay = __webpack_require__(3);
	var clayConfig = __webpack_require__(6);
	var builtinToolsComponent = __webpack_require__(7);
	var settingsIoComponent = __webpack_require__(8);
	var pluginSourcesComponent = __webpack_require__(9);
	var pluginActionsComponent = __webpack_require__(10);
	var mcpServersComponent = __webpack_require__(11);
	var memoryManagerComponent = __webpack_require__(12);
	var modelDiscovery = __webpack_require__(13);
	var modelSelectorComponent = __webpack_require__(15);
	var settings = __webpack_require__(17);
	var watch = __webpack_require__(18);
	var model = __webpack_require__(19);
	var memoryStore = __webpack_require__(22);
	var tools = __webpack_require__(20);
	var pluginSources = __webpack_require__(25);
	var pluginActions = __webpack_require__(26);
	
	function clayCustomFn() {
	  var self = this;
	  var watchDisplayKeys = [
	    'FontSize',
	    'BuzzStrength',
	    'SpeakerFeedbackEnabled',
	    'ScrollLines',
	    'TouchScrollEnabled',
	    'TextColor',
	    'BackgroundColor',
	    'PromptBackgroundColor',
	    'BoldTextColor',
	    'StartDictationQuickLaunch'
	  ];
	
	  self.on(self.EVENTS.AFTER_BUILD, function() {
	    var resetButton = self.getItemById('ResetWatchDisplay');
	    var deleteAllButton = self.getItemById('DeleteAllPastChats');
	    var configAction = self.getItemByMessageKey('ConfigAction');
	    var memoryToggle = self.getItemByMessageKey('PebbleMemoryToolEnabled');
	    var memoryManager = self.getItemByMessageKey('MemoriesJson');
	    var pluginSourcesItem = self.getItemByMessageKey('PluginSourcesJson');
	    var pluginActionsItem = self.getItemByMessageKey('PluginActionsJson');
	    var builtinTools = self.getItemById('BuiltinTools');
	    var builtinToolKeys = [
	      'WebSearchEnabled',
	      'GeolocationToolEnabled',
	      'TimelineToolEnabled',
	      'HealthToolEnabled',
	      'SleepToolEnabled',
	      'PebbleMemoryToolEnabled',
	      'MaxToolCalls'
	    ];
	    var toolRoots = [];
	
	    function memoryEnabled() {
	      var value = memoryToggle && memoryToggle.get ? memoryToggle.get() : false;
	      return value === true || value === 1 || value === '1';
	    }
	
	    function updateMemoryVisibility() {
	      if (!memoryManager) {
	        return;
	      }
	      if (memoryEnabled()) {
	        memoryManager.show();
	      } else {
	        memoryManager.hide();
	      }
	    }
	
	    if (memoryToggle) {
	      memoryToggle.on('change', updateMemoryVisibility);
	    }
	    updateMemoryVisibility();
	
	    if (configAction) {
	      configAction.hide();
	      configAction.set('');
	    }
	
	    if (deleteAllButton && configAction) {
	      deleteAllButton.on('click', function() {
	        var submitButton;
	
	        if (!confirm('Delete all saved chats from this phone?')) {
	          return;
	        }
	
	        configAction.set('delete_saved_chats');
	        submitButton = document.querySelector('.component-submit button');
	        if (submitButton) {
	          submitButton.click();
	        }
	      });
	    }
	
	    if (builtinTools && typeof builtinTools.appendItems === 'function') {
	      builtinToolKeys.forEach(function(key) {
	        var toolItem = self.getItemByMessageKey(key);
	        if (toolItem && toolItem.$element && toolItem.$element[0]) {
	          toolRoots.push(toolItem.$element[0]);
	        }
	      });
	      builtinTools.appendItems(toolRoots);
	    }
	
	    if (pluginActionsItem && pluginActionsItem.$element && pluginActionsItem.$element[0]) {
	      if (pluginSourcesItem && typeof pluginSourcesItem.appendActions === 'function') {
	        if (pluginActionsItem.show) { pluginActionsItem.show(); }
	        if (!pluginSourcesItem.appendActions(pluginActionsItem.$element[0]) && pluginActionsItem.hide) {
	          pluginActionsItem.hide();
	        }
	      } else if (pluginActionsItem.hide) {
	        pluginActionsItem.hide();
	      }
	    }
	
	    if (!resetButton) {
	      return;
	    }
	
	    resetButton.on('click', function() {
	      watchDisplayKeys.forEach(function(key) {
	        var item = self.getItemByMessageKey(key);
	        if (item) {
	          item.set(item.config.defaultValue);
	        }
	      });
	    });
	  });
	}
	
	var clay = new Clay(clayConfig, clayCustomFn, { autoHandleEvents: false });
	clay.registerComponent(mcpServersComponent);
	clay.registerComponent(modelSelectorComponent);
	clay.registerComponent(memoryManagerComponent);
	clay.registerComponent(builtinToolsComponent);
	clay.registerComponent(settingsIoComponent);
	clay.registerComponent(pluginSourcesComponent);
	clay.registerComponent(pluginActionsComponent);
	
	function findConfigItem(items, messageKey) {
	  var found = null;
	
	  (items || []).some(function(item) {
	    if (item.messageKey === messageKey) {
	      found = item;
	      return true;
	    }
	    found = findConfigItem(item.items, messageKey);
	    return !!found;
	  });
	  return found;
	}
	
	function setDiscoveredModels(result) {
	  var modelItem = findConfigItem(clay.config, 'Model');
	
	  if (!modelItem) {
	    return;
	  }
	  modelItem.modelsEncoded = encodeURIComponent(JSON.stringify(result.models || []));
	  modelItem.modelsStatus = result.status || '';
	}
	
	function setPluginSourceCatalogue() {
	  var item = findConfigItem(clay.config, 'PluginSourcesJson');
	  var result;
	
	  if (!item) {
	    return;
	  }
	  try {
	    if (!pluginSources || typeof pluginSources.getCatalogue !== 'function') {
	      throw new Error('Plugin source catalogue is not supported by this phone.');
	    }
	    result = pluginSources.getCatalogue() || {};
	    item.catalogueEncoded = encodeURIComponent(JSON.stringify(Array.isArray(result.sources) ? result.sources : []));
	    item.catalogueStatus = result.status || '';
	  } catch (error) {
	    item.catalogueEncoded = encodeURIComponent('[]');
	    item.catalogueStatus = String(error && error.message || 'Plugin source catalogue unavailable on this phone.');
	  }
	}
	
	function setPluginActionCatalogue() {
	  var item = findConfigItem(clay.config, 'PluginActionsJson');
	  var result;
	
	  if (!item) {
	    return;
	  }
	  try {
	    result = pluginActions.getCatalogue() || {};
	    item.catalogueEncoded = encodeURIComponent(JSON.stringify(Array.isArray(result.actions) ? result.actions : []));
	    item.catalogueStatus = result.status || '';
	  } catch (error) {
	    item.catalogueEncoded = encodeURIComponent('[]');
	    item.catalogueStatus = String(error && error.message || 'Plugin action catalogue unavailable on this phone.');
	  }
	}
	
	function openConfiguration(currentSettings) {
	  var configurationSettings = settings.extend(currentSettings, {});
	  if (memoryStore && memoryStore.listMemories) {
	    try {
	      configurationSettings.MemoriesJson = JSON.stringify(memoryStore.listMemories(memoryStore.MAX_MEMORIES));
	    } catch (error) {
	      settings.logDebug('memory listing failed: ' + String(error && error.message || error));
	    }
	  }
	  clay.setSettings(configurationSettings);
	  setDiscoveredModels(modelDiscovery.getCached(currentSettings));
	  setPluginSourceCatalogue();
	  setPluginActionCatalogue();
	  Pebble.openURL(clay.generateUrl());
	}
	
	Pebble.addEventListener('ready', function() {
	  var startupSettings = settings.loadSettings();
	
	  settings.logDebug('ready');
	  model.resetChatHistory();
	  watch.syncWatchSettings(startupSettings, true);
	  tools.warmMcpTools(startupSettings);
	});
	
	Pebble.addEventListener('showConfiguration', function() {
	  var currentSettings = settings.loadSettings();
	
	  settings.logDebug('show configuration');
	  openConfiguration(currentSettings);
	});
	
	Pebble.addEventListener('webviewclosed', function(e) {
	  var savedSettings;
	  var normalizedSettings;
	  var settingsAction;
	  var memoryJson;
	  var memoryRecords;
	
	  if (!e || !e.response) {
	    settings.logDebug('configuration closed without response');
	    return;
	  }
	
	  settings.logDebug('configuration saved');
	  try {
	    savedSettings = clay.getSettings(e.response, false);
	  } catch (error) {
	    settings.logDebug('configuration response invalid: ' + String(error && error.message || error));
	    return;
	  }
	  settingsAction = savedSettings.ConfigAction;
	  if (settingsAction && typeof settingsAction === 'object' && settingsAction.value !== undefined) {
	    settingsAction = settingsAction.value;
	  }
	  delete savedSettings.ConfigAction;
	  if (savedSettings.MemoriesJson !== undefined) {
	    memoryJson = savedSettings.MemoriesJson;
	    if (memoryJson && typeof memoryJson === 'object' && memoryJson.value !== undefined) {
	      memoryJson = memoryJson.value;
	    }
	    try {
	      memoryRecords = JSON.parse(memoryJson);
	      if (Array.isArray(memoryRecords)) {
	        if (memoryStore && memoryStore.replaceMemories) {
	          if (!memoryStore.replaceMemories(memoryRecords)) {
	            settings.logDebug('memory replacement failed');
	          }
	        }
	      }
	    } catch (error) {
	      settings.logDebug('memory replacement failed: ' + String(error && error.message || error));
	    }
	    delete savedSettings.MemoriesJson;
	  }
	  normalizedSettings = settings.extend(settings.DEFAULT_SETTINGS, savedSettings);
	  if (settingsAction === 'delete_saved_chats') {
	    settings.logDebug('delete all saved chats from settings');
	    model.deleteAllSavedChats();
	  } else if (settingsAction === 'reload_models') {
	    settings.logDebug('refreshing model list after configuration save');
	  } else if (settingsAction) {
	    settings.logDebug('ignored unknown configuration action');
	    settingsAction = '';
	  }
	  settings.saveSettings(normalizedSettings);
	  watch.syncWatchSettings(normalizedSettings);
	  tools.warmMcpTools(normalizedSettings);
	  if (settingsAction === 'reload_models') {
	    modelDiscovery.refresh(normalizedSettings, function(result) {
	      settings.logDebug('configuration model discovery count=' + result.models.length);
	    });
	  }
	});
	
	Pebble.addEventListener('appmessage', function(e) {
	  var dict = e.payload || {};
	  var requestId = dict.RequestId || 0;
	
	  if (dict.ApprovalDecision !== undefined && dict.ApprovalDecision !== null) {
	    watch.handleActionApprovalResponse(dict);
	    return;
	  }
	
	  if (dict.HealthSummaryRequest) {
	    watch.handleHealthInfoResponse(dict);
	    return;
	  }
	
	  if (dict.RequestCancel) {
	    settings.logDebug('appmessage request cancel id=' + requestId);
	    model.cancelCompletion(requestId);
	    return;
	  }
	
	  if (dict.RequestRetry !== undefined && dict.RequestRetry !== null) {
	    settings.logDebug('appmessage request retry id=' + requestId + ' failed_id=' + dict.RequestRetry);
	    model.retryCompletion(requestId, dict.RequestRetry);
	    return;
	  }
	
	  if (dict.ChatReset) {
	    settings.logDebug('appmessage chat reset');
	    model.resetChatHistory();
	  }
	
	  if (dict.PastChatsRequest) {
	    var listSettings = settings.loadSettings();
	    settings.logDebug('appmessage past chats request preserve=' + (listSettings.PreserveChats ? '1' : '0'));
	    if (!listSettings.PreserveChats) {
	      watch.sendPastChatsError('Enable Preserve Chats in settings.');
	      return;
	    }
	    watch.sendPastChats(model.listSavedChats());
	    return;
	  }
	
	  if (dict.PastChatLoad) {
	    var loadSettings = settings.loadSettings();
	    var chat = null;
	
	    settings.logDebug('appmessage past chat load id=' + dict.PastChatLoad);
	    if (!loadSettings.PreserveChats) {
	      watch.sendPastChatsError('Enable Preserve Chats in settings.');
	      return;
	    }
	
	    chat = model.loadSavedChat(dict.PastChatLoad);
	    if (!chat) {
	      watch.sendPastChatsError('Saved chat not found.');
	      return;
	    }
	    watch.sendPastChatTranscript(chat, loadSettings);
	    return;
	  }
	
	  if (dict.PastChatDelete) {
	    settings.logDebug('appmessage past chat delete id=' + dict.PastChatDelete);
	    model.deleteSavedChat(dict.PastChatDelete);
	    watch.sendPastChatDeleted(dict.PastChatDelete);
	    watch.sendPastChats(model.listSavedChats());
	    return;
	  }
	
	  if (dict.RequestText) {
	    settings.logDebug('appmessage request id=' + requestId + ' textChars=' + String(dict.RequestText || '').length);
	    model.requestCompletion(requestId, dict.RequestText);
	  }
	});


/***/ }),
/* 3 */
/***/ (function(module, exports, __webpack_require__) {

	var require;var require;/* WEBPACK VAR INJECTION */(function(require) {/* Clay - https://github.com/pebble-dev/clay - Version: 1.0.10 - Build Date: 2026-05-21T20:55:54.467Z */
	!function(t){if(true)module.exports=t();else if("function"==typeof define&&define.amd)define([],t);else{var e;e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof self?self:this,e.rebbleclay=t()}}(function(){var t;return function(){function t(e,n,r){function o(a,s){if(!n[a]){if(!e[a]){var c="function"==typeof require&&require;if(!s&&c)return require(a,!0);if(i)return i(a,!0);var u=new Error("Cannot find module '"+a+"'");throw u.code="MODULE_NOT_FOUND",u}var l=n[a]={exports:{}};e[a][0].call(l.exports,function(t){var n=e[a][1][t];return o(n||t)},l,l.exports,t,e,n,r)}return n[a].exports}for(var i="function"==typeof require&&require,a=0;a<r.length;a++)o(r[a]);return o}return t}()({1:[function(t,e,n){"use strict";function r(t){var e=t.length;if(e%4>0)throw new Error("Invalid string. Length must be a multiple of 4");var n=t.indexOf("=");n===-1&&(n=e);var r=n===e?0:4-n%4;return[n,r]}function o(t){var e=r(t),n=e[0],o=e[1];return 3*(n+o)/4-o}function i(t,e,n){return 3*(e+n)/4-n}function a(t){var e,n,o=r(t),a=o[0],s=o[1],c=new p(i(t,a,s)),u=0,l=s>0?a-4:a;for(n=0;n<l;n+=4)e=f[t.charCodeAt(n)]<<18|f[t.charCodeAt(n+1)]<<12|f[t.charCodeAt(n+2)]<<6|f[t.charCodeAt(n+3)],c[u++]=e>>16&255,c[u++]=e>>8&255,c[u++]=255&e;return 2===s&&(e=f[t.charCodeAt(n)]<<2|f[t.charCodeAt(n+1)]>>4,c[u++]=255&e),1===s&&(e=f[t.charCodeAt(n)]<<10|f[t.charCodeAt(n+1)]<<4|f[t.charCodeAt(n+2)]>>2,c[u++]=e>>8&255,c[u++]=255&e),c}function s(t){return l[t>>18&63]+l[t>>12&63]+l[t>>6&63]+l[63&t]}function c(t,e,n){for(var r,o=[],i=e;i<n;i+=3)r=(t[i]<<16&16711680)+(t[i+1]<<8&65280)+(255&t[i+2]),o.push(s(r));return o.join("")}function u(t){for(var e,n=t.length,r=n%3,o=[],i=16383,a=0,s=n-r;a<s;a+=i)o.push(c(t,a,a+i>s?s:a+i));return 1===r?(e=t[n-1],o.push(l[e>>2]+l[e<<4&63]+"==")):2===r&&(e=(t[n-2]<<8)+t[n-1],o.push(l[e>>10]+l[e>>4&63]+l[e<<2&63]+"=")),o.join("")}n.byteLength=o,n.toByteArray=a,n.fromByteArray=u;for(var l=[],f=[],p="undefined"!=typeof Uint8Array?Uint8Array:Array,d="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",h=0,m=d.length;h<m;++h)l[h]=d[h],f[d.charCodeAt(h)]=h;f["-".charCodeAt(0)]=62,f["_".charCodeAt(0)]=63},{}],2:[function(t,e,n){(function(e,r){(function(){/*!
	 * The buffer module from node.js, for the browser.
	 *
	 * @author   Feross Aboukhadijeh <http://feross.org>
	 * @license  MIT
	 */
	"use strict";function r(){try{var t=new Uint8Array(1);return t.__proto__={__proto__:Uint8Array.prototype,foo:function(){return 42}},42===t.foo()&&"function"==typeof t.subarray&&0===t.subarray(1,1).byteLength}catch(e){return!1}}function o(){return a.TYPED_ARRAY_SUPPORT?2147483647:1073741823}function i(t,e){if(o()<e)throw new RangeError("Invalid typed array length");return a.TYPED_ARRAY_SUPPORT?(t=new Uint8Array(e),t.__proto__=a.prototype):(null===t&&(t=new a(e)),t.length=e),t}function a(t,e,n){if(!(a.TYPED_ARRAY_SUPPORT||this instanceof a))return new a(t,e,n);if("number"==typeof t){if("string"==typeof e)throw new Error("If encoding is specified then the first argument must be a string");return l(this,t)}return s(this,t,e,n)}function s(t,e,n,r){if("number"==typeof e)throw new TypeError('"value" argument must not be a number');return"undefined"!=typeof ArrayBuffer&&e instanceof ArrayBuffer?d(t,e,n,r):"string"==typeof e?f(t,e,n):h(t,e)}function c(t){if("number"!=typeof t)throw new TypeError('"size" argument must be a number');if(t<0)throw new RangeError('"size" argument must not be negative')}function u(t,e,n,r){return c(e),e<=0?i(t,e):void 0!==n?"string"==typeof r?i(t,e).fill(n,r):i(t,e).fill(n):i(t,e)}function l(t,e){if(c(e),t=i(t,e<0?0:0|m(e)),!a.TYPED_ARRAY_SUPPORT)for(var n=0;n<e;++n)t[n]=0;return t}function f(t,e,n){if("string"==typeof n&&""!==n||(n="utf8"),!a.isEncoding(n))throw new TypeError('"encoding" must be a valid string encoding');var r=0|b(e,n);t=i(t,r);var o=t.write(e,n);return o!==r&&(t=t.slice(0,o)),t}function p(t,e){var n=e.length<0?0:0|m(e.length);t=i(t,n);for(var r=0;r<n;r+=1)t[r]=255&e[r];return t}function d(t,e,n,r){if(e.byteLength,n<0||e.byteLength<n)throw new RangeError("'offset' is out of bounds");if(e.byteLength<n+(r||0))throw new RangeError("'length' is out of bounds");return e=void 0===n&&void 0===r?new Uint8Array(e):void 0===r?new Uint8Array(e,n):new Uint8Array(e,n,r),a.TYPED_ARRAY_SUPPORT?(t=e,t.__proto__=a.prototype):t=p(t,e),t}function h(t,e){if(a.isBuffer(e)){var n=0|m(e.length);return t=i(t,n),0===t.length?t:(e.copy(t,0,0,n),t)}if(e){if("undefined"!=typeof ArrayBuffer&&e.buffer instanceof ArrayBuffer||"length"in e)return"number"!=typeof e.length||H(e.length)?i(t,0):p(t,e);if("Buffer"===e.type&&_(e.data))return p(t,e.data)}throw new TypeError("First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.")}function m(t){if(t>=o())throw new RangeError("Attempt to allocate Buffer larger than maximum size: 0x"+o().toString(16)+" bytes");return 0|t}function g(t){return+t!=t&&(t=0),a.alloc(+t)}function b(t,e){if(a.isBuffer(t))return t.length;if("undefined"!=typeof ArrayBuffer&&"function"==typeof ArrayBuffer.isView&&(ArrayBuffer.isView(t)||t instanceof ArrayBuffer))return t.byteLength;"string"!=typeof t&&(t=""+t);var n=t.length;if(0===n)return 0;for(var r=!1;;)switch(e){case"ascii":case"latin1":case"binary":return n;case"utf8":case"utf-8":case void 0:return W(t).length;case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":return 2*n;case"hex":return n>>>1;case"base64":return J(t).length;default:if(r)return W(t).length;e=(""+e).toLowerCase(),r=!0}}function y(t,e,n){var r=!1;if((void 0===e||e<0)&&(e=0),e>this.length)return"";if((void 0===n||n>this.length)&&(n=this.length),n<=0)return"";if(n>>>=0,e>>>=0,n<=e)return"";for(t||(t="utf8");;)switch(t){case"hex":return D(this,e,n);case"utf8":case"utf-8":return j(this,e,n);case"ascii":return B(this,e,n);case"latin1":case"binary":return S(this,e,n);case"base64":return O(this,e,n);case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":return N(this,e,n);default:if(r)throw new TypeError("Unknown encoding: "+t);t=(t+"").toLowerCase(),r=!0}}function v(t,e,n){var r=t[e];t[e]=t[n],t[n]=r}function A(t,e,n,r,o){if(0===t.length)return-1;if("string"==typeof n?(r=n,n=0):n>2147483647?n=2147483647:n<-2147483648&&(n=-2147483648),n=+n,isNaN(n)&&(n=o?0:t.length-1),n<0&&(n=t.length+n),n>=t.length){if(o)return-1;n=t.length-1}else if(n<0){if(!o)return-1;n=0}if("string"==typeof e&&(e=a.from(e,r)),a.isBuffer(e))return 0===e.length?-1:w(t,e,n,r,o);if("number"==typeof e)return e=255&e,a.TYPED_ARRAY_SUPPORT&&"function"==typeof Uint8Array.prototype.indexOf?o?Uint8Array.prototype.indexOf.call(t,e,n):Uint8Array.prototype.lastIndexOf.call(t,e,n):w(t,[e],n,r,o);throw new TypeError("val must be string, number or Buffer")}function w(t,e,n,r,o){function i(t,e){return 1===a?t[e]:t.readUInt16BE(e*a)}var a=1,s=t.length,c=e.length;if(void 0!==r&&(r=String(r).toLowerCase(),"ucs2"===r||"ucs-2"===r||"utf16le"===r||"utf-16le"===r)){if(t.length<2||e.length<2)return-1;a=2,s/=2,c/=2,n/=2}var u;if(o){var l=-1;for(u=n;u<s;u++)if(i(t,u)===i(e,l===-1?0:u-l)){if(l===-1&&(l=u),u-l+1===c)return l*a}else l!==-1&&(u-=u-l),l=-1}else for(n+c>s&&(n=s-c),u=n;u>=0;u--){for(var f=!0,p=0;p<c;p++)if(i(t,u+p)!==i(e,p)){f=!1;break}if(f)return u}return-1}function k(t,e,n,r){n=Number(n)||0;var o=t.length-n;r?(r=Number(r),r>o&&(r=o)):r=o;var i=e.length;if(i%2!==0)throw new TypeError("Invalid hex string");r>i/2&&(r=i/2);for(var a=0;a<r;++a){var s=parseInt(e.substr(2*a,2),16);if(isNaN(s))return a;t[n+a]=s}return a}function x(t,e,n,r){return q(W(e,t.length-n),t,n,r)}function M(t,e,n,r){return q(U(e),t,n,r)}function T(t,e,n,r){return M(t,e,n,r)}function R(t,e,n,r){return q(J(e),t,n,r)}function P(t,e,n,r){return q(Z(e,t.length-n),t,n,r)}function O(t,e,n){return 0===e&&n===t.length?Q.fromByteArray(t):Q.fromByteArray(t.slice(e,n))}function j(t,e,n){n=Math.min(t.length,n);for(var r=[],o=e;o<n;){var i=t[o],a=null,s=i>239?4:i>223?3:i>191?2:1;if(o+s<=n){var c,u,l,f;switch(s){case 1:i<128&&(a=i);break;case 2:c=t[o+1],128===(192&c)&&(f=(31&i)<<6|63&c,f>127&&(a=f));break;case 3:c=t[o+1],u=t[o+2],128===(192&c)&&128===(192&u)&&(f=(15&i)<<12|(63&c)<<6|63&u,f>2047&&(f<55296||f>57343)&&(a=f));break;case 4:c=t[o+1],u=t[o+2],l=t[o+3],128===(192&c)&&128===(192&u)&&128===(192&l)&&(f=(15&i)<<18|(63&c)<<12|(63&u)<<6|63&l,f>65535&&f<1114112&&(a=f))}}null===a?(a=65533,s=1):a>65535&&(a-=65536,r.push(a>>>10&1023|55296),a=56320|1023&a),r.push(a),o+=s}return E(r)}function E(t){var e=t.length;if(e<=tt)return String.fromCharCode.apply(String,t);for(var n="",r=0;r<e;)n+=String.fromCharCode.apply(String,t.slice(r,r+=tt));return n}function B(t,e,n){var r="";n=Math.min(t.length,n);for(var o=e;o<n;++o)r+=String.fromCharCode(127&t[o]);return r}function S(t,e,n){var r="";n=Math.min(t.length,n);for(var o=e;o<n;++o)r+=String.fromCharCode(t[o]);return r}function D(t,e,n){var r=t.length;(!e||e<0)&&(e=0),(!n||n<0||n>r)&&(n=r);for(var o="",i=e;i<n;++i)o+=X(t[i]);return o}function N(t,e,n){for(var r=t.slice(e,n),o="",i=0;i<r.length;i+=2)o+=String.fromCharCode(r[i]+256*r[i+1]);return o}function F(t,e,n){if(t%1!==0||t<0)throw new RangeError("offset is not uint");if(t+e>n)throw new RangeError("Trying to access beyond buffer length")}function Y(t,e,n,r,o,i){if(!a.isBuffer(t))throw new TypeError('"buffer" argument must be a Buffer instance');if(e>o||e<i)throw new RangeError('"value" argument is out of bounds');if(n+r>t.length)throw new RangeError("Index out of range")}function z(t,e,n,r){e<0&&(e=65535+e+1);for(var o=0,i=Math.min(t.length-n,2);o<i;++o)t[n+o]=(e&255<<8*(r?o:1-o))>>>8*(r?o:1-o)}function L(t,e,n,r){e<0&&(e=4294967295+e+1);for(var o=0,i=Math.min(t.length-n,4);o<i;++o)t[n+o]=e>>>8*(r?o:3-o)&255}function I(t,e,n,r,o,i){if(n+r>t.length)throw new RangeError("Index out of range");if(n<0)throw new RangeError("Index out of range")}function K(t,e,n,r,o){return o||I(t,e,n,4,3.4028234663852886e38,-3.4028234663852886e38),$.write(t,e,n,r,23,4),n+4}function G(t,e,n,r,o){return o||I(t,e,n,8,1.7976931348623157e308,-1.7976931348623157e308),$.write(t,e,n,r,52,8),n+8}function C(t){if(t=V(t).replace(et,""),t.length<2)return"";for(;t.length%4!==0;)t+="=";return t}function V(t){return t.trim?t.trim():t.replace(/^\s+|\s+$/g,"")}function X(t){return t<16?"0"+t.toString(16):t.toString(16)}function W(t,e){e=e||1/0;for(var n,r=t.length,o=null,i=[],a=0;a<r;++a){if(n=t.charCodeAt(a),n>55295&&n<57344){if(!o){if(n>56319){(e-=3)>-1&&i.push(239,191,189);continue}if(a+1===r){(e-=3)>-1&&i.push(239,191,189);continue}o=n;continue}if(n<56320){(e-=3)>-1&&i.push(239,191,189),o=n;continue}n=(o-55296<<10|n-56320)+65536}else o&&(e-=3)>-1&&i.push(239,191,189);if(o=null,n<128){if((e-=1)<0)break;i.push(n)}else if(n<2048){if((e-=2)<0)break;i.push(n>>6|192,63&n|128)}else if(n<65536){if((e-=3)<0)break;i.push(n>>12|224,n>>6&63|128,63&n|128)}else{if(!(n<1114112))throw new Error("Invalid code point");if((e-=4)<0)break;i.push(n>>18|240,n>>12&63|128,n>>6&63|128,63&n|128)}}return i}function U(t){for(var e=[],n=0;n<t.length;++n)e.push(255&t.charCodeAt(n));return e}function Z(t,e){for(var n,r,o,i=[],a=0;a<t.length&&!((e-=2)<0);++a)n=t.charCodeAt(a),r=n>>8,o=n%256,i.push(o),i.push(r);return i}function J(t){return Q.toByteArray(C(t))}function q(t,e,n,r){for(var o=0;o<r&&!(o+n>=e.length||o>=t.length);++o)e[o+n]=t[o];return o}function H(t){return t!==t}var Q=t("base64-js"),$=t("ieee754"),_=t("isarray");n.Buffer=a,n.SlowBuffer=g,n.INSPECT_MAX_BYTES=50,a.TYPED_ARRAY_SUPPORT=void 0!==e.TYPED_ARRAY_SUPPORT?e.TYPED_ARRAY_SUPPORT:r(),n.kMaxLength=o(),a.poolSize=8192,a._augment=function(t){return t.__proto__=a.prototype,t},a.from=function(t,e,n){return s(null,t,e,n)},a.TYPED_ARRAY_SUPPORT&&(a.prototype.__proto__=Uint8Array.prototype,a.__proto__=Uint8Array,"undefined"!=typeof Symbol&&Symbol.species&&a[Symbol.species]===a&&Object.defineProperty(a,Symbol.species,{value:null,configurable:!0})),a.alloc=function(t,e,n){return u(null,t,e,n)},a.allocUnsafe=function(t){return l(null,t)},a.allocUnsafeSlow=function(t){return l(null,t)},a.isBuffer=function(t){return!(null==t||!t._isBuffer)},a.compare=function(t,e){if(!a.isBuffer(t)||!a.isBuffer(e))throw new TypeError("Arguments must be Buffers");if(t===e)return 0;for(var n=t.length,r=e.length,o=0,i=Math.min(n,r);o<i;++o)if(t[o]!==e[o]){n=t[o],r=e[o];break}return n<r?-1:r<n?1:0},a.isEncoding=function(t){switch(String(t).toLowerCase()){case"hex":case"utf8":case"utf-8":case"ascii":case"latin1":case"binary":case"base64":case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":return!0;default:return!1}},a.concat=function(t,e){if(!_(t))throw new TypeError('"list" argument must be an Array of Buffers');if(0===t.length)return a.alloc(0);var n;if(void 0===e)for(e=0,n=0;n<t.length;++n)e+=t[n].length;var r=a.allocUnsafe(e),o=0;for(n=0;n<t.length;++n){var i=t[n];if(!a.isBuffer(i))throw new TypeError('"list" argument must be an Array of Buffers');i.copy(r,o),o+=i.length}return r},a.byteLength=b,a.prototype._isBuffer=!0,a.prototype.swap16=function(){var t=this.length;if(t%2!==0)throw new RangeError("Buffer size must be a multiple of 16-bits");for(var e=0;e<t;e+=2)v(this,e,e+1);return this},a.prototype.swap32=function(){var t=this.length;if(t%4!==0)throw new RangeError("Buffer size must be a multiple of 32-bits");for(var e=0;e<t;e+=4)v(this,e,e+3),v(this,e+1,e+2);return this},a.prototype.swap64=function(){var t=this.length;if(t%8!==0)throw new RangeError("Buffer size must be a multiple of 64-bits");for(var e=0;e<t;e+=8)v(this,e,e+7),v(this,e+1,e+6),v(this,e+2,e+5),v(this,e+3,e+4);return this},a.prototype.toString=function(){var t=0|this.length;return 0===t?"":0===arguments.length?j(this,0,t):y.apply(this,arguments)},a.prototype.equals=function(t){if(!a.isBuffer(t))throw new TypeError("Argument must be a Buffer");return this===t||0===a.compare(this,t)},a.prototype.inspect=function(){var t="",e=n.INSPECT_MAX_BYTES;return this.length>0&&(t=this.toString("hex",0,e).match(/.{2}/g).join(" "),this.length>e&&(t+=" ... ")),"<Buffer "+t+">"},a.prototype.compare=function(t,e,n,r,o){if(!a.isBuffer(t))throw new TypeError("Argument must be a Buffer");if(void 0===e&&(e=0),void 0===n&&(n=t?t.length:0),void 0===r&&(r=0),void 0===o&&(o=this.length),e<0||n>t.length||r<0||o>this.length)throw new RangeError("out of range index");if(r>=o&&e>=n)return 0;if(r>=o)return-1;if(e>=n)return 1;if(e>>>=0,n>>>=0,r>>>=0,o>>>=0,this===t)return 0;for(var i=o-r,s=n-e,c=Math.min(i,s),u=this.slice(r,o),l=t.slice(e,n),f=0;f<c;++f)if(u[f]!==l[f]){i=u[f],s=l[f];break}return i<s?-1:s<i?1:0},a.prototype.includes=function(t,e,n){return this.indexOf(t,e,n)!==-1},a.prototype.indexOf=function(t,e,n){return A(this,t,e,n,!0)},a.prototype.lastIndexOf=function(t,e,n){return A(this,t,e,n,!1)},a.prototype.write=function(t,e,n,r){if(void 0===e)r="utf8",n=this.length,e=0;else if(void 0===n&&"string"==typeof e)r=e,n=this.length,e=0;else{if(!isFinite(e))throw new Error("Buffer.write(string, encoding, offset[, length]) is no longer supported");e=0|e,isFinite(n)?(n=0|n,void 0===r&&(r="utf8")):(r=n,n=void 0)}var o=this.length-e;if((void 0===n||n>o)&&(n=o),t.length>0&&(n<0||e<0)||e>this.length)throw new RangeError("Attempt to write outside buffer bounds");r||(r="utf8");for(var i=!1;;)switch(r){case"hex":return k(this,t,e,n);case"utf8":case"utf-8":return x(this,t,e,n);case"ascii":return M(this,t,e,n);case"latin1":case"binary":return T(this,t,e,n);case"base64":return R(this,t,e,n);case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":return P(this,t,e,n);default:if(i)throw new TypeError("Unknown encoding: "+r);r=(""+r).toLowerCase(),i=!0}},a.prototype.toJSON=function(){return{type:"Buffer",data:Array.prototype.slice.call(this._arr||this,0)}};var tt=4096;a.prototype.slice=function(t,e){var n=this.length;t=~~t,e=void 0===e?n:~~e,t<0?(t+=n,t<0&&(t=0)):t>n&&(t=n),e<0?(e+=n,e<0&&(e=0)):e>n&&(e=n),e<t&&(e=t);var r;if(a.TYPED_ARRAY_SUPPORT)r=this.subarray(t,e),r.__proto__=a.prototype;else{var o=e-t;r=new a(o,(void 0));for(var i=0;i<o;++i)r[i]=this[i+t]}return r},a.prototype.readUIntLE=function(t,e,n){t=0|t,e=0|e,n||F(t,e,this.length);for(var r=this[t],o=1,i=0;++i<e&&(o*=256);)r+=this[t+i]*o;return r},a.prototype.readUIntBE=function(t,e,n){t=0|t,e=0|e,n||F(t,e,this.length);for(var r=this[t+--e],o=1;e>0&&(o*=256);)r+=this[t+--e]*o;return r},a.prototype.readUInt8=function(t,e){return e||F(t,1,this.length),this[t]},a.prototype.readUInt16LE=function(t,e){return e||F(t,2,this.length),this[t]|this[t+1]<<8},a.prototype.readUInt16BE=function(t,e){return e||F(t,2,this.length),this[t]<<8|this[t+1]},a.prototype.readUInt32LE=function(t,e){return e||F(t,4,this.length),(this[t]|this[t+1]<<8|this[t+2]<<16)+16777216*this[t+3]},a.prototype.readUInt32BE=function(t,e){return e||F(t,4,this.length),16777216*this[t]+(this[t+1]<<16|this[t+2]<<8|this[t+3])},a.prototype.readIntLE=function(t,e,n){t=0|t,e=0|e,n||F(t,e,this.length);for(var r=this[t],o=1,i=0;++i<e&&(o*=256);)r+=this[t+i]*o;return o*=128,r>=o&&(r-=Math.pow(2,8*e)),r},a.prototype.readIntBE=function(t,e,n){t=0|t,e=0|e,n||F(t,e,this.length);for(var r=e,o=1,i=this[t+--r];r>0&&(o*=256);)i+=this[t+--r]*o;return o*=128,i>=o&&(i-=Math.pow(2,8*e)),i},a.prototype.readInt8=function(t,e){return e||F(t,1,this.length),128&this[t]?(255-this[t]+1)*-1:this[t]},a.prototype.readInt16LE=function(t,e){e||F(t,2,this.length);var n=this[t]|this[t+1]<<8;return 32768&n?4294901760|n:n},a.prototype.readInt16BE=function(t,e){e||F(t,2,this.length);var n=this[t+1]|this[t]<<8;return 32768&n?4294901760|n:n},a.prototype.readInt32LE=function(t,e){return e||F(t,4,this.length),this[t]|this[t+1]<<8|this[t+2]<<16|this[t+3]<<24},a.prototype.readInt32BE=function(t,e){return e||F(t,4,this.length),this[t]<<24|this[t+1]<<16|this[t+2]<<8|this[t+3]},a.prototype.readFloatLE=function(t,e){return e||F(t,4,this.length),$.read(this,t,!0,23,4)},a.prototype.readFloatBE=function(t,e){return e||F(t,4,this.length),$.read(this,t,!1,23,4)},a.prototype.readDoubleLE=function(t,e){return e||F(t,8,this.length),$.read(this,t,!0,52,8)},a.prototype.readDoubleBE=function(t,e){return e||F(t,8,this.length),$.read(this,t,!1,52,8)},a.prototype.writeUIntLE=function(t,e,n,r){if(t=+t,e=0|e,n=0|n,!r){var o=Math.pow(2,8*n)-1;Y(this,t,e,n,o,0)}var i=1,a=0;for(this[e]=255&t;++a<n&&(i*=256);)this[e+a]=t/i&255;return e+n},a.prototype.writeUIntBE=function(t,e,n,r){if(t=+t,e=0|e,n=0|n,!r){var o=Math.pow(2,8*n)-1;Y(this,t,e,n,o,0)}var i=n-1,a=1;for(this[e+i]=255&t;--i>=0&&(a*=256);)this[e+i]=t/a&255;return e+n},a.prototype.writeUInt8=function(t,e,n){return t=+t,e=0|e,n||Y(this,t,e,1,255,0),a.TYPED_ARRAY_SUPPORT||(t=Math.floor(t)),this[e]=255&t,e+1},a.prototype.writeUInt16LE=function(t,e,n){return t=+t,e=0|e,n||Y(this,t,e,2,65535,0),a.TYPED_ARRAY_SUPPORT?(this[e]=255&t,this[e+1]=t>>>8):z(this,t,e,!0),e+2},a.prototype.writeUInt16BE=function(t,e,n){return t=+t,e=0|e,n||Y(this,t,e,2,65535,0),a.TYPED_ARRAY_SUPPORT?(this[e]=t>>>8,this[e+1]=255&t):z(this,t,e,!1),e+2},a.prototype.writeUInt32LE=function(t,e,n){return t=+t,e=0|e,n||Y(this,t,e,4,4294967295,0),a.TYPED_ARRAY_SUPPORT?(this[e+3]=t>>>24,this[e+2]=t>>>16,this[e+1]=t>>>8,this[e]=255&t):L(this,t,e,!0),e+4},a.prototype.writeUInt32BE=function(t,e,n){return t=+t,e=0|e,n||Y(this,t,e,4,4294967295,0),a.TYPED_ARRAY_SUPPORT?(this[e]=t>>>24,this[e+1]=t>>>16,this[e+2]=t>>>8,this[e+3]=255&t):L(this,t,e,!1),e+4},a.prototype.writeIntLE=function(t,e,n,r){if(t=+t,e=0|e,!r){var o=Math.pow(2,8*n-1);Y(this,t,e,n,o-1,-o)}var i=0,a=1,s=0;for(this[e]=255&t;++i<n&&(a*=256);)t<0&&0===s&&0!==this[e+i-1]&&(s=1),this[e+i]=(t/a>>0)-s&255;return e+n},a.prototype.writeIntBE=function(t,e,n,r){if(t=+t,e=0|e,!r){var o=Math.pow(2,8*n-1);Y(this,t,e,n,o-1,-o)}var i=n-1,a=1,s=0;for(this[e+i]=255&t;--i>=0&&(a*=256);)t<0&&0===s&&0!==this[e+i+1]&&(s=1),this[e+i]=(t/a>>0)-s&255;return e+n},a.prototype.writeInt8=function(t,e,n){return t=+t,e=0|e,n||Y(this,t,e,1,127,-128),a.TYPED_ARRAY_SUPPORT||(t=Math.floor(t)),t<0&&(t=255+t+1),this[e]=255&t,e+1},a.prototype.writeInt16LE=function(t,e,n){return t=+t,e=0|e,n||Y(this,t,e,2,32767,-32768),a.TYPED_ARRAY_SUPPORT?(this[e]=255&t,this[e+1]=t>>>8):z(this,t,e,!0),e+2},a.prototype.writeInt16BE=function(t,e,n){return t=+t,e=0|e,n||Y(this,t,e,2,32767,-32768),a.TYPED_ARRAY_SUPPORT?(this[e]=t>>>8,this[e+1]=255&t):z(this,t,e,!1),e+2},a.prototype.writeInt32LE=function(t,e,n){return t=+t,e=0|e,n||Y(this,t,e,4,2147483647,-2147483648),a.TYPED_ARRAY_SUPPORT?(this[e]=255&t,this[e+1]=t>>>8,this[e+2]=t>>>16,this[e+3]=t>>>24):L(this,t,e,!0),e+4},a.prototype.writeInt32BE=function(t,e,n){return t=+t,e=0|e,n||Y(this,t,e,4,2147483647,-2147483648),t<0&&(t=4294967295+t+1),a.TYPED_ARRAY_SUPPORT?(this[e]=t>>>24,this[e+1]=t>>>16,this[e+2]=t>>>8,this[e+3]=255&t):L(this,t,e,!1),e+4},a.prototype.writeFloatLE=function(t,e,n){return K(this,t,e,!0,n)},a.prototype.writeFloatBE=function(t,e,n){return K(this,t,e,!1,n)},a.prototype.writeDoubleLE=function(t,e,n){return G(this,t,e,!0,n)},a.prototype.writeDoubleBE=function(t,e,n){return G(this,t,e,!1,n)},a.prototype.copy=function(t,e,n,r){if(n||(n=0),r||0===r||(r=this.length),e>=t.length&&(e=t.length),e||(e=0),r>0&&r<n&&(r=n),r===n)return 0;if(0===t.length||0===this.length)return 0;if(e<0)throw new RangeError("targetStart out of bounds");if(n<0||n>=this.length)throw new RangeError("sourceStart out of bounds");if(r<0)throw new RangeError("sourceEnd out of bounds");r>this.length&&(r=this.length),t.length-e<r-n&&(r=t.length-e+n);var o,i=r-n;if(this===t&&n<e&&e<r)for(o=i-1;o>=0;--o)t[o+e]=this[o+n];else if(i<1e3||!a.TYPED_ARRAY_SUPPORT)for(o=0;o<i;++o)t[o+e]=this[o+n];else Uint8Array.prototype.set.call(t,this.subarray(n,n+i),e);return i},a.prototype.fill=function(t,e,n,r){if("string"==typeof t){if("string"==typeof e?(r=e,e=0,n=this.length):"string"==typeof n&&(r=n,n=this.length),1===t.length){var o=t.charCodeAt(0);o<256&&(t=o)}if(void 0!==r&&"string"!=typeof r)throw new TypeError("encoding must be a string");if("string"==typeof r&&!a.isEncoding(r))throw new TypeError("Unknown encoding: "+r)}else"number"==typeof t&&(t=255&t);if(e<0||this.length<e||this.length<n)throw new RangeError("Out of range index");if(n<=e)return this;e>>>=0,n=void 0===n?this.length:n>>>0,t||(t=0);var i;if("number"==typeof t)for(i=e;i<n;++i)this[i]=t;else{var s=a.isBuffer(t)?t:W(new a(t,r).toString()),c=s.length;for(i=0;i<n-e;++i)this[i+e]=s[i%c]}return this};var et=/[^+\/0-9A-Za-z-_]/g}).call(this)}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{},t("buffer").Buffer)},{"base64-js":1,buffer:2,ieee754:4,isarray:5}],3:[function(e,n,r){(function(e){(function(){/*!
	 * @license deepcopy.js Copyright(c) 2013 sasa+1
	 * https://github.com/sasaplus1/deepcopy.js
	 * Released under the MIT license.
	 */
	!function(e,o){"object"==typeof r&&"object"==typeof n?n.exports=o():"function"==typeof t&&t.amd?t([],o):"object"==typeof r?r.deepcopy=o():e.deepcopy=o()}(this,function(){return function(t){function e(r){if(n[r])return n[r].exports;var o=n[r]={exports:{},id:r,loaded:!1};return t[r].call(o.exports,o,o.exports,e),o.loaded=!0,o.exports}var n={};return e.m=t,e.c=n,e.p="",e(0)}([function(t,e,n){"use strict";t.exports=n(3)},function(t,n){"use strict";function r(t,e){if("[object Array]"!==o.call(t))throw new TypeError("array must be an Array");var n=void 0,r=void 0,i=void 0;for(n=0,r=t.length;r>n;++n)if(i=t[n],i===e||i!==i&&e!==e)return n;return-1}n.__esModule=!0;var o=Object.prototype.toString,i="undefined"!=typeof e?function(t){return e.isBuffer(t)}:function(){return!1},a="function"==typeof Object.keys?function(t){return Object.keys(t)}:function(t){var e=typeof t;if(null===t||"function"!==e&&"object"!==e)throw new TypeError("obj must be an Object");var n=[],r=void 0;for(r in t)Object.prototype.hasOwnProperty.call(t,r)&&n.push(r);return n},s="function"==typeof Symbol?function(t){return Object.getOwnPropertySymbols(t)}:function(){return[]};n.getKeys=a,n.getSymbols=s,n.indexOf=r,n.isBuffer=i},function(t,n,r){"use strict";function o(t,e){var n=a(t);return null!==n?n:i(t,e)}function i(t,n){if("function"!=typeof n)throw new TypeError("customizer is must be a Function");if("function"==typeof t){var r=String(t);return/^\s*function\s*\S*\([^\)]*\)\s*{\s*\[native code\]\s*}/.test(r)?t:new Function("return "+String(r))()}var o=c.call(t);if("[object Array]"===o)return[];if("[object Object]"===o&&t.constructor===Object)return{};if("[object Date]"===o)return new Date(t.getTime());if("[object RegExp]"===o){var i=String(t),a=i.lastIndexOf("/");return new RegExp(i.slice(1,a),i.slice(a+1))}if((0,s.isBuffer)(t)){var u=new e(t.length);return t.copy(u),u}var l=n(t);return void 0!==l?l:null}function a(t){var e=typeof t;return null!==t&&"object"!==e&&"function"!==e?t:null}n.__esModule=!0,n.copyValue=n.copyCollection=n.copy=void 0;var s=r(1),c=Object.prototype.toString;n.copy=o,n.copyCollection=i,n.copyValue=a},function(t,e,n){"use strict";function r(t){}function o(t){var e=arguments.length<=1||void 0===arguments[1]?r:arguments[1];if(null===t)return null;var n=(0,a.copyValue)(t);if(null!==n)return n;var o=(0,a.copyCollection)(t,e),s=null!==o?o:t,c=[t],u=[s];return i(t,e,s,c,u)}function i(t,e,n,r,o){if(null===t)return null;var c=(0,a.copyValue)(t);if(null!==c)return c;var u=(0,s.getKeys)(t).concat((0,s.getSymbols)(t)),l=void 0,f=void 0,p=void 0,d=void 0,h=void 0,m=void 0,g=void 0,b=void 0;for(l=0,f=u.length;f>l;++l)p=u[l],d=t[p],h=(0,s.indexOf)(r,d),m=void 0,g=void 0,b=void 0,-1===h?(m=(0,a.copy)(d,e),g=null!==m?m:d,null!==d&&/^(?:function|object)$/.test(typeof d)&&(r.push(d),o.push(g))):b=o[h],n[p]=b||i(d,e,g,r,o);return n}e.__esModule=!0;var a=n(2),s=n(1);e["default"]=o,t.exports=e["default"]}])})}).call(this)}).call(this,e("buffer").Buffer)},{buffer:2}],4:[function(t,e,n){/*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> */
	n.read=function(t,e,n,r,o){var i,a,s=8*o-r-1,c=(1<<s)-1,u=c>>1,l=-7,f=n?o-1:0,p=n?-1:1,d=t[e+f];for(f+=p,i=d&(1<<-l)-1,d>>=-l,l+=s;l>0;i=256*i+t[e+f],f+=p,l-=8);for(a=i&(1<<-l)-1,i>>=-l,l+=r;l>0;a=256*a+t[e+f],f+=p,l-=8);if(0===i)i=1-u;else{if(i===c)return a?NaN:(d?-1:1)*(1/0);a+=Math.pow(2,r),i-=u}return(d?-1:1)*a*Math.pow(2,i-r)},n.write=function(t,e,n,r,o,i){var a,s,c,u=8*i-o-1,l=(1<<u)-1,f=l>>1,p=23===o?Math.pow(2,-24)-Math.pow(2,-77):0,d=r?0:i-1,h=r?1:-1,m=e<0||0===e&&1/e<0?1:0;for(e=Math.abs(e),isNaN(e)||e===1/0?(s=isNaN(e)?1:0,a=l):(a=Math.floor(Math.log(e)/Math.LN2),e*(c=Math.pow(2,-a))<1&&(a--,c*=2),e+=a+f>=1?p/c:p*Math.pow(2,1-f),e*c>=2&&(a++,c/=2),a+f>=l?(s=0,a=l):a+f>=1?(s=(e*c-1)*Math.pow(2,o),a+=f):(s=e*Math.pow(2,f-1)*Math.pow(2,o),a=0));o>=8;t[n+d]=255&s,d+=h,s/=256,o-=8);for(a=a<<o|s,u+=o;u>0;t[n+d]=255&a,d+=h,a/=256,u-=8);t[n+d-h]|=128*m}},{}],5:[function(t,e,n){var r={}.toString;e.exports=Array.isArray||function(t){return"[object Array]"==r.call(t)}},{}],6:[function(t,e,n){function r(t){return/^[a-z_$][0-9a-z_$]*$/gi.test(t)&&!i.test(t)}function o(t){if(a)return t.toString();var e=t.source.replace(/\//g,function(t,e,n){return 0===e||"\\"!==n[e-1]?"\\/":"/"}),n=(t.global&&"g"||"")+(t.ignoreCase&&"i"||"")+(t.multiline&&"m"||"");return"/"+e+"/"+n}/* toSource by Marcello Bastea-Forte - zlib license */
	e.exports=function(t,e,n,i){function a(t,e,n,i,s){function c(t){return n.slice(1)+t.join(","+(n&&"\n")+u)+(n?" ":"")}var u=i+n;switch(t=e?e(t):t,typeof t){case"string":return JSON.stringify(t);case"boolean":case"number":case"undefined":return""+t;case"function":return t.toString()}if(null===t)return"null";if(t instanceof RegExp)return o(t);if(t instanceof Date)return"new Date("+t.getTime()+")";var l=s.indexOf(t)+1;if(l>0)return"{$circularReference:"+l+"}";if(s.push(t),Array.isArray(t))return"["+c(t.map(function(t){return a(t,e,n,u,s.slice())}))+"]";var f=Object.keys(t);return f.length?"{"+c(f.map(function(o){return(r(o)?o:JSON.stringify(o))+":"+a(t[o],e,n,u,s.slice())}))+"}":"{}"}var s=[];return a(t,e,void 0===n?"  ":n||"",i||"",s)};var i=/^(abstract|boolean|break|byte|case|catch|char|class|const|continue|debugger|default|delete|do|double|else|enum|export|extends|false|final|finally|float|for|function|goto|if|implements|import|in|instanceof|int|interface|long|native|new|null|package|private|protected|public|return|short|static|super|switch|synchronized|this|throw|throws|transient|true|try|typeof|undefined|var|void|volatile|while|with)$/,a="\\/"===new RegExp("/").source},{}],7:[function(t,e,n){e.exports={name:"@rebble/clay",version:"1.0.10",description:"Pebble Config Framework",types:"index.d.ts",scripts:{"test-travis":"./node_modules/.bin/gulp && ./node_modules/.bin/karma start ./test/karma.conf.js --single-run --browsers chromeTravisCI","test-debug":"(export DEBUG=true && ./node_modules/.bin/gulp && ./node_modules/.bin/karma start ./test/karma.conf.js --no-single-run)",test:"./node_modules/.bin/gulp && ./node_modules/.bin/karma start ./test/karma.conf.js --single-run",lint:"./node_modules/.bin/eslint ./",build:"gulp","build:types":"tsc -p tsconfig.declarations.json","check:types":"tsc -p tsconfig.typecheck.json",dev:"gulp dev","pebble-clean":"rm -rf tmp src/js/index.js && pebble clean","pebble-publish":"npm run pebble-clean && npm run build && pebble build && pebble package publish && npm run pebble-clean","pebble-build":"npm run build && pebble build"},repository:{type:"git",url:"git+https://github.com/pebble-dev/clay.git"},keywords:["pebble","config","configuration","pebble-package"],author:"Pebble Technology",license:"MIT",bugs:{url:"https://github.com/pebble-dev/clay/issues"},pebble:{projectType:"package",sdkVersion:"3",targetPlatforms:["aplite","basalt","chalk","diorite","emery","flint","gabbro"],resources:{media:[]},capabilities:["configurable"]},homepage:"https://github.com/pebble-dev/clay#readme",devDependencies:{autoprefixer:"^10.4.23",bourbon:"^4.2.6",browserify:"^13.0.0","browserify-istanbul":"^3.0.1",chai:"^3.4.1",deamdify:"^0.2.0",deepcopy:"^0.6.1",del:"^2.0.2",eslint:"^1.5.1","eslint-config-pebble":"^1.2.0","eslint-plugin-standard":"^1.3.1",gulp:"^5.0.1","gulp-autoprefixer":"^3.1.0","gulp-htmlmin":"^1.3.0","gulp-inline":"^0.1.3","gulp-insert":"^0.5.0","gulp-sass":"^6.0.1","gulp-sourcemaps":"^1.6.0","gulp-uglify":"^1.5.2",joi:"^6.10.1",karma:"^6.4.0","karma-browserify":"^8.1.0","karma-chrome-launcher":"^3.2.0","karma-coverage":"^2.2.1","karma-mocha":"^2.0.1","karma-mocha-reporter":"^2.2.5","karma-source-map-support":"^1.4.0","karma-threshold-reporter":"^0.1.15",mocha:"^11.7.5",postcss:"8.5.6","require-from-string":"^2.0.2",sass:"^1.94.2",sinon:"^1.17.3",stringify:"^3.2.0",through:"^2.3.8",tosource:"^1.0.0",typescript:"6.0.2","vinyl-buffer":"^1.0.0","vinyl-source-stream":"^2.0.0",watchify:"^3.11.1"}}},{}],8:[function(t,e,n){"use strict";e.exports={name:"button",template:t("../../templates/components/button.tpl"),style:t("../../../tmp/button.css"),manipulator:"button",defaults:{primary:!1,attributes:{},description:""}}},{"../../../tmp/button.css":33,"../../templates/components/button.tpl":21}],9:[function(t,e,n){"use strict";e.exports={name:"checkboxgroup",template:t("../../templates/components/checkboxgroup.tpl"),style:t("../../../tmp/checkboxgroup.css"),manipulator:"checkboxgroup",defaults:{label:"",options:[],description:""}}},{"../../../tmp/checkboxgroup.css":34,"../../templates/components/checkboxgroup.tpl":22}],10:[function(t,e,n){"use strict";e.exports={name:"color",template:t("../../templates/components/color.tpl"),style:t("../../../tmp/color.css"),manipulator:"color",defaults:{label:"",description:""},initialize:function(t,e){function n(t){if("number"==typeof t)t=t.toString(16);else if(!t)return"transparent";return t=r(t),"#"+(f?p[t]:t)}function r(t){for(t=t.toLowerCase();t.length<6;)t="0"+t;return t}function o(t){switch(typeof t){case"number":return r(t.toString(16));case"string":return t.replace(/^#|^0x/,"");default:return t}}function i(t){return t.reduce(function(t,e){return t.concat(e)},[])}function a(t){t=t.replace(/^#|^0x/,"");var e=parseInt(t.slice(0,2),16)/255,n=parseInt(t.slice(2,4),16)/255,r=parseInt(t.slice(4),16)/255;e=e>.04045?Math.pow((e+.055)/1.055,2.4):e/12.92,n=n>.04045?Math.pow((n+.055)/1.055,2.4):n/12.92,r=r>.04045?Math.pow((r+.055)/1.055,2.4):r/12.92;var o=(.4124*e+.3576*n+.1805*r)/.95047,i=(.2126*e+.7152*n+.0722*r)/1,a=(.0193*e+.1192*n+.9505*r)/1.08883;return o=o>.008856?Math.pow(o,1/3):7.787*o+16/116,i=i>.008856?Math.pow(i,1/3):7.787*i+16/116,a=a>.008856?Math.pow(a,1/3):7.787*a+16/116,[116*i-16,500*(o-i),200*(i-a)]}function s(t,e){var n=t[0]-e[0],r=t[1]-e[1],o=t[2]-e[2];return Math.sqrt(Math.pow(n,2)+Math.pow(r,2)+Math.pow(o,2))}function c(){var t=["aplite","diorite","flint"];return!e.meta.activeWatchInfo||2===e.meta.activeWatchInfo.firmware.major||t.indexOf(e.meta.activeWatchInfo.platform)>-1&&!l.config.allowGray?d.BLACK_WHITE:t.indexOf(e.meta.activeWatchInfo.platform)>-1&&l.config.allowGray?d.GRAY:d.COLOR}var u=t.HTML,l=this;l.roundColorToLayout=function(t){var e=o(t);if(m.indexOf(e)===-1){var n=a(e),r=m.map(function(t){var e=a(o(t));return s(n,e)}),i=Math.min.apply(Math,r),c=r.indexOf(i);e=m[c]}return parseInt(e,16)};var f=l.config.sunlight!==!1,p={"000000":"000000","000055":"001e41","0000aa":"004387","0000ff":"0068ca","005500":"2b4a2c","005555":"27514f","0055aa":"16638d","0055ff":"007dce","00aa00":"5e9860","00aa55":"5c9b72","00aaaa":"57a5a2","00aaff":"4cb4db","00ff00":"8ee391","00ff55":"8ee69e","00ffaa":"8aebc0","00ffff":"84f5f1",550000:"4a161b",550055:"482748","5500aa":"40488a","5500ff":"2f6bcc",555500:"564e36",555555:"545454","5555aa":"4f6790","5555ff":"4180d0","55aa00":"759a64","55aa55":"759d76","55aaaa":"71a6a4","55aaff":"69b5dd","55ff00":"9ee594","55ff55":"9de7a0","55ffaa":"9becc2","55ffff":"95f6f2",aa0000:"99353f",aa0055:"983e5a",aa00aa:"955694",aa00ff:"8f74d2",aa5500:"9d5b4d",aa5555:"9d6064",aa55aa:"9a7099",aa55ff:"9587d5",aaaa00:"afa072",aaaa55:"aea382",aaaaaa:"ababab",ffffff:"ffffff",aaaaff:"a7bae2",aaff00:"c9e89d",aaff55:"c9eaa7",aaffaa:"c7f0c8",aaffff:"c3f9f7",ff0000:"e35462",ff0055:"e25874",ff00aa:"e16aa3",ff00ff:"de83dc",ff5500:"e66e6b",ff5555:"e6727c",ff55aa:"e37fa7",ff55ff:"e194df",ffaa00:"f1aa86",ffaa55:"f1ad93",ffaaaa:"efb5b8",ffaaff:"ecc3eb",ffff00:"ffeeab",ffff55:"fff1b5",ffffaa:"fff6d3"},d={COLOR:[[!1,!1,"55ff00","aaff55",!1,"ffff55","ffffaa",!1,!1],[!1,"aaffaa","55ff55","00ff00","aaff00","ffff00","ffaa55","ffaaaa",!1],["55ffaa","00ff55","00aa00","55aa00","aaaa55","aaaa00","ffaa00","ff5500","ff5555"],["aaffff","00ffaa","00aa55","55aa55","005500","555500","aa5500","ff0000","ff0055"],[!1,"55aaaa","00aaaa","005555","ffffff","000000","aa5555","aa0000",!1],["55ffff","00ffff","00aaff","0055aa","aaaaaa","555555","550000","aa0055","ff55aa"],["55aaff","0055ff","0000ff","0000aa","000055","550055","aa00aa","ff00aa","ffaaff"],[!1,"5555aa","5555ff","5500ff","5500aa","aa00ff","ff00ff","ff55ff",!1],[!1,!1,!1,"aaaaff","aa55ff","aa55aa",!1,!1,!1]],GRAY:[["000000","aaaaaa","ffffff"]],BLACK_WHITE:[["000000","ffffff"]]},h=l.config.layout||c();"string"==typeof h&&(h=d[h]),Array.isArray(h[0])||(h=[h]);var m=i(h).map(function(t){return o(t)}).filter(function(t){return t}),g="",b=h.length,y=0;h.forEach(function(t){y=t.length>y?t.length:y});for(var v=100/y,A=100/b,w=l.$element,k=0;k<b;k++)for(var x=0;x<y;x++){var M=o(h[k][x]),T=M?" selectable":"",R=0===k&&0===x||0===k&&!h[k][x-1]||!h[k][x-1]&&!h[k-1][x]?" rounded-tl":"",P=0===k&&!h[k][x+1]||!h[k][x+1]&&!h[k-1][x]?" rounded-tr ":"",O=k===h.length-1&&0===x||k===h.length-1&&!h[k][x-1]||!h[k][x-1]&&!h[k+1][x]?" rounded-bl":"",j=k===h.length-1&&!h[k][x+1]||!h[k][x+1]&&!h[k+1][x]?" rounded-br":"";g+='<i class="color-box '+T+R+P+O+j+'" '+(M?'data-value="'+parseInt(M,16)+'" ':"")+'style="width:'+v+"%; height:"+A+"%; background:"+n(M)+';"></i>'}var E=0;3===y&&(E=5),2===y&&(E=8);var B=E*v/A+"%",S=E+"%";w.select(".color-box-container").add(u(g)).set("$paddingTop",B).set("$paddingRight",S).set("$paddingBottom",B).set("$paddingLeft",S),w.select(".color-box-wrap").set("$paddingBottom",v/A*100+"%");var D=w.select(".value"),N=w.select(".picker-wrap"),F=l.$manipulatorTarget.get("disabled");w.select("label").on("click",function(){F||N.set("show")}),l.on("change",function(){var t=l.get();D.set("$background-color",n(t)),w.select(".color-box").set("-selected"),w.select('.color-box[data-value="'+t+'"]').set("+selected")}),w.select(".color-box.selectable").on("click",function(t){l.set(parseInt(t.target.dataset.value,10)),N.set("-show")}),N.on("click",function(){N.set("-show")}),l.on("disabled",function(){F=!0}),l.on("enabled",function(){F=!1}),l._layout=h}}},{"../../../tmp/color.css":35,"../../templates/components/color.tpl":23}],11:[function(t,e,n){"use strict";e.exports={name:"footer",template:t("../../templates/components/footer.tpl"),manipulator:"html"}},{"../../templates/components/footer.tpl":24}],12:[function(t,e,n){"use strict";e.exports={name:"heading",template:t("../../templates/components/heading.tpl"),manipulator:"html",defaults:{size:4}}},{"../../templates/components/heading.tpl":25}],13:[function(t,e,n){"use strict";e.exports={color:t("./color"),footer:t("./footer"),heading:t("./heading"),input:t("./input"),select:t("./select"),submit:t("./submit"),text:t("./text"),toggle:t("./toggle"),radiogroup:t("./radiogroup"),checkboxgroup:t("./checkboxgroup"),button:t("./button"),slider:t("./slider")}},{"./button":8,"./checkboxgroup":9,"./color":10,"./footer":11,"./heading":12,"./input":14,"./radiogroup":15,"./select":16,"./slider":17,"./submit":18,"./text":19,"./toggle":20}],14:[function(t,e,n){"use strict";e.exports={name:"input",template:t("../../templates/components/input.tpl"),style:t("../../../tmp/input.css"),manipulator:"val",defaults:{label:"",description:"",attributes:{}}}},{"../../../tmp/input.css":37,"../../templates/components/input.tpl":26}],15:[function(t,e,n){"use strict";e.exports={name:"radiogroup",template:t("../../templates/components/radiogroup.tpl"),style:t("../../../tmp/radiogroup.css"),manipulator:"radiogroup",defaults:{label:"",options:[],description:"",attributes:{}}}},{"../../../tmp/radiogroup.css":38,"../../templates/components/radiogroup.tpl":27}],16:[function(t,e,n){"use strict";e.exports={name:"select",template:t("../../templates/components/select.tpl"),style:t("../../../tmp/select.css"),manipulator:"val",defaults:{label:"",options:[],description:"",attributes:{}},initialize:function(){function t(){var t=e.$manipulatorTarget.get("selectedIndex"),r=e.$manipulatorTarget.select("option"),o=r[t]&&r[t].innerHTML;n.set("innerHTML",o)}var e=this,n=e.$element.select(".value");t(),e.on("change",t)}}},{"../../../tmp/select.css":39,"../../templates/components/select.tpl":28}],17:[function(t,e,n){"use strict";e.exports={name:"slider",template:t("../../templates/components/slider.tpl"),style:t("../../../tmp/slider.css"),manipulator:"slider",defaults:{label:"",description:"",min:0,max:100,step:1,attributes:{}},initialize:function(){function t(){var t=e.get().toFixed(e.precision);n.set("value",t),r.set("innerHTML",t)}var e=this,n=e.$element.select(".value"),r=e.$element.select(".value-pad"),o=e.$manipulatorTarget,i=o.get("step");i=i.toString(10).split(".")[1],e.precision=i?i.length:0,e.on("change",t),o.on("|input",t),t(),n.on("|input",function(){r.set("innerHTML",this.get("value"))}),n.on("|change",function(){e.set(this.get("value")),t()})}}},{"../../../tmp/slider.css":40,"../../templates/components/slider.tpl":29}],18:[function(t,e,n){"use strict";e.exports={name:"submit",template:t("../../templates/components/submit.tpl"),style:t("../../../tmp/submit.css"),manipulator:"button",defaults:{attributes:{}}}},{"../../../tmp/submit.css":41,"../../templates/components/submit.tpl":30}],19:[function(t,e,n){"use strict";e.exports={name:"text",template:t("../../templates/components/text.tpl"),manipulator:"html"}},{"../../templates/components/text.tpl":31}],20:[function(t,e,n){"use strict";e.exports={name:"toggle",template:t("../../templates/components/toggle.tpl"),style:t("../../../tmp/toggle.css"),manipulator:"checked",defaults:{label:"",description:"",attributes:{}}}},{"../../../tmp/toggle.css":42,"../../templates/components/toggle.tpl":32}],21:[function(t,e,n){e.exports='<div class="component component-button">\n  <button\n    type="button"\n    data-manipulator-target\n    class="{{primary ? \'primary\' : \'\'}}"\n    {{each key: attributes}}{{key}}="{{this}}"{{/each}}\n  ></button>\n  {{if description}}\n    <div class="description">{{{description}}}</div>\n  {{/if}}\n</div>\n'},{}],22:[function(t,e,n){e.exports='<div class="component component-checkbox">\n  <span class="label">{{{label}}}</span>\n  <div class="checkbox-group">\n    {{each options}}\n      <label class="tap-highlight">\n        <span class="label">{{{this}}}</span>\n        <input type="checkbox" value="1" name="clay-{{clayId}}" />\n        <i></i>\n      </label>\n    {{/each}}\n  </div>\n  {{if description}}\n    <div class="description">{{{description}}}</div>\n  {{/if}}\n</div>\n'},{}],23:[function(t,e,n){e.exports='<div class="component component-color">\n  <label class="tap-highlight">\n    <input\n      data-manipulator-target\n      type="hidden"\n    />\n    <span class="label">{{{label}}}</span>\n    <span class="value"></span>\n  </label>\n  {{if description}}\n    <div class="description">{{{description}}}</div>\n  {{/if}}\n  <div class="picker-wrap">\n    <div class="picker">\n      <div class="color-box-wrap">\n        <div class="color-box-container"></div>\n      </div>\n    </div>\n  </div>\n</div>\n'},{}],24:[function(t,e,n){e.exports='<footer data-manipulator-target class="component component-footer"></footer>\n'},{}],25:[function(t,e,n){e.exports='<div class="component component-heading">\n  <h{{size}} data-manipulator-target></h{{size}}>\n</div>\n'},{}],26:[function(t,e,n){e.exports='<div class="component component-input">\n  <label class="tap-highlight">\n    <span class="label">{{{label}}}</span>\n    <span class="input">\n      <input\n      data-manipulator-target\n        {{each key: attributes}}{{key}}="{{this}}"{{/each}}\n    />\n    </span>\n  </label>\n\n  {{if description}}\n    <div class="description">{{{description}}}</div>\n  {{/if}}\n</div>\n'},{}],27:[function(t,e,n){e.exports='<div class="component component-radio">\n  <span class="label">{{{label}}}</span>\n  <div class="radio-group">\n    {{each options}}\n      <label class="tap-highlight">\n        <span class="label">{{{this.label}}}</span>\n        <input\n          type="radio"\n          value="{{this.value}}"\n          name="clay-{{clayId}}"\n          {{each key: attributes}}{{key}}="{{this}}"{{/each}}\n        />\n        <i></i>\n      </label>\n    {{/each}}\n  </div>\n  {{if description}}\n    <div class="description">{{{description}}}</div>\n  {{/if}}\n</div>\n'},{}],28:[function(t,e,n){e.exports='<div class="component component-select">\n  <label class="tap-highlight">\n    <span class="label">{{{label}}}</span>\n    <span class="value"></span>\n    <select data-manipulator-target {{each key: attributes}}{{key}}="{{this}}"{{/each}}>\n      {{each options}}\n        {{if Array.isArray(this.value)}}\n          <optgroup label="{{this.label}}">\n            {{each this.value}}\n              <option value="{{this.value}}" class="item-select-option">{{this.label}}</option>\n            {{/each}}\n          </optgroup>\n        {{else}}\n          <option value="{{this.value}}" class="item-select-option">{{this.label}}</option>\n        {{/if}}\n      {{/each}}\n    </select>\n  </label>\n  {{if description}}\n    <div class="description">{{{description}}}</div>\n  {{/if}}\n</div>\n'},{}],29:[function(t,e,n){e.exports='<div class="component component-slider">\n  <label class="tap-highlight">\n    <span class="label-container">\n      <span class="label">{{{label}}}</span>\n      <span class="value-wrap">\n        <span class="value-pad"></span>\n        <input type="text" class="value" />\n      </span>\n    </span>\n    <span class="input">\n      <input\n        data-manipulator-target\n        class="slider"\n        type="range"\n        min="{{min}}"\n        max="{{max}}"\n        step="{{step}}"\n        {{each key: attributes}}{{key}}="{{this}}"{{/each}}\n      />\n    </span>\n</label>\n  {{if description}}\n    <div class="description">{{{description}}}</div>\n  {{/if}}\n</div>\n'},{}],30:[function(t,e,n){e.exports='<div class="component component-submit">\n  <button\n    data-manipulator-target\n    type="submit"\n    {{each key: attributes}}{{key}}="{{this}}"{{/each}}\n  ></button>\n</div>\n'},{}],31:[function(t,e,n){e.exports='<div class="component component-text">\n  <p data-manipulator-target></p>\n</div>\n'},{}],32:[function(t,e,n){e.exports='<div class="component component-toggle">\n  <label class="tap-highlight">\n    <span class="label">{{{label}}}</span>\n    <span class="input">\n      <input\n        data-manipulator-target\n        type="checkbox"\n        {{each key: attributes}}{{key}}="{{this}}"{{/each}}\n      />\n      <span class="graphic">\n        <span class="slide"></span>\n        <span class="marker"></span>\n      </span>\n    </span>\n  </label>\n  {{if description}}\n    <div class="description">{{{description}}}</div>\n  {{/if}}\n</div>\n'},{}],33:[function(t,e,n){e.exports=".component-button {\n  text-align: center;\n}\n.section .component-button {\n  padding-bottom: 0;\n}\n.component-button .description {\n  padding-left: 0;\n  padding-right: 0;\n}\n/*# sourceMappingURL=button.css.map */\n"},{}],34:[function(t,e,n){e.exports='.component-checkbox {\n  display: block;\n}\n.section .component-checkbox {\n  padding-right: 0.375rem;\n}\n.component-checkbox > .label {\n  display: block;\n  padding-bottom: 0.35rem;\n}\n.component-checkbox .checkbox-group {\n  padding-bottom: 0.35rem;\n}\n.component-checkbox .checkbox-group label {\n  padding: 0.35rem 0.375rem;\n}\n.component-checkbox .checkbox-group .label {\n  font-size: 0.9em;\n}\n.component-checkbox .checkbox-group input {\n  opacity: 0;\n  position: absolute;\n}\n.component-checkbox .checkbox-group i {\n  display: block;\n  position: relative;\n  border-radius: 0.25rem;\n  width: 1.4rem;\n  height: 1.4rem;\n  border: 0.1176470588rem solid #767676;\n  -webkit-flex-shrink: 0;\n  flex-shrink: 0;\n}\n.component-checkbox .checkbox-group input:checked + i {\n  border-color: #ff4700;\n  background: #ff4700;\n}\n.component-checkbox .checkbox-group input:checked + i:after {\n  content: "";\n  box-sizing: border-box;\n  -webkit-transform: rotate(45deg);\n  transform: rotate(45deg);\n  position: absolute;\n  left: 0.35rem;\n  top: -0.05rem;\n  display: block;\n  width: 0.5rem;\n  height: 1rem;\n  border: 0 solid #ffffff;\n  border-right-width: 0.1176470588rem;\n  border-bottom-width: 0.1176470588rem;\n}\n.component-checkbox .description {\n  padding-left: 0;\n  padding-right: 0;\n}\n/*# sourceMappingURL=checkboxgroup.css.map */\n'},{}],35:[function(t,e,n){e.exports=".section .component-color {\n  padding: 0;\n}\n.component-color .value {\n  width: 2.2652rem;\n  height: 1.4rem;\n  border-radius: 0.7rem;\n  box-shadow: 0 0.1rem 0.1rem #2f2f2f;\n  display: block;\n  background: #000;\n}\n.component-color .picker-wrap {\n  left: 0;\n  top: 0;\n  right: 0;\n  bottom: 0;\n  position: fixed;\n  padding: 0.7rem 0.375rem;\n  background: rgba(0, 0, 0, 0.65);\n  opacity: 0;\n  -webkit-transition: opacity 100ms ease-in 175ms;\n  transition: opacity 100ms ease-in 175ms;\n  pointer-events: none;\n  z-index: 100;\n  display: -webkit-box;\n  display: -webkit-flex;\n  display: flex;\n  -webkit-box-orient: vertical;\n  -webkit-box-direction: normal;\n  -webkit-flex-direction: column;\n  flex-direction: column;\n  -webkit-box-pack: center;\n  -webkit-justify-content: center;\n  justify-content: center;\n  -webkit-box-align: center;\n  -webkit-align-items: center;\n  align-items: center;\n}\n.component-color .picker-wrap .picker {\n  padding: 0.7rem 0.75rem;\n  background: #484848;\n  box-shadow: 0 0.1764705882rem 0.8823529412rem rgba(0, 0, 0, 0.4);\n  border-radius: 0.25rem;\n  width: 100%;\n  max-width: 26rem;\n  overflow: auto;\n}\n.component-color .picker-wrap.show {\n  -webkit-transition-delay: 0ms;\n  transition-delay: 0ms;\n  pointer-events: auto;\n  opacity: 1;\n}\n.component-color .color-box-wrap {\n  box-sizing: border-box;\n  position: relative;\n  height: 0;\n  width: 100%;\n  padding: 0 0 100% 0;\n}\n.component-color .color-box-wrap .color-box-container {\n  position: absolute;\n  height: 99.97%;\n  width: 100%;\n  left: 0;\n  top: 0;\n}\n.component-color .color-box-wrap .color-box-container .color-box {\n  float: left;\n  cursor: pointer;\n  -webkit-tap-highlight-color: rgba(0, 0, 0, 0);\n}\n.component-color .color-box-wrap .color-box-container .color-box.rounded-tl {\n  border-top-left-radius: 0.25rem;\n}\n.component-color .color-box-wrap .color-box-container .color-box.rounded-tr {\n  border-top-right-radius: 0.25rem;\n}\n.component-color .color-box-wrap .color-box-container .color-box.rounded-bl {\n  border-bottom-left-radius: 0.25rem;\n}\n.component-color .color-box-wrap .color-box-container .color-box.rounded-br {\n  border-bottom-right-radius: 0.25rem;\n}\n.component-color .color-box-wrap .color-box-container .color-box.selected {\n  -webkit-transform: scale(1.1);\n  transform: scale(1.1);\n  border-radius: 0.25rem;\n  box-shadow: #111 0 0 0.24rem;\n  position: relative;\n  z-index: 100;\n}\n/*# sourceMappingURL=color.css.map */\n"},{}],36:[function(t,e,n){e.exports='<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><style>@font-face{font-family:PFDinDisplayProRegularWebfont;src:url(data:application/font-woff;charset=utf-8;base64,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) format("woff");font-weight:400;font-style:normal}a,abbr,acronym,address,applet,article,aside,audio,b,big,blockquote,body,canvas,caption,center,cite,code,dd,del,details,dfn,div,dl,dt,em,fieldset,figcaption,figure,footer,form,h1,h2,h3,h4,h5,h6,header,hgroup,html,i,iframe,img,ins,kbd,label,legend,li,mark,menu,nav,object,ol,p,pre,q,s,samp,section,small,span,strike,strong,sub,summary,sup,table,tbody,td,tfoot,th,thead,time,tr,tt,u,ul,var,video{margin:0;padding:0;border:0;outline:0;font-size:100%;font:inherit;vertical-align:baseline}button,input,textarea{outline:0}article,aside,details,figcaption,figure,footer,header,hgroup,menu,nav,section{display:block}body{line-height:1}ol,ul{list-style:none}blockquote:after,blockquote:before,q:after,q:before{content:"";content:none}html{box-sizing:border-box}*,:after,:before{box-sizing:inherit}body,html{font-weight:400;font-family:PFDinDisplayPro-Regular,PFDinDisplayProRegularWebfont,sans-serif;-webkit-font-smoothing:antialiased;font-size:17px;line-height:1.4;height:100%;color:#fff}body.platform-ios,html.platform-ios{font-size:16px}body{background-color:#333;padding:0 .75rem .7rem}em{font-style:italic}strong{font-weight:400;font-family:PFDinDisplayPro-Medium,PFDinDisplayProRegularWebfont,sans-serif}.platform-android strong{font-family:PFDinDisplayProRegularWebfont,sans-serif;font-weight:700;letter-spacing:.025em}strong{color:#ff4700}a{color:#858585}a:hover{color:inherit}h1,h2,h3,h4{text-transform:uppercase;font-weight:400;font-family:PFDinDisplayPro-Medium,PFDinDisplayProRegularWebfont,sans-serif}.platform-android h1,.platform-android h2,.platform-android h3,.platform-android h4{font-family:PFDinDisplayProRegularWebfont,sans-serif;font-weight:700;letter-spacing:.025em}h1,h2,h3,h4{text-transform:uppercase;position:relative;top:.05rem;line-height:.9}h1{font-size:2rem;line-height:2.8rem}h2{font-size:1.8rem;line-height:2.8rem}h3{font-size:1.5rem;line-height:2.8rem}h4{font-size:1.2rem;line-height:1.4rem}h5{font-size:1rem;line-height:1.4rem}h6{font-size:.8rem;line-height:1.4rem}input{font-family:inherit;font-size:inherit;line-height:inherit}label{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-pack:justify;-webkit-justify-content:space-between;justify-content:space-between;-webkit-box-align:center;-webkit-align-items:center;align-items:center;padding:.7rem .75rem}label .input{white-space:nowrap;display:-webkit-box;display:-webkit-flex;display:flex;max-width:50%;margin-left:.75rem}label.invalid .input:after{content:"!";display:inline-block;color:#fff;background:#ff4700;border-radius:.55rem;width:1.1rem;text-align:center;height:1.1rem;font-size:.825rem;vertical-align:middle;line-height:1.1rem;box-shadow:0 .1rem .1rem #2f2f2f;font-weight:400;font-family:PFDinDisplayPro-Medium,PFDinDisplayProRegularWebfont,sans-serif}.platform-android label.invalid .input:after{font-family:PFDinDisplayProRegularWebfont,sans-serif;font-weight:700;letter-spacing:.025em}label.invalid .input:after{-webkit-box-flex:0;-webkit-flex:0 0 1.1rem;flex:0 0 1.1rem;margin-left:.3rem}.hide{display:none!important}.tap-highlight{-webkit-tap-highlight-color:rgba(255,255,255,.1)}.tap-highlight:active{background-color:rgba(255,255,255,.1)}.tap-highlight{border-radius:.25rem}.component{padding-top:.7rem}.component.disabled{pointer-events:none}.component.disabled>*{opacity:.25}.section{background:#484848;border-radius:.25rem;box-shadow:#2f2f2f 0 .15rem .25rem}.section>.component{padding-bottom:.7rem;padding-right:.75rem;padding-left:.75rem;position:relative;margin-top:1rem}.section>.component:not(.hide)~.component{margin-top:0}.section>.component:first-child:after{display:none}.section>.component:after{content:"";background:#666;display:block;position:absolute;top:0;left:.375rem;right:.375rem;height:1px;pointer-events:none}.section>.component:not(.hide):after{display:none}.section>.component:not(.hide)~.component:not(.hide):after{display:block}.section>.component-heading:first-child{background:#414141;border-radius:.25rem .25rem 0 0}.section>.component-heading:first-child:after,.section>.component-heading:first-child~.component:not(.hide):after{display:none}.section>.component-heading:first-child~.component:not(.hide)~.component:not(.hide):after{display:block}.description{padding:0 .75rem .7rem;font-size:.9rem;line-height:1.4rem;color:#a4a4a4;text-align:left}.inputs{display:block;width:100%;border-collapse:collapse}.button,button{font-weight:400;font-family:PFDinDisplayPro-Medium,PFDinDisplayProRegularWebfont,sans-serif}.platform-android .button,.platform-android button{font-family:PFDinDisplayProRegularWebfont,sans-serif;font-weight:700;letter-spacing:.025em}.button,button{font-size:1rem;line-height:1.4rem;text-transform:uppercase;background-color:#767676;border-radius:.25rem;border:none;display:inline-block;color:#fff;min-width:12rem;text-align:center;margin:0 auto .7rem;padding:.6rem;-webkit-tap-highlight-color:#858585}.button:active,button:active{background-color:#858585}.platform-ios .button,.platform-ios button{padding:.5rem}.button.primary,.button[type=submit],button.primary,button[type=submit]{background-color:#ff4700;-webkit-tap-highlight-color:red}.button.primary:active,.button[type=submit]:active,button.primary:active,button[type=submit]:active{background-color:red}a.button{text-decoration:none;color:#fff}</style><meta name="viewport"content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><script>window.returnTo="$$RETURN_TO$$",window.clayConfig=$$CONFIG$$,window.claySettings=$$SETTINGS$$,window.customFn=$$CUSTOM_FN$$,window.clayComponents=$$COMPONENTS$$,window.clayMeta=$$META$$</script></head><body><form id="main-form"class="inputs"></form><script>!function(){function t(e,n,r){function i(a,u){if(!n[a]){if(!e[a]){var s="function"==typeof require&&require;if(!u&&s)return s(a,!0);if(o)return o(a,!0);var c=new Error("Cannot find module \'"+a+"\'");throw c.code="MODULE_NOT_FOUND",c}var l=n[a]={exports:{}};e[a][0].call(l.exports,function(t){var n=e[a][1][t];return i(n||t)},l,l.exports,t,e,n,r)}return n[a].exports}for(var o="function"==typeof require&&require,a=0;a<r.length;a++)i(r[a]);return i}return t}()({1:[function(t,e,n){"use strict";var r=t("./vendor/minified"),i=t("./lib/clay-config"),o=r.$,a=r._,u=a.extend([],window.clayConfig||[]),s=a.extend({},window.claySettings||{}),c=window.returnTo||"pebblejs://close#",l=window.customFn||function(){},f=window.clayComponents||{},m=window.clayMeta||{},h=window.navigator.userAgent.match(/android/i)?"android":"ios";document.documentElement.classList.add("platform-"+h),a.eachObj(f,function(t,e){i.registerComponent(e)});var p=o("#main-form"),d=new i(s,u,p,m);p.on("submit",function(){location.href=c+encodeURIComponent(JSON.stringify(d.serialize()))}),l.call(d,r),d.build()},{"./lib/clay-config":2,"./vendor/minified":8}],2:[function(t,e,n){"use strict";function r(t,e,n,c){function l(){h=[],p={},d={},g=!1}function f(t,e){if(Array.isArray(t))t.forEach(function(t){f(t,e)});else if(u.includesCapability(c.activeWatchInfo,t.capabilities))if("section"===t.type){var n=i(\'<div class="section">\');e.add(n),f(t.items,n)}else{var r=o.copyObj(t);r.clayId=h.length;var s=new a(r).initialize(v);r.id&&(p[r.id]=s),r.messageKey&&(d[r.messageKey]=s),h.push(s);var l="undefined"!=typeof y[r.messageKey]?y[r.messageKey]:r.defaultValue;s.set("undefined"!=typeof l?l:""),e.add(s.$element)}}function m(t){if(!g)throw new Error("ClayConfig not built. build() must be run before you can run "+t+"()");return!0}var h,p,d,g,v=this,y=o.copyObj(t);v.meta=c,v.$rootContainer=n,v.EVENTS={BEFORE_BUILD:"BEFORE_BUILD",AFTER_BUILD:"AFTER_BUILD",BEFORE_DESTROY:"BEFORE_DESTROY",AFTER_DESTROY:"AFTER_DESTROY"},u.updateProperties(v.EVENTS,{writable:!1}),v.getAllItems=function(){return m("getAllItems"),h},v.getItemByMessageKey=function(t){return m("getItemByMessageKey"),d[t]},v.getItemById=function(t){return m("getItemById"),p[t]},v.getItemsByType=function(t){return m("getItemsByType"),h.filter(function(e){return e.config.type===t})},v.getItemsByGroup=function(t){return m("getItemsByGroup"),h.filter(function(e){return e.config.group===t})},v.serialize=function(){return m("serialize"),y={},o.eachObj(d,function(t,e){y[t]={value:e.get()},e.precision&&(y[t].precision=e.precision)}),y},v.registerComponent=r.registerComponent,v.destroy=function(){var t=n[0];for(v.trigger(v.EVENTS.BEFORE_DESTROY);t.firstChild;)t.removeChild(t.firstChild);return l(),v.trigger(v.EVENTS.AFTER_DESTROY),v},v.build=function(){return g&&v.destroy(),v.trigger(v.EVENTS.BEFORE_BUILD),f(v.config,n),g=!0,v.trigger(v.EVENTS.AFTER_BUILD),v},l(),s.call(v,n),u.updateProperties(v,{writable:!1,configurable:!1}),v.config=e}var i=t("../vendor/minified").HTML,o=t("../vendor/minified")._,a=t("./clay-item"),u=t("../lib/utils"),s=t("./clay-events"),c=t("./component-registry"),l=t("./manipulators");r.registerComponent=function(t){var e=o.copyObj(t);if(c[e.name])return console.warn("Component: "+e.name+" is already registered. If you wish to override the existing functionality, you must provide a new name"),!1;if("string"==typeof e.manipulator&&(e.manipulator=l[t.manipulator],!e.manipulator))throw new Error("The manipulator: "+t.manipulator+" does not exist in the built-in manipulators.");if(!e.manipulator)throw new Error("The manipulator must be defined");if("function"!=typeof e.manipulator.set||"function"!=typeof e.manipulator.get)throw new Error("The manipulator must have both a `get` and `set` method");if(e.style){var n=document.createElement("style");n.type="text/css",n.appendChild(document.createTextNode(e.style)),document.head.appendChild(n)}return c[e.name]=e,!0},e.exports=r},{"../lib/utils":7,"../vendor/minified":8,"./clay-events":3,"./clay-item":4,"./component-registry":5,"./manipulators":6}],3:[function(t,e,n){"use strict";function r(t){function e(t){return t.split(" ").map(function(t){return"|"+t.replace(/^\\|/,"")}).join(" ")}function n(t,e){var n=o.find(u,function(e){return e.handler===t?e:null});return n||(n={handler:t,proxy:e},u.push(n)),n.proxy}function r(t){return o.find(u,function(e){return e.handler===t?e.proxy:null})}var a=this,u=[];a.on=function(r,i){var o=e(r),a=this,u=n(i,function(){i.apply(a,arguments)});return t.on(o,u),a},a.off=function(t){var e=r(t);return e&&i.off(e),a},a.trigger=function(e,n){return t.trigger(e,n),a}}var i=t("../vendor/minified").$,o=t("../vendor/minified")._;e.exports=r},{"../vendor/minified":8}],4:[function(t,e,n){"use strict";function r(t){var e=this,n=i[t.type];if(!n)throw new Error("The component: "+t.type+" is not registered. Make sure to register it with ClayConfig.registerComponent()");var r=s.extend({},n.defaults||{},t);e.id=t.id||null,e.messageKey=t.messageKey||null,e.config=t,e.$element=c(n.template.trim(),r),e.$manipulatorTarget=e.$element.select("[data-manipulator-target]"),e.$manipulatorTarget.length||(e.$manipulatorTarget=e.$element),e.initialize=function(t){return"function"==typeof n.initialize&&n.initialize.call(e,o,t),e},u.call(e,e.$manipulatorTarget),s.eachObj(n.manipulator,function(t,n){e[t]=n.bind(e)}),a.updateProperties(e,{writable:!1,configurable:!1})}var i=t("./component-registry"),o=t("../vendor/minified"),a=t("../lib/utils"),u=t("./clay-events"),s=o._,c=o.HTML;e.exports=r},{"../lib/utils":7,"../vendor/minified":8,"./clay-events":3,"./component-registry":5}],5:[function(t,e,n){"use strict";e.exports={}},{}],6:[function(t,e,n){"use strict";function r(){return this.$manipulatorTarget.get("disabled")?this:(this.$element.set("+disabled"),this.$manipulatorTarget.set("disabled",!0),this.trigger("disabled"))}function i(){return this.$manipulatorTarget.get("disabled")?(this.$element.set("-disabled"),this.$manipulatorTarget.set("disabled",!1),this.trigger("enabled")):this}function o(){return this.$element[0].classList.contains("hide")?this:(this.$element.set("+hide"),this.trigger("hide"))}function a(){return this.$element[0].classList.contains("hide")?(this.$element.set("-hide"),this.trigger("show")):this}var u=t("../vendor/minified")._;e.exports={html:{get:function(){return this.$manipulatorTarget.get("innerHTML")},set:function(t){return this.get()===t.toString(10)?this:(this.$manipulatorTarget.set("innerHTML",t),this.trigger("change"))},hide:o,show:a},button:{get:function(){return this.$manipulatorTarget.get("innerHTML")},set:function(t){return this.get()===t.toString(10)?this:(this.$manipulatorTarget.set("innerHTML",t),this.trigger("change"))},disable:r,enable:i,hide:o,show:a},val:{get:function(){return this.$manipulatorTarget.get("value")},set:function(t){return this.get()===t.toString(10)?this:(this.$manipulatorTarget.set("value",t),this.trigger("change"))},disable:r,enable:i,hide:o,show:a},slider:{get:function(){return parseFloat(this.$manipulatorTarget.get("value"))},set:function(t){var e=this.get();return this.$manipulatorTarget.set("value",t),this.get()===e?this:this.trigger("change")},disable:r,enable:i,hide:o,show:a},checked:{get:function(){return this.$manipulatorTarget.get("checked")},set:function(t){return!this.get()==!t?this:(this.$manipulatorTarget.set("checked",!!t),this.trigger("change"))},disable:r,enable:i,hide:o,show:a},radiogroup:{get:function(){return this.$element.select("input:checked").get("value")},set:function(t){return this.get()===t.toString(10)?this:(this.$element.select(\'input[value="\'+t.replace(\'"\',\'\\\\"\')+\'"]\').set("checked",!0),this.trigger("change"))},disable:r,enable:i,hide:o,show:a},checkboxgroup:{get:function(){var t=[];return this.$element.select("input").each(function(e){t.push(!!e.checked)}),t},set:function(t){var e=this;for(t=Array.isArray(t)?t:[];t.length<this.get().length;)t.push(!1);return u.equals(this.get(),t)?this:(e.$element.select("input").set("checked",!1).each(function(e,n){e.checked=!!t[n]}),e.trigger("change"))},disable:r,enable:i,hide:o,show:a},color:{get:function(){return parseInt(this.$manipulatorTarget.get("value"),10)||0},set:function(t){return t=this.roundColorToLayout(t||0),this.get()===t?this:(this.$manipulatorTarget.set("value",t),this.trigger("change"))},disable:r,enable:i,hide:o,show:a}}},{"../vendor/minified":8}],7:[function(t,e,n){"use strict";e.exports.updateProperties=function(t,e){Object.getOwnPropertyNames(t).forEach(function(n){Object.defineProperty(t,n,e)})},e.exports.capabilityMap={PLATFORM_APLITE:{platforms:["aplite"],minFwMajor:0,minFwMinor:0},PLATFORM_BASALT:{platforms:["basalt"],minFwMajor:0,minFwMinor:0},PLATFORM_CHALK:{platforms:["chalk"],minFwMajor:0,minFwMinor:0},PLATFORM_DIORITE:{platforms:["diorite"],minFwMajor:0,minFwMinor:0},PLATFORM_EMERY:{platforms:["emery"],minFwMajor:0,minFwMinor:0},PLATFORM_FLINT:{platforms:["flint"],minFwMajor:0,minFwMinor:0},PLATFORM_GABBRO:{platforms:["gabbro"],minFwMajor:0,minFwMinor:0},BW:{platforms:["aplite","diorite","flint"],minFwMajor:0,minFwMinor:0},COLOR:{platforms:["basalt","chalk","emery","gabbro"],minFwMajor:0,minFwMinor:0},COMPASS:{platforms:["aplite","basalt","chalk","emery","flint","gabbro"],minFwMajor:0,minFwMinor:0},MICROPHONE:{platforms:["basalt","chalk","diorite","emery","flint","gabbro"],minFwMajor:0,minFwMinor:0},SMARTSTRAP:{platforms:["basalt","chalk","diorite","emery"],minFwMajor:3,minFwMinor:4},SMARTSTRAP_POWER:{platforms:["basalt","chalk","emery"],minFwMajor:3,minFwMinor:4},HEALTH:{platforms:["basalt","chalk","diorite","emery","flint","gabbro"],minFwMajor:3,minFwMinor:10},RECT:{platforms:["aplite","basalt","diorite","emery","flint"],minFwMajor:0,minFwMinor:0},ROUND:{platforms:["chalk","gabbro"],minFwMajor:0,minFwMinor:0},DISPLAY_144x168:{platforms:["aplite","basalt","diorite","flint"],minFwMajor:0,minFwMinor:0},DISPLAY_180x180_ROUND:{platforms:["chalk"],minFwMajor:0,minFwMinor:0},DISPLAY_200x228:{platforms:["emery"],minFwMajor:0,minFwMinor:0},DISPLAY_260x260_ROUND:{platforms:["gabbro"],minFwMajor:0,minFwMinor:0}},e.exports.includesCapability=function(t,n){var r=/^NOT_/,i=[];if(!n||!n.length)return!0;for(var o=n.length-1;o>=0;o--){var a=n[o],u=e.exports.capabilityMap[a.replace(r,"")];!u||u.platforms.indexOf(t.platform)===-1||u.minFwMajor>t.firmware.major||u.minFwMajor===t.firmware.major&&u.minFwMinor>t.firmware.minor?i.push(!!a.match(r)):i.push(!a.match(r))}return i.indexOf(!1)===-1}},{}],8:[function(t,e,n){e.exports=function(){function t(t){return t.substr(0,3)}function e(t){return t!=ft?""+t:""}function n(t,e){return typeof t==e}function r(t){return n(t,"string")}function i(t){return!!t&&n(t,"object")}function o(t){return t&&t.nodeType}function a(t){return n(t,"number")}function u(t){return i(t)&&!!t.getDay}function s(t){return t===!0||t===!1}function c(t){var e=typeof t;return"object"==e?!(!t||!t.getDay):"string"==e||"number"==e||s(t)}function l(t){return t}function f(t,n,r){return e(t).replace(n,r!=ft?r:"")}function m(t){return f(t,/^\\s+|\\s+$/g)}function h(t,e,n){for(var r in t)t.hasOwnProperty(r)&&e.call(n||t,r,t[r]);return t}function p(t,e,n){if(t)for(var r=0;r<t.length;r++)e.call(n||t,t[r],r);return t}function d(t,e,n){var r=[],i=P(e)?e:function(t){return e!=t};return p(t,function(e,o){i.call(n||t,e,o)&&r.push(e)}),r}function g(t,e,n,r){var i=[];return t(e,function(t,o){B(t=n.call(r||e,t,o))?p(t,function(t){i.push(t)}):t!=ft&&i.push(t)}),i}function v(t){var e=0;return h(t,function(t){e++}),e}function y(t){var e=[];return h(t,function(t){e.push(t)}),e}function b(t,e,n){var r=[];return p(t,function(i,o){r.push(e.call(n||t,i,o))}),r}function w(t,e){var n={};return p(t,function(t,r){n[t]=e}),n}function $(t,e){var n=e||{};for(var r in t)n[r]=t[r];return n}function M(t,e){for(var n=e,r=0;r<t.length;r++)n=$(t[r],n);return n}function T(t){return P(t)?t:function(e,n){if(t===e)return n}}function F(t,e,n){return e==ft?n:e<0?Math.max(t.length+e,0):Math.min(t.length,e)}function E(t,e,n,r){for(var i,o=T(e),a=F(t,r,t.length),u=F(t,n,0);u<a;u++)if((i=o.call(t,t[u],u))!=ft)return i}function x(t,e,n){var r=[];if(t)for(var i=F(t,n,t.length),o=F(t,e,0);o<i;o++)r.push(t[o]);return r}function O(t){return b(t,l)}function A(t,e){var n,r=P(t)?t():t,i=P(e)?e():e;return r==i||r!=ft&&i!=ft&&(c(r)||c(i)?u(r)&&u(i)&&+r==+i:B(r)?r.length==i.length&&!E(r,function(t,e){if(!A(t,i[e]))return!0}):!B(i)&&(n=y(r)).length==v(i)&&!E(n,function(t){if(!A(r[t],i[t]))return!0}))}function j(t,e,n){if(P(t))return t.apply(n&&e,b(n||e,l))}function R(t,e,n){return b(t,function(t){return j(t,e,n)})}function L(t){return"\\\\u"+("0000"+t.charCodeAt(0).toString(16)).slice(-4)}function S(t){return f(t,/[\\x00-\\x1f\'"\\u2028\\u2029]/g,L)}function _(t,e){return t.split(e)}function C(t,e){if(dt[t])return dt[t];var n="with(_.isObject(obj)?obj:{}){"+b(_(t,/{{|}}}?/g),function(t,e){var n,r=m(t),i=f(r,/^{/),o=r==i?"esc(":"";return e%2?(n=/^each\\b(\\s+([\\w_]+(\\s*,\\s*[\\w_]+)?)\\s*:)?(.*)/.exec(i))?"each("+(m(n[4])?n[4]:"this")+", function("+n[2]+"){":(n=/^if\\b(.*)/.exec(i))?"if("+n[1]+"){":(n=/^else\\b\\s*(if\\b(.*))?/.exec(i))?"}else "+(n[1]?"if("+n[2]+")":"")+"{":(n=/^\\/(if)?/.exec(i))?n[1]?"}\\n":"});\\n":(n=/^(var\\s.*)/.exec(i))?n[1]+";":(n=/^#(.*)/.exec(i))?n[1]:(n=/(.*)::\\s*(.*)/.exec(i))?"print("+o+\'_.formatValue("\'+S(n[2])+\'",\'+(m(n[1])?n[1]:"this")+(o&&")")+"));\\n":"print("+o+(m(i)?i:"this")+(o&&")")+");\\n":t?\'print("\'+S(t)+\'");\\n\':void 0}).join("")+"}",r=new Function("obj","each","esc","print","_",n),i=function(t,n){var i=[];return r.call(n||t,t,function(t,e){B(t)?p(t,function(t,n){e.call(t,t,n)}):h(t,function(t,n){e.call(n,t,n)})},e||l,function(){j(i.push,i,arguments)},rt),i.join("")};return gt.push(i)>pt&&delete dt[gt.shift()],dt[t]=i}function I(t){return f(t,/[<>\'"&]/g,function(t){return"&#"+t.charCodeAt(0)+";"})}function N(t,e){return C(t,I)(e)}function D(t){return function(e,n,r){return t(this,e,n,r)}}function P(t){return"function"==typeof t&&!t.item}function B(t){return t&&t.length!=ft&&!r(t)&&!o(t)&&!P(t)&&t!==ot}function k(t){return parseFloat(f(t,/^[^\\d-]+/))}function H(t){return t[at]=t[at]||++ct}function q(t,e){var n,r=[],i={};return Q(t,function(t){Q(e(t),function(t){i[n=H(t)]||(r.push(t),i[n]=!0)})}),r}function U(t,e){var n={$position:"absolute",$visibility:"hidden",$display:"block",$height:ft},r=t.get(n),i=t.set(n).get("clientHeight");return t.set(r),i*e+"px"}function Y(t,n,i,o,a){return P(n)?this.on(ft,t,n,i,o):r(o)?this.on(t,n,i,ft,o):this.each(function(r,u){Q(t?X(t,r):r,function(t){Q(e(n).split(/\\s/),function(e){function n(e,n,r){var l=!a,f=a?r:t;if(a)for(var m=Z(a,t);f&&f!=t&&!(l=m(f));)f=f.parentNode;return!l||s!=e||i.apply(G(f),o||[n,u])&&"?"==c||"|"==c}function r(t){n(s,t,t.target)||(t.preventDefault(),t.stopPropagation())}var s=f(e,/[?|]/g),c=f(e,/[^?|]/g),m=("blur"==s||"focus"==s)&&!!a,h=ct++;t.addEventListener(s,r,m),t.M||(t.M={}),t.M[h]=n,i.M=g(Q,[i.M,function(){t.removeEventListener(s,r,m),delete t.M[h]}],l)})})})}function K(t){R(t.M),t.M=ft}function V(t){lt?lt.push(t):setTimeout(t,0)}function z(t,e,n){return X(t,e,n)[0]}function W(t,e,n){var r=G(document.createElement(t));return B(e)||e!=ft&&!i(e)?r.add(e):r.set(e).add(n)}function J(t){return g(Q,t,function(t){var e;return B(t)?J(t):o(t)?(e=t.cloneNode(!0),e.removeAttribute&&e.removeAttribute("id"),e):t})}function G(t,e,n){return P(t)?V(t):new nt(X(t,e,n))}function X(t,e,n){function i(t){return B(t)?g(Q,t,i):t}function a(t){return d(g(Q,t,i),function(t){for(var r=t;r=r.parentNode;)if(r==e[0]||n)return r==e[0]})}return e?1!=(e=X(e)).length?q(e,function(e){return X(t,e,n)}):r(t)?1!=o(e[0])?[]:n?a(e[0].querySelectorAll(t)):e[0].querySelectorAll(t):a(t):r(t)?document.querySelectorAll(t):g(Q,t,i)}function Z(t,e){function n(t,e){var n=RegExp("(^|\\\\s+)"+t+"(?=$|\\\\s)","i");return function(r){return!t||n.test(r[e])}}var i={},u=i;if(P(t))return t;if(a(t))return function(e,n){return n==t};if(!t||"*"==t||r(t)&&(u=/^([\\w-]*)\\.?([\\w-]*)$/.exec(t))){var s=n(u[1],"tagName"),c=n(u[2],"className");return function(t){return 1==o(t)&&s(t)&&c(t)}}return e?function(n){return G(t,e).find(n)!=ft}:(G(t).each(function(t){i[H(t)]=!0}),function(t){return i[H(t)]})}function Q(t,e){return B(t)?p(t,e):t!=ft&&e(t,0),t}function tt(){this.state=null,this.values=[],this.parent=null}function et(){var t=[],e=arguments,n=e.length,r=0,o=0,a=new tt;a.errHandled=function(){o++,a.parent&&a.parent.errHandled()};var u=a.fire=function(e,n){return null==a.state&&null!=e&&(a.state=!!e,a.values=B(n)?n:[n],setTimeout(function(){p(t,function(t){t()})},0)),a};p(e,function c(t,e){try{t.then?t.then(function(t){var o;(i(t)||P(t))&&P(o=t.then)?c(t,e):(a.values[e]=O(arguments),++r==n&&u(!0,n<2?a.values[e]:a.values))},function(t){a.values[e]=O(arguments),u(!1,n<2?a.values[e]:[a.values[e][0],a.values,e])}):t(function(){u(!0,O(arguments))},function(){u(!1,O(arguments))})}catch(o){u(!1,[o,a.values,e])}}),a.stop=function(){return p(e,function(t){t.stop&&t.stop()}),a.stop0&&j(a.stop0)};var s=a.then=function(e,n){var r=et(),u=function(){try{var t=a.state?e:n;P(t)?!function s(t){try{var e,n=0;if((i(t)||P(t))&&P(e=t.then)){if(t===r)throw new TypeError;e.call(t,function(t){n++||s(t)},function(t){n++||r.fire(!1,[t])}),r.stop0=t.stop}else r.fire(!0,[t])}catch(a){if(!n++&&(r.fire(!1,[a]),!o))throw a}}(j(t,it,a.values)):r.fire(a.state,a.values)}catch(u){if(r.fire(!1,[u]),!o)throw u}};return P(n)&&a.errHandled(),r.stop0=a.stop,r.parent=a,null!=a.state?setTimeout(u,0):t.push(u),r};return a.always=function(t){return s(t,t)},a.error=function(t){return s(0,t)},a}function nt(t,e){var n=this,r=0;if(t)for(var i=0,o=t.length;i<o;i++){var a=t[i];if(e&&B(a))for(var u=0,s=a.length;u<s;u++)n[r++]=a[u];else n[r++]=a}else n[r++]=e;n.length=r,n._=!0}function rt(){return new nt(arguments,(!0))}var it,ot=window,at="Nia",ut={},st={},ct=1,lt=/^[ic]/.test(document.readyState)?ft:[],ft=null,mt=_("January,February,March,April,May,June,July,August,September,October,November,December",/,/g),ht=(b(mt,t),_("Sunday,Monday,Tuesday,Wednesday,Thursday,Friday,Saturday",/,/g)),pt=(b(ht,t),_("am,pm",/,/g),_("am,am,am,am,am,am,am,am,am,am,am,am,pm,pm,pm,pm,pm,pm,pm,pm,pm,pm,pm,pm",/,/g),99),dt={},gt=[];return $({each:D(p),equals:D(A),find:D(E),dummySort:0,select:function(t,e){return G(t,this,e)},get:function(t,e){var n=this,i=n[0];if(i){if(r(t)){var o,a=/^(\\W*)(.*)/.exec(f(t,/^%/,"@data-")),u=a[1];return o=st[u]?st[u](this,a[2]):"$"==t?n.get("className"):"$$"==t?n.get("@style"):"$$slide"==t?n.get("$height"):"$$fade"==t||"$$show"==t?"hidden"==n.get("$visibility")||"none"==n.get("$display")?0:"$$fade"==t?isNaN(n.get("$opacity",!0))?1:n.get("$opacity",!0):1:"$"==u?ot.getComputedStyle(i,ft).getPropertyValue(f(a[2],/[A-Z]/g,function(t){return"-"+t.toLowerCase()})):"@"==u?i.getAttribute(a[2]):i[a[2]],e?k(o):o}var s={};return(B(t)?Q:h)(t,function(t){s[t]=n.get(t,e)}),s}},set:function(t,e){var n=this;if(e!==it){var i=/^(\\W*)(.*)/.exec(f(f(t,/^\\$float$/,"cssFloat"),/^%/,"@data-")),o=i[1];ut[o]?ut[o](this,i[2],e):"$$fade"==t?this.set({$visibility:e?"visible":"hidden",$opacity:e}):"$$slide"==t?n.set({$visibility:e?"visible":"hidden",$overflow:"hidden",$height:/px/.test(e)?e:function(t,n,r){return U(G(r),e)}}):"$$show"==t?e?n.set({$visibility:e?"visible":"hidden",$display:""}).set({$display:function(t){return"none"==t?"block":t}}):n.set({$display:"none"}):"$$"==t?n.set("@style",e):Q(this,function(n,r){var a=P(e)?e(G(n).get(t),r,n):e;"$"==o?i[2]?n.style[i[2]]=a:Q(a&&a.split(/\\s+/),function(t){var e=f(t,/^[+-]/);/^\\+/.test(t)?n.classList.add(e):/^-/.test(t)?n.classList.remove(e):n.classList.toggle(e)}):"$$scrollX"==t?n.scroll(a,G(n).get("$$scrollY")):"$$scrollY"==t?n.scroll(G(n).get("$$scrollX"),a):"@"==o?a==ft?n.removeAttribute(i[2]):n.setAttribute(i[2],a):n[i[2]]=a})}else r(t)||P(t)?n.set("$",t):h(t,function(t,e){n.set(t,e)});return n},add:function(t,e){return this.each(function(n,r){function i(t){if(B(t))Q(t,i);else if(P(t))i(t(n,r));else if(t!=ft){var u=o(t)?t:document.createTextNode(t);a?a.parentNode.insertBefore(u,a.nextSibling):e?e(u,n,n.parentNode):n.appendChild(u),a=u}}var a;i(r&&!P(t)?J(t):t)})},on:Y,trigger:function(t,e){return this.each(function(n,r){for(var i=!0,o=n;o&&i;)h(o.M,function(r,o){i=i&&o(t,e,n)}),o=o.parentNode})},ht:function(t,e){var n=arguments.length>2?M(x(arguments,1)):e;return this.set("innerHTML",P(t)?t(n):/{{/.test(t)?N(t,n):/^#\\S+$/.test(t)?N(z(t).text,n):t)}},nt.prototype),$({request:function(t,n,r,i){var o,a=i||{},u=0,s=et(),c=r&&r.constructor==a.constructor;try{s.xhr=o=new XMLHttpRequest,s.stop0=function(){o.abort()},c&&(r=g(h,r,function(t,e){return g(Q,e,function(e){return encodeURIComponent(t)+(e!=ft?"="+encodeURIComponent(e):"")})}).join("&")),r==ft||/post/i.test(t)||(n+="?"+r,r=ft),o.open(t,n,!0,a.user,a.pass),c&&/post/i.test(t)&&o.setRequestHeader("Content-Type","application/x-www-form-urlencoded"),h(a.headers,function(t,e){o.setRequestHeader(t,e)}),h(a.xhr,function(t,e){o[t]=e}),o.onreadystatechange=function(){4!=o.readyState||u++||(o.status>=200&&o.status<300?s.fire(!0,[o.responseText,o]):s.fire(!1,[o.status,o.responseText,o]))},o.send(r)}catch(l){u||s.fire(!1,[0,ft,e(l)])}return s},ready:V,off:K,wait:function(t,e){var n=et(),r=setTimeout(function(){n.fire(!0,e)},t);return n.stop0=function(){n.fire(!1),clearTimeout(r)},n}},G),$({each:p,toObject:w,find:E,equals:A,copyObj:$,extend:function(t){return M(x(arguments,1),t)},eachObj:h,isObject:i,format:function(t,e,n){return C(t,n)(e)},template:C,formatHtml:N,promise:et},rt),document.addEventListener("DOMContentLoaded",function(){R(lt),lt=ft},!1),{HTML:function(){var t=W("div");return rt(j(t.ht,t,arguments)[0].childNodes)},_:rt,$:G,$$:z,M:nt,getter:st,setter:ut}}()},{}]},{},[1])</script></body></html>';
	},{}],37:[function(t,e,n){e.exports=".section .component-input {\n  padding: 0;\n}\n.component-input label {\n  display: block;\n}\n.component-input .label {\n  padding-bottom: 0.7rem;\n}\n.component-input .input {\n  position: relative;\n  min-width: 100%;\n  margin-top: 0.7rem;\n  margin-left: 0;\n}\n.component-input input {\n  display: block;\n  width: 100%;\n  background: #333333;\n  border-radius: 0.25rem;\n  padding: 0.35rem 0.375rem;\n  border: none;\n  vertical-align: baseline;\n  color: #ffffff;\n  font-size: inherit;\n  -webkit-appearance: none;\n  appearance: none;\n  min-height: 2.1rem;\n}\n.component-input input::-webkit-input-placeholder {\n  color: #858585;\n}\n.component-input input::-moz-placeholder {\n  color: #858585;\n}\n.component-input input:-moz-placeholder {\n  color: #858585;\n}\n.component-input input:-ms-input-placeholder {\n  color: #858585;\n}\n.component-input input:focus::-webkit-input-placeholder {\n  color: #666666;\n}\n.component-input input:focus::-moz-placeholder {\n  color: #666666;\n}\n.component-input input:focus:-moz-placeholder {\n  color: #666666;\n}\n.component-input input:focus:-ms-input-placeholder {\n  color: #666666;\n}\n.component-input input:focus {\n  border: none;\n  box-shadow: none;\n}\n/*# sourceMappingURL=input.css.map */\n"},{}],38:[function(t,e,n){e.exports='.component-radio {\n  display: block;\n}\n.section .component-radio {\n  padding-right: 0.375rem;\n}\n.component-radio > .label {\n  display: block;\n  padding-bottom: 0.35rem;\n}\n.component-radio .radio-group {\n  padding-bottom: 0.35rem;\n}\n.component-radio .radio-group label {\n  padding: 0.35rem 0.375rem;\n}\n.component-radio .radio-group .label {\n  font-size: 0.9em;\n}\n.component-radio .radio-group input {\n  opacity: 0;\n  position: absolute;\n}\n.component-radio .radio-group i {\n  display: block;\n  position: relative;\n  border-radius: 1.4rem;\n  width: 1.4rem;\n  height: 1.4rem;\n  border: 2px solid #767676;\n  -webkit-flex-shrink: 0;\n  flex-shrink: 0;\n}\n.component-radio .radio-group input:checked + i {\n  border-color: #ff4700;\n}\n.component-radio .radio-group input:checked + i:after {\n  content: "";\n  display: block;\n  position: absolute;\n  left: 15%;\n  right: 15%;\n  top: 15%;\n  bottom: 15%;\n  border-radius: 1.4rem;\n  background: #ff4700;\n}\n.component-radio .description {\n  padding-left: 0;\n  padding-right: 0;\n}\n/*# sourceMappingURL=radiogroup.css.map */\n'},{}],39:[function(t,e,n){e.exports='.section .component-select {\n  padding: 0;\n}\n.component-select label {\n  position: relative;\n}\n.component-select .value {\n  position: relative;\n  padding-right: 1.1rem;\n  display: block;\n}\n.component-select .value:after {\n  content: "";\n  position: absolute;\n  right: 0;\n  top: 50%;\n  margin-top: -0.1rem;\n  height: 0;\n  width: 0;\n  border-left: 0.425rem solid transparent;\n  border-right: 0.425rem solid transparent;\n  border-top: 0.425rem solid #ff4700;\n}\n.component-select select {\n  opacity: 0;\n  position: absolute;\n  display: block;\n  left: 0;\n  right: 0;\n  top: 0;\n  bottom: 0;\n  width: 100%;\n  border: none;\n  margin: 0;\n  padding: 0;\n}\n/*# sourceMappingURL=select.css.map */\n'},{}],40:[function(t,e,n){e.exports='.section .component-slider {\n  padding: 0;\n}\n.component-slider label {\n  display: block;\n}\n.component-slider .label-container {\n  display: -webkit-box;\n  display: -webkit-flex;\n  display: flex;\n  -webkit-box-align: center;\n  -webkit-align-items: center;\n  align-items: center;\n  width: 100%;\n  padding-bottom: 0.7rem;\n}\n.component-slider .label {\n  -webkit-box-flex: 1;\n  -webkit-flex: 1;\n  flex: 1;\n  min-width: 1rem;\n  display: block;\n  padding-right: 0.75rem;\n}\n.component-slider .value-wrap {\n  display: block;\n  position: relative;\n}\n.component-slider .value,\n.component-slider .value-pad {\n  display: block;\n  background: #333333;\n  border-radius: 0.25rem;\n  padding: 0.35rem 0.375rem;\n  border: none;\n  vertical-align: baseline;\n  color: #ffffff;\n  text-align: right;\n  margin: 0;\n  min-width: 1rem;\n}\n.component-slider .value-pad {\n  visibility: hidden;\n}\n.component-slider .value-pad:before {\n  content: " ";\n  display: inline-block;\n}\n.component-slider .value {\n  max-width: 100%;\n  position: absolute;\n  left: 0;\n  top: 0;\n}\n.component-slider .input-wrap {\n  padding: 0 0.75rem 0.7rem;\n}\n.component-slider .input {\n  display: block;\n  position: relative;\n  min-width: 100%;\n  height: 1.4rem;\n  overflow: hidden;\n  margin-left: 0;\n}\n.component-slider .input:before {\n  content: "";\n  display: block;\n  position: absolute;\n  height: 0.1764705882rem;\n  background: #666666;\n  width: 100%;\n  top: 0.6117647059rem;\n}\n.component-slider .input .slider {\n  display: block;\n  width: 100%;\n  -webkit-appearance: none;\n  appearance: none;\n  position: relative;\n  height: 1.4rem;\n  margin: 0;\n  background-color: transparent;\n}\n.component-slider .input .slider:focus {\n  outline: none;\n}\n.component-slider .input .slider::-webkit-slider-runnable-track {\n  border: none;\n  height: 1.4rem;\n  width: 100%;\n  background-color: transparent;\n}\n.component-slider .input .slider::-webkit-slider-thumb {\n  -webkit-appearance: none;\n  appearance: none;\n  position: relative;\n  height: 1.4rem;\n  width: 1.4rem;\n  background-color: #ff4700;\n  border-radius: 50%;\n}\n.component-slider .input .slider::-webkit-slider-thumb:before {\n  content: "";\n  position: absolute;\n  left: -1000px;\n  top: 0.6117647059rem;\n  height: 0.1764705882rem;\n  width: 1001px;\n  background: #ff4700;\n}\n/*# sourceMappingURL=slider.css.map */\n'},{}],41:[function(t,e,n){e.exports=".component-submit {\n  text-align: center;\n}\n/*# sourceMappingURL=submit.css.map */\n"},{}],42:[function(t,e,n){e.exports=".section .component-toggle {\n  padding: 0;\n}\n.component-toggle input {\n  display: none;\n}\n.component-toggle .graphic {\n  display: inline-block;\n  position: relative;\n}\n.component-toggle .graphic .slide {\n  display: block;\n  border-radius: 1.05rem;\n  height: 1.05rem;\n  width: 2.2652rem;\n  background: #2f2f2f;\n  -webkit-transition: background-color 150ms linear;\n  transition: background-color 150ms linear;\n}\n.component-toggle .graphic .marker {\n  background: #ececec;\n  width: 1.4rem;\n  height: 1.4rem;\n  border-radius: 1.4rem;\n  position: absolute;\n  left: 0;\n  display: block;\n  top: -0.175rem;\n  -webkit-transition: -webkit-transform 150ms linear;\n  transition: -webkit-transform 150ms linear;\n  transition: transform 150ms linear;\n  transition: transform 150ms linear, -webkit-transform 150ms linear;\n  box-shadow: 0 0.1rem 0.1rem #2f2f2f;\n}\n.component-toggle input:checked + .graphic .slide {\n  background: #993d19;\n}\n.component-toggle input:checked + .graphic .marker {\n  background: #ff4700;\n  -webkit-transform: translateX(0.8652rem);\n  transform: translateX(0.8652rem);\n}\n/*# sourceMappingURL=toggle.css.map */\n"},{}],"@rebble/clay":[function(t,e,n){"use strict";function r(t,e,n){function r(){i.meta={activeWatchInfo:Pebble.getActiveWatchInfo&&Pebble.getActiveWatchInfo(),accountToken:Pebble.getAccountToken(),watchToken:Pebble.getWatchToken(),userData:s(n.userData||{})}}function o(t,e,n){Array.isArray(t)?t.forEach(function(t){o(t,e,n)}):"section"===t.type?o(t.items,e,n):e(t)&&n(t)}var i=this;if(!Array.isArray(t))throw new Error("config must be an Array");if(e&&"function"!=typeof e)throw new Error('customFn must be a function or "null"');n=n||{},i.config=s(t),i.customFn=e||function(){},i.components={},i.meta={activeWatchInfo:null,accountToken:"",watchToken:"",userData:{}},i.version=c,n.autoHandleEvents!==!1&&"undefined"!=typeof Pebble?(Pebble.addEventListener("showConfiguration",function(){r(),Pebble.openURL(i.generateUrl())}),Pebble.addEventListener("webviewclosed",function(t){t&&t.response&&Pebble.sendAppMessage(i.getSettings(t.response),function(){console.log("Sent config data to Pebble")},function(t){console.log("Failed to send config data!"),console.log(JSON.stringify(t))})})):"undefined"!=typeof Pebble&&Pebble.addEventListener("ready",function(){r()}),o(i.config,function(t){return a[t.type]},function(t){i.registerComponent(a[t.type])}),o(i.config,function(t){return t.appKey},function(){throw new Error("appKeys are no longer supported. Please follow the migration guide to upgrade your project")})}var o=t("./tmp/config-page.html"),i=t("tosource"),a=t("./src/scripts/components"),s=t("deepcopy/build/deepcopy.min"),c=t("./package.json").version,u=t("message_keys");r.prototype.registerComponent=function(t){this.components[t.name]=t},r.prototype.generateUrl=function(){var t={},e=!Pebble||"pypkjs"===Pebble.platform,n=e?"$$$RETURN_TO$$$":"pebblejs://close#";try{t=JSON.parse(localStorage.getItem("clay-settings"))||{}}catch(a){console.error(a.toString())}var s=o.replace("$$RETURN_TO$$",n).replace("$$CUSTOM_FN$$",i(this.customFn)).replace("$$CONFIG$$",i(this.config)).replace("$$SETTINGS$$",i(t)).replace("$$COMPONENTS$$",i(this.components)).replace("$$META$$",i(this.meta));return e?r.encodeDataUri(s,"http://clay.pebble.com.s3-website-us-west-2.amazonaws.com/#"):r.encodeDataUri(s)},r.prototype.getSettings=function(t,e){var n={};t=t.match(/^\{/)?t:decodeURIComponent(t);try{n=JSON.parse(t)}catch(o){throw new Error("The provided response was not valid JSON")}var i={};return Object.keys(n).forEach(function(t){"object"==typeof n[t]&&n[t]?i[t]=n[t].value:i[t]=n[t]}),localStorage.setItem("clay-settings",JSON.stringify(i)),e===!1?n:r.prepareSettingsForAppMessage(n)},r.prototype.setSettings=function(t,e){var n={};try{n=JSON.parse(localStorage.getItem("clay-settings"))||{}}catch(r){console.error(r.toString())}if("object"==typeof t){var o=t;Object.keys(o).forEach(function(t){n[t]=o[t]})}else n[t]=e;localStorage.setItem("clay-settings",JSON.stringify(n))},r.encodeDataUri=function(t,e){return e="undefined"!=typeof e?e:"data:text/html;charset=utf-8,",e+encodeURIComponent(t)},r.prepareForAppMessage=function(t){function e(t,e){return Math.floor(t*Math.pow(10,e||0))}var n;return Array.isArray(t)?(n=[],t.forEach(function(t,e){n[e]=r.prepareForAppMessage(t)})):n="object"==typeof t&&t?"number"==typeof t.value?e(t.value,t.precision):Array.isArray(t.value)?t.value.map(function(n){return"number"==typeof n?e(n,t.precision):n}):r.prepareForAppMessage(t.value):"boolean"==typeof t?t?1:0:t,n},r.prepareSettingsForAppMessage=function(t){var e={};Object.keys(t).forEach(function(n){var r=t[n],o=n.match(/(.+?)(?:\[(\d*)\])?$/);if(!o[2])return void(e[n]=r);var i=parseInt(o[2],10);n=o[1],"undefined"==typeof e[n]&&(e[n]=[]),e[n][i]=r});var n={};return Object.keys(e).forEach(function(t){var o=u[t],i=r.prepareForAppMessage(e[t]);i=Array.isArray(i)?i:[i],i.forEach(function(t,e){n[o+e]=t})}),Object.keys(n).forEach(function(t){if(Array.isArray(n[t]))throw new Error('Clay does not support 2 dimensional arrays for item values. Make sure you are not attempting to use array syntax (eg: "myMessageKey[2]") in the messageKey for components that return an array, such as a checkboxgroup')}),n},e.exports=r},{"./package.json":7,"./src/scripts/components":13,"./tmp/config-page.html":36,"deepcopy/build/deepcopy.min":3,message_keys:void 0,tosource:6}]},{},["@rebble/clay"])("@rebble/clay")});
	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(4)))

/***/ }),
/* 4 */
/***/ (function(module, exports, __webpack_require__) {

	/**
	 * Copyright 2024 Google LLC
	 *
	 * Licensed under the Apache License, Version 2.0 (the "License");
	 * you may not use this file except in compliance with the License.
	 * You may obtain a copy of the License at
	 *
	 *     http://www.apache.org/licenses/LICENSE-2.0
	 *
	 * Unless required by applicable law or agreed to in writing, software
	 * distributed under the License is distributed on an "AS IS" BASIS,
	 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
	 * See the License for the specific language governing permissions and
	 * limitations under the License.
	 */
	
	module.exports = function(module) {
	    switch(module) {
	        case "message_keys": return __webpack_require__(5);
	    }
	    throw new Error('Module not found: ' + module);
	};


/***/ }),
/* 5 */
/***/ (function(module, exports) {

	module.exports = {"ApiKey":10011,"ApiMode":10021,"ApprovalCancel":10076,"ApprovalDecision":10075,"ApprovalDetail":10074,"ApprovalId":10072,"ApprovalRequest":10071,"ApprovalTitle":10073,"BackgroundColor":10049,"BoldTextColor":10051,"BuzzStrength":10026,"ChatReset":10031,"ConfigAction":10033,"Endpoint":10010,"FontSize":10024,"GeolocationToolEnabled":10018,"HealthAverageScope":10059,"HealthEndUnix":10057,"HealthQueryMask":10058,"HealthSessionOffset":10060,"HealthStartUnix":10056,"HealthSummaryError":10055,"HealthSummaryJson":10054,"HealthSummaryRequest":10053,"HealthToolEnabled":10052,"MaxOutputTokens":10022,"MaxToolCalls":10020,"McpDiscoveryTimeoutMs":10078,"McpServersJson":10025,"MemoriesJson":10064,"Model":10012,"PastChatDelete":10041,"PastChatDeleted":10042,"PastChatLoad":10040,"PastChatTextChunk":10044,"PastChatTextDone":10045,"PastChatTextReset":10043,"PastChatsDone":10038,"PastChatsError":10039,"PastChatsItemId":10036,"PastChatsItemTitle":10037,"PastChatsRequest":10034,"PastChatsReset":10035,"PebbleMemoryToolEnabled":10063,"PluginActionsJson":10070,"PluginSourcesJson":10069,"PreserveChats":10032,"ProgressAppend":10009,"ProgressDetail":10027,"ProgressHistory":10028,"ProgressInputContextSize":10029,"ProgressOutputContextSize":10030,"ProgressReset":10008,"ProgressText":10007,"PromptBackgroundColor":10050,"ReasoningEffort":10023,"RequestCancel":10066,"RequestId":10000,"RequestRetry":10067,"RequestText":10001,"RequestTimeoutMs":10062,"ResponseChunk":10002,"ResponseChunkIndex":10003,"ResponseDone":10004,"ResponseError":10005,"ResponseReset":10006,"RetryAvailable":10068,"ScrollLines":10047,"ShowInputContextSize":10015,"ShowOutputContextSize":10016,"ShowThinking":10014,"SleepToolEnabled":10077,"SpeakerFeedbackEnabled":10065,"StartDictationQuickLaunch":10046,"SystemPrompt":10013,"TextColor":10048,"TimelineToolEnabled":10019,"TouchScrollEnabled":10061,"WebSearchEnabled":10017}

/***/ }),
/* 6 */
/***/ (function(module, exports) {

	module.exports = [
	  {
	    "type": "heading",
	    "defaultValue": "LLM Thing"
	  },
	  {
	    "type": "text",
	    "defaultValue": "Configure the OpenAI-compatible endpoint used by the phone. Built-in and MCP tools are called by the phone, so endpoints do not need native tool support."
	  },
	  {
	    "type": "section",
	    "items": [
	      {
	        "type": "heading",
	        "defaultValue": "Endpoint"
	      },
	      {
	        "type": "input",
	        "messageKey": "Endpoint",
	        "label": "Endpoint URL",
	        "defaultValue": "https://api.openai.com/v1/responses",
	        "attributes": {
	          "type": "url",
	          "placeholder": "https://api.openai.com/v1/responses"
	        }
	      },
	      {
	        "type": "input",
	        "messageKey": "ApiKey",
	        "label": "API Key",
	        "defaultValue": "",
	        "attributes": {
	          "type": "password",
	          "placeholder": "sk-..."
	        }
	      },
	      {
	        "type": "model_selector",
	        "messageKey": "Model",
	        "label": "Model",
	        "defaultValue": "gpt-4.1-mini",
	        "placeholder": "gpt-4.1-mini",
	        "description": "Enter a model manually or choose a cached model. Save & Refresh Models saves settings, closes this page, and refreshes the list; reopen settings to choose updated models."
	      },
	      {
	        "type": "select",
	        "messageKey": "ApiMode",
	        "label": "API Mode",
	        "description": "Auto infers the protocol from the configured endpoint suffix and, on exact HTTP 500, rotates across known protocol endpoints, remembering what works per provider and model. An explicit mode pins one protocol and disables rotation.",
	        "defaultValue": "auto",
	        "options": [
	          {
	            "label": "Auto (detect from endpoint)",
	            "value": "auto"
	          },
	          {
	            "label": "Responses",
	            "value": "responses"
	          },
	          {
	            "label": "Chat Completions",
	            "value": "chat-completions"
	          },
	          {
	            "label": "Messages",
	            "value": "messages"
	          }
	        ]
	      },
	      {
	        "type": "input",
	        "messageKey": "MaxOutputTokens",
	        "label": "Max Output Tokens",
	        "description": "0 lets the model choose. >0 caps output length; may affect reasoning depth, keep 0 when reasoning matter.",
	        "defaultValue": 0,
	        "attributes": {
	          "type": "number",
	          "min": 0,
	          "max": 100000,
	          "step": 128
	        }
	      },
	      {
	        "type": "select",
	        "messageKey": "ReasoningEffort",
	        "label": "Reasoning Effort",
	        "defaultValue": "",
	        "options": [
	          {
	            "label": "Off (provider default)",
	            "value": ""
	          },
	          {
	            "label": "None",
	            "value": "none"
	          },
	          {
	            "label": "Minimal",
	            "value": "minimal"
	          },
	          {
	            "label": "Low",
	            "value": "low"
	          },
	          {
	            "label": "Medium",
	            "value": "medium"
	          },
	          {
	            "label": "High",
	            "value": "high"
	          }
	        ]
	      },
	      {
	        "type": "input",
	        "messageKey": "RequestTimeoutMs",
	        "label": "Request Timeout (ms)",
	        "description": "Maximum wait for each model API request. Tool requests use their own timeouts.",
	        "defaultValue": 60000,
	        "attributes": {
	          "type": "number",
	          "min": 1000,
	          "step": 1000
	        }
	      }
	    ]
	  },
	  {
	    "type": "section",
	    "items": [
	      {
	        "type": "heading",
	        "defaultValue": "Prompt"
	      },
	      {
	        "type": "input",
	        "messageKey": "SystemPrompt",
	        "label": "System Prompt <button type=\"button\" aria-label=\"System prompt help\" title=\"System prompt help\" onclick=\"event.preventDefault(); event.stopPropagation(); alert('Use $DATETIME to insert the phone current date and time. Watch display currently supports bold Markdown only; italics and strikethrough are not rendered.'); return false;\" style=\"appearance:none;-webkit-appearance:none;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;vertical-align:middle;width:20px;min-width:20px;max-width:20px;height:20px;min-height:20px;max-height:20px;margin:0 0 2px 6px;border:1px solid #6b7788;border-radius:999px;background:linear-gradient(#ffffff,#e8edf4);color:#263241;font-size:12px;font-weight:700;line-height:20px;text-align:center;padding:0;box-shadow:0 1px 2px rgba(15,23,42,.18);\">?</button>",
	        "defaultValue": "The current date-time is $DATETIME. You are a helpful assistant. Keep answers concise for a watch screen. Format your responses in markdown, but only use bold text and lists.",
	        "description": "Use $DATETIME to insert the phone current date and time. Watch display supports bold Markdown only.",
	        "attributes": {
	          "placeholder": "System prompt, e.g. Today is $DATETIME."
	        }
	      },
	      {
	        "type": "toggle",
	        "messageKey": "ShowThinking",
	        "label": "Show Thinking",
	        "description": "Responses API requests reasoning summaries. Chat completions show provider-visible reasoning fields or <think> blocks only.",
	        "defaultValue": false
	      },
	      {
	        "type": "toggle",
	        "messageKey": "ShowInputContextSize",
	        "label": "Show Input Context Size",
	        "description": "Show returned input token count in the thinking screen top-left corner.",
	        "defaultValue": false
	      },
	      {
	        "type": "toggle",
	        "messageKey": "ShowOutputContextSize",
	        "label": "Show Output Context Size",
	        "description": "Show returned output token count in the thinking screen top-right corner.",
	        "defaultValue": false
	      },
	      {
	        "type": "toggle",
	        "messageKey": "PreserveChats",
	        "label": "Preserve Chats",
	        "description": "Save chats on the phone. When enabled, press DOWN on the app home screen to resume or delete saved chats.",
	        "defaultValue": false
	      },
	      {
	        "type": "button",
	        "id": "DeleteAllPastChats",
	        "defaultValue": "Delete All Past Chats",
	        "description": "Deletes saved chats from the phone. Turning Preserve Chats off does not delete saved chats."
	      },
	      {
	        "type": "input",
	        "id": "ConfigActionInput",
	        "messageKey": "ConfigAction",
	        "defaultValue": "",
	        "attributes": {
	          "type": "hidden"
	        }
	      },
	      {
	        "type": "builtin_tools",
	        "id": "BuiltinTools",
	        "defaultValue": ""
	      },
	      {
	        "type": "toggle",
	        "messageKey": "WebSearchEnabled",
	        "label": "Web Fetch",
	        "description": "Allow the model to fetch HTTP(S) pages and read them in bounded Markdown chunks.",
	        "defaultValue": false
	      },
	      {
	        "type": "toggle",
	        "messageKey": "GeolocationToolEnabled",
	        "label": "Geolocation Tool",
	        "description": "Allow the model to request the phone's current location.",
	        "defaultValue": false
	      },
	      {
	        "type": "toggle",
	        "messageKey": "TimelineToolEnabled",
	        "label": "Timeline Pins Tool",
	        "description": "Allow the model to create, update, and delete this app's Pebble timeline pins.",
	        "defaultValue": false
	      },
	      {
	        "type": "toggle",
	        "messageKey": "HealthToolEnabled",
	        "label": "Health Info",
	        "description": "Allow the model to query relevant Pebble Health statistics and activity sessions from the watch.",
	        "defaultValue": false
	      },
	      {
	        "type": "toggle",
	        "messageKey": "SleepToolEnabled",
	        "label": "Sleep Tool",
	        "description": "Allow the model to wait a requested number of milliseconds, up to 60 seconds per call, before continuing.",
	        "defaultValue": false
	      },
	      {
	        "type": "toggle",
	        "messageKey": "PebbleMemoryToolEnabled",
	        "label": "Pebble Memory",
	        "description": "Allow the model to save, search, and delete short intentional notes stored on this phone.",
	        "defaultValue": false
	      },
	      {
	        "type": "input",
	        "messageKey": "MaxToolCalls",
	        "label": "Max Tool Calls",
	        "description": "Maximum phone-side tool calls per request, up to 16. Use 0 to disable all tools.",
	        "defaultValue": 4,
	        "attributes": {
	          "type": "number",
	          "min": 0,
	          "max": 16,
	          "step": 1
	        }
	      }
	    ]
	  },
	  {
	    "type": "section",
	    "items": [
	      {
	        "type": "heading",
	        "defaultValue": "Watch Display"
	      },
	      {
	        "type": "select",
	        "messageKey": "FontSize",
	        "label": "Font Size",
	        "defaultValue": "18",
	        "options": [
	          {
	            "label": "Small",
	            "value": "14"
	          },
	          {
	            "label": "Normal",
	            "value": "18"
	          },
	          {
	            "label": "Large",
	            "value": "24"
	          },
	          {
	            "label": "Huge",
	            "value": "28"
	          }
	        ]
	      },
	      {
	        "type": "select",
	        "messageKey": "BuzzStrength",
	        "label": "Response Buzz",
	        "defaultValue": "1",
	        "options": [
	          {
	            "label": "Off",
	            "value": "0"
	          },
	          {
	            "label": "Light",
	            "value": "1"
	          },
	          {
	            "label": "Medium",
	            "value": "2"
	          },
	          {
	            "label": "Strong",
	            "value": "3"
	          }
	        ]
	      },
	      {
	        "type": "toggle",
	        "messageKey": "SpeakerFeedbackEnabled",
	        "label": "Response Sound",
	        "description": "Play Herdr's completion sound on speaker-equipped watches. Quiet Time and system mute suppress playback.",
	        "defaultValue": false
	      },
	      {
	        "type": "input",
	        "messageKey": "ScrollLines",
	        "label": "Scroll Lines",
	        "description": "Lines moved per UP/DOWN click.",
	        "defaultValue": 3,
	        "attributes": {
	          "type": "number",
	          "min": 1,
	          "max": 10,
	          "step": 1
	        }
	      },
	      {
	        "type": "toggle",
	        "messageKey": "TouchScrollEnabled",
	        "label": "Touch Scroll",
	        "description": "Enable drag and momentum scrolling on touchscreen watches.",
	        "defaultValue": true
	      },
	      {
	        "type": "color",
	        "messageKey": "TextColor",
	        "label": "Text Color",
	        "defaultValue": 0
	      },
	      {
	        "type": "color",
	        "messageKey": "BackgroundColor",
	        "label": "Background Color",
	        "defaultValue": 16777215
	      },
	      {
	        "type": "color",
	        "messageKey": "PromptBackgroundColor",
	        "label": "Prompt Background Color",
	        "defaultValue": 11184810
	      },
	      {
	        "type": "color",
	        "messageKey": "BoldTextColor",
	        "label": "Bold Text Color",
	        "defaultValue": 0
	      },
	      {
	        "type": "toggle",
	        "messageKey": "StartDictationQuickLaunch",
	        "label": "Start in Dictation when Quick Launched",
	        "description": "Open dictation automatically when the app is launched from Quick Launch.",
	        "defaultValue": false
	      },
	      {
	        "type": "button",
	        "id": "ResetWatchDisplay",
	        "defaultValue": "Reset Watch Display Defaults",
	        "description": "Restore all Watch Display options to their defaults."
	      }
	    ]
	  },
	  {
	    "type": "section",
	    "items": [
	      {
	        "type": "heading",
	        "defaultValue": "Settings Backup"
	      },
	      {
	        "type": "settings_io",
	        "id": "SettingsIo",
	        "defaultValue": ""
	      }
	    ]
	  },
	  {
	    "type": "section",
	    "items": [
	      {
	        "type": "mcp_servers",
	        "messageKey": "McpServersJson",
	        "defaultValue": "[]"
	      },
	      {
	        "type": "input",
	        "messageKey": "McpDiscoveryTimeoutMs",
	        "label": "MCP Discovery Timeout (ms)",
	        "description": "Chat starts with tools discovered within this foreground wait. Does not change MCP warmup or MCP tool-call timeouts.",
	        "defaultValue": 3000,
	        "attributes": {
	          "type": "number",
	          "min": 1000,
	          "max": 30000,
	          "step": 1
	        }
	      },
	      {
	        "type": "plugin_sources",
	        "messageKey": "PluginSourcesJson",
	        "defaultValue": "[]"
	      },
	      {
	        "type": "plugin_actions",
	        "messageKey": "PluginActionsJson",
	        "defaultValue": "[]"
	      },
	      {
	        "type": "memory_manager",
	        "messageKey": "MemoriesJson",
	        "defaultValue": "[]"
	      }
	    ]
	  },
	  {
	    "type": "submit",
	    "defaultValue": "Save Settings"
	  }
	];


/***/ }),
/* 7 */
/***/ (function(module, exports) {

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


/***/ }),
/* 8 */
/***/ (function(module, exports) {

	module.exports = {
	  name: 'settings_io',
	  template: '<div class="component component-settings-io"><p class="settings-io-help">Copy settings as JSON for backup, or paste a backup to restore values. API keys, MCP credentials, and Pebble Memory notes are not exported. Endpoint URLs are exported as entered. Review imported values, then tap Save Settings.</p><textarea class="settings-io-textarea" data-settings-json rows="8" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Backup JSON" placeholder="Settings JSON"></textarea><div class="settings-io-actions"><button type="button" class="settings-io-button" data-settings-export>Export &amp; Copy</button><button type="button" class="settings-io-button" data-settings-import>Import JSON</button></div><p class="settings-io-status" data-settings-status role="status" aria-live="polite"></p><input data-manipulator-target type="hidden" /></div>',
	  style: '.component-settings-io{padding:.9rem 1rem}.component-settings-io .settings-io-help{margin:.1rem 0 .7rem;color:#aeb9c7;font-size:.82rem;line-height:1.45}.component-settings-io .settings-io-textarea{display:block;box-sizing:border-box;width:100%;min-height:9rem;padding:.6rem .65rem;background:#0f1822;border:1px solid #405064;border-radius:.45rem;color:#f5f7fa;font:inherit;font-family:monospace;font-size:.8rem;line-height:1.4;resize:vertical}.component-settings-io .settings-io-textarea:focus{border-color:#f0a94b;box-shadow:0 0 0 2px rgba(240,169,75,.25);outline:0}.component-settings-io .settings-io-actions{display:flex;flex-wrap:wrap;gap:.55rem;margin-top:.65rem}.component-settings-io .settings-io-button{flex:1 1 10rem;min-width:0;min-height:44px;margin:0;padding:.55rem .75rem;background:#263648;border:1px solid #52657b;border-radius:.45rem;color:#f5f7fa;font:inherit;font-weight:600;text-transform:none}.component-settings-io .settings-io-button[data-settings-export]{background:#f0a94b;border-color:#f0a94b;color:#17202a}.component-settings-io .settings-io-button:focus{border-color:#f0a94b;box-shadow:0 0 0 2px rgba(240,169,75,.25);outline:0}.component-settings-io .settings-io-status{min-height:1.3rem;margin:.55rem 0 0;color:#aeb9c7;font-size:.8rem;line-height:1.45}.component-settings-io .settings-io-error{color:#e6a9af}.component-settings-io .settings-io-ok{color:#b8d8a8}',
	  manipulator: {
	    get: function() {
	      return '';
	    },
	    set: function(value) {
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
	  initialize: function(utils, clayInstance) {
	    var item = this;
	    var root = item.$element[0];
	    var doc = root.ownerDocument;
	    var win = doc.defaultView || {};
	    var textarea = root.querySelector('[data-settings-json]');
	    var status = root.querySelector('[data-settings-status]');
	    var excludedKeys = ['ApiKey', 'ConfigAction', 'MemoriesJson'];
	    var maxBytes = 512 * 1024;
	    var clay = clayInstance || (utils && typeof utils.getAllItems === 'function' ? utils : null) || null;
	
	    function trim(value) {
	      return String(value === undefined || value === null ? '' : value).replace(/^\s+|\s+$/g, '');
	    }
	
	    function hasOwn(object, key) {
	      return Object.prototype.hasOwnProperty.call(object || {}, key);
	    }
	
	    function isPlainObject(value) {
	      return !!value && typeof value === 'object' && !Array.isArray(value);
	    }
	
	    function cloneJson(value) {
	      return JSON.parse(JSON.stringify(value));
	    }
	
	    function utf8ByteLength(value) {
	      var length = 0;
	      var i;
	      var code;
	
	      for (i = 0; i < value.length; i += 1) {
	        code = value.charCodeAt(i);
	        if (code < 0x80) {
	          length += 1;
	        } else if (code < 0x800) {
	          length += 2;
	        } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
	          code = value.charCodeAt(i + 1);
	          if (code >= 0xdc00 && code <= 0xdfff) {
	            length += 4;
	            i += 1;
	          } else {
	            length += 3;
	          }
	        } else {
	          length += 3;
	        }
	      }
	
	      return length;
	    }
	
	    function setStatus(message, isError) {
	      status.textContent = message || '';
	      status.className = 'settings-io-status' + (isError ? ' settings-io-error' : ' settings-io-ok');
	    }
	
	    function setItemValue(settingItem, value) {
	      try {
	        settingItem.set(value);
	        return true;
	      } catch (e) {
	        return false;
	      }
	    }
	
	    function normalizeToggle(value) {
	      var text;
	
	      if (value === true || value === 1) {
	        return true;
	      }
	      if (value === false || value === 0) {
	        return false;
	      }
	      if (typeof value !== 'string') {
	        return null;
	      }
	
	      text = trim(value).toLowerCase();
	      if (text === '1' || text === 'true') {
	        return true;
	      }
	      if (text === '' || text === '0' || text === 'false') {
	        return false;
	      }
	      return null;
	    }
	
	    function isFiniteNumberValue(value) {
	      var text;
	
	      if (typeof value === 'number') {
	        return isFinite(value);
	      }
	      if (typeof value !== 'string') {
	        return false;
	      }
	      text = trim(value);
	      if (!text || !/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) {
	        return false;
	      }
	      return isFinite(Number(text));
	    }
	
	    function isColorValue(value) {
	      var number;
	
	      if (!isFiniteNumberValue(value)) {
	        return false;
	      }
	      number = Number(value);
	      return number >= 0 && number <= 16777215;
	    }
	
	    function matchedOption(options, value) {
	      var stringValue = String(value);
	      var i;
	
	      if (!options || !options.length || value === null || typeof value === 'object') {
	        return null;
	      }
	      for (i = 0; i < options.length; i += 1) {
	        if (String(options[i].value) === stringValue) {
	          return options[i];
	        }
	      }
	      return null;
	    }
	
	    function applyImportedValue(settingItem, value) {
	      var config = settingItem.config || {};
	      var type = config.type;
	      var normalized;
	      var option;
	
	      if (type === 'toggle') {
	        normalized = normalizeToggle(value);
	        return normalized === null ? false : setItemValue(settingItem, normalized);
	      }
	
	      if (value === null || typeof value === 'object') {
	        return false;
	      }
	
	      if (type === 'select') {
	        option = matchedOption(config.options, value);
	        return option ? setItemValue(settingItem, String(option.value)) : false;
	      }
	
	      if (type === 'color') {
	        return isColorValue(value) ? setItemValue(settingItem, Number(value)) : false;
	      }
	
	      if (config.attributes && config.attributes.type === 'number') {
	        return isFiniteNumberValue(value) ? setItemValue(settingItem, Number(value)) : false;
	      }
	
	      return setItemValue(settingItem, String(value));
	    }
	
	    function parseServerArray(value) {
	      var parsed = value;
	
	      if (typeof value === 'string') {
	        try {
	          parsed = JSON.parse(value || '[]');
	        } catch (e) {
	          return [];
	        }
	      }
	      return Array.isArray(parsed) ? parsed : [];
	    }
	
	    function redactMcpServers(servers) {
	      return parseServerArray(servers).map(function(server) {
	        var copy;
	        var i;
	
	        if (!isPlainObject(server)) {
	          return server;
	        }
	        copy = cloneJson(server);
	        copy.authorization = '';
	        if (Array.isArray(copy.headers)) {
	          for (i = 0; i < copy.headers.length; i += 1) {
	            if (isPlainObject(copy.headers[i])) {
	              copy.headers[i].value = '';
	            }
	          }
	        }
	        return copy;
	      });
	    }
	
	    function itemsByMessageKey() {
	      var items = {};
	      var allItems;
	      var i;
	
	      if (!clay || typeof clay.getAllItems !== 'function') {
	        return items;
	      }
	
	      try {
	        allItems = clay.getAllItems() || [];
	      } catch (e) {
	        allItems = [];
	      }
	
	      for (i = 0; i < allItems.length; i += 1) {
	        if (allItems[i] && allItems[i].messageKey) {
	          items[allItems[i].messageKey] = allItems[i];
	        }
	      }
	      return items;
	    }
	
	    function buildExportSettings() {
	      var items = itemsByMessageKey();
	      var settings = {};
	
	      Object.keys(items).forEach(function(key) {
	        var value;
	
	        if (excludedKeys.indexOf(key) !== -1) {
	          return;
	        }
	
	        try {
	          value = typeof items[key].get === 'function' ? items[key].get() : undefined;
	        } catch (e) {
	          value = undefined;
	        }
	
	        if (key === 'McpServersJson') {
	          settings[key] = JSON.stringify(redactMcpServers(value));
	        } else if (value !== undefined) {
	          settings[key] = value;
	        }
	      });
	
	      return {
	        app: 'llm_thing',
	        version: 1,
	        settings: settings
	      };
	    }
	
	    function parseCurrentServers(settingItem) {
	      var current;
	      var parsed;
	
	      try {
	        current = settingItem.get();
	      } catch (e) {
	        return [];
	      }
	      if (typeof current === 'string') {
	        try {
	          parsed = JSON.parse(current || '[]');
	        } catch (e) {
	          parsed = [];
	        }
	      } else {
	        parsed = current;
	      }
	      return Array.isArray(parsed) ? parsed : [];
	    }
	
	    function importedServerMatch(server, currentServers) {
	      var url = isPlainObject(server) ? trim(server.url) : '';
	      var label = isPlainObject(server) ? trim(server.label).toLowerCase() : '';
	      var i;
	      var current;
	      var currentUrl;
	
	      for (i = 0; i < currentServers.length; i += 1) {
	        current = currentServers[i];
	        if (!isPlainObject(current)) {
	          continue;
	        }
	        currentUrl = trim(current.url);
	        if (url) {
	          if (currentUrl === url) {
	            return current;
	          }
	        } else if (!currentUrl && label && trim(current.label).toLowerCase() === label) {
	          return current;
	        }
	      }
	      return null;
	    }
	
	    function mergeHeaderSecrets(importedHeaders, currentHeaders) {
	      var i;
	      var header;
	      var current;
	      var j;
	
	      if (!Array.isArray(importedHeaders) || !Array.isArray(currentHeaders)) {
	        return;
	      }
	      for (i = 0; i < importedHeaders.length; i += 1) {
	        header = importedHeaders[i];
	        if (!isPlainObject(header)) {
	          continue;
	        }
	        if (trim(header.value) !== '') {
	          continue;
	        }
	        for (j = 0; j < currentHeaders.length; j += 1) {
	          current = currentHeaders[j];
	          if (isPlainObject(current) &&
	              trim(current.name).toLowerCase() === trim(header.name).toLowerCase() &&
	              trim(current.value) !== '') {
	            header.value = current.value;
	            break;
	          }
	        }
	      }
	    }
	
	    function mergeMcpSecrets(importedServers, currentServers) {
	      return importedServers.map(function(server) {
	        var copy;
	        var match;
	
	        if (!isPlainObject(server)) {
	          return server;
	        }
	        copy = cloneJson(server);
	        match = importedServerMatch(server, currentServers);
	        if (!match) {
	          return copy;
	        }
	
	        if (trim(copy.authorization) === '' && trim(match.authorization) !== '') {
	          copy.authorization = match.authorization;
	        }
	        mergeHeaderSecrets(copy.headers, match.headers);
	        return copy;
	      });
	    }
	
	    function applyMcpServers(settingItem, value) {
	      var imported;
	      var current;
	      var merged;
	
	      if (typeof value === 'string') {
	        try {
	          imported = JSON.parse(value);
	        } catch (e) {
	          return false;
	        }
	      } else {
	        imported = value;
	      }
	      if (!Array.isArray(imported)) {
	        return false;
	      }
	
	      current = parseCurrentServers(settingItem);
	      merged = mergeMcpSecrets(imported, current);
	      return setItemValue(settingItem, JSON.stringify(merged));
	    }
	
	    function parseImportEnvelope(text) {
	      var parsed;
	      var settings;
	      var parsedValue;
	
	      if (!text) {
	        throw new Error('Paste settings JSON to import.');
	      }
	      if (utf8ByteLength(text) > maxBytes) {
	        throw new Error('Settings JSON is too large (maximum 512 KiB).');
	      }
	
	      try {
	        parsed = JSON.parse(text);
	      } catch (e) {
	        throw new Error('Invalid JSON: ' + String(e && e.message || 'parse error'));
	      }
	
	      parsedValue = parsed;
	      while (isPlainObject(parsedValue) && hasOwn(parsedValue, 'value')) {
	        parsedValue = parsedValue.value;
	        if (typeof parsedValue === 'string') {
	          try {
	            parsedValue = JSON.parse(parsedValue);
	          } catch (e) {
	            throw new Error('Invalid JSON in value: ' + String(e && e.message || 'parse error'));
	          }
	        }
	      }
	
	      if (!isPlainObject(parsedValue)) {
	        throw new Error('Settings JSON must be an object.');
	      }
	
	      if (hasOwn(parsedValue, 'settings')) {
	        if (hasOwn(parsedValue, 'app') && parsedValue.app !== 'llm_thing') {
	          throw new Error('Settings backup is for a different app.');
	        }
	        if (hasOwn(parsedValue, 'version') && parsedValue.version !== 1 && parsedValue.version !== '1') {
	          throw new Error('Unsupported settings version.');
	        }
	        settings = parsedValue.settings;
	        if (isPlainObject(settings) && hasOwn(settings, 'value')) {
	          settings = settings.value;
	          if (typeof settings === 'string') {
	            try {
	              settings = JSON.parse(settings);
	            } catch (e) {
	              throw new Error('Invalid settings object.');
	            }
	          }
	        }
	        if (!isPlainObject(settings)) {
	          throw new Error('Settings envelope must contain a settings object.');
	        }
	        return settings;
	      }
	
	      if (hasOwn(parsedValue, 'app') || hasOwn(parsedValue, 'version')) {
	        throw new Error('Settings envelope is missing a settings object.');
	      }
	
	      return parsedValue;
	    }
	
	    function importSettingsText(text) {
	      var settings;
	      var items;
	      var applied = 0;
	      var skipped = 0;
	      var keptApiKey = false;
	      var message;
	      var result;
	
	      try {
	        settings = parseImportEnvelope(trim(text));
	      } catch (error) {
	        message = String(error && error.message || error);
	        setStatus(message, true);
	        return { ok: false, applied: 0, skipped: 0, keptApiKey: false, error: message, status: message };
	      }
	
	      items = itemsByMessageKey();
	
	      Object.keys(settings).forEach(function(key) {
	        var settingItem;
	
	        if (key === 'ApiKey') {
	          keptApiKey = true;
	          return;
	        }
	        if (excludedKeys.indexOf(key) !== -1) {
	          return;
	        }
	
	        settingItem = items[key];
	        if (!settingItem || typeof settingItem.set !== 'function') {
	          skipped += 1;
	          return;
	        }
	
	        if (key === 'McpServersJson') {
	          if (applyMcpServers(settingItem, settings[key])) {
	            applied += 1;
	          } else {
	            skipped += 1;
	          }
	          return;
	        }
	
	        if (applyImportedValue(settingItem, settings[key])) {
	          applied += 1;
	        } else {
	          skipped += 1;
	        }
	      });
	
	      if (!applied) {
	        message = 'No supported settings to import.';
	        if (keptApiKey) {
	          message += ' Your API key was kept.';
	        }
	        if (skipped) {
	          message += ' Ignored ' + skipped + ' unsupported value' + (skipped === 1 ? '' : 's') + '.';
	        }
	        setStatus(message, true);
	        return {
	          ok: false,
	          applied: applied,
	          skipped: skipped,
	          keptApiKey: keptApiKey,
	          error: message,
	          status: message
	        };
	      }
	
	      message = 'Imported ' + applied + ' setting' + (applied === 1 ? '' : 's') + '. Tap Save Settings to apply.';
	      if (keptApiKey) {
	        message += ' Your API key was kept.';
	      }
	      if (skipped) {
	        message += ' Ignored ' + skipped + ' unsupported value' + (skipped === 1 ? '' : 's') + '.';
	      }
	      setStatus(message, false);
	      result = {
	        ok: true,
	        applied: applied,
	        skipped: skipped,
	        keptApiKey: keptApiKey,
	        status: message
	      };
	      return result;
	    }
	
	    function execCommandCopy(text) {
	      var body = doc.body;
	      var temporary;
	      var copied = false;
	
	      if (!body || typeof doc.createElement !== 'function') {
	        return false;
	      }
	
	      temporary = doc.createElement('textarea');
	      temporary.value = text;
	      temporary.setAttribute('readonly', 'readonly');
	      temporary.style.position = 'fixed';
	      temporary.style.top = '-1000px';
	      temporary.style.opacity = '0';
	      body.appendChild(temporary);
	      try {
	        temporary.focus();
	        temporary.select();
	        copied = typeof doc.execCommand === 'function' && doc.execCommand('copy') !== false;
	      } catch (e) {
	        copied = false;
	      }
	      body.removeChild(temporary);
	      return copied;
	    }
	
	    function copyText(text, callback) {
	      var navigator = win.navigator || {};
	      var clipboard = navigator.clipboard;
	      var finished = false;
	
	      function finish(ok) {
	        if (finished) {
	          return;
	        }
	        finished = true;
	        callback(ok);
	      }
	
	      function fallback() {
	        finish(execCommandCopy(text));
	      }
	
	      if (clipboard && typeof clipboard.writeText === 'function') {
	        try {
	          var result = clipboard.writeText(text);
	          if (result && typeof result.then === 'function') {
	            result.then(function() {
	              finish(true);
	            }, fallback);
	          } else {
	            finish(true);
	          }
	        } catch (e) {
	          fallback();
	        }
	        return;
	      }
	
	      fallback();
	    }
	
	    function selectedManualCopy() {
	      try {
	        textarea.focus();
	        textarea.select();
	      } catch (e) {
	        // Ignore selection failures and still show the error.
	      }
	      setStatus('Copy failed. Settings JSON is selected; copy it manually.', true);
	    }
	
	    function exportToTextarea() {
	      var text = JSON.stringify(buildExportSettings(), null, 2);
	
	      textarea.value = text;
	      copyText(text, function(copied) {
	        if (copied) {
	          setStatus('Settings JSON copied to clipboard.', false);
	        } else {
	          selectedManualCopy();
	        }
	      });
	      return text;
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
	
	    item.buildExportSettings = buildExportSettings;
	    item.importSettingsText = importSettingsText;
	    item.exportToTextarea = exportToTextarea;
	    item.copyText = copyText;
	    item.redactMcpServers = redactMcpServers;
	    item.mergeMcpSecrets = mergeMcpSecrets;
	
	    root.addEventListener('click', function(e) {
	      var exportButton = closestByAttr(e.target, 'data-settings-export');
	      var importButton = closestByAttr(e.target, 'data-settings-import');
	
	      if (exportButton) {
	        if (e.preventDefault) {
	          e.preventDefault();
	        }
	        exportToTextarea();
	        return;
	      }
	      if (importButton) {
	        if (e.preventDefault) {
	          e.preventDefault();
	        }
	        importSettingsText(textarea.value);
	      }
	    });
	  },
	  defaults: {
	    defaultValue: ''
	  }
	};


/***/ }),
/* 9 */
/***/ (function(module, exports) {

	module.exports = {
	  name: 'plugin_sources',
	  template: '<div class="component component-plugin-sources"><button type="button" class="plugin-sources-toggle" data-plugin-toggle aria-expanded="false"><span class="plugin-sources-title">Plugins</span><span class="plugin-sources-subtitle">Plugin data sources and optional actions</span></button><div class="plugin-sources-body" data-plugin-body style="display:none;"><p class="plugin-sources-warning">Enabled sources are read automatically. Returned data is sent to your configured model provider. Pebble OS permissions may still need approval.</p><p class="plugin-sources-status" data-plugin-status role="status" aria-live="polite"></p><div data-plugin-list="sources"></div><input data-manipulator-target type="hidden" /></div></div>',
	  style: '.component-plugin-sources{box-sizing:border-box;min-width:0;max-width:100%;padding:.75rem 1rem;color:#f5f7fa}.component-plugin-sources .plugin-sources-toggle{position:relative;display:block;box-sizing:border-box;width:100%;min-width:0;min-height:52px;margin:0;padding:.65rem 2.7rem .65rem .75rem;background:#182431;border:1px solid #405064;border-radius:.45rem;color:#fff;font:inherit;text-align:left;text-transform:none;box-shadow:none}.component-plugin-sources .plugin-sources-toggle:after{content:"+";position:absolute;top:50%;right:.7rem;width:1.5rem;height:1.5rem;margin-top:-.75rem;border-radius:50%;background:#f0a94b;color:#17202a;font-size:1rem;font-weight:700;line-height:1.5rem;text-align:center}.component-plugin-sources.open .plugin-sources-toggle:after{content:"-"}.component-plugin-sources .plugin-sources-toggle:focus,.component-plugin-sources button:focus{outline:2px solid #f0a94b;outline-offset:2px}.component-plugin-sources .plugin-sources-title{display:block;font-size:1rem;font-weight:700}.component-plugin-sources .plugin-sources-subtitle{display:block;margin-top:.12rem;color:#aeb9c7;font-size:.78rem}.component-plugin-sources .plugin-sources-body{box-sizing:border-box;min-width:0;max-width:100%;padding:.7rem 0 0}.component-plugin-sources .plugin-section-title{margin:0;padding:.1rem 0 .35rem;color:#fff;font-size:.95rem;font-weight:700;line-height:1.35;text-transform:none;letter-spacing:normal}.component-plugin-sources .plugin-sources-warning,.component-plugin-sources .plugin-sources-status{max-width:100%;margin:.15rem 0 .55rem;color:#bdc7d3;font-size:.82rem;line-height:1.45;overflow-wrap:anywhere}.component-plugin-sources .plugin-sources-status{color:#d6dce4}.component-plugin-sources .plugin-source-group{box-sizing:border-box;min-width:0;max-width:100%;margin:.65rem 0 0;padding:0 0 .55rem;border-bottom:2px solid #8793a1}.component-plugin-sources .plugin-source-group-title{position:relative;display:flex;align-items:center;justify-content:space-between;gap:.55rem;box-sizing:border-box;min-width:0;min-height:44px;margin:0;padding:.35rem .2rem;color:#fff;font-size:.9rem;font-weight:700;line-height:1.3;letter-spacing:normal;text-align:left;text-transform:none;transform:none;overflow-wrap:anywhere;list-style:none;cursor:pointer}.component-plugin-sources .plugin-source-group-title::-webkit-details-marker{display:none}.component-plugin-sources .plugin-source-group-title:focus{outline:2px solid #f0a94b;outline-offset:1px}.component-plugin-sources .plugin-source-group-title:after{content:"";width:.5rem;height:.5rem;flex:0 0 .5rem;border-right:2px solid #aeb9c7;border-bottom:2px solid #aeb9c7;transform:rotate(45deg);transition:transform .12s ease}.component-plugin-sources .plugin-source-group[open]>.plugin-source-group-title:after{transform:rotate(225deg)}.component-plugin-sources .plugin-source-group-name{flex:1 1 7rem;min-width:0;overflow-wrap:anywhere}.component-plugin-sources .plugin-plugin-counts{display:flex;flex:0 1 auto;flex-wrap:wrap;justify-content:flex-end;gap:.15rem .55rem;min-width:0;color:#9aa4b0;font-size:.72rem;font-weight:400;line-height:1.25;text-align:right}.component-plugin-sources .plugin-plugin-count{white-space:nowrap}.component-plugin-sources .plugin-source-row{display:grid;grid-template-columns:minmax(0,1fr) 48px;align-items:center;justify-content:initial;box-sizing:border-box;width:100%;min-width:0;min-height:50px;margin:0;padding:.25rem 0;border:0;border-bottom:1px solid #2b3948;border-radius:0;background:transparent;color:#f5f7fa;text-align:left;line-height:normal;overflow-wrap:anywhere}.component-plugin-sources label.plugin-source-row{display:grid;flex-direction:initial;flex-wrap:initial;align-items:center;justify-content:initial;box-sizing:border-box;width:100%;min-width:0;max-width:none;min-height:50px;margin:0;padding:.25rem 0;border:0;background:transparent;color:#f5f7fa;text-align:left;text-transform:none;line-height:normal;white-space:normal;cursor:pointer}.component-plugin-sources .plugin-source-title{display:block;min-width:0;max-width:100%;overflow-wrap:anywhere}.component-plugin-sources .plugin-source-switch{position:relative;display:block;box-sizing:border-box;width:48px;height:44px;justify-self:end}.component-plugin-sources .plugin-source-switch input{position:absolute;z-index:2;inset:0;box-sizing:border-box;width:48px;height:44px;margin:0;opacity:0;cursor:pointer}.component-plugin-sources .plugin-source-track{position:absolute;top:10px;right:2px;display:block;box-sizing:border-box;width:42px;height:24px;border:1px solid #718095;border-radius:999px;background:#283544;pointer-events:none}.component-plugin-sources .plugin-source-track:after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#c5ced8;transition:transform .12s ease,background-color .12s ease}.component-plugin-sources .plugin-source-switch input:checked+.plugin-source-track{border-color:#d89132;background:#b8751c}.component-plugin-sources .plugin-source-switch input:checked+.plugin-source-track:after{transform:translateX(18px);background:#fff}.component-plugin-sources .plugin-source-switch input:focus+.plugin-source-track{outline:2px solid #f0a94b;outline-offset:2px}.component-plugin-sources .plugin-source-details{min-width:0;margin:.2rem 0 0;color:#aeb9c7;font-size:.78rem;line-height:1.4}.component-plugin-sources .plugin-source-details summary{box-sizing:border-box;min-height:44px;padding:.6rem 0;color:#c5ced8;cursor:pointer;overflow-wrap:anywhere}.component-plugin-sources .plugin-source-detail-list{margin:0;padding:0 0 0 1.1rem;overflow-wrap:anywhere}.component-plugin-sources .plugin-source-detail-list li{margin:.2rem 0}.component-plugin-sources .plugin-source-unavailable{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:.5rem;min-width:0;min-height:50px;padding:.25rem 0;border-bottom:1px solid #2b3948}.component-plugin-sources .plugin-source-unavailable-label{color:#9aa4b0;font-size:.7rem;line-height:1.2;white-space:nowrap}.component-plugin-sources .plugin-source-remove{box-sizing:border-box;min-width:48px;min-height:44px;margin:0;padding:.35rem .55rem;border:1px solid #70404a;border-radius:.35rem;background:#302125;color:#f0b5bb;font:inherit;font-size:.78rem;text-transform:none}.component-plugin-actions{box-sizing:border-box;min-width:0;max-width:100%;margin-top:.7rem;padding:.65rem 0 0;border-top:1px solid #747b84}.component-plugin-actions .plugin-section-title{padding-top:0}.component-plugin-actions .plugin-action-controls{display:flex;align-items:center;justify-self:end;gap:.2rem;min-width:0}.component-plugin-actions label.plugin-action-ask-first,.component-plugin-actions label.plugin-action-enable{display:flex;align-items:center;justify-content:flex-start;gap:.25rem;box-sizing:border-box;min-width:44px;min-height:44px;margin:0;padding:0;color:#d7dee7;font-size:.7rem;line-height:normal;text-align:left;text-transform:none;white-space:nowrap;cursor:pointer}.component-plugin-actions label.plugin-action-ask-first[hidden]{display:none}.component-plugin-actions .plugin-action-ask-first .plugin-source-switch{width:44px;height:44px;flex:0 0 44px}.component-plugin-actions .plugin-action-ask-first .plugin-source-switch input{width:44px;height:44px}.component-plugin-actions .plugin-action-ask-first .plugin-source-track{top:11px;right:2px;width:38px;height:22px}.component-plugin-actions .plugin-action-ask-first .plugin-source-track:after{width:16px;height:16px}.component-plugin-actions .plugin-action-ask-first input:checked+.plugin-source-track:after{transform:translateX(16px)}.component-plugin-actions .plugin-action-enable{flex:0 0 48px}.component-plugin-actions .plugin-action-row{grid-template-columns:minmax(0,1fr) auto;border-bottom:0}.component-plugin-actions .plugin-source-unavailable{border-bottom:0}.component-plugin-actions .plugin-action-enable:focus+.plugin-source-track{outline-offset:1px}.component-plugin-actions.plugin-action-group{box-sizing:border-box;max-width:100%;margin:.65rem 0 0;padding:0;color:inherit;border-top:0}.plugin-source-group[data-has-sources]>.plugin-action-group{margin:.45rem 0 0;padding:.45rem 0 0;border-top:1px solid #747b84;border-bottom:0}.plugin-source-group[data-has-sources]>.plugin-action-group>.plugin-source-group-title[hidden]{display:none}',
	  manipulator: {
	    get: function() {
	      return JSON.stringify(this.collectSources());
	    },
	    set: function(value) {
	      this.renderSources(this.parseSources(value));
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
	    var actionsMode = root.getAttribute('data-plugin-kind') === 'actions';
	    var body = actionsMode ? root : root.querySelector('[data-plugin-body]');
	    var statusElement = root.querySelector('[data-plugin-status]');
	    var catalogue = parseCatalogue(item.config && item.config.catalogueEncoded).map(catalogueEntry).filter(function(entry) { return !!entry; });
	    var selected;
	    var MAX_ENABLED = 16;
	    var actionRoot = null;
	    var mountedActionGroups = [];
	    var actionMountListenerAdded = false;
	    var actionFocus = null;
	    var actionScrollTop = 0;
	    var expandedByPlugin = {};
	    var renderedGroups = [];
	
	    function parseCatalogue(encoded) {
	      var parsed;
	      try {
	        parsed = JSON.parse(decodeURIComponent(encoded || '[]'));
	      } catch (e) {
	        return [];
	      }
	      return Array.isArray(parsed) ? parsed : [];
	    }
	
	    function trim(value) {
	      return String(value === undefined || value === null ? '' : value).replace(/^\s+|\s+$/g, '');
	    }
	
	    function cleanEntry(entry) {
	      var identifier;
	      if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.plugin !== 'string') {
	        return null;
	      }
	      identifier = actionsMode ? entry.action : entry.item;
	      if (actionsMode ? typeof identifier !== 'string' : (typeof entry.category !== 'string' || typeof identifier !== 'string')) {
	        return null;
	      }
	      if (actionsMode && entry.confirm !== undefined && typeof entry.confirm !== 'boolean') { return null; }
	      entry = actionsMode
	        ? { plugin: trim(entry.plugin).toLowerCase(), action: identifier, confirm: entry.confirm === true }
	        : { plugin: trim(entry.plugin).toLowerCase(), category: entry.category, item: identifier };
	      if (actionsMode && !entry.confirm) { delete entry.confirm; }
	      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(entry.plugin) &&
	        (actionsMode ? !!identifier : !!entry.category && !!identifier) ? entry : null;
	    }
	
	    function keyFor(entry) {
	      return actionsMode
	        ? JSON.stringify([entry.plugin, entry.action])
	        : JSON.stringify([entry.plugin, entry.category, entry.item]);
	    }
	
	    function sameEntry(left, right) {
	      return keyFor(left) === keyFor(right);
	    }
	
	    function catalogueEntry(entry) {
	      var cleaned = cleanEntry(entry);
	      if (!cleaned || typeof entry.pluginName !== 'string') {
	        return null;
	      }
	      cleaned.pluginName = entry.pluginName;
	      if (actionsMode) {
	        if (typeof entry.description !== 'string' || !Array.isArray(entry.arguments)) { return null; }
	        cleaned.description = entry.description;
	        cleaned.arguments = entry.arguments.filter(function(argument) { return typeof argument === 'string'; });
	      } else {
	        if (!Array.isArray(entry.properties)) { return null; }
	        cleaned.properties = entry.properties.filter(function(property) { return typeof property === 'string'; });
	      }
	      return cleaned;
	    }
	
	    function sourceIdentifier(entry) {
	      return actionsMode ? entry.action : entry.item;
	    }
	
	    function humanize(value) {
	      value = String(value).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
	      return value ? value.charAt(0).toUpperCase() + value.substring(1) : (actionsMode ? 'Action' : 'Source');
	    }
	
	    function masterBody() {
	      var node = root.parentNode;
	      while (node) {
	        if (node.getAttribute && node.getAttribute('data-plugin-body') !== null) { return node; }
	        node = node.parentNode;
	      }
	      return null;
	    }
	
	    function masterExpanded() {
	      var parentBody = masterBody();
	      return !!parentBody && parentBody.style.display !== 'none';
	    }
	
	    function syncActionAskFirst(row, enabled) {
	      var ask = row && row.querySelector('[data-ask-first-index]');
	      var control = row && row.querySelector('[data-ask-first-control]');
	      if (!ask || !control) { return; }
	      control.hidden = !enabled;
	      ask.disabled = !enabled || !masterExpanded();
	      if (!enabled) { ask.checked = false; }
	    }
	
	    function createElement(tag, className, text) {
	      var element = root.ownerDocument.createElement(tag);
	      if (className) { element.className = className; }
	      if (text !== undefined) { element.textContent = text; }
	      return element;
	    }
	
	    function bindPluginToggle(groupRoot) {
	      if (groupRoot._pluginToggleBound) { return; }
	      groupRoot._pluginToggleBound = true;
	      groupRoot.addEventListener('toggle', function() {
	        var list = root.querySelector('[data-plugin-list="sources"]');
	        if (groupRoot.parentNode === list) {
	          expandedByPlugin[groupRoot.getAttribute('data-plugin-group')] = !!groupRoot.open;
	        }
	      });
	    }
	
	    function captureExpandedPlugins() {
	      var list = root.querySelector('[data-plugin-list="sources"]');
	      var entries = list ? list.children : [];
	      var i;
	      for (i = 0; i < entries.length; i += 1) {
	        if (entries[i].getAttribute('data-plugin-group') !== null) {
	          expandedByPlugin[entries[i].getAttribute('data-plugin-group')] = !!entries[i].open;
	        }
	      }
	    }
	
	    function countsByPlugin() {
	      var counts = {};
	      var counted = {};
	      var entry;
	      var count;
	      var i;
	      function forPlugin(plugin) {
	        if (!counts[plugin]) { counts[plugin] = { selected: 0, total: 0 }; }
	        return counts[plugin];
	      }
	      for (i = 0; i < catalogue.length; i += 1) {
	        entry = catalogue[i];
	        forPlugin(entry.plugin).total += 1;
	      }
	      for (i = 0; i < selected.length; i += 1) {
	        entry = selected[i];
	        if (counted[keyFor(entry)]) { continue; }
	        counted[keyFor(entry)] = true;
	        count = forPlugin(entry.plugin);
	        count.selected += 1;
	        if (!catalogue.some(function(candidate) { return sameEntry(candidate, entry); })) { count.total += 1; }
	      }
	      return counts;
	    }
	
	    function setPluginCount(groupRoot, kind, count) {
	      var element = groupRoot && groupRoot._pluginCountElements && groupRoot._pluginCountElements[kind];
	      if (!element) { return; }
	      count = count || { selected: 0, total: 0 };
	      element.textContent = count.selected + '/' + count.total + ' ' + kind;
	      groupRoot._pluginCounts[kind] = { selected: count.selected, total: count.total };
	    }
	
	    function updateKindCounts() {
	      var counts = countsByPlugin();
	      var list;
	      var entries;
	      var plugin;
	      var i;
	      renderedGroups.forEach(function(groupRoot) {
	        setPluginCount(groupRoot, actionsMode ? 'actions' : 'sources', counts[groupRoot.getAttribute('data-plugin-group')]);
	      });
	      if (!actionsMode) {
	        list = root.querySelector('[data-plugin-list="sources"]');
	        entries = list ? list.children : [];
	        for (i = 0; i < entries.length; i += 1) {
	          plugin = entries[i].getAttribute('data-plugin-group');
	          if (plugin !== null) { setPluginCount(entries[i], 'sources', counts[plugin]); }
	        }
	      }
	    }
	
	    function findGroup(groups, plugin) {
	      var i;
	      for (i = 0; i < groups.length; i += 1) {
	        if (groups[i].plugin === plugin) { return groups[i]; }
	      }
	      return null;
	    }
	
	    function addGroup(groups, plugin, pluginName) {
	      var group = { plugin: plugin, root: createElement('details', 'plugin-source-group'), rows: null, details: null, detailList: null };
	      var heading = createElement('summary', 'plugin-source-group-title');
	      var name = createElement('span', 'plugin-source-group-name', pluginName);
	      var counts = createElement('span', 'plugin-plugin-counts');
	      var sourceCount = createElement('span', 'plugin-plugin-count plugin-count-sources', '0/0 sources');
	      var actionCount = createElement('span', 'plugin-plugin-count plugin-count-actions', '0/0 actions');
	      group.root.setAttribute('data-plugin-group', plugin);
	      group.root.open = !actionsMode && expandedByPlugin[plugin] === true;
	      group.root._pluginCountElements = { sources: sourceCount, actions: actionCount };
	      group.root._pluginCounts = { sources: { selected: 0, total: 0 }, actions: { selected: 0, total: 0 } };
	      if (actionsMode) {
	        group.root.className += ' component-plugin-actions plugin-action-group';
	        group.root.setAttribute('data-plugin-kind', 'actions');
	        bindActionGroup(group.root);
	      } else {
	        group.root.setAttribute('data-has-sources', '');
	        bindPluginToggle(group.root);
	      }
	      heading.appendChild(name);
	      counts.appendChild(sourceCount);
	      counts.appendChild(root.ownerDocument.createTextNode(' '));
	      counts.appendChild(actionCount);
	      heading.appendChild(counts);
	      group.rows = createElement('div', 'plugin-source-rows');
	      group.details = createElement('details', 'plugin-source-details');
	      group.details.appendChild(createElement('summary', '', actionsMode ? 'Action details' : 'Source details'));
	      group.detailList = createElement('ul', 'plugin-source-detail-list');
	      group.details.appendChild(group.detailList);
	      group.root.appendChild(heading);
	      group.root.appendChild(group.rows);
	      group.root.appendChild(group.details);
	      groups.push(group);
	      addDetail(group, 'Plugin UUID: ' + plugin);
	      return group;
	    }
	
	    function addDetail(group, text, key) {
	      var detail = createElement('li', '', text);
	      if (key) { detail.setAttribute('data-source-key', key); }
	      group.detailList.appendChild(detail);
	    }
	
	    function addAvailableSource(group, source, catalogueIndex) {
	      var label = createElement(actionsMode ? 'div' : 'label', actionsMode ? 'plugin-source-row plugin-action-row' : 'plugin-source-row');
	      var identifier = sourceIdentifier(source);
	      var title = createElement('span', 'plugin-source-title', humanize(identifier));
	      var switchWrap = createElement(actionsMode ? 'label' : 'span', 'plugin-source-switch plugin-action-enable');
	      var checkbox = createElement('input');
	      var track = createElement('span', 'plugin-source-track');
	      var key = keyFor(source);
	
	      checkbox.type = 'checkbox';
	      checkbox.setAttribute('data-plugin-index', String(catalogueIndex));
	      checkbox.setAttribute('aria-label', 'Enable ' + source.pluginName + ': ' + humanize(identifier));
	      var selectedEntry = null;
	      selected.some(function(choice) { if (sameEntry(choice, source)) { selectedEntry = choice; return true; } return false; });
	      checkbox.checked = !!selectedEntry;
	      if (actionsMode) {
	        var controls = createElement('div', 'plugin-action-controls');
	        var askControl = createElement('label', 'plugin-action-ask-first');
	        var askText = createElement('span', 'plugin-ask-first-text', 'Ask first');
	        var askSwitch = createElement('span', 'plugin-source-switch');
	        var askCheckbox = createElement('input');
	        var askTrack = createElement('span', 'plugin-source-track');
	        label.setAttribute('data-action-row', '');
	        switchWrap.setAttribute('aria-label', 'Enable ' + source.pluginName + ': ' + humanize(identifier));
	        askControl.setAttribute('data-ask-first-control', '');
	        askControl.hidden = !selectedEntry;
	        askControl.setAttribute('title', 'Require Confirm or Deny on watch before this action runs.');
	        askCheckbox.type = 'checkbox';
	        askCheckbox.setAttribute('data-ask-first-index', String(catalogueIndex));
	        askCheckbox.setAttribute('aria-label', 'Ask before ' + source.pluginName + ': ' + identifier);
	        askCheckbox.checked = !!(selectedEntry && selectedEntry.confirm === true);
	        askSwitch.appendChild(askCheckbox);
	        askSwitch.appendChild(askTrack);
	        askControl.appendChild(askText);
	        askControl.appendChild(askSwitch);
	        switchWrap.appendChild(checkbox);
	        switchWrap.appendChild(track);
	        controls.appendChild(askControl);
	        controls.appendChild(switchWrap);
	        label.appendChild(title);
	        label.appendChild(controls);
	      } else {
	        switchWrap.appendChild(checkbox);
	        switchWrap.appendChild(track);
	        label.appendChild(title);
	        label.appendChild(switchWrap);
	      }
	      group.rows.appendChild(label);
	      if (actionsMode) {
	        addDetail(group, 'Action ID: ' + source.action + '. ' + source.description + ' Arguments: ' + (source.arguments.length ? source.arguments.join(', ') : 'none'), key);
	      } else {
	        addDetail(group, source.category + ' / ' + source.item + ': ' + (source.properties.length ? source.properties.join(', ') : 'No properties listed'), key);
	      }
	    }
	
	    function addUnavailableSource(group, choice) {
	      var row = createElement('div', 'plugin-source-unavailable');
	      var identifier = sourceIdentifier(choice);
	      var label = createElement('span', 'plugin-source-title', humanize(identifier));
	      var unavailable = createElement('span', 'plugin-source-unavailable-label', 'Unavailable');
	      var remove = createElement('button', 'plugin-source-remove', 'Remove');
	      var key = keyFor(choice);
	
	      row.setAttribute('data-unavailable-key', key);
	      remove.type = 'button';
	      remove.setAttribute('data-plugin-remove', key);
	      remove.setAttribute('aria-label', 'Remove unavailable ' + (actionsMode ? 'action ' + choice.action : 'source ' + choice.category + ' / ' + choice.item));
	      row.appendChild(label);
	      row.appendChild(unavailable);
	      row.appendChild(remove);
	      group.rows.appendChild(row);
	      addDetail(group, actionsMode ? 'Action ID: ' + choice.action + ' (unavailable)' : choice.category + ' / ' + choice.item + ' (unavailable)', key);
	    }
	
	    function setExpanded(expanded) {
	      var controls = body.querySelectorAll('input, button');
	      var toggle;
	      var i;
	      var askControl;
	      if (actionsMode) {
	        expanded = masterExpanded();
	        for (i = 0; i < controls.length; i += 1) {
	          if (controls[i].getAttribute('data-manipulator-target') !== null) { continue; }
	          if (controls[i].getAttribute('data-ask-first-index') !== null) {
	            askControl = controls[i].parentNode && controls[i].parentNode.parentNode;
	            controls[i].disabled = !expanded || !askControl || askControl.hidden;
	          } else {
	            controls[i].disabled = !expanded;
	          }
	        }
	        return;
	      }
	      body.style.display = expanded ? 'block' : 'none';
	      root.className = root.className.replace(/\s*open/g, '') + (expanded ? ' open' : '');
	      toggle = root.querySelector('[data-plugin-toggle]');
	      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
	      for (i = 0; i < controls.length; i += 1) {
	        if (controls[i].getAttribute('data-manipulator-target') === null) {
	          if (controls[i].getAttribute('data-ask-first-index') !== null) {
	            askControl = controls[i].parentNode && controls[i].parentNode.parentNode;
	            controls[i].disabled = !expanded || !askControl || askControl.hidden;
	          } else {
	            controls[i].disabled = !expanded;
	          }
	        }
	      }
	    }
	
	    function directActionGroups() {
	      var list = actionRoot && actionRoot.querySelector('[data-plugin-list="actions"]');
	      var groups = [];
	      var children;
	      var i;
	      if (!list) { return groups; }
	      children = list.children;
	      for (i = 0; i < children.length; i += 1) {
	        if (children[i].getAttribute('data-plugin-kind') === 'actions') { groups.push(children[i]); }
	      }
	      return groups;
	    }
	
	    function sourceGroupFor(plugin) {
	      var list = root.querySelector('[data-plugin-list="sources"]');
	      var children = list ? list.children : [];
	      var i;
	      for (i = 0; i < children.length; i += 1) {
	        if (children[i].getAttribute('data-plugin-group') === plugin && children[i].getAttribute('data-plugin-kind') !== 'actions') {
	          return children[i];
	        }
	      }
	      return null;
	    }
	
	    function detachMountedActionGroups() {
	      var i;
	      var active = root.ownerDocument.activeElement;
	      for (i = 0; i < mountedActionGroups.length; i += 1) {
	        if (active && mountedActionGroups[i].contains && mountedActionGroups[i].contains(active)) { actionFocus = active; }
	        if (mountedActionGroups[i].parentNode) { mountedActionGroups[i].parentNode.removeChild(mountedActionGroups[i]); }
	      }
	      if (body) { actionScrollTop = body.scrollTop; }
	      mountedActionGroups = [];
	    }
	
	    function hasPluginRows(groupRoot) {
	      var rows = directChildByClass(groupRoot, 'plugin-source-rows');
	      return !!rows && !!rows.querySelector('.plugin-source-row, .plugin-source-unavailable');
	    }
	
	    function syncMountedActionCounts() {
	      var list = root.querySelector('[data-plugin-list="sources"]');
	      var entries = list ? list.children : [];
	      var plugin;
	      var actionGroup;
	      var i;
	      for (i = 0; i < entries.length; i += 1) {
	        plugin = entries[i].getAttribute('data-plugin-group');
	        if (plugin === null) { continue; }
	        actionGroup = null;
	        mountedActionGroups.some(function(group) {
	          if (group.getAttribute('data-plugin-group') === plugin && hasPluginRows(group)) {
	            actionGroup = group;
	            return true;
	          }
	          return false;
	        });
	        setPluginCount(entries[i], 'actions', actionGroup && actionGroup._pluginCounts.actions);
	      }
	    }
	
	    function mountActionGroups(groups) {
	      var list = root.querySelector('[data-plugin-list="sources"]');
	      var actionGroup;
	      var sourceGroup;
	      var heading;
	      var sourceHeading;
	      var details;
	      var plugin;
	      var i;
	      if (!list) { return false; }
	      captureExpandedPlugins();
	      detachMountedActionGroups();
	      groups = groups || directActionGroups();
	      for (i = 0; i < groups.length; i += 1) {
	        actionGroup = groups[i];
	        if (!hasPluginRows(actionGroup)) { continue; }
	        plugin = actionGroup.getAttribute('data-plugin-group');
	        sourceGroup = sourceGroupFor(plugin);
	        heading = actionGroup.querySelector('.plugin-source-group-title');
	        if (sourceGroup) {
	          sourceHeading = sourceGroup.querySelector('.plugin-source-group-title');
	          var sourceName = sourceHeading && sourceHeading.querySelector('.plugin-source-group-name');
	          var actionName = heading && heading.querySelector('.plugin-source-group-name');
	          if (sourceName && (!trim(sourceName.textContent) || sourceName.textContent === 'Unavailable plugin') && actionName && trim(actionName.textContent)) {
	            sourceName.textContent = actionName.textContent;
	          }
	          if (heading) { heading.hidden = true; }
	          actionGroup.open = true;
	          details = sourceGroup.querySelector('.plugin-source-details');
	          sourceGroup.insertBefore(actionGroup, details || null);
	        } else {
	          if (heading) { heading.hidden = false; }
	          actionGroup.open = expandedByPlugin[plugin] === true;
	          bindPluginToggle(actionGroup);
	          list.appendChild(actionGroup);
	        }
	        mountedActionGroups.push(actionGroup);
	      }
	      syncMountedActionCounts();
	      if (actionFocus && mountedActionGroups.some(function(actionGroup) { return actionGroup.contains && actionGroup.contains(actionFocus); })) {
	        if (actionFocus.focus) { actionFocus.focus(); }
	        actionFocus = null;
	      }
	      if (body && actionScrollTop) { body.scrollTop = actionScrollTop; }
	      setExpanded(body.style.display !== 'none');
	      return true;
	    }
	
	    function actionsRendered() {
	      mountActionGroups(directActionGroups());
	    }
	
	    function actionsCountsChanged() {
	      syncMountedActionCounts();
	    }
	
	    function updateStatus(message) {
	      var status = statusElement;
	      var parts = [selected.length + ' of ' + MAX_ENABLED + ' selected.'];
	      var catalogueStatus = item.config && item.config.catalogueStatus;
	      var normalStatus = actionsMode ? 'Pebble plugin actions available' : 'Pebble plugin sources available';
	      if (catalogueStatus === normalStatus) {
	        catalogueStatus = '';
	      } else if (catalogueStatus && catalogueStatus.indexOf(normalStatus) === 0) {
	        catalogueStatus = catalogueStatus.substring(normalStatus.length).replace(/^[\s.;:,\-]+/, '');
	      }
	      if (catalogueStatus) { parts.push(catalogueStatus); }
	      if (!catalogue.length && !catalogueStatus) { parts.push(actionsMode ? 'Plugin action catalogue unavailable on this phone.' : 'Plugin source catalogue unavailable on this phone.'); }
	      if (message) { parts.push(message); }
	      status.textContent = parts.join(' ');
	    }
	
	    item.parseSources = function(value) {
	      var parsed;
	      var result = [];
	      var i;
	      var j;
	      var entry;
	      var existingIndex;
	      try {
	        parsed = typeof value === 'string' ? JSON.parse(value || '[]') : value;
	      } catch (e) {
	        parsed = [];
	      }
	      if (!Array.isArray(parsed)) { return result; }
	      for (i = 0; i < parsed.length && i < 256; i += 1) {
	        entry = cleanEntry(parsed[i]);
	        if (!entry) { continue; }
	        existingIndex = -1;
	        for (j = 0; j < result.length; j += 1) {
	          if (sameEntry(result[j], entry)) { existingIndex = j; break; }
	        }
	        if (existingIndex >= 0) {
	          if (actionsMode && entry.confirm === true) { result[existingIndex].confirm = true; }
	        } else if (result.length < MAX_ENABLED) {
	          result.push(entry);
	        }
	      }
	      return result;
	    };
	
	    selected = item.parseSources(item.config && item.config.defaultValue || '[]');
	
	    item.collectSources = function() {
	      return selected.slice(0, MAX_ENABLED);
	    };
	
	    if (!actionsMode) {
	      item.appendActions = function(incomingActionRoot) {
	        var sourceList = root.querySelector('[data-plugin-list="sources"]');
	        var actionWarning;
	        var actionStatus;
	        var groupsToMount;
	        if (!incomingActionRoot || !body || !sourceList || !incomingActionRoot.querySelector('[data-plugin-list="actions"]')) { return false; }
	        groupsToMount = mountedActionGroups.slice();
	        if (actionRoot !== incomingActionRoot) {
	          if (actionRoot && actionMountListenerAdded) {
	            actionRoot.removeEventListener('plugin-actions-rendered', actionsRendered);
	            actionRoot.removeEventListener('plugin-actions-counts-changed', actionsCountsChanged);
	          }
	          detachMountedActionGroups();
	          groupsToMount = [];
	          actionRoot = incomingActionRoot;
	          actionMountListenerAdded = false;
	        }
	        actionRoot.setAttribute('data-plugin-kind', 'actions');
	        body.insertBefore(actionRoot, sourceList.nextSibling);
	        actionWarning = actionRoot.querySelector('.plugin-sources-warning');
	        actionStatus = actionRoot.querySelector('[data-plugin-status]');
	        if (actionWarning) { body.insertBefore(actionWarning, sourceList); }
	        if (actionStatus) { body.insertBefore(actionStatus, sourceList); }
	        if (!actionMountListenerAdded) {
	          actionRoot.addEventListener('plugin-actions-rendered', actionsRendered);
	          actionRoot.addEventListener('plugin-actions-counts-changed', actionsCountsChanged);
	          actionMountListenerAdded = true;
	        }
	        actionRoot.style.display = 'none';
	        groupsToMount = groupsToMount.concat(directActionGroups());
	        mountActionGroups(groupsToMount);
	        setExpanded(body.style.display !== 'none');
	        return true;
	      };
	    }
	
	    item.renderSources = function(sources) {
	      var list = root.querySelector('[data-plugin-list]');
	      var groups = [];
	      var previousActionGroups = [];
	      var group;
	      var source;
	      var renderedEvent;
	      var i;
	
	      selected = item.parseSources(sources);
	      if (!actionsMode) {
	        captureExpandedPlugins();
	        previousActionGroups = mountedActionGroups.slice();
	        detachMountedActionGroups();
	      }
	      list.textContent = '';
	      for (i = 0; i < catalogue.length; i += 1) {
	        source = catalogue[i];
	        group = findGroup(groups, source.plugin);
	        if (!group) { group = addGroup(groups, source.plugin, source.pluginName); }
	        addAvailableSource(group, source, i);
	      }
	      selected.forEach(function(choice) {
	        if (catalogue.some(function(entry) { return sameEntry(entry, choice); })) { return; }
	        group = findGroup(groups, choice.plugin);
	        if (!group) { group = addGroup(groups, choice.plugin, 'Unavailable plugin'); }
	        addUnavailableSource(group, choice);
	      });
	      groups.forEach(function(entry) { list.appendChild(entry.root); });
	      renderedGroups = groups.map(function(entry) { return entry.root; });
	      item.$manipulatorTarget.set('value', JSON.stringify(selected));
	      updateKindCounts();
	      updateStatus();
	      if (!actionsMode && actionRoot) {
	        mountActionGroups(previousActionGroups.concat(directActionGroups()));
	      }
	      setExpanded(body.style.display !== 'none');
	      if (actionsMode && root.dispatchEvent) {
	        renderedEvent = root.ownerDocument.createEvent('Event');
	        renderedEvent.initEvent('plugin-actions-rendered', true, false);
	        root.dispatchEvent(renderedEvent);
	      }
	    };
	
	    function syncValue() {
	      item.$manipulatorTarget.set('value', JSON.stringify(selected));
	      updateKindCounts();
	      if (actionsMode && root.dispatchEvent) {
	        var countEvent = root.ownerDocument.createEvent('Event');
	        countEvent.initEvent('plugin-actions-counts-changed', true, false);
	        root.dispatchEvent(countEvent);
	      }
	      updateStatus();
	      item.trigger('change');
	    }
	
	    function closestByAttr(element, attr) {
	      while (element && element !== root) {
	        if (element.getAttribute && element.getAttribute(attr) !== null) { return element; }
	        element = element.parentNode;
	      }
	      return null;
	    }
	
	    function directChildByClass(parent, className) {
	      var children = parent ? parent.children : [];
	      var i;
	      for (i = 0; i < children.length; i += 1) {
	        if (children[i].classList && children[i].classList.contains(className)) { return children[i]; }
	      }
	      return null;
	    }
	
	    function visibleFocusTarget(candidate) {
	      var node = candidate;
	      var children;
	      var summary;
	      var i;
	      var blocked = false;
	      while (node && node !== root) {
	        if (node.hidden) { return null; }
	        if (node.tagName && node.tagName.toLowerCase() === 'details' && !node.open) {
	          children = node.children;
	          summary = null;
	          for (i = 0; i < children.length; i += 1) {
	            if (children[i].tagName && children[i].tagName.toLowerCase() === 'summary') {
	              summary = children[i];
	              break;
	            }
	          }
	          if (summary && !summary.hidden) { return candidate === summary ? candidate : summary; }
	          blocked = true;
	        }
	        node = node.parentNode;
	      }
	      return blocked ? null : candidate;
	    }
	
	    function insideActionUi(element) {
	      while (element && element !== root) {
	        if (element.getAttribute && element.getAttribute('data-plugin-kind') === 'actions') { return true; }
	        element = element.parentNode;
	      }
	      return false;
	    }
	
	    function bindActionGroup(groupRoot) {
	      if (!actionsMode || groupRoot._pluginActionEventsBound) { return; }
	      groupRoot._pluginActionEventsBound = true;
	      ['click', 'change'].forEach(function(type) {
	        groupRoot.addEventListener(type, function(event) {
	          var forwarded;
	          event.stopPropagation();
	          forwarded = root.ownerDocument.createEvent('Event');
	          forwarded.initEvent(type, true, false);
	          forwarded.pluginActionTarget = event.target;
	          root.dispatchEvent(forwarded);
	        });
	      });
	    }
	
	    root.addEventListener('click', function(event) {
	      var target = event.pluginActionTarget || event.target;
	      var toggle = closestByAttr(target, 'data-plugin-toggle');
	      var removeButton = closestByAttr(target, 'data-plugin-remove');
	      var key = removeButton && removeButton.getAttribute('data-plugin-remove');
	      var selectedIndex;
	      var row;
	      var group;
	      var rowGroup;
	      var ownRows;
	      var nestedActions;
	      var nextFocus;
	      var detailRows;
	      var detailIndex;
	
	      if (!actionsMode && insideActionUi(target)) { return; }
	      if (toggle) {
	        setExpanded(body.style.display === 'none');
	        return;
	      }
	      if (!key) { return; }
	      selectedIndex = -1;
	      selected.some(function(choice, index) { if (keyFor(choice) === key) { selectedIndex = index; return true; } return false; });
	      if (selectedIndex < 0) { return; }
	      row = closestByAttr(removeButton, 'data-unavailable-key');
	      rowGroup = row && row.parentNode;
	      group = closestByAttr(removeButton, 'data-plugin-group');
	      selected.splice(selectedIndex, 1);
	      if (row && row.parentNode) { row.parentNode.removeChild(row); }
	      detailRows = group ? group.querySelectorAll('[data-source-key]') : [];
	      for (detailIndex = 0; detailIndex < detailRows.length; detailIndex += 1) {
	        if (detailRows[detailIndex].getAttribute('data-source-key') === key) {
	          detailRows[detailIndex].parentNode.removeChild(detailRows[detailIndex]);
	          break;
	        }
	      }
	      ownRows = directChildByClass(group, 'plugin-source-rows');
	      if (group && (!ownRows || !ownRows.querySelector('.plugin-source-row, .plugin-source-unavailable'))) {
	        nextFocus = group.nextSibling && group.nextSibling.querySelector('[data-plugin-remove]');
	        if (!nextFocus && group.previousSibling) { nextFocus = group.previousSibling.querySelector('[data-plugin-remove]'); }
	        if (!actionsMode) {
	          nestedActions = directChildByClass(group, 'plugin-action-group');
	          if (nestedActions && group.parentNode) {
	            var actionHeading = nestedActions.querySelector('.plugin-source-group-title');
	            if (actionHeading) { actionHeading.hidden = false; }
	            expandedByPlugin[group.getAttribute('data-plugin-group')] = !!group.open;
	            nestedActions.open = !!group.open;
	            bindPluginToggle(nestedActions);
	            group.parentNode.insertBefore(nestedActions, group.nextSibling);
	            if (!nextFocus) { nextFocus = nestedActions.querySelector('[data-plugin-remove]'); }
	          }
	        }
	        if (group.parentNode) { group.parentNode.removeChild(group); }
	        if (actionsMode) {
	          mountedActionGroups = mountedActionGroups.filter(function(actionGroup) { return actionGroup !== group; });
	        }
	      } else {
	        nextFocus = rowGroup && rowGroup.querySelector('[data-plugin-remove]');
	      }
	      nextFocus = visibleFocusTarget(nextFocus);
	      if (!nextFocus && actionsMode) {
	        var parentBody = masterBody();
	        var masterRoot = parentBody && parentBody.parentNode;
	        nextFocus = masterRoot && masterRoot.querySelector('[data-plugin-toggle]');
	      }
	      if (!nextFocus) { nextFocus = root.querySelector('[data-plugin-toggle]'); }
	      if (nextFocus && nextFocus.focus) { nextFocus.focus(); }
	      syncValue();
	    });
	
	    root.addEventListener('change', function(event) {
	      var target = event.pluginActionTarget || event.target;
	      var askFirstIndex;
	      var sourceIndex = target.getAttribute && target.getAttribute('data-plugin-index');
	      var source;
	      var selectedIndex;
	      var actionRow;
	
	      if (!actionsMode && insideActionUi(target)) { return; }
	      if (actionsMode) {
	        askFirstIndex = target.getAttribute && target.getAttribute('data-ask-first-index');
	        if (askFirstIndex !== null && askFirstIndex !== undefined) {
	          source = catalogue[parseInt(askFirstIndex, 10)];
	          if (!source) { return; }
	          selectedIndex = -1;
	          selected.some(function(choice, index) { if (sameEntry(choice, source)) { selectedIndex = index; return true; } return false; });
	          if (selectedIndex >= 0) {
	            if (target.checked) { selected[selectedIndex].confirm = true; }
	            else { delete selected[selectedIndex].confirm; }
	            syncValue();
	          }
	          return;
	        }
	      }
	      if (sourceIndex === null || sourceIndex === undefined) { return; }
	      source = catalogue[parseInt(sourceIndex, 10)];
	      if (!source) { return; }
	      selectedIndex = -1;
	      selected.some(function(choice, index) { if (sameEntry(choice, source)) { selectedIndex = index; return true; } return false; });
	      if (target.checked && selectedIndex < 0) {
	        if (selected.length >= MAX_ENABLED) {
	          target.checked = false;
	          updateStatus('Maximum of 16 enabled plugin ' + (actionsMode ? 'actions' : 'sources') + ' reached.');
	          return;
	        }
	        selected.push(actionsMode
	          ? { plugin: source.plugin, action: source.action }
	          : { plugin: source.plugin, category: source.category, item: source.item });
	      } else if (!target.checked && selectedIndex >= 0) {
	        selected.splice(selectedIndex, 1);
	      }
	      if (actionsMode) {
	        actionRow = closestByAttr(target, 'data-action-row');
	        syncActionAskFirst(actionRow, target.checked);
	      }
	      syncValue();
	    });
	    item.renderSources(selected);
	    setExpanded(false);
	  },
	  defaults: { defaultValue: '[]' }
	};


/***/ }),
/* 10 */
/***/ (function(module, exports, __webpack_require__) {

	var sourceComponent = __webpack_require__(9);
	var component = {};
	
	Object.keys(sourceComponent).forEach(function(key) {
	  component[key] = sourceComponent[key];
	});
	
	component.name = 'plugin_actions';
	component.style = '';
	component.template = '<div class="component component-plugin-sources component-plugin-actions" data-plugin-kind="actions"><p class="plugin-sources-warning">Sources are read-only. Enabled actions run automatically without confirmation unless Ask first is on. Ask first requires Confirm or Deny on watch. Actions can change external services. Arguments and results go to your model provider. Pebble may ask for permission. Canceling cannot undo an action already started.</p><p class="plugin-sources-status" data-plugin-status role="status" aria-live="polite"></p><div data-plugin-list="actions"></div><input data-manipulator-target type="hidden" /></div>';
	
	module.exports = component;


/***/ }),
/* 11 */
/***/ (function(module, exports) {

	module.exports = {
	  name: 'mcp_servers',
	  template: '<div class="component component-mcp-servers"><button type="button" class="mcp-toggle" data-mcp-toggle><span class="mcp-toggle-title">MCP Servers</span><span class="mcp-toggle-subtitle">Optional tool providers</span></button><div class="mcp-body" data-mcp-body style="display:none;"><p class="mcp-help">Remote MCP servers can receive prompt context during tool calls. Add only servers you trust.</p><div data-mcp-list></div><button type="button" class="mcp-add" data-mcp-add><span class="mcp-add-plus">+</span> Add MCP Server</button><input data-manipulator-target type="hidden" /></div></div>',
	  style: '.component-mcp-servers{padding:.9rem 1rem}.component-mcp-servers .mcp-toggle{position:relative;display:block;width:100%;min-width:0;min-height:52px;margin:0;padding:.75rem 2.7rem .75rem .85rem;background:linear-gradient(135deg,#1c2a39,#111a24);border:1px solid #405064;border-radius:.55rem;box-shadow:0 .2rem .7rem rgba(0,0,0,.22);color:#fff;font:inherit;text-align:left;text-transform:none}.component-mcp-servers .mcp-toggle:after{content:"+";position:absolute;top:50%;right:.8rem;width:1.55rem;height:1.55rem;margin-top:-.775rem;background:#f0a94b;border-radius:999px;color:#17202a;font-size:1rem;font-weight:700;line-height:1.48rem;text-align:center}.component-mcp-servers.open .mcp-toggle:after{content:"-"}.component-mcp-servers .mcp-toggle:focus{border-color:#f0a94b;box-shadow:0 0 0 2px rgba(240,169,75,.25);outline:0}.component-mcp-servers .mcp-toggle-title{display:block;font-size:1rem;font-weight:700;letter-spacing:.01em}.component-mcp-servers .mcp-toggle-subtitle{display:block;margin-top:.12rem;color:#aeb9c7;font-size:.78rem}.component-mcp-servers .mcp-body{padding:.75rem 0 0}.component-mcp-servers .mcp-help{margin:.1rem 0 .8rem;color:#aeb9c7;font-size:.82rem;line-height:1.45}.component-mcp-servers .mcp-server{margin:.75rem 0;padding:.8rem;background:#111b25;border:1px solid #36485a;border-radius:.6rem;box-shadow:inset 0 1px 0 rgba(255,255,255,.03)}.component-mcp-servers .mcp-server-header{display:flex;align-items:center;justify-content:space-between;gap:.75rem;margin:0 0 .65rem;padding-bottom:.6rem;border-bottom:1px solid #2f4051}.component-mcp-servers .mcp-server-title{color:#fff;font-size:.92rem;font-weight:700}.component-mcp-servers button{min-width:0;margin:0;font:inherit;text-transform:none}.component-mcp-servers .mcp-delete{flex:0 0 auto;min-height:40px;padding:.4rem .7rem;background:#302125;border:1px solid #70404a;border-radius:999px;color:#e6a9af;font-size:.78rem;font-weight:600}.component-mcp-servers .mcp-delete:focus,.component-mcp-servers .mcp-add:focus{border-color:#f0a94b;box-shadow:0 0 0 2px rgba(240,169,75,.25);outline:0}.component-mcp-servers .mcp-enabled{display:flex;align-items:center;justify-content:space-between;min-height:44px;margin:.45rem 0 .7rem;padding:.5rem .65rem;background:#0d1620;border:1px solid #334354;border-radius:.45rem;color:#dce4f0}.component-mcp-servers .mcp-enabled input{width:1.15rem;height:1.15rem;margin:0;accent-color:#f0a94b}.component-mcp-servers label{display:block;margin:.6rem 0;padding:0}.component-mcp-servers .mcp-label{display:block;margin-bottom:.28rem;color:#b9c5d1;font-size:.78rem;font-weight:600}.component-mcp-servers input:not([type="checkbox"]):not([type="hidden"]){display:block;box-sizing:border-box;width:100%;min-height:44px;padding:.55rem .65rem;background:#0f1822;border:1px solid #405064;border-radius:.4rem;color:#f5f7fa;font:inherit}.component-mcp-servers input::-webkit-input-placeholder{color:#8492a2}.component-mcp-servers input::placeholder{color:#8492a2;opacity:1}.component-mcp-servers input:focus{border-color:#f0a94b;box-shadow:0 0 0 2px rgba(240,169,75,.25);outline:0}.component-mcp-servers .mcp-header-row{display:flex;align-items:flex-end;gap:.55rem;margin-top:.8rem;padding-top:.2rem;border-top:1px solid #2f4051}.component-mcp-servers .mcp-header-row label{flex:1 1 10rem}.component-mcp-servers .mcp-header-row .mcp-delete{margin-bottom:.6rem}.component-mcp-servers .mcp-add{display:block;width:100%;min-height:44px;margin-top:.7rem;padding:.55rem .75rem;background:#263648;border:1px solid #52657b;border-radius:.45rem;color:#f5f7fa;font-weight:600}.component-mcp-servers .mcp-add-plus{display:inline-block;margin-right:.3rem;color:#f0a94b;font-weight:700}@media(max-width:34rem){.component-mcp-servers .mcp-server{padding:.7rem}.component-mcp-servers .mcp-header-row{display:block}.component-mcp-servers .mcp-header-row .mcp-delete{width:100%;margin-bottom:.35rem}}',
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


/***/ }),
/* 12 */
/***/ (function(module, exports) {

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


/***/ }),
/* 13 */
/***/ (function(module, exports, __webpack_require__) {

	var opencodeSession = __webpack_require__(14);
	
	var MAX_MODELS = 500;
	var MAX_MODEL_ID_CHARS = 256;
	var MAX_TOTAL_MODEL_CHARS = 30000;
	var DISCOVERY_TIMEOUT_MS = 15000;
	var CACHE_KEY = 'llm_thing_model_list_cache_v1';
	var MAX_CACHE_ENTRIES = 8;
	var refreshGenerations = {};
	
	function trim(value) {
	  return String(value === undefined || value === null ? '' : value).replace(/^\s+|\s+$/g, '');
	}
	
	function deriveModelsUrl(endpoint) {
	  var url = trim(endpoint).replace(/[?#].*$/, '').replace(/\/+$/, '');
	  var parts = /^(https?:\/\/[^\/?#]+)(\/.*)$/i.exec(url);
	  var path;
	
	  if (!parts) {
	    return '';
	  }
	
	  path = parts[2];
	  if (/\/models$/i.test(path)) {
	    return parts[1] + path;
	  }
	  if (/\/(responses|chat\/completions|messages)$/i.test(path)) {
	    return parts[1] + path.replace(/\/(responses|chat\/completions|messages)$/i, '/models');
	  }
	  return '';
	}
	
	function normalizeModels(values) {
	  var seen = {};
	  var models = [];
	  var totalChars = 0;
	  var id;
	  var seenKey;
	  var i;
	
	  if (!Array.isArray(values)) {
	    return [];
	  }
	
	  for (i = 0; i < values.length && models.length < MAX_MODELS; i += 1) {
	    id = trim(values[i] && typeof values[i] === 'object' ? values[i].id : values[i]);
	    seenKey = 'model:' + id;
	    if (!id || id.length > MAX_MODEL_ID_CHARS || seen[seenKey]) {
	      continue;
	    }
	    if (totalChars + id.length > MAX_TOTAL_MODEL_CHARS) {
	      break;
	    }
	    seen[seenKey] = true;
	    models.push(id);
	    totalChars += id.length;
	  }
	
	  models.sort(function(left, right) {
	    left = left.toLowerCase();
	    right = right.toLowerCase();
	    return left < right ? -1 : (left > right ? 1 : 0);
	  });
	  return models;
	}
	
	function parseModels(responseText) {
	  var parsed;
	
	  try {
	    parsed = JSON.parse(responseText || '');
	  } catch (e) {
	    return [];
	  }
	  if (!parsed || !Array.isArray(parsed.data)) {
	    return [];
	  }
	  return normalizeModels(parsed.data);
	}
	
	function hashCredentialScope(value) {
	  var first = 2166136261;
	  var second = 5381;
	  var i;
	
	  for (i = 0; i < value.length; i += 1) {
	    first = (first * 31 + value.charCodeAt(i)) | 0;
	    second ^= value.charCodeAt(i);
	    second = (second + (second << 10)) | 0;
	    second ^= second >>> 6;
	  }
	  second = (second + (second << 3)) | 0;
	  second ^= second >>> 11;
	  second = (second + (second << 15)) | 0;
	  return ('00000000' + (first >>> 0).toString(16)).slice(-8) + ('00000000' + (second >>> 0).toString(16)).slice(-8);
	}
	
	function getScope(settings) {
	  var endpoint = trim(settings && settings.Endpoint);
	  var apiKey = trim(settings && settings.ApiKey);
	  var modelsUrl = deriveModelsUrl(endpoint);
	
	  if (!endpoint) {
	    return { status: 'Enter an endpoint and save settings before refreshing models. Manual model entry remains available.' };
	  }
	  if (!apiKey) {
	    return { status: 'Enter an API key and save settings before refreshing models. Manual model entry remains available.' };
	  }
	  if (!modelsUrl) {
	    return { status: 'Could not derive a models URL. Manual model entry remains available.' };
	  }
	  return { scope: hashCredentialScope(modelsUrl + '\u0000' + apiKey), modelsUrl: modelsUrl };
	}
	
	function readCache() {
	  var parsed;
	  var records;
	  var result = [];
	  var i;
	  var record;
	  var models;
	
	  try {
	    parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
	  } catch (e) {
	    return result;
	  }
	  records = Array.isArray(parsed) ? parsed : [];
	  for (i = 0; i < records.length && result.length < MAX_CACHE_ENTRIES; i += 1) {
	    record = records[i];
	    if (!record || !/^[0-9a-f]{16}$/.test(record.scope || '') || !Array.isArray(record.models)) {
	      continue;
	    }
	    models = normalizeModels(record.models);
	    if (!models.length) {
	      continue;
	    }
	    result.push({
	      scope: record.scope,
	      models: models,
	      status: trim(record.status).substring(0, 300)
	    });
	  }
	  return result;
	}
	
	function writeCache(records) {
	  try {
	    localStorage.setItem(CACHE_KEY, JSON.stringify(records.slice(0, MAX_CACHE_ENTRIES)));
	  } catch (e) {
	    // Cached model discovery is optional when phone storage is unavailable.
	  }
	}
	
	function modelCountStatus(count) {
	  return count + (count === 1 ? ' cached model. ' : ' cached models. ') +
	    'Save & Refresh Models, then reopen settings to select the updated list.';
	}
	
	function findCachedRecord(records, scope) {
	  var i;
	
	  for (i = 0; i < records.length; i += 1) {
	    if (records[i].scope === scope) {
	      return i;
	    }
	  }
	  return -1;
	}
	
	function getCached(settings) {
	  var scopeInfo = getScope(settings);
	  var records;
	  var index;
	  var record;
	
	  if (!scopeInfo.scope) {
	    return { models: [], status: scopeInfo.status };
	  }
	  records = readCache();
	  index = findCachedRecord(records, scopeInfo.scope);
	  if (index === -1) {
	    return {
	      models: [],
	      status: 'No cached model list. Save & Refresh Models, then reopen settings. Manual model entry remains available.'
	    };
	  }
	  record = records[index];
	  return { models: record.models, status: record.status || modelCountStatus(record.models.length) };
	}
	
	function cacheRefreshResult(scope, result, callback) {
	  var records = readCache();
	  var index = findCachedRecord(records, scope);
	  var generation = refreshGenerations[scope];
	  var cached;
	  var status;
	
	  if (generation !== undefined && result.generation !== generation) {
	    callback(result.value);
	    return;
	  }
	
	  if (result.value.models && result.value.models.length) {
	    cached = {
	      scope: scope,
	      models: normalizeModels(result.value.models),
	      status: modelCountStatus(result.value.models.length)
	    };
	  } else if (index !== -1) {
	    cached = records[index];
	    status = 'Refresh failed: ' + result.value.status + ' Showing ' + cached.models.length +
	      (cached.models.length === 1 ? ' cached model. ' : ' cached models. ') +
	      'Reopen settings to use saved models.';
	    cached.status = status;
	  }
	
	  if (cached) {
	    if (index !== -1) {
	      records.splice(index, 1);
	    }
	    records.unshift(cached);
	    writeCache(records);
	    callback({ models: cached.models, status: cached.status });
	    return;
	  }
	  callback(result.value);
	}
	
	function discover(settings, callback) {
	  var endpoint = trim(settings && settings.Endpoint);
	  var apiKey = trim(settings && settings.ApiKey);
	  var modelsUrl;
	  var request;
	  var finished = false;
	
	  function finish(models, status) {
	    if (finished) {
	      return;
	    }
	    finished = true;
	    callback({ models: models || [], status: status });
	  }
	
	  if (!endpoint) {
	    finish([], 'Enter an endpoint and save settings to load models.');
	    return null;
	  }
	  if (!apiKey) {
	    finish([], 'Enter an API key and save settings to load models.');
	    return null;
	  }
	  modelsUrl = deriveModelsUrl(endpoint);
	  if (!modelsUrl) {
	    finish([], 'Could not derive a models URL. Manual model entry remains available.');
	    return null;
	  }
	
	  request = new XMLHttpRequest();
	  request.open('GET', modelsUrl, true);
	  request.timeout = DISCOVERY_TIMEOUT_MS;
	  request.setRequestHeader('Authorization', 'Bearer ' + apiKey);
	  opencodeSession.applySessionHeader(request, modelsUrl);
	  request.onload = function() {
	    var models;
	
	    if (request.status < 200 || request.status >= 300) {
	      finish([], 'Could not load models (HTTP ' + request.status + '). Manual entry remains available.');
	      return;
	    }
	    models = parseModels(request.responseText);
	    if (!models.length) {
	      finish([], 'No models found in the endpoint response. Manual entry remains available.');
	      return;
	    }
	    finish(models, models.length + (models.length === 1 ? ' model loaded.' : ' models loaded.'));
	  };
	  request.onerror = function() {
	    finish([], 'Could not load models from the endpoint. Manual entry remains available.');
	  };
	  request.ontimeout = function() {
	    finish([], 'Loading models timed out. Manual entry remains available.');
	  };
	  request.send();
	  return request;
	}
	
	function refresh(settings, callback) {
	  var scopeInfo = getScope(settings);
	  var generation;
	
	  if (!scopeInfo.scope) {
	    callback({ models: [], status: scopeInfo.status });
	    return null;
	  }
	  generation = (refreshGenerations[scopeInfo.scope] || 0) + 1;
	  refreshGenerations[scopeInfo.scope] = generation;
	  return discover(settings, function(value) {
	    cacheRefreshResult(scopeInfo.scope, { value: value, generation: generation }, callback);
	  });
	}
	
	module.exports = {
	  deriveModelsUrl: deriveModelsUrl,
	  parseModels: parseModels,
	  discover: discover,
	  getCached: getCached,
	  refresh: refresh,
	  cacheKey: CACHE_KEY,
	  maxCacheEntries: MAX_CACHE_ENTRIES
	};


/***/ }),
/* 14 */
/***/ (function(module, exports) {

	var SESSION_HEADER = 'X-OpenCode-Session';
	
	var s_conversation_session_id = null;
	
	function randomHex(count) {
	  var result = '';
	  var i;
	
	  for (i = 0; i < count; i += 1) {
	    result += '0123456789abcdef'.charAt(Math.floor(Math.random() * 16));
	  }
	
	  return result;
	}
	
	function generateSessionId() {
	  return randomHex(8) + '-' + randomHex(4) + '-' + randomHex(4) + '-' + randomHex(4) + '-' + randomHex(12);
	}
	
	function getConversationSessionId() {
	  if (!s_conversation_session_id) {
	    s_conversation_session_id = generateSessionId();
	  }
	
	  return s_conversation_session_id;
	}
	
	function rotateConversationSessionId() {
	  s_conversation_session_id = generateSessionId();
	
	  return s_conversation_session_id;
	}
	
	function endpointHost(endpoint) {
	  var match;
	
	  try {
	    match = String(endpoint || '').match(/^https?:\/\/([^\/]+)/i);
	    return match ? match[1].toLowerCase() : '';
	  } catch (e) {
	    return '';
	  }
	}
	
	function isOpencodeEndpoint(endpoint) {
	  var host = endpointHost(endpoint);
	
	  return host === 'opencode.ai' || host.substring(host.length - '.opencode.ai'.length) === '.opencode.ai';
	}
	
	function applySessionHeader(request, endpoint) {
	  if (!request || typeof request.setRequestHeader !== 'function') {
	    return false;
	  }
	
	  if (!isOpencodeEndpoint(endpoint)) {
	    return false;
	  }
	
	  request.setRequestHeader(SESSION_HEADER, getConversationSessionId());
	  return true;
	}
	
	function resetForTests() {
	  s_conversation_session_id = null;
	}
	
	module.exports = {
	  SESSION_HEADER: SESSION_HEADER,
	  getConversationSessionId: getConversationSessionId,
	  rotateConversationSessionId: rotateConversationSessionId,
	  isOpencodeEndpoint: isOpencodeEndpoint,
	  applySessionHeader: applySessionHeader,
	  resetForTests: resetForTests
	};


/***/ }),
/* 15 */
/***/ (function(module, exports, __webpack_require__) {

	var settingsTheme = __webpack_require__(16);
	
	module.exports = {
	  name: 'model_selector',
	  template: '<div class="component component-model-selector"><span class="model-selector-label">{{{label}}}</span><div class="model-selector-controls"><button type="button" data-model-load>Save &amp; Refresh Models</button><select data-model-select disabled><option value="">Load models to choose</option></select></div><label class="model-selector-custom" data-model-custom-row><span>Custom model</span><input type="text" data-model-custom placeholder="{{placeholder}}" /></label><div class="model-selector-status" data-model-status>{{{description}}}</div><input data-manipulator-target type="hidden" /></div>',
	  style: settingsTheme + '.component-model-selector{padding:.9rem 1rem}.component-model-selector .model-selector-label{display:block;margin-bottom:.5rem;color:#f2f5f8;font-size:.94rem}.component-model-selector .model-selector-controls{display:flex;align-items:stretch;gap:.5rem}.component-model-selector button{flex:0 0 auto;min-width:8.25rem;min-height:44px;margin:0;padding:.55rem .75rem;background:#263648;border:1px solid #52657b;border-radius:.4rem;color:#f5f7fa;font:inherit;font-weight:600;text-transform:none}.component-model-selector button:disabled{opacity:.55}.component-model-selector select,.component-model-selector input{box-sizing:border-box;width:100%;min-height:44px;padding:.55rem .65rem;background:#0f1822;border:1px solid #405064;border-radius:.4rem;color:#f5f7fa;font:inherit}.component-model-selector select{min-width:0;flex:1 1 auto}.component-model-selector select:focus,.component-model-selector input:focus,.component-model-selector button:focus{border-color:#f0a94b;box-shadow:0 0 0 2px rgba(240,169,75,.25);outline:0}.component-model-selector input::-webkit-input-placeholder{color:#8492a2}.component-model-selector input::placeholder{color:#8492a2;opacity:1}.component-model-selector .model-selector-custom{display:block;margin-top:.65rem;padding:0}.component-model-selector .model-selector-custom span{display:block;margin-bottom:.3rem;color:#aeb9c7;font-size:.8rem}.component-model-selector .model-selector-status{min-height:1.05rem;margin-top:.5rem;color:#aeb9c7;font-size:.78rem;line-height:1.4}@media(max-width:34rem){.component-model-selector .model-selector-controls{display:block}.component-model-selector .model-selector-controls button{width:100%;margin-bottom:.5rem}.component-model-selector .model-selector-controls select{display:block;width:100%}}',
	  defaults: {
	    label: 'Model',
	    placeholder: 'gpt-4.1-mini',
	    description: 'Enter a model manually, or save and refresh the list. Reopen settings to choose refreshed models.',
	    modelsEncoded: '',
	    modelsStatus: ''
	  },
	  manipulator: {
	    get: function() {
	      return this.currentModel || '';
	    },
	    set: function(value) {
	      this.setModel(value);
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
	  initialize: function(unused, clay) {
	    var item = this;
	    var root = item.$element[0];
	    var loadButton = root.querySelector('[data-model-load]');
	    var select = root.querySelector('[data-model-select]');
	    var customRow = root.querySelector('[data-model-custom-row]');
	    var customInput = root.querySelector('[data-model-custom]');
	    var status = root.querySelector('[data-model-status]');
	
	    function trim(value) {
	      return String(value === undefined || value === null ? '' : value).replace(/^\s+|\s+$/g, '');
	    }
	
	    function setStatus(message) {
	      status.textContent = message;
	    }
	
	    function clearSelect() {
	      var option;
	
	      while (select.firstChild) {
	        select.removeChild(select.firstChild);
	      }
	      option = root.ownerDocument.createElement('option');
	      option.value = '';
	      option.textContent = 'Refresh and reopen settings to choose';
	      select.appendChild(option);
	      select.disabled = true;
	      select.value = '';
	      customRow.style.display = 'block';
	    }
	
	    item.currentModel = '';
	
	    item.setModel = function(value, forceCustom) {
	      var found = false;
	      var i;
	
	      item.currentModel = trim(value);
	      item.$manipulatorTarget.set('value', item.currentModel);
	      if (!select.disabled && !forceCustom) {
	        for (i = 1; i < select.options.length; i += 1) {
	          if (select.options[i].value === item.currentModel) {
	            found = true;
	            break;
	          }
	        }
	      }
	      select.value = found ? item.currentModel : '';
	      customRow.style.display = found ? 'none' : 'block';
	      if (!found) {
	        customInput.value = item.currentModel;
	      }
	    };
	
	    item.renderModels = function(models) {
	      var selectedFound = false;
	      var option;
	      var i;
	
	      while (select.firstChild) {
	        select.removeChild(select.firstChild);
	      }
	      option = root.ownerDocument.createElement('option');
	      option.value = '';
	      option.textContent = 'Custom model...';
	      select.appendChild(option);
	
	      for (i = 0; i < models.length; i += 1) {
	        option = root.ownerDocument.createElement('option');
	        option.value = models[i];
	        option.textContent = models[i];
	        select.appendChild(option);
	        if (models[i] === item.currentModel) {
	          selectedFound = true;
	        }
	      }
	
	      select.disabled = false;
	      item.setModel(item.currentModel, !selectedFound);
	      setStatus(models.length + (models.length === 1 ? ' model loaded.' : ' models loaded.'));
	    };
	
	    item.invalidateModels = function(message) {
	      loadButton.disabled = false;
	      clearSelect();
	      if (message) {
	        setStatus(message);
	      }
	    };
	
	    item.reloadModels = function() {
	      var configActionItem = clay && clay.getItemByMessageKey && clay.getItemByMessageKey('ConfigAction');
	      var submitButton = root.ownerDocument.querySelector('.component-submit button');
	
	      if (!configActionItem || !submitButton) {
	        setStatus('Save settings and reopen them to refresh models.');
	        return;
	      }
	      loadButton.disabled = true;
	      setStatus('Saving settings and refreshing models. Reopen settings to select the updated list.');
	      configActionItem.set('reload_models');
	      submitButton.click();
	    };
	
	    loadButton.addEventListener('click', function() {
	      item.reloadModels();
	    });
	    select.addEventListener('change', function() {
	      if (select.value) {
	        item.setModel(select.value);
	        customRow.style.display = 'none';
	      } else {
	        customRow.style.display = 'block';
	        item.setModel(customInput.value, true);
	      }
	      item.trigger('change');
	    });
	    customInput.addEventListener('input', function() {
	      if (select.disabled || !select.value) {
	        item.setModel(customInput.value, true);
	        item.trigger('change');
	      }
	    });
	
	    if (clay && clay.on && clay.EVENTS) {
	      clay.on(clay.EVENTS.AFTER_BUILD, function() {
	        var endpointItem = clay.getItemByMessageKey('Endpoint');
	        var apiKeyItem = clay.getItemByMessageKey('ApiKey');
	        var invalidate = function() {
	          item.invalidateModels('Endpoint or API key changed. Save & Refresh Models, then reopen settings to select an updated list.');
	        };
	
	        if (endpointItem && endpointItem.on) {
	          endpointItem.on('change', invalidate);
	        }
	        if (apiKeyItem && apiKeyItem.on) {
	          apiKeyItem.on('change', invalidate);
	        }
	      });
	    }
	
	    try {
	      var initialModels = JSON.parse(decodeURIComponent(item.config.modelsEncoded || ''));
	      if (Array.isArray(initialModels) && initialModels.length) {
	        item.renderModels(initialModels);
	      }
	    } catch (e) {
	      clearSelect();
	    }
	    if (item.config.modelsStatus) {
	      setStatus(item.config.modelsStatus);
	    }
	  }
	};


/***/ }),
/* 16 */
/***/ (function(module, exports) {

	module.exports = [
	  'html{min-height:100%;background:#0b1118}',
	  'body{box-sizing:border-box;height:auto;min-height:100%;margin:0;padding:1.25rem .85rem 2rem;background:#0b1118;color:#edf1f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:16px;line-height:1.45}',
	  '#main-form{box-sizing:border-box;width:100%;max-width:42rem;margin:0 auto}',
	  '#main-form *{box-sizing:border-box}',
	  '#main-form>.component-heading:first-child{padding:.4rem .2rem 0}',
	  '#main-form>.component-heading:first-child h4{margin:0;color:#fff;font-size:2rem;font-weight:700;letter-spacing:-.03em;line-height:1.1;text-transform:none}',
	  '#main-form>.component-text{padding:.55rem .2rem 1.2rem}',
	  '#main-form>.component-text p{max-width:37rem;margin:0;color:#9eabba;font-size:.92rem;line-height:1.5}',
	  '#main-form h1,#main-form h2,#main-form h3,#main-form h4{font-family:inherit;text-transform:none}',
	  '.section{overflow:hidden;margin:0 0 1rem;background:#151f2b;border:1px solid #2c3a49;border-radius:.75rem;box-shadow:0 .4rem 1.2rem rgba(0,0,0,.2)}',
	  '.section>.component{position:relative;margin-top:0;padding:.9rem 1rem}',
	  '.section>.component:not(.hide)~.component:not(.hide):after{top:0;right:1rem;left:1rem;height:1px;background:#2c3a49}',
	  '.section>.component-heading:first-child{padding:.85rem 1rem .75rem;background:#101923;border-bottom:1px solid #2c3a49;border-radius:.75rem .75rem 0 0}',
	  '.section>.component-heading:first-child h4{margin:0;color:#f0a94b;font-size:.78rem;font-weight:700;letter-spacing:.12em;line-height:1.3;text-transform:uppercase}',
	  '.section .component>label{padding:0}',
	  '.section .component .label{color:#f2f5f8;font-size:.94rem}',
	  '.section .description{padding:.4rem 0 0;color:#aeb9c7;font-size:.8rem;line-height:1.45}',
	  '.component-input>label{display:block}',
	  '.component-input .label{display:block;padding:0}',
	  '.component-input .input{display:block;max-width:none;min-width:100%;margin:.5rem 0 0}',
	  '.component-input input{display:block;width:100%;min-height:44px;padding:.6rem .7rem;background:#0f1822;border:1px solid #405064;border-radius:.4rem;color:#f5f7fa;font:inherit;appearance:none;-webkit-appearance:none}',
	  '.component-input input::-webkit-input-placeholder{color:#8492a2}',
	  '.component-input input::placeholder{color:#8492a2;opacity:1}',
	  '.component-input input:focus{border-color:#f0a94b;box-shadow:0 0 0 2px rgba(240,169,75,.25);outline:0}',
	  '.component-select>label,.component-toggle>label,.component-color>label{min-height:44px;gap:1rem}',
	  '.component-select .value{max-width:58%;overflow:hidden;color:#dce3ea;text-overflow:ellipsis;white-space:nowrap}',
	  '.component-select .value:after{border-top-color:#f0a94b}',
	  '.component-toggle .input{flex:0 0 auto;max-width:none;margin-left:auto}',
	  '.component-toggle .graphic .slide{width:3rem;height:1.55rem;background:#263545}',
	  '.component-toggle .graphic .marker{top:.125rem;left:.2rem;width:1.3rem;height:1.3rem;background:#c5ced8;box-shadow:0 1px 4px rgba(0,0,0,.45)}',
	  '.component-toggle input:checked+.graphic .slide{background:#9a6420}',
	  '.component-toggle input:checked+.graphic .marker{background:#f0a94b;transform:translateX(1.3rem)}',
	  '.component-color .value{width:3rem;height:1.55rem;border:2px solid #d7dee6;border-radius:999px;box-shadow:0 1px 5px rgba(0,0,0,.4)}',
	  '.component-color .picker-wrap .picker{background:#151f2b;border:1px solid #405064;border-radius:.75rem}',
	  '.component-button{text-align:left}',
	  '.component-button>button{width:100%;min-width:0;min-height:44px;margin:0;padding:.65rem .9rem;background:#263648;border:1px solid #52657b;border-radius:.45rem;color:#eef3f7;font:inherit;font-weight:600;text-transform:none}',
	  '.component-button>button:active{background:#31465d}',
	  '.component-button>button:focus,.component-submit>button:focus{border-color:#f0a94b;box-shadow:0 0 0 2px rgba(240,169,75,.25);outline:0}',
	  'button[aria-label="System prompt help"]{width:22px!important;min-width:22px!important;max-width:22px!important;height:22px!important;min-height:22px!important;max-height:22px!important;margin:0 0 2px 6px!important;padding:0!important;background:#263648!important;border:1px solid #6e8195!important;color:#f0a94b!important;box-shadow:none!important;font-family:inherit!important;line-height:20px!important;text-transform:none!important}',
	  '.component-submit{position:sticky;z-index:20;bottom:.65rem;margin:1.15rem 0 0;padding:.5rem;background:#101923;border:1px solid #344456;border-radius:.7rem;box-shadow:0 .45rem 1.4rem rgba(0,0,0,.45)}',
	  '.component-submit>button{display:block;width:100%;min-width:0;min-height:48px;margin:0;padding:.7rem 1rem;background:#f0a94b;border:1px solid #ffc36f;border-radius:.45rem;color:#17202a;font:inherit;font-weight:750;text-transform:none}',
	  '.component-submit>button:active{background:#d99135}',
	  '@media(max-width:34rem){body{padding:.8rem .65rem 1.25rem}#main-form>.component-heading:first-child h4{font-size:1.75rem}.section{border-radius:.65rem}.section>.component{padding:.85rem}.section>.component-heading:first-child{padding:.8rem .85rem .7rem}.section>.component:not(.hide)~.component:not(.hide):after{right:.85rem;left:.85rem}.component-select .value{max-width:55%}.component-submit{bottom:.45rem}}'
	].join('');


/***/ }),
/* 17 */
/***/ (function(module, exports) {

	var SETTINGS_KEY = 'llm_thing_settings';
	var DEFAULT_MAX_TOOL_CALLS = 4;
	var DEFAULT_REQUEST_TIMEOUT_MS = 60000;
	var DEFAULT_MCP_DISCOVERY_TIMEOUT_MS = 3000;
	var MAX_CHAT_HISTORY_MESSAGES = 16;
	var MAX_CHAT_HISTORY_MESSAGE_CHARS = 3000;
	var MAX_CHAT_HISTORY_TOTAL_CHARS = 12000;
	var MAX_RETRY_AFTER_MS = 5000;
	var MAX_SOURCES_URLS = 5;
	var API_MODES = { 'auto': 'auto', 'responses': 'responses', 'chat-completions': 'chat-completions', 'messages': 'messages' };
	var REASONING_EFFORTS = { '': '', 'none': 'none', 'minimal': 'minimal', 'low': 'low', 'medium': 'medium', 'high': 'high' };
	
	var DEFAULT_SETTINGS = {
	  Endpoint: 'https://api.openai.com/v1/responses',
	  ApiKey: '',
	  Model: 'gpt-4.1-mini',
	  RequestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
	  McpDiscoveryTimeoutMs: DEFAULT_MCP_DISCOVERY_TIMEOUT_MS,
	  SystemPrompt: 'The current date-time is $DATETIME. You are a helpful assistant. Keep answers concise for a watch screen. Format your responses in markdown, but only use bold text and lists.',
	  ShowThinking: false,
	  ShowInputContextSize: false,
	  ShowOutputContextSize: false,
	  PreserveChats: false,
	  WebSearchEnabled: false,
	  GeolocationToolEnabled: false,
	  TimelineToolEnabled: false,
	  HealthToolEnabled: false,
	  SleepToolEnabled: false,
	  PebbleMemoryToolEnabled: false,
	  MaxToolCalls: DEFAULT_MAX_TOOL_CALLS,
	  ApiMode: 'auto',
	  MaxOutputTokens: 0,
	  ReasoningEffort: '',
	  FontSize: 18,
	  BuzzStrength: 1,
	  SpeakerFeedbackEnabled: false,
	  ScrollLines: 3,
	  TouchScrollEnabled: true,
	  StartDictationQuickLaunch: false,
	  TextColor: 0x000000,
	  BackgroundColor: 0xFFFFFF,
	  PromptBackgroundColor: 0xAAAAAA,
	  BoldTextColor: 0x000000,
	  McpServersJson: '[]',
	  PluginSourcesJson: '[]',
	  PluginActionsJson: '[]'
	};
	
	function logDebug(message) {
	  console.log('[llm_thing] ' + message);
	}
	
	function clampNumber(value, min, max, fallback) {
	  var number = parseInt(value, 10);
	
	  if (isNaN(number)) {
	    return fallback;
	  }
	
	  if (number < min) {
	    return min;
	  }
	
	  if (number > max) {
	    return max;
	  }
	
	  return number;
	}
	
	function minNumber(value, min, fallback) {
	  var number = parseInt(value, 10);
	
	  if (isNaN(number)) {
	    return fallback;
	  }
	
	  if (number < min) {
	    return min;
	  }
	
	  return number;
	}
	
	function normalizeMcpDiscoveryTimeoutMs(value) {
	  return clampNumber(value, 1000, 30000, DEFAULT_MCP_DISCOVERY_TIMEOUT_MS);
	}
	
	function extend(base, extra) {
	  var result = {};
	  var key;
	  var value;
	
	  for (key in base) {
	    if (base.hasOwnProperty(key)) {
	      result[key] = base[key];
	    }
	  }
	
	  if (extra) {
	    for (key in extra) {
	      if (extra.hasOwnProperty(key) && extra[key] !== undefined && extra[key] !== null) {
	        value = extra[key];
	        if (typeof value === 'object' && value.hasOwnProperty('value')) {
	          value = value.value;
	        }
	        if (value !== '[object Object]') {
	          result[key] = value;
	        }
	      }
	    }
	  }
	
	  result.ShowThinking = result.ShowThinking === true || result.ShowThinking === 1 || result.ShowThinking === '1';
	  result.ShowInputContextSize = result.ShowInputContextSize === true || result.ShowInputContextSize === 1 || result.ShowInputContextSize === '1';
	  result.ShowOutputContextSize = result.ShowOutputContextSize === true || result.ShowOutputContextSize === 1 || result.ShowOutputContextSize === '1';
	  result.PreserveChats = result.PreserveChats === true || result.PreserveChats === 1 || result.PreserveChats === '1';
	  result.WebSearchEnabled = result.WebSearchEnabled === true || result.WebSearchEnabled === 1 || result.WebSearchEnabled === '1';
	  result.GeolocationToolEnabled = result.GeolocationToolEnabled === true || result.GeolocationToolEnabled === 1 || result.GeolocationToolEnabled === '1';
	  result.TimelineToolEnabled = result.TimelineToolEnabled === true || result.TimelineToolEnabled === 1 || result.TimelineToolEnabled === '1';
	  result.HealthToolEnabled = result.HealthToolEnabled === true || result.HealthToolEnabled === 1 || result.HealthToolEnabled === '1';
	  result.SleepToolEnabled = result.SleepToolEnabled === true || result.SleepToolEnabled === 1 || result.SleepToolEnabled === '1';
	  result.PebbleMemoryToolEnabled = result.PebbleMemoryToolEnabled === true || result.PebbleMemoryToolEnabled === 1 || result.PebbleMemoryToolEnabled === '1';
	  result.StartDictationQuickLaunch = result.StartDictationQuickLaunch === true || result.StartDictationQuickLaunch === 1 || result.StartDictationQuickLaunch === '1';
	  result.SpeakerFeedbackEnabled = result.SpeakerFeedbackEnabled === true || result.SpeakerFeedbackEnabled === 1 || result.SpeakerFeedbackEnabled === '1';
	  result.TouchScrollEnabled = result.TouchScrollEnabled === true || result.TouchScrollEnabled === 1 || result.TouchScrollEnabled === '1';
	  result.ApiMode = API_MODES.hasOwnProperty(result.ApiMode) ? API_MODES[result.ApiMode] : 'auto';
	  result.MaxOutputTokens = clampNumber(result.MaxOutputTokens, 0, 100000, 0);
	  result.ReasoningEffort = REASONING_EFFORTS.hasOwnProperty(result.ReasoningEffort) && result.ReasoningEffort !== undefined && result.ReasoningEffort !== null
	    ? REASONING_EFFORTS[result.ReasoningEffort]
	    : '';
	  result.MaxToolCalls = clampNumber(result.MaxToolCalls, 0, 16, DEFAULT_MAX_TOOL_CALLS);
	  result.RequestTimeoutMs = minNumber(result.RequestTimeoutMs, 1000, DEFAULT_REQUEST_TIMEOUT_MS);
	  result.McpDiscoveryTimeoutMs = normalizeMcpDiscoveryTimeoutMs(result.McpDiscoveryTimeoutMs);
	  result.FontSize = clampNumber(result.FontSize, 14, 28, 18);
	  if (result.FontSize !== 14 && result.FontSize !== 18 && result.FontSize !== 24 && result.FontSize !== 28) {
	    result.FontSize = 18;
	  }
	  result.BuzzStrength = clampNumber(result.BuzzStrength, 0, 3, 1);
	  result.ScrollLines = clampNumber(result.ScrollLines, 1, 10, 3);
	  return result;
	}
	
	function loadSettings() {
	  try {
	    return extend(DEFAULT_SETTINGS, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
	  } catch (e) {
	    return extend(DEFAULT_SETTINGS, null);
	  }
	}
	
	function saveSettings(settings) {
	  localStorage.setItem(SETTINGS_KEY, JSON.stringify(extend(DEFAULT_SETTINGS, settings)));
	}
	
	function trim(value) {
	  return String(value || '').replace(/^\s+|\s+$/g, '');
	}
	
	function splitCsv(value) {
	  var items = String(value || '').split(',');
	  var result = [];
	  var item;
	  var i;
	
	  for (i = 0; i < items.length; i += 1) {
	    item = trim(items[i]);
	    if (item) {
	      result.push(item);
	    }
	  }
	
	  return result;
	}
	
	function safeJson(value) {
	  try {
	    return JSON.stringify(value);
	  } catch (e) {
	    return 'null';
	  }
	}
	
	function truncate(value, maxLength) {
	  value = String(value || '');
	  if (value.length <= maxLength) {
	    return value;
	  }
	
	  return value.substring(0, maxLength - 3) + '...';
	}
	
	function collectTextFromContent(content) {
	  var text = '';
	  var i;
	
	  if (typeof content === 'string') {
	    return content;
	  }
	
	  if (!content) {
	    return '';
	  }
	
	  if (content.text) {
	    return String(content.text);
	  }
	
	  if (content.output_text) {
	    return String(content.output_text);
	  }
	
	  if (content.content) {
	    return collectTextFromContent(content.content);
	  }
	
	  if (!content.length) {
	    return '';
	  }
	
	  for (i = 0; i < content.length; i += 1) {
	    if (typeof content[i] === 'string') {
	      text += content[i];
	    } else if (content[i].text) {
	      text += content[i].text;
	    } else if (content[i].content) {
	      text += collectTextFromContent(content[i].content);
	    }
	  }
	
	  return text;
	}
	
	module.exports = {
	  DEFAULT_SETTINGS: DEFAULT_SETTINGS,
	  DEFAULT_MAX_TOOL_CALLS: DEFAULT_MAX_TOOL_CALLS,
	  DEFAULT_REQUEST_TIMEOUT_MS: DEFAULT_REQUEST_TIMEOUT_MS,
	  DEFAULT_MCP_DISCOVERY_TIMEOUT_MS: DEFAULT_MCP_DISCOVERY_TIMEOUT_MS,
	  MAX_CHAT_HISTORY_MESSAGES: MAX_CHAT_HISTORY_MESSAGES,
	  MAX_CHAT_HISTORY_MESSAGE_CHARS: MAX_CHAT_HISTORY_MESSAGE_CHARS,
	  MAX_CHAT_HISTORY_TOTAL_CHARS: MAX_CHAT_HISTORY_TOTAL_CHARS,
	  MAX_RETRY_AFTER_MS: MAX_RETRY_AFTER_MS,
	  MAX_SOURCES_URLS: MAX_SOURCES_URLS,
	  API_MODES: API_MODES,
	  REASONING_EFFORTS: REASONING_EFFORTS,
	  logDebug: logDebug,
	  clampNumber: clampNumber,
	  minNumber: minNumber,
	  normalizeMcpDiscoveryTimeoutMs: normalizeMcpDiscoveryTimeoutMs,
	  extend: extend,
	  loadSettings: loadSettings,
	  saveSettings: saveSettings,
	  trim: trim,
	  splitCsv: splitCsv,
	  safeJson: safeJson,
	  truncate: truncate,
	  collectTextFromContent: collectTextFromContent
	};


/***/ }),
/* 18 */
/***/ (function(module, exports, __webpack_require__) {

	var common = __webpack_require__(17);
	
	var CHUNK_SIZE = 400;
	var MAX_RESPONSE_CHARS = 6000;
	var MAX_SEND_ATTEMPTS = 3;
	var SEND_RETRY_DELAY_MS = 100;
	// Non-NUL style markers are stripped from display and drive watch-side fonts.
	var WATCH_BOLD_ON = '\u0001';
	var WATCH_BOLD_OFF = '\u0002';
	var WATCH_PROMPT_ON = '\u0003';
	var WATCH_PROMPT_OFF = '\u0004';
	var WATCH_SMALL_ON = '\u0005';
	var WATCH_SMALL_OFF = '\u0006';
	var HEALTH_INFO_TIMEOUT_MS = 8000;
	var ACTION_APPROVAL_TIMEOUT_MS = 60000;
	var ACTION_APPROVAL_DETAIL_MAX_BYTES = 600;
	var ACTION_APPROVAL_MESSAGE_MAX_BYTES = 1024;
	// Conservative allowance for five AppMessage tuple headers, keys, scalar values, and title.
	var ACTION_APPROVAL_WIRE_FIXED_OVERHEAD_BYTES = 128;
	
	var s_health_info_request_id = 1;
	var s_send_queue = [];
	var s_in_flight_send = null;
	var s_last_watch_settings = null;
	var s_pending_watch_settings = null;
	var s_pending_watch_settings_force = false;
	var s_sending_watch_settings = null;
	var s_latest_request_id = null;
	var s_active_xhrs = {};
	var s_pending_health_info = {};
	var s_pending_action_approvals = Object.create(null);
	var s_action_approval_id = (Date.now() % 2147483647) + 1;
	var s_progress = {
	  requestId: 0,
	  active: false,
	  current: '',
	  detail: '',
	  toolHistory: [],
	  currentTool: '',
	  currentToolHistoryLabel: '',
	  currentToolRemembered: false,
	  toolExecutions: Object.create(null),
	  activeToolExecutionIds: [],
	  currentToolExecutionId: '',
	  inputContextSize: '',
	  outputContextSize: ''
	};
	
	function requestKey(requestId) {
	  return String(requestId || 0);
	}
	
	function dictHasRequestId(dict) {
	  return dict && dict.RequestId !== undefined && dict.RequestId !== null;
	}
	
	function isCurrentRequest(requestId) {
	  return requestId !== null && requestId !== undefined && s_latest_request_id !== null &&
	    !isNaN(Number(requestId)) && Number(requestId) === Number(s_latest_request_id);
	}
	
	function isCurrentMessage(dict) {
	  return !dictHasRequestId(dict) || isCurrentRequest(dict.RequestId);
	}
	
	function failSendItem(item, error) {
	  if (!item || item.settled) {
	    return;
	  }
	  item.settled = true;
	  if (item.retryTimer !== null && item.retryTimer !== undefined) {
	    clearTimeout(item.retryTimer);
	    item.retryTimer = null;
	  }
	  if (item.onFailure) {
	    item.onFailure(error || { error: 'AppMessage failed' });
	  }
	}
	
	function pendingActionApproval(requestId, approvalId) {
	  var pending = s_pending_action_approvals[String(requestId)];
	  return pending && !pending.settled && pending.approvalId === approvalId ? pending : null;
	}
	
	function isApprovalCancel(item) {
	  return !!item && item.approvalCancel === true && item.dict && item.dict.ApprovalCancel === 1;
	}
	
	function isApprovalRequestActive(item) {
	  return !!item && item.approvalRequest && !!pendingActionApproval(item.approvalRequest.requestId, item.approvalRequest.approvalId);
	}
	
	function canSendItem(item) {
	  if (isApprovalCancel(item)) { return true; }
	  if (item && item.approvalRequest && !isApprovalRequestActive(item)) { return false; }
	  return !!item && isCurrentMessage(item.dict);
	}
	
	function succeedSendItem(item) {
	  if (!item || item.settled) {
	    return;
	  }
	  item.settled = true;
	  if (item.onSuccess) {
	    item.onSuccess();
	  }
	}
	
	function utf8BytesForCodePoint(codePoint) {
	  if (codePoint <= 0x7f) {
	    return 1;
	  }
	  if (codePoint <= 0x7ff) {
	    return 2;
	  }
	  if (codePoint <= 0xffff) {
	    return 3;
	  }
	  return 4;
	}
	
	function nextUtf8Chunk(text, start, maxBytes) {
	  var value = String(text || '');
	  var end = start;
	  var bytes = 0;
	  var first;
	  var second;
	  var width;
	  var codePoint;
	  var codePointBytes;
	
	  while (end < value.length) {
	    first = value.charCodeAt(end);
	    codePoint = first;
	    width = 1;
	    if (first >= 0xd800 && first <= 0xdbff && end + 1 < value.length) {
	      second = value.charCodeAt(end + 1);
	      if (second >= 0xdc00 && second <= 0xdfff) {
	        codePoint = 0x10000 + ((first - 0xd800) * 0x400) + (second - 0xdc00);
	        width = 2;
	      }
	    }
	    codePointBytes = utf8BytesForCodePoint(codePoint);
	    if (bytes + codePointBytes > maxBytes) {
	      break;
	    }
	    bytes += codePointBytes;
	    end += width;
	  }
	
	  return {
	    text: value.substring(start, end),
	    end: end,
	    bytes: bytes
	  };
	}
	
	function sendUtf8ChunkSequence(spec) {
	  var value = String(spec.text || '');
	  var offset = 0;
	  var chunkIndex = 0;
	
	  function stepFailed(error) {
	    if (spec.onFailure) {
	      spec.onFailure(error);
	    }
	  }
	
	  function sendNext() {
	    var chunk;
	
	    if (offset >= value.length) {
	      if (!spec.doneDict) {
	        if (spec.onSuccess) {
	          spec.onSuccess();
	        }
	        return;
	      }
	      sendMessage(spec.doneDict(), function() {
	        if (spec.onSuccess) {
	          spec.onSuccess();
	        }
	      }, stepFailed);
	      return;
	    }
	
	    chunk = nextUtf8Chunk(value, offset, CHUNK_SIZE);
	    if (!chunk.text) {
	      stepFailed(new Error('Unable to encode response chunk'));
	      return;
	    }
	
	    sendMessage(spec.chunkDict(chunk.text, chunkIndex), function() {
	      offset = chunk.end;
	      chunkIndex += 1;
	      sendNext();
	    }, stepFailed);
	  }
	
	  sendMessage(spec.resetDict(), sendNext, stepFailed);
	}
	
	function abortXhrsForKey(key) {
	  var requests = (s_active_xhrs[key] || []).slice();
	  var i;
	
	  delete s_active_xhrs[key];
	
	  for (i = 0; i < requests.length; i += 1) {
	    try {
	      requests[i].abort();
	    } catch (e) {}
	  }
	
	}
	
	function clearPendingHealthInfo(key) {
	  var pending = s_pending_health_info[key];
	
	  if (!pending) {
	    return null;
	  }
	
	  if (pending.timeout !== null && pending.timeout !== undefined) {
	    clearTimeout(pending.timeout);
	  }
	  delete s_pending_health_info[key];
	  return pending;
	}
	
	function abortStaleHealthInfo(requestId) {
	  var key;
	  var pending;
	
	  for (key in s_pending_health_info) {
	    if (s_pending_health_info.hasOwnProperty(key)) {
	      pending = s_pending_health_info[key];
	      if (Number(pending.requestId) !== Number(requestId)) {
	        clearPendingHealthInfo(key);
	      }
	    }
	  }
	}
	
	function cancelHealthInfoForRequest(requestId) {
	  var key;
	  var pending;
	
	  for (key in s_pending_health_info) {
	    if (s_pending_health_info.hasOwnProperty(key)) {
	      pending = s_pending_health_info[key];
	      if (Number(pending.requestId) === Number(requestId)) {
	        clearPendingHealthInfo(key);
	      }
	    }
	  }
	}
	
	function dropQueuedMessagesForRequest(requestId) {
	  var kept = [];
	  var dropped = [];
	  var i;
	  var item;
	
	  for (i = 0; i < s_send_queue.length; i += 1) {
	    item = s_send_queue[i];
	    if (dictHasRequestId(item.dict) && Number(item.dict.RequestId) === Number(requestId) && !isApprovalCancel(item)) {
	      dropped.push(item);
	    } else {
	      kept.push(item);
	    }
	  }
	  s_send_queue = kept;
	
	  for (i = 0; i < dropped.length; i += 1) {
	    failSendItem(dropped[i], { error: 'Request canceled' });
	  }
	}
	
	function dropStaleQueuedMessages(requestId) {
	  var kept = [];
	  var dropped = [];
	  var i;
	  var item;
	
	  for (i = 0; i < s_send_queue.length; i += 1) {
	    item = s_send_queue[i];
	    if (dictHasRequestId(item.dict) && Number(item.dict.RequestId) !== Number(requestId) && !isApprovalCancel(item)) {
	      dropped.push(item);
	    } else {
	      kept.push(item);
	    }
	  }
	
	  if (dropped.length) {
	    common.logDebug('dropped stale queued messages count=' + dropped.length);
	  }
	
	  s_send_queue = kept;
	  for (i = 0; i < dropped.length; i += 1) {
	    failSendItem(dropped[i], { error: 'Stale request' });
	  }
	}
	
	function beginRequestLifecycle(requestId) {
	  var key;
	
	  clearActionApprovalsForRequest(requestId, true);
	  s_latest_request_id = requestId;
	  for (key in s_active_xhrs) {
	    if (s_active_xhrs.hasOwnProperty(key) && key !== requestKey(requestId)) {
	      common.logDebug('aborting stale request id=' + key);
	      abortXhrsForKey(key);
	    }
	  }
	  dropStaleQueuedMessages(requestId);
	  abortStaleHealthInfo(requestId);
	  if (!s_active_xhrs[requestKey(requestId)]) {
	    s_active_xhrs[requestKey(requestId)] = [];
	  }
	  processSendQueue();
	}
	
	function finishRequestLifecycle(requestId) {
	  clearActionApprovalsForRequest(requestId, false);
	  abortPluginActionHandlesForRequest(requestId);
	  delete s_active_xhrs[requestKey(requestId)];
	}
	
	function cancelRequestLifecycle(requestId) {
	  var key;
	
	  if (!isCurrentRequest(requestId)) {
	    return false;
	  }
	
	  key = requestKey(requestId);
	  clearActionApprovalsForRequest(requestId, false);
	  s_latest_request_id = null;
	  abortXhrsForKey(key);
	  cancelHealthInfoForRequest(requestId);
	  dropQueuedMessagesForRequest(requestId);
	  if (s_in_flight_send && dictHasRequestId(s_in_flight_send.dict) &&
	      Number(s_in_flight_send.dict.RequestId) === Number(requestId)) {
	    failSendItem(s_in_flight_send, { error: 'Request canceled' });
	  }
	  progressStop(requestId);
	  processSendQueue();
	  return true;
	}
	
	function trackXhr(requestId, request) {
	  var key = requestKey(requestId);
	
	  if (!isCurrentRequest(requestId)) {
	    try {
	      request.abort();
	    } catch (e) {}
	    return false;
	  }
	
	  if (!s_active_xhrs[key]) {
	    s_active_xhrs[key] = [];
	  }
	  s_active_xhrs[key].push(request);
	  return true;
	}
	
	function untrackXhr(requestId, request) {
	  var key = requestKey(requestId);
	  var requests = s_active_xhrs[key];
	  var i;
	
	  if (!requests) {
	    return;
	  }
	
	  for (i = requests.length - 1; i >= 0; i -= 1) {
	    if (requests[i] === request) {
	      requests.splice(i, 1);
	      break;
	    }
	  }
	}
	
	function handleSendFailure(item, error) {
	  if (s_in_flight_send !== item) { return; }
	  s_in_flight_send = null;
	  if (item.settled) {
	    processSendQueue();
	    return;
	  }
	  if (item.attempts < MAX_SEND_ATTEMPTS && canSendItem(item)) {
	    item.attempts += 1;
	    if (item.approvalRequest || item.approvalCancel) {
	      common.logDebug('action approval AppMessage retry=' + item.attempts + ' stage=transport');
	    } else {
	      common.logDebug('sendAppMessage retry=' + item.attempts + ' error=' + JSON.stringify(error));
	    }
	    s_send_queue.unshift(item);
	    item.retryTimer = setTimeout(function() {
	      item.retryTimer = null;
	      processSendQueue();
	    }, SEND_RETRY_DELAY_MS);
	    return;
	  }
	  if (item.approvalRequest || item.approvalCancel) {
	    common.logDebug('action approval AppMessage failed attempts=' + item.attempts + ' stage=transport');
	  } else {
	    common.logDebug('sendAppMessage failed attempts=' + item.attempts + ': ' + JSON.stringify(error));
	  }
	  failSendItem(item, error || { error: 'AppMessage failed' });
	  processSendQueue();
	}
	
	function processSendQueue() {
	  var item;
	
	  if (s_in_flight_send || !s_send_queue.length) {
	    return;
	  }
	  if (s_send_queue[0].retryTimer !== null && s_send_queue[0].retryTimer !== undefined) {
	    return;
	  }
	
	  item = s_send_queue.shift();
	  while (item && !canSendItem(item)) {
	    if (!item.approvalRequest && !item.approvalCancel) { common.logDebug('skipping stale message request=' + item.dict.RequestId); }
	    failSendItem(item, { error: 'Stale request' });
	    if (!s_send_queue.length) {
	      return;
	    }
	    item = s_send_queue.shift();
	  }
	
	  s_in_flight_send = item;
	  try { Pebble.sendAppMessage(item.dict, function() {
	    if (s_in_flight_send !== item) {
	      return;
	    }
	    s_in_flight_send = null;
	    if (!item.settled) {
	      if (!canSendItem(item)) {
	        failSendItem(item, { error: 'Request canceled' });
	      } else {
	        succeedSendItem(item);
	      }
	    }
	    processSendQueue();
	  }, function(e) { handleSendFailure(item, e); });
	  } catch (sendError) {
	    if (item.approvalRequest || item.approvalCancel) { handleSendFailure(item, { error: 'send threw' }); }
	    else {
	      if (s_in_flight_send === item) { s_in_flight_send = null; }
	      throw sendError;
	    }
	  }
	}
	
	function sendMessage(dict, onSuccess, onFailure, sendOptions) {
	  sendOptions = sendOptions || {};
	  if (!isCurrentMessage(dict) && sendOptions.approvalCancel !== true) {
	    common.logDebug('dropping stale message request=' + dict.RequestId);
	    if (onFailure) {
	      onFailure({ error: 'Stale request' });
	    }
	    return false;
	  }
	
	  s_send_queue.push({
	    dict: dict,
	    onSuccess: onSuccess,
	    onFailure: onFailure,
	    attempts: 1,
	    retryTimer: null,
	    settled: false,
	    approvalRequest: sendOptions.approvalRequest || null,
	    approvalCancel: sendOptions.approvalCancel === true
	  });
	  processSendQueue();
	  return true;
	}
	
	function isStrictApprovalRequestId(requestId) {
	  return typeof requestId === 'number' && isFinite(requestId) && Math.floor(requestId) === requestId &&
	    requestId >= 0 && requestId <= 4294967295;
	}
	
	function nextActionApprovalId() {
	  var result = s_action_approval_id;
	  s_action_approval_id = s_action_approval_id >= 2147483647 ? 1 : s_action_approval_id + 1;
	  return result;
	}
	
	function escapeApprovalText(value) {
	  return String(value).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069\ud800-\udfff]/g, function(character) {
	    var hex;
	    if (character === '\n') { return '\\n'; }
	    if (character === '\r') { return '\\r'; }
	    if (character === '\t') { return '\\t'; }
	    hex = character.charCodeAt(0).toString(16);
	    while (hex.length < 4) { hex = '0' + hex; }
	    return '\\u' + hex;
	  });
	}
	
	function approvalArgumentText(value) {
	  var encoded;
	  if (typeof value === 'string') { return escapeApprovalText(value); }
	  if (value === null) { return 'null'; }
	  if (typeof value === 'number' || typeof value === 'boolean') { return String(value); }
	  encoded = JSON.stringify(value);
	  return typeof encoded === 'string' ? escapeApprovalText(encoded) : escapeApprovalText(String(value));
	}
	
	function formatApprovalArguments(args) {
	  var keys;
	  var lines = [];
	  var i;
	  var encoded;
	  if (!args || typeof args !== 'object' || Object.prototype.toString.call(args) === '[object Array]') {
	    encoded = JSON.stringify(args);
	    return 'Arguments:\n' + (typeof encoded === 'string' ? escapeApprovalText(encoded) : '(none)');
	  }
	  keys = Object.keys(args);
	  if (!keys.length) { return 'Arguments:\n(none)'; }
	  for (i = 0; i < keys.length; i += 1) {
	    lines.push(escapeApprovalText(keys[i]) + ': ' + approvalArgumentText(args[keys[i]]));
	  }
	  return 'Arguments:\n' + lines.join('\n');
	}
	
	function dropQueuedApprovalRequest(pending) {
	  var kept = [];
	  var dropped = [];
	  var i;
	  var item;
	  for (i = 0; i < s_send_queue.length; i += 1) {
	    item = s_send_queue[i];
	    if (item.approvalRequest && Number(item.approvalRequest.requestId) === Number(pending.requestId) &&
	        item.approvalRequest.approvalId === pending.approvalId) { dropped.push(item); }
	    else { kept.push(item); }
	  }
	  s_send_queue = kept;
	  if (s_in_flight_send && s_in_flight_send.approvalRequest &&
	      Number(s_in_flight_send.approvalRequest.requestId) === Number(pending.requestId) &&
	      s_in_flight_send.approvalRequest.approvalId === pending.approvalId) { dropped.push(s_in_flight_send); }
	  for (i = 0; i < dropped.length; i += 1) { failSendItem(dropped[i], { error: 'Approval no longer pending' }); }
	}
	
	function sendActionApprovalCancel(pending) {
	  var dict = { RequestId: pending.requestId, ApprovalId: pending.approvalId, ApprovalCancel: 1 };
	  try { sendMessage(dict, null, null, { approvalCancel: true }); } catch (e) {}
	}
	
	function settleActionApproval(pending, error, approved, suppressCallback, sendCancel) {
	  if (!pending || pending.settled) { return false; }
	  pending.settled = true;
	  if (pending.timeout !== null) { clearTimeout(pending.timeout); pending.timeout = null; }
	  if (s_pending_action_approvals[String(pending.requestId)] === pending) {
	    delete s_pending_action_approvals[String(pending.requestId)];
	  }
	  dropQueuedApprovalRequest(pending);
	  if (pending.tracked) {
	    pending.tracked = false;
	    try { untrackXhr(pending.requestId, pending.handle); } catch (e) {}
	  }
	  if (sendCancel) { sendActionApprovalCancel(pending); }
	  if (!suppressCallback && isCurrentRequest(pending.requestId)) {
	    pending.callback(error || null, approved === true);
	  }
	  return true;
	}
	
	function requestActionApproval(spec, requestId, callback) {
	  var handle;
	  var pending;
	  var approvalId;
	  var argsJson;
	  var detail;
	  var dict;
	  var bytes;
	  var key;
	  var validationError = null;
	
	  spec = spec || {};
	  if (!isStrictApprovalRequestId(requestId) || typeof callback !== 'function' || !isCurrentRequest(requestId)) {
	    if (typeof callback === 'function') { callback('Action approval request is stale; action was not run.', false); }
	    return { abort: function() {} };
	  }
	  if (typeof Pebble === 'undefined' || !Pebble || typeof Pebble.sendAppMessage !== 'function') {
	    callback('Watch confirmation is unavailable; action was not run.', false);
	    return { abort: function() {} };
	  }
	  key = String(requestId);
	  if (s_pending_action_approvals[key]) {
	    callback('Another action confirmation is pending; action was not run.', false);
	    return { abort: function() {} };
	  }
	  try {
	    if (typeof spec.plugin !== 'string' || typeof spec.pluginName !== 'string' || typeof spec.action !== 'string' ||
	        !spec.plugin || !spec.pluginName || !spec.action) { throw new Error('invalid approval identity'); }
	    argsJson = JSON.stringify(spec.args);
	    if (typeof argsJson !== 'string') { throw new Error('arguments are not JSON'); }
	    detail = 'Plugin: ' + escapeApprovalText(spec.pluginName) +
	      '\nAction: ' + escapeApprovalText(spec.action) +
	      '\n' + formatApprovalArguments(spec.args) +
	      '\n\nPlugin UUID: ' + escapeApprovalText(spec.plugin);
	    if (detail.indexOf('\u0000') !== -1) { throw new Error('NUL in approval detail'); }
	    bytes = nextUtf8Chunk(detail, 0, ACTION_APPROVAL_DETAIL_MAX_BYTES);
	    if (bytes.end !== detail.length || bytes.bytes > ACTION_APPROVAL_DETAIL_MAX_BYTES) {
	      validationError = 'Confirmation details exceed the watch limit; shorten arguments. Action was not run.';
	    } else {
	      approvalId = nextActionApprovalId();
	      dict = {
	        RequestId: requestId,
	        ApprovalRequest: 1,
	        ApprovalId: approvalId,
	        ApprovalTitle: 'Confirm action',
	        ApprovalDetail: detail
	      };
	      if (bytes.bytes + ACTION_APPROVAL_WIRE_FIXED_OVERHEAD_BYTES > ACTION_APPROVAL_MESSAGE_MAX_BYTES) {
	        validationError = 'Confirmation details exceed the watch message limit; shorten arguments. Action was not run.';
	      }
	    }
	  } catch (e) {
	    validationError = 'Confirmation details are invalid; shorten arguments. Action was not run.';
	  }
	  if (validationError) {
	    callback(validationError, false);
	    return { abort: function() {} };
	  }
	
	  pending = {
	    requestId: requestId,
	    approvalId: approvalId,
	    callback: callback,
	    timeout: null,
	    handle: null,
	    tracked: false,
	    settled: false
	  };
	  handle = { abort: function() { settleActionApproval(pending, null, false, true, true); } };
	  pending.handle = handle;
	  s_pending_action_approvals[key] = pending;
	  pending.timeout = setTimeout(function() {
	    settleActionApproval(pending, 'Watch confirmation timed out; action was not run.', false, false, true);
	  }, ACTION_APPROVAL_TIMEOUT_MS);
	  pending.tracked = true;
	  if (!trackXhr(requestId, handle)) {
	    pending.tracked = false;
	    settleActionApproval(pending, 'Watch confirmation request became stale; action was not run.', false, false, true);
	    return handle;
	  }
	  sendMessage(dict, null, function() {
	    if (pendingActionApproval(requestId, approvalId) === pending) {
	      settleActionApproval(pending, 'Could not send watch confirmation; action was not run.', false, false, true);
	    }
	  }, { approvalRequest: { requestId: requestId, approvalId: approvalId } });
	  return handle;
	}
	
	function handleActionApprovalResponse(dict) {
	  var pending;
	  var requestId;
	  var approvalId;
	  var decision;
	  if (!dict || typeof dict !== 'object' || !Object.prototype.hasOwnProperty.call(dict, 'RequestId') ||
	      !Object.prototype.hasOwnProperty.call(dict, 'ApprovalId') || !Object.prototype.hasOwnProperty.call(dict, 'ApprovalDecision')) { return false; }
	  requestId = dict.RequestId;
	  approvalId = dict.ApprovalId;
	  decision = dict.ApprovalDecision;
	  if (!isStrictApprovalRequestId(requestId) || typeof approvalId !== 'number' || !isFinite(approvalId) ||
	      Math.floor(approvalId) !== approvalId || approvalId < 1 || approvalId > 4294967295 ||
	      (decision !== 0 && decision !== 1)) { return false; }
	  pending = pendingActionApproval(requestId, approvalId);
	  if (!pending || !isCurrentRequest(requestId)) { return false; }
	  settleActionApproval(pending, null, decision === 1, false, true);
	  return true;
	}
	
	function clearActionApprovalsForRequest(requestId, staleOnly) {
	  var keys = Object.keys(s_pending_action_approvals);
	  var i;
	  var pending;
	  for (i = 0; i < keys.length; i += 1) {
	    pending = s_pending_action_approvals[keys[i]];
	    if (pending && (staleOnly ? Number(pending.requestId) !== Number(requestId) : Number(pending.requestId) === Number(requestId))) {
	      settleActionApproval(pending, null, false, true, true);
	    }
	  }
	}
	
	function abortPluginActionHandlesForRequest(requestId) {
	  var key = requestKey(requestId);
	  var handles = (s_active_xhrs[key] || []).slice();
	  var i;
	  for (i = 0; i < handles.length; i += 1) {
	    if (handles[i] && handles[i].pluginAction === true && typeof handles[i].abort === 'function') {
	      try { handles[i].abort(); } catch (e) {}
	      untrackXhr(requestId, handles[i]);
	    }
	  }
	}
	
	function buildWatchSettings(settings) {
	  var normalized = common.extend(common.DEFAULT_SETTINGS, settings || {});
	
	  function colorValue(value, fallback) {
	    var number = parseInt(value, 10);
	    return isNaN(number) || number < 0 ? fallback : number;
	  }
	
	  return {
	    FontSize: normalized.FontSize,
	    BuzzStrength: normalized.BuzzStrength,
	    SpeakerFeedbackEnabled: normalized.SpeakerFeedbackEnabled ? 1 : 0,
	    ScrollLines: normalized.ScrollLines,
	    TouchScrollEnabled: normalized.TouchScrollEnabled ? 1 : 0,
	    ShowInputContextSize: normalized.ShowInputContextSize ? 1 : 0,
	    ShowOutputContextSize: normalized.ShowOutputContextSize ? 1 : 0,
	    PreserveChats: normalized.PreserveChats ? 1 : 0,
	    StartDictationQuickLaunch: normalized.StartDictationQuickLaunch ? 1 : 0,
	    TextColor: colorValue(normalized.TextColor, common.DEFAULT_SETTINGS.TextColor),
	    BackgroundColor: colorValue(normalized.BackgroundColor, common.DEFAULT_SETTINGS.BackgroundColor),
	    PromptBackgroundColor: colorValue(normalized.PromptBackgroundColor, common.DEFAULT_SETTINGS.PromptBackgroundColor),
	    BoldTextColor: colorValue(normalized.BoldTextColor, common.DEFAULT_SETTINGS.BoldTextColor)
	  };
	}
	
	function sameWatchSettings(left, right) {
	  var key;
	
	  if (!left || !right) {
	    return false;
	  }
	  for (key in left) {
	    if (Object.prototype.hasOwnProperty.call(left, key) && left[key] !== right[key]) {
	      return false;
	    }
	  }
	  for (key in right) {
	    if (Object.prototype.hasOwnProperty.call(right, key) && left[key] !== right[key]) {
	      return false;
	    }
	  }
	  return true;
	}
	
	function sendPendingWatchSettings() {
	  var snapshot;
	  var force;
	
	  if (s_sending_watch_settings || !s_pending_watch_settings) {
	    return;
	  }
	
	  snapshot = s_pending_watch_settings;
	  force = s_pending_watch_settings_force;
	  s_pending_watch_settings = null;
	  s_pending_watch_settings_force = false;
	  if (!force && sameWatchSettings(snapshot, s_last_watch_settings)) {
	    sendPendingWatchSettings();
	    return;
	  }
	
	  s_sending_watch_settings = snapshot;
	  sendMessage(snapshot, function() {
	    s_last_watch_settings = snapshot;
	    s_sending_watch_settings = null;
	    sendPendingWatchSettings();
	  }, function() {
	    s_last_watch_settings = null;
	    s_sending_watch_settings = null;
	    sendPendingWatchSettings();
	  });
	}
	
	function syncWatchSettings(settings, force) {
	  var snapshot = buildWatchSettings(settings);
	
	  if (force) {
	    if (!s_pending_watch_settings || !sameWatchSettings(snapshot, s_pending_watch_settings)) {
	      s_pending_watch_settings = snapshot;
	    }
	    s_pending_watch_settings_force = true;
	    sendPendingWatchSettings();
	    return true;
	  }
	
	  if (s_sending_watch_settings && sameWatchSettings(snapshot, s_sending_watch_settings)) {
	    if (s_pending_watch_settings_force) {
	      s_pending_watch_settings = snapshot;
	    } else {
	      s_pending_watch_settings = null;
	    }
	    return true;
	  }
	  if (s_pending_watch_settings && sameWatchSettings(snapshot, s_pending_watch_settings)) {
	    return true;
	  }
	  if (s_pending_watch_settings_force) {
	    s_pending_watch_settings = snapshot;
	    sendPendingWatchSettings();
	    return true;
	  }
	  if (!s_sending_watch_settings && !s_pending_watch_settings &&
	      sameWatchSettings(snapshot, s_last_watch_settings)) {
	    return false;
	  }
	
	  s_pending_watch_settings = snapshot;
	  s_pending_watch_settings_force = false;
	  sendPendingWatchSettings();
	  return true;
	}
	
	function sendReset(requestId, onSuccess, onFailure) {
	  sendMessage({ ResponseReset: 1, RequestId: requestId }, onSuccess, onFailure);
	}
	
	function sendWatchText(requestId, text, includeDone, onDone, onTransferFailure) {
	  var completed = false;
	  var value = String(text || '');
	
	  function complete(error) {
	    if (completed) {
	      return;
	    }
	    completed = true;
	    if (onDone) {
	      onDone(error || null);
	    }
	  }
	
	  function fail(error) {
	    var message = 'Response transfer failed. Try again.';
	    var retryAvailable = false;
	
	    if (!isCurrentRequest(requestId)) {
	      complete(error || new Error(message));
	      return;
	    }
	    if (onTransferFailure) {
	      retryAvailable = onTransferFailure(error || new Error(message), value) === true;
	    }
	    sendMessage({
	      ResponseError: message,
	      RetryAvailable: retryAvailable ? 1 : 0,
	      RequestId: requestId
	    }, function() {
	      complete(error || new Error(message));
	    }, function() {
	      complete(error || new Error(message));
	    });
	  }
	
	  sendUtf8ChunkSequence({
	    text: value,
	    resetDict: function() {
	      return { ResponseReset: 1, RequestId: requestId };
	    },
	    chunkDict: function(chunkText, chunkIndex) {
	      return {
	        ResponseChunk: chunkText,
	        ResponseChunkIndex: chunkIndex,
	        RequestId: requestId
	      };
	    },
	    doneDict: includeDone ? function() {
	      return { ResponseDone: 1, RequestId: requestId };
	    } : null,
	    onSuccess: function() {
	      complete(null);
	    },
	    onTransferFailure: onTransferFailure,
	    onFailure: fail
	  });
	}
	
	function sendPastChats(chats, onDone) {
	  var i = 0;
	
	  chats = chats || [];
	  sendMessage({ PastChatsReset: 1 }, function sendNext() {
	    var chat;
	
	    if (i >= chats.length) {
	      sendMessage({ PastChatsDone: chats.length }, onDone);
	      return;
	    }
	
	    chat = chats[i] || {};
	    sendMessage({
	      PastChatsItemId: common.truncate(chat.id || '', 48),
	      PastChatsItemTitle: common.truncate(chat.title || 'Untitled chat', 80)
	    }, function() {
	      i += 1;
	      sendNext();
	    });
	  });
	}
	
	function sendPastChatsError(message) {
	  sendMessage({ PastChatsError: common.truncate(message || 'Saved chats unavailable', CHUNK_SIZE) });
	}
	
	function sendPastChatDeleted(chatId) {
	  sendMessage({ PastChatDeleted: common.truncate(chatId || '', 48) });
	}
	
	function stripWatchMarkers(text) {
	  return String(text || '').replace(/[\u0001-\u0006]/g, '');
	}
	
	function maxResponseCharsForFontSize(settings) {
	  var fontSize = parseInt(settings && settings.FontSize, 10);
	
	  if (fontSize >= 28) {
	    return 2400;
	  }
	  if (fontSize >= 24) {
	    return 3200;
	  }
	
	  return MAX_RESPONSE_CHARS;
	}
	
	function codePointAt(value, index) {
	  var first = value.charCodeAt(index);
	  var second;
	
	  if (first >= 0xd800 && first <= 0xdbff && index + 1 < value.length) {
	    second = value.charCodeAt(index + 1);
	    if (second >= 0xdc00 && second <= 0xdfff) {
	      return { text: value.substring(index, index + 2), width: 2 };
	    }
	  }
	
	  if ((first >= 0xd800 && first <= 0xdfff)) {
	    return { text: '\ufffd', width: 1 };
	  }
	
	  return { text: value.charAt(index), width: 1 };
	}
	
	function markerForStyle(style, enabled) {
	  if (style === 'bold') {
	    return enabled ? WATCH_BOLD_ON : WATCH_BOLD_OFF;
	  }
	  if (style === 'prompt') {
	    return enabled ? WATCH_PROMPT_ON : WATCH_PROMPT_OFF;
	  }
	  return enabled ? WATCH_SMALL_ON : WATCH_SMALL_OFF;
	}
	
	function readOutputStyles(text) {
	  var state = { bold: false, prompt: false, small: false };
	  var i;
	  var ch;
	
	  for (i = 0; i < text.length; i += 1) {
	    ch = text.charAt(i);
	    if (ch === WATCH_BOLD_ON) {
	      state.bold = true;
	    } else if (ch === WATCH_BOLD_OFF) {
	      state.bold = false;
	    } else if (ch === WATCH_PROMPT_ON) {
	      state.prompt = true;
	    } else if (ch === WATCH_PROMPT_OFF) {
	      state.prompt = false;
	    } else if (ch === WATCH_SMALL_ON) {
	      state.small = true;
	    } else if (ch === WATCH_SMALL_OFF) {
	      state.small = false;
	    }
	  }
	
	  return state;
	}
	
	function createBoundedOutput(limit) {
	  var text = '';
	  var truncated = false;
	  var styles = { bold: false, prompt: false, small: false };
	
	  limit = Math.min(limit, MAX_RESPONSE_CHARS);
	
	  function append(value) {
	    if (truncated) {
	      return false;
	    }
	    if (text.length + value.length > limit) {
	      truncated = true;
	      return false;
	    }
	    text += value;
	    return true;
	  }
	
	  function appendText(value) {
	    var i = 0;
	    var point;
	
	    while (i < value.length) {
	      point = codePointAt(value, i);
	      if (!append(point.text)) {
	        return false;
	      }
	      i += point.width;
	    }
	    return true;
	  }
	
	  function setStyle(style, enabled) {
	    var marker;
	
	    if (truncated || styles[style] === enabled) {
	      return !truncated;
	    }
	    marker = markerForStyle(style, enabled);
	    if (!append(marker)) {
	      return false;
	    }
	    styles[style] = enabled;
	    return true;
	  }
	
	  function finish() {
	    var notice = '\n\n[Truncated]';
	    var prefix = text;
	    var state;
	    var closers;
	    var end;
	
	    if (!truncated) {
	      return { text: text, truncated: false };
	    }
	
	    while (true) {
	      state = readOutputStyles(prefix);
	      closers = (state.bold ? WATCH_BOLD_OFF : '') +
	        (state.prompt ? WATCH_PROMPT_OFF : '') +
	        (state.small ? WATCH_SMALL_OFF : '');
	      end = prefix.length;
	      while (end > limit - notice.length - closers.length) {
	        end -= 1;
	      }
	      if (end > 0 && end < prefix.length &&
	          prefix.charCodeAt(end - 1) >= 0xd800 && prefix.charCodeAt(end - 1) <= 0xdbff &&
	          prefix.charCodeAt(end) >= 0xdc00 && prefix.charCodeAt(end) <= 0xdfff) {
	        end -= 1;
	      }
	      if (end === prefix.length) {
	        return { text: prefix + closers + notice, truncated: true };
	      }
	      prefix = prefix.substring(0, end);
	    }
	  }
	
	  return {
	    appendText: appendText,
	    setStyle: setStyle,
	    length: function() { return text.length; },
	    getText: function() { return text; },
	    isTruncated: function() { return truncated; },
	    finish: finish
	  };
	}
	
	function formatSegment(rawText, role, output, separator) {
	  var value = stripWatchMarkers(rawText);
	  var start;
	  var prefix = 'Thinking:\n';
	  var answerMarker = '\n\nAnswer:\n';
	  var answerIndex = -1;
	  var thinkingEnd;
	  var i = 0;
	  var close;
	
	  if (!value) {
	    return { text: '', truncated: false };
	  }
	
	  if (separator && output.length() && !output.appendText(separator)) {
	    return { text: '', truncated: true };
	  }
	  start = output.length();
	
	  if (role === 'prompt') {
	    output.setStyle('prompt', true);
	  } else if (value.substring(0, prefix.length) === prefix) {
	    answerIndex = value.indexOf(answerMarker, prefix.length);
	  }
	
	  thinkingEnd = role === 'assistant' && value.substring(0, prefix.length) === prefix ?
	    (answerIndex === -1 ? value.length : answerIndex) : -1;
	  if (thinkingEnd >= 0) {
	    output.setStyle('small', true);
	  }
	
	  while (i < value.length && !output.isTruncated()) {
	    if (value.substring(i, i + 2) === '**' && (close = value.indexOf('**', i + 2)) !== -1) {
	      output.setStyle('bold', true);
	      i += 2;
	      while (i < close && !output.isTruncated()) {
	        if (thinkingEnd >= 0 && i === thinkingEnd) {
	          output.setStyle('small', false);
	        }
	        var point = codePointAt(value, i);
	        output.appendText(point.text);
	        i += point.width;
	      }
	      if (thinkingEnd >= 0 && i === thinkingEnd) {
	        output.setStyle('small', false);
	      }
	      output.setStyle('bold', false);
	      i = close + 2;
	      continue;
	    }
	
	    if (thinkingEnd >= 0 && i === thinkingEnd) {
	      output.setStyle('small', false);
	      thinkingEnd = -1;
	    }
	    if (value.substring(i, i + 2) === '**') {
	      output.appendText('**');
	      i += 2;
	    } else {
	      var rawPoint = codePointAt(value, i);
	      output.appendText(rawPoint.text);
	      i += rawPoint.width;
	    }
	  }
	
	  if (thinkingEnd >= 0 && !output.isTruncated()) {
	    output.setStyle('small', false);
	  }
	  if (role === 'prompt' && !output.isTruncated()) {
	    output.setStyle('prompt', false);
	  }
	
	  return {
	    text: output.getText().substring(start),
	    truncated: output.isTruncated()
	  };
	}
	
	function formatResponseForWatch(text, limit) {
	  var output = createBoundedOutput(limit);
	
	  formatSegment(text, 'assistant', output, '');
	  return output.finish();
	}
	
	function formatSavedChatTranscript(chat, settings) {
	  var messages = chat && chat.messages ? chat.messages : [];
	  var output = createBoundedOutput(maxResponseCharsForFontSize(settings));
	  var i;
	  var message;
	  var segment;
	
	  for (i = 0; i < messages.length && !output.isTruncated(); i += 1) {
	    message = messages[i] || {};
	    if (message.role !== 'user' && message.role !== 'assistant') {
	      continue;
	    }
	    segment = formatSegment(message.content || '', message.role === 'user' ? 'prompt' : 'assistant', output, '\n\n');
	    if (segment.truncated) {
	      break;
	    }
	  }
	
	  return output.finish();
	}
	
	function sendPastChatTranscript(chat, settings, onDone) {
	  sendUtf8ChunkSequence({
	    text: formatSavedChatTranscript(chat, settings).text,
	    resetDict: function() {
	      return { PastChatTextReset: 1 };
	    },
	    chunkDict: function(chunkText) {
	      return { PastChatTextChunk: chunkText };
	    },
	    doneDict: function() {
	      return { PastChatTextDone: 1 };
	    },
	    onSuccess: onDone
	  });
	}
	
	function sanitizeProgressLine(value) {
	  return String(value === undefined || value === null ? '' : value)
	    .replace(/[\r\n\t]+/g, ' ')
	    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/g, '');
	}
	
	function formatProgressHistory(items) {
	  var groups = [];
	  var text = '';
	  var candidate;
	  var i;
	  var label;
	  var group;
	  var suffix;
	  var line;
	
	  for (i = 0; i < items.length; i += 1) {
	    label = sanitizeProgressLine(items[i]);
	    if (!label) {
	      continue;
	    }
	
	    group = groups.length ? groups[groups.length - 1] : null;
	    if (group && group.label === label) {
	      group.count += 1;
	    } else {
	      groups.push({ label: label, count: 1 });
	    }
	  }
	
	  for (i = groups.length - 1; i >= 0; i -= 1) {
	    suffix = groups[i].count > 1 ? ' ' + groups[i].count + 'x' : '';
	    line = common.truncate(groups[i].label, 48 - suffix.length) + suffix;
	    candidate = line + (text ? '\n' + text : '');
	    if (candidate.length > 240) {
	      break;
	    }
	    text = candidate;
	  }
	
	  return text;
	}
	
	function sendProgressState(requestId, current, detail, reset, onDone) {
	  var dict = {
	    RequestId: requestId,
	    ProgressText: common.truncate(sanitizeProgressLine(current) || 'thinking', 80),
	    ProgressDetail: common.truncate(detail || '', 160),
	    ProgressHistory: formatProgressHistory(s_progress.toolHistory),
	    ProgressInputContextSize: common.truncate(s_progress.inputContextSize || '', 24),
	    ProgressOutputContextSize: common.truncate(s_progress.outputContextSize || '', 24)
	  };
	
	  if (reset) {
	    dict.ProgressReset = 1;
	  }
	
	  sendMessage(dict, onDone);
	}
	
	function progressStart(requestId, current, detail) {
	  if (!isCurrentRequest(requestId)) {
	    return;
	  }
	
	  s_progress.requestId = requestId;
	  s_progress.active = true;
	  s_progress.current = sanitizeProgressLine(current) || 'thinking';
	  s_progress.detail = detail || '';
	  s_progress.toolHistory = [];
	  s_progress.currentTool = '';
	  s_progress.currentToolHistoryLabel = '';
	  s_progress.currentToolRemembered = false;
	  s_progress.toolExecutions = Object.create(null);
	  s_progress.activeToolExecutionIds = [];
	  s_progress.currentToolExecutionId = '';
	  s_progress.inputContextSize = '';
	  s_progress.outputContextSize = '';
	  sendProgressState(requestId, s_progress.current, s_progress.detail, true);
	}
	
	function findActiveToolExecution() {
	  var entry;
	  var i;
	
	  for (i = s_progress.activeToolExecutionIds.length - 1; i >= 0; i -= 1) {
	    entry = s_progress.toolExecutions[s_progress.activeToolExecutionIds[i]];
	    if (entry && !entry.completed) {
	      return { id: s_progress.activeToolExecutionIds[i], entry: entry };
	    }
	  }
	  return null;
	}
	
	function removeActiveToolExecution(executionId) {
	  var i;
	
	  for (i = s_progress.activeToolExecutionIds.length - 1; i >= 0; i -= 1) {
	    if (s_progress.activeToolExecutionIds[i] === executionId) {
	      s_progress.activeToolExecutionIds.splice(i, 1);
	      return;
	    }
	  }
	}
	
	function progressToolStart(requestId, current, detail, toolExecutionId, historyLabel) {
	  var executionKey;
	  var entry;
	  var title;
	  var history;
	
	  if (!isCurrentRequest(requestId)) {
	    return;
	  }
	
	  title = sanitizeProgressLine(current) || 'thinking';
	  history = sanitizeProgressLine(historyLabel) || title;
	
	  if (!s_progress.active || s_progress.requestId !== requestId) {
	    progressStart(requestId, title, detail);
	  }
	
	  if (toolExecutionId !== undefined && toolExecutionId !== null && String(toolExecutionId)) {
	    executionKey = String(toolExecutionId);
	    entry = s_progress.toolExecutions[executionKey];
	    if (entry && entry.completed) {
	      return;
	    }
	    s_progress.currentTool = title;
	    s_progress.currentToolHistoryLabel = '';
	    if (!entry) {
	      entry = { label: title, historyLabel: history, detail: detail || '', completed: false };
	      s_progress.toolExecutions[executionKey] = entry;
	      s_progress.activeToolExecutionIds.push(executionKey);
	    } else {
	      entry.label = title;
	      entry.historyLabel = history;
	      entry.detail = detail || '';
	    }
	    s_progress.currentToolExecutionId = executionKey;
	  } else {
	    s_progress.currentTool = title;
	    s_progress.currentToolHistoryLabel = history;
	    s_progress.currentToolExecutionId = '';
	    s_progress.currentToolRemembered = false;
	  }
	  progressSet(requestId, title, detail);
	}
	
	function progressSet(requestId, current, detail) {
	  if (!isCurrentRequest(requestId)) {
	    return;
	  }
	
	  current = sanitizeProgressLine(current) || 'thinking';
	  detail = detail || '';
	
	  if (!s_progress.active || s_progress.requestId !== requestId) {
	    progressStart(requestId, current, detail);
	    return;
	  }
	
	  if (s_progress.current === current && s_progress.detail === detail) {
	    return;
	  }
	
	  s_progress.current = current;
	  s_progress.detail = detail;
	  sendProgressState(requestId, s_progress.current, s_progress.detail, false);
	}
	
	function progressSetContextSizes(requestId, inputText, outputText) {
	  if (!isCurrentRequest(requestId)) {
	    return;
	  }
	
	  inputText = inputText || '';
	  outputText = outputText || '';
	
	  if (!s_progress.active || s_progress.requestId !== requestId) {
	    return;
	  }
	
	  if (s_progress.inputContextSize === inputText && s_progress.outputContextSize === outputText) {
	    return;
	  }
	
	  s_progress.inputContextSize = inputText;
	  s_progress.outputContextSize = outputText;
	  sendProgressState(requestId, s_progress.current, s_progress.detail, false);
	}
	
	function progressDone(requestId, current, detail, toolExecutionId) {
	  var toolName;
	  var executionKey;
	  var entry;
	  var active;
	
	  if (!isCurrentRequest(requestId) || !s_progress.active || s_progress.requestId !== requestId) {
	    return;
	  }
	
	  if (toolExecutionId !== undefined && toolExecutionId !== null && String(toolExecutionId)) {
	    executionKey = String(toolExecutionId);
	    entry = s_progress.toolExecutions[executionKey];
	    if (!entry || entry.completed) {
	      return;
	    }
	    entry.completed = true;
	    s_progress.toolHistory.push(entry.historyLabel || entry.label);
	    removeActiveToolExecution(executionKey);
	
	    if (s_progress.currentToolExecutionId === executionKey) {
	      active = findActiveToolExecution();
	      if (active) {
	        s_progress.currentToolExecutionId = active.id;
	        s_progress.currentTool = active.entry.label;
	        s_progress.currentToolHistoryLabel = active.entry.historyLabel || active.entry.label;
	        s_progress.current = active.entry.label;
	        s_progress.detail = active.entry.detail;
	      } else {
	        s_progress.currentToolExecutionId = executionKey;
	        s_progress.currentToolHistoryLabel = '';
	      }
	    }
	    sendProgressState(requestId, s_progress.current, s_progress.detail, false);
	    return;
	  }
	
	  // Preserve the legacy single-tool path without recounting identified runs.
	  if (s_progress.currentToolExecutionId && s_progress.toolExecutions[s_progress.currentToolExecutionId]) {
	    return;
	  }
	  toolName = s_progress.currentToolHistoryLabel || s_progress.currentTool;
	  if (toolName && !s_progress.currentToolRemembered) {
	    s_progress.toolHistory.push(toolName);
	    s_progress.currentToolRemembered = true;
	  }
	}
	
	function progressStop(requestId) {
	  if (Number(s_progress.requestId) !== Number(requestId)) {
	    return;
	  }
	
	  s_progress.active = false;
	  s_progress.current = '';
	  s_progress.detail = '';
	  s_progress.toolHistory = [];
	  s_progress.currentTool = '';
	  s_progress.currentToolHistoryLabel = '';
	  s_progress.currentToolRemembered = false;
	  s_progress.toolExecutions = Object.create(null);
	  s_progress.activeToolExecutionIds = [];
	  s_progress.currentToolExecutionId = '';
	  s_progress.inputContextSize = '';
	  s_progress.outputContextSize = '';
	}
	
	function sendError(requestId, message, onDone, retryAvailable) {
	  var completed = false;
	
	  function complete(error) {
	    if (completed) {
	      return;
	    }
	    completed = true;
	    if (onDone) {
	      onDone(error || null);
	    }
	  }
	
	  progressStop(requestId);
	  common.logDebug('watch error request=' + requestId + ' message=' + String(message).substring(0, 160));
	  sendReset(requestId, function() {
	    sendMessage({
	      ResponseError: String(message).substring(0, CHUNK_SIZE),
	      RetryAvailable: retryAvailable ? 1 : 0,
	      RequestId: requestId
	    }, function() {
	      complete(null);
	    }, complete);
	  }, complete);
	}
	
	function sendResponse(requestId, settings, text, onDone, onTransferFailure) {
	  var formatted = formatResponseForWatch(text, maxResponseCharsForFontSize(settings));
	
	  common.logDebug('send response request=' + requestId + ' chars=' + formatted.text.length + ' limit=' + maxResponseCharsForFontSize(settings) + ' truncated=' + (formatted.truncated ? 1 : 0));
	  sendPreparedResponse(requestId, formatted.text, onDone, onTransferFailure);
	}
	
	function sendPreparedResponse(requestId, text, onDone, onTransferFailure) {
	  progressStop(requestId);
	  common.logDebug('send prepared response request=' + requestId + ' chars=' + String(text || '').length);
	  sendWatchText(requestId, text, true, onDone, onTransferFailure);
	}
	
	function requestHealthInfo(query, requestId, callback) {
	  var healthRequestId;
	  var key;
	  var dict;
	
	  if (!Pebble.sendAppMessage) {
	    callback('Health Info requires AppMessage');
	    return;
	  }
	  if (!isCurrentRequest(requestId)) {
	    return;
	  }
	
	  healthRequestId = s_health_info_request_id;
	  s_health_info_request_id += 1;
	  if (s_health_info_request_id > 2147480000) {
	    s_health_info_request_id = 1;
	  }
	
	  key = String(healthRequestId);
	  s_pending_health_info[key] = {
	    requestId: requestId,
	    callback: callback,
	    timeout: setTimeout(function() {
	      var pending = clearPendingHealthInfo(key);
	      if (pending && isCurrentRequest(pending.requestId)) {
	        pending.callback('Health Info request timed out');
	      }
	    }, HEALTH_INFO_TIMEOUT_MS)
	  };
	
	  dict = {
	    RequestId: requestId,
	    HealthSummaryRequest: healthRequestId,
	    HealthStartUnix: query.startUnix,
	    HealthEndUnix: query.endUnix,
	    HealthQueryMask: query.queryMask,
	    HealthAverageScope: query.averageScope || 0,
	    HealthSessionOffset: query.sessionOffset || 0
	  };
	
	  common.logDebug('health info request token=' + healthRequestId + ' start=' + query.startUnix + ' end=' + query.endUnix + ' mask=' + query.queryMask + ' scope=' + (query.averageScope || 0) + ' offset=' + (query.sessionOffset || 0));
	  sendMessage(dict, null, function(e) {
	    var pending = clearPendingHealthInfo(key);
	    if (pending && isCurrentRequest(pending.requestId)) {
	      pending.callback('Health Info send failed: ' + ((e && (e.error || e.message)) || 'AppMessage failed'));
	    }
	  });
	}
	
	function handleHealthInfoResponse(dict) {
	  var key = String(dict.HealthSummaryRequest || 0);
	  var pending = s_pending_health_info[key];
	  var callback;
	
	  if (!pending) {
	    common.logDebug('unexpected health info response token=' + key);
	    return;
	  }
	
	  if (dictHasRequestId(dict) && Number(dict.RequestId) !== Number(pending.requestId)) {
	    return;
	  }
	  pending = clearPendingHealthInfo(key);
	  callback = pending.callback;
	  if (!isCurrentRequest(pending.requestId)) {
	    return;
	  }
	
	  if (dict.HealthSummaryError !== undefined && dict.HealthSummaryError !== null && String(dict.HealthSummaryError)) {
	    callback(String(dict.HealthSummaryError));
	    return;
	  }
	  if (dict.HealthSummaryJson !== undefined && dict.HealthSummaryJson !== null) {
	    callback(null, String(dict.HealthSummaryJson));
	    return;
	  }
	
	  callback('Health Info response missing data');
	}
	
	module.exports = {
	  dictHasRequestId: dictHasRequestId,
	  isCurrentRequest: isCurrentRequest,
	  beginRequestLifecycle: beginRequestLifecycle,
	  finishRequestLifecycle: finishRequestLifecycle,
	  cancelRequestLifecycle: cancelRequestLifecycle,
	  trackXhr: trackXhr,
	  untrackXhr: untrackXhr,
	  sendMessage: sendMessage,
	  syncWatchSettings: syncWatchSettings,
	  progressStart: progressStart,
	  progressToolStart: progressToolStart,
	  progressSet: progressSet,
	  progressSetContextSizes: progressSetContextSizes,
	  progressDone: progressDone,
	  progressStop: progressStop,
	  sendError: sendError,
	  sendResponse: sendResponse,
	  sendPreparedResponse: sendPreparedResponse,
	  sendPastChats: sendPastChats,
	  sendPastChatsError: sendPastChatsError,
	  sendPastChatDeleted: sendPastChatDeleted,
	  sendPastChatTranscript: sendPastChatTranscript,
	  requestHealthInfo: requestHealthInfo,
	  handleHealthInfoResponse: handleHealthInfoResponse,
	  requestActionApproval: requestActionApproval,
	  handleActionApprovalResponse: handleActionApprovalResponse
	};


/***/ }),
/* 19 */
/***/ (function(module, exports, __webpack_require__) {

	var common = __webpack_require__(17);
	var watch = __webpack_require__(18);
	var tools = __webpack_require__(20);
	var chatStore = __webpack_require__(28);
	var endpointCache = __webpack_require__(29);
	var opencodeSession = __webpack_require__(14);
	
	var CANDIDATE_PROTOCOL_ORDER = ['responses', 'chat', 'messages'];
	var CANONICAL_SUFFIX_BY_PROTOCOL = {
	  responses: '/responses',
	  chat: '/chat/completions',
	  messages: '/messages'
	};
	var CACHE_PROTOCOL_NAMES = { 'responses': true, 'chat-completions': true, 'messages': true };
	
	var s_chat_history = [];
	var s_saved_chat_history = [];
	var s_active_chat_id = null;
	var s_conversation_generation = 0;
	var s_active_completion = null;
	var s_retry_capsule = null;
	var s_native_unsupported_keys = {};
	var MAX_TOOL_RESULT_CHARS = 6000;
	var MAX_TOOL_RESULTS_TOTAL_CHARS = 12000;
	var MAX_RETRY_CAPSULE_BYTES = 64 * 1024;
	var MAX_RETRY_CAPSULE_NODES = 4096;
	var MAX_RETRY_CAPSULE_DEPTH = 32;
	var TOOL_RESULT_TRUNCATION_SUFFIX = '... [truncated]';
	var TOOL_RESULT_ERROR_RESERVE_CHARS = 96;
	var TOOL_RESULT_ERROR_OMISSION = 'Tool result omitted: budget exhausted';
	var TOOL_ERROR_OMISSION = 'Tool error omitted: exceeds reserved allowance';
	var TOOL_CAP_NOTICE = 'Tool call budget exhausted. FINAL ANSWER ONLY. Use output.';
	var DEFAULT_MESSAGES_MAX_TOKENS = 4096;
	var ANTHROPIC_API_VERSION = '2023-06-01';
	var NATIVE_UNSUPPORTED_TTL_MS = 5 * 60 * 1000;
	
	function nativeUnsupportedKey(settings) {
	  return String((settings && settings.Endpoint) || '').toLowerCase() + '|' +
	    String((settings && settings.ApiMode) || 'auto') + '|' +
	    String((settings && settings.Model) || '');
	}
	
	function isNativeToolsUnsupported(settings) {
	  var key = nativeUnsupportedKey(settings);
	  var markedAt = s_native_unsupported_keys[key];
	
	  if (!markedAt) {
	    return false;
	  }
	  if (new Date().getTime() - markedAt > NATIVE_UNSUPPORTED_TTL_MS) {
	    delete s_native_unsupported_keys[key];
	    return false;
	  }
	  return true;
	}
	
	function markNativeToolsUnsupported(settings) {
	  if (Object.keys(s_native_unsupported_keys).length >= 32) {
	    s_native_unsupported_keys = {};
	  }
	  s_native_unsupported_keys[nativeUnsupportedKey(settings)] = new Date().getTime();
	}
	
	function pad2(value) {
	  return value < 10 ? '0' + value : String(value);
	}
	
	function formatDateTime(date) {
	  var offsetMinutes = -date.getTimezoneOffset();
	  var offsetSign = offsetMinutes >= 0 ? '+' : '-';
	  var absOffset = Math.abs(offsetMinutes);
	
	  return date.getFullYear() + '-' +
	    pad2(date.getMonth() + 1) + '-' +
	    pad2(date.getDate()) + ' ' +
	    pad2(date.getHours()) + ':' +
	    pad2(date.getMinutes()) + ':' +
	    pad2(date.getSeconds()) + ' GMT' +
	    offsetSign +
	    pad2(Math.floor(absOffset / 60)) + ':' +
	    pad2(absOffset % 60);
	}
	
	function expandSystemPromptVariables(prompt) {
	  return String(prompt || '').replace(/\$DATETIME/g, formatDateTime(new Date()));
	}
	
	function hasTimelineTools(tools) {
	  var i;
	
	  for (i = 0; i < tools.length; i += 1) {
	    if (String(tools[i].name || '').indexOf('pebble_timeline_') === 0) {
	      return true;
	    }
	  }
	
	  return false;
	}
	
	function buildToolGuidance(toolDefinitions, maxToolCalls) {
	  var text;
	
	  if (!toolDefinitions.length || maxToolCalls <= 0) {
	    return '';
	  }
	
	  text = '\n\nPhone-side tools are available.' +
	    '\nOnly phone-side tools listed here are enabled in app settings.' +
	    '\nYou may use at most ' + maxToolCalls + ' tool call(s) total for this request.';
	
	  if (hasTimelineTools(toolDefinitions)) {
	    text += '\nTimeline tool rules:' +
	      '\n- For reminder requests or phrases like "remind me", call pebble_timeline_create_reminder.' +
	      '\n- This creates a scheduled Pebble Timeline reminder notification attached to a pin, not an OS/system alarm. For an alarm request, explain this limitation and offer the Timeline reminder as the available alternative; never claim a system alarm was set.' +
	      '\n- Set reminderTime for an exact notification time, remindMinutesBefore for relative timing (0 means pin time), or omit both to use time.' +
	      '\n- For events without a scheduled reminder, call pebble_timeline_create_pin.' +
	      '\n- Creation tools always make new pins with generated ids; never supply an id when creating.' +
	      '\n- To change an existing pin, first call pebble_timeline_list_pins and use a listed id with pebble_timeline_edit_pin. Only supplied fields change; other fields stay as stored.' +
	      '\n- Empty string clears supported optional text fields; integer and enum fields cannot be cleared with empty string. Use clearReminder:true to remove scheduled alerts.' +
	      '\n- Do not say a reminder, event, or pin was created, updated, or deleted unless the timeline tool result succeeded. Local acceptance does not confirm watch delivery.' +
	      '\n- After a successful timeline tool result, include the title/time when known and the returned pin id.' +
	      '\n- If title, time, or target pin is ambiguous, ask one concise clarification instead of calling a tool.';
	  }
	
	  return text;
	}
	
	function buildToolInstructions(toolDefinitions, maxToolCalls, nativeTools) {
	  var text = buildToolGuidance(toolDefinitions, maxToolCalls);
	  var i;
	
	  if (!text || nativeTools) {
	    return text;
	  }
	
	  text += '\nIf a tool is needed, respond with only JSON in this exact shape:' +
	    '\n{"tool_calls":[{"id":"call_1","name":"tool_name","arguments":{}}]}' +
	    '\nDo not include markdown, explanation, or final answer with tool call JSON. After tool results are provided, answer the user normally or request more tools with the same JSON shape.';
	
	  text += '\nAvailable tools:';
	
	  for (i = 0; i < toolDefinitions.length; i += 1) {
	    text += '\n- ' + toolDefinitions[i].name + ': ' + toolDefinitions[i].description + '\n  Parameters JSON Schema: ' + common.safeJson(toolDefinitions[i].parameters);
	  }
	
	  text += '\nCurrent phone date/time: ' + formatDateTime(new Date()) + '.';
	
	  return text;
	}
	
	function buildSystemPrompt(settings, toolInstructions) {
	  var prompt = expandSystemPromptVariables(settings.SystemPrompt);
	  return prompt + (toolInstructions || '');
	}
	
	function endpointProtocol(settings) {
	  var path;
	  var suffix;
	
	  if (settings && settings.ApiMode === 'chat-completions') {
	    return 'chat';
	  }
	  if (settings && settings.ApiMode === 'responses') {
	    return 'responses';
	  }
	  if (settings && settings.ApiMode === 'messages') {
	    return 'messages';
	  }
	
	  path = String((settings && settings.Endpoint) || '').toLowerCase();
	  if (/^[a-z][a-z0-9+.-]*:\/\//.test(path)) {
	    path = path.replace(/^[a-z][a-z0-9+.-]*:\/\/[^\/]*/, '');
	  }
	  path = path.split('#')[0].split('?')[0];
	  while (path.length > 1 && path.charAt(path.length - 1) === '/') {
	    path = path.substring(0, path.length - 1);
	  }
	
	  suffix = '/chat/completions';
	  if (path.length >= suffix.length && path.substring(path.length - suffix.length) === suffix) {
	    return 'chat';
	  }
	  suffix = '/messages';
	  if (path.length >= suffix.length && path.substring(path.length - suffix.length) === suffix) {
	    return 'messages';
	  }
	
	  return 'responses';
	}
	
	function internalProtocolFromCacheName(name) {
	  if (!CACHE_PROTOCOL_NAMES[name]) {
	    return '';
	  }
	  return name === 'chat-completions' ? 'chat' : name;
	}
	
	function cacheProtocolNameFromInternal(protocol) {
	  return protocol === 'chat' ? 'chat-completions' : protocol;
	}
	
	function isExplicitApiMode(settings) {
	  var mode = String((settings && settings.ApiMode) || '');
	  return mode === 'responses' || mode === 'chat-completions' || mode === 'messages';
	}
	
	function analyzeConfiguredEndpoint(endpoint) {
	  var raw = String(endpoint === undefined || endpoint === null ? '' : endpoint);
	  var queryIndex = raw.indexOf('?');
	  var hashIndex = raw.indexOf('#');
	  var cutIndex;
	  var main;
	  var tail;
	  var schemeMatch;
	  var rest;
	  var slashIndex;
	  var authority;
	  var path;
	  var trailingSlashes;
	  var trimmedPath;
	  var loweredPath;
	  var suffixes = [
	    ['responses', '/responses'],
	    ['chat', '/chat/completions'],
	    ['messages', '/messages']
	  ];
	  var i;
	  var entry;
	  var offset;
	
	  if (queryIndex === -1 && hashIndex === -1) {
	    main = raw;
	    tail = '';
	  } else {
	    if (queryIndex === -1) {
	      cutIndex = hashIndex;
	    } else if (hashIndex === -1) {
	      cutIndex = queryIndex;
	    } else {
	      cutIndex = queryIndex < hashIndex ? queryIndex : hashIndex;
	    }
	    main = raw.substring(0, cutIndex);
	    tail = raw.substring(cutIndex);
	  }
	
	  schemeMatch = /^[A-Za-z][A-Za-z0-9+\-.]*:\/\//.exec(main);
	  if (!schemeMatch) {
	    return null;
	  }
	
	  rest = main.substring(schemeMatch[0].length);
	  slashIndex = rest.indexOf('/');
	  if (slashIndex === -1) {
	    authority = rest;
	    path = '';
	  } else {
	    authority = rest.substring(0, slashIndex);
	    path = rest.substring(slashIndex);
	  }
	  if (!authority) {
	    return null;
	  }
	
	  trailingSlashes = 0;
	  while (path.length - trailingSlashes > 0 && path.charAt(path.length - 1 - trailingSlashes) === '/') {
	    trailingSlashes += 1;
	  }
	  trimmedPath = path.substring(0, path.length - trailingSlashes);
	  loweredPath = trimmedPath.toLowerCase();
	
	  for (i = 0; i < suffixes.length; i += 1) {
	    entry = suffixes[i];
	    offset = loweredPath.length - entry[1].length;
	    if (offset >= 0 && loweredPath.substring(offset) === entry[1]) {
	      return {
	        protocol: entry[0],
	        root: main.substring(0, main.length - trailingSlashes - entry[1].length),
	        tail: tail
	      };
	    }
	  }
	
	  return null;
	}
	
	function shallowCopySettings(source) {
	  var copy = {};
	  var key;
	
	  source = source || {};
	  for (key in source) {
	    if (Object.prototype.hasOwnProperty.call(source, key)) {
	      copy[key] = source[key];
	    }
	  }
	
	  return copy;
	}
	
	function buildEndpointPlan(settings) {
	  var plan = {
	    rotationActive: false,
	    originalEndpoint: String((settings && settings.Endpoint) || ''),
	    candidates: []
	  };
	  var info;
	  var order;
	  var seen;
	  var rememberedRaw;
	  var remembered;
	  var i;
	  var protocol;
	
	  function pushCandidate(protocolName, url) {
	    var attemptSettings = shallowCopySettings(settings);
	    attemptSettings.Endpoint = url;
	    plan.candidates.push({ protocol: protocolName, settings: attemptSettings });
	  }
	
	  function addProtocol(protocolName) {
	    if (!seen[protocolName]) {
	      seen[protocolName] = true;
	      order.push(protocolName);
	    }
	  }
	
	  if (!settings || !settings.Endpoint) {
	    pushCandidate(endpointProtocol(settings), '');
	    return plan;
	  }
	
	  info = analyzeConfiguredEndpoint(settings.Endpoint);
	  if (!info || isExplicitApiMode(settings)) {
	    pushCandidate(endpointProtocol(settings), settings.Endpoint);
	    return plan;
	  }
	
	  plan.rotationActive = true;
	  seen = {};
	  order = [];
	
	  rememberedRaw = endpointCache.get(settings.Endpoint, settings.Model);
	  remembered = internalProtocolFromCacheName(String(rememberedRaw));
	  if (!remembered) {
	    addProtocol(info.protocol);
	  } else {
	    addProtocol(remembered);
	  }
	  for (i = 0; i < CANDIDATE_PROTOCOL_ORDER.length; i += 1) {
	    addProtocol(CANDIDATE_PROTOCOL_ORDER[i]);
	  }
	
	  for (i = 0; i < order.length; i += 1) {
	    protocol = order[i];
	    if (protocol === info.protocol) {
	      pushCandidate(protocol, settings.Endpoint);
	    } else {
	      pushCandidate(protocol, info.root + CANONICAL_SUFFIX_BY_PROTOCOL[protocol] + info.tail);
	    }
	  }
	
	  return plan;
	}
	
	function isChatEndpoint(settings) {
	  return endpointProtocol(settings) === 'chat';
	}
	
	function isMessagesEndpoint(settings) {
	  return endpointProtocol(settings) === 'messages';
	}
	
	function endpointHost(settings) {
	  var endpoint = String((settings && settings.Endpoint) || '');
	  var match;
	
	  try {
	    match = endpoint.match(/^https?:\/\/([^\/]+)/i);
	    return match ? match[1].toLowerCase() : '';
	  } catch (e) {
	    return '';
	  }
	}
	
	function isOpenAiResponsesEndpoint(settings) {
	  if (endpointProtocol(settings) !== 'responses') {
	    return false;
	  }
	  return endpointHost(settings) === 'api.openai.com';
	}
	
	function shouldRequestReasoningSummary(settings, options) {
	  return !!(settings && settings.ShowThinking) &&
	    endpointProtocol(settings) === 'responses' &&
	    !(options && options.skipReasoningSummary);
	}
	
	function copyRequestOptions(options) {
	  var result = {};
	  var key;
	
	  options = options || {};
	  for (key in options) {
	    if (options.hasOwnProperty(key)) {
	      result[key] = options[key];
	    }
	  }
	
	  return result;
	}
	
	function buildConversation(settings, userText, toolInstructions, history) {
	  var conversation = [
	    { role: 'system', content: buildSystemPrompt(settings, toolInstructions) }
	  ];
	  var i;
	
	  history = history || s_chat_history;
	  for (i = 0; i < history.length; i += 1) {
	    conversation.push(history[i]);
	  }
	
	  conversation.push({ role: 'user', content: userText });
	  return conversation;
	}
	
	function historyTotalChars(history) {
	  var total = 0;
	  var i;
	
	  for (i = 0; i < history.length; i += 1) {
	    total += String((history[i] && history[i].content) || '').length;
	  }
	
	  return total;
	}
	
	function trimHistoryByCountAndChars(history) {
	  while (history.length > common.MAX_CHAT_HISTORY_MESSAGES) {
	    history.splice(0, 2);
	  }
	
	  while (history.length >= 2 && historyTotalChars(history) > common.MAX_CHAT_HISTORY_TOTAL_CHARS) {
	    history.splice(0, 2);
	  }
	}
	
	function appendChatTurn(history, userText, assistantText) {
	  history.push({
	    role: 'user',
	    content: common.truncate(userText, common.MAX_CHAT_HISTORY_MESSAGE_CHARS)
	  });
	  history.push({
	    role: 'assistant',
	    content: common.truncate(assistantText, common.MAX_CHAT_HISTORY_MESSAGE_CHARS)
	  });
	
	  trimHistoryByCountAndChars(history);
	}
	
	function copyChatHistory(messages) {
	  var result = [];
	  var i;
	  var message;
	
	  messages = messages || [];
	  for (i = 0; i < messages.length; i += 1) {
	    message = messages[i] || {};
	    if (message.role !== 'user' && message.role !== 'assistant') {
	      continue;
	    }
	    result.push({
	      role: message.role,
	      content: common.truncate(message.content || '', common.MAX_CHAT_HISTORY_MESSAGE_CHARS)
	    });
	  }
	
	  trimHistoryByCountAndChars(result);
	
	  return result;
	}
	
	function rememberChatTurn(settings, userText, assistantText) {
	  var saved;
	  var answerOnly = stripThinkingWrapper(assistantText);
	
	  appendChatTurn(s_chat_history, userText, answerOnly);
	
	  if (!settings.PreserveChats) {
	    return;
	  }
	
	  appendChatTurn(s_saved_chat_history, userText, answerOnly);
	  saved = chatStore.saveChatHistory(s_active_chat_id, s_saved_chat_history);
	  if (saved) {
	    s_active_chat_id = saved.id;
	  }
	}
	
	function clearCompletionTimers(context) {
	  var timers;
	  var i;
	
	  if (!context || !context.timers) {
	    return;
	  }
	
	  timers = context.timers.slice();
	  context.timers = [];
	  for (i = 0; i < timers.length; i += 1) {
	    clearTimeout(timers[i].id);
	  }
	}
	
	function removeCompletionTimer(context, timer) {
	  var i;
	
	  if (!context || !context.timers) {
	    return;
	  }
	  for (i = context.timers.length - 1; i >= 0; i -= 1) {
	    if (context.timers[i] === timer) {
	      context.timers.splice(i, 1);
	      return;
	    }
	  }
	}
	
	function scheduleCompletionTimer(context, callback, delayMs) {
	  var timer = { id: null };
	  var fired = false;
	
	  timer.id = setTimeout(function() {
	    fired = true;
	    removeCompletionTimer(context, timer);
	    if (isCurrentCompletion(context)) {
	      callback();
	    }
	  }, delayMs);
	  if (!fired) {
	    context.timers.push(timer);
	  }
	}
	
	function isCurrentCompletion(context) {
	  return !!context && s_active_completion === context &&
	    context.generation === s_conversation_generation &&
	    watch.isCurrentRequest(context.requestId);
	}
	
	function cloneJsonValue(value) {
	  try {
	    return JSON.parse(JSON.stringify(value));
	  } catch (e) {
	    return null;
	  }
	}
	
	function addRetryCapsuleBytes(state, amount) {
	  if (amount < 0 || state.bytes + amount > MAX_RETRY_CAPSULE_BYTES) {
	    return false;
	  }
	  state.bytes += amount;
	  return true;
	}
	
	function addRetryCapsuleString(state, value) {
	  var i;
	  var code;
	  var next;
	
	  if (typeof value !== 'string' || value.length > MAX_RETRY_CAPSULE_BYTES ||
	      !addRetryCapsuleBytes(state, 2)) {
	    return false;
	  }
	  for (i = 0; i < value.length; i += 1) {
	    code = value.charCodeAt(i);
	    if (code === 0x22 || code === 0x5c) {
	      if (!addRetryCapsuleBytes(state, 2)) { return false; }
	    } else if (code < 0x20) {
	      if (!addRetryCapsuleBytes(state,
	          code === 0x08 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d ? 2 : 6)) {
	        return false;
	      }
	    } else if (code <= 0x7f) {
	      if (!addRetryCapsuleBytes(state, 1)) { return false; }
	    } else if (code <= 0x7ff) {
	      if (!addRetryCapsuleBytes(state, 2)) { return false; }
	    } else if (code >= 0xd800 && code <= 0xdbff) {
	      next = i + 1 < value.length ? value.charCodeAt(i + 1) : 0;
	      if (next >= 0xdc00 && next <= 0xdfff) {
	        if (!addRetryCapsuleBytes(state, 4)) { return false; }
	        i += 1;
	      } else if (!addRetryCapsuleBytes(state, 6)) {
	        return false;
	      }
	    } else if (code >= 0xdc00 && code <= 0xdfff) {
	      if (!addRetryCapsuleBytes(state, 6)) { return false; }
	    } else if (!addRetryCapsuleBytes(state, 3)) {
	      return false;
	    }
	  }
	  return true;
	}
	
	function cloneBoundedRetryValue(value, state, depth) {
	  var type;
	  var result;
	  var key;
	  var child;
	  var count = 0;
	  var separator = false;
	  var i;
	  var numberText;
	
	  if (depth > MAX_RETRY_CAPSULE_DEPTH || state.nodes >= MAX_RETRY_CAPSULE_NODES) {
	    return undefined;
	  }
	  state.nodes += 1;
	  if (value === null) {
	    return addRetryCapsuleBytes(state, 4) ? null : undefined;
	  }
	
	  type = typeof value;
	  if (type === 'string') {
	    return addRetryCapsuleString(state, value) ? value : undefined;
	  }
	  if (type === 'boolean') {
	    return addRetryCapsuleBytes(state, value ? 4 : 5) ? value : undefined;
	  }
	  if (type === 'number') {
	    if (!isFinite(value)) { return undefined; }
	    numberText = String(value);
	    return addRetryCapsuleBytes(state, numberText.length) ? value : undefined;
	  }
	  if (type !== 'object') {
	    return undefined;
	  }
	
	  if (Object.prototype.toString.call(value) === '[object Array]') {
	    if (value.length > MAX_RETRY_CAPSULE_NODES - state.nodes ||
	        !addRetryCapsuleBytes(state, 1)) {
	      return undefined;
	    }
	    result = [];
	    for (i = 0; i < value.length; i += 1) {
	      if (!Object.prototype.hasOwnProperty.call(value, i) ||
	          (i > 0 && !addRetryCapsuleBytes(state, 1))) {
	        return undefined;
	      }
	      child = cloneBoundedRetryValue(value[i], state, depth + 1);
	      if (child === undefined) { return undefined; }
	      result.push(child);
	    }
	    return addRetryCapsuleBytes(state, 1) ? result : undefined;
	  }
	  if (Object.prototype.toString.call(value) !== '[object Object]' ||
	      !addRetryCapsuleBytes(state, 1)) {
	    return undefined;
	  }
	
	  result = Object.create(null);
	  for (key in value) {
	    count += 1;
	    if (count > MAX_RETRY_CAPSULE_NODES || state.nodes >= MAX_RETRY_CAPSULE_NODES) {
	      return undefined;
	    }
	    if (!Object.prototype.hasOwnProperty.call(value, key)) {
	      continue;
	    }
	    if ((separator && !addRetryCapsuleBytes(state, 1)) ||
	        !addRetryCapsuleString(state, key) || !addRetryCapsuleBytes(state, 1)) {
	      return undefined;
	    }
	    child = cloneBoundedRetryValue(value[key], state, depth + 1);
	    if (child === undefined) { return undefined; }
	    result[key] = child;
	    separator = true;
	  }
	  return addRetryCapsuleBytes(state, 1) ? result : undefined;
	}
	
	function cloneBoundedRetryCapsule(capsule) {
	  var state = { bytes: 0, nodes: 0 };
	  var copy = cloneBoundedRetryValue(capsule, state, 0);
	  var serialized;
	  var bytes = 0;
	  var i;
	  var code;
	  var next;
	
	  if (copy === undefined) {
	    return null;
	  }
	  try {
	    serialized = JSON.stringify(copy);
	  } catch (e) {
	    return null;
	  }
	  if (typeof serialized !== 'string' || serialized.length > MAX_RETRY_CAPSULE_BYTES) {
	    return null;
	  }
	  for (i = 0; i < serialized.length; i += 1) {
	    code = serialized.charCodeAt(i);
	    if (code <= 0x7f) {
	      bytes += 1;
	    } else if (code <= 0x7ff) {
	      bytes += 2;
	    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < serialized.length &&
	        (next = serialized.charCodeAt(i + 1)) >= 0xdc00 && next <= 0xdfff) {
	      bytes += 4;
	      i += 1;
	    } else {
	      bytes += 3;
	    }
	    if (bytes > MAX_RETRY_CAPSULE_BYTES) {
	      return null;
	    }
	  }
	  return copy;
	}
	
	function storeRetryCapsule(capsule) {
	  var copy;
	
	  s_retry_capsule = null;
	  copy = cloneBoundedRetryCapsule(capsule);
	  if (!copy) {
	    common.logDebug('retry capsule rejected by size or shape limit');
	    return false;
	  }
	  s_retry_capsule = copy;
	  return true;
	}
	
	function rememberModelFailure(context) {
	  var state = context && context.retryState;
	
	  if (!state) {
	    s_retry_capsule = null;
	    return false;
	  }
	  if (!state.toolsStarted) {
	    return rememberBeforeToolsFailure(context);
	  }
	  return storeRetryCapsule({
	    requestId: context.requestId,
	    generation: context.generation,
	    kind: 'final-only',
	    conversation: state.baseConversation || state.conversation,
	    settings: state.settings,
	    userText: context.userText,
	    mode: state.mode || 'text',
	    thinkingTrace: state.thinkingTrace || ''
	  });
	}
	
	function rememberBeforeToolsFailure(context) {
	  return storeRetryCapsule({
	    requestId: context.requestId,
	    generation: context.generation,
	    kind: 'before-tools',
	    userText: context.userText,
	    history: context.historyAtStart
	  });
	}
	
	function rememberSetupFailure(context) {
	  return storeRetryCapsule({
	    requestId: context.requestId,
	    generation: context.generation,
	    kind: 'setup',
	    userText: context.userText,
	    history: context.historyAtStart
	  });
	}
	
	function rememberDeliveryFailure(context, settings, userText, text, answerText) {
	  return storeRetryCapsule({
	    requestId: context.requestId,
	    generation: context.generation,
	    kind: 'delivery',
	    settings: { PreserveChats: !!settings.PreserveChats },
	    userText: userText,
	    text: String(text || ''),
	    answerText: String(answerText || '')
	  });
	}
	
	function setModelRetryState(context, settings, conversation, mode, thinkingTrace,
	                            baseConversation) {
	  context.retryState = {
	    settings: settings,
	    conversation: conversation,
	    baseConversation: baseConversation || null,
	    mode: mode,
	    thinkingTrace: thinkingTrace,
	    toolsStarted: context.toolsStarted === true
	  };
	}
	
	function sendCompletionResponse(context, settings, userText, text) {
	  watch.sendResponse(context.requestId, settings, text, function(sendError) {
	    if (!sendError && isCurrentCompletion(context)) {
	      s_retry_capsule = null;
	      rememberChatTurn(settings, userText, text);
	    }
	    finishCompletionContext(context);
	  }, function(sendError, preparedText) {
	    if (!sendError || !isCurrentCompletion(context)) {
	      return false;
	    }
	    return rememberDeliveryFailure(context, settings, userText, preparedText, text);
	  });
	}
	
	function finishCompletionContext(context) {
	  clearCompletionTimers(context);
	  if (s_active_completion !== context) {
	    return;
	  }
	  s_active_completion = null;
	  watch.finishRequestLifecycle(context.requestId);
	}
	
	function failCompletionContext(context, message) {
	  var retryAvailable;
	
	  if (!isCurrentCompletion(context)) {
	    return;
	  }
	  if (context.retryKind === 'setup') {
	    rememberSetupFailure(context);
	  } else if (context.retryKind === 'before-tools') {
	    rememberBeforeToolsFailure(context);
	  }
	  if (s_retry_capsule && Number(s_retry_capsule.requestId) === Number(context.requestId) &&
	      s_retry_capsule.generation !== context.generation) {
	    s_retry_capsule = null;
	  }
	  retryAvailable = !!(s_retry_capsule &&
	      Number(s_retry_capsule.requestId) === Number(context.requestId) &&
	      s_retry_capsule.generation === context.generation);
	  watch.sendError(context.requestId, message, function() {
	    finishCompletionContext(context);
	  }, retryAvailable);
	}
	
	function invalidateConversationGeneration() {
	  var context = s_active_completion;
	
	  s_conversation_generation += 1;
	  s_retry_capsule = null;
	  s_active_completion = null;
	  if (context) {
	    clearCompletionTimers(context);
	    cancelPendingDiscovery(context);
	    watch.cancelRequestLifecycle(context.requestId);
	  }
	}
	
	function resetChatHistory() {
	  invalidateConversationGeneration();
	  s_chat_history = [];
	  s_saved_chat_history = [];
	  s_active_chat_id = null;
	  opencodeSession.rotateConversationSessionId();
	}
	
	function listSavedChats() {
	  return chatStore.listChats();
	}
	
	function loadSavedChat(chatId) {
	  var chat = chatStore.getChat(chatId);
	
	  if (!chat) {
	    return null;
	  }
	
	  invalidateConversationGeneration();
	  s_chat_history = copyChatHistory(chat.messages);
	  s_saved_chat_history = copyChatHistory(chat.messages);
	  s_active_chat_id = chat.id;
	  opencodeSession.rotateConversationSessionId();
	  return chat;
	}
	
	function deleteSavedChat(chatId) {
	  var deleted = chatStore.deleteChat(chatId);
	
	  if (deleted) {
	    s_retry_capsule = null;
	  }
	  if (deleted && s_active_chat_id === String(chatId || '')) {
	    invalidateConversationGeneration();
	    s_active_chat_id = null;
	    s_saved_chat_history = [];
	    opencodeSession.rotateConversationSessionId();
	  }
	
	  return deleted;
	}
	
	function deleteAllSavedChats() {
	  invalidateConversationGeneration();
	  chatStore.deleteAllChats();
	  s_active_chat_id = null;
	  s_saved_chat_history = [];
	  opencodeSession.rotateConversationSessionId();
	}
	
	function normalizeToolParameters(parameters) {
	  if (!parameters || typeof parameters !== 'object') {
	    return { type: 'object', properties: {} };
	  }
	
	  if (!parameters.type) {
	    parameters.type = 'object';
	  }
	  if (parameters.type === 'object' && !parameters.properties) {
	    parameters.properties = {};
	  }
	
	  return parameters;
	}
	
	function buildNativeTools(toolDefinitions, protocol) {
	  var result = [];
	  var i;
	  var tool;
	  var definition;
	
	  for (i = 0; i < toolDefinitions.length; i += 1) {
	    tool = toolDefinitions[i] || {};
	    definition = {
	      name: tool.name,
	      description: tool.description || 'Phone-side tool',
	      parameters: normalizeToolParameters(tool.parameters)
	    };
	
	    if (protocol === 'chat') {
	      result.push({
	        type: 'function',
	        function: definition
	      });
	    } else if (protocol === 'messages') {
	      result.push({
	        name: definition.name,
	        description: definition.description,
	        input_schema: definition.parameters
	      });
	    } else {
	      result.push({
	        type: 'function',
	        name: definition.name,
	        description: definition.description,
	        parameters: definition.parameters
	      });
	    }
	  }
	
	  return result;
	}
	
	function buildReasoningObject(settings, options) {
	  var reasoning = {};
	  var effort;
	
	  if (shouldRequestReasoningSummary(settings, options)) {
	    reasoning.summary = 'auto';
	  }
	
	  effort = common.REASONING_EFFORTS && common.REASONING_EFFORTS.hasOwnProperty(settings.ReasoningEffort)
	    ? common.REASONING_EFFORTS[settings.ReasoningEffort]
	    : '';
	  if (effort) {
	    reasoning.effort = effort;
	  }
	
	  return Object.keys(reasoning).length ? reasoning : null;
	}
	
	function responsesTextFromContent(content) {
	  var text = '';
	  var i;
	
	  if (typeof content === 'string') {
	    return content;
	  }
	  if (!content || !content.length) {
	    return '';
	  }
	  for (i = 0; i < content.length; i += 1) {
	    if (content[i] && typeof content[i].text === 'string') {
	      text += content[i].text;
	    } else if (typeof content[i] === 'string') {
	      text += content[i];
	    }
	  }
	  return text;
	}
	
	function extractSystemPrompt(conversation) {
	  if (conversation.length && conversation[0] && conversation[0].role === 'system') {
	    return responsesTextFromContent(conversation[0].content);
	  }
	
	  return '';
	}
	
	function toResponsesInput(conversation) {
	  var input = [];
	  var i;
	  var item;
	  var j;
	  var part;
	  var content;
	
	  for (i = 0; i < conversation.length; i += 1) {
	    item = conversation[i] || {};
	    if (item.type) {
	      input.push(item);
	      continue;
	    }
	    if (item.role !== 'system' && item.role !== 'developer' && item.role !== 'user' && item.role !== 'assistant') {
	      continue;
	    }
	    if (typeof item.content === 'string') {
	      content = [{ type: item.role === 'assistant' ? 'output_text' : 'input_text', text: item.content }];
	      input.push({ role: item.role, content: content });
	      continue;
	    }
	    if (item.content && item.content.length) {
	      content = [];
	      for (j = 0; j < item.content.length; j += 1) {
	        part = item.content[j] || {};
	        if (part.type === 'text') {
	          content.push({ type: item.role === 'assistant' ? 'output_text' : 'input_text', text: String(part.text || '') });
	        } else {
	          content.push(part);
	        }
	      }
	      input.push({ role: item.role, content: content });
	      continue;
	    }
	    content = [{ type: item.role === 'assistant' ? 'output_text' : 'input_text', text: '' }];
	    input.push({ role: item.role, content: content });
	  }
	
	  return input;
	}
	
	function collectRoleTurns(conversation) {
	  var turns = [];
	  var i;
	
	  for (i = 0; i < conversation.length; i += 1) {
	    if (conversation[i] && (conversation[i].role === 'user' || conversation[i].role === 'assistant')) {
	      turns.push(conversation[i]);
	    }
	  }
	
	  return turns;
	}
	
	function buildMessagesMaxTokens(settings) {
	  if (settings.MaxOutputTokens && settings.MaxOutputTokens > 0) {
	    return settings.MaxOutputTokens;
	  }
	
	  return DEFAULT_MESSAGES_MAX_TOKENS;
	}
	
	function buildBody(settings, conversation, options) {
	  var chatMode = isChatEndpoint(settings);
	  var protocol = endpointProtocol(settings);
	  var body;
	  var reasoning;
	  var tools;
	
	  options = options || {};
	
	  if (chatMode) {
	    body = {
	      model: settings.Model,
	      messages: conversation
	    };
	    if (options.nativeTools && options.toolDefinitions && options.toolDefinitions.length) {
	      body.tools = buildNativeTools(options.toolDefinitions, 'chat');
	    }
	    if (settings.MaxOutputTokens && settings.MaxOutputTokens > 0) {
	      body.max_completion_tokens = settings.MaxOutputTokens;
	    }
	    return body;
	  }
	
	  if (protocol === 'messages') {
	    body = {
	      model: settings.Model,
	      max_tokens: buildMessagesMaxTokens(settings),
	      system: extractSystemPrompt(conversation),
	      messages: collectRoleTurns(conversation)
	    };
	    if (options.nativeTools && options.toolDefinitions && options.toolDefinitions.length) {
	      body.tools = buildNativeTools(options.toolDefinitions, 'messages');
	    }
	    return body;
	  }
	
	  body = {
	    model: settings.Model,
	    input: toResponsesInput(conversation)
	  };
	
	  reasoning = buildReasoningObject(settings, options);
	  if (reasoning) {
	    body.reasoning = reasoning;
	    if (isOpenAiResponsesEndpoint(settings)) {
	      reasoning.encrypted_content = 'auto';
	    }
	  }
	
	  tools = [];
	  if (options.nativeTools && options.toolDefinitions && options.toolDefinitions.length) {
	    tools = buildNativeTools(options.toolDefinitions, 'responses');
	  }
	  if (tools.length) {
	    body.tools = tools;
	  }
	
	  if (settings.MaxOutputTokens && settings.MaxOutputTokens > 0) {
	    body.max_output_tokens = settings.MaxOutputTokens;
	  }
	
	  if (isOpenAiResponsesEndpoint(settings)) {
	    body.store = false;
	  }
	
	  return body;
	}
	
	function isTransientHttpStatus(status) {
	  return status === 408 || status === 429 || (status >= 500 && status < 600);
	}
	
	function parseRetryAfterMs(request) {
	  var raw;
	  var seconds;
	
	  try {
	    raw = request.getResponseHeader('Retry-After');
	  } catch (e) {
	    raw = null;
	  }
	
	  if (!raw) {
	    return 0;
	  }
	
	  seconds = parseInt(raw, 10);
	  if (isNaN(seconds) || seconds < 0) {
	    return 0;
	  }
	
	  return Math.min(seconds * 1000, common.MAX_RETRY_AFTER_MS);
	}
	
	function requestModel(settings, conversation, requestId, options, callback) {
	  if (typeof options === 'function') {
	    callback = options;
	    options = {};
	  }
	  options = options || {};
	
	  var done = false;
	  var reasoningSummarySkipped = false;
	  var transientRetried = false;
	  var plan = buildEndpointPlan(settings);
	  var completionContext = s_active_completion && s_active_completion.requestId === requestId ? s_active_completion : null;
	
	  function finishOnce(error, json, meta) {
	    if (done) {
	      return;
	    }
	    done = true;
	    if (!isCurrentCompletion(completionContext)) {
	      return;
	    }
	    if (error) {
	      rememberModelFailure(completionContext);
	    }
	    callback(error, json, meta);
	  }
	
	  function scheduleTransientRetry(runAttempt, delayMs) {
	    transientRetried = true;
	    scheduleCompletionTimer(completionContext, function() {
	      if (done) {
	        return;
	      }
	      runAttempt();
	    }, delayMs);
	  }
	
	  function attempt(candidateIndex, skipReasoningSummary) {
	    var candidate = plan.candidates[candidateIndex];
	    var attemptSettings = candidate.settings;
	    var request = new XMLHttpRequest();
	    var requestOptions = copyRequestOptions(options);
	    var includeReasoningSummary;
	    var body;
	
	    if (!isCurrentCompletion(completionContext)) {
	      return;
	    }
	
	    if (skipReasoningSummary) {
	      requestOptions.skipReasoningSummary = true;
	    }
	    includeReasoningSummary = shouldRequestReasoningSummary(attemptSettings, requestOptions);
	    body = JSON.stringify(buildBody(attemptSettings, conversation, requestOptions));
	
	    common.logDebug('llm request endpoint=' + attemptSettings.Endpoint + ' model=' + attemptSettings.Model + ' mode=' + endpointProtocol(attemptSettings) + ' nativeTools=' + (requestOptions.nativeTools ? '1' : '0') + ' tools=' + ((requestOptions.toolDefinitions && requestOptions.toolDefinitions.length) || 0) + ' reasoningSummary=' + (includeReasoningSummary ? '1' : '0') + ' messages=' + conversation.length + ' bytes=' + body.length + ' timeoutMs=' + attemptSettings.RequestTimeoutMs);
	
	    request.open('POST', attemptSettings.Endpoint, true);
	    request.setRequestHeader('Content-Type', 'application/json');
	    if (isMessagesEndpoint(attemptSettings)) {
	      request.setRequestHeader('x-api-key', attemptSettings.ApiKey);
	      request.setRequestHeader('anthropic-version', ANTHROPIC_API_VERSION);
	    } else {
	      request.setRequestHeader('Authorization', 'Bearer ' + attemptSettings.ApiKey);
	    }
	    opencodeSession.applySessionHeader(request, attemptSettings.Endpoint);
	    request.timeout = attemptSettings.RequestTimeoutMs;
	
	    if (!watch.trackXhr(requestId, request)) {
	      return;
	    }
	
	    request.onload = function() {
	      var json;
	
	      watch.untrackXhr(requestId, request);
	      if (!isCurrentCompletion(completionContext)) {
	        return;
	      }
	
	      common.logDebug('llm response status=' + request.status + ' bytes=' + String(request.responseText || '').length);
	
	      if (request.status < 200 || request.status >= 300) {
	        if (includeReasoningSummary && (request.status === 400 || request.status === 422) && !reasoningSummarySkipped) {
	          common.logDebug('reasoning summary rejected; retrying without summary');
	          reasoningSummarySkipped = true;
	          attempt(candidateIndex, true);
	          return;
	        }
	
	        if (plan.rotationActive && request.status === 500) {
	          common.logDebug('http 500 rotating protocol candidate=' + (candidateIndex + 1) + '/' + plan.candidates.length + ' failedProtocol=' + candidate.protocol);
	          if (candidateIndex + 1 < plan.candidates.length) {
	            attempt(candidateIndex + 1, false, false);
	          } else {
	            finishOnce('HTTP ' + request.status + ': ' + String(request.responseText || '').substring(0, 250), null, { status: request.status });
	          }
	          return;
	        }
	
	        if (isTransientHttpStatus(request.status) && !transientRetried) {
	          common.logDebug('transient http status=' + request.status + '; retrying once');
	          scheduleTransientRetry(function() {
	            attempt(candidateIndex, skipReasoningSummary);
	          }, parseRetryAfterMs(request));
	          return;
	        }
	
	        finishOnce('HTTP ' + request.status + ': ' + String(request.responseText || '').substring(0, 250), null, { status: request.status });
	        return;
	      }
	
	      try {
	        json = JSON.parse(request.responseText);
	      } catch (e) {
	        finishOnce('Bad JSON response');
	        return;
	      }
	
	      if (plan.rotationActive) {
	        endpointCache.remember(plan.originalEndpoint, attemptSettings.Model, cacheProtocolNameFromInternal(candidate.protocol));
	      }
	
	      finishOnce(null, json, { status: request.status });
	    };
	
	    request.onerror = function() {
	      watch.untrackXhr(requestId, request);
	      if (!isCurrentCompletion(completionContext)) {
	        return;
	      }
	      common.logDebug('llm network error');
	      if (!transientRetried) {
	        scheduleTransientRetry(function() {
	          attempt(candidateIndex, skipReasoningSummary);
	        }, 0);
	        return;
	      }
	      finishOnce('Network error');
	    };
	
	    request.ontimeout = function() {
	      watch.untrackXhr(requestId, request);
	      if (!isCurrentCompletion(completionContext)) {
	        return;
	      }
	      common.logDebug('llm timeout');
	      if (!transientRetried) {
	        scheduleTransientRetry(function() {
	          attempt(candidateIndex, skipReasoningSummary);
	        }, 0);
	        return;
	      }
	      finishOnce('Request timed out');
	    };
	
	    request.onabort = function() {
	      watch.untrackXhr(requestId, request);
	    };
	
	    request.send(body);
	  }
	
	  attempt(0, false, false);
	}
	
	function getUsageToken(usage, primaryName, fallbackName) {
	  var value;
	  var number;
	
	  if (!usage) {
	    return null;
	  }
	
	  value = usage[primaryName];
	  if (value === undefined || value === null) {
	    value = usage[fallbackName];
	  }
	
	  number = parseInt(value, 10);
	  if (isNaN(number) || number < 0) {
	    return null;
	  }
	
	  return number;
	}
	
	function updateProgressContextSizes(requestId, settings, json) {
	  var usage = json && json.usage;
	  var inputTokens;
	  var outputTokens;
	  var inputText = '';
	  var outputText = '';
	
	  if (!settings.ShowInputContextSize && !settings.ShowOutputContextSize) {
	    return;
	  }
	
	  inputTokens = getUsageToken(usage, 'input_tokens', 'prompt_tokens');
	  outputTokens = getUsageToken(usage, 'output_tokens', 'completion_tokens');
	
	  if (settings.ShowInputContextSize && inputTokens !== null) {
	    inputText = String(inputTokens);
	  }
	  if (settings.ShowOutputContextSize && outputTokens !== null) {
	    outputText = String(outputTokens);
	  }
	
	  watch.progressSetContextSizes(requestId, inputText, outputText);
	}
	
	function getChoiceMessage(json) {
	  if (json.choices && json.choices.length && json.choices[0].message) {
	    return json.choices[0].message;
	  }
	
	  return null;
	}
	
	function getFinishReason(json) {
	  if (json.choices && json.choices.length) {
	    return json.choices[0].finish_reason || '';
	  }
	
	  return '';
	}
	
	function appendThinkingText(base, value) {
	  value = common.trim(value);
	  if (!value) {
	    return base;
	  }
	
	  return base + (base ? '\n\n' : '') + value;
	}
	
	function collectThinkingText(content) {
	  var text = common.collectTextFromContent(content);
	  var i;
	
	  if (text || !content) {
	    return text;
	  }
	
	  if (content.summary) {
	    return collectThinkingText(content.summary);
	  }
	  if (content.reasoning) {
	    return collectThinkingText(content.reasoning);
	  }
	  if (content.reasoning_content) {
	    return collectThinkingText(content.reasoning_content);
	  }
	  if (content.reasoning_details) {
	    return collectThinkingText(content.reasoning_details);
	  }
	  if (content.thinking) {
	    return collectThinkingText(content.thinking);
	  }
	  if (content.thinking_content) {
	    return collectThinkingText(content.thinking_content);
	  }
	
	  if (content.length) {
	    for (i = 0; i < content.length; i += 1) {
	      text += collectThinkingText(content[i]);
	    }
	  }
	
	  return text;
	}
	
	function appendThinkingContent(base, content) {
	  return appendThinkingText(base, collectThinkingText(content));
	}
	
	function extractMessageThinking(message) {
	  var thinking = '';
	
	  if (!message) {
	    return '';
	  }
	
	  thinking = appendThinkingContent(thinking, message.reasoning_content);
	  thinking = appendThinkingContent(thinking, message.reasoning);
	  thinking = appendThinkingContent(thinking, message.reasoning_details);
	  thinking = appendThinkingContent(thinking, message.thinking);
	  thinking = appendThinkingContent(thinking, message.thinking_content);
	
	  return thinking;
	}
	
	function extractResponseThinking(json) {
	  var thinking = extractMessageThinking(getChoiceMessage(json));
	  var i;
	  var item;
	
	  if (json.output && json.output.length) {
	    for (i = 0; i < json.output.length; i += 1) {
	      item = json.output[i];
	      if (item.type === 'reasoning' || item.reasoning) {
	        thinking = appendThinkingContent(thinking, item.summary || item.content || item.reasoning || item);
	      }
	    }
	  }
	
	  if (json.content && json.content.length) {
	    for (i = 0; i < json.content.length; i += 1) {
	      item = json.content[i] || {};
	      if (item.type === 'thinking' && typeof item.thinking === 'string') {
	        thinking = appendThinkingText(thinking, item.thinking);
	      }
	    }
	  }
	
	  return thinking;
	}
	
	function extractThinkingBlocks(text) {
	  var thinking = '';
	  var source = String(text || '');
	  var pattern = /<think>([\s\S]*?)<\/think>/gi;
	  var match;
	
	  while ((match = pattern.exec(source)) !== null) {
	    thinking = appendThinkingText(thinking, match[1]);
	  }
	
	  return {
	    thinking: thinking,
	    answer: stripThinking(source)
	  };
	}
	
	function summarizeResponseShape(json) {
	  var message = getChoiceMessage(json);
	  var content = message ? message.content : null;
	  var contentType = content === null ? 'null' : typeof content;
	  var contentLength = typeof content === 'string' ? content.length : (content && content.length ? content.length : 0);
	  var reasoningLength = extractMessageThinking(message).length;
	
	  return 'finish=' + getFinishReason(json) + ' contentType=' + contentType + ' contentLen=' + contentLength + ' reasoningLen=' + reasoningLength;
	}
	
	function extractResponseText(json) {
	  var answer = '';
	  var i;
	  var j;
	  var item;
	  var content;
	  var hasOutputText = !!json.output_text;
	  var message;
	
	  if (hasOutputText) {
	    answer = json.output_text;
	  }
	
	  message = getChoiceMessage(json);
	  if (message) {
	    answer = answer || common.collectTextFromContent(message.content);
	    answer = answer || common.collectTextFromContent(message.output_text);
	    answer = answer || common.collectTextFromContent(message.text);
	  }
	
	  if (json.output && json.output.length) {
	    for (i = 0; i < json.output.length; i += 1) {
	      item = json.output[i];
	      if (item.content && item.content.length) {
	        for (j = 0; j < item.content.length; j += 1) {
	          content = item.content[j];
	          if (!hasOutputText && (content.type === 'output_text' || content.type === 'text')) {
	            answer += content.text || '';
	          }
	        }
	      }
	    }
	  }
	
	  if (json.content && json.content.length) {
	    for (i = 0; i < json.content.length; i += 1) {
	      item = json.content[i] || {};
	      if (!hasOutputText && item.type === 'text' && typeof item.text === 'string') {
	        answer += item.text;
	      }
	    }
	  }
	
	  return answer;
	}
	
	function stripThinking(text) {
	  return String(text || '')
	    .replace(/<think>[\s\S]*?<\/think>/gi, '')
	    .replace(/<think>[\s\S]*$/gi, '')
	    .replace(/<\/think>/gi, '')
	    .replace(/^\s+/, '');
	}
	
	function stripThinkingWrapper(text) {
	  var value = stripThinking(text);
	  var marker = '\n\nAnswer:\n';
	  var index = value.indexOf(marker);
	
	  if (value.substring(0, 'Thinking:\n'.length) === 'Thinking:\n' && index !== -1) {
	    return value.substring(index + marker.length);
	  }
	
	  return value;
	}
	
	function formatToolCallTrace(toolCalls, toolMap) {
	  var lines = [];
	  var i;
	
	  for (i = 0; i < toolCalls.length; i += 1) {
	    lines.push('> ' + tools.formatToolCallLabel(toolCalls[i], toolMap));
	  }
	
	  return lines.join('\n');
	}
	
	function extractResponseThinkingText(json) {
	  var answer = extractResponseText(json);
	  var thinking = extractResponseThinking(json);
	  var blocks = extractThinkingBlocks(answer);
	
	  return appendThinkingText(thinking, blocks.thinking);
	}
	
	function appendToolRoundTrace(base, json, toolCalls, toolMap) {
	  var trace = appendThinkingText(base, extractResponseThinkingText(json));
	
	  return appendThinkingText(trace, formatToolCallTrace(toolCalls, toolMap));
	}
	
	function extractRefusal(json) {
	  var message = getChoiceMessage(json);
	  var i;
	  var j;
	  var item;
	  var content;
	
	  if (message && message.refusal) {
	    return common.trim(String(message.refusal));
	  }
	
	  if (message && message.content && message.content.length) {
	    for (i = 0; i < message.content.length; i += 1) {
	      content = message.content[i] || {};
	      if (content.type === 'refusal' && content.text) {
	        return common.trim(String(content.text));
	      }
	    }
	  }
	
	  if (json.output && json.output.length) {
	    for (i = 0; i < json.output.length; i += 1) {
	      item = json.output[i] || {};
	      if (item.content && item.content.length) {
	        for (j = 0; j < item.content.length; j += 1) {
	          content = item.content[j] || {};
	          if (content.type === 'refusal' && content.text) {
	            return common.trim(String(content.text));
	          }
	        }
	      }
	    }
	  }
	
	  return '';
	}
	
	function extractIncompleteReason(json) {
	  var status = String(json && json.status || '');
	  var details = json && json.incomplete_details;
	
	  if (status !== 'incomplete') {
	    if (json && json.stop_reason === 'max_tokens') {
	      return 'max_tokens';
	    }
	    return '';
	  }
	
	  if (details && details.reason) {
	    return common.trim(String(details.reason));
	  }
	
	  return '';
	}
	
	function parseResponse(json, showThinking, extraThinking) {
	  var answer = extractResponseText(json);
	  var refusal;
	  var incomplete;
	  var thinking;
	  var blocks;
	  var result;
	
	  if (!answer) {
	    refusal = extractRefusal(json);
	    if (refusal) {
	      answer = refusal;
	    }
	  }
	
	  if (!answer) {
	    incomplete = extractIncompleteReason(json);
	    if (incomplete) {
	      answer = 'Response incomplete: ' + incomplete;
	    }
	  }
	
	  if (!answer) {
	    common.logDebug('no response text; shape=' + summarizeResponseShape(json));
	    answer = 'No response text.';
	  }
	
	  if (!showThinking) {
	    return stripThinking(answer);
	  }
	
	  blocks = extractThinkingBlocks(answer);
	  thinking = extractResponseThinking(json);
	  thinking = appendThinkingText(thinking, blocks.thinking);
	  thinking = appendThinkingText(common.trim(extraThinking), thinking);
	  result = blocks.answer;
	
	  if (!thinking) {
	    return result;
	  }
	
	  return 'Thinking:\n' + thinking + '\n\nAnswer:\n' + stripThinking(result);
	}
	
	function stripCodeFence(text) {
	  var value = common.trim(text);
	  var match = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
	
	  if (match) {
	    return common.trim(match[1]);
	  }
	
	  return value;
	}
	
	function parseJsonFromText(text) {
	  var value = stripCodeFence(stripThinking(text));
	  var parsed;
	  var start;
	  var end;
	
	  try {
	    return JSON.parse(value);
	  } catch (e) {
	    start = value.indexOf('{');
	    end = value.lastIndexOf('}');
	    if (start !== -1 && end !== -1 && end > start) {
	      try {
	        return JSON.parse(value.substring(start, end + 1));
	      } catch (e2) {}
	    }
	
	    start = value.indexOf('[');
	    end = value.lastIndexOf(']');
	    if (start === -1 || end === -1 || end <= start) {
	      return null;
	    }
	
	    try {
	      parsed = JSON.parse(value.substring(start, end + 1));
	    } catch (e3) {
	      return null;
	    }
	  }
	
	  return parsed;
	}
	
	function normalizeToolCall(call, index) {
	  var fn;
	  var name;
	  var args;
	  var id;
	
	  call = call || {};
	  fn = call.function && typeof call.function === 'object' ? call.function : null;
	  if (fn) {
	    name = fn.name || call.name || call.tool;
	    args = fn.arguments;
	  } else {
	    name = call.name || call.tool || (typeof call.function === 'string' ? call.function : '');
	    args = call.arguments;
	  }
	
	  if (args === undefined) {
	    args = call.args;
	  }
	  if (args === undefined) {
	    args = call.parameters;
	  }
	  if (args === undefined) {
	    args = call.params;
	  }
	  if (args === undefined) {
	    args = call.input;
	  }
	  if (args === undefined) {
	    args = {};
	  }
	
	  id = call.id || call.call_id || call.tool_call_id || name || ('call_' + index);
	
	  return {
	    id: id,
	    call_id: call.call_id || id,
	    name: name,
	    arguments: args
	  };
	}
	
	function addToolCall(result, call, toolMap, allowUnknown) {
	  var normalized = normalizeToolCall(call, result.length + 1);
	
	  if (!normalized.name) {
	    return;
	  }
	
	  if (!allowUnknown && toolMap && !toolMap[normalized.name]) {
	    return;
	  }
	
	  result.push(normalized);
	}
	
	function parsedToolCalls(parsed, toolMap) {
	  var result = [];
	  var i;
	
	  if (!parsed) {
	    return result;
	  }
	
	  if (Object.prototype.toString.call(parsed) === '[object Array]') {
	    for (i = 0; i < parsed.length; i += 1) {
	      addToolCall(result, parsed[i], toolMap, false);
	    }
	    return result;
	  }
	
	  if (parsed && parsed.tool_calls && parsed.tool_calls.length) {
	    for (i = 0; i < parsed.tool_calls.length; i += 1) {
	      addToolCall(result, parsed.tool_calls[i], toolMap, true);
	    }
	    return result;
	  }
	
	  if (parsed && parsed.tool_calls && typeof parsed.tool_calls === 'object') {
	    addToolCall(result, parsed.tool_calls, toolMap, true);
	    return result;
	  }
	
	  if (parsed && parsed.tool_call && typeof parsed.tool_call === 'object') {
	    addToolCall(result, parsed.tool_call, toolMap, true);
	    return result;
	  }
	
	  if (parsed && parsed.function_call && typeof parsed.function_call === 'object') {
	    addToolCall(result, parsed.function_call, toolMap, true);
	    return result;
	  }
	
	  if (parsed && parsed.name && toolMap && toolMap[parsed.name]) {
	    addToolCall(result, parsed, toolMap, false);
	    return result;
	  }
	
	  if (parsed && parsed.function && parsed.function.name && toolMap && toolMap[parsed.function.name]) {
	    addToolCall(result, parsed, toolMap, false);
	    return result;
	  }
	
	  return result;
	}
	
	function parseToolCalls(text, toolMap) {
	  return parsedToolCalls(parseJsonFromText(text), toolMap);
	}
	
	function extractNativeToolCalls(json) {
	  var result = [];
	  var message = getChoiceMessage(json);
	  var i;
	  var item;
	
	  if (message && message.tool_calls && message.tool_calls.length) {
	    for (i = 0; i < message.tool_calls.length; i += 1) {
	      addToolCall(result, message.tool_calls[i], null, true);
	    }
	  }
	
	  if (message && message.function_call) {
	    addToolCall(result, {
	      id: message.function_call.id || message.function_call.name,
	      function: message.function_call
	    }, null, true);
	  }
	
	  if (json.output && json.output.length) {
	    for (i = 0; i < json.output.length; i += 1) {
	      item = json.output[i] || {};
	      if (item.type === 'function_call' || (item.name && item.arguments !== undefined && item.call_id)) {
	        addToolCall(result, item, null, true);
	      }
	    }
	  }
	
	  if (json.content && json.content.length) {
	    for (i = 0; i < json.content.length; i += 1) {
	      item = json.content[i] || {};
	      if (item.type === 'tool_use') {
	        addToolCall(result, item, null, true);
	      }
	    }
	  }
	
	  return result;
	}
	
	function extractToolCallBatch(json, mode, toolMap) {
	  var nativeCalls;
	  var textCalls;
	
	  if (mode === 'native') {
	    nativeCalls = extractNativeToolCalls(json);
	    if (nativeCalls.length) {
	      return { source: 'native', calls: nativeCalls };
	    }
	  }
	
	  textCalls = parseToolCalls(extractResponseText(json), toolMap);
	  if (textCalls.length) {
	    return { source: 'text', calls: textCalls };
	  }
	
	  return { source: '', calls: [] };
	}
	
	function buildToolCapNotice() {
	  return TOOL_CAP_NOTICE;
	}
	
	function formatToolResultOutput(result) {
	  var sanitized = sanitizeToolResult(result);
	  if (sanitized.error) { return common.safeJson({ error: sanitized.error }); }
	  return common.safeJson({ result: sanitized.result });
	}
	
	function capErrorText(value) {
	  var text = String(value || '');
	  var suffix = '... [truncated]';
	  var maximum = 900;
	  if (text.length <= maximum) { return text; }
	  return text.substring(0, maximum - suffix.length) + suffix;
	}
	
	function boundedToolError(value) {
	  var text = String(value || '');
	  if (text.length <= MAX_TOOL_RESULT_CHARS) { return text; }
	  return TOOL_ERROR_OMISSION;
	}
	
	function capPlainToolValue(value, limit) {
	  var text = String(value || '');
	  if (text.length <= limit) { return text; }
	  if (limit > TOOL_RESULT_TRUNCATION_SUFFIX.length) {
	    return text.substring(0, limit - TOOL_RESULT_TRUNCATION_SUFFIX.length) + TOOL_RESULT_TRUNCATION_SUFFIX;
	  }
	  return null;
	}
	
	function structuredOmission(reason, limit) {
	  var text = common.safeJson({ error: reason });
	  if (text.length <= limit) { return text; }
	  text = common.safeJson({ error: 'Omitted' });
	  if (text.length <= limit) { return text; }
	  return limit >= 4 ? 'null' : null;
	}
	
	function isTrustedMcpResultEnvelope(result, value) {
	  return result && result._mcpResultEnvelope === true && value && typeof value === 'object' && value.mcpResult === true &&
	    typeof value.text === 'string' && Object.prototype.hasOwnProperty.call(value, 'structuredContent');
	}
	
	function capMcpResultEnvelope(value, limit) {
	  var text = value.text;
	  var structuredContent = value.structuredContent;
	  var textTruncated = value.textTruncated === true;
	  var structuredContentOmitted = value.structuredContentOmitted === true;
	  var omittedBlocks = typeof value.omittedBlocks === 'number' && isFinite(value.omittedBlocks) && value.omittedBlocks > 0 ? Math.floor(value.omittedBlocks) : 0;
	  var low;
	  var high;
	  var middle;
	  var candidate;
	  var best = null;
	
	  function serialize(candidateText) {
	    var output = {
	      mcpResult: true,
	      text: candidateText,
	      structuredContent: structuredContent
	    };
	    if (textTruncated) { output.textTruncated = true; }
	    if (structuredContentOmitted) { output.structuredContentOmitted = true; }
	    if (omittedBlocks) { output.omittedBlocks = omittedBlocks; }
	    return JSON.stringify(output);
	  }
	
	  try {
	    candidate = serialize(text);
	    if (candidate.length <= limit) { return candidate; }
	
	    textTruncated = true;
	    candidate = serialize('');
	    if (candidate.length > limit) {
	      structuredContent = { error: 'Structured MCP content omitted: remaining tool-result budget is too small' };
	      structuredContentOmitted = true;
	      candidate = serialize('');
	      if (candidate.length > limit) { return null; }
	    }
	
	    low = 0;
	    high = text.length;
	    while (low <= high) {
	      middle = Math.floor((low + high) / 2);
	      if (middle > 0 && middle < text.length && text.charCodeAt(middle - 1) >= 0xD800 && text.charCodeAt(middle - 1) <= 0xDBFF &&
	          text.charCodeAt(middle) >= 0xDC00 && text.charCodeAt(middle) <= 0xDFFF) {
	        middle -= 1;
	      }
	      candidate = serialize(text.substring(0, middle));
	      if (candidate.length <= limit) {
	        best = candidate;
	        low = middle + 1;
	      } else {
	        high = middle - 1;
	      }
	    }
	    return best;
	  } catch (e) {
	    return null;
	  }
	}
	
	function sanitizeToolResult(result) {
	  var output = {};
	  var value;
	  var parsed;
	  var structured;
	  if (!result || typeof result !== 'object') { result = {}; }
	  if (result.id !== undefined) { output.id = capErrorText(result.id).substring(0, 128); }
	  if (result.call_id !== undefined) { output.call_id = capErrorText(result.call_id).substring(0, 128); }
	  if (result.name !== undefined) { output.name = capErrorText(result.name).substring(0, 128); }
	  if (result.error) {
	    output.error = boundedToolError(result.error);
	    return output;
	  }
	  if (result.result === undefined) { return output; }
	
	  structured = result._structuredResult === true ||
	    (result.result !== null && typeof result.result === 'object');
	  if (structured) {
	    value = typeof result.result === 'string' ? result.result : common.safeJson(result.result);
	    try {
	      parsed = JSON.parse(value);
	      output.result = parsed;
	    } catch (e) {
	      output.result = { error: 'Structured tool result omitted: invalid JSON' };
	    }
	    return output;
	  }
	
	  output.result = String(result.result);
	  return output;
	}
	
	function sanitizeToolResults(results) {
	  var sanitized = [];
	  var i;
	  for (i = 0; i < results.length; i += 1) {
	    sanitized.push(sanitizeToolResult(results[i]));
	  }
	  return sanitized;
	}
	
	function errorForReservedAllowance(error, allowance) {
	  var text = String(error || '');
	  if (text.length <= allowance && text.length <= MAX_TOOL_RESULT_CHARS) { return text; }
	  if (TOOL_ERROR_OMISSION.length <= allowance) { return TOOL_ERROR_OMISSION; }
	  if ('Omitted'.length <= allowance) { return 'Omitted'; }
	  return '';
	}
	
	function capToolResults(results, remainingChars, options) {
	  var i;
	  var result;
	  var value;
	  var limit;
	  var structured;
	  var parsed;
	  var futureSlots;
	  var slotCount;
	  var noticeLength;
	  var slotAllowance;
	  var remainingData;
	  var omissionReason;
	  var omission;
	
	  options = options || {};
	  remainingChars = typeof remainingChars === 'number' && isFinite(remainingChars) ? Math.max(0, remainingChars) : MAX_TOOL_RESULTS_TOTAL_CHARS;
	  futureSlots = typeof options.futureSlots === 'number' && isFinite(options.futureSlots) ? Math.max(0, Math.floor(options.futureSlots)) : 0;
	  slotCount = results.length + futureSlots;
	  noticeLength = options.includeCapNotice || futureSlots > 0 ? TOOL_CAP_NOTICE.length : 0;
	  slotAllowance = slotCount > 0 ? Math.min(
	    TOOL_RESULT_ERROR_RESERVE_CHARS,
	    Math.floor(Math.max(0, remainingChars - noticeLength) / slotCount)
	  ) : 0;
	  remainingData = Math.max(0, remainingChars - noticeLength - slotAllowance * slotCount);
	
	  for (i = 0; i < results.length; i += 1) {
	    result = results[i] || {};
	    if (result.error) {
	      value = String(result.error);
	      limit = Math.min(MAX_TOOL_RESULT_CHARS, remainingData + slotAllowance);
	      if (value.length > limit) {
	        value = errorForReservedAllowance(value, slotAllowance);
	      }
	      result.error = value;
	      remainingChars -= result.error.length;
	      remainingData += slotAllowance - result.error.length;
	      continue;
	    }
	    if (result.result === undefined || (result.result === null && result._structuredResult !== true)) {
	      remainingData += slotAllowance;
	      continue;
	    }
	
	    value = typeof result.result === 'string' ? result.result : common.safeJson(result.result);
	    structured = result._structuredResult === true ||
	      (result.result !== null && typeof result.result === 'object');
	    if (structured) {
	      parsed = null;
	      try {
	        parsed = JSON.parse(value);
	        value = common.safeJson(parsed);
	      } catch (e) {
	        value = common.safeJson({ error: 'Structured tool result omitted: invalid JSON' });
	      }
	      if (isTrustedMcpResultEnvelope(result, parsed)) {
	        omissionReason = value.length > MAX_TOOL_RESULT_CHARS ?
	          'Structured MCP result omitted: per-result limit exceeded' :
	          'Structured MCP result omitted: budget reserved for other results';
	        limit = Math.min(MAX_TOOL_RESULT_CHARS, remainingData + slotAllowance);
	        value = capMcpResultEnvelope(parsed, limit);
	        if (value !== null) {
	          remainingChars -= value.length;
	          remainingData += slotAllowance - value.length;
	          result.result = value;
	          result._structuredResult = true;
	          continue;
	        }
	        value = structuredOmission(omissionReason, slotAllowance);
	        if (value === null) {
	          delete result.result;
	          delete result._structuredResult;
	          result.error = errorForReservedAllowance(TOOL_RESULT_ERROR_OMISSION, slotAllowance);
	          remainingChars -= result.error.length;
	          remainingData += slotAllowance - result.error.length;
	          continue;
	        }
	        remainingChars -= value.length;
	        remainingData += slotAllowance - value.length;
	        result.result = value;
	        result._structuredResult = true;
	        continue;
	      }
	      limit = Math.min(MAX_TOOL_RESULT_CHARS, remainingData + slotAllowance);
	      if (value.length > limit) {
	        omissionReason = value.length > MAX_TOOL_RESULT_CHARS ?
	          'Tool result omitted: per-result limit exceeded' :
	          'Tool result omitted: budget reserved for other results';
	        omission = structuredOmission(omissionReason, slotAllowance);
	        value = omission;
	        if (value === null) {
	          delete result.result;
	          delete result._structuredResult;
	          result.error = errorForReservedAllowance(TOOL_RESULT_ERROR_OMISSION, slotAllowance);
	          remainingChars -= result.error.length;
	          remainingData += slotAllowance - result.error.length;
	          continue;
	        }
	        remainingChars -= value.length;
	        remainingData += slotAllowance - value.length;
	      } else {
	        remainingChars -= value.length;
	        remainingData += slotAllowance - value.length;
	      }
	      result.result = value;
	      result._structuredResult = true;
	      continue;
	    }
	
	    limit = Math.min(MAX_TOOL_RESULT_CHARS, remainingData + slotAllowance);
	    if (limit <= 0) {
	      delete result.result;
	      delete result._structuredResult;
	      result.error = errorForReservedAllowance(TOOL_RESULT_ERROR_OMISSION, slotAllowance);
	      remainingChars -= result.error.length;
	      remainingData += slotAllowance - result.error.length;
	      continue;
	    }
	    if (value.length > limit) {
	      value = capPlainToolValue(value, limit);
	      if (value === null) {
	        delete result.result;
	        delete result._structuredResult;
	        result.error = errorForReservedAllowance(TOOL_RESULT_ERROR_OMISSION, slotAllowance);
	        remainingChars -= result.error.length;
	        remainingData += slotAllowance - result.error.length;
	        continue;
	      }
	    }
	    result.result = value;
	    remainingChars -= value.length;
	    remainingData -= value.length;
	    remainingData += slotAllowance;
	  }
	
	  if (options.includeCapNotice) { remainingChars -= TOOL_CAP_NOTICE.length; }
	
	  return Math.max(0, remainingChars);
	}
	
	function buildSkippedToolResult(call, index, error) {
	  call = call || {};
	  return {
	    id: call.id || call.call_id || call.name || String(index + 1),
	    call_id: call.call_id || call.id || call.name || String(index + 1),
	    name: call.name || 'unknown',
	    error: error || 'Tool call budget exhausted'
	  };
	}
	
	function buildSkippedToolResults(toolCalls, error) {
	  var results = [];
	  var i;
	
	  for (i = 0; i < toolCalls.length; i += 1) {
	    results.push(buildSkippedToolResult(toolCalls[i], i, error));
	  }
	
	  return results;
	}
	
	function planToolCallsByBudget(toolCalls, toolMap, remainingToolCalls, mcpToolCallCounts) {
	  var plan = [];
	  var runnableToolCalls = [];
	  var skippedCount = 0;
	  var consumedGlobal = 0;
	  var i;
	  var call;
	  var toolInfo;
	  var server;
	  var limit;
	  var limitKey;
	  var used;
	
	  for (i = 0; i < toolCalls.length; i += 1) {
	    call = toolCalls[i] || {};
	
	    if (consumedGlobal >= remainingToolCalls) {
	      plan.push({ result: buildSkippedToolResult(call, i, 'Tool call budget exhausted') });
	      skippedCount += 1;
	      continue;
	    }
	
	    consumedGlobal += 1;
	    toolInfo = toolMap[call.name];
	    if (toolInfo && toolInfo.kind === 'mcp' && toolInfo.server && toolInfo.server.maxToolCalls !== null && toolInfo.server.maxToolCalls !== undefined) {
	      server = toolInfo.server;
	      limit = server.maxToolCalls;
	      limitKey = server.limitKey || server.label || server.displayLabel || 'mcp';
	      used = mcpToolCallCounts[limitKey] || 0;
	      if (used >= limit) {
	        plan.push({ result: buildSkippedToolResult(call, i, 'MCP server tool call budget exhausted') });
	        skippedCount += 1;
	        continue;
	      }
	      mcpToolCallCounts[limitKey] = used + 1;
	    }
	
	    runnableToolCalls.push(call);
	    plan.push({ run: true, call: call, index: i });
	  }
	
	  return {
	    plan: plan,
	    toolCalls: runnableToolCalls,
	    skippedCount: skippedCount,
	    noMoreTools: remainingToolCalls <= 0 || toolCalls.length >= remainingToolCalls
	  };
	}
	
	function mergePlannedToolResults(plan, runnableResults) {
	  var results = [];
	  var runnableIndex = 0;
	  var i;
	  var item;
	
	  for (i = 0; i < plan.length; i += 1) {
	    item = plan[i] || {};
	    if (item.run) {
	      results.push(runnableResults[runnableIndex] || buildSkippedToolResult(item.call, item.index || i, 'Tool call did not return a result'));
	      runnableIndex += 1;
	    } else {
	      results.push(item.result);
	    }
	  }
	
	  return results;
	}
	
	function appendTextToolResults(conversation, assistantText, results, noMoreTools, skippedCount) {
	  var content = 'Tool results:\n' + common.safeJson(sanitizeToolResults(results));
	  if (noMoreTools) {
	    content += '\n' + buildToolCapNotice(skippedCount);
	  } else {
	    content += '\nUse these results to answer the original request. If another tool is needed, respond only with the same tool_calls JSON shape.';
	  }
	  conversation.push({
	    role: 'assistant',
	    content: assistantText
	  });
	  conversation.push({
	    role: 'user',
	    content: content
	  });
	}
	
	function chatAssistantToolMessage(json, toolCalls) {
	  var message = getChoiceMessage(json) || {};
	  var output = {
	    role: 'assistant',
	    content: message.content !== undefined ? message.content : null
	  };
	  var i;
	  var call;
	
	  if (message.tool_calls && message.tool_calls.length) {
	    output.tool_calls = message.tool_calls;
	    return output;
	  }
	
	  output.tool_calls = [];
	  for (i = 0; i < toolCalls.length; i += 1) {
	    call = toolCalls[i] || {};
	    output.tool_calls.push({
	      id: call.id || call.call_id || call.name || ('call_' + (i + 1)),
	      type: 'function',
	      function: {
	        name: call.name,
	        arguments: typeof call.arguments === 'string' ? call.arguments : common.safeJson(call.arguments || {})
	      }
	    });
	  }
	
	  return output;
	}
	
	function buildMessagesAssistantReplay(json, toolCalls) {
	  var blocks = [];
	  var sawToolUse = false;
	  var content = json && json.content;
	  var block;
	  var item;
	  var call;
	  var i;
	
	  if (content && content.length) {
	    for (i = 0; i < content.length; i += 1) {
	      item = content[i] || {};
	      if (item.type === 'text' && typeof item.text === 'string' && item.text !== '') {
	        blocks.push({ type: 'text', text: item.text });
	      } else if (item.type === 'thinking' && typeof item.thinking === 'string') {
	        block = { type: 'thinking', thinking: item.thinking };
	        if (typeof item.signature === 'string' && item.signature) {
	          block.signature = item.signature;
	        }
	        blocks.push(block);
	      } else if (item.type === 'redacted_thinking' && typeof item.data === 'string' && item.data) {
	        blocks.push({ type: 'redacted_thinking', data: item.data });
	      } else if (item.type === 'tool_use' && typeof item.id === 'string' && item.id &&
	          typeof item.name === 'string' && item.name) {
	        sawToolUse = true;
	        blocks.push({
	          type: 'tool_use',
	          id: item.id,
	          name: item.name,
	          input: item.input && typeof item.input === 'object' ? item.input : {}
	        });
	      }
	    }
	  }
	
	  if (!sawToolUse && toolCalls && toolCalls.length) {
	    for (i = 0; i < toolCalls.length; i += 1) {
	      call = toolCalls[i] || {};
	      if (!call.name) {
	        continue;
	      }
	      blocks.push({
	        type: 'tool_use',
	        id: String(call.call_id || call.id || call.name),
	        name: call.name,
	        input: call.arguments && typeof call.arguments === 'object' ? call.arguments : {}
	      });
	    }
	  }
	
	  return blocks;
	}
	
	function messagesToolUseId(result, index, toolCalls) {
	  var call = toolCalls && toolCalls[index] ? toolCalls[index] : null;
	
	  if (result.call_id) {
	    return String(result.call_id);
	  }
	  if (result.id) {
	    return String(result.id);
	  }
	  if (result.name) {
	    return String(result.name);
	  }
	  if (call) {
	    return String(call.call_id || call.id || call.name);
	  }
	
	  return String(index + 1);
	}
	
	function appendMessagesToolResults(conversation, json, toolCalls, results, noMoreTools, skippedCount) {
	  var toolResultBlocks = [];
	  var i;
	  var result;
	
	  conversation.push({
	    role: 'assistant',
	    content: buildMessagesAssistantReplay(json, toolCalls)
	  });
	
	  for (i = 0; i < results.length; i += 1) {
	    result = results[i] || {};
	    toolResultBlocks.push({
	      type: 'tool_result',
	      tool_use_id: messagesToolUseId(result, i, toolCalls),
	      content: formatToolResultOutput(result)
	    });
	  }
	
	  if (noMoreTools) {
	    toolResultBlocks.push({ type: 'text', text: buildToolCapNotice(skippedCount) });
	  }
	
	  conversation.push({ role: 'user', content: toolResultBlocks });
	}
	
	function appendNativeToolResults(conversation, settings, json, toolCalls, results, noMoreTools, skippedCount) {
	  var i;
	  var result;
	
	  if (isMessagesEndpoint(settings)) {
	    appendMessagesToolResults(conversation, json, toolCalls, results, noMoreTools, skippedCount);
	    return;
	  }
	
	  if (isChatEndpoint(settings)) {
	    conversation.push(chatAssistantToolMessage(json, toolCalls));
	    for (i = 0; i < results.length; i += 1) {
	      result = results[i] || {};
	      conversation.push({
	        role: 'tool',
	        tool_call_id: result.call_id || result.id || result.name || String(i + 1),
	        content: formatToolResultOutput(result)
	      });
	    }
	    if (noMoreTools) {
	      conversation.push({
	        role: 'user',
	        content: buildToolCapNotice(skippedCount)
	      });
	    }
	    return;
	  }
	
	  if (json.output && json.output.length) {
	    for (i = 0; i < json.output.length; i += 1) {
	      conversation.push(json.output[i]);
	    }
	  } else {
	    conversation.push({
	      role: 'assistant',
	      content: extractResponseText(json)
	    });
	  }
	
	  for (i = 0; i < results.length; i += 1) {
	    result = results[i] || {};
	    conversation.push({
	      type: 'function_call_output',
	      call_id: result.call_id || result.id || result.name || String(i + 1),
	      output: formatToolResultOutput(result)
	    });
	  }
	
	  if (noMoreTools) {
	    conversation.push({
	      role: 'user',
	      content: buildToolCapNotice(skippedCount)
	    });
	  }
	}
	
	function appendToolResults(conversation, settings, json, assistantText, source, toolCalls, results, noMoreTools, skippedCount) {
	  if (source === 'native') {
	    appendNativeToolResults(conversation, settings, json, toolCalls, results, noMoreTools, skippedCount);
	    return;
	  }
	
	  appendTextToolResults(conversation, assistantText, results, noMoreTools, skippedCount);
	}
	
	function isNativeToolRequestError(error) {
	  return /^HTTP (400|404|422)/.test(String(error || ''));
	}
	
	function requestFinalAfterToolCap(requestId, settings, conversation, toolDefinitions, mode,
	                                  thinkingTrace, callback) {
	  var completionContext = s_active_completion && s_active_completion.requestId === requestId ? s_active_completion : null;
	
	  if (!isCurrentCompletion(completionContext)) {
	    return;
	  }
	  if (mode === 'text' && conversation.length && conversation[0].role === 'system') {
	    conversation[0].content = buildSystemPrompt(settings,
	        buildToolInstructions(toolDefinitions, settings.MaxToolCalls, true));
	  }
	  watch.progressSet(requestId, 'Writing reply', 'tool call limit reached');
	  setModelRetryState(completionContext, settings, conversation, mode, thinkingTrace);
	  requestModel(settings, conversation, requestId, {}, function(error, json) {
	    var batch;
	    if (!isCurrentCompletion(completionContext)) {
	      return;
	    }
	    if (error) {
	      callback(error);
	      return;
	    }
	    updateProgressContextSizes(requestId, settings, json);
	    batch = extractNativeToolCalls(json);
	    if (batch.length) {
	      callback(null, 'I am out of tool calls, and the model requested another tool instead of producing a final answer. I can only answer from information already gathered.');
	      return;
	    }
	    callback(null, parseResponse(json, settings.ShowThinking, thinkingTrace));
	  });
	}
	
	function completeWithTools(requestId, settings, conversation, toolDefinitions, toolMap, mode, round, usedToolCalls, mcpToolCallCounts, thinkingTrace, remainingToolResultChars, callback) {
	  var requestOptions = mode === 'native' ? { nativeTools: true, toolDefinitions: toolDefinitions } : {};
	  var completionContext = s_active_completion && s_active_completion.requestId === requestId ? s_active_completion : null;
	
	  if (!isCurrentCompletion(completionContext)) {
	    return;
	  }
	  mcpToolCallCounts = mcpToolCallCounts || {};
	  thinkingTrace = thinkingTrace || '';
	  remainingToolResultChars = typeof remainingToolResultChars === 'number' ? remainingToolResultChars : MAX_TOOL_RESULTS_TOTAL_CHARS;
	
	  common.logDebug('tool loop mode=' + mode + ' round=' + round + ' availableTools=' + Object.keys(toolMap).length + ' usedToolCalls=' + usedToolCalls + ' maxToolCalls=' + settings.MaxToolCalls);
	  watch.progressSet(requestId, 'Writing reply', round === 0 ? completionContext.mcpUnavailableDetail || '' : 'with tool results');
	  setModelRetryState(completionContext, settings, conversation, mode, thinkingTrace);
	  requestModel(settings, conversation, requestId, requestOptions, function(error, json) {
	    var assistantText;
	    var batch;
	    var toolCalls;
	    var originalToolCalls;
	    var remainingToolCalls;
	    var noMoreTools;
	    var skippedCount;
	    var skippedResults;
	    var budgetPlan;
	    var futureToolCallSlots;
	
	    if (!isCurrentCompletion(completionContext)) {
	      return;
	    }
	    if (error) {
	      callback(error, null, {
	        nativeUnsupported: mode === 'native' && round === 0 && usedToolCalls === 0 && isNativeToolRequestError(error)
	      });
	      return;
	    }
	
	    updateProgressContextSizes(requestId, settings, json);
	    assistantText = extractResponseText(json);
	    if (Object.keys(toolMap).length <= 0) {
	      callback(null, parseResponse(json, settings.ShowThinking, thinkingTrace));
	      return;
	    }
	    batch = extractToolCallBatch(json, mode, toolMap);
	    toolCalls = batch.calls;
	    common.logDebug('llm response shape ' + summarizeResponseShape(json));
	    common.logDebug('tool loop source=' + (batch.source || 'none') + ' model textChars=' + assistantText.length + ' toolCalls=' + toolCalls.length);
	
	    if (!toolCalls.length) {
	      callback(null, parseResponse(json, settings.ShowThinking, thinkingTrace));
	      return;
	    }
	
	    thinkingTrace = appendToolRoundTrace(thinkingTrace, json, toolCalls, toolMap);
	
	    remainingToolCalls = settings.MaxToolCalls - usedToolCalls;
	    originalToolCalls = toolCalls;
	    if (remainingToolCalls <= 0) {
	      skippedResults = buildSkippedToolResults(originalToolCalls);
	      remainingToolResultChars = capToolResults(skippedResults, remainingToolResultChars, {
	        futureSlots: 0,
	        includeCapNotice: true
	      });
	      appendToolResults(conversation, settings, json, assistantText, batch.source, originalToolCalls, skippedResults, true, originalToolCalls.length);
	      requestFinalAfterToolCap(requestId, settings, conversation, toolDefinitions, mode, thinkingTrace, callback);
	      return;
	    }
	    budgetPlan = planToolCallsByBudget(originalToolCalls, toolMap, remainingToolCalls, mcpToolCallCounts);
	    toolCalls = budgetPlan.toolCalls;
	    noMoreTools = budgetPlan.noMoreTools;
	    skippedCount = budgetPlan.skippedCount;
	    if (skippedCount > 0) {
	      common.logDebug('tool loop budget skipped=' + skippedCount + ' runnable=' + toolCalls.length + ' requested=' + originalToolCalls.length + ' remaining=' + remainingToolCalls);
	    }
	    if (toolCalls.length) {
	      completionContext.toolsStarted = true;
	    }
	    tools.runToolCalls(requestId, toolCalls, toolMap, function(results) {
	      if (!isCurrentCompletion(completionContext)) {
	        return;
	      }
	      results = mergePlannedToolResults(budgetPlan.plan, results);
	      if (usedToolCalls + results.length >= settings.MaxToolCalls) {
	        noMoreTools = true;
	      }
	      futureToolCallSlots = noMoreTools ? 0 : Math.max(0, remainingToolCalls - results.length);
	      remainingToolResultChars = capToolResults(results, remainingToolResultChars, {
	        futureSlots: futureToolCallSlots,
	        includeCapNotice: noMoreTools
	      });
	      common.logDebug('tool loop results=' + results.length + ' skipped=' + skippedCount);
	      appendToolResults(conversation, settings, json, assistantText, batch.source, originalToolCalls, results, noMoreTools, skippedCount);
	      if (noMoreTools) {
	        requestFinalAfterToolCap(requestId, settings, conversation, toolDefinitions, mode, thinkingTrace, callback);
	        return;
	      }
	      completeWithTools(requestId, settings, conversation, toolDefinitions, toolMap, mode, round + 1, usedToolCalls + results.length, mcpToolCallCounts, thinkingTrace, remainingToolResultChars, callback);
	    });
	  });
	}
	
	function finishToolCompletion(context, settings, conversation, toolDefinitions, toolMap,
	                              mode, completionError, text, meta) {
	  var toolInstructions;
	
	  if (!isCurrentCompletion(context)) {
	    return;
	  }
	  if (completionError && meta && meta.nativeUnsupported) {
	    common.logDebug('native tool request rejected; retrying text tool fallback');
	    markNativeToolsUnsupported(settings);
	    toolInstructions = buildToolInstructions(toolDefinitions, settings.MaxToolCalls, false);
	    conversation = buildConversation(settings, context.userText, toolInstructions,
	        context.historyAtStart);
	    completeWithTools(context.requestId, settings, conversation, toolDefinitions, toolMap,
	        'text', 0, 0, {}, '', MAX_TOOL_RESULTS_TOTAL_CHARS,
	        function(error, answer, fallbackMeta) {
	          finishToolCompletion(context, settings, conversation, toolDefinitions, toolMap,
	              'text', error, answer, fallbackMeta);
	        });
	    return;
	  }
	  if (completionError) {
	    failCompletionContext(context, completionError);
	    return;
	  }
	  sendCompletionResponse(context, settings, context.userText, text);
	}
	
	function startCompletion(context, settings) {
	  var requestId = context.requestId;
	  var userText = context.userText;
	  var conversation;
	  var toolInstructions;
	
	  common.logDebug('request start id=' + requestId + ' textChars=' + String(userText || '').length + ' endpoint=' + settings.Endpoint + ' model=' + settings.Model + ' maxToolCalls=' + settings.MaxToolCalls + ' preserveChats=' + (settings.PreserveChats ? '1' : '0') + ' geoTool=' + settings.GeolocationToolEnabled + ' timelineTool=' + settings.TimelineToolEnabled + ' healthTool=' + settings.HealthToolEnabled + ' history=' + context.historyAtStart.length);
	  watch.progressStart(requestId, 'Working', '');
	
	  if (!settings.Endpoint) {
	    context.retryKind = 'setup';
	    failCompletionContext(context, 'Endpoint missing. Open settings on phone.');
	    return;
	  }
	
	  if (!settings.ApiKey) {
	    context.retryKind = 'setup';
	    failCompletionContext(context, 'API key missing. Open settings on phone.');
	    return;
	  }
	
	  if (settings.MaxToolCalls <= 0) {
	    common.logDebug('tools disabled maxToolCalls=0');
	    conversation = buildConversation(settings, userText, '', context.historyAtStart);
	    completeWithTools(requestId, settings, conversation, [], {}, 'text', 0, 0, {}, '',
	        MAX_TOOL_RESULTS_TOTAL_CHARS, function(completionError, text) {
	          finishToolCompletion(context, settings, conversation, [], {}, 'text',
	              completionError, text, null);
	        });
	    return;
	  }
	
	  watch.progressSet(requestId, 'Finding tools', '');
	  context.discoveryPending = true;
	  tools.discoverPhoneTools(settings, requestId, function(error, discoveredTools, toolMap, unavailableServers) {
	    var mode;
	    var unavailableDetail;
	
	    context.discoveryPending = false;
	    if (!isCurrentCompletion(context)) {
	      return;
	    }
	    if (error) {
	      context.retryKind = 'before-tools';
	      failCompletionContext(context, error);
	      return;
	    }
	
	    toolInstructions = buildToolInstructions(discoveredTools, settings.MaxToolCalls,
	        !isNativeToolsUnsupported(settings));
	    unavailableDetail = formatMcpUnavailableDetail(unavailableServers);
	    if (unavailableDetail) {
	      context.mcpUnavailableDetail = unavailableDetail;
	    }
	    conversation = buildConversation(settings, userText, toolInstructions,
	        context.historyAtStart);
	    common.logDebug('tools discover done tools=' + discoveredTools.length + ' nativeUnsupported=' + (isNativeToolsUnsupported(settings) ? '1' : '0'));
	    watch.progressDone(requestId, 'Tools loaded', discoveredTools.length + ' tools');
	    mode = isNativeToolsUnsupported(settings) ? 'text' : 'native';
	    completeWithTools(requestId, settings, conversation, discoveredTools, toolMap, mode,
	        0, 0, {}, '', MAX_TOOL_RESULTS_TOTAL_CHARS,
	        function(completionError, text, meta) {
	          finishToolCompletion(context, settings, conversation, discoveredTools, toolMap,
	              mode, completionError, text, meta);
	        });
	  });
	}
	
	function createCompletionContext(requestId, userText, history) {
	  return {
	    generation: s_conversation_generation,
	    requestId: requestId,
	    userText: String(userText || ''),
	    historyAtStart: copyChatHistory(history),
	    timers: [],
	    toolsStarted: false,
	    retryKind: null
	  };
	}
	
	function activateCompletion(context) {
	  var previousContext = s_active_completion;
	
	  clearCompletionTimers(previousContext);
	  watch.beginRequestLifecycle(context.requestId);
	  cancelPendingDiscovery(previousContext);
	  s_active_completion = context;
	}
	
	function appendRecoveryInstruction(conversation, settings) {
	  var instruction = 'FINAL-ANSWER-ONLY RECOVERY. Do not call or request any tools. Summarize available evidence from recorded tool results. Report incomplete or unknown actions honestly. Never claim an action ran unless a recorded result proves it. If more work would need a tool, state that no additional action was run.';
	  var last = conversation.length ? conversation[conversation.length - 1] : null;
	
	  if (isMessagesEndpoint(settings) && last && last.role === 'user' &&
	      Object.prototype.toString.call(last.content) === '[object Array]') {
	    last.content.push({ type: 'text', text: instruction });
	    return;
	  }
	  if (last && last.role === 'user' && typeof last.content === 'string') {
	    last.content += '\n\n' + instruction;
	    return;
	  }
	  conversation.push({ role: 'user', content: instruction });
	}
	
	function formatMcpUnavailableDetail(labels) {
	  var prefix = 'MCP unavailable: ';
	  var parts = [];
	  var text;
	  var i;
	
	  if (!labels || !labels.length) {
	    return '';
	  }
	  for (i = 0; i < labels.length; i += 1) {
	    text = String(labels[i] || '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
	    if (text) {
	      parts.push(text);
	    }
	  }
	  if (!parts.length) {
	    return '';
	  }
	  text = prefix + parts.join(', ');
	  if (text.length > 60) {
	    text = text.substring(0, 59).replace(/[,\s]+$/, '') + '…';
	  }
	  return text;
	}
	
	function cancelPendingDiscovery(context) {
	  if (context && context.discoveryPending && tools.cancelMcpRequest) {
	    context.discoveryPending = false;
	    tools.cancelMcpRequest(context.requestId);
	  }
	}
	
	function sendRetryUnavailable(requestId, message, failedRequestId) {
	  if (!watch.isCurrentRequest(failedRequestId) || s_active_completion) {
	    return false;
	  }
	  watch.beginRequestLifecycle(requestId);
	  watch.progressStart(requestId, 'Error', '');
	  watch.sendError(requestId, message, function() {
	    watch.finishRequestLifecycle(requestId);
	  }, false);
	  return true;
	}
	
	function retryCompletion(requestId, failedRequestId) {
	  var capsule = s_retry_capsule;
	  var context;
	  var settings;
	  var conversation;
	  var knownKind;
	
	  if (!watch.isCurrentRequest(failedRequestId) || !requestId ||
	      Number(requestId) === Number(failedRequestId)) {
	    return false;
	  }
	  if (s_active_completion) {
	    return false;
	  }
	  if (!capsule || Number(capsule.requestId) !== Number(failedRequestId) ||
	      capsule.generation !== s_conversation_generation) {
	    if (capsule && Number(capsule.requestId) === Number(failedRequestId)) {
	      s_retry_capsule = null;
	    }
	    return sendRetryUnavailable(requestId, 'Retry is no longer available. Start a new request.', failedRequestId);
	  }
	
	  knownKind = capsule.kind === 'setup' || capsule.kind === 'before-tools' ||
	      capsule.kind === 'delivery' || capsule.kind === 'final-only';
	  if (!knownKind || typeof capsule.userText !== 'string') {
	    s_retry_capsule = null;
	    return sendRetryUnavailable(requestId, 'Retry context is unavailable. Start a new request.', failedRequestId);
	  }
	
	  if ((capsule.kind === 'setup' || capsule.kind === 'before-tools') &&
	      Object.prototype.toString.call(capsule.history) !== '[object Array]') {
	    s_retry_capsule = null;
	    return sendRetryUnavailable(requestId, 'Retry context is unavailable. Start a new request.', failedRequestId);
	  }
	  if (capsule.kind === 'final-only') {
	    settings = capsule.settings;
	    conversation = cloneBoundedRetryCapsule(capsule.conversation);
	    if (Object.prototype.toString.call(settings) !== '[object Object]' || !conversation ||
	        Object.prototype.toString.call(conversation) !== '[object Array]') {
	      s_retry_capsule = null;
	      return sendRetryUnavailable(requestId,
	          'Recorded tool results are unavailable. Start a new request.', failedRequestId);
	    }
	  }
	  if (capsule.kind === 'delivery' &&
	      (Object.prototype.toString.call(capsule.settings) !== '[object Object]' ||
	       typeof capsule.text !== 'string' || typeof capsule.answerText !== 'string')) {
	    s_retry_capsule = null;
	    return sendRetryUnavailable(requestId, 'Retry context is unavailable. Start a new request.', failedRequestId);
	  }
	
	  s_retry_capsule = null;
	  context = createCompletionContext(requestId, capsule.userText, capsule.history || []);
	  context.toolsStarted = capsule.kind === 'final-only';
	  activateCompletion(context);
	
	  if (capsule.kind === 'setup' || capsule.kind === 'before-tools') {
	    startCompletion(context, common.loadSettings());
	    return true;
	  }
	
	  if (capsule.kind === 'delivery') {
	    watch.progressStart(requestId, 'Receiving', 'retrying response');
	    watch.sendPreparedResponse(requestId, capsule.text, function(sendError) {
	      if (!sendError && isCurrentCompletion(context)) {
	        s_retry_capsule = null;
	        rememberChatTurn(capsule.settings, capsule.userText, capsule.answerText);
	      }
	      finishCompletionContext(context);
	    }, function(sendError, preparedText) {
	      if (!sendError || !isCurrentCompletion(context)) {
	        return false;
	      }
	      return rememberDeliveryFailure(context, capsule.settings, capsule.userText, preparedText,
	          capsule.answerText);
	    });
	    return true;
	  }
	
	  if (capsule.kind === 'final-only') {
	    appendRecoveryInstruction(conversation, settings);
	    setModelRetryState(context, settings, conversation, capsule.mode, capsule.thinkingTrace,
	        capsule.conversation);
	    watch.progressStart(requestId, 'Writing reply', 'summarizing recorded tool results');
	    requestModel(settings, conversation, requestId, {}, function(error, json) {
	      var batch;
	      var answer;
	
	      if (!isCurrentCompletion(context)) {
	        return;
	      }
	      if (error) {
	        failCompletionContext(context, error);
	        return;
	      }
	      updateProgressContextSizes(requestId, settings, json);
	      batch = extractToolCallBatch(json, capsule.mode, {});
	      if (batch.calls.length) {
	        answer = 'Recovery requested another tool. No additional actions were run. I can only summarize recorded results.';
	      } else {
	        answer = parseResponse(json, settings.ShowThinking, capsule.thinkingTrace);
	      }
	      sendCompletionResponse(context, settings, capsule.userText, answer);
	    });
	    return true;
	  }
	  return false;
	}
	
	function requestCompletion(requestId, userText) {
	  var settings = common.loadSettings();
	  var previousContext = s_active_completion;
	  var completionContext;
	
	  clearCompletionTimers(previousContext);
	  s_retry_capsule = null;
	  completionContext = createCompletionContext(requestId, userText, copyChatHistory(s_chat_history));
	  activateCompletion(completionContext);
	  startCompletion(completionContext, settings);
	}
	
	function cancelCompletion(requestId) {
	  var context;
	  var canceled;
	
	  if (!watch.isCurrentRequest(requestId)) {
	    return false;
	  }
	  s_retry_capsule = null;
	  context = s_active_completion;
	  if (context && Number(context.requestId) === Number(requestId)) {
	    clearCompletionTimers(context);
	    s_active_completion = null;
	  }
	  canceled = watch.cancelRequestLifecycle(requestId);
	  if (canceled && tools.cancelMcpRequest) {
	    tools.cancelMcpRequest(requestId);
	  }
	  return canceled;
	}
	
	module.exports = {
	  resetChatHistory: resetChatHistory,
	  listSavedChats: listSavedChats,
	  loadSavedChat: loadSavedChat,
	  deleteSavedChat: deleteSavedChat,
	  deleteAllSavedChats: deleteAllSavedChats,
	  requestCompletion: requestCompletion,
	  cancelCompletion: cancelCompletion,
	  retryCompletion: retryCompletion
	};


/***/ }),
/* 20 */
/***/ (function(module, exports, __webpack_require__) {

	var common = __webpack_require__(17);
	var watch = __webpack_require__(18);
	var timelineStore = __webpack_require__(21);
	var memoryStore = __webpack_require__(22);
	var webFetch = __webpack_require__(23);
	var toolPagination = __webpack_require__(24);
	var pluginSources = __webpack_require__(25);
	var pluginActions = __webpack_require__(26);
	
	var MCP_PROTOCOL_VERSION = '2025-06-18';
	var MCP_CLIENT_NAME = 'llm_thing';
	var MCP_CLIENT_VERSION = '1.0.0';
	var TIMELINE_API_BASE = 'https://timeline-api.getpebble.com/v1/user/pins/';
	var TIMELINE_PIN_ID_MAX_ATTEMPTS = 128;
	var TIMELINE_PIN_ID_MAX_PENDING = 128;
	var TIMELINE_DEFAULT_PIN_ICON = 'NOTIFICATION_REMINDER';
	var TIMELINE_DEFAULT_REMINDER_ICON = 'NOTIFICATION_REMINDER';
	var TIMELINE_DEFAULT_NOTIFICATION_ICON = 'NOTIFICATION_GENERIC';
	var TIMELINE_RAW_PIN_ARG_KEYS = {
	  pin: true,
	  layout: true,
	  reminders: true,
	  createNotification: true,
	  updateNotification: true,
	  actions: true
	};
	var MAX_HEALTH_RANGE_SECONDS = 7 * 24 * 60 * 60;
	var MAX_HEALTH_HOUR_RANGE_SECONDS = 24 * 60 * 60;
	var MAX_HEALTH_SESSIONS = 32;
	var MAX_HEALTH_BUCKET_VALUES = 64;
	var HEALTH_METRICS = [
	  { name: 'steps', bit: 1, responseField: 'stepCount', outputField: 'steps' },
	  { name: 'active_time', bit: 2, responseField: 'activeSeconds', outputField: 'activeSeconds' },
	  { name: 'distance', bit: 4, responseField: 'walkedDistanceMeters', outputField: 'distanceMeters' },
	  { name: 'sleep', bit: 8, responseField: 'sleepSeconds', outputField: 'sleepSeconds' },
	  { name: 'restful_sleep', bit: 16, responseField: 'sleepRestfulSeconds', outputField: 'restfulSleepSeconds' },
	  { name: 'resting_calories', bit: 32, responseField: 'restingKCalories', outputField: 'restingCaloriesKcal' },
	  { name: 'active_calories', bit: 64, responseField: 'activeKCalories', outputField: 'activeCaloriesKcal' },
	  { name: 'heart_rate', bit: 128 },
	  { name: 'activity_sessions', bit: 2048 | 4096 | 8192 },
	  { name: 'sleep_sessions', bit: 512 | 1024 }
	];
	var HEALTH_METRIC_MAP = Object.create(null);
	var HEALTH_METRIC_NAMES = [];
	
	(function initHealthMetricMetadata() {
	  var i;
	  var metric;
	  for (i = 0; i < HEALTH_METRICS.length; i += 1) {
	    metric = HEALTH_METRICS[i];
	    HEALTH_METRIC_MAP[metric.name] = metric;
	    HEALTH_METRIC_NAMES.push(metric.name);
	  }
	}());
	
	var HEALTH_ACTIVITY_TYPES = {
	  1: 'sleep',
	  2: 'restful_sleep',
	  4: 'walk',
	  8: 'run',
	  16: 'open_workout'
	};
	var TIMELINE_MAX_PAST_MS = 2 * 24 * 60 * 60 * 1000;
	var TIMELINE_MAX_FUTURE_MS = 365 * 24 * 60 * 60 * 1000;
	var TIMELINE_RETRY_DELAY_MS = 250;
	var TIMELINE_RESULT_WARNING_MAX_CHARS = 256;
	var TOOL_READ_CONCURRENCY = 2;
	var TOOL_EXECUTION_SERIAL = 'serial';
	var TOOL_EXECUTION_INDEPENDENT_READ = 'independent_read';
	var TOOL_VALIDATION_MAX_DEPTH = 64;
	var TOOL_VALIDATION_MAX_OBJECT_PROPERTIES = 256;
	var TOOL_VALIDATION_MAX_WORK = 2048;
	var TOOL_VALIDATION_MAX_SIGNATURE_CHARS = 65536;
	
	var s_mcp_request_id = 1;
	var s_tool_execution_id = 1;
	var s_timeline_pending_pin_ids = Object.create(null);
	var s_timeline_pending_pin_id_order = [];
	
	var MCP_MAX_RESULT_CHARS = 6000;
	var MCP_RESULT_TRUNCATION_SUFFIX = '... [truncated]';
	var MCP_MAX_CONTENT_BLOCKS = 32;
	var MCP_MAX_RESULT_METADATA_CHARS = 256;
	var MCP_MAX_STRUCTURED_DEPTH = 128;
	var MCP_MAX_STRUCTURED_NODES = 4096;
	var MCP_MAX_PAGINATION_PAGES = 20;
	var MCP_MAX_TOOLS_PER_SERVER = 64;
	var MCP_MAX_TOOLS_GLOBAL = 64;
	var MCP_MAX_TOOL_NAME_CHARS = 128;
	var MCP_MAX_DESCRIPTION_CHARS = 1024;
	var MCP_MAX_INPUTSCHEMA_CHARS = 8192;
	var MCP_MAX_SERVER_CACHE_CHARS = 65536;
	var MCP_MAX_SESSION_ID_CHARS = 1024;
	var MCP_MAX_SCHEMA_DEPTH = 64;
	var MCP_REQUEST_TIMEOUT_MS = 30000;
	var MCP_SUPPORTED_PROTOCOL_VERSIONS = { '2025-06-18': true };
	var MCP_CACHE_TTL_MS = 5 * 60 * 1000;
	var MCP_MAX_CACHE_ENTRIES = 32;
	var MCP_MAX_PENDING_DISCOVERIES = 16;
	var MCP_MAX_PENDING_WAITERS = 32;
	
	var s_mcp_cache = Object.create(null);
	var s_mcp_cache_keys = [];
	var s_mcp_pending = Object.create(null);
	var s_mcp_pending_count = 0;
	var s_mcp_warm_generation = null;
	var s_mcp_warm_generation_id = 1;
	var s_mcp_foreground_batches = [];
	var MCP_INVALID_SCHEMA = {};
	
	function hasOwn(object, key) {
	  return object !== null && object !== undefined && Object.prototype.hasOwnProperty.call(object, key);
	}
	
	function hasToolArgValue(value) {
	  return value !== undefined && value !== null && value !== '';
	}
	
	function formatToolParamValue(value, maxLength) {
	  if (value === null) {
	    return 'null';
	  }
	
	  if (typeof value === 'string') {
	    return common.truncate(value.replace(/\s+/g, ' '), maxLength);
	  }
	
	  if (typeof value === 'number' || typeof value === 'boolean') {
	    return String(value);
	  }
	
	  return common.truncate(common.safeJson(value), maxLength);
	}
	
	function stripToolNamePrefix(toolName, prefix) {
	  toolName = String(toolName || '');
	  prefix = common.trim(prefix);
	
	  if (!prefix || toolName.substring(0, prefix.length).toLowerCase() !== prefix.toLowerCase()) {
	    return toolName;
	  }
	
	  return toolName.substring(prefix.length).replace(/^[_\-\s:]+/, '');
	}
	
	function formatDisplayToolName(toolName, toolInfo) {
	  var name = String(toolName || 'unknown');
	  var serverLabel;
	
	  if (toolInfo && toolInfo.kind === 'mcp' && toolInfo.server) {
	    serverLabel = toolInfo.server.displayLabel || toolInfo.server.label || '';
	    name = stripToolNamePrefix(name, serverLabel);
	    name = stripToolNamePrefix(name, slugify(serverLabel));
	    name = stripToolNamePrefix(name, toolInfo.server.label);
	  }
	
	  name = common.trim(name.replace(/_+/g, ' ').replace(/\s+/g, ' '));
	  return name || 'unknown';
	}
	
	function escapeToolDetailText(value) {
	  return String(value === undefined || value === null ? '' : value)
	    .replace(/\r/g, '\\r')
	    .replace(/\n/g, '\\n')
	    .replace(/\t/g, '\\t')
	    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/g, '?');
	}
	
	function stripLoneHighSurrogates(text) {
	  var result = '';
	  var code;
	  var next;
	  var i;
	
	  for (i = 0; i < text.length; i += 1) {
	    code = text.charCodeAt(i);
	    if (code >= 0xD800 && code <= 0xDBFF) {
	      next = text.charCodeAt(i + 1);
	      if (next >= 0xDC00 && next <= 0xDFFF) {
	        result += text.charAt(i) + text.charAt(i + 1);
	        i += 1;
	      }
	      continue;
	    }
	    result += text.charAt(i);
	  }
	  return result;
	}
	
	function formatToolDetailValue(value, maxLength) {
	  return stripLoneHighSurrogates(formatToolParamValue(value, maxLength));
	}
	
	function formatToolCallDetail(args) {
	  var lines = [];
	  var key;
	  var text;
	
	  args = args || {};
	  if (typeof args !== 'object' || Object.prototype.toString.call(args) === '[object Array]') {
	    return stripLoneHighSurrogates(common.truncate('value: ' + escapeToolDetailText(formatToolDetailValue(args, 100)), 160));
	  }
	
	  for (key in args) {
	    if (hasOwn(args, key) && args[key] !== undefined) {
	      lines.push(escapeToolDetailText(key) + ': ' + escapeToolDetailText(formatToolDetailValue(args[key], 80)));
	    }
	  }
	
	  text = lines.join('\n');
	  return text ? stripLoneHighSurrogates(common.truncate(text, 160)) : '';
	}
	
	function formatToolActiveTitle(toolName, toolInfo) {
	  var name = String(toolName || '');
	  var label;
	
	  if (toolInfo && toolInfo.kind === 'mcp') {
	    label = common.trim(toolInfo.server.displayLabel) || formatToolWords(toolInfo.server.label || 'MCP');
	    label += ': ' + (formatToolWords(formatDisplayToolName(toolInfo.toolName || name, toolInfo)) || 'Tool');
	  } else if (toolInfo) {
	    label = formatToolLabel(toolInfo);
	  } else {
	    label = formatToolWords(name) || 'Unknown Tool';
	  }
	
	  return 'Running ' + label;
	}
	
	function formatToolWords(value) {
	  var words = common.trim(value).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').split(' ');
	  var result = [];
	  var i;
	  var word;
	
	  for (i = 0; i < words.length; i += 1) {
	    word = words[i];
	    if (word) {
	      result.push(word.charAt(0).toUpperCase() + word.substring(1));
	    }
	  }
	
	  return result.join(' ');
	}
	
	function formatToolLabel(toolInfo) {
	  if (toolInfo.kind === 'builtin') {
	    return toolInfo.label || toolInfo.name || 'Built-in Tool';
	  }
	
	  return toolInfo.server.displayLabel || toolInfo.server.label;
	}
	
	function formatToolCallLabel(call, toolMap) {
	  var name = String((call && (call.name || call.tool || call.function)) || '');
	  var toolInfo = toolMap && hasOwn(toolMap, name) ? toolMap[name] : null;
	  var serverLabel;
	  var toolLabel;
	
	  if (toolInfo && toolInfo.kind === 'mcp') {
	    serverLabel = common.trim(toolInfo.server.displayLabel) || formatToolWords(toolInfo.server.label || 'MCP');
	    toolLabel = formatToolWords(formatDisplayToolName(toolInfo.toolName || name, toolInfo));
	    return serverLabel + ': ' + (toolLabel || 'Tool');
	  }
	
	  if (toolInfo && toolInfo.kind === 'builtin') {
	    toolLabel = formatToolWords(stripToolNamePrefix(name || toolInfo.name, 'pebble'));
	    return 'Pebble: ' + (toolLabel || formatToolLabel(toolInfo));
	  }
	
	  return formatToolWords(name) || 'Unknown Tool';
	}
	
	function isMatchingResponse(msg, expectedId, allowMissingId) {
	  if (!msg || typeof msg !== 'object') {
	    return false;
	  }
	  if (msg.method) {
	    return false;
	  }
	  if (msg.result === undefined && msg.error === undefined) {
	    return false;
	  }
	  if (expectedId !== undefined && msg.id === undefined && !allowMissingId) {
	    return false;
	  }
	  if (msg.id !== undefined && msg.id !== expectedId) {
	    return false;
	  }
	  return true;
	}
	
	function parseSseEventData(eventBlock) {
	  var lines = eventBlock.split(/\r?\n/);
	  var data = '';
	  var i;
	  var line;
	  var value;
	
	  for (i = 0; i < lines.length; i += 1) {
	    line = lines[i];
	    if (!line || line.charAt(0) === ':') {
	      continue;
	    }
	    if (line.indexOf('data:') === 0) {
	      value = line.substring(5);
	      if (value.charAt(0) === ' ') {
	        value = value.substring(1);
	      }
	      if (data) {
	        data += '\n';
	      }
	      data += value;
	    }
	  }
	
	  return data;
	}
	
	function parseMcpResponse(text, expectedId) {
	  var trimmed = common.trim(text);
	  var parsed;
	  var events;
	  var i;
	  var eventData;
	  var msg;
	
	  if (!trimmed) {
	    return null;
	  }
	
	  try {
	    parsed = JSON.parse(trimmed);
	    // A single JSON response is isolated to this HTTP request; tolerate legacy
	    // servers that omit the JSON-RPC id. SSE may contain multiple messages and
	    // therefore requires an exact id below.
	    if (isMatchingResponse(parsed, expectedId, true)) {
	      return parsed;
	    }
	    return null;
	  } catch (e) {}
	
	  events = trimmed.split(/\r?\n\r?\n/);
	  for (i = 0; i < events.length; i += 1) {
	    if (!common.trim(events[i])) {
	      continue;
	    }
	    eventData = parseSseEventData(events[i]);
	    if (!eventData || eventData === '[DONE]') {
	      continue;
	    }
	    try {
	      msg = JSON.parse(eventData);
	    } catch (e2) {
	      continue;
	    }
	    if (isMatchingResponse(msg, expectedId, false)) {
	      return msg;
	    }
	  }
	
	  return null;
	}
	
	function slugify(value) {
	  var slug = common.trim(value).replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
	  return slug || 'tool';
	}
	
	function authHeader(value) {
	  var header = common.trim(value);
	
	  if (!header) {
	    return '';
	  }
	
	  if (/^(Bearer|Basic|Digest|Token)\s+/i.test(header)) {
	    return header;
	  }
	
	  return 'Bearer ' + header;
	}
	
	function isValidHttpHeaderName(value) {
	  return /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(value);
	}
	
	function isReservedMcpHeader(value) {
	  var name = String(value || '').toLowerCase();
	
	  return name === 'content-type' ||
	    name === 'accept' ||
	    name === 'mcp-protocol-version' ||
	    name === 'mcp-session-id';
	}
	
	function normalizeMcpHeaders(value) {
	  var headers = [];
	  var seen = {};
	  var i;
	  var header;
	  var name;
	  var headerValue;
	  var lowerName;
	
	  if (!value || !value.length) {
	    return headers;
	  }
	
	  for (i = 0; i < value.length; i += 1) {
	    header = value[i] || {};
	    name = common.trim(header.name);
	    headerValue = common.trim(String(header.value || '').replace(/[\r\n]+/g, ' '));
	    lowerName = name.toLowerCase();
	
	    if (!name || !headerValue || !isValidHttpHeaderName(name) || isReservedMcpHeader(name) || hasOwn(seen, lowerName)) {
	      continue;
	    }
	
	    seen[lowerName] = true;
	    headers.push({
	      name: name,
	      value: headerValue,
	      lowerName: lowerName
	    });
	  }
	
	  return headers;
	}
	
	function parseOptionalToolCallLimit(value) {
	  var text = String(value === undefined || value === null ? '' : value).replace(/^\s+|\s+$/g, '');
	  var number;
	
	  if (!text) {
	    return null;
	  }
	
	  number = parseInt(text, 10);
	  if (isNaN(number) || number < 0) {
	    return null;
	  }
	
	  return number;
	}
	
	function isValidMcpUrl(url) {
	  var text = common.trim(url);
	  var match;
	  var scheme;
	  var host;
	  var hostPart;
	
	  match = /^(https?):\/\/([^\/\?#]+)/i.exec(text);
	  if (!match) {
	    return false;
	  }
	  scheme = match[1].toLowerCase();
	  host = match[2].toLowerCase();
	
	  if (scheme === 'https') {
	    return true;
	  }
	
	  if (host.charAt(0) === '[') {
	    hostPart = host.substring(0, host.indexOf(']') + 1);
	  } else {
	    hostPart = host.split(':')[0];
	  }
	  return hostPart === 'localhost' || hostPart === '127.0.0.1' || hostPart === '[::1]';
	}
	
	function parseMcpServers(settings) {
	  var parsed;
	  var servers = [];
	  var i;
	  var server;
	  var maxToolCalls;
	
	  try {
	    parsed = JSON.parse(settings.McpServersJson || '[]');
	  } catch (e) {
	    parsed = [];
	  }
	
	  if (!parsed || !parsed.length) {
	    return servers;
	  }
	
	  for (i = 0; i < parsed.length; i += 1) {
	    server = parsed[i] || {};
	    if (server.enabled === true || server.enabled === 1 || server.enabled === '1') {
	      maxToolCalls = parseOptionalToolCallLimit(server.maxToolCalls);
	      server = {
	        displayLabel: common.trim(server.label),
	        label: slugify(server.label),
	        limitKey: slugify(server.label) + '_' + i,
	        url: common.trim(server.url),
	        description: common.trim(server.description),
	        allowedTools: common.splitCsv(server.allowedTools),
	        maxToolCalls: maxToolCalls,
	        authorization: common.trim(server.authorization),
	        headers: normalizeMcpHeaders(server.headers),
	        sessionId: ''
	      };
	      if (server.label && server.url && server.maxToolCalls !== 0) {
	        if (!isValidMcpUrl(server.url)) {
	          common.logDebug('mcp server omitted invalid url server=' + server.label);
	          continue;
	        }
	        server._mcpCacheKey = mcpCacheKey(server);
	        servers.push(server);
	      }
	    }
	  }
	
	  return servers;
	}
	
	function isAllowedTool(server, name) {
	  var i;
	
	  if (!server.allowedTools.length) {
	    return true;
	  }
	
	  for (i = 0; i < server.allowedTools.length; i += 1) {
	    if (server.allowedTools[i] === name) {
	      return true;
	    }
	  }
	
	  return false;
	}
	
	function applyMcpCustomHeaders(request, server, authorization) {
	  var headers = server.headers || [];
	  var i;
	
	  for (i = 0; i < headers.length; i += 1) {
	    if (headers[i].lowerName === 'authorization' && authorization) {
	      continue;
	    }
	
	    try {
	      request.setRequestHeader(headers[i].name, headers[i].value);
	    } catch (e) {
	      common.logDebug('mcp custom header skipped server=' + server.label + ' name=' + headers[i].name);
	    }
	  }
	}
	
	function isCurrentMcpContext(context) {
	  if (context && typeof context === 'object' && context.background === true) {
	    if (context.warmGeneration) {
	      return context.active !== false && context.warmGeneration.active &&
	        s_mcp_warm_generation === context.warmGeneration;
	    }
	    return context.active !== false;
	  }
	  return watch.isCurrentRequest(context);
	}
	
	function makeMcpWaiter(requestContext, server, callback, foregroundBatch) {
	  if (requestContext && typeof requestContext === 'object' && requestContext.warmGeneration) {
	    return {
	      type: 'warm',
	      generation: requestContext.warmGeneration,
	      key: mcpCacheStorageKey(server._mcpCacheKey),
	      server: server,
	      callback: callback,
	      settled: false
	    };
	  }
	  return {
	    type: 'foreground',
	    requestId: requestContext,
	    foregroundBatch: foregroundBatch || null,
	    server: server,
	    callback: callback,
	    settled: false
	  };
	}
	
	function isCurrentMcpWaiter(waiter) {
	  if (waiter.type === 'warm') {
	    return waiter.generation.active && s_mcp_warm_generation === waiter.generation &&
	      hasOwn(waiter.generation.serverKeys, waiter.key);
	  }
	  return watch.isCurrentRequest(waiter.requestId);
	}
	
	function settleMcpWaiter(waiter, error, tools, noTools) {
	  if (waiter.settled) {
	    return;
	  }
	  waiter.settled = true;
	  waiter.callback(error, tools, noTools === true);
	}
	
	function pruneMcpWaiters(pending) {
	  var kept = [];
	  var removed = [];
	  var i;
	
	  for (i = 0; i < pending.waiters.length; i += 1) {
	    if (isCurrentMcpWaiter(pending.waiters[i])) {
	      kept.push(pending.waiters[i]);
	    } else {
	      removed.push(pending.waiters[i]);
	    }
	  }
	  pending.waiters = kept;
	  for (i = 0; i < removed.length; i += 1) {
	    if (removed[i].foregroundBatch) {
	      finishForegroundBatch(removed[i].foregroundBatch, true, false);
	    }
	    settleMcpWaiter(removed[i], 'MCP discovery canceled', null, false);
	  }
	}
	
	function cancelMcpServerDiscovery(pending, error) {
	  var storageKey = mcpCacheStorageKey(pending.key);
	  var waiters;
	  var requests;
	  var i;
	
	  if (pending.done) {
	    return;
	  }
	  pending.done = true;
	  delete s_mcp_pending[storageKey];
	  s_mcp_pending_count -= 1;
	  pending.context.active = false;
	  waiters = pending.waiters.slice();
	  pending.waiters = [];
	  requests = pending.context.requests.slice();
	
	  for (i = 0; i < waiters.length; i += 1) {
	    settleMcpWaiter(waiters[i], error || 'MCP discovery canceled', null, false);
	  }
	  for (i = 0; i < requests.length; i += 1) {
	    try {
	      requests[i].abort();
	    } catch (e) {}
	  }
	}
	
	function cancelUnobservedMcpDiscoveries(preserveGeneration) {
	  var keys = Object.keys(s_mcp_pending);
	  var i;
	  var pending;
	
	  for (i = 0; i < keys.length; i += 1) {
	    pending = s_mcp_pending[keys[i]];
	    if (!pending || pending.done) {
	      continue;
	    }
	    pruneMcpWaiters(pending);
	    if (!pending.waiters.length && (!preserveGeneration ||
	        !hasOwn(preserveGeneration.serverKeys, keys[i]))) {
	      cancelMcpServerDiscovery(pending, 'MCP discovery canceled');
	    }
	  }
	}
	
	function cancelMcpRequest(requestId) {
	  pluginSources.cancelRequest(requestId);
	  pluginActions.cancelRequest(requestId);
	  cancelForegroundBatchesForRequest(requestId);
	}
	
	function clearForegroundBatchTimer(batch) {
	  if (batch.timer !== null) {
	    try {
	      clearTimeout(batch.timer);
	    } catch (e) {}
	    batch.timer = null;
	  }
	}
	
	function removeForegroundBatch(batch) {
	  var index = s_mcp_foreground_batches.indexOf(batch);
	  if (index !== -1) {
	    s_mcp_foreground_batches.splice(index, 1);
	  }
	}
	
	function cancelForegroundBatchesForRequest(requestId) {
	  var batches = s_mcp_foreground_batches.slice();
	  var i;
	  for (i = 0; i < batches.length; i += 1) {
	    if (Number(batches[i].requestId) === Number(requestId)) {
	      finishForegroundBatch(batches[i], true, true);
	    }
	  }
	}
	
	function finishForegroundBatch(batch, canceled, detachWaiters) {
	  if (!batch || batch.finished || batch.canceled) {
	    return;
	  }
	  batch.canceled = canceled === true;
	  batch.finished = !batch.canceled;
	  clearForegroundBatchTimer(batch);
	  removeForegroundBatch(batch);
	  if (detachWaiters) {
	    detachForegroundBatchWaiters(batch);
	  }
	}
	
	function detachForegroundBatchWaiters(batch) {
	  var keys = Object.keys(s_mcp_pending);
	  var i;
	  var j;
	  var pending;
	  var kept;
	  for (i = 0; i < keys.length; i += 1) {
	    pending = s_mcp_pending[keys[i]];
	    if (!pending || pending.done) {
	      continue;
	    }
	    kept = [];
	    for (j = 0; j < pending.waiters.length; j += 1) {
	      if (pending.waiters[j].foregroundBatch !== batch) {
	        kept.push(pending.waiters[j]);
	      } else {
	        pending.waiters[j].settled = true;
	      }
	    }
	    pending.waiters = kept;
	    if (!kept.length) {
	      cancelMcpServerDiscovery(pending, 'MCP discovery canceled');
	    }
	  }
	}
	
	function trackMcpXhr(context, request) {
	  if (context && typeof context === 'object' && context.background === true) {
	    if (context.active === false) {
	      try {
	        request.abort();
	      } catch (e) {}
	      return false;
	    }
	    context.requests.push(request);
	    return true;
	  }
	  return watch.trackXhr(context, request);
	}
	
	function untrackMcpXhr(context, request) {
	  var i;
	
	  if (context && typeof context === 'object' && context.background === true) {
	    for (i = context.requests.length - 1; i >= 0; i -= 1) {
	      if (context.requests[i] === request) {
	        context.requests.splice(i, 1);
	      }
	    }
	    return;
	  }
	  watch.untrackXhr(context, request);
	}
	
	function updateMcpCacheSession(server) {
	  var key;
	  var entry;
	
	  if (!server || !server._mcpCacheKey) {
	    return;
	  }
	  key = 'mcp:' + server._mcpCacheKey;
	  entry = s_mcp_cache[key];
	  if (entry) {
	    entry.sessionId = server.sessionId || '';
	  }
	}
	
	function mcpJsonRpc(server, method, params, expectBody, requestContext, callback) {
	  var request = null;
	  var payload = {
	    jsonrpc: '2.0',
	    method: method
	  };
	  var authorization = authHeader(server.authorization);
	  var jsonRpcId;
	  var requestSettled = false;
	  var requestTracked = false;
	  var deadlineTimer = null;
	  var stage = 'construct';
	
	  function cleanupRpc() {
	    if (deadlineTimer !== null) {
	      try {
	        clearTimeout(deadlineTimer);
	      } catch (e) {}
	      deadlineTimer = null;
	    }
	    if (requestTracked) {
	      requestTracked = false;
	      try {
	        untrackMcpXhr(requestContext, request);
	      } catch (e2) {}
	    }
	  }
	
	  function finishRpc(error, result, status) {
	    if (requestSettled) {
	      return;
	    }
	    requestSettled = true;
	    cleanupRpc();
	    callback(error, result, status);
	  }
	
	  function discardRpc() {
	    if (requestSettled) {
	      return;
	    }
	    requestSettled = true;
	    cleanupRpc();
	  }
	
	  function timeoutRpc() {
	    if (requestSettled) {
	      return;
	    }
	    deadlineTimer = null;
	    if (!isCurrentMcpContext(requestContext)) {
	      discardRpc();
	      return;
	    }
	    common.logDebug('mcp deadline timeout server=' + server.label + ' method=' + method);
	    finishRpc('MCP request timed out', null, 0);
	    if (request) {
	      try {
	        request.abort();
	      } catch (e) {}
	    }
	  }
	
	  if (method.indexOf('notifications/') !== 0) {
	    payload.id = s_mcp_request_id;
	    s_mcp_request_id += 1;
	  }
	  if (params) {
	    payload.params = params;
	  }
	  jsonRpcId = payload.id;
	
	  try {
	    request = new XMLHttpRequest();
	
	    request.onload = function() {
	      var json;
	      var sessionId;
	
	      if (requestSettled) {
	        return;
	      }
	      if (!isCurrentMcpContext(requestContext)) {
	        discardRpc();
	        return;
	      }
	
	      common.logDebug('mcp response server=' + server.label + ' method=' + method + ' status=' + request.status + ' bytes=' + String(request.responseText || '').length);
	
	      if (request.status < 200 || request.status >= 300) {
	        finishRpc('MCP HTTP ' + request.status + ': ' + String(request.responseText || '').substring(0, 180), null, request.status);
	        return;
	      }
	
	      try {
	        sessionId = request.getResponseHeader('Mcp-Session-Id');
	        if (sessionId) {
	          if (String(sessionId).length > MCP_MAX_SESSION_ID_CHARS) {
	            common.logDebug('mcp session id skipped oversized server=' + server.label);
	          } else {
	            server.sessionId = sessionId;
	            if (method !== 'initialize') {
	              updateMcpCacheSession(server);
	            }
	          }
	        }
	      } catch (e) {}
	
	      if (!expectBody || !common.trim(request.responseText)) {
	        finishRpc(null, null, request.status);
	        return;
	      }
	
	      try {
	        json = parseMcpResponse(request.responseText, jsonRpcId);
	      } catch (e2) {
	        finishRpc('Bad MCP JSON response', null, request.status);
	        return;
	      }
	
	      if (!json) {
	        finishRpc('No matching MCP response', null, request.status);
	        return;
	      }
	
	      if (json.error) {
	        finishRpc(json.error.message || common.safeJson(json.error), null, request.status);
	        return;
	      }
	
	      finishRpc(null, json.result || {}, request.status);
	    };
	
	    request.onerror = function() {
	      if (requestSettled) {
	        return;
	      }
	      if (!isCurrentMcpContext(requestContext)) {
	        discardRpc();
	        return;
	      }
	      common.logDebug('mcp network error server=' + server.label + ' method=' + method);
	      finishRpc('MCP network error', null, 0);
	    };
	
	    request.ontimeout = function() {
	      if (requestSettled) {
	        return;
	      }
	      if (!isCurrentMcpContext(requestContext)) {
	        discardRpc();
	        return;
	      }
	      common.logDebug('mcp timeout server=' + server.label + ' method=' + method);
	      finishRpc('MCP request timed out', null, 0);
	    };
	
	    request.onabort = function() {
	      if (requestSettled) {
	        return;
	      }
	      if (!isCurrentMcpContext(requestContext)) {
	        discardRpc();
	        return;
	      }
	      common.logDebug('mcp request aborted server=' + server.label + ' method=' + method);
	      finishRpc('MCP request aborted', null, 0);
	    };
	
	    stage = 'open';
	    request.open('POST', server.url, true);
	    stage = 'headers';
	    request.setRequestHeader('Content-Type', 'application/json');
	    request.setRequestHeader('Accept', 'application/json, text/event-stream');
	    request.setRequestHeader('MCP-Protocol-Version', MCP_PROTOCOL_VERSION);
	    if (server.sessionId) {
	      request.setRequestHeader('Mcp-Session-Id', server.sessionId);
	    }
	    if (authorization) {
	      request.setRequestHeader('Authorization', authorization);
	    }
	    applyMcpCustomHeaders(request, server, authorization);
	    request.timeout = MCP_REQUEST_TIMEOUT_MS;
	
	    stage = 'tracking';
	    requestTracked = true;
	    if (!trackMcpXhr(requestContext, request)) {
	      requestTracked = false;
	      return;
	    }
	
	    common.logDebug('mcp request server=' + server.label + ' method=' + method + ' id=' + (payload.id || 'notification'));
	    deadlineTimer = setTimeout(timeoutRpc, MCP_REQUEST_TIMEOUT_MS);
	    stage = 'send';
	    request.send(JSON.stringify(payload));
	  } catch (e3) {
	    common.logDebug('mcp request setup failed server=' + server.label + ' method=' + method + ' stage=' + stage);
	    finishRpc('MCP request failed during ' + stage + ' for ' + method, null, 0);
	    if (request) {
	      try {
	        request.abort();
	      } catch (e4) {}
	    }
	  }
	}
	
	function initializeMcpServer(server, requestId, callback) {
	  mcpJsonRpc(server, 'initialize', {
	    protocolVersion: MCP_PROTOCOL_VERSION,
	    capabilities: {},
	    clientInfo: {
	      name: MCP_CLIENT_NAME,
	      version: MCP_CLIENT_VERSION
	    }
	  }, true, requestId, function(error, result) {
	    var caps;
	    var protocolVersion;
	
	    if (error) {
	      callback(error);
	      return;
	    }
	
	    protocolVersion = result && result.protocolVersion;
	    if (!hasOwn(MCP_SUPPORTED_PROTOCOL_VERSIONS, protocolVersion)) {
	      callback('MCP incompatible protocolVersion: ' + (protocolVersion || 'missing'));
	      return;
	    }
	
	    caps = result && result.capabilities;
	    if (caps && typeof caps === 'object' && !caps.tools) {
	      updateMcpCacheSession(server);
	      callback(null, { noTools: true });
	      return;
	    }
	
	    mcpJsonRpc(server, 'notifications/initialized', {}, false, requestId, function(initError) {
	      if (initError) {
	        callback(initError);
	        return;
	      }
	      updateMcpCacheSession(server);
	      callback(null, null);
	    });
	  });
	}
	
	function capMcpResult(text, truncated) {
	  var value = String(text === undefined || text === null ? '' : text);
	
	  if (value.length <= MCP_MAX_RESULT_CHARS && !truncated) {
	    return value;
	  }
	  return value.substring(0, MCP_MAX_RESULT_CHARS - MCP_RESULT_TRUNCATION_SUFFIX.length) + MCP_RESULT_TRUNCATION_SUFFIX;
	}
	
	function boundedMcpMetadata(value) {
	  var text;
	  if (typeof value !== 'string') {
	    return '';
	  }
	  text = value;
	  if (text.length > MCP_MAX_RESULT_METADATA_CHARS) {
	    text = text.substring(0, MCP_MAX_RESULT_METADATA_CHARS - MCP_RESULT_TRUNCATION_SUFFIX.length) + MCP_RESULT_TRUNCATION_SUFFIX;
	  }
	  return text;
	}
	
	function mcpBlockMetadata(block, nested) {
	  var parts = [];
	  var uri = boundedMcpMetadata(block.uri || nested && nested.uri);
	  var mimeType = boundedMcpMetadata(block.mimeType || block.mime_type || nested && (nested.mimeType || nested.mime_type));
	
	  if (uri) {
	    parts.push('uri=' + uri);
	  }
	  if (mimeType) {
	    parts.push('mimeType=' + mimeType);
	  }
	  return parts.length ? ' (' + parts.join('; ') + ')' : '';
	}
	
	function formatMcpContentBlock(block) {
	  var type;
	  var nested;
	  var metadata;
	
	  if (!block || typeof block !== 'object' || Object.prototype.toString.call(block) === '[object Array]') {
	    return '[MCP unsupported content block: malformed entry]';
	  }
	  type = typeof block.type === 'string' ? boundedMcpMetadata(block.type) : '';
	  nested = block.resource && typeof block.resource === 'object' ? block.resource : {};
	  metadata = mcpBlockMetadata(block, nested);
	
	  if (type === 'text') {
	    return typeof block.text === 'string' ? block.text : '[MCP text block omitted: invalid text]';
	  }
	  if (type === 'resource' && typeof nested.text === 'string') {
	    return 'MCP embedded resource text' + metadata + ':\n' + nested.text;
	  }
	  if (type === 'image' || type === 'audio') {
	    return '[MCP ' + type + ' content omitted' + metadata + '; binary data omitted]';
	  }
	  if (type === 'resource') {
	    return '[MCP resource content omitted' + metadata + '; binary or unavailable content omitted]';
	  }
	  if (type === 'resource_link') {
	    return '[MCP resource_link reference only' + metadata + '; content not fetched]';
	  }
	  return '[MCP unsupported content block' + (type ? ' type=' + type : '') + metadata + '; payload omitted]';
	}
	
	function appendMcpContentPart(state, part) {
	  var separator = state.hasPart ? '\n\n' : '';
	  var available = MCP_MAX_RESULT_CHARS - state.text.length - separator.length;
	
	  if (available <= 0) {
	    state.truncated = true;
	    return;
	  }
	  if (part.length > available) {
	    state.text += separator + part.substring(0, available);
	    state.hasPart = true;
	    state.truncated = true;
	    return;
	  }
	  state.text += separator + part;
	  state.hasPart = true;
	}
	
	function collectMcpContent(content) {
	  var state = { text: '', hasPart: false, hasBlocks: false, truncated: false, omittedBlocks: 0 };
	  var count;
	  var i;
	
	  if (content === undefined || content === null) {
	    return state;
	  }
	  if (Object.prototype.toString.call(content) !== '[object Array]') {
	    state.hasBlocks = true;
	    appendMcpContentPart(state, '[MCP content omitted: malformed content list]');
	    return state;
	  }
	
	  state.hasBlocks = content.length > 0;
	  count = Math.min(content.length, MCP_MAX_CONTENT_BLOCKS);
	  for (i = 0; i < count; i += 1) {
	    appendMcpContentPart(state, formatMcpContentBlock(content[i]));
	  }
	  if (content.length > count) {
	    state.omittedBlocks = content.length - count;
	    state.truncated = true;
	    appendMcpContentPart(state, '[MCP content omitted: ' + state.omittedBlocks + ' additional blocks]');
	  }
	  return state;
	}
	
	function appendMcpSerialized(state, value) {
	  if (state.length + value.length > state.limit) {
	    return false;
	  }
	  state.parts.push(value);
	  state.length += value.length;
	  return true;
	}
	
	function writeMcpStructuredValue(value, state, stack, depth, inArray) {
	  var type = typeof value;
	  var isArray;
	  var key;
	  var keyText;
	  var count = 0;
	  var first = true;
	  var i;
	  var item;
	
	  state.nodes += 1;
	  if (state.nodes > MCP_MAX_STRUCTURED_NODES || depth > MCP_MAX_STRUCTURED_DEPTH) {
	    return false;
	  }
	  if (value === null) {
	    return appendMcpSerialized(state, 'null');
	  }
	  if (type === 'string') {
	    if (value.length > state.limit - state.length) {
	      return false;
	    }
	    return appendMcpSerialized(state, JSON.stringify(value));
	  }
	  if (type === 'number' || type === 'boolean') {
	    return appendMcpSerialized(state, JSON.stringify(value));
	  }
	  if (type === 'undefined' || type === 'function' || type === 'symbol') {
	    return inArray ? appendMcpSerialized(state, 'null') : false;
	  }
	  if (type !== 'object') {
	    return false;
	  }
	
	  isArray = Object.prototype.toString.call(value) === '[object Array]';
	  if (stack.indexOf(value) !== -1) {
	    return false;
	  }
	  stack.push(value);
	  if (isArray) {
	    if (!appendMcpSerialized(state, '[')) {
	      stack.pop();
	      return false;
	    }
	    for (i = 0; i < value.length; i += 1) {
	      if (!first && !appendMcpSerialized(state, ',')) {
	        stack.pop();
	        return false;
	      }
	      first = false;
	      if (!writeMcpStructuredValue(value[i], state, stack, depth + 1, true)) {
	        stack.pop();
	        return false;
	      }
	    }
	    stack.pop();
	    return appendMcpSerialized(state, ']');
	  }
	
	  if (!appendMcpSerialized(state, '{')) {
	    stack.pop();
	    return false;
	  }
	  for (key in value) {
	    if (!hasOwn(value, key)) {
	      continue;
	    }
	    count += 1;
	    if (count > MCP_MAX_STRUCTURED_NODES || typeof value[key] === 'undefined' || typeof value[key] === 'function' || typeof value[key] === 'symbol') {
	      if (count > MCP_MAX_STRUCTURED_NODES) {
	        stack.pop();
	        return false;
	      }
	      continue;
	    }
	    if (key.length > state.limit - state.length) {
	      stack.pop();
	      return false;
	    }
	    keyText = JSON.stringify(key);
	    if ((!first && !appendMcpSerialized(state, ',')) || !appendMcpSerialized(state, keyText) || !appendMcpSerialized(state, ':')) {
	      stack.pop();
	      return false;
	    }
	    first = false;
	    item = value[key];
	    if (!writeMcpStructuredValue(item, state, stack, depth + 1, false)) {
	      stack.pop();
	      return false;
	    }
	  }
	  stack.pop();
	  return appendMcpSerialized(state, '}');
	}
	
	function serializeMcpStructuredValue(value, limit) {
	  var state = { limit: limit, length: 0, nodes: 0, parts: [] };
	  var serialized;
	  try {
	    if (!writeMcpStructuredValue(value, state, [], 0, false)) {
	      return null;
	    }
	    serialized = state.parts.join('');
	    return serialized.length <= limit ? serialized : null;
	  } catch (e) {
	    return null;
	  }
	}
	
	function buildMcpResultEnvelope(text, structuredJson, flags) {
	  var fields = ['"mcpResult":true', '"text":' + JSON.stringify(text), '"structuredContent":' + structuredJson];
	
	  if (flags.textTruncated) {
	    fields.push('"textTruncated":true');
	  }
	  if (flags.structuredContentOmitted) {
	    fields.push('"structuredContentOmitted":true');
	  }
	  if (flags.omittedBlocks) {
	    fields.push('"omittedBlocks":' + flags.omittedBlocks);
	  }
	  return '{' + fields.join(',') + '}';
	}
	
	function truncateMcpTextToFit(text, structuredJson, flags, limit) {
	  var low = 0;
	  var high = text.length;
	  var middle;
	  var candidate;
	  var best = '';
	
	  flags.textTruncated = true;
	  while (low <= high) {
	    middle = Math.floor((low + high) / 2);
	    if (middle > 0 && middle < text.length && text.charCodeAt(middle - 1) >= 0xD800 && text.charCodeAt(middle - 1) <= 0xDBFF &&
	        text.charCodeAt(middle) >= 0xDC00 && text.charCodeAt(middle) <= 0xDFFF) {
	      middle -= 1;
	    }
	    candidate = buildMcpResultEnvelope(text.substring(0, middle), structuredJson, flags);
	    if (candidate.length <= limit) {
	      best = candidate;
	      low = middle + 1;
	    } else {
	      high = middle - 1;
	    }
	  }
	  return best;
	}
	
	function formatMcpToolResult(result) {
	  var content = collectMcpContent(result && result.content);
	  var hasStructured = !!result && hasOwn(result, 'structuredContent') && result.structuredContent !== undefined;
	  var structuredValue;
	  var serialized;
	  var omission = { error: 'Structured MCP result omitted: result exceeds safe size or serialization limits' };
	  var flags;
	  var baseLength;
	  var envelope;
	
	  if (hasStructured && content.hasBlocks) {
	    structuredValue = serializeMcpStructuredValue(result.structuredContent, MCP_MAX_RESULT_CHARS);
	    if (structuredValue === null) {
	      structuredValue = JSON.stringify(omission);
	      flags = { textTruncated: content.truncated, structuredContentOmitted: true, omittedBlocks: content.omittedBlocks };
	    } else {
	      flags = { textTruncated: content.truncated, omittedBlocks: content.omittedBlocks };
	    }
	    baseLength = buildMcpResultEnvelope('', 'null', { textTruncated: true }).length;
	    if (structuredValue.length + baseLength - 'null'.length > MCP_MAX_RESULT_CHARS) {
	      structuredValue = JSON.stringify(omission);
	      flags.structuredContentOmitted = true;
	    }
	    envelope = buildMcpResultEnvelope(content.text, structuredValue, flags);
	    if (envelope.length > MCP_MAX_RESULT_CHARS) {
	      envelope = truncateMcpTextToFit(content.text, structuredValue, flags, MCP_MAX_RESULT_CHARS);
	    }
	    if (!envelope) {
	      envelope = buildMcpResultEnvelope('', JSON.stringify(omission), {
	        textTruncated: content.text.length > 0 || content.truncated,
	        structuredContentOmitted: true,
	        omittedBlocks: content.omittedBlocks
	      });
	    }
	    return { text: envelope, structured: true, mcpEnvelope: true };
	  }
	
	  if (content.hasBlocks) {
	    return { text: capMcpResult(content.text, content.truncated), structured: false, mcpEnvelope: false };
	  }
	
	  if (hasStructured) {
	    structuredValue = serializeMcpStructuredValue(result.structuredContent, MCP_MAX_RESULT_CHARS);
	    if (structuredValue === null) {
	      structuredValue = JSON.stringify(omission);
	    }
	    return { text: structuredValue, structured: true, mcpEnvelope: false };
	  }
	
	  serialized = serializeMcpStructuredValue(result || {}, MCP_MAX_RESULT_CHARS);
	  if (serialized === null) {
	    serialized = JSON.stringify(omission);
	  }
	  return { text: serialized, structured: true, mcpEnvelope: false };
	}
	
	function mcpCacheKey(server) {
	  return JSON.stringify({
	    displayLabel: server.displayLabel,
	    label: server.label,
	    limitKey: server.limitKey,
	    url: server.url,
	    description: server.description,
	    allowedTools: server.allowedTools,
	    maxToolCalls: server.maxToolCalls,
	    authorization: server.authorization,
	    headers: server.headers
	  });
	}
	
	function mcpCacheStorageKey(key) {
	  return 'mcp:' + key;
	}
	
	function removeMcpCacheKey(storageKey) {
	  var index = s_mcp_cache_keys.indexOf(storageKey);
	
	  if (hasOwn(s_mcp_cache, storageKey)) {
	    delete s_mcp_cache[storageKey];
	  }
	  if (index !== -1) {
	    s_mcp_cache_keys.splice(index, 1);
	  }
	}
	
	function lookupMcpCache(key) {
	  var storageKey = mcpCacheStorageKey(key);
	  var entry = s_mcp_cache[storageKey];
	  var index;
	
	  if (!entry) {
	    return null;
	  }
	  if (Date.now() - entry.time > MCP_CACHE_TTL_MS) {
	    removeMcpCacheKey(storageKey);
	    return null;
	  }
	  entry.lastUsed = Date.now();
	  index = s_mcp_cache_keys.indexOf(storageKey);
	  if (index !== -1) {
	    s_mcp_cache_keys.splice(index, 1);
	  }
	  s_mcp_cache_keys.push(storageKey);
	  return entry;
	}
	
	function cloneMcpValue(value) {
	  try {
	    return JSON.parse(JSON.stringify(value));
	  } catch (e) {
	    return null;
	  }
	}
	
	function cloneMcpToolList(tools) {
	  return cloneMcpValue(tools || []) || [];
	}
	
	function storeMcpCache(server, tools, noTools) {
	  var storageKey = mcpCacheStorageKey(server._mcpCacheKey);
	  var index;
	
	  s_mcp_cache[storageKey] = {
	    time: Date.now(),
	    lastUsed: Date.now(),
	    sessionId: server.sessionId || '',
	    noTools: noTools === true,
	    tools: cloneMcpToolList(tools)
	  };
	  index = s_mcp_cache_keys.indexOf(storageKey);
	  if (index !== -1) {
	    s_mcp_cache_keys.splice(index, 1);
	  }
	  s_mcp_cache_keys.push(storageKey);
	  while (s_mcp_cache_keys.length > MCP_MAX_CACHE_ENTRIES) {
	    removeMcpCacheKey(s_mcp_cache_keys[0]);
	  }
	}
	
	function cloneTools(tools) {
	  var copy = [];
	  var i;
	
	  for (i = 0; i < tools.length; i += 1) {
	    copy.push(tools[i]);
	  }
	  return copy;
	}
	
	function cloneToolMap(toolMap) {
	  var copy = Object.create(null);
	  var key;
	
	  for (key in toolMap) {
	    if (hasOwn(toolMap, key)) {
	      copy[key] = toolMap[key];
	    }
	  }
	  return copy;
	}
	
	function cloneBoundedMcpSchema(value, budget, depth) {
	  var serialized;
	  var result;
	  var key;
	  var item;
	  var first;
	  var i;
	
	  if (depth > MCP_MAX_SCHEMA_DEPTH) {
	    return MCP_INVALID_SCHEMA;
	  }
	  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
	    serialized = JSON.stringify(value);
	    if (serialized === undefined || budget.chars + serialized.length > MCP_MAX_INPUTSCHEMA_CHARS) {
	      return MCP_INVALID_SCHEMA;
	    }
	    budget.chars += serialized.length;
	    return value;
	  }
	  if (typeof value === 'string') {
	    if (value.length > MCP_MAX_INPUTSCHEMA_CHARS) {
	      return MCP_INVALID_SCHEMA;
	    }
	    serialized = JSON.stringify(value);
	    if (budget.chars + serialized.length > MCP_MAX_INPUTSCHEMA_CHARS) {
	      return MCP_INVALID_SCHEMA;
	    }
	    budget.chars += serialized.length;
	    return value;
	  }
	  if (Array.isArray(value)) {
	    result = [];
	    budget.chars += 2;
	    if (budget.chars > MCP_MAX_INPUTSCHEMA_CHARS) {
	      return MCP_INVALID_SCHEMA;
	    }
	    for (i = 0; i < value.length; i += 1) {
	      if (i > 0) {
	        budget.chars += 1;
	      }
	      item = cloneBoundedMcpSchema(value[i], budget, depth + 1);
	      if (item === MCP_INVALID_SCHEMA) {
	        return MCP_INVALID_SCHEMA;
	      }
	      result.push(item);
	    }
	    return result;
	  }
	  if (typeof value === 'object') {
	    result = Object.create(null);
	    budget.chars += 2;
	    if (budget.chars > MCP_MAX_INPUTSCHEMA_CHARS) {
	      return MCP_INVALID_SCHEMA;
	    }
	    first = true;
	    for (key in value) {
	      if (!hasOwn(value, key)) {
	        continue;
	      }
	      if (key.length > MCP_MAX_INPUTSCHEMA_CHARS) {
	        return MCP_INVALID_SCHEMA;
	      }
	      serialized = JSON.stringify(key);
	      budget.chars += (first ? 0 : 1) + serialized.length + 1;
	      if (budget.chars > MCP_MAX_INPUTSCHEMA_CHARS) {
	        return MCP_INVALID_SCHEMA;
	      }
	      item = cloneBoundedMcpSchema(value[key], budget, depth + 1);
	      if (item === MCP_INVALID_SCHEMA) {
	        return MCP_INVALID_SCHEMA;
	      }
	      result[key] = item;
	      first = false;
	    }
	    return result;
	  }
	  return MCP_INVALID_SCHEMA;
	}
	
	function sanitizeMcpToolDefinition(tool, server) {
	  var name;
	  var description;
	  var inputSchema;
	  var schemaBudget = { chars: 0 };
	  var schema;
	  var size;
	
	  tool = tool || {};
	  name = typeof tool.name === 'string' ? tool.name : '';
	  if (!name) {
	    return null;
	  }
	  if (name.length > MCP_MAX_TOOL_NAME_CHARS) {
	    common.logDebug('mcp tool skipped oversized name server=' + server.label + ' chars=' + name.length);
	    return null;
	  }
	
	  description = typeof tool.description === 'string' ? tool.description : '';
	  if (description.length > MCP_MAX_DESCRIPTION_CHARS * 2) {
	    description = description.substring(0, MCP_MAX_DESCRIPTION_CHARS * 2);
	  }
	  description = common.trim(description);
	  if (description.length > MCP_MAX_DESCRIPTION_CHARS) {
	    description = description.substring(0, MCP_MAX_DESCRIPTION_CHARS);
	  }
	
	  inputSchema = tool.inputSchema || { type: 'object', properties: {} };
	  schema = cloneBoundedMcpSchema(inputSchema, schemaBudget, 0);
	  if (schema === MCP_INVALID_SCHEMA) {
	    common.logDebug('mcp tool skipped oversized inputSchema server=' + server.label + ' tool=' + name + ' limit=' + MCP_MAX_INPUTSCHEMA_CHARS);
	    return null;
	  }
	
	  size = JSON.stringify(name).length + JSON.stringify(description).length + schemaBudget.chars + 40;
	  return {
	    tool: { name: name, description: description, inputSchema: schema },
	    chars: size
	  };
	}
	
	function listAllMcpTools(server, requestContext, callback) {
	  var allTools = [];
	  var done = false;
	  var pageCount = 0;
	  var toolCount = 0;
	  var cachedChars = 0;
	
	  function finish(error, tools) {
	    if (done) {
	      return;
	    }
	    done = true;
	    callback(error, tools);
	  }
	
	  function fetchPage(cursor) {
	    var params = cursor ? { cursor: cursor } : {};
	    var i;
	
	    if (pageCount >= MCP_MAX_PAGINATION_PAGES) {
	      common.logDebug('mcp tools/list page limit reached server=' + server.label);
	      finish(null, allTools);
	      return;
	    }
	    pageCount += 1;
	
	    mcpJsonRpc(server, 'tools/list', params, true, requestContext, function(listError, result) {
	      var serverTools;
	      var nextCursor;
	
	      if (!isCurrentMcpContext(requestContext)) {
	        return;
	      }
	      if (listError) {
	        finish(listError, null);
	        return;
	      }
	
	      serverTools = result && Array.isArray(result.tools) ? result.tools : [];
	      for (i = 0; i < serverTools.length; i += 1) {
	        var sanitized;
	
	        if (toolCount >= MCP_MAX_TOOLS_PER_SERVER) {
	          common.logDebug('mcp tools/list per-server limit reached server=' + server.label);
	          finish(null, allTools);
	          return;
	        }
	        toolCount += 1;
	        sanitized = sanitizeMcpToolDefinition(serverTools[i], server);
	        if (!sanitized) {
	          continue;
	        }
	        if (cachedChars + sanitized.chars > MCP_MAX_SERVER_CACHE_CHARS) {
	          common.logDebug('mcp tool skipped server cache character limit server=' + server.label + ' tool=' + sanitized.tool.name + ' limit=' + MCP_MAX_SERVER_CACHE_CHARS);
	          continue;
	        }
	        cachedChars += sanitized.chars;
	        allTools.push(sanitized.tool);
	      }
	
	      nextCursor = result && result.nextCursor;
	      if (nextCursor) {
	        fetchPage(nextCursor);
	      } else {
	        finish(null, allTools);
	      }
	    });
	  }
	
	  fetchPage(null);
	}
	
	function finishMcpServerDiscovery(pending, error, tools, noTools) {
	  var key = mcpCacheStorageKey(pending.key);
	  var i;
	
	  if (pending.done) {
	    return;
	  }
	  pruneMcpWaiters(pending);
	  if (!pending.waiters.length) {
	    cancelMcpServerDiscovery(pending, 'MCP discovery canceled');
	    return;
	  }
	
	  pending.done = true;
	  delete s_mcp_pending[key];
	  s_mcp_pending_count -= 1;
	  pending.context.active = false;
	  if (!error) {
	    storeMcpCache(pending.server, tools, noTools);
	  }
	
	  for (i = 0; i < pending.waiters.length; i += 1) {
	    var waiter = pending.waiters[i];
	    if (!isCurrentMcpWaiter(waiter)) {
	      settleMcpWaiter(waiter, 'MCP discovery canceled', null, false);
	      continue;
	    }
	    waiter.server.sessionId = pending.server.sessionId || '';
	    waiter.server._mcpCacheKey = pending.key;
	    settleMcpWaiter(waiter, error, error ? null : tools, noTools === true);
	  }
	}
	
	function discoverMcpServer(server, requestContext, callback, foregroundBatch) {
	  var key = server._mcpCacheKey || mcpCacheKey(server);
	  var storageKey = mcpCacheStorageKey(key);
	  var cached = lookupMcpCache(key);
	  var pending = s_mcp_pending[storageKey];
	  var waiter = makeMcpWaiter(requestContext, server, callback, foregroundBatch);
	  var context;
	
	  if (!isCurrentMcpWaiter(waiter)) {
	    settleMcpWaiter(waiter, 'MCP discovery canceled', null, false);
	    return;
	  }
	  if (cached) {
	    server.sessionId = cached.sessionId || '';
	    settleMcpWaiter(waiter, null, cloneMcpToolList(cached.tools), cached.noTools === true);
	    return;
	  }
	  if (pending) {
	    pruneMcpWaiters(pending);
	    if (pending.done || s_mcp_pending[storageKey] !== pending) {
	      pending = null;
	    }
	  }
	  if (pending) {
	    if (pending.waiters.length >= MCP_MAX_PENDING_WAITERS) {
	      settleMcpWaiter(waiter, 'MCP discovery busy', null, false);
	      return;
	    }
	    pending.waiters.push(waiter);
	    return;
	  }
	  cancelUnobservedMcpDiscoveries(requestContext && requestContext.warmGeneration);
	  if (s_mcp_pending_count >= MCP_MAX_PENDING_DISCOVERIES) {
	    settleMcpWaiter(waiter, 'MCP discovery busy', null, false);
	    return;
	  }
	
	  context = { background: true, active: true, requests: [] };
	  pending = {
	    key: key,
	    server: server,
	    context: context,
	    waiters: [waiter],
	    done: false
	  };
	  s_mcp_pending[storageKey] = pending;
	  s_mcp_pending_count += 1;
	
	  initializeMcpServer(server, context, function(initError, initResult) {
	    var noTools = initResult && initResult.noTools;
	
	    if (pending.done) {
	      return;
	    }
	    if (initError) {
	      common.logDebug('mcp initialize failed server=' + server.label);
	      finishMcpServerDiscovery(pending, initError, null, false);
	      return;
	    }
	    if (noTools) {
	      common.logDebug('mcp server declares no tools capability server=' + server.label);
	      finishMcpServerDiscovery(pending, null, [], true);
	      return;
	    }
	
	    common.logDebug('mcp initialized server=' + server.label);
	    listAllMcpTools(server, context, function(listError, serverTools) {
	      if (pending.done) {
	        return;
	      }
	      if (listError) {
	        common.logDebug('mcp tools/list failed server=' + server.label);
	        finishMcpServerDiscovery(pending, listError, null, false);
	        return;
	      }
	      common.logDebug('mcp tools/list ok server=' + server.label + ' count=' + serverTools.length);
	      finishMcpServerDiscovery(pending, null, serverTools, false);
	    });
	  });
	}
	
	function discoverMcpTools(settings, requestContext, callback, serverList) {
	  var servers = serverList || parseMcpServers(settings);
	  var tools = [];
	  var toolMap = Object.create(null);
	  var usedNames = Object.create(null);
	  var results = [];
	  var remaining = servers.length;
	  var foregroundBatch = null;
	  var isForeground = !(requestContext && typeof requestContext === 'object' && requestContext.background === true);
	
	  if (isForeground) {
	    foregroundBatch = {
	      requestId: requestContext,
	      timer: null,
	      finished: false,
	      canceled: false
	    };
	    s_mcp_foreground_batches.push(foregroundBatch);
	  }
	
	  common.logDebug('mcp discover start servers=' + servers.length);
	
	  function addTools(server, serverTools) {
	    var i;
	    var tool;
	    var exposedName;
	    var baseName;
	    var suffix;
	    var description;
	    var inputSchema;
	    var schemaSize;
	
	    for (i = 0; i < serverTools.length; i += 1) {
	      if (tools.length >= MCP_MAX_TOOLS_GLOBAL) {
	        common.logDebug('mcp tools global limit reached');
	        return;
	      }
	      tool = serverTools[i] || {};
	      if (!tool.name || !isAllowedTool(server, tool.name)) {
	        continue;
	      }
	
	      inputSchema = tool.inputSchema || { type: 'object', properties: {} };
	      try {
	        schemaSize = JSON.stringify(inputSchema).length;
	      } catch (e) {
	        schemaSize = MCP_MAX_INPUTSCHEMA_CHARS + 1;
	      }
	      if (schemaSize > MCP_MAX_INPUTSCHEMA_CHARS) {
	        common.logDebug('mcp tool skipped oversized inputSchema server=' + server.label + ' tool=' + tool.name);
	        continue;
	      }
	
	      baseName = slugify(server.label) + '__' + slugify(tool.name);
	      exposedName = baseName;
	      suffix = 2;
	      while (hasOwn(usedNames, exposedName)) {
	        exposedName = baseName + '_' + suffix;
	        suffix += 1;
	      }
	      usedNames[exposedName] = true;
	
	      description = common.trim(tool.description || server.description || 'MCP tool');
	      if (description.length > MCP_MAX_DESCRIPTION_CHARS) {
	        description = description.substring(0, MCP_MAX_DESCRIPTION_CHARS);
	      }
	      if (server.maxToolCalls !== null) {
	        description += ' This MCP server may be called at most ' + server.maxToolCalls + ' time(s) this request.';
	      }
	
	      tools.push({
	        name: exposedName,
	        description: description,
	        parameters: inputSchema
	      });
	      toolMap[exposedName] = {
	        kind: 'mcp',
	        server: server,
	        toolName: tool.name,
	        parameters: inputSchema
	      };
	      common.logDebug('mcp tool exposed=' + exposedName + ' original=' + tool.name + ' server=' + server.label);
	    }
	  }
	
	  function finalize(expired) {
	    var i;
	    var entry;
	    var unavailable = [];
	
	    if (foregroundBatch && (foregroundBatch.finished || foregroundBatch.canceled)) {
	      return;
	    }
	    if (!isCurrentMcpContext(requestContext)) {
	      if (foregroundBatch) {
	        finishForegroundBatch(foregroundBatch, true, true);
	      }
	      return;
	    }
	    for (i = 0; i < servers.length; i += 1) {
	      entry = results[i];
	      if (entry && entry.tools) {
	        addTools(entry.server, entry.tools);
	      } else if (foregroundBatch) {
	        unavailable.push(servers[i].displayLabel || servers[i].label);
	      }
	    }
	
	    if (foregroundBatch) {
	      finishForegroundBatch(foregroundBatch, false, expired === true);
	    }
	    callback(null, cloneTools(tools), cloneToolMap(toolMap), unavailable);
	  }
	
	  if (foregroundBatch && servers.length) {
	    foregroundBatch.timer = setTimeout(function() {
	      foregroundBatch.timer = null;
	      finalize(true);
	    }, common.normalizeMcpDiscoveryTimeoutMs(settings && settings.McpDiscoveryTimeoutMs));
	  }
	
	  if (!remaining) {
	    finalize(false);
	    return;
	  }
	
	  servers.forEach(function(server, index) {
	    discoverMcpServer(server, requestContext, function(discoveryError, serverTools) {
	      if (foregroundBatch && (foregroundBatch.finished || foregroundBatch.canceled)) {
	        return;
	      }
	      if (discoveryError) {
	        results[index] = null;
	      } else {
	        results[index] = { server: server, tools: serverTools || [] };
	      }
	      remaining -= 1;
	      if (remaining <= 0) {
	        finalize(false);
	      }
	    }, foregroundBatch);
	  });
	}
	
	function pad2(value) {
	  return value < 10 ? '0' + value : String(value);
	}
	
	function formatDateTime(date) {
	  var offsetMinutes = -date.getTimezoneOffset();
	  var offsetSign = offsetMinutes >= 0 ? '+' : '-';
	  var absOffset = Math.abs(offsetMinutes);
	
	  return date.getFullYear() + '-' +
	    pad2(date.getMonth() + 1) + '-' +
	    pad2(date.getDate()) + ' ' +
	    pad2(date.getHours()) + ':' +
	    pad2(date.getMinutes()) + ':' +
	    pad2(date.getSeconds()) + ' GMT' +
	    offsetSign +
	    pad2(Math.floor(absOffset / 60)) + ':' +
	    pad2(absOffset % 60);
	}
	
	function formatIsoDateTime(date) {
	  if (date && date.toISOString) {
	    return date.toISOString();
	  }
	
	  return formatDateTime(date || new Date());
	}
	
	function boolArg(value, fallback) {
	  var normalized;
	
	  if (value === undefined || value === null || value === '') {
	    return fallback;
	  }
	
	  if (value === true || value === 1) {
	    return true;
	  }
	  if (value === false || value === 0) {
	    return false;
	  }
	
	  normalized = String(value).toLowerCase();
	  return normalized === 'true' || normalized === '1' || normalized === 'yes';
	}
	
	function parseObjectArg(value) {
	  if (typeof value === 'string') {
	    try {
	      return JSON.parse(value);
	    } catch (e) {
	      return null;
	    }
	  }
	
	  return value;
	}
	
	function callGeolocationBuiltin(args, requestId, callback) {
	  var options;
	
	  args = args || {};
	  if (!watch.isCurrentRequest(requestId)) {
	    return;
	  }
	  if (typeof navigator === 'undefined' || !navigator.geolocation || !navigator.geolocation.getCurrentPosition) {
	    callback('Geolocation unavailable');
	    return;
	  }
	
	  options = {
	    enableHighAccuracy: boolArg(args.enableHighAccuracy, false),
	    timeout: common.clampNumber(args.timeoutMs, 1000, 60000, 10000),
	    maximumAge: common.clampNumber(args.maximumAgeMs, 0, 3600000, 300000)
	  };
	
	  navigator.geolocation.getCurrentPosition(function(position) {
	    var coords = position.coords || {};
	    var result = {
	      latitude: coords.latitude,
	      longitude: coords.longitude,
	      accuracyMeters: coords.accuracy,
	      timestamp: formatIsoDateTime(position.timestamp ? new Date(position.timestamp) : new Date())
	    };
	
	    if (coords.altitude !== undefined && coords.altitude !== null) {
	      result.altitudeMeters = coords.altitude;
	    }
	    if (coords.altitudeAccuracy !== undefined && coords.altitudeAccuracy !== null) {
	      result.altitudeAccuracyMeters = coords.altitudeAccuracy;
	    }
	    if (coords.heading !== undefined && coords.heading !== null) {
	      result.headingDegrees = coords.heading;
	    }
	    if (coords.speed !== undefined && coords.speed !== null) {
	      result.speedMetersPerSecond = coords.speed;
	    }
	
	    if (watch.isCurrentRequest(requestId)) {
	      callback(null, common.safeJson(result));
	    }
	  }, function(error) {
	    if (!watch.isCurrentRequest(requestId)) {
	      return;
	    }
	    if (error && error.message) {
	      callback('Geolocation error: ' + error.message);
	      return;
	    }
	    if (error && error.code) {
	      callback('Geolocation error code ' + error.code);
	      return;
	    }
	
	    callback('Geolocation error');
	  }, options);
	}
	
	function getTimelineToken(callback) {
	  if (typeof Pebble === 'undefined' || !Pebble.getTimelineToken) {
	    callback('Timeline token API unavailable');
	    return;
	  }
	
	  Pebble.getTimelineToken(function(token) {
	    if (!token) {
	      callback('Timeline token unavailable');
	      return;
	    }
	
	    callback(null, token);
	  }, function(error) {
	    callback('Timeline token error: ' + (error || 'unknown error'));
	  });
	}
	
	function isTimelineArray(value) {
	  return Object.prototype.toString.call(value) === '[object Array]';
	}
	
	function firstTimelineValue(args, keys) {
	  var i;
	  var key;
	
	  for (i = 0; i < keys.length; i += 1) {
	    key = keys[i];
	    if (hasToolArgValue(args[key])) {
	      return args[key];
	    }
	  }
	
	  return undefined;
	}
	
	function validateTimelineArgShape(args, allowStoredReminders) {
	  var key;
	
	  for (key in args) {
	    if (args.hasOwnProperty(key)) {
	      if (TIMELINE_RAW_PIN_ARG_KEYS[key] && !(allowStoredReminders && key === 'reminders')) {
	        return 'Use structured timeline arguments, not raw Pebble pin JSON';
	      }
	    }
	  }
	
	  return '';
	}
	
	function timelineCreationIdError(args) {
	  if (!args || typeof args !== 'object') {
	    return '';
	  }
	  if (hasOwn(args, 'id') || hasOwn(args, 'pinId') || hasOwn(args, 'pin_id') ||
	      (args.pin && typeof args.pin === 'object' && hasOwn(args.pin, 'id'))) {
	    return 'Timeline creation generates a new pin id. Omit id; use pebble_timeline_edit_pin to change an existing pin.';
	  }
	  return '';
	}
	
	function addTimelineStringField(target, key, value, maxLength) {
	  value = common.trim(value);
	  if (!value) {
	    return;
	  }
	
	  target[key] = maxLength ? common.truncate(value, maxLength) : value;
	}
	
	function optionalTimelineInteger(value, name, min, max, errors) {
	  var number;
	
	  if (!hasToolArgValue(value)) {
	    return null;
	  }
	
	  number = parseInt(value, 10);
	  if (isNaN(number)) {
	    errors.push(name + ' must be an integer');
	    return null;
	  }
	  if (min !== null && min !== undefined && number < min) {
	    errors.push(name + ' must be ' + min + ' or greater');
	    return null;
	  }
	  if (max !== null && max !== undefined && number > max) {
	    errors.push(name + ' must be ' + max + ' or less');
	    return null;
	  }
	
	  return number;
	}
	
	function normalizeTimelineDateTime(value) {
	  var unix;
	
	  if (!hasToolArgValue(value)) {
	    return '';
	  }
	
	  unix = parseUnixTimeArg(value);
	  if (unix === null) {
	    return '';
	  }
	
	  return formatIsoDateTime(new Date(unix * 1000));
	}
	
	function normalizeTimelineIconName(value) {
	  return common.trim(value)
	    .replace(/\\_/g, '_')
	    .replace(/[^A-Za-z0-9_]+/g, '_')
	    .replace(/^_+|_+$/g, '')
	    .toUpperCase();
	}
	
	function normalizeTimelineIcon(value, fallback) {
	  var text = common.trim(value);
	  var match;
	  var iconName;
	
	  if (!text) {
	    text = fallback || '';
	  }
	  if (!text) {
	    return '';
	  }
	
	  text = text.replace(/\\_/g, '_');
	  if (/^app:\/\/images\//i.test(text)) {
	    return text;
	  }
	
	  match = text.match(/^system:\/\/images\/(.+)$/i);
	  iconName = match ? match[1] : text;
	  iconName = normalizeTimelineIconName(iconName);
	
	  return iconName ? 'system://images/' + iconName : '';
	}
	
	function normalizeTimelineLayoutType(value) {
	  var lower = common.trim(value).toLowerCase();
	
	  if (!lower || lower === 'generic' || lower === 'genericpin') {
	    return 'genericPin';
	  }
	  if (lower === 'calendar' || lower === 'calendarpin') {
	    return 'calendarPin';
	  }
	  if (lower === 'sports' || lower === 'sportspin') {
	    return 'sportsPin';
	  }
	  if (lower === 'weather' || lower === 'weatherpin') {
	    return 'weatherPin';
	  }
	
	  return '';
	}
	
	function normalizeTimelineStringArray(value) {
	  var result = [];
	  var parsed;
	  var i;
	  var item;
	
	  if (typeof value === 'string') {
	    parsed = parseObjectArg(value);
	    value = isTimelineArray(parsed) ? parsed : value.split(/\r?\n/);
	  } else {
	    value = parseObjectArg(value);
	  }
	  if (!isTimelineArray(value)) {
	    return result;
	  }
	
	  for (i = 0; i < value.length; i += 1) {
	    item = common.trim(value[i]);
	    if (item) {
	      result.push(item);
	    }
	  }
	
	  return result;
	}
	
	function generateTimelinePinId(title) {
	  var base = slugify(title || 'reminder').toLowerCase().substring(0, 20);
	  var prefix = 'llm_' + base + '_' + new Date().getTime().toString(36) + '_';
	  var attempt;
	  var sequence;
	  var id;
	
	  for (attempt = 0; attempt < TIMELINE_PIN_ID_MAX_ATTEMPTS; attempt += 1) {
	    sequence = timelineStore.nextTimelinePinIdSequence();
	    id = (prefix + sequence.toString(36)).substring(0, 64);
	    if (!timelineStore.getTimelinePin(id) && !hasOwn(s_timeline_pending_pin_ids, id)) {
	      reserveTimelinePinId(id);
	      return id;
	    }
	  }
	
	  return '';
	}
	
	function reserveTimelinePinId(id) {
	  var oldest;
	
	  if (hasOwn(s_timeline_pending_pin_ids, id)) {
	    return;
	  }
	  while (s_timeline_pending_pin_id_order.length >= TIMELINE_PIN_ID_MAX_PENDING) {
	    oldest = s_timeline_pending_pin_id_order.shift();
	    delete s_timeline_pending_pin_ids[oldest];
	  }
	  s_timeline_pending_pin_ids[id] = true;
	  s_timeline_pending_pin_id_order.push(id);
	}
	
	function releaseTimelinePinId(id) {
	  var index;
	  if (!hasOwn(s_timeline_pending_pin_ids, id)) {
	    return;
	  }
	  delete s_timeline_pending_pin_ids[id];
	  index = s_timeline_pending_pin_id_order.indexOf(id);
	  if (index !== -1) {
	    s_timeline_pending_pin_id_order.splice(index, 1);
	  }
	}
	
	function buildTimelinePinLayout(args, errors) {
	  var layout = {};
	  var layoutType = normalizeTimelineLayoutType(firstTimelineValue(args, ['pinType', 'layoutType', 'type']));
	  var tinyIcon = firstTimelineValue(args, ['icon', 'tinyIcon', 'pinIcon']);
	  var headings;
	  var paragraphs;
	  var fields = [
	    'title', 'subtitle', 'shortTitle', 'shortSubtitle', 'body', 'locationName',
	    'smallIcon', 'largeIcon', 'primaryColor', 'secondaryColor', 'backgroundColor',
	    'lastUpdated', 'displayTime', 'rankAway', 'rankHome', 'nameAway', 'nameHome',
	    'recordAway', 'recordHome', 'scoreAway', 'scoreHome', 'sportsGameState'
	  ];
	  var maxLengths = {
	    body: 512
	  };
	  var i;
	  var key;
	
	  if (!layoutType) {
	    errors.push('layoutType must be genericPin, calendarPin, sportsPin, or weatherPin');
	    layoutType = 'genericPin';
	  }
	  layout.type = layoutType;
	
	  for (i = 0; i < fields.length; i += 1) {
	    key = fields[i];
	    addTimelineStringField(layout, key, args[key], maxLengths[key]);
	  }
	
	  if (hasToolArgValue(tinyIcon) || layoutType !== 'calendarPin') {
	    layout.tinyIcon = normalizeTimelineIcon(tinyIcon, TIMELINE_DEFAULT_PIN_ICON);
	  }
	  if (hasToolArgValue(args.smallIcon)) {
	    layout.smallIcon = normalizeTimelineIcon(args.smallIcon, '');
	  }
	  if (hasToolArgValue(args.largeIcon)) {
	    layout.largeIcon = normalizeTimelineIcon(args.largeIcon, '');
	  }
	
	  headings = normalizeTimelineStringArray(args.headings);
	  paragraphs = normalizeTimelineStringArray(args.paragraphs);
	  if (headings.length || paragraphs.length) {
	    if (headings.length !== paragraphs.length) {
	      errors.push('headings and paragraphs must have the same number of items');
	    } else {
	      layout.headings = headings;
	      layout.paragraphs = paragraphs;
	    }
	  }
	
	  return layout;
	}
	
	function buildTimelineNotification(prefix, args) {
	  var title = common.trim(args[prefix + 'Title']);
	  var body = common.trim(args[prefix + 'Body']);
	  var icon = args[prefix + 'Icon'];
	  var notification;
	
	  if (!title && !body && !hasToolArgValue(icon)) {
	    return null;
	  }
	
	  notification = {
	    layout: {
	      type: 'genericNotification',
	      title: title || 'Timeline update',
	      tinyIcon: normalizeTimelineIcon(icon, TIMELINE_DEFAULT_NOTIFICATION_ICON)
	    }
	  };
	  if (body) {
	    notification.layout.body = common.truncate(body, 512);
	  }
	  if (prefix === 'updateNotification') {
	    notification.time = normalizeTimelineDateTime(args.updateNotificationTime) || formatIsoDateTime(new Date());
	  }
	
	  return notification;
	}
	
	function buildTimelineReminderTime(reminderArgs, defaultArgs, pinTime, errors) {
	  var reminderTime = normalizeTimelineDateTime(firstTimelineValue(reminderArgs, ['time', 'reminderTime']));
	  var minutesBefore;
	  var hasReminderTime = hasToolArgValue(firstTimelineValue(reminderArgs, ['time', 'reminderTime']));
	  var hasMinutesBefore;
	  var pinUnix;
	
	  minutesBefore = firstTimelineValue(reminderArgs, ['minutesBefore', 'remindMinutesBefore']);
	  if (!hasToolArgValue(minutesBefore)) {
	    minutesBefore = firstTimelineValue(defaultArgs, ['minutesBefore', 'remindMinutesBefore']);
	  }
	  hasMinutesBefore = hasToolArgValue(minutesBefore);
	
	  if (hasReminderTime && hasMinutesBefore) {
	    errors.push('Use either reminderTime or remindMinutesBefore, not both');
	    return '';
	  }
	
	  if (reminderTime) {
	    return reminderTime;
	  }
	
	  if (hasToolArgValue(minutesBefore)) {
	    minutesBefore = optionalTimelineInteger(minutesBefore, 'minutesBefore', 0, 43200, errors);
	    pinUnix = parseUnixTimeArg(pinTime);
	    if (minutesBefore !== null && pinUnix !== null) {
	      return formatIsoDateTime(new Date((pinUnix - minutesBefore * 60) * 1000));
	    }
	  }
	
	  return '';
	}
	
	function buildTimelineReminder(reminderArgs, defaultArgs, pinTime, errors) {
	  var reminder;
	  var title;
	  var locationName;
	  var icon;
	
	  reminderArgs = parseObjectArg(reminderArgs) || {};
	  reminder = {
	    time: buildTimelineReminderTime(reminderArgs, defaultArgs, pinTime, errors),
	    layout: {
	      type: 'genericReminder'
	    }
	  };
	
	  if (!reminder.time) {
	    errors.push('Reminder time or minutesBefore is required');
	    return null;
	  }
	
	  title = common.trim(firstTimelineValue(reminderArgs, ['title', 'reminderTitle']) || defaultArgs.reminderTitle || defaultArgs.title || 'Reminder');
	  locationName = firstTimelineValue(reminderArgs, ['locationName', 'reminderLocationName']) || defaultArgs.reminderLocationName || defaultArgs.locationName;
	  icon = firstTimelineValue(reminderArgs, ['tinyIcon', 'reminderIcon', 'icon']);
	  if (!hasToolArgValue(icon)) {
	    icon = defaultArgs.reminderIcon;
	  }
	
	  reminder.layout.title = title || 'Reminder';
	  reminder.layout.tinyIcon = normalizeTimelineIcon(icon, TIMELINE_DEFAULT_REMINDER_ICON);
	  addTimelineStringField(reminder.layout, 'locationName', locationName, 128);
	
	  return reminder;
	}
	
	function buildTimelineReminders(args, pinTime, forceReminder, errors, suppressReminder) {
	  var reminders = [];
	  var raw = parseObjectArg(args.reminders);
	  var i;
	  var reminder;
	
	  if (suppressReminder) {
	    return reminders;
	  }
	
	  if (isTimelineArray(raw)) {
	    if (raw.length > 3) {
	      errors.push('reminders can include at most 3 items');
	    }
	    for (i = 0; i < raw.length && i < 3; i += 1) {
	      reminder = buildTimelineReminder(raw[i], args, pinTime, errors);
	      if (reminder) {
	        reminders.push(reminder);
	      }
	    }
	    return reminders;
	  }
	
	  if (forceReminder || hasToolArgValue(args.reminderTime) || hasToolArgValue(args.remindMinutesBefore) || hasToolArgValue(args.minutesBefore) || hasToolArgValue(args.reminderTitle) || hasToolArgValue(args.reminderIcon)) {
	    reminder = buildTimelineReminder({
	      time: args.reminderTime || ((!hasToolArgValue(args.remindMinutesBefore) && !hasToolArgValue(args.minutesBefore) && forceReminder) ? pinTime : ''),
	      minutesBefore: firstTimelineValue(args, ['minutesBefore', 'remindMinutesBefore']),
	      title: firstTimelineValue(args, ['reminderTitle', 'title']),
	      locationName: firstTimelineValue(args, ['reminderLocationName', 'locationName']),
	      icon: args.reminderIcon
	    }, args, pinTime, errors);
	    if (reminder) {
	      reminders.push(reminder);
	    }
	  }
	
	  return reminders;
	}
	
	function normalizeTimelineActionType(action) {
	  var type = common.trim(action.type).toLowerCase();
	
	  if (!type && hasToolArgValue(action.launchCode)) {
	    return 'openWatchApp';
	  }
	  if (!type && hasToolArgValue(action.url)) {
	    return 'http';
	  }
	  if (type === 'openwatchapp' || type === 'open_watch_app') {
	    return 'openWatchApp';
	  }
	  if (type === 'http') {
	    return 'http';
	  }
	
	  return '';
	}
	
	function buildTimelineActions(args, errors) {
	  var raw = parseObjectArg(args.actions);
	  var actions = [];
	  var i;
	  var source;
	  var action;
	  var type;
	  var launchCode;
	  var bodyJson;
	
	  if (raw === undefined || raw === null || raw === '') {
	    return actions;
	  }
	  if (!isTimelineArray(raw)) {
	    errors.push('actions must be an array');
	    return actions;
	  }
	
	  for (i = 0; i < raw.length; i += 1) {
	    source = parseObjectArg(raw[i]) || {};
	    type = normalizeTimelineActionType(source);
	    action = {
	      title: common.trim(source.title),
	      type: type
	    };
	
	    if (!action.title) {
	      errors.push('actions[' + i + '].title is required');
	      continue;
	    }
	    if (!type) {
	      errors.push('actions[' + i + '].type must be openWatchApp or http');
	      continue;
	    }
	
	    if (type === 'openWatchApp') {
	      if (!hasToolArgValue(source.launchCode)) {
	        errors.push('actions[' + i + '].launchCode is required for openWatchApp actions');
	      } else {
	        launchCode = optionalTimelineInteger(source.launchCode, 'actions[' + i + '].launchCode', 0, 2147483647, errors);
	        if (launchCode !== null) {
	          action.launchCode = launchCode;
	        }
	      }
	    } else if (type === 'http') {
	      action.url = common.trim(source.url);
	      if (!action.url) {
	        errors.push('actions[' + i + '].url is required for http actions');
	      }
	      action.method = common.trim(source.method || 'POST').toUpperCase();
	      if (!/^(GET|POST|PUT|DELETE)$/.test(action.method)) {
	        errors.push('actions[' + i + '].method must be GET, POST, PUT, or DELETE');
	      }
	      if (source.headers && typeof source.headers === 'object' && !isTimelineArray(source.headers)) {
	        action.headers = source.headers;
	      }
	      if (hasToolArgValue(source.bodyText)) {
	        action.bodyText = String(source.bodyText);
	      }
	      if (source.bodyJSON !== undefined && source.bodyJSON !== null && source.bodyJSON !== '') {
	        bodyJson = parseObjectArg(source.bodyJSON);
	        if (!bodyJson || typeof bodyJson !== 'object' || isTimelineArray(bodyJson)) {
	          errors.push('actions[' + i + '].bodyJSON must be an object');
	        } else {
	          action.bodyJSON = bodyJson;
	        }
	      }
	      if (action.bodyText && action.bodyJSON) {
	        errors.push('actions[' + i + '] cannot include both bodyText and bodyJSON');
	      }
	      if ((action.method === 'GET' || action.method === 'DELETE') && (action.bodyText || action.bodyJSON)) {
	        errors.push('actions[' + i + '] cannot include a body with GET or DELETE');
	      }
	      addTimelineStringField(action, 'successText', source.successText, 80);
	      addTimelineStringField(action, 'failureText', source.failureText, 80);
	      if (hasToolArgValue(source.successIcon)) {
	        action.successIcon = normalizeTimelineIcon(source.successIcon, 'GENERIC_CONFIRMATION');
	      }
	      if (hasToolArgValue(source.failureIcon)) {
	        action.failureIcon = normalizeTimelineIcon(source.failureIcon, 'RESULT_FAILED');
	      }
	    }
	
	    actions.push(action);
	  }
	
	  return actions;
	}
	
	function buildTimelinePin(args, options) {
	  var errors = [];
	  var pin;
	  var duration;
	  var reminders;
	  var actions;
	  var createNotification;
	  var updateNotification;
	  var validationError;
	
	  options = options || {};
	  args = parseObjectArg(args) || {};
	
	  if (typeof args !== 'object' || isTimelineArray(args)) {
	    return {
	      error: 'Timeline arguments must be an object'
	    };
	  }
	  validationError = validateTimelineArgShape(args, options.allowStoredReminders);
	  if (validationError) {
	    return {
	      error: validationError
	    };
	  }
	
	  pin = {
	    id: common.trim(args.id || args.pinId),
	    time: normalizeTimelineDateTime(firstTimelineValue(args, ['time', 'eventTime', 'pinTime'])),
	    layout: buildTimelinePinLayout(args, errors)
	  };
	
	  if (!pin.time) {
	    errors.push('time must be an ISO date-time, Unix seconds, or parseable date-time');
	  }
	
	  duration = optionalTimelineInteger(firstTimelineValue(args, ['durationMinutes', 'duration']), 'durationMinutes', 0, 1440, errors);
	  if (duration !== null) {
	    pin.duration = duration;
	  }
	
	  reminders = buildTimelineReminders(args, pin.time, options.forceReminder, errors, options.suppressReminder);
	  if (reminders.length) {
	    pin.reminders = reminders;
	  }
	
	  createNotification = buildTimelineNotification('createNotification', args);
	  if (createNotification) {
	    pin.createNotification = createNotification;
	  }
	  updateNotification = buildTimelineNotification('updateNotification', args);
	  if (updateNotification) {
	    pin.updateNotification = updateNotification;
	  }
	
	  actions = buildTimelineActions(args, errors);
	  if (actions.length) {
	    pin.actions = actions;
	  }
	
	  if (errors.length) {
	    return {
	      error: errors[0]
	    };
	  }
	
	  if (!pin.id) {
	    pin.id = generateTimelinePinId(args.title || args.reminderTitle);
	    if (!pin.id) {
	      return {
	        error: 'Unable to generate a unique Timeline pin id'
	      };
	    }
	  }
	
	  return {
	    pin: pin
	  };
	}
	
	function validateTimelinePin(pin) {
	  var layoutType;
	  var i;
	  var reminder;
	  var pinTimeMs;
	  var nowMs;
	
	  if (!pin || typeof pin !== 'object') {
	    return 'Pin must be an object';
	  }
	
	  pin.id = common.trim(pin.id);
	  if (!pin.id) {
	    return 'Pin id is required';
	  }
	  if (pin.id.length > 64) {
	    return 'Pin id must be 64 characters or fewer';
	  }
	  if (!common.trim(pin.time)) {
	    return 'Pin time is required';
	  }
	  pinTimeMs = Date.parse(pin.time);
	  if (!isFinite(pinTimeMs)) {
	    return 'Pin time is invalid';
	  }
	  nowMs = new Date().getTime();
	  if (pinTimeMs < nowMs - TIMELINE_MAX_PAST_MS) {
	    return 'Pin time cannot be more than 2 days in the past';
	  }
	  if (pinTimeMs > nowMs + TIMELINE_MAX_FUTURE_MS) {
	    return 'Pin time cannot be more than 1 year in the future';
	  }
	  if (!pin.layout || typeof pin.layout !== 'object') {
	    return 'Pin layout is required';
	  }
	  layoutType = common.trim(pin.layout.type);
	  if (!layoutType) {
	    return 'Pin layout.type is required';
	  }
	  if (!common.trim(pin.layout.title)) {
	    return 'Pin layout.title is required';
	  }
	  if (layoutType !== 'calendarPin' && !common.trim(pin.layout.tinyIcon)) {
	    return 'Pin layout.tinyIcon is required';
	  }
	  if (layoutType === 'weatherPin' && !common.trim(pin.layout.locationName)) {
	    return 'Pin layout.locationName is required for weatherPin';
	  }
	  if (pin.layout.headings && pin.layout.paragraphs && pin.layout.headings.length !== pin.layout.paragraphs.length) {
	    return 'Pin layout headings and paragraphs must match';
	  }
	
	  if (pin.reminders !== undefined) {
	    if (!isTimelineArray(pin.reminders)) {
	      return 'Pin reminders must be an array';
	    }
	    if (pin.reminders.length > 3) {
	      return 'Pin reminders can include at most 3 items';
	    }
	    for (i = 0; i < pin.reminders.length; i += 1) {
	      reminder = pin.reminders[i] || {};
	      if (!common.trim(reminder.time)) {
	        return 'Pin reminders[' + i + '].time is required';
	      }
	      if (!reminder.layout || typeof reminder.layout !== 'object') {
	        return 'Pin reminders[' + i + '].layout is required';
	      }
	      if (common.trim(reminder.layout.type) !== 'genericReminder') {
	        return 'Pin reminders[' + i + '].layout.type must be genericReminder';
	      }
	      if (!common.trim(reminder.layout.title)) {
	        return 'Pin reminders[' + i + '].layout.title is required';
	      }
	      if (!common.trim(reminder.layout.tinyIcon)) {
	        return 'Pin reminders[' + i + '].layout.tinyIcon is required';
	      }
	    }
	  }
	
	  return '';
	}
	
	function timelinePinRequest(method, id, pin, requestId, callback) {
	  var pebble = typeof Pebble !== 'undefined' ? Pebble : null;
	  var localMethod = method === 'DELETE' ? 'deleteTimelinePin' : 'insertTimelinePin';
	  var finished = false;
	
	  function finish(error, isLocal) {
	    if (finished) {
	      return;
	    }
	    finished = true;
	    callback(error, isLocal === true);
	  }
	
	  if (!watch.isCurrentRequest(requestId)) {
	    return;
	  }
	
	  if (pebble && typeof pebble[localMethod] === 'function') {
	    try {
	      if (method === 'DELETE') {
	        pebble.deleteTimelinePin(id);
	      } else {
	        pebble.insertTimelinePin(pin);
	      }
	    } catch (e) {
	      finish('Local Timeline API error: ' + (e && e.message ? e.message : String(e || 'unknown error')));
	      return;
	    }
	
	    if (!watch.isCurrentRequest(requestId)) {
	      return;
	    }
	
	    // These APIs are synchronous void calls; PebbleKit JS does not report
	    // whether the pin was subsequently delivered to the watch.
	    finish(null, true);
	    return;
	  }
	
	  getTimelineToken(function(tokenError, token) {
	
	    if (!watch.isCurrentRequest(requestId)) {
	      return;
	    }
	    if (tokenError) {
	      finish(tokenError);
	      return;
	    }
	
	    function retryDelay(request) {
	      var retryAfter = null;
	      var seconds;
	
	      try {
	        retryAfter = request.getResponseHeader('Retry-After');
	      } catch (e) {}
	      seconds = parseFloat(retryAfter);
	      if (!isNaN(seconds) && seconds >= 0) {
	        return Math.min(seconds * 1000, common.MAX_RETRY_AFTER_MS || 5000);
	      }
	      return TIMELINE_RETRY_DELAY_MS;
	    }
	
	    function retry(attempt, delay) {
	      setTimeout(function() {
	        if (watch.isCurrentRequest(requestId)) {
	          sendAttempt(attempt + 1);
	        }
	      }, delay);
	    }
	
	    function sendAttempt(attempt) {
	      var request = new XMLHttpRequest();
	
	      request.open(method, TIMELINE_API_BASE + encodeURIComponent(id), true);
	      request.setRequestHeader('X-User-Token', token);
	      if (pin) {
	        request.setRequestHeader('Content-Type', 'application/json');
	      }
	      request.timeout = 30000;
	
	      if (!watch.trackXhr(requestId, request)) {
	        return;
	      }
	
	      request.onload = function() {
	        var responseText = String(request.responseText || '');
	        var retryable = request.status === 408 || request.status === 429 || request.status >= 500;
	
	        watch.untrackXhr(requestId, request);
	        if (!watch.isCurrentRequest(requestId)) {
	          return;
	        }
	        if (retryable && attempt === 0) {
	          common.logDebug('timeline retry status=' + request.status);
	          retry(attempt, retryDelay(request));
	          return;
	        }
	        if (method === 'DELETE' && attempt > 0 && request.status === 404) {
	          finish(null, false);
	          return;
	        }
	        if (request.status < 200 || request.status >= 300) {
	          finish('Timeline HTTP ' + request.status + ': ' + responseText.substring(0, 180));
	          return;
	        }
	
	        finish(null, false);
	      };
	
	      request.onerror = function() {
	        watch.untrackXhr(requestId, request);
	        if (!watch.isCurrentRequest(requestId)) {
	          return;
	        }
	        if (attempt === 0) {
	          common.logDebug('timeline retry network error');
	          retry(attempt, TIMELINE_RETRY_DELAY_MS);
	          return;
	        }
	        finish('Timeline network error');
	      };
	
	      request.ontimeout = function() {
	        watch.untrackXhr(requestId, request);
	        if (!watch.isCurrentRequest(requestId)) {
	          return;
	        }
	        if (attempt === 0) {
	          common.logDebug('timeline retry timeout');
	          retry(attempt, TIMELINE_RETRY_DELAY_MS);
	          return;
	        }
	        finish('Timeline request timed out');
	      };
	
	      request.onabort = function() {
	        watch.untrackXhr(requestId, request);
	      };
	
	      request.send(pin ? JSON.stringify(pin) : null);
	    }
	
	    sendAttempt(0);
	  });
	}
	
	function extractTimelinePinId(args) {
	  args = parseObjectArg(args) || {};
	  if (args.id !== undefined) {
	    return common.trim(args.id);
	  }
	  if (args.pinId !== undefined) {
	    return common.trim(args.pinId);
	  }
	  if (args.pin_id !== undefined) {
	    return common.trim(args.pin_id);
	  }
	  if (args.pin && args.pin.id !== undefined) {
	    return common.trim(args.pin.id);
	  }
	
	  return '';
	}
	
	function cloneTimelineValue(value) {
	  try {
	    return JSON.parse(JSON.stringify(value));
	  } catch (e) {
	    return null;
	  }
	}
	
	function buildTimelineSuccessResult(pin, editable, warning, isLocal) {
	  var payload = {
	    status: isLocal ? 'accepted' : 'success',
	    id: pin.id,
	    title: pin.layout && pin.layout.title ? String(pin.layout.title) : '',
	    time: pin.time,
	    editable: !!editable
	  };
	  if (isLocal) {
	    payload.deliveryAcknowledged = false;
	    payload.message = 'Local Timeline API call completed; watch delivery is not acknowledged.';
	  }
	  if (warning) {
	    payload.warning = warning;
	  }
	  return common.safeJson(payload);
	}
	
	function buildTimelineDeleteResult(id, warning, isLocal) {
	  var payload = {
	    status: isLocal ? 'accepted' : 'deleted',
	    id: id
	  };
	  if (isLocal) {
	    payload.deliveryAcknowledged = false;
	    payload.message = 'Local Timeline API call completed; watch delivery is not acknowledged.';
	  }
	  if (warning) {
	    payload.warning = warning;
	  }
	  return common.safeJson(payload);
	}
	
	function saveTimelineRecord(kind, pin, args) {
	  var argsClone = cloneTimelineValue(args) || {};
	  argsClone.id = pin.id;
	  try {
	    return timelineStore.saveTimelinePin(pin.id, kind, pin, argsClone);
	  } catch (e) {
	    return false;
	  }
	}
	
	function finishTimelineSave(kind, pin, args, callback, isLocal) {
	  var editable = saveTimelineRecord(kind, pin, args);
	  var warnings = [];
	  var warning = '';
	
	  if (isLocal && (pin.createNotification || pin.updateNotification)) {
	    warnings.push('Local pins ignore createNotification/updateNotification; no notification was created.');
	  }
	
	  if (!editable) {
	    warnings.push('Pin saved but storage failed; not editable');
	    common.logDebug('timeline store save failed id=' + pin.id);
	  }
	  if (warnings.length) {
	    warning = common.truncate(warnings.join(' '), TIMELINE_RESULT_WARNING_MAX_CHARS);
	  }
	  releaseTimelinePinId(pin.id);
	  callback(null, buildTimelineSuccessResult(pin, editable, warning, isLocal));
	}
	
	function callTimelineCreateBuiltin(kind, args, requestId, callback) {
	  var idError = timelineCreationIdError(args);
	  var built;
	  var pin;
	  var validationError;
	  var argsForStore;
	
	  if (idError) {
	    callback(idError);
	    return;
	  }
	  built = buildTimelinePin(args, { forceReminder: kind === 'reminder' });
	  if (built.error) {
	    callback(built.error);
	    return;
	  }
	
	  pin = built.pin;
	  validationError = validateTimelinePin(pin);
	
	  if (validationError) {
	    releaseTimelinePinId(pin.id);
	    callback(validationError);
	    return;
	  }
	
	  argsForStore = cloneTimelineValue(args) || {};
	  argsForStore.id = pin.id;
	
	  timelinePinRequest('PUT', pin.id, pin, requestId, function(error, isLocal) {
	    if (error) {
	      releaseTimelinePinId(pin.id);
	      callback(error);
	      return;
	    }
	    finishTimelineSave(kind, pin, argsForStore, callback, isLocal);
	  });
	}
	
	function callTimelineCreatePinBuiltin(args, requestId, callback) {
	  callTimelineCreateBuiltin('pin', args, requestId, callback);
	}
	
	function callTimelineReminderBuiltin(args, requestId, callback) {
	  callTimelineCreateBuiltin('reminder', args, requestId, callback);
	}
	
	function callTimelineDeleteBuiltin(args, requestId, callback) {
	  var id = extractTimelinePinId(args);
	  var stored;
	
	  if (!id) {
	    callback('Pin id is required');
	    return;
	  }
	  if (id.length > 64) {
	    callback('Pin id must be 64 characters or fewer');
	    return;
	  }
	
	  try {
	    stored = timelineStore.getTimelinePin(id);
	  } catch (e) {
	    stored = null;
	  }
	
	  timelinePinRequest('DELETE', id, null, requestId, function(error, isLocal) {
	    var removed = false;
	    var warning = '';
	
	    if (error) {
	      callback(error);
	      return;
	    }
	    try {
	      removed = timelineStore.removeTimelinePin(id);
	    } catch (e) {}
	    if (stored && !removed) {
	      warning = 'Pin deleted but stored edit record could not be removed';
	      common.logDebug('timeline store remove failed id=' + id);
	    }
	    callback(null, buildTimelineDeleteResult(id, warning, isLocal));
	  });
	}
	
	function callTimelineListBuiltin(args, requestId, callback) {
	  var pins = [];
	  var items = [];
	  var fingerprintParts = [];
	  var i;
	  var pin;
	  var rawTitle;
	  var rawTime;
	  var title;
	  var time;
	  var page;
	  try {
	    pins = timelineStore.listTimelinePins();
	  } catch (e) {
	    pins = [];
	  }
	  pins.sort(function(a, b) {
	    var aUpdated = a && typeof a.updatedAt === 'number' ? a.updatedAt : 0;
	    var bUpdated = b && typeof b.updatedAt === 'number' ? b.updatedAt : 0;
	    var aId = String(a && a.id || '');
	    var bId = String(b && b.id || '');
	    if (bUpdated !== aUpdated) { return bUpdated - aUpdated; }
	    return aId < bId ? -1 : (aId > bId ? 1 : 0);
	  });
	  for (i = 0; i < pins.length; i += 1) {
	    pin = pins[i] || {};
	    rawTitle = typeof pin.title === 'string' ? pin.title : String(pin.title || '');
	    rawTime = typeof pin.time === 'string' ? pin.time : String(pin.time || '');
	    fingerprintParts.push(String(pin.id || ''), String(pin.kind || ''), rawTitle, rawTime,
	      String(pin.createdAt || 0), String(pin.updatedAt || 0));
	    title = boundedTimelineField(rawTitle, 384);
	    time = boundedTimelineField(rawTime, 128);
	    items.push({
	      id: String(pin.id || '').substring(0, 64),
	      kind: pin.kind === 'reminder' ? 'reminder' : 'pin',
	      title: title.value,
	      titleTruncated: title.truncated,
	      time: time.value,
	      timeTruncated: time.truncated,
	      createdAt: typeof pin.createdAt === 'number' && isFinite(pin.createdAt) ? pin.createdAt : 0,
	      updatedAt: typeof pin.updatedAt === 'number' && isFinite(pin.updatedAt) ? pin.updatedAt : 0
	    });
	  }
	  items.sort(function(a, b) {
	    if (b.updatedAt !== a.updatedAt) { return b.updatedAt - a.updatedAt; }
	    return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
	  });
	  page = toolPagination.paginate(items, {
	    scope: 'timeline_list',
	    query: '',
	    datasetHash: toolPagination.hashParts(fingerprintParts),
	    cursor: args && args.cursor,
	    limit: args && args.limit,
	    defaultLimit: 5,
	    maxLimit: 64
	  });
	  if (page.error) { callback(page.error); return; }
	  callback(null, common.safeJson(page.value));
	}
	
	function boundedTimelineField(value, maximum) {
	  var text = typeof value === 'string' ? value : String(value || '');
	  var clipped;
	  if (text.length <= maximum) { return { value: text, truncated: false }; }
	  clipped = text.substring(0, maximum);
	  if (clipped.length && clipped.charCodeAt(clipped.length - 1) >= 0xd800 && clipped.charCodeAt(clipped.length - 1) <= 0xdbff) {
	    clipped = clipped.substring(0, clipped.length - 1);
	  }
	  return { value: clipped, truncated: true };
	}
	
	function clearTimelineReminderScheduleArgs(args) {
	  delete args.reminderTime;
	  delete args.remindMinutesBefore;
	  delete args.minutesBefore;
	  delete args.reminders;
	}
	
	function callTimelineEditBuiltin(args, requestId, callback) {
	  var id = common.trim(args && args.id);
	  var stored;
	  var mergedArgs;
	  var allowedFields = ['title', 'time', 'durationMinutes', 'pinType', 'subtitle', 'body', 'locationName', 'icon', 'pinIcon', 'reminderTime', 'remindMinutesBefore', 'reminderTitle', 'reminderIcon', 'createNotificationTitle', 'createNotificationBody'];
	  var i;
	  var key;
	  var forceReminder;
	  var hasNewReminderTime;
	  var hasNewMinutesBefore;
	  var clearReminder;
	  var reminderRemoved;
	  var built;
	  var pin;
	  var validationError;
	  var argsForStore;
	
	  if (!id) {
	    callback('Missing required tool argument: id');
	    return;
	  }
	  if (id.length > 64) {
	    callback('Pin id must be 64 characters or fewer');
	    return;
	  }
	
	  try {
	    stored = timelineStore.getTimelinePin(id);
	  } catch (e) {
	    stored = null;
	  }
	  if (!stored) {
	    callback('Unknown pin id: ' + id + '. Use pebble_timeline_list_pins to find editable pins.');
	    return;
	  }
	
	  hasNewReminderTime = hasToolArgValue(args.reminderTime);
	  hasNewMinutesBefore = hasToolArgValue(firstTimelineValue(args, ['minutesBefore', 'remindMinutesBefore']));
	  clearReminder = args.clearReminder === true;
	  if (args.clearReminder !== undefined && typeof args.clearReminder !== 'boolean') {
	    callback('clearReminder must be a boolean');
	    return;
	  }
	  if (hasNewReminderTime && hasNewMinutesBefore) {
	    callback('Use either reminderTime or remindMinutesBefore, not both');
	    return;
	  }
	  if (clearReminder && (hasNewReminderTime || hasNewMinutesBefore)) {
	    callback('clearReminder cannot be combined with reminderTime or remindMinutesBefore');
	    return;
	  }
	
	  mergedArgs = cloneTimelineValue(stored.args) || {};
	  for (i = 0; i < allowedFields.length; i += 1) {
	    key = allowedFields[i];
	    if (hasOwn(args, key)) {
	      if ((key === 'reminderTime' || key === 'remindMinutesBefore') && !hasToolArgValue(args[key])) {
	        continue;
	      }
	      mergedArgs[key] = cloneTimelineValue(args[key]);
	      if (mergedArgs[key] === null && args[key] !== null) {
	        mergedArgs[key] = args[key];
	      }
	    }
	  }
	
	  if (clearReminder) {
	    clearTimelineReminderScheduleArgs(mergedArgs);
	    mergedArgs._timelineReminderRemoved = true;
	  } else if (hasNewReminderTime) {
	    delete mergedArgs.remindMinutesBefore;
	    delete mergedArgs.minutesBefore;
	    delete mergedArgs.reminders;
	    delete mergedArgs._timelineReminderRemoved;
	  } else if (hasNewMinutesBefore) {
	    delete mergedArgs.reminderTime;
	    delete mergedArgs.minutesBefore;
	    delete mergedArgs.reminders;
	    delete mergedArgs._timelineReminderRemoved;
	  }
	  delete mergedArgs.clearReminder;
	
	  mergedArgs.id = stored.id;
	
	  reminderRemoved = mergedArgs._timelineReminderRemoved === true;
	  forceReminder = stored.kind === 'reminder' && !reminderRemoved;
	  built = buildTimelinePin(mergedArgs, {
	    forceReminder: forceReminder,
	    suppressReminder: reminderRemoved,
	    allowStoredReminders: true
	  });
	  if (built.error) {
	    callback(built.error);
	    return;
	  }
	  pin = built.pin;
	  pin.id = stored.id;
	  validationError = validateTimelinePin(pin);
	  if (validationError) {
	    callback(validationError);
	    return;
	  }
	
	  argsForStore = cloneTimelineValue(mergedArgs) || {};
	  argsForStore.id = pin.id;
	
	  timelinePinRequest('PUT', pin.id, pin, requestId, function(error, isLocal) {
	    if (error) {
	      callback(error);
	      return;
	    }
	    finishTimelineSave(stored.kind, pin, argsForStore, callback, isLocal);
	  });
	}
	
	function parseUnixTimeArg(value) {
	  var number;
	  var parsed;
	  var text;
	
	  if (value === undefined || value === null || value === '') {
	    return null;
	  }
	
	  if (typeof value === 'number') {
	    return Math.floor(value > 100000000000 ? value / 1000 : value);
	  }
	
	  text = common.trim(value);
	  if (!text) {
	    return null;
	  }
	
	  if (/^[0-9]+$/.test(text)) {
	    number = parseInt(text, 10);
	    return Math.floor(number > 100000000000 ? number / 1000 : number);
	  }
	
	  parsed = Date.parse(text);
	  if (isNaN(parsed)) {
	    return null;
	  }
	
	  return Math.floor(parsed / 1000);
	}
	
	function localDayStartUnix(offsetDays) {
	  var now = new Date();
	  var date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
	
	  return Math.floor(date.getTime() / 1000);
	}
	
	function buildHealthInfoWindow(args) {
	  var now = Math.floor(new Date().getTime() / 1000);
	  var range;
	  var startUnix;
	  var endUnix;
	
	  args = args || {};
	  range = common.trim(args.range || args.timeRange || 'today').toLowerCase().replace(/[-\s]+/g, '_');
	
	  if (range === 'custom' || args.startTime !== undefined || args.startUnix !== undefined || args.endTime !== undefined || args.endUnix !== undefined) {
	    startUnix = parseUnixTimeArg(args.startUnix !== undefined ? args.startUnix : args.startTime);
	    endUnix = parseUnixTimeArg(args.endUnix !== undefined ? args.endUnix : args.endTime);
	    if (startUnix === null) {
	      return { error: 'startTime or startUnix is required for custom health ranges' };
	    }
	    if (endUnix === null) {
	      endUnix = now;
	    }
	  } else if (range === 'today') {
	    startUnix = localDayStartUnix(0);
	    endUnix = now;
	  } else if (range === 'yesterday') {
	    startUnix = localDayStartUnix(-1);
	    endUnix = localDayStartUnix(0);
	  } else if (range === 'last_24h' || range === 'last_24_hours') {
	    startUnix = now - 24 * 60 * 60;
	    endUnix = now;
	  } else if (range === 'last_7d' || range === 'last_7_days' || range === 'week') {
	    startUnix = now - MAX_HEALTH_RANGE_SECONDS;
	    endUnix = now;
	  } else {
	    return { error: 'Unsupported health range: ' + range };
	  }
	
	  if (endUnix > now) {
	    endUnix = now;
	  }
	  if (endUnix <= 0 || startUnix < 0 || startUnix >= endUnix) {
	    return { error: 'Invalid health time range' };
	  }
	  if (endUnix - startUnix > MAX_HEALTH_RANGE_SECONDS) {
	    return { error: 'Health range cannot exceed 7 days' };
	  }
	
	  return {
	    startUnix: startUnix,
	    endUnix: endUnix
	  };
	}
	
	function healthMetricValue(response, metric) {
	  var result = {};
	  var value;
	
	  if (metric === 'heart_rate') {
	    if (response.heartRateCurrentBPM !== undefined) { result.currentBpm = response.heartRateCurrentBPM; }
	    if (response.heartRateAverageBPM !== undefined) { result.averageBpm = response.heartRateAverageBPM; }
	    if (response.heartRateMinBPM !== undefined) { result.minBpm = response.heartRateMinBPM; }
	    if (response.heartRateMaxBPM !== undefined) { result.maxBpm = response.heartRateMaxBPM; }
	    return Object.keys(result).length ? result : undefined;
	  }
	  if (!HEALTH_METRIC_MAP[metric]) { return undefined; }
	  value = response[HEALTH_METRIC_MAP[metric].responseField];
	  if (value !== undefined && value !== null) {
	    return value;
	  }
	  return undefined;
	}
	
	function healthValues(response, metrics) {
	  var values = {};
	  var metric;
	  var value;
	  var heartRate;
	  var i;
	
	  for (i = 0; i < metrics.length; i += 1) {
	    metric = metrics[i];
	    value = healthMetricValue(response, metric);
	    if (value === undefined) { continue; }
	    if (metric === 'heart_rate') {
	      heartRate = value;
	    } else {
	      values[HEALTH_METRIC_MAP[metric].outputField] = value;
	    }
	  }
	  if (heartRate) { values.heartRate = heartRate; }
	  return values;
	}
	
	function healthUnavailable(response, metrics, scope) {
	  var result = [];
	  var metric;
	  var bit;
	  var reason;
	  var i;
	
	  for (i = 0; i < metrics.length; i += 1) {
	    metric = metrics[i];
	    bit = HEALTH_METRIC_MAP[metric] && HEALTH_METRIC_MAP[metric].bit;
	    reason = '';
	    if (bit && (Number(response.unp) & bit)) { reason = 'permission_denied'; }
	    else if (bit && (Number(response.uns) & bit)) { reason = 'not_supported'; }
	    else if (bit && (Number(response.und) & bit)) { reason = 'no_data'; }
	    if (reason) {
	      result.push({ metric: metric, reason: reason, scope: scope });
	    }
	  }
	  return result;
	}
	
	function healthDayBuckets(startUnix, endUnix) {
	  var start = new Date(startUnix * 1000);
	  var cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
	  var result = [];
	  var next;
	
	  while (cursor.getTime() / 1000 < endUnix) {
	    next = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
	    result.push({
	      startUnix: Math.max(startUnix, Math.floor(cursor.getTime() / 1000)),
	      endUnix: Math.min(endUnix, Math.floor(next.getTime() / 1000))
	    });
	    cursor = next;
	  }
	  return result;
	}
	
	function healthHourBuckets(startUnix, endUnix) {
	  var result = [];
	  var cursor = startUnix;
	  while (cursor < endUnix) {
	    result.push({ startUnix: cursor, endUnix: Math.min(endUnix, cursor + 60 * 60) });
	    cursor += 60 * 60;
	  }
	  return result;
	}
	
	function callHealthInfoBuiltin(args, requestId, callback) {
	  var scalarMetrics = [];
	  var sessionMetrics = [];
	  var range;
	  var granularity;
	  var baseline;
	  var buckets;
	  var queries = [];
	  var responses = [];
	  var sessions = [];
	  var truncated = false;
	  var totalMask = 0;
	  var sessionMask = 0;
	  var i;
	  var j;
	  var metric;
	  var query;
	
	  args = args || {};
	  if (!isArrayValue(args.metrics) || !args.metrics.length) {
	    callback('metrics must be a nonempty array');
	    return;
	  }
	  for (i = 0; i < args.metrics.length; i += 1) {
	    metric = args.metrics[i];
	    if (typeof metric !== 'string' || !HEALTH_METRIC_MAP[metric]) {
	      callback('metrics must contain supported metric strings');
	      return;
	    }
	    if (args.metrics.indexOf(metric) !== i) {
	      callback('metrics must contain unique values');
	      return;
	    }
	    if (metric === 'activity_sessions' || metric === 'sleep_sessions') { sessionMetrics.push(metric); }
	    else { scalarMetrics.push(metric); totalMask |= HEALTH_METRIC_MAP[metric].bit; }
	  }
	  range = buildHealthInfoWindow(args);
	  if (range.error) { callback(range.error); return; }
	  granularity = args.granularity || 'total';
	  if (['total', 'hour', 'day'].indexOf(granularity) < 0) { callback('granularity must be total, hour, or day'); return; }
	  baseline = args.baseline || 'none';
	  if (['none', 'daily', 'weekday_or_weekend', 'same_weekday'].indexOf(baseline) < 0) { callback('baseline must be none, daily, weekday_or_weekend, or same_weekday'); return; }
	  if (granularity === 'hour' && range.endUnix - range.startUnix > MAX_HEALTH_HOUR_RANGE_SECONDS) {
	    callback('Hour granularity cannot exceed 24 hours');
	    return;
	  }
	
	  for (i = 0; i < sessionMetrics.length; i += 1) { sessionMask |= HEALTH_METRIC_MAP[sessionMetrics[i]].bit; }
	  if (scalarMetrics.length) { queries.push({ kind: 'total', startUnix: range.startUnix, endUnix: range.endUnix, queryMask: totalMask, averageScope: 0 }); }
	  if (sessionMetrics.length) { queries.push({ kind: 'current', startUnix: range.startUnix, endUnix: range.endUnix, queryMask: 256, averageScope: 0 }); }
	  if (granularity !== 'total' && scalarMetrics.length) {
	    buckets = granularity === 'hour' ? healthHourBuckets(range.startUnix, range.endUnix) : healthDayBuckets(range.startUnix, range.endUnix);
	    if (buckets.length * scalarMetrics.length > MAX_HEALTH_BUCKET_VALUES) {
	      callback('Health Info request has too many bucket values; request fewer metrics or coarser granularity');
	      return;
	    }
	    for (i = 0; i < buckets.length; i += 1) {
	      queries.push({ kind: 'bucket', bucket: buckets[i], startUnix: buckets[i].startUnix, endUnix: buckets[i].endUnix, queryMask: totalMask, averageScope: 0 });
	    }
	  }
	  if (baseline !== 'none' && scalarMetrics.length) {
	    queries.push({ kind: 'baseline', startUnix: range.startUnix, endUnix: range.endUnix, queryMask: totalMask, averageScope: { daily: 1, weekday_or_weekend: 2, same_weekday: 3 }[baseline] });
	  }
	  if (sessionMetrics.length) {
	    queries.push({ kind: 'sessions', startUnix: range.startUnix, endUnix: range.endUnix, queryMask: sessionMask, averageScope: 0, sessionOffset: 0 });
	  }
	
	  function finish() {
	    var result = {
	      startTime: new Date(range.startUnix * 1000).toISOString(),
	      endTime: new Date(range.endUnix * 1000).toISOString(),
	      timezoneOffsetMinutes: -new Date(range.startUnix * 1000).getTimezoneOffset(),
	      granularity: granularity,
	      totals: {},
	      unavailable: []
	    };
	    var response;
	    var item;
	    var values;
	    for (i = 0; i < responses.length; i += 1) {
	      response = responses[i].response;
	      values = healthValues(response, scalarMetrics);
	      if (responses[i].kind === 'total') { result.totals = values; }
	      if (responses[i].kind === 'baseline') {
	        result.baseline = { scope: baseline, values: values };
	        item = healthUnavailable(response, responses[i].metrics);
	        if (item.length) { result.baseline.unavailable = item; }
	      }
	      if (responses[i].kind === 'bucket') {
	        if (!result.buckets) { result.buckets = []; }
	        item = { startTime: new Date(responses[i].startUnix * 1000).toISOString(), endTime: new Date(responses[i].endUnix * 1000).toISOString(), values: values };
	        item.unavailable = healthUnavailable(response, responses[i].metrics);
	        if (!item.unavailable.length) { delete item.unavailable; }
	        result.buckets.push(item);
	      }
	      if (responses[i].kind === 'total' || responses[i].kind === 'current' || responses[i].kind === 'sessions') {
	        result.unavailable = result.unavailable.concat(healthUnavailable(response, responses[i].metrics));
	      }
	      if ((responses[i].kind === 'total' || responses[i].kind === 'current') && response.currentActivities !== undefined && response.currentActivities !== null) {
	        result.currentActivities = String(response.currentActivities).split(',').filter(function(name) { return common.trim(name); }).map(function(name) { return common.trim(name); });
	      }
	    }
	    if (sessions.length) {
	      result.sessions = [];
	      for (i = 0; i < sessions.length; i += 1) {
	        item = sessions[i];
	        result.sessions.push({ type: HEALTH_ACTIVITY_TYPES[item[0]] || 'unknown', startTime: new Date(item[1] * 1000).toISOString(), endTime: new Date(item[2] * 1000).toISOString(), durationSeconds: item[2] - item[1] });
	      }
	    }
	    if (truncated) { result.truncated = true; }
	    while (JSON.stringify(result).length > 5800 && result.sessions && result.sessions.length) { result.sessions.pop(); result.truncated = true; }
	    if (!scalarMetrics.length) { delete result.totals; }
	    if (!result.unavailable.length) { delete result.unavailable; }
	    if (JSON.stringify(result).length > 5800) {
	      callback('Health Info result exceeds tool result limit');
	      return;
	    }
	    callback(null, JSON.stringify(result));
	  }
	
	  function runNext(index) {
	    if (!watch.isCurrentRequest(requestId)) { return; }
	    if (index >= queries.length) { finish(); return; }
	    query = queries[index];
	    watch.requestHealthInfo({ startUnix: query.startUnix, endUnix: query.endUnix, queryMask: query.queryMask, averageScope: query.averageScope, sessionOffset: query.sessionOffset || 0 }, requestId, function(error, jsonString) {
	      var parsed;
	      var page;
	      if (!watch.isCurrentRequest(requestId)) { return; }
	      if (error) { callback(error); return; }
	      try { parsed = JSON.parse(jsonString); } catch (e) { callback('Malformed health info response JSON'); return; }
	      if (!parsed || typeof parsed !== 'object') { callback('Malformed health info response JSON'); return; }
	      if (query.kind === 'sessions') {
	        page = isArrayValue(parsed.sessions) ? parsed.sessions : [];
	        responses.push({ kind: query.kind, metrics: sessionMetrics, startUnix: query.startUnix, endUnix: query.endUnix, response: parsed });
	        for (j = 0; j < page.length && sessions.length < MAX_HEALTH_SESSIONS; j += 1) { if (isArrayValue(page[j]) && page[j].length >= 3) { sessions.push(page[j]); } }
	        if (j < page.length) { truncated = true; }
	        if (parsed.hasMore && sessions.length < MAX_HEALTH_SESSIONS && page.length) { query.sessionOffset += page.length; runNext(index); return; }
	        if (parsed.hasMore) { truncated = true; }
	      } else {
	        responses.push({ kind: query.kind, metrics: scalarMetrics, startUnix: query.startUnix, endUnix: query.endUnix, response: parsed });
	      }
	      runNext(index + 1);
	    });
	  }
	
	  runNext(0);
	}
	
	function callMemorySaveBuiltin(args, requestId, callback) {
	  var memory = memoryStore.addMemory(args.text);
	  if (!memory) { callback('Unable to save memory'); return; }
	  callback(null, JSON.stringify({ status: 'saved', memory: memory }));
	}
	
	function callMemorySearchBuiltin(args, requestId, callback) {
	  var query = args && typeof args.query === 'string' ? args.query : '';
	  var limit = args && args.limit !== undefined ? args.limit : undefined;
	  var normalizedQuery = query.trim().toLowerCase();
	  var memories = memoryStore.searchMemories(query, memoryStore.MAX_SEARCH_RESULTS);
	  var fingerprintParts = [];
	  var i;
	  var page;
	  for (i = 0; i < memories.length; i += 1) {
	    fingerprintParts.push(memories[i].id, memories[i].text, memories[i].createdAt, memories[i].updatedAt);
	  }
	  page = toolPagination.paginate(memories, {
	    scope: 'memory_search',
	    query: normalizedQuery,
	    datasetHash: toolPagination.hashParts(fingerprintParts),
	    cursor: args && args.cursor,
	    limit: limit,
	    defaultLimit: 4,
	    maxLimit: memoryStore.MAX_SEARCH_RESULTS
	  });
	  if (page.error) { callback(page.error); return; }
	  callback(null, JSON.stringify(page.value));
	}
	
	function callMemoryDeleteBuiltin(args, requestId, callback) {
	  var id = args && typeof args.id === 'string' ? args.id.trim() : '';
	  if (!id) { callback('Memory id is required'); return; }
	  if (!memoryStore.deleteMemory(id)) { callback('Memory not found or could not be deleted'); return; }
	  callback(null, JSON.stringify({ status: 'deleted', id: id }));
	}
	
	function callSleepBuiltin(args, requestId, callback) {
	  var milliseconds = args && typeof args.milliseconds === 'number' ? args.milliseconds : 0;
	
	  setTimeout(function() {
	    if (!watch.isCurrentRequest(requestId)) { return; }
	    callback(null, JSON.stringify({ status: 'slept', milliseconds: milliseconds }));
	  }, milliseconds);
	}
	
	function addBuiltinTool(tools, toolMap, definition) {
	  var baseName = definition.name;
	  var exposedName = baseName;
	  var suffix = 2;
	
	while (hasOwn(toolMap, exposedName)) {
	      exposedName = baseName + '_' + suffix;
	      suffix += 1;
	    }
	
	  tools.push({
	    name: exposedName,
	    description: definition.description,
	    parameters: definition.parameters
	  });
	  toolMap[exposedName] = {
	    kind: 'builtin',
	    name: exposedName,
	    builtinName: baseName,
	    executionClass: definition.executionClass || TOOL_EXECUTION_SERIAL,
	    structuredResult: definition.structuredResult !== false,
	    label: definition.label,
	    parameters: definition.parameters,
	    validate: typeof definition.validate === 'function' ? definition.validate : null,
	    logArguments: definition.logArguments !== false,
	    call: definition.call
	  };
	  common.logDebug('builtin tool exposed=' + exposedName);
	}
	
	function addBuiltinTools(settings, tools, toolMap) {
	  if (settings.PebbleMemoryToolEnabled) {
	    addBuiltinTool(tools, toolMap, {
	      name: 'pebble_memory_save',
	      label: 'Memory',
	      description: 'Save an intentional user note for later recall. Use only when the user explicitly asks to remember or save something, never for inferred facts or ordinary conversation.',
	      parameters: {
	        type: 'object',
	        additionalProperties: false,
	        required: ['text'],
	        properties: { text: { type: 'string', maxLength: 500, description: 'Text the user explicitly asked to remember.' } }
	      },
	      call: callMemorySaveBuiltin
	    });
	    addBuiltinTool(tools, toolMap, {
	      name: 'pebble_memory_search',
	      label: 'Memory',
	      description: 'Search intentional notes saved by the user. Search when a prior intentional note may help answer the request; omit query to list recent notes. Results are paged; continue with nextCursor until hasMore is false.',
	      parameters: {
	        type: 'object',
	        additionalProperties: false,
	        properties: {
	          query: { type: 'string', maxLength: 500, description: 'Optional text to find in saved notes.' },
	          limit: { type: 'integer', minimum: 1, maximum: 32, description: 'Optional page size. Defaults to 4.' },
	          cursor: { type: 'string', maxLength: 512, description: 'Opaque cursor from previous page for same query.' }
	        }
	      },
	      call: callMemorySearchBuiltin
	    });
	    addBuiltinTool(tools, toolMap, {
	      name: 'pebble_memory_delete',
	      label: 'Memory',
	      description: 'Delete one saved intentional note by its exact id.',
	      parameters: {
	        type: 'object',
	        additionalProperties: false,
	        required: ['id'],
	        properties: { id: { type: 'string', maxLength: 64, description: 'Exact saved memory id.' } }
	      },
	      call: callMemoryDeleteBuiltin
	    });
	  }
	  if (settings.WebSearchEnabled) {
	    addBuiltinTool(tools, toolMap, {
	      name: 'web_fetch',
	      structuredResult: false,
	      executionClass: TOOL_EXECUTION_INDEPENDENT_READ,
	      label: 'Web Fetch',
	      description: 'Fetch and read an HTTP(S) web page as Markdown. Use offset and limit character ranges; fetch pages in chunks when needed. Do not assume content outside returned range.',
	      parameters: {
	        type: 'object',
	        additionalProperties: false,
	        required: ['url'],
	        properties: {
	          url: { type: 'string', maxLength: 2048, description: 'HTTP(S) page URL.' },
	          offset: { type: 'integer', minimum: 0, maximum: 500000, description: 'Character offset in final Markdown. Default 0.' },
	          limit: { type: 'integer', minimum: 1, maximum: 6000, description: 'Maximum returned Markdown characters. Default 3000.' }
	        }
	      },
	      call: function(args, requestId, callback) { webFetch.fetch(args, requestId, watch, callback); }
	    });
	  }
	  if (settings.SleepToolEnabled) {
	    addBuiltinTool(tools, toolMap, {
	      name: 'sleep',
	      label: 'Sleep',
	      description: 'Wait for the requested number of milliseconds before continuing. Use when a task needs time to finish or the user asks to wait. Maximum 60000 milliseconds per call.',
	      parameters: {
	        type: 'object',
	        additionalProperties: false,
	        required: ['milliseconds'],
	        properties: {
	          milliseconds: { type: 'integer', minimum: 0, maximum: 60000, description: 'Wait duration in milliseconds, from 0 to 60000.' }
	        }
	      },
	      call: callSleepBuiltin
	    });
	  }
	  if (settings.GeolocationToolEnabled) {
	    addBuiltinTool(tools, toolMap, {
	      name: 'pebble_get_location',
	      label: 'Geolocation',
	      description: 'Get the phone current geolocation. Use only when user request needs current location.',
	      parameters: {
	        type: 'object',
	        additionalProperties: false,
	        properties: {
	          enableHighAccuracy: { type: 'boolean', description: 'Use GPS/high accuracy when available. Default false.' },
	          timeoutMs: { type: 'integer', minimum: 1000, maximum: 60000, description: 'Maximum wait time in milliseconds. Default 10000.' },
	          maximumAgeMs: { type: 'integer', minimum: 0, maximum: 3600000, description: 'Accept cached location up to this age in milliseconds. Default 300000.' }
	        }
	      },
	      call: callGeolocationBuiltin
	    });
	  }
	
	  if (settings.TimelineToolEnabled) {
	    addBuiltinTool(tools, toolMap, {
	      name: 'pebble_timeline_create_reminder',
	      label: 'Timeline',
	      description: 'Create a new Pebble timeline pin with a scheduled reminder notification attached to the pin. Use for reminder and "remind me" requests; use pebble_timeline_create_pin for events without a reminder. Each call generates a new id; do not supply an id. For an existing pin, use pebble_timeline_list_pins then pebble_timeline_edit_pin. Set reminderTime for an exact notification time, remindMinutesBefore for a relative time (0 means at pin time), or omit both to use time. This does not create an OS/system alarm. Result includes id; editable indicates whether future edits are available. Local acceptance does not confirm watch delivery.',
	      parameters: {
	        type: 'object',
	        additionalProperties: false,
	        properties: {
	          title: { type: 'string', description: 'Reminder/pin title shown on the watch.' },
	          time: { type: 'string', description: 'Pin time as ISO date-time with timezone, parseable date-time, or Unix seconds. Also the reminder notification time when neither reminder mode is supplied.' },
	          reminderTime: { type: 'string', description: 'Optional exact scheduled reminder notification time; omitted means time. Do not combine with remindMinutesBefore.' },
	          remindMinutesBefore: { type: 'integer', minimum: 0, maximum: 43200, description: 'Optional minutes before time for the scheduled reminder notification. Use instead of reminderTime for relative timing; 0 means at time.' },
	          durationMinutes: { type: 'integer', minimum: 0, maximum: 1440, description: 'Optional event duration in minutes.' },
	          body: { type: 'string', maxLength: 512, description: 'Optional detail text for the timeline pin.' },
	          locationName: { type: 'string', description: 'Optional location shown on the reminder.' },
	          pinIcon: { type: 'string', description: 'Optional Pebble icon name or URI for the pin. Default NOTIFICATION_REMINDER. Example: NOTIFICATION_REMINDER, ALARM_CLOCK, TIMELINE_CALENDAR.' },
	          reminderIcon: { type: 'string', description: 'Optional Pebble icon name or URI for the reminder. Default NOTIFICATION_REMINDER.' },
	          createNotificationTitle: { type: 'string', description: 'Optional create notification title for the legacy HTTP Timeline API only; ignored on local pins. This is not the scheduled reminder.' },
	          createNotificationBody: { type: 'string', maxLength: 512, description: 'Optional create notification body for the legacy HTTP Timeline API only; ignored on local pins.' }
	        },
	        required: ['title', 'time']
	      },
	      call: callTimelineReminderBuiltin
	    });
	    addBuiltinTool(tools, toolMap, {
	      name: 'pebble_timeline_create_pin',
	      label: 'Timeline',
	      description: 'Create a new Pebble timeline pin for calendar events, schedule items, or other non-reminder entries. Use pebble_timeline_create_reminder when user asks for a scheduled reminder alert. Each call generates a new id; do not supply an id. To change an existing pin, first find it with pebble_timeline_list_pins, then call pebble_timeline_edit_pin with its id. Use reminderTime or remindMinutesBefore only for an alert attached to this pin. Result includes id; editable indicates whether future edits are available. Local acceptance does not confirm watch delivery.',
	      parameters: {
	        type: 'object',
	        additionalProperties: false,
	        properties: {
	          time: { type: 'string', description: 'Pin event start time as ISO date-time with timezone, parseable date-time, or Unix seconds.' },
	          durationMinutes: { type: 'integer', minimum: 0, maximum: 1440, description: 'Optional event duration in minutes.' },
	          pinType: { type: 'string', enum: ['generic', 'calendar', 'sports', 'weather'], description: 'Kind of timeline pin. Default generic.' },
	          title: { type: 'string', description: 'Pin title shown on the watch.' },
	          subtitle: { type: 'string', description: 'Optional subtitle.' },
	          body: { type: 'string', maxLength: 512, description: 'Optional pin body text.' },
	          locationName: { type: 'string', description: 'Optional location. Required for weatherPin and useful for reminders/calendar pins.' },
	          icon: { type: 'string', description: 'Optional Pebble icon name or URI. Default NOTIFICATION_REMINDER except calendar pins. Example: NOTIFICATION_REMINDER, NOTIFICATION_FLAG, ALARM_CLOCK, TIMELINE_CALENDAR.' },
	          reminderTime: { type: 'string', description: 'Optional single scheduled reminder time. Creates reminders[0]. Do not combine with remindMinutesBefore.' },
	          remindMinutesBefore: { type: 'integer', minimum: 0, maximum: 43200, description: 'Optional minutes before pin time for a single scheduled reminder; 0 means at pin time.' },
	          reminderTitle: { type: 'string', description: 'Optional title for the single scheduled reminder. Defaults to title.' },
	          reminderIcon: { type: 'string', description: 'Optional icon for scheduled reminder. Default NOTIFICATION_REMINDER.' }
	        },
	        required: ['title', 'time']
	      },
	      call: callTimelineCreatePinBuiltin
	    });
	    addBuiltinTool(tools, toolMap, {
	      name: 'pebble_timeline_delete_pin',
	      label: 'Timeline',
	      description: 'Delete one of this app\'s Pebble timeline pins by id.',
	      parameters: {
	        type: 'object',
	        additionalProperties: false,
	        properties: {
	          id: { type: 'string', description: 'Pin id to delete.' }
	        },
	        required: ['id']
	      },
	      call: callTimelineDeleteBuiltin
	    });
	    addBuiltinTool(tools, toolMap, {
	      name: 'pebble_timeline_list_pins',
	      label: 'Timeline',
	      description: 'List Pebble timeline pins created by this app that can be edited. Pages include id, kind, title, time, and titleTruncated/timeTruncated flags. When hasMore is true, pass nextCursor for next page. Use a listed id with pebble_timeline_edit_pin to change a pin. No network request.',
	      parameters: {
	        type: 'object',
	        additionalProperties: false,
	        properties: {
	          limit: { type: 'integer', minimum: 1, maximum: 64, description: 'Optional page size. Defaults to 5.' },
	          cursor: { type: 'string', maxLength: 512, description: 'Opaque cursor from previous page.' }
	        }
	      },
	      call: callTimelineListBuiltin
	    });
	    addBuiltinTool(tools, toolMap, {
	      name: 'pebble_timeline_edit_pin',
	      label: 'Timeline',
	      description: 'Edit an existing pin created by this app. First find its id with pebble_timeline_list_pins. Only supplied fields change; all other stored fields are preserved. Empty string clears supported optional text fields, such as subtitle and body; locationName is required for weather pins. Empty string cannot clear integer or enum fields; use clearReminder:true to remove all scheduled alerts. Use either reminderTime or remindMinutesBefore (0 means at pin time); supplying one replaces the other. Do not combine either mode with clearReminder:true. clearReminder:false does not restore a removed alert; supply a reminder mode to add one again. Local acceptance does not confirm watch delivery.',
	      parameters: {
	        type: 'object',
	        additionalProperties: false,
	        properties: {
	          id: { type: 'string', maxLength: 64, description: 'Pin id to edit. Must be an existing LLM-created pin. Use pebble_timeline_list_pins to find ids.' },
	          title: { type: 'string', description: 'Pin title shown on the watch.' },
	          time: { type: 'string', description: 'Pin event start time as ISO date-time with timezone, parseable date-time, or Unix seconds.' },
	          durationMinutes: { type: 'integer', minimum: 0, maximum: 1440, description: 'Optional event duration in minutes. Empty string is invalid; this field has no clear value.' },
	          pinType: { type: 'string', enum: ['generic', 'calendar', 'sports', 'weather'], description: 'Kind of timeline pin. Empty string is not a valid enum value.' },
	          subtitle: { type: 'string', description: 'Optional subtitle. Empty string clears.' },
	          body: { type: 'string', maxLength: 512, description: 'Optional pin body text. Empty string clears.' },
	          locationName: { type: 'string', description: 'Optional location. Empty string clears unless required for a weather pin.' },
	          icon: { type: 'string', description: 'Optional Pebble icon name or URI. Empty string resets to default icon.' },
	          pinIcon: { type: 'string', description: 'Optional Pebble icon name or URI for the pin. Empty string resets to default icon.' },
	          reminderTime: { type: 'string', description: 'Optional exact reminder alert time. Supplying this replaces any stored remindMinutesBefore mode. Empty string does not remove the alert; use clearReminder:true.' },
	          remindMinutesBefore: { type: 'integer', minimum: 0, maximum: 43200, description: 'Optional minutes before time to show reminder, including 0 for pin time. Supplying this replaces any stored reminderTime mode. Cannot be cleared with an empty string; use clearReminder:true.' },
	          clearReminder: { type: 'boolean', description: 'Set true to remove every scheduled reminder. Do not combine true with reminderTime or remindMinutesBefore. False alone does not restore a previously removed reminder.' },
	          reminderTitle: { type: 'string', description: 'Optional title for the scheduled reminder. Empty string resets it to the pin title.' },
	          reminderIcon: { type: 'string', description: 'Optional icon for the scheduled reminder. Empty string resets to default icon.' },
	          createNotificationTitle: { type: 'string', description: 'Optional create notification title for the legacy HTTP Timeline API only; ignored on local pins. Empty string uses the fallback title "Timeline update" if notification remains.' },
	          createNotificationBody: { type: 'string', maxLength: 512, description: 'Optional create notification body for the legacy HTTP Timeline API only; ignored on local pins. Empty string clears body.' }
	        },
	        required: ['id']
	      },
	      call: callTimelineEditBuiltin
	    });
	  }
	
	  if (settings.HealthToolEnabled) {
	    addBuiltinTool(tools, toolMap, {
	      name: 'pebble_health_info',
	      label: 'Health Info',
	      description: 'Request only health metrics relevant to the user question. Supports totals, hourly or daily buckets, historical activity and sleep sessions, heart-rate statistics, and an optional personal baseline.',
	      parameters: {
	        type: 'object',
	        additionalProperties: false,
	        required: ['metrics'],
	        properties: {
	          metrics: { type: 'array', minItems: 1, maxItems: HEALTH_METRICS.length, uniqueItems: true, description: 'Nonempty unique health metrics to request.', items: { type: 'string', enum: HEALTH_METRIC_NAMES } },
	          range: { type: 'string', enum: ['today', 'yesterday', 'last_24h', 'last_7d', 'custom'], description: 'Health time range. Default today.' },
	          startTime: { type: 'string', description: 'ISO date-time or Unix seconds for custom range start.' },
	          endTime: { type: 'string', description: 'ISO date-time or Unix seconds for custom range end. Default now.' },
	          granularity: { type: 'string', enum: ['total', 'hour', 'day'], description: 'Aggregation granularity. Default total.' },
	          baseline: { type: 'string', enum: ['none', 'daily', 'weekday_or_weekend', 'same_weekday'], description: 'Optional personal baseline scope. Default none.' }
	        }
	      },
	      call: callHealthInfoBuiltin
	    });
	  }
	}
	
	function discoverPhoneTools(settings, requestId, callback) {
	  discoverMcpTools(settings, requestId, function(error, tools, toolMap, unavailableServers) {
	    if (!watch.isCurrentRequest(requestId)) {
	      return;
	    }
	    if (error) {
	      callback(error, null, null, unavailableServers || []);
	      return;
	    }
	
	    addBuiltinTools(settings, tools, toolMap);
	    pluginSources.getTools(settings).forEach(function(definition) {
	      addBuiltinTool(tools, toolMap, definition);
	    });
	    pluginActions.getTools(settings).forEach(function(definition) {
	      addBuiltinTool(tools, toolMap, definition);
	    });
	    tools.sort(function(a, b) {
	      if (a.name < b.name) {
	        return -1;
	      }
	      if (a.name > b.name) {
	        return 1;
	      }
	      return 0;
	    });
	    callback(null, tools, toolMap, unavailableServers || []);
	  });
	}
	
	function warmMcpTools(settings, callback) {
	  var normalizedSettings = settings || {};
	  var maxToolCalls = parseInt(normalizedSettings.MaxToolCalls, 10);
	  var servers = parseMcpServers(normalizedSettings);
	  var previousGeneration = s_mcp_warm_generation;
	  var generation = {
	    id: s_mcp_warm_generation_id,
	    active: true,
	    serverKeys: Object.create(null),
	    context: null
	  };
	  var context;
	  var i;
	
	  s_mcp_warm_generation_id += 1;
	  if (previousGeneration) {
	    previousGeneration.active = false;
	    if (previousGeneration.context) {
	      previousGeneration.context.active = false;
	    }
	  }
	  s_mcp_warm_generation = generation;
	
	  if (!isNaN(maxToolCalls) && maxToolCalls <= 0) {
	    servers = [];
	  }
	  for (i = 0; i < servers.length; i += 1) {
	    generation.serverKeys[mcpCacheStorageKey(servers[i]._mcpCacheKey)] = true;
	  }
	
	  context = { background: true, active: true, warmGeneration: generation };
	  generation.context = context;
	  cancelUnobservedMcpDiscoveries(generation);
	  if (!servers.length) {
	    cancelUnobservedMcpDiscoveries();
	    context.active = false;
	    if (callback) {
	      callback(null, { serverCount: 0, tools: [] });
	    }
	    return;
	  }
	
	  discoverMcpTools(normalizedSettings, context, function(error, tools) {
	    context.active = false;
	    if (callback) {
	      callback(error, { serverCount: servers.length, tools: tools || [] });
	    }
	  }, servers);
	  if (s_mcp_warm_generation === generation) {
	    cancelUnobservedMcpDiscoveries();
	  }
	}
	
	function callMcpTool(toolInfo, args, requestId, callback) {
	  var called = false;
	  var retried = false;
	
	  function once(error, resultText, resultInfo) {
	    if (called) {
	      return;
	    }
	    called = true;
	    if (error) {
	      common.logDebug('mcp tool error server=' + toolInfo.server.label + ' tool=' + toolInfo.toolName);
	      callback(error);
	      return;
	    }
	    common.logDebug('mcp tool result server=' + toolInfo.server.label + ' tool=' + toolInfo.toolName + ' chars=' + String(resultText || '').length);
	    callback(null, resultText, resultInfo);
	  }
	
	  function doCall() {
	    common.logDebug('mcp tool call server=' + toolInfo.server.label + ' tool=' + toolInfo.toolName + ' args=' + common.safeJson(args).substring(0, 240));
	    mcpJsonRpc(toolInfo.server, 'tools/call', {
	      name: toolInfo.toolName,
	      arguments: args || {}
	    }, true, requestId, function(error, result, httpStatus) {
	      var formatted;
	      if (!watch.isCurrentRequest(requestId)) {
	        return;
	      }
	      if (error && httpStatus === 404 && toolInfo.server.sessionId && !retried) {
	        retried = true;
	        common.logDebug('mcp tool 404 reinitialize server=' + toolInfo.server.label);
	        toolInfo.server.sessionId = '';
	        updateMcpCacheSession(toolInfo.server);
	        initializeMcpServer(toolInfo.server, requestId, function(initError) {
	          if (!watch.isCurrentRequest(requestId)) {
	            return;
	          }
	          if (initError) {
	            once(initError);
	            return;
	          }
	          doCall();
	        });
	        return;
	      }
	      if (error) {
	        once(error);
	        return;
	      }
	      if (result && result.isError === true) {
	        once(formatMcpToolResult(result).text || 'MCP tool reported an error');
	        return;
	      }
	      formatted = formatMcpToolResult(result);
	      once(null, formatted.text, {
	        structured: formatted.structured,
	        mcpResultEnvelope: formatted.mcpEnvelope === true
	      });
	    });
	  }
	
	  doCall();
	}
	
	function callBuiltinTool(toolInfo, args, requestId, callback) {
	  if (toolInfo.logArguments !== false) {
	    common.logDebug('builtin tool call name=' + toolInfo.name + ' args=' + common.safeJson(args).substring(0, 240));
	  } else {
	    common.logDebug('builtin tool call name=' + toolInfo.name + ' args=suppressed');
	  }
	  toolInfo.call(args, requestId, function(error, resultText) {
	    if (!watch.isCurrentRequest(requestId)) {
	      return;
	    }
	    if (error) {
	      common.logDebug('builtin tool error name=' + toolInfo.name + ' error=' + error);
	      callback(error);
	      return;
	    }
	
	    common.logDebug('builtin tool result name=' + toolInfo.name + ' chars=' + String(resultText || '').length);
	    callback(null, resultText, { structured: toolInfo.structuredResult === true });
	  });
	}
	
	function isArrayValue(value) {
	  return Object.prototype.toString.call(value) === '[object Array]';
	}
	
	function isObjectValue(value) {
	  return value && typeof value === 'object' && !isArrayValue(value);
	}
	
	function parseToolArgsValue(value) {
	  var text;
	
	  if (value === undefined || value === null || value === '') {
	    return { args: {} };
	  }
	
	  if (typeof value === 'string') {
	    text = common.trim(value);
	    if (!text) {
	      return { args: {} };
	    }
	    try {
	      value = JSON.parse(text);
	    } catch (e) {
	      return { error: 'Malformed tool arguments JSON' };
	    }
	  }
	
	  if (!isObjectValue(value)) {
	    return { error: 'Tool arguments must be a JSON object' };
	  }
	
	  return { args: value };
	}
	
	function valueMatchesType(value, type) {
	  if (type === 'string') {
	    return typeof value === 'string';
	  }
	  if (type === 'integer') {
	    return typeof value === 'number' && isFinite(value) && Math.floor(value) === value;
	  }
	  if (type === 'number') {
	    return typeof value === 'number' && isFinite(value);
	  }
	  if (type === 'boolean') {
	    return typeof value === 'boolean';
	  }
	  if (type === 'object') {
	    return isObjectValue(value);
	  }
	  if (type === 'array') {
	    return isArrayValue(value);
	  }
	  if (type === 'null') {
	    return value === null;
	  }
	  return true;
	}
	
	function argValuesEqual(a, b) {
	  if (typeof a !== typeof b) {
	    return false;
	  }
	  if (a === null || b === null || typeof a === 'object') {
	    return a === b;
	  }
	  return a === b;
	}
	
	function articleFor(type) {
	  if (type === 'integer' || type === 'object' || type === 'array') {
	    return 'an';
	  }
	  return 'a';
	}
	
	function joinToolArgPath(parent, child) {
	  return parent ? parent + '.' + child : child;
	}
	
	function consumeToolValidationWork(state, amount, key) {
	  state.work += amount;
	  if (state.work > TOOL_VALIDATION_MAX_WORK) {
	    return (key || 'Tool arguments') + ' exceeds validation work limit ' + TOOL_VALIDATION_MAX_WORK;
	  }
	  return '';
	}
	
	function consumeToolSignatureChars(state, amount, key) {
	  state.signatureChars += amount;
	  if (state.signatureChars > TOOL_VALIDATION_MAX_SIGNATURE_CHARS) {
	    return (key || 'Tool arguments') + ' exceeds validation signature limit ' + TOOL_VALIDATION_MAX_SIGNATURE_CHARS;
	  }
	  return '';
	}
	
	function toolArgValueSignature(value, state, key, depth) {
	  var type = typeof value;
	  var token;
	  var parts;
	  var keys;
	  var childKey;
	  var childPath;
	  var child;
	  var item;
	  var count = 0;
	  var sortWork;
	  var i;
	  var error;
	
	  if (depth > TOOL_VALIDATION_MAX_DEPTH) {
	    return { error: (key || 'Tool arguments') + ' exceeds maximum validation depth ' + TOOL_VALIDATION_MAX_DEPTH };
	  }
	  error = consumeToolValidationWork(state, 1, key);
	  if (error) {
	    return { error: error };
	  }
	
	  if (value === null) {
	    token = 'null';
	    error = consumeToolSignatureChars(state, token.length, key);
	    return error ? { error: error } : { value: token };
	  }
	  if (type === 'string' || type === 'number' || type === 'boolean') {
	    if (type === 'string' && value.length > TOOL_VALIDATION_MAX_SIGNATURE_CHARS - state.signatureChars) {
	      return { error: (key || 'Tool arguments') + ' exceeds validation signature limit ' + TOOL_VALIDATION_MAX_SIGNATURE_CHARS };
	    }
	    try {
	      token = JSON.stringify(value);
	    } catch (e) {
	      token = undefined;
	    }
	    if (token === undefined) {
	      token = type + ':' + String(value);
	    }
	    error = consumeToolSignatureChars(state, token.length, key);
	    return error ? { error: error } : { value: token };
	  }
	  if (isArrayValue(value)) {
	    parts = [];
	    for (i = 0; i < value.length; i += 1) {
	      item = toolArgValueSignature(value[i], state, key + '[' + i + ']', depth + 1);
	      if (item.error) {
	        return item;
	      }
	      parts.push(item.value);
	    }
	    error = consumeToolSignatureChars(state, parts.length + 1, key);
	    return error ? { error: error } : { value: '[' + parts.join(',') + ']' };
	  }
	  if (isObjectValue(value)) {
	    parts = [];
	    keys = [];
	    for (childKey in value) {
	      if (!hasOwn(value, childKey)) {
	        continue;
	      }
	      count += 1;
	      if (count > TOOL_VALIDATION_MAX_OBJECT_PROPERTIES) {
	        return { error: (key || 'Tool arguments') + ' exceeds validation property limit ' + TOOL_VALIDATION_MAX_OBJECT_PROPERTIES };
	      }
	      keys.push(childKey);
	    }
	    sortWork = count > 1 ? count * Math.ceil(Math.log(count) / Math.LN2) : count;
	    error = consumeToolValidationWork(state, sortWork, key);
	    if (error) {
	      return { error: error };
	    }
	    keys.sort();
	    for (i = 0; i < keys.length; i += 1) {
	      childKey = keys[i];
	      childPath = joinToolArgPath(key, childKey);
	      if (childKey.length > TOOL_VALIDATION_MAX_SIGNATURE_CHARS - state.signatureChars) {
	        return { error: childPath + ' exceeds validation signature limit ' + TOOL_VALIDATION_MAX_SIGNATURE_CHARS };
	      }
	      try {
	        token = JSON.stringify(childKey);
	      } catch (e2) {
	        token = undefined;
	      }
	      if (token === undefined) {
	        token = String(childKey);
	      }
	      error = consumeToolSignatureChars(state, token.length + 1, childPath);
	      if (error) {
	        return { error: error };
	      }
	      child = toolArgValueSignature(value[childKey], state, childPath, depth + 1);
	      if (child.error) {
	        return child;
	      }
	      parts.push(token + ':' + child.value);
	    }
	    error = consumeToolSignatureChars(state, parts.length + 1, key);
	    return error ? { error: error } : { value: '{' + parts.join(',') + '}' };
	  }
	
	  token = type + ':' + String(value);
	  error = consumeToolSignatureChars(state, token.length, key);
	  return error ? { error: error } : { value: token };
	}
	
	function validateToolArgValue(value, schema, key, state, depth, root) {
	  var type;
	  var required;
	  var properties;
	  var itemSchema;
	  var i;
	  var matched;
	  var childKey;
	  var childPath;
	  var collectionCount;
	  var argError;
	  var hasObjectShape;
	  var seenUniqueItems;
	  var signature;
	  var enumCandidate;
	  var enumValueSignature;
	  var enumCandidateSignature;
	
	  if (!isObjectValue(schema)) {
	    return '';
	  }
	  if (depth > TOOL_VALIDATION_MAX_DEPTH) {
	    return (key || 'Tool arguments') + ' exceeds maximum validation depth ' + TOOL_VALIDATION_MAX_DEPTH;
	  }
	  argError = consumeToolValidationWork(state, 1, key);
	  if (argError) {
	    return argError;
	  }
	
	  type = schema.type;
	  if (type) {
	    if (isArrayValue(type)) {
	      matched = false;
	      for (i = 0; i < type.length; i += 1) {
	        if (valueMatchesType(value, type[i])) {
	          matched = true;
	          break;
	        }
	      }
	      if (!matched) {
	        if (root) {
	          return 'Tool arguments must be a JSON object';
	        }
	        return key + ' must be ' + type.join(' or ');
	      }
	    } else if (!valueMatchesType(value, type)) {
	      if (root && type === 'object') {
	        return 'Tool arguments must be a JSON object';
	      }
	      return key + ' must be ' + articleFor(type) + ' ' + type;
	    }
	  }
	
	  if (isArrayValue(schema.enum) && schema.enum.length) {
	    matched = false;
	    enumValueSignature = null;
	    for (i = 0; i < schema.enum.length; i += 1) {
	      enumCandidate = schema.enum[i];
	      if (value !== null && enumCandidate !== null && typeof value === 'object' && typeof enumCandidate === 'object') {
	        if (isArrayValue(value) !== isArrayValue(enumCandidate)) {
	          continue;
	        }
	        if (!enumValueSignature) {
	          enumValueSignature = toolArgValueSignature(value, state, key, depth + 1);
	          if (enumValueSignature.error) {
	            return enumValueSignature.error;
	          }
	        }
	        enumCandidateSignature = toolArgValueSignature(enumCandidate, state, key, depth + 1);
	        if (enumCandidateSignature.error) {
	          return enumCandidateSignature.error;
	        }
	        matched = enumValueSignature.value === enumCandidateSignature.value;
	      } else {
	        matched = argValuesEqual(value, enumCandidate);
	      }
	      if (matched) {
	        break;
	      }
	    }
	    if (!matched) {
	      return key + ' must be one of ' + schema.enum.map(function(v) { return String(v); }).join(', ');
	    }
	  }
	
	  if (schema.minimum !== undefined && typeof value === 'number' && value < schema.minimum) {
	    return key + ' must be ' + schema.minimum + ' or greater';
	  }
	  if (schema.maximum !== undefined && typeof value === 'number' && value > schema.maximum) {
	    return key + ' must be ' + schema.maximum + ' or less';
	  }
	  if (schema.minLength !== undefined && typeof value === 'string' && value.length < schema.minLength) {
	    return key + ' must have length ' + schema.minLength + ' or greater';
	  }
	  if (schema.maxLength !== undefined && typeof value === 'string' && value.length > schema.maxLength) {
	    return key + ' exceeds max length ' + schema.maxLength;
	  }
	
	  if (isArrayValue(value)) {
	    if (schema.minItems !== undefined && value.length < schema.minItems) {
	      if (schema.minItems === 1 && value.length === 0) {
	        return key + ' must be nonempty';
	      }
	      return key + ' must contain at least ' + schema.minItems + ' item(s)';
	    }
	    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
	      return key + ' must contain no more than ' + schema.maxItems + ' item(s)';
	    }
	    itemSchema = schema.items;
	    if (isObjectValue(itemSchema)) {
	      for (i = 0; i < value.length; i += 1) {
	        argError = validateToolArgValue(value[i], itemSchema, key + '[' + i + ']', state, depth + 1, false);
	        if (argError) {
	          return argError;
	        }
	      }
	    } else if (schema.uniqueItems !== true) {
	      argError = consumeToolValidationWork(state, value.length, key);
	      if (argError) {
	        return argError;
	      }
	    }
	    if (schema.uniqueItems === true) {
	      seenUniqueItems = Object.create(null);
	      for (i = 0; i < value.length; i += 1) {
	        signature = toolArgValueSignature(value[i], state, key + '[' + i + ']', depth + 1);
	        if (signature.error) {
	          return signature.error;
	        }
	        if (hasOwn(seenUniqueItems, signature.value)) {
	          return key + ' must contain unique items';
	        }
	        seenUniqueItems[signature.value] = true;
	      }
	    }
	  }
	
	  required = isArrayValue(schema.required) ? schema.required : [];
	  properties = isObjectValue(schema.properties) ? schema.properties : {};
	  hasObjectShape = schema.type === 'object' || schema.properties !== undefined || required.length > 0;
	  if (hasObjectShape && !isObjectValue(value)) {
	    if (type && isArrayValue(type) && value === null && valueMatchesType(value, type[0])) {
	      return '';
	    }
	    if (!type) {
	      return root ? 'Tool arguments must be a JSON object' : key + ' must be an object';
	    }
	  }
	
	  if (isObjectValue(value)) {
	    if (required.length > TOOL_VALIDATION_MAX_OBJECT_PROPERTIES) {
	      return (key || 'Tool arguments') + ' schema exceeds validation property limit ' + TOOL_VALIDATION_MAX_OBJECT_PROPERTIES;
	    }
	    for (i = 0; i < required.length; i += 1) {
	      childPath = joinToolArgPath(key, required[i]);
	      if (!hasToolArgValue(value[required[i]])) {
	        return 'Missing required tool argument: ' + childPath;
	      }
	    }
	
	    if (schema.additionalProperties === false) {
	      collectionCount = 0;
	      for (childKey in value) {
	        if (!hasOwn(value, childKey)) {
	          continue;
	        }
	        collectionCount += 1;
	        if (collectionCount > TOOL_VALIDATION_MAX_OBJECT_PROPERTIES) {
	          return (key || 'Tool arguments') + ' exceeds validation property limit ' + TOOL_VALIDATION_MAX_OBJECT_PROPERTIES;
	        }
	        childPath = joinToolArgPath(key, childKey);
	        if (!hasOwn(properties, childKey)) {
	          return 'Unsupported tool argument: ' + childPath;
	        }
	        argError = validateToolArgValue(value[childKey], properties[childKey], childPath, state, depth + 1, false);
	        if (argError) {
	          return argError;
	        }
	      }
	    } else {
	      collectionCount = 0;
	      for (childKey in properties) {
	        if (!hasOwn(properties, childKey) || !hasOwn(value, childKey)) {
	          continue;
	        }
	        collectionCount += 1;
	        if (collectionCount > TOOL_VALIDATION_MAX_OBJECT_PROPERTIES) {
	          return (key || 'Tool arguments') + ' schema exceeds validation property limit ' + TOOL_VALIDATION_MAX_OBJECT_PROPERTIES;
	        }
	        childPath = joinToolArgPath(key, childKey);
	        argError = validateToolArgValue(value[childKey], properties[childKey], childPath, state, depth + 1, false);
	        if (argError) {
	          return argError;
	        }
	      }
	    }
	  }
	
	  return '';
	}
	
	function validateToolArgs(args, schema) {
	  return validateToolArgValue(args, schema || {}, '', { work: 0, signatureChars: 0 }, 0, true);
	}
	
	function isIndependentReadTool(toolInfo) {
	  return !!toolInfo && toolInfo.kind === 'builtin' &&
	    toolInfo.builtinName === 'web_fetch' &&
	    toolInfo.executionClass === TOOL_EXECUTION_INDEPENDENT_READ;
	}
	
	function runToolCalls(requestId, toolCalls, toolMap, callback) {
	  var jobs = [];
	  var results = [];
	  var nextIndex = 0;
	  var completed = 0;
	  var callbackCalled = false;
	  var i;
	
	  function createJob(call, index) {
	    var name;
	    var args;
	    var callId;
	    var toolInfo;
	    var parsedArgs;
	    var validationError;
	    var progressId;
	
	    call = call || {};
	    if (call.function && typeof call.function === 'object') {
	      name = call.function.name || call.name || call.tool;
	      args = call.function.arguments || call.arguments || call.args || {};
	    } else {
	      name = call.name || call.tool || call.function;
	      args = call.arguments || call.args || {};
	    }
	    callId = call.call_id || call.id || name || String(index + 1);
	    toolInfo = hasOwn(toolMap, name) ? toolMap[name] : null;
	
	    if (!toolInfo) {
	      return {
	        index: index,
	        id: callId,
	        name: name || 'unknown',
	        error: 'Unknown or unavailable tool'
	      };
	    }
	    progressId = 'tool-call-' + s_tool_execution_id;
	    s_tool_execution_id += 1;
	
	    parsedArgs = parseToolArgsValue(args);
	    if (parsedArgs.error) {
	      return {
	        index: index,
	        id: callId,
	        name: name,
	        toolInfo: toolInfo,
	        progressId: progressId,
	        error: parsedArgs.error
	      };
	    }
	    args = parsedArgs.args;
	    if (toolInfo.kind === 'builtin' &&
	        (toolInfo.builtinName === 'pebble_timeline_create_pin' || toolInfo.builtinName === 'pebble_timeline_create_reminder')) {
	      validationError = timelineCreationIdError(args);
	      if (validationError) {
	        return {
	          index: index,
	          id: callId,
	          name: name,
	          toolInfo: toolInfo,
	          progressId: progressId,
	          error: validationError
	        };
	      }
	    }
	    validationError = typeof toolInfo.validate === 'function' ? toolInfo.validate(args) : validateToolArgs(args, toolInfo.parameters);
	    if (validationError) {
	      return {
	        index: index,
	        id: callId,
	        name: name,
	        toolInfo: toolInfo,
	        progressId: progressId,
	        error: validationError
	      };
	    }
	
	    return {
	      index: index,
	      id: callId,
	      name: name,
	      args: args,
	      toolInfo: toolInfo,
	      progressId: progressId
	    };
	  }
	
	  function settleJob(job, error, resultText, resultInfo) {
	    if (job.settled) {
	      return false;
	    }
	    job.settled = true;
	    if (!watch.isCurrentRequest(requestId)) {
	      return false;
	    }
	
	    if (error) {
	      if (job.toolInfo) {
	        watch.progressDone(
	          requestId,
	          formatToolLabel(job.toolInfo),
	          'error: ' + (job.error !== undefined ? job.error : common.truncate(error, 90)),
	          job.progressId
	        );
	      } else {
	        watch.progressDone(requestId, String(job.name || 'unknown'), 'unknown tool');
	      }
	      results[job.index] = {
	        id: job.id,
	        call_id: job.id,
	        name: job.name,
	        error: error
	      };
	    } else {
	      results[job.index] = {
	        id: job.id,
	        call_id: job.id,
	        name: job.name,
	        result: resultText
	      };
	      if (resultInfo && resultInfo.structured) {
	        results[job.index]._structuredResult = true;
	      }
	      if (resultInfo && resultInfo.mcpResultEnvelope === true) {
	        results[job.index]._mcpResultEnvelope = true;
	      }
	      watch.progressDone(requestId, formatToolLabel(job.toolInfo), String(resultText || '').length + ' chars', job.progressId);
	    }
	    completed += 1;
	    return true;
	  }
	
	  function executeJob(job, done) {
	    function finishToolCall(error, resultText, resultInfo) {
	      if (settleJob(job, error, resultText, resultInfo)) {
	        done();
	      }
	    }
	
	    if (!watch.isCurrentRequest(requestId)) {
	      return;
	    }
	    watch.progressToolStart(
	      requestId,
	      formatToolActiveTitle(job.name, job.toolInfo),
	      job.toolInfo.logArguments === false ? 'checking action request' : formatToolCallDetail(job.args),
	      job.progressId,
	      formatToolLabel(job.toolInfo)
	    );
	    try {
	      if (job.toolInfo.kind === 'builtin') {
	        callBuiltinTool(job.toolInfo, job.args, requestId, finishToolCall);
	      } else {
	        callMcpTool(job.toolInfo, job.args, requestId, finishToolCall);
	      }
	    } catch (e) {
	      finishToolCall(e && e.message ? e.message : String(e || 'Tool call failed'));
	    }
	  }
	
	  function reportImmediateError(job) {
	    if (job.toolInfo && watch.isCurrentRequest(requestId)) {
	      watch.progressToolStart(requestId, formatToolActiveTitle(job.name, job.toolInfo), 'invalid arguments', job.progressId, formatToolLabel(job.toolInfo));
	    }
	    settleJob(job, job.error);
	  }
	
	  function finishIfComplete() {
	    if (!callbackCalled && completed === jobs.length && watch.isCurrentRequest(requestId)) {
	      callbackCalled = true;
	      callback(results);
	    }
	  }
	
	  function runIndependentBatch(start, end) {
	    var batchIndex = start;
	    var active = 0;
	    var remaining = end - start;
	    var pumping = false;
	
	    function pump() {
	      var job;
	
	      if (pumping) {
	        return;
	      }
	      pumping = true;
	      while (active < TOOL_READ_CONCURRENCY && batchIndex < end && watch.isCurrentRequest(requestId)) {
	        job = jobs[batchIndex];
	        batchIndex += 1;
	        active += 1;
	        executeJob(job, function() {
	          active -= 1;
	          remaining -= 1;
	          if (remaining === 0) {
	            next();
	          } else {
	            pump();
	          }
	        });
	      }
	      pumping = false;
	    }
	
	    nextIndex = end;
	    pump();
	  }
	
	  function next() {
	    var job;
	    var batchEnd;
	
	    if (!watch.isCurrentRequest(requestId)) {
	      return;
	    }
	    if (nextIndex >= jobs.length) {
	      finishIfComplete();
	      return;
	    }
	
	    job = jobs[nextIndex];
	    if (job.error) {
	      nextIndex += 1;
	      reportImmediateError(job);
	      next();
	      return;
	    }
	
	    if (isIndependentReadTool(job.toolInfo)) {
	      batchEnd = nextIndex + 1;
	      while (batchEnd < jobs.length && !jobs[batchEnd].error && isIndependentReadTool(jobs[batchEnd].toolInfo)) {
	        batchEnd += 1;
	      }
	      runIndependentBatch(nextIndex, batchEnd);
	      return;
	    }
	
	    nextIndex += 1;
	    executeJob(job, next);
	  }
	
	  for (i = 0; i < toolCalls.length; i += 1) {
	    jobs.push(createJob(toolCalls[i], i));
	  }
	  next();
	}
	
	module.exports = {
	  discoverPhoneTools: discoverPhoneTools,
	  warmMcpTools: warmMcpTools,
	  cancelMcpRequest: cancelMcpRequest,
	  runToolCalls: runToolCalls,
	  formatToolCallLabel: formatToolCallLabel,
	  formatToolWords: formatToolWords
	};


/***/ }),
/* 21 */
/***/ (function(module, exports, __webpack_require__) {

	var common = __webpack_require__(17);
	
	var STORE_KEY = 'llm_thing_timeline_pins_v1';
	var PIN_ID_SEQUENCE_KEY = 'llm_thing_timeline_pin_id_sequence_v1';
	var MAX_TIMELINE_PINS = 64;
	var MAX_PIN_ID_SEQUENCE = 9007199254740990;
	var s_pin_id_sequence = 0;
	
	function nowMs() {
	  return (new Date()).getTime();
	}
	
	function nextTimelinePinIdSequence() {
	  var raw = '';
	  var stored = 0;
	  var next;
	
	  try {
	    raw = localStorage.getItem(PIN_ID_SEQUENCE_KEY) || '';
	  } catch (e) {}
	  if (/^[0-9]+$/.test(raw)) {
	    stored = Number(raw);
	    if (!isFinite(stored) || stored < 0 || stored > MAX_PIN_ID_SEQUENCE || Math.floor(stored) !== stored) {
	      stored = 0;
	    }
	  }
	  if (stored > s_pin_id_sequence) {
	    s_pin_id_sequence = stored;
	  }
	  next = s_pin_id_sequence >= MAX_PIN_ID_SEQUENCE ? 1 : s_pin_id_sequence + 1;
	  s_pin_id_sequence = next;
	
	  try {
	    localStorage.setItem(PIN_ID_SEQUENCE_KEY, String(next));
	  } catch (e2) {
	    common.logDebug('timeline id sequence write failed');
	  }
	
	  return next;
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
	  nextTimelinePinIdSequence: nextTimelinePinIdSequence,
	  saveTimelinePin: saveTimelinePin,
	  getTimelinePin: getTimelinePin,
	  listTimelinePins: listTimelinePins,
	  removeTimelinePin: removeTimelinePin
	};


/***/ }),
/* 22 */
/***/ (function(module, exports) {

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


/***/ }),
/* 23 */
/***/ (function(module, exports) {

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


/***/ }),
/* 24 */
/***/ (function(module, exports) {

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


/***/ }),
/* 25 */
/***/ (function(module, exports, __webpack_require__) {

	var watch = __webpack_require__(18);
	
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
	        name: definitionName(selected, used), label: selected.pluginName + ' / ' + selected.item,
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


/***/ }),
/* 26 */
/***/ (function(module, exports, __webpack_require__) {

	var watch = __webpack_require__(18);
	var actionSchema = __webpack_require__(27);
	
	var MAX_ACTIONS = 128;
	var MAX_CATALOGUE_WORK = 8192;
	var MAX_SCHEMA_CACHE_CHARS = 65536;
	var MAX_ENABLED = 16;
	var MAX_ENABLED_SCAN = 256;
	var MAX_ACTION_NAME = 120;
	var MAX_UI_DESCRIPTION = 512;
	var MAX_MODEL_DESCRIPTION = 1024;
	var MAX_PARAMETERS = 32;
	var MAX_RESULT_CHARS = 6000;
	var ACTION_TIMEOUT_MS = 30000;
	var MAX_REQUEST_STATES = 16;
	var s_requests = Object.create(null);
	var s_request_order = [];
	var s_live_id = 1;
	
	function own(object, key) {
	  return object !== null && object !== undefined && Object.prototype.hasOwnProperty.call(object, key);
	}
	
	function isObject(value) {
	  return value && typeof value === 'object' && Object.prototype.toString.call(value) !== '[object Array]';
	}
	
	function validUuid(value) {
	  return typeof value === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value);
	}
	
	function boundedText(value, max) {
	  var text = typeof value === 'string' ? value : '';
	  var end;
	  if (text.length <= max) { return text; }
	  end = max;
	  if (end > 0 && end < text.length && text.charCodeAt(end - 1) >= 0xD800 && text.charCodeAt(end - 1) <= 0xDBFF &&
	      text.charCodeAt(end) >= 0xDC00 && text.charCodeAt(end) <= 0xDFFF) { end -= 1; }
	  return text.substring(0, end);
	}
	
	function hash(value) {
	  var h = 2166136261;
	  var i;
	  for (i = 0; i < value.length; i += 1) { h = ((h ^ value.charCodeAt(i)) * 16777619) >>> 0; }
	  return h.toString(36);
	}
	
	function slug(value) {
	  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'action';
	}
	
	function enumerateCatalogue() {
	  var result = { actions: [], status: '' };
	  var plugins;
	  var work = 0;
	  var schemaCacheChars = 0;
	  var limited = false;
	  var warned = false;
	  var metadataError = false;
	  var seen = Object.create(null);
	  var i;
	  var j;
	  var plugin;
	  var action;
	  var sanitized;
	  var parameters;
	  var argumentsList;
	  var key;
	  if (typeof Pebble === 'undefined' || !Pebble || typeof Pebble.enumeratePlugins !== 'function' || typeof Pebble.invokeAction !== 'function') {
	    result.status = 'Pebble plugin actions unavailable; update Pebble app to enable native plugin actions';
	    return result;
	  }
	  try { plugins = Pebble.enumeratePlugins(); } catch (e) {
	    result.status = 'Pebble plugin enumeration failed; update Pebble app and retry';
	    return result;
	  }
	  if (Object.prototype.toString.call(plugins) !== '[object Array]') {
	    result.status = 'Pebble plugin catalogue unavailable; update Pebble app';
	    return result;
	  }
	  try {
	    for (i = 0; i < plugins.length && result.actions.length < MAX_ACTIONS && !limited; i += 1) {
	      work += 1;
	      if (work > MAX_CATALOGUE_WORK) { limited = true; break; }
	      plugin = plugins[i];
	      if (!isObject(plugin) || !validUuid(plugin.uuid) || Object.prototype.toString.call(plugin.actions) !== '[object Array]') { continue; }
	      for (j = 0; j < plugin.actions.length && result.actions.length < MAX_ACTIONS && !limited; j += 1) {
	        work += 1;
	        if (work > MAX_CATALOGUE_WORK) { limited = true; break; }
	        action = plugin.actions[j];
	        if (!isObject(action) || typeof action.name !== 'string' || !action.name || action.name.length > MAX_ACTION_NAME) { continue; }
	        key = JSON.stringify([plugin.uuid.toLowerCase(), action.name]);
	        if (own(seen, key)) { continue; }
	        seen[key] = true;
	        try { sanitized = actionSchema.sanitize(action.parameters); } catch (e2) { sanitized = { schema: null, error: 'Schema sanitizer unavailable' }; }
	        if (!sanitized || !sanitized.schema) { warned = true; continue; }
	        try { parameters = JSON.stringify(sanitized.schema); } catch (e3) { parameters = ''; }
	        if (!parameters || schemaCacheChars + parameters.length > MAX_SCHEMA_CACHE_CHARS) { limited = true; break; }
	        schemaCacheChars += parameters.length;
	        argumentsList = [];
	        if (isObject(sanitized.schema.properties)) {
	          var propertyNames = Object.keys(sanitized.schema.properties);
	          var p;
	          work += Math.min(propertyNames.length, MAX_PARAMETERS);
	          if (work > MAX_CATALOGUE_WORK) { limited = true; break; }
	          for (p = 0; p < propertyNames.length && p < MAX_PARAMETERS; p += 1) { argumentsList.push(boundedText(propertyNames[p], 80)); }
	        }
	        result.actions.push({
	          plugin: plugin.uuid.toLowerCase(),
	          pluginName: boundedText(plugin.name || 'Pebble plugin', 120),
	          action: action.name,
	          description: boundedText(action.description || '', MAX_UI_DESCRIPTION),
	          arguments: argumentsList,
	          parameters: sanitized.schema,
	          modelDescription: boundedText(action.description || '', MAX_MODEL_DESCRIPTION)
	        });
	      }
	    }
	  } catch (e4) { metadataError = true; }
	  if (plugins.length > 0 && result.actions.length >= MAX_ACTIONS) { limited = true; }
	  result.actions.sort(function(a, b) {
	    var left = JSON.stringify([a.plugin, a.action]);
	    var right = JSON.stringify([b.plugin, b.action]);
	    return left < right ? -1 : left > right ? 1 : 0;
	  });
	  result.status = result.actions.length ? 'Pebble plugin actions available' : 'No supported Pebble plugin actions found; update Pebble app and installed plugins if actions are expected';
	  if (warned) { result.status += '; some actions omitted because their parameter schemas are unsupported'; }
	  if (metadataError) { result.status += '; some plugin metadata could not be read safely'; }
	  if (limited) { result.status += '; catalogue scan stopped at bounded metadata limits'; }
	  return result;
	}
	
	function getCatalogue() {
	  var catalogue = enumerateCatalogue();
	  var actions = [];
	  var i;
	  var entry;
	  for (i = 0; i < catalogue.actions.length; i += 1) {
	    entry = catalogue.actions[i];
	    actions.push({ plugin: entry.plugin, pluginName: entry.pluginName, action: entry.action, description: entry.description, arguments: entry.arguments.slice() });
	  }
	  return { actions: actions, status: catalogue.status };
	}
	
	function parseEnabled(settings) {
	  var parsed;
	  var enabled = [];
	  var seen = Object.create(null);
	  var i;
	  var entry;
	  var key;
	  var enabledIndex;
	  try { parsed = JSON.parse(settings && settings.PluginActionsJson || '[]'); } catch (e) { return enabled; }
	  if (Object.prototype.toString.call(parsed) !== '[object Array]') { return enabled; }
	  for (i = 0; i < parsed.length && i < MAX_ENABLED_SCAN; i += 1) {
	    entry = parsed[i];
	    if (!isObject(entry) || !validUuid(entry.plugin) || typeof entry.action !== 'string' || !entry.action || entry.action.length > MAX_ACTION_NAME) { continue; }
	    if (own(entry, 'confirm') && typeof entry.confirm !== 'boolean') { continue; }
	    key = JSON.stringify([entry.plugin.toLowerCase(), entry.action]);
	    if (own(seen, key)) {
	      enabledIndex = seen[key];
	      if (entry.confirm === true) { enabled[enabledIndex].confirm = true; }
	    } else if (enabled.length < MAX_ENABLED) {
	      seen[key] = enabled.length;
	      enabled.push({ plugin: entry.plugin.toLowerCase(), action: entry.action, confirm: entry.confirm === true });
	    }
	  }
	  return enabled;
	}
	
	function definitionName(action, used) {
	  var tuple = JSON.stringify([action.plugin, action.action]);
	  var suffix = '_' + hash(tuple);
	  var base = 'pebble_plugin_action_' + slug(action.action);
	  var name = base.substring(0, 64 - suffix.length) + suffix;
	  var n = 2;
	  while (own(used, name)) { name = base.substring(0, 64 - suffix.length - String(n).length - 1) + '_' + n + suffix; n += 1; }
	  used[name] = true;
	  return name;
	}
	
	function stateFor(requestId) {
	  var key = String(requestId);
	  var state = s_requests[key];
	  var i;
	  if (state && !watch.isCurrentRequest(requestId)) { delete s_requests[key]; state = null; }
	  if (!state) {
	    state = { requestId: requestId, blocked: Object.create(null), denied: Object.create(null), live: Object.create(null) };
	    s_requests[key] = state;
	    s_request_order.push(key);
	  }
	  for (i = s_request_order.length - 1; i >= 0; i -= 1) {
	    var existing = s_requests[s_request_order[i]];
	    if (!existing || !watch.isCurrentRequest(existing.requestId)) { delete s_requests[s_request_order[i]]; s_request_order.splice(i, 1); }
	  }
	  while (s_request_order.length > MAX_REQUEST_STATES) { delete s_requests[s_request_order.shift()]; }
	  return state;
	}
	
	function uncertainMessage(reason) {
	  return 'Plugin action outcome unknown: ' + reason + '. It may already have completed; do not automatically retry.';
	}
	
	function capResult(result) {
	  var base = { ok: true, pluginUuid: result.pluginUuid, action: result.action };
	  var flags = { textTruncated: false, refreshedTruncated: false };
	  var sourceText = typeof result.text === 'string' ? result.text : '';
	  var text = boundedText(sourceText, MAX_RESULT_CHARS);
	  var refreshed = [];
	  var i;
	  if (Object.prototype.toString.call(result.refreshed) === '[object Array]') {
	    for (i = 0; i < result.refreshed.length && i < 32; i += 1) {
	      if (typeof result.refreshed[i] === 'string') {
	        if (result.refreshed[i].length > 64) { flags.refreshedTruncated = true; }
	        refreshed.push(boundedText(result.refreshed[i], 64));
	      }
	      else { flags.refreshedTruncated = true; }
	    }
	    if (result.refreshed.length > 32) { flags.refreshedTruncated = true; }
	  }
	  if (sourceText.length > MAX_RESULT_CHARS) { flags.textTruncated = true; }
	  function build() {
	    var value = { ok: true, pluginUuid: base.pluginUuid, action: base.action };
	    if (text) { value.text = text; }
	    if (refreshed.length) { value.refreshed = refreshed; }
	    if (flags.textTruncated) { value.textTruncated = true; }
	    if (flags.refreshedTruncated) { value.refreshedTruncated = true; }
	    return JSON.stringify(value);
	  }
	  var output = build();
	  while (refreshed.length) {
	    var savedText = text;
	    text = '';
	    var emptyTextOutput = build();
	    text = savedText;
	    if (emptyTextOutput.length <= MAX_RESULT_CHARS) { break; }
	    refreshed.pop();
	    flags.refreshedTruncated = true;
	    output = build();
	  }
	  if (output.length > MAX_RESULT_CHARS) {
	    flags.textTruncated = true;
	    var low = 0;
	    var high = text.length;
	    var middle;
	    var best = '';
	    while (low <= high) {
	      middle = Math.floor((low + high) / 2);
	      var clipped = boundedText(text, middle);
	      var oldText = text;
	      text = clipped;
	      var candidate = build();
	      text = oldText;
	      if (candidate.length <= MAX_RESULT_CHARS) { best = candidate; low = middle + 1; }
	      else { high = middle - 1; }
	    }
	    output = best || JSON.stringify({ ok: true, pluginUuid: base.pluginUuid, action: base.action, textTruncated: true });
	  }
	  return output;
	}
	
	function cloneAndFreezeArguments(args) {
	  var clone;
	  function freeze(value) {
	    var key;
	    if (!value || typeof value !== 'object') { return; }
	    for (key in value) { if (own(value, key)) { freeze(value[key]); } }
	    if (Object.freeze) { try { Object.freeze(value); } catch (e) {} }
	  }
	  try { clone = JSON.parse(JSON.stringify(args)); } catch (e2) { return null; }
	  if (!clone || typeof clone !== 'object' || Object.prototype.toString.call(clone) === '[object Array]') { return null; }
	  freeze(clone);
	  return clone;
	}
	
	function callAction(action, schema, args, requestId, callback, requiresConfirmation) {
	  var state = stateFor(requestId);
	  var actionKey = JSON.stringify([action.plugin, action.action]);
	  var token = 'action-' + s_live_id;
	  var done = false;
	  var timer = null;
	  var tracked = false;
	  var approvalHandle = null;
	  var approvalCallbackCalled = false;
	  var snapshot;
	  var handle = { pluginAction: true, abort: cancel };
	  var validationError;
	  s_live_id += 1;
	
	  function cleanup() {
	    if (timer !== null) { clearTimeout(timer); timer = null; }
	    if (tracked) { tracked = false; try { watch.untrackXhr(requestId, handle); } catch (e) {} }
	    if (state.live[token]) { delete state.live[token]; }
	  }
	  function finish(error, result, uncertain) {
	    if (done) { return; }
	    done = true;
	    cleanup();
	    if (uncertain) { state.blocked[actionKey] = true; }
	    if (watch.isCurrentRequest(requestId)) { callback(error, result); }
	  }
	  function cancel() {
	    if (done) { return; }
	    done = true;
	    if (approvalHandle && typeof approvalHandle.abort === 'function') {
	      try { approvalHandle.abort(); } catch (e) {}
	      approvalHandle = null;
	    }
	    cleanup();
	  }
	  function invokeNative() {
	    var promise;
	    if (done || !watch.isCurrentRequest(requestId)) { cancel(); return; }
	    timer = setTimeout(function() { finish(uncertainMessage('native action timed out'), null, true); }, ACTION_TIMEOUT_MS);
	    try {
	      promise = Pebble.invokeAction({ plugin: action.plugin, action: action.action, args: snapshot });
	      if (!promise || typeof promise.then !== 'function') { finish(uncertainMessage('native response was not a promise'), null, true); return; }
	      promise.then(function(response) {
	        var output;
	        if (done) { return; }
	        if (!watch.isCurrentRequest(requestId)) { cancel(); return; }
	        try {
	          if (!isObject(response) || typeof response.ok !== 'boolean') { finish(uncertainMessage('native response was malformed'), null, true); return; }
	          if (response.ok !== true) {
	            if (typeof response.code !== 'string' || (response.message !== undefined && typeof response.message !== 'string')) {
	              finish(uncertainMessage('native error response was malformed'), null, true);
	              return;
	            }
	            if (response.code === 'PERMISSION_DENIED') { finish('Plugin action permission denied. Approve Pebble access, then retry.', null, false); return; }
	            if (response.code === 'AUTH_REQUIRED') { finish('Plugin action requires authentication. Configure or sign in to the plugin, then retry.', null, false); return; }
	            if (response.code === 'TIMEOUT' || response.code === 'UNKNOWN') {
	              finish(uncertainMessage('native reported ' + response.code), null, true);
	              return;
	            }
	            if (response.code === 'INVALID_ARGS' || response.code === 'INVALID_REQUEST' ||
	                response.code === 'PLUGIN_UNAVAILABLE' || response.code === 'RATE_LIMITED') {
	              finish('Plugin action failed with code ' + response.code, null, false);
	              return;
	            }
	            finish(uncertainMessage('native error code was not recognized'), null, true);
	            return;
	          }
	          if ((response.text !== undefined && typeof response.text !== 'string') ||
	              (response.refreshed !== undefined && Object.prototype.toString.call(response.refreshed) !== '[object Array]')) {
	            finish(uncertainMessage('native response fields were malformed'), null, true);
	            return;
	          }
	          output = capResult({ pluginUuid: action.plugin, action: action.action, text: response.text, refreshed: response.refreshed });
	          finish(null, output, false);
	        } catch (e) {
	          finish(uncertainMessage('native response could not be processed safely'), null, true);
	        }
	      }, function() {
	        if (!done) { finish(uncertainMessage('native invocation rejected'), null, true); }
	      });
	    } catch (e2) { finish(uncertainMessage('native invocation failed'), null, true); }
	  }
	  function approvalCompleted(error, approved) {
	    var denial;
	    if (approvalCallbackCalled) { return; }
	    approvalCallbackCalled = true;
	    approvalHandle = null;
	    if (done || !watch.isCurrentRequest(requestId)) { cancel(); return; }
	    if (error) {
	      denial = String(error);
	      state.denied[actionKey] = denial;
	      finish(denial, null, false);
	      return;
	    }
	    if (approved !== true) {
	      denial = 'User denied plugin action; action was not run. Do not retry or bypass confirmation.';
	      state.denied[actionKey] = denial;
	      finish(denial, null, false);
	      return;
	    }
	    invokeNative();
	  }
	  if (!watch.isCurrentRequest(requestId)) { return; }
	  validationError = actionSchema.validate(args, schema);
	  if (validationError) { callback('Invalid plugin action arguments: ' + validationError); return; }
	  if (state.blocked[actionKey]) { callback('Plugin action blocked after an earlier unknown outcome in this request; do not retry automatically'); return; }
	  if (state.denied[actionKey]) { callback(state.denied[actionKey]); return; }
	  if (requiresConfirmation && typeof watch.requestActionApproval !== 'function') {
	    state.denied[actionKey] = 'Watch confirmation is unavailable; action was not run.';
	    callback(state.denied[actionKey]);
	    return;
	  }
	  if (typeof Pebble === 'undefined' || !Pebble || typeof Pebble.invokeAction !== 'function') { callback('Pebble plugin action API unavailable; update Pebble app'); return; }
	  snapshot = cloneAndFreezeArguments(args);
	  if (!snapshot) { callback('Plugin action arguments could not be snapshotted safely; action was not run.'); return; }
	  validationError = actionSchema.validate(snapshot, schema);
	  if (validationError) { callback('Invalid plugin action arguments: ' + validationError); return; }
	  state.live[token] = cancel;
	  if (typeof watch.trackXhr === 'function') {
	    tracked = true;
	    if (!watch.trackXhr(requestId, handle)) { tracked = false; cancel(); return; }
	  }
	  if (requiresConfirmation) {
	    var returnedHandle;
	    try {
	      returnedHandle = watch.requestActionApproval({
	        plugin: action.plugin,
	        pluginName: action.pluginName,
	        action: action.action,
	        args: snapshot
	      }, requestId, approvalCompleted);
	      if (!approvalCallbackCalled && !done) { approvalHandle = returnedHandle; }
	      else if (returnedHandle && typeof returnedHandle.abort === 'function') { returnedHandle.abort(); }
	    } catch (approvalError) {
	      if (!approvalCallbackCalled && !done) {
	        approvalCallbackCalled = true;
	        state.denied[actionKey] = 'Watch confirmation is unavailable; action was not run.';
	        finish(state.denied[actionKey], null, false);
	      }
	    }
	  } else { invokeNative(); }
	}
	
	function getTools(settings) {
	  var enabled = parseEnabled(settings);
	  var catalogue;
	  var tools = [];
	  var used = Object.create(null);
	  var i;
	  var j;
	  if (!enabled.length) { return tools; }
	  catalogue = enumerateCatalogue().actions;
	  for (i = 0; i < enabled.length; i += 1) {
	    for (j = 0; j < catalogue.length; j += 1) {
	      if (catalogue[j].plugin !== enabled[i].plugin || catalogue[j].action !== enabled[i].action) { continue; }
	      (function(selected) {
	        var requiresConfirmation = enabled[i].confirm === true;
	        var validate = function(args) { return actionSchema.validate(args, selected.parameters); };
	        var description = 'Invoke exact action ' + selected.action + ' on installed Pebble plugin ' + selected.pluginName + '. This may change plugin or external state. ' +
	          (requiresConfirmation ? 'Requires watch approval before execution. ' : '') + selected.modelDescription;
	        tools.push({
	          name: definitionName(selected, used),
	          label: selected.pluginName + ' / ' + selected.action,
	          description: boundedText(description, MAX_MODEL_DESCRIPTION),
	          parameters: selected.parameters,
	          validate: validate,
	          logArguments: false,
	          call: function(args, requestId, callback) { callAction(selected, selected.parameters, args, requestId, callback, requiresConfirmation); }
	        });
	      }(catalogue[j]));
	      break;
	    }
	  }
	  return tools;
	}
	
	function cancelRequest(requestId) {
	  var key = String(requestId);
	  var state = s_requests[key];
	  var tokens;
	  var i;
	  if (!state) { return; }
	  tokens = Object.keys(state.live);
	  for (i = 0; i < tokens.length; i += 1) { state.live[tokens[i]](); }
	  delete s_requests[key];
	  i = s_request_order.indexOf(key);
	  if (i !== -1) { s_request_order.splice(i, 1); }
	}
	
	module.exports = { getCatalogue: getCatalogue, getTools: getTools, cancelRequest: cancelRequest };


/***/ }),
/* 27 */
/***/ (function(module, exports) {

	'use strict';
	
	/*
	 * Bounded JSON Schema support for Pebble plugin action arguments.
	 *
	 * sanitize() accepts a raw action parameter schema and returns a safe,
	 * JSON-only clone. Unsupported validation keywords are rejected rather than
	 * ignored. validate() checks already-sanitized arguments against that clone.
	 *
	 * Both entry points fail closed and never throw.
	 */
	
	var MAX_SCHEMA_CHARS = 8192;
	var MAX_SCHEMA_DEPTH = 24;
	var MAX_SCHEMA_NODES = 512;
	var MAX_SCHEMA_CONTAINER = 64;
	var MAX_ARGS_CHARS = 16384;
	var MAX_ARGS_DEPTH = 32;
	var MAX_ARGS_WORK = 2048;
	var MAX_ARGS_OBJECT_PROPERTIES = 256;
	var MAX_ARGS_ARRAY_ITEMS = 256;
	var IEEE754_EPSILON = 2.220446049250313e-16;
	var MULTIPLE_TOLERANCE_FACTOR = 8;
	var MULTIPLE_TOLERANCE_CAP = 1e-12;
	
	var SCHEMA_TYPES = {
	  string: true,
	  number: true,
	  integer: true,
	  boolean: true,
	  object: true,
	  array: true,
	  null: true
	};
	
	var ANNOTATION_STRING_KEYS = {
	  $schema: true,
	  $id: true,
	  title: true,
	  description: true
	};
	
	var ANNOTATION_BOOLEAN_KEYS = {
	  deprecated: true,
	  readOnly: true,
	  writeOnly: true
	};
	
	var SIMPLE_NAME = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
	
	function own(object, key) {
	  return object !== null && object !== undefined && Object.prototype.hasOwnProperty.call(object, key);
	}
	
	function isArray(value) {
	  return Object.prototype.toString.call(value) === '[object Array]';
	}
	
	function isPlainObject(value) {
	  var proto;
	  var prototypeRoot;
	  if (value === null || typeof value !== 'object' || Object.prototype.toString.call(value) !== '[object Object]') {
	    return false;
	  }
	  try {
	    proto = Object.getPrototypeOf ? Object.getPrototypeOf(value) : value.__proto__;
	    if (proto === null) {
	      return true;
	    }
	    prototypeRoot = Object.getPrototypeOf ? Object.getPrototypeOf(proto) : proto.__proto__;
	    return prototypeRoot === null;
	  } catch (e) {
	    return false;
	  }
	}
	
	function isFiniteNumber(value) {
	  return typeof value === 'number' && isFinite(value);
	}
	
	function isNonNegativeInteger(value) {
	  return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= 0;
	}
	
	function define(object, key, value) {
	  Object.defineProperty(object, key, {
	    value: value,
	    enumerable: true,
	    writable: true,
	    configurable: true
	  });
	}
	
	function presentKey(key) {
	  var text = String(key);
	  return text.length > 80 ? text.substring(0, 77) + '...' : text;
	}
	
	function schemaPath(parent, key) {
	  return parent + '/' + presentKey(key);
	}
	
	function schemaError(path, message) {
	  return { error: 'Invalid schema at ' + path + ': ' + message };
	}
	
	function unsupportedKeyword(path, key) {
	  return { error: 'Unsupported schema keyword at ' + schemaPath(path, key) + ': ' + presentKey(key) };
	}
	
	function stringJsonCost(value, path, limit) {
	  if (value.length > limit) {
	    return { error: 'Invalid schema at ' + path + ': string exceeds serialized schema size limit ' + limit };
	  }
	  try {
	    return { cost: JSON.stringify(value).length };
	  } catch (e) {
	    return { error: 'Invalid schema at ' + path + ': string could not be serialized' };
	  }
	}
	
	function descriptorValue(object, key, path) {
	  var descriptor = Object.getOwnPropertyDescriptor(object, key);
	  if (!descriptor) {
	    return { error: 'Invalid schema at ' + path + ': property disappeared during processing' };
	  }
	  if (descriptor.get || descriptor.set) {
	    return { error: 'Invalid schema at ' + path + ': accessor properties are not JSON' };
	  }
	  return { value: descriptor.value };
	}
	
	function cloneType(value, path) {
	  var out;
	  var cost;
	  var i;
	  var itemCost;
	  var descriptor;
	
	  if (typeof value === 'string') {
	    if (!own(SCHEMA_TYPES, value)) {
	      return schemaError(path, 'unsupported type ' + presentKey(value));
	    }
	    itemCost = stringJsonCost(value, path, MAX_SCHEMA_CHARS);
	    if (itemCost.error) {
	      return itemCost;
	    }
	    return { value: value, cost: itemCost.cost };
	  }
	
	  if (!isArray(value)) {
	    return schemaError(path, 'type must be a string or an array of strings');
	  }
	  if (value.length === 0) {
	    return schemaError(path, 'type array must not be empty');
	  }
	  if (value.length > MAX_SCHEMA_CONTAINER) {
	    return schemaError(path, 'type array exceeds limit ' + MAX_SCHEMA_CONTAINER);
	  }
	
	  out = [];
	  cost = 2;
	  for (i = 0; i < value.length; i += 1) {
	    descriptor = Object.getOwnPropertyDescriptor(value, String(i));
	    if (!descriptor || descriptor.get || descriptor.set) {
	      return schemaError(path, 'type array must not contain holes or accessors');
	    }
	    if (typeof descriptor.value !== 'string' || !own(SCHEMA_TYPES, descriptor.value)) {
	      return schemaError(path, 'type array contains an unsupported entry');
	    }
	    itemCost = stringJsonCost(descriptor.value, path, MAX_SCHEMA_CHARS);
	    if (itemCost.error) {
	      return itemCost;
	    }
	    out.push(descriptor.value);
	    cost += itemCost.cost + (i > 0 ? 1 : 0);
	    if (cost > MAX_SCHEMA_CHARS) {
	      return schemaError(path, 'exceeds serialized schema size limit ' + MAX_SCHEMA_CHARS);
	    }
	  }
	  return { value: out, cost: cost };
	}
	
	function cloneSchemaArray(keyword, value, depth, path, context) {
	  var out;
	  var cost;
	  var i;
	  var child;
	  var childPath;
	  var descriptor;
	
	  if (!isArray(value)) {
	    return schemaError(path, keyword + ' must be an array of schemas');
	  }
	  if (value.length === 0) {
	    return schemaError(path, keyword + ' must contain at least one schema');
	  }
	  if (value.length > MAX_SCHEMA_CONTAINER) {
	    return schemaError(path, keyword + ' exceeds limit ' + MAX_SCHEMA_CONTAINER + ' entries');
	  }
	
	  out = [];
	  cost = 2;
	  for (i = 0; i < value.length; i += 1) {
	    descriptor = Object.getOwnPropertyDescriptor(value, String(i));
	    if (!descriptor || descriptor.get || descriptor.set) {
	      return schemaError(path, keyword + ' must not contain holes or accessors');
	    }
	    childPath = schemaPath(path, String(i));
	    child = cloneSchema(descriptor.value, depth + 1, childPath, context, false);
	    if (child.error) {
	      return child;
	    }
	    out.push(child.node);
	    cost += child.cost + (i > 0 ? 1 : 0);
	    if (cost > MAX_SCHEMA_CHARS) {
	      return schemaError(path, 'exceeds serialized schema size limit ' + MAX_SCHEMA_CHARS);
	    }
	  }
	  return { value: out, cost: cost };
	}
	
	function cloneSchemaObject(keyword, value, depth, path, context) {
	  var child;
	  if (!isPlainObject(value)) {
	    return schemaError(path, keyword + ' must be a schema object');
	  }
	  child = cloneSchema(value, depth + 1, schemaPath(path, keyword), context, false);
	  if (child.error) {
	    return child;
	  }
	  return { value: child.node, cost: child.cost };
	}
	
	function cloneProperties(value, depth, path, context) {
	  var keys;
	  var out;
	  var cost;
	  var i;
	  var key;
	  var descriptor;
	  var child;
	  var keyCost;
	
	  if (!isPlainObject(value)) {
	    return schemaError(path, 'properties must be an object');
	  }
	  if (Object.getOwnPropertySymbols && Object.getOwnPropertySymbols(value).length > 0) {
	    return schemaError(path, 'properties must not contain symbol keys');
	  }
	  keys = Object.keys(value);
	  if (keys.length > MAX_SCHEMA_CONTAINER) {
	    return schemaError(path, 'properties exceeds limit ' + MAX_SCHEMA_CONTAINER + ' entries');
	  }
	
	  out = {};
	  cost = 2;
	  for (i = 0; i < keys.length; i += 1) {
	    key = keys[i];
	    descriptor = descriptorValue(value, key, schemaPath(path, key));
	    if (descriptor.error) {
	      return descriptor;
	    }
	    keyCost = stringJsonCost(key, path, MAX_SCHEMA_CHARS);
	    if (keyCost.error) {
	      return keyCost;
	    }
	    child = cloneSchema(descriptor.value, depth + 1, schemaPath(path, key), context, false);
	    if (child.error) {
	      return child;
	    }
	    define(out, key, child.node);
	    cost += keyCost.cost + 1 + child.cost + (i > 0 ? 1 : 0);
	    if (cost > MAX_SCHEMA_CHARS) {
	      return schemaError(path, 'exceeds serialized schema size limit ' + MAX_SCHEMA_CHARS);
	    }
	  }
	  return { value: out, cost: cost };
	}
	
	function cloneJson(value, depth, path, context) {
	  var type = typeof value;
	  var keys;
	  var out;
	  var cost;
	  var i;
	  var key;
	  var descriptor;
	  var child;
	  var itemCost;
	  var keyCost;
	
	  if (depth > MAX_SCHEMA_DEPTH) {
	    return schemaError(path, 'JSON value exceeds maximum schema depth ' + MAX_SCHEMA_DEPTH);
	  }
	  if (value === null) {
	    return { value: null, cost: 4 };
	  }
	  if (type === 'string') {
	    itemCost = stringJsonCost(value, path, MAX_SCHEMA_CHARS);
	    if (itemCost.error) {
	      return itemCost;
	    }
	    return { value: value, cost: itemCost.cost };
	  }
	  if (type === 'number') {
	    if (!isFinite(value)) {
	      return schemaError(path, 'numbers must be finite JSON numbers');
	    }
	    return { value: value, cost: JSON.stringify(value).length };
	  }
	  if (type === 'boolean') {
	    return { value: value, cost: value ? 4 : 5 };
	  }
	  if (type !== 'object') {
	    return schemaError(path, 'value must be JSON, not ' + type);
	  }
	  if (context.stack.indexOf(value) !== -1) {
	    return schemaError(path, 'value contains a cycle');
	  }
	  context.nodes += 1;
	  if (context.nodes > MAX_SCHEMA_NODES) {
	    return schemaError(path, 'exceeds maximum schema node count ' + MAX_SCHEMA_NODES);
	  }
	
	  if (isArray(value)) {
	    if (value.length > MAX_SCHEMA_CONTAINER) {
	      return schemaError(path, 'JSON array exceeds limit ' + MAX_SCHEMA_CONTAINER + ' entries');
	    }
	    context.stack.push(value);
	    out = [];
	    cost = 2;
	    for (i = 0; i < value.length; i += 1) {
	      descriptor = Object.getOwnPropertyDescriptor(value, String(i));
	      if (!descriptor || descriptor.get || descriptor.set) {
	        context.stack.pop();
	        return schemaError(path, 'JSON array must not contain holes or accessors');
	      }
	      child = cloneJson(descriptor.value, depth + 1, schemaPath(path, String(i)), context);
	      if (child.error) {
	        context.stack.pop();
	        return child;
	      }
	      out.push(child.value);
	      cost += child.cost + (i > 0 ? 1 : 0);
	      if (cost > MAX_SCHEMA_CHARS) {
	        context.stack.pop();
	        return schemaError(path, 'exceeds serialized schema size limit ' + MAX_SCHEMA_CHARS);
	      }
	    }
	    context.stack.pop();
	    return { value: out, cost: cost };
	  }
	
	  if (!isPlainObject(value)) {
	    return schemaError(path, 'value must be a JSON object');
	  }
	  if (Object.getOwnPropertySymbols && Object.getOwnPropertySymbols(value).length > 0) {
	    return schemaError(path, 'JSON object must not contain symbol keys');
	  }
	  keys = Object.keys(value);
	  if (keys.length > MAX_SCHEMA_CONTAINER) {
	    return schemaError(path, 'JSON object exceeds limit ' + MAX_SCHEMA_CONTAINER + ' entries');
	  }
	  context.stack.push(value);
	  out = {};
	  cost = 2;
	  for (i = 0; i < keys.length; i += 1) {
	    key = keys[i];
	    descriptor = descriptorValue(value, key, schemaPath(path, key));
	    if (descriptor.error) {
	      context.stack.pop();
	      return descriptor;
	    }
	    keyCost = stringJsonCost(key, path, MAX_SCHEMA_CHARS);
	    if (keyCost.error) {
	      context.stack.pop();
	      return keyCost;
	    }
	    child = cloneJson(descriptor.value, depth + 1, schemaPath(path, key), context);
	    if (child.error) {
	      context.stack.pop();
	      return child;
	    }
	    define(out, key, child.value);
	    cost += keyCost.cost + 1 + child.cost + (i > 0 ? 1 : 0);
	    if (cost > MAX_SCHEMA_CHARS) {
	      context.stack.pop();
	      return schemaError(path, 'exceeds serialized schema size limit ' + MAX_SCHEMA_CHARS);
	    }
	  }
	  context.stack.pop();
	  return { value: out, cost: cost };
	}
	
	function cloneAnnotation(key, value, depth, path, context) {
	  var keyPath = schemaPath(path, key);
	  var child;
	  var out;
	  var cost;
	  var i;
	  var descriptor;
	  var stringCost;
	
	  if (own(ANNOTATION_STRING_KEYS, key)) {
	    if (typeof value !== 'string') {
	      return schemaError(keyPath, key + ' must be a string');
	    }
	    stringCost = stringJsonCost(value, keyPath, MAX_SCHEMA_CHARS);
	    if (stringCost.error) {
	      return stringCost;
	    }
	    return { value: value, cost: stringCost.cost };
	  }
	  if (own(ANNOTATION_BOOLEAN_KEYS, key)) {
	    if (typeof value !== 'boolean') {
	      return schemaError(keyPath, key + ' must be a boolean');
	    }
	    return { value: value, cost: value ? 4 : 5 };
	  }
	  if (key === 'default') {
	    return cloneJson(value, depth + 1, keyPath, context);
	  }
	  if (key === 'examples') {
	    if (!isArray(value)) {
	      return schemaError(keyPath, 'examples must be an array');
	    }
	    if (value.length > MAX_SCHEMA_CONTAINER) {
	      return schemaError(keyPath, 'examples exceeds limit ' + MAX_SCHEMA_CONTAINER + ' entries');
	    }
	    out = [];
	    cost = 2;
	    for (i = 0; i < value.length; i += 1) {
	      descriptor = Object.getOwnPropertyDescriptor(value, String(i));
	      if (!descriptor || descriptor.get || descriptor.set) {
	        return schemaError(keyPath, 'examples must not contain holes or accessors');
	      }
	      child = cloneJson(descriptor.value, depth + 1, schemaPath(keyPath, String(i)), context);
	      if (child.error) {
	        return child;
	      }
	      out.push(child.value);
	      cost += child.cost + (i > 0 ? 1 : 0);
	      if (cost > MAX_SCHEMA_CHARS) {
	        return schemaError(keyPath, 'exceeds serialized schema size limit ' + MAX_SCHEMA_CHARS);
	      }
	    }
	    return { value: out, cost: cost };
	  }
	  return unsupportedKeyword(path, key);
	}
	
	function cloneSchemaKeyword(key, value, depth, path, context, root) {
	  var keyPath = schemaPath(path, key);
	  var child;
	  var out;
	  var cost;
	  var i;
	  var descriptor;
	
	  if (key === 'type') {
	    return cloneType(value, keyPath);
	  }
	  if (key === 'properties') {
	    return cloneProperties(value, depth, keyPath, context);
	  }
	  if (key === 'required') {
	    if (!isArray(value)) {
	      return schemaError(keyPath, 'required must be an array of strings');
	    }
	    if (value.length > MAX_SCHEMA_CONTAINER) {
	      return schemaError(keyPath, 'required exceeds limit ' + MAX_SCHEMA_CONTAINER + ' entries');
	    }
	    out = [];
	    cost = 2;
	    for (i = 0; i < value.length; i += 1) {
	      descriptor = Object.getOwnPropertyDescriptor(value, String(i));
	      if (!descriptor || descriptor.get || descriptor.set) {
	        return schemaError(keyPath, 'required must not contain holes or accessors');
	      }
	      if (typeof descriptor.value !== 'string') {
	        return schemaError(keyPath, 'required entries must be strings');
	      }
	      child = stringJsonCost(descriptor.value, keyPath, MAX_SCHEMA_CHARS);
	      if (child.error) {
	        return child;
	      }
	      out.push(descriptor.value);
	      cost += child.cost + (i > 0 ? 1 : 0);
	      if (cost > MAX_SCHEMA_CHARS) {
	        return schemaError(keyPath, 'exceeds serialized schema size limit ' + MAX_SCHEMA_CHARS);
	      }
	    }
	    return { value: out, cost: cost };
	  }
	  if (key === 'additionalProperties' || key === 'items') {
	    if (typeof value === 'boolean') {
	      return { value: value, cost: value ? 4 : 5 };
	    }
	    return cloneSchemaObject(key, value, depth, path, context);
	  }
	  if (key === 'enum') {
	    if (!isArray(value)) {
	      return schemaError(keyPath, 'enum must be an array of JSON values');
	    }
	    if (value.length === 0) {
	      return schemaError(keyPath, 'enum must contain at least one value');
	    }
	    if (value.length > MAX_SCHEMA_CONTAINER) {
	      return schemaError(keyPath, 'enum exceeds limit ' + MAX_SCHEMA_CONTAINER + ' entries');
	    }
	    out = [];
	    cost = 2;
	    for (i = 0; i < value.length; i += 1) {
	      descriptor = Object.getOwnPropertyDescriptor(value, String(i));
	      if (!descriptor || descriptor.get || descriptor.set) {
	        return schemaError(keyPath, 'enum must not contain holes or accessors');
	      }
	      child = cloneJson(descriptor.value, depth + 1, schemaPath(keyPath, String(i)), context);
	      if (child.error) {
	        return child;
	      }
	      out.push(child.value);
	      cost += child.cost + (i > 0 ? 1 : 0);
	      if (cost > MAX_SCHEMA_CHARS) {
	        return schemaError(keyPath, 'exceeds serialized schema size limit ' + MAX_SCHEMA_CHARS);
	      }
	    }
	    return { value: out, cost: cost };
	  }
	  if (key === 'const') {
	    return cloneJson(value, depth + 1, keyPath, context);
	  }
	  if (key === 'minimum' || key === 'maximum' || key === 'exclusiveMinimum' || key === 'exclusiveMaximum') {
	    if (!isFiniteNumber(value)) {
	      return schemaError(keyPath, key + ' must be a finite number');
	    }
	    return { value: value, cost: JSON.stringify(value).length };
	  }
	  if (key === 'multipleOf') {
	    if (!isFiniteNumber(value) || value <= 0) {
	      return schemaError(keyPath, 'multipleOf must be a finite number greater than zero');
	    }
	    return { value: value, cost: JSON.stringify(value).length };
	  }
	  if (key === 'minLength' || key === 'maxLength' || key === 'minItems' || key === 'maxItems' ||
	      key === 'minProperties' || key === 'maxProperties') {
	    if (!isNonNegativeInteger(value)) {
	      return schemaError(keyPath, key + ' must be a non-negative integer');
	    }
	    return { value: value, cost: JSON.stringify(value).length };
	  }
	  if (key === 'uniqueItems') {
	    if (typeof value !== 'boolean') {
	      return schemaError(keyPath, 'uniqueItems must be a boolean');
	    }
	    return { value: value, cost: value ? 4 : 5 };
	  }
	  if (key === 'allOf' || key === 'anyOf' || key === 'oneOf') {
	    return cloneSchemaArray(key, value, depth, keyPath, context);
	  }
	  if (key === 'not' || key === 'if' || key === 'then' || key === 'else') {
	    return cloneSchemaObject(key, value, depth, path, context);
	  }
	  if (key === 'format') {
	    if (typeof value !== 'string') {
	      return schemaError(keyPath, 'format must be a string');
	    }
	    if (value !== 'date-time') {
	      return schemaError(keyPath, 'unsupported format ' + presentKey(value) + '; only date-time is supported');
	    }
	    return { value: value, cost: JSON.stringify(value).length };
	  }
	  if (own(ANNOTATION_STRING_KEYS, key) || own(ANNOTATION_BOOLEAN_KEYS, key) ||
	      key === 'default' || key === 'examples') {
	    return cloneAnnotation(key, value, depth, path, context);
	  }
	  return unsupportedKeyword(path, key);
	}
	
	function cloneSchema(raw, depth, path, context, root) {
	  var keys;
	  var out;
	  var cost;
	  var i;
	  var key;
	  var descriptor;
	  var child;
	  var keyCost;
	
	  if (depth > MAX_SCHEMA_DEPTH) {
	    return schemaError(path, 'exceeds maximum schema depth ' + MAX_SCHEMA_DEPTH);
	  }
	  if (!isPlainObject(raw)) {
	    return schemaError(path, 'schema must be a JSON object');
	  }
	  if (context.stack.indexOf(raw) !== -1) {
	    return schemaError(path, 'schema contains a cycle');
	  }
	  context.nodes += 1;
	  if (context.nodes > MAX_SCHEMA_NODES) {
	    return schemaError(path, 'exceeds maximum schema node count ' + MAX_SCHEMA_NODES);
	  }
	  if (Object.getOwnPropertySymbols && Object.getOwnPropertySymbols(raw).length > 0) {
	    return schemaError(path, 'schema must not contain symbol keys');
	  }
	
	  keys = Object.keys(raw);
	  context.stack.push(raw);
	  out = {};
	  cost = 2;
	  for (i = 0; i < keys.length; i += 1) {
	    key = keys[i];
	    descriptor = descriptorValue(raw, key, schemaPath(path, key));
	    if (descriptor.error) {
	      context.stack.pop();
	      return descriptor;
	    }
	    child = cloneSchemaKeyword(key, descriptor.value, depth, path, context, root);
	    if (child.error) {
	      context.stack.pop();
	      return child;
	    }
	    keyCost = stringJsonCost(key, path, MAX_SCHEMA_CHARS);
	    if (keyCost.error) {
	      context.stack.pop();
	      return keyCost;
	    }
	    define(out, key, child.value);
	    cost += keyCost.cost + 1 + child.cost + (i > 0 ? 1 : 0);
	    if (cost > MAX_SCHEMA_CHARS) {
	      context.stack.pop();
	      return schemaError(path, 'exceeds serialized schema size limit ' + MAX_SCHEMA_CHARS);
	    }
	  }
	  context.stack.pop();
	
	  if (root) {
	    if (!own(out, 'type')) {
	      define(out, 'type', 'object');
	      cost += (keys.length > 0 ? 1 : 0) + JSON.stringify('type').length + 1 + JSON.stringify('object').length;
	    } else if (typeof out.type === 'string') {
	      if (out.type !== 'object') {
	        return schemaError(path, 'root schema must accept only JSON objects');
	      }
	    } else if (isArray(out.type)) {
	      if (out.type.length !== 1 || out.type[0] !== 'object') {
	        return schemaError(path, 'root schema must accept only JSON objects');
	      }
	      cost -= JSON.stringify(['object']).length - JSON.stringify('object').length;
	      out.type = 'object';
	    } else {
	      return schemaError(path, 'root schema must accept only JSON objects');
	    }
	  }
	
	  if (cost > MAX_SCHEMA_CHARS) {
	    return schemaError(path, 'exceeds serialized schema size limit ' + MAX_SCHEMA_CHARS);
	  }
	  return { node: out, cost: cost };
	}
	
	function defaultSchema() {
	  return { type: 'object', properties: {}, additionalProperties: false };
	}
	
	function sanitize(value) {
	  var context;
	  var result;
	  try {
	    if (value === undefined || value === null) {
	      return { schema: defaultSchema(), error: null };
	    }
	    context = { nodes: 0, stack: [] };
	    result = cloneSchema(value, 0, '#', context, true);
	    if (result.error) {
	      return { schema: null, error: result.error };
	    }
	    return { schema: result.node, error: null };
	  } catch (e) {
	    return { schema: null, error: 'Schema could not be processed safely' };
	  }
	}
	
	function useWork(state, amount, path) {
	  state.work += amount;
	  if (state.work > MAX_ARGS_WORK) {
	    state.fatal = true;
	    return path + ' exceeds validation work limit ' + MAX_ARGS_WORK;
	  }
	  return '';
	}
	
	function chargeChars(state, amount, path) {
	  state.chars += amount;
	  if (state.chars > MAX_ARGS_CHARS) {
	    state.fatal = true;
	    return path + ' exceeds serialized argument size limit ' + MAX_ARGS_CHARS;
	  }
	  return '';
	}
	
	function argPath(parent, key) {
	  var text = String(key);
	  if (SIMPLE_NAME.test(text)) {
	    return parent ? parent + '.' + text : text;
	  }
	  return parent ? parent + '[' + JSON.stringify(text) + ']' : '[' + JSON.stringify(text) + ']';
	}
	
	function inspectJson(value, depth, path, state) {
	  var type = typeof value;
	  var keys;
	  var descriptor;
	  var i;
	  var key;
	  var childError;
	  var cost;
	
	  if (depth > MAX_ARGS_DEPTH) {
	    state.fatal = true;
	    return path + ' exceeds maximum argument depth ' + MAX_ARGS_DEPTH;
	  }
	  childError = useWork(state, 1, path);
	  if (childError) {
	    return childError;
	  }
	
	  if (value === null) {
	    return chargeChars(state, 4, path);
	  }
	  if (type === 'string') {
	    if (value.length > MAX_ARGS_CHARS) {
	      state.fatal = true;
	      return path + ' exceeds serialized argument size limit ' + MAX_ARGS_CHARS;
	    }
	    try {
	      cost = JSON.stringify(value).length;
	    } catch (e) {
	      return path + ' contains a string that cannot be serialized';
	    }
	    return chargeChars(state, cost, path);
	  }
	  if (type === 'number') {
	    if (!isFinite(value)) {
	      return path + ' must be a finite JSON number';
	    }
	    return chargeChars(state, JSON.stringify(value).length, path);
	  }
	  if (type === 'boolean') {
	    return chargeChars(state, value ? 4 : 5, path);
	  }
	  if (type !== 'object') {
	    return path + ' must be JSON, not ' + type;
	  }
	  if (state.stack.indexOf(value) !== -1) {
	    return path + ' contains a cycle';
	  }
	  if (Object.getOwnPropertySymbols && Object.getOwnPropertySymbols(value).length > 0) {
	    return path + ' must not contain symbol keys';
	  }
	
	  if (isArray(value)) {
	    if (value.length > MAX_ARGS_ARRAY_ITEMS) {
	      state.fatal = true;
	      return path + ' exceeds array item limit ' + MAX_ARGS_ARRAY_ITEMS;
	    }
	    childError = chargeChars(state, 2, path);
	    if (childError) {
	      return childError;
	    }
	    state.stack.push(value);
	    for (i = 0; i < value.length; i += 1) {
	      descriptor = Object.getOwnPropertyDescriptor(value, String(i));
	      if (!descriptor || descriptor.get || descriptor.set) {
	        state.stack.pop();
	        return argPath(path, String(i)) + ' must not be a hole or accessor';
	      }
	      if (i > 0) {
	        childError = chargeChars(state, 1, path);
	        if (childError) {
	          state.stack.pop();
	          return childError;
	        }
	      }
	      childError = inspectJson(descriptor.value, depth + 1, argPath(path, String(i)), state);
	      if (childError) {
	        state.stack.pop();
	        return childError;
	      }
	    }
	    state.stack.pop();
	    return '';
	  }
	
	  if (!isPlainObject(value)) {
	    return path + ' must be a JSON object';
	  }
	  keys = Object.keys(value);
	  if (keys.length > MAX_ARGS_OBJECT_PROPERTIES) {
	    state.fatal = true;
	    return path + ' exceeds object property limit ' + MAX_ARGS_OBJECT_PROPERTIES;
	  }
	  childError = chargeChars(state, 2, path);
	  if (childError) {
	    return childError;
	  }
	  state.stack.push(value);
	  for (i = 0; i < keys.length; i += 1) {
	    key = keys[i];
	    descriptor = descriptorValue(value, key, argPath(path, key));
	    if (descriptor.error) {
	      state.stack.pop();
	      return argPath(path, key) + ' must not be an accessor';
	    }
	    if (key.length > MAX_ARGS_CHARS) {
	      state.stack.pop();
	      state.fatal = true;
	      return path + ' contains an oversized property name';
	    }
	    try {
	      cost = JSON.stringify(key).length;
	    } catch (e) {
	      state.stack.pop();
	      return path + ' contains a property name that cannot be serialized';
	    }
	    childError = chargeChars(state, cost + 1 + (i > 0 ? 1 : 0), path);
	    if (childError) {
	      state.stack.pop();
	      return childError;
	    }
	    childError = inspectJson(descriptor.value, depth + 1, argPath(path, key), state);
	    if (childError) {
	      state.stack.pop();
	      return childError;
	    }
	  }
	  state.stack.pop();
	  return '';
	}
	
	function valueMatchesType(value, type) {
	  if (type === 'null') {
	    return value === null;
	  }
	  if (type === 'array') {
	    return isArray(value);
	  }
	  if (type === 'object') {
	    return isPlainObject(value);
	  }
	  if (type === 'string') {
	    return typeof value === 'string';
	  }
	  if (type === 'boolean') {
	    return typeof value === 'boolean';
	  }
	  if (type === 'number') {
	    return typeof value === 'number' && isFinite(value);
	  }
	  if (type === 'integer') {
	    return typeof value === 'number' && isFinite(value) && Math.floor(value) === value;
	  }
	  return false;
	}
	
	function typeMatches(value, schemaType) {
	  var i;
	  if (typeof schemaType === 'string') {
	    return valueMatchesType(value, schemaType);
	  }
	  if (isArray(schemaType)) {
	    for (i = 0; i < schemaType.length; i += 1) {
	      if (valueMatchesType(value, schemaType[i])) {
	        return true;
	      }
	    }
	  }
	  return false;
	}
	
	function typeDescription(schemaType) {
	  var i;
	  var parts;
	  if (typeof schemaType === 'string') {
	    return schemaType;
	  }
	  if (!isArray(schemaType)) {
	    return 'the required type';
	  }
	  parts = [];
	  for (i = 0; i < schemaType.length; i += 1) {
	    parts.push(String(schemaType[i]));
	  }
	  return parts.join(' or ');
	}
	
	function unicodeLength(value) {
	  var length = 0;
	  var i;
	  var code;
	  for (i = 0; i < value.length; i += 1) {
	    code = value.charCodeAt(i);
	    if (code >= 0xD800 && code <= 0xDBFF && i + 1 < value.length) {
	      code = value.charCodeAt(i + 1);
	      if (code >= 0xDC00 && code <= 0xDFFF) {
	        i += 1;
	      }
	    }
	    length += 1;
	  }
	  return length;
	}
	
	function isLeapYear(year) {
	  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
	}
	
	function daysInMonth(year, month) {
	  if (month === 2) {
	    return isLeapYear(year) ? 29 : 28;
	  }
	  if (month === 4 || month === 6 || month === 9 || month === 11) {
	    return 30;
	  }
	  return 31;
	}
	
	function isDateTime(value) {
	  var match;
	  var year;
	  var month;
	  var day;
	  var hour;
	  var minute;
	  var second;
	  var offsetHour;
	  var offsetMinute;
	
	  if (typeof value !== 'string' || value.length < 20 || value.length > 64) {
	    return false;
	  }
	  match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})[Tt]([0-9]{2}):([0-9]{2}):([0-9]{2})(\.[0-9]+)?([Zz]|([+-])([0-9]{2}):([0-9]{2}))$/.exec(value);
	  if (!match) {
	    return false;
	  }
	  year = parseInt(match[1], 10);
	  month = parseInt(match[2], 10);
	  day = parseInt(match[3], 10);
	  hour = parseInt(match[4], 10);
	  minute = parseInt(match[5], 10);
	  second = parseInt(match[6], 10);
	  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
	    return false;
	  }
	  if (hour > 23 || minute > 59 || second > 60) {
	    return false;
	  }
	  if (match[9]) {
	    offsetHour = parseInt(match[10], 10);
	    offsetMinute = parseInt(match[11], 10);
	    if (offsetHour > 23 || offsetMinute > 59) {
	      return false;
	    }
	  }
	  return true;
	}
	
	function deepEqual(left, right, state, depth, path) {
	  var keys;
	  var index;
	  var key;
	  var descriptor;
	  var child;
	  var i;
	  var workError;
	
	  if (depth > MAX_ARGS_DEPTH) {
	    state.fatal = true;
	    return { equal: false, error: path + ' exceeds maximum comparison depth ' + MAX_ARGS_DEPTH };
	  }
	  workError = useWork(state, 1, path);
	  if (workError) {
	    return { equal: false, error: workError };
	  }
	
	  if (left === right) {
	    return { equal: true, error: '' };
	  }
	  if (left === null || right === null || typeof left !== typeof right) {
	    return { equal: false, error: '' };
	  }
	  if (typeof left !== 'object') {
	    return { equal: false, error: '' };
	  }
	  if (isArray(left) !== isArray(right)) {
	    return { equal: false, error: '' };
	  }
	  if (isArray(left)) {
	    if (left.length !== right.length) {
	      return { equal: false, error: '' };
	    }
	    for (i = 0; i < left.length; i += 1) {
	      child = deepEqual(left[i], right[i], state, depth + 1, argPath(path, String(i)));
	      if (child.error || !child.equal) {
	        return child;
	      }
	    }
	    return { equal: true, error: '' };
	  }
	  if (!isPlainObject(left) || !isPlainObject(right)) {
	    return { equal: false, error: '' };
	  }
	  keys = Object.keys(left);
	  if (keys.length !== Object.keys(right).length) {
	    return { equal: false, error: '' };
	  }
	  for (index = 0; index < keys.length; index += 1) {
	    key = keys[index];
	    if (!own(right, key)) {
	      return { equal: false, error: '' };
	    }
	    descriptor = descriptorValue(left, key, path);
	    if (descriptor.error) {
	      state.fatal = true;
	      return { equal: false, error: path + ' contains an accessor' };
	    }
	    child = deepEqual(descriptor.value, right[key], state, depth + 1, argPath(path, key));
	    if (child.error || !child.equal) {
	      return child;
	    }
	  }
	  return { equal: true, error: '' };
	}
	
	function canonicalSignature(value, state, depth, path) {
	  var type = typeof value;
	  var keys;
	  var parts;
	  var i;
	  var key;
	  var descriptor;
	  var child;
	  var workError;
	  var sortWork;
	
	  if (depth > MAX_ARGS_DEPTH) {
	    state.fatal = true;
	    return { signature: '', error: path + ' exceeds maximum comparison depth ' + MAX_ARGS_DEPTH };
	  }
	  workError = useWork(state, 1, path);
	  if (workError) {
	    return { signature: '', error: workError };
	  }
	
	  if (value === null) {
	    return { signature: 'null', error: '' };
	  }
	  if (type === 'number') {
	    return { signature: 'number:' + JSON.stringify(value), error: '' };
	  }
	  if (type === 'boolean') {
	    return { signature: 'boolean:' + (value ? 'true' : 'false'), error: '' };
	  }
	  if (type === 'string') {
	    return { signature: 'string:' + JSON.stringify(value), error: '' };
	  }
	  if (isArray(value)) {
	    parts = [];
	    for (i = 0; i < value.length; i += 1) {
	      child = canonicalSignature(value[i], state, depth + 1, argPath(path, String(i)));
	      if (child.error) {
	        return child;
	      }
	      parts.push(child.signature);
	    }
	    return { signature: 'array:[' + parts.join(',') + ']', error: '' };
	  }
	  if (!isPlainObject(value)) {
	    state.fatal = true;
	    return { signature: '', error: path + ' must be a JSON value' };
	  }
	  keys = Object.keys(value);
	  sortWork = keys.length > 1 ? keys.length * Math.ceil(Math.log(keys.length) / Math.LN2) : keys.length;
	  workError = useWork(state, sortWork, path);
	  if (workError) {
	    return { signature: '', error: workError };
	  }
	  keys.sort();
	  parts = [];
	  for (i = 0; i < keys.length; i += 1) {
	    key = keys[i];
	    descriptor = descriptorValue(value, key, path);
	    if (descriptor.error) {
	      state.fatal = true;
	      return { signature: '', error: path + ' contains an accessor' };
	    }
	    child = canonicalSignature(descriptor.value, state, depth + 1, argPath(path, key));
	    if (child.error) {
	      return child;
	    }
	    parts.push(JSON.stringify(key) + ':' + child.signature);
	  }
	  return { signature: 'object:{' + parts.join(',') + '}', error: '' };
	}
	
	function enumMatches(value, schema, path, state, depth) {
	  var i;
	  var child;
	  var candidates;
	
	  for (i = 0; i < schema.enum.length; i += 1) {
	    child = deepEqual(value, schema.enum[i], state, depth + 1, path);
	    if (child.error) {
	      return { matched: false, error: child.error };
	    }
	    if (child.equal) {
	      return { matched: true, error: '' };
	    }
	  }
	  candidates = [];
	  for (i = 0; i < schema.enum.length; i += 1) {
	    candidates.push(JSON.stringify(schema.enum[i]));
	  }
	  return { matched: false, error: path + ' must be one of ' + candidates.join(', ') };
	}
	
	function validateValue(value, schema, path, state, depth, root) {
	  var error;
	  var i;
	  var child;
	  var propertyKeys;
	  var key;
	  var descriptor;
	  var matches;
	  var matchCount;
	  var itemSchema;
	  var seenUniqueItems;
	  var required;
	  var properties;
	  var quotient;
	  var roundedQuotient;
	  var multipleTolerance;
	
	  if (!isPlainObject(schema)) {
	    state.fatal = true;
	    return 'Sanitized schema is invalid';
	  }
	  if (depth > MAX_ARGS_DEPTH) {
	    state.fatal = true;
	    return path + ' exceeds maximum validation depth ' + MAX_ARGS_DEPTH;
	  }
	  error = useWork(state, 1, path);
	  if (error) {
	    return error;
	  }
	
	  if (schema.type !== undefined && !typeMatches(value, schema.type)) {
	    if (root) {
	      return 'Arguments must be a JSON object';
	    }
	    return path + ' must be of type ' + typeDescription(schema.type);
	  }
	
	  if (schema.enum !== undefined) {
	    child = enumMatches(value, schema, path, state, depth);
	    if (child.error) {
	      return child.error;
	    }
	  }
	
	  if (own(schema, 'const')) {
	    child = deepEqual(value, schema.const, state, depth + 1, path);
	    if (child.error) {
	      return child.error;
	    }
	    if (!child.equal) {
	      return path + ' must equal ' + JSON.stringify(schema.const);
	    }
	  }
	
	  if (typeof value === 'number') {
	    if (schema.minimum !== undefined && value < schema.minimum) {
	      return path + ' must be ' + schema.minimum + ' or greater';
	    }
	    if (schema.maximum !== undefined && value > schema.maximum) {
	      return path + ' must be ' + schema.maximum + ' or less';
	    }
	    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
	      return path + ' must be greater than ' + schema.exclusiveMinimum;
	    }
	    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) {
	      return path + ' must be less than ' + schema.exclusiveMaximum;
	    }
	    if (schema.multipleOf !== undefined) {
	      if (Math.floor(schema.multipleOf) === schema.multipleOf) {
	        if (value % schema.multipleOf !== 0) {
	          return path + ' must be a multiple of ' + schema.multipleOf;
	        }
	      } else {
	        quotient = value / schema.multipleOf;
	        if (!isFinite(quotient) || (quotient === 0 && value !== 0)) {
	          return path + ' cannot be safely checked as a multiple of ' + schema.multipleOf;
	        }
	        roundedQuotient = Math.round(quotient);
	        multipleTolerance = MULTIPLE_TOLERANCE_FACTOR * IEEE754_EPSILON * Math.abs(quotient);
	        if (multipleTolerance > MULTIPLE_TOLERANCE_CAP) {
	          multipleTolerance = MULTIPLE_TOLERANCE_CAP;
	        }
	        if (Math.abs(quotient - roundedQuotient) > multipleTolerance) {
	          return path + ' must be a multiple of ' + schema.multipleOf;
	        }
	      }
	    }
	  }
	
	  if (typeof value === 'string') {
	    if (schema.minLength !== undefined && unicodeLength(value) < schema.minLength) {
	      return path + ' must have length ' + schema.minLength + ' or greater';
	    }
	    if (schema.maxLength !== undefined && unicodeLength(value) > schema.maxLength) {
	      return path + ' exceeds max length ' + schema.maxLength;
	    }
	    if (schema.format === 'date-time' && !isDateTime(value)) {
	      return path + ' must be a valid RFC3339 date-time';
	    }
	  }
	
	  if (isArray(value)) {
	    if (schema.minItems !== undefined && value.length < schema.minItems) {
	      return path + ' must contain at least ' + schema.minItems + ' item(s)';
	    }
	    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
	      return path + ' must contain no more than ' + schema.maxItems + ' item(s)';
	    }
	    itemSchema = schema.items;
	    if (itemSchema === false && value.length > 0) {
	      return path + ' must not contain items';
	    }
	    if (isPlainObject(itemSchema)) {
	      for (i = 0; i < value.length; i += 1) {
	        error = validateValue(value[i], itemSchema, argPath(path, String(i)), state, depth + 1, false);
	        if (error) {
	          return error;
	        }
	      }
	    }
	    if (schema.uniqueItems === true) {
	      seenUniqueItems = Object.create(null);
	      for (i = 0; i < value.length; i += 1) {
	        child = canonicalSignature(value[i], state, depth + 1, argPath(path, String(i)));
	        if (child.error) {
	          return child.error;
	        }
	        if (own(seenUniqueItems, child.signature)) {
	          return path + ' must contain unique items';
	        }
	        seenUniqueItems[child.signature] = true;
	      }
	    }
	  }
	
	  if (isPlainObject(value)) {
	    propertyKeys = Object.keys(value);
	    if (schema.minProperties !== undefined && propertyKeys.length < schema.minProperties) {
	      return path + ' must contain at least ' + schema.minProperties + ' properties';
	    }
	    if (schema.maxProperties !== undefined && propertyKeys.length > schema.maxProperties) {
	      return path + ' must contain no more than ' + schema.maxProperties + ' properties';
	    }
	
	    required = isArray(schema.required) ? schema.required : [];
	    for (i = 0; i < required.length; i += 1) {
	      if (!own(value, required[i])) {
	        return 'Missing required argument: ' + argPath(path, required[i]);
	      }
	    }
	
	    properties = isPlainObject(schema.properties) ? schema.properties : {};
	    for (i = 0; i < propertyKeys.length; i += 1) {
	      key = propertyKeys[i];
	      descriptor = descriptorValue(value, key, path);
	      if (descriptor.error) {
	        state.fatal = true;
	        return argPath(path, key) + ' must not be an accessor';
	      }
	      if (own(properties, key)) {
	        error = validateValue(descriptor.value, properties[key], argPath(path, key), state, depth + 1, false);
	        if (error) {
	          return error;
	        }
	      } else if (schema.additionalProperties === false) {
	        return 'Unsupported argument: ' + argPath(path, key);
	      } else if (isPlainObject(schema.additionalProperties)) {
	        error = validateValue(descriptor.value, schema.additionalProperties, argPath(path, key), state, depth + 1, false);
	        if (error) {
	          return error;
	        }
	      }
	    }
	  }
	
	  if (isArray(schema.allOf)) {
	    for (i = 0; i < schema.allOf.length; i += 1) {
	      error = validateValue(value, schema.allOf[i], path, state, depth + 1, root);
	      if (error) {
	        return error;
	      }
	    }
	  }
	
	  if (isArray(schema.anyOf)) {
	    matches = 0;
	    for (i = 0; i < schema.anyOf.length; i += 1) {
	      error = validateValue(value, schema.anyOf[i], path, state, depth + 1, root);
	      if (error && state.fatal) {
	        return error;
	      }
	      if (!error) {
	        matches += 1;
	        break;
	      }
	    }
	    if (matches === 0) {
	      return path + ' must match at least one allowed schema';
	    }
	  }
	
	  if (isArray(schema.oneOf)) {
	    matchCount = 0;
	    for (i = 0; i < schema.oneOf.length; i += 1) {
	      error = validateValue(value, schema.oneOf[i], path, state, depth + 1, root);
	      if (error && state.fatal) {
	        return error;
	      }
	      if (!error) {
	        matchCount += 1;
	      }
	    }
	    if (matchCount === 0) {
	      return path + ' must match exactly one allowed schema';
	    }
	    if (matchCount > 1) {
	      return path + ' matches more than one disallowed schema';
	    }
	  }
	
	  if (own(schema, 'not')) {
	    error = validateValue(value, schema.not, path, state, depth + 1, root);
	    if (error && state.fatal) {
	      return error;
	    }
	    if (!error) {
	      return path + ' must not match the disallowed schema';
	    }
	  }
	
	  if (own(schema, 'if')) {
	    error = validateValue(value, schema['if'], path, state, depth + 1, root);
	    if (error && state.fatal) {
	      return error;
	    }
	    if (!error) {
	      if (own(schema, 'then')) {
	        return validateValue(value, schema.then, path, state, depth + 1, root);
	      }
	    } else if (own(schema, 'else')) {
	      return validateValue(value, schema['else'], path, state, depth + 1, root);
	    }
	  }
	
	  return '';
	}
	
	function validate(args, schema) {
	  var state;
	  var error;
	
	  try {
	    state = { work: 0, chars: 0, fatal: false, stack: [] };
	    if (!isPlainObject(args)) {
	      return 'Arguments must be a JSON object';
	    }
	    error = inspectJson(args, 0, 'arguments', state);
	    if (error) {
	      return error;
	    }
	    if (!isPlainObject(schema)) {
	      return 'Sanitized schema is invalid';
	    }
	    error = validateValue(args, schema, 'arguments', state, 0, true);
	    return error || '';
	  } catch (e) {
	    return 'Arguments could not be validated safely';
	  }
	}
	
	module.exports = {
	  sanitize: sanitize,
	  validate: validate,
	  LIMITS: {
	    schemaChars: MAX_SCHEMA_CHARS,
	    schemaDepth: MAX_SCHEMA_DEPTH,
	    schemaNodes: MAX_SCHEMA_NODES,
	    schemaContainer: MAX_SCHEMA_CONTAINER,
	    argsChars: MAX_ARGS_CHARS,
	    argsDepth: MAX_ARGS_DEPTH,
	    argsWork: MAX_ARGS_WORK,
	    argsObjectProperties: MAX_ARGS_OBJECT_PROPERTIES,
	    argsArrayItems: MAX_ARGS_ARRAY_ITEMS
	  }
	};


/***/ }),
/* 28 */
/***/ (function(module, exports, __webpack_require__) {

	var common = __webpack_require__(17);
	
	var STORE_KEY = 'llm_thing_saved_chats_v1';
	var MAX_SAVED_CHATS = 20;
	var MAX_SAVED_CHAT_STORAGE_BYTES = 256 * 1024;
	var MAX_CHAT_TITLE_CHARS = 48;
	
	function nowMs() {
	  return (new Date()).getTime();
	}
	
	function normalizeWhitespace(value) {
	  return String(value || '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]+/g, ' ').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
	}
	
	function generateId() {
	  return String(nowMs()) + '_' + String(Math.floor(Math.random() * 1000000));
	}
	
	function copyMessages(messages) {
	  var result = [];
	  var i;
	  var message;
	  var role;
	
	  messages = messages || [];
	  for (i = 0; i < messages.length; i += 1) {
	    message = messages[i] || {};
	    role = message.role;
	    if (role !== 'user' && role !== 'assistant') {
	      continue;
	    }
	    result.push({
	      role: role,
	      content: common.truncate(String(message.content || ''), common.MAX_CHAT_HISTORY_MESSAGE_CHARS)
	    });
	  }
	
	  while (result.length > common.MAX_CHAT_HISTORY_MESSAGES) {
	    result.splice(0, 2);
	  }
	
	  return result;
	}
	
	function firstUserPrompt(messages) {
	  var i;
	
	  messages = messages || [];
	  for (i = 0; i < messages.length; i += 1) {
	    if (messages[i] && messages[i].role === 'user') {
	      return messages[i].content || '';
	    }
	  }
	
	  return '';
	}
	
	function summarizePrompt(prompt) {
	  var text = normalizeWhitespace(prompt);
	  var sentenceEnd;
	  var title;
	
	  if (!text) {
	    return 'Untitled chat';
	  }
	
	  sentenceEnd = text.search(/[.!?]/);
	  if (sentenceEnd > 8 && sentenceEnd < MAX_CHAT_TITLE_CHARS) {
	    text = text.substring(0, sentenceEnd + 1);
	  }
	
	  title = common.truncate(text, MAX_CHAT_TITLE_CHARS);
	  return title || 'Untitled chat';
	}
	
	function normalizeTimestamp(value, fallback) {
	  var number = parseInt(value, 10);
	
	  if (isNaN(number) || number <= 0) {
	    return fallback;
	  }
	
	  return number;
	}
	
	function normalizeChat(chat) {
	  var time = nowMs();
	  var messages;
	
	  if (!chat || typeof chat !== 'object') {
	    return null;
	  }
	
	  messages = copyMessages(chat.messages);
	  if (!messages.length) {
	    return null;
	  }
	
	  return {
	    id: String(chat.id || generateId()),
	    title: common.truncate(normalizeWhitespace(chat.title || summarizePrompt(firstUserPrompt(messages))), MAX_CHAT_TITLE_CHARS),
	    createdAt: normalizeTimestamp(chat.createdAt, time),
	    updatedAt: normalizeTimestamp(chat.updatedAt, time),
	    messages: messages
	  };
	}
	
	function sortNewestFirst(chats) {
	  chats.sort(function(a, b) {
	    return (b.updatedAt || 0) - (a.updatedAt || 0);
	  });
	}
	
	function utf8ByteLength(value) {
	  var bytes = 0;
	  var i;
	  var code;
	
	  for (i = 0; i < value.length; i += 1) {
	    code = value.charCodeAt(i);
	    if (code < 0x80) {
	      bytes += 1;
	    } else if (code < 0x800) {
	      bytes += 2;
	    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length && value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) {
	      bytes += 4;
	      i += 1;
	    } else {
	      bytes += 3;
	    }
	  }
	
	  return bytes;
	}
	
	function serializeStore(store) {
	  return JSON.stringify({
	    version: 1,
	    chats: store.chats
	  });
	}
	
	function loadStore() {
	  var parsed;
	  var raw;
	  var store = { version: 1, chats: [] };
	  var chats;
	  var i;
	  var chat;
	
	  try {
	    raw = localStorage.getItem(STORE_KEY) || '';
	    parsed = raw ? JSON.parse(raw) : null;
	  } catch (e) {
	    common.logDebug('saved chats parse failed');
	    return store;
	  }
	
	  chats = parsed && parsed.chats && parsed.chats.length ? parsed.chats : [];
	  for (i = 0; i < chats.length; i += 1) {
	    chat = normalizeChat(chats[i]);
	    if (chat) {
	      store.chats.push(chat);
	    }
	  }
	
	  sortNewestFirst(store.chats);
	  while (store.chats.length > MAX_SAVED_CHATS) {
	    store.chats.pop();
	  }
	
	  return store;
	}
	
	function saveStore(store) {
	  var serialized;
	
	  sortNewestFirst(store.chats);
	  while (store.chats.length > MAX_SAVED_CHATS) {
	    store.chats.pop();
	  }
	
	  serialized = serializeStore(store);
	  while (store.chats.length && utf8ByteLength(serialized) > MAX_SAVED_CHAT_STORAGE_BYTES) {
	    store.chats.pop();
	    serialized = serializeStore(store);
	  }
	
	  while (store.chats.length >= 0) {
	    try {
	      localStorage.setItem(STORE_KEY, serialized);
	      return true;
	    } catch (e) {
	      if (!store.chats.length) {
	        common.logDebug('saved chats write failed empty');
	        return false;
	      }
	      store.chats.pop();
	      serialized = serializeStore(store);
	    }
	  }
	
	  return false;
	}
	
	function findChatIndex(store, chatId) {
	  var id = String(chatId || '');
	  var i;
	
	  for (i = 0; i < store.chats.length; i += 1) {
	    if (store.chats[i].id === id) {
	      return i;
	    }
	  }
	
	  return -1;
	}
	
	function listChats() {
	  var store = loadStore();
	  var result = [];
	  var i;
	  var chat;
	
	  for (i = 0; i < store.chats.length; i += 1) {
	    chat = store.chats[i];
	    result.push({
	      id: chat.id,
	      title: chat.title,
	      updatedAt: chat.updatedAt
	    });
	  }
	
	  return result;
	}
	
	function getChat(chatId) {
	  var store = loadStore();
	  var index = findChatIndex(store, chatId);
	  var chat;
	
	  if (index === -1) {
	    return null;
	  }
	
	  chat = store.chats[index];
	  return {
	    id: chat.id,
	    title: chat.title,
	    createdAt: chat.createdAt,
	    updatedAt: chat.updatedAt,
	    messages: copyMessages(chat.messages)
	  };
	}
	
	function saveChatHistory(activeChatId, messages) {
	  var store = loadStore();
	  var index = findChatIndex(store, activeChatId);
	  var copied = copyMessages(messages);
	  var time = nowMs();
	  var chat;
	
	  if (!copied.length) {
	    return null;
	  }
	
	  if (index === -1) {
	    chat = {
	      id: generateId(),
	      title: summarizePrompt(firstUserPrompt(copied)),
	      createdAt: time,
	      updatedAt: time,
	      messages: copied
	    };
	    store.chats.push(chat);
	  } else {
	    chat = store.chats[index];
	    chat.updatedAt = time;
	    chat.messages = copied;
	    if (!chat.title) {
	      chat.title = summarizePrompt(firstUserPrompt(copied));
	    }
	  }
	
	  if (!saveStore(store) || findChatIndex(store, chat.id) === -1) {
	    return null;
	  }
	
	  return {
	    id: chat.id,
	    title: chat.title
	  };
	}
	
	function deleteChat(chatId) {
	  var store = loadStore();
	  var index = findChatIndex(store, chatId);
	
	  if (index === -1) {
	    return false;
	  }
	
	  store.chats.splice(index, 1);
	  saveStore(store);
	  return true;
	}
	
	function deleteAllChats() {
	  try {
	    localStorage.removeItem(STORE_KEY);
	  } catch (e) {
	    try {
	      localStorage.setItem(STORE_KEY, JSON.stringify({ version: 1, chats: [] }));
	    } catch (e2) {}
	  }
	}
	
	module.exports = {
	  MAX_SAVED_CHATS: MAX_SAVED_CHATS,
	  MAX_SAVED_CHAT_STORAGE_BYTES: MAX_SAVED_CHAT_STORAGE_BYTES,
	  listChats: listChats,
	  getChat: getChat,
	  saveChatHistory: saveChatHistory,
	  deleteChat: deleteChat,
	  deleteAllChats: deleteAllChats
	};


/***/ }),
/* 29 */
/***/ (function(module, exports, __webpack_require__) {

	var common = __webpack_require__(17);
	
	var STORE_KEY = 'llm_thing_endpoint_cache_v1';
	var ENVELOPE_VERSION = 1;
	var MAX_ENTRIES = 32;
	var PROTOCOLS = { 'responses': true, 'chat-completions': true, 'messages': true };
	var TERMINAL_SUFFIXES = ['/responses', '/chat/completions', '/messages'];
	var SCHEME_PATTERN = /^([A-Za-z][A-Za-z0-9+\-.]*):\/\//;
	
	function nowMs() {
	  return (new Date()).getTime();
	}
	
	function trimWhitespace(value) {
	  return String(value === undefined || value === null ? '' : value).replace(/^\s+|\s+$/g, '');
	}
	
	function isValidProtocol(protocol) {
	  return typeof protocol === 'string' && Object.prototype.hasOwnProperty.call(PROTOCOLS, protocol);
	}
	
	function stripQueryAndHash(text) {
	  var queryIndex = text.indexOf('?');
	  var hashIndex = text.indexOf('#');
	  var cutIndex;
	
	  if (queryIndex === -1 && hashIndex === -1) {
	    return text;
	  }
	  if (queryIndex === -1) {
	    cutIndex = hashIndex;
	  } else if (hashIndex === -1) {
	    cutIndex = queryIndex;
	  } else {
	    cutIndex = queryIndex < hashIndex ? queryIndex : hashIndex;
	  }
	
	  return text.substring(0, cutIndex);
	}
	
	function stripTrailingSlashes(text) {
	  while (text.length && text.charAt(text.length - 1) === '/') {
	    text = text.substring(0, text.length - 1);
	  }
	
	  return text;
	}
	
	function stripUserinfo(authority) {
	  var atIndex = authority.lastIndexOf('@');
	
	  if (atIndex === -1) {
	    return authority;
	  }
	
	  return authority.substring(atIndex + 1);
	}
	
	function stripTerminalSuffix(pathText) {
	  var i;
	  var suffix;
	  var offset;
	
	  for (i = 0; i < TERMINAL_SUFFIXES.length; i += 1) {
	    suffix = TERMINAL_SUFFIXES[i];
	    offset = pathText.length - suffix.length;
	    if (offset >= 0 && pathText.substring(offset).toLowerCase() === suffix) {
	      return pathText.substring(0, offset);
	    }
	  }
	
	  return pathText;
	}
	
	function normalizeEndpoint(endpoint) {
	  var raw = stripTrailingSlashes(stripQueryAndHash(trimWhitespace(endpoint)));
	  var schemeMatch = SCHEME_PATTERN.exec(raw);
	  var remainder;
	  var slashIndex;
	  var authority;
	  var path;
	
	  if (!raw) {
	    return '';
	  }
	
	  if (!schemeMatch) {
	    return stripTerminalSuffix(raw);
	  }
	
	  remainder = raw.substring(schemeMatch[0].length);
	  if (!remainder) {
	    return '';
	  }
	
	  slashIndex = remainder.indexOf('/');
	  if (slashIndex === -1) {
	    authority = stripUserinfo(remainder).toLowerCase();
	    if (!authority) {
	      return '';
	    }
	    return schemeMatch[1].toLowerCase() + '://' + authority;
	  }
	
	  authority = stripUserinfo(remainder.substring(0, slashIndex)).toLowerCase();
	  if (!authority) {
	    return '';
	  }
	
	  path = stripTrailingSlashes(stripTerminalSuffix(remainder.substring(slashIndex)));
	
	  return schemeMatch[1].toLowerCase() + '://' + authority + path;
	}
	
	function findEntryIndex(entries, provider, model) {
	  var i;
	
	  for (i = 0; i < entries.length; i += 1) {
	    if (entries[i].provider === provider && entries[i].model === model) {
	      return i;
	    }
	  }
	
	  return -1;
	}
	
	function sortEntryIndices(entries) {
	  var indices = [];
	  var i;
	
	  for (i = 0; i < entries.length; i += 1) {
	    indices.push(i);
	  }
	
	  indices.sort(function(a, b) {
	    var delta = (entries[b].updatedAt || 0) - (entries[a].updatedAt || 0);
	
	    if (delta !== 0) {
	      return delta;
	    }
	
	    return a - b;
	  });
	
	  return indices;
	}
	
	function pruneEntries(entries) {
	  var indices = sortEntryIndices(entries);
	  var result = [];
	  var i;
	  var j;
	  var entry;
	  var duplicate;
	
	  for (i = 0; i < indices.length && result.length < MAX_ENTRIES; i += 1) {
	    entry = entries[indices[i]];
	    duplicate = false;
	    for (j = 0; j < result.length; j += 1) {
	      if (result[j].provider === entry.provider && result[j].model === entry.model) {
	        duplicate = true;
	        break;
	      }
	    }
	    if (!duplicate) {
	      result.push(entry);
	    }
	  }
	
	  return result;
	}
	
	function normalizeStoredEntry(entry) {
	  if (!entry || typeof entry !== 'object') {
	    return null;
	  }
	  if (typeof entry.provider !== 'string' || !entry.provider) {
	    return null;
	  }
	  if (typeof entry.model !== 'string' || !entry.model) {
	    return null;
	  }
	  if (!isValidProtocol(entry.protocol)) {
	    return null;
	  }
	  if (typeof entry.updatedAt !== 'number' || !isFinite(entry.updatedAt) || entry.updatedAt <= 0) {
	    return null;
	  }
	
	  return {
	    provider: entry.provider,
	    model: entry.model,
	    protocol: entry.protocol,
	    updatedAt: entry.updatedAt
	  };
	}
	
	function loadEntries() {
	  var parsed;
	  var raw;
	  var collected = [];
	  var i;
	  var entry;
	
	  try {
	    raw = localStorage.getItem(STORE_KEY) || '';
	    parsed = raw ? JSON.parse(raw) : null;
	  } catch (e) {
	    common.logDebug('endpoint cache parse failed');
	    return [];
	  }
	
	  if (!parsed || typeof parsed !== 'object' || parsed.version !== ENVELOPE_VERSION || !Array.isArray(parsed.entries)) {
	    return [];
	  }
	
	  for (i = 0; i < parsed.entries.length; i += 1) {
	    entry = normalizeStoredEntry(parsed.entries[i]);
	    if (entry) {
	      collected.push(entry);
	    }
	  }
	
	  return pruneEntries(collected);
	}
	
	function saveEntries(entries) {
	  try {
	    localStorage.setItem(STORE_KEY, JSON.stringify({
	      version: ENVELOPE_VERSION,
	      entries: pruneEntries(entries)
	    }));
	    return true;
	  } catch (e) {
	    common.logDebug('endpoint cache write failed');
	    return false;
	  }
	}
	
	function get(endpoint, model) {
	  var provider;
	  var modelName;
	  var entries;
	  var index;
	
	  if (typeof endpoint !== 'string' || typeof model !== 'string') {
	    return '';
	  }
	
	  provider = normalizeEndpoint(endpoint);
	  modelName = trimWhitespace(model);
	  if (!provider || !modelName) {
	    return '';
	  }
	
	  entries = loadEntries();
	  index = findEntryIndex(entries, provider, modelName);
	  if (index === -1 || !isValidProtocol(entries[index].protocol)) {
	    return '';
	  }
	
	  return entries[index].protocol;
	}
	
	function remember(endpoint, model, protocol) {
	  var provider;
	  var modelName;
	  var entries;
	  var index;
	  var time;
	
	  if (typeof endpoint !== 'string' || typeof model !== 'string' || !isValidProtocol(protocol)) {
	    return false;
	  }
	
	  provider = normalizeEndpoint(endpoint);
	  modelName = trimWhitespace(model);
	  if (!provider || !modelName) {
	    return false;
	  }
	
	  entries = loadEntries();
	  time = nowMs();
	  index = findEntryIndex(entries, provider, modelName);
	  if (index !== -1) {
	    entries[index].protocol = protocol;
	    entries[index].updatedAt = time;
	  } else {
	    entries.push({
	      provider: provider,
	      model: modelName,
	      protocol: protocol,
	      updatedAt: time
	    });
	  }
	
	  return saveEntries(entries);
	}
	
	module.exports = {
	  get: get,
	  remember: remember
	};


/***/ })
/******/ ]);
//# sourceMappingURL=pebble-js-app.js.map