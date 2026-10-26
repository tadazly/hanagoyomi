// 云前空气与天空使用相同的太阳、月亮及预曝光能量，不使用云的艺术主光增益。
export function cloudAirLight(light, sampled, sunIntensity, glow) {
  const samples = sampled?.samples ?? [light];
  const weights = sampled ? [1 - sampled.fraction, sampled.fraction] : [1];
  const result = { sources: [0, 0], glow: [0, 0, 0], ms: [0, 0, 0] };
  samples.forEach((sample, i) => {
    const weight = weights[i];
    result.sources[0] += weight * (sample.sunI ?? sunIntensity * sample.pe);
    result.sources[1] += weight * sample.moonI * sample.pe;
    for (let c = 0; c < 3; c++) {
      result.glow[c] += weight * glow[c] * sample.pe * sample.airglow;
      result.ms[c] += weight * sample.ms[c];
    }
  });
  return result;
}
