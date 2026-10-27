import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bvToRgb, lineStellarBrightness, constellationPhotometry, constellationGroupPhotometry } from '../src/rendering/stellar-color.js';

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
  const { data, indices, magnitudes, matched, endpoints } = constellationPhotometry(dirs, stars, colors);
  assert.equal(matched, 2); assert.equal(endpoints, 3);
  assert.deepEqual([...data.slice(0, 3)], [...colors.slice(0, 3)]);
  assert.deepEqual([...data.slice(4, 7)], [...colors.slice(3, 6)]);
  assert.deepEqual([...data.slice(0, 4)], [...data.slice(8, 12)]);
  assert.deepEqual([...data.slice(12, 15)], [1, 1, 1]);
  assert.ok(data[3] > data[7]);
  assert.deepEqual([...indices], [0, 1, 0, -1]);
  assert.deepEqual([...magnitudes], [1, 4, 1, 99]);
});

test('同一星座全部线段采用最亮星，缺测不参与，跨星座共享恒星可分别高亮', () => {
  const group = constellationGroupPhotometry({
    indices: new Int32Array([0, 1, 1, 2, 2, 3, 0, -1, -1, -1]),
    magnitudes: new Float32Array([1, 4, 4, 5, 5, 3, 1, 99, 99, 99]),
  }, new Uint8Array([0, 0, 1, 1, 2]), 3);
  assert.deepEqual([...group.magnitudes], [1, 1, 99]);
  assert.equal(group.brightness[0], group.brightness[1]);
  assert.ok(Math.abs(group.brightness[0] - lineStellarBrightness(1)) < 1e-7);
  assert.deepEqual([...group.members[0]], [0, 1, 2]);
  assert.deepEqual([...group.members[1]], [2, 3, 0]);
  assert.equal(group.members[2].size, 0);
});
