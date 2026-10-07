import { populateIcons } from './icons.js';
import { fmtTime, zonedHours } from '../world/clock.js';
import { CITIES, locationName } from '../data/cities.js';
import { weatherPageUrl } from '../world/weather.js';
import { getLanguage, getLocale, onLanguageChange, setLanguage, setMessage, t } from '../i18n/index.js';
const $ = (id) => document.getElementById(id);
let toastTimer, lastDateKey = '', lastSourceKey = '', dateFormatter, lastObservation;
let revealWeatherSource = () => {};

function initWeatherSource() {
  const group = $('observerWeatherGroup'), weather = $('observerWeather'), source = $('weatherSource');
  let hideTimer, hovered = false;
  const held = () => hovered || Boolean(group.querySelector(':focus-visible'));
  const setVisible = (visible) => {
    source.dataset.visible = String(visible);
    source.setAttribute('aria-hidden', String(!visible));
    weather.setAttribute('aria-expanded', String(visible));
  };
  const scheduleHide = () => {
    clearTimeout(hideTimer);
    if (!held()) hideTimer = setTimeout(() => { if (!held()) setVisible(false); }, 4000);
  };
  const reveal = () => {
    setVisible(true);
    scheduleHide();
  };
  // 来源行属于同一悬停区域，鼠标移到链接上时仍可阅读、点击。
  group.addEventListener('pointerenter', event => {
    if (event.pointerType === 'touch') return;
    hovered = true;
    reveal();
  });
  group.addEventListener('pointerleave', event => {
    if (event.pointerType === 'touch') return;
    hovered = false;
    scheduleHide();
  });
  group.addEventListener('focusin', reveal);
  group.addEventListener('focusout', event => {
    if (!group.contains(event.relatedTarget)) queueMicrotask(scheduleHide);
  });
  weather.addEventListener('click', reveal);
  return reveal;
}

export function showToast(key) {
  clearTimeout(toastTimer);
  setMessage($('toast'), key);
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500);
}

export function initShell() {
  populateIcons();
  revealWeatherSource = initWeatherSource();
  $('languageSelect').addEventListener('change', event => setLanguage(event.target.value));
  const refreshLabels = () => {
    $('panelToggle').setAttribute('aria-label', t($('panel').hidden ? 'panel.open' : 'panel.close'));
    $('fullscreenBtn').setAttribute('aria-label', t(document.fullscreenElement ? 'fullscreen.exit' : 'fullscreen.enter'));
  };
  // 这些标签依赖运行状态，语言变化时不能仅恢复 HTML 中的初始文案。
  $('panelToggle').removeAttribute('data-i18n-aria-label');
  $('fullscreenBtn').removeAttribute('data-i18n-aria-label');
  onLanguageChange(() => {
    refreshLabels();
    if (lastObservation) updateObservation(lastObservation);
  });
  const setPanel = (open, restoreFocus = false) => {
    document.body.dataset.panelOpen = String(open);
    $('panel').hidden = !open;
    $('panel').dataset.open = String(open);
    $('panelToggle').setAttribute('aria-expanded', String(open));
    refreshLabels();
    if (restoreFocus) $('panelToggle').focus();
  };
  const selectTab = (name, focus = false) => {
    document.querySelectorAll('[data-tab]').forEach(btn => {
      const selected = btn.dataset.tab === name;
      btn.setAttribute('aria-selected', String(selected));
      btn.tabIndex = selected ? 0 : -1;
      $(`pane-${btn.dataset.tab}`).hidden = !selected;
      if (selected && focus) btn.focus();
    });
    $('panelBody').scrollTop = 0;
  };
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => selectTab(btn.dataset.tab));
    btn.addEventListener('keydown', e => {
      const tabs = ['now', 'weather', 'landscape'];
      let idx = tabs.indexOf(btn.dataset.tab);
      if (e.key === 'ArrowRight') idx = (idx + 1) % 3;
      else if (e.key === 'ArrowLeft') idx = (idx + 2) % 3;
      else if (e.key === 'Home') idx = 0;
      else if (e.key === 'End') idx = 2;
      else return;
      e.preventDefault(); selectTab(tabs[idx], true);
    });
  });
  const narrow = matchMedia('(max-width: 700px)');
  setPanel(!narrow.matches);
  $('panelToggle').addEventListener('click', () => setPanel($('panel').hidden));
  $('panelClose').addEventListener('click', () => setPanel(false, true));
  $('placeBtn').addEventListener('click', () => { setPanel(true); selectTab('now'); $('citySearch').focus(); });
  const setImmersive = (active) => {
    document.body.dataset.immersive = String(active);
    document.querySelectorAll('.chrome').forEach(el => { el.inert = active; });
    $('restoreBtn').hidden = !active;
    if (active) $('restoreBtn').focus();
    else $('immersiveBtn').focus();
  };
  $('immersiveBtn').addEventListener('click', () => setImmersive(true));
  $('restoreBtn').addEventListener('click', () => setImmersive(false));
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else showToast('fullscreen.unsupported');
    } catch { showToast('fullscreen.unavailable'); }
  };
  $('fullscreenBtn').addEventListener('click', fullscreen);
  document.addEventListener('fullscreenchange', refreshLabels);
  $('helpBtn').addEventListener('click', () => $('helpDialog').showModal());
  $('helpClose').addEventListener('click', () => $('helpDialog').close());
  $('helpDialog').addEventListener('click', e => { if (e.target === $('helpDialog')) $('helpDialog').close(); });
  $('reloadBtn').addEventListener('click', () => location.reload());
  window.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey || $('helpDialog').open) return;
    if (e.key === 'Escape') {
      if (document.body.dataset.immersive === 'true') setImmersive(false);
      else setPanel(false);
    }
    if (e.key.toLowerCase() === 'h') setImmersive(document.body.dataset.immersive !== 'true');
    if (e.key.toLowerCase() === 'f') fullscreen();
  });
}

