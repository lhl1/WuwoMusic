import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const stage=path.resolve('artifacts/package-127/win-unpacked'),tested='E:/无我音乐 验证127/win-unpacked',output=path.resolve('release/无我音乐-1.2.7/win-unpacked');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for(const name of ['separation127-regression','separation127-online'])if(JSON.parse(fs.readFileSync(`docs/evidence/${name}.json`,'utf8')).passed!==true)throw Error('Verification failed: '+name);
const log=fs.readFileSync('artifacts/separation127/tests.log'),tests=log.toString(log[0]===255&&log[1]===254?'utf16le':'utf8');if(!tests.includes('pass 125')||!tests.includes('fail 0'))throw Error('Tests did not pass');
if(fs.existsSync(output))throw Error('Delivery exists; inspect before repeating');
const runtime=walk(stage);for(const file of runtime){const relative=path.relative(stage,file);if(hash(file)!==hash(path.join(tested,relative)))throw Error('GUI copy differs: '+relative);}
fs.cpSync(stage,output,{recursive:true,errorOnExist:true,force:false});
for(const file of runtime){const relative=path.relative(stage,file);if(hash(file)!==hash(path.join(output,relative)))throw Error('Delivery differs: '+relative);}
fs.mkdirSync(path.join(output,'evidence'));
fs.copyFileSync('docs/ACCEPTANCE-1.2.7.md',path.join(output,'验证记录.md'));
fs.copyFileSync('docs/ACCOMPANIMENT-1.2.6.md',path.join(output,'ACCOMPANIMENT-1.2.6.md'));
for(const name of ['separation127-regression.json','separation127-online.json','separation127-gui.png','qq126-inspection.json'])fs.copyFileSync(path.join('docs/evidence',name),path.join(output,'evidence',name));
fs.writeFileSync(path.join(output,'使用说明.txt'),'\ufeff'+`无我音乐 1.2.7 · LHL

关闭旧版后，双击“无我音乐.exe”，移动时保留整个 win-unpacked 文件夹。
中文安装、下载和歌曲文件名可正常用于本机 AI 声伴。原设置、歌单、收藏与下载目录继续沿用，不需要更名或清空缓存。
点击底栏音效图标，再选择“伴奏”或“人声”；准备期间继续听原声，就绪后保持位置切换。
如仍失败：面板可重试，处理阶段和引擎输出记录在资料目录 logs/separation.log。
本版通过 125 项测试，实测中文路径下的界面与完整《青花瓷》FLAC 分离。
Windows 10 x64 实测；Windows 11 和实体 DAC 本轮未实测。
具体原因、复现与范围见“验证记录.md”，完整校验见 SHA256SUMS.txt。
源码及使用、构建说明：https://github.com/lhl1/WuwoMusic
`);
const report={date:new Date().toISOString(),version:'1.2.7',output,backup:fs.readFileSync('artifacts/separation127/backup.txt','utf8').replace(/^\ufeff/,'').trim(),runtimeFilesCompared:runtime.length,allRuntimeFilesEqualToGuiCopy:true,automatedTests:125,formalProfileWrittenByQA:false,checks:{oldUnicodeFailureReproduced:true,realUnicodeModelSourceCache:true,packagedUnicodeGui:true,realOnlineSameSong:true,crossVolumeModelCopy:true},limitations:['Windows 11 and physical DAC not tested','Same AI model and output limits as 1.2.6','Independent profile GUI run; user old windows were left running']};
fs.writeFileSync('docs/evidence/delivery-1.2.7.json',JSON.stringify(report,null,2)+'\n');fs.copyFileSync('docs/evidence/delivery-1.2.7.json',path.join(output,'evidence/delivery-1.2.7.json'));
const manifest=walk(output).sort().map(file=>({relative:path.relative(output,file).replaceAll('\\','/'),sha256:hash(file)}));
fs.writeFileSync(path.join(output,'SHA256SUMS.txt'),manifest.map(r=>`${r.sha256}  ${r.relative}`).join('\r\n')+'\r\n');for(const r of manifest)if(hash(path.join(output,r.relative))!==r.sha256)throw Error('Manifest differs: '+r.relative);
console.log(JSON.stringify({version:report.version,output,runtimeFilesCompared:runtime.length,manifestFiles:manifest.length,verified:true}));
