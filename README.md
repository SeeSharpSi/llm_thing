# LLM Thing

Pebble watchapp that sends dictated prompts through the phone to an
OpenAI-compatible API and displays responses on the watch. Phone-side tools
support geolocation, Pebble Timeline, Pebble Health, read-only Pebble plugin
sources, and remote MCP servers.

## Requirements

- Pebble SDK and `pebble` command-line tool
- Plugin-source support requires Pebble SDK 4.44 or newer, `pebble` 5.1.0 or
  newer, and the latest Pebble mobile app
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

`pebble build` compiles every target listed in `package.json`: `basalt`,
`chalk`, `diorite`, `emery`, `flint`, and `gabbro`.

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

GitHub Actions and Forgejo Actions both run `npm test` and the tracked
built-bundle smoke test on each push and pull request. Known regressions should
be recorded as `test.todo` cases until fixed; the current suite has no TODO
cases.

## Model Providers

The default endpoint uses the OpenAI Responses API. `API Mode` controls request
shape:

- `Auto` infers the protocol from the configured endpoint suffix:
  `/responses` uses Responses, `/chat/completions` uses Chat Completions, and
  `/messages` uses Messages. Any other path defaults to Responses and is never
  rewritten to a guessed endpoint.
- `Responses`, `Chat Completions`, and `Messages` pin one request format for
  compatible providers and disable auto rotation.
- `Messages` sends the Anthropic Messages body (`system`, `messages`,
  `max_tokens`, Anthropic-shaped tools) authenticated with `x-api-key` and an
  `anthropic-version` header; it expects a compatible `/v1/messages`-style
  endpoint.
- When `Auto` is selected and the configured path ends in one of the three
  known suffixes above, an exact HTTP 500 rotates the same request across the
  other protocol endpoints once each. The first successful protocol is
  remembered per normalized provider endpoint/base path and model so later
  requests try it first.
  Other 5xx statuses, network errors, timeouts, HTTP 408, and HTTP 429 keep
  the normal single retry on the same endpoint instead of rotating.
- `Max Output Tokens` sends the provider-specific output limit when nonzero.
- `Reasoning Effort` sends a Responses reasoning-effort hint. Thinking display
  remains controlled separately.
- Web Fetch exposes phone-side `web_fetch` for bounded HTTP(S) page reading.
  It returns normalized Markdown by character offset and limit.

Requests are single-shot; streaming is not used. Model network errors,
timeouts, HTTP 408, HTTP 429, and HTTP 5xx responses are retried once as
described above. `Retry-After` is honored up to five seconds. Ordinary HTTP 4xx
responses are not retried. Unsupported native function tools are remembered for
five minutes by endpoint, API mode, and model so later requests skip the failed
native attempt.

Official OpenAI Responses requests use `store: false`. Reasoning requests also
request encrypted reasoning content so tool-loop replay remains stateless.
Compatible third-party endpoints do not receive these OpenAI-specific fields.

Model choices load from the phone's saved cache when settings open, so showing
settings does not wait for a provider request. Choose **Save & Refresh Models**
to save current settings, close the settings page, and refresh the model list;
reopen settings to select the updated list. Manual model entry remains
available. Cached lists are bounded and scoped to the configured models
endpoint and API credential identity; raw API keys are not stored in the model
cache. Failed refreshes retain the last successful list and show failure status
when settings reopen.

Chat history is limited by message count, per-message length, and a 12,000
character total. Tool output is also capped per result and across each request.
Structured tool results remain valid JSON when capped; plain-text results may be
truncated with a marker.

Memory search and the Timeline pin list return `{items, hasMore, nextCursor}`
pages. Memory search defaults to four items, and Timeline listing defaults to
five; callers may request larger bounded pages. Pass `nextCursor` unchanged on
the next call, keeping memory query unchanged. Cursors expire after 30 minutes
and are rejected when their query or underlying dataset changes. Each serialized
page stays within 6,000 characters. Legacy Timeline titles and times over field
limits are explicitly shortened with `titleTruncated` or `timeTruncated`.

## Tools And MCP

Enabled phone tools execute automatically without confirmation prompts.
Geolocation, Timeline, Health, and each MCP server remain disabled until enabled
in settings. Plugin Sources are also opt-in; each source is selected by plugin
UUID, category, and item. Use each MCP server's allowed-tool list and per-request
call limit to constrain automatic execution.

Within one model tool batch, independent built-in `web_fetch` reads run with a
maximum concurrency of two. Results retain model call order. Every other tool,
including MCP, memory, geolocation, Timeline, Health, and plugin sources, stays
serial; each serial call forms a barrier before later reads start.

