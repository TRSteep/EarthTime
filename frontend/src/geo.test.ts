import { test } from "node:test";
import assert from "node:assert/strict";
import { toXYZ, sunPosition, solarCoordinates, utcOffset } from "./geo.ts";

test("texture alignment: Greenwich, east, west, north pole", () => {
  for (const [lat, lon, expected] of [
    [0, 0, [1, 0, 0]],
    [0, 90, [0, 0, -1]],
    [0, -90, [0, 0, 1]],
    [90, 0, [0, 1, 0]],
  ] as const) {
    toXYZ(lat, lon).forEach((v, i) =>
      assert.ok(Math.abs(v - expected[i]) < 1e-10),
    );
  }
});

test("equinoctial sunlight tracks noon and midnight", () => {
  const noon = sunPosition(new Date("2026-03-20T12:00:00Z"));
  const midnight = sunPosition(new Date("2026-03-20T00:00:00Z"));
  assert.ok(noon[0] > 0.99);
  assert.ok(midnight[0] < -0.99);
  assert.ok(Math.abs(noon[1]) < 0.02);
});

test("fractional UTC offsets retain hours and minutes", () => {
  assert.equal(utcOffset(20700), "UTC+05:45");
  assert.equal(utcOffset(-12600), "UTC−03:30");
  assert.equal(utcOffset(0), "UTC+00:00");
});

test("solar coordinates agree with the independent NOAA reference calculator", () => {
  // Reference values from NOAA's published main.js, evaluated independently.
  const fixtures = [
    ["2003-10-17T19:30:30Z", -9.315803744629324, 14.646609789335045],
    ["2026-06-21T12:00:00Z", 23.43805166315756, -1.8242799980127842],
    ["2026-12-21T12:00:00Z", -23.437308973625385, 1.9229678054733899],
  ] as const;
  for (const [utc, latitude, equationOfTime] of fixtures) {
    const actual = solarCoordinates(new Date(utc));
    assert.ok(Math.abs(actual.latitude - latitude) < 1e-7, utc);
    assert.ok(
      Math.abs(actual.equationOfTimeMinutes - equationOfTime) < 1e-7,
      utc,
    );
    assert.ok(actual.longitude >= -180 && actual.longitude < 180);
  }
});

test("solstices produce polar day and polar night in opposite hemispheres", () => {
  for (const [utc, northLit] of [
    ["2026-06-21T00:00:00Z", true],
    ["2026-12-21T00:00:00Z", false],
  ] as const) {
    const sun = sunPosition(new Date(utc));
    assert.equal(sun[1] > 0, northLit);
    assert.ok(Math.abs(Math.hypot(...sun) - 1) < 1e-10);
    const north = toXYZ(80, 0);
    const south = toXYZ(-80, 0);
    assert.equal(
      north.reduce((sum, v, i) => sum + v * sun[i], 0) > 0,
      northLit,
    );
    assert.equal(
      south.reduce((sum, v, i) => sum + v * sun[i], 0) > 0,
      !northLit,
    );
  }
  assert.throws(() => sunPosition(new Date(NaN)), RangeError);
});
