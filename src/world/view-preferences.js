// 启动相机属于本机偏好，不进入作品或分享协议。
export const DEFAULT_VIEW = Object.freeze({ agl: 2.2, pitch: .04, roll: 0, fov: 60, focus: 40 });
export const VIEW_HEIGHT_MIN = 1.2, VIEW_HEIGHT_MAX = 6501.2;
export const aglFromSlider = value => VIEW_HEIGHT_MIN + (VIEW_HEIGHT_MAX - VIEW_HEIGHT_MIN) * Math.pow(value / 1000, 2.2);
export const sliderFromAgl = height => Math.pow(Math.max(height - VIEW_HEIGHT_MIN, 0) / (VIEW_HEIGHT_MAX - VIEW_HEIGHT_MIN), 1 / 2.2) * 1000;
export const HEIGHT_PRESETS = Object.freeze({ meadow: aglFromSlider(0), hills: aglFromSlider(100), clouds: 4500 });

export function startupPreferences(saved) {
  return { rememberPosition: typeof saved?.rememberPosition === 'boolean' ? saved.rememberPosition : true };
}

export function sceneForStartup(scene, defaultCamera, rememberPosition) {
  if (!scene || rememberPosition !== false) return scene;
  return { ...scene, camera: { ...defaultCamera } };
}
