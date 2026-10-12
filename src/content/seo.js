export const SITE_URL = 'https://hanagoyomi.luyilabs.com';
export const ABOUT_PAGES = {
  en: {
    path: '/about/', lang: 'en', label: 'English',
    title: 'Hanagoyomi — Flower Meadows, Live Weather and Starry Skies',
    homeDescription: 'Hanagoyomi is a free interactive nature experience with flower meadows, volumetric clouds and starry skies, following local time and live weather from day to night.',
    description: 'Discover how Hanagoyomi brings flower meadows, volumetric clouds, live weather and the cycle from daylight to starry nights to your browser and Wallpaper Engine.',
    heading: 'A moment in nature, wherever you are.',
    intro: 'Hanagoyomi (花暦) is a free, open-source nature experience for your browser and Wallpaper Engine. Wander through meadows filled with flowers and drifting petals beneath volumetric clouds. The sky follows a real place’s local time and live weather, changing from daylight and sunset to a night sky full of stars.',
    homeIntro: 'Explore flower-filled meadows beneath volumetric clouds, watch daylight give way to sunset, and look up at the stars after dark. The sky follows the observation location’s local time and live weather, with weather updates every 15 minutes. The meadow is a procedurally generated imaginary landscape.',
    enter: 'Explore the live world', about: 'About Hanagoyomi', features: 'A world that changes with the day',
    items: [
      ['Real time and weather', 'Choose a city or your current location. The sky follows local time, sunrise and sunset; weather data comes from Open-Meteo and updates every 15 minutes. The meadow is imaginary, not a reconstruction of the selected city.'],
      ['Flower meadows and volumetric clouds', 'WebGL2 brings fields of flowers, swaying grass, drifting petals and volumetric clouds to life. Adjust the season, cloud cover, rain, snow and wind, or let the scene follow live weather.'],
      ['From daylight to starry skies', 'Watch the light change from sunrise to sunset, then see the stars appear after dark as the sky follows local time. Fly through the meadow or use immersive mode to hide the interface; adjust the quality and field of view to suit your device.'],
      ['Browser and desktop wallpaper', 'Open the live website without installing an app, or subscribe to the Wallpaper Engine version on Steam Workshop. The interface supports English, Simplified Chinese and Japanese.'],
    ],
    requirements: 'What you need', requirementsText: 'The live scene requires JavaScript, WebGL2 and a compatible GPU. Weather updates require an internet connection. This introduction works without JavaScript or WebGL.',
    privacy: 'Location and privacy', privacyText: 'Location and settings are stored in your browser. Using your current location requires browser permission; coordinates are sent to Open-Meteo to request weather. You can choose a city instead.',
    links: 'Explore further', source: 'Source code on GitHub', workshop: 'Wallpaper Engine on Steam Workshop',
    imageAlt: 'Hanagoyomi’s meadow, flowers and clouds under the evening sky',
  },
  zh: {
    path: '/zh/about/', lang: 'zh-Hans', label: '简体中文',
    title: '花暦 Hanagoyomi — 花海、实时天气与星空',
    homeDescription: '花暦 Hanagoyomi 是免费开源的交互式自然体验。漫游花海与草原，欣赏体积云、昼夜变化和星空，让场景跟随当地时间与实时天气变化。',
    description: '了解花暦 Hanagoyomi 的花海、体积云与星空体验，探索实时天气和昼夜变化，并查看浏览器与 Wallpaper Engine 动态壁纸支持。',
    heading: '把此刻，交给自然。',
    intro: '花暦 Hanagoyomi 是可在浏览器和 Wallpaper Engine 中运行的免费开源自然体验。走进花海与草原，在飘落的花瓣和体积云之间漫游。天空跟随真实地点的当地时间与实时天气，经历从日出、白昼到暮色的昼夜变化，入夜后展开星空。',
    homeIntro: '在花海与草原之间漫游，仰望体积云，感受从日出到暮色的昼夜变化，入夜后欣赏星空。天空跟随观测地点的当地时间和实时天气，天气数据每 15 分钟更新。草原是一片程序生成的想象之地。',
    enter: '进入实时自然世界', about: '关于花暦 Hanagoyomi', features: '随一天变化的自然世界',
    items: [
      ['当地时间与实时天气', '选择城市，或使用当前位置，让天空跟随当地时间与实时天气变化。Open-Meteo 天气数据每 15 分钟更新。花海与草原是虚构景观，并非所选城市的地形复刻。'],
      ['花海、体积云与四季', 'WebGL2 实时呈现连绵花海、随风摇曳的草地、飘落的花瓣与体积云。你可以调整季节、云量、雨雪与风，也可以让场景跟随当地天气。'],
      ['从日出到星空', '天空随当地时间经历昼夜变化，从晨光、白昼走向落日和暮色，入夜后显现星空。在草原上飞行、环顾四周，或开启沉浸模式静静欣赏；也可根据设备调整画质与视野。'],
      ['浏览器体验与桌面动态壁纸', '无需安装应用即可访问网站，也可以在 Steam 创意工坊订阅 Wallpaper Engine 版本。界面支持简体中文、英语与日语。'],
    ],
    requirements: '运行要求', requirementsText: '实时场景需要 JavaScript、WebGL2 和兼容的 GPU；天气更新需要网络连接。这份介绍无需 JavaScript 或 WebGL 即可阅读。',
    privacy: '定位与隐私', privacyText: '位置和设置保存在你的浏览器中。使用当前位置需要浏览器授权，坐标会发送至 Open-Meteo 获取天气；也可以直接选择城市。',
    links: '继续探索', source: '查看 GitHub 源码', workshop: '在 Steam 创意工坊订阅动态壁纸',
    imageAlt: '花暦在暮色下实时渲染的草原、花朵与云层',
  },
  ja: {
    path: '/ja/about/', lang: 'ja', label: '日本語',
    title: '花暦 Hanagoyomi — 花畑、リアルタイムの天気と星空',
    homeDescription: '花暦 Hanagoyomi は、無料で楽しめるインタラクティブな自然体験。花畑と立体的な雲を眺めながら、現地の時刻やリアルタイムの天気に合わせた昼夜の移ろいと星空を楽しめます。',
    description: '花暦 Hanagoyomi の機能と楽しみ方をご紹介。花畑や立体的な雲、リアルタイムの天気、昼夜の変化と星空の表現、ブラウザーでの体験や Wallpaper Engine の壁紙対応について説明します。',
    heading: 'このひとときを、自然に。',
    intro: '花暦 Hanagoyomi は、ブラウザーと Wallpaper Engine で楽しめる無料のオープンソース自然体験です。立体的な雲の下に広がる花畑や草原を、舞う花びらとともに散策できます。空は現地の時刻とリアルタイムの天気に合わせて移ろい、朝の光から夕暮れ、そして夜の星空へと表情を変えます。',
    homeIntro: '立体的な雲の下で花畑や草原を散策し、朝から夕暮れ、夜の星空へと移ろう景色を楽しめます。空は観測地点の現地時刻とリアルタイムの天気に合わせて変わり、天気データは 15 分ごとに更新されます。草原はプログラムで生成された想像の風景です。',
    enter: '自然の世界へ', about: '花暦 Hanagoyomi について', features: '一日とともに変わる世界',
    items: [
      ['現地の時刻とリアルタイムの天気', '都市や現在地を選ぶと、その場所の時刻と天気に合わせて空が変化します。Open-Meteo の天気データは 15 分ごとに更新されます。花畑や草原は架空の風景で、選んだ都市の地形を再現したものではありません。'],
      ['花畑、立体的な雲、季節の移ろい', 'WebGL2 で、一面に広がる花畑、風に揺れる草、舞う花びら、立体的な雲をリアルタイム描画します。季節、雲量、雨、雪、風を調整するか、現地の天気に合わせられます。'],
      ['朝の光から夜の星空へ', '現地の時刻とともに昼と夜が移り変わり、朝の光、日中の空、夕焼けを経て、夜には星空が現れます。草原を飛び回ったり、没入モードで静かに眺めたりできます。端末に合わせて画質や視野角も変更できます。'],
      ['ブラウザーとデスクトップ壁紙', 'アプリをインストールせずにサイトを開くか、Steam ワークショップで Wallpaper Engine 版を購読できます。表示言語は日本語、英語、簡体字中国語に対応しています。'],
    ],
    requirements: '動作環境', requirementsText: 'リアルタイムの風景には JavaScript、WebGL2、対応 GPU が必要です。天気の更新にはインターネット接続が必要です。この紹介ページは JavaScript や WebGL なしでも読めます。',
    privacy: '位置情報とプライバシー', privacyText: '位置と設定はブラウザーに保存されます。現在地の利用にはブラウザーの許可が必要で、天気を取得するため座標が Open-Meteo に送信されます。都市を選ぶこともできます。',
    links: 'もっと知る', source: 'GitHub でソースを見る', workshop: 'Steam ワークショップで壁紙を購読',
    imageAlt: '夕暮れの空の下に広がる花暦の草原、花と雲',
  },
};

