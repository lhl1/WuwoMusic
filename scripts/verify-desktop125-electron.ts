import {app,session} from 'electron';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {KuwoProvider} from '../electron/provider';
import {MultiCommentService} from '../electron/comment-sources';
import {ArtworkCache} from '../electron/artwork';
app.whenReady().then(async()=>{
 const evidence:any={date:new Date().toISOString(),system:process.getSystemVersion(),electron:process.versions.electron,proxy:'direct',results:[],images:[]};
 try{
  await session.defaultSession.setProxy({mode:'direct'});
  const fetcher=(u:string,i?:RequestInit)=>session.defaultSession.fetch(u,i),p=new KuwoProvider(fetcher);let offline=false;
  const comments=new MultiCommentService(fetcher,()=>offline),avatars=new ArtworkCache('artifacts/avatars125',fetcher,()=>offline,true);
  const queries=[{name:'如愿',artist:'王菲',source:'netease'},{name:'晴天',artist:'周杰伦',source:'qq'}];
  for(const query of queries){
   const results=await p.search(query.name+' '+query.artist),t=results.tracks.find(t=>t.name===query.name&&t.artist===query.artist);assert.ok(t,'找不到代表歌曲');
   const statuses=await comments.inspect(t);assert.equal(statuses.length,3);
   const [hot,latest]=await Promise.all([comments.get(t,'hot',1),comments.get(t,'latest',1)]);assert.equal(latest.source,query.source);assert.equal(hot.source,query.source);assert.ok(hot.comments.length&&latest.comments.length);
   const second=await comments.get(t,'latest',2);assert.ok(second.comments.some(c=>!latest.comments.some(a=>a.id===c.id)));
   const kuwo=await comments.get(t,'hot',1,'kuwo');assert.ok(kuwo.source);assert.ok(kuwo.comments.length);
   const avatar=hot.comments.find(c=>c.avatar)?.avatar;assert.ok(avatar);const bytes=await avatars.bytes(avatar);assert.ok(bytes.byteLength>100);evidence.images.push({source:query.source,host:new URL(avatar).hostname,bytes:bytes.length});
   evidence.results.push({track:{id:t.id,name:t.name,artist:t.artist,album:t.album,duration:t.duration},source:latest.source,statuses,hotRows:hot.comments.length,hotPages:hot.pages,latestRows:latest.comments.length,total:latest.total,nextPageRows:second.comments.length,distinctNextPage:true,kuwoPreferredActualSource:kuwo.source,kuwoPreferredRows:kuwo.comments.length});
  }
  const imageCache=new ArtworkCache('artifacts/comment-images125',fetcher,()=>offline,false,true);for(const code of ['e400824','e400001']){const image=await imageCache.bytes('https://y.gtimg.cn/mediastyle/global/emoji/img/'+code+'.png');evidence.images.push({emoji:code,bytes:image.length});}
  offline=true;await assert.rejects(comments.get({id:'228908',name:'晴天',artist:'周杰伦',album:'叶惠美',duration:269,qualities:['flac']},'latest',1),/离线/);evidence.offlineRefused=true;
  evidence.status='passed';await fs.writeFile('docs/evidence/desktop125-electron.json',JSON.stringify(evidence,null,2));app.exit(0);
 }catch(e){evidence.status='failed';evidence.error=String(e);await fs.writeFile('docs/evidence/desktop125-electron.json',JSON.stringify(evidence,null,2));app.exit(1);}
});
