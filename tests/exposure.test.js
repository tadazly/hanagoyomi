import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exposureKey } from '../src/rendering/exposure.js';

test('写实深夜保留暗部适应目标，梦幻维持原曝光，白昼与浅暮光一致', () => {
  assert.equal(exposureKey(-8), .1);
  assert.equal(exposureKey(-8, false), .36);
  assert.equal(exposureKey(0), 1);
  for (const lg of [-2.5, -2, -1, -.6, 1]) assert.equal(exposureKey(lg), exposureKey(lg, false));
  for (let lg = -8; lg < 2; lg += .001) {
    assert.ok(exposureKey(lg) >= .1 && exposureKey(lg) <= 1);
    assert.ok(exposureKey(lg) <= exposureKey(lg, false));
    assert.ok(exposureKey(lg + .001) >= exposureKey(lg));
    assert.ok(exposureKey(lg + .001) - exposureKey(lg) < .001);
  }
  for (const boundary of [-5, -2.5, -.6]) assert.ok(Math.abs(exposureKey(boundary - 1e-7) - exposureKey(boundary + 1e-7)) < 1e-7);
});
