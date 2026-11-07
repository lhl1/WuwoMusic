import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {DownloadManager,validateVideo} from '../electron/downloads';
import {Store} from '../electron/storage';
import {ArtworkCache} from '../electron/artwork';
import {KuwoProvider,flattenRanks} from '../electron/provider';
const track={id:'228908',name:'测试 MV',artist:'测试',album:'',duration:2,qualities:['128k']as any};
test('MV uses persistent download tasks, MP4 validation and the configured music directory',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'wuwo-mv-')),body=await fs.readFile('tests/fixtures/sample-mv.mp4'),store=new Store(path.join(root,'state.json'),root);store.data.settings.downloadDir=path.join(root,'music');let resolved=0;
 const manager=new DownloadManager(store,{resolve:async()=>{throw Error('Audio resolver must not handle video');}},async()=>new Response(body,{headers:{'Content-Type':'video/mp4','Content-Length':String(body.length)}}),()=>{},async()=>{resolved++;return {url:'https://other-bj.kuwo.cn/test.mp4',quality:'MP4BD',bitrate:3000};});
 try{const [task]=manager.enqueue([track],'128k','mv');assert.equal(manager.enqueue([track],'flac','mv')[0].id,task.id);const until=Date.now()+5000;while(!['completed','failed'].includes(store.data.tasks[0].status)){assert.ok(Date.now()<until);await new Promise(r=>setTimeout(r,20));}const t=store.data.tasks[0];assert.equal(t.status,'completed',t.error);assert.equal(resolved,1);assert.equal(t.media,'mv');assert.equal(t.videoQuality,'MP4BD');assert.equal(t.format,'mp4');assert.equal(path.dirname(t.path!),store.data.settings.downloadDir);assert.equal(store.data.library.local.length,0);assert.deepEqual(await fs.readFile(t.path!),body);const persisted=new Store(store.filename,root);assert.equal(persisted.data.tasks[0].media,'mv');assert.equal(persisted.data.tasks[0].path,t.path);assert.ok((await validateVideo(t.path!)).duration>=1.9);}
 finally{await manager.shutdown();await fs.rm(root,{recursive:true,force:true});}
});
test('MV validation refuses audio-only and corrupt files',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'wuwo-mv-invalid-'));try{const file=path.join(root,'bad.mp4');await fs.writeFile(file,'not a video');await assert.rejects(validateVideo(file));}finally{await fs.rm(root,{recursive:true,force:true});}
});
test('chart daily artwork and collection-specific fallback do not use song IDs',async()=>{
 const r=flattenRanks({child:[{name:'官方',child:[{source:'2',sourceid:'16',name:'热歌',pic:'https://img1.kuwo.cn/static.png',pic2:'https://zimg.kuwo.cn/daily.png'}]}]});assert.equal(r[0].cover,'https://zimg.kuwo.cn/daily.png');
 const p=new KuwoProvider(async()=>new Response('{"pic":"http://img1.kuwo.cn/playlist_150.jpg"}'));assert.equal(await p.collectionCover('12','playlist'),'https://img1.kuwo.cn/playlist_150.jpg');await assert.rejects(p.collectionCover('12&evil','playlist'));
});
test('valid artwork still displays when the optional disk cache cannot be written',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'wuwo-image-lock-'));try{const blocked=path.join(root,'not-a-directory');await fs.writeFile(blocked,'blocked');const bytes=Buffer.from([255,216,255,224,1,2,3]),cache=new ArtworkCache(blocked,async()=>new Response(bytes),()=>false);assert.deepEqual(await cache.bytes('https://img1.kuwo.cn/cover.jpg'),bytes);}finally{await fs.rm(root,{recursive:true,force:true});}
});
