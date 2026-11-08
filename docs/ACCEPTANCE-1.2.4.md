# 无我音乐 1.2.4 验证记录

日期：2026-11-08。作者：LHL。交付为 Windows x64 `win-unpacked` 完整目录。

## 本次实现

- 对照本机 QQ 音乐与网易云音乐的实际画面整理交互，保留黄色基调、主题切换、左侧封面及音频参数小框。底栏改为圆角整体面板，移除播放倍速，音量位于中央播放控制旁，右侧集中音质、HiFi、音效、桌面歌词和队列。
- 网易云、QQ、酷我评论免登录阅读；默认按此顺序尝试，设置可改变优先平台。只匹配歌名、完整歌手集合、版本、时长、专辑能对应的记录，不为周杰伦等歌曲硬填旧网易云 ID。空来源跳过，全部确实为空时不展示空模块，错误仍可重试。
- 歌词页加入唱臂，当前歌词强调、相邻歌词淡化，支持“歌词／歌曲信息／同歌手”切换。信息只显示实际返回的资料，不用百科占位；同歌手通过实际歌手编号查询，可点击播放。原歌词导入、字号、时间偏移、点击定位、评论阅读与收起动画继续保留。
- 独立桌面歌词窗：当前／下一行、置顶、拖动、字号、透明度、位置锁定、上一首／播放暂停／下一首、关闭。位置锁定保留按钮操作，**本轮没有鼠标穿透**。位置和外观保存到原资料目录的 `desktop-lyrics.json`。
- 伴奏／伴唱使用真实 Web Audio 立体声矩阵：人声减弱取左右差值，人声聚焦减少两侧成分。**不宣称 AI 分离、独立人声音轨或对每首歌都有效**，中央乐器也可能被减弱。HiFi 独占保持原音，下载仍是原文件。
- 队列增加搜索、定位当前、上下重排、移除、喜欢、下载、存为自建歌单，`queue.json` 保存列表，重启恢复队列但不自动播放。已有收藏、历史、歌单与下载目录继续有效。

## 实测结果

### 自动化与网络

`npm test`：**108 项通过**；`npm run build` 通过，Windows x64 dir 打包成功。新测试覆盖跨平台同名／翻唱／现场／时长／专辑歧义，回退顺序、异常、空来源、请求合并、分页、过期响应、音效矩阵、浮窗参数验证、旧配置默认值与头像来源限制；保留既有播放下载测试。

真实 Electron 45.2.3 Session，网络设为直连，验证记录见 [desktop124-electron.json](evidence/desktop124-electron.json)：

| 曲目 | 自动选择 | 验证 |
| --- | --- | --- |
| 王菲《如愿》 | 网易云音乐 | 热门、最新各 20 条；最新第二页有新内容，头像有实际图片字节 |
| 周杰伦《晴天》 | QQ 音乐 | 网易云未找到可可靠匹配的原版，QQ 热门和最新有正文，最新第二页不同，头像可读取 |
| 周杰伦《晴天》，酷我优先 | 酷我音乐 | 热门返回 20 条 |

王菲《如愿》的当前酷我编号没有评论时，即使设为酷我优先，也会继续回退到网易云；设置表示优先顺序。数量属于测试时刻，不能作为长期固定结果。

QQ 热评接口在不同 `pagenum` 下重复返回同一批约 20 条，本版将这批作为完整可读热评集合；**没有把服务器大总数伪装成已支持翻页**。QQ 最新和网易云热门／最新继续正常分页；分页重复保护避免无限加载同一批。

离线模式下，即使已有内存缓存也拒绝发起评论请求。业务错误保持错误，未当作无评论。

### 音效有效性

真实 Electron 的隔离、从不显示的音频测试窗，生成两声道相同的 440Hz 测试音，输出端在播放前置零，避免发出声音。处理图测得：原／聚焦 RMS 约 0.346，人声减弱后为 0，恢复原声约 0.346。见 [vocal124-electron.json](evidence/vocal124-electron.json)。

