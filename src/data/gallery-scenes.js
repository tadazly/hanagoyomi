import { validateScene } from '../world/scene-state.js';
import { wxPreset } from '../world/weather-presets.js';
import { RECOMMENDED_SCENES } from './gallery-recommendations.js';

function scene(id, title, description, hour, weather, camera = {}, settings = {}) {
  const current = wxPreset(weather);
  const value = validateScene({ version: 1, camera,
    settings: { wxType: weather, coverage: current.cov, density: current.dens, wind: current.wind, breeze: current.breeze,
      fogVisS: 1000 * Math.log(current.vis / 60) / Math.log(500), rainAmt: current.rain, snowAmt: current.snow,
      boltFreq: current.bolt, puddle: current.wet, snowMax: current.snowCov, ...settings },
    environment: { time: { ms: Date.parse('2026-10-18T00:00:00Z') + (hour - 9) * 3600000, localHour: hour }, weather: { type: weather, current } },
  });
  return { id, title: { zh: title[0], en: title[1], ja: title[2] },
    description: { zh: description[0], en: description[1], ja: description[2] }, scene: value, thumbnail: `gallery/${id}.jpg` };
}

// 所有封面来自同一 WebGL 世界；不改变主干地形或着色器。
export const GALLERY_SCENES = Object.freeze([
  scene('meadow', ['晴日花海', 'Sunlit meadow', '晴れの花畑'], ['晴朗 · 午后', 'Clear · Afternoon', '晴れ · 午後'], 15, 'clear'),
  scene('mist', ['山谷晨雾', 'Morning mist', '谷の朝霧'], ['薄雾 · 清晨', 'Mist · Dawn', '薄霧 · 朝'], 6.5, 'mist', { agl: 22, pitch: -.07 }, { sunAz: 270 }),
  scene('sunset', ['落日余温', 'Afterglow', '夕日の余韻'], ['少云 · 黄昏', 'Few clouds · Dusk', '薄曇り · 夕暮れ'], 17, 'fewcloud', { yaw: 4.1, pitch: .015 }, { sunAz: 317 }),
  scene('stars', ['星河入梦', 'Among the stars', '星空の夢'], ['晴朗 · 深夜', 'Clear · Midnight', '晴れ · 真夜中'], 23, 'clear', { pitch: .32 }, { constel: true, flowerGlow: true }),
  scene('rain', ['雨落草间', 'Rain on the meadow', '草原の雨'], ['小雨 · 午后', 'Light rain · Afternoon', '小雨 · 午後'], 14, 'lightrain', {}, { lensDrops: true, lowSaturation: true }),
  scene('snow', ['雪野微光', 'Quiet snowfall', '雪原の光'], ['小雪 · 上午', 'Light snow · Morning', '小雪 · 午前'], 10, 'lightsnow', { agl: 3 }, { petals: false }),
  scene('clouds', ['云影漫游', 'Passing clouds', '流れる雲影'], ['多云 · 午后', 'Cloudy · Afternoon', '曇り · 午後'], 14.5, 'cloudy', { agl: 12, pitch: .1 }),
  scene('sky', ['云上远行', 'Above the clouds', '雲の上へ'], ['少云 · 清晨', 'Few clouds · Morning', '薄曇り · 朝'], 7, 'fewcloud', { agl: 2200, pitch: -.18 }, { petals: false, sunAz: 240 }),
  ...RECOMMENDED_SCENES,
]);
