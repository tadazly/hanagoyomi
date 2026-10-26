const clamp = v => Math.max(0, Math.min(1, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// 归一化天气场上的软阈值宽度；云核仍由源高度曲线和三维侵蚀生成。
export const CLOUD_COVERAGE_WIDTH = .18;

// 两种高度轮廓分别标定，再按固定原始云型混合。两条曲线均单调，
// 避免单独退出云型补偿时出现“增加云量却局部减云”。
const COVERAGE = [0, .035, .07, .16, .4, .62, .88, .97, 1];
function curve(values, positions = COVERAGE) {
  const h = positions.slice(1).map((x, i) => x - positions[i]);
  const d = values.slice(1).map((y, i) => (y - values[i]) / h[i]);
  const slope = values.map((_, i) => {
    if (i === 0) return d[0];
    if (i === values.length - 1) return d.at(-1);
    if (d[i - 1] * d[i] <= 0) return 0;
    const a = 2 * h[i] + h[i - 1], b = h[i] + 2 * h[i - 1];
    return (a + b) / (a / d[i - 1] + b / d[i]);
  });
  return c => {
    let i = 0;
    while (i < positions.length - 2 && c > positions[i + 1]) i++;
    const t = (c - positions[i]) / h[i], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * values[i] + (t3 - 2 * t2 + t) * h[i] * slope[i]
      + (-2 * t3 + 3 * t2) * values[i + 1] + (t3 - t2) * h[i] * slope[i + 1];
  };
}
const stratusThreshold = curve([2, .86, .8, .72, .61, .55, .50, .43, -1]);
const cumulusThreshold = curve([2, .82, .74, .60, .57, .52, .50, .43, -1]);
// 稀疏源场原本接近目标时保留参考响应；仅在固定局部均值较高的区域充分校准。
// 沿用原控制节点，以单调 Hermite 连接，避免折线斜率突然换档。
const sourceReference = curve([0, .035, .59, .61, .665, .738, .765, .802, .88, 1],
  [0, .035, .07, .09, .16, .4, .45, .6, .88, 1]);

export function realisticCoverageControls(value) {
  const c = Number.isFinite(value) ? clamp(value) : 0;
  const threshold = stratusThreshold(c);
  return {
    threshold,
    // 保留侵蚀参与的范围；高云量不能让整片天气场提前跳过侵蚀。
    peak: .7 + .15 * smooth(.1, .5, c),
    // 高度曲线较高的云型补偿可见投影差异；按云型连续变化，不按机位特判。
    typeBias: threshold - cumulusThreshold(c),
    // 端点连续收敛，不在 shader 用阈值跳变强制清空/填满。
    fade: smooth(0, .035, c),
    fill: smooth(.97, 1, c),
    // 以源高覆盖场作为上界并连续回归；厚云保持源空间结构与侵蚀。
    sourceMix: smooth(.55, .88, c),
    sourceOffset: (Math.max(c, .88) - .62) * 1.35,
    referenceOffset: (sourceReference(c) - .62) * 1.35,
  };
}
