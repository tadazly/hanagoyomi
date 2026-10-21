[English](README.md) · [简体中文](README.zh-CN.md)

<div align="center">

<img src="public/favicon.svg" width="64" height="64" alt="Hanagoyomi flower mark">

# 花暦 · Hanagoyomi

**Give this moment to nature.**

A WebGL2 flower meadow and sky that follow local time and weather. Adjust the world, explore it, and save a view you like.

[**Try it live ↗**](https://hanagoyomi.luyilabs.com/) · [**Steam Workshop ↗**](https://steamcommunity.com/sharedfiles/filedetails/?id=3815915459)

[![MIT License](https://img.shields.io/badge/License-MIT-65745b?style=flat-square)](LICENSE)
[![Checks and build](https://github.com/tadazly/hanagoyomi/actions/workflows/ci.yml/badge.svg)](https://github.com/tadazly/hanagoyomi/actions/workflows/ci.yml)

</div>

<a href="https://hanagoyomi.luyilabs.com/"><img src="docs/images/hanagoyomi-gallery.jpg" alt="Hanagoyomi gallery and sunset cloud sea" width="100%"></a>

<table>
  <tr>
    <td width="50%"><img src="docs/images/hanagoyomi-day.jpg" alt="Daytime meadow" width="100%"></td>
    <td width="50%"><img src="docs/images/hanagoyomi-night.jpg" alt="Night sky" width="100%"></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/hanagoyomi-realistic-sky.jpg" alt="Realistic night sky" width="100%"><p align="center">Realistic night sky</p></td>
    <td width="50%"><img src="docs/images/hanagoyomi-milky-way-fireflies.jpg" alt="Milky Way and Fireflies" width="100%"><p align="center">Milky Way and Fireflies</p></td>
  </tr>
</table>

## Use

Choose a location, time, weather and quality in World settings. Enable automatic flight or manual controls to explore. The interface supports Simplified Chinese, Japanese and English. Settings stay in the current browser or wallpaper host.

The gallery includes 20 selected landscapes. Preview a scene, choose **Restore** to return, or **Apply to world** to keep it. Scene time, weather and cloud drift can be locked independently. **Save moment** keeps up to 100 local scenes, which you can share by link or QR code. Saving to your collection and applying a scene are separate actions; collections do not sync between devices.

| Action | Input |
| --- | --- |
| Steer | Move the mouse or swipe on a touchscreen |
| Dash / Turn around / Pause flight | Left double-click / Right double-click / Right triple-click |
| Move / Descend and ascend | WASD or arrow keys / Q and E |
| Fullscreen / Immersive mode / Show interface | F / H / Esc |

Scene inputs are inactive when manual controls are disabled. Full controls are available in World settings.

## Wallpaper Engine

Subscribe on [Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3815915459), or run `npm run build:wallpaper` and import `dist-wallpaper/index.html`.

The v1.4.3 Workshop update is pending. Use the [standalone release package](https://github.com/tadazly/hanagoyomi/releases/tag/v1.4.3) for the features below.

**Use built-in world settings** is enabled by default. Move to the desktop's bottom-right corner to open settings and the gallery. When this option is disabled, WE properties apply immediately and overwrite corresponding world settings on startup. **Import scene link** remains available in either mode: paste a link, return to the desktop to preview it, then choose whether to save or apply it.

Use [`?wallpaper=1`](https://hanagoyomi.luyilabs.com/?wallpaper=1) for the browser wallpaper layout or Mac Plash. Enable Plash's Browsing Mode to adjust settings. See the [wallpaper guide](docs/WALLPAPER_ENGINE.md).

## Run locally

Requires Node.js 22.12+ and a browser with WebGL2 and floating-point render targets. No backend or API key is needed.

```bash
git clone https://github.com/tadazly/hanagoyomi.git
cd hanagoyomi
npm ci
npm run dev
```

Open `http://127.0.0.1:5173/`. `npm run build` creates the static site in `dist/`; `npm run preview` previews that build.

Development checks: `npm test`, `npm run build`, `npm run check:seo`, `npm run build:wallpaper`.

## Data and license

The landscape is procedural and does not recreate the selected location's terrain. Live weather uses [Open-Meteo](https://open-meteo.com/) and requires a connection; dynamic weather is used when it is unavailable. Choosing **Use my location** asks for permission to send your coordinates to the weather provider. Settings and collections stay on the device.

Inspired by thatgamecompany's *Flower*, with no affiliation to the game or its team. Code is licensed under [MIT](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md) for star data, weather services and other dependencies.

[Technical reference](docs/TECHNICAL.md) · [Design notes](docs/DESIGN.md) · [Contributing](CONTRIBUTING.md)
