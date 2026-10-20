import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWallpaperMode } from '../src/platform/environment.js';
import { createHostPropertySnapshot } from '../src/platform/host-properties.js';
import { connectWallpaperHost, HOST_PROPERTIES_KEY, wallpaperSettings } from '../src/platform/wallpaper.js';

const storageFixture = () => {
  const values = new Map();
  return { values, getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
};
const props = values => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }]));
function fixture(values = {}, storage = storageFixture()) {
  const calls = [], controls = {};
  for (const id of ['dof', 'vignette', 'rememberPosition', 'time', 'auto']) controls[id] = {
    type: id === 'dof' || id === 'time' ? 'range' : 'checkbox', value: '', checked: false,
    dispatchEvent() { calls.push([id, this.type === 'checkbox' ? this.checked : this.value]); },
  };
  controls.syncNow = { click() { calls.push('sync'); } };
  const radios = {};
  for (const [name, values] of Object.entries({ wxMode: ['manual', 'follow', 'dynamic', 'off'], q: ['high', 'low'], temperatureUnit: ['celsius', 'fahrenheit'] })) {
    radios[name] = values.map(value => ({ value, checked: false, dispatchEvent() { calls.push([name, value]); } }));
  }
  let previewing = false;
  const document = new EventTarget();
  Object.assign(document, {
    getElementById: id => controls[id],
    querySelectorAll: selector => radios[selector.match(/name="(.*?)"/)?.[1]] || [],
    querySelector: selector => ({ click() { calls.push(['preset', selector]); } }),
  });
  document.addEventListener('worldpanelopen', () => calls.push('close'));
  document.addEventListener('wallpaperscenelink', event => calls.push(['link', event.detail.link]));
  const host = { properties: props(values), general: {}, paused: false };
  const world = {
    hasRestoredSettings: true, save() { calls.push('save'); }, resize() { calls.push('resize'); },
    setCity: value => calls.push(['city', value]), setPaused: value => calls.push(['pause', value]),
    setPreviewFreeze: value => calls.push(['unlock', value]),
    applyStartupPositionPreference: value => calls.push(['startupPosition', value]),
    isPreviewing: () => previewing, cancelPreview() { previewing = false; calls.push('cancel'); },
  };
  const shell = { components: { set: (key, value) => calls.push(['component', key, value]) } };
  const connect = () => connectWallpaperHost(world, shell, { host, document, storage, onNativeProperties: value => calls.push(['mode', value]) });
  return { calls, controls, host, world, storage, connect, preview: () => { previewing = true; } };
}

test('壁纸构建、公开参数与 Plash 进入同一模式，普通链接不误触发', () => {
  assert.equal(isWallpaperMode({ mode: 'wallpaper' }), true);
  assert.equal(isWallpaperMode({ search: '?lang=zh&wallpaper=1' }), true);
  assert.equal(isWallpaperMode({ plash: true }), true);
  for (const search of ['', '?wallpaper=0', '?wallpaper=false', '?notwallpaper=1']) assert.equal(isWallpaperMode({ search }), false);
});

test('宿主快照识别损坏、不可用及非标量数据', () => {
  for (const raw of ['bad', '{"version":2,"values":{}}', '{"version":1,"values":[]}', '{"version":1,"values":{"q":{}}}']) {
    assert.equal(createHostPropertySnapshot({ getItem: () => raw }, 'host').restored, false);
  }
  const blocked = createHostPropertySnapshot({ getItem() { throw new Error(); }, setItem() { throw new Error(); } }, 'host');
  blocked.remember({ q: { value: 'high' } });
  assert.deepEqual(blocked.changed({ q: { value: 'high' } }), {});
});

test('新增模式缺失或明确勾选时忽略所有原生设置，不重放旧渲染比例', () => {
  for (const mode of [undefined, true]) for (const restored of [false, true]) {
    wallpaperSettings.renderScale = 1;
    const values = { dof: .6, city: 'Tokyo', vignette: true, rememberposition: true, renderscale: .5, language: 'en', settingspanel: true };
    if (mode !== undefined) values.useworldsettings = mode;
    const f = fixture(values); f.world.hasRestoredSettings = restored;
    createHostPropertySnapshot(f.storage, HOST_PROPERTIES_KEY).remember(props({ renderscale: .5 }));
    f.connect();
    assert.deepEqual(f.calls, [['mode', true]]);
    assert.equal(wallpaperSettings.renderScale, 1);
  }
});

