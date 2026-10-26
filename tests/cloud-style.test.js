import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateSync, inflateRawSync } from 'node:zlib';
import { deflateSync as compressScene } from 'fflate';
import { cloudStyle } from '../src/rendering/cloud-style.js';
import { cloudWindPhase } from '../src/rendering/cloud-coordinates.js';
import { cloudPhases, cloudLightProjection, cloudCurveTexture, loadCloudNoise, REALISTIC_CLOUD_LAYER } from '../src/rendering/realistic-clouds.js';
import { validateScene } from '../src/world/scene-state.js';
import { createSceneLink, parseSceneLink, SceneLinkError } from '../src/world/scene-share.js';

const BASE = 'https://example.test/';
const close = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} 与 ${expected} 的差超过 ${epsilon}`);
const periodicDelta = (a, b, period) => ((b - a + period / 2) % period + period) % period - period / 2;
const scene = settings => validateScene({ version: 1, settings,
  environment: { time: { ms: 1792886400000, followNow: false, speedIndex: 0 } } });

test('首次启动及非法本机云风格回到默认，合法显式选择保留', () => {
  for (const saved of [undefined, null, {}, { cloudStyle: undefined }, { cloudStyle: null }, { cloudStyle: 'unknown' }, { cloudStyle: 1 }]) {
    assert.equal(cloudStyle(saved), 'default');
  }
  for (const value of ['default', 'realistic']) assert.equal(cloudStyle({ cloudStyle: value }), value);
  assert.equal(scene({ cloudStyle: 'unknown' }), null);
});

test('写实云完整保存并通过 v5 分享往返，不改动镜头或其他设置', () => {
  const base = scene({ cloudStyle: 'realistic', density: 1.23, lowSaturation: true });
  const original = validateScene({ ...base, environment: { ...base.environment,
    motion: { time: 42.125, windAngle: .6, windOffset: [123.456, -987.654], cloudY: 2.5,
      cloudAngle: -.3, flyOffset: [.2, .3], gustOffset: [.4, .5] } }, freeze: { time: true, weather: true, clouds: true } });
  const saved = validateScene(JSON.parse(JSON.stringify(original)));
  assert.deepEqual(saved, original);
  const link = createSceneLink(saved, { baseUrl: BASE, title: '写实云验收' });
  assert.match(new URL(link).hash, /^#scene=v5\./);
  assert.deepEqual(parseSceneLink(link), { scene: original, title: '写实云验收' });
});

test('旧 v1/v2/v3 作品缺少云风格仍默认，默认云分享保留旧版协议', () => {
  const original = scene({});
  const link = createSceneLink(original, { baseUrl: BASE });
  assert.match(new URL(link).hash, /^#scene=v3\./);
  const packed = inflateRawSync(Buffer.from(new URL(link).hash.slice('#scene=v3.'.length), 'base64url'));
  for (const [version, bytes] of [['v1', packed], ['v2', Buffer.from(compressScene(packed, { level: 9 }))]]) {
    const legacy = `${BASE}#scene=${version}.${bytes.toString('base64url')}`;
    assert.deepEqual(parseSceneLink(legacy).scene, original);
  }
  assert.equal(parseSceneLink(link).scene.settings.cloudStyle, 'default');
  const withMotion = validateScene({ ...original, environment: { ...original.environment,
    motion: { time: 12, windAngle: .6, windOffset: [2, -3], flyOffset: [.2, .3] } } });
  const v4 = createSceneLink(withMotion, { baseUrl: BASE });
  assert.match(new URL(v4).hash, /^#scene=v4\./);
  assert.deepEqual(parseSceneLink(v4).scene, withMotion);
});

test('v5 拒绝损坏的云风格尾部，不静默接受未知协议字段', () => {
  const link = createSceneLink(scene({ cloudStyle: 'realistic' }), { baseUrl: BASE });
  const data = JSON.parse(inflateRawSync(Buffer.from(new URL(link).hash.slice('#scene=v5.'.length), 'base64url')));
  for (const flag of [-1, 2, 'realistic', null]) {
    const malformed = [...data.slice(0, 10), flag];
    const token = Buffer.from(compressScene(Buffer.from(JSON.stringify(malformed)), { level: 9 })).toString('base64url');
    assert.throws(() => parseSceneLink(`${BASE}#scene=v5.${token}`), SceneLinkError);
  }
});

