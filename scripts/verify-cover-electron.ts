import {app,session} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {KuwoProvider} from '../electron/provider';
import {ArtworkCache,artworkSource,imageType} from '../electron/artwork';

app.whenReady().then(async()=>{
 try{
  await session.defaultSession.setProxy({mode:'direct'});
  let offline=false,calls=0;
  const fetcher=(u:string,i?:RequestInit)=>session.defaultSession.fetch(u,i);
  const provider=new KuwoProvider(fetcher),home=await provider.home();
  const cacheDir=await fs.mkdtemp(path.join(app.getPath('temp'),'wuwo-cover-'));
  const cache=new ArtworkCache(cacheDir,async(u,i)=>{calls++;return fetcher(u,i);},()=>offline);
  assert.ok(home.editorial.length>=6);
  const entries=[...home.editorial.map(c=>({...c,module:'editorial'})),...home.recommendations.map(c=>({...c,module:'playlists'})),...home.ranks.slice(0,6).map(c=>({...c,module:'ranks'})),...home.daily.slice(0,6).map(c=>({...c,module:'daily'}))];
  const rows=await Promise.all(entries.map(async c=>{
   try{assert.ok(c.cover,'Missing cover URL');const bytes=await cache.bytes(c.cover);return {module:c.module,id:c.id,name:c.name,url:artworkSource(c.cover),type:imageType(bytes),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}
   catch(e){return {module:c.module,id:c.id,name:c.name,error:String(e)};}
  }));
  const legacy=await Promise.all(['https://img1.kwcdn.kuwo.cn/star/userpl2015/20/94/1669648458462_590027620_700.jpg','https://img1.kwcdn.kuwo.cn/star/userpl2015/38/69/1521820436254_288469338_700.jpg'].map(async url=>{
   const bytes=await cache.bytes(url);assert.equal(imageType(bytes),'image/jpeg');return {source:url,resolved:artworkSource(url),bytes:bytes.length};
  }));
  const failed=rows.filter(r=>'error'in r);offline=true;const before=calls;
  for(const c of entries.filter(c=>c.cover&&!failed.some(f=>f.id===c.id&&f.module===c.module)))await cache.bytes(c.cover!);
  assert.equal(calls,before);assert.equal(failed.length,0,JSON.stringify(failed));
  const out={date:new Date().toISOString(),electron:process.versions.electron,platform:process.platform,system:process.getSystemVersion(),proxy:'direct',certificateValidation:true,covers:rows.length,failed:failed.length,offlineCache:true,legacy,rows};
  await fs.writeFile('docs/evidence/covers-electron-1.2.1.json',JSON.stringify(out,null,2));
  await fs.rm(cacheDir,{recursive:true,force:true});console.log(JSON.stringify({covers:rows.length,failed:failed.length,offlineCache:true}));app.exit(0);
 }catch(e){console.error(e);await fs.writeFile('artifacts/cover-check-error.txt',String(e));app.exit(1);}
});
