import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPreferences, frameLimitRange, effectiveFrameLimit, qualityFrameBudget } from '../src/rendering/render-preferences.js';
import { createFrameGate } from '../src/platform/frame-gate.js';
import { validateScene, renderSize } from '../src/world/scene-state.js';

test('旧记录默认 100% 与 60 FPS，损坏值回退且比例按 5% 对齐', () => {
  assert.deepEqual(renderPreferences(), { showPerformance: false, renderScale: 1, fpsLimit: 60 });
  assert.deepEqual(renderPreferences({ renderScale: 1.274, fpsLimit: 0 }), { showPerformance: false, renderScale: 1.25, fpsLimit: 0 });
  assert.equal(renderPreferences({showPerformance:true}).showPerformance,true);
  for(const value of [1,'true',null])assert.equal(renderPreferences({showPerformance:value}).showPerformance,false);
  for (const scale of [null, '.5', .49, 1.51, Infinity, NaN]) assert.equal(renderPreferences({ renderScale: scale }).renderScale, 1);
  for (const fps of [null, '60', -1, 9, 60.5, Infinity, NaN]) assert.equal(renderPreferences({ fpsLimit: fps }).fpsLimit, 60);
  for (const fps of [0, 10, 60, 120, 144, 300]) assert.equal(renderPreferences({ fpsLimit: fps }).fpsLimit, fps);
});

test('网页滑条提供 10 至 120 FPS 和末端不限帧，WE 上限随宿主变化', () => {
  assert.deepEqual(frameLimitRange(), { min: 10, max: 121, ceiling: 120 });
  assert.deepEqual(frameLimitRange(30), { min: 10, max: 31, ceiling: 30 });
  assert.deepEqual(frameLimitRange(144), { min: 10, max: 145, ceiling: 144 });
  assert.deepEqual(frameLimitRange(5), { min: 5, max: 6, ceiling: 5 });
  assert.equal(frameLimitRange(NaN).ceiling, 30);
  assert.equal(frameLimitRange(0).ceiling, 120);
});

test('用户限帧与宿主取较低值，不限帧也不能绕过 WE 上限', () => {
  assert.equal(effectiveFrameLimit(60), 60);
  assert.equal(effectiveFrameLimit(0), 0);
  assert.equal(effectiveFrameLimit(300), 120);
  for (const host of [5, 30, 45, 60, 144, 300]) {
    assert.equal(effectiveFrameLimit(60, host), Math.min(60, host));
    assert.equal(effectiveFrameLimit(0, host), host);
  }
  assert.equal(effectiveFrameLimit(144, 144), 144);
  assert.equal(effectiveFrameLimit(0, 0), 0);
  assert.equal(effectiveFrameLimit(30, 0), 30);
  assert.equal(effectiveFrameLimit(0, NaN), 30);
});

test('相同限帧循环覆盖网页、WE、宿主变更和不限帧', () => {
  const count = (preference, host, refresh = 144) => {
    const gate = createFrameGate(); let frames = 0;
    for (let i = 0; i < refresh * 10; i++) if (gate.ready(i * 1000 / refresh, effectiveFrameLimit(preference, host))) frames++;
    return frames;
  };
  for (const [preference, host, expected] of [[60, undefined, 600], [10, undefined, 100], [0, undefined, 1440], [60, 30, 300], [0, 45, 450], [20, 60, 200]]) {
    assert.ok(Math.abs(count(preference, host) - expected) <= 1, `${preference}/${host}`);
  }
  assert.ok(Math.abs(count(0, 300, 360) - 3000) <= 1);
  const gate = createFrameGate();
  assert.equal(gate.ready(0, effectiveFrameLimit(0, 30)), true);
  assert.equal(gate.ready(1, effectiveFrameLimit(0, 30)), false);
  assert.equal(gate.ready(2, effectiveFrameLimit(0, 60)), true);
});

test('主动设为低帧率不触发自动降画质，明显低于目标仍可降档', () => {
  for (const fps of [10, 15, 20, 30, 60, 120]) assert.ok(1 / fps < qualityFrameBudget(fps));
  assert.ok(.2 > qualityFrameBudget(10));
  assert.equal(qualityFrameBudget(0), .042);
});

test('渲染比例改变像素尺寸，作品不能覆盖设备渲染偏好', () => {
  assert.deepEqual(renderSize(1920, 1080, { dpr: .5 }), { width: 960, height: 540 });
  assert.deepEqual(renderSize(1920, 1080, { dpr: 1.5 }), { width: 2880, height: 1620 });
  const scene = validateScene({ version: 1, settings: { renderScale: .5, fpsLimit: 10, showPerformance: true } });
  assert.equal(Object.hasOwn(scene.settings, 'renderScale'), false);
  assert.equal(Object.hasOwn(scene.settings, 'fpsLimit'), false);
  assert.equal(Object.hasOwn(scene.settings, 'showPerformance'), false);
});
