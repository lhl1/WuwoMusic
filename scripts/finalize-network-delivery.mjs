import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const backup=fs.readFileSync(path.join(root,'artifacts/proxy-backup-path.txt'),'utf8').trim();
const stage=path.join(root,'artifacts/network-package/win-unpacked');
const gui=path.join(process.env.LOCALAPPDATA,'Temp/WuwoMusic-Network-QA');
const release=path.join(root,'release/无我音乐-1.2.0-网络设置/win-unpacked');
const state=path.join(process.env.APPDATA,'KuwoMusicDesktop/state.json');
const evidence=path.join(root,'docs/evidence');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const log=fs.readFileSync(path.join(evidence,'tests-network-120.txt'));
if(!/pass\s+78/.test(log.toString(log[0]===255&&log[1]===254?'utf16le':'utf8')))throw Error('78 tests required');
const network=JSON.parse(fs.readFileSync(path.join(evidence,'network-electron-120.json'),'utf8'));
if(network.checks.length!==6||!network.checks.every(c=>c.ok))throw Error('Network checks not passed');
if(!fs.existsSync(path.join(backup,'win-unpacked/resources/app.asar')))throw Error('Backup missing');
if(fs.existsSync(release))throw Error('Delivery exists; inspect before repeating');
const stateHash=hash(state);
fs.mkdirSync(path.join(backup,'profile-at-delivery'),{recursive:true});
fs.copyFileSync(state,path.join(backup,'profile-at-delivery/state.json'));
fs.copyFileSync(path.join(process.env.LOCALAPPDATA,'Temp/WuwoMusic-Network-profile/state.json'),path.join(backup,'qa-network-state.json'));
const files=walk(stage);
for(const file of files){const rel=path.relative(stage,file);if(hash(file)!==hash(path.join(gui,rel)))throw Error('GUI copy differs: '+rel);}
fs.cpSync(stage,release,{recursive:true,errorOnExist:true,force:false});
for(const file of files){const rel=path.relative(stage,file);if(hash(file)!==hash(path.join(release,rel)))throw Error('Delivery differs: '+rel);}
fs.writeFileSync(path.join(release,'使用说明.txt'),'\ufeff'+`无我音乐 1.2.0 — LHL — 网络设置版

双击“无我音乐.exe”运行，请保留整个 win-unpacked 文件夹。

默认直连，不使用系统代理；旧配置缺少该选项时也使用直连。
设置 → 网络 → 网络代理，可选择“直连（不使用代理）／跟随系统代理”。
选择会保存，重启后保留；切换即时应用于本应用的外网请求。
切换时播放和下载可能短暂中断，可等待自动恢复或重试。
仅调整本应用，不修改 Windows 代理配置。

继续保留播放加载恢复、评论精简及自动滚动展开全文等功能。
本轮78项自动化测试和6项真实Electron网络检查通过。
正式资料目录：%APPDATA%\\KuwoMusicDesktop。
旧版、下载路径和本地记录保持保留；不复制测试设置至正式配置。
Windows 10 x64 实测，Windows 11 未单独实测。
文件校验见 SHA256SUMS.txt；HiFi 版权说明见 resources\\hifi\\NOTICE.txt。
`);
fs.copyFileSync(path.join(root,'docs/ACCEPTANCE-NETWORK-1.2.md'),path.join(release,'网络设置说明.md'));
const manifest=walk(release).sort().map(file=>({file:path.relative(release,file).replaceAll('\\','/'),sha256:hash(file)}));
fs.writeFileSync(path.join(release,'SHA256SUMS.txt'),manifest.map(r=>`${r.sha256}  ${r.file}`).join('\r\n')+'\r\n');
for(const row of manifest)if(hash(path.join(release,row.file))!==row.sha256)throw Error('Manifest mismatch');
if(hash(state)!==stateHash)throw Error('Formal profile changed during packaging; inspect concurrent activity');
const report={date:new Date().toISOString(),version:'1.2.0',output:release,backup,formalProfileWritten:false,formalProfileSha256:stateHash,formalMatchesPreChangeBackup:hash(path.join(backup,'state.json'))===stateHash,systemProxyConfigurationModified:false,
  guiFilesCompared:files.length,manifestFiles:manifest.length,manifestVerified:true,artifacts:['无我音乐.exe','resources/app.asar','resources/hifi/mpv.exe'].map(file=>({file,sha256:hash(path.join(release,file)),equalsGuiTestedCopy:true})),
  tests:{automated:78,networkElectron:6,gui:['legacy-default-direct','system-choice-saved','direct-choice-saved']},limitations:['Windows 11 not tested','C-drive byte-identical GUI copy used due prior D-drive automation launcher restriction']};
fs.writeFileSync(path.join(evidence,'network-delivery-120.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
