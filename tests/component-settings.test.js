import { test } from 'node:test';
import assert from 'node:assert/strict';
import { componentPreferences, layoutComponents, POSITIONS } from '../src/ui/component-settings.js';

const bounds = { left: 20, top: 20, right: 980, bottom: 780, width: 960, height: 760 };
test('组件默认显示并自适应；损坏的偏好回退，合法偏好保留', () => {
  for (const saved of [null, false, 'bad', { logo: { visible: 'false', position: 'outside' } }]) {
    const preferences = componentPreferences(saved);
    assert.deepEqual(preferences.logo, { visible: true });
  }
  const preferences = componentPreferences({ logo: { visible: false, position: 'top-right' }, observation: { position: 'middle-center' } });
  assert.deepEqual(preferences.logo, { visible: false });
  assert.deepEqual(preferences.observation, { visible: true, position: 'middle-center' });
  assert.deepEqual(preferences.hint, { visible: true });
});

test('九宫格位置都在安全区内，居中与边缘对齐准确', () => {
  for (const position of POSITIONS) {
    const { logo: placement } = layoutComponents([{ name: 'logo', width: 100, height: 60, position }], bounds);
    assert.ok(placement.x >= bounds.left && placement.x + 100 <= bounds.right);
    assert.ok(placement.y >= bounds.top && placement.y + 60 <= bounds.bottom);
    if (position.endsWith('center')) assert.equal(placement.x + 50, 500);
    if (position.startsWith('middle')) assert.equal(placement.y + 30, 400);
  }
});

test('同格组件自动排列，右上组件避开工具栏', () => {
  const items = [{ name: 'logo', width: 120, height: 50, position: 'bottom-right' },
    { name: 'observation', width: 280, height: 180, position: 'bottom-right' },
    { name: 'hint', width: 100, height: 30, position: 'bottom-right' }];
  const placements = layoutComponents(items, bounds);
  assert.ok(placements.logo.y + 50 < placements.observation.y);
  assert.ok(placements.observation.y + 180 < placements.hint.y);
  assert.equal(placements.hint.y + 30, bounds.bottom);
  const toolbar = { left: 700, right: 980, top: 20, bottom: 60 };
  const top = layoutComponents([{ ...items[0], position: 'top-right' }], bounds, toolbar);
  assert.ok(top.logo.y >= toolbar.bottom + 16);
  const left = layoutComponents([{ ...items[0], position: 'top-left' }], bounds, toolbar);
  assert.equal(left.logo.y, bounds.top);
});

test('时间天气避让固定 LOGO 和操作提示，固定组件位置保持不变', () => {
  const bounds = { left: 20, top: 20, right: 374, bottom: 820, width: 354, height: 800 };
  const toolbar = { left: 221, right: 374, top: 20, bottom: 53 };
  const reserved = [{ left: 20, top: 20, right: 140, bottom: 70 }, { left: 350, top: 788, right: 374, bottom: 820 }];
  const before = structuredClone(reserved);
  const top = layoutComponents([{ name: 'observation', width: 230, height: 210, position: 'top-left' }], bounds, toolbar, reserved);
  assert.ok(top.observation.y > reserved[0].bottom);
  const bottom = layoutComponents([{ name: 'observation', width: 230, height: 210, position: 'bottom-right' }], bounds, toolbar, reserved);
  assert.ok(bottom.observation.y + 210 < reserved[1].top);
  assert.deepEqual(reserved, before);
});
