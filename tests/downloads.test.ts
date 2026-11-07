import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DownloadManager, resumePlan, safeFilename, validateAudio } from '../electron/downloads';
import { Store } from '../electron/storage';
import type { DownloadTask, Track } from '../src/shared';
function wav(seconds=2){const length=8000*2*seconds,b=Buffer.alloc(44+length);b.write('RIFF');b.writeUInt32LE(36+length,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(length,40);for(let i=44;i<b.length;i+=2)b.writeInt16LE(Math.round(Math.sin(i/16)*3000),i);return b;}
const track:Track={id:'123',name:'测试 / : * 歌曲',artist:'测试歌手',album:'本地测试',duration:2,qualities:['128k']};
async function waitFor(predicate:()=>boolean,timeout=15000){const end=Date.now()+timeout;while(!predicate()){if(Date.now()>end)throw new Error('Timed out waiting for task');await new Promise(r=>setTimeout(r,20));}}
test('safe Windows filenames and strict range handling',()=>{
  assert.equal(safeFilename('CON'),'_CON');assert.equal(safeFilename('a<>:"/\\|?*. '),'a_________');
  assert.deepEqual(resumePlan(200,null,500),{append:false});assert.deepEqual(resumePlan(206,'bytes 500-999/1000',500),{append:true,total:1000});
  assert.throws(()=>resumePlan(206,'bytes 0-999/1000',500));assert.throws(()=>resumePlan(206,'bytes 500-999/1000',500,'new','old'));
});
for(const ignoresRange of [false,true])test(`persistent pause/restart/resume with server ${ignoresRange?'ignoring':'honoring'} Range`,async()=>{
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'kuwo-download-'));const body=wav(20);let rangeSeen=false;
  const server=http.createServer((req,res)=>{const offset=Number(req.headers.range?.match(/bytes=(\d+)-/)?.[1]??0);if(offset)rangeSeen=true;const begin=ignoresRange?0:offset;res.writeHead(begin?206:200,{'Content-Type':'audio/wav','Content-Length':body.length-begin,'ETag':'"same"',...(begin?{'Content-Range':`bytes ${begin}-${body.length-1}/${body.length}`}:{})});let n=begin;const timer=setInterval(()=>{if(n>=body.length){clearInterval(timer);res.end();return;}res.write(body.subarray(n,Math.min(n+4096,body.length)));n+=4096;},15);res.on('close',()=>clearInterval(timer));});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address()as any).port;
  const fetcher=(_url:string,init?:RequestInit)=>fetch(`http://127.0.0.1:${port}/sample.wav`,init);
  const resolver={resolve:async()=>({url:'https://kw-test.kuwo.cn/audio.wav',quality:'128k' as const,format:'wav',trial:false,duration:20})};
  const store=new Store(path.join(tmp,'state.json'),tmp);store.data.settings.downloadDir=path.join(tmp,'songs');
  let manager=new DownloadManager(store,resolver,fetcher);
  try{
    const [task]=manager.enqueue([{...track,duration:20}],'128k');await waitFor(()=>store.data.tasks[0].received>10000);
    await manager.action(task.id,'pause');await manager.shutdown();const partial=store.data.tasks[0].received;assert.ok(partial>0&&partial<body.length);
    const reloaded=new Store(path.join(tmp,'state.json'),tmp);assert.equal(reloaded.data.tasks[0].status,'paused');
    manager=new DownloadManager(reloaded,resolver,fetcher);await manager.action(task.id,'resume');await waitFor(()=>['completed','failed'].includes(reloaded.data.tasks[0].status));
    const done=reloaded.data.tasks[0];assert.equal(done.status,'completed',done.error);assert.ok(rangeSeen);assert.equal(done.format,'wav');assert.deepEqual(await fs.readFile(done.path!),body);assert.equal(reloaded.data.library.local.length,1);assert.ok(!done.partPath);
    assert.equal(manager.enqueue([{...track,duration:20}],'128k')[0].id,done.id);
  }finally{await manager.shutdown();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await fs.rm(tmp,{recursive:true,force:true});}
});
test('reject truncated files and false high quality',async()=>{const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'kuwo-validation-'));try{const file=path.join(tmp,'sample.wav');await fs.writeFile(file,wav(2));await assert.rejects(validateAudio(file,{...track,duration:60},'128k'),/时长不足/);await assert.rejects(validateAudio(file,track,'flac'),/FLAC/);await assert.rejects(validateAudio(file,track,'320k'),/320/);}finally{await fs.rm(tmp,{recursive:true,force:true});}});

