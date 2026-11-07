import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=path.resolve(import.meta.dirname,'..');
const backup=fs.readFileSync(path.join(root,'artifacts/playback-backup-path.txt'),'utf8').trim();
const stage=path.join(root,'artifacts/playback-package/win-unpacked');
const gui=path.join(process.env.LOCALAPPDATA,'Temp/WuwoMusic-Playback-QA');
const qa=path.join(process.env.LOCALAPPDATA,'Temp/WuwoMusic-Playback-profile');
const release=path.join(root,'release/无我音乐-1.2.0-播放修复/win-unpacked');
const profile=path.join(process.env.APPDATA,'KuwoMusicDesktop');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const evidence=path.join(root,'docs/evidence');
const playback=json(path.join(evidence,'playback-electron-120.json'));
const hifi=json(path.join(evidence,'hifi-electron-120.json'));
if(playback.checks.length!==7||!playback.checks.every(c=>c.ok)||hifi.checks.length!==5||!hifi.checks.every(c=>c.ok))throw Error('Network acceptance did not pass');
const testLog=fs.readFileSync(path.join(evidence,'tests-playback-120.txt'));
const testText=testLog.toString(testLog[0]===0xff&&testLog[1]===0xfe?'utf16le':'utf8');
if(!/pass\s+73/.test(testText))throw Error('73 tests required');
if(!fs.existsSync(path.join(backup,'win-unpacked/resources/app.asar'))||!fs.existsSync(path.join(backup,'state.json')))throw Error('Original backup missing');
if(fs.existsSync(release))throw Error('Delivery already exists; inspect before repeating');

// Read-only verification and snapshots: never merge QA settings or records into the formal profile.
const stateFile=path.join(profile,'state.json'),formalHash=hash(stateFile),formal=json(stateFile),original=json(path.join(backup,'state.json'));
const finalBackup=path.join(backup,'profile-at-delivery');
fs.mkdirSync(finalBackup,{recursive:true});
fs.copyFileSync(stateFile,path.join(finalBackup,'state.json'));
const qaBackup=path.join(backup,'qa-playback-profile');
fs.mkdirSync(qaBackup,{recursive:true});
for(const item of ['state.json','metadata','artwork','logs']){const from=path.join(qa,item);if(fs.existsSync(from))fs.cpSync(from,path.join(qaBackup,item),{recursive:true});}
const log=path.join(qa,'logs/playback.log');
if(fs.existsSync(log))fs.copyFileSync(log,path.join(evidence,'playback-gui-log-120.jsonl'));

const staged=walk(stage);
for(const file of staged){const rel=path.relative(stage,file);if(hash(file)!==hash(path.join(gui,rel)))throw Error('GUI copy differs: '+rel);}
fs.cpSync(stage,release,{recursive:true,errorOnExist:true,force:false});
for(const file of staged){const rel=path.relative(stage,file);if(hash(file)!==hash(path.join(release,rel)))throw Error('Delivered file differs: '+rel);}
const guide=`无我音乐 1.2.0 — LHL — 播放加载修复版

双击“无我音乐.exe”运行。请保留整个 win-unpacked 文件夹。
本目录为最新播放修复版，旧目录和原资料保持保留。

本轮修复：
• 为解析、连接、首段数据和播放启动补上超时，加载中点击播放按钮可取消。
• 切歌取消旧请求；临时地址失效重新解析，播放中断尝试恢复进度。
• 失败后显示重试按钮，不会无限自动重试。
• 封面补充、参数探测和历史更新不再阻塞启动。
• 音频参数未知时保持未知，不把 FLAC 档位“2000kbps”当作实测码率。
• 保持 HiFi 中性色、无下拉箭头及现有界面布局。

资料目录：%APPDATA%\\KuwoMusicDesktop。
旧下载路径、收藏、歌单、本地音乐、历史和任务继续有效，下载文件不搬移。
新用户默认保存至“音乐\\无我音乐”，MV 使用同一下载目录。
播放诊断：资料目录\\logs\\playback.log，仅存本机，滚动保留。
HiFi 保持原采样率、1×和软件音量100%，请使用设备调音量。
本轮通过 73 项自动化测试、7 项真实 Electron 网络／故障检查及5项 HiFi相关回归。
本机 Windows 10 x64 实测；Windows 11、外接 DAC 和硬件位完美测量未实测。
文件校验见 SHA256SUMS.txt。HiFi 版权说明见 resources\\hifi\\NOTICE.txt。
`;
fs.writeFileSync(path.join(release,'使用说明.txt'),'\ufeff'+guide);
fs.copyFileSync(path.join(root,'docs/ACCEPTANCE-PLAYBACK-1.2.md'),path.join(release,'播放修复说明.md'));
const manifestFile=path.join(release,'SHA256SUMS.txt');
const manifest=walk(release).filter(p=>p!==manifestFile).sort().map(file=>({file:path.relative(release,file).replaceAll('\\','/'),sha256:hash(file)}));
fs.writeFileSync(manifestFile,manifest.map(row=>`${row.sha256}  ${row.file}`).join('\r\n')+'\r\n');
for(const row of manifest)if(hash(path.join(release,row.file))!==row.sha256)throw Error('Manifest mismatch');
if(hash(stateFile)!==formalHash)throw Error('Formal profile changed during packaging; inspect concurrent activity');

const report={date:new Date().toISOString(),version:'1.2.0',output:release,backup,profileBackup:finalBackup,qaProfileBackup:qaBackup,formalProfileWritten:false,
  originalRecordsRetained:{settings:JSON.stringify(original.settings)===JSON.stringify(formal.settings),tasks:original.tasks.every(t=>formal.tasks.some(x=>x.id===t.id)),...Object.fromEntries(['local','favorites','history','playlists'].map(key=>[key,original.library[key].every(t=>formal.library[key].some(x=>x.id===t.id))]))},
  formalProfileSha256:formalHash,formalMatchesPreChangeBackup:hash(path.join(backup,'state.json'))===formalHash,formalLocalCount:formal.library.local.length,formalTaskCount:formal.tasks.length,
  guiCopyFilesCompared:staged.length,files:manifest.length,manifestVerified:true,manifestSha256:hash(manifestFile),
  artifacts:['无我音乐.exe','resources/app.asar','resources/hifi/mpv.exe'].map(file=>({file,sha256:hash(path.join(release,file)),equalsGuiTestedCopy:true})),
  tests:{automated:73,playbackElectron:7,hifiElectron:5,gui:['online-progress','offline-online-source-error','online-retry-progress','offline-local-flac-progress','rapid-local-next-three']},
  originalNetworkFailureReproduced:false,controlledNetworkFailuresVerified:true,
  limitations:['Windows 11 not tested','External DAC / hardware bit-perfect not measured','D-drive automation launcher restriction: byte-identical C-drive copy used for GUI testing']};
fs.writeFileSync(path.join(evidence,'playback-delivery-120.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
