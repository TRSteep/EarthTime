export const EARTH_RADIUS_METERS = 6_371_000;
export interface TerrainSettings {
  exaggeration: number;
  bathymetry: boolean;
  detail: "standard" | "high";
}

export function readTerrainSettings(value: string | null): TerrainSettings {
  const defaults: TerrainSettings = {
    exaggeration: 20,
    bathymetry: false,
    detail: "standard",
  };
  if (!value) return defaults;
  try {
    const saved = JSON.parse(value) as Partial<TerrainSettings> | null;
    if (!saved || typeof saved !== "object") return defaults;
    return {
      exaggeration:
        typeof saved.exaggeration === "number" &&
        Number.isInteger(saved.exaggeration) &&
        saved.exaggeration >= 1 &&
        saved.exaggeration <= 50
          ? saved.exaggeration
          : 20,
      bathymetry: saved.bathymetry === true,
      detail: saved.detail === "high" ? "high" : "standard",
    };
  } catch {
    return defaults;
  }
}

export function reliefRadius(
  heightMeters: number,
  exaggeration: number,
): number {
  if (
    !Number.isFinite(heightMeters) ||
    Math.abs(heightMeters) > 12000 ||
    !Number.isFinite(exaggeration) ||
    exaggeration < 1 ||
    exaggeration > 50
  )
    throw new RangeError("Invalid relief scale or height");
  return 1 + (heightMeters * exaggeration) / EARTH_RADIUS_METERS;
}

export class HeightField {
  readonly width: number;
  readonly height: number;
  readonly north: number;
  readonly west: number;
  readonly latStep: number;
  readonly lonStep: number;
  private readonly samples: DataView;
  private readonly bias: number;
  private readonly northPole: number;
  private readonly southPole: number;

  constructor(buffer: ArrayBuffer) {
    const view = new DataView(buffer);
    if (buffer.byteLength < 32 || view.getUint32(0, false) !== 0x45545231)
      throw new Error("Некорректный формат данных рельефа");
    this.width = view.getUint32(4, true);
    this.height = view.getUint32(8, true);
    this.north = view.getFloat32(12, true);
    this.west = view.getFloat32(16, true);
    this.latStep = view.getFloat32(20, true);
    this.lonStep = view.getFloat32(24, true);
    this.bias = view.getUint32(28, true);
    if (
      this.width < 2 ||
      this.height < 2 ||
      this.width * this.height > 40_000_000 ||
      buffer.byteLength !== 32 + this.width * this.height * 2 ||
      this.bias !== 12000 ||
      ![this.north, this.west, this.latStep, this.lonStep].every(
        Number.isFinite,
      ) ||
      this.north > 90 ||
      this.north < -90 ||
      this.west < -180 ||
      this.west > 180 ||
      this.latStep <= 0 ||
      this.lonStep <= 0 ||
      Math.abs(this.width * this.lonStep - 360) > 0.01 ||
      this.north - (this.height - 1) * this.latStep < -90 - 0.01
    )
      throw new Error("Некорректная сетка рельефа");
    this.samples = new DataView(buffer, 32);
    let north = 0,
      south = 0;
    for (let x = 0; x < this.width; x++) {
      north += this.meters(x, 0);
      south += this.meters(x, this.height - 1);
    }
    this.northPole = north / this.width;
    this.southPole = south / this.width;
  }

  private packed(x: number, y: number): number {
    return this.samples.getUint16((y * this.width + x) * 2, true);
  }
  private meters(x: number, y: number): number {
    return (this.packed(x, y) & 0x7fff) - this.bias;
  }

  elevationAt(lat: number, lon: number): number {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90)
      throw new RangeError("Invalid terrain coordinates");
    // Every longitude converges to one height at each pole, avoiding radial cracks.
    if (lat === 90) return this.northPole;
    if (lat === -90) return this.southPole;
    const wrappedLon = ((((lon + 180) % 360) + 360) % 360) - 180;
    const x =
      ((((wrappedLon - this.west) / this.lonStep) % this.width) + this.width) %
      this.width;
    const y = Math.max(
      0,
      Math.min(this.height - 1, (this.north - lat) / this.latStep),
    );
    const x0 = Math.floor(x),
      x1 = (x0 + 1) % this.width;
    const y0 = Math.floor(y),
      y1 = Math.min(y0 + 1, this.height - 1);
    const fx = x - x0,
      fy = y - y0;
    const top = this.meters(x0, y0) * (1 - fx) + this.meters(x1, y0) * fx;
    const bottom = this.meters(x0, y1) * (1 - fx) + this.meters(x1, y1) * fx;
    return top * (1 - fy) + bottom * fy;
  }

  isOcean(lat: number, lon: number): boolean {
    const wrappedLon = ((((lon + 180) % 360) + 360) % 360) - 180;
    const x =
      ((Math.round((wrappedLon - this.west) / this.lonStep) % this.width) +
        this.width) %
      this.width;
    const y = Math.max(
      0,
      Math.min(this.height - 1, Math.round((this.north - lat) / this.latStep)),
    );
    return (this.packed(x, y) & 0x8000) !== 0;
  }

  oceanMask(): Uint8Array {
    const data = new Uint8Array(this.width * this.height);
    // DataTexture's first row is the south edge (UV v=0).
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) {
        data[(this.height - 1 - y) * this.width + x] =
          (this.packed(x, y) & 0x8000) !== 0 ? 255 : 0;
      }
    return data;
  }

  oceanUVOffset(): [number, number] {
    return [
      (-180 - this.west) / (this.lonStep * this.width) + 0.5 / this.width,
      (this.height - 0.5 + (-90 - this.north) / this.latStep) / this.height,
    ];
  }
}

export async function loadHeightField(): Promise<HeightField> {
  const response = await fetch("/terrain/etopo2022-6min.bin.gz");
  if (!response.ok) throw new Error("Не удалось загрузить высоты NOAA ETOPO");
  let buffer = await response.arrayBuffer();
  const magic = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 2));
  if (magic[0] === 0x1f && magic[1] === 0x8b) {
    buffer = await new Response(
      new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip")),
    ).arrayBuffer();
  }
  return new HeightField(buffer);
}