test('空 bootstrap 不标记真实 WE，模式延迟到达前保护已有世界', () => {
  const f = fixture(); f.connect(); assert.deepEqual(f.calls, []);
  f.host.listener.properties(props({ dof: .2, city: 'Tokyo' }));
  assert.deepEqual(f.calls, [['mode', true]]);
  f.calls.length = 0;
  f.host.listener.properties(props({ useworldsettings: false }));
  assert.ok(f.calls.some(value => Array.isArray(value) && value[0] === 'city' && value[1] === 'Tokyo'));
  assert.equal(f.controls.dof.value, '0.2');
});

test('WE 模式每次启动完整覆盖，同值快照与升级保护均不拦截', () => {
  for (const cached of [false, true]) {
    const f = fixture({ useworldsettings: false, dof: .6, city: 'Tokyo', vignette: true, rememberposition: true });
    if (cached) createHostPropertySnapshot(f.storage, HOST_PROPERTIES_KEY).remember(f.host.properties);
    f.connect(); assert.equal(f.controls.dof.value, '0.6'); assert.equal(f.controls.vignette.checked, true);
    f.controls.dof.value = '0'; f.controls.vignette.checked = false; f.calls.length = 0;
    f.connect(); assert.equal(f.controls.dof.value, '0.6'); assert.equal(f.controls.vignette.checked, true);
    assert.ok(f.calls.some(value => Array.isArray(value) && value[0] === 'startupPosition' && value[1] === true));
  }
});

test('取消勾选立即应用缓存完整配置，先还原预览再修改世界', () => {
  const f = fixture({ useworldsettings: true, dof: .6, city: 'Tokyo', weathermode: 'manual', weatherpreset: 'rain' });
  f.connect(); f.preview(); f.calls.length = 0;
  f.host.listener.properties(props({ useworldsettings: false }));
  assert.deepEqual(f.calls.slice(0, 3), [['mode', false], 'close', 'cancel']);
  assert.equal(f.controls.dof.value, '0.6');
  assert.ok(f.calls.some(value => Array.isArray(value) && value[0] === 'preset'));
  assert.ok(!f.calls.some(value => Array.isArray(value) && value[0] === 'startupPosition'));
});

test('重新勾选保留当前世界和临时预览，同批隐藏属性与后续属性均不生效', () => {
  const f = fixture({ useworldsettings: false, dof: .6, renderscale: .5 });
  f.connect(); f.preview(); f.controls.dof.value = '0.3'; f.calls.length = 0;
  f.host.listener.properties(props({ dof: .8, useworldsettings: true, renderscale: .75 }));
  assert.equal(f.controls.dof.value, '0.3'); assert.equal(wallpaperSettings.renderScale, 1);
  assert.deepEqual(f.calls, [['mode', true], 'resize']);
  f.calls.length = 0; f.host.listener.properties(props({ dof: .9 }));
  assert.deepEqual(f.calls, [['mode', true]]);
});

test('WE 模式运行中只应用变化项，重发旧属性不覆盖桌面或关闭画廊', () => {
  const f = fixture({ useworldsettings: false, dof: .6, city: 'Tokyo' });
  f.connect(); f.controls.dof.value = '0.2'; f.preview(); f.calls.length = 0;
  f.host.listener.properties(props({ dof: .6 }));
  assert.deepEqual(f.calls, [['mode', false]]); assert.equal(f.controls.dof.value, '0.2');
  f.calls.length = 0; f.host.listener.properties(props({ dof: .4 }));
  assert.deepEqual(f.calls.slice(0, 3), [['mode', false], 'close', 'cancel']);
  assert.equal(f.controls.dof.value, '0.4');
});

test('WE 初始属性分批到达仍应用，延迟位置记忆只校正启动相机一次', () => {
  const f = fixture({ useworldsettings: false }); f.connect(); f.calls.length = 0;
  f.host.listener.properties(props({ dof: .5, rememberposition: false }));
  assert.equal(f.controls.dof.value, '0.5');
  assert.ok(f.calls.some(value => Array.isArray(value) && value[0] === 'startupPosition' && value[1] === false));
  f.calls.length = 0; f.host.listener.properties(props({ rememberposition: true }));
  assert.equal(f.controls.rememberPosition.checked, true);
  assert.ok(!f.calls.some(value => Array.isArray(value) && value[0] === 'startupPosition'));
});

test('分批首发的每个原生键都必须应用，即使旧快照与本次值相同', () => {
  const f = fixture({ useworldsettings: false, dof: .6 });
  createHostPropertySnapshot(f.storage, HOST_PROPERTIES_KEY).remember(props({ quality: 'high', rememberposition: true }));
  f.connect(); f.calls.length = 0;
  f.host.listener.properties(props({ quality: 'high', rememberposition: true }));
  assert.equal(f.controls.rememberPosition.checked, true);
  assert.ok(f.calls.some(value => Array.isArray(value) && value[0] === 'q' && value[1] === 'high'));
});

