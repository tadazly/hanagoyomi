import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flightSpeed } from '../src/world/flight-preferences.js';

test('旧设置缺少飞行速度时保持 1 倍，异常值回退，有限数值限制在 0.25 到 3 倍', () => {
  for(const value of [undefined,null,NaN,Infinity,'2'])assert.equal(flightSpeed(value),1);
  assert.equal(flightSpeed(-5),.25);assert.equal(flightSpeed(5),3);
  for(const value of [.25,.75,1,2.5,3])assert.equal(flightSpeed(value),value);
});
