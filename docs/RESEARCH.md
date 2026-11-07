# 12.2.2.5-东 APK 分析与接口验证

验证日期：2026-11-07。以下是本机真实分析和文件核验结果，不是仅凭接口字段推断。

## 样本

- 文件：`酷我音乐 12.2.2.5-东.apk`
- 大小：226,575,872 字节
- SHA-256：`818a3057c8a8cdfbafb43e804e10bea25a2449e8ed3a8bf6924c352ef8dc8c19`
- 模拟器中已有安装包与提供的 APK 哈希一致。
- 使用 jadx 1.5.6 分析；约 51,018 类，193 处反编译错误。下载入口可追踪，但改版核心为加密原生代码。

## 调用链与改版差异

1. `cn.kuwo.base.utils.s2.r9` 根据歌曲、音质和操作类型构造参数；下载使用 `mode=download`，播放使用 `mode=audition`。
2. 参数包含 `convert_url_with_sign`、`rid`、`br`、`format`、`source` 等。`s2.v` 选择 anymatch / nmobi 主机。
3. `s2.java:6976` 把 URL 交给新增的 `kwpass.KpkUtilX.kpk`，而非只依赖官方 `KpkUtil`。
4. `KpkUtilX` 来自 `classes15.dex`，通过 `njggg.Loader.registerNativesForClass(38, ...)` 注册；Loader 加载 `libkijhhh.so`。
5. `libkijhhh.so` 外层加载器解密、映射另一层 ARM64 原生载荷。仅扫描原始 SO 或 JADX Java 不会看到真实实现。

为研究原生模块建立了独立、可调试的 `local.kuwo.probe` 测试 APK，只安装该辅助应用，未重签名、覆盖原音乐 APK，未启用 root。通过辅助应用自身可读的 `/proc/self/mem` 获取其运行时解密内容。

外层 JNI_OnLoad 相对地址 `0x44620` 调用解密加载器；内层 JNI_OnLoad 相对地址 `0x29424`，KpkUtilX.kpk 注册实现相对地址 `0x14a198`。以下偏移是本次内层转储中的相对位置，不是原始 APK 文件偏移：

| 内层偏移 | 解密字符串 |
| --- | --- |
| `0x1dd0ab` | `14505b09374869d9` |
| `0x1dd260` | `AES/ECB/PKCS5Padding` |
| `0x1dd887` | `https://mobi.kuwo.cn/mobi.s?f=kwxs&q=` |
| `0x1dd979` | `source=kwradio_ar_6.0.0.9_B_jiakong_vh.apk` |

依据这些运行时证据重建请求：使用指定来源参数，把查询串以 UTF-8 编码，再执行 AES-128-ECB、PKCS#7 填充（Java 的 PKCS5Padding 对 AES 等价）、Base64，置于 `q`。Node 实现在 `electron/provider.ts` 的 `modifiedRequest`。请求不包含登录凭据。

辅助环境中直接调用 KpkUtilX 返回空字符串；载荷还包含 APK 签名读取和上下文相关逻辑，但未完成对空值原因的归因。因此不声称已逐分支还原整个保护层。桌面端重建的请求已由线上服务响应和完整文件独立验证。

## 官方链路与改版链路不能混为一谈

官方分享接口为部分曲目返回带 `apply_type=preview` 的地址；常见 antiserver 查询甚至会返回相同的 11 秒拒绝录音，或其他歌曲编号。早期据此判定不能完整下载是不充分的。

改版链路返回指定 `rid`、实际 `format`、`bitrate`、完整 `duration` 和 CDN 地址。桌面端验证曲目编号、主机、响应时长及请求音质。下载结束后通过 `music-metadata` 读取实际文件，验证完整时长、容器和码率，再生成最终文件；不会把拒绝录音、试听或伪无损文件作为成功下载。

## 实际文件结果

