import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { ABOUT_PAGES, SITE_URL, websiteSchema } from '../src/content/seo.js';

const dist = resolve('dist');
const read = path => readFileSync(resolve(dist, path), 'utf8');
const home = read('index.html');
const sitemap = read('sitemap.xml');
const paths = ['/', ...Object.values(ABOUT_PAGES).map(page => page.path)];
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
assert.deepEqual(urls, paths.map(path => SITE_URL + path), 'Sitemap must list every public landing page exactly once');
assert.ok(read('robots.txt').includes(`Sitemap: ${SITE_URL}/sitemap.xml`));
assert.ok(!/noindex|nofollow/i.test(read('robots.txt')));
assert.ok(!readdirSync(dist).some(file => /^google.*\.html$/i.test(file)), 'Ownership verification files belong to the deployment environment, not release builds');
assert.ok(home.includes(`rel="canonical" href="${SITE_URL}/"`));
assert.ok(home.includes('href="/about/"'), 'Home must expose a crawlable introduction link');
assert.ok(home.includes(`name="description" content="${ABOUT_PAGES.en.homeDescription}"`));
const homeSchemas = [...home.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
assert.deepEqual(homeSchemas.find(schema => schema['@type'] === 'WebSite'), websiteSchema());

for (const page of Object.values(ABOUT_PAGES)) {
  const html = read(`${page.path.slice(1)}index.html`);
  assert.notEqual(page.homeDescription, page.description, 'Home and introduction must describe their own page');
  assert.ok(html.includes(`name="description" content="${page.description}"`));
  assert.ok(html.includes(`<html lang="${page.lang}">`));
  assert.ok(html.includes(`rel="canonical" href="${SITE_URL + page.path}"`));
  assert.ok(html.includes(`<h1>${page.heading}</h1>`));
  assert.ok(!/noindex/i.test(html));
  // 静态页面应在禁用 JavaScript 和 WebGL 时仍提供完整文字。
  assert.ok(!/<script(?! type="application\/ld\+json")/i.test(html));
  for (const alternate of Object.values(ABOUT_PAGES)) {
    assert.ok(html.includes(`hreflang="${alternate.lang}" href="${SITE_URL + alternate.path}"`));
    assert.ok(html.includes(`href="${alternate.path}" lang="${alternate.lang}"`));
  }
  assert.ok(html.includes(`hreflang="x-default" href="${SITE_URL}/about/"`));
  const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(schema.url, SITE_URL + page.path);
  assert.equal(schema.inLanguage, page.lang);
  assert.equal(schema.description, page.description);
  assert.equal(schema.about.description, page.homeDescription);
  for (const match of html.matchAll(/(?:href|src)="(\/[^"#]+)"/g)) {
    const resource = match[1];
    assert.ok(existsSync(resolve(dist, resource.slice(1), resource.endsWith('/') ? 'index.html' : '')), `Missing public resource: ${resource}`);
  }
}
console.log('SEO 构建检查通过：4 个 URL、三语 canonical/hreflang、结构化数据、静态资源和独立验证文件边界。');
