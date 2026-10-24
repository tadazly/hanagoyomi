// Mallama & Hilton (2018), §3.2 Eq.3/4：Johnson V，距离 AU、相位角度。
// https://arxiv.org/abs/1808.01973
// 观测拟合适用至 179°；更接近合日时采用该角度的边界近似，保留真实距离。
export function venusMagnitude(sunDistance, observerDistance, phaseDegrees) {
  const a = Math.max(0, Math.min(179, phaseDegrees));
  const phase = a <= 163.7
    ? -4.384 + a * (-.001044 + a * (.0003687 + a * (-.000002814 + a * .000000008938)))
    : 236.05828 + a * (-2.81914 + a * .00839034);
  return 5 * Math.log10(sunDistance * observerDistance) + phase;
}

// 只修正无大气观星路径，开启大气时逐位保留原有昼夜行星显示。
export function observationPlanetMagnitude(legacy, heliocentric, geocentric, atmosphere) {
  if (atmosphere >= 1) return legacy;
  const r = Math.hypot(...heliocentric), delta = Math.hypot(...geocentric);
  const cosine = heliocentric.reduce((sum, v, i) => sum + v * geocentric[i], 0) / (r * delta);
  const phase = Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
  return legacy + (venusMagnitude(r, delta, phase) - legacy) * (1 - atmosphere);
}
