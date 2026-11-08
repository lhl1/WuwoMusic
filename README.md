# 无我音乐 · WuwoMusic

版本：1.2.0 ｜Windows x64 桌面音乐客户端**

无我音乐可以搜索、听歌、下载、查看歌词和评论，也支持本地音乐、MV 和 HiFi 输出。无需登录，无需安卓模拟器；界面保留黄色强调色，支持浅色、深色和跟随系统主题。

项目参考交互与请求行为，使用 Electron、React、TypeScript 重新实现桌面客户端。它直接运行桌面代码，不在后台运行 APK。仓库不包含原 APK 或歌曲文件。

> 在线功能依赖第三方服务。已验证代表歌曲和场景，但不能保证整个曲库、所有音质或未来接口一直可用。程序会区分试听、无资源、音质不可用和网络失败。

最新改进：播放页支持动画收起并恢复原浏览位置；推荐页加入 APK 的编辑精选与每日推荐。数据依据及限制见 [验收记录](docs/ACCEPTANCE-NATIVE-HOME.md)。

## 普通用户如何使用

### 启动与升级

成品采用 **`win-unpacked` 免安装文件夹**。拿到构建包后，解压并双击 **`无我音乐.exe`** 即可，不需要 Node.js、Java 或开发工具。

**移动或分享时必须保留整个文件夹**，不能只复制 EXE，旁边的运行库和 `resources` 都是程序的一部分。GitHub 的 **Code → Download ZIP 下载的是源码**，需要按下面的步骤构建；仓库不提交成品运行目录。

升级时关闭旧程序，换用新版文件夹启动。资料仍保存在 `%APPDATA%\KuwoMusicDesktop`，收藏、任务、历史和设置会继续保留。旧目录名是为兼容升级而保留的，不要删除它来升级。

### 搜索、播放与评论

1. 顶部输入歌曲或歌手，选联想词，或按 Enter 搜索。支持综合、单曲、歌单、歌手、专辑和歌词搜索。
2. 播放结果中的歌曲。底栏可切歌、拖动进度、调音量、选择倍速、音质、播放顺序及队列。
3. 点击封面或歌词入口进入播放页，默认展示唱片封面与同步歌词；封面悬停可以放大查看。
4. 评论默认隐藏，点击评论按钮后在左侧阅读热门／最新评论。自动滚动由单独按钮控制。
5. 自动滚动开启后会展开全文，向下加载新评论，当前分类全部加载完才循环。悬停、键盘焦点进入、暂停播放、离开页面或隐藏窗口时暂停滚动。

### 下载歌曲和 MV

- 歌曲菜单或下载按钮可创建任务；列表支持多选批量下载。
- 优先无损 FLAC，没有可用无损时尝试 320K，再尝试 128K。以实际返回文件为准，搜索结果的音质标签不代表该规格必然可用。
- 下载管理可以看进度和速度、暂停、继续、取消及重试；默认并发 3 个任务，设置中可调整。
- 新用户保存到系统 **音乐／无我音乐**，旧用户沿用原目录。设置中可修改保存位置，已有文件不搬移。
- 默认同时保存歌词和封面，重复文件不直接覆盖，文件名自动处理 Windows 非法字符。
- 歌名旁有 **MV** 标记时，可在应用内观看，支持暂停、进度、音量和全屏。MV 可下载为 MP4，保存在音乐下载文件夹，也可离线播放。

### 本地音乐、HiFi 与网络

把音频从资源管理器拖入窗口，即可导入并播放。支持 MP3、AAC、FLAC、WAV、M4A、OGG。优先读取内嵌及旁置歌词、封面，再尝试匹配线上资料；不能可靠区分版本时，不强行绑定其他歌曲的评论或歌词。

点击底栏扬声器图标可以静音，再次点击恢复，原音量值保持不变；拖动普通模式音量滑块会取消静音。静音也同步到 MV 和 HiFi 引擎。

播放器右下方的 **HiFi** 或设置中的“音频输出”，可切换标准播放与 **WASAPI 独占**，并选择设备。HiFi 固定 1× 倍速、软件音量 100%，请用设备调音量。设备不支持源文件参数时会显示原因。底栏显示实际音源码率、采样率及位深；音源无损不等于最终硬件输出一定“位完美”。

