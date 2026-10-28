import { CITIES, COMMON_CITIES, cityName } from '../data/cities.js';
import { catalogCityLocation, decodeLocationCatalog, localizedName } from '../data/location-catalog.js';
import { getLanguage, onLanguageChange, setMessage, t, translateDocument } from '../i18n/index.js';
import { WALLPAPER_MODE } from '../platform/environment.js';
import { onLocationChange } from '../world/location.js';
import { catalogSelectionLocation, createLocationRequestGate, locationIsSelected, resolveCoordinateTimeZone } from '../world/location-selection.js';
import { bindDragScroll } from './drag-scroll.js';
import { bindLocationIndex, groupLocationItems, LOCATION_LETTERS } from './location-index.js';

const $ = id => document.getElementById(id);

export function initLocationPicker({ getLocation, setLocation, loadData }) {
  let catalog, loading, searchVersion = 0, searchTimer, composing = false;
  let stage = 0, country, region;
  const dialog = $('manualLocationDialog'), list = $('manualLocationList'), viewport = $('locationListViewport');
  const steps = [$('locationCountryStep'), $('locationRegionStep'), $('locationCityStep')];
  const search = $('citySearch'), results = $('cityResults'), status = $('citySearchStatus');
  const searchArea = $('citySearchArea');
  const geoRequests = createLocationRequestGate();
  const geoMessage = key => {
    if (key) setMessage($('geoMsg'), key);
    else { $('geoMsg').textContent = ''; delete $('geoMsg').dataset.i18n; }
  };
  const cancelGeolocation = () => { geoRequests.cancel(); geoMessage(null); };
  searchArea.hidden = WALLPAPER_MODE;
  const rail = $('locationAlphabet');
  rail.replaceChildren(...LOCATION_LETTERS.map(letter => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = letter; button.disabled = true;
    button.setAttribute('aria-controls', viewport.id);
    return button;
  }));
  const drag = bindDragScroll({ viewport, onScroll: () => alphabet.refresh() });
  const alphabet = bindLocationIndex({ rail, bubble: $('locationIndexBubble'), viewport, cancelScroll: () => drag.cancel() });
  // WE 可能不转发滚轮，内容拖动与字母拉条始终显式设置 scrollTop。
  if (WALLPAPER_MODE) viewport.addEventListener('wheel', event => {
    if (event.ctrlKey || !event.deltaY) return;
    event.preventDefault(); event.stopPropagation();
    viewport.scrollTop += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1);
  }, { passive: false });
  const name = item => localizedName(item.names, getLanguage());
  const regionName = item => name(item) || t('location.unspecified');
  const context = city => `${name(city.region.country)} · ${regionName(city.region)}`;
  const currentSelection = () => catalog ? catalogSelectionLocation(catalog, getLocation()) : getLocation();
  const selected = city => locationIsSelected(currentSelection(), city);
  const row = (label, detail, action, active = false) => {
    const li = document.createElement('li'), button = document.createElement('button');
    const title = document.createElement('span');
    button.type = 'button'; button.className = 'location-result'; button.setAttribute('aria-pressed', String(active));
    title.className = 'location-result-name'; title.textContent = label; button.append(title);
    if (detail) { const small = document.createElement('small'); small.textContent = detail; button.append(small); }
    button.addEventListener('click', action); li.append(button);
    return li;
  };
  async function ensureCatalog() {
    if (catalog) return catalog;
    if (!loading) loading = loadData().then(bytes => { catalog = decodeLocationCatalog(bytes); return catalog; }).finally(() => { loading = null; });
    return loading;
  }
  function choose(city) {
    cancelGeolocation();
    setLocation(catalogCityLocation(city));
    if (dialog.open) dialog.close();
    results.replaceChildren(); search.value = ''; status.textContent = ''; searchVersion++;
  }
  async function renderSearch() {
    clearTimeout(searchTimer);
    const version = ++searchVersion, query = search.value.trim();
    results.replaceChildren(); status.textContent = '';
    if (WALLPAPER_MODE || !query) return;
    if (!catalog) setMessage(status, 'location.loading');
    try {
      await ensureCatalog();
      if (version !== searchVersion || query !== search.value.trim()) return;
      const found = catalog.search(query);
      results.replaceChildren(...found.cities.map(city => row(name(city), context(city), () => choose(city), selected(city))));
      setMessage(status, found.total ? 'location.searchCount' : 'location.noResults', { shown: found.cities.length, total: found.total });
    } catch {
      if (version === searchVersion) setMessage(status, 'location.loadFailed');
    }
  }
  search.addEventListener('compositionstart', () => { composing = true; clearTimeout(searchTimer); searchVersion++; });
  search.addEventListener('compositionend', () => { composing = false; void renderSearch(); });
  search.addEventListener('input', () => {
    searchVersion++; results.replaceChildren(); status.textContent = '';
    if (!composing) { clearTimeout(searchTimer); searchTimer = setTimeout(renderSearch, 120); }
  });
  search.addEventListener('keydown', event => {
    if (composing || event.isComposing) return;
    if (event.key === 'Enter') { event.preventDefault(); results.querySelector('button')?.click(); }
    if (event.key === 'ArrowDown') { event.preventDefault(); results.querySelector('button')?.focus(); }
  });
  function listKeys(event) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...event.currentTarget.querySelectorAll('li > button')], index = buttons.indexOf(event.target);
    if (index < 0) return;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
    event.preventDefault(); event.stopPropagation(); buttons[next]?.focus();
  }
  results.addEventListener('keydown', listKeys); list.addEventListener('keydown', listKeys);
  function renderManual(focus = false) {
    if (!catalog || !dialog.open) return;
    const stageItems = stage === 0 ? catalog.countryList(getLanguage()) : stage === 1 ? catalog.regionList(country.code, getLanguage()) : catalog.cityList(region.id, getLanguage());
    const current = currentSelection();
    steps.forEach((button, index) => {
      button.disabled = index === 1 ? !country : index === 2 ? !region : false;
      if (index === stage) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
    });
    $('locationSelection').textContent = [country && name(country), region && regionName(region)].filter(Boolean).join(' › ');
    const indexed = groupLocationItems(stageItems, { language: getLanguage(), countries: stage === 0 }), sections = [];
    list.replaceChildren(...indexed.flatMap(group => {
      const heading = document.createElement('li');
      heading.className = 'location-letter-heading'; heading.textContent = group.label;
      sections.push({ label: group.label, element: heading });
      return [heading, ...group.items.map(item => {
        const label = stage === 1 ? regionName(item) : name(item);
        if (stage === 2) return row(label, null, () => choose(item), selected(item));
        const active = stage === 0 ? item.code === (country?.code || current.country) : item.id === (region?.id || current.region);
        return row(label, null, () => {
          if (stage === 0) { country = item; region = null; stage = 1; }
          else { region = item; stage = 2; }
          renderManual(true);
        }, active);
      })];
    }));
    setMessage($('manualLocationStatus'), 'location.stepCount', { step: stage + 1, total: stageItems.length });
    viewport.scrollTop = 0; drag.cancel(); alphabet.update(sections, { endAtLast: stage === 0 });
    if (focus) list.querySelector('button')?.focus({ preventScroll: true });
  }
  async function loadManual() {
    setMessage($('manualLocationStatus'), 'location.loading'); $('retryLocationData').hidden = true;
    try { await ensureCatalog(); renderManual(); }
    catch { if (dialog.open) { setMessage($('manualLocationStatus'), 'location.loadFailed'); $('retryLocationData').hidden = false; } }
  }
  $('manualLocationBtn').addEventListener('click', () => {
    cancelGeolocation();
    stage = 0; country = null; region = null; list.replaceChildren(); alphabet.update([]);
    $('locationSelection').textContent = '';
    steps.forEach((button, index) => { button.disabled = index > 0; if (index === 0) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current'); });
    dialog.showModal(); document.dispatchEvent(new CustomEvent('locationpickeropen'));
    void loadManual();
  });
  $('manualLocationClose').addEventListener('click', () => dialog.close());
  $('retryLocationData').addEventListener('click', loadManual);
  dialog.addEventListener('close', () => { drag.cancel(); alphabet.cancel(); $('manualLocationBtn').focus({ preventScroll: true }); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  steps.forEach((button, index) => button.addEventListener('click', () => { stage = index; renderManual(true); }));
  function renderCommon() {
    $('cityCommon').replaceChildren(...COMMON_CITIES.map(key => {
      const city = CITIES.find(item => item[0] === key), button = document.createElement('button');
      button.type = 'button'; button.className = 'chip'; button.textContent = cityName(city);
      button.setAttribute('aria-pressed', String(getLocation().lat === city[2] && getLocation().lon === city[3]));
      button.addEventListener('click', () => {
        cancelGeolocation();
        const full = catalog?.preset(key);
        setLocation(full ? catalogCityLocation(full) : { name: city[0], lat: city[2], lon: city[3], tz: city[4] });
      });
      return button;
    }));
  }
  onLocationChange(() => { cancelGeolocation(); renderCommon(); if (!composing) void renderSearch(); if (dialog.open) renderManual(); });
  onLanguageChange(() => { renderCommon(); void renderSearch(); if (dialog.open) renderManual(); });
  renderCommon();
  // 普通网页保留用户主动授权的设备定位；WE 界面没有定位入口。
  $('geoBtn').addEventListener('click', () => {
    if (WALLPAPER_MODE) return;
    cancelGeolocation();
    if (!navigator.geolocation) { geoMessage('geo.unsupported'); return; }
    const request = geoRequests.begin();
    geoMessage('geo.loading');
    navigator.geolocation.getCurrentPosition(async pos => {
      if (!request.isCurrent()) return;
      const lat = pos.coords.latitude, lon = pos.coords.longitude;
      let tz;
      try { tz = await resolveCoordinateTimeZone(lat, lon, { signal: request.signal }); }
      catch { if (request.isCurrent()) geoMessage('geo.timezoneUnavailable'); return; }
      if (!request.isCurrent()) return;
      let near = null, best = Infinity;
      for (const city of CITIES) {
        const rad = Math.PI / 180, dLat = (city[2] - lat) * rad, dLon = (city[3] - lon) * rad;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * rad) * Math.cos(city[2] * rad) * Math.sin(dLon / 2) ** 2;
        const km = 12742 * Math.asin(Math.sqrt(a));
        if (km < best) { best = km; near = city; }
      }
      setLocation({ name: best < 60 ? near[0] + '附近' : '我的位置', lat, lon, tz });
    }, error => { if (request.isCurrent()) geoMessage(error.code === 1 ? 'geo.denied' : 'geo.unavailable'); }, { timeout: 9000, maximumAge: 600000 });
  });
  // 自绘滚动控件的标签也跟随当前语言。
  translateDocument();
}
