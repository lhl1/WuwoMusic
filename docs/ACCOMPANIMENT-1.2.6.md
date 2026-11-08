# 1.2.6：声伴重新实现的依据和复现

## 问题出在哪里

1.2.5 的“伴奏”把左右声道相减。它只能减弱放在声场中央的声音，人声和中央的乐器会一起消失；单声道左右完全相同，相减后几乎没有声音。“人声聚焦”也只是调整声场，并没有分出歌手的声音。本版移除了这条处理链。

## 本机 QQ 音乐研究

对用户指定的 QQ 音乐安装目录作了只读检查，未修改、注入或调用 QQ 的登录、付费服务。可以复查的依据见 [检查结果](evidence/qq126-inspection.json)。

- `QQMediaPlayer.dll` 从 `qmcpcom.dll` 引入 `vocal_accomp_mix_create_inst`、`processf_in/out`、`set_vocal_weight`、`set_accomp_weight` 等函数，速度、音高还有独立处理接口。
- 安装目录包含 OpenVINO 推理组件、`TNET_HOST.exe`、`Split.xml` 和 `Split.bin`。
- `Split.xml` 是 6,635 层的 IR v11 图，输入含 `[2,2,47,1025]` 频谱数据、两组循环状态及频带归一化系数，输出包含处理后的频谱和更新后的状态。
- 核心模块的初始化日志字符串还包含 `vocal_accomp_split`、AI 库路径、模型路径和采样率参数。

这些证据支持：该安装版本具备 AI 声伴分离和独立声伴混合能力。不是单纯用左右声道相减就能实现。静态检查不能证明 QQ 在每一首歌、每个设置下都选择同一个模型，也不能据此还原其全部训练方法。本轮 QQ 的后台窗口截图未完整显示内容，因此没有把其界面操作或主观听感比较写成已验证项目。

复查命令（只需要本机原安装目录；不需要登录）：

```powershell
python -m pip install pefile
python scripts/inspect-qq-accompaniment126.py 'D:\Program Files (x86)\Tencent\QQMusic'
```

无我音乐没有打包 QQ 的 DLL、私有模型或界面资源，也不要求用户安装 QQ。

## 本版如何工作

采用 Deezer **Spleeter 两轨模型**，经 sherpa-onnx 的 ONNX 转换在本机 CPU 上运行，输出立体声人声与伴奏。模型和运行时随免安装目录提供；无需 Python、CUDA、外部服务或账户，歌曲不会上传。Spleeter 作者在 [论文第 3 页](https://joss.theoj.org/papers/10.21105/joss.02154.pdf) 明确说明代码和预训练模型均以 MIT 许可发布；转换及运行方法见 [sherpa-onnx 官方说明](https://k2-fsa.github.io/sherpa/onnx/source-separation/models.html)。

处理流程：

1. 主进程只接受当前播放器已经获得的受限音源令牌。使用同一首、同一音质的文件，不另外搜索可能不匹配的伴奏版本。
2. 在线音源通过应用自己的网络层完整获取，沿用直连／系统代理选项和音源刷新逻辑；本地歌曲直接读取。准备时继续播放原声。
3. 用随应用提供的 mpv 解码成 44.1kHz、16bit、双声道临时 WAV，两个模型分别输出人声和伴奏。
4. 把原声 L/R、人声 L/R、伴奏 L/R 交错写进一份六声道 WAV。六个声道共用一个 HTML 音频元素和时间轴，不能各自跑偏。
5. Web Audio 把这三对声道重新路由到立体声。滑块中央播放原声，左边逐渐换成人声，右边逐渐换成伴奏。增益连续过渡；文件切换采用短暂淡出、保持进度、再淡入。
6. SoundTouch 在混合后处理音高；保留 0.5–2× 速度、±12 半音、原声／伴奏／人声预设、开关及恢复。切换到 HiFi 后全部旁路，使用原始音频文件。

切歌或关闭音效会取消过期任务和工作进程；返回结果前再核验请求身份。准备期间暂停，完成后保持暂停。失败显示原因和重试入口，保留原声，不悄悄退回声道抵消算法。

缓存位于启动时音乐下载目录的 `.wuwo-cache/stems`，约 32MB/分钟，完成缓存上限 2GiB，优先清理旧条目并保留当前音轨。原下载文件不改动。缓存按歌曲、音质、模型版本区分；本地文件还比较大小与修改时间，损坏的完成文件会重新生成。改变下载目录后，重启应用使用新的声伴缓存位置；旧缓存不搬移。

源文件上限 512MiB，单曲声伴支持 15 分钟以内；有总超时、解码时长与磁盘空间检查。AI 是估计分离，混响、和声、现场录音可能残留或产生伪影。处理音频为 44.1kHz / 16bit，不能称为原始 HiRes 或完全无损；恢复原声会重新使用原文件，下载仍保存原文件。

## 代码入口

| 文件 | 作用 |
|---|---|
| `electron/separation.ts` | 工作进程、解码、AI 推理、六声道合成、取消、缓存与校验 |
| `electron/main.ts` | 音源令牌验证、统一网络下载和限定 IPC |
| `src/use-separation.ts` | 请求竞争、准备状态、保持暂停及位置、平滑换源 |
| `src/vocal-effects.ts` | 六声道选取、声伴混合、速度与音高 |
| `src/components/EffectsPopover.tsx` | 预设、开关、三条滑块、准备状态和重试 |
| `build/separation/NOTICE.txt` | 模型、运行时来源与第三方许可 |

## 如何复现

仓库包含运行组件和模型。按主 README 安装 Node.js 后：

```powershell
npm ci
node scripts/verify-separation-assets.mjs
npm test
npm run package:dir
```

`build/separation/SHA256.json` 锁定各个文件，构建前会自动核对。复原第三方包时，从 [sherpa-onnx v2.0.1](https://github.com/k2-fsa/sherpa-onnx/releases/tag/v2.0.1) 获取 `win-x64-shared-MD-Release-no-tts`，从其 `source-separation-models` 发布获取 `sherpa-onnx-spleeter-2stems-fp16.tar.bz2`；只提取 NOTICE 中列出的 EXE、DLL 与两个 ONNX，并核对哈希。VC++ 运行库为微软签名的 x64 app-local 文件，其许可独立于开源组件。

测自己的歌曲（不上传）：

```powershell
npx tsx scripts/verify-separation126.ts 'D:\Music\自己的歌曲.flac'
```

报告及六声道测试缓存保存在 `artifacts/separation126`。报告记录耗时、长度、各轨能量和阶段；没有独立原始人声／伴奏参考轨时，不能把这些数值解释为分离准确率。

实际 Electron 音频引擎和请求竞争验证：

```powershell
node scripts/build-effects126-check.mjs
& node_modules/electron/dist/electron.exe artifacts/effects126.cjs
```

结果写入 `docs/evidence/effects126-electron.json`，包括独立声道、变速变调、拖动进度、暂停换源、过期请求和关闭开关的验证。它使用静音测试信号，不操作用户桌面。查看界面效果则启动 `win-unpacked/无我音乐.exe`，播放歌曲后点击底栏音效图标。

真实在线音源的完整获取与分离验证（会下载测试歌曲到本机测试缓存）：

```powershell
npx esbuild scripts/verify-online-separation126-electron.ts --bundle --platform=node --format=cjs --external:electron --outfile=artifacts/online126.cjs
& node_modules/electron/dist/electron.exe --user-data-dir="$PWD/artifacts/network126-profile" artifacts/online126.cjs
```

结果写入 `docs/evidence/separation126-online.json`。接口可用性和耗时可能随网络变化，报告不记录临时音频地址。
