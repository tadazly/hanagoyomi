import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bvToRgb, lineStellarBrightness, constellationPhotometry } from '../src/rendering/stellar-color.js';

test('恒星颜色表达 B−V 冷暖并对缺测采用中性白，亮度层级仅取本征星等', () => {
  const blue = bvToRgb(-.2), red = bvToRgb(1.8);
  assert.ok(blue[2] > blue[0]); assert.ok(red[0] > red[2]);
  assert.deepEqual(bvToRgb(NaN), [1, 1, 1]);
  let previous = 1;
  for (let magnitude = -2; magnitude <= 10; magnitude += .01) {
    const v = lineStellarBrightness(magnitude); assert.ok(v >= .6 && v <= 1 && v <= previous); previous = v;
  }
  assert.ok(lineStellarBrightness(1) > lineStellarBrightness(4));
});

test('线端交叉匹配限制角距，复用星表颜色；共享端点一致、缺测不借用远星', () => {
  const dirs = new Float32Array([1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1]);
  const stars = new Float32Array([1, .00001, 0, 1, 0, 1, 0, 4, 0, .001, 1, 0]);
  const colors = new Float32Array([1, .7, .6, .7, .8, 1, 1, .5, .5]);
  const { data, matched, endpoints } = constellationPhotometry(dirs, stars, colors);
  assert.equal(matched, 2); assert.equal(endpoints, 3);
  assert.deepEqual([...data.slice(0, 3)], [...colors.slice(0, 3)]);
  assert.deepEqual([...data.slice(4, 7)], [...colors.slice(3, 6)]);
  assert.deepEqual([...data.slice(0, 4)], [...data.slice(8, 12)]);
  assert.deepEqual([...data.slice(12, 15)], [1, 1, 1]);
  assert.ok(data[3] > data[7]);
});
