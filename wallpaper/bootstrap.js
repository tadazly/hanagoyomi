// 必须在主程序加载前注册，缓存宿主首次发送的属性。
(() => {
  const host = window.hanagoyomiWallpaper = { properties: {}, general: {}, paused: false, listener: null };
  window.wallpaperPropertyListener = {
    applyUserProperties(properties) {
      Object.assign(host.properties, properties);
      host.listener?.properties(properties);
    },
    applyGeneralProperties(properties) {
      Object.assign(host.general, properties);
      host.listener?.general(properties);
    },
    setPaused(paused) {
      host.paused = Boolean(paused);
      host.listener?.pause(host.paused);
    },
  };
})();
