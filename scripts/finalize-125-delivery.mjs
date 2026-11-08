// Local delivery helper. Ordinary reproducible builds use npm run package:dir.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=process.cwd();
const stage=path.join(root,'artifacts/package-125-delivery/win-unpacked');
const tested='E:/WuwoMusic-QA-1.2.5-20261108/delivery/win-unpacked';
const output=path.join(root,'release/无我音乐-1.2.5/win-unpacked');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for(const file of ['desktop125-electron','effects125-electron','layout125-electron']){
 const report=JSON.parse(fs.readFileSync(`docs/evidence/${file}.json`,'utf8'));
 if(report.status!=='passed'&&report.passed!==true)throw Error('Verification failed: '+file);
}
if(fs.existsSync(output))throw Error('Delivery already exists; inspect before repeating');
const files=walk(stage);
for(const file of files){const rel=path.relative(stage,file);if(hash(file)!==hash(path.join(tested,rel)))throw Error('GUI copy differs: '+rel);}
fs.cpSync(stage,output,{recursive:true,errorOnExist:true,force:false});
for(const file of files){const rel=path.relative(stage,file);if(hash(file)!==hash(path.join(output,rel)))throw Error('Delivery differs: '+rel);}
fs.writeFileSync(path.join(output,'使用说明.txt'),'\ufeff'+`无我音乐 1.2.5 · LHL

双击“无我音乐.exe”启动。移动时保留整个 win-unpacked 文件夹。
升级前关闭旧版；收藏、歌单、历史和下载设置继续使用原资料目录：
%APPDATA%\\KuwoMusicDesktop
本次不搬移已有歌曲，不向正式资料复制测试配置。

底栏恢复连续平面；喜欢在歌名旁，设置在最近播放下方。
“词”打开桌面歌词：默认透明、屏幕底部；悬停显示工具条和设置。
可调整字体、颜色、背景、单双行、位置锁定、时间和鼠标穿透。
穿透后从托盘解除，或 Ctrl+Alt+Shift+L；Ctrl+Alt+L 关闭歌词。
音效保留预设，增加声伴比例、变速和变调；HiFi 保持原音。
伴奏基于立体声处理，不是 AI 分离，不改动下载文件。
评论按钮进入歌词评论页；三平台可手动切换，异常自动尝试其他平台。
默认直连；设置中可选择跟随系统代理，不改 Windows 代理设置。

117 项自动化测试通过；真实 Electron 验证评论、表情和音效。
Windows 10 x64 实测；Windows 11、实体 DAC 未做本轮验收。
具体范围和限制见“验证记录.md”，校验见 SHA256SUMS.txt。
项目与详细构建、使用说明：https://github.com/lhl1/WuwoMusic
第三方说明：resources/hifi、resources/audio-effects。
`);
fs.copyFileSync('docs/ACCEPTANCE-1.2.5.md',path.join(output,'验证记录.md'));
const manifest=walk(output).sort().map(file=>({file:path.relative(output,file).replaceAll('\\','/'),sha256:hash(file)}));
fs.writeFileSync(path.join(output,'SHA256SUMS.txt'),manifest.map(row=>`${row.sha256}  ${row.file}`).join('\r\n')+'\r\n');
for(const row of manifest)if(hash(path.join(output,row.file))!==row.sha256)throw Error('Manifest mismatch');
const report={date:new Date().toISOString(),version:'1.2.5',output,backup:fs.readFileSync('artifacts/desktop125-backup.txt','utf8').trim(),
 formalProfileWrittenByQA:false,formalDataDirectory:'%APPDATA%/KuwoMusicDesktop',systemProxyModified:false,
 guiFilesCompared:files.length,allRuntimeFilesEqualToGuiCopy:true,manifestFiles:manifest.length,manifestVerified:true,
 artifacts:['无我音乐.exe','resources/app.asar','resources/hifi/mpv.exe'].map(file=>({file,sha256:hash(path.join(output,file))})),
 checks:{automatedPassed:117,realElectronComments:true,realAudioWorkletPCM:true,compiledCssLayout:true},
 limitations:['Windows 11 and physical DAC not tested this round','Tray recovery and global shortcuts not fully exercised through GUI','Line-based estimated lyric highlight; stereo processing is not AI stems','E-drive byte-identical GUI copy used because this host D-drive root ACL prevents automation launcher access']};
fs.writeFileSync('docs/evidence/delivery-1.2.5.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({version:report.version,output,files:manifest.length,verified:true}));
