// 旧收藏和分享没有外观快照时保留本机偏好；精选封面的天空使用自然模式。
export function previewAppearance(original, appearance, options = {}) {
  const result = { ...original, stargazing: false, ...appearance };
  if (!appearance) {
    if (options.naturalSky) result.atmosphere = true;
    if (['default', 'realistic'].includes(options.nightSkyStyle)) result.nightSkyStyle = options.nightSkyStyle;
    if (['immersive', 'always'].includes(options.constelStyle)) result.constelStyle = options.constelStyle;
  }
  return result;
}
