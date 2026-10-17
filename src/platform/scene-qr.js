// 普通网站按需加载，二维码生成不会进入世界的逐帧循环。
export const loadQRCode = async () => (await import('qrcode')).default;