| 曲目 / RID | 标准 MP3 | 高品 MP3 | 无损 FLAC |
| --- | --- | --- | --- |
| 晴天 / 228908 | 269.793 秒；128,000 bps；4,317,292 字节 | 269.793 秒；320,000 bps；10,792,943 字节 | 269.747 秒；55,397,039 字节 |
| 江南 / 93157 | 267.990 秒；128,000 bps；4,288,455 字节 | 267.990 秒；320,000 bps；10,720,847 字节 | 267.947 秒；31,386,542 字节 |
| 无奈的思绪 / 651621673 | 156.761 秒；128,000 bps；2,508,819 字节 | 156.761 秒；320,000 bps；6,271,380 字节 | 156.735 秒；18,131,534 字节 |

额外负例：苏夏依 `172567327` 的标准文件为 75.781 秒、128 kbps；请求 320k 仍返回同一个 128k 文件，请求 FLAC 则返回约 96k 的 Ogg。客户端明确报告高音质不可用，不把它们标为 HQ/SQ。

`scripts/probe-modified.ts` 保存矩阵探测的原始响应、文件元数据和 SHA-256。`scripts/verify-api.ts` 则通过正式下载管理器完成并发下载和本地文件读取。精简 JSON 记录附在 `docs/evidence`，音频文件不随源码包分发。

这些结果证明代表曲目在本次测试中可免登录完整获取；有限样本不能证明整个曲库、每一种音质或未来接口永远可用。

## 页面数据接口

| 功能 | 实测接口 |
| --- | --- |
| 搜索 | `https://search.kuwo.cn/r.s`；`ft=music`、`mobi=1`、`vipver=1`、`pn`、`rn`、`all` 等 |
| 推荐歌单 | `https://wapi.kuwo.cn/api/pc/classify/playlist/getRcmPlayList` |
| 榜单列表 | `https://wapi.kuwo.cn/api/pc/bang/list`；展开嵌套 child |
| 榜单内容 | `https://kbangserver.kuwo.cn/ksong.s`；`type=bang&data=content` |
| 歌单详情 | `https://nplserver.kuwo.cn/pl.svc`；`op=getlistinfo`，需 `newver=1` 和相应 `vipver` |
| 歌词 | `https://m.kuwo.cn/newh5/singles/songinfoandlrc` |
| 网页歌词（1.1 首选） | `https://www.kuwo.cn/openapi/v1/www/lyric/getlyric` |
| 封面与补充元数据 | `https://mobi.kuwo.cn/mobi.s?f=web&type=get_music_for_share` |
| 改版音频解析 | `https://mobi.kuwo.cn/mobi.s?f=kwxs&q=...` |

实测搜索每页 30 首，推荐 12 个歌单、榜单列表 36 项；中文歌词存在实际 GB18030 内容与响应头不一致的情况，已添加解码回退。临时音频 URL 不持久保存；继续下载时重新解析并以 Range / ETag 校验恢复。

## 1.1 歌词与封面修复

在实际 Electron 网络栈中，手机歌词接口携带通用接口使用的 Referer 时曾返回业务状态 301、`data:null`；去掉 Referer 后当时返回 63 行，但重复验证发现相同查询仍会间歇返回 301，因此不能把 Referer 视为唯一原因。最终优先使用官方网页 `openapi/v1/www/lyric/getlyric`，手机接口作为备用，失败最多尝试三次。JSON 请求禁用浏览器 HTTP 缓存，应用只缓存有效结果，手动重新加载绕过成功缓存。没有通过随机参数来掩盖错误。

最终通过 Electron `net.fetch` 验证，228908／93157／6304356 分别返回 63／47／49 行；见 `evidence/electron-lyrics-final.json` 和 `scripts/verify-electron.ts`。有效歌词与封面另存于本机，用于离线播放。

搜索结果的图片字段可能是 `web_albumpic_short`／`web_artistpic_short`，如 `120/s3s94/93/211513640.jpg`，需要补齐图片主机与 albumcover／artist 路径。旧实现只读取 pic 等完整 URL，导致这类结果缺图。新实现补齐路径、缺图时查询歌曲元数据，并以受限的自定义协议缓存图片；没有关闭 TLS 证书校验。

用户提供的官方 Windows `9.6.0.0_W1` 用作操作参考：检查了其播放页、歌词设置及静态界面资源中的封面模式、歌词字号／时间调整、本地歌词和倍速功能。本项目继续使用独立 Electron 实现及现有黄白设计，没有把官方 EXE、DLL 或 Web 资源打入安装包。
