/** Main-process network/audio integration; no desktop/UI automation. */
import {app,session} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {KuwoProvider} from '../electron/provider';
import {mediaResponse} from '../electron/media-proxy';
import {SeparationService} from '../electron/separation';
import type {Track} from '../src/shared';
app.whenReady().then(async()=>{
 const report:any={date:new Date().toISOString(),electron:process.versions.electron,system:process.getSystemVersion(),proxy:'direct'};let service:SeparationService|undefined;
 try{
  await session.defaultSession.setProxy({mode:'direct'});const fetcher=(u:string,i?:RequestInit)=>session.defaultSession.fetch(u,i),p=new KuwoProvider(fetcher),control=new AbortController(),timer=setTimeout(()=>control.abort(),180000);
  try{
   // Reproduce the exact ID from the user's failed playback; search rankings can change.
   const track:Track={id:'6878708',name:'青花瓷',artist:'周杰伦',album:'我很忙',duration:239,qualities:['flac','320k','128k']};
   const source=await p.resolveBest(track,'flac','play',control.signal);assert.ok(!source.trial);report.track={id:track.id,name:track.name,artist:track.artist,duration:track.duration,quality:source.quality,format:source.format};
   service=new SeparationService(path.resolve('artifacts/separation127/下载 音乐'),path.join(process.env.WUWO127_RUNTIME!,'resources/separation'),path.join(process.env.WUWO127_RUNTIME!,'resources/hifi/mpv.exe'),s=>(report.phases??=[]).push({...s,at:Date.now()}));
   const start=performance.now(),file=await service.prepare({key:track.id+'|'+source.quality,signal:control.signal,download:async(file,signal)=>{
    const response=await mediaResponse({url:source.url,signal,refresh:async()=>(await p.resolve(track,source.quality,'play',signal)).url},new Request('kuwo://media/verification',{signal}),fetcher);assert.equal(response.status,200);assert.ok(response.body);const output=await fs.open(file,'wx'),reader=response.body.getReader();let bytes=0;
    try{for(;;){const part=await reader.read();if(part.done)break;signal.throwIfAborted();bytes+=part.value.length;assert.ok(bytes<512*1024**2);await output.write(part.value);}report.sourceBytes=bytes;report.sourceComplete=bytes===Number(response.headers.get('content-length'));}finally{await reader.cancel().catch(()=>{});await output.close();}
   }},'online-verification');
   const h=await fs.open(file,'r'),header=Buffer.alloc(68);try{await h.read(header,0,68,0);}finally{await h.close();}
   report.outputSeconds=header.readUInt32LE(64)/(44100*12);assert.ok(report.outputSeconds>track.duration-8);report.elapsedMs=Math.round(performance.now()-start);report.outputChannels=header.readUInt16LE(22);assert.equal(report.outputChannels,6);assert.ok(report.sourceComplete);report.unicodeCache=true;report.unicodeRuntime=/[^\x00-\x7f]/.test(process.env.WUWO127_RUNTIME!);report.crossVolume=path.parse(path.resolve('artifacts/separation127/下载 音乐')).root!==path.parse(process.env.WUWO127_RUNTIME!).root;report.passed=true;
  }finally{clearTimeout(timer);}
 }catch(e){report.passed=false;report.error=String(e).replace(/https?:\/\/\S+/g,'[url]');}finally{await service?.dispose();await fs.writeFile('docs/evidence/separation127-online.json',JSON.stringify(report,null,2)+'\n');app.exit(report.passed?0:1);}
});
