import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moonlessAstronomy, observationLighting, observationSunAltitude } from '../src/rendering/observation-lighting.js';

test('永夜替换照明，不推进星空时刻或方位', () => {
  const actual = { sun: [1, 1, 0], moon: [1, 0, 1], sunAlt: .7, moonBright: .8, lst: 3, time: 42 };
  const night = moonlessAstronomy(actual);
  assert.equal(night.lst, actual.lst); assert.equal(night.time, actual.time);
  assert.equal(night.moonBright, 0); assert.equal(night.sunAlt, -Math.PI / 2);
  assert.deepEqual(night.sun, [0, -1, 0]); assert.deepEqual(night.moon, [0, -1, 0]);
  assert.equal(actual.moonBright, .8);
});

test('大气开启返回原照明对象，无月目标无直射；中间曝光保持有限且连续', () => {
  const day = { pe: 1, exposure: 1, lightDir: [1, 1, 0], sunT: [1, 1, 0], moonD: [0, 1, 0], lightCloud: [3, 2, 1], moonDisk: [2, 2, 2], grade: { sat: 1, lift: [0, 0, 0] } };
  const night = { ...day, pe: 1e6, exposure: 1e6, lightDir: [0, -1, 0], lightCloud: [0, 0, 0], moonDisk: [0, 0, 0], grade: { sat: .5, lift: [.01, 0, 0] } };
  assert.equal(observationLighting(day, night, 1), day);
  const off = observationLighting(day, night, 0);
  assert.deepEqual(off.lightCloud, [0, 0, 0]); assert.deepEqual(off.moonDisk, [0, 0, 0]);
  assert.deepEqual(off.sunT, day.sunT); assert.deepEqual(off.moonD, day.moonD);
  let previous = 1;
  for (let i = 1; i <= 1000; i++) {
    const a = 1 - i / 1000, state = observationLighting(day, night, a);
    assert.ok(Number.isFinite(state.pe) && state.pe >= previous && state.pe / previous < 1.02);
    assert.ok(state.lightCloud.every(v => v >= 0 && v <= 3)); previous = state.pe;
  }
  assert.equal(observationSunAltitude(.7, 1), .7);
  assert.equal(observationSunAltitude(.7, 0), -Math.PI / 2);
});
