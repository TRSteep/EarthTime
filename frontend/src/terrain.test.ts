import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import * as THREE from "three";
import {
  HeightField,
  reliefRadius,
  EARTH_RADIUS_METERS,
  readTerrainSettings,
} from "./terrain.ts";
import { applyReliefScale } from "./terrain-mesh.ts";

function syntheticGrid(values: number[], ocean: number[] = []): ArrayBuffer {
  const buffer = new ArrayBuffer(32 + values.length * 2);
  const view = new DataView(buffer);
  view.setUint32(0, 0x45545231, false);
  view.setUint32(4, 4, true);
  view.setUint32(8, values.length / 4, true);
  view.setFloat32(12, 90, true);
  view.setFloat32(16, -180, true);
  view.setFloat32(20, 180 / (values.length / 4 - 1), true);
  view.setFloat32(24, 90, true);
  view.setUint32(28, 12000, true);
  values.forEach((value, i) =>
    view.setUint16(
      32 + i * 2,
      (value + 12000) | (ocean.includes(i) ? 0x8000 : 0),
      true,
    ),
  );
  return buffer;
}

test("height sampling preserves signs, interpolates meters, wraps the date line and joins poles", () => {
  const field = new HeightField(
    syntheticGrid([0, 1, 2, 3, 10, 11, 12, 13, 20, 21, 22, 23], [4]),
  );
  assert.equal(field.elevationAt(0, -180), 10);
  assert.equal(field.elevationAt(0, 180), 10);
  assert.equal(field.elevationAt(0, -135), 10.5);
  assert.equal(field.elevationAt(0, 135), 11.5);
  assert.equal(field.elevationAt(90, -180), 1.5);
  assert.equal(field.elevationAt(90, 80), 1.5);
  assert.equal(field.elevationAt(-90, 0), 21.5);
  assert.equal(field.isOcean(0, -180), true);
  assert.equal(field.isOcean(0, -90), false);
  const negative = new HeightField(syntheticGrid(Array(8).fill(-4500)));
  assert.equal(negative.elevationAt(0, 0), -4500);
  assert.equal(
    negative.isOcean(0, 0),
    false,
    "closed below-sea-level basins are not automatically ocean",
  );
  assert.throws(() => new HeightField(new ArrayBuffer(12)));
  const corrupt = syntheticGrid(Array(8).fill(0));
  new DataView(corrupt).setUint32(4, 1, true);
  assert.throws(() => new HeightField(corrupt));
});

test("actual vertex positions move above and below sea level and rescaling does not accumulate", () => {
  const geometry = new THREE.SphereGeometry(1, 16, 8);
  geometry.setAttribute(
    "baseDirection",
    geometry.getAttribute("position").clone(),
  );
  const elevations = new Float32Array(geometry.getAttribute("position").count);
  elevations.fill(6000);
  geometry.setAttribute("elevation", new THREE.BufferAttribute(elevations, 1));
  const position = geometry.getAttribute("position");
  const radius = (i: number) =>
    Math.hypot(position.getX(i), position.getY(i), position.getZ(i));
  applyReliefScale(geometry, 20);
  assert.ok(Math.abs(radius(50) - (1 + 120000 / EARTH_RADIUS_METERS)) < 1e-6);
  applyReliefScale(geometry, 1);
  assert.ok(Math.abs(radius(50) - reliefRadius(6000, 1)) < 1e-6);
  elevations.fill(-10000);
  applyReliefScale(geometry, 20);
  assert.ok(radius(50) < 1);
  assert.ok(Math.abs(radius(50) - reliefRadius(-10000, 20)) < 1e-6);
  assert.ok(geometry.boundingSphere!.radius < 1);
  geometry.dispose();
  assert.throws(() => reliefRadius(9000, 100), RangeError);
  assert.equal(
    readTerrainSettings('{"exaggeration":1000,"detail":"bad"}').exaggeration,
    20,
  );
});

test("bundled NOAA data contains real mountains, ocean depths and an unflooded closed basin", () => {
  const compressed = readFileSync(
    new URL("../public/terrain/etopo2022-6min.bin.gz", import.meta.url),
  );
  const field = new HeightField(Uint8Array.from(gunzipSync(compressed)).buffer);
  assert.equal(field.width, 3600);
  assert.equal(field.height, 1800);
  assert.ok(field.elevationAt(27.9881, 86.925) > 4000, "Himalayas");
  assert.ok(field.elevationAt(-32.6532, -70.0109) > 2500, "Andes");
  assert.ok(field.elevationAt(0, -150) < -3000, "Pacific seafloor");
  assert.ok(field.elevationAt(11.35, 142.2) < -6000, "Mariana region");
  assert.equal(field.isOcean(0, -150), true);
  assert.equal(field.isOcean(42, 50), false, "Caspian closed basin");
  assert.equal(field.elevationAt(20, -180), field.elevationAt(20, 180));
});
