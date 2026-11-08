import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {interleaveStems,pcmWav,runAudioWorker,SeparationService} from '../electron/separation';
import {stemWeights} from '../src/vocal-effects';

function wave(values:number[][],frames=values.length){const b=Buffer.alloc(44+frames*4);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(44100,24);b.writeUInt32LE(176400,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(frames*4,40);for(let i=0;i<frames;i++)for(let c=0;c<2;c++)b.writeInt16LE(values[i%values.length][c],44+i*4+c*2);return b;}
async function temporary(){await fs.mkdir('artifacts/tests126',{recursive:true});return fs.mkdtemp(path.resolve('artifacts/tests126/case-'));}

test('AI mix selects independent stems without cancelling a mono original',()=>{
 for(const value of [-5,-1,-.3,0,.4,1,9,NaN]){const w=stemWeights(value);assert.ok(w.every(n=>n>=0&&n<=1));assert.ok(Math.abs(w.reduce((a,b)=>a+b,0)-1)<1e-12);}
 assert.deepEqual(stemWeights(1),[0,0,1]);assert.deepEqual(stemWeights(-1),[0,1,0]);assert.deepEqual(stemWeights(.5),[.5,0,.5]);assert.deepEqual(stemWeights(1,false),[1,0,0]);
});
test('six-channel WAV preserves exact stereo pairs and timing, across write batches',async()=>{
 const dir=await temporary(),files=['dry','vocal','accomp'].map(n=>path.join(dir,n+'.wav'));
 try{await Promise.all(files.map((f,i)=>fs.writeFile(f,wave([[100+i,200+i],[-10-i,-20-i]],16387))));const out=path.join(dir,'six.wav');const result=await interleaveStems(...files as [string,string,string],out,new AbortController().signal),b=await fs.readFile(out);
  assert.equal(b.readUInt16LE(22),6);assert.equal(b.length,68+16387*12);assert.equal(result.duration,16387/44100);
  for(const i of [0,1,16383,16384,16386])assert.deepEqual(Array.from({length:6},(_,j)=>b.readInt16LE(68+i*12+j*2)),i%2?[-10,-20,-11,-21,-12,-22]:[100,200,101,201,102,202]);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('reject truncated and mismatched WAVs; cancellation never completes a mix',async()=>{
 const dir=await temporary();try{const a=path.join(dir,'a.wav'),b=path.join(dir,'b.wav');await fs.writeFile(a,wave([[1,1]],1000));await fs.writeFile(b,wave([[2,2]],1));await assert.rejects(interleaveStems(a,b,a,path.join(dir,'out.wav'),new AbortController().signal),/长度不匹配/);await fs.writeFile(b,(await fs.readFile(a)).subarray(0,50));await assert.rejects(pcmWav(b),/长度不正确/);const controller=new AbortController();controller.abort();await assert.rejects(interleaveStems(a,a,a,path.join(dir,'aborted.wav'),controller.signal),{name:'AbortError'});}finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('native worker cancellation and exit failures settle without orphan work',async()=>{
 const control=new AbortController(),job=runAudioWorker(process.execPath,['-e','setTimeout(()=>{},20000)'],control.signal);setTimeout(()=>control.abort(),50);await assert.rejects(job,{name:'AbortError'});await assert.rejects(runAudioWorker(process.execPath,['-e','process.exit(2)'],new AbortController().signal),/处理失败/);
});
test('real bundled AI: mono music survives accompaniment; repeated playback uses cache',async()=>{
 const dir=await temporary(),input=path.join(dir,'mono.wav'),signal=new AbortController().signal;
 const frames=44100*3,values=Array.from({length:frames},(_,i)=>{const v=Math.round(3500*Math.sin(i*2*Math.PI*220/44100)+2000*Math.sin(i*2*Math.PI*330/44100));return [v,v];});await fs.writeFile(input,wave(values));
 const phases:string[]=[],service=new SeparationService(path.join(dir,'cache'),path.resolve('build/separation'),path.resolve('build/hifi/mpv.exe'),s=>phases.push(s.phase));
 try{const result=await service.prepare({file:input,key:'fixture',signal},'first'),data=await fs.readFile(result);let energy=0;for(let at=68+8;at<data.length;at+=12)energy+=data.readInt16LE(at)**2;assert.ok(energy>1e6,'mono accompaniment must not disappear as it did with L−R');assert.ok(phases.includes('separating'));phases.length=0;assert.equal(await service.prepare({file:input,key:'fixture',signal},'second'),result);assert.deepEqual(phases,['ready']);assert.ok(!(await fs.readdir(path.join(dir,'cache'))).some(n=>n.startsWith('job-')));
 }finally{await service.dispose();await fs.rm(dir,{recursive:true,force:true});}
});

test('a new song cancels the previous preparation before writing its own cache',async()=>{
 const dir=await temporary(),input=path.join(dir,'next.wav');await fs.writeFile(input,wave([[300,300],[-300,-300]],44100));
 let fetching!:()=>void;const started=new Promise<void>(r=>{fetching=r;}),service=new SeparationService(path.join(dir,'cache'),path.resolve('build/separation'),path.resolve('build/hifi/mpv.exe'),s=>{if(s.id==='old'&&s.phase==='fetching')fetching();});
 try{const old=service.prepare({key:'old',download:async(_file,signal)=>new Promise<void>((_,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});})},'old'),rejected=assert.rejects(old,{name:'AbortError'});await started;const next=await service.prepare({key:'next',file:input},'new');await rejected;assert.ok((await fs.stat(next)).size>68);assert.equal((await fs.readdir(path.join(dir,'cache'))).length,1);}finally{await service.dispose();await fs.rm(dir,{recursive:true,force:true});}
});

test('real native AI accepts Chinese install/cache/source paths with spaces and symbols',async()=>{
 const root=await temporary(),dir=path.join(root,'中文 安装与缓存 🎵'),resources=path.join(dir,'引擎 模型'),cache=path.join(dir,'下载 音乐'),input=path.join(dir,'月亮照山川 & 测试.wav');
 await fs.mkdir(dir);await fs.cp(path.resolve('build/separation'),resources,{recursive:true});await fs.writeFile(input,wave([[1000,1000],[-1000,-1000]],44100));
 const events:unknown[]=[],service=new SeparationService(cache,resources,path.resolve('build/hifi/mpv.exe'),()=>{},(event,fields)=>events.push({event,...fields}));
 try{const output=await service.prepare({file:input,key:'unicode-path'},'unicode');assert.ok((await fs.stat(output)).size>68);assert.deepEqual(events,[]);assert.equal((await fs.readdir(cache)).length,1,'private model links/copies must be cleaned');}
 finally{await service.dispose();await fs.rm(root,{recursive:true,force:true});}
});

test('worker errors retain stage, exit code and bounded output for diagnostics',async()=>{
 const events:{event:string;fields:Record<string,unknown>}[]=[];
 await assert.rejects(runAudioWorker(process.execPath,['-e',"console.log('x'.repeat(5000));console.error('model failed https://example.com/private-token');process.exit(7)"],new AbortController().signal,5000,{stage:'AI 分离',diagnostic:(event,fields)=>events.push({event,fields})}),/AI 分离失败（退出码 7）/);
 assert.equal(events.length,1);assert.equal(events[0].event,'worker-failed');assert.equal(events[0].fields.code,7);assert.equal(events[0].fields.stage,'AI 分离');const output=String(events[0].fields.output);assert.ok(output.length<=4000);assert.ok(output.includes('model failed'));assert.ok(!output.includes('private-token'));
});
