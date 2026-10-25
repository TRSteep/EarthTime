import "./style.css";
import { getWorldState, type CityTime, type Snapshot } from "./backend";
import { Globe } from "./globe";
import { utcOffset } from "./geo";
import {
  parseSolarUTC,
  readSolarSettings,
  solarDate,
  type SolarMode,
} from "./solar";
import version from "../../VERSION?raw";
import { readTerrainSettings, type TerrainSettings } from "./terrain";

const icons = {
  globe:
    '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  rotate:
    '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>',
  labels: '<path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9h8M8 12h5"/>',
  home: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  pin: '<path d="M18 10c0 5-6 10-6 10S6 15 6 10a6 6 0 1 1 12 0Z"/><circle cx="12" cy="10" r="2"/>',
};
function icon(name: keyof typeof icons): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
}

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <main class="observatory">
    <section class="earth-view" aria-label="Глобус">
      <div id="globe"></div>
      <header class="masthead">
        <div class="brand">${icon("globe")}<span>EARTH<span class="brand-light">TIME</span></span><span class="version">v${version.trim()}</span></div>
        <div class="connection"><span class="live-dot"></span><span id="connection">ПОДКЛЮЧЕНИЕ</span></div>
      </header>
      <div class="intro"><div class="eyebrow">ОДНА ПЛАНЕТА · МНОГО РИТМОВ</div><h1>Мир в настоящем.</h1><p>Посмотрите, который час на другой стороне Земли.</p></div>
      <div id="load-status" class="load-status" role="status">Загружаем Землю…</div>
      <div id="clock-error" class="clock-error" role="alert" hidden></div>
      <section class="selected-city" aria-label="Выбранный город">
        <div class="eyebrow">${icon("pin")} <span id="selected-kind">ВЫБРАННЫЙ ГОРОД</span></div>
        <h2 id="selected-name">—</h2>
        <div class="selected-place"><span id="selected-country">—</span><span class="divider">/</span><span id="selected-offset">—</span></div>
        <div id="selected-time" class="selected-time">--:--<span>:--</span></div>
        <div id="selected-date" class="selected-date">—</div>
        <div id="selected-coordinates" class="coordinates">—</div>
        <div id="selected-elevation" class="elevation">Высоты загружаются…</div>
      </section>
      <div class="tools" role="toolbar" aria-label="Управление глобусом">
        <button id="rotate" type="button" aria-pressed="false" title="Автовращение">${icon("rotate")}<span>Вращение</span></button>
        <button id="labels" type="button" aria-pressed="true" title="Подписи городов">${icon("labels")}<span>Подписи</span></button>
        <span class="tool-divider"></span>
        <button id="reset" type="button" title="Исходный вид" aria-label="Исходный вид">${icon("home")}</button>
      </div>
      <footer class="view-footer"><span>ПЕРЕТАЩИТЕ ДЛЯ ВРАЩЕНИЯ <span class="footer-dot">·</span> КОЛЕСО ДЛЯ МАСШТАБА</span><span>РЕЛЬЕФ NOAA ETOPO 2022 · ТЕКСТУРЫ NASA / SOLAR SYSTEM SCOPE</span></footer>
    </section>
    <aside class="sidebar" aria-label="Мировое время">
      <div class="sidebar-heading"><div class="eyebrow">ЧАСОВЫЕ ПОЯСА</div><div class="sidebar-title"><h2>Мир сейчас</h2><span id="city-count" class="count">—</span></div><p>Разные часы. Один момент.</p></div>
      <label class="search">${icon("search")}<input id="search" type="search" placeholder="Город, страна или часовой пояс" aria-label="Поиск города" autocomplete="off" spellcheck="false" /><kbd>/</kbd></label>
      <div class="list-heading"><span>ГОРОД / МЕСТО</span><span>МЕСТНОЕ ВРЕМЯ</span></div>
      <div id="city-list" class="city-list"></div>
      <div id="empty" class="empty" hidden>Ничего не найдено.<br/><span>Попробуйте другое название.</span></div>
      <div class="world-settings">
      <details class="terrain-panel" open>
        <summary>Рельеф Земли <span>NOAA ETOPO</span></summary>
        <div class="terrain-options">
          <label for="terrain-scale">Вертикальный масштаб <output id="terrain-scale-value" for="terrain-scale">×20</output></label>
          <input id="terrain-scale" class="terrain-control" type="range" min="1" max="50" step="1" value="20" disabled />
          <p id="terrain-scale-note" class="terrain-note">Высоты усилены в 20 раз</p>
          <label class="bathymetry-option"><input id="terrain-bathymetry" class="terrain-control" type="checkbox" disabled /> Показать океанское дно</label>
          <p class="terrain-note">Без воды и облаков. Цвет показывает высоту или глубину.</p>
          <label for="terrain-detail">Детализация</label>
          <select id="terrain-detail" class="terrain-control" disabled><option value="standard">Стандартная</option><option value="high">Высокая · больше нагрузка</option></select>
          <div class="relief-places"><button id="terrain-himalayas" class="terrain-control" type="button" disabled>Гималаи ↗</button><button id="terrain-mariana" class="terrain-control" type="button" disabled>Марианская впадина ↗</button></div>
          <p class="terrain-note">Высоты и глубины относительно уровня моря. Сетка данных: 6′ ≈ 11 км у экватора.</p>
        </div>
      </details>
      <section class="solar-panel" aria-label="Солнечное освещение">
        <label class="solar-switch" for="sunlight"><span><strong>День и ночь</strong><small>По положению Солнца</small></span><input id="sunlight" type="checkbox" role="switch" /><span class="switch-track" aria-hidden="true"></span></label>
        <div id="solar-options" class="solar-options" hidden>
          <label for="solar-mode">Время освещения</label>
          <select id="solar-mode"><option value="live">Сейчас</option><option value="custom">Выбрать дату и время</option></select>
          <div id="solar-custom" hidden><label for="solar-date">Дата и время · UTC</label><input id="solar-date" type="datetime-local" min="1800-01-01T00:00" max="2100-12-31T23:59" step="60" /><p class="solar-note">Часы городов показывают текущее время.</p></div>
          <p id="solar-error" class="solar-validation" role="alert" hidden>Укажите корректную дату с 1800 по 2100 год.</p>
          <p id="solar-status" class="solar-status"></p>
        </div>
      </section>
      </div>
      <div class="utc-panel"><div><span class="live-dot"></span><span>ВСЕМИРНОЕ ВРЕМЯ</span><strong>UTC</strong></div><time id="utc-time">--:--:--</time><span id="utc-date">—</span></div>
    </aside>
  </main>
