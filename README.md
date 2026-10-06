# 云与草原 · Clouds and Meadow

一个单文件的 WebGL2 实时场景：体积云、天空与星空、随风起伏的草原，以及一条引路的花瓣流。灵感来自 thatgamecompany 的《Flower》。

打开 `index.html` 即可运行，不依赖任何构建工具或外部脚本（只从 Google Fonts 加载 Barlow 字体）。需要支持 WebGL2 的浏览器，手机和电脑都可以。

## 功能

- **体积云**：Perlin-Worley 噪声 + 光线步进，Beer 定律、双瓣 Henyey-Greenstein 相函数、多重散射近似、云内环境光遮蔽，半分辨率渲染加时间累积（TAA）。
- **天空与天文**：物理大气散射查找表；按所选城市和时刻计算的太阳、月亮（含月相）与五大行星位置；约 5000 颗真实恒星和星座连线。
- **草原**：几何草叶多级 LOD + 中景草层 + 远景地形统一着色；风浪、花朵、漂浮花瓣、萤火虫。
- **花瓣流**：类似《Flower》的引路花瓣，掠过时花苞绽放、夜间点亮花朵并照亮周围的草，可选“无限距离记忆”。
- **天气系统**：16 种天气（晴朗到暴雪），支持跟随当地天气、动态切换、手动切换和关闭。包括高度雾、雨丝、积水倒影与涟漪、积雪、闪电、镜头雨滴（粒子模拟：滑落、融合、拖尾）。
- **画面**：景深、泛光、按时段的调色、夜间按亮度区分的去饱和。
- **设置持久化**：面板设置保存在浏览器本地，下次打开自动恢复。

## 操作

| 平台 | 操作 |
|---|---|
| 电脑 | 拖动画面转向，WASD / 方向键移动，Q / E 升降，按住 Shift 加速，滚轮调视野，空格冲刺 |
| 手机 | 单指滑动像飞行摇杆一样操控花瓣流，单指双击冲刺，两指双击掉头，三指双击停下或继续 |

右侧（手机为底部）的“天空与草原”面板可以调地点、时间流速、天气、草原、镜头和画质。

## 跟随当地天气

“跟随天气”模式通过 [Open-Meteo](https://open-meteo.com/) 获取实时天气。在本地直接打开文件或部署到 GitHub Pages 等普通网页环境时可以正常使用；在禁止访问外部网站的沙箱环境中会自动改为“动态切换”。

## 参考

- S. Hillaire, *Physically Based Sky, Atmosphere and Cloud Rendering in Frostbite*, SIGGRAPH 2016 course
- A. Schneider, *The Real-Time Volumetric Cloudscapes of Horizon: Zero Dawn* (SIGGRAPH 2015) 与 Nubis 系列分享
- K. Boulanger 等, *Rendering Grass in Real Time with Dynamic Lighting*, 2009
- Ghost of Tsushima 程序化草地的 GDC 分享
- N. Tatarchuk, *Artist-Directable Real-Time Rain Rendering in City Environments*, 2006
- S. Lagarde, *Water drop* 系列（雨天湿润表面与积水）, 2012
- F. J. Ballesteros, *New insights into black bodies*, 2012（B-V 色指数到温度）
- E. M. Standish, *Keplerian Elements for Approximate Positions of the Major Planets*（JPL）

第三方数据与服务的署名和许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
