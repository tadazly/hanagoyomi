import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cloudRayLimit } from '../src/rendering/cloud-range.js';

test('关闭大气时云范围覆盖从低机位到云底的球面可见射线，不在地平线上方裁断', () => {
  const radius = 6371, cloudBase = 1.5;
  for (const height of [0, .003, .06465481445, .5, 1, 1.499]) {
    const origin = radius + height, outer = radius + cloudBase;
    const dip = -Math.acos(radius / origin);
    const limit = cloudRayLimit(height, cloudBase, 0);
    for (let i = 0; i <= 100; i++) {
      const elevation = dip + (Math.PI / 2 - dip) * i / 100;
      const b = origin * Math.sin(elevation);
      const start = -b + Math.sqrt(b * b + outer * outer - origin * origin);
      assert.ok(start < limit, `height=${height}, elevation=${elevation}, distance=${start}, limit=${limit}`);
    }
  }
});

test('原有大气视图精确保留95公里，切换时范围连续，高机位范围保持有限', () => {
  for (const height of [0, .064, 1.5, 3.5, 10, 50]) {
    assert.equal(cloudRayLimit(height, 1.5, 1), 95);
    let previous = 95;
    for (let i = 1; i <= 100; i++) {
      const limit = cloudRayLimit(height, 1.5, 1 - i / 100);
      assert.ok(limit >= previous && limit < 1000);
      assert.ok(limit - previous < 10);
      previous = limit;
    }
  }
});

test('写实云在自然天空也覆盖球面云底，不随夜空样式改变远云边界', () => {
  const radius = 6371, base = 1.75;
  for (const height of [.0012, .065, .8, 1.749]) {
    const origin = radius + height;
    const dip = -Math.acos(radius / origin);
    const tangentStart = -origin * Math.sin(dip) + Math.sqrt((origin * Math.sin(dip)) ** 2 + (radius + base) ** 2 - origin ** 2);
    const limit = cloudRayLimit(height, base, 1, true);
    assert.ok(limit > tangentStart);
    assert.equal(limit, cloudRayLimit(height, base, 0, true));
    assert.equal(limit, cloudRayLimit(height, base, .5, true));
  }
});
