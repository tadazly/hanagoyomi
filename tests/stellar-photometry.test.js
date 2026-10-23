import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { relativeStellarFlux, decodeHipparcosStars } from '../src/rendering/stellar-photometry.js';

test('实测 V 星等遵循 Pogson 通量比，五等之差为一百倍', () => {
  assert.ok(Math.abs(relativeStellarFlux(1) / relativeStellarFlux(6) - 100) < 1e-10);
  assert.ok(Math.abs(relativeStellarFlux(0) / relativeStellarFlux(1) - 100 ** .2) < 1e-12);
  assert.equal(relativeStellarFlux(6), 1);
  assert.ok(relativeStellarFlux(-1.44) > relativeStellarFlux(.03));
});

test('NASA Hipparcos 子集完整、方向为单位向量，肉眼与短曝光弱星分层真实可追溯', async () => {
  const bytes = await readFile(new URL('../src/assets/hipparcos-v7.3.bin', import.meta.url));
  const metadata = JSON.parse(await readFile(new URL('../src/data/hipparcos-catalog.json', import.meta.url), 'utf8'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.binarySha256);
  const data = decodeHipparcosStars(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  assert.equal(data.count, 21107); let eye = 0;
  for (let i = 0; i < data.count; i++) {
    const [x, y, z, magnitude] = data.positions.subarray(i * 4, i * 4 + 4);
    assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-6);
    assert.ok(magnitude >= -2 && magnitude <= 7.300001);
    if (magnitude <= 6.5) eye++;
  }
  assert.equal(eye, 8870); assert.equal(data.count - eye, 12237);
  assert.equal(metadata.inputRecords - metadata.count, 8);
  const reference = new Map([['Sirius', [101.287155, -16.716116, -1.44]], ['Vega', [279.234735, 38.783692, .03]]]);
  for (const [name, [ra, dec, mag]] of reference) {
    const index = metadata.anchors.find(anchor => anchor.name === name).index;
    const [x, y, z, actualMag] = data.positions.subarray(index * 4, index * 4 + 4);
    assert.ok(Math.abs((Math.atan2(y, x) * 180 / Math.PI + 360) % 360 - ra) < .0001);
    assert.ok(Math.abs(Math.asin(z) * 180 / Math.PI - dec) < .0001);
    assert.ok(Math.abs(actualMag - mag) < 1e-6);
  }
});

test('星表记录截断时拒绝解码，缺测色指数不伪造观测值', () => {
  assert.throws(() => decodeHipparcosStars(new ArrayBuffer(11)));
  const buffer = new ArrayBuffer(12), view = new DataView(buffer);
  view.setInt16(10, -32768, true);
  assert.ok(Number.isNaN(decodeHipparcosStars(buffer).colorIndices[0]));
});
