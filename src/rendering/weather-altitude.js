// 与体积云共用海拔范围，不能以相机离地高度代替。
export const CLOUD_LAYER_METRES = Object.freeze([1500, 4000]);

const fade = (start, end, height) => {
  const t = Math.max(0, Math.min(1, (height - start) / (end - start)));
  return 1 - t * t * (3 - 2 * t);
};

// 描述相机周围的天气，不改变区域天气、地面湿润或云中的闪电。
export function localWeatherAtHeight(height) {
  const [base, top] = CLOUD_LAYER_METRES;
  return {
    // 形状噪声和高度梯度会让可见云顶低于包络上界，提前在云层上半部淡出。
    precipitation: fade(base + (top - base) * .28, base + (top - base) * .68, height),
    skyFlash: fade(base, top, height),
  };
}
