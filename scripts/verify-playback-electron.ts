import {app,net} from 'electron';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {KuwoProvider} from '../electron/provider';
import {inspectStream} from '../electron/audio-info';
import {mediaResponse} from '../electron/media-proxy';
app.whenReady().then(async()=>{
 const provider=new KuwoProvider((u,i)=>net.fetch(u,i)),checks:any[]=[];
 const check=async(name:string,fn:()=>Promise<unknown>)=>{const at=Date.now();try{checks.push({name,ok:true,result:await fn(),ms:Date.now()-at});}catch(e){checks.push({name,ok:false,error:String(e),ms:Date.now()-at});}console.log(JSON.stringify(checks.at(-1)));};
 await check('exact-reported-track-and-real-stream-repeat',async()=>{
  const result=await provider.search('越痛越上瘾 郭飞宏'),track=result.tracks.find(t=>t.name==='越痛越上瘾'&&t.artist==='郭飞宏');assert.ok(track,'Missing exact recording');const rounds=[];
  for(let i=0;i<5;i++){const start=Date.now(),audio=await provider.resolveBest(track,'flac','play'),info=await inspectStream(audio.url,(u,j)=>net.fetch(u,j));const response=await mediaResponse({url:audio.url},new Request('https://test.invalid/',{headers:{Range:'bytes=0-4095'}}),(u,j)=>net.fetch(u,j));const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.toString('ascii',0,4),'fLaC');assert.equal(response.status,206);assert.ok(info.sampleRate);assert.ok(Math.abs(info.duration!-track.duration)<5);rounds.push({ms:Date.now()-start,quality:audio.quality,info});}return {id:track.id,name:track.name,artist:track.artist,rounds};
 });
 let times=0;const sockets=new Set<any>();const server=createServer((req,res)=>{
  if(req.url==='/headers')return;
  if(req.url==='/first'){res.writeHead(200,{'content-type':'audio/flac'});res.flushHeaders();return;}
  if(req.url==='/expired'){res.writeHead(403).end();return;}
  if(req.url==='/recover'&&times++===0){res.writeHead(503).end();return;}
  res.writeHead(206,{'content-type':'audio/flac','content-range':'bytes 0-3/20'});res.write('fLaC');if(req.url!=='/body')res.end();
 });server.on('connection',s=>{sockets.add(s);s.once('close',()=>sockets.delete(s));});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${(server.address() as any).port}`,request=()=>new Request('https://test.invalid/',{headers:{Range:'bytes=0-3'}}),limits={headers:200,idle:200,attempts:2};
 try{
  await check('real-electron-header-timeout',async()=>{await assert.rejects(mediaResponse({url:base+'/headers'},request(),(u,i)=>net.fetch(u,i),limits),/连接超时/);return 'finite timeout';});
  await check('real-electron-first-byte-timeout',async()=>{await assert.rejects(mediaResponse({url:base+'/first'},request(),(u,i)=>net.fetch(u,i),limits),/没有返回数据/);return 'finite timeout';});
  await check('real-electron-body-stall',async()=>{const r=await mediaResponse({url:base+'/body'},request(),(u,i)=>net.fetch(u,i),limits);await assert.rejects(r.arrayBuffer(),/读取中断/);return 'stream aborted';});
  await check('real-electron-503-recovery',async()=>{const r=await mediaResponse({url:base+'/recover'},request(),(u,i)=>net.fetch(u,i),limits);assert.equal(await r.text(),'fLaC');assert.equal(times,2);return {attempts:times};});
  await check('real-electron-expired-url-refresh',async()=>{let refreshes=0;const r=await mediaResponse({url:base+'/expired',refresh:async()=>{refreshes++;return base+'/fresh';}},request(),(u,i)=>net.fetch(u,i),limits);assert.equal(await r.text(),'fLaC');assert.equal(refreshes,1);return {refreshes};});
  await check('real-electron-track-switch-abort',async()=>{const signal=new AbortController();const job=mediaResponse({url:base+'/headers',signal:signal.signal},request(),(u,i)=>net.fetch(u,i),{...limits,headers:3000});setTimeout(()=>signal.abort(new Error('switch')),60);await assert.rejects(job,/switch/);return 'previous request aborted';});
 }finally{for(const socket of sockets)socket.destroy();await new Promise<void>(r=>server.close(()=>r()));}
 await fs.writeFile('docs/evidence/playback-electron-120.json',JSON.stringify({date:new Date().toISOString(),checks},null,2));app.exit(checks.every(c=>c.ok)?0:1);
}).catch(e=>{console.error(e);app.exit(1);});
