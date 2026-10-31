import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rangeValueAtPosition } from '../src/ui/wallpaper-ranges.js';

test('点击轨道定位遵循小数步长、端点、单档范围与方向', () => {
  const input = { min: '0', max: '100', step: '1', getBoundingClientRect: () => ({left:100,width:100}) };
  assert.equal(rangeValueAtPosition(input,90),0);
  assert.equal(rangeValueAtPosition(input,175),75);
  assert.equal(rangeValueAtPosition(input,220),100);
  input.min='.5';input.max='1.5';input.step='.05';
  assert.equal(rangeValueAtPosition(input,171),1.2);
  assert.equal(rangeValueAtPosition(input,100,true),1.5);
  input.min='5';input.max='5';assert.equal(rangeValueAtPosition(input,180),5);
});
