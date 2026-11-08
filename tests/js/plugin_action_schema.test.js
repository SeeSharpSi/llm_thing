'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var vm = require('node:vm');
var schemaSupport = require('../../src/pkjs/plugin_action_schema');

var sanitize = schemaSupport.sanitize;
var validate = schemaSupport.validate;
var LIMITS = schemaSupport.LIMITS;

function sanitized(schema) {
  var result = sanitize(schema);
  assert.equal(result.error, null, result.error || 'expected schema to sanitize');
  assert.ok(result.schema);
  return result.schema;
}

function expectSchemaError(schema, pattern) {
  var result = sanitize(schema);
  assert.equal(result.schema, null);
  assert.equal(typeof result.error, 'string');
  assert.ok(result.error.length > 0);
  if (pattern) {
    assert.match(result.error, pattern);
  }
}

function expectValid(args, schema, message) {
  var error = validate(args, sanitized(schema));
  assert.equal(error, '', message || 'expected valid arguments');
}

function expectInvalid(args, schema, pattern) {
  var error = validate(args, sanitized(schema));
  assert.equal(typeof error, 'string');
  assert.ok(error.length > 0, 'expected invalid arguments');
  if (pattern) {
    assert.match(error, pattern);
  }
}

function deepSchema(depth) {
  var schema = { type: 'string' };
  var i;
  for (i = 0; i < depth; i += 1) {
    schema = { type: 'object', properties: { child: schema } };
  }
  return schema;
}

function deepArgs(depth) {
  var value = 1;
  var i;
  for (i = 0; i < depth; i += 1) {
    value = { child: value };
  }
  return value;
}

var HUE_SCHEMA = {
  type: 'object',
  properties: {
    item: { type: 'string', enum: ['home_lights', 'room_lights', 'light'] },
    instanceId: { type: 'string' },
    on: { type: 'boolean' }
  },
  required: ['item', 'instanceId', 'on']
};

var TODOIST_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', minLength: 1 },
    due_iso: { type: 'string', format: 'date-time' },
    timezone: { type: 'string', minLength: 1 },
    notify_before_ms: { type: 'integer', minimum: 0 },
    instanceId: { type: 'string', minLength: 1 }
  },
  required: ['title'],
  allOf: [
    { if: { required: ['due_iso'] }, then: { required: ['timezone'] } }
  ],
  additionalProperties: false
};

test('missing schema defaults to a closed empty object schema', function() {
  var expected = { type: 'object', properties: {}, additionalProperties: false };
  assert.deepEqual(sanitize(undefined), { schema: expected, error: null });
  assert.deepEqual(sanitize(), { schema: { type: 'object', properties: {}, additionalProperties: false }, error: null });
  assert.deepEqual(sanitize(null), { schema: expected, error: null });
  assert.equal(validate({}, expected), '');
  assert.match(validate({ extra: true }, expected), /Unsupported argument/);
  assert.match(validate(undefined, expected), /JSON object/);
});

test('explicit empty root schema is normalized to object and keeps JSON Schema extra-property defaults', function() {
  var schema = sanitized({});
  assert.deepEqual(schema, { type: 'object' });
  assert.equal(validate({ anything: 1 }, schema), '');

  expectSchemaError({ type: 'string' }, /root schema must accept only JSON objects/);
  expectSchemaError({ type: ['object', 'null'] }, /root schema must accept only JSON objects/);
  expectSchemaError([], /schema must be a JSON object/);
  assert.equal(sanitized({ type: ['object'] }).type, 'object');
});

test('real Hue action schema accepts booleans and rejects malformed arguments', function() {
  expectValid({ item: 'home_lights', instanceId: 'abc', on: false }, HUE_SCHEMA);
  expectValid({ item: 'light', instanceId: 'abc', on: true }, HUE_SCHEMA);
  expectInvalid({ item: 'light', instanceId: 'abc' }, HUE_SCHEMA, /Missing required argument: arguments\.on/);
  expectInvalid({ item: 'lights', instanceId: 'abc', on: true }, HUE_SCHEMA, /must be one of/);
  expectInvalid({ item: 'light', instanceId: 'abc', on: 0 }, HUE_SCHEMA, /must be of type boolean/);
  expectInvalid(null, HUE_SCHEMA, /JSON object/);
});

