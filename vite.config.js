import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { ABOUT_PAGES, renderAboutPage, renderSitemap, websiteSchema } from './src/content/seo.js';
const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;

export default defineConfig({
  plugins: [{
    name: 'hanagoyomi-release-metadata',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ name: 'hanagoyomi', version }, null, 2) });
      for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
        this.emitFile({ type: 'asset', fileName: file, source: readFileSync(file, 'utf8') });
      }
    },
  }, {
    name: 'hanagoyomi-search-pages',
    apply: (_, environment) => environment.mode !== 'wallpaper',
    transformIndexHtml(html) {
      return html.replace('</head>', `  <script type="application/ld+json">${JSON.stringify(websiteSchema())}</script>\n</head>`);
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?')[0];
        const language = Object.keys(ABOUT_PAGES).find(key => ABOUT_PAGES[key].path === path || `${ABOUT_PAGES[key].path}index.html` === path);
        const content = path === '/sitemap.xml' ? renderSitemap() : language ? renderAboutPage(language) : null;
        if (content === null) return next();
        response.setHeader('Content-Type', path === '/sitemap.xml' ? 'application/xml; charset=utf-8' : 'text/html; charset=utf-8');
        response.end(content);
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: renderSitemap() });
      for (const language of Object.keys(ABOUT_PAGES)) {
        this.emitFile({ type: 'asset', fileName: `${ABOUT_PAGES[language].path.slice(1)}index.html`, source: renderAboutPage(language) });
      }
    },
  }],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { target: 'es2022' },
});
