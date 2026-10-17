import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWallpaperMode } from '../src/platform/environment.js';
import { createHostPropertySnapshot } from '../src/platform/host-properties.js';
import { connectWallpaperHost, HOST_PROPERTIES_KEY, wallpaperSettings } from '../src/platform/wallpaper.js';

const storageFixture = () => {
  const values = new Map();
  return { values, getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
};

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

test('重载不重放旧宿主默认值，真正改变的原生设置仍生效', () => {
  const storage = storageFixture(), calls = [], host = { properties: { city: { value: 'Tokyo' }, renderscale: { value: .75 } }, general: {}, paused: false };
  const world = { hasRestoredSettings: false, save() { calls.push('save'); }, resize() { calls.push('resize'); }, setCity(name) { calls.push(name); } };
  wallpaperSettings.renderScale = 1;
  connectWallpaperHost(world, {}, { host, document: {}, storage });
  assert.ok(calls.includes('Tokyo'));
  assert.ok(storage.values.has(HOST_PROPERTIES_KEY));
  calls.length = 0; wallpaperSettings.renderScale = 1; world.hasRestoredSettings = true;
  connectWallpaperHost(world, {}, { host, document: {}, storage });
  assert.deepEqual(calls, ['resize', 'save']);
  assert.equal(wallpaperSettings.renderScale, .75);
  host.properties.city = { value: 'Shanghai' };
  host.listener.properties({ city: host.properties.city });
  assert.deepEqual(calls.slice(-2), ['Shanghai', 'save']);
  wallpaperSettings.renderScale = 1;
});

test('世界设置未恢复时，即使存在宿主快照也完整初始化', () => {
  const storage = storageFixture(), calls = [];
  createHostPropertySnapshot(storage, HOST_PROPERTIES_KEY).remember({ city: { value: 'Tokyo' } });
  connectWallpaperHost({ hasRestoredSettings: false, save() {}, setCity: name => calls.push(name) }, {}, {
    host: { properties: { city: { value: 'Tokyo' } }, general: {}, paused: false }, document: {}, storage,
  });
  assert.deepEqual(calls, ['Tokyo']);
});

test('首次升级已有世界却无宿主快照时保留本地，只恢复运行参数，之后实际修改可应用', () => {
  const storage = storageFixture(), calls = [];
  const host = { properties: { city: { value: 'Tokyo' }, quality: { value: 'high' }, realtime: { value: true }, renderscale: { value: .8 } }, general: {}, paused: false };
  wallpaperSettings.renderScale = 1;
  connectWallpaperHost({ hasRestoredSettings: true, save() { calls.push('save'); }, resize() { calls.push('resize'); }, setCity: name => calls.push(name) }, {}, { host, document: {}, storage });
  assert.deepEqual(calls, ['resize', 'save']);
  assert.equal(wallpaperSettings.renderScale, .8);
  assert.equal(JSON.parse(storage.getItem(HOST_PROPERTIES_KEY)).values.city, 'Tokyo');
  host.listener.properties(host.properties);
  assert.deepEqual(calls, ['resize', 'save', 'save']);
  host.properties.city = { value: 'Shanghai' };
  host.listener.properties({ city: host.properties.city });
  assert.deepEqual(calls.slice(-2), ['Shanghai', 'save']);
  wallpaperSettings.renderScale = 1;
});

test('空宿主不消耗首次初始化，延迟到达的属性仍可完整应用', () => {
  const calls = [], host = { properties: {}, general: {}, paused: false };
  connectWallpaperHost({ save() {}, setCity: name => calls.push(name) }, {}, { host, document: {}, storage: undefined });
  assert.deepEqual(calls, []);
  host.properties.city = { value: 'Tokyo' }; host.listener.properties(host.properties);
  assert.deepEqual(calls, ['Tokyo']);
});

test('预览期间实际宿主更改先退出临时场景再应用，重发旧属性不关闭画廊', () => {
  const storage = storageFixture(), calls = [];
  createHostPropertySnapshot(storage, HOST_PROPERTIES_KEY).remember({ city: { value: 'Tokyo' } });
  let previewing = true;
  const host = { properties: { city: { value: 'Tokyo' } }, general: {}, paused: false };
  const world = {
    hasRestoredSettings: true, isPreviewing: () => previewing,
    cancelPreview() { calls.push('cancel'); previewing = false; },
    setCity(name) { assert.equal(previewing, false); calls.push(name); },
    save() { calls.push('save'); },
  };
  const document = { dispatchEvent(event) { calls.push(`close:${event.detail.panel}`); } };
  connectWallpaperHost(world, {}, { host, document, storage });
  assert.deepEqual(calls, ['save']);
  host.properties.city = { value: 'Shanghai' };
  host.listener.properties({ city: host.properties.city });
  assert.deepEqual(calls.slice(-4), ['close:host', 'cancel', 'Shanghai', 'save']);
  assert.equal(JSON.parse(storage.getItem(HOST_PROPERTIES_KEY)).values.city, 'Shanghai');
});

test('新增原生暗角属性升级只建立基线，保留本机关闭；后续真实修改与重载按快照处理', () => {
  const storage = storageFixture(), changes = [];
  createHostPropertySnapshot(storage, HOST_PROPERTIES_KEY).remember({ quality: { value: 'high' } });
  const toggle = { type: 'checkbox', checked: false, dispatchEvent: () => changes.push(toggle.checked) };
  const document = { getElementById: id => id === 'vignette' ? toggle : null };
  const world = { hasRestoredSettings: true, save() {} };
  const host = { properties: { vignette: { value: true } }, general: {}, paused: false };
  connectWallpaperHost(world, {}, { host, document, storage });
  assert.equal(toggle.checked, false);
  assert.deepEqual(changes, []);
  assert.equal(JSON.parse(storage.getItem(HOST_PROPERTIES_KEY)).values.vignette, true);
  host.listener.properties(host.properties);
  assert.equal(toggle.checked, false);
  host.properties.vignette = { value: false }; host.listener.properties(host.properties);
  host.properties.vignette = { value: true }; host.listener.properties(host.properties);
  assert.deepEqual(changes, [false, true]);
  toggle.checked = false;
  connectWallpaperHost(world, {}, { host, document, storage });
  assert.equal(toggle.checked, false);
  assert.deepEqual(changes, [false, true]);
});

test('首次安装的原生暗角选择正常应用，不被升级保护跳过', () => {
  const storage = storageFixture();
  const toggle = { type: 'checkbox', checked: true, dispatchEvent() {} };
  connectWallpaperHost({ hasRestoredSettings: false, save() {} }, {}, {
    host: { properties: { vignette: { value: false } }, general: {}, paused: false },
    document: { getElementById: () => toggle }, storage,
  });
  assert.equal(toggle.checked, false);
});

test('升级时新增暗角属性延迟到达，也先建立基线而不覆盖本机偏好', () => {
  const storage = storageFixture(), changes = [];
  createHostPropertySnapshot(storage, HOST_PROPERTIES_KEY).remember({ city: { value: 'Tokyo' } });
  const toggle = { type: 'checkbox', checked: false, dispatchEvent: () => changes.push(toggle.checked) };
  const host = { properties: { city: { value: 'Tokyo' } }, general: {}, paused: false };
  connectWallpaperHost({ hasRestoredSettings: true, save() {} }, {}, { host, document: { getElementById: () => toggle }, storage });
  host.properties.vignette = { value: true }; host.listener.properties({ vignette: host.properties.vignette });
  assert.equal(toggle.checked, false); assert.deepEqual(changes, []);
  host.properties.vignette = { value: false }; host.listener.properties({ vignette: host.properties.vignette });
  assert.deepEqual(changes, [false]);
});
