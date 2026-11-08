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
