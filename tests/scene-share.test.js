import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { deflateSync } from 'fflate';
import { GALLERY_SCENES } from '../src/data/gallery-scenes.js';
import { resolveSceneTime, validateScene } from '../src/world/scene-state.js';
import { createSceneLink, parseSceneLink, describeScene, SceneLinkError, MAX_SCENE_LINK_LENGTH, MAX_SCENE_TOKEN_LENGTH, MAX_SCENE_JSON_BYTES } from '../src/world/scene-share.js';

const BASE = 'https://example.test/gallery/?wallpaper=1&language=ja&apiKey=private#old';
const NOW = Date.parse('2026-10-18T06:00:00Z');
const TOKYO = { lat: 35.6762, lon: 139.6503, tz: 'Asia/Tokyo' };
const shared = scene => validateScene({ ...scene, environment: { ...scene.environment, skyLocation: TOKYO } });
const tokenData = link => {
  const hash = new URL(link).hash, bytes = Buffer.from(hash.slice('#scene=v1.'.length), 'base64url');
  return JSON.parse((!hash.startsWith('#scene=v1.') ? inflateRawSync(bytes) : bytes).toString('utf8'));
};
const dataLink = data => `https://example.test/#scene=v1.${Buffer.from(JSON.stringify(data)).toString('base64url')}`;
const compressedLink = bytes => `https://example.test/#scene=v2.${Buffer.from(bytes).toString('base64url')}`;
const expectInvalid = input => assert.throws(() => parseSceneLink(input), error => error instanceof SceneLinkError && error.code.startsWith('scene-link.'));

