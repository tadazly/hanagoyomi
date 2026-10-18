import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_VIEW, HEIGHT_PRESETS, VIEW_HEIGHT_MIN, VIEW_HEIGHT_MAX, startupPreferences, sceneForStartup, aglFromSlider, sliderFromAgl } from '../src/world/view-preferences.js';
import { validateScene } from '../src/world/scene-state.js';

test('位置记忆默认开启，旧记录和损坏值不误关，显式关闭经存储往返保留', () => {
  for (const saved of [undefined, null, {}, { rememberPosition: 'false' }, { rememberPosition: 0 }]) {
    assert.equal(startupPreferences(saved).rememberPosition, true);
  }
  assert.equal(startupPreferences(JSON.parse(JSON.stringify({ rememberPosition: false }))).rememberPosition, false);
});

test('关闭启动位置记忆只替换相机，保留环境和世界设置且不污染作品', () => {
  const scene = validateScene({ version: 1, settings: { auto: false, dof: .4, wxMode: 'manual', wxType: 'rain', rememberPosition: false },
    camera: { x: 1000, z: -2000, agl: 4500, y: 4510, yaw: 1, pitch: -.2, roll: .1, fov: 80, focus: 150 },
    environment: { time: { ms: 1792250000000, followNow: false, speedIndex: 0 }, weather: { type: 'rain' } }, freeze: { time: true, weather: true } });
  const before = structuredClone(scene), camera = { ...DEFAULT_VIEW, x: -30, z: 40, y: 12, yaw: 2 };
  const restored = sceneForStartup(scene, camera, false);
  assert.deepEqual(restored.camera, camera);
  for (const key of ['settings', 'environment', 'freeze']) assert.deepEqual(restored[key], scene[key]);
  assert.deepEqual(scene, before);
  assert.deepEqual(sceneForStartup(scene, camera, true), before);
  assert.equal('rememberPosition' in restored.settings, false);
  assert.equal(sceneForStartup(null, camera, false), null);
});

test('云上预设以米为单位精确设为4500，旧的低空预设高度不变', () => {
  assert.equal(HEIGHT_PRESETS.clouds, 4500);
  assert.equal(HEIGHT_PRESETS.meadow, aglFromSlider(0));
  assert.equal(HEIGHT_PRESETS.hills, aglFromSlider(100));
  for (const height of [1.2, 2.2, HEIGHT_PRESETS.hills, 4500, 6501.2]) assert.ok(Math.abs(aglFromSlider(sliderFromAgl(height)) - height) < 1e-9);
});

test('高度设置边界与作品校验一致，合法最高位置可保存分享', () => {
  assert.equal(aglFromSlider(0), VIEW_HEIGHT_MIN);
  assert.equal(aglFromSlider(1000), VIEW_HEIGHT_MAX);
  for (const height of [VIEW_HEIGHT_MIN, VIEW_HEIGHT_MAX]) {
    assert.equal(validateScene({ version: 1, camera: { agl: height } }).camera.agl, height);
  }
  for (const height of [VIEW_HEIGHT_MIN - .01, VIEW_HEIGHT_MAX + .01]) {
    assert.equal(validateScene({ version: 1, camera: { agl: height } }), null);
  }
});
