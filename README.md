# Aula CLI (Discovery First)

This repository bootstraps a Bun + TypeScript workspace for exploring Aula's undocumented API through a real authenticated browser session.

## Packages

- `@aula/api-client`: read-only API transport + endpoint helpers. No CLI concerns.
- `@aula/cli`: command-line entrypoint that handles browser auth discovery and data fetching.

## Why Playwright

MitID 2FA requires a real browser flow. The `discover` command launches headed Chromium and lets you complete login manually. During your browsing session, it captures request/response metadata so we can build a safe, read-only API surface.

## Setup

1. Install dependencies:
   - `bun install`
2. Install Playwright browser binaries:
   - `bunx playwright install chromium`

## Commands

- Discovery session:
  - `bun run discover`
  - Optional output base directory: `bun run discover --out=.aula/discovery`
  - Optional timed mode: `bun run discover --login-wait=180 --browse-wait=240`
  - Graceful stop: press `Ctrl+C` to finalize capture files before exit
- Bootstrap IDs from your authenticated context:
  - `bun run --filter @aula/cli src/index.ts bootstrap --session=packages/aula-cli/.aula/latest-storage-state.json`
  - Saves inferred IDs and suggested flags to `.aula/bootstrap.json`
- Read-only profile context:
  - `bun run --filter @aula/cli src/index.ts me --session=packages/aula-cli/.aula/latest-storage-state.json`
- Read-only notifications:
  - `bun run --filter @aula/cli src/index.ts notifications --children=5008813,5011592 --institutions=G17143 --session=...`
- Read-only posts feed:
  - `bun run --filter @aula/cli src/index.ts posts --profiles=5008819,5008813,5011592 --limit=10 --session=...`
- Read-only messages:
  - `bun run --filter @aula/cli src/index.ts messages threads --page=0 --session=...`
  - `bun run --filter @aula/cli src/index.ts messages thread --thread-id=158049647 --page=0 --session=...`
- Read-only calendar:
  - `bun run --filter @aula/cli src/index.ts calendar important-dates --limit=11 --session=...`
  - `bun run --filter @aula/cli src/index.ts calendar events --profiles=5008819,5008813 --start='2026-03-02 00:00:00.0000+01:00' --end='2026-03-03 00:00:00.0000+01:00' --session=...`
- Read-only presence:
  - `bun run --filter @aula/cli src/index.ts presence daily-overview --children=5008813,5011592 --session=...`
  - `bun run --filter @aula/cli src/index.ts presence states --profiles=5008819,5008813 --session=...`
  - `bun run --filter @aula/cli src/index.ts presence config --children=5008813,5011592 --session=...`
  - `bun run --filter @aula/cli src/index.ts presence closed-days --institutions=G17143 --session=...`
  - `bun run --filter @aula/cli src/index.ts presence opening-hours --institutions=G17143 --start-date=2026-03-02 --end-date=2026-03-08 --session=...`
- Read-only gallery:
  - `bun run --filter @aula/cli src/index.ts gallery albums --profiles=5008813,5011592 --limit=12 --session=...`
  - `bun run --filter @aula/cli src/index.ts gallery media --album-id=4006874 --profiles=5008813,5011592 --limit=12 --session=...`
- Read-only fetch from an endpoint:
  - `bun run fetch /api/v17/... --session=.aula/latest-storage-state.json`
  - Optional query string: `--query=limit=20&offset=0`
  - Optional base URL override: `--base-url=https://www.aula.dk`

## Discovery Output

Each run writes to a timestamped directory under `.aula/discovery/`:

- `requests.ndjson`
- `responses.ndjson`
- `endpoint-catalog.json`
- `storage-state.json`
- `metadata.json`

Also writes convenience files:

- `.aula/latest-storage-state.json`
- `.aula/latest-capture-dir.txt`

## Security Notes

- Captured traffic can contain personal and school data. Treat `.aula/` as sensitive.
- Header keys like `authorization`, `cookie`, and token-like fields are redacted.
- Use this tool for read-only exploration. Mutation endpoints are intentionally out of scope.
- Never commit captured auth/session files.

## Development

- Typecheck: `bun run typecheck`
- Tests: `bun run test`