test('real Todoist schema rejects due_iso without timezone and preserves zero values', function() {
  expectValid({ title: 'Water plants', notify_before_ms: 0 }, TODOIST_SCHEMA);
  expectValid({
    title: 'Water plants',
    due_iso: '2026-11-08T09:30:00Z',
    timezone: 'Europe/London',
    notify_before_ms: 0
  }, TODOIST_SCHEMA);

  expectInvalid({ title: 'Water plants', due_iso: '2026-11-08T09:30:00Z' }, TODOIST_SCHEMA,
    /Missing required argument: arguments\.timezone/);
  expectInvalid({ title: '' }, TODOIST_SCHEMA, /length 1 or greater/);
  expectInvalid({ title: 'Water plants', notify_before_ms: -1 }, TODOIST_SCHEMA, /0 or greater/);
  expectInvalid({ title: 'Water plants', extra: true }, TODOIST_SCHEMA, /Unsupported argument/);
  expectInvalid({ title: 'Water plants', due_iso: 'not-a-date' }, TODOIST_SCHEMA, /date-time/);
});

test('required uses own property presence and accepts false, zero, empty, and null values when allowed', function() {
  var schema = {
    type: 'object',
    properties: {
      flag: { type: 'boolean' },
      count: { type: 'number' },
      zero: { type: 'integer' },
      empty: { type: 'string' },
      nullable: { type: ['string', 'null'] }
    },
    required: ['flag', 'count', 'zero', 'empty', 'nullable'],
    additionalProperties: false
  };

  expectValid({ flag: false, count: 0, zero: 0, empty: '', nullable: null }, schema);
  expectValid({ flag: false, count: 0, zero: 0, empty: '', nullable: 'x' }, schema);
  expectInvalid({ count: 0, zero: 0, empty: '', nullable: null }, schema, /Missing required argument: arguments\.flag/);
  expectInvalid({ flag: false, count: 0, zero: 0, empty: '', nullable: 1 }, schema, /must be of type string or null/);
  expectInvalid({ flag: false, count: 0, zero: 0, empty: null, nullable: null }, schema, /must be of type string/);

  expectValid({ empty: '' }, { type: 'object', properties: { empty: { type: 'string', minLength: 0 } } });
  expectInvalid({ empty: '' }, { type: 'object', properties: { empty: { type: 'string', minLength: 1 } } }, /length 1/);
});

test('nested schemas and all composition keywords behave correctly', function() {
  expectValid({ value: 5 }, {
    type: 'object',
    properties: { value: { allOf: [{ type: 'number' }, { minimum: 1 }, { maximum: 10 }] } }
  });
  expectInvalid({ value: 11 }, {
    type: 'object',
    properties: { value: { allOf: [{ type: 'number' }, { maximum: 10 }] } }
  }, /10 or less/);
  expectValid({ value: 'ok' }, {
    type: 'object',
    properties: { value: { anyOf: [{ type: 'integer' }, { type: 'string', minLength: 2 }] } }
  });
  expectInvalid({ value: 'x' }, {
    type: 'object',
    properties: { value: { anyOf: [{ type: 'integer' }, { type: 'string', minLength: 2 }] } }
  }, /at least one/);
  expectValid({ value: 20 }, {
    type: 'object',
    properties: {
      value: { oneOf: [{ type: 'number', minimum: 10 }, { type: 'number', maximum: 5 }] }
    }
  });
  expectInvalid({ value: 7 }, {
    type: 'object',
    properties: {
      value: { oneOf: [{ type: 'number', minimum: 10 }, { type: 'number', maximum: 5 }] }
    }
  }, /exactly one/);
  expectInvalid({ value: 7 }, {
    type: 'object',
    properties: {
      value: { oneOf: [{ type: 'number' }, { type: 'number', maximum: 10 }] }
    }
  }, /more than one/);
  expectInvalid({ value: 'no' }, {
    type: 'object',
    properties: { value: { not: { type: 'string' } } }
  }, /must not match/);

  var conditional = {
    type: 'object',
    properties: { kind: { type: 'string' } },
    if: { properties: { kind: { const: 'a' } }, required: ['kind'] },
    then: { required: ['a'] },
    else: { required: ['b'] }
  };
  expectValid({ kind: 'a', a: true }, conditional);
  expectInvalid({ kind: 'a' }, conditional, /arguments\.a/);
  expectValid({ kind: 'b', b: true }, conditional);
  expectInvalid({ kind: 'b' }, conditional, /arguments\.b/);
});

