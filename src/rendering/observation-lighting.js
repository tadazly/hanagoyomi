// 仅替换照明条件，不推进天文时刻、恒星方位或行星轨道。
export function moonlessAstronomy(astronomy) {
  return { ...astronomy, sun: [0, -1, 0], sunAlt: -Math.PI / 2, moon: [0, -1, 0], moonBright: 0 };
}

export function observationSunAltitude(sunAltitude, atmosphere) {
  if (atmosphere <= 0) return -Math.PI / 2;
  return sunAltitude + (-Math.PI / 2 - sunAltitude) * (1 - atmosphere);
}

// 光照字段已预曝光，在线性显示能量中渐变；曝光尺度采用对数插值。
export function observationLighting(day, night, atmosphere) {
  if (atmosphere >= 1) return day;
  const amount = 1 - atmosphere;
  const mix = (a, b, key) => Array.isArray(a) ? a.map((v, i) => mix(v, b[i]))
    : typeof a === 'object' ? Object.fromEntries(Object.keys(a).map(k => [k, mix(a[k], b[k], k)]))
    : key === 'pe' || key === 'exposure' ? Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * amount)
    : a + (b - a) * amount;
  return { ...mix(day, night), lightDir: day.lightDir, sunT: day.sunT, moonD: day.moonD };
}