### Pebble plugin sources

**Plugin Sources** in settings lists installed sources when settings open.
Plugin metadata enumeration does not read personal data. Tick
individual sources to opt in; all are off by default, and at most 16 sources can
be registered. After saving, enabled read tools execute automatically within
the existing global `MaxToolCalls` limit. Plugin actions are not exposed.

To use a source, install and configure its plugin in the latest Pebble mobile
app, reopen LLM Thing settings, select the source, save, then ask a relevant
question. Reads use one-shot, short-lived subscriptions with a 15-second timeout.
Results are bounded to 6,000 characters of JSON scalar or series data, with
per-source instance/property filters and paged instance offset/limit. Bitmap
payloads are not returned. Data read from a plugin is sent to the configured LLM
provider as tool output. If access needs permission, approve it in the Pebble
app and retry. A missing plugin never silently falls back to another source.
On an older phone without the plugin API, settings show unsupported status and
retain saved selections.

Pebble's plugin guide: <https://developer.repebble.com/guides/plugins/preview/>

MCP uses Streamable HTTP and protocol version `2025-06-18`. The client supports
JSON and multi-event SSE responses, session IDs, negotiated capabilities,
paginated tool discovery, structured tool errors, bounded schemas/results, and
one reinitialization after an expired-session HTTP 404. Each server's successful
session and sanitized tool definitions are cached independently in memory for five
minutes, with bounded cache and pending-discovery sizes. Cache identity includes
server URL, credentials, custom headers, label, allowed tools, and call limit;
changing those settings starts a fresh discovery. The app warms enabled MCP
servers after startup and settings saves, and overlapping warmup and foreground
discovery share pending work. A failed server does not discard successful
results from other servers. Remote servers require HTTPS; HTTP is accepted only
for localhost development.

MCP text blocks are joined with blank lines. Text-only results stay plain text;
structured-only results stay JSON. Mixed results use a bounded JSON envelope
with `mcpResult: true`, `text`, and `structuredContent`, so both are available to
every model provider. Embedded resource text is included; image, audio, resource
references, and unknown blocks receive explicit summaries without copying binary
payloads. Each result is capped at 6,000 characters and all results share a
12,000-character model-context budget. When a mixed result exceeds its available
space, fitting structured content is kept before text is shortened; oversized
structured content becomes an explicit omission object. MCP `isError` results
remain tool errors.

Timeline pins are validated against Pebble's supported range of at most two
days in the past and one year in the future. When available, the app uses
`Pebble.insertTimelinePin(pin)` and `Pebble.deleteTimelinePin(id)` directly,
without a Timeline token or HTTP request. Pins belong to the originating phone,
which syncs them to its paired watch. The methods return no delivery
acknowledgement, so tool results report that the local call completed without
claiming that the pin reached the watch. If the matching direct method is
unavailable, the app falls back to the Timeline HTTP API; those idempotent
requests retry once after transient network, timeout, HTTP 408, HTTP 429, or
HTTP 5xx failures.

Local pins support reminders, but ignore `createNotification`,
`updateNotification`, `actions`, `primaryColor`, `secondaryColor`, and
`backgroundColor`. Successful LLM-created pins are persisted phone-side (up to
64). Use `pebble_timeline_create_pin` or `pebble_timeline_create_reminder` only
to create new pins; both generate ids and reject supplied ids. To edit an
existing app-created pin, call `pebble_timeline_list_pins`, then pass a listed
id to `pebble_timeline_edit_pin`. Edits change only supplied fields and preserve
all other stored fields; the API receives the complete updated pin under its
existing id.

`pebble_timeline_create_reminder` creates a scheduled Pebble Timeline reminder
notification attached to a pin; it does not create an OS/system alarm. Supply
`reminderTime` for an exact notification time, `remindMinutesBefore` for relative
timing, or neither to use the pin's `time`. Local pin acceptance has no watch
delivery acknowledgement, so it does not confirm that a reminder notification
was delivered.

For edits, empty strings clear supported optional text fields such as `subtitle`
and `body`; `locationName` is required for weather pins. Empty strings cannot
clear integer or enum fields. Empty icon strings reset icons to defaults; an
empty reminder title resets to the pin title. To remove scheduled reminders,
set `clearReminder: true`; do not combine it with `reminderTime` or
`remindMinutesBefore`. Either reminder mode replaces the other (`0` means pin
time). `clearReminder: false` does not restore a removed reminder; supply a
reminder mode to add one again.

## Request Controls And Recovery

