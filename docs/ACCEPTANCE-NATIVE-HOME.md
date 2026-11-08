# 2026-11-08 推荐与返回改进

- 底部播放栏封面不再悬停放大；列表、卡片的封面预览保留。
- 播放页改为覆盖在浏览页之上，收起有 220ms 下移淡出，打开有淡入；遵循减少动态效果的系统偏好。
- 收起、顶部返回、底栏歌词按钮都恢复播放页下方的原页面，保留列表位置、查询、分页与筛选。主区域在播放页展开时不可交互。
- 其他页面使用最多 80 条的本机内存导航历史，保存搜索类别、页码、歌单/榜单详情、期数、本地歌单、下载筛选及滚动位置。新页面从顶部打开，返回恢复原位置。歌单分类和排行榜分类组件保留挂载，避免返回丢筛选。没有上一页时保持当前页。
- MV 返回恢复进入前的页面；从播放页进入 MV 后可以返回播放页。

## 原生数据证据

复用现有 jadx 输出追踪：

- `OnlineType.AnonymousClass2.getTypeName()` 返回 `hotpage`，`s2.R6` 构造热门页参数；`homepages.kuwo.cn/mgxh.s?type=hotpage&apiv=8` 的 XML 中 `label=编辑精选` 区段返回 songlist。
- `s2` 中每日推荐为 `openapi/v1/recommend/daily/main?type=rcm_discover&tab=1&apiv=4`；返回 `child[].type=rcm_discover` 下的 musicdata。
- 全部使用匿名参数，无登录资料。仅解析需要的歌曲、歌单字段；忽略广告、购买及登录入口，不执行返回的链接或 HTML。
- 真实 Electron Session 直连验证得到 8 个编辑精选歌单、30 首每日推荐，首个歌单详情返回 27 首。证据见 `evidence/native-home-electron.json`，脚本 `scripts/verify-native-home-electron.ts` 可复验。
- 截图所示新版 `api/v1/audio/feed` 在匿名实测时返回 code=20001、data={}，没有伪造“猜你喜欢”或基于某首歌曲的个性化结果。当前首页接入可用的编辑精选和每日推荐单曲，保留原精选歌单及榜单。

## 验证

构建及 81 项测试通过。新增测试覆盖编辑精选区域选择与 XML 实体拒绝、嵌套歌曲字段/广告过滤、单模块失败保留其他结果。

cua-driver 在隔离 QA 配置与打包副本中检查了：原生推荐展示，精选歌单进入及返回，本地歌曲播放，歌词展开、收起及顶部返回。收起过程中截图可见覆盖页淡出，结束恢复本地音乐；截图见 native-player-return.png、native-recommend-home.png。正式资料不用于 GUI 写入。

Windows 11 未实测。最终交付仅 win-unpacked，旧目录和升级前源码/正式配置已备份。
