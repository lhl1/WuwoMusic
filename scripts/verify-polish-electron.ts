import {app,net} from 'electron';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {KuwoProvider} from '../electron/provider';
import {NativeCatalog} from '../electron/native-catalog';
import {CommentService} from '../electron/comments';
app.whenReady().then(async()=>{
 const provider=new KuwoProvider((u,i)=>net.fetch(u,i)),catalog=new NativeCatalog(provider),comments=new CommentService((u,i)=>net.fetch(u,i),()=>false),checks:any[]=[];
 const check=async(name:string,fn:()=>Promise<any>)=>{try{checks.push({name,ok:true,...await fn()});}catch(e){checks.push({name,ok:false,error:(e as Error).message});}};
 await check('APK-typed-search-suggestions',async()=>{const r=await catalog.hints('晴');assert.ok(r.suggestions.some(s=>s.text==='晴天'));return {items:r.suggestions};});
 await check('APK-blank-and-idle-search-recommendations',async()=>{const r=await catalog.hints('');assert.ok(r.hot.length);assert.ok(r.idle.length);return r;});
 await check('APK-historical-chart-period-identity',async()=>{const periods=await catalog.periods('16');assert.ok(periods.length>10);const old=periods.at(-1)!,latest=await provider.collection('16','rank',0),past=await catalog.contents('16',old.id,0),next=await catalog.contents('16',old.id,1);assert.ok(past.tracks.length&&next.tracks.length);assert.notEqual(past.tracks[0].id,latest.tracks[0].id);assert.notEqual(next.tracks[0].id,past.tracks[0].id);return {periodCount:periods.length,selected:old,currentFirst:latest.tracks[0],historicalFirst:past.tracks[0],nextFirst:next.tracks[0]};});
 await check('continuous-comment-hot-and-latest-pages',async()=>{const results=[];for(const sort of ['hot','latest']as const){const first=await comments.get('228908',sort,1);assert.ok(first.comments.length);const second=await comments.get('228908',sort,2);assert.ok(second.comments.length);assert.notEqual(first.comments[0].id,second.comments[0].id);results.push({sort,page1:first.comments.length,page2:second.comments.length,pages:first.pages});}return {results};});
 await fs.writeFile('docs/evidence/polish-electron-120.json',JSON.stringify({timestamp:new Date().toISOString(),checks},null,2));console.log(JSON.stringify(checks.map(({name,ok,error})=>({name,ok,error}))));app.exit(checks.every(c=>c.ok)?0:1);
}).catch(e=>{console.error(e);app.exit(1);});
