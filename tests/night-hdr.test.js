import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hdrSamples, hdrTarget, nightHdrEnabled, nightHdrBlend, nightHdrShader } from '../src/rendering/night-hdr.js';

test('白昼与浅暮光保留 SDR 路径，两种风格共用太阳高度边界', () => {
  for (const degrees of [90, 20, 0, -3, -4]) assert.equal(nightHdrEnabled(degrees * Math.PI / 180), false);
  for (const degrees of [-4.001, -8, -18, -90]) assert.equal(nightHdrEnabled(degrees * Math.PI / 180), true);
});

test('浮点 MSAA 按颜色与深度格式的共同能力选择，不假定全局上限可用', () => {
  assert.equal(hdrSamples(4, new Int32Array([8, 4, 2]), new Int32Array([4, 2])), 4);
  assert.equal(hdrSamples(4, new Int32Array([2]), new Int32Array([4, 2])), 2);
  assert.equal(hdrSamples(2, new Int32Array([4, 2]), new Int32Array([4, 2])), 2);
  assert.equal(hdrSamples(4, new Int32Array([]), new Int32Array([4])), 0);
  assert.equal(hdrSamples(4, new Int32Array([4]), new Int32Array([2])), 0);
});

test('夜间 shader 的版本指令仍位于首行，不改写原有白天源码', () => {
  const original = '#version 300 es\nprecision highp float;\nvoid main(){}';
  const night = nightHdrShader(original);
  assert.ok(night.startsWith('#version 300 es\n#define NIGHT_HDR\n'));
  assert.equal(night.replace('#define NIGHT_HDR\n', ''), original);
});

test('紧凑 HDR 不得以降低 MSAA 为代价，无紧凑格式时回退到半浮点', () => {
  const packed = supportedSamples => ({ internal: 'R11F_G11F_B10F', supportedSamples });
  const half = supportedSamples => ({ internal: 'RGBA16F', supportedSamples });
  assert.equal(hdrTarget(4, [packed([4, 2]), half([4, 2])], [4, 2]).internal, 'R11F_G11F_B10F');
  assert.equal(hdrTarget(4, [packed([2]), half([4, 2])], [4, 2]).internal, 'RGBA16F');
  assert.equal(hdrTarget(4, [half([2])], [4, 2]).samples, 2);
});

test('暮光泛光平滑衔接，白天与完全入夜分别保持原路径和完整 HDR', () => {
  assert.equal(nightHdrBlend(0), 0);
  assert.equal(nightHdrBlend(-4 * Math.PI / 180), 0);
  assert.equal(nightHdrBlend(-10 * Math.PI / 180), 1);
  assert.equal(nightHdrBlend(-Math.PI / 2), 1);
  let previous = 0;
  for (let degrees = -4; degrees > -10; degrees -= .01){
    const value = nightHdrBlend(degrees * Math.PI / 180);
    assert.ok(value >= previous && value - previous < .003); previous = value;
  }
});
