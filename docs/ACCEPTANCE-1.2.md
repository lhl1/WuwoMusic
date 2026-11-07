# 无我音乐 1.2.0 验证记录

日期：2026-11-07。作者：LHL。本次交付仅为 `release/win-unpacked`，保留整个目录运行，无需开发环境。源码保留在当前工程目录。

## 备份与兼容

修改前备份：`D:\3DS_MAX\20261107_music\backups\wuwo-before-refine-20261107-132343`，包含旧运行目录与源码 ZIP。本轮没有覆盖旧版便携 EXE，也没有新生成便携包或源码压缩包。

正式用户资料 `%APPDATA%\KuwoMusicDesktop\state.json` 没有改写；前后 SHA-256 均为 `1E6BDA0F41F381450997E1854560F7DEBC3C06B052F1AB86A53EA4669AAEF133`。升级验证使用资料副本，原有 5 个已完成任务、4 个本地条目和历史仍在，旧下载路径保持有效。音质默认策略迁移为无损优先，其后保留明确的用户选择。

## 构建与自动化

| 检查 | 结果与证据 |
| --- | --- |
| TypeScript、Vite、Electron 构建和 x64 目录打包 | 通过 |
| 本地自动化测试 | 47 项通过，`evidence/tests-120-refined.txt`；包含下载恢复、格式校验、音质降级、旧配置、评论状态、MV 持久化和图片缓存异常 |
| 真实音频接口回归 | 10 项通过，`evidence/api-verification.json` |
| Electron 评论、分页、业务状态、头像 | 10 项通过，`evidence/comments-electron-120.json` |
| Electron 搜索、分类、歌手／专辑、排行榜、MV 地址 | 13 项通过，`evidence/discovery-electron-120.json` |
| Electron 音质降级 | 2 个真实文件通过，`evidence/fallback-electron-120.json`；无损不可用时分别得到实际 320／128 kbps MP3，未把试听标为完整歌曲 |
| Electron 封面与视频 | 5 项通过，`evidence/media-electron-120.json`；冷缓存 24/24 歌单、36/36 榜单封面，集合备用封面及 6 张离线缓存图片 |
| 真实 MV 文件 | 《晴天》MP4BD，122,676,711 字节，317.333 秒；H.264 1920×1080、AAC。验证器确认有视频轨道，损坏文件不会提交为完成 |

MV 与音频任务分别去重；视频音质切换会丢弃不兼容的临时片段。MV 使用相同下载并发、暂停、恢复、地址重新解析、重试和持久化机制，完成后留在设置的音乐下载目录，不混入音频库。

## 桌面检查

使用 cua-driver 操作真实打包程序。桌面环境为 Windows 10 Pro x64，版本 19045。由于桌面工具启动的进程不能访问工作盘部分路径，GUI 使用 C 盘内与交付包 EXE、app.asar 哈希完全一致的副本，以及独立测试资料目录；开发环境未参与程序启动。最终离线复测添加 Chromium 无障碍及禁用后台节流参数，以避免桌面工具取到空树或过期画面，不修改交付程序。

- 搜索、列表、歌手／专辑入口、推荐、分类歌单、排行榜、播放页、评论入口已检查。最终真实歌单／榜单图片分别见 `evidence/final-playlist-covers.png`、`evidence/final-rank-covers.png`。
- 浅色、深色、系统主题菜单、字号、150% 缩放及小窗口已检查，见 `120-settings-dark.png`、`120-settings-small-150.png`、`refined-small-150.png`。最终 MV 页面以浅色复测，未逐项重复所有主题和显示比例组合。
- 精简播放栏、歌词和热评布局，见 `evidence/refined-player.png`。热门／最新评论与第二页见对应 `120-comments-*.png`；轮播暂停、恢复、过期请求和关闭开关的边界另由自动化状态测试覆盖。
- 在线 MV 在主内容区出现真实画面，见 `evidence/final-integrated-mv.png`，原生视频控件提供暂停、进度、音量、全屏。
- 从界面下载真实 MV，完成任务保存为 `音乐\WuwoMusic-QA-120\周杰伦 - 晴天 [228908 MV MP4BD].mp4`（测试时设置的音乐目录），文件大小与真实接口验证一致。
- 关闭并重启程序，测试资料预设为离线模式，下载管理仍保留 MV；点击已下载任务后播放本地视频，画面正常，顶部同时显示“离线”和“本地 MV”，见 `evidence/final-mv-offline.png`。
- 同一离线会话从下载管理播放原有 FLAC，播放器进入暂停按钮状态，进度持续增加；最终进度读数见 `evidence/final-offline-audio-progress.json`。该项确认播放状态与进度，没有单独进行音箱听感验收。

系统主题实际切换事件、所有自绘菜单的逐项键盘操作、所有视频控制组合以及 Windows 11 尚未完成独立实机验收。已实现的行为不等于逐项人工验证；Windows 前台焦点限制曾影响 GUI 操作，记录未据工具返回成功就认定画面正确。在线接口可用性以验证时间和代表曲目为限。

## 交付校验

`release/win-unpacked/SHA256SUMS.txt` 提供运行目录文件校验。被桌面验证的副本与最终交付文件一致：

| 文件 | SHA-256 |
| --- | --- |
| 无我音乐.exe | `116BF947CBBC82001ACE243DC70C19981118697FE7C5EC1AAAE04D3F59D4EDBA` |
| resources/app.asar | `9B1A424041CC028917DDBDC185D1D5CD528E5F4921D6582D2E4D12CB01D86E33` |
