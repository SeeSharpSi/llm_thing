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

GitHub Actions runs `npm test` and the tracked built-bundle smoke test on each
push and pull request. Known regressions should be recorded as `test.todo`
cases until fixed; the current suite has no TODO cases.

## Model Providers

The default endpoint uses the OpenAI Responses API. `API Mode` controls request
shape:

- `Auto` selects Chat Completions when the endpoint contains
  `/chat/completions`; otherwise it uses Responses.
- `Responses` and `Chat Completions` override endpoint detection for compatible
  providers.
- `Max Output Tokens` sends the provider-specific output limit when nonzero.
- `Reasoning Effort` sends a Responses reasoning-effort hint. Thinking display
  remains controlled separately.
- Web search uses the Responses hosted `web_search` tool. If a compatible
  endpoint rejects that tool, the request falls back once without it. Returned
  citation URLs are appended to the watch answer.

Model network errors, timeouts, HTTP 408, HTTP 429, and HTTP 5xx responses are
retried once. `Retry-After` is honored up to five seconds. Ordinary HTTP 4xx
responses are not retried. Unsupported native function tools are remembered for
five minutes by endpoint, API mode, and model so later requests skip the failed
native attempt.

Official OpenAI Responses requests use `store: false`. Reasoning requests also
request encrypted reasoning content so tool-loop replay remains stateless.
Compatible third-party endpoints do not receive these OpenAI-specific fields.

Chat history is limited by message count, per-message length, and a 12,000
character total. Tool output is also capped per result and across each request.

## Tools And MCP

Enabled phone tools execute automatically without confirmation prompts.
Geolocation, Timeline, Health, and each MCP server remain disabled until enabled
in settings. Use each MCP server's allowed-tool list and per-request call limit
to constrain automatic execution.

MCP uses Streamable HTTP and protocol version `2025-06-18`. The client supports
JSON and multi-event SSE responses, session IDs, negotiated capabilities,
paginated tool discovery, structured tool errors, bounded schemas/results, and
one reinitialization after an expired-session HTTP 404. Successful sessions and
tool definitions are cached in memory for five minutes. Remote servers require
HTTPS; HTTP is accepted only for localhost development.

Timeline pins are validated against Pebble's supported range of at most two
days in the past and one year in the future. Idempotent Timeline requests retry
once after transient network, timeout, HTTP 408, HTTP 429, or HTTP 5xx failures.

## Watch Transport

Phone responses are limited to 6,000 characters and sent in chunks of at most
400 UTF-8 bytes without splitting surrogate pairs. AppMessage sends retry up to
three attempts. Response chunks carry sequence indexes so the watch ignores
duplicates caused by retries, and transfer failures terminate the request with
an error instead of leaving progress active. The watch debounces full text
measurement while chunks arrive and performs a final layout when the response
is complete.

## Data Storage

Settings, API keys, MCP authorization values, custom headers, and optional saved
chats are stored by PebbleKit JS in phone `localStorage`. That storage is not an
encrypted secrets vault. Do not configure credentials on an untrusted phone,
and scope API/MCP credentials to the minimum permissions needed.

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
- `.github/workflows/ci.yml`: host JavaScript, C, and tracked-bundle CI.

## Documentation

Pebble SDK documentation: <https://developer.repebble.com/docs/>