test('旧快照与无序首发仍先应用城市，再按新城市解释模拟当地时刻', () => {
  const f = fixture({ useworldsettings: false, realtime: false, timeofday: 9, city: 'Tokyo' });
  createHostPropertySnapshot(f.storage, HOST_PROPERTIES_KEY).remember(props({ city: 'Tokyo', realtime: true, timeofday: 12 }));
  f.connect();
  const cityIndex = f.calls.findIndex(value => Array.isArray(value) && value[0] === 'city');
  const timeIndex = f.calls.findIndex(value => Array.isArray(value) && value[0] === 'time');
  assert.ok(cityIndex >= 0 && timeIndex > cityIndex);
  assert.equal(f.controls.time.value, '9');
});

test('启动位置属性未到达就切换模式，之后不再执行启动相机校正', () => {
  const f = fixture({ useworldsettings: false }); f.connect();
  f.host.listener.properties(props({ useworldsettings: true })); f.calls.length = 0;
  f.host.listener.properties(props({ useworldsettings: false, rememberposition: true }));
  assert.equal(f.controls.rememberPosition.checked, true);
  assert.ok(!f.calls.some(value => Array.isArray(value) && value[0] === 'startupPosition'));
});

test('原生明确调整时间天气只解除对应场景锁，景深调整不解锁', () => {
  const f = fixture({ useworldsettings: false, realtime: true, weathermode: 'follow', weatherpreset: 'clear', dof: .6 });
  f.connect(); f.calls.length = 0;
  f.host.listener.properties(props({ dof: .4 }));
  assert.ok(!f.calls.some(value => Array.isArray(value) && value[0] === 'unlock'));
  f.calls.length = 0; f.host.listener.properties(props({ realtime: false, timeofday: 9 }));
  assert.deepEqual(f.calls.find(value => Array.isArray(value) && value[0] === 'unlock'), ['unlock', { freezeTime: false }]);
  assert.equal(f.controls.time.value, '9');
  f.calls.length = 0; f.host.listener.properties(props({ weathermode: 'manual', weatherpreset: 'rain' }));
  assert.deepEqual(f.calls.find(value => Array.isArray(value) && value[0] === 'unlock'), ['unlock', { freezeWeather: false }]);
});

test('桌面改为其他天气模式后，原生仅改预设也先恢复手动模式', () => {
  const f = fixture({ useworldsettings: false, weathermode: 'manual', weatherpreset: 'clear' }); f.connect(); f.calls.length = 0;
  f.host.listener.properties(props({ weatherpreset: 'rain' }));
  const manualIndex = f.calls.findIndex(value => Array.isArray(value) && value[0] === 'wxMode' && value[1] === 'manual');
  const presetIndex = f.calls.findIndex(value => Array.isArray(value) && value[0] === 'preset');
  assert.ok(manualIndex >= 0 && presetIndex > manualIndex);
});

test('已撤下的打开面板属性不再消费，新温度单位可以正常应用', () => {
  const f = fixture({ useworldsettings: false, settingspanel: true }); f.connect();
  assert.deepEqual(f.calls, [['mode', false]]);
  f.host.listener.properties(props({ temperatureunit: 'fahrenheit' }));
  assert.ok(f.calls.some(value => Array.isArray(value) && value[0] === 'temperatureUnit' && value[1] === 'fahrenheit'));
});

test('两种模式均遵循 WE 帧率与暂停，世界模式不消费自定义参数', () => {
  for (const mode of [false, true]) {
    const f = fixture({ useworldsettings: mode }); f.host.general = { fps: 45 }; f.connect();
    assert.equal(wallpaperSettings.fps, 45);
    f.host.listener.pause(true); f.host.listener.pause(false);
    assert.deepEqual(f.calls.slice(-2), [['pause', true], ['pause', false]]);
    f.host.listener.general({ fps: 60 }); assert.equal(wallpaperSettings.fps, 60);
  }
  wallpaperSettings.fps = 30;
});

test('两种模式的分享链接只通知待导入，不应用场景、不保存、不取消预览', async () => {
  for (const mode of [false, true]) {
    const f = fixture({ useworldsettings: mode }); f.connect(); f.preview(); f.calls.length = 0;
    for (const value of ['h', 'ht', '无效链接', '无效链接', '', '无效链接']) f.host.listener.properties(props({ sceneimportlink: value }));
    assert.ok(!f.calls.includes('save')); assert.ok(!f.calls.includes('cancel'));
    await Promise.resolve();
    assert.deepEqual(f.calls.filter(value => Array.isArray(value) && value[0] === 'link'), ['h', 'ht', '无效链接', '', '无效链接'].map(value => ['link', value]));
    assert.ok(!f.storage.values.has(HOST_PROPERTIES_KEY));
  }
});
