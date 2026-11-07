import {app,net,nativeTheme} from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {CommentService} from '../electron/comments';
import {ArtworkCache} from '../electron/artwork';
app.whenReady().then(async()=>{
 const checks:any[]=[];let offline=false;const service=new CommentService((url,init)=>net.fetch(url,init),()=>offline);
 const record=async(name:string,run:()=>Promise<any>)=>{try{checks.push({name,ok:true,...await run()});}catch(e){checks.push({name,ok:false,error:(e as Error).message});}};
 await Promise.all((['hot','latest']as const).map(sort=>record(sort,async()=>{const r=await service.get('228908',sort,1);if(!r.comments.length)throw Error('Expected comments');return {total:r.total,rows:r.comments.length,page:r.page,pages:r.pages,avatars:r.comments.map(c=>c.avatar).filter(Boolean).map(u=>new URL(u!).hostname)};})));
 await record('empty',async()=>{const r=await service.get('172567327','hot',1);if(r.total!==0||r.comments.length)throw Error('Expected empty');return {total:r.total};});
 const cacheDir=await fs.mkdtemp(path.join(os.tmpdir(),'wuwo-avatar-'));
 for(const host of ['img1.kuwo.cn','q.qlogo.cn','thirdwx.qlogo.cn','thirdqq.qlogo.cn'])await record('avatar-'+host,async()=>{const r=await service.get('228908','hot',1),url=r.comments.find(c=>c.avatar&&new URL(c.avatar).hostname===host)?.avatar;if(!url)throw Error('Missing avatar');const cache=new ArtworkCache(cacheDir,(u,i)=>net.fetch(u,i),()=>false,true),bytes=await cache.bytes(url);return {host,bytes:bytes.length};});
 await fs.rm(cacheDir,{recursive:true,force:true});
 await record('offline',async()=>{offline=true;try{await service.get('228908','hot',1);throw Error('unexpected success');}catch(e){if(!(e as Error).message.includes('离线'))throw e;return {rejected:true};}});
 await record('failure',async()=>{const failed=new CommentService(async()=>new Response('',{status:502}),()=>false);try{await failed.get('1','hot',1);throw Error('unexpected success');}catch(e){if(!(e as Error).message.includes('重试'))throw e;return {rejected:true};}});
 await record('native-theme',async()=>{const previous=nativeTheme.themeSource;nativeTheme.themeSource='dark';const dark=nativeTheme.shouldUseDarkColors;nativeTheme.themeSource='light';const light=nativeTheme.shouldUseDarkColors;nativeTheme.themeSource='system';const system=nativeTheme.shouldUseDarkColors;nativeTheme.themeSource=previous;if(!dark||light)throw Error('theme did not change');return {dark,light,system};});
 await fs.mkdir('docs/evidence',{recursive:true});await fs.writeFile('docs/evidence/comments-electron-120.json',JSON.stringify({timestamp:new Date().toISOString(),checks},null,2));app.exit(checks.every(c=>c.ok)?0:1);
}).catch(e=>{console.error(e);app.exit(1);});
