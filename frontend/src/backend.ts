import catalog from "../../internal/world/cities.json";

export interface City {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  timezone: string;
  kind?: string;
}
export interface CityTime extends City {
  time: string;
  date: string;
  offsetSeconds: number;
}
export interface Snapshot {
  utc: string;
  cities: CityTime[];
}

declare global {
  interface Window {
    go?: { main: { App: { GetWorldState(): Promise<Snapshot> } } };
  }
}

const formatters = new Map(
  catalog.map((city) => [
    city.id,
    new Intl.DateTimeFormat("en-GB", {
      timeZone: city.timezone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hourCycle: "h23",
    }),
  ]),
);

// Browser development preview; the desktop app always uses Go + embedded tzdata.
export async function getWorldState(): Promise<Snapshot> {
  if (window.go) return window.go.main.App.GetWorldState();
  const now = new Date();
  now.setMilliseconds(0);
  return {
    utc: now.toISOString(),
    cities: catalog.map((city) => {
      const parts = Object.fromEntries(
        formatters
          .get(city.id)!
          .formatToParts(now)
          .map((p) => [p.type, p.value]),
      );
      const date = `${parts.year}-${parts.month}-${parts.day}`;
      const time = `${parts.hour}:${parts.minute}:${parts.second}`;
      return {
        ...city,
        date,
        time,
        offsetSeconds: (Date.parse(`${date}T${time}Z`) - now.getTime()) / 1000,
      };
    }),
  };
}
