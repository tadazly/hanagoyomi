import { test } from 'node:test';
import assert from 'node:assert/strict';
import { constellationAppearance, constellationSegments } from '../src/rendering/constellation-lines.js';

test('星座线窄屏加粗且连续缩放，两套风格独立，亮度不随 DPR 或星等曝光改变', () => {
  const night = -30 * Math.PI / 180;
  for (const style of ['default', 'realistic']) {
    const phone = constellationAppearance(style, 390, 844, night);
    const desktop = constellationAppearance(style, 1920, 1080, night);
    assert.ok(phone.width >= 1.2 && phone.width <= 1.5);
    assert.ok(desktop.width >= 1 && desktop.width < phone.width);
    assert.deepEqual(phone.brightness, desktop.brightness);
    assert.deepEqual(phone, constellationAppearance(style, 844, 390, night));
    let previous = phone.width;
    for (let width = 390; width <= 1200; width++) {
      const next = constellationAppearance(style, width, 1200, night).width;
      assert.ok(next <= previous && previous - next < .002); previous = next;
    }
  }
  const normal = constellationAppearance('default', 390, 844, night);
  const realistic = constellationAppearance('realistic', 390, 844, night);
  assert.ok(realistic.brightness[2] < normal.brightness[2]);
  assert.ok(realistic.gap[0] < normal.gap[0]);
});

test('夜间标注在暮光边界平滑出现，白天不介入，深夜亮度保持有界', () => {
  for (const style of ['default', 'realistic']) {
    for (const degrees of [-4, 0, 90]) assert.equal(constellationAppearance(style, 390, 844, degrees * Math.PI / 180).visibility, 0);
    let previous = 0;
    for (let degrees = -4; degrees >= -30; degrees -= .01) {
      const a = constellationAppearance(style, 390, 844, degrees * Math.PI / 180);
      assert.ok(a.visibility >= previous && a.visibility <= 1 && a.visibility - previous < .002);
      for (const background of [0, .01, .1, 1, 100]) {
        const energy = Math.min(a.brightness[2], a.brightness[0] + a.brightness[1] * background);
        assert.ok(energy > 0 && energy <= a.brightness[2]);
      }
      previous = a.visibility;
    }
  }
});

test('星座段保留端点方向与星等配对，缺测端点明确标记以隐藏沉浸连线，不补星', () => {
  const lines = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, -1, 0, 0]);
  const stars = new Float32Array([1, 0, 0, 1, 0, 1, 0, 4, 0, 0, 1, 2]);
  const data = constellationSegments(lines, stars);
  assert.equal(data.length, 16);
  for (let i = 0; i < 4; i++) assert.deepEqual([...data.slice(i * 4, i * 4 + 3)], [...lines.slice(i * 3, i * 3 + 3)]);
  assert.deepEqual([data[3], data[7], data[11], data[15]], [1, 4, 2, 99]);
  assert.deepEqual([...lines], [1, 0, 0, 0, 1, 0, 0, 0, 1, -1, 0, 0]);
  assert.throws(() => constellationSegments(new Float32Array(3), stars));
  assert.throws(() => constellationSegments(lines, new Float32Array(3)));
});
