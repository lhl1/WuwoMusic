import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import type {SeparationProgress} from '../src/shared';

export const SEPARATION_VERSION='spleeter-2stems-fp16-v1';
export interface SeparationInput {file?:string;key:string;signal?:AbortSignal;download?:(file:string,signal:AbortSignal)=>Promise<void>}
type Progress=(state:SeparationProgress)=>void;
const MAX_DURATION=15*60, MAX_CACHE=2*1024**3;
async function validCachedWav(file:string){const h=await fs.open(file,'r');try{const stat=await h.stat(),b=Buffer.alloc(68);await h.read(b,0,68,0);return b.toString('ascii',0,4)==='RIFF'&&b.readUInt16LE(22)===6&&b.readUInt32LE(24)===44100&&b.toString('ascii',60,64)==='data'&&b.readUInt32LE(64)+68===stat.size&&stat.size>68;}finally{await h.close();}}

/** Run only packaged, fixed executables. Abort kills the worker and waits for its exit. */
export function runAudioWorker(executable:string,args:string[],signal:AbortSignal,timeout=8*60_000):Promise<void>{
 signal.throwIfAborted();
 return new Promise((resolve,reject)=>{
  const child=spawn(executable,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});let tail='',failure:Error|undefined;
  const abort=()=>{failure=signal.reason instanceof Error?signal.reason:Error('声伴处理已取消');child.kill();};
  const timer=setTimeout(()=>{failure=Error('声伴处理超时，请重试或选择较短的歌曲');child.kill();},timeout);
  signal.addEventListener('abort',abort,{once:true});
  child.stderr.on('data',b=>{tail=(tail+b.toString()).slice(-2000);});
  const clean=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);};
  child.once('error',e=>{clean();reject(Error('声伴引擎无法启动：'+e.message));});
  child.once('close',code=>{clean();if(failure)reject(failure);else if(code!==0)reject(Error('声伴引擎处理失败'+(tail.includes('bad_alloc')?'，内存不足':'（'+code+'）')));else resolve();});
 });
}

export interface WavLayout {offset:number;bytes:number;rate:number;channels:number;bits:number;frames:number}
export async function pcmWav(file:string):Promise<WavLayout>{
 const h=await fs.open(file,'r');try{
  const stat=await h.stat(),header=Buffer.alloc(12);await h.read(header,0,12,0);
  if(header.toString('ascii',0,4)!=='RIFF'||header.toString('ascii',8,12)!=='WAVE')throw Error('声伴音轨不是有效的 WAV');
  let at=12,rate=0,channels=0,bits=0,format=0;
  while(at+8<=stat.size){const chunk=Buffer.alloc(8);await h.read(chunk,0,8,at);const id=chunk.toString('ascii',0,4),size=chunk.readUInt32LE(4);at+=8;
   if(id==='fmt '){if(size<16||size>65536)throw Error('声伴音轨格式无效');const fmt=Buffer.alloc(size);await h.read(fmt,0,size,at);format=fmt.readUInt16LE(0);channels=fmt.readUInt16LE(2);rate=fmt.readUInt32LE(4);bits=fmt.readUInt16LE(14);if(format===0xfffe&&size>=40)format=fmt.readUInt16LE(24);}
   if(id==='data'){if(format!==1||bits!==16||channels!==2||rate!==44100||size<4||size%4||at+size>stat.size)throw Error('声伴音轨格式或长度不正确');return {offset:at,bytes:size,rate,channels,bits,frames:size/4};}
   at+=size+(size%2);
  }throw Error('声伴音轨缺少音频数据');
 }finally{await h.close();}
}

/** Dry L/R, vocals L/R, accompaniment L/R share one media clock, including seeking. */
export async function interleaveStems(dry:string,vocals:string,accompaniment:string,out:string,signal:AbortSignal){
 const files=[dry,vocals,accompaniment],layouts=await Promise.all(files.map(pcmWav)),frames=layouts[0].frames;
 if(frames/44100>MAX_DURATION)throw Error('声伴处理暂支持 15 分钟以内的歌曲');
 if(layouts.some(w=>Math.abs(w.frames-frames)>441))throw Error('声伴音轨长度不匹配，已保留原声');
 const handles=await Promise.all(files.map(f=>fs.open(f,'r'))),output=await fs.open(out,'wx');
 try{
  const bytes=frames*12,header=Buffer.alloc(68);header.write('RIFF');header.writeUInt32LE(bytes+60,4);header.write('WAVEfmt ',8);header.writeUInt32LE(40,16);header.writeUInt16LE(0xfffe,20);header.writeUInt16LE(6,22);header.writeUInt32LE(44100,24);header.writeUInt32LE(44100*12,28);header.writeUInt16LE(12,32);header.writeUInt16LE(16,34);header.writeUInt16LE(22,36);header.writeUInt16LE(16,38);header.writeUInt32LE(0x3f,40);Buffer.from('0100000000001000800000aa00389b71','hex').copy(header,44);header.write('data',60);header.writeUInt32LE(bytes,64);await output.write(header);
  const batch=16384,buffers=files.map(()=>Buffer.alloc(batch*4)),mixed=Buffer.alloc(batch*12);
  for(let at=0;at<frames;at+=batch){signal.throwIfAborted();const n=Math.min(batch,frames-at);buffers.forEach(b=>b.fill(0));
   await Promise.all(handles.map((h,i)=>h.read(buffers[i],0,Math.min(n,Math.max(0,layouts[i].frames-at))*4,layouts[i].offset+at*4)));
   for(let j=0;j<n;j++)for(let k=0;k<3;k++)buffers[k].copy(mixed,j*12+k*4,j*4,j*4+4);
   await output.write(mixed,0,n*12);
  }await output.sync();
 }finally{await Promise.all([...handles.map(h=>h.close()),output.close()]);}
 return {duration:frames/44100,bytes:frames*12+68};
}