function repeatedArraySchema(copies) {
  var branches = [];
  var itemSchema = {
    type: 'object',
    properties: { values: { type: 'array', items: { type: 'number' } } }
  };
  var i;
  for (i = 0; i < copies; i += 1) {
    branches.push(itemSchema);
  }
  return branches;
}

test('validation work exhaustion through if and anyOf is never treated as a false condition', function() {
  var values = [];
  var i;
  var argumentsValue;
  var ifSchema;
  var anyOfBranches = [];

  for (i = 0; i < LIMITS.argsArrayItems; i += 1) {
    values.push(i);
  }
  argumentsValue = { values: values };

  ifSchema = sanitized({
    type: 'object',
    if: { allOf: repeatedArraySchema(8) },
    then: {}
  });
  assert.match(validate(argumentsValue, ifSchema), /work limit/);

  for (i = 0; i < 7; i += 1) {
    anyOfBranches.push({
      allOf: [
        {
          type: 'object',
          properties: { values: { type: 'array', items: { type: 'number' } } }
        },
        { const: 'nope' }
      ]
    });
  }
  anyOfBranches.push({});
  assert.match(validate(argumentsValue, sanitized({ type: 'object', anyOf: anyOfBranches })), /work limit/);
});

test('enum, const, and uniqueItems use deep JSON equality for object values', function() {
  var enumSchema = {
    type: 'object',
    properties: {
      value: {
        enum: [{ a: 1, b: [2, 3] }, { a: 2 }]
      }
    }
  };
  expectValid({ value: { b: [2, 3], a: 1 } }, enumSchema);
  expectValid({ value: { a: 2 } }, enumSchema);
  expectInvalid({ value: { a: 1, b: [3, 2] } }, enumSchema, /must be one of/);

  var constSchema = {
    type: 'object',
    properties: { value: { const: { a: [1, 2], b: null } } }
  };
  expectValid({ value: { b: null, a: [1, 2] } }, constSchema);
  expectInvalid({ value: { a: [2, 1], b: null } }, constSchema, /must equal/);

  expectInvalid({ values: [{ a: 1 }, { a: 1 }] }, {
    type: 'object',
    properties: { values: { type: 'array', uniqueItems: true } }
  }, /unique items/);
  expectValid({ values: [{ a: 1 }, { a: 2 }] }, {
    type: 'object',
    properties: { values: { type: 'array', uniqueItems: true } }
  });
  expectInvalid({ values: ['a', 'a'] }, {
    type: 'object',
    properties: { values: { type: 'array', uniqueItems: true } }
  }, /unique items/);

  var uniqueValues = [];
  var i;
  for (i = 0; i < LIMITS.argsArrayItems; i += 1) {
    uniqueValues.push(i);
  }
  expectValid({ values: uniqueValues }, {
    type: 'object',
    properties: { values: { type: 'array', uniqueItems: true } }
  });
});

test('additionalProperties schemas and boolean items schemas are applied', function() {
  var extraSchema = sanitized({
    type: 'object',
    properties: { known: { type: 'string' } },
    additionalProperties: { type: 'integer' }
  });
  assert.equal(validate({ known: 'x', extra: 2 }, extraSchema), '');
  assert.match(validate({ known: 'x', extra: 'no' }, extraSchema), /integer/);

  var closedItems = sanitized({
    type: 'object',
    properties: { values: { type: 'array', items: false } }
  });
  assert.equal(validate({ values: [] }, closedItems), '');
  assert.match(validate({ values: [1] }, closedItems), /must not contain items/);

  var openItems = sanitized({
    type: 'object',
    properties: { values: { type: 'array', items: true } }
  });
  assert.equal(validate({ values: [1, 'two', null] }, openItems), '');
});

