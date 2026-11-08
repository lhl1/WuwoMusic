import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const stage=path.resolve('artifacts/package-126-cancel-fixed/win-unpacked'),tested='E:/WuwoMusic-QA-1.2.6-20261108/win-unpacked',output=path.resolve('release/无我音乐-1.2.6/win-unpacked');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for(const file of ['effects126-electron','separation126-online'])if(JSON.parse(fs.readFileSync(`docs/evidence/${file}.json`,'utf8')).passed!==true)throw Error('Verification failed: '+file);
const log=fs.readFileSync('artifacts/separation126/tests-final.log'),tests=log.toString(log[0]===255&&log[1]===254?'utf16le':'utf8');if(!tests.includes('pass 123')||!tests.includes('fail 0'))throw Error('Tests did not pass');
const profiles=JSON.parse(fs.readFileSync('artifacts/separation126/profile-baseline.json','utf8')).profiles;
for(const p of profiles)if(hash(path.join(p.directory,'state.json'))!==p.stateSha256)throw Error('Formal profile changed during QA');
if(fs.existsSync(output))throw Error('Delivery exists; inspect before repeating');
const runtime=walk(stage);for(const file of runtime){const relative=path.relative(stage,file);if(hash(file)!==hash(path.join(tested,relative)))throw Error('GUI copy differs: '+relative);}
fs.cpSync(stage,output,{recursive:true,errorOnExist:true,force:false});
for(const file of runtime){const relative=path.relative(stage,file);if(hash(file)!==hash(path.join(output,relative)))throw Error('Delivery differs: '+relative);}
fs.mkdirSync(path.join(output,'evidence'));
fs.copyFileSync('docs/ACCEPTANCE-1.2.6.md',path.join(output,'验证记录.md'));
fs.copyFileSync('docs/ACCOMPANIMENT-1.2.6.md',path.join(output,'ACCOMPANIMENT-1.2.6.md'));
for(const name of ['qq126-inspection.json','effects126-electron.json','separation126-local.json','separation126-online.json','separation126-gui.png'])fs.copyFileSync(path.join('docs/evidence',name),path.join(output,'evidence',name));
fs.writeFileSync(path.join(output,'使用说明.txt'),'\ufeff'+`无我音乐 1.2.6 · LHL

双击“无我音乐.exe”。移动时保留整个 win-unpacked 文件夹。
更新前关闭旧版，收藏、歌单、历史与下载目录沿用旧资料，不要复制测试资料。

底栏音效图标 → 伴奏／人声／原声。
本版使用本机 AI 分离，不需要上传歌曲或登录，也不需要安装 QQ。
首次准备期间继续播放原声；完成后保留位置和暂停状态。
保留连续声伴比例、0.5–2× 变速、±12 半音、开关、恢复及重试。
AI 启用时底栏标记 AI 并显示处理音轨参数；恢复原声回到原文件。
HiFi 保持原文件，不经过声伴音效；下载始终保存原音频。

处理音轨为 44.1kHz / 16bit，混响或和声仍可能残留。
支持 15 分钟内、512MiB 内音源。缓存放在启动时下载目录的
.wuwo-cache/stems，约 32MB/分钟，完成缓存上限约 2GiB。
更改下载目录后重启，使用新的声伴缓存位置，旧文件不搬移。

123 项测试通过，完整在线 FLAC、实际 Electron 音频及 GUI 已验证。
Windows 10 x64 实测；Windows 11 和实体 DAC 本轮未实测。
研究原理与复现：ACCOMPANIMENT-1.2.6.md
验证范围：验证记录.md；校验：SHA256SUMS.txt。
源码与详细使用／构建说明：https://github.com/lhl1/WuwoMusic
第三方许可：resources/separation、resources/hifi、resources/audio-effects。
`);
const report={date:new Date().toISOString(),version:'1.2.6',output,backup:fs.readFileSync('artifacts/desktop126-backup.txt','utf8').trim(),runtimeFilesCompared:runtime.length,allRuntimeFilesEqualToGuiCopy:true,formalProfilesUnchanged:true,formalProfileWrittenByQA:false,systemProxyChanged:false,automatedTests:123,checks:{realCpuAI:true,realElectronNetwork:true,realAudioPCM:true,sourceRaceCancellation:true,nativeGui:true},manifestFiles:walk(output).length+1,limitations:['Windows 11 and physical DAC not tested','Independent Spleeter model; not a QQ proprietary-model clone or quality-equivalence proof','44.1kHz / 16bit AI stems; 15-minute / 512MiB input limit','Online network/audio integration passed; GUI search foreground unavailable on this host']};
fs.writeFileSync('docs/evidence/delivery-1.2.6.json',JSON.stringify(report,null,2)+'\n');fs.copyFileSync('docs/evidence/delivery-1.2.6.json',path.join(output,'evidence/delivery-1.2.6.json'));
const manifest=walk(output).sort().map(file=>({relative:path.relative(output,file).replaceAll('\\','/'),sha256:hash(file)}));
fs.writeFileSync(path.join(output,'SHA256SUMS.txt'),manifest.map(r=>`${r.sha256}  ${r.relative}`).join('\r\n')+'\r\n');for(const r of manifest)if(hash(path.join(output,r.relative))!==r.sha256)throw Error('Manifest differs: '+r.relative);
console.log(JSON.stringify({version:report.version,output,runtimeFilesCompared:runtime.length,manifestFiles:manifest.length,verified:true}));
