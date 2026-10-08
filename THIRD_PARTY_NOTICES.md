# 第三方声明

Hanagoyomi 项目代码使用 MIT License。以下数据、服务和算法参考的许可独立于项目许可。

## 星表与星座连线 — d3-celestial

内嵌星表（可视星等 ≤ 6，源于 Yale Bright Star Catalogue / Hipparcos）与星座连线从 Olaf Frohn 的 [d3-celestial](https://github.com/ofrohn/d3-celestial) 转换而来，保留以下 BSD 许可：

```
Copyright (c) 2015, Olaf Frohn
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## 天气数据 — Open-Meteo

“跟随天气”模式从 [Open-Meteo](https://open-meteo.com/) 获取当前天气。数据由 Open-Meteo.com 提供，遵循 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)，界面保留来源链接。免费 API 面向非商业用途；商业使用需依据其服务条款选择适当接口。天气数据会映射为场景参数，云形、降水、积水和积雪为艺术化表达。

## 空气质量数据 — Open-Meteo / CAMS

当前空气质量由 [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api) 提供，底层模型数据来自 [Copernicus Atmosphere Monitoring Service（CAMS）](https://atmosphere.copernicus.eu/)。界面保留 Open-Meteo 与 CAMS 署名。显示的指数为美国 AQI（`us_aqi`），分级采用对应美国标准，不代表中国 AQI；模型数据并非当地监测站实测。数据使用遵循服务的署名及许可要求，见 [API 数据声明](https://open-meteo.com/en/docs/air-quality-api#citation-acknowledgement)。

## 天文算法参考 — SunCalc

太阳与月亮的基础坐标计算参考 [SunCalc](https://github.com/mourner/suncalc) 的轻量公式及天文年历方法。SunCalc 使用 MIT License，Copyright (c) 2011–2015 Vladimir Agafonkin；[原始许可](https://github.com/mourner/suncalc/blob/master/LICENSE)。本项目保留来源署名。

## 字体与图标

当前版本使用设备已有的系统字体，不分发 Barlow 或从 Google Fonts 加载字体。五瓣花标志和界面图标为项目内 SVG，随项目 MIT License 分发；GitHub 品牌标识仍属于其权利人。

## 参考资料与设计图

图形学论文、技术文章和 JPL 资料仅作为参考链接，未作为论文资产打包。`docs/images/design-concept.png` 是生成的界面设计概念；README 里的产品截图来自实际浏览器运行。