test('schema container limits are enforced without truncating constraints', function() {
  var properties = {};
  var enumValues = [];
  var i;
  var largeSchema;
  var descriptionProperties = {};

  for (i = 0; i < LIMITS.schemaContainer; i += 1) {
    properties['p' + i] = { type: 'string' };
    enumValues.push(i);
  }
  expectValid({ p0: 'x' }, { type: 'object', properties: properties, additionalProperties: false });
  assert.ok(sanitized({ type: 'object', properties: properties, additionalProperties: false }));
  assert.ok(sanitized({ type: 'object', properties: { value: { enum: enumValues.slice() } } }));

  properties['p' + LIMITS.schemaContainer] = { type: 'string' };
  expectSchemaError({ type: 'object', properties: properties }, /properties exceeds limit/);
  enumValues.push(LIMITS.schemaContainer);
  expectSchemaError({ type: 'object', properties: { value: { enum: enumValues } } }, /enum exceeds limit/);

  for (i = 0; i < LIMITS.schemaContainer; i += 1) {
    descriptionProperties['p' + i] = { type: 'string', description: '0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123' };
  }
  largeSchema = { type: 'object', properties: descriptionProperties };
  expectSchemaError(largeSchema, /serialized schema size limit/);
});

test('large annotation containers stop at the schema budget before touching later metadata', function() {
  var accesses = 0;
  var examples = new Array(LIMITS.schemaContainer);
  var result;

  examples[0] = new Array(5001).join('x');
  examples[1] = new Array(5001).join('x');
  Object.defineProperty(examples, '2', {
    enumerable: true,
    configurable: true,
    get: function() {
      accesses += 1;
      throw new Error('accessor must not be invoked');
    }
  });
  result = sanitize({ type: 'object', examples: examples });
  assert.equal(result.schema, null);
  assert.match(result.error, /serialized schema size limit/);
  assert.equal(accesses, 0);

  var accessorExamples = new Array(1);
  Object.defineProperty(accessorExamples, '0', {
    enumerable: true,
    configurable: true,
    get: function() {
      accesses += 1;
      throw new Error('accessor must not be invoked');
    }
  });
  result = sanitize({ type: 'object', examples: accessorExamples });
  assert.equal(result.schema, null);
  assert.match(result.error, /holes or accessors/);
  assert.equal(accesses, 0);

  var propertyAccesses = 0;
  var properties = {};
  Object.defineProperty(properties, 'value', {
    enumerable: true,
    configurable: true,
    get: function() {
      propertyAccesses += 1;
      throw new Error('accessor must not be invoked');
    }
  });
  result = sanitize({ type: 'object', properties: properties });
  assert.equal(result.schema, null);
  assert.match(result.error, /accessor/);
  assert.equal(propertyAccesses, 0);

  var defaultAccesses = 0;
  var defaultValue = {};
  Object.defineProperty(defaultValue, 'value', {
    enumerable: true,
    configurable: true,
    get: function() {
      defaultAccesses += 1;
      throw new Error('accessor must not be invoked');
    }
  });
  result = sanitize({ type: 'object', default: defaultValue });
  assert.equal(result.schema, null);
  assert.match(result.error, /accessor/);
  assert.equal(defaultAccesses, 0);
});

test('schema depth, node, and serialized size limits fail closed', function() {
  expectSchemaError(deepSchema(LIMITS.schemaDepth + 2), /maximum schema depth/);
  expectSchemaError({ description: new Array(8200).join('x') }, /serialized schema size limit/);

  var wideBranches = [];
  var i;
  var j;
  var prop;
  var properties = {};
  for (i = 0; i < LIMITS.schemaContainer; i += 1) {
    prop = {};
    wideBranches = [];
    for (j = 0; j < 8; j += 1) {
      wideBranches.push({});
    }
    prop.allOf = wideBranches;
    properties['p' + i] = prop;
  }
  expectSchemaError({ type: 'object', properties: properties }, /maximum schema node count/);
});

