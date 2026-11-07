import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseFile } from 'music-metadata';
import type { DownloadTask, Quality, ResolvedAudio, Track, MvSource } from '../src/shared';
import type { Store } from './storage';
import { isMediaUrl, MusicError, UA, type Fetcher, type KuwoProvider } from './provider';

export function safeFilename(name:string):string {
  let value=name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').trim().slice(0,120).replace(/[. ]+$/,'');
  if(!value) value='未命名';
  if(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(value)) value=`_${value}`;
  return value;
}
export function resumePlan(status:number, contentRange:string|null, offset:number, etag?:string, previousEtag?:string):{append:boolean; total?:number} {
  if(status===206) {
    const m=contentRange?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
    if(!m || Number(m[1])!==offset || Number(m[2])<offset || Number(m[3])<=Number(m[2])) throw new MusicError('RANGE','续传响应范围不正确，请重试');
    if(etag && previousEtag && etag!==previousEtag) throw new MusicError('CHANGED','远程文件已经变化，请重新下载');
    return {append:offset>0,total:Number(m[3])};
  }
  if(status===200) return {append:false};
  throw new MusicError('HTTP',`下载请求失败（HTTP ${status}）`);
}
export async function validateAudio(filename:string, track:Track, quality:Quality, expectedDuration?:number) {
  const metadata=await parseFile(filename,{duration:true});
  if(!metadata.format.hasAudio || !metadata.format.duration || metadata.format.duration<0.5) throw new MusicError('INVALID_AUDIO','收到的文件不是有效音频');
  const duration=expectedDuration || track.duration;
  if(duration>15 && metadata.format.duration < duration-Math.max(5,duration*0.04)) throw new MusicError('TRUNCATED','音频时长不足，可能是试听片段，未保存为完整歌曲');
  if(quality==='flac' && !/FLAC/i.test(metadata.format.container ?? '')) throw new MusicError('QUALITY','服务未返回所选 FLAC 音质');
  if(quality==='320k' && (metadata.format.bitrate ?? 0)<280000) throw new MusicError('QUALITY','服务未返回所选 320 kbps 音质，请尝试标准音质');
  const format=/FLAC/i.test(metadata.format.container??'')?'flac':/WAVE/i.test(metadata.format.container??'')?'wav':/ADTS|AAC/i.test(metadata.format.container??'')?'aac':/M4A|MP4/i.test(metadata.format.container??'')?'m4a':/MPEG/i.test(metadata.format.container??'')?'mp3':/Ogg/i.test(metadata.format.container??'')?'ogg':null;
  if(!format) throw new MusicError('FORMAT','收到暂不支持的音频格式');
  return {format,duration:metadata.format.duration};
}

