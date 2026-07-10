# llm_thing

Pebble watchapp that sends dictated prompts through the phone to an
OpenAI-compatible API and displays responses on the watch. Phone-side tools
support geolocation, Pebble Timeline, Pebble Health, and remote MCP servers.

## Requirements

- Pebble SDK and `pebble` command-line tool
- Node.js `^20.19.0`, `^22.13.0`, or `>=24.0.0` for automated tests
- A host C compiler such as Clang or GCC for watch-core unit tests

Install the test dependency once with:

```sh
npm install
```

## Build And Install

```sh
pebble build
pebble install --cloudpebble
```

Other install targets:

```sh
pebble install --emulator emery
pebble install --emulator emery --logs
pebble install --phone <ip>
```

`pebble build` compiles every target listed in `package.json`: `aplite`,
`basalt`, `chalk`, `diorite`, `emery`, `flint`, and `gabbro`.

## Tests

Run JavaScript, contract, DOM, and host-C unit tests:

```sh
npm test
```

Run individual suites:

```sh
npm run test:js
npm run test:c
npm run test:coverage
```

The built-bundle smoke test must run after `pebble build`:

```sh
pebble build
npm run test:bundle
```

Tests never use live API credentials, MCP servers, geolocation, Timeline, or
health data. JavaScript tests use deterministic fakes. C tests compile
`src/c/llm_core.c` on the host with warnings as errors and UndefinedBehavior
Sanitizer.

Known defects that were intentionally not changed while introducing tests are
recorded as non-gating `test.todo` cases. Passing tests describe supported
behavior; TODO tests describe desired behavior for later fixes.

## Architecture

- `src/c/llm_thing2.c`: watch UI, dictation, persistence, scrolling, health,
  saved-chat menus, vibration, and AppMessage handling.
- `src/c/llm_core.c`: Pebble-independent watch algorithms shared with host-C
  unit tests.
- `src/pkjs/index.js`: Pebble event and configuration entrypoint.
- `src/pkjs/model.js`: API request shaping, response parsing, chat history,
  reasoning, and tool-call orchestration.
- `src/pkjs/tools.js`: MCP, geolocation, Timeline, and health tools.
- `src/pkjs/watch.js`: request lifecycle, response formatting, progress, and
  AppMessage queueing/chunking.
- `src/pkjs/settings.js`: defaults, normalization, and settings persistence.
- `src/pkjs/chat_store.js`: saved-chat persistence and limits.
- `src/pkjs/config.js`: Clay configuration schema.
- `src/pkjs/mcp_servers_component.js`: custom MCP server configuration UI.
- `tests/js/`: phone-side unit, regression, contract, and DOM tests.
- `tests/c/`: host-C unit tests.
- `tests/integration/`: generated PebbleKit bundle smoke test.

## Documentation

Pebble SDK documentation: <https://developer.repebble.com/docs/>
