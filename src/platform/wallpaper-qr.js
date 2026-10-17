import QRCode from 'qrcode';

// file:// 独立 IIFE 不能依赖模块分块和 import.meta.url；生成仍只在分享时执行。
export const loadQRCode = async () => QRCode;
