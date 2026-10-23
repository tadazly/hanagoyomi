// 夜间保留线性辐亮度到后期；白天使用原有 shader 和颜色格式。
export function nightHdrEnabled(sunAltitude) {
  return sunAltitude < -4 * Math.PI / 180;
}

export function nightHdrBlend(sunAltitude) {
  const t = Math.max(0, Math.min(1, (-sunAltitude * 180 / Math.PI - 4) / 6));
  return t * t * (3 - 2 * t);
}

export function nightHdrShader(source, twilight = false) {
  return source.replace('#version 300 es', '#version 300 es\n#define NIGHT_HDR' + (twilight ? '\n#define TWILIGHT_HDR' : ''));
}

// 浮点颜色缓冲的 MSAA 能力不等同于 MAX_SAMPLES，须与深度格式取交集。
export function hdrSamples(requested, colorSamples, depthSamples) {
  return Math.max(0, ...Array.from(colorSamples).filter(n => n <= requested && Array.from(depthSamples).includes(n)));
}

export function hdrTarget(requested, candidates, depthSamples) {
  // 同等 MSAA 下优先无闲置 alpha 的 32 位浮点格式；若它降低抗锯齿，则保留 RGBA16F。
  return candidates.map(target => ({ ...target, samples: hdrSamples(requested, target.supportedSamples, depthSamples) }))
    .reduce((best, target) => target.samples > best.samples ? target : best);
}
