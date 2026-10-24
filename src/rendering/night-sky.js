// 只控制夜间天体；日间光照、大气与太阳继续使用主干实现。
export const MOON_RADIUS = .0115;
export const SUN_RADIUS = .0095;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function nightSkyStyle(saved) {
  return saved?.nightSkyStyle === 'realistic' ? 'realistic' : 'default';
}
export function nightSkyAppearance(astronomy, style = 'realistic') {
  const sunAltitude = astronomy.sunAlt * 180 / Math.PI;
  const darkness = style === 'default' ? 0 : 1 - smooth(-18, -4, sunAltitude);
  const moonWash = smooth(-.02, .35, astronomy.moon[1]) * astronomy.moonBright;
  return {
    darkness,
    airglow: 1 - darkness * (.4 - .2 * moonWash),
    groundNight: 1 - darkness * .4 * (1 - .5 * moonWash),
    stars: darkness * (1 - .38 * moonWash),
    galaxy: darkness * darkness * (1 - .88 * moonWash),
    earthshine: .0025 * darkness * (1 - astronomy.moonBright),
  };
}

// 默认风格保留花草的艺术补光。1.75 覆盖原版晴夜花海（约 1.74）和星座花园
// （约 0.67）的显示照明预算，只收敛隐藏月相造成的额外增亮，不压暗这两处基准。
// 不反向抬高曝光，也不设 SDR 像素下限，避免把阴影、发光花朵和写实风格一起提亮。
export function nightGroundGain(astronomy, style, exposedIrradiance) {
  if (style !== 'default') return 1;
  const night = 1 - smooth(-12, -4, astronomy.sunAlt * 180 / Math.PI);
  const moon = smooth(0, .1, astronomy.moon[1]) * smooth(.02, .2, astronomy.moonBright);
  const moonlessGain = Math.min(1, 1.75 / Math.max(exposedIrradiance, 1e-8));
  return 1 - night * (1 - moon) * (1 - moonlessGain);
}

// 默认无月云以原版晴夜花海的柔光为基准（曝光后直射约 0.82、天空环境光约 0.082）。
// 更暗的天空同步降低云的照明，避免相同绝对亮度在暗背景上显得自发光；保留云色和
// 柔和底光，日光、明月与写实风格不介入。
export function nightCloudGain(astronomy, style, exposedRadiance, exposedSkyAmbient) {
  if (style !== 'default') return 1;
  const night = 1 - smooth(-12, -4, astronomy.sunAlt * 180 / Math.PI);
  const moon = smooth(0, .1, astronomy.moon[1]) * smooth(.02, .2, astronomy.moonBright);
  const background = Math.max(.2, Math.min(1, exposedSkyAmbient / .082));
  const moonlessGain = Math.min(1, .83 * background / Math.max(exposedRadiance, 1e-8));
  return 1 - night * (1 - moon) * (1 - moonlessGain);
}

// 光束只接收真实日月的相机处辐亮度，不使用场景的艺术补光方向或能量。
export function celestialShaftSource(astronomy, sunCamera, moonCamera) {
  const moonGain = smooth(0, .1, astronomy.moon[1]);
  const moon = moonCamera.map(v => v * moonGain);
  const luminance = v => .2126 * v[0] + .7152 * v[1] + .0722 * v[2];
  return luminance(sunCamera) >= luminance(moon)
    ? { direction: astronomy.sun, radiance: sunCamera }
    : { direction: astronomy.moon, radiance: moon };
}
// IAU 月球北极近似，赤道坐标映射到当前地点的天空；不改变日月天文计算。
export function moonNorthDirection(eq) {
  const ra = 269.9949 * Math.PI / 180, dec = 66.5392 * Math.PI / 180;
  const v = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  return [0, 1, 2].map(i => eq[i] * v[0] + eq[i + 3] * v[1] + eq[i + 6] * v[2]);
}