test('正负 100000 km 处的厘米移动在宏观和侵蚀相位中仍保留', () => {
  const wind = [12345.678, 35.125, -9876.543], movement = .00001;
  for (const sign of [-1, 1]) for (const detail of [false, true]) {
    const camera = [sign * 1e5, 3.2, -sign * 1e5], period = detail ? .7 : 960;
    const before = cloudWindPhase(camera, wind, detail, 1e9 + .25);
    const after = cloudWindPhase([camera[0] + movement, camera[1], camera[2] - movement], wind, detail, 1e9 + .25);
    close(periodicDelta(before[0], after[0], period), movement, 3e-11);
    close(periodicDelta(before[2], after[2], period), -movement, 3e-11);
    assert.equal(before[1], after[1]);
    assert.ok(before.every(Number.isFinite));
  }
});

test('宏观共同周期及细节周期衔接，镜头与风共同平移不改变云形', () => {
  const camera = [-17.125, 2.75, 23.625], wind = [8.25, 1.2, -3.5];
  for (const detail of [false, true]) {
    const period = detail ? .7 : 960, factor = detail ? 1.6 : 1;
    const original = cloudWindPhase(camera, wind, detail, 42.5);
    const repeated = cloudWindPhase([camera[0] + period, camera[1], camera[2] - period], wind, detail, 42.5);
    const translated = cloudWindPhase([camera[0] + 12 * factor, camera[1], camera[2] - 9 * factor],
      [wind[0] + 12, wind[1], wind[2] - 9], detail, 42.5);
    for (let axis = 0; axis < 3; axis++) {
      close(original[axis], repeated[axis]);
      close(original[axis], translated[axis]);
    }
  }
});

test('EVE 侵蚀移动角度遵循源天气场 600 km 半径，跨相位边界连续', () => {
  const circumference = 2 * Math.PI * 600, camera = [1e5, 3, -1e5], wind = [21.5, 0, -8];
  const before = cloudPhases(camera, wind).map;
  const after = cloudPhases([camera[0] + 1, camera[1], camera[2] + 1], wind).map;
  close(periodicDelta(before[0], after[0], 1), 1 / circumference, 1e-13);
  close(periodicDelta(before[1], after[1], 2 * Math.PI), 1 / 600, 1e-13);
  const repeated = cloudPhases([camera[0] + circumference, camera[1], camera[2] + circumference], wind).map;
  close(periodicDelta(before[0], repeated[0], 1), 0, 1e-13);
  close(periodicDelta(before[1], repeated[1], 2 * Math.PI), 0, 1e-13);
});

test('光照投影在地面、云内、主干上限及极高相机下保持有限且保留水平原点', () => {
  assert.deepEqual(REALISTIC_CLOUD_LAYER, [1750, 7450]);
  for (const height of [0, 1.5, 2.5, 4, 6.5012, 100, 10000, 1e6]) {
    const projection = cloudLightProjection([-1e5, height, 1e5]);
    assert.ok(projection.origin.every(Number.isFinite), `高度 ${height}`);
    assert.ok(Number.isFinite(projection.radius) && projection.radius > 0, `高度 ${height}`);
    assert.equal(projection.origin[0], -1e5);
    assert.equal(projection.origin[2], 1e5);
  }
});

test('云型 RG8 曲线包含有效高度变化，生产噪声恰为既定 128³ R8 数据', async () => {
  const curves = cloudCurveTexture();
  assert.ok(curves instanceof Uint8Array);
  assert.equal(curves.length, 128 * 128 * 2);
  const density = curves.filter((_, index) => index % 2 === 1);
  assert.ok(density.some(value => value > 0));
  assert.ok(new Set(density).size > 1);
  const noise = await loadCloudNoise(() => import('../src/data/eve-cloud-noise.js'));
  assert.equal(noise.length, 128 ** 3);
  assert.equal(createHash('sha256').update(noise).digest('hex'), 'ebd8831f4fb2b5633e3d68b1c29fa1cf8d5f00f3412e31f7712ddd27718d8cf9');
  const invalid = deflateSync(new Uint8Array(128)).toString('base64');
  await assert.rejects(loadCloudNoise(async () => ({ default: invalid })), /噪声数据长度无效/);
});
