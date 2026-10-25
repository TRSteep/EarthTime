import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSolarUTC, readSolarSettings, solarDate } from "./solar.ts";

test("UTC input is independent of local timezone and validates actual calendar dates", () => {
  assert.equal(
    parseSolarUTC("2024-02-29T23:30")?.toISOString(),
    "2024-02-29T23:30:00.000Z",
  );
  for (const value of [
    "2026-02-29T12:00",
    "2026-02-31T12:00",
    "2026-06-01T24:00",
    "2026-06-01T12:00Z",
    "1799-12-31T23:59",
    "2101-01-01T00:00",
    "",
  ]) {
    assert.equal(parseSolarUTC(value), null, value);
  }
});

test("live light follows the clock; custom light stays fixed across clock updates", () => {
  const now = new Date("2026-10-25T15:30:00Z");
  const settings = {
    enabled: true,
    mode: "live" as const,
    utc: "2026-06-21T12:00",
  };
  assert.equal(solarDate(settings, now).toISOString(), now.toISOString());
  assert.equal(
    solarDate({ ...settings, mode: "custom" }, now).toISOString(),
    "2026-06-21T12:00:00.000Z",
  );
});

test("malformed or outdated preferences never break startup", () => {
  const now = new Date("2026-10-25T15:30:00Z");
  for (const value of [
    null,
    "bad json",
    "null",
    "42",
    '{"mode":"custom","utc":"invalid"}',
  ]) {
    assert.deepEqual(readSolarSettings(value, now), {
      enabled: false,
      mode: "live",
      utc: "2026-10-25T15:30",
    });
  }
  assert.equal(
    readSolarSettings(
      '{"enabled":true,"mode":"custom","utc":"2026-06-21T12:00"}',
      now,
    ).mode,
    "custom",
  );
});
