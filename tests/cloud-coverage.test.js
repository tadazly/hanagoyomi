import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realisticCoverageControls } from '../src/rendering/cloud-coverage.js';

test('覆盖度端点明确且非法输入不会把晴空变成满云', () => {
  const clear = realisticCoverageControls(0), full = realisticCoverageControls(1);
  assert.ok(clear.fade === 0 && clear.fill === 0);
  assert.ok(full.fill === 1);
  for (const value of [-1, NaN, undefined, Infinity]) assert.deepEqual(realisticCoverageControls(value), clear);
  assert.deepEqual(realisticCoverageControls(2), full);
});

test('任意云型的有效阈值单调下降，云核峰值单调上升', () => {
  // 同一世界点增大云量不能局部减云，包含云型补偿退出及厚云发展两个过渡。
  for (const typeMix of [0, .1, .25, .5, .75, 1]) {
    let lastThreshold = Infinity, lastPeak = 0;
    for (let i = 0; i <= 10000; i++) {
      const { threshold, peak, typeBias, fade, fill } = realisticCoverageControls(i / 10000);
      const effective = threshold - typeBias * typeMix;
      assert.ok([threshold, peak, typeBias, fade, fill].every(Number.isFinite));
      assert.ok(effective <= lastThreshold + 1e-12, `云型混合 ${typeMix}，覆盖 ${i / 10000}`);
      assert.ok(peak >= lastPeak && peak >= .7 && peak <= 1);
      lastThreshold = effective; lastPeak = peak;
    }
  }
});

test('原先3.5%到7%的突增区间保持连续，没有离散跳档', () => {
  for (const boundary of [.035, .07, .16, .4, .55, .62, .88, .97]) {
    const a = realisticCoverageControls(boundary - 1e-7), b = realisticCoverageControls(boundary + 1e-7);
    for (const key of ['threshold', 'peak', 'typeBias', 'fade', 'fill', 'sourceMix', 'sourceOffset', 'referenceOffset']) assert.ok(Math.abs(a[key] - b[key]) < 1e-5);
  }
});

test('高覆盖恢复源天气场，过渡权重与潜在覆盖上界不减', () => {
  let mix = 0, offset = 0, reference = -Infinity;
  for (let i = 0; i <= 1000; i++) {
    const c = i / 1000, state = realisticCoverageControls(c);
    assert.ok(state.sourceMix >= mix && state.sourceMix <= 1);
    assert.ok(state.sourceOffset >= offset);
    assert.ok(state.referenceOffset >= reference);
    if (c < .88) assert.ok(state.referenceOffset <= state.sourceOffset);
    if (c <= .55) assert.equal(state.sourceMix, 0);
    if (c >= .88) {
      assert.equal(state.sourceMix, 1);
      assert.ok(Math.abs(state.sourceOffset - (c - .62) * 1.35) < 1e-12);
    }
    mix = state.sourceMix; offset = state.sourceOffset; reference = state.referenceOffset;
  }
});
