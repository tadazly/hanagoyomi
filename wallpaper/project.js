import { CITIES } from '../src/data/cities.js';
import { WX_TYPES } from '../src/world/weather-presets.js';
import { MESSAGES } from '../src/i18n/messages.js';
import { workshopLocalizations } from './workshop-copy.js';

export const workshopTitle = workshopLocalizations.english.title;
export const workshopDescription = workshopLocalizations.english.description;

const localization = { 'en-us': {}, 'zh-chs': {} };
const label = (key, zh, en) => {
  const token = `ui_hanagoyomi_${key}`;
  localization['en-us'][token] = en; localization['zh-chs'][token] = zh;
  return token;
};
let order = 100;
const properties = {};
const add = (key, type, value, zh, en, extra = {}) => {
  properties[key] = { type, value, text: label(key, zh, en), order: order++, ...extra };
};
const option = (value, zh, en = zh) => ({ value, label: label(`option_${String(value).replace(/\W/g, '')}`, zh, en) });
add('about', 'text', '', '常用选项在这里；完整设置请将鼠标移到桌面右下角。<br>位置影响时间与天气，草原是想象风景。', 'Common options are here. Hover at the bottom right of your desktop for full settings.<br>The location controls time and weather; the meadow is imaginary.');
add('quality', 'combo', 'high', '画质', 'Quality', { options: [option('low','低','Low'),option('med','中','Medium'),option('high','高（默认）','High (default)'),option('ultra','极高','Ultra')] });
add('renderscale', 'slider', 1, '渲染比例', 'Render scale', { min: .5, max: 1, step: .05, precision: 2, fraction: true });
add('interaction', 'bool', false, '场景交互', 'Manual scene interaction');
add('autoflight', 'bool', true, '自动飞行', 'Automatic flight');
add('city', 'combo', 'system', '观测地点', 'Observation city', { options: [option('system','跟随系统时区','Match system time zone'), ...CITIES.map(c => option(c[1], c[0], c[1]))] });
add('weathermode', 'combo', 'follow', '天气模式', 'Weather mode', { options: [option('follow','跟随当地天气','Follow local weather'),option('dynamic','动态天气（离线可用）','Dynamic weather (offline)'),option('manual','手动天气','Manual weather'),option('off','关闭天气效果','Weather effects off')] });
add('weatherpreset', 'combo', 'cloudy', '手动天气', 'Manual weather preset', { condition: 'weathermode.value == "manual"', options: Object.keys(WX_TYPES).map(key => option(key, MESSAGES.zh[`weather.${key}`], MESSAGES.en[`weather.${key}`])) });
add('realtime', 'bool', true, '跟随真实当地时间', 'Follow real local time');
add('timeofday', 'slider', 12, '模拟当地时刻', 'Simulated local hour', { min: 0, max: 23.99, precision: 2, step: .01, fraction: true, condition: 'realtime.value == false' });
add('showlogo', 'bool', true, '显示 LOGO', 'Show logo');
add('logoposition', 'combo', 'top-right', 'LOGO 位置', 'Logo position', { condition: 'showlogo.value == true', options: positions() });
add('showclock', 'bool', true, '显示时间与天气', 'Show clock and weather');
add('clockposition', 'combo', 'bottom-center', '时间天气位置', 'Clock and weather position', { condition: 'showclock.value == true', options: positions() });
add('petals', 'bool', true, '花瓣', 'Petals');
add('constellations', 'bool', false, '星座连线', 'Constellation lines');
add('lensdrops', 'bool', true, '镜头雨滴', 'Lens rain drops');
add('dof', 'slider', .6, '景深', 'Depth of field', { min: 0, max: 1, precision: 2, step: .05, fraction: true });
add('language', 'combo', 'auto', '界面语言', 'Interface language', { options: [option('auto','自动','Automatic'),option('zh','简体中文','简体中文'),option('en','English','English'),option('ja','日本語','日本語')] });
add('settingspanel', 'bool', false, '打开完整世界设置', 'Open full world settings');

function positions() {
  return ['top-left','top-center','top-right','middle-left','middle-center','middle-right','bottom-left','bottom-center','bottom-right'].map(key => option(key, MESSAGES.zh[`components.position.${key}`], MESSAGES.en[`components.position.${key}`]));
}

export const project = {
  title: workshopTitle, description: workshopDescription, type: 'web', file: 'index.html', preview: 'preview.gif',
  contentrating: 'Everyone', ratingsex: 'none', ratingviolence: 'none', tags: ['Nature'],
  general: { properties, localization }, version: 1, visibility: 'public',
};
