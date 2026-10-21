[简体中文](README.zh-CN.md) · [English](README.md)

<div align="center">

<img src="public/favicon.svg" width="64" height="64" alt="花暦标志">

# 花暦 · Hanagoyomi

**把此刻，交给自然。**

一个用 WebGL2 生成的花海与天空。随当地时间和天气变化，也可以自由调整、漫游和保存风景。

[**在线体验 ↗**](https://hanagoyomi.luyilabs.com/) · [**Steam 创意工坊 ↗**](https://steamcommunity.com/sharedfiles/filedetails/?id=3815915459)

[![MIT License](https://img.shields.io/badge/License-MIT-65745b?style=flat-square)](LICENSE)
[![检查与构建](https://github.com/tadazly/hanagoyomi/actions/workflows/ci.yml/badge.svg)](https://github.com/tadazly/hanagoyomi/actions/workflows/ci.yml)

</div>

<a href="https://hanagoyomi.luyilabs.com/"><img src="docs/images/hanagoyomi-gallery-zh-CN.jpg" alt="花暦画廊与晚霞云海" width="100%"></a>

<table>
  <tr>
    <td width="50%"><img src="docs/images/hanagoyomi-day-zh-CN.jpg" alt="白昼花海" width="100%"></td>
    <td width="50%"><img src="docs/images/hanagoyomi-night-zh-CN.jpg" alt="夜间星空" width="100%"></td>
  </tr>
</table>

## 使用

在世界设置中选择地点、时间、天气和画质，也可开启自动飞行或手动操纵。界面支持简体中文、日语和英语，设置保存在当前浏览器或壁纸宿主中。

画廊包含 18 幅精选风景。点击作品可以预览，选择“还原”返回原世界，“应用到世界”保留当前风景；时刻、天气和云移动可分别锁定。“收藏此刻”可保存最多 100 个本机收藏，并通过链接或二维码分享。收藏与应用是独立操作，数据不会跨设备同步。

| 操作 | 输入 |
| --- | --- |
| 操纵飞行方向 | 移动鼠标或触屏滑动 |
| 冲刺 / 掉头 / 暂停飞行 | 左键双击 / 右键双击 / 右键三击 |
| 移动 / 升降 | WASD 或方向键 / Q、E |
| 全屏 / 沉浸 / 返回界面 | F / H / Esc |

手动操纵关闭时，上述场景输入不生效。完整操作说明可在世界设置中查看。

## Wallpaper Engine

可从 [Steam 创意工坊](https://steamcommunity.com/sharedfiles/filedetails/?id=3815915459)订阅。源码构建使用 `npm run build:wallpaper`，将 `dist-wallpaper/index.html` 导入 Wallpaper Engine。

默认勾选“使用世界设置”，在桌面右下角打开壁纸内设置和画廊。取消勾选后，WE 原生选项会立即生效，并在启动时覆盖对应的世界设置。原生“导入场景链接”在两种模式下都可用；粘贴后返回桌面预览，再决定是否收藏或应用。

浏览器壁纸布局和 Mac Plash 使用 [`?wallpaper=1`](https://hanagoyomi.luyilabs.com/?wallpaper=1)。Plash 中需开启 Browsing Mode 才能操作设置。详见[壁纸说明](docs/WALLPAPER_ENGINE.md)。

## 本地运行

需要 Node.js 22.12+，以及支持 WebGL2 和浮点渲染目标的浏览器。无需后端或 API Key。

```bash
git clone https://github.com/tadazly/hanagoyomi.git
cd hanagoyomi
npm ci
npm run dev
```

打开 `http://127.0.0.1:5173/`。`npm run build` 输出静态网站到 `dist/`，`npm run preview` 预览构建结果。

开发检查：`npm test`、`npm run build`、`npm run check:seo`、`npm run build:wallpaper`。

## 数据与许可

场景由程序生成，不复刻所选地点的地形。实时天气由 [Open-Meteo](https://open-meteo.com/) 提供，需要联网；无法获取时回退动态天气。点击“使用我的位置”并授权后，经纬度会用于查询天气。设置与收藏保存在本机。

灵感来自 thatgamecompany 的《Flower》，与该游戏及其团队无关联。代码采用 [MIT License](LICENSE)，星表、天气服务和其他第三方内容的许可见[第三方声明](THIRD_PARTY_NOTICES.md)。

[技术参考](docs/TECHNICAL.md) · [设计说明](docs/DESIGN.md) · [贡献指南](CONTRIBUTING.md)
