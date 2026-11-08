# 无我音乐 1.2.5 验证记录

日期：2026-11-08。作者：LHL。环境：Windows 10 x64 10.0.19045、Electron 45.2.3。

## 本次改动

- 底部播放器恢复连续平面，不再使用悬浮圆角外框。喜欢按钮放在歌名旁，保留封面、歌手和实际音频参数。设置放到侧栏“最近播放”下方。
- 桌面歌词默认完全透明，在显示器工作区底部中央出现。支持单双行、字体、字号、对齐、配色、加粗、描边、行内渐进高亮、时间微调、搜索、位置锁定和鼠标穿透。穿透后提供托盘恢复及专用快捷键；重新打开时解除穿透。
- 保留原声、伴奏、伴唱三个预设，新增连续声伴比例、0.5–2× 变速和 ±12 半音变调。变调在 AudioWorklet 音频线程中处理，速度与音高分别控制；HiFi 绕过处理并恢复原音参数。
- 评论栏显示网易云、QQ、酷我各自的可用状态，支持手动选择。异常时自动尝试其他平台；中途切源从第一页开始，清除旧来源正文。手动选择空平台时显示该平台的真实空状态。
- 修复字面的 `\n`、字符实体、常见中文表情、QQ 原生表情代码和受支持来源的评论图片。所有正文按文本处理，图片通过来源、大小和格式检查。
- 底栏评论按钮直接进入歌词评论页，使用快速启动、缓慢收尾的非线性动画；收起恢复原浏览页。遵守系统减少动态效果偏好。

这些功能是本项目的独立实现，参考 QQ 音乐的交互，不表示已复制其所有专有能力。桌面歌词没有服务端逐字时间时，按每行时间估算高亮；伴奏是立体声矩阵处理，并非 AI 分离音轨。

## 自动化和真实网络

`npm test`：117 项通过，0 项失败；类型检查、Vite 和 Electron 主进程构建通过，Windows x64 dir 打包成功。

新增测试覆盖评论转义、图片来源、QQ 表情、三个平台状态、手动选择、异常回退、切源页码恢复、桌面歌词配置迁移与位置边界、连续音效矩阵，以及新配置首次保存速度和音高。保留原有播放和下载测试。

[真实网络记录](evidence/desktop125-electron.json) 使用 Electron Session 直连验证：

| 歌曲 | 自动选择 | 结果 |
| --- | --- | --- |
| 王菲《如愿》 | 网易云 | 热门／最新各 20 条，最新第二页不同；网易云和 QQ 可用，酷我为空 |
| 周杰伦《晴天》 | QQ | 网易云未可靠匹配，QQ 与酷我可用；最新第二页有新内容 |

同时读取网易云、微信头像和两个实际 QQ 表情 PNG，取得有效图片字节。离线模式拒绝评论请求。数量只代表测试当时。平台错误、失败后的切换和请求竞争另外通过可重复的模拟接口测试覆盖，未声称对线上服务制造故障。

QQ 公开热门接口重复返回一批约 20 条，因此热门读完循环；不会拿大总数假装支持无限分页。未知表情保留可读原文，不访问任意图片域名；尚未覆盖所有平台的图片附件结构。

## 音效的实际 PCM 检查

[音效记录](evidence/effects125-electron.json) 使用真实 Electron 音频线程、严格内容安全策略及生成的双声道 440Hz 测试音。测试窗口不显示，输出预先静音。

| 状态 | 测得频率 | RMS |
| --- | --- | --- |
| 原声 | 441.43Hz | 0.3454 |
| 两声道相同、人声减弱 | — | 0 |
| +12 半音、1.25× | 877.48Hz | 0.3408 |
| -12 半音、0.75× | 220.72Hz | 0.3454 |
| 恢复原声 | 441.43Hz | 0.3453 |

这验证真实处理链路，不仅检查滑块数值；FFT 分辨率会带来频率误差。结果不代表任意歌曲都能完美去除人声。许可、对应发行源码与 Source Map 放在成品 `resources/audio-effects`。

