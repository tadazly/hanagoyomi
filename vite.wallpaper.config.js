import { defineConfig, mergeConfig } from 'vite';
import { readFileSync } from 'node:fs';
import base from './vite.config.js';
import { project, workshopTitle, workshopDescription } from './wallpaper/project.js';

export default mergeConfig(base, defineConfig({
  base: './',
  plugins: [{
    name: 'hanagoyomi-wallpaper-engine',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        // 独立浏览器文件入口；不依赖 ES module 的 file:// 跨域行为。
        return html.replace(/<script type="module" crossorigin/g, '<script defer')
          .replace('</head>', '<script src="./wallpaper-bootstrap.js"></script></head>');
      },
    },
    generateBundle() {
      for (const [fileName, source] of [
        ['project.json', JSON.stringify(project, null, 2)],
        ['wallpaper-bootstrap.js', readFileSync(new URL('./wallpaper/bootstrap.js', import.meta.url), 'utf8')],
        ['preview.gif', readFileSync(new URL('./wallpaper/preview.gif', import.meta.url))],
        ['workshop-title.txt', workshopTitle],
        ['workshop-description.txt', workshopDescription],
      ]) this.emitFile({ type: 'asset', fileName, source });
    },
  }],
  build: { outDir: 'dist-wallpaper', target: 'es2020', modulePreload: false, rolldownOptions: { output: { format: 'iife' } } },
}));
