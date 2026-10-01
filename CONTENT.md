# Content commands and security

These additions introduce a read-only RPC allowlist, including `posts.getById` and `comments.getComments`. Authenticated API reads now use v24. The exported `client.v23` name is retained for source compatibility; it sends requests to `/api/v24/`. `discover` is now disabled to avoid capturing private traffic. Generic `fetch` is restricted to allowlisted methods at `https://www.aula.dk/api/v24/`; arbitrary hosts, paths, and write methods are rejected.

## Upgrading existing installations

Existing state directories created by older versions may have mode 0755. Before login or refresh, inspect your state directory and make it private: `chmod 700 ~/.aula-cli` (use your actual `AULA_CLI_HOME` or custom session directory). Existing directory permissions are never changed automatically. New state files are written atomically with mode 0600. Download directories must also be mode 0700 and have no symlink ancestors; on macOS, use a physical path rather than aliases such as `/tmp` or `/var`.

Requests are serialized within each client instance, not across CLI processes. Do not run simultaneous commands against the same refresh-token session. Split-login start/completion share an exclusive lock; after an interrupted process, remove `pending-login.json.lock` only once you have confirmed no login process is running.

## Posts and messages across pages

```
aula-cli posts --profiles=5001 --all --max-pages=100 --output=json
aula-cli messages threads --all --output=json
aula-cli messages thread --thread-id=123 --all --output=json
```

`--all` starts at the supplied `--index` (posts) or `--page` (messages), default zero. Posts advance by `--limit`; messages advance by page. It accepts a `data` array or a named `data.posts`, `data.threads`, or `data.messages` array. Unknown response shapes fail closed. An empty page or a source-verified explicit false `hasMorePosts`/`moreMessagesExist` flag ends the scan; short nonempty pages without such a flag do not. An empty page claiming more results fails closed. Overlapping IDs are deduplicated, keeping the first/newest fetched representation. A repeated/nonadvancing page or exhausted page limit fails rather than presenting a partial result as complete. The API may change during a scan; this is not a transactional snapshot. `messages threads --all` lists thread metadata, not every message body; use `messages thread --thread-id=... --all` for each thread.

## Detect edits and attachment metadata changes

Add `--snapshot=/private/directory/posts.json --snapshot-account=parent-a` (or a separate file for a thread). The first run reports all items as new; later runs report new/changed IDs under `revisions.changes` in JSON output. Table output also prints pagination and revision summaries. Snapshot directories must have mode 0700. Snapshot files are atomically written with mode 0600 and contain hashes, not message bodies. The explicit nonsecret account label is required; it is a user-selected namespace, not verified account identity. Never reuse an account label across Aula logins. Use distinct labels and snapshot files per account, profile selection, and thread. A mismatched stored scope is rejected. Missing items are not treated as deletions.

Hashes include supported title, subject, text, content, attachments, latest-message and modification fields. Only the observed CloudFront signing parameters `Expires`, `Signature`, and `Key-Pair-Id` are excluded, only for the verified `https://media-prod.aula.dk` origin and observed metadata paths: `profilePicture.url`, attachment `file.url` / `media.file.url`, and the five media thumbnail URL fields. This prevents renewed signed URLs from looking like edits. Authored text/HTML and explicit attachment links retain their full query strings; attachment IDs, paths, and other metadata remain significant. Feed-envelope timestamps such as `profileLastSeenPostDate` are outside per-item revision hashing. Semantic query parameters (including document/version selectors and `response-content-*`) and URL fragments remain significant. Existing snapshots are not reset, but changed hashing rules can cause a one-time difference against old hashes. Migrate only when retained old/current data proves unchanged under the new canonical rules, preserving account scope, exact item IDs, and delivered-alert deduplication; never blindly clear or rebaseline snapshots. A changed attachment identity/path or metadata is detected. Replaced bytes at the same URL with unchanged metadata cannot be detected this way; re-download and compare the reported SHA-256. Full signed URLs in other raw CLI output remain private and should not be shared.

## Find and download attachments

Save raw post/thread JSON in a private directory using a private shell umask (`umask 077`). Then:

```
aula-cli attachments list --input=/private/posts.json
```

This reports attachment objects beneath `attachments` arrays, preserving their metadata. Automatic resolution uses the current frontend's `file.url` or `media.file.url`, only when attachment status is `available` and any supplied scanning status is the frontend-known `available` or `bypassed` (unknown states are rejected; an absent scan field follows the frontend guard and is not a claim that scanning succeeded). External links and protected documents are rejected. Use the attachment's `id` (or file/media ID when no attachment ID exists):

```
aula-cli attachments download --post-id=123 --attachment-id=456 --out=/private/downloads
aula-cli attachments download --thread-id=123 --message-id=abc.123 --attachment-id=456 --out=/private/downloads
```

The parent is fetched again immediately before downloading to get a fresh signed URL. Thread lookup scans pages until the specified message is found, with a bounded `--max-pages`. The URL is neither printed nor saved as an identifier. Alternatively, store an already authorized exact fresh URL in a private text file, keeping it out of command history and logs:

```
aula-cli attachments download --url-file=/private/url.txt --out=/private/downloads
```

