import { safeErrorMessage } from "./shared/errors";
import { runCommentsCommand } from "./commands/comments";
import { runAttachmentsCommand } from "./commands/attachments";
import { runSplitLoginCommand } from "./commands/login-split";
import { runBootstrapCommand } from "./commands/bootstrap";
import { runCalendarCommand } from "./commands/calendar";
import { runFetchCommand } from "./commands/fetch";
import { runGalleryCommand } from "./commands/gallery";
import { runLoginCommand } from "./commands/login";
import { runMeCommand } from "./commands/me";
import { runMessagesCommand } from "./commands/messages";
import { runNotificationsCommand } from "./commands/notifications";
import { runPostsCommand } from "./commands/posts";
import { runPresenceCommand } from "./commands/presence";
import { getDefaultSessionPath } from "./shared/paths";

const printHelp = () => {
  const defaultSessionPath = getDefaultSessionPath();
  console.log("Aula CLI");
  console.log("");
  console.log("Output format: default table, set --output=json for raw JSON.");
  console.log("");
  console.log("Commands:");
  console.log("  posts get --post-id=123 | comments --parent-id=123 [--parent-type=Post|Media|Comment] [--all]");
  console.log("  attachments download --post-id=123 --attachment-id=456 --out=private-dir (or --thread-id=... --message-id=...)");
  console.log("  attachments list --input=posts.json | download --url-file=private-url.txt --out=private-directory | extract --input=local-pdf");
  console.log("  posts/messages: --all [--max-pages=100] [--snapshot=private-snapshot.json --snapshot-account=unique-account-label]");
  console.log("  login-split start | complete [--callback-file=private-file] (callback otherwise read from stdin)");
  console.log(`  login [--session=${defaultSessionPath}] [--wait=180] (OIDC login + refresh-token session)`);
  console.log("  discover (disabled: traffic capture can expose private content)");
  console.log("  bootstrap [--session=...] [--base-url=...]");
  console.log(`  me [--session=${defaultSessionPath}] [--base-url=https://www.aula.dk]`);
  console.log("  notifications [--children=1,2] [--institutions=CODE] [--session=...]");
  console.log("  posts [--profiles=5001,5002] [--index=0] [--limit=10] [--session=...]");
  console.log("  messages threads [--page=0] [--session=...]");
  console.log("  messages thread --thread-id=123 [--page=0] [--session=...]");
  console.log("  calendar important-dates [--limit=11] [--include-today=false] [--session=...]");
  console.log("  calendar events [--profiles=5001,5002] [--start='...'] [--end='...'] [--session=...]");
  console.log("  presence daily-overview [--children=1,2] [--session=...]");
  console.log("  presence states [--profiles=5001,5002] [--session=...]");
  console.log("  presence config [--children=1,2] [--session=...]");
  console.log("  presence closed-days [--institutions=CODE] [--session=...]");
  console.log("  presence opening-hours [--institutions=CODE] --start-date=YYYY-MM-DD --end-date=YYYY-MM-DD [--session=...]");
  console.log("  gallery albums [--profiles=5001,5002] [--limit=12 --index=0] [--session=...]");
  console.log("  gallery media --album-id=123 [--profiles=5001,5002] [--limit=12 --index=0] [--session=...]");
  console.log(`  fetch <path> [--session=${defaultSessionPath}] [--base-url=https://www.aula.dk] [--query=a=b&c=d]`);
};

const main = async () => {
  const [, , command, ...args] = Bun.argv;

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "comments") {
    await runCommentsCommand(args);
    return;
  }

  if (command === "attachments") {
    await runAttachmentsCommand(args);
    return;
  }

  if (command === "login-split") {
    await runSplitLoginCommand(args);
    return;
  }

  if (command === "discover") {
    throw new Error("Discovery capture is disabled in this private read-only installation.");
  }

  if (command === "login") {
    await runLoginCommand(args);
    return;
  }

  if (command === "fetch") {
    await runFetchCommand(args);
    return;
  }

  if (command === "bootstrap") {
    await runBootstrapCommand(args);
    return;
  }

  if (command === "me") {
    await runMeCommand(args);
    return;
  }

  if (command === "notifications") {
    await runNotificationsCommand(args);
    return;
  }

  if (command === "posts") {
    await runPostsCommand(args);
    return;
  }

  if (command === "messages") {
    await runMessagesCommand(args);
    return;
  }

  if (command === "calendar") {
    await runCalendarCommand(args);
    return;
  }

  if (command === "presence") {
    await runPresenceCommand(args);
    return;
  }

  if (command === "gallery") {
    await runGalleryCommand(args);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
};

main().catch((error) => {
  // Never print third-party exception details: fetch/Playwright errors may embed credentials.
  console.error(safeErrorMessage(error));
  process.exit(1);
});
