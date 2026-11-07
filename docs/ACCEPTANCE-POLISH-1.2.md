# 无我音乐 1.2.0 界面与原生发现补充

2026-11-07，作者 LHL。本轮仅交付 win-unpacked。修改前备份：`D:\3DS_MAX\20261107_music\backups\wuwo-before-polish-20261107-1540`，含源码、完整旧运行目录、正式 state.json。

## 界面与交互

- 底栏采用封面、歌曲资料、独立音频参数标签三层布局。码率／采样率／位深分别描边，不改造或虚构源参数；HiFi 输出沿用实际 WASAPI 状态。
- MV 小标紧邻歌名，缩为 9px 字、15px 高；音质标签保持短文案。歌曲选择框为统一的圆角描边与黄色选中态，保留批量下载与键盘选择。
- 进度条左侧显示已播放的强调色色段，右侧为中性色；跟随真实位置与跳转。
- 歌词页默认唱片封面，评论默认收起。点击评论后在左侧替换封面区域，右侧保留同步歌词；关闭评论返回封面。新的默认值只迁移一次，之后保留用户选择。
- 评论按热门／最新连续向下加载，去除总数、页码与卡片轮播计数。单独按钮控制自动向下滚动；播放暂停、窗口隐藏、悬停、键盘进入评论内容或展开长文时暂停。只有服务确认最后一页并且无错误，才允许滚动回开头；接口失败保留已读评论并手动重试。
- 搜索框去除 Ctrl F 提示，聚焦时保持原背景。输入防抖调用 APK 原版联想；空白聚焦显示真实搜索推荐，空白未聚焦时轮换原版推荐词。支持方向键、Enter、Esc、清空与中文输入法组合输入；过期请求不会覆盖新词。
- 底栏封面悬停放大，列表及歌单图片适度放大，保留缩小后的完整布局；尊重系统减少动态效果偏好。
- 支持历史期数的榜单显示年份／期数选择，切换会重新取对应歌曲及分页。没有期数的榜单不伪造选项。

## APK 调用链与接口

既有 jadx 源码直接复用，无须重复反编译。

| 功能 | APK 证据 | 实际请求 |
| --- | --- | --- |
| 输入联想 | `cn/kuwo/base/config/KuwoUrl$UrlDef.java:140`、`cn/kuwo/base/utils/s2.java:7772` | `tips.kuwo.cn/t.s`，`c=mbox&w=关键词&encoding=utf8&rformat=json&apiversion=1&uid=0` |
| 空白与静默推荐 | `s2.java:5487`、`s2.java:5606` | `searchrecterm.kuwo.cn/recterm.s` 与 `hotword.kuwo.cn/hotword.s`；使用真实 `content.query_word`、`hotwords.key` |
| 榜单期数 | `s2.java:6287`、`y4/e.java:44` | `mobilebasedata.kuwo.cn/basedata.s?type=get_bang_info_m&id=榜单&fq=1&mid=0&prid1=0&prid2=0&aapiver=2&f=web`，读取 `fq.volume` 的年份、`second_id` 和 `third_id` |
| 历史期内容 | `s2.java:5833`、BillboardTabFragment 的 `getBangId()` 调用 | `mobi.kuwo.cn/mobi.s?f=web&type=bangdata&id=榜单&start=偏移&count=30&bangid=期数` |

实测普通 kbangserver 内容接口忽略 bangid，仍返回最新榜单，因此历史期数使用 APK 的 bangdata 链路。先验证期数属于当前榜单，再解析受限 XML 属性；拒绝 DTD、外部实体、异常数量、错误及不完整内容。

## 验证

- 自动化 63/63 通过：保留播放、下载恢复、评论、封面与 HiFi 回归；新增原版联想、空白推荐、期数归属、XML 元数据、评论连续分页／重复项／过期响应／失败重试、默认设置迁移。见 `evidence/tests-polish-120.txt`。
- 真实 Electron 网络 4/4 通过，见 `evidence/polish-electron-120.json`。《晴》返回《晴天》等真实联想；空白推荐与热搜均有内容；热歌榜返回 60 期，第252期首歌《山风山风等等我》，与最新一期首歌不同，历史下一页也不同；《晴天》热门、最新评论分别验证连续两页。
- 桌面使用 cua-driver 操作与最终程序字节相同的打包副本。实测搜索联想和真实搜索播放，唱片封面默认显示、评论默认关闭、左侧评论展开与独立滚动按钮、音频参数标签及已播放进度色段。截图见 `evidence/polish-*.png`。
- 本机 Windows 10；Windows 11、外接 DAC、ASIO／DSD 与位完美硬件测量未实测。上一轮 HiFi 联动证据仍保留在 `ACCEPTANCE-HIFI-1.2.md`。
- 当前自动化启动器对 D 盘根目录的访问可能触发 Electron `lstat D:\ EPERM`，与普通用户启动分开记录；真实桌面 GUI 使用 C 盘字节相同副本验证。没有修改系统 ACL 或关闭安全策略。

最终文件哈希、运行目录与资料保留结果以 `evidence/polish-delivery-120.json`、运行目录 `SHA256SUMS.txt` 为准。

最新布局交付位置为 `release/无我音乐-1.2.0/win-unpacked`，请以 `ACCEPTANCE-LAYOUT-1.2.md` 和最终交付 JSON 为准。旧运行目录因残留进程锁定保留。
