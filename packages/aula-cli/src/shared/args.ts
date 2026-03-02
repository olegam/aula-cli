export const getFlagValue = (args: string[], name: string): string | undefined => {
  const prefix = `--${name}=`;
  const valueFlag = args.find((arg) => arg.startsWith(prefix));
  return valueFlag ? valueFlag.slice(prefix.length) : undefined;
};

export const getNumberFlag = (args: string[], name: string, fallback: number): number => {
  const raw = getFlagValue(args, name);
  if (!raw) {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
};

export const parseCsvNumbers = (value: string | undefined): number[] => {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((part) => Number.isFinite(part));
};

export const parseCsvStrings = (value: string | undefined): string[] => {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
};