## 打包程序桌面检查

通过 cua-driver 操作隔离资料目录下的 1.2.5 打包程序，没有向正式资料目录写入测试配置。

- 深色 100%：连续底栏、歌名旁喜欢、侧栏设置、HiFi 中性无箭头样式；《如愿》FLAC 播放进度前进，显示实际 1527kbps／48000Hz／24bit。
- 从底栏进入评论，查看网易云、QQ 不同正文；平台状态栏紧凑，正文占据左侧可滚动区域。修复空状态小点继承全局 `.empty` 样式导致平台栏撑高的缺陷。
- 音效面板保留预设和三个滑块；调到 1.25×／+3 半音后，读取隔离配置确认实际保存，再恢复原声。
- 桌面歌词默认配置为透明度 0、双行、36px、底部中央。验证字号、单双行、位置锁定和鼠标穿透保存。重新打开解除穿透；最终包复查透明窗口的文字渲染。
- 浅色 150% 检查最终包启动和底栏；窄窗口及 100%／150% 评论布局另有编译后 CSS 回归检查。

[布局记录](evidence/layout125-electron.json) 载入实际构建的 CSS，覆盖宽度 1280、850 以及缩放 1／1.5；三个平台状态的小点约 4px，平台栏约 40px，正文空间超过 560px。它是离屏布局测试，不等同于完整 Windows DPI 与多显示器人工验收。

本轮未完成实体 DAC、Windows 11、所有显示器组合和所有 QQ 功能的验收。穿透恢复快捷键因自动化工具的前台限制未完成 GUI 验证；托盘恢复菜单代码已实现，但未在本轮逐项点击验收。下载及断网播放保留此前实现和测试，本轮不宣称重新跑完所有下载场景。

## 如何复现检查

先按 README 安装依赖。以下命令在仓库根目录运行，生成的文件只进入 `artifacts` 与验证记录目录；不读取正式用户资料。真实网络检查需要联网，接口变化时可能失败，失败记录会保留。

```powershell
npm test
npm run build
New-Item -ItemType Directory -Force artifacts | Out-Null
npx esbuild scripts/verify-desktop125-electron.ts --bundle --platform=node --format=cjs --external:electron --outfile=artifacts/verify-desktop125.cjs
Start-Process node_modules/electron/dist/electron.exe -ArgumentList 'artifacts/verify-desktop125.cjs' -WindowStyle Hidden -Wait
node scripts/build-effects125-check.mjs
Start-Process node_modules/electron/dist/electron.exe -ArgumentList 'artifacts/effects125.cjs' -WindowStyle Hidden -Wait
npx esbuild scripts/verify-layout125-electron.ts --bundle --platform=node --format=cjs --external:electron --outfile=artifacts/verify-layout125.cjs
Start-Process node_modules/electron/dist/electron.exe -ArgumentList 'artifacts/verify-layout125.cjs' -WindowStyle Hidden -Wait
```

打开三个 JSON 确认 `status: passed` 或 `passed: true`。需要同时检查进程退出码时，可给 `Start-Process` 加 `-PassThru`，保存返回对象并读取 `ExitCode`。图形验收应在隔离资料下重新运行最终 `win-unpacked`，检查评论切换、歌词、音效及返回。

## 交付与备份

本次仅交付完整 `win-unpacked` 目录及使用说明、SHA-256 文件清单，不另外生成安装包或源码 ZIP。源码和说明更新到 GitHub。交付版本、文件数量和包一致性见 [交付记录](evidence/delivery-1.2.5.json)。

修改前已备份 1.2.4 源码、运行目录及正式资料快照。正式资料仍使用 `%APPDATA%\KuwoMusicDesktop`；旧下载不搬移。测试使用单独资料目录，原程序运行期间其自身可能继续更新历史等资料，因此不声称正式资料与备份逐字节不变。