**默认直连，不使用系统网络代理。** 在 **设置 → 网络 → 网络代理** 可选择“跟随系统代理”，保存后即时应用；不会修改 Windows 代理设置。切换可能短暂中断已有连接。离线模式会阻止应用联网，仍可播放已下载和导入的音乐。

## 主要功能

| 类别 | 已实现 |
| --- | --- |
| 发现音乐 | 推荐、分类歌单、排行榜、支持的榜单历史期数、歌手和专辑详情 |
| 搜索 | 多类型搜索、输入联想、空白推荐、静默推荐词 |
| 播放 | 顺序／随机／单曲循环、队列、进度、倍速、音量、失败恢复 |
| 歌词与评论 | 同步歌词、字号和时间调整、热门／最新、连续加载与自动滚动 |
| 下载 | 实际可用音质、批量、并发、暂停继续、重启恢复、歌词和封面 |
| MV | 内嵌播放、基础控制、下载及离线播放 |
| 本机资料 | 收藏、本地歌单、历史、拖入导入、资料匹配与缓存 |
| 外观 | 浅色／深色／跟随系统、独立文字大小和界面缩放、自绘控件 |
| 音频输出 | 标准模式、WASAPI 独占、设备选择、真实音源参数 |

不包含登录、云同步、直播、短视频、社区发布、评论点赞及会员购买。

## 从源码复现

### 1. 准备环境与安装依赖

建议使用 **Windows 10/11 x64、Node.js 24、npm 11、Git**。已实测 Windows 10，Windows 11 未做整机验收。

```powershell
git clone https://github.com/lhl1/WuwoMusic.git
cd WuwoMusic
node --version
npm --version
npm ci
```

`npm ci` 根据 `package-lock.json` 安装锁定依赖。首次需要联网下载 Electron，打包也可能下载工具。应用默认直连与 npm 安装时的网络配置是两回事。

若依赖脚本策略导致 Electron 未下载完整，可运行：

```powershell
node node_modules/electron/install.js
```

仓库包含 `build/hifi` 中独立的 mpv 程序、来源说明及对应源码归档。构建当前桌面应用不需要原 APK、jadx、模拟器、登录账号或个人密钥。

### 2. 启动开发版

```powershell
npm run dev
```

这条命令先检查类型、构建，再启动 Electron。目前不是热更新服务器，修改后重新运行即可。开发版也会使用应用资料，验证前建议备份；需要隔离资料时可使用：

```powershell
npm run build
npx electron . --user-data-dir="$env:TEMP/WuwoMusic-dev-profile"
```

### 3. 测试并打包

```powershell
npm test
npm run package:dir
```

输出为 **`release/win-unpacked/无我音乐.exe`**。复制整个 `win-unpacked` 即可在兼容的 Windows x64 电脑运行。

本机已有 Electron 时，可以避免打包工具重复下载运行时：

```powershell
npm run build
npx electron-builder --win dir --x64 --config.electronDist=node_modules/electron/dist
```

这里的“复现”指用相同源码、锁定依赖和步骤构建相同功能，不承诺不同机器生成的 EXE 逐字节一致。`scripts/finalize-*-delivery.mjs` 等交付脚本依赖本机历史备份和 QA 目录，普通构建无需执行。

## 它是如何实现的

### 界面与系统工作分开

可以把程序理解为“前台界面”和“后台管家”。React 负责页面、控件、歌词和播放器；Electron 主进程负责联网、文件、下载、缓存及窗口。界面通过 `preload` 暴露的限定 IPC 接口调用后台，而不是随意读取电脑文件。

启用沙箱、上下文隔离，关闭界面的 Node.js 集成，并验证 IPC 来源、文件路径和图片来源。评论按普通文本渲染，不执行返回的 HTML。见 [main.ts](electron/main.ts)、[preload.ts](electron/preload.ts)。

### 把不同接口整理成统一资料

服务对歌名、编号、图片字段的叫法各不相同。[provider.ts](electron/provider.ts) 将原始响应整理成 [shared.ts](src/shared.ts) 定义的 `Track` 等类型，界面只使用统一格式。

搜索、推荐、榜单、歌单、歌词与评论分别使用相应链路，联想和榜单期数有独立适配。解码处理 UTF-8／GB18030 差异，图片短路径补成完整地址。详细接口表见 [研究记录](docs/RESEARCH.md)。

