# Repository Instructions

## Project Shape
- Pebble SDK watchapp, not watchface: `package.json` has `pebble.watchapp.watchface` set to `false`; app metadata, platforms, resources, and message keys live under `pebble`.
- Watch-side entrypoint is `src/c/llm_thing2.c`: UI, SELECT dictation, scroll text, persisted font size, AppMessage request/response handling.
- Pebble-independent watch algorithms live in `src/c/llm_core.c` and `src/c/llm_core.h`; keep this module free of Pebble SDK types so `tests/c/llm_core_test.c` can compile on the host.
- Phone-side entrypoint is `src/pkjs/index.js`: Pebble lifecycle, Clay settings, and AppMessage routing. `model.js`, `tools.js`, `settings.js`, `chat_store.js`, and `watch.js` own phone-side behavior.
- Settings UI is `src/pkjs/config.js` plus custom Clay component `src/pkjs/mcp_servers_component.js`; every `messageKey` must exist in `package.json` `pebble.messageKeys`.
- Keep most logic on the phone side; watch C code should stay minimal and focus on UI, dictation, persistence, and AppMessage plumbing.

## Architecture Rules
- Put as much processing and logic as possible in focused phone-side modules under `src/pkjs/`; keep `index.js` as thin event routing.
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
- GitHub Actions and Forgejo Actions both run `npm test` and `npm run test:bundle`; Pebble SDK builds remain a local release gate.

## References
- Pebble SDK documentation: `https://developer.repebble.com/docs/`.

## Toolchain And Generated Files
- `wscript` compiles `src/c/**/*.c`; bundles `src/pkjs/**/*.js`, `src/pkjs/**/*.json`, and `src/common/**/*.js`; JS entry is `src/pkjs/index.js`.
- Most of `build/` is tracked in git, as is `node_modules/@rebble/clay/`. Do not delete or treat them as disposable; after `pebble build`, check `git status` for generated changes.
- Exceptions to tracking: Waf locks (`lock-waf*`), `.wafpickle-*` directories, `build/c4che/`, `build/config.log`, generated `build/webpack/` config, and `node_modules/.package-lock.json` are ignored ephemeral host/package-manager state and must stay untracked.
- `@rebble/clay` is pinned and vendored/tracked. `jsdom` is a test-only dependency; run `npm install` when test dependencies are missing, then inspect tracked Clay changes before keeping them.

## Test Architecture
- JavaScript tests use Node's built-in `node:test` runner under `tests/js/`; keep production PebbleKit JS ES5-compatible even though tests run on modern Node.
- Use deterministic fakes from `tests/js/helpers/` for `Pebble`, `XMLHttpRequest`, `localStorage`, timers, and external APIs. Tests must not call live model, MCP, Timeline, geolocation, or health services.
- `tests/js/contracts.test.js` checks configuration/default/message-key and watch text-marker contracts.
- `tests/js/mcp_servers_component.test.js` uses `jsdom`; other suites should not require a browser environment unless DOM behavior is under test.
- `tests/c/run.sh` compiles only Pebble-independent `llm_core` code with the host compiler, warnings as errors, and UndefinedBehavior Sanitizer.
- `tests/integration/bundle.test.js` executes the generated PebbleKit bundle and therefore must run after `pebble build`.
- Known unfixed regressions are represented by `test.todo` cases. Do not convert them into assertions for broken behavior; enable them when implementing the corresponding fix.
- The current suite has no `test.todo` cases. Add one only for a deliberately documented regression, not as a substitute for completing new behavior.

## Implementation Gotchas
- Keep PebbleKit JS compatible with current ES5-style code: `var`, callbacks, `XMLHttpRequest`; no Babel/transpiler config exists.
- AppMessage payload size matters: phone chunks responses at no more than 400 UTF-8 bytes without splitting surrogate pairs and caps text at `MAX_RESPONSE_CHARS = 6000`; watch buffer is `RESPONSE_BUFFER_SIZE = 8192`.
- AppMessage sends retry up to three attempts. `ResponseChunkIndex` makes response retries idempotent; C resets the expected index on `ResponseReset`, ignores duplicate chunks, and preserves `RequestId` stale-response checks.
- C treats `ResponseError` and `ResponseDone` as terminal per transfer so retry duplicates do not append or vibrate twice.
- Request IDs prevent stale responses: C ignores incoming messages whose `RequestId` differs from current `s_request_id`; preserve this when changing response flow.
- Watch text layout is debounced while chunks arrive and flushed on `ResponseDone`; do not restore full text measurement after every chunk.
- Dictation is behind `#if defined(PBL_MICROPHONE)`; keep non-microphone platforms building and showing unsupported text.
- For new watch/phone messages, add keys in `package.json` `pebble.messageKeys`, then rebuild so generated `MESSAGE_KEY_*` and JS wrappers update.
- Color settings (`TextColor`, `BackgroundColor`, `PromptBackgroundColor`, `BoldTextColor`) are stored as hex integers, synced from phone to watch, and persisted watch-side. On black-and-white platforms any non-`0x000000` value renders as white.
- API requests use Responses format by default. `ApiMode` can explicitly select Responses or Chat Completions; `auto` uses `/chat/completions` endpoint detection.
- `MaxOutputTokens` is provider-shaped, and `ReasoningEffort` is Responses-only. Official OpenAI Responses requests use `store: false` and request encrypted reasoning content when reasoning is enabled.
- Model retries are limited to one retry for network errors, timeouts, HTTP 408, HTTP 429, and HTTP 5xx. Keep ordinary HTTP 4xx failures non-retryable and preserve stale-request cancellation.
- Web search is a hosted Responses `web_search` tool with one unsupported-tool fallback. Preserve citation URL extraction when changing provider parsing.
- Live and persisted history both store answer-only assistant text. Preserve count, per-message, 12,000-character history, and tool-result budgets.
- MCP tools are phone-side only: settings store servers in `McpServersJson`; `src/pkjs/tools.js` initializes remote MCP, exposes tools as `server__tool`, asks the model for tool calls, then sends final text to watch.
- MCP uses Streamable HTTP protocol `2025-06-18`, paginated discovery, multi-event SSE parsing, bounded schemas/results, HTTPS except localhost, five-minute in-memory discovery/session caching, and one session reinitialization after HTTP 404.
- Enabled tools execute automatically without confirmation prompts. Preserve built-in toggles, MCP allowed-tool lists, per-server/global call limits, schema validation, and progress visibility as guardrails.
- Timeline pin times must remain within two days in the past and one year in the future. Timeline PUT/DELETE requests may retry once because they are idempotent; do not add broad retries to non-idempotent mutations.
- Successful LLM-created timeline pins are persisted phone-side in `src/pkjs/timeline_store.js` (`llm_thing_timeline_pins_v1`, cap 64) for same-ID full-replacement edits via list/edit tools; PUT to the same `/v1/user/pins/{id}` replaces the existing pin entirely.
- `@rebble/clay` is exact-pinned at `1.0.10`, and Node.js versions are declared in `package.json` `engines`.
