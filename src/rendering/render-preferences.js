export const RENDER_DEFAULTS = Object.freeze({ renderScale: 1, fpsLimit: 60, showPerformance: false });

// 渲染偏好属于本机设备，不进入画廊作品或分享链接。
export function renderPreferences(saved, { wallpaper = false } = {}) {
  const scale = saved?.renderScale, fps = saved?.fpsLimit;
  return {
    showPerformance: saved?.showPerformance === true,
    renderScale: Number.isFinite(scale) && scale >= .5 && scale <= 1.5 ? Math.round(scale * 20) / 20 : 1,
    fpsLimit: Number.isSafeInteger(fps) && (fps === 0 || fps >= (wallpaper ? 1 : 10)) ? fps : wallpaper ? 30 : 60,
  };
}

export function frameLimitRange(hostFPS) {
  const hasHostLimit = Number.isFinite(hostFPS) && hostFPS > 0;
  const ceiling = hasHostLimit ? Math.max(1, Math.floor(hostFPS)) : 120;
  // 只有没有宿主上限时才提供“不限制”；有宿主时末端就是其实际 FPS。
  return { min: Math.min(10, ceiling), max: ceiling + (hasHostLimit ? 0 : 1), ceiling };
}

export function effectiveFrameLimit(preference, hostFPS, wallpaper = hostFPS !== undefined) {
  const { fpsLimit } = renderPreferences({ fpsLimit: preference }, { wallpaper });
  const { min, ceiling } = frameLimitRange(hostFPS);
  const ownLimit = fpsLimit === 0 ? 0 : Math.max(min, Math.min(fpsLimit, ceiling));
  if (!Number.isFinite(hostFPS) || hostFPS <= 0) return ownLimit;
  const hostLimit = frameLimitRange(hostFPS).ceiling;
  return ownLimit > 0 ? Math.min(ownLimit, hostLimit) : hostLimit;
}

export function qualityFrameBudget(fps) {
  return Math.max(.042, fps > 0 ? 1.35 / fps : 0);
}