test('unsupported validation keywords and formats fail closed with useful reasons', function() {
  var keywordCases = [
    ['pattern', { pattern: '^a' }],
    ['patternProperties', { patternProperties: { '^a': { type: 'string' } } }],
    ['$ref', { $ref: 'https://example.invalid/schema.json' }],
    ['$defs', { $defs: { a: { type: 'string' } } }],
    ['definitions', { definitions: { a: { type: 'string' } } }],
    ['contains', { contains: { type: 'string' } }],
    ['propertyNames', { propertyNames: { type: 'string' } }],
    ['dependencies', { dependencies: { a: ['b'] } }],
    ['unevaluatedProperties', { unevaluatedProperties: false }],
    ['contentEncoding', { contentEncoding: 'base64' }]
  ];
  var i;
  for (i = 0; i < keywordCases.length; i += 1) {
    expectSchemaError(keywordCases[i][1], new RegExp(keywordCases[i][0].replace('$', '\\$')));
  }
  expectSchemaError({ type: 'object', properties: { value: { pattern: '^a' } } }, /Unsupported schema keyword/);
  expectSchemaError({ type: 'object', properties: { value: { format: 'email' } } }, /only date-time is supported/);
  expectSchemaError({ type: 'object', properties: { value: { format: 'date' } } }, /only date-time is supported/);
});

test('annotations are permitted and deep-cloned without sharing input state', function() {
  var raw = {
    type: 'object',
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://example.invalid/action',
    title: 'Action',
    description: 'Example action',
    default: { value: 'x' },
    examples: [{ value: 'a' }, { value: 'b' }],
    deprecated: false,
    readOnly: true,
    writeOnly: false,
    properties: { value: { type: 'string' } }
  };
  var clone = sanitized(raw);
  assert.equal(clone.$schema, raw.$schema);
  assert.equal(clone.$id, raw.$id);
  assert.equal(clone.title, raw.title);
  assert.equal(clone.description, raw.description);
  assert.deepEqual(clone.default, raw.default);
  assert.deepEqual(clone.examples, raw.examples);
  assert.equal(clone.deprecated, false);
  assert.equal(clone.readOnly, true);
  assert.equal(clone.writeOnly, false);

  raw.default.value = 'changed';
  raw.examples[0].value = 'changed';
  assert.equal(clone.default.value, 'x');
  assert.equal(clone.examples[0].value, 'a');

  clone.title = 'changed';
  assert.equal(raw.title, 'Action');

  expectSchemaError({ type: 'object', title: 4 }, /title must be a string/);
  expectSchemaError({ type: 'object', deprecated: 'yes' }, /deprecated must be a boolean/);
  expectSchemaError({ type: 'object', examples: {} }, /examples must be an array/);
});

test('hostile property names are cloned and validated safely without prototype pollution', function() {
  var raw = JSON.parse('{"type":"object","properties":{"__proto__":{"type":"string"},"constructor":{"type":"number"}},"required":["__proto__","constructor"],"additionalProperties":false}');
  var clone = sanitized(raw);
  assert.ok(Object.prototype.hasOwnProperty.call(clone.properties, '__proto__'));
  assert.ok(Object.prototype.hasOwnProperty.call(clone.properties, 'constructor'));
  assert.equal(Object.getPrototypeOf(clone.properties), Object.prototype);

  var args = JSON.parse('{"__proto__":"safe","constructor":3}');
  assert.equal(validate(args, clone), '');
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);

  expectSchemaError(JSON.parse('{"__proto__":{"type":"string"}}'), /Unsupported schema keyword/);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);

  assert.match(validate(JSON.parse('{"constructor":3}'), clone), /Missing required argument: arguments\.__proto__/);
});