test('全部精选风景无损往返，localHour 解析为固定 UTC，链接短小', () => {
  for (const entry of GALLERY_SCENES) {
    const scene = shared(entry.scene);
    const link = createSceneLink(scene, { title: entry.title.zh, baseUrl: BASE, now: NOW, timeZone: 'America/New_York' });
    const expected = resolveSceneTime(scene, 'Asia/Tokyo', NOW);
    assert.match(new URL(link).hash, /^#scene=v[34]\./);
    assert.deepEqual(parseSceneLink(link), { scene: expected, title: entry.title.zh });
    assert.equal('localHour' in parseSceneLink(link).scene.environment.time, false);
    assert.ok(link.length < 480, `${entry.id}: ${link.length}`);
    assert.equal(new URL(link).search, '');
    assert.ok(!link.includes('apiKey'));
    assert.equal(scene.environment.time.localHour, entry.scene.environment.time.localHour);
  }
});

test('捕获场景的双精度数值、可选高度、开关和天气全部保留', () => {
  const scene = validateScene({ version: 1,
    settings: { auto: true, god: false, petals: false, sway: true, constel: true, flowerGlow: true, bloom: false,
      streamScale: true, infMem: true, lensDrops: false, lowSaturation: true, streamDist: 'far', wxMode: 'dynamic', wxType: 'tstorm',
      coverage: .123456789012345, density: 1.23456789012345, sunAz: 234.56789012345, fogVisS: 128.23456789 },
    camera: { x: -12345.6789012345, y: 234.5678912345, z: 98765.4321098765, agl: 78.901234567, yaw: 4.123456789012345, pitch: -.345678901234567, roll: .123456789012345, fov: 74.567891234, focus: 123.456789012345 },
    environment: { time: { ms: NOW + .125, speedIndex: 6, followNow: true }, weather: { type: 'tstorm',
      current: { cov: .6789123456789, dens: 1.23456789, wind: 78.9123456789, breeze: .5678912345, vis: 12345.678912345, rain: .78912345, snow: .123456789, bolt: 2.678912345, wet: .78912345, snowCov: .123456789 }, wet: .6789123, snowCover: .23456789 }, skyLocation: TOKYO },
    freeze: { time: false, weather: true },
  });
  const link = createSceneLink(scene, { title: '夏の空 🌸 Rain & sunlight', baseUrl: BASE });
  assert.deepEqual(parseSceneLink(link), { scene, title: '夏の空 🌸 Rain & sunlight' });
  assert.ok(link.length < 1500, `捕获场景链接长度 ${link.length}`);
});

test('名称支持三语、emoji 与 NFC，同时剔除不可信附加字段', () => {
  const source = shared(GALLERY_SCENES.find(item => item.id === 'meadow').scene);
  source.settings.apiKey = 'private'; source.settings.language = 'zh'; source.settings.quality = 'ultra'; source.settings.vignette = false;
  source.environment.skyLocation.name = '不应分享真实城市名'; source.thumbnail = 'data:image/jpeg;base64,private';
  const link = createSceneLink(source, { title: '  花海 e\u0301 🌸\n晴れ  ', baseUrl: BASE, now: NOW });
  const result = parseSceneLink(link), data = JSON.stringify(tokenData(link));
  assert.equal(result.title, '花海 é 🌸 晴れ');
  for (const forbidden of ['apiKey', 'language', 'quality', 'vignette', 'thumbnail', 'private', '不应分享']) assert.ok(!data.includes(forbidden));
  assert.deepEqual(result.scene.environment.skyLocation, TOKYO);
});

test('没有锚点的旧场景保持兼容，不生成虚假位置或修改输入', () => {
  const input = structuredClone(GALLERY_SCENES.find(item => item.id === 'meadow').scene), before = structuredClone(input);
  const link = createSceneLink(input, { baseUrl: BASE, timeZone: 'America/New_York', now: NOW });
  const result = parseSceneLink(link);
  assert.equal(result.title, ''); assert.equal(result.scene.environment.skyLocation, undefined);
  assert.deepEqual(result.scene, resolveSceneTime(input, 'America/New_York', NOW));
  assert.deepEqual(input, before);
});

test('支持 HTTPS 完整链接及同站相对链接，不访问网络或存储', () => {
  const link = createSceneLink(GALLERY_SCENES.find(item => item.id === 'meadow').scene, { baseUrl: BASE, now: NOW });
  const hash = new URL(link).hash;
  const expected = parseSceneLink(link);
  assert.deepEqual(parseSceneLink(hash, { baseUrl: BASE }), expected);
  assert.deepEqual(parseSceneLink(`?wallpaper=1${hash}`, { baseUrl: BASE }), expected);
  assert.deepEqual(parseSceneLink(`/other${hash}`, { baseUrl: BASE }), expected);
  assert.deepEqual(parseSceneLink(`https://another.test/${hash}`), expected);
  for (const host of ['localhost', '127.0.0.1', '[::1]']) assert.deepEqual(parseSceneLink(`http://${host}:5173/${hash}`), expected);
  assert.equal(parseSceneLink('https://example.test/#other'), null);
  assert.equal(parseSceneLink('   '), null);
});

test('file 壁纸宿主可独立解析完整 HTTPS 链接，相对链接仍需公开基址', () => {
  const link = createSceneLink(GALLERY_SCENES.find(item => item.id === 'meadow').scene, { baseUrl: BASE, now: NOW });
  const previous = globalThis.location;
  try {
    globalThis.location = { href: 'file:///wallpaper/index.html' };
    assert.deepEqual(parseSceneLink(link), parseSceneLink(link, { baseUrl: BASE }));
    assert.throws(() => parseSceneLink(new URL(link).hash), SceneLinkError);
    assert.deepEqual(parseSceneLink(new URL(link).hash, { baseUrl: BASE }), parseSceneLink(link));
  } finally { if (previous === undefined) delete globalThis.location; else globalThis.location = previous; }
});

test('拒绝危险协议、URL 凭据、非开发环境 HTTP 及损坏的版本或 base64', () => {
  for (const value of ['javascript:alert(1)#scene=v1.AA', 'data:text/plain,#scene=v1.AA', 'file:///tmp/x#scene=v1.AA',
    'https://name:secret@example.test/#scene=v1.AA', 'http://example.test/#scene=v1.AA',
    'https://example.test/#scene=v2.AA', 'https://example.test/#scene=v1.', 'https://example.test/#scene=v1.A',
    'https://example.test/#scene=v1.AB', 'https://example.test/#scene=v1.%%%%', 'https://example.test/#scene=v1.AA=']) expectInvalid(value);
});

test('限制链接、token、JSON 大小，禁止非 UTF8 和压缩载荷', () => {
  expectInvalid('https://example.test/#' + 'a'.repeat(MAX_SCENE_LINK_LENGTH));
  expectInvalid('https://example.test/#scene=v1.' + 'a'.repeat(MAX_SCENE_TOKEN_LENGTH + 1));
  expectInvalid('https://example.test/#scene=v1.' + Buffer.from([255, 254, 253]).toString('base64url'));
  expectInvalid('https://example.test/#scene=v1.' + Buffer.from('not-json').toString('base64url'));
  expectInvalid(dataLink(['x'.repeat(3100)]));
});

test('v2 同步压缩保留 v1 完整场景，旧链接仍可无损解析', () => {
  const scene = shared(GALLERY_SCENES.find(item => item.id === 'meadow').scene);
  scene.environment.motion = { time: 123456.789012345, windAngle: -7.123456789012345, windOffset: [-1234.56789012345, 9876.54321098765] };
  scene.camera.focus = 123.456789012345;
  const modern = createSceneLink(scene, { title: '🌸'.repeat(80), baseUrl: BASE, now: NOW });
  const legacy = dataLink(tokenData(modern));
  assert.deepEqual(parseSceneLink(modern), parseSceneLink(legacy));
  assert.ok(modern.length < legacy.length * .65, `v2 ${modern.length} / v1 ${legacy.length}`);
  assert.throws(() => parseSceneLink(modern.replace('#scene=v3.', '#scene=v6.')), error => error.code === 'scene-link.version');
});

test('v2 固定协议样本可读取且规范编码不随无关改动漂移', () => {
  const link = 'https://example.test/#scene=v2.XY7NDcJQDIN36dk8OT99SWap2KDixhSswRQcmAaJNXgUgSoUxT5Y8udlel5vj_tlgkgRi8MkwNbHy1sSksMMQhK_O2IhdPODJqXNFWIxV82p8CBbuLqnZUgYtCmslfYqpvTKUBcfxRyCTpzO67rJaJQoNZoO4oe50f4H2Tfdr7Jd0Qs';
  const scene = validateScene({ version: 1 });
  assert.deepEqual(parseSceneLink(link), { scene, title: '示例' });
  assert.deepEqual(parseSceneLink(createSceneLink(scene, { title: '示例', baseUrl: 'https://example.test/' })), parseSceneLink(link));
});

test('v2 拒绝损坏压缩、截断、非 UTF8 与越界解压输出，不接受被截断的合法 JSON 前缀', () => {
  const link = createSceneLink(shared(GALLERY_SCENES.find(item => item.id === 'meadow').scene), { baseUrl: BASE, now: NOW });
  const compressed = Buffer.from(new URL(link).hash.slice('#scene=v2.'.length), 'base64url');
  expectInvalid(compressedLink(compressed.subarray(0, -1)));
  expectInvalid(compressedLink([255, 255, 255, 255]));
  expectInvalid(compressedLink(deflateRawSync(Buffer.from([255, 254, 253]))));
  expectInvalid(compressedLink(Buffer.from(JSON.stringify(tokenData(link)))));
  const json = JSON.stringify(tokenData(link)), padding = MAX_SCENE_JSON_BYTES - Buffer.byteLength(json);
  const atLimit = deflateSync(Buffer.from(json + ' '.repeat(padding)), { level: 9 });
  assert.deepEqual(parseSceneLink(compressedLink(atLimit)), parseSceneLink(link));
  expectInvalid(compressedLink(deflateRawSync(Buffer.from(json + ' '.repeat(padding + 1)))));
  expectInvalid(compressedLink(deflateRawSync(Buffer.from(json + ' '.repeat(padding) + 'malicious suffix'))));
});

test('v2 规范编码拒绝尾随垃圾、拼接流及不同压缩编码，不改变 v1 兼容', () => {
  const link = createSceneLink(shared(GALLERY_SCENES.find(item => item.id === 'meadow').scene), { baseUrl: BASE, now: NOW });
  const compressed = Buffer.from(new URL(link).hash.slice('#scene=v2.'.length), 'base64url');
  expectInvalid(compressedLink(Buffer.concat([compressed, Buffer.from([0, 1, 2, 3])])));
  expectInvalid(compressedLink(Buffer.concat([compressed, compressed])));
  const alternate = deflateSync(Buffer.from(JSON.stringify(tokenData(link))), { level: 0 });
  expectInvalid(compressedLink(alternate));
  assert.deepEqual(parseSceneLink(dataLink(tokenData(link))), parseSceneLink(link));
});

test('v2 高膨胀炸弹受固定输出缓冲与输入硬上限约束', () => {
  const bomb = deflateRawSync(Buffer.alloc(2_500_000, 32), { level: 9 });
  assert.ok(bomb.length < MAX_SCENE_JSON_BYTES);
  expectInvalid(compressedLink(bomb));
  expectInvalid('https://example.test/#scene=v2.' + 'a'.repeat(MAX_SCENE_TOKEN_LENGTH + 1));
});

test('严格核对元组结构、范围、标题及时间，不接受原型污染载荷', () => {
  const link = createSceneLink(shared(GALLERY_SCENES.find(item => item.id === 'meadow').scene), { baseUrl: BASE, now: NOW });
  const original = tokenData(link);
  const edits = [d => d.push(1), d => { d[0] = 'x'.repeat(81); }, d => { d[0] = '\u202ehello'; },
    d => { d[1] = 1 << 12; }, d => { d[2][0] = 1e100; }, d => { d[2][0] = null; }, d => { d[2].pop(); },
    d => { d[3][1] = 9; }, d => { d[4][0] = {}; }, d => { d[4][0] = 1e9; }, d => { d[4][7] = 'height'; }, d => { d[4][8] = 601; },
    d => { d[5][1] = 2; }, d => { d[5][2] = .1; }, d => { d[5][0] = Date.parse('2300-01-01'); },
    d => { d[6][0] = -1; }, d => { d[6][1] = -1; }, d => { d[7] = 4; }, d => { d[8][0] = 91; },
    d => { d[8][2] = 'invalid/timezone'; }, d => { d[8] = { __proto__: { polluted: true } }; },
    d => { d[9] = [1, 2, 3]; }, d => { d[9] = [1, '2', 3, 4]; }, d => { d[9] = [-1, 2, 3, 4]; },
    d => { d[9] = [1, 1001, 3, 4]; }, d => { d[9] = [1, 2, 1e10, 4]; }];
  for (const edit of edits) { const data = structuredClone(original); edit(data); expectInvalid(dataLink(data)); }
  expectInvalid(dataLink(JSON.parse('{"__proto__":{"polluted":true}}')));
  assert.equal({}.polluted, undefined);
});

test('自然运动的起始相位完整往返，旧九字段链接与无相位场景保持兼容', () => {
  const source = shared(GALLERY_SCENES.find(item => item.id === 'meadow').scene);
  source.environment.motion = { time: 123456.789012345, windAngle: -7.123456789012345, windOffset: [-1234.56789012345, 9876.54321098765] };
  const link = createSceneLink(source, { title: '风吹花海', baseUrl: BASE, now: NOW });
  assert.deepEqual(parseSceneLink(link).scene, resolveSceneTime(source, 'Asia/Tokyo', NOW));
  assert.equal(tokenData(link).length, 10);
  const data = tokenData(link); data.pop();
  const legacy = parseSceneLink(dataLink(data));
  assert.equal(legacy.scene.environment.motion, undefined);
  const noMotion = createSceneLink(GALLERY_SCENES.find(item => item.id === 'meadow').scene, { baseUrl: BASE, now: NOW });
  assert.equal(parseSceneLink(noMotion).scene.environment.motion, undefined);
});

test('可选景深焦距完整往返，旧八字段相机链接兼容且不造焦距', () => {
  const scene = shared(GALLERY_SCENES.find(item => item.id === 'meadow').scene); scene.camera.focus = 123.456789012345;
  const link = createSceneLink(scene, { baseUrl: BASE, now: NOW }), decoded = parseSceneLink(link);
  assert.equal(decoded.scene.camera.focus, scene.camera.focus);
  assert.deepEqual(decoded.scene, resolveSceneTime(scene, 'Asia/Tokyo', NOW));
  const data = tokenData(link); assert.equal(data[4].length, 9); data[4].pop();
  const old = parseSceneLink(dataLink(data));
  assert.equal(old.scene.camera.focus, undefined);
  assert.equal(old.scene.camera.y, undefined);
});

test('create 拒绝无效场景、无效基址与空白名称', () => {
  const scene = GALLERY_SCENES.find(item => item.id === 'meadow').scene;
  for (const options of [{ baseUrl: 'javascript:bad' }, { baseUrl: 'https://user:secret@example.test/' }, { baseUrl: BASE, title: '  ' }, { baseUrl: BASE, timeZone: 'bad/timezone' }]) {
    assert.throws(() => createSceneLink(scene, options), SceneLinkError);
  }
  assert.throws(() => createSceneLink({ version: 99 }, { baseUrl: BASE }), SceneLinkError);
});

test('副标题优先作品天空时区；旧场景可用调用方时区且安全降级', () => {
  const scene = resolveSceneTime(shared(GALLERY_SCENES.find(item => item.id === 'meadow').scene), 'America/New_York', NOW);
  assert.deepEqual(describeScene(scene, { timeZone: 'America/New_York' }), { weatherKey: 'clear', hour: 15, minute: 0, timeText: '15:00' });
  const old = resolveSceneTime(GALLERY_SCENES.find(item => item.id === 'sunset').scene, 'Asia/Tokyo', NOW);
  assert.deepEqual(describeScene(old, { timeZone: 'Asia/Tokyo' }), { weatherKey: 'fewcloud', hour: 17, minute: 0, timeText: '17:00' });
  assert.equal(describeScene(old, { timeZone: 'invalid/timezone' }).timeText, '08:00');
  assert.equal(describeScene(GALLERY_SCENES.find(item => item.id === 'sunset').scene).timeText, '17:00');
  assert.equal(describeScene({ version: 99 }), null);
});

test('v3 云锁与纵向云相位完整往返，旧 v1/v2 不能承载新增位或元组', () => {
  const scene = validateScene({ version: 1, freeze: { clouds: true }, environment: { motion: { time: 200, windAngle: .3, windOffset: [1, 2], cloudY: .15 } } });
  const link = createSceneLink(scene, { baseUrl: BASE });
  assert.ok(link.includes('#scene=v3.'));
  assert.deepEqual(parseSceneLink(link).scene, scene);
  expectInvalid(dataLink(tokenData(link)));
  expectInvalid(link.replace('#scene=v3.', '#scene=v2.'));
  assert.equal(validateScene({ version: 1, freeze: { clouds: 'true' } }), null);
  assert.equal(validateScene({ version: 1, environment: { motion: { time: 2, windAngle: .3, windOffset: [1,2], cloudY: Infinity } } }), null);
});

test('v4 无损保存萤火虫积分位移，旧版链接继续读取且拒绝新元组', () => {
  for (const extra of [{}, { cloudY: .15 }, { cloudAngle: .6 }, { cloudY: .15, cloudAngle: .6 }]) {
    const scene = validateScene({ version: 1, environment: { motion: {
      time: 1e9 + .125, windAngle: .3, windOffset: [1, 2], flyOffset: [59.999123456789, .00123456789], ...extra,
    } } });
    const link = createSceneLink(scene, { baseUrl: BASE });
    assert.ok(link.includes('#scene=v4.'));
    assert.deepEqual(parseSceneLink(link).scene, scene);
    expectInvalid(link.replace('#scene=v4.', '#scene=v3.'));
  }
  const base = { time: 100, windAngle: .6, windOffset: [1, 2] };
  for (const flyOffset of [null, [], [0], [0, 1, 2], [NaN, 0], [-1, 0], [0, 61], ['1', 0], new Array(2)]) {
    assert.equal(validateScene({ version: 1, environment: { motion: { ...base, flyOffset } } }), null);
  }
});

test('v4 保留风浪平流位移及可选萤火虫位移，拒绝损坏的相位', () => {
  for (const extra of [{}, { flyOffset: [12.3456789012, 59.99] }]) {
    const scene = validateScene({ version: 1, environment: { motion: { time: 2 ** 32, windAngle: .6,
      windOffset: [1, 2], gustOffset: [.7123456789012, .998], ...extra } } });
    const link = createSceneLink(scene, { baseUrl: BASE });
    assert.deepEqual(parseSceneLink(link).scene, scene);
    expectInvalid(link.replace('#scene=v4.', '#scene=v3.'));
  }
  const base = { time: 100, windAngle: .6, windOffset: [1, 2] };
  for (const gustOffset of [null, [], [0], [0, 1, 2], [NaN, 0], [-1, 0], [0, 1.1], ['1', 0], new Array(2)]) {
    assert.equal(validateScene({ version: 1, environment: { motion: { ...base, gustOffset } } }), null);
  }
});
