// 随太阳高度插值，保留黄昏暖色与夜间冷色，而非固定的全屏去色。
const ORIGINAL_GRADE = [
  [-14, 0.96, [0.90, 0.95, 1.06], [1.02, 1.00, 0.98], [0.006, 0.009, 0.016]],
  [-6,  1.12, [0.85, 0.93, 1.15], [1.00, 0.97, 1.05], [0.02, 0.03, 0.055]],
  [0,   1.20, [0.90, 0.92, 1.10], [1.15, 0.96, 0.80], [0.035, 0.025, 0.03]],
  [6,   1.16, [0.92, 0.96, 1.08], [1.12, 1.00, 0.84], [0.035, 0.028, 0.025]],
  [20,  1.08, [0.95, 1.00, 1.05], [1.05, 1.01, 0.92], [0.03, 0.03, 0.03]],
];
const DEFAULT_GRADE = [[-14, 0.92, [0.82, 0.92, 1.15], [0.92, 0.98, 1.10], [0.015, 0.025, 0.05]], ...ORIGINAL_GRADE.slice(1)];
const LOW_SATURATION_GRADE = [
  [-14, 0.96, [0.94, 0.98, 1.05], [1.00, 1.00, 1.02], [0.004, 0.006, 0.011]],
  [-6,  0.99, [0.95, 0.98, 1.04], [1.02, 1.00, 0.98], [0.006, 0.008, 0.012]],
  [0,   1.00, [0.97, 0.99, 1.02], [1.03, 1.00, 0.96], [0.006, 0.006, 0.007]],
  [6,   1.00, [0.98, 1.00, 1.01], [1.02, 1.00, 0.98], [0.005, 0.005, 0.005]],
  [20,  1.00, [0.99, 1.00, 1.01], [1.01, 1.00, 0.99], [0.004, 0.004, 0.004]],
];

export function gradeAt(altDeg, lowSaturation = false, realisticNight = true) {
  const keys = lowSaturation ? LOW_SATURATION_GRADE : realisticNight ? ORIGINAL_GRADE : DEFAULT_GRADE;
  const grade = key => ({ sat: key[1], sh: [...key[2]], hi: [...key[3]], lift: [...key[4]] });
  if (altDeg <= keys[0][0]) return grade(keys[0]);
  for (let i = 1; i < keys.length; i++) {
    if (altDeg <= keys[i][0]) {
      const a = keys[i - 1], b = keys[i], t = (altDeg - a[0]) / (b[0] - a[0]);
      const mix = (x, y) => x.map((value, j) => value + (y[j] - value) * t);
      return { sat: a[1] + (b[1] - a[1]) * t, sh: mix(a[2], b[2]), hi: mix(a[3], b[3]), lift: mix(a[4], b[4]) };
    }
  }
  return grade(keys[keys.length - 1]);
}
