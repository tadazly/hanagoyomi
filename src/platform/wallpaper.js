import { WALLPAPER_MODE } from './environment.js';
import { setLanguage } from '../i18n/index.js';

export const wallpaperSettings = { fps: 30, paused: false, renderScale: 1 };

export function attachWallpaper(world, shell) {
  if (!WALLPAPER_MODE || !world) return;
  const host = window.hanagoyomiWallpaper ??= { properties: {}, general: {}, paused: false };
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
  const properties = changes => {
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
      else if (key === 'renderscale' && Number.isFinite(value)) { wallpaperSettings.renderScale = Math.max(0.5, Math.min(1, value)); world.resize(); }
      else if (key === 'dof' && Number.isFinite(value)) change('dof', Math.max(0, Math.min(1, value)), 'input');
      else if (key === 'showlogo') shell.components.set('logo', { visible: Boolean(value) });
      else if (key === 'showclock') shell.components.set('observation', { visible: Boolean(value) });
      else if (key === 'logoposition') shell.components.set('logo', { position: value });
      else if (key === 'clockposition') shell.components.set('observation', { position: value });
      else if (key === 'settingspanel') shell.setPanel(Boolean(value));
      else if ({ interaction: 1, autoflight: 1, petals: 1, lensdrops: 1, constellations: 1 }[key]) {
        change({ interaction: 'interactionEnabled', autoflight: 'auto', petals: 'petals', lensdrops: 'lensDrops', constellations: 'constel' }[key], value);
      }
    }
    if ((changes.weatherpreset || changes.weathermode) && host.properties.weathermode?.value === 'manual') {
      const preset = String(host.properties.weatherpreset?.value || 'cloudy').replace(/[^a-z]/g, '');
      document.querySelector(`#wxTypes [data-wx="${preset}"]`)?.click();
    }
    world.save();
  };
  const general = values => {
    if (Number.isFinite(values.fps) && values.fps >= 0) wallpaperSettings.fps = Math.min(240, values.fps);
  };
  const pause = paused => {
    if (wallpaperSettings.paused === paused) return;
    wallpaperSettings.paused = paused; world.setPaused(paused);
  };
  host.listener = { properties, general, pause };
  general(host.general); properties(host.properties); pause(host.paused);
}
