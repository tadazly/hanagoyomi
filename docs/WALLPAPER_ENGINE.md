# Wallpaper Engine 版本

## 构建与导入

```powershell
npm ci
npm test
npm run build:wallpaper
```

将 `dist-wallpaper/index.html` 导入 Wallpaper Engine 编辑器；只导入这个独立目录。壁纸包含经典脚本、样式、城市和星表，不需要 Node.js、本地服务器或 CDN。`npm run build` 仍生成原网站到 `dist/`，不会包含壁纸默认行为。

`wallpaper/project.js` 定义分类及原生属性，默认标题与描述采用英文，避免编辑器更新覆盖 Steam 的默认英文版本。`wallpaper/workshop-copy.js` 保存已审核的中文、日文、英文工坊文案，三语标题均包含 `Flower Meadow`。`wallpaper/preview.gif` 为创意工坊动态预览，随独立构建一起打包。

`dist-wallpaper/workshop-title.txt` 和 `workshop-description.txt` 为默认英文文案；带有 `.english`、`.schinese`、`.japanese` 后缀的对应文件和 `workshop-localizations.json` 提供三套独立文案。在 Steam 工坊的“编辑标题与描述”中按语言分别保存，不能只在同一份描述中拼接三语。中文描述额外包含 B 站演示：https://www.bilibili.com/video/BV1mopT6oExv/；三语均保留 YouTube 演示：https://www.youtube.com/watch?v=oxYg9Qka6ak。

## 默认体验与设置

- 高画质，保留体积云、4× MSAA、景深、Bloom 和镜头雨滴。不自动降低用户选定的画质。
- 关闭手动场景交互，开启自动飞行；两项独立运行。
- LOGO 默认右上，时间天气默认中下；两者都可选择九宫格位置或隐藏。
- 底部组件、工具栏和沉浸模式返回按钮保留任务栏安全留白。
- 初次启动收起世界设置。工具栏位于右下角，鼠标移入后显示，移出 4 秒隐藏；设置面板、时间面板或帮助打开时保持显示。
- 原生设置提供城市、天气模式、时刻、画质、渲染比例、组件位置、语言和常用效果；完整面板保留其他细节设置。启动时原生属性优先；需要跨重启保存的常用选项建议通过 Wallpaper Engine 修改。
- 原生城市下拉包含所有内置城市，无需在桌面输入搜索文字或使用浏览器定位。自动地点按系统时区选择代表城市，并非精确定位。
- 网站与壁纸使用独立的本地偏好，互不覆盖。
- 壁纸内语言切换使用按钮组，避开 CEF 离屏渲染显示原生下拉框时的崩溃；网站继续使用下拉框。

## 性能与恢复

早期注册 `wallpaperPropertyListener`，在应用就绪前缓存属性。帧率遵循 `applyGeneralProperties.fps`；没有宿主时预览默认 30 FPS。分辨率默认按屏幕渲染，主场景最多约 829 万像素，超出时等比降低；原生渲染比例允许进一步降低至 50%。云缓冲仍保留原有像素上限。

暂停时停止动画调度。恢复时重置帧计时、云历史与性能采样，真实时钟重新跟随系统时间，过期天气刷新；模拟时间不会因暂停而突然快进。WebGL context 恢复后重载并重建资源，同一页面会话限制两分钟内重复自动重载。

画面可离线运行。真实天气与空气质量依赖 Open-Meteo；壁纸保留最近三小时内的天气缓存并明确标记，缓存不可用时回退动态天气，来源按实际状态显示。第三方署名与许可随构建提供。壁纸本身没有音频。

## 验收要求

测试和构建不能替代宿主验收。发布前在真实 Wallpaper Engine 中验证：首次启动默认值、画质与帧率设置、暂停恢复、原生属性、4 秒工具栏、组件位置保存、昼夜与雨雪、断网回退，以及超宽屏布局。提交后核对 Workshop 页面、动态预览、中英简介、演示视频和公开状态。

后续更新同一条 Workshop 作品时，更新原编辑器项目的构建资源，保留其 `project.json` 中的 `workshopid`，并从原项目提交更新。独立构建不携带作品 ID，便于首次导入，不能直接覆盖原项目的发布身份。

更新原编辑器项目时，其默认标题与描述也应保持英文；中日文通过工坊网站的语言字段维护。更新后逐页核对 `english`、`schinese`、`japanese` 文案，并检查未提供翻译的语言是否回退英文。分类 Genre 在官方编辑器中为单选，本项目保留 Nature。

已发布作品：[花暦 Hanagoyomi](https://steamcommunity.com/sharedfiles/filedetails/?id=3815915459)，作品 ID 为 `3815915459`，分类为 Nature，自适应分辨率，公开可见。

发布或更新后，Steam 可能暂时将作品标记为“不兼容”。[官方说明](https://help.wallpaperengine.io/en/interface/exclude.html)将其归为反垃圾检查，通常数小时内自动解除；无需重复上传或修改壁纸来绕过检查。
