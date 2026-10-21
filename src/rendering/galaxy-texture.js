// 每次只持有当前画质的一张 GPU 纹理；异步切档期间保留上一张，拒绝过期回调。
export function createGalaxyTexture(gl, urls = {}) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  let requested = '', pending = null, generation = 0, failures = 0, retryAt = 0;
  function select(quality) {
    const url = urls[quality] || urls.high;
    if (!url) return;
    if (requested === url) {
      if (pending || !retryAt || failures >= 3 || performance.now() < retryAt) return;
    } else { failures = 0; retryAt = 0; }
    requested = url; const token = ++generation;
    if (pending) { pending.onload = pending.onerror = null; pending.removeAttribute('src'); }
    const image = pending = new Image();
    image.onload = () => {
      if (token !== generation || gl.isContextLost()) return;
      let source = image;
      const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      if (image.width > max || image.height > max) {
        const scale = Math.min(max / image.width, max / image.height), canvas = document.createElement('canvas');
        canvas.width = Math.floor(image.width * scale); canvas.height = Math.floor(image.height * scale);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); source = canvas;
      }
      gl.bindTexture(gl.TEXTURE_2D, texture);
      // 普通 sRGB 照片；硬件在线性光中解码、过滤，避免近似 gamma 改变亮度/颜色。
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);
      image.onload = image.onerror = null; image.removeAttribute('src'); pending = null; failures = 0; retryAt = 0;
    };
    image.onerror = () => {
      if (token !== generation) return;
      image.onload = image.onerror = null; image.removeAttribute('src'); pending = null;
      retryAt = performance.now() + 1000 * 2 ** failures++;
      console.warn('银河贴图加载失败，保留上一画质');
    };
    image.src = new URL(url, document.baseURI).href;
  }
  return { texture, select };
}
