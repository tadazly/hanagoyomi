// IIFE 壁纸内嵌数据，避免 file:// 动态模块与 fetch 跨域。
import packed from '../data/eve-cloud-noise.js';
export const loadCloudNoiseData = () => Promise.resolve({ default: packed });
