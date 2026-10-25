export type SolarMode = "live" | "custom";
export interface SolarSettings {
  enabled: boolean;
  mode: SolarMode;
  utc: string;
}

// datetime-local is deliberately interpreted as UTC, never as the computer's zone.
export function parseSolarUTC(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 16) !== value
  )
    return null;
  if (date.getUTCFullYear() < 1800 || date.getUTCFullYear() > 2100) return null;
  return date;
}

export function solarDate(settings: SolarSettings, now: Date): Date {
  return settings.mode === "custom"
    ? (parseSolarUTC(settings.utc) ?? now)
    : now;
}

export function readSolarSettings(
  value: string | null,
  now: Date,
): SolarSettings {
  const defaults: SolarSettings = {
    enabled: false,
    mode: "live",
    utc: now.toISOString().slice(0, 16),
  };
  if (!value) return defaults;
  try {
    const saved: unknown = JSON.parse(value);
    if (!saved || typeof saved !== "object") return defaults;
    const s = saved as Partial<SolarSettings>;
    return {
      enabled: s.enabled === true,
      mode:
        s.mode === "custom" && typeof s.utc === "string" && parseSolarUTC(s.utc)
          ? "custom"
          : "live",
      utc:
        typeof s.utc === "string" && parseSolarUTC(s.utc)
          ? s.utc
          : defaults.utc,
    };
  } catch {
    return defaults;
  }
}