export async function validateVideo(filename:string){
  const info=await parseFile(filename,{duration:true});if(!info.format.hasVideo||!info.format.duration||info.format.duration<0.5)throw new MusicError('INVALID_VIDEO','收到的文件不是有效 MV');
  return {format:'mp4',duration:info.format.duration};
}
export class DownloadManager {
  private active=new Map<string,AbortController>();
  private stopping=false;
  constructor(private store:Store, private provider:Pick<KuwoProvider,'resolve'>&Partial<Pick<KuwoProvider,'resolveBest'>>,private fetcher:Fetcher, private changed:(tasks:DownloadTask[])=>void=()=>{},private mvResolver?:(track:Track)=>Promise<MvSource>) {}
  publish(){this.store.save();this.changed(structuredClone(this.store.data.tasks));}
  enqueue(tracks:Track[],quality:Quality,media:'audio'|'mv'='audio'){
    const result:DownloadTask[]=[];
    for(const track of tracks) {
      if(track.localPath) continue;
      const previous=this.store.data.tasks.find(t=>t.track.id===track.id && (t.media??'audio')===media && (media==='mv'||(t.requestedQuality??t.quality)===quality) && !['cancelled','failed'].includes(t.status) && (t.status!=='completed'||Boolean(t.path&&fs.existsSync(t.path))));
      if(previous){result.push(previous);continue;}
      const task:DownloadTask={id:randomUUID(),track,quality,media,requestedQuality:quality,status:'queued',received:0,total:0,speed:0,created:Date.now()};
      this.store.data.tasks.unshift(task);result.push(task);
    }
    this.publish();this.pump();return structuredClone(result);
  }
  async action(id:string,action:'pause'|'resume'|'cancel'|'retry') {
    const t=this.store.data.tasks.find(t=>t.id===id);
    if(!t) throw new Error('下载任务不存在');
    if(action==='pause' && ['queued','resolving','downloading'].includes(t.status)){t.status='paused';t.speed=0;this.active.get(id)?.abort();}
    if((action==='resume' && t.status==='paused') || (action==='retry' && ['failed','cancelled'].includes(t.status))){t.status='queued';t.error=undefined;}
    if(action==='cancel' && t.status!=='completed'){t.status='cancelled';t.speed=0;this.active.get(id)?.abort();if(!this.active.has(id))await this.removePart(t);}
    this.publish();this.pump();
  }
  private async removePart(t:DownloadTask){if(t.partPath){await fsp.rm(t.partPath,{force:true}).catch(()=>{});t.partPath=undefined;t.received=0;t.total=0;}}
  pump(){
    if(this.stopping)return;
    const limit=Math.max(1,Math.min(6,this.store.data.settings.concurrency));
    for(const t of this.store.data.tasks.filter(t=>t.status==='queued').sort((a,b)=>a.created-b.created)) {
      if(this.active.size>=limit)break;
      if(this.active.has(t.id))continue;
      const controller=new AbortController();this.active.set(t.id,controller);
      void this.run(t,controller).finally(async()=>{this.active.delete(t.id);if(t.status==='cancelled')await this.removePart(t);this.publish();this.pump();});
    }
  }
  private async run(t:DownloadTask,controller:AbortController){
    try{
      for(let attempt=0;attempt<3;attempt++){
        try{await this.transfer(t,controller);return;}
        catch(e){
          if(controller.signal.aborted) return;
          const err=e as Error;
          const transient=!(e instanceof MusicError) || ['NETWORK','HTTP','CHANGED','RANGE'].includes(e.code);
          if(!transient || attempt===2)throw e;
          if(e instanceof MusicError && ['CHANGED','RANGE'].includes(e.code))await this.removePart(t);
          t.error=`连接中断，正在重试 ${attempt+1}/2`;
          this.publish();
          await new Promise<void>(resolve=>{const timer=setTimeout(done,700*(attempt+1));function done(){clearTimeout(timer);controller.signal.removeEventListener('abort',done);resolve();}controller.signal.addEventListener('abort',done,{once:true});});
          if(controller.signal.aborted)return;
        }
      }
    }catch(e){if(!controller.signal.aborted){t.status='failed';t.error=(e as Error).message;t.speed=0;}}
  }
  private async transfer(t:DownloadTask,controller:AbortController){
    t.status='resolving';t.error=undefined;this.publish();
    const preferred=t.requestedQuality??t.quality;
    let audio:ResolvedAudio;
    if(t.media==='mv'){
      if(!this.mvResolver)throw new MusicError('MV','MV 下载不可用');
      const video=await this.mvResolver(t.track);
      if(t.videoQuality&&t.videoQuality!==video.quality){await this.removePart(t);t.etag=undefined;t.modified=undefined;}
      t.videoQuality=video.quality;t.videoBitrate=video.bitrate;audio={url:video.url,format:'mp4',quality:t.quality,trial:false};
    }else audio=await (this.provider.resolveBest?this.provider.resolveBest(t.track,preferred,'download'):this.provider.resolve(t.track,preferred,'download'));
    if(controller.signal.aborted)return;
    if(audio.quality!==t.quality){await this.removePart(t);t.etag=undefined;t.modified=undefined;t.requestedQuality=preferred;t.quality=audio.quality;this.publish();}
    if(audio.trial)throw new MusicError('TRIAL','试听片段不能保存为完整歌曲');
    if(!isMediaUrl(audio.url))throw new MusicError('URL','不支持的音频来源');
    const directory=t.partPath?path.dirname(t.partPath):this.store.data.settings.downloadDir;
    await fsp.mkdir(directory,{recursive:true});
    const stem=safeFilename(`${t.track.artist} - ${t.track.name} [${t.track.id} ${t.media==='mv'?'MV '+t.videoQuality:t.quality}]`);
    const initialPath=path.join(directory,`${stem}.${audio.format}`);
    if(fs.existsSync(initialPath)){
      await this.validate(t,initialPath,audio.duration);
      t.path=initialPath;t.format=audio.format;t.status='completed';t.received=t.total=(await fsp.stat(initialPath)).size;this.addToLibrary(t);return;
    }
    t.partPath=t.partPath ?? path.join(directory,`.${stem}.${t.id}.part`);
    let offset=await fsp.stat(t.partPath).then(s=>s.size).catch(()=>0);
    // An EOF reached just before a pause can be completed without an invalid bytes=EOF request.
    if(offset>0 && t.total>0 && offset===t.total){
      try{await this.finish(t,audio,directory,stem);return;}catch{await this.removePart(t);t.partPath=path.join(directory,`.${stem}.${t.id}.part`);offset=0;}
    }
    const headers:Record<string,string>={'User-Agent':UA,...audio.headers};
    if(offset>0){headers.Range=`bytes=${offset}-`;if(t.etag || t.modified)headers['If-Range']=t.etag || t.modified!;}
    const transferController=new AbortController();
    const signal=AbortSignal.any([controller.signal,transferController.signal]);
    const timeout=()=>transferController.abort(new Error('下载连接超时'));
    let timer=setTimeout(timeout,30000);
    let response:Response;
    try {response=await this.fetcher(audio.url,{headers,signal});} finally {clearTimeout(timer);}
    const plan=resumePlan(response.status,response.headers.get('content-range'),offset,response.headers.get('etag')??undefined,t.etag);
    if(!plan.append)offset=0;
    const length=Number(response.headers.get('content-length'));
    t.total=plan.total ?? (length>0?offset+length:0);t.received=offset;
    t.etag=response.headers.get('etag')??undefined;t.modified=response.headers.get('last-modified')??undefined;
    if(!response.body)throw new MusicError('HTTP','服务器未返回音频内容');
    if(!(t.media==='mv'?/video|octet-stream/:/audio|octet-stream/).test(response.headers.get('content-type')??''))throw new MusicError('INVALID_AUDIO',t.media==='mv'?'下载服务没有返回视频文件':'下载服务没有返回音频文件');
    t.status='downloading';this.publish();
    const file=await fsp.open(t.partPath,plan.append?'a':'w');
    const reader=response.body.getReader();let tick=Date.now(),previous=offset;
    try{
      while(true){
        if(controller.signal.aborted)throw controller.signal.reason;
        timer=setTimeout(timeout,30000);
        let item:ReadableStreamReadResult<Uint8Array>;
        try{item=await reader.read();}finally{clearTimeout(timer);}
        if(item.done)break;
        // FileHandle.write may perform a short write; consume the complete buffer.
        let written=0;
        while(written<item.value.length){const r=await file.write(item.value,written,item.value.length-written);written+=r.bytesWritten;}
        t.received+=item.value.length;
        if(Date.now()-tick>=700){t.speed=(t.received-previous)*1000/(Date.now()-tick);tick=Date.now();previous=t.received;this.publish();}
      }
      await file.sync();
    }finally{clearTimeout(timer);reader.releaseLock();await file.close();}
    if(controller.signal.aborted)return;
    if(t.total && t.received!==t.total)throw new MusicError('HTTP','文件传输不完整，将尝试续传');
    await this.finish(t,audio,directory,stem);
  }
  private validate(t:DownloadTask,filename:string,duration?:number){return t.media==='mv'?validateVideo(filename):validateAudio(filename,t.track,t.quality,duration);}
  private async finish(t:DownloadTask,audio:ResolvedAudio,directory:string,stem:string){
    const check=await this.validate(t,t.partPath!,audio.duration);
    const destination=path.join(directory,`${stem}.${check.format}`);
    // link is an atomic no-overwrite commit on the same filesystem.
    try{await fsp.link(t.partPath!,destination);}catch(e){
      if((e as NodeJS.ErrnoException).code==='EEXIST')await this.validate(t,destination,audio.duration);
      else if(['ENOTSUP','EPERM','EXDEV','ENOSYS'].includes((e as NodeJS.ErrnoException).code??'')){
        // exFAT and some removable/network volumes do not support hard links.
        try{await fsp.copyFile(t.partPath!,destination,fs.constants.COPYFILE_EXCL);}catch(copyError){
          if((copyError as NodeJS.ErrnoException).code!=='EEXIST')throw copyError;
          await this.validate(t,destination,audio.duration);
        }
      }else throw e;
    }
    await fsp.unlink(t.partPath!);t.partPath=undefined;t.path=destination;t.format=check.format;
    t.status='completed';t.total=t.received=(await fsp.stat(destination)).size;t.speed=0;t.error=undefined;t.track.duration=check.duration;
    this.addToLibrary(t);
  }
  private addToLibrary(t:DownloadTask){
    if(t.media==='mv')return;
    const track={...t.track,localPath:t.path,availability:'available' as const};
    const local=this.store.data.library.local;
    if(!local.some(x=>x.localPath===t.path))local.unshift(track);
  }
  async shutdown(){this.stopping=true;for(const [id,c]of this.active){const t=this.store.data.tasks.find(t=>t.id===id)!;t.status='paused';t.speed=0;c.abort();}this.publish();const deadline=Date.now()+5000;while(this.active.size && Date.now()<deadline)await new Promise(r=>setTimeout(r,30));this.publish();}
}
