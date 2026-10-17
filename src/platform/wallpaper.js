import { WALLPAPER_MODE, storageKey } from './environment.js';
import { setLanguage } from '../i18n/index.js';
import { createHostPropertySnapshot } from './host-properties.js';

export const wallpaperSettings = { fps: 30, paused: false, renderScale: 1 };
export const HOST_PROPERTIES_KEY = storageKey('hanagoyomi.host-properties.v1');

export function attachWallpaper(world, shell) {
  if (!WALLPAPER_MODE || !world) return;
  // 浏览器和 Plash 预览没有原生属性，不能用一组伪默认值覆盖本地偏好。
  const host = window.hanagoyomiWallpaper;
  if (!host) return;
  let storage;
  try { storage = localStorage; } catch {}
  return connectWallpaperHost(world, shell, { host, document, storage });
}

export function connectWallpaperHost(world, shell, { host, document, storage }) {
  const snapshot = createHostPropertySnapshot(storage, HOST_PROPERTIES_KEY);
  let firstProperties = true;
  let sceneImportLink;
  let vignetteNeedsBaseline = world.hasRestoredSettings && snapshot.get('vignette') === undefined;
  const resizeScale = value => {
    const scale = Math.max(.5, Math.min(1, value));
    if (wallpaperSettings.renderScale !== scale) { wallpaperSettings.renderScale = scale; world.resize(); }
  };
  if (snapshot.restored && Number.isFinite(snapshot.get('renderscale'))) resizeScale(snapshot.get('renderscale'));
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
  const properties = incoming => {
    // 原生输入只传递待预览链接，不属于已应用的世界设置或宿主快照。
    const { sceneimportlink, ...settings } = incoming;
    if (typeof sceneimportlink?.value === 'string' && sceneimportlink.value !== sceneImportLink) {
      sceneImportLink = sceneimportlink.value;
      const link = sceneImportLink;
      // 首发可在画廊初始化前到达；本轮同步初始化结束后再交给 UI 校验和确认。
      queueMicrotask(() => document.dispatchEvent?.(new CustomEvent('wallpaperscenelink', { detail: { link } })));
    }
    if (!Object.keys(settings).length) return;
    // 升级前已有世界设置、却没有新版宿主快照时，无法判断启动值是否是旧默认。
    // 首次仅恢复运行参数并建立比较基线，优先保护用户已保存的世界。
    const migrating = firstProperties && world.hasRestoredSettings && !snapshot.restored;
    const changes = migrating
      ? snapshot.changed({ renderscale: settings.renderscale })
      : snapshot.changed(settings, firstProperties && !world.hasRestoredSettings);
    // 旧宿主快照没有新增的暗角属性；首次仅记录默认值，不能覆盖本机已保存的关闭状态。
    if (vignetteNeedsBaseline && typeof settings.vignette?.value === 'boolean') {
      delete changes.vignette; vignetteNeedsBaseline = false;
    }
    firstProperties = false;
    if (Object.keys(changes).length) {
      // 原生调整属于真实世界，先同步关闭画廊预览，避免改到临时场景后被还原丢失。
      document.dispatchEvent?.(new CustomEvent('worldpanelopen', { detail: { panel: 'host' } }));
      if (world.isPreviewing?.()) world.cancelPreview?.();
    }
    for (const [key, property] of Object.entries(changes)) {
      if (!property || !Object.hasOwn(property, 'value')) continue;
      const value = property.value;
      if (key === 'quality') radio('q', value);
      else if (key === 'weathermode') radio('wxMode', value);
      else if (key === 'weatherpreset') { /* 在下方按当前天气模式应用。 */ }
      else if (key === 'city') world.setCity(value);
      else if (key === 'language') setLanguage(value);
      else if (key === 'realtime') {
        if (value) document.getElementById('syncNow').click();
        else change('time', Number.isFinite(host.properties.timeofday?.value) ? host.properties.timeofday.value : Number(document.getElementById('time').value), 'input');
      }
      else if (key === 'timeofday' && Number.isFinite(value) && host.properties.realtime?.value === false) change('time', Math.max(0, Math.min(23.99, value)), 'input');
      else if (key === 'renderscale' && Number.isFinite(value)) resizeScale(value);
      else if (key === 'dof' && Number.isFinite(value)) change('dof', Math.max(0, Math.min(1, value)), 'input');
      else if (key === 'showlogo') shell.components.set('logo', { visible: Boolean(value) });
      else if (key === 'showclock') shell.components.set('observation', { visible: Boolean(value) });
      else if (key === 'logoposition') shell.components.set('logo', { position: value });
      else if (key === 'clockposition') shell.components.set('observation', { position: value });
      else if (key === 'settingspanel') shell.setPanel(Boolean(value));
      else if (key === 'lowsaturation') change('lowSaturation', value);
      else if (key === 'vignette' && typeof value === 'boolean') change('vignette', value);
      else if ({ interaction: 1, autoflight: 1, petals: 1, lensdrops: 1, constellations: 1 }[key]) {
        change({ interaction: 'interactionEnabled', autoflight: 'auto', petals: 'petals', lensdrops: 'lensDrops', constellations: 'constel' }[key], value);
      }
    }
    if ((changes.weatherpreset || changes.weathermode) && host.properties.weathermode?.value === 'manual') {
      const preset = String(host.properties.weatherpreset?.value || 'cloudy').replace(/[^a-z]/g, '');
      document.querySelector(`#wxTypes [data-wx="${preset}"]`)?.click();
    }
    world.save();
    snapshot.remember(settings);
  };
  const general = values => {
    if (Number.isFinite(values.fps) && values.fps >= 0) wallpaperSettings.fps = Math.min(240, values.fps);
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
