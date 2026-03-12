import { runBootstrapCommand } from "./commands/bootstrap";
import { runCalendarCommand } from "./commands/calendar";
import { runDiscoverCommand } from "./commands/discover";
import { runFetchCommand } from "./commands/fetch";
import { runGalleryCommand } from "./commands/gallery";
import { runLoginCommand } from "./commands/login";
import { runMeCommand } from "./commands/me";
import { runMessagesCommand } from "./commands/messages";
import { runNotificationsCommand } from "./commands/notifications";
import { runPostsCommand } from "./commands/posts";
import { runPresenceCommand } from "./commands/presence";
import { getDefaultDiscoveryDir, getDefaultSessionPath } from "./shared/paths";

const printHelp = () => {
  const defaultSessionPath = getDefaultSessionPath();
  const defaultDiscoveryDir = getDefaultDiscoveryDir();
  console.log("Aula CLI");
  console.log("");
  console.log("Output format: default table, set --output=json for raw JSON.");
  console.log("");
  console.log("Commands:");
  console.log(`  login [--session=${defaultSessionPath}] [--wait=180] (OIDC login + refresh-token session)`);
  console.log(`  discover [--out=${defaultDiscoveryDir}] [--login-wait=120] [--browse-wait=180]`);
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

  if (command === "discover") {
    await runDiscoverCommand(args);
    return;
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
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
