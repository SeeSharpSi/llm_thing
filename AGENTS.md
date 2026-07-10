# Repository Instructions

## Project Shape
- Pebble SDK watchapp, not watchface: `package.json` has `pebble.watchapp.watchface` set to `false`; app metadata, platforms, resources, and message keys live under `pebble`.
- Watch-side entrypoint is `src/c/llm_thing2.c`: UI, SELECT dictation, scroll text, persisted font size, AppMessage request/response handling.
- Pebble-independent watch algorithms live in `src/c/llm_core.c` and `src/c/llm_core.h`; keep this module free of Pebble SDK types so `tests/c/llm_core_test.c` can compile on the host.
- Phone-side entrypoint is `src/pkjs/index.js`: Clay settings, `localStorage`, OpenAI-compatible requests, optional phone-side MCP tool calls, AppMessage chunking back to watch.
- Settings UI is `src/pkjs/config.js` plus custom Clay component `src/pkjs/mcp_servers_component.js`; every `messageKey` must exist in `package.json` `pebble.messageKeys`.
- Keep most logic on the phone side; watch C code should stay minimal and focus on UI, dictation, persistence, and AppMessage plumbing.

## Architecture Rules
- Put as much processing and logic as possible on the phone side in `src/pkjs/index.js`.
- Prefer phone-side handling for model request shaping, settings normalization, chat history, tool discovery/execution, MCP calls, built-in geolocation/timeline tools, response truncation, Markdown-to-watch marker formatting, and AppMessage chunking.
- Keep watch-side C thin: UI rendering, SELECT dictation, persisted display/vibe settings, `RequestId` stale-response checks, scrolling, progress display, vibration, and AppMessage plumbing.
- Do not move logic into watch C unless Pebble APIs, memory limits, rendering, or platform support require it.

## Commands
- Run `npm test` for JavaScript, contract, DOM, and host-C unit tests.
- Run `npm run test:js` or `npm run test:c` for focused suites; `npm run test:coverage` reports JavaScript coverage without enforcing a threshold.
- Primary verification: `pebble build` builds every platform in `package.json` `targetPlatforms` (`aplite`, `basalt`, `chalk`, `diorite`, `emery`, `flint`, `gabbro`).
- After `pebble build`, run `npm run test:bundle` against the newly generated `build/pebble-js-app.js`.
- After every update, run `pebble build` and then `pebble install --cloudpebble`.
- Emulator install: `pebble install --emulator emery`; add `--logs` to stream logs during install, or use `pebble logs --emulator emery`.
- Phone install: `pebble install --phone <ip>`.

## References
- Pebble SDK documentation: `https://developer.repebble.com/docs/`.

## Toolchain And Generated Files
- `wscript` compiles `src/c/**/*.c`; bundles `src/pkjs/**/*.js`, `src/pkjs/**/*.json`, and `src/common/**/*.js`; JS entry is `src/pkjs/index.js`.
- `build/` and `node_modules/@rebble/clay/` are tracked in git. Do not delete or treat them as disposable; after `pebble build`, check `git status` for generated changes.
- `@rebble/clay` is pinned and vendored/tracked. `jsdom` is a test-only dependency; run `npm install` when test dependencies are missing, then inspect tracked Clay changes before keeping them.

## Test Architecture
- JavaScript tests use Node's built-in `node:test` runner under `tests/js/`; keep production PebbleKit JS ES5-compatible even though tests run on modern Node.
- Use deterministic fakes from `tests/js/helpers/` for `Pebble`, `XMLHttpRequest`, `localStorage`, timers, and external APIs. Tests must not call live model, MCP, Timeline, geolocation, or health services.
- `tests/js/contracts.test.js` checks configuration/default/message-key and watch text-marker contracts.
- `tests/js/mcp_servers_component.test.js` uses `jsdom`; other suites should not require a browser environment unless DOM behavior is under test.
- `tests/c/run.sh` compiles only Pebble-independent `llm_core` code with the host compiler, warnings as errors, and UndefinedBehavior Sanitizer.
- `tests/integration/bundle.test.js` executes the generated PebbleKit bundle and therefore must run after `pebble build`.
- Known unfixed regressions are represented by `test.todo` cases. Do not convert them into assertions for broken behavior; enable them when implementing the corresponding fix.

## Implementation Gotchas
- Keep PebbleKit JS compatible with current ES5-style code: `var`, callbacks, `XMLHttpRequest`; no Babel/transpiler config exists.
- AppMessage payload size matters: phone chunks responses with `CHUNK_SIZE = 400` and caps text at `MAX_RESPONSE_CHARS = 6000`; watch buffer is `RESPONSE_BUFFER_SIZE = 8192`.
- Request IDs prevent stale responses: C ignores incoming messages whose `RequestId` differs from current `s_request_id`; preserve this when changing response flow.
- Dictation is behind `#if defined(PBL_MICROPHONE)`; keep non-microphone platforms building and showing unsupported text.
- For new watch/phone messages, add keys in `package.json` `pebble.messageKeys`, then rebuild so generated `MESSAGE_KEY_*` and JS wrappers update.
- Color settings (`TextColor`, `BackgroundColor`, `PromptBackgroundColor`, `BoldTextColor`) are stored as hex integers, synced from phone to watch, and persisted watch-side. On black-and-white platforms any non-`0x000000` value renders as white.
- API requests use Responses format by default; if `Endpoint` contains `/chat/completions`, `src/pkjs/index.js` switches to Chat Completions payload shape.
- MCP tools are phone-side only: settings store servers in `McpServersJson`; `src/pkjs/index.js` initializes remote MCP, exposes tools as `server__tool`, asks model for JSON tool calls, then sends final text to watch.
