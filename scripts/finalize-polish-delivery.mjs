import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),backup=path.resolve(root,'../backups/wuwo-before-polish-20261107-1540'),stage=path.join(root,'artifacts/layout-ready-package/win-unpacked'),release=path.join(root,'release/win-unpacked'),qaApp=path.join(process.env.LOCALAPPDATA,'Temp/WuwoMusic-Layout-ready');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const profile=path.join(process.env.APPDATA,'KuwoMusicDesktop'),qa=path.join(process.env.LOCALAPPDATA,'Temp/WuwoMusic-Polish-profile');
const stateFile=path.join(profile,'state.json'),before=json(stateFile),test=json(path.join(qa,'state.json')),after=structuredClone(before);
const profileBackup=path.join(backup,'profile-final-update');if(fs.existsSync(profileBackup))throw Error('Finalization already ran; inspect before repeating.');
fs.mkdirSync(profileBackup,{recursive:true});fs.copyFileSync(stateFile,path.join(profileBackup,'state.json'));fs.copyFileSync(path.join(qa,'state.json'),path.join(profileBackup,'qa-state.json'));
const userImports=test.library.local.filter(t=>t.localPath&&fs.existsSync(t.localPath)&&!t.localPath.toLowerCase().includes('wuwomusic-hifi-qa')&&!t.localPath.toLowerCase().includes('\\appdata\\local\\temp\\'));
const added=[];
for(const track of userImports){if(!after.library.local.some(t=>t.id===track.id)){after.library.local.push(track);added.push(track.id);}}
if(added.length){
 for(const field of ['history','favorites'])for(const t of test.library[field])if(added.includes(t.id)&&!after.library[field].some(x=>x.id===t.id))after.library[field].push(t);
 fs.writeFileSync(stateFile+'.polish.tmp',JSON.stringify(after,null,2));fs.renameSync(stateFile+'.polish.tmp',stateFile);
}
// Settings are migrated by the app on first startup. QA theme, device and scale are never copied.
for(const field of ['settings','tasks'])if(JSON.stringify(before[field])!==JSON.stringify(after[field]))throw Error('Unexpected profile change: '+field);
if(JSON.stringify(before.library.playlists)!==JSON.stringify(after.library.playlists))throw Error('Playlists changed');
for(const t of userImports)for(const id of [t.id,t.onlineId].filter(Boolean)){
 const src=path.join(qa,'metadata',id+'.json'),dst=path.join(profile,'metadata',id+'.json');if(fs.existsSync(src)&&!fs.existsSync(dst)){fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst);}
}
for(const file of ['无我音乐.exe','resources/app.asar','resources/hifi/mpv.exe'])if(hash(path.join(stage,file))!==hash(path.join(qaApp,file)))throw Error('GUI copy differs: '+file);
const old=path.join(backup,'replaced-runtime');
if(fs.existsSync(old))throw Error('Runtime replacement already exists');
// Both explicit absolute paths are inside the project or its task backup directory.
if(release!==path.resolve(root,'release/win-unpacked')||!old.startsWith(backup+path.sep))throw Error('Unexpected move target');
if(fs.existsSync(release))fs.renameSync(release,old);
try{fs.cpSync(stage,release,{recursive:true,errorOnExist:true});}catch(e){if(!fs.existsSync(release))fs.renameSync(old,release);throw e;}
const text=`无我音乐 1.2.0 — LHL

双击“无我音乐.exe”运行，保留整个 win-unpacked 文件夹。
播放器右侧 HiFi 按钮采用中性色细边框，无黄色填充、无下拉箭头；点击切换输出。
下载管理使用歌曲列表布局，设置控件对齐，顶部拖动区域扩大。
推荐页横幅已删除，搜索联想完整覆盖封面。
本轮只提供运行目录，不生成安装器或单文件 EXE。

• 底栏显示独立描边的真实码率、采样率和位深；未知值不填默认数字。
• 设置 → 音频输出可选 HiFi（WASAPI 独占）及设备。
  HiFi 保持源采样率、1×、软件音量100%；请使用设备调音量。
  设备不支持源格式或被占用时明确报错，可手动切回标准模式。
• 已播放进度显示强调色色段，MV 小标位于歌名后，支持批量选择。
• 默认唱片封面；点击评论在歌词左侧显示，关闭回到封面。
  单独按钮控制评论自动向下滚动；滚至底部继续加载，无更多内容后再循环。
  悬停、展开长文、键盘进入内容、暂停播放或隐藏窗口时暂停滚动。
• 搜索框接入 APK 原版输入联想、空白推荐和静默推荐词。
  不显示 Ctrl F 提示；快捷键仍可用，聚焦不改变背景。
• 支持期数的排行榜可选择年份／真实历史期数及对应歌曲。
• 外部音频拖入即可播放，尝试补齐缺失歌词、封面、评论和 MV。
  本地已有资料优先；无法可靠匹配时保持本地身份。
• 封面悬停适度放大。音频和 MV 仍支持播放、下载及离线播放。

保留原下载路径、收藏、历史、歌单和任务。
新用户默认下载至“音乐\\无我音乐”，MV 保存到相同下载目录。
资料：%APPDATA%\\KuwoMusicDesktop。
HiFi 已用虚拟 WASAPI 端点验证；外接 DAC、ASIO、DSD 和位完美测量未实测。
本次实测 Windows 10 x64；Windows 11 未单独实测。
版权／源码说明见 resources\\hifi\\NOTICE.txt。
文件校验见 SHA256SUMS.txt。
`;
fs.writeFileSync(path.join(release,'使用说明.txt'),'\ufeff'+text);
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const manifestFile=path.join(release,'SHA256SUMS.txt'),manifest=walk(release).filter(p=>p!==manifestFile).sort().map(p=>({file:path.relative(release,p).replaceAll('\\','/'),sha256:hash(p)}));
fs.writeFileSync(manifestFile,manifest.map(x=>`${x.sha256}  ${x.file}`).join('\r\n')+'\r\n');
for(const row of manifest)if(hash(path.join(release,row.file))!==row.sha256)throw Error('Manifest verification failed');
const report={date:new Date().toISOString(),version:'1.2.0',output:release,backup,layoutBackup:path.resolve(root,'../backups/wuwo-before-layout-20261107-1720'),profileBackup,files:manifest.length,manifestVerified:true,manifestSha256:hash(manifestFile),
 artifacts:['无我音乐.exe','resources/app.asar','resources/hifi/mpv.exe'].map(file=>({file,sha256:hash(path.join(release,file)),equalsGuiTestedCopy:true})),
 profile:{allOriginalIdsRetained:['local','favorites','history'].every(f=>before.library[f].every(t=>after.library[f].some(v=>v.id===t.id))),settingsPreserved:true,tasksPreserved:true,playlistsPreserved:true,newUserLocalImports:added,localCount:after.library.local.length,stateBefore:hash(path.join(profileBackup,'state.json')),stateAfter:hash(stateFile)},
 tests:{automated:63,apkNetwork:4,hifiNetworkRechecked:5,finalGui:true},limitations:['Windows 11 not tested','External DAC and bit-perfect measurements not tested','D-drive automated launcher permission issue recorded separately']};
fs.writeFileSync(path.join(root,'docs/evidence/polish-delivery-120.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
