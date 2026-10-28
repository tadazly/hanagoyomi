import { getLanguage, t } from '../i18n/index.js';
import CITIES from './city-presets.json' with { type: 'json' };

const COMMON_CITIES = ['东京', '上海', '北京', '伦敦', '巴黎', '纽约'];

// [0] 是稳定的地点标识；保存的旧地点不随界面语言变化。
export function cityName(city, language = getLanguage()) {
  return city[language === 'zh' ? 0 : language === 'ja' ? 5 : 1] || city[1];
}

export function locationName(loc, language = getLanguage()) {
  if (Array.isArray(loc.names)) return loc.names[language === 'zh' ? 1 : language === 'ja' ? 2 : 0] || loc.names[0] || loc.name;
  if (loc.name === '我的位置') return t('location.mine', {}, language);
  const nearby = loc.name.endsWith('附近');
  const name = nearby ? loc.name.slice(0, -2) : loc.name;
  const city = CITIES.find(c => c[0] === name);
  if (!city) return loc.name;
  const label = cityName(city, language);
  return nearby ? t('location.near', { city: label }, language) : label;
}

export function searchCities(query) {
  const value = query.trim().normalize('NFKC').toLowerCase();
  if (!value) return [];
  return CITIES.filter(city => [city[0], city[1], city[5]].some(name => name.normalize('NFKC').toLowerCase().includes(value)));
}

export { CITIES, COMMON_CITIES };
