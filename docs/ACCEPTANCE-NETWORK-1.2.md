# 无我音乐 1.2.0 网络代理设置

2026-11-07，作者 LHL。最新运行目录：`release/无我音乐-1.2.0-网络设置/win-unpacked`。

## 行为

设置 → 网络 → 网络代理提供“直连（不使用代理）／跟随系统代理”。默认直连；旧配置没有此字段时也直连，用户后续明确选择系统代理后持久保留。仅设置本应用网络，不修改 Windows 代理配置。

应用在创建窗口和发起业务请求前，明确设置默认 Electron Session 的代理模式。主进程通过统一的 `NetworkPolicy.fetch` 处理搜索、推荐、歌单、榜单、歌词、评论、封面／头像、音源解析、参数探测、播放、MV 和下载。HiFi 的外网请求同样由音频桥转交该入口，原生引擎只读取本机音频桥或本地文件。

设置使用限定 IPC，只接受 `direct` 和 `system`。代理切换串行执行，等待模式设置和旧连接池关闭，再保存配置；新业务请求等待切换完成。取消的请求不会在等待结束后继续联网。切换失败会尝试恢复原模式，配置不保存为失败的新值；无法恢复时阻止后续业务请求并显示错误。切换可能短暂打断现有播放或下载，已有断流与下载恢复逻辑继续有效，失败仍可重试。

代理模式和连接池处理依据 [Electron ProxyConfig](https://www.electronjs.org/docs/latest/api/structures/proxy-config) 以及 [Session.setProxy / closeAllConnections](https://www.electronjs.org/docs/latest/api/session#sessetproxyconfig)。这里的直连指不采用应用层代理；不会改变 VPN、TUN 或系统路由。

## 验证

- `npm run build` 通过，`npm test` **78/78** 通过。新增 5 项测试覆盖默认值／参数拒绝、旧资料与选择持久化、并发切换与连接池、更改期间取消请求、失败回滚与后续恢复。包含原有播放、下载和评论回归。日志：`evidence/tests-network-120.txt`。
- 真实 Electron 网络检查 **6/6** 通过，见 `evidence/network-electron-120.json`。使用隔离 Session 和本机代理／源服务器验证：检测到继承的测试代理路由；默认直连后请求命中源服务器而不再命中代理；系统模式的解析结果与独立系统模式参考 Session 相同；切回直连恢复 DIRECT；直连下真实《晴天》搜索、FLAC 音源参数读取及《牵丝戏》热门评论成功。
- 代理测试只修改隔离 Electron Session，没有修改 Windows 系统代理。由于本机系统可能选择直连，系统模式检查证明正确采用系统策略；不把它描述为已验证所有第三方代理服务。
- cua-driver 在真实打包程序中检查旧配置首次显示直连、展开统一选择菜单、切换系统代理并保存、切回直连并保存。截图：`evidence/network-system-120.png`、`evidence/network-direct-120.png`。
- GUI 使用字节相同的 C 盘运行副本，延续此前 D 盘自动化启动限制；交付目录逐文件核对 GUI 副本并生成 SHA-256 清单。Windows 10 x64 实测，Windows 11 未单独实测。

## 交付与备份

仅交付完整 `win-unpacked`，保留之前的评论优化和播放修复。旧版本不覆盖，源码在当前工程中；不生成安装器或源码 ZIP。

修改前源码、评论优化版运行目录与正式配置备份路径见 `evidence/network-delivery-120.json`。本轮不写入正式资料，也不复制 QA 的代理、主题或音量设置到正式配置。下载路径、任务、收藏、歌单、本地音乐与历史沿用原资料目录 `%APPDATA%\KuwoMusicDesktop`。
