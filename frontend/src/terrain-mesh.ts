import * as THREE from "three";
import { HeightField, reliefRadius } from "./terrain.ts";

export function createReliefGeometry(
  field: HeightField,
  detail: "standard" | "high",
  exaggeration: number,
): THREE.SphereGeometry {
  const segments = detail === "high" ? 2048 : 1024;
  const geometry = new THREE.SphereGeometry(1, segments, segments / 2);
  geometry.setAttribute(
    "baseDirection",
    geometry.getAttribute("position").clone(),
  );
  const uv = geometry.getAttribute("uv");
  const elevations = new Float32Array(uv.count);
  for (let i = 0; i < uv.count; i++)
    elevations[i] = field.elevationAt(
      uv.getY(i) * 180 - 90,
      uv.getX(i) * 360 - 180,
    );
  geometry.setAttribute("elevation", new THREE.BufferAttribute(elevations, 1));
  applyReliefScale(geometry, exaggeration);
  return geometry;
}

export function applyReliefScale(
  geometry: THREE.SphereGeometry,
  exaggeration: number,
): void {
  const position = geometry.getAttribute("position");
  const base = geometry.getAttribute("baseDirection");
  const elevation = geometry.getAttribute("elevation");
  for (let i = 0; i < position.count; i++) {
    const radius = reliefRadius(elevation.getX(i), exaggeration);
    position.setXYZ(
      i,
      base.getX(i) * radius,
      base.getY(i) * radius,
      base.getZ(i) * radius,
    );
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  const normal = geometry.getAttribute("normal");
  const width = geometry.parameters.widthSegments;
  const height = geometry.parameters.heightSegments;
  for (let y = 0; y <= height; y++) {
    const a = y * (width + 1),
      b = a + width;
    if (y === 0 || y === height) {
      for (let x = 0; x <= width; x++)
        normal.setXYZ(a + x, 0, y === 0 ? 1 : -1, 0);
    } else {
      const direction = new THREE.Vector3(
        normal.getX(a) + normal.getX(b),
        normal.getY(a) + normal.getY(b),
        normal.getZ(a) + normal.getZ(b),
      ).normalize();
      normal.setXYZ(a, direction.x, direction.y, direction.z);
      normal.setXYZ(b, direction.x, direction.y, direction.z);
    }
  }
  normal.needsUpdate = true;
  geometry.computeBoundingSphere();
}
