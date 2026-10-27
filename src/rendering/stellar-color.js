// B−V 色指数经 Ballesteros (2012) 估温，再用黑体 RGB 经验拟合。
// 与原恒星渲染保持一致：混入 35% 白色模拟暗光色觉；不是实测 RGB。
export function bvToRgb(bv) {
  if (!Number.isFinite(bv)) return [1, 1, 1];
  const T = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62)), t = T / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = [r, g, b].map(v => Math.max(0, Math.min(255, v)) / 255), m = Math.max(...c, 1e-3);
  return c.map(v => (v / m) * 0.65 + 0.35);
}

// 标注只表达适度的本征星等层级，不直接使用跨数千倍的物理通量。
export const lineStellarBrightness = magnitude => .6 + .4 * Math.max(0, Math.min(1, (6 - magnitude) / 6));

// 旧线端点有 16bit 赤经赤纬量化；限距交叉匹配，找不到时保持中性白。
// 空间散列只在星表/风格首次加载时构建，渲染帧中不扫描星表。
export function constellationPhotometry(directions, positions, colors, maxAngle = .01 * Math.PI / 180) {
  const cell = 2 * Math.sin(maxAngle / 2), limit2 = cell * cell, grid = new Map(), cache = new Map();
  const cellKey = (x, y, z) => `${x},${y},${z}`;
  for (let i = 0; i < positions.length; i += 4) {
    const k = cellKey(...[0, 1, 2].map(n => Math.floor(positions[i + n] / cell)));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  const result = new Float32Array(directions.length / 3 * 4);
  const indices = new Int32Array(directions.length / 3), magnitudes = new Float32Array(indices.length);
  let matched = 0;
  for (let i = 0; i < directions.length; i += 3) {
    const [x, y, z] = directions.subarray(i, i + 3), key = cellKey(x, y, z);
    let entry = cache.get(key);
    if (!entry) {
      const [cx, cy, cz] = [x, y, z].map(v => Math.floor(v / cell));
      let nearest = -1, distance = limit2;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (const j of grid.get(cellKey(cx + dx, cy + dy, cz + dz)) || []) {
          const d = (positions[j] - x) ** 2 + (positions[j + 1] - y) ** 2 + (positions[j + 2] - z) ** 2;
          if (d < distance) { distance = d; nearest = j; }
        }
      }
      entry = { index: nearest < 0 ? -1 : nearest / 4, magnitude: nearest < 0 ? 99 : positions[nearest + 3],
        color: nearest < 0 ? [1, 1, 1, .6] : [...colors.subarray(nearest / 4 * 3, nearest / 4 * 3 + 3), lineStellarBrightness(positions[nearest + 3])] };
      cache.set(key, entry);
      if (nearest >= 0) matched++;
    }
    result.set(entry.color, i / 3 * 4);
    indices[i / 3] = entry.index; magnitudes[i / 3] = entry.magnitude;
  }
  return { data: result, indices, magnitudes, matched, endpoints: cache.size };
}

// 同一星座共享最亮成员的透明度参考；成员索引去重，供悬浮和选中时提升真实恒星亮度。
export function constellationGroupPhotometry({ indices, magnitudes }, groups, count) {
  const brightest = new Float32Array(count).fill(99), members = Array.from({ length: count }, () => new Set());
  for (let i = 0; i < indices.length; i++) {
    const group = groups[Math.floor(i / 2)];
    if (indices[i] < 0) continue;
    brightest[group] = Math.min(brightest[group], magnitudes[i]);
    members[group].add(indices[i]);
  }
  return { magnitudes: brightest, brightness: Float32Array.from(brightest, lineStellarBrightness), members };
}