const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');

export function aboutPath(language) {
  return (ABOUT_PAGES[language] || ABOUT_PAGES.en).path;
}

export function websiteSchema() {
  return { '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${SITE_URL}/#website`, url: `${SITE_URL}/`, name: '花暦 · Hanagoyomi', alternateName: ['Hanagoyomi', '花暦'], inLanguage: ['en', 'zh-Hans', 'ja'] };
}

export function renderAboutPage(language) {
  const page = ABOUT_PAGES[language];
  if (!page) throw new Error(`Unknown introduction language: ${language}`);
  const url = SITE_URL + page.path;
  const alternates = Object.values(ABOUT_PAGES).map(other => `  <link rel="alternate" hreflang="${other.lang}" href="${SITE_URL + other.path}">`).join('\n');
  const navigation = Object.values(ABOUT_PAGES).map(other => `<a href="${other.path}" lang="${other.lang}" hreflang="${other.lang}"${other === page ? ' aria-current="page"' : ''}>${other.label}</a>`).join(' ');
  const schema = { '@context': 'https://schema.org', '@type': 'AboutPage', url, name: page.title, description: page.description, inLanguage: page.lang, isPartOf: { '@id': `${SITE_URL}/#website` }, about: { '@type': 'WebApplication', name: '花暦 · Hanagoyomi', url: `${SITE_URL}/`, description: page.homeDescription, applicationCategory: 'EntertainmentApplication', operatingSystem: 'Any', browserRequirements: 'Requires JavaScript and WebGL2', license: 'https://github.com/tadazly/hanagoyomi/blob/main/LICENSE', sameAs: ['https://github.com/tadazly/hanagoyomi', 'https://steamcommunity.com/sharedfiles/filedetails/?id=3815915459'] } };
  return `<!doctype html>
<html lang="${page.lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#65745b">
  <title>${escape(page.title)}</title>
  <meta name="description" content="${escape(page.description)}">
  <link rel="canonical" href="${url}">
${alternates}
  <link rel="alternate" hreflang="x-default" href="${SITE_URL}/about/">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="stylesheet" href="/about/style.css">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="花暦 · Hanagoyomi">
  <meta property="og:title" content="${escape(page.title)}">
  <meta property="og:description" content="${escape(page.description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${SITE_URL}/social-preview.jpg">
  <meta property="og:image:alt" content="${escape(page.imageAlt)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escape(page.title)}">
  <meta name="twitter:description" content="${escape(page.description)}">
  <meta name="twitter:image" content="${SITE_URL}/social-preview.jpg">
  <meta name="twitter:image:alt" content="${escape(page.imageAlt)}">
  <script type="application/ld+json">${json(schema)}</script>
</head>
<body>
  <header><a class="brand" href="/">花暦 <span>HANAGOYOMI</span></a><nav aria-label="Language">${navigation}</nav></header>
  <main>
    <section class="intro"><p class="eyebrow">${escape(page.about)}</p><h1>${escape(page.heading)}</h1><p class="lead">${escape(page.intro)}</p><a class="enter" href="/">${escape(page.enter)} <span aria-hidden="true">↗</span></a></section>
    <img class="scene" src="/social-preview.jpg" width="1586" height="992" alt="${escape(page.imageAlt)}" fetchpriority="high">
    <section><h2>${escape(page.features)}</h2><div class="features">${page.items.map(([title, text]) => `<article><h3>${escape(title)}</h3><p>${escape(text)}</p></article>`).join('')}</div></section>
    <section class="notes"><article><h2>${escape(page.requirements)}</h2><p>${escape(page.requirementsText)}</p></article><article><h2>${escape(page.privacy)}</h2><p>${escape(page.privacyText)}</p></article></section>
    <section><h2>${escape(page.links)}</h2><div class="links"><a href="/">${escape(page.enter)} ↗</a><a href="https://github.com/tadazly/hanagoyomi">${escape(page.source)} ↗</a><a href="https://steamcommunity.com/sharedfiles/filedetails/?id=3815915459">${escape(page.workshop)} ↗</a></div></section>
  </main>
  <footer>花暦 · Hanagoyomi · <a href="https://github.com/tadazly/hanagoyomi/blob/main/LICENSE">MIT License</a></footer>
</body>
</html>
`;
}

export function renderSitemap() {
  // 只列出真实存在的页面，不将城市、设置或验证文件当作搜索落地页。
  const paths = ['/', ...Object.values(ABOUT_PAGES).map(page => page.path)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map(path => `  <url><loc>${SITE_URL + path}</loc></url>`).join('\n')}\n</urlset>\n`;
}