While a request runs, the watch shows its current stage or tool, compact tool
history, and elapsed seconds. Press **BACK** to cancel. **SELECT** is ignored
while work is active; after an eligible error, the watch shows `SELECT retry`.
Errors appear under a labeled **Error** heading. Cancellation stops remaining
work but cannot undo a side effect already completed by a phone-side tool.

Retry reuses the failed prompt and existing conversation history. Setup errors
can be retried after correcting phone settings. If a model request fails before
any tool runs, retry starts the model request again. If a failure happens after
tool execution begins, retry sends recorded bounded tool results to the model
for a final answer only; it does not execute tools again. A failed watch
delivery retries the already prepared response without another model or tool
request. Retry capsules are capped at 64 KiB, 4,096 nodes, and 32 levels; retry
is disabled when complete recovery data cannot fit. Canceled requests and stale
retry actions are rejected.

## Watch Transport

Phone responses are limited to 6,000 characters and sent in chunks of at most
400 UTF-8 bytes without splitting surrogate pairs. AppMessage sends retry up to
three attempts. Response chunks carry sequence indexes so the watch ignores
duplicates caused by retries, and transfer failures terminate the request with
an error instead of leaving progress active. The watch debounces full text
measurement while chunks arrive and performs a final layout when the response
is complete.

## Response Sound

Enable **Response Sound** under **Watch Display** in the app's settings to play
Herdr's completion sound when a successful response finishes. The toggle is
off by default and is saved on both the phone and watch. Playback respects
Quiet Time and system speaker mute, and stops when dictation starts or the app
closes. Duplicate or stale response messages do not replay the sound.

Speaker playback is supported on `emery` and `flint`. The 1.08-second sound is
bundled as a raw PCM resource and streamed through a small buffer. Its source,
conversion instructions, and upstream license are in `resources/audio/`.

## Health Info

The optional Health Info tool lets the model request only health data relevant
to a question. It supports totals, hourly or daily values, personal baselines,
heart-rate statistics, and recorded activity or sleep sessions for ranges up
to seven days. Heart-rate minimum and maximum values depend on recent data the
Pebble Health API makes available.

Health Info stays disabled by default. Enabling it allows requested health data
to be sent to the configured model provider. Raw per-minute movement,
orientation, and light records are not exposed.

## Settings Backup

**Settings Backup** in the app settings copies all non-secret settings to the
clipboard as JSON and can import a pasted backup. API keys, MCP authorization
tokens, custom header values, and Pebble Memory notes are not exported. Import
fills the configuration form; tap **Save Settings** to apply it. Imported API
keys are ignored, and existing MCP credentials are kept for servers with a
matching URL when the imported values are blank. Endpoint URLs are exported as
entered, so do not embed credentials in them.

## Data Storage

Settings, API keys, MCP authorization values, custom headers, optional saved
chats, and LLM-created timeline pin records (for editable same-ID replacement)
are stored by PebbleKit JS in phone `localStorage`. That storage is not an
encrypted secrets vault. Do not configure credentials on an untrusted phone,
and scope API/MCP credentials to the minimum permissions needed.

## Architecture

- `src/c/llm_thing2.c`: watch UI, dictation, persistence, scrolling, health,
  saved-chat menus, vibration, and AppMessage handling.
- `src/c/llm_core.c`: Pebble-independent watch algorithms shared with host-C
  unit tests.
- `src/c/speaker_feedback.c`: optional completion sound playback and cleanup.
- `src/pkjs/index.js`: Pebble event and configuration entrypoint.
- `src/pkjs/model.js`: API request shaping, response parsing, chat history,
  reasoning, and tool-call orchestration.
- `src/pkjs/tools.js`: MCP, geolocation, Timeline, and health tools.
- `src/pkjs/watch.js`: request lifecycle, response formatting, progress, and
  AppMessage queueing/chunking.
- `src/pkjs/settings.js`: defaults, normalization, and settings persistence.
- `src/pkjs/chat_store.js`: saved-chat persistence and limits.
- `src/pkjs/timeline_store.js`: LLM-created timeline pin persistence for
  full-replacement edits.
- `src/pkjs/config.js`: Clay configuration schema.
- `src/pkjs/mcp_servers_component.js`: custom MCP server configuration UI.
- `src/pkjs/settings_io_component.js`: non-secret settings export/import UI.
- `tests/js/`: phone-side unit, regression, contract, and DOM tests.
- `tests/c/`: host-C unit tests.
- `tests/integration/`: generated PebbleKit bundle smoke test.
- `.github/workflows/ci.yml` and `.forgejo/workflows/ci.yml`: host JavaScript, C, and tracked-bundle CI on GitHub Actions and Forgejo Actions.

## Documentation

Pebble SDK documentation: <https://developer.repebble.com/docs/>
