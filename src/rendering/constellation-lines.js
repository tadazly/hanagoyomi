const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 宽度、端点留白使用 CSS 像素；显示基础亮度独立于地表补光和静止观测增益，星等仅用于有界的相对层级。
// 两种风格分别校准，窄屏稍加粗；亮天空仅在有界范围内增强对比度。
export function constellationAppearance(style, width, height, sunAltitude) {
  const compact = 1 - smooth(600, 1000, Math.min(width, height));
  const realistic = style === 'realistic';
  return {
    width: realistic ? 1 + .25 * compact : 1.05 + .3 * compact,
    gap: realistic ? [2, 1.1] : [2.3, 1.4],
    color: realistic ? [.70, .77, .85] : [.72, .79, .90],
    brightness: realistic ? [.035, .12, .09] : [.045, .16, .13],
    haze: realistic ? .10 : .08,
    visibility: 1 - smooth(-12, -4, sunAltitude * 180 / Math.PI),
  };
}

// 每段保存两端的赤道方向与原星表星等，只用星等决定留白，不改动恒星的能量或位置。
export function constellationSegments(directions, stars) {
  if (directions.length % 6 || stars.length % 4) throw new Error('星座端点数据长度无效');
  const key = (x, y, z) => `${x},${y},${z}`;
  const magnitudes = new Map();
  for (let i = 0; i < stars.length; i += 4) magnitudes.set(key(stars[i], stars[i + 1], stars[i + 2]), stars[i + 3]);
  const data = new Float32Array(directions.length / 3 * 4);
  for (let i = 0; i < directions.length; i += 3) {
    const [x, y, z] = directions.subarray(i, i + 3);
    let magnitude = magnitudes.get(key(x, y, z));
    // 少量端点不在旧星表中；保留真实方向，用缺测标记使沉浸连线隐藏，不能凭空增亮或补星。
    if (magnitude === undefined) magnitude = 99;
    data.set([x, y, z, magnitude], i / 3 * 4);
  }
  return data;
}
