# 无我音乐 1.2.0 HiFi 更新验证

2026-11-07，Windows 10 Pro x64 19045。作者 LHL。交付仍为 `release/win-unpacked`，不生成安装器或便携单文件。

## 实现与使用

底栏数字表示音源参数：文件／流头中的采样率、位深，以及压缩文件的平均码率，不能把 FLAC 的压缩码率理解为 PCM 输出码率。FLAC 直接读取 STREAMINFO，在线播放仅探测有界的头部数据；读取失败显示已有真实参数或未知，不填写固定 44100Hz。实测《晴天》1643kbps／44100Hz／24bit、《江南》941kbps／44100Hz／16bit。

设置中的“音频输出”提供标准模式与 HiFi（WASAPI 独占），设备列表来自真实 Windows 音频端点。HiFi 通过随包独立 mpv 进程播放，禁用用户配置／脚本、ReplayGain 和音频滤镜，不强制提高采样率；固定 1×、软件音量 100%，请使用设备调音量。实际建立 WASAPI 输出并核实源／输出采样率及声道后才显示 HiFi 标记；输出位深不得低于已知源位深。鼠标悬停底栏音频信息可查看实际输出参数。

在线 HiFi 音频经仅绑定 127.0.0.1、随机令牌保护的流代理访问，由 Electron 网络栈处理请求，支持 Range；离线设置会拒绝新网络请求并停止在线 HiFi。已导入本地文件仍可播放。设备忙碌、不支持格式或连接失效会提示原因，不静默回退共享播放；用户可自行切换标准模式。

外部拖入 File 经 preload 的 `webUtils.getPathForFile` 获取路径，主进程限制为绝对路径、音频扩展名及有效音轨，最多 500 个文件。播放本地文件，保留本地 ID，在线关联只补资料。内嵌歌词、同名 LRC、内嵌／旁置封面优先。匹配检查完整歌名、歌手、时长和专辑；文件名中的编号也必须通过这些检查。Live、DJ、翻唱及歧义条目不直接混用。未找到可靠匹配时继续本地播放。

## 自动化与真实接口

| 检查 | 结果 |
| --- | --- |
| TypeScript、前端、主进程构建与 x64 目录打包 | 通过 |
| 自动化回归 | 57/57 通过，`evidence/tests-hifi-120.txt` |
| 搜索重试、空数据与错误区分、粘贴空白清理 | 自动化通过；真实搜索《晴天 周杰伦》《牵丝戏》及全角空白关键词返回正常 |
| 真实本地无标签文件匹配、真实音源参数、歌词与封面、Electron 网络 → 原生 HiFi | 5/5 通过，`evidence/hifi-electron-120.json` |
| 原生 HiFi 播放／暂停／定位／恢复 | 通过，`evidence/hifi-native-120.json`，WASAPI 虚拟设备实际 44100Hz／16bit／双声道 |
| 拖入安全边界、版本歧义、文件名编号校验、已有歌词优先、受限流代理与离线拦截 | 自动化通过 |

真实桌面使用与交付 EXE、app.asar 字节相同的 C 盘副本和独立资料目录，由 cua-driver 操作。使用无障碍和禁用后台节流参数帮助获取稳定的界面树，程序本身没有为测试修改音频逻辑。

- 搜索列表与底栏音源参数已在真实打包窗口核验，HiFi 选项、真实输出设备及实际 HiFi 标记已确认，见 `evidence/hifi-settings-120.png`。
- 文件选择器已通过与拖放相同的 File → preload → IPC 处理链路导入文件。测试窗口中实际导入并播放本地《江南》，自动关联歌曲 93157，歌词、封面、MV 入口和热门评论同时显示，见 `evidence/hifi-local-association-120.png`。跨窗口拖放手势未由自动化单独重放，不把该手势记为自动化通过。
- 《别怕我伤心》的两个相同专辑目录条目在无编号时无法可靠区分；补充并实测文件名编号 222066894 校验逻辑。
- 本次没有重新逐项验收此前 MV／下载／主题所有组合，既有自动化回归保留。此前结果见 `ACCEPTANCE-1.2.md`。

## 兼容、备份与范围

修改前备份位于 `D:\3DS_MAX\20261107_music\backups\wuwo-before-hifi-20261107-144855`，包含完整旧运行目录与源码。正式资料更新前另存备份，保留原下载路径、任务、收藏和歌单，并将用户在测试窗口实际导入的本地曲目合并回原资料；不覆盖原设置。测试素材不合并。

没有外接 DAC 可供测量，本次验证设备是 VB-Audio 虚拟 WASAPI 端点。没有做模拟输出／数字回环的位完美测量；不声称 ASIO、DSD 或所有硬件格式均兼容。Windows 11 未单独实测。独占模式可能使其他应用暂时无法使用该输出设备，设备驱动仍需支持源格式。

原生引擎与源码／版权说明保存在运行目录 `resources/hifi`，见 `NOTICE.txt`。参考 [mpv WASAPI／独占选项](https://mpv.io/manual/master/#options-audio-exclusive)、[Microsoft 设备格式说明](https://learn.microsoft.com/en-us/windows/win32/coreaudio/device-formats) 和 [Electron File 路径接口](https://www.electronjs.org/docs/latest/api/web-utils)。

运行目录 `SHA256SUMS.txt` 包含本次最终文件校验；本轮交付汇总见 `evidence/hifi-delivery-120.json`。
