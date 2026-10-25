export const RENDER_DEFAULTS = Object.freeze({ renderScale: 1, fpsLimit: 60, showPerformance: false });

// 渲染偏好属于本机设备，不进入画廊作品或分享链接。
export function renderPreferences(saved) {
  const scale = saved?.renderScale, fps = saved?.fpsLimit;
  return {
    showPerformance: saved?.showPerformance === true,
    renderScale: Number.isFinite(scale) && scale >= .5 && scale <= 1.5 ? Math.round(scale * 20) / 20 : 1,
    fpsLimit: Number.isSafeInteger(fps) && (fps === 0 || fps >= 10) ? fps : 60,
  };
}

export function frameLimitRange(hostFPS) {
  const ceiling = hostFPS === undefined || hostFPS === 0 ? 120
    : Number.isFinite(hostFPS) && hostFPS > 0 ? Math.max(1, Math.floor(hostFPS)) : 30;
  // 最后一个刻度表示不主动限帧；WE 仍需服从独立的宿主上限。
  return { min: Math.min(10, ceiling), max: ceiling + 1, ceiling };
}

export function effectiveFrameLimit(preference, hostFPS) {
  const { fpsLimit } = renderPreferences({ fpsLimit: preference });
  const ownLimit = fpsLimit === 0 ? 0 : Math.min(fpsLimit, frameLimitRange(hostFPS).ceiling);
  if (hostFPS === undefined || hostFPS === 0) return ownLimit;
  const hostLimit = frameLimitRange(hostFPS).ceiling;
  return ownLimit > 0 ? Math.min(ownLimit, hostLimit) : hostLimit;
}

export function qualityFrameBudget(fps) {
  return Math.max(.042, fps > 0 ? 1.35 / fps : 0);
}
