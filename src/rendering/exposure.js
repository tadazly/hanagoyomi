const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 显示端的明暗适应取舍，非月光的物理能量修正。
// 写实深夜保留较暗的适应目标，避免低月天空和草地被补偿成白昼。
export function exposureKey(logRelativeLuminance, realistic = true) {
  const night = realistic ? .1 : .36, twilight = .8;
  if (logRelativeLuminance >= -.6) return 1;
  if (logRelativeLuminance >= -2.5) return twilight + (1 - twilight) * smooth(-2.5, -.6, logRelativeLuminance);
  return night + (twilight - night) * smooth(-5, -2.5, logRelativeLuminance);
}
