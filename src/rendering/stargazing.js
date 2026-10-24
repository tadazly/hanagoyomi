// 观星工具属于本机偏好；constel 保留旧作品和 Wallpaper Engine 的布尔协议。
export const STARGAZING_DEFAULTS = Object.freeze({
  stargazing: false, constelInteract: true, constelStyle: 'immersive', atmosphere: true,
  constelNames: true, constelBilingual: false, constelWidth: 1, constelClarity: 1, constelFont: 14,
});
export function stargazingPreferences(saved) {
  const result = { ...STARGAZING_DEFAULTS };
  for (const key of ['stargazing', 'constelInteract', 'atmosphere', 'constelNames', 'constelBilingual']) {
    if (typeof saved?.[key] === 'boolean') result[key] = saved[key];
  }
  if (['immersive', 'always'].includes(saved?.constelStyle)) result.constelStyle = saved.constelStyle;
  for (const [key, min, max] of [['constelWidth', .6, 2], ['constelClarity', .4, 2], ['constelFont', 10, 22]]) {
    if (Number.isFinite(saved?.[key]) && saved[key] >= min && saved[key] <= max) result[key] = saved[key];
  }
  return result;
}
export const shortestAngle = (from, to) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from));
export function skyDirection(eq, direction) {
  return [0, 1, 2].map(i => eq[i] * direction[0] + eq[i + 3] * direction[1] + eq[i + 6] * direction[2]);
}
export function constellationTarget(eq, direction, yaw) {
  const d = skyDirection(eq, direction);
  const horizontal = Math.hypot(d[0], d[2]);
  return { yaw: horizontal < 1e-6 ? yaw : shortestAngle(yaw, Math.atan2(d[0], d[2])), pitch: Math.atan2(d[1], horizontal) };
}
export function constellationLabel(item, language, bilingual) {
  const name = item[language] || item.en;
  return language !== 'en' && bilingual ? [name, item.en] : [name];
}
