# 无我音乐 1.2.2 · 专辑信息与文字修复

## 实现

- 专辑详情沿用既有受限 collection IPC；一次 albuminfo 请求同时取得歌曲和专辑资料，不为简介重复请求。
- 返回规范化的专辑名称、艺术家、发行日期、唱片公司、语言、分类、副标题与完整简介。分类的旧格式使用 JSON5 解析，不执行服务端文本；缺失或损坏的可选字段不阻止歌曲加载。
- 新详情头部统一封面、标题和信息层级。简介默认两行，按实际溢出决定是否显示展开按钮，支持展开/收起和窗口宽度变化。播放、下载继续使用原有操作。
- 无损、320K 与 DTS:X 小标签采用细边框。DTS:X 仅依据曲库 formats / N_MINFO 的真实标记；不推断未返回的 48kHz、位深或实际解码格式，也不将来源标记视为当前输出。实际播放规格继续来自音频信息。
- 服务文本统一解码 `&nbsp;`、数字 Unicode 和常见标点实体，处理多层转义并保留简介段落；以 React 文本渲染，不使用 innerHTML。专辑名、歌名与搜索结果共用同一规范化入口。
- 旧收藏、历史、本地音乐与下载任务的显示字段在读入内存时修复；不修改 ID、下载路径或文件名，不因读取就重写正式资料。

## 验证

- `npm test`：89 项通过；`npm run build` 通过。新增测试涵盖异常实体、简介段落、非法 Unicode、可选标签损坏、专辑详情与歌曲同次返回、旧资料显示名称修复及文件路径保留。
- 真实 Electron 45.2.3、直接联网：验证专辑 10140374《Love Letter》的 15 首曲目。His Smile、Childhood Days 等名称不再包含 `&nbsp;`；发行日期为 1995-04-21，DTS:X 标记与简介来自实际回复。见 [接口记录](evidence/album-electron-1.2.2.json)。
- 使用 cua-driver 对最终 win-unpacked 的独立副本检查实际专辑页面：深色、浅色、简介展开/收起及返回搜索结果；另检查 150% 应用缩放配合“更大”文字，标题、标签与信息正常换行，没有横向溢出。对应截图和交付目录校验记录位于 evidence。
- 本次备份包括前版运行目录、源码和正式 state.json；GUI 使用独立资料目录。交付 JSON 记录正式资料校验及各运行目录逐文件一致性。
- Windows 10 22H2 实测；Windows 11 未实测。本轮不包含新增音频解码格式或 HiFi 引擎变更，未将曲库标签验证等同于 DTS:X 硬件播放测试。

## 复现

```powershell
npm ci
npm test
npm run build
npx esbuild scripts/verify-album-electron.ts --bundle --platform=node --format=cjs --external:electron --outfile=artifacts/verify-album.cjs
& node_modules/electron/dist/electron.exe artifacts/verify-album.cjs --user-data-dir="$env:TEMP/Wuwo-album-check" --disable-gpu
```

界面检查：搜索 `Love Letter 麗美`，选择“专辑”，打开麗美的 Love Letter，检查日期、简介、15 首曲目和小标签。点击展开简介后阅读全文，再收起；返回应恢复此前搜索结果。
