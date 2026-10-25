const radians = Math.PI / 180;

// Matches Three.js SphereGeometry UVs and equirectangular Earth textures.
export function toXYZ(
  lat: number,
  lon: number,
  radius = 1,
): [number, number, number] {
  const latitude = lat * radians;
  const longitude = lon * radians;
  return [
    radius * Math.cos(latitude) * Math.cos(longitude),
    radius * Math.sin(latitude),
    -radius * Math.cos(latitude) * Math.sin(longitude),
  ];
}

export interface SolarCoordinates {
  latitude: number;
  longitude: number;
  equationOfTimeMinutes: number;
}

// Geocentric apparent Sun, using the NOAA/Meeus equations.
// https://gml.noaa.gov/grad/solcalc/calcdetails.html
// No atmospheric refraction: this is illumination of the globe, not local sunrise.
export function solarCoordinates(date: Date): SolarCoordinates {
  if (!Number.isFinite(date.getTime()))
    throw new RangeError("Invalid solar date");
  const centuries = (date.getTime() / 86400000 + 2440587.5 - 2451545) / 36525;
  const t = centuries;
  const meanLongitude =
    (((280.46646 + t * (36000.76983 + t * 0.0003032)) % 360) + 360) % 360;
  const anomaly = (357.52911 + t * (35999.05029 - 0.0001537 * t)) * radians;
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const center =
    Math.sin(anomaly) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * anomaly) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * anomaly) * 0.000289;
  const omega = (125.04 - 1934.136 * t) * radians;
  const apparentLongitude =
    (meanLongitude + center - 0.00569 - 0.00478 * Math.sin(omega)) * radians;
  const obliquitySeconds = 21.448 - t * (46.815 + t * (0.00059 - t * 0.001813));
  const obliquity =
    (23 + (26 + obliquitySeconds / 60) / 60 + 0.00256 * Math.cos(omega)) *
    radians;
  const latitude =
    Math.asin(Math.sin(obliquity) * Math.sin(apparentLongitude)) / radians;
  const y = Math.tan(obliquity / 2) ** 2;
  const l = meanLongitude * radians;
  const equationOfTimeMinutes =
    (4 / radians) *
    (y * Math.sin(2 * l) -
      2 * eccentricity * Math.sin(anomaly) +
      4 * eccentricity * y * Math.sin(anomaly) * Math.cos(2 * l) -
      0.5 * y * y * Math.sin(4 * l) -
      1.25 * eccentricity * eccentricity * Math.sin(2 * anomaly));
  const utcMinutes =
    date.getUTCHours() * 60 +
    date.getUTCMinutes() +
    date.getUTCSeconds() / 60 +
    date.getUTCMilliseconds() / 60000;
  const longitude =
    ((((180 - (utcMinutes + equationOfTimeMinutes) / 4 + 180) % 360) + 360) %
      360) -
    180;
  return { latitude, longitude, equationOfTimeMinutes };
}

export function sunPosition(date: Date): [number, number, number] {
  const { latitude, longitude } = solarCoordinates(date);
  return toXYZ(latitude, longitude);
}

export function utcOffset(seconds: number): string {
  const minutes = Math.round(Math.abs(seconds) / 60);
  return `UTC${seconds < 0 ? "−" : "+"}${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
