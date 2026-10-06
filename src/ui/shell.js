import { populateIcons } from './icons.js';
import { fmtTime, zonedHours } from '../world/clock.js';
import { CITIES } from '../data/cities.js';
const $ = (id) => document.getElementById(id);
let toastTimer, lastDateKey = '', lastSourceKey = '', dateFormatter;

export function showToast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500);
}

export function initShell() {
  populateIcons();
  const setPanel = (open, restoreFocus = false) => {
    document.body.dataset.panelOpen = String(open);
    $('panel').hidden = !open;
    $('panel').dataset.open = String(open);
    $('panelToggle').setAttribute('aria-expanded', String(open));
    $('panelToggle').setAttribute('aria-label', open ? '关闭世界设置' : '打开世界设置');
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
      else showToast('当前浏览器不支持网页全屏，可使用沉浸模式。');
    } catch { showToast('全屏暂不可用，可使用沉浸模式。'); }
  };
  $('fullscreenBtn').addEventListener('click', fullscreen);
  document.addEventListener('fullscreenchange', () => $('fullscreenBtn').setAttribute('aria-label', document.fullscreenElement ? '退出全屏' : '进入全屏'));
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
  const { loc, ms, live, weather, coverage, wind, followNow, speed, sun, phase } = state;
  $('observerCity').textContent = loc.name;
  $('observerEnglish').textContent = (CITIES.find(c => c[0] === loc.name)?.[1] || '').toUpperCase();
  $('observerTime').textContent = fmtTime(zonedHours(loc.tz, ms));
  $('observerTime').dateTime = new Date(ms).toISOString();
  const dateKey = loc.tz;
  if (dateKey !== lastDateKey) {
    dateFormatter = new Intl.DateTimeFormat('zh-CN', { timeZone: loc.tz, month: 'long', day: 'numeric', weekday: 'long' });
    lastDateKey = dateKey;
  }
  $('observerDate').textContent = dateFormatter.format(ms).replace('日', '日，');
  $('observerWeather').textContent = `${weather} · 云量 ${Math.round(live?.cloud_cover ?? coverage * 100)}% · ${live ? '风速' : '云速'} ${Number(live?.wind_speed_10m ?? wind).toFixed(1)} m/s`;
  const source = $('weatherSource');
  const sourceKey = live ? `live:${live.fetchedAt}` : state.weatherSource;
  if (sourceKey !== lastSourceKey) {
    lastSourceKey = sourceKey;
    if (live) {
      source.replaceChildren(document.createTextNode('天气数据 '));
      const link = document.createElement('a'); link.href = 'https://open-meteo.com/'; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Open-Meteo'; source.appendChild(link);
      source.title = `最近获取 ${new Date(live.fetchedAt).toLocaleTimeString('zh-CN')}`;
    } else { source.textContent = state.weatherSource; source.title = ''; }
  }
  $('liveLabel').textContent = followNow && speed === 1 ? '跟随此刻' : speed === 0 ? '时间静止' : '漫游时间';
  $('liveStatus').dataset.live = String(followNow && speed === 1);
  $('sunriseText').textContent = sun.polar ? (sun.polar === 'day' ? '极昼' : '极夜') : `日出 ${sun.rise === null ? '--' : fmtTime(zonedHours(loc.tz, sun.rise))}`;
  $('sunsetText').textContent = sun.polar ? phase : `日落 ${sun.set === null ? '--' : fmtTime(zonedHours(loc.tz, sun.set))}`;
  document.body.dataset.daylight = String(state.sunAltitude > 8);
}
