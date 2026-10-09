import { populateIcons } from './icons.js';
import { initTimeControls } from './time-controls.js';
import { fmtTime, zonedHours } from '../world/clock.js';
import { CITIES, locationName } from '../data/cities.js';
import { airQualityPageUrl, weatherPageUrl } from '../world/weather.js';
import { updateWeatherDetails } from './weather-details.js';
import { initComponentSettings } from './component-settings.js';
import { getSavedLocation, onLocationChange } from '../world/location.js';
import { getLanguage, getLocale, onLanguageChange, setLanguage, setMessage, t, translateDocument } from '../i18n/index.js';
import { WALLPAPER_MODE, storageKey } from '../platform/environment.js';
const $ = (id) => document.getElementById(id);
let toastTimer, lastDateKey = '', lastSourceKey = '', dateFormatter, lastObservation;
let revealWeatherSource = () => {};

function initLanguageControls() {
  const select = $('languageSelect');
  select.addEventListener('change', event => setLanguage(event.target.value));
  if (!WALLPAPER_MODE) return;
  // CEF 离屏渲染在显示原生 select 时会崩溃；保留其状态桥接，使用普通按钮绘制选项。
  select.hidden = true;
  select.parentElement.classList.add('wallpaper-language-field');
  const group = document.createElement('div');
  group.className = 'seg wallpaper-language-options';
  group.setAttribute('role', 'group');
  group.setAttribute('data-i18n-aria-label', 'language.label');
  group.setAttribute('aria-label', t('language.label'));
  for (const option of select.options) {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.languageOption = option.value;
    if (option.lang) button.lang = option.lang;
    if (option.dataset.i18n) setMessage(button, option.dataset.i18n);
    else button.textContent = option.textContent;
    button.addEventListener('click', () => setLanguage(option.value));
    group.append(button);
  }
  const refresh = () => group.querySelectorAll('button').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.languageOption === select.value));
  });
  select.after(group);
  onLanguageChange(refresh);
  refresh();
}

function initWallpaperToolbar() {
  if (!WALLPAPER_MODE) return;
  const toolbar = document.querySelector('.toolbar');
  const zone = document.createElement('div'); zone.id = 'wallpaperToolbarZone';
  document.body.append(zone);
  let timer, hovered = false;
  const held = () => hovered || !$('panel').hidden || !$('timePopover').hidden || $('helpDialog').open || Boolean(toolbar.querySelector(':focus-visible'));
  const hideLater = () => {
    clearTimeout(timer);
    if (!held()) timer = setTimeout(() => { if (!held()) toolbar.dataset.visible = 'false'; }, 4000);
  };
  const reveal = () => { toolbar.dataset.visible = 'true'; hideLater(); };
  for (const element of [zone, toolbar]) {
    element.addEventListener('pointerenter', () => { hovered = true; reveal(); });
    element.addEventListener('pointerleave', () => { hovered = false; hideLater(); });
    element.addEventListener('pointerdown', reveal);
  }
  toolbar.addEventListener('focusin', reveal); toolbar.addEventListener('focusout', hideLater);
  const changes = new MutationObserver(() => { if (held()) reveal(); else hideLater(); });
  changes.observe(document.body, { attributes: true, attributeFilter: ['data-panel-open'] });
  changes.observe($('timePopover'), { attributes: true, attributeFilter: ['hidden'] });
  changes.observe($('helpDialog'), { attributes: true, attributeFilter: ['open'] });
  reveal();
}

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

function initRestoreButton() {
  const zone = $('restoreZone'), button = $('restoreBtn');
  let hideTimer, hovered = false;
  const held = () => hovered || button.matches(':focus-visible');
  const setVisible = visible => {
    button.dataset.visible = String(visible);
    button.setAttribute('aria-hidden', String(!visible));
    if (!visible && document.activeElement === button) $('view').focus({ preventScroll: true });
    button.inert = !visible;
  };
  const scheduleHide = () => {
    clearTimeout(hideTimer);
    if (!zone.hidden && button.dataset.visible === 'true' && !held()) {
      hideTimer = setTimeout(() => { if (!held()) setVisible(false); }, 4000);
    }
  };
  const reveal = () => {
    if (zone.hidden) return;
    setVisible(true);
    scheduleHide();
  };
  zone.addEventListener('pointerenter', event => {
    if (event.pointerType === 'touch') return;
    hovered = true;
    reveal();
  });
  zone.addEventListener('pointerleave', event => {
    if (event.pointerType === 'touch') return;
    hovered = false;
    scheduleHide();
  });
  zone.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch') return;
    // 隐藏时的第一次触摸只唤出按钮，第二次点击按钮才返回界面。
    if (event.target === zone) event.preventDefault();
    reveal();
  });
  button.addEventListener('focusin', reveal);
  button.addEventListener('focusout', scheduleHide);
  window.addEventListener('keydown', event => {
    if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey && !zone.hidden && button.dataset.visible !== 'true') {
      event.preventDefault();
      reveal();
      button.focus();
    }
  });
  return active => {
    clearTimeout(hideTimer);
    hovered = false;
    zone.hidden = !active;
    setVisible(active);
    if (active) scheduleHide();
  };
}