### 研究 APK，重建所需请求

前期用 jadx 追踪搜索、播放和下载调用，发现改版地址解析还进入原生模块。研究记录保存了运行时载荷和参数证据，再由 Node.js 重建请求：按原链路将参数编码、加密、组合，交给服务器解析临时音频地址。

实现集中在 [provider.ts](electron/provider.ts) 的 `modifiedRequest` 等方法。样本哈希、调用链、分析局限和实际验证见 [RESEARCH.md](docs/RESEARCH.md)。仓库提供桌面实现与记录，不能仅凭源码重新生成当时的原生转储；重新进行原始逆向研究需要同哈希 APK 与对应分析环境。

### 播放时再取地址，避免无限加载

“搜到歌”不代表某种音质一定能播放。点击播放时才重新解析，按无损、320K、128K 尝试，并检查响应。临时地址不当作永久资料保存。

标准播放使用浏览器音频能力，远端音频经受控媒体代理传递，支持进度与取消。解析、连接、首段数据、启动播放都有期限；中断后尝试重新取地址并恢复进度。切歌或取消后，旧请求不能覆盖新歌曲。见 [media-proxy.ts](electron/media-proxy.ts)、[playback-control.ts](src/playback-control.ts)、[App.tsx](src/App.tsx)。

HiFi 使用独立 mpv 进程，通过本机 JSON IPC 控制 WASAPI 独占；在线音频由受控本机音频桥提供，外网访问仍遵循统一网络设置。实际建立独占输出后才显示对应状态。见 [hifi.ts](electron/hifi.ts)、[audio-bridge.ts](electron/audio-bridge.ts)。

### 下载先写临时文件，验证后才完成

[downloads.ts](electron/downloads.ts) 保存任务队列，先写临时文件。服务器支持 Range 时从已有位置继续，不支持或资源改变时重新下载；恢复任务重新解析地址。

完成后用 `music-metadata` 检查实际格式、时长、码率，再移入最终位置。请求 FLAC 却返回低规格文件、试听片段，不能记作完整无损下载。任务持久保存，程序重启后仍能继续管理。

### 歌词、封面与本地匹配

[metadata.ts](electron/metadata.ts) 处理歌词与缓存；[artwork.ts](electron/artwork.ts) 验证图片来源、合并重复请求并缓存图片。歌词首选链路失败时尝试备用接口，不把失败结果作为有效内容长期保存。

本地文件先读取自己的标签、内嵌封面、旁置歌词，再按歌名、歌手、时长、专辑等资料匹配线上歌曲。现场版、翻唱版难以区分时保留本地资料，避免错误关联。见 [local-music.ts](electron/local-music.ts)。

### 评论连续阅读

[comments.ts](electron/comments.ts) 统一热门和最新评论格式，按歌曲、排序、页码缓存 5 分钟，合并重复请求；业务报错不会伪装成“没有评论”。

切歌后清除旧评论并忽略迟到响应。自动阅读展开全文、连续翻页，当前分类没有新内容才循环。状态逻辑见 [comment-feed.ts](src/comment-feed.ts)、[comment-state.ts](src/comment-state.ts)、[Comments.tsx](src/components/Comments.tsx)。

### 统一网络策略

[network-policy.ts](electron/network-policy.ts) 在窗口与业务请求启动前设置 Electron Session：默认 `direct`，用户选择后改为 `system`。播放、下载、搜索、歌词、封面及评论共用此策略。

切换先等待配置生效，再关闭旧连接池，避免继续复用旧代理连接；连续切换按顺序处理，失败尝试回退，不保存未生效的设置。只调整应用会话，不修改系统代理。

## 测试与验证

### 本地自动化测试

```powershell
npm test
```

最近一轮 **83 项通过**，覆盖字段解析、音质、下载恢复、断线、过期地址、评论分页与状态、播放恢复、代理切换等。使用本地服务和测试样本，不需要下载线上歌曲。

### 在线验证（按需）

```powershell
npm run verify:api
```

会联网下载代表歌曲到 `artifacts/downloaded`，验证文件元数据，消耗流量与磁盘。这不是构建或启动的必需步骤，结果取决于当时服务状态。

