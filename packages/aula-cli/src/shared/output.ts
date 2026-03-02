export type OutputFormat = "table" | "json";

type PrintOutputOptions = {
  importantFields?: string[];
};

const MAX_CELL_LENGTH = 40;

const getOutputFormat = (args: string[]): OutputFormat => {
  const outputFlag = args.find((arg) => arg.startsWith("--output="));
  const format = outputFlag ? outputFlag.slice("--output=".length) : "table";
  return format === "json" ? "json" : "table";
};

const getExtraFields = (args: string[]): string[] => {
  const fieldsFlag = args.find((arg) => arg.startsWith("--fields="));
  if (!fieldsFlag) {
    return [];
  }
  return fieldsFlag
    .slice("--fields=".length)
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);
};

const shouldIncludeAllFields = (extraFields: string[]): boolean => {
  return extraFields.some((field) => field === "all" || field === "*");
};

const truncate = (value: string): string => {
  if (value.length <= MAX_CELL_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_CELL_LENGTH)}...`;
};

const simplifyText = (value: string): string => {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const formatDateNoTimezone = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const summarizeObjectArray = (value: unknown[]): string | undefined => {
  const nameKeys = ["name", "fullName", "displayName", "shortName", "title"];
  const names: string[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      return undefined;
    }

    const record = entry as Record<string, unknown>;
    let foundName: string | undefined;
    for (const key of nameKeys) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.trim()) {
        foundName = candidate.trim();
        break;
      }
    }

    if (!foundName) {
      return undefined;
    }
    names.push(foundName);
  }

  return names.length ? names.join(", ") : undefined;
};

const formatCell = (field: string, value: unknown): string | number | boolean | null => {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (/(date|time)/i.test(field)) {
      return truncate(formatDateNoTimezone(value));
    }
    return truncate(simplifyText(value));
  }

  if (value === undefined) {
    return "";
  }

  if (Array.isArray(value)) {
    const names = summarizeObjectArray(value);
    if (names) {
      return truncate(simplifyText(names));
    }
  }

  return truncate(simplifyText(JSON.stringify(value)));
};

const getValueByPath = (row: unknown, path: string): unknown => {
  if (!row || typeof row !== "object") {
    return undefined;
  }

  const steps = path.split(".");
  let current: unknown = row;
  for (const step of steps) {
    if (!current || typeof current !== "object" || !(step in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[step];
  }

  if (current && typeof current === "object" && !Array.isArray(current)) {
    const record = current as Record<string, unknown>;
    if (typeof record.html === "string") {
      return record.html;
    }
    if (typeof record.text === "string") {
      return record.text;
    }
  }

  return current;
};

const collectPaths = (value: unknown, basePath = "", depth = 0, maxDepth = 2): string[] => {
  if (!value || typeof value !== "object") {
    return basePath ? [basePath] : [];
  }

  if (depth >= maxDepth || Array.isArray(value)) {
    return basePath ? [basePath] : [];
  }

  const paths: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = basePath ? `${basePath}.${key}` : key;
    paths.push(...collectPaths(child, childPath, depth + 1, maxDepth));
  }

  return paths;
};

const getRowsFromValue = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value || typeof value !== "object") {
    return [value];
  }

  const responseLike = value as { data?: unknown };
  if (responseLike.data !== undefined) {
    return getRowsFromValue(responseLike.data);
  }

  const firstArrayEntry = Object.values(value).find((entry) => Array.isArray(entry));
  if (Array.isArray(firstArrayEntry)) {
    return firstArrayEntry;
  }

  return [value];
};

const pickFields = (rows: unknown[], importantFields: string[], extraFields: string[]): string[] => {
  const allPaths = new Set<string>();
  for (const row of rows) {
    for (const path of collectPaths(row)) {
      allPaths.add(path);
    }
  }

  const available = [...allPaths];
  if (!available.length) {
    return ["value"];
  }

  if (shouldIncludeAllFields(extraFields)) {
    return available;
  }

  const selected = new Set<string>();
  for (const field of [...importantFields, ...extraFields]) {
    if (available.includes(field)) {
      selected.add(field);
    }
  }

  if (!selected.size) {
    const heuristics = available.filter((field) =>
      /id|name|title|time|date|status|subject|message|group|institution|child/i.test(field)
    );
    for (const field of heuristics.slice(0, 8)) {
      selected.add(field);
    }
  }

  if (!selected.size) {
    selected.add(available[0] as string);
  }

  return [...selected];
};

const printSkippedFields = (rows: unknown[], shownFields: string[], extraFields: string[]): void => {
  const allPaths = new Set<string>();
  for (const row of rows) {
    for (const path of collectPaths(row)) {
      allPaths.add(path);
    }
  }

  const skipped = [...allPaths].filter((path) => !shownFields.includes(path));
  if (shouldIncludeAllFields(extraFields)) {
    console.log("Showing all fields.");
    return;
  }

  console.log(`Shown fields: ${shownFields.join(", ")}`);
  if (!skipped.length) {
    console.log("Skipped fields: none");
    return;
  }
  console.log(`Skipped fields (${skipped.length}): ${skipped.join(", ")}`);
  console.log("Use --fields=fieldA,fieldB or --fields=all to include more.");
};

const printStatusIfPresent = (value: unknown): void => {
  if (!value || typeof value !== "object") {
    return;
  }

  const responseLike = value as { status?: { code?: number; message?: string } };
  if (!responseLike.status) {
    return;
  }

  console.table([
    {
      statusCode: responseLike.status.code ?? "",
      statusMessage: responseLike.status.message ?? ""
    }
  ]);
};

const printTable = (value: unknown, args: string[], options: PrintOutputOptions): void => {
  const rows = getRowsFromValue(value);
  if (!rows.length) {
    console.log("(no rows)");
    return;
  }

  printStatusIfPresent(value);

  const importantFields = options.importantFields ?? [];
  const extraFields = getExtraFields(args);
  const fields = pickFields(rows, importantFields, extraFields);

  const tableRows = rows.map((row) => {
    const entry: Record<string, string | number | boolean | null> = {};
    for (const field of fields) {
      const rawValue = field === "value" ? row : getValueByPath(row, field);
      entry[field] = formatCell(field, rawValue);
    }
    return entry;
  });

  console.table(tableRows);
  printSkippedFields(rows, fields, extraFields);
};

export const printOutput = (value: unknown, args: string[], options: PrintOutputOptions = {}): void => {
  const format = getOutputFormat(args);
  if (format === "json") {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  printTable(value, args, options);
};