test('cross-realm plain schemas and arguments are accepted without relaxing custom classes', function() {
  var crossSchema = vm.runInNewContext('({' +
    'type: "object",' +
    'properties: {' +
    'item: { type: "string", enum: ["home_lights", "room_lights", "light"] },' +
    'instanceId: { type: "string" },' +
    'on: { type: "boolean" }' +
    '},' +
    'required: ["item", "instanceId", "on"]' +
    '})');
  var hueClone = sanitized(crossSchema);
  assert.equal(validate(vm.runInNewContext('({ item: "light", instanceId: "abc", on: false })'), hueClone), '');

  var crossJsonSchema = vm.runInNewContext('JSON.parse(\'{"type":"object","properties":{"value":{"type":"string"}},"required":["value"]}\')');
  var crossJsonClone = sanitized(crossJsonSchema);
  assert.equal(validate(vm.runInNewContext('JSON.parse(\'{"value":"x"}\')'), crossJsonClone), '');

  var nullProtoSchema = vm.runInNewContext('(function() {' +
    'var properties = Object.create(null);' +
    'properties.__proto__ = { type: "string" };' +
    'properties.constructor = { type: "number" };' +
    'var schema = Object.create(null);' +
    'schema.type = "object";' +
    'schema.properties = properties;' +
    'schema.required = ["__proto__", "constructor"];' +
    'schema.additionalProperties = false;' +
    'return schema;' +
    '}())');
  var nullProtoClone = sanitized(nullProtoSchema);
  var nullProtoArgs = vm.runInNewContext('(function() {' +
    'var args = Object.create(null);' +
    'args.__proto__ = "safe";' +
    'args.constructor = 3;' +
    'return args;' +
    '}())');
  assert.equal(validate(nullProtoArgs, nullProtoClone), '');
  assert.equal(Object.prototype.polluted, undefined);

  function HostClass(value) {
    this.value = value;
  }
  expectSchemaError(new HostClass('x'), /schema must be a JSON object/);
  assert.match(validate(new HostClass('x'), sanitized({})), /Arguments must be a JSON object/);
  expectSchemaError(vm.runInNewContext('(function() { function Custom(value) { this.value = value; } return new Custom("x"); }())'), /schema must be a JSON object/);
  assert.match(validate(vm.runInNewContext('new Date(0)'), sanitized({})), /Arguments must be a JSON object/);
});

test('non-JSON values, malformed schemas, cycles, and oversized or deep arguments fail closed', function() {
  var cyclicSchema = { type: 'object', properties: {} };
  cyclicSchema.properties.self = cyclicSchema;
  expectSchemaError(cyclicSchema, /cycle/);

  var cyclicArgs = { value: 1 };
  cyclicArgs.self = cyclicArgs;
  assert.match(validate(cyclicArgs, sanitized({ type: 'object' })), /cycle/);

  expectSchemaError('{"type":"object"}', /schema must be a JSON object/);
  expectSchemaError({ type: 'object', properties: { value: { type: 'string', default: NaN } } }, /finite JSON numbers/);
  expectSchemaError({ type: 'object', properties: { value: { type: 'string', default: Infinity } } }, /finite JSON numbers/);
  expectSchemaError({ type: 'object', properties: { value: { type: 'string', default: undefined } } }, /must be JSON/);
  expectSchemaError({ type: 'object', properties: { value: { type: 'string', default: function() {} } } }, /must be JSON/);
  expectSchemaError({ type: 'object', properties: { value: { type: 'unknown' } } }, /unsupported type/);

  var anySchema = sanitized({ type: 'object', properties: { value: { type: 'number' } } });
  assert.match(validate({ value: NaN }, anySchema), /finite JSON number/);
  assert.match(validate({ value: Infinity }, anySchema), /finite JSON number/);
  assert.match(validate({ value: function() {} }, anySchema), /must be JSON/);
  assert.match(validate({ value: new Date() }, anySchema), /must be a JSON object/);
  assert.match(validate(deepArgs(LIMITS.argsDepth + 3), sanitized({ type: 'object' })), /maximum argument depth/);

  var oversized = new Array(LIMITS.argsChars + 2).join('x');
  assert.match(validate({ value: oversized }, anySchema), /serialized argument size limit/);

  var properties = {};
  var i;
  for (i = 0; i < LIMITS.argsObjectProperties + 1; i += 1) {
    properties['p' + i] = i;
  }
  assert.match(validate(properties, sanitized({ type: 'object' })), /object property limit/);

  var values = [];
  for (i = 0; i < LIMITS.argsArrayItems + 1; i += 1) {
    values.push(i);
  }
  assert.match(validate({ values: values }, anySchema), /array item limit/);
});