export function showToast(key) {
  clearTimeout(toastTimer);
  setMessage($('toast'), key);
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500);
}

export function initShell() {
  initTimeControls();
  populateIcons();
  translateDocument();
  const components = initComponentSettings();
  revealWeatherSource = initWeatherSource();
  const setRestoreButton = initRestoreButton();
  const timePopover = $('timePopover'), timeTrigger = $('liveStatus');
  const positionTimePopover = () => {
    if (timePopover.hidden) return;
    if (!timeTrigger.getClientRects().length) {
      timePopover.hidden = true;
      timeTrigger.setAttribute('aria-expanded', 'false');
      return;
    }
    const anchor = timeTrigger.getBoundingClientRect();
    const left = Math.max(12, Math.min(anchor.right - timePopover.offsetWidth, window.innerWidth - timePopover.offsetWidth - 12));
    const top = WALLPAPER_MODE ? Math.max(12, anchor.top - timePopover.offsetHeight - 12) : anchor.bottom + 12;
    timePopover.style.left = `${left}px`;
    timePopover.style.top = `${top}px`;
    timePopover.style.maxHeight = `${Math.max(0, window.innerHeight - top - 12)}px`;
  };
  const setTimePopover = (open, restoreFocus = false) => {
    timePopover.hidden = !open;
    timeTrigger.setAttribute('aria-expanded', String(open));
    if (open) {
      positionTimePopover();
      $('quick-time').focus({ preventScroll: true });
    } else if (restoreFocus) timeTrigger.focus({ preventScroll: true });
  };
  timeTrigger.addEventListener('click', () => setTimePopover(timePopover.hidden));
  $('timePopoverClose').addEventListener('click', () => setTimePopover(false, true));
  const dismissTimePopover = event => {
    if (!timePopover.hidden && !timePopover.contains(event.target) && !timeTrigger.contains(event.target)) setTimePopover(false);
  };
  document.addEventListener('pointerdown', dismissTimePopover);
  document.addEventListener('focusin', dismissTimePopover);
  window.addEventListener('resize', positionTimePopover);
  document.addEventListener('fullscreenchange', positionTimePopover);
  initLanguageControls();
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
    positionTimePopover();
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
      const tabs = [...document.querySelectorAll('[data-tab]')].map(tab => tab.dataset.tab);
      let idx = tabs.indexOf(btn.dataset.tab);
      if (e.key === 'ArrowRight') idx = (idx + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') idx = (idx + tabs.length - 1) % tabs.length;
      else if (e.key === 'Home') idx = 0;
      else if (e.key === 'End') idx = tabs.length - 1;
      else return;
      e.preventDefault(); selectTab(tabs[idx], true);
    });
  });
  const narrow = matchMedia('(max-width: 700px)');
  const savedLocation = getSavedLocation(), startupOption = $('startupPanelOption'), startupToggle = $('openPanelOnStartup');
  let openOnStartup = false;
  try { openOnStartup = localStorage.getItem(storageKey('hanagoyomi.panelOnStartup.v1')) === 'true'; } catch {}
  startupToggle.checked = openOnStartup;
  startupOption.hidden = !savedLocation;
  onLocationChange(() => { startupOption.hidden = false; });
  startupToggle.addEventListener('change', () => {
    try { localStorage.setItem(storageKey('hanagoyomi.panelOnStartup.v1'), String(startupToggle.checked)); } catch {}
  });
  // 初次访问沿用原来的布局；设置过地点后才按用户保存的启动选项展开。
  setPanel(WALLPAPER_MODE ? openOnStartup : savedLocation ? openOnStartup : !narrow.matches);
  $('panelToggle').addEventListener('click', () => setPanel($('panel').hidden));
  $('panelClose').addEventListener('click', () => setPanel(false, true));
  $('placeBtn').addEventListener('click', () => { setPanel(true); selectTab('now'); $('citySearch').focus(); });
  const setImmersive = (active) => {
    if (active) setTimePopover(false);
    document.body.dataset.immersive = String(active);
    document.querySelectorAll('.chrome').forEach(el => { el.inert = active; });
    // 初始焦点放到风景，避免按钮被程序聚焦后一直无法自动隐藏。
    if (active) $('view').focus({ preventScroll: true });
    setRestoreButton(active);
    if (!active) $('immersiveBtn').focus();
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
  $('helpBtn').addEventListener('click', () => { setTimePopover(false); $('helpDialog').showModal(); });
  $('componentHelpBtn').addEventListener('click', () => { setTimePopover(false); $('helpDialog').showModal(); });
  $('helpClose').addEventListener('click', () => $('helpDialog').close());
  $('helpDialog').addEventListener('click', e => { if (e.target === $('helpDialog')) $('helpDialog').close(); });
  $('reloadBtn').addEventListener('click', () => location.reload());
  window.addEventListener('keydown', e => {
    // 快捷面板里的滑块聚焦时，Esc 也只关闭快捷面板。
    if (e.key === 'Escape' && !timePopover.hidden) {
      e.preventDefault();
      setTimePopover(false, true);
      return;
    }
    if (e.target.closest('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey || $('helpDialog').open) return;
    if (document.body.dataset.sceneInteractive === 'false' && e.key !== 'Escape') return;
    if (e.key === 'Escape') {
      if (document.body.dataset.immersive === 'true') setImmersive(false);
      else setPanel(false);
    }
    if (e.key.toLowerCase() === 'h') setImmersive(document.body.dataset.immersive !== 'true');
    if (e.key.toLowerCase() === 'f') fullscreen();
  });
  if (WALLPAPER_MODE) {
    $('fullscreenBtn').hidden = true;
    document.querySelector('.github-button').hidden = true;
    $('geoBtn').hidden = true;
    initWallpaperToolbar();
  }
  return { components, setPanel };
}

export function updateObservation(state) {
  lastObservation = state;
  const { loc, ms, live, weather, coverage, wind, followNow, speed } = state;
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
  const condition = $('observerCondition'), group = $('observerWeatherGroup'), display = state.weatherDisplay || {};
  delete condition.dataset.i18n;
  condition.textContent = t(`weather.${weather}`);
  group.hidden = display.show === false;
  group.querySelectorAll('[data-weather-field]').forEach(field => { field.hidden = display[field.dataset.weatherField] === false; });
  $('observerClouds').textContent = Math.round(live?.cloud_cover ?? coverage * 100) + '%';
  $('observerWind').textContent = Number(live?.wind_speed_10m ?? wind).toFixed(1) + ' m/s';
  $('observerWind').parentElement.title = t(live ? 'weather.windValue' : 'weather.cloudSpeedValue', { value: Number(live?.wind_speed_10m ?? wind).toFixed(1) });
  updateWeatherDetails(group, { live, airQuality: state.airQuality, temperatureUnit: state.temperatureUnit, simulated: state.simulatedWeather, compact: true, hideUnavailable: state.hideUnavailableWeather, display });
  $('observerWeatherMetrics').hidden = ![...$('observerWeatherMetrics').children].some(field => !field.hidden);
  const source = $('weatherSource');
  const sourceKey = `${getLocale()}|${loc.lat},${loc.lon}|${loc.tz}|${state.temperatureUnit}|${state.airQuality?.fetchedAt}|${live ? `live:${live.fetchedAt}` : state.weatherSource}`;
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
      source.firstChild.textContent = t(live.cached ? 'weather.source.cached' : 'weather.data') + ' ';
      link.href = weatherPageUrl(loc, state.temperatureUnit);
      let airSource = source.querySelector('[data-air-source]');
      if (state.airQuality) {
        if (!airSource) {
          airSource = document.createElement('span'); airSource.dataset.airSource = '';
          const airLink = document.createElement('a');
          airLink.target = '_blank'; airLink.rel = 'noopener noreferrer'; airLink.textContent = 'Open-Meteo / CAMS';
          airSource.append(document.createTextNode(''), airLink); source.append(airSource);
        }
        airSource.firstChild.textContent = ' · ' + t('weather.airQuality') + ' ';
        airSource.querySelector('a').href = airQualityPageUrl(loc);
      } else airSource?.remove();
      source.title = t('weather.fetched', { time: new Date(live.fetchedAt).toLocaleTimeString(getLocale(), { timeZone: loc.tz }) });
    } else {
      source.textContent = t(state.weatherSource);
      source.title = '';
    }
    revealWeatherSource();
  }
  const timeState = followNow && speed === 1 ? 'time.live' : speed === 0 ? 'time.still' : 'time.roaming';
  setMessage($('liveLabel'), timeState);
  $('liveStatus').setAttribute('aria-label', `${t(timeState)} · ${t('time.settings')}`);
  $('liveStatus').dataset.live = String(followNow && speed === 1);
  document.body.dataset.daylight = String(state.sunAltitude > 8);
}
