# Aula CLI

Read-only CLI for Aula with browser-based MitID login and session reuse.

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

## Main Commands

- `login [--session=~/.aula-cli/latest-storage-state.json] [--wait=180]`
- `bootstrap [--session=...] [--base-url=...]`
- `me [--session=...]`
- `notifications --children=1,2 --institutions=CODE [--session=...]`
- `posts --profiles=5001,5002 [--index=0] [--limit=10] [--session=...]`
- `messages threads [--page=0] [--session=...]`
- `messages thread --thread-id=123 [--page=0] [--session=...]`
- `calendar important-dates [--limit=11] [--include-today=false] [--session=...]`
- `calendar events --profiles=5001,5002 --start='...' --end='...' [--session=...]`
- `presence daily-overview --children=1,2 [--session=...]`
- `presence states --profiles=5001,5002 [--session=...]`
- `presence config --children=1,2 [--session=...]`
- `presence closed-days --institutions=CODE [--session=...]`
- `presence opening-hours --institutions=CODE --start-date=YYYY-MM-DD --end-date=YYYY-MM-DD [--session=...]`
- `gallery albums [--profiles=5001,5002] [--limit=12 --index=0] [--session=...]`
- `gallery media --album-id=123 [--profiles=5001,5002] [--limit=12 --index=0] [--session=...]`
- `fetch <path> [--session=...] [--base-url=...] [--query=a=b&c=d]`

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
