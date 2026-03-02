import { getNumberFlag, getFlagValue, parseCsvNumbers } from "../shared/args";
import { getBootstrapDefaults } from "../shared/bootstrap-defaults";
import { printOutput } from "../shared/output";
import { createClientFromArgs } from "../shared/session";

export const runGalleryCommand = async (args: string[]): Promise<void> => {
  const subcommand = args[0];
  const client = await createClientFromArgs(args);
  const defaults = await getBootstrapDefaults();

  if (subcommand === "albums") {
    const explicitProfiles = parseCsvNumbers(getFlagValue(args, "profiles"));
    const filterInstProfileIds = explicitProfiles.length ? explicitProfiles : defaults.profileIds;
    const albumsParams: Parameters<typeof client.v23.getAlbums>[0] = {
      index: getNumberFlag(args, "index", 0),
      limit: getNumberFlag(args, "limit", 12)
    };
    if (filterInstProfileIds.length) {
      albumsParams.filterInstProfileIds = filterInstProfileIds;
    }

    const result = await client.v23.getAlbums(albumsParams);
    printOutput(result, args, {
      importantFields: ["id", "title", "creationDate", "creator.name", "currentUserCanAddMedia", "currentUserCanEdit"]
    });
    return;
  }

  if (subcommand === "media") {
    const albumIdRaw = getFlagValue(args, "album-id");
    const albumId = albumIdRaw ? Number.parseInt(albumIdRaw, 10) : Number.NaN;
    if (!Number.isFinite(albumId)) {
      throw new Error("Missing or invalid --album-id=<number>");
    }

    const explicitProfiles = parseCsvNumbers(getFlagValue(args, "profiles"));
    const filterInstProfileIds = explicitProfiles.length ? explicitProfiles : defaults.profileIds;
    const mediaParams: Parameters<typeof client.v23.getMedia>[0] = {
      albumId,
      index: getNumberFlag(args, "index", 0),
      limit: getNumberFlag(args, "limit", 12)
    };
    if (filterInstProfileIds.length) {
      mediaParams.filterInstProfileIds = filterInstProfileIds;
    }

    const result = await client.v23.getMedia(mediaParams);
    printOutput(result, args, {
      importantFields: ["id", "title", "uploadedAt", "creator.name", "mediaType", "albumId"]
    });
    return;
  }

  throw new Error("Usage: gallery albums [--limit=12 --index=0 --profiles=...] OR gallery media --album-id=<id> [...]");
};