测试先发现未设置 CORS 时，媒体处理节点所有模式都输出 0。已修正 `<audio crossOrigin="anonymous">`、自定义媒体协议 CORS 能力及本地／在线响应许可；保留随机令牌与受控文件访问。这个检查验证的是实际 PCM 链路，不仅是按钮切换。测试音结果不能代表每首实际歌曲的人声处理质量。

### 桌面界面

使用 cua-driver 检查隔离资料下的打包 EXE：

- 深色 100%、浅色 150%：播放器、歌词阅读区、歌曲信息页、评论与右侧控件可用；底栏原音频参数保持小框样式，HiFi 按钮没有黄色选中背景和下拉箭头。
- 播放《如愿》FLAC，底栏显示实际 1527kbps／48000Hz／24bit，播放进度持续前进；切换人声减弱，再切回原声，未出现连接失败。该轮为静音检查，音频处理有效性由上面的 PCM 检查提供证据。
- 网易云评论在左侧显示，来源可辨识；评论默认隐藏，手动打开，空白模块不常驻。浮窗当前／下一行随播放更新，调整字号和位置锁定、通过浮窗暂停生效。
- 队列显示 30 首，成功存为“1.2.4 队列验证”自建歌单，关闭后从新包启动，队列 30 首和歌单仍在。
- 最终包使用相同隔离资料启动并完成在线播放、歌词、音效切换及桌面歌词检查，确认独立启动不需要开发服务器。
- 最终包在隔离资料中开启离线模式，播放本地已下载《稻香》，准备耗时 11ms，播放进度继续前进；验证本地媒体响应与新增 CORS 设置兼容。

GUI 截图、打包和测试日志留在本机 `artifacts`。未将远程桌面坐标不稳定的精确最小窗口尺寸、拖动手势、所有键盘操作或所有系统 DPI 组合记为通过。Windows 10 10.0.19045 实测；Windows 11、实体 DAC、ASIO 本轮未实测。HiFi 仍遵循原有独占能力和设备支持状态。

## 复现

```powershell
npm ci
npm test
npm run build
npx electron-builder --win dir --x64 --config.electronDist=node_modules/electron/dist
```

成品在 `release/win-unpacked`，双击 `无我音乐.exe`。必须复制整个目录，不能只拿 EXE。

真实评论与头像检查：

```powershell
New-Item -ItemType Directory -Force artifacts | Out-Null
npx esbuild scripts/verify-desktop124-electron.ts --bundle --platform=node --format=cjs --external:electron --outfile=artifacts/verify-desktop124.cjs
& node_modules/electron/dist/electron.exe artifacts/verify-desktop124.cjs --user-data-dir="$env:TEMP/Wuwo-api124-check"
```

无声测试音检查：

```powershell
npx esbuild scripts/verify-vocal-renderer.ts --bundle --platform=browser --format=iife --outfile=artifacts/vocal124-renderer.js
npx esbuild scripts/verify-vocal-electron.ts --bundle --platform=node --format=cjs --external:electron --outfile=artifacts/vocal124-main.cjs
& node_modules/electron/dist/electron.exe artifacts/vocal124-main.cjs --user-data-dir="$env:TEMP/Wuwo-vocal124-check"
```

记录分别输出到 `docs/evidence/desktop124-electron.json` 和 `vocal124-electron.json`。加 `--baseline` 可复现旧 CORS 配置导致处理图静音，旧配置结果写到 `artifacts/vocal124-baseline.json`。

实际客户端无需本机安装 QQ 或网易云，也不读取这两款客户端的登录资料。它们仅作为本轮交互参考；联网评论取自公开接口。源码中没有歌曲文件、个人资料或登录 Cookie。

## 备份与交付核验

修改前备份 1.2.3 源码、原 `win-unpacked` 和正式用户资料。QA 使用独立临时资料，正式 `state.json` 以 SHA-256 与备份逐字节对比。最终目录的文件清单和哈希见该目录 `SHA256SUMS.txt`；构建包身份、正式资料对比和 QA 包一致性记录见 [delivery-1.2.4.json](evidence/delivery-1.2.4.json)。
