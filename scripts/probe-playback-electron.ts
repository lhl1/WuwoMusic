import {app,net} from 'electron';
import fs from 'node:fs/promises';
import {KuwoProvider} from '../electron/provider';
import {inspectStream} from '../electron/audio-info';
app.whenReady().then(async()=>{
 const provider=new KuwoProvider((u,i)=>net.fetch(u,i));const rows:any[]=[];
 for(const query of ['越痛越上瘾','晴天 周杰伦','牵丝戏']){
  const found=await provider.search(query),track=found.tracks[0];
  if(!track){rows.push({query,error:'No track'});continue;}
  for(let attempt=0;attempt<2;attempt++){
   const start=Date.now(),row:any={query,id:track.id,name:track.name,artist:track.artist,attempt};
   try{const resolved=await provider.resolveBest(track,'flac','play');row.resolveMs=Date.now()-start;row.host=new URL(resolved.url).host;row.quality=resolved.quality;row.declaredBitrate=resolved.bitrate;const at=Date.now();try{row.info=await inspectStream(resolved.url,(u,i)=>net.fetch(u,i));}catch(e){row.inspectError=String(e);}row.inspectMs=Date.now()-at;
    const h=Date.now();const response=await net.fetch(resolved.url,{headers:{Range:'bytes=0-4095'},signal:AbortSignal.timeout(8000)});row.headersMs=Date.now()-h;row.status=response.status;row.type=response.headers.get('content-type');row.range=response.headers.get('content-range');const reader=response.body!.getReader();const chunk=await reader.read();row.firstByteMs=Date.now()-h;row.firstBytes=chunk.value?.length;row.signature=Buffer.from(chunk.value?.subarray(0,12)??[]).toString('hex');await reader.cancel().catch(()=>{});
   }catch(e){row.error=String(e);}row.totalMs=Date.now()-start;rows.push(row);console.log(JSON.stringify(row));
  }
 }
 await fs.writeFile('docs/evidence/playback-before-probe.json',JSON.stringify({date:new Date().toISOString(),rows},null,2));app.exit(0);
}).catch(e=>{console.error(e);app.exit(1);});
