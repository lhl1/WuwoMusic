import fs from 'node:fs/promises';
import path from 'node:path';
import { KuwoProvider } from '../electron/provider';
import { Store } from '../electron/storage';
import { DownloadManager } from '../electron/downloads';
import { parseFile } from 'music-metadata';
const root=path.resolve('artifacts');await fs.mkdir(root,{recursive:true});
const provider=new KuwoProvider();
const report:any={timestamp:new Date().toISOString(),checks:[]};
async function check(name:string,fn:()=>Promise<unknown>){try{const result=await fn();report.checks.push({name,ok:true,result});console.log('PASS',name,JSON.stringify(result));}catch(e){report.checks.push({name,ok:false,error:(e as Error).message});console.log('FAIL',name,(e as Error).message);}}
const search=await provider.search('Beethoven',0);
await check('Search: real titles and pagination',async()=>({total:search.total,first:search.tracks[0]?.name,count:search.tracks.length,page2:(await provider.search('Beethoven',1)).tracks.length}));
const home=await provider.home();
await check('Homepage recommendations and ranks',async()=>({recommendations:home.recommendations.length,ranks:home.ranks.length}));
await check('Playlist detail',async()=>({count:(await provider.collection(home.recommendations[0].id,'playlist')).tracks.length}));
await check('Rank detail',async()=>({count:(await provider.collection(home.ranks[0].id,'rank')).tracks.length}));
await check('Chinese lyrics decode',async()=>{const lines=await provider.lyrics('228908');if(!lines.some(l=>l.text.includes('晴天')))throw new Error('Chinese lyrics missing');return {count:lines.length,first:lines[0]?.text};});
const free=search.tracks.find(t=>t.id==='172567327')??search.tracks.find(t=>t.payInfo?.download==='0000');
if(free){
  await check('Free full-song playback URL',async()=>{const a=await provider.resolve(free,'128k','play');return {id:free.id,trial:a.trial,format:a.format,duration:a.duration,host:new URL(a.url).hostname};});
  await check('Free full-song download, validation, offline file',async()=>{
    const store=new Store(path.join(root,'verification-state.json'),root);store.data.settings.downloadDir=path.join(root,'downloaded');
    const manager=new DownloadManager(store,provider,fetch);const [t]=manager.enqueue([free],'128k');
    try{const deadline=Date.now()+90000;while(!['completed','failed'].includes(store.data.tasks.find(x=>x.id===t.id)!.status)){if(Date.now()>deadline)throw new Error('Download timed out');await new Promise(r=>setTimeout(r,100));}
      const done=store.data.tasks.find(x=>x.id===t.id)!;if(done.status!=='completed')throw new Error(done.error);
      // No network access is used to read and decode this completed local file.
      const m=await parseFile(done.path!,{duration:true});return {file:done.path,bytes:done.received,title:m.common.title,duration:m.format.duration,bitrate:m.format.bitrate};
    }finally{await manager.shutdown();}
  });
}
const paid=(await provider.search('晴天 周杰伦',0)).tracks.find(t=>t.id==='228908');
if(!paid)throw new Error('Representative track missing');
await check('Modified route: full playback despite official restriction',async()=>{const a=await provider.resolve(paid,'320k','play');if(a.trial||a.duration!<260)throw new Error('Expected complete playback');return {id:paid.id,trial:a.trial,duration:a.duration,bitrate:a.bitrate,cover:Boolean(a.cover)};});
await check('Modified route: concurrent complete MP3 and FLAC downloads',async()=>{
  const store=new Store(path.join(root,`batch-state-${Date.now()}.json`),root);store.data.settings.downloadDir=path.join(root,'downloaded');
  const manager=new DownloadManager(store,provider,fetch);
  const tasks=(['128k','320k','flac'] as const).flatMap(q=>manager.enqueue([paid],q));
  try{const deadline=Date.now()+120000;while(tasks.some(t=>!['completed','failed'].includes(store.data.tasks.find(x=>x.id===t.id)!.status))){if(Date.now()>deadline)throw new Error('Batch timed out');await new Promise(r=>setTimeout(r,100));}
    return await Promise.all(tasks.map(async t=>{const done=store.data.tasks.find(x=>x.id===t.id)!;if(done.status!=='completed')throw new Error(done.error);const m=await parseFile(done.path!,{duration:true});if(m.format.duration!<260)throw new Error('Preview saved');return {quality:t.quality,file:done.path,bytes:done.received,duration:m.format.duration,container:m.format.container,bitrate:m.format.bitrate};}));
  }finally{await manager.shutdown();}
});
if(free){await check('Unavailable high quality is reported instead of relabeled',async()=>{for(const q of ['320k','flac'] as const){try{await provider.resolve(free,q,'download');throw new Error('Unexpected quality accepted');}catch(e){if(!/音质/.test((e as Error).message))throw e;}}return {id:free.id,rejected:['320k','flac']};});}
await fs.writeFile(path.join(root,'api-verification.json'),JSON.stringify(report,null,2));
if(report.checks.some((c:any)=>!c.ok))process.exitCode=1;
