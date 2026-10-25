# Third-party assets

EarthTime 1.1.0 uses the following original high-resolution Earth maps, retrieved on 2026-10-25. The previous low-resolution three.js example maps have been removed.

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

Runtime libraries:

- [three.js](https://github.com/mrdoob/three.js): MIT.
- [Wails](https://github.com/wailsapp/wails): MIT.

Dependency versions are fixed in `go.mod`, `go.sum`, `frontend/package.json`, and `frontend/pnpm-lock.yaml`. Their upstream license notices remain with the dependencies.
