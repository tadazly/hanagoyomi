import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateScene, resolveSceneTime, sceneFrameTiming, renderSize } from '../src/world/scene-state.js';
import { GALLERY_SCENES } from '../src/data/gallery-scenes.js';
import { zonedHours } from '../src/world/clock.js';

test('场景导入使用白名单，不携带设备画质、城市、组件或语言偏好', () => {
  const scene = validateScene({ version: 1, settings: { quality: 'ultra', language: 'ja', showWeather: false, interactionEnabled: true, vignette: false },
    location: { name: 'Paris' }, camera: { x: 123, z: -456 } });
  assert.ok(scene);
  for (const key of ['quality', 'language', 'showWeather', 'interactionEnabled', 'vignette']) assert.equal(key in scene.settings, false);
  assert.equal('location' in scene, false);
  assert.deepEqual({ x: scene.camera.x, z: scene.camera.z }, { x: 123, z: -456 });
});

test('旧收藏和携带暗角字段的作品均不能覆盖本机显示偏好', () => {
  const oldFavorite = validateScene({ version: 1, settings: { lowSaturation: true } });
  assert.equal('vignette' in oldFavorite.settings, false);
  for (const vignette of [true, false]) {
    const imported = validateScene({ version: 1, settings: { vignette } });
    assert.equal('vignette' in imported.settings, false);
    const localSettings = { vignette: !vignette };
    Object.assign(localSettings, imported.settings);
    assert.equal(localSettings.vignette, !vignette);
  }
});

test('稀疏场景得到稳定、可往返序列化的默认值', () => {
  const scene = validateScene({ version: 1 });
  assert.deepEqual(validateScene(JSON.parse(JSON.stringify(scene))), scene);
  assert.deepEqual(scene.freeze, { time: true, weather: true });
  assert.equal(scene.environment.time.followNow, false);
  assert.equal(scene.environment.time.speedIndex, 0);
});

test('场景拒绝未知版本、数组容器、非有限数值和越界相机', () => {
  for (const input of [null, [], { version: 2 }, { version: 1, settings: [] }, { version: 1, camera: { x: NaN } },
    { version: 1, camera: { agl: 0 } }, { version: 1, camera: { fov: 180 } }, { version: 1, camera: { pitch: 5 } }]) assert.equal(validateScene(input), null);
});

test('不把损坏的天气、时间或定格开关静默变成有效作品', () => {
  for (const input of [{ settings: { wxType: 'unknown' } }, { settings: { density: -1 } },
    { environment: { weather: { current: { vis: 0 } } } }, { environment: { weather: { current: { rain: 4 } } } },
    { environment: { time: { speedIndex: 1.5 } } }, { environment: { time: { ms: Infinity } } }, { freeze: { time: 'true' } }]) assert.equal(validateScene({ version: 1, ...input }), null);
});

test('实际天气插值的浮点边界可捕获，并只校正1e-9相对误差', () => {
  const visibility = Math.exp(Math.log(30000));
  assert.ok(visibility > 30000);
  const scene = validateScene({ version: 1, environment: { weather: { current: { vis: visibility, cov: 1 + 1e-10, rain: -1e-10 } } } });
  assert.ok(scene);
  assert.equal(scene.environment.weather.current.vis, 30000);
  assert.equal(scene.environment.weather.current.cov, 1);
  assert.equal(scene.environment.weather.current.rain, 0);
  assert.equal(validateScene({ version: 1, environment: { weather: { current: { vis: 30000.001 } } } }), null);
  assert.equal(validateScene({ version: 1, environment: { weather: { current: { rain: -.000001 } } } }), null);
});

test('相机高度与天气积雪、湿地及两个定格开关可完整保存', () => {
  const scene = validateScene({ version: 1, camera: { x: 45, z: 80, y: 250, agl: 12, yaw: -4, pitch: -.2, roll: .1, fov: 76 },
    environment: { time: { ms: 1792303200000, speedIndex: 3, followNow: false }, weather: { type: 'snow', wet: .4, snowCover: .8 } },
    freeze: { time: false, weather: true } });
  assert.equal(scene.camera.y, 250);
  assert.equal(scene.environment.weather.snowCover, .8);
  assert.equal(scene.environment.weather.wet, .4);
  assert.deepEqual(scene.freeze, { time: false, weather: true });
});

test('定格时间和天气分别停止环境时钟，同时保留自然视觉运动', () => {
  assert.deepEqual(sceneFrameTiming(20, { time: true, weather: true }), { clockElapsed: 0, visualDt: .02, weatherDt: 0 });
  assert.deepEqual(sceneFrameTiming(20, { time: true, weather: false }), { clockElapsed: 0, visualDt: .02, weatherDt: .02 });
  assert.deepEqual(sceneFrameTiming(20, { time: false, weather: true }), { clockElapsed: 20, visualDt: .02, weatherDt: 0 });
  assert.equal(sceneFrameTiming(90000).visualDt, .1);
  assert.equal(sceneFrameTiming(-100).clockElapsed, 0);
});

test('超宽壁纸同时受单边GPU能力和总像素限制', () => {
  const ultrawide = renderSize(15000, 1000, { dpr: 2, maxWidth: 8192, maxHeight: 8192, maxPixels: 3840 * 2160 });
  assert.ok(ultrawide.width <= 8192);
  assert.ok(ultrawide.height <= 8192);
  assert.ok(ultrawide.width * ultrawide.height <= 3840 * 2160);
  assert.ok(Math.abs(ultrawide.width / ultrawide.height - 15) < .1);
});

test('窄而极高画布受独立高度限制，普通画布不额外降采样', () => {
  assert.deepEqual(renderSize(1920, 1080, { dpr: 1 }), { width: 1920, height: 1080 });
  const tall = renderSize(1, 20000, { maxWidth: 4096, maxHeight: 2048 });
  assert.deepEqual(tall, { width: 1, height: 2048 });
});

test('八个推荐风景都是可导入的实际世界参数，前三语目录完整', () => {
  assert.deepEqual(GALLERY_SCENES.slice(0, 4).map(item => item.id), ['meadow', 'mist', 'sunset', 'stars']);
  assert.equal(GALLERY_SCENES.length, 8);
  assert.equal(new Set(GALLERY_SCENES.map(item => item.id)).size, 8);
  for (const item of GALLERY_SCENES) {
    assert.ok(item.scene, item.id);
    assert.deepEqual(validateScene(item.scene), item.scene);
    for (const language of ['zh', 'en', 'ja']) assert.ok(item.title[language] && item.description[language]);
    assert.equal(item.thumbnail, `gallery/${item.id}.jpg`);
  }
});

test('精选午后与黄昏使用当前城市当地时刻，捕获收藏不重新解释绝对时间', () => {
  const now = Date.parse('2026-10-18T12:00:00Z');
  for (const timezone of ['America/New_York', 'Asia/Shanghai']) {
    const meadow = resolveSceneTime(GALLERY_SCENES[0].scene, timezone, now);
    const sunset = resolveSceneTime(GALLERY_SCENES[2].scene, timezone, now);
    assert.equal(zonedHours(timezone, meadow.environment.time.ms), 15);
    assert.equal(zonedHours(timezone, sunset.environment.time.ms), 17);
    assert.equal('localHour' in meadow.environment.time, false);
    assert.equal('localHour' in sunset.environment.time, false);
    const saved = resolveSceneTime(meadow, 'Asia/Tokyo', now + 86400000);
    assert.equal(saved.environment.time.ms, meadow.environment.time.ms);
  }
});
