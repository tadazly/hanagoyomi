import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceCloudOffset } from '../src/rendering/cloud-motion.js';

test('云锁冻结完整宏观 xyz，解锁只累计新一帧位移，不追赶暂停时间', () => {
  const offset = [1, .5, -3];
  advanceCloudOffset(offset, 100, 20, 0, true);
  assert.deepEqual(offset, [1, .5, -3]);
  advanceCloudOffset(offset, 1, 20, 0, false);
  assert.deepEqual(offset, [1.02, .5025, -3]);
});

test('云锁期间新风向不改变宏观方向，解锁平滑跨越角度环绕', async () => {
  const { advanceCloudAngle } = await import('../src/rendering/cloud-motion.js');
  assert.equal(advanceCloudAngle(3.13, -3.13, .1, true), 3.13);
  const next = advanceCloudAngle(3.13, -3.13, .1, false);
  assert.ok(next > 3.13 && next - 3.13 < .001);
});