Only the observed `https://media-prod.aula.dk/` host is accepted. Requests never receive Aula cookies, tokens, authorization, or session headers. Redirects are rejected; other media hosts require separate verification. Expired URLs must be refreshed from Aula. Downloads have a 60-second timeout and a 25 MiB limit (including streamed responses); partial files are removed on failure. Content is stored with mode 0600 under a random `.bin` name, never a remote filename. The output directory must be private and have no symlink components. JSON reports local path, byte count, content type, and SHA-256, without the signed URL. Downloaded content is untrusted: do not execute it.

## Read PDF or DOCX text

```
aula-cli attachments extract --input=/private/downloads/attachment-ID.bin
```

PDF extraction requires the locally installed Poppler `pdftotext` executable. PDF bytes are validated and fed through stdin without a shell; extraction has a 30-second timeout and 8 MiB output limit. JSON contains text and `noExtractableText`. No text means a likely scanned document and an explicit warning. OCR is not implemented; a PDF with some text can still have scanned pages that this extractor misses. Do not claim a complete reading of image-only or mixed-content documents without visual/OCR review. Run the extractor in a restricted environment because attachments are untrusted.

DOCX extraction uses Python 3 standard-library ZIP/XML parsing through stdin, without extracting archive members, starting Office, evaluating macros, or following external references. Main document, headers, footers, footnotes, and endnotes are read. Table rows and cells are explicitly labeled, with paragraph boundaries retained. Archive member counts, expanded sizes, individual XML sizes, subprocess time, and output size are bounded; encrypted/symlink/traversal members and DTD/entity XML are rejected. Embedded images/objects, tracked-edit interpretation, OCR, and exact visual layout remain unsupported. Binary downloading itself supports PDF, DOCX, and other ordinary file types.

## Verification boundary

Tests cover sanitized collection fixtures, loop/page caps, metadata revision comparison, secure destination handling, no credential forwarding, private file modes, streamed size limits, and symlink rejection. Integration review runs these offline tests and TypeScript checks, not authenticated requests. The contributor's reported live checks are recorded separately below and have not been independently repeated during integration.

## Included private-installation hardening

These changes also include security hardening: strict API read-method/destination allowlisting, redirect rejection, private atomic state writes, sanitized CLI errors, and split-login callback validation. `login-split` is experimental; its complete browser callback flow remains unverified. A separately imported authorized session successfully refreshed and persisted rotated credentials, and subsequent v24 reads succeeded. Installing Playwright browser binaries alone does not establish a usable authenticated browser/session. Only source and sanitized tests are included, not session files or credentials.


## Single posts and comments

```
aula-cli posts get --post-id=123 --output=json
aula-cli comments --parent-id=123 --parent-type=Post --all --output=json
aula-cli comments --parent-id=456 --parent-type=Comment --all --output=json
```

Comments use `startIndex`/`limit` and always `includeReportedComments=false`. `--all` scans the selected parent's comments only. Nested replies are separate collections: use each comment ID with `--parent-type=Comment`; do not assume embedded `comments` contains every reply. `Media` is also a supported parent type. Comment output includes `commentCount`, so callers can identify reply collections to fetch. Revision snapshots are supported with the same account-scoping contract.

## Contributor-supplied public frontend evidence

- API version, `posts.getById`, and `comments.getComments` store action: https://www.aula.dk/static/js/0.191dcfd255629a3c9b83.js (`aulaApiVersion`, `ACTION_GET_POST`, `LOAD_COMMENTS`)
- Comment parent types and pagination: https://www.aula.dk/static/js/2.31971f1eb59c45024d81.js (`initComments`, `loadSubComments`, `loadMoreComments`, module 135)
- Ordinary attachment fields/status/scanning guards: https://www.aula.dk/static/js/6.c73f95020d30b359562f.js (`onAttachmentClick`, modules 268 and 347)

The comment UI also sends a local-store routing `data` object; whether the server requires it is not established from source alone. The read API wrapper uses the explicit retrieval parameters rather than inventing undocumented routing values.

Authenticated API, bootstrap, refresh, and login token requests have a 30-second request timeout. Timeout failures are not automatically retried, because an ambiguous token-refresh result may already have rotated a credential. A caller should bound the overall command/lock wait separately for scheduled use.


## Contributor-reported live verification boundary

The contributor reports successful real token refresh/persistence, v24 profile/context reads, combined guardian-and-child feed results matching the browser, a specific post detail with matching identity, automatic PDF attachment resolution/download, and its PDF text extraction. These checks were not repeated during integration. The contributor reports that the guardian feed must include the guardian institution-profile IDs together with the active child's IDs; separate profile-only calls can return empty feeds. Raw results and credentials are excluded from this deliverable.

A comment read on a post with comments disabled returned HTTP 403. The endpoint/parameters are frontend- and fixture-verified, but an accessible comment collection has not been live-verified. The command now checks a Post parent's explicit `allowComments=false` plus zero `commentCount` and reports comments disabled without calling that protected comments endpoint. Nested replies still require separate parent queries. Binary DOCX download was also live-verified by a separate check; the new DOCX extractor is fixture-tested for structural and security behavior. Browser split-login callback completion, OCR/image reading, and every possible live collection shape remain outside the verified boundary.

Download completion returns metadata only after the body is read and the file is synced/closed. Nonessential stream lock-release cleanup cannot override that result. Read, write, sync, timeout, and unencoded Content-Length mismatch failures remain errors with partial-file cleanup attempted; failed cleanup is explicitly reported rather than claiming deletion. Reader acquisition failures create no file, and failed exclusive opens never delete an existing path. Compressed response lengths are not compared against decoded bytes.
