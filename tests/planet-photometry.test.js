import { test } from 'node:test';
import assert from 'node:assert/strict';
import { venusMagnitude, observationPlanetMagnitude } from '../src/rendering/planet-photometry.js';

test('金星近合日光度使用年鉴相位关系，避免把细月牙当成满相', () => {
  assert.equal(venusMagnitude(1, 1, 0), -4.384);
  const legacy = -4.4 + 5 * Math.log10(.724251577537558 * .2729156211121968);
  const corrected = venusMagnitude(.724251577537558, .2729156211121968, 171.049920943056);
  assert.ok(Math.abs(corrected - -4.1903) < .001);
  assert.ok(corrected - legacy > 3.7 && corrected - legacy < 3.8);
  assert.ok(Math.abs(venusMagnitude(1, 1, 163.7) - venusMagnitude(1, 1, 163.700001)) < .008);
  assert.equal(venusMagnitude(1, 1, 180), venusMagnitude(1, 1, 179));
  for (let phase = 0; phase <= 180; phase += .1) assert.ok(Number.isFinite(venusMagnitude(.72, .28, phase)));
});

test('原昼夜模式的行星缓冲值不变，无大气仅校正星等并保持几何不变', () => {
  const h = [.72, 0, 0], g = [-.27, 0, 0], originalH = [...h], originalG = [...g], legacy = -7.8;
  const previous = new Float32Array([1, 2, 3, legacy]);
  const on = new Float32Array([1, 2, 3, observationPlanetMagnitude(legacy, h, g, 1)]);
  assert.deepEqual(new Uint8Array(on.buffer), new Uint8Array(previous.buffer));
  const off = observationPlanetMagnitude(legacy, h, g, 0);
  assert.ok(off > legacy + 3);
  for (let i = 0; i <= 100; i++) {
    const a = i / 100, v = observationPlanetMagnitude(legacy, h, g, a);
    assert.ok(Math.abs(v - (legacy * a + off * (1 - a))) < 1e-12);
  }
  assert.deepEqual(h, originalH); assert.deepEqual(g, originalG);
});
