import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, inflateSync } from 'fflate';
import { validateScene, SCENE_APPEARANCE } from '../src/world/scene-state.js';
import { createSceneLink, parseSceneLink, SceneLinkError } from '../src/world/scene-share.js';
import { GALLERY_SCENES } from '../src/data/gallery-scenes.js';
import { decodeSceneV7 } from '../src/world/scene-share-v7.js';
const base = 'https://example.test/';
const snapshot = (appearance = {}) => validateScene({ version: 1, settings: { cloudStyle: 'realistic' }, appearance: { ...SCENE_APPEARANCE, ...appearance },
  camera: { fov: 95, view: { yaw: 1.234, pitch: -.2, position: [123.45, 4321.06, -9876.54], fov: 104 }, tracking: 'Sco' } });
const data = link => {
  const hash = new URL(link).hash, bytes = Buffer.from(hash.slice(10), 'base64url');
  return hash.startsWith('#scene=v7.') ? decodeSceneV7(bytes) : JSON.parse(new TextDecoder().decode(inflateSync(bytes)));
};
const encoded = value => base + '#scene=v6.' + Buffer.from(deflateSync(new TextEncoder().encode(JSON.stringify(value)), { level: 9 })).toString('base64url');

test('完整外观、基础FOV、实际镜头及星座选择通过 v7 无损往返', () => {
  const scene = snapshot({ nightSkyStyle: 'realistic', atmosphere: false, constelStyle: 'always', constelNames: false,
    constelBilingual: true, constelWidth: 1.75, constelClarity: .65, constelFont: 21, vignette: false, stargazing: true, selectedConstellation: 'Sco' });
  assert.ok(scene);const link = createSceneLink(scene, { baseUrl: base, title: '天蝎座' });
  assert.match(new URL(link).hash, /^#scene=v7\./);assert.deepEqual(parseSceneLink(link), { scene, title: '天蝎座' });
  assert.deepEqual(data(link)[11], ['realistic', false, 'always', false, true, 1.75, .65, 21, false, true, 'Sco']);
  assert.equal(scene.camera.fov, 95);assert.equal(scene.camera.view.fov, 104);assert(link.length < 1000);
});

test('全部推荐场景的两种云风格与完整外观可以无损分享', () => {
  for (const entry of GALLERY_SCENES) for (const cloudStyle of ['default', 'realistic']) {
    const scene = validateScene({ ...entry.scene, settings: { ...entry.scene.settings, cloudStyle },
      appearance: { ...SCENE_APPEARANCE, nightSkyStyle: entry.nightSkyStyle, constelStyle: 'immersive' } });
    const link = createSceneLink(scene, { baseUrl: base, timeZone: 'Asia/Tokyo', now: 1792303200000 });
    const restored = parseSceneLink(link).scene;assert.deepEqual(restored.appearance, scene.appearance);assert.deepEqual(restored.settings, scene.settings);
    assert.deepEqual(restored.camera, scene.camera);assert.deepEqual(restored.environment.weather, scene.environment.weather);assert.deepEqual(restored.freeze, scene.freeze);
  }
});

test('旧作品保持没有外观快照，既有链接编码不升级', () => {
  const legacy = validateScene({ version: 1, settings: { vignette: false, nightSkyStyle: 'realistic' } });
  assert(!('appearance' in legacy));assert(!('vignette' in legacy.settings));
  const link = createSceneLink(legacy, { baseUrl: base });assert.match(new URL(link).hash, /^#scene=v3\./);assert(!('appearance' in parseSceneLink(link).scene));
});

test('外观白名单不传播语言、画质、组件、交互权限或私密字段', () => {
  const scene = snapshot({ language: 'ja', quality: 'ultra', apiKey: 'private', renderScale: 1.5, fpsLimit: 0, showPerformance: true, interactionEnabled: true });
  assert.deepEqual(Object.keys(scene.appearance), Object.keys(SCENE_APPEARANCE));
  const value = JSON.stringify(data(createSceneLink(scene, { baseUrl: base })));
  for (const word of ['private', 'ultra', 'apiKey', 'renderScale', 'fpsLimit', 'interactionEnabled']) assert(!value.includes(word));
});

test('拒绝损坏的外观、未知星座、错误有效镜头，不静默换成默认场景', () => {
  for (const appearance of [null, [], { nightSkyStyle: 'wrong' }, { atmosphere: 'false' }, { constelStyle: 'wrong' },
    { constelNames: 0 }, { constelWidth: .1 }, { constelClarity: 10 }, { constelFont: 99 }, { vignette: null }, { stargazing: 'true' }, { selectedConstellation: 'XXX' }])
    assert.equal(validateScene({ version: 1, appearance }), null, JSON.stringify(appearance));
  for (const view of [{ yaw: 0, pitch: 0, position: [0, 0, 0], fov: 105 }, { yaw: 0, position: [0, 0, 0], fov: 60 }, { yaw: 0, pitch: 0, position: [0, 0], fov: 60 }])
    assert.equal(validateScene({ version: 1, camera: { view } }), null);
  assert.equal(validateScene({ version: 1, camera: { tracking: 'XXX' } }), null);
});

test('v6 拒绝缺尾、越界外观、非法云标志和损坏镜头元组', () => {
  const tuple = data(createSceneLink(snapshot(), { baseUrl: base }));
  for (const mutate of [t => t.pop(), t => t.push(0), t => t[11].pop(), t => t[11][2] = 'unknown', t => t[11][1] = null,
    t => t[10] = 2, t => t[4][9].pop(), t => t[4][10] = 'XXX', t => t[4][9][5] = 105]) {
    const changed = structuredClone(tuple);mutate(changed);assert.throws(() => parseSceneLink(encoded(changed)), SceneLinkError);
  }
});
