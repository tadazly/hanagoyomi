import { CITIES } from '../src/data/cities.js';
import { WX_TYPES } from '../src/world/weather-presets.js';
import { MESSAGES } from '../src/i18n/messages.js';
import { workshopLocalizations } from './workshop-copy.js';

export const workshopTitle = workshopLocalizations.english.title;
export const workshopDescription = workshopLocalizations.english.description;

const localization = { 'en-us': {}, 'zh-chs': {}, 'ja-jp': {} };
const label = (key, zh, en, ja = en) => {
  const token = `ui_hanagoyomi_${key}`;
  localization['en-us'][token] = en; localization['zh-chs'][token] = zh;
  localization['ja-jp'][token] = ja;
  return token;
};
let order = 100;
const properties = {};
const add = (key, type, value, zh, en, extra = {}) => {
  properties[key] = { type, value, text: label(key, zh, en), order: order++, ...extra };
};
const option = (value, zh, en = zh, ja = en) => ({ value, label: label(`option_${String(value).replace(/\W/g, '')}`, zh, en, ja) });
add('useworldsettings', 'bool', true, '使用世界设置（推荐）', 'Use built-in world settings (recommended)');
add('worldabout', 'text', '', '已勾选：始终使用壁纸自带的世界设置，WE 中对应的场景设置隐藏且不生效，导入场景链接始终可用。世界设置和画廊应用的风景自动保存在本机，重启后恢复。<br>鼠标移到桌面右下角可打开世界设置与画廊。', 'Enabled: always use the wallpaper’s built-in world settings. Corresponding WE scene settings are hidden and ignored; scene link import remains available. World settings and applied gallery scenes are saved on this device and restored after restart.<br>Move the mouse to the bottom-right corner to open world settings and the gallery.', { condition: 'useworldsettings.value == true' });
add('about', 'text', '', '未勾选：WE 中的选项会立即应用，并在每次启动时覆盖世界设置中的对应项。世界设置仍可编辑，但修改只能单向生效，无法同步回 WE 面板；画廊应用的对应项也会在下次启动被覆盖。<br>如需保留世界设置与画廊效果，请勾选上方选项。', 'Disabled: WE options apply immediately and overwrite their corresponding world settings on every startup. You can still edit world settings, but changes work in one direction and cannot update the WE panel. Corresponding values from applied gallery scenes are also overwritten on the next startup.<br>Enable the option above to retain world settings and gallery results.');
add('sceneimportlink', 'textinput', '', '导入场景链接（粘贴后返回桌面画廊预览）', 'Import scene link (paste, then preview in the desktop gallery)');
localization['ja-jp'][properties.sceneimportlink.text] = 'シーンの共有リンク（貼り付け後、デスクトップのギャラリーでプレビュー）';
add('quality', 'combo', 'high', '画质', 'Quality', { options: [option('low','低','Low','低'),option('med','中','Medium','中'),option('high','高（默认）','High (default)','高（既定）'),option('ultra','极高','Ultra','最高')] });
add('renderscale', 'slider', 1, '渲染比例', 'Render scale', { min: .5, max: 1, step: .05, precision: 2, fraction: true });
add('interaction', 'bool', false, '场景交互', 'Manual scene interaction');
add('autoflight', 'bool', true, '自动飞行', 'Automatic flight');
add('city', 'combo', 'system', '观测地点', 'Observation city', { options: [option('system','跟随系统时区','Match system time zone','システムのタイムゾーンに合わせる'), ...CITIES.map(c => option(c[1], c[0], c[1], c[5]))] });
add('weathermode', 'combo', 'follow', '天气模式', 'Weather mode', { options: [option('follow','跟随当地天气','Follow local weather','現地の天気に連動'),option('dynamic','动态天气（离线可用）','Dynamic weather (offline)','変化する天気（オフライン対応）'),option('manual','手动天气','Manual weather','手動で設定'),option('off','关闭天气效果','Weather effects off','天気の演出をオフ')] });
add('weatherpreset', 'combo', 'cloudy', '手动天气', 'Manual weather preset', { condition: 'weathermode.value == "manual"', options: Object.keys(WX_TYPES).map(key => option(key, MESSAGES.zh[`weather.${key}`], MESSAGES.en[`weather.${key}`], MESSAGES.ja[`weather.${key}`])) });
add('realtime', 'bool', true, '跟随真实当地时间', 'Follow real local time');
add('timeofday', 'slider', 12, '模拟当地时刻', 'Simulated local hour', { min: 0, max: 23.99, precision: 2, step: .01, fraction: true, condition: 'realtime.value == false' });
add('showlogo', 'bool', true, '显示 LOGO', 'Show logo');
add('logoposition', 'combo', 'top-right', 'LOGO 位置', 'Logo position', { condition: 'showlogo.value == true', options: positions() });
add('showclock', 'bool', true, '显示时间与天气', 'Show clock and weather');
add('clockposition', 'combo', 'bottom-center', '时间天气位置', 'Clock and weather position', { condition: 'showclock.value == true', options: positions() });
add('temperatureunit', 'combo', 'celsius', '温度单位', 'Temperature unit', { condition: 'showclock.value == true', options: [option('celsius', '摄氏度（°C）', 'Celsius (°C)', '摂氏（°C）'), option('fahrenheit', '华氏度（°F）', 'Fahrenheit (°F)', '華氏（°F）')] });
add('petals', 'bool', true, '花瓣', 'Petals');
add('lowsaturation', 'bool', false, '低饱和度配色', 'Low-saturation colours');
add('vignette', 'bool', true, '暗角', 'Vignette');
localization['ja-jp'][properties.vignette.text] = '周辺減光';
add('constellations', 'bool', false, '星座连线', 'Constellation lines');
add('lensdrops', 'bool', true, '镜头雨滴', 'Lens rain drops');
add('dof', 'slider', .6, '景深', 'Depth of field', { min: 0, max: 1, precision: 2, step: .05, fraction: true });
add('rememberposition', 'bool', true, '记住上次位置', 'Remember last position');
add('language', 'combo', 'auto', '界面语言', 'Interface language', { options: [option('auto','自动','Automatic','自動'),option('zh','简体中文','简体中文'),option('en','English','English'),option('ja','日本語','日本語')] });

