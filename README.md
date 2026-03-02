# Aula CLI

Read-only CLI for Aula with browser-based MitID login and session reuse. Also check out the companion tool [`aula-cli-my-kids-photos`](https://github.com/olegam/aula-cli-my-kids-photos) for saving photos that contain your own kids.

Useful for integrating Aula with personal AI agents such as OpenClaw. For example tell your agent:

```
install this: https://github.com/olegam/aula-cli
let me know when you are ready to authenticate with MitID in the browser.
then test the basic endpoints for getting json data of posts, messages, calendar, galleries etc.
```

And tell your agent what behavior you want. For example:

```
setup instructions in your heartbeat to check for new aula content (messages, posts, album galleries, calendar entries etc).
keep track of the last items we have already seen. when there is new content send me a message with a short summary followed by the original content.
```

## Install

1. Install dependencies:
   - `bun install`
2. Install Playwright Chromium:
   - `bunx playwright install chromium`
3. Link the CLI command locally:
   - `cd packages/aula-cli && bun link`

After linking, you can run `aula-cli ...` directly.

## Quick Start

1. Login (or refresh expired session):
   - `aula-cli login`
   - This also refreshes and saves bootstrap IDs to `~/.aula-cli/bootstrap.json`.
2. List recent message threads:
   - `aula-cli messages threads --page=0`
3. Read messages in a specific thread:
   - `aula-cli messages thread --thread-id=<THREAD_ID> --page=0`

By default, command output is shown as a table with key fields.
- Use `--output=json` for raw JSON.
- Use `--fields=fieldA,fieldB` to include extra columns.
- Use `--fields=all` to include every available field in table mode.
- Most commands auto-use IDs from `~/.aula-cli/bootstrap.json` if `--profiles`, `--children`, or `--institutions` are omitted.
- `calendar events` defaults to a date range from today to +50 days if `--start` and `--end` are omitted.

## Main Commands

- `login [--session=~/.aula-cli/latest-storage-state.json] [--wait=180]`
- `bootstrap [--session=...] [--base-url=...] [--output=json]`
- `me [--session=...] [--output=json]`
- `notifications [--children=1,2] [--institutions=CODE] [--session=...] [--output=json]`
- `posts [--profiles=5001,5002] [--index=0] [--limit=10] [--session=...] [--output=json]`
- `messages threads [--page=0] [--session=...] [--output=json]`
- `messages thread --thread-id=123 [--page=0] [--session=...] [--output=json]`
- `calendar important-dates [--limit=11] [--include-today=false] [--session=...] [--output=json]`
- `calendar events [--profiles=5001,5002] [--start='...'] [--end='...'] [--session=...] [--output=json]`
- `presence daily-overview [--children=1,2] [--session=...] [--output=json]`
- `presence states [--profiles=5001,5002] [--session=...] [--output=json]`
- `presence config [--children=1,2] [--session=...] [--output=json]`
- `presence closed-days [--institutions=CODE] [--session=...] [--output=json]`
- `presence opening-hours [--institutions=CODE] --start-date=YYYY-MM-DD --end-date=YYYY-MM-DD [--session=...] [--output=json]`
- `gallery albums [--profiles=5001,5002] [--limit=12 --index=0] [--session=...] [--output=json]`
- `gallery media --album-id=123 [--profiles=5001,5002] [--limit=12 --index=0] [--session=...] [--output=json]`
- `fetch <path> [--session=...] [--base-url=...] [--query=a=b&c=d] [--output=json]`

## Session Files

- Default state directory: `~/.aula-cli`
- Default session path: `~/.aula-cli/latest-storage-state.json`
- Bootstrap hints path: `~/.aula-cli/bootstrap.json`
- Re-run `login` whenever session expires.
- Keep `~/.aula-cli` private; it may contain sensitive session data.
- Optional override: set `AULA_CLI_HOME=/custom/path`.

## Future Endpoint Support (Discovery)

If you want to add support for new Aula endpoints later, use discovery:

- `aula-cli discover`
- Outputs API traffic and endpoint catalog under `~/.aula-cli/discovery/...`

## Development

- Typecheck: `bun run typecheck`
- Tests: `bun run test`

## Companion tool

If your main goal is gallery filtering (for example keeping only photos that contain your own kids), use [`aula-cli-my-kids-photos`](https://github.com/olegam/aula-cli-my-kids-photos). That tool depends on this CLI for Aula authentication and gallery access, then applies local face recognition on downloaded photos.