真实 Electron 网络检查：

```powershell
npx esbuild scripts/verify-network-electron.ts --bundle --platform=node --format=cjs --external:electron --outfile=artifacts/verify-network.cjs
npx electron artifacts/verify-network.cjs --user-data-dir="$env:TEMP/WuwoMusic-network-check" --disable-gpu
```

最近一轮 **6 项通过**：直连绕过测试代理、跟随系统策略、切回直连，以及真实搜索、音频信息和评论。不会修改系统代理；系统模式与参考会话对比，不代表测试了所有代理软件。

验收资料：[网络设置](docs/ACCEPTANCE-NETWORK-1.2.md)、[评论界面](docs/ACCEPTANCE-COMMENTS-1.2.md)、[播放加载](docs/ACCEPTANCE-PLAYBACK-1.2.md)、[初版](docs/ACCEPTANCE.md)、[更新记录](docs/CHANGELOG.md)。记录里的路径和时间属于当次验证，不是构建所需目录。

HiFi 已在本机虚拟 WASAPI 设备验证；**外接 DAC、ASIO、Windows 11 未实测，不承诺硬件位完美输出**。第三方接口变化后应重新核验。

## 源码导航

| 路径 | 职责 |
| --- | --- |
| `src/App.tsx`、`src/components/` | 页面、播放器、歌词、评论、自绘菜单与设置 |
| `src/shared.ts`、`src/*.css` | 数据类型、主题、排版和响应式外观 |
| `electron/main.ts`、`preload.ts` | 桌面入口与限定 IPC |
| `electron/provider.ts` | 搜索、音频解析、歌词与资料适配 |
| `electron/discovery.ts`、`native-catalog.ts` | 推荐、联想、分类和榜单 |
| `electron/downloads.ts` | 下载队列与恢复校验 |
| `electron/hifi.ts`、`audio-bridge.ts` | HiFi 与本机音频桥 |
| `electron/network-policy.ts` | 直连／系统代理及切换同步 |
| `electron/storage.ts` | 设置、收藏、历史与任务 |
| `electron/comments.ts`、`metadata.ts`、`artwork.ts` | 评论、歌词、图片及缓存 |
| `tests/`、`scripts/` | 测试、构建、在线验证与历史交付工具 |
| `build/hifi/` | 独立 mpv、来源、许可、对应源码归档 |
| `docs/` | 研究、更新与验收记录 |

## 常见问题

**下载源码后为什么没有 EXE？** 源码需要安装依赖并打包。成品则是完整 `win-unpacked`，二者用途不同。

**加载失败或搜不到歌怎么办？** 检查离线模式与网络；默认直连，依赖代理的网络需手动选择“跟随系统代理”。可取消并重试或换音质。接口失效不能靠重装解决；反馈时请附歌曲名、时间、音质、输出模式及错误提示。

**为什么缺少无损、歌词、MV 或评论？** 服务资源不一致，标签与实际返回也可能不同。程序以真实响应为准，不能获取的内容不会伪造。本地歌曲可靠匹配不到时也不强行关联。

**HiFi 没声音怎么办？** 确认设备可用、没有被占用并选择正确输出；设备需支持源文件参数，也可切回标准模式。HiFi 不会提高原本低质量音源的质量，请用设备调音量。

**如何备份？** 关闭程序后复制 `%APPDATA%\KuwoMusicDesktop` 及实际下载目录。程序文件夹、资料目录、下载目录是三个位置；升级不用删除资料。

## 第三方组件与范围

使用 Electron、React、lucide 图标及 `music-metadata` 等组件，各依赖保留各自许可。

HiFi 使用未经修改、单独运行的 mpv。其来源、版本、构建方法和 GPL 许可见 [NOTICE](build/hifi/NOTICE.txt)、[LICENSE.GPL](build/hifi/LICENSE.GPL)；对应源码归档是 `build/hifi/mpv-source-55d3feb45.zip`，通过文档化 IPC 与桌面程序协作。

本项目为独立客户端，与音乐服务提供方无隶属关系。歌曲、封面、歌词和评论的权利归各自权利人，请在拥有相应权限和符合服务规则的范围内使用。仓库不附带歌曲、个人配置、登录资料和原 APK。