test('numeric, string, array, and object bounds are validated', function() {
  var numeric = {
    type: 'object',
    properties: {
      value: {
        type: 'number',
        minimum: 0,
        maximum: 10,
        multipleOf: 0.5
      }
    }
  };
  expectValid({ value: 0 }, numeric);
  expectValid({ value: 7.5 }, numeric);
  expectInvalid({ value: -0.5 }, numeric, /0 or greater/);
  expectInvalid({ value: 0.3 }, numeric, /multiple of 0.5/);
  expectInvalid({ value: 10.1 }, numeric, /10 or less/);

  var exclusive = {
    type: 'object',
    properties: {
      value: {
        type: 'number',
        exclusiveMinimum: -1,
        exclusiveMaximum: 11
      }
    }
  };
  expectValid({ value: 0 }, exclusive);
  expectInvalid({ value: -1 }, exclusive, /greater than -1/);
  expectInvalid({ value: 11 }, exclusive, /less than 11/);

  expectInvalid({ value: 'abcd' }, {
    type: 'object',
    properties: { value: { type: 'string', maxLength: 3 } }
  }, /max length 3/);
  expectValid({ value: 'ab' }, {
    type: 'object',
    properties: { value: { type: 'string', minLength: 2, maxLength: 2 } }
  });
  expectValid({ value: '\uD83D\uDE00' }, {
    type: 'object',
    properties: { value: { type: 'string', minLength: 1, maxLength: 1 } }
  });
  expectInvalid({ value: '\uD83D\uDE00' }, {
    type: 'object',
    properties: { value: { type: 'string', minLength: 2 } }
  }, /length 2 or greater/);
  expectInvalid({ value: [1, 2] }, {
    type: 'object',
    properties: { value: { type: 'array', minItems: 3 } }
  }, /at least 3/);
  expectInvalid({ value: [1, 2, 3] }, {
    type: 'object',
    properties: { value: { type: 'array', maxItems: 2 } }
  }, /no more than 2/);
  expectInvalid({ a: 1 }, {
    type: 'object',
    minProperties: 2
  }, /at least 2/);
  expectInvalid({ a: 1, b: 2 }, {
    type: 'object',
    maxProperties: 1
  }, /no more than 1/);
});

