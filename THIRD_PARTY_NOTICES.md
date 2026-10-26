# 第三方声明

Hanagoyomi 项目代码使用 MIT License。以下数据、服务和算法参考的许可独立于项目许可。

## 写实体积云 — blackrack / Environmental Visual Enhancements

写实云参考 **RaymarchedVolumetricsEarlyAccess03_01_26**（03/01/26）版本，包括 `Scatterer-EVE/RaymarchCloud` V5、`EVE/CloudNoiseGen`、云型 Hermite 高度曲线、三角网格去平铺、光程积分及多重散射近似。

`src/data/eve-cloud-types.js` 保留云型配置，`src/data/eve-cloud-noise.js` 是由噪声着色器生成并归一化的 128³ R8 数据。`src/rendering/realistic-clouds.js` 将相关算法适配到 WebGL2。它们涉及的第三方部分保留原权利声明，不适用本仓库的 MIT License。原包 `License.txt` 的体积云声明为：

```
This preview build of the volumetric clouds is All rights reserved
```

相关资源还包括 coverage/type 天气图（三档 `src/assets/eve-weather-*.webp`）及其统计数据。

## 星表与星座连线 — d3-celestial

内嵌星表（可视星等 ≤ 6，源于 Yale Bright Star Catalogue / Hipparcos）、星座连线、88 个现代星座的名称与分组从 Olaf Frohn 的 [d3-celestial](https://github.com/ofrohn/d3-celestial) 转换而来，保留以下 BSD 许可：

```
Copyright (c) 2015, Olaf Frohn
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## 写实弱星星表 — ESA Hipparcos / NASA HEASARC

写实夜空使用 [ESA 1997 Hipparcos Main Catalogue（I/239）](https://heasarc.gsfc.nasa.gov/W3Browse/catalog/hipparcos.html) 的真实测量，数据由 NASA HEASARC TAP 提供。筛选 Johnson V ≤ 7.3，排除 8 条缺失可靠坐标的记录，保留 21,107 颗恒星；其中 8,870 颗 V ≤ 6.5，另外 12,237 颗弱星只在静止观察的有限短曝光模拟中逐渐显现。默认风格继续使用上方的 d3-celestial 星表。

位置按实测自行从 J1991.25 推进到 J2000.0，与项目天球坐标保持一致；颜色采用实测 B-V 的近似显示，缺测时回退中性白。恒星相对能量遵循 Pogson 关系 `F ∝ 10^(-0.4 V)`；整体显示曝光、PSF 和观测过渡属于 SDR 渲染适配，不作为绝对测光校准。约 6.5 等的肉眼基准参考 [NOAA 的星等说明](https://www.noaa.gov/stories/see-more-than-stars-spotting-noaa-satellites-in-sky)。参考照片包含长曝光和拼接，不将其全部星点当成肉眼可见目标。

二进制资源为 `src/assets/hipparcos-v7.3.bin`；精确查询、来源 SHA-256、记录数量、坐标历元和参考亮星记录见 `src/data/hipparcos-catalog.json`。用 `node scripts/prepare-hipparcos.mjs <原始 VOTable.xml>` 可重新生成。引用：ESA, 1997, *The Hipparcos and Tycho Catalogues*, ESA SP-1200；Perryman et al., 1997, A&A 323, L49。

## 天气数据 — Open-Meteo

“跟随天气”模式从 [Open-Meteo](https://open-meteo.com/) 获取当前天气。数据由 Open-Meteo.com 提供，遵循 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)，界面保留来源链接。免费 API 面向非商业用途；商业使用需依据其服务条款选择适当接口。天气数据会映射为场景参数，云形、降水、积水和积雪为艺术化表达。

## 空气质量数据 — Open-Meteo / CAMS

当前空气质量由 [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api) 提供，底层模型数据来自 [Copernicus Atmosphere Monitoring Service（CAMS）](https://atmosphere.copernicus.eu/)。界面保留 Open-Meteo 与 CAMS 署名。显示的指数为美国 AQI（`us_aqi`），分级采用对应美国标准，不代表中国 AQI；模型数据并非当地监测站实测。数据使用遵循服务的署名及许可要求，见 [API 数据声明](https://open-meteo.com/en/docs/air-quality-api#citation-acknowledgement)。

## 天文算法参考 — SunCalc

太阳与月亮的基础坐标计算参考 [SunCalc](https://github.com/mourner/suncalc) 的轻量公式及天文年历方法。SunCalc 使用 MIT License，Copyright (c) 2011–2015 Vladimir Agafonkin；[原始许可](https://github.com/mourner/suncalc/blob/master/LICENSE)。本项目保留来源署名。

## 银河全天照片 — ESO/S. Brunier

`src/assets/milky-way*.webp` 来自 [The Milky Way panorama，eso0932a](https://www.eso.org/public/images/eso0932a/)，署名 **ESO/S. Brunier**，使用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)，参见 [ESO 使用条款](https://www.eso.org/public/copyright/)。项目对原片作了亮点弱化、局部修补、降噪、分辨率调整和 WebP 转换。照片来自长曝光拼接，不作为精密星图或肉眼颜色标定。帮助界面可查看本文件。

## 月面颜色 — NASA LRO / CGI Moon Kit

`src/assets/moon-albedo.webp` 来自 [NASA CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/) 的 2025 年版本 `lroc_color_2k.jpg`，署名 **NASA's Scientific Visualization Studio**。资料基于 Lunar Reconnaissance Orbiter 的 LROC WAC 色彩拼图（Arizona State University）和 LOLA 数据，由 Ernie Wright 整理。项目缩小为 1024×512 WebP、移除元数据，并在渲染中转换到线性颜色。参见 [NASA 媒体使用政策](https://www.nasa.gov/nasa-brand-center/images-and-media/)；不包含 NASA 标志使用权或机构背书。该纹理本身已为视觉展示优化，不用于科学测量。

## 场景链接无损压缩 — fflate

v2 场景分享链接使用 [fflate 0.8.3](https://github.com/101arrowz/fflate)，仅通过命名导入的 `deflateSync` 与 `inflateSync` 进行同步无损压缩和解压。以下保留分发包 `fflate/LICENSE` 原文：

```
MIT License

Copyright (c) 2026 Arjun Barrett

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 场景分享二维码 — qrcode / dijkstrajs

场景分享二维码使用 [qrcode 1.5.4](https://github.com/soldair/node-qrcode)，其浏览器运行时依赖 [dijkstrajs 1.0.3](https://github.com/tcort/dijkstrajs)。网站与独立壁纸包均保留以下分发包中的许可声明。

### qrcode 1.5.4

以下保留 `qrcode/LICENSE` 原文：

```
The MIT License (MIT)

Copyright (c) 2012 Ryan Day

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

### dijkstrajs 1.0.3

以下保留 `dijkstrajs/LICENSE.md` 原文：

```
Dijkstra path-finding functions. Adapted from the Dijkstar Python project.

Copyright (C) 2008
  Wyatt Baldwin <self@wyattbaldwin.com>
  All rights reserved

Licensed under the MIT license.

  http://www.opensource.org/licenses/mit-license.php

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## 字体与图标

当前版本使用设备已有的系统字体，不分发 Barlow 或从 Google Fonts 加载字体。五瓣花标志和其余界面图标为项目内 SVG，随项目 MIT License 分发；GitHub 和 Steam 品牌标识仍属于其权利人。

Steam 图标采用 [Tabler Icons 的 brand-steam](https://github.com/tabler/tabler-icons/blob/main/icons/outline/brand-steam.svg)，沿用项目工具栏的线宽与颜色。该图标使用以下 MIT License（[原始许可](https://github.com/tabler/tabler-icons/blob/main/LICENSE)），此声明随网站与壁纸构建分发：

```
MIT License

Copyright (c) 2020-2026 Paweł Kuna

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 参考资料与设计图

视觉灵感来自 thatgamecompany 的《Flower》，与该游戏及其团队无关联。

图形学论文、技术文章和 JPL 资料仅作为参考链接，未作为论文资产打包。`docs/images/design-concept.png` 是生成的界面设计概念；README 里的产品截图来自实际浏览器运行。
