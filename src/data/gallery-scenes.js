import { validateScene } from '../world/scene-state.js';
import { wxPreset } from '../world/weather-presets.js';
import { RECOMMENDED_SCENES } from './gallery-recommendations.js';
import { V6_SCENES } from './gallery-v6-scenes.js';
import { NIGHT_SKY_SCENES } from './gallery-night-scenes.js';

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
const scenes = [
  scene('meadow', ['晴日花海', 'Sunlit meadow', '晴れの花畑'], ['晴朗 · 午后', 'Clear · Afternoon', '晴れ · 午後'], 15, 'clear', { agl: 3 }),
  scene('sunset', ['落日余温', 'Afterglow', '夕日の余韻'], ['少云 · 黄昏', 'Few clouds · Dusk', '薄曇り · 夕暮れ'], 17, 'fewcloud', { yaw: 4.1, pitch: .015 }, { sunAz: 317 }),
  scene('stars', ['星河入梦', 'Among the stars', '星空の夢'], ['晴朗 · 深夜', 'Clear · Midnight', '晴れ · 真夜中'], 23, 'clear', { pitch: .32 }, { constel: true, flowerGlow: true }),
  scene('rain', ['雨落草间', 'Rain on the meadow', '草原の雨'], ['小雨 · 午后', 'Light rain · Afternoon', '小雨 · 午後'], 14, 'lightrain', {}, { petals: false, lensDrops: true, lowSaturation: true }),
  scene('snow', ['雪野微光', 'Quiet snowfall', '雪原の光'], ['小雪 · 上午', 'Light snow · Morning', '小雪 · 午前'], 10, 'lightsnow', { agl: 3 }, { petals: false }),
  ...RECOMMENDED_SCENES,
  ...V6_SCENES,
  ...NIGHT_SKY_SCENES,
];
// 按清晨、日间、雨雪与雨后、暮色、月夜到深夜排列，同类天气相邻。
const order = ['recommended-cloud-sea-dawn', 'recommended-mist-valley-dawn', 'snow', 'recommended-snowfield-blue', 'recommended-v6-snow-flowers',
  'recommended-rain-on-the-ridge', 'rain', 'recommended-v6-storm-flowers', 'meadow', 'recommended-film-gold-clear', 'recommended-wet-meadow-glow',
  'sunset', 'recommended-v6-cloudsea-dusk', 'recommended-rose-full', 'recommended-moon-cinema', 'recommended-v6-night-flowers', 'recommended-constel-cinema', 'recommended-milky-way-fireflies', 'recommended-southern-clouds', 'stars'];
// 推荐风景明确携带封面使用的夜空风格，避免继承本机偏好后与封面不一致。
export const GALLERY_SCENES = Object.freeze(order.map(id => ({ nightSkyStyle: 'default', ...scenes.find(item => item.id === id) })));
