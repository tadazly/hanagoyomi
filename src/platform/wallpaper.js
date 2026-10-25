import { WALLPAPER_MODE, storageKey } from './environment.js';
import { setLanguage } from '../i18n/index.js';
import { createHostPropertySnapshot } from './host-properties.js';
import { setWallpaperSettingsMode } from '../ui/wallpaper-settings-mode.js';

export const wallpaperSettings = { fps: 30, paused: false };
export const HOST_PROPERTIES_KEY = storageKey('hanagoyomi.host-properties.v1');

export function attachWallpaper(world, shell) {
  if (!WALLPAPER_MODE || !world) return;
  // 浏览器和 Plash 预览没有原生属性，不能用一组伪默认值覆盖本地偏好。
  const host = window.hanagoyomiWallpaper;
  if (!host) return;
  let storage;
  try { storage = localStorage; } catch {}
  return connectWallpaperHost(world, shell, { host, document, storage,
    onNativeProperties: useWorldSettings => setWallpaperSettingsMode(document, useWorldSettings) });
}

export function connectWallpaperHost(world, shell, { host, document, storage, onNativeProperties }) {
  const snapshot = createHostPropertySnapshot(storage, HOST_PROPERTIES_KEY);
  let useWorldSettings = true, modeResolved = false, nativeStarted = false, startupPositionPending = false;
  const initializedNativeKeys = new Set();
  let sceneImportLink;
  // 城市必须先于模拟当地时刻应用，不能依赖宿主回调或旧快照的键顺序。
  const supported = new Set(['city', 'quality', 'renderscale', 'interaction', 'autoflight', 'weathermode',
    'weatherpreset', 'realtime', 'timeofday', 'showlogo', 'logoposition', 'showclock', 'clockposition',
    'temperatureunit', 'petals', 'lowsaturation', 'vignette', 'constellations', 'lensdrops', 'dof', 'rememberposition', 'language']);
  const change = (id, value, type = 'change') => {
    const element = document.getElementById(id);
    if (!element) return;
    if (element.type === 'checkbox') element.checked = Boolean(value);
    else element.value = String(value);
    element.dispatchEvent(new Event(type, { bubbles: true }));
  };
  const radio = (name, value) => {
    const element = [...document.querySelectorAll(`input[name="${name}"]`)].find(input => input.value === value);
    if (element) { element.checked = true; element.dispatchEvent(new Event('change', { bubbles: true })); }
  };
  const click = element => element?.click();
  const properties = incoming => {
    if (!Object.keys(incoming).length) return;
    Object.assign(host.properties, incoming);
    const wasWorldSettings = useWorldSettings;
    // 新开关缺失或延迟首发时保护已有世界，不从旧快照猜测模式。
    useWorldSettings = host.properties.useworldsettings?.value !== false;
    if (wasWorldSettings !== useWorldSettings) startupPositionPending = false;
    if (!modeResolved && typeof incoming.useworldsettings?.value === 'boolean') {
      modeResolved = true; startupPositionPending = !useWorldSettings;
    }
    onNativeProperties?.(useWorldSettings);
    // 原生输入只传递待预览链接，不属于已应用的世界设置或宿主快照。
    const { sceneimportlink } = incoming;
    if (typeof sceneimportlink?.value === 'string' && sceneimportlink.value !== sceneImportLink) {
      sceneImportLink = sceneimportlink.value;
      const link = sceneImportLink;
      // 首发可在画廊初始化前到达；本轮同步初始化结束后再交给 UI 校验和确认。
      queueMicrotask(() => document.dispatchEvent?.(new CustomEvent('wallpaperscenelink', { detail: { link } })));
    }
    if (useWorldSettings) {
      // 保留内置渲染比例，隐藏的宿主属性不能覆盖本机偏好。
      return;
    }
    // 每次启动、或刚从世界模式切入时，完整应用已收到的原生值；旧快照不得阻止覆盖。
    const force = !nativeStarted || wasWorldSettings;
    const settings = Object.fromEntries(Object.entries(force ? host.properties : incoming).filter(([key]) => supported.has(key)));
    if (!Object.keys(settings).length) return;
    const valid = snapshot.changed(settings, true), changed = snapshot.changed(settings);
    const changes = Object.fromEntries([...supported].filter(key => Object.hasOwn(valid, key)
      && (force || !initializedNativeKeys.has(key) || Object.hasOwn(changed, key))).map(key => [key, valid[key]]));
    for (const key of Object.keys(valid)) initializedNativeKeys.add(key);
    nativeStarted = true;
    if (Object.keys(changes).length) {
      // 原生调整属于真实世界，先同步关闭画廊预览，避免改到临时场景后被还原丢失。
      document.dispatchEvent?.(new CustomEvent('worldpanelopen', { detail: { panel: 'host' } }));
      if (world.isPreviewing?.()) world.cancelPreview?.();
    }
    // 原生明确调整时间或天气时，解除相应场景锁；其他选项不改变风景锁。
    const unlock = {};
    if (changes.realtime || (changes.timeofday && host.properties.realtime?.value === false)) unlock.freezeTime = false;
    if (changes.weathermode || (changes.weatherpreset && host.properties.weathermode?.value === 'manual')) unlock.freezeWeather = false;
    if (Object.keys(unlock).length) world.setPreviewFreeze?.(unlock);
    for (const [key, property] of Object.entries(changes)) {
      if (!property || !Object.hasOwn(property, 'value')) continue;
      const value = property.value;
      if (key === 'quality') radio('q', value);
      else if (key === 'weathermode') radio('wxMode', value);
      else if (key === 'weatherpreset') { /* 在下方按当前天气模式应用。 */ }
      else if (key === 'city') world.setCity(value);
      else if (key === 'language') setLanguage(value);
      else if (key === 'realtime') {
        if (value) click(document.getElementById('syncNow'));
        else change('time', Number.isFinite(host.properties.timeofday?.value) ? host.properties.timeofday.value : Number(document.getElementById('time').value), 'input');
      }
      else if (key === 'timeofday' && Number.isFinite(value) && host.properties.realtime?.value === false) change('time', Math.max(0, Math.min(23.99, value)), 'input');
      else if (key === 'renderscale' && Number.isFinite(value)) change('renderScale', Math.max(.5, Math.min(1.5, value)), 'input');
      else if (key === 'dof' && Number.isFinite(value)) change('dof', Math.max(0, Math.min(1, value)), 'input');
      else if (key === 'showlogo') shell.components.set('logo', { visible: Boolean(value) });
      else if (key === 'showclock') shell.components.set('observation', { visible: Boolean(value) });
      else if (key === 'logoposition') shell.components.set('logo', { position: value });
      else if (key === 'clockposition') shell.components.set('observation', { position: value });
      else if (key === 'temperatureunit') radio('temperatureUnit', value);
      else if (key === 'lowsaturation') change('lowSaturation', value);
      else if (key === 'vignette' && typeof value === 'boolean') change('vignette', value);
      else if (key === 'rememberposition' && typeof value === 'boolean') change('rememberPosition', value);
      else if ({ interaction: 1, autoflight: 1, petals: 1, lensdrops: 1, constellations: 1 }[key]) {
        change({ interaction: 'interactionEnabled', autoflight: 'auto', petals: 'petals', lensdrops: 'lensDrops', constellations: 'constel' }[key], value);
      }
    }
    if ((changes.weatherpreset || changes.weathermode) && host.properties.weathermode?.value === 'manual') {
      // 桌面可独立改变模式；原生明确选择预设时恢复手动模式，即使宿主模式值没变。
      if (!changes.weathermode) radio('wxMode', 'manual');
      const preset = String(host.properties.weatherpreset?.value || 'cloudy').replace(/[^a-z]/g, '');
      click(document.querySelector(`#wxTypes [data-wx="${preset}"]`));
    }
    if (startupPositionPending && typeof host.properties.rememberposition?.value === 'boolean') {
      world.applyStartupPositionPreference?.(host.properties.rememberposition.value);
      startupPositionPending = false;
    }
    if (Object.keys(changes).length) world.save();
    snapshot.remember(settings);
  };
  const general = values => {
    if (Number.isFinite(values.fps) && values.fps >= 0) {
      wallpaperSettings.fps = values.fps === 0 ? 0 : Math.max(1, Math.floor(values.fps));
      world.syncRenderSettings?.();
    }
  };
  const pause = paused => {
    if (wallpaperSettings.paused === paused) return;
    wallpaperSettings.paused = paused; world.setPaused(paused);
  };
  host.listener = { properties, general, pause };
  general(host.general);
  if (Object.keys(host.properties).length) properties(host.properties);
  pause(host.paused);
  return host.listener;
}
