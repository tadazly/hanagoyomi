import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nightSkyAppearance, moonNorthDirection, MOON_RADIUS } from '../src/rendering/night-sky.js';
import { equatorialToWorld } from '../src/rendering/celestial-coordinates.js';
import { exposureKey } from '../src/rendering/exposure.js';

test('夜间天体与暗曝光在白昼、浅暮光不介入，跨过边界时连续', () => {
  for (const altitude of [-4, 0, 20, 90]) {
    const a = nightSkyAppearance({ sunAlt: altitude * Math.PI / 180, moon: [0, 1, 0], moonBright: 1 });
    assert.equal(a.darkness, 0); assert.equal(a.stars, 0); assert.equal(a.galaxy, 0);
    for (const lg of [-8, -3, 0]) {
      const original = exposureKey(lg, false);
      assert.equal(original + (exposureKey(lg) - original) * a.darkness, original);
    }
  }
  let previous = 0;
  for (let alt = -4; alt >= -90; alt -= .01) {
    const a = nightSkyAppearance({ sunAlt: alt * Math.PI / 180, moon: [0, -1, 0], moonBright: 0 });
    assert.ok(a.darkness >= previous && a.darkness <= 1);
    assert.ok(a.darkness - previous < .002); previous = a.darkness;
  }
});

test('月亮升起会冲淡银河，月落后恢复；地照光与星等权重有界', () => {
  const a = moon => nightSkyAppearance({ sunAlt: -Math.PI / 2, moon, moonBright: 1 });
  assert.ok(a([0, 1, 0]).galaxy < a([0, -1, 0]).galaxy);
  assert.ok(a([0, 1, 0]).stars > 0);
  for (let moonBright = 0; moonBright <= 1; moonBright += .01) {
    const n = nightSkyAppearance({ sunAlt: -.8, moon: [0, .7, 0], moonBright });
    assert.ok(n.earthshine >= 0 && n.earthshine <= .0025);
    assert.ok(n.galaxy >= 0 && n.galaxy <= n.stars && n.stars <= 1);
  }
  assert.equal(MOON_RADIUS, .0115);
});

test('月面北向在南北半球及世界旋转后仍为单位向量，天球转动连续', () => {
  for (const lat of [-89, -35, 0, 35, 89]) for (const rotation of [0, 90, 270]) {
    const a = moonNorthDirection(equatorialToWorld(60000, lat, rotation));
    const b = moonNorthDirection(equatorialToWorld(60000 + 1e-5, lat, rotation));
    assert.ok(Math.abs(Math.hypot(...a) - 1) < 1e-7);
    assert.ok(Math.hypot(...a.map((v, i) => v - b[i])) < 1e-5);
  }
});
