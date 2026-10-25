# Third-party assets

EarthTime 1.2.2 uses the following original high-resolution Earth maps, retrieved on 2026-10-25. The previous low-resolution three.js example maps have been removed.

| Local file | Author / upstream file | Resolution |
| --- | --- | --- |
| `frontend/public/textures/earth-day-8k.png` | NASA Blue Marble: `land_ocean_ice_8192.png` | 8192 × 4096 |
| `frontend/public/textures/earth-night-8k.jpg` | Solar System Scope / INOVE: `8k_earth_nightmap.jpg` | 8192 × 4096 |
| `frontend/public/textures/earth-clouds-8k.jpg` | Solar System Scope / INOVE: `8k_earth_clouds.jpg` | 8192 × 4096 |

Sources and attribution:

- Day map: NASA, **The Blue Marble: Land Surface, Ocean Color and Sea Ice**. [Original PNG](https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/land_ocean_ice_8192.png), [NASA Blue Marble collection](https://visibleearth.nasa.gov/collection/1484/blue-marble?size=small).
- Night and cloud maps: **Solar System Scope / INOVE**, [Solar Textures](https://www.solarsystemscope.com/textures/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Original files downloaded from the provider's official `play.solarsystemscope.com/textures/download/` domain.

All maps are bundled byte-for-byte without resizing or recompression. The cloud JPEG is used as a transparency mask in the renderer. No AI imagery or live weather feeds are used. Static vegetation, snow and cloud patterns do not change with the selected date; solar illumination does.

Attribution is displayed in the application footer and included in `frontend/public/ASSET-CREDITS.txt` inside the executable. The three.js MIT license is at `frontend/public/THREE-LICENSE.txt`.

Solar calculations follow the equations published by [NOAA Global Monitoring Laboratory](https://gml.noaa.gov/grad/solcalc/calcdetails.html), based on Jean Meeus, *Astronomical Algorithms*. The application calculates a geocentric Sun direction for the globe; it does not apply local atmospheric refraction.

## Numeric terrain / bathymetry

**NOAA National Centers for Environmental Information. 2022: ETOPO 2022 15 Arc-Second Global Relief Model. DOI: [10.25921/fd45-gt74](https://doi.org/10.25921/fd45-gt74). Accessed 2026-10-25.**

- [Dataset and documentation](https://www.ncei.noaa.gov/products/etopo-global-relief-model).
- [NOAA OceanWatch ERDDAP source](https://oceanwatch.pifsc.noaa.gov/erddap/info/ETOPO_2022_v1_60s/index.html): 60 arc-second Ice Surface grid, elevations in meters relative to EGM2008.
- Derived asset: `frontend/public/terrain/etopo2022-6min.bin.gz`, with metadata in the neighboring JSON file.
- Processing: sample every sixth grid cell (6 arc-minutes), round to whole meters, reorder longitude, derive a negative-height ocean-connectivity mask, pack and gzip. No fabricated heights, photo-derived depth or AI imagery.
- Source SHA-256, exact request URL and binary layout are retained in the metadata. `cmd/prepare-relief` reproduces the asset from the source NetCDF.

The ERDDAP provider permits free use and redistribution, with no warranty of accuracy or suitability. The model is for visualisation, not navigation or surveying. Vertical exaggeration in the renderer is explicitly labeled and does not modify the stored meter values.

Runtime libraries:

- [three.js](https://github.com/mrdoob/three.js): MIT.
- [Wails](https://github.com/wailsapp/wails): MIT.

## City reference coordinates

Urban reference points for Bogotá, Lagos, Kinshasa, Dhaka, Singapore and London Village (Kiritimati) were checked and adapted from [GeoNames cities500](https://download.geonames.org/export/dump/), accessed 2026-10-25, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). GeoNames uses WGS84 coordinates; see [About GeoNames](https://www.geonames.org/about.html). These points identify settlements rather than the geographic centre of their larger urban region or island. No complete GeoNames dataset is distributed with the app.

Dependency versions are fixed in `go.mod`, `go.sum`, `frontend/package.json`, and `frontend/pnpm-lock.yaml`. Their upstream license notices remain with the dependencies.