export function updateObservation(state) {
  lastObservation = state;
  const { loc, ms, live, weather, coverage, wind, followNow, speed, sun, phase } = state;
  $('observerCity').textContent = locationName(loc);
  $('observerEnglish').textContent = (CITIES.find(c => c[0] === loc.name)?.[1] || '').toUpperCase();
  $('observerEnglish').hidden = getLanguage() === 'en' || !$('observerEnglish').textContent;
  $('observerTime').textContent = fmtTime(zonedHours(loc.tz, ms));
  $('observerTime').dateTime = new Date(ms).toISOString();
  const dateKey = `${getLocale()}|${loc.tz}`;
  if (dateKey !== lastDateKey) {
    dateFormatter = new Intl.DateTimeFormat(getLocale(), { timeZone: loc.tz, month: 'long', day: 'numeric', weekday: 'long' });
    lastDateKey = dateKey;
  }
  $('observerDate').textContent = dateFormatter.format(ms);
  const weatherInfo = $('observerWeather');
  delete weatherInfo.dataset.i18n;
  weatherInfo.textContent = [t(`weather.${weather}`), t('weather.cloudValue', { value: Math.round(live?.cloud_cover ?? coverage * 100) }), t(live ? 'weather.windValue' : 'weather.cloudSpeedValue', { value: Number(live?.wind_speed_10m ?? wind).toFixed(1) })].join(' · ');
  const source = $('weatherSource');
  const sourceKey = `${getLocale()}|${loc.lat},${loc.lon}|${loc.tz}|${live ? `live:${live.fetchedAt}` : state.weatherSource}`;
  // 每半秒的观测刷新不重置隐藏计时，也不重建正在聚焦的来源链接。
  if (sourceKey !== lastSourceKey) {
    lastSourceKey = sourceKey;
    if (live) {
      let link = source.querySelector('a');
      if (!link) {
        link = document.createElement('a');
        link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Open-Meteo';
        source.replaceChildren(document.createTextNode(''), link);
      }
      source.firstChild.textContent = t('weather.data') + ' ';
      link.href = weatherPageUrl(loc);
      source.title = t('weather.fetched', { time: new Date(live.fetchedAt).toLocaleTimeString(getLocale(), { timeZone: loc.tz }) });
    } else {
      source.textContent = t(state.weatherSource);
      source.title = '';
    }
    revealWeatherSource();
  }
  setMessage($('liveLabel'), followNow && speed === 1 ? 'time.live' : speed === 0 ? 'time.still' : 'time.roaming');
  $('liveStatus').dataset.live = String(followNow && speed === 1);
  $('sunriseText').textContent = sun.polar ? t(sun.polar === 'day' ? 'sun.polarDay' : 'sun.polarNight') : t('sun.rise', { time: sun.rise === null ? '--' : fmtTime(zonedHours(loc.tz, sun.rise)) });
  $('sunsetText').textContent = sun.polar ? t(`phase.${phase}`) : t('sun.set', { time: sun.set === null ? '--' : fmtTime(zonedHours(loc.tz, sun.set)) });
  document.body.dataset.daylight = String(state.sunAltitude > 8);
}
