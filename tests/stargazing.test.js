import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONSTELLATIONS, CONSTELLATION_GROUPS } from '../src/data/constellations.js';
import { LINE_DATA, STAR_DATA } from '../src/data/stars.js';
import { constellationSegments } from '../src/rendering/constellation-lines.js';
import { STARGAZING_DEFAULTS, stargazingPreferences, constellationTarget, constellationLabel } from '../src/rendering/stargazing.js';
import { validateScene } from '../src/world/scene-state.js';
import { createSceneLink, parseSceneLink } from '../src/world/scene-share.js';
import { equatorialToWorld } from '../src/rendering/celestial-coordinates.js';

test('原连线全部归属真实星座，Serpens 两部分共享选择；缺测端点不能冒充恒星', () => {
  assert.equal(CONSTELLATIONS.length, 88);
  assert.equal(new Set(CONSTELLATIONS.map(x => x.id)).size, 88);
  assert.equal(CONSTELLATION_GROUPS.length, Buffer.from(LINE_DATA, 'base64').length / 8);
  assert.equal(new Set(CONSTELLATION_GROUPS).size, 88);
  for (const item of CONSTELLATIONS) for (const language of ['en', 'zh', 'ja']) assert.ok(item[language]?.length > 0);
  const bytes = Buffer.from(STAR_DATA, 'base64'), lineBytes = Buffer.from(LINE_DATA, 'base64');
  const vector = (a, d) => { const ra = a / 65535 * 2 * Math.PI, dec = d / 65535 * Math.PI - Math.PI / 2; return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)]; };
  const stars = new Float32Array(bytes.length / 6 * 4), lines = new Float32Array(lineBytes.length / 4 * 3);
  for (let i = 0; i < bytes.length; i += 6) stars.set([...vector(bytes.readUInt16LE(i), bytes.readUInt16LE(i + 2)), bytes[i + 4] / 255 * 8.5 - 2], i / 6 * 4);
  for (let i = 0; i < lineBytes.length; i += 4) lines.set(vector(lineBytes.readUInt16LE(i), lineBytes.readUInt16LE(i + 2)), i / 4 * 3);
  const segments = constellationSegments(lines, stars);
  const missing = Array.from({length: segments.length / 4}, (_, i) => segments[i * 4 + 3]).filter(x => x === 99).length;
  assert.equal(missing, 5);
  for (let i = 0; i < lines.length / 3; i++) assert.deepEqual([...segments.slice(i * 4, i * 4 + 3)], [...lines.slice(i * 3, i * 3 + 3)]);
});

test('球面居中沿最短方位转动，赤经跨零和极区保持有效', () => {
  for (const latitude of [-90, -60, 0, 60, 90]) for (const lst of [0, .001, Math.PI, Math.PI * 2 - .001]) {
    const eq = equatorialToWorld(lst, latitude);
    for (const direction of [[1, 0, 0], [0, 0, 1], [0, 0, -1], [.999999, -.001, 0]]) {
      const target = constellationTarget(eq, direction, Math.PI * 8 + 3.13);
      assert.ok(Number.isFinite(target.yaw) && Number.isFinite(target.pitch));
      assert.ok(Math.abs(target.yaw - (Math.PI * 8 + 3.13)) <= Math.PI + 1e-10);
      assert.ok(Math.abs(target.pitch) <= Math.PI / 2);
    }
  }
});

test('观星偏好对旧存档使用沉浸默认并拒绝越界值，英语不重复双行', () => {
  assert.deepEqual(stargazingPreferences({constel: true}), STARGAZING_DEFAULTS);
  assert.deepEqual(stargazingPreferences({constelStyle:'bad',constelFont:1e9,constelClarity:NaN,atmosphere:'false'}), STARGAZING_DEFAULTS);
  assert.equal(stargazingPreferences({constelWidth:2,atmosphere:false}).atmosphere, false);
  const item = CONSTELLATIONS.find(x => x.id === 'Ori');
  assert.deepEqual(constellationLabel(item, 'en', true), ['Orion']);
  assert.deepEqual(constellationLabel(item, 'zh', true), [item.zh, 'Orion']);
  assert.deepEqual(constellationLabel(item, 'ja', false), [item.ja]);
});


test('天顶与天底视角可完整保存和分享，极点不随无定义方位旋转', () => {
  const identity = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const target = constellationTarget(identity, [0, 1, 0], 21.5);
  assert.equal(target.yaw, 21.5);
  assert.equal(target.pitch, Math.PI / 2);
  for (const pitch of [-Math.PI / 2, Math.PI / 2]) {
    const scene = validateScene({ version: 1, camera: { pitch } });
    assert.ok(scene);
    assert.equal(parseSceneLink(createSceneLink(scene, { baseUrl: 'https://example.test/' })).scene.camera.pitch, pitch);
  }
  for (const pitch of [-Math.PI / 2 - .01, Math.PI / 2 + .01]) assert.equal(validateScene({ version: 1, camera: { pitch } }), null);
});