export class SeparationService {
 private active?:{id:string;controller:AbortController;promise:Promise<string>};
 private pinned?:string;
 constructor(private directory:string,private resources:string,private mpv:string,private progress:Progress){}
 cancel(id?:string){if(!id||this.active?.id===id)this.active?.controller.abort(new DOMException('声伴处理已取消','AbortError'));}
 async dispose(){this.cancel();await this.active?.promise.catch(()=>{});}
 prepare(input:SeparationInput,id:string):Promise<string>{
  if(!/^[a-zA-Z0-9-]{1,80}$/.test(id))return Promise.reject(Error('无效的声伴请求'));
  if(this.active?.id===id)return this.active.promise;
  const previous=this.active?.promise;this.cancel();const controller=new AbortController();
  const signal=input.signal?AbortSignal.any([input.signal,controller.signal]):controller.signal;
  const timer=setTimeout(()=>controller.abort(Error('声伴准备超时，请检查网络后重试')),10*60_000);
  const promise=(async()=>{await previous?.catch(()=>{});signal.throwIfAborted();return this.process(input,id,signal);})().catch(e=>{if(e?.code==='ENOSPC')throw Error('音乐下载目录的磁盘空间不足，声伴未启用');if(e?.code==='EACCES'||e?.code==='EPERM')throw Error('声伴缓存无法写入，请检查音乐下载目录的权限');throw e;}).finally(()=>clearTimeout(timer));
  this.active={id,controller,promise};void promise.finally(()=>{if(this.active?.id===id)this.active=undefined;}).catch(()=>{});return promise;
 }
 private async process(input:SeparationInput,id:string,signal:AbortSignal){
  const send=(phase:SeparationProgress['phase'])=>{signal.throwIfAborted();this.progress({id,phase});};
  await fs.mkdir(this.directory,{recursive:true});
  const identity=input.file?input.key+JSON.stringify(await fs.stat(input.file).then(s=>[s.size,s.mtimeMs])):input.key;
  const key=createHash('sha256').update(SEPARATION_VERSION+'|'+identity).digest('hex'),final=path.join(this.directory,key+'.wav');
  try{if(await validCachedWav(final)){signal.throwIfAborted();await fs.utimes(final,new Date(),new Date());this.pinned=final;send('ready');return final;}}catch{}
  const job=path.join(this.directory,'job-'+randomUUID());await fs.mkdir(job);let completed=false;
  try{
   send('fetching');const original=input.file??path.join(job,'source.audio');if(!input.file){if(!input.download)throw Error('当前音源无法用于声伴处理');await input.download(original,signal);}
   send('decoding');const dry=path.join(job,'dry.wav');
   await runAudioWorker(this.mpv,['--no-config','--no-video','--end=901','--audio-samplerate=44100','--audio-channels=stereo','--of=wav','--oac=pcm_s16le','--o='+dry,'--',original],signal);
   const layout=await pcmWav(dry);if(layout.frames/44100>MAX_DURATION)throw Error('声伴处理暂支持 15 分钟以内的歌曲');
   const space=await fs.statfs(job);if(space.bavail*space.bsize<layout.bytes*5+64*1024**2)throw Error('音乐下载目录空间不足，无法准备声伴缓存');
   send('separating');const vocals=path.join(job,'vocals.wav'),accompaniment=path.join(job,'accompaniment.wav');
   await runAudioWorker(path.join(this.resources,'sherpa-onnx-offline-source-separation.exe'),['--print-args=false','--num-threads=2','--spleeter-vocals='+path.join(this.resources,'vocals.fp16.onnx'),'--spleeter-accompaniment='+path.join(this.resources,'accompaniment.fp16.onnx'),'--input-wav='+dry,'--output-vocals-wav='+vocals,'--output-accompaniment-wav='+accompaniment],signal);
   send('mixing');const mixed=path.join(job,'mix.wav');await interleaveStems(dry,vocals,accompaniment,mixed,signal);signal.throwIfAborted();await fs.rename(mixed,final);this.pinned=final;completed=true;send('ready');return final;
  }finally{
   // job is a freshly created, private direct child; never remove an arbitrary input path.
   if(path.dirname(path.resolve(job))===path.resolve(this.directory)&&path.basename(job).startsWith('job-'))await fs.rm(job,{recursive:true,force:true}).catch(()=>{});
   if(completed)await this.prune().catch(()=>{});
  }
 }
 private async prune(){const entries=(await fs.readdir(this.directory)).filter(n=>/^[a-f0-9]{64}\.wav$/.test(n));const stats=await Promise.all(entries.map(async name=>({file:path.join(this.directory,name),...await fs.stat(path.join(this.directory,name))})));let total=stats.reduce((n,s)=>n+s.size,0);for(const item of stats.sort((a,b)=>a.mtimeMs-b.mtimeMs)){if(total<=MAX_CACHE)break;if(item.file===this.pinned)continue;await fs.unlink(item.file);total-=item.size;}}
}
