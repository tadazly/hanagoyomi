import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interfaceScale, getUiScale, uiRect } from '../src/ui/interface-scale.js';

test('旧偏好及异常比例回退 100%，旧 150% 迁移为 125%，保留三档界面比例', () => {
  for (const value of [undefined, null, NaN, Infinity, 0, 3, '1.25']) assert.equal(interfaceScale(value), 1);
  for (const value of [.75, 1, 1.25]) assert.equal(interfaceScale(value), value);
  assert.equal(interfaceScale(1.5), 1.25);
  assert.equal(getUiScale(), 1);
});

test('缩放后的屏幕矩形转换回定位坐标，避免组件和弹窗偏移', () => {
  for (const scale of [.75, 1, 1.25]) {
    const rect = { left: 100, top: 40, right: 300, bottom: 140, width: 200, height: 100 };
    const element = { ownerDocument: { documentElement: { dataset: { uiScale: String(scale) } } },
      getBoundingClientRect: () => Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, value * scale])) };
    assert.deepEqual(uiRect(element), rect);
  }
});
