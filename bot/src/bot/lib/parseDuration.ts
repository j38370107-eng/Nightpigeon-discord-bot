/**
 * Parse command-style durations: 10s, 5m, 2h, 3d, 1w
 * Returns milliseconds, or null if the string is not a valid duration.
 */
export function parseDuration(input: string): number | null {
  const match = input.match(/^(\d+)(s|m|h|d|w)$/i);
  if (!match) return null;
  const value = parseInt(match[1]!, 10);
  const unit = match[2]!.toLowerCase();
  const table: Record<string, number> = {
    s: 1_000,
    m: 60 * 1_000,
    h: 60 * 60 * 1_000,
    d: 24 * 60 * 60 * 1_000,
    w: 7 * 24 * 60 * 60 * 1_000,
  };
  return value * (table[unit] ?? 0) || null;
}

export function formatDuration(ms: number): string {
  const units: { label: string; ms: number }[] = [
    { label: "week", ms: 7 * 24 * 60 * 60 * 1_000 },
    { label: "day", ms: 24 * 60 * 60 * 1_000 },
    { label: "hour", ms: 60 * 60 * 1_000 },
    { label: "minute", ms: 60 * 1_000 },
    { label: "second", ms: 1_000 },
  ];
  const parts: string[] = [];
  let rem = ms;
  for (const u of units) {
    const n = Math.floor(rem / u.ms);
    if (n > 0) {
      parts.push(`${n} ${u.label}${n !== 1 ? "s" : ""}`);
      rem -= n * u.ms;
    }
  }
  return parts.length ? parts.join(", ") : "0 seconds";
}
