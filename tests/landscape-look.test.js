import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeAt } from '../src/rendering/landscape-look.js';
import { project } from '../wallpaper/project.js';

test('默认配色兼容原有昼夜调色，低饱和方案保留黄昏暖色与夜间冷色', () => {
  assert.deepEqual(gradeAt(0), { sat: 1.2, sh: [0.9, 0.92, 1.1], hi: [1.15, 0.96, 0.8], lift: [0.035, 0.025, 0.03] });
  const dusk = gradeAt(0, true), night = gradeAt(-40, true), day = gradeAt(80, true);
  assert.ok(dusk.hi[0] > dusk.hi[2]);
  assert.ok(night.sh[2] > night.sh[0]);
  assert.ok(day.sat <= 1 && dusk.sat < gradeAt(0).sat);
  assert.ok(night.lift.every((value, i) => value < gradeAt(-40).lift[i]));
  assert.equal(project.general.properties.lowsaturation.type, 'bool');
  assert.equal(project.general.properties.lowsaturation.value, false);
});

test('日夜分界连续插值，极端太阳高度有界，返回值不会污染后续帧', () => {
  for (const lowSaturation of [false, true]) {
    for (const boundary of [-14, -6, 0, 6, 20]) {
      const before = gradeAt(boundary - 1e-6, lowSaturation), after = gradeAt(boundary + 1e-6, lowSaturation);
      assert.ok(Math.abs(before.sat - after.sat) < 1e-6);
      for (const key of ['sh', 'hi', 'lift']) {
        before[key].forEach((value, i) => assert.ok(Math.abs(value - after[key][i]) < 1e-6));
      }
    }
    assert.deepEqual(gradeAt(-90, lowSaturation), gradeAt(-14, lowSaturation));
    assert.deepEqual(gradeAt(90, lowSaturation), gradeAt(20, lowSaturation));
    const expected = gradeAt(-14, lowSaturation);
    gradeAt(-14, lowSaturation).sh[0] = 0;
    assert.deepEqual(gradeAt(-14, lowSaturation), expected);
  }
});
