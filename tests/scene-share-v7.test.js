import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'fflate';
import { createSceneLink, parseSceneLink, SceneLinkError } from '../src/world/scene-share.js';
import { decodeSceneV7, encodeSceneV7 } from '../src/world/scene-share-v7.js';
import { packSceneTupleV7, unpackSceneTupleV7, V7_PROTOCOL, V7_MAX_BYTES } from '../src/world/scene-share-v7-codec.js';
import { V7_DICTIONARY_DEFLATE, V7_DICTIONARY_SIZE } from '../src/world/scene-share-v7-dictionary.js';
import { validateScene, resolveSceneTime, SCENE_APPEARANCE } from '../src/world/scene-state.js';
import { GALLERY_SCENES } from '../src/data/gallery-scenes.js';
import { wxPreset, WX_TYPES } from '../src/world/weather-presets.js';

const BASE = 'https://example.test/', NOW = Date.parse('2026-10-27T01:00:00Z');
const fixture = name => JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), 'utf8'));
const legacy = fixture('scene-share-legacy'), golden = fixture('scene-share-v7');
const hash = v => createHash('sha256').update(v).digest('hex');
const payload = link => Buffer.from(new URL(link).hash.slice(10), 'base64url');
const linkFor = bytes => BASE + '#scene=v7.' + Buffer.from(bytes).toString('base64url');
const v6Link = tuple => BASE + '#scene=v6.' + Buffer.from(deflateSync(Buffer.from(JSON.stringify(tuple)), { level: 9 })).toString('base64url');
const invalid = link => assert.throws(() => parseSceneLink(link), e => e instanceof SceneLinkError && e.code === 'scene-link.invalid');
const snapshot = extra => validateScene({ version: 1, appearance: SCENE_APPEARANCE, ...extra });
function roundTrip(scene, title = '花暦 🌸') {
  assert.ok(scene);
  const options = { baseUrl: BASE, now: NOW, timeZone: 'Asia/Tokyo', title };
  const link = createSceneLink(scene, options);
  assert.deepEqual(parseSceneLink(link), { scene: resolveSceneTime(scene, 'Asia/Tokyo', NOW), title });
  return link;
}

test('v1–v6 固定链接的完整还原结果保持一致', () => {
  for (const item of legacy) {
    assert.equal(hash(JSON.stringify(parseSceneLink(item.link))), item.sha256, item.version);
    if (['v3', 'v4', 'v5'].includes(item.version)) {
      const { scene, title } = parseSceneLink(item.link);
      assert.equal(createSceneLink(scene, { baseUrl: BASE, title }), item.link);
    }
  }
});

test('v7 固定协议表、字典和黄金链接不随当前默认值或预设变化', () => {
  assert.ok(Object.isFrozen(V7_PROTOCOL));
  for (const value of Object.values(V7_PROTOCOL)) assert.ok(Object.isFrozen(value));
  assert.equal(hash(JSON.stringify(V7_PROTOCOL)), '3faa01b0b45c172b56fe5339e733160c89b2c12d96fc95b66aa13dd77b910fc9');
  const dictionary = inflateSync(Buffer.from(V7_DICTIONARY_DEFLATE, 'base64'));
  assert.equal(dictionary.length, V7_DICTIONARY_SIZE);
  assert.equal(hash(dictionary), '3164ff2b74a16e42e79bd1ea0711f30d0bd636700921245ae086cb6cf1d4e332');
  for (const item of golden) {
    const result = parseSceneLink(item.link);
    assert.equal(hash(JSON.stringify(result)), item.sha256, item.name);
    assert.equal(createSceneLink(result.scene, { title: result.title, baseUrl: BASE }), item.link, item.name);
  }
});

