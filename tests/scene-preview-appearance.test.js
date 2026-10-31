import test from 'node:test';
import assert from 'node:assert/strict';
import { previewAppearance } from '../src/world/scene-appearance.js';

test('精选风景使用封面天空，旧收藏继续继承偏好，完整快照保持原样', () => {
  const original = { atmosphere: false, nightSkyStyle: 'realistic', constelStyle: 'always', vignette: false, stargazing: true };
  const curated = previewAppearance(original, undefined, { naturalSky: true, nightSkyStyle: 'default' });
  assert.deepEqual(curated, { ...original, stargazing: false, atmosphere: true, nightSkyStyle: 'default' });
  assert.deepEqual(previewAppearance(original, undefined), { ...original, stargazing: false });
  const shared = { ...original, atmosphere: false, nightSkyStyle: 'realistic' };
  assert.deepEqual(previewAppearance(original, shared, { naturalSky: true, nightSkyStyle: 'default' }), shared);
  assert.equal(original.atmosphere, false);
  assert.equal(original.stargazing, true);
  assert.equal(previewAppearance(original, { nightSkyStyle: 'default' }).stargazing, false);
  assert.equal(previewAppearance(original, { stargazing: true }).stargazing, true);
});
