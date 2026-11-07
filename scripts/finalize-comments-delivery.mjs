import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const backup=fs.readFileSync(path.join(root,'artifacts/comments-backup-path.txt'),'utf8').trim();
const stage=path.join(root,'artifacts/comments-final-package/win-unpacked');
const gui=path.join(process.env.LOCALAPPDATA,'Temp/WuwoMusic-Comments-final-QA');
const release=path.join(root,'release/无我音乐-1.2.0-评论优化/win-unpacked');
const formal=path.join(process.env.APPDATA,'KuwoMusicDesktop/state.json');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const evidence=path.join(root,'docs/evidence');
const log=fs.readFileSync(path.join(evidence,'tests-comments-refinement-120.txt'));
if(!/pass\s+73/.test(log.toString(log[0]===255&&log[1]===254?'utf16le':'utf8')))throw Error('Tests not passed');
if(!fs.existsSync(path.join(backup,'win-unpacked/resources/app.asar')))throw Error('Backup missing');
if(fs.existsSync(release))throw Error('Delivery already exists; inspect before repeating');
const stateHash=hash(formal);
fs.mkdirSync(path.join(backup,'profile-at-delivery'),{recursive:true});
fs.copyFileSync(formal,path.join(backup,'profile-at-delivery/state.json'));
const qaState=path.join(process.env.LOCALAPPDATA,'Temp/WuwoMusic-Comments-profile/state.json');
fs.copyFileSync(qaState,path.join(backup,'qa-comments-state.json'));
const files=walk(stage);
for(const file of files){const rel=path.relative(stage,file);if(hash(file)!==hash(path.join(gui,rel)))throw Error('GUI copy differs: '+rel);}
fs.cpSync(stage,release,{recursive:true,errorOnExist:true,force:false});
for(const file of files){const rel=path.relative(stage,file);if(hash(file)!==hash(path.join(release,rel)))throw Error('Delivery differs: '+rel);}
fs.writeFileSync(path.join(release,'使用说明.txt'),'\ufeff'+`无我音乐 1.2.0 — LHL — 评论优化版

双击“无我音乐.exe”运行，请保留整个 win-unpacked 文件夹。
本版继续包含此前播放超时、取消、重试和断流恢复修复。

歌词页评论顶部精简为一行：热门、最新、自动滚动、关闭。
滚动条采用透明轨道和主题细滑块，无原生上下箭头。
开启自动滚动时，已加载和后续评论均完整展开；关闭后恢复手动展开。
悬停、焦点进入、暂停播放或隐藏窗口时仍暂停滚动。
向下浏览继续加载新评论，全部加载后再循环。关闭评论恢复封面。

旧版及配置已备份，原下载路径和本地资料继续有效。
资料目录：%APPDATA%\\KuwoMusicDesktop；本轮不复制测试设置至正式配置。
本机 Windows 10 x64 实测，Windows 11 未单独实测。
SHA256SUMS.txt 为全部文件校验；resources\\hifi\\NOTICE.txt 为 HiFi 版权说明。
`);
fs.copyFileSync(path.join(root,'docs/ACCEPTANCE-COMMENTS-1.2.md'),path.join(release,'评论优化说明.md'));
const manifest=walk(release).sort().map(file=>({file:path.relative(release,file).replaceAll('\\','/'),sha256:hash(file)}));
const manifestFile=path.join(release,'SHA256SUMS.txt');
fs.writeFileSync(manifestFile,manifest.map(r=>`${r.sha256}  ${r.file}`).join('\r\n')+'\r\n');
for(const row of manifest)if(hash(path.join(release,row.file))!==row.sha256)throw Error('Manifest mismatch');
if(hash(formal)!==stateHash)throw Error('Formal profile changed during packaging; inspect concurrent activity');
const report={date:new Date().toISOString(),version:'1.2.0',output:release,backup,formalProfileWritten:false,formalProfileSha256:stateHash,formalMatchesPreChangeBackup:hash(path.join(backup,'state.json'))===stateHash,guiFilesCompared:files.length,manifestFiles:manifest.length,manifestVerified:true,
 artifacts:['无我音乐.exe','resources/app.asar','resources/hifi/mpv.exe'].map(file=>({file,sha256:hash(path.join(release,file)),equalsGuiTestedCopy:true})),
 tests:{automated:73,gui:['compact-toolbar','dark-scrollbar','light-scrollbar','automatic-full-text','manual-expansion-restored','continuous-real-comments','cover-restored']},
 limitations:['Windows 11 not separately tested','Byte-identical C-drive GUI copy used due prior D-drive automation launcher restriction']};
fs.writeFileSync(path.join(evidence,'comments-refined-delivery-120.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