function positions() {
  return ['top-left','top-center','top-right','middle-left','middle-center','middle-right','bottom-left','bottom-center','bottom-right'].map(key => option(key, MESSAGES.zh[`components.position.${key}`], MESSAGES.en[`components.position.${key}`], MESSAGES.ja[`components.position.${key}`]));
}

for (const [key, value] of Object.entries({
  useworldsettings: '内蔵の世界設定を使用（推奨）',
  worldabout: 'オン：壁紙内蔵の世界設定を常に使用します。対応する WE のシーン設定は非表示になり、適用されません。共有リンクの取り込みは常に利用できます。世界設定と適用したギャラリーの風景はこの端末に自動保存され、再起動後も復元されます。<br>右下にマウスを移動すると世界設定とギャラリーを開けます。',
  about: 'オフ：WE の項目はすぐに適用され、起動するたびに対応する世界設定を上書きします。世界設定は引き続き編集できますが、変更は一方向にのみ反映され、WE の表示には同期されません。ギャラリーで適用した対応項目も次回起動時に上書きされます。<br>世界設定やギャラリーの風景を保持するには、上の項目をオンにしてください。',
  quality: '画質', renderscale: '描画解像度の倍率', interaction: '手動のシーン操作', autoflight: '自動飛行',
  city: '観測地点', weathermode: '天気モード', weatherpreset: '手動の天気', realtime: '現地の実時刻に連動',
  timeofday: 'シミュレーションの現地時刻', showlogo: 'ロゴを表示', logoposition: 'ロゴの位置',
  showclock: '時刻と天気を表示', clockposition: '時刻・天気の位置', petals: '花びら', lowsaturation: '低彩度の配色',
  constellations: '星座の線', lensdrops: 'レンズの雨粒', dof: '被写界深度', rememberposition: '前回の位置を記憶',
  language: '表示言語', temperatureunit: '温度の単位',
})) localization['ja-jp'][properties[key].text] = value;

// 导入是独立工具，两种模式均可用；其余覆盖世界偏好的参数才受总开关约束。
// 隐藏不是禁用，适配器还需忽略其回调。
for (const [key, property] of Object.entries(properties)) {
  if (['useworldsettings', 'worldabout', 'sceneimportlink'].includes(key)) continue;
  property.condition = `useworldsettings.value == false${property.condition ? ` && (${property.condition})` : ''}`;
}

export const project = {
  title: workshopTitle, description: workshopDescription, type: 'web', file: 'index.html', preview: 'preview.gif',
  contentrating: 'Everyone', ratingsex: 'none', ratingviolence: 'none', tags: ['Nature'],
  general: { properties, localization }, version: 1, visibility: 'public',
};
