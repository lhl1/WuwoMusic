# 无我音乐 1.2.0 接口与兼容记录

日期：2026-11-07。保留 1.1 的改版播放／下载解析逻辑，原始分析见 RESEARCH.md。

## 评论

通过 APK 已提取源码 `cn/kuwo/base/utils/s2.java` 的评论请求构造及 `CommentInfo.java` 字段，结合实际 Electron `net.fetch` 核验：

```
https://comment.kuwo.cn/com.s?type=get_rec_comment&f=web&page=1&rows=20&digest=15&sid=228908&uid=0&prod=MUSIC_9.1.1.2_BCS2
```

最新使用 `type=get_comment`。请求携带 Mozilla/5.0 User-Agent 和 https://www.kuwo.cn/ Referer。无需账户、Cookie 或登录令牌。页面／行数使用 page／rows，旧 start／count 参数及其他 prod 值可能返回 code=600 的空业务错误，不能据此显示“没有评论”。

有结果时使用 rows、total、totalPage；映射 id、u_name、u_pic、time、msg、like_num。正文作为 React 文本节点显示，服务 HTML 不执行。时间保留服务返回的时间字符串，不推断时区。字段长度受限，查询 ID、排序、页码由主进程校验。

无结果的实测曲目 172567327（热门）返回 `{"result":"ok","data":{"info":[],"total":"0"}}`。仅当 result 成功、无业务错误、info 为空且 total=0 时识别为空；不接受任意缺少 rows 的回复。

实测《晴天》热门共 1252 条、最新共 24389 条，均每页返回 20 条。数量可能随服务变化。证据为 evidence/comments-electron-120.json；该脚本无窗口，使用与应用相同的 Electron 网络栈。

缓存保留 5 分钟，以歌曲／排序／页码为键，合并同时请求，最多保留 150 页；离线时先拒绝请求，不借缓存伪装在线结果。轮播只循环已加载热门第一页，不每 10 秒联网。

## 头像

酷我图片来源继续允许 kuwo.cn、kwcdn.cn 及其子域。单独的头像协议 `kuwo://avatar` 额外允许精确主机 q.qlogo.cn、thirdwx.qlogo.cn、thirdqq.qlogo.cn。封面协议没有额外放宽。实际读取这四类头像并验证图像内容；证据记录响应字节数，不存评论正文和用户名。

仍采用图片格式识别、8 MB 上限、12 秒超时、并发限制和磁盘缓存；失败显示黄色首字占位。拒绝用户信息 URL、非 HTTP(S) URL、任意其他主机，校验最终重定向 URL。

## 外观与资料

nativeTheme.themeSource 使用 system／light／dark；监听 updated 并向界面推送深浅状态，初次快照在 React 挂载前应用。窗口背景同样使用初始系统状态，避免白色启动闪烁。

保持 appId=local.kuwo.desktop、app.setName('KuwoMusicDesktop') 和版本 1 存储结构，显示名称、EXE 名称与公司字段为无我音乐／LHL。资料目录保持不变。旧设置与新默认值合并，新字段为 theme=system、textSize=standard、autoHotComments=true；原下载路径不改动。全新配置默认音乐／无我音乐。

代码和 IPC 不提供发表评论、点赞或账户操作。纯本地导入 ID 以 local- 开头，无评论映射；下载歌曲保留数字 RID，支持查看原曲评论。

## 搜索、发现与 MV 完善

综合搜索合并单曲／歌手／专辑／歌单，分类支持歌词反查。使用 search.kuwo.cn/r.s 的 ft、lrccontent 和 stype 参数。歌手／专辑详情会返回单引号数据对象，使用 JSON5 作为数据解析器，仅限该服务，禁止 eval／脚本执行。搜索分页 30 条，歌单推荐接口分页 24 条，pn 从 1 开始。

歌单标签来自 getTagList，排除专区及非歌单 digest；当前实测 67 个标签。热门／最新与分类列表分别使用 getRcmPlayList 和 getTagPlayList。排行榜 36 个，按五组分类，优先使用每天更新的 pic2，静态 pic 仅作备用。

MV 使用 mobi.kuwo.cn/mobi.s 的 type=convert_mv_url2，按 MP4BD、MP4UL、MP4HV、MP4、MP4L 解析；RID 与音频共用。MVFLAG=0 或 vid=0 不显示 MV 标记。视频在主内容区播放，使用受限媒体协议转发 Range，不允许渲染进程自行访问任意地址。

MV 下载使用原持久任务队列（media=mv），默认和音乐下载到同一目录。文件名包含 MV 与实际规格，扩展名 MP4；暂停、续传、重试、重新解析过期地址和重启恢复复用原逻辑。视频规格改变时清除不兼容部分文件。完成前解析容器，确认有视频轨和有效时长；MV 不混入本地音频列表。下载管理可直接播放已下载 MV，主进程只接受已完成任务中登记的文件路径。

《晴天》实际返回 MP4BD／3000 kbps，HTTP Range 206，MP4 视频轨 H.264 1920×1080、音轨 AAC。完整下载 122,676,711 字节，时长 317.33 秒，见 evidence/media-electron-120.json。

封面保留受限代理及缓存。加载失败会重试，仍失败时按集合类型查询备用封面（例如歌单的 150px 图），不把歌单 ID 当歌曲 ID。有效图片不会因 Windows 缓存写入失败而变成 404。冷缓存真实 Electron 批量读取：24／24 歌单、36／36 每日榜单；6 张封面离线缓存读取通过。

## 最高可用音质

新版本首次升级采用无损优先，之后保留用户自行选择的音质。FLAC → 320 → 128 依次尝试；明确音质或资源拒绝可回退，网络、响应损坏、错曲和无效参数直接报错。完成校验按实际音质与格式执行，续传规格变更时重新下载，不把 MP3 标为 FLAC。

真实 Electron 实测：51685512 的播放与下载均从 FLAC 回退 320 kbps MP3，269.90 秒；172567327 回退 128 kbps MP3，75.78 秒。详见 evidence/fallback-electron-120.json。
