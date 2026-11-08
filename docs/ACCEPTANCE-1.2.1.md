# 无我音乐 1.2.1 · 推荐页与封面修复

## 本次变化

- 删除内容区左上方重复的“推荐”大标题；侧栏入口保留。“换一批”移到编辑精选右侧，减少一行空白。
- 版本从 1.2.0 增至 1.2.1。设置与关于页面直接读取 package.json 版本，避免手动改多个位置；后续每次交付递增版本号。

## 缺图原因与修复

真实 Electron 网络栈复现：两张编辑精选图片的 `img1.kwcdn.kuwo.cn` 地址报 `net::ERR_CERT_COMMON_NAME_INVALID`。歌单详情备用接口仍返回相同域名，原先重试和更换图片尺寸均不能解决。

相同图片路径改用 `img1.kuwo.cn` 后，两张原图分别返回 52,143 和 42,291 字节的 JPEG。修复只替换这一已验证的旧域名，保留路径、查询参数和 HTTPS，保留证书验证及图片来源限制；其他来源不随意改写。

- API 图片规范化时处理新数据，图片缓存入口再次处理旧收藏、历史和已保存的地址。
- 同一图片的旧地址和规范地址共用缓存与进行中的请求，离线仍可读取。
- 原图真实不可用时继续显示占位，不伪造封面。
- 复现数据：[修复前](evidence/covers-before-1.2.1.json)、[修复后](evidence/covers-electron-1.2.1.json)。

## 验证

- `npm test`：85 项全部通过。新增旧域名转换、安全边界、请求合并和离线缓存测试。
- `npm run build` 与 `npx tsc --noEmit` 通过。
- Electron 45.2.3、直接联网、正常证书校验：8 张编辑精选、12 张精选歌单、6 张榜单及 6 张每日推荐封面共 32 张全部成功，之后关闭图片网络读取仍全部命中缓存。该项是已加载图片的离线缓存检查。
- cua-driver 检查实际 win-unpacked 的浅色与深色首页：顶部直接显示编辑精选，原缺失的两张图正常，换一批靠右，侧栏推荐入口保留。截图见 evidence/cover-1.2.1-dark.png 与 evidence/cover-1.2.1-light.png。
- EXE 文件版本 1.2.1，产品版本 1.2.1.0；运行包与 GUI 测试副本逐文件校验。
- 使用独立测试资料目录，不改写正式收藏、历史、任务和设置；修改前备份源码、运行目录及资料，位置记录在交付 JSON。
- 本次仅交付 win-unpacked；Windows 10 22H2 实测，Windows 11 未实测。本轮范围为推荐页与图片，不将既有音频/HiFi 测试记录冒充本轮完整播放复测。

## 如何复现图片验证

在源码目录安装依赖并构建后运行：

```powershell
npm ci
npm test
npm run build
npx esbuild scripts/verify-cover-electron.ts --bundle --platform=node --format=cjs --external:electron --outfile=artifacts/verify-cover.cjs
& node_modules/electron/dist/electron.exe artifacts/verify-cover.cjs --user-data-dir="$env:TEMP/Wuwo-cover-check" --disable-gpu
```

脚本在独立缓存内请求当前首页数据，验证图片内容和离线命中，将结果写入 `docs/evidence/covers-electron-1.2.1.json`。线上推荐会变化，以运行时数据为准；缺图或请求异常会使验证失败。