`;

const element = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;
const search = element<HTMLInputElement>("search");
document.title = `EarthTime v${version.trim()} — время на Земле`;
const sunlightToggle = element<HTMLInputElement>("sunlight");
const solarMode = element<HTMLSelectElement>("solar-mode");
const solarInput = element<HTMLInputElement>("solar-date");
const terrainScale = element<HTMLInputElement>("terrain-scale");
const terrainBathymetry = element<HTMLInputElement>("terrain-bathymetry");
const terrainDetail = element<HTMLSelectElement>("terrain-detail");
let storedTerrain: string | null = null;
try {
  storedTerrain = localStorage.getItem("earthtime.terrain");
} catch {
  /* Storage is optional. */
}
const terrain: TerrainSettings = readTerrainSettings(storedTerrain);
terrainScale.value = String(terrain.exaggeration);
terrainBathymetry.checked = terrain.bathymetry;
terrainDetail.value = terrain.detail;
updateTerrainCaption();
let storedSolar: string | null = null;
try {
  storedSolar = localStorage.getItem("earthtime.sunlight");
} catch {
  /* Storage is optional. */
}
const solar = readSolarSettings(storedSolar, new Date());
sunlightToggle.checked = solar.enabled;
solarMode.value = solar.mode;
solarInput.value = solar.utc;
let selectedID = "istanbul";
let snapshot: Snapshot;
let globe: Globe | undefined;
let disposed = false;
let timer: ReturnType<typeof setTimeout>;
const rows = new Map<string, HTMLButtonElement>();
const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

function selectCity(id: string): void {
  selectedID = id;
  globe?.select(id);
  renderSelection();
  for (const [rowID, row] of rows) {
    row.classList.toggle("selected", rowID === id);
    row.setAttribute("aria-pressed", String(rowID === id));
  }
  rows.get(id)?.scrollIntoView({ block: "nearest" });
  try {
    localStorage.setItem("earthtime.city", id);
  } catch {
    /* Storage can be disabled by the host. */
  }
}

function renderSelection(): void {
  const city = snapshot.cities.find((city) => city.id === selectedID)!;
  element("selected-kind").textContent =
    city.kind === "reference" ? "ОПОРНАЯ ТОЧКА UTC" : "ВЫБРАННЫЙ ГОРОД";
  document
    .querySelector(".selected-city")!
    .setAttribute(
      "aria-label",
      city.kind === "reference" ? "Выбранная опорная точка" : "Выбранный город",
    );
  element("selected-name").textContent = city.name;
  element("selected-country").textContent =
    city.kind === "reference"
      ? `${city.country} · необитаемый остров`
      : city.country;
  element("selected-offset").textContent = utcOffset(city.offsetSeconds);
  element("selected-time").innerHTML =
    `${city.time.slice(0, 5)}<span>${city.time.slice(5)}</span>`;
  element("selected-date").textContent = dateFormat.format(
    new Date(`${city.date}T12:00:00Z`),
  );
  element("selected-coordinates").textContent =
    `${Math.abs(city.lat).toFixed(2)}° ${city.lat < 0 ? "Ю" : "С"}  /  ${Math.abs(city.lon).toFixed(2)}° ${city.lon < 0 ? "З" : "В"}`;
  const height = globe?.elevationAt(city.lat, city.lon);
  element("selected-elevation").textContent =
    height == null
      ? "Высоты загружаются…"
      : `Рельеф в точке: ≈ ${Math.round(height).toLocaleString("ru-RU")} м`;
}

function updateTerrainCaption(): void {
  const scale = Number(terrainScale.value);
  element("terrain-scale-value").textContent = `×${scale}`;
  element("terrain-scale-note").textContent =
    scale === 1
      ? "Реальный вертикальный масштаб 1:1"
      : `Высоты и глубины усилены в ${scale} раз`;
}

function applyTerrain(): void {
  terrain.exaggeration = Number(terrainScale.value);
  terrain.bathymetry = terrainBathymetry.checked;
  terrain.detail = terrainDetail.value === "high" ? "high" : "standard";
  globe?.setTerrain(terrain);
  if (snapshot) renderSelection();
  try {
    localStorage.setItem("earthtime.terrain", JSON.stringify(terrain));
  } catch {
    /* Storage is optional. */
  }
}

function filterCities(): void {
  const query = search.value.trim().toLocaleLowerCase("ru");
  let visible = 0;
  for (const city of snapshot.cities) {
    const row = rows.get(city.id)!;
    row.hidden =
      !`${city.name} ${city.country} ${city.timezone} ${utcOffset(city.offsetSeconds)}`
        .toLocaleLowerCase("ru")
        .includes(query);
    if (!row.hidden) visible++;
  }
  element("city-count").textContent = String(visible);
  element("empty").hidden = visible !== 0;
}

function createRows(cities: CityTime[]): void {
  for (const city of [...cities].sort(
    (a, b) =>
      a.offsetSeconds - b.offsetSeconds || a.name.localeCompare(b.name, "ru"),
  )) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "city-row";
    row.dataset.city = city.id;
    row.innerHTML = `<span class="city-dot"></span><span class="city-info"><strong></strong><span></span></span><span class="city-clock"><strong></strong><span></span></span><span class="city-arrow">${icon("arrow")}</span>`;
    row.querySelector(".city-info strong")!.textContent = city.name;
    row.querySelector(".city-info span")!.textContent =
      city.kind === "reference"
        ? "Необитаемый остров · ориентир UTC−12"
        : city.country;
    row.addEventListener("click", () => selectCity(city.id));
    rows.set(city.id, row);
    element("city-list").append(row);
  }
}

function updateClocks(): void {
  for (const city of snapshot.cities) {
    const row = rows.get(city.id)!;
    row.querySelector(".city-clock strong")!.textContent = city.time.slice(
      0,
      5,
    );
    row.querySelector(".city-clock span")!.textContent = utcOffset(
      city.offsetSeconds,
    );
    row.setAttribute(
      "aria-label",
      `${city.name}, ${city.time.slice(0, 5)}, ${utcOffset(city.offsetSeconds)}`,
    );
  }
  const utc = new Date(snapshot.utc);
  element("utc-time").textContent = utc.toISOString().slice(11, 19);
  element("utc-time").setAttribute("datetime", snapshot.utc);
  element("utc-date").textContent = dateFormat.format(utc);
  renderSelection();
  globe?.update(snapshot.cities);
  updateSunlight();
}

function updateSunlight(): void {
  element("solar-options").hidden = !solar.enabled;
  element("solar-custom").hidden = solar.mode !== "custom";
  const date = solarDate(solar, new Date(snapshot?.utc ?? Date.now()));
  globe?.setSunlight(solar.enabled, date);
  element("solar-status").textContent =
    `${date.toISOString().slice(0, 10)} · ${date.toISOString().slice(11, 19)} UTC`;
}

function saveSunlight(): void {
  try {
    localStorage.setItem("earthtime.sunlight", JSON.stringify(solar));
  } catch {
    /* Storage is optional. */
  }
  updateSunlight();
}

function showError(error: unknown, clock = false): void {
  console.error(error);
  if (clock) {
    element("clock-error").textContent =
      "Не удалось обновить время. Повторяем подключение…";
    element("clock-error").hidden = false;
    element("connection").textContent = "ОЖИДАНИЕ СВЯЗИ";
  } else {
    element("load-status").textContent =
      error instanceof Error
        ? error.message
        : "Не удалось запустить 3D. Проверьте поддержку WebGL.";
    element("load-status").classList.add("error");
    element("load-status").hidden = false;
  }
}

async function tick(): Promise<void> {
  if (disposed) return;
  try {
    snapshot = await getWorldState();
    if (disposed) return;
    updateClocks();
    element("clock-error").hidden = true;
    element("connection").textContent = "ПРЯМО СЕЙЧАС";
  } catch (error) {
    showError(error, true);
  }
  if (!disposed && !document.hidden)
    timer = setTimeout(tick, 1000 - (Date.now() % 1000));
}

async function start(): Promise<void> {
  try {
    snapshot = await getWorldState();
    try {
      const stored = localStorage.getItem("earthtime.city");
      if (stored && snapshot.cities.some((city) => city.id === stored))
        selectedID = stored;
    } catch {
      /* Use the default city if storage is unavailable. */
    }
    createRows(snapshot.cities);
    updateClocks();
    filterCities();
    for (const [id, row] of rows) {
      row.classList.toggle("selected", id === selectedID);
      row.setAttribute("aria-pressed", String(id === selectedID));
    }
    rows.get(selectedID)?.scrollIntoView({ block: "center" });
    try {
      globe = new Globe(
        element("globe"),
        snapshot.cities,
        selectCity,
        (rotating) =>
          element("rotate").setAttribute("aria-pressed", String(rotating)),
      );
      globe.select(selectedID, selectedID !== "istanbul");
      globe.update(snapshot.cities);
      globe.setTerrain(terrain);
      updateSunlight();
      await globe.loadAssets();
      for (const control of document.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLButtonElement
      >(".terrain-control"))
        control.disabled = false;
      renderSelection();
      element("load-status").hidden = true;
    } catch (error) {
      showError(error);
    }
    void tick();
  } catch (error) {
    showError(
      new Error("Не удалось загрузить города. Перезапустите приложение."),
    );
    console.error(error);
  }
}

search.addEventListener("input", () => {
  if (snapshot) filterCities();
});
terrainScale.addEventListener("input", updateTerrainCaption);
terrainScale.addEventListener("change", applyTerrain);
terrainBathymetry.addEventListener("change", applyTerrain);
terrainDetail.addEventListener("change", applyTerrain);
element("terrain-himalayas").addEventListener("click", () => {
  terrainBathymetry.checked = false;
  applyTerrain();
  globe?.focusLocation(28, 86.9);
});
element("terrain-mariana").addEventListener("click", () => {
  terrainBathymetry.checked = true;
  applyTerrain();
  globe?.focusLocation(11.35, 142.2);
});
sunlightToggle.addEventListener("change", () => {
  solar.enabled = sunlightToggle.checked;
  saveSunlight();
});
solarMode.addEventListener("change", () => {
  solar.mode = solarMode.value as SolarMode;
  solarInput.value = solar.utc;
  element("solar-error").hidden = true;
  solarInput.removeAttribute("aria-invalid");
  saveSunlight();
});
solarInput.addEventListener("input", () => {
  const valid =
    solarInput.validity.valid && parseSolarUTC(solarInput.value) !== null;
  element("solar-error").hidden = valid;
  solarInput.setAttribute("aria-invalid", String(!valid));
  if (!valid) return;
  solar.utc = solarInput.value;
  saveSunlight();
});
element("rotate").addEventListener("click", () =>
  globe?.setAutoRotate(
    element("rotate").getAttribute("aria-pressed") !== "true",
  ),
);
element("labels").addEventListener("click", () => {
  const enabled = element("labels").getAttribute("aria-pressed") !== "true";
  element("labels").setAttribute("aria-pressed", String(enabled));
  globe?.setLabels(enabled);
});
element("reset").addEventListener("click", () => globe?.reset());
element("globe").addEventListener("globe-error", (event) =>
  showError(new Error((event as CustomEvent<string>).detail)),
);
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && !(event.target instanceof HTMLInputElement)) {
    event.preventDefault();
    search.focus();
  }
  if (event.key === "Escape" && document.activeElement === search) {
    search.value = "";
    if (snapshot) filterCities();
    search.blur();
  }
});
document.addEventListener("visibilitychange", () => {
  globe?.setActive(!document.hidden);
  clearTimeout(timer);
  if (!document.hidden && snapshot) void tick();
});
window.addEventListener("beforeunload", () => {
  disposed = true;
  clearTimeout(timer);
  globe?.dispose();
});
void start();