test('fallback removes incompatible partial data and persists actual format and quality',async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'wuwo-fallback-')),body=wav(2),partial=path.join(tmp,'old.part');await fs.writeFile(partial,'stale FLAC bytes');
 const store=new Store(path.join(tmp,'state.json'),tmp);store.data.settings.downloadDir=path.join(tmp,'songs');store.data.tasks=[{id:'fallback',track,quality:'flac',status:'paused',received:16,total:100,partPath:partial,etag:'old',speed:0,created:Date.now()}];
 let range:string|null=null,preferred='';const provider={resolve:async()=>{throw Error('strict resolver should not be used');},resolveBest:async(_t:Track,q:any)=>{preferred=q;return {url:'https://other-bj.kuwo.cn/a.wav',quality:'128k' as const,format:'wav',trial:false,duration:2};}};
 const manager=new DownloadManager(store,provider,async(_u,init)=>{range=new Headers(init?.headers).get('Range');return new Response(body,{headers:{'Content-Type':'audio/wav','Content-Length':String(body.length)}});});
 try{await manager.action('fallback','resume');await waitFor(()=>['completed','failed'].includes(store.data.tasks[0].status));const done=store.data.tasks[0];assert.equal(done.status,'completed',done.error);assert.equal(preferred,'flac');assert.equal(range,null);assert.equal(done.requestedQuality,'flac');assert.equal(done.quality,'128k');assert.equal(done.format,'wav');assert.ok(done.path?.endsWith('128k].wav'));assert.deepEqual(await fs.readFile(done.path!),body);await assert.rejects(fs.access(partial));assert.equal(manager.enqueue([track],'flac')[0].id,'fallback');const reloaded=new Store(store.filename,tmp);assert.equal(reloaded.data.tasks[0].quality,'128k');}
 finally{await manager.shutdown();await fs.rm(tmp,{recursive:true,force:true});}
});

test('lossless-first migration preserves paths and subsequent explicit preferences',async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'wuwo-policy-'));try{const file=path.join(tmp,'state.json');await fs.writeFile(file,JSON.stringify({version:1,settings:{downloadDir:'D:/my songs',quality:'128k'},library:{favorites:[track]},tasks:[]}));const s=new Store(file,tmp);assert.equal(s.data.settings.quality,'flac');assert.equal(s.data.settings.downloadDir,'D:/my songs');assert.equal(s.data.library.favorites[0].id,track.id);s.data.settings.quality='320k';s.save();assert.equal(new Store(file,tmp).data.settings.quality,'320k');}finally{await fs.rm(tmp,{recursive:true,force:true});}
});
test('restart converts in-flight states to paused; corrupted state is backed up',async()=>{const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'kuwo-state-'));try{const file=path.join(tmp,'state.json'),s=new Store(file,tmp);s.data.tasks=[{id:'test',track,quality:'128k',status:'downloading',received:1,total:2,speed:1,created:Date.now()}];s.save();const next=new Store(file,tmp);assert.equal(next.data.tasks[0].status,'paused');assert.equal(next.data.tasks[0].speed,0);await fs.writeFile(file,'broken');new Store(file,tmp);assert.ok((await fs.readdir(tmp)).some(x=>x.includes('.bak')));}finally{await fs.rm(tmp,{recursive:true,force:true});}});
test('restricted download fails honestly and cancel removes partial data',async()=>{const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'kuwo-fail-'));const store=new Store(path.join(tmp,'state.json'),tmp);const manager=new DownloadManager(store,{resolve:async()=>{throw new Error('该歌曲不支持免登录下载');}},fetch);try{const [task]=manager.enqueue([track],'128k');await waitFor(()=>store.data.tasks[0].status==='failed');assert.match(store.data.tasks[0].error!,/免登录/);await manager.action(task.id,'cancel');assert.equal(store.data.tasks[0].status,'cancelled');assert.equal(store.data.tasks[0].received,0);}finally{await manager.shutdown();await fs.rm(tmp,{recursive:true,force:true});}});

test('expired URL and interrupted connection re-resolve before a byte-exact resume',async()=>{
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'kuwo-retry-')),body=wav(20);
  let resolves=0,requests=0;const offsets:number[]=[];
  const server=http.createServer((req,res)=>{
    requests++;if(requests===1){res.writeHead(403);res.end('expired');return;}
    const start=Number(req.headers.range?.match(/bytes=(\d+)-/)?.[1]??0);offsets.push(start);
    res.writeHead(start?206:200,{'Content-Type':'audio/wav','Content-Length':body.length-start,'ETag':'"stable"',...(start?{'Content-Range':`bytes ${start}-${body.length-1}/${body.length}`}:{})});
    if(requests===2){res.write(body.subarray(0,16384));setTimeout(()=>res.destroy(),40);}else res.end(body.subarray(start));
  });
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address()as any).port;
  const store=new Store(path.join(tmp,'state.json'),tmp);store.data.settings.downloadDir=path.join(tmp,'songs');
  const manager=new DownloadManager(store,{resolve:async()=>({url:`https://kw-test.kuwo.cn/${++resolves}.wav`,quality:'128k',format:'wav',trial:false,duration:20})},(_u,init)=>fetch(`http://127.0.0.1:${port}/audio`,init));
  try{manager.enqueue([{...track,duration:20}],'128k');await waitFor(()=>['completed','failed'].includes(store.data.tasks[0].status));const done=store.data.tasks[0];assert.equal(done.status,'completed',done.error);assert.equal(resolves,3);assert.ok(offsets[1]>0);assert.deepEqual(await fs.readFile(done.path!),body);}
  finally{await manager.shutdown();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await fs.rm(tmp,{recursive:true,force:true});}
});
