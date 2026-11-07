import {app,net} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parseFile} from 'music-metadata';
import {KuwoProvider,normalizeTrack} from '../electron/provider';
import {DownloadManager} from '../electron/downloads';
import {Store} from '../electron/storage';
app.whenReady().then(async()=>{
 const p=new KuwoProvider((u,i)=>net.fetch(u,i)),root=path.resolve('artifacts/fallback-120'),checks:any[]=[];await fs.mkdir(root,{recursive:true});const store=new Store(path.join(root,'state.json'),root);store.data.settings.downloadDir=root;
 const manager=new DownloadManager(store,p,(u,i)=>net.fetch(u,i));
 try{for(const [id,name,duration,quality]of [['51685512','晴天 (KTV版伴奏)',269,'320k'],['172567327','接口回退验证',75,'128k']]as const){try{const t=normalizeTrack({rid:id,name,duration,artist:'验证'});const play=await p.resolveBest(t,'flac','play');assert.equal(play.quality,quality);const [task]=manager.enqueue([t],'flac');const deadline=Date.now()+150000;while(!['completed','failed'].includes(store.data.tasks.find(t=>t.id===task.id)!.status)){assert.ok(Date.now()<deadline,'Download timed out');await new Promise(r=>setTimeout(r,300));}const done=store.data.tasks.find(t=>t.id===task.id)!;assert.equal(done.status,'completed',done.error);assert.equal(done.quality,quality);assert.equal(done.requestedQuality,'flac');assert.equal(done.format,'mp3');const info=await parseFile(done.path!,{duration:true});assert.ok(info.format.duration!>=duration-5);assert.ok(info.format.bitrate!>=(quality==='320k'?280000:120000));checks.push({id,name,ok:true,preferred:'flac',playQuality:play.quality,downloadQuality:done.quality,format:done.format,bytes:done.received,duration:info.format.duration,bitrate:info.format.bitrate,path:done.path});}catch(e){checks.push({id,ok:false,error:(e as Error).message});}}}
 finally{await manager.shutdown();}
 await fs.writeFile('docs/evidence/fallback-electron-120.json',JSON.stringify({timestamp:new Date().toISOString(),checks},null,2));console.log(JSON.stringify(checks));app.exit(checks.every(c=>c.ok)?0:1);
}).catch(e=>{console.error(e);app.exit(1);});
