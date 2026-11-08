/** Main-process network/audio integration; no desktop/UI automation. */
import {app,session} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {KuwoProvider} from '../electron/provider';
import {mediaResponse} from '../electron/media-proxy';
import {SeparationService} from '../electron/separation';
app.whenReady().then(async()=>{
 const report:any={date:new Date().toISOString(),electron:process.versions.electron,system:process.getSystemVersion(),proxy:'direct'};let service:SeparationService|undefined;
 try{
  await session.defaultSession.setProxy({mode:'direct'});const fetcher=(u:string,i?:RequestInit)=>session.defaultSession.fetch(u,i),p=new KuwoProvider(fetcher),control=new AbortController(),timer=setTimeout(()=>control.abort(),180000);
  try{
   const result=await p.search('晴天 周杰伦'),track=result.tracks.find(t=>t.name==='晴天'&&t.artist==='周杰伦');assert.ok(track);
   const source=await p.resolveBest(track,'flac','play',control.signal);assert.ok(!source.trial);report.track={id:track.id,name:track.name,artist:track.artist,duration:track.duration,quality:source.quality,format:source.format};
   service=new SeparationService(path.resolve('artifacts/separation126/online-cache'),path.resolve('build/separation'),path.resolve('build/hifi/mpv.exe'),s=>(report.phases??=[]).push({...s,at:Date.now()}));
   const start=performance.now(),file=await service.prepare({key:track.id+'|'+source.quality,signal:control.signal,download:async(file,signal)=>{
    const response=await mediaResponse({url:source.url,signal,refresh:async()=>(await p.resolve(track,source.quality,'play',signal)).url},new Request('kuwo://media/verification',{signal}),fetcher);assert.equal(response.status,200);assert.ok(response.body);const output=await fs.open(file,'wx'),reader=response.body.getReader();let bytes=0;
    try{for(;;){const part=await reader.read();if(part.done)break;signal.throwIfAborted();bytes+=part.value.length;assert.ok(bytes<512*1024**2);await output.write(part.value);}report.sourceBytes=bytes;}finally{await reader.cancel().catch(()=>{});await output.close();}
   }},'online-verification');
   const h=await fs.open(file,'r'),header=Buffer.alloc(68);try{await h.read(header,0,68,0);}finally{await h.close();}
   report.outputSeconds=header.readUInt32LE(64)/(44100*12);assert.ok(report.outputSeconds>track.duration-8);report.elapsedMs=Math.round(performance.now()-start);report.outputChannels=header.readUInt16LE(22);assert.equal(report.outputChannels,6);report.passed=true;
  }finally{clearTimeout(timer);}
 }catch(e){report.passed=false;report.error=String(e).replace(/https?:\/\/\S+/g,'[url]');}finally{await service?.dispose();await fs.writeFile('docs/evidence/separation126-online.json',JSON.stringify(report,null,2)+'\n');app.exit(report.passed?0:1);}
});
