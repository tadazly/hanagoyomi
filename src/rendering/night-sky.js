// 只控制夜间天体；日间光照、大气与太阳继续使用主干实现。
export const MOON_RADIUS = .0115;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function nightSkyStyle(saved) {
  return saved?.nightSkyStyle === 'realistic' ? 'realistic' : 'default';
}
export function nightSkyAppearance(astronomy, style = 'realistic') {
  const darkness = style === 'default' ? 0 : 1 - smooth(-18, -4, astronomy.sunAlt * 180 / Math.PI);
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
// IAU 月球北极近似，赤道坐标映射到当前地点的天空；不改变日月天文计算。
export function moonNorthDirection(eq) {
  const ra = 269.9949 * Math.PI / 180, dec = 66.5392 * Math.PI / 180;
  const v = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  return [0, 1, 2].map(i => eq[i] * v[0] + eq[i + 3] * v[1] + eq[i + 6] * v[2]);
}