test('multipleOf uses tight floating-scale tolerance and fails closed on nonfinite quotients', function() {
  var integer = {
    type: 'object',
    properties: { value: { type: 'number', multipleOf: 1 } }
  };
  expectValid({ value: 0 }, integer);
  expectValid({ value: 1000000000 }, integer);
  expectValid({ value: 100000000000000 }, integer);
  expectValid({ value: 100000000000002 }, integer);
  expectInvalid({ value: 1000000000.5 }, integer, /multiple of 1/);
  expectInvalid({ value: 100000000000000.125 }, integer, /multiple of 1/);
  expectInvalid({ value: 1.0000001 }, integer, /multiple of 1/);
  expectInvalid({ value: 1e-16 }, integer, /multiple of 1/);

  var pair = {
    type: 'object',
    properties: { value: { type: 'number', multipleOf: 2 } }
  };
  expectValid({ value: 10 }, pair);
  expectValid({ value: -4 }, pair);
  expectValid({ value: 100000000000000 }, pair);
  expectValid({ value: 100000000000002 }, pair);
  expectInvalid({ value: 11 }, pair, /multiple of 2/);
  expectInvalid({ value: -3 }, pair, /multiple of 2/);
  expectInvalid({ value: 100000000000000.125 }, pair, /multiple of 2/);
  expectInvalid({ value: 100000000000001 }, pair, /multiple of 2/);

  var decimal = {
    type: 'object',
    properties: { value: { type: 'number', multipleOf: 0.1 } }
  };
  expectValid({ value: 0.3 }, decimal);
  expectValid({ value: 0.6 }, decimal);
  expectValid({ value: 0.7 }, decimal);
  expectInvalid({ value: 0.30000000001 }, decimal, /multiple of 0.1/);
  expectInvalid({ value: 0.35 }, decimal, /multiple of 0.1/);

  var tiny = {
    type: 'object',
    properties: { value: { type: 'number', multipleOf: 0.0000001 } }
  };
  expectValid({ value: 0.0000003 }, tiny);
  expectInvalid({ value: 0.0000003000001 }, tiny, /multiple of/);

  var tinyDivisor = {
    type: 'object',
    properties: { value: { type: 'number', multipleOf: 0.0000000000001 } }
  };
  expectValid({ value: 0.0000000000003 }, tinyDivisor);
  expectInvalid({ value: 0.00000000000035 }, tinyDivisor, /multiple of/);

  var overflow = {
    type: 'object',
    properties: { value: { type: 'number', multipleOf: 1e-320 } }
  };
  expectInvalid({ value: 1e308 }, overflow, /cannot be safely checked/);

  var underflow = {
    type: 'object',
    properties: { value: { type: 'number', multipleOf: 100000000000000.5 } }
  };
  expectInvalid({ value: 1e-308 }, underflow, /multiple of|safely checked/);
});

test('date-time format accepts RFC3339 values with timezone and rejects invalid calendars', function() {
  var schema = {
    type: 'object',
    properties: { when: { type: 'string', format: 'date-time' } },
    required: ['when'],
    additionalProperties: false
  };
  var valid = [
    '2026-11-08T09:30:00Z',
    '2024-02-29T23:59:59.999Z',
    '2024-01-01t00:00:00z',
    '2020-12-31T23:59:60+05:30',
    '2024-01-01T00:00:00-00:00',
    '2000-02-29T12:00:00+23:59'
  ];
  var invalid = [
    '2026-11-08T09:30:00',
    '2023-02-29T12:00:00Z',
    '2026-13-01T00:00:00Z',
    '2026-00-01T00:00:00Z',
    '2026-01-00T00:00:00Z',
    '2026-04-31T00:00:00Z',
    '2026-01-01T24:00:00Z',
    '2026-01-01T00:60:00Z',
    '2026-01-01T00:00:61Z',
    '2026-01-01T00:00:00+24:00',
    '2026-01-01T00:00:00+00:60',
    '2026-01-01 00:00:00Z',
    '2026-01-01T00:00:00.Z',
    '2026-01-01',
    '2026-01-01T00:00:00Z trailing'
  ];
  var i;
  for (i = 0; i < valid.length; i += 1) {
    assert.equal(validate({ when: valid[i] }, sanitized(schema)), '', valid[i]);
  }
  for (i = 0; i < invalid.length; i += 1) {
    assert.match(validate({ when: invalid[i] }, sanitized(schema)), /valid RFC3339 date-time/, invalid[i]);
  }
});

test('validate never throws for malformed inputs or unsanitized schemas', function() {
  assert.equal(typeof validate(null, {}), 'string');
  assert.equal(typeof validate('text', {}), 'string');
  assert.equal(typeof validate([], {}), 'string');
  assert.equal(typeof validate({}, null), 'string');
  assert.equal(typeof validate({}, { type: 'object', properties: null }), 'string');
  assert.equal(typeof validate({}, { type: 'object', enum: 'bad' }), 'string');
  assert.equal(typeof validate({}, { type: 'object', anyOf: 'bad' }), 'string');
  assert.doesNotThrow(function() {
    validate({ value: 1 }, { type: 'object', properties: { value: { type: 'number' } } });
  });
});