test('24 个场景 × 两种云风格 × 全部天气 × 五个时段无损往返', () => {
  for (const entry of GALLERY_SCENES) for (const cloudStyle of ['default', 'realistic']) {
    for (const [index, type] of Object.keys(WX_TYPES).entries()) for (const hour of [0, 5.5, 12, 18, 23]) {
      const current = wxPreset(type);
      const scene = validateScene({ ...entry.scene,
        settings: { ...entry.scene.settings, cloudStyle },
        appearance: { ...SCENE_APPEARANCE, nightSkyStyle: entry.nightSkyStyle, constelStyle: index % 2 ? 'always' : 'immersive' },
        environment: { ...entry.scene.environment,
          time: { ms: NOW + hour * 3600000, followNow: index % 2 === 0, speedIndex: index % 8 },
          weather: { type, current, wet: .123456789012345, snowCover: .234567890123456 } },
      });
      const link = roundTrip(scene, entry.title.zh);
      assert.match(new URL(link).hash, /^#scene=v7\./);
      const old = v6Link(decodeSceneV7(payload(link)));
      assert.ok(link.length < old.length, `${entry.id}/${type}/${hour}`);
    }
  }
});

test('镜头、外观、运动分量和锁的存在性分别保留，不以默认值补造缺省字段', () => {
  for (let mask = 0; mask < 256; mask++) {
    const motion = { time: 1e9 + .125, windAngle: -.123456789012345, windOffset: [-1234.56789012345, 9876.54321098765] };
    if (mask & 1) motion.cloudY = 0;
    if (mask & 2) motion.cloudAngle = .6;
    if (mask & 4) motion.flyOffset = [59.99999999999999, Number.MIN_VALUE];
    if (mask & 8) motion.gustOffset = [.9999999999999999, 0];
    const camera = { tracking: 'Sco' };
    if (mask & 16) camera.y = 0;
    if (mask & 32) camera.focus = 120;
    if (mask & 64) camera.view = { yaw: 0, pitch: 0, position: [0, 0, 0], fov: 104 };
    roundTrip(validateScene({ version: 1, camera, environment: { motion },
      ...(mask & 128 ? { appearance: SCENE_APPEARANCE } : {}),
      freeze: { time: !!(mask & 1), weather: !!(mask & 2), clouds: !!(mask & 4) } }));
  }
  for (const scene of [snapshot(), snapshot({ environment: { motion: { time: 0, windAngle: 0, windOffset: [0, 0] } } })]) roundTrip(scene);
});

test('双精度相邻值、极小值、负零、毫秒小数及所有 Unicode 名称无损', () => {
  for (const title of ['🌸'.repeat(80), '日本語 / English / 简体中文', '\ud800', '\udfff', 'a\ud800b\udfff🌸']) {
    const scene = snapshot({ settings: { coverage: Number.MIN_VALUE, dof: .9999999999999999 },
      camera: { x: -0, z: -1e8, agl: 6501.2, yaw: -.12345678901234567, pitch: -Number.MIN_VALUE, fov: 95, y: 1e6, focus: 600,
        view: { yaw: -0, pitch: .12345678901234568, position: [-1e8, -1e6, 1e8], fov: 104 }, tracking: 'UMi' },
      appearance: { ...SCENE_APPEARANCE, constelWidth: 1.0000000000000002, constelClarity: .9999999999999999,
        constelFont: 14.000000000000002, selectedConstellation: 'Cyg' },
      environment: { time: { ms: Date.parse('1900-01-01') + .125, speedIndex: 7 },
        motion: { time: 2 ** 32, windAngle: -1000, cloudAngle: 1000, windOffset: [-1e9, 1e9], cloudY: -1e9, flyOffset: [0, 60], gustOffset: [0, 1] } } });
    roundTrip(scene, title);
  }
});

test('1000 组独立设置、过渡天气、实际视图和星座状态保留完整精度', () => {
  let seed = 0x17a635;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const between = (min, max) => min + random() * (max - min);
  const types = Object.keys(WX_TYPES), ids = V7_PROTOCOL.constellations;
  for (let i = 0; i < 1000; i++) {
    const settings = { cloudStyle: i % 2 ? 'realistic' : 'default', streamDist: ['near', 'mid', 'far'][i % 3],
      wxMode: ['follow', 'dynamic', 'manual', 'off'][i % 4], wxType: types[i % 16] };
    for (const [key, min, max] of [['bloomR', 1.5, 10], ['sunAz', 0, 360], ['dof', 0, 1], ['coverage', 0, 1], ['density', .3, 2.5],
      ['wind', 0, 200], ['breeze', 0, 1], ['fogVisS', 0, 1000], ['rainAmt', 0, 1], ['snowAmt', 0, 1], ['boltFreq', 0, 4], ['puddle', 0, 1], ['snowMax', 0, 1]]) settings[key] = between(min, max);
    for (const key of ['auto', 'god', 'petals', 'sway', 'constel', 'flies', 'flowerGlow', 'bloom', 'streamScale', 'infMem', 'lensDrops', 'lowSaturation']) settings[key] = random() > .5;
    const current = {};
    for (const key of ['cov', 'dens', 'wind', 'breeze', 'vis', 'rain', 'snow', 'bolt', 'wet', 'snowCov']) {
      current[key] = key === 'vis' ? between(60, 30000) : key === 'wind' ? between(0, 200) : key === 'dens' ? between(0, 2.5) : key === 'bolt' ? between(0, 4) : random();
    }
    roundTrip(snapshot({ settings,
      camera: { x: between(-1e8, 1e8), z: between(-1e8, 1e8), agl: between(1.2, 6501.2), y: between(-1e6, 1e6),
        yaw: between(-1e9, 1e9), pitch: between(-Math.PI / 2, Math.PI / 2), roll: between(-Math.PI, Math.PI), fov: between(28, 95), focus: between(1.5, 600),
        view: { yaw: between(-1e9, 1e9), pitch: between(-Math.PI / 2, Math.PI / 2), position: [between(-1e8, 1e8), between(-1e6, 1e6), between(-1e8, 1e8)], fov: between(28, 104) }, tracking: ids[(i + 13) % 88] },
      appearance: { nightSkyStyle: i % 2 ? 'realistic' : 'default', atmosphere: !!(i & 2), constelStyle: i % 2 ? 'always' : 'immersive',
        constelNames: !!(i & 4), constelBilingual: !!(i & 8), constelWidth: between(.6, 2), constelClarity: between(.4, 2),
        constelFont: between(10, 22), vignette: !!(i & 16), stargazing: !!(i & 32), selectedConstellation: ids[i % 88] },
      environment: { time: { ms: NOW + between(0, 1e9), followNow: i % 2 === 0, speedIndex: i % 8 },
        weather: { type: types[(i + 5) % 16], current, wet: random(), snowCover: random() },
        skyLocation: { lat: between(-90, 90), lon: between(-180, 180), tz: 'Asia/Tokyo' },
        motion: { time: between(0, 2 ** 32), windAngle: between(-1000, 1000), windOffset: [between(-1e9, 1e9), between(-1e9, 1e9)],
          cloudY: between(-1e9, 1e9), cloudAngle: between(-1000, 1000), flyOffset: [between(0, 60), between(0, 60)], gustOffset: [random(), random()] } },
      freeze: { time: !!(i & 1), weather: !!(i & 2), clouds: !!(i & 4) },
    }), i % 2 ? '浮点快照 🌸' : '');
  }
});

test('v7 拒绝非法字段范围、未知标志、错误引用及二进制结构', () => {
  const data = decodeSceneV7(payload(golden[0].link));
  for (const change of [t => { t[2][0] = 1000; }, t => { t[3][0] = 3; }, t => { t[4][9][5] = 105; },
    t => { t[11][5] = .1; }, t => { t[6][5] = 0; }, t => { t[9] = [1, 2, 3]; }]) {
    const copy = structuredClone(data); change(copy); invalid(linkFor(encodeSceneV7(copy)));
  }
  for (const raw of [[255], [6, 0], [128, 0], [4, ...Array(9).fill(128)], [5, 127], [7, 127],
    [8, 0], [8, 8], [5, 1, 255], [...Array(10).fill(129), 0], [191, ...Array(63).fill(191)],
    [137, 32, 3, 0, 0, 0, 0, 0, 0, 248, 127]]) invalid(linkFor([0, ...raw]));
  invalid(linkFor([3, 0]));
  assert.throws(() => unpackSceneTupleV7(new Uint8Array(V7_MAX_BYTES + 1)));
});

test('v7 拒绝截断、尾随、拼接、非规范模式与高膨胀载荷', () => {
  const bytes = payload(golden[0].link), data = decodeSceneV7(bytes), raw = packSceneTupleV7(data);
  for (let end = 0; end < bytes.length; end++) invalid(linkFor(bytes.subarray(0, end)));
  for (const extra of [[0], [1, 2, 3], [...bytes.subarray(1)]]) invalid(linkFor([...bytes, ...extra]));
  invalid(linkFor([0, ...raw, 0]));
  invalid(linkFor([1, ...deflateSync(raw, { level: 0 })]));
  const alternate = bytes[0] === 0 ? [1, ...deflateSync(raw, { level: 9 })] : [0, ...raw];
  invalid(linkFor(alternate));
  const bomb = deflateSync(new Uint8Array(2_500_000).fill(32), { level: 9 });
  for (const mode of [1, 2]) invalid(linkFor([mode, ...bomb]));
  const token = Buffer.from(bytes).toString('base64url');
  invalid(BASE + '#scene=v7.' + token + '=');
  invalid(BASE + '#scene=v7.' + 'a'.repeat(4097));
});
