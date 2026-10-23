import { test } from 'node:test';
import assert from 'node:assert/strict';
import { celestialShaftSource, nightCloudGain, nightGroundGain, nightSkyAppearance, moonNorthDirection, MOON_RADIUS } from '../src/rendering/night-sky.js';
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

test('夜空风格缺省及无效旧值回到默认，明确写实选择保留', async () => {
  const { nightSkyStyle } = await import('../src/rendering/night-sky.js');
  for (const saved of [undefined, null, {}, { nightSkyStyle: 'bad' }, { nightSkyStyle: false }, { nightSkyStyle: 'default' }]) assert.equal(nightSkyStyle(saved), 'default');
  assert.equal(nightSkyStyle({ nightSkyStyle: 'realistic' }), 'realistic');
  const astro = { sunAlt: -Math.PI / 2, moon: [0, -1, 0], moonBright: 0 };
  const normal = nightSkyAppearance(astro, 'default'), realistic = nightSkyAppearance(astro, 'realistic');
  assert.equal(normal.darkness, 0); assert.equal(normal.groundNight, 1); assert.equal(normal.airglow, 1);
  assert.equal(realistic.groundNight, .6); assert.equal(realistic.airglow, .6);
});

test('默认深夜地面随可见月光增强，无月、暗月不会比明月更亮', () => {
  const ground = (altitude, moonBright = 1, sunAltitude = -30) => nightGroundGain({
    sunAlt: sunAltitude * Math.PI / 180, moon: [0, Math.sin(altitude * Math.PI / 180), 0], moonBright,
  }, 'default', 4);
  const moonless = ground(-10);
  assert.equal(moonless, ground(-80, .1));
  assert.equal(moonless, ground(60, 0));
  for (let phase = 0; phase <= 1; phase += .05) {
    let previous = moonless;
    for (let altitude = -10; altitude <= 90; altitude += .1) {
      const gain = ground(altitude, phase);
      assert.ok(gain >= previous - 1e-12 && gain <= 1);
      assert.ok(gain - previous < .025); previous = gain;
    }
  }
  assert.equal(ground(60), 1);
  for (const sunAltitude of [-4, 0, 20]) assert.equal(ground(-60, 0, sunAltitude), 1);
  let previous = ground(-10, 0, -4);
  for (let sunAltitude = -4; sunAltitude >= -20; sunAltitude -= .01) {
    const gain = ground(-10, 0, sunAltitude);
    assert.ok(gain <= previous + 1e-12 && previous - gain < .002); previous = gain;
  }
  const astro = { sunAlt: -.8, moon: [0, -.1, 0], moonBright: 1 };
  for (const budget of [.01, .1, .67, 1.74, 1.75, 10, 100]) {
    const gain = nightGroundGain(astro, 'default', budget);
    assert.ok(gain > 0 && gain <= 1);
    assert.ok(budget * gain <= 1.75 + 1e-12);
    if (budget <= 1.75) assert.equal(gain, 1, '原版暗夜花草基准不应被压暗');
    assert.equal(nightGroundGain(astro, 'realistic', budget), 1);
  }
});

test('默认无月云保留原版晴夜柔光基准，额外增亮受限且过渡连续', () => {
  const a = (sun, moon, phase) => ({ sunAlt: sun * Math.PI / 180, moon: [0, moon, 0], moonBright: phase });
  const gain = (astro, budget = 4, style = 'default', ambient = .082) => nightCloudGain(astro, style, budget, ambient);
  assert.ok(Math.abs(gain(a(-30, -.1, 1)) - .83 / 4) < 1e-12);
  assert.ok(Math.abs(gain(a(-30, .8, 0)) - .83 / 4) < 1e-12);
  for (const budget of [0, .1, .82, .83]) assert.equal(gain(a(-30, -.1, 1), budget), 1, '原版无月云色与柔光不变');
  for (const sun of [-4, 0, 40]) assert.equal(gain(a(sun, -.1, 1)), 1);
  assert.equal(gain(a(-30, .8, .2)), 1);
  assert.equal(gain(a(-30, -.1, 1), 4, 'realistic'), 1);
  const moonless = a(-30, -.1, 1);
  assert.ok(gain(moonless, 4, 'default', .02) < gain(moonless));
  assert.ok(gain(moonless, 4, 'default', 0) > 0, '保留柔光，避免整片云变成黑色剪影');
  let previous = gain(a(-30, -.01, 1));
  for (let moon = -.01; moon <= .11; moon += .0001) {
    const value = gain(a(-30, moon, 1));
    assert.ok(value >= previous && value - previous < .002); previous = value;
  }
  previous = gain(a(-30, .8, 0));
  for (let phase = 0; phase <= .3; phase += .0001) {
    const value = gain(a(-30, .8, phase));
    assert.ok(value >= previous && value - previous < .002); previous = value;
  }
});

test('光束只跟随真实日月，月落及暗月不产生虚拟高处光源', () => {
  const sun = [0, -.5, .866], below = [0, -.1, -.995], above = [0, .6, -.8];
  const dark = celestialShaftSource({ sun, moon: below }, [0, 0, 0], [9, 9, 9]);
  assert.deepEqual(dark.radiance, [0, 0, 0]);
  const moon = celestialShaftSource({ sun, moon: above }, [0, 0, 0], [.1, .2, .3]);
  assert.deepEqual(moon.direction, above); assert.deepEqual(moon.radiance, [.1, .2, .3]);
  const day = celestialShaftSource({ sun: above, moon: below }, [1, 2, 3], [9, 9, 9]);
  assert.deepEqual(day.direction, above); assert.deepEqual(day.radiance, [1, 2, 3]);
  assert.deepEqual(celestialShaftSource({ sun, moon: above }, [0, 0, 0], [0, 0, 0]).radiance, [0, 0, 0]);
  let previous = 0;
  for (let y = -.01; y <= .11; y += .0001) {
    const value = celestialShaftSource({ sun, moon: [0, y, 1] }, [0, 0, 0], [1, 1, 1]).radiance[0];
    assert.ok(value >= previous && value - previous < .002); previous = value;
  }
});
