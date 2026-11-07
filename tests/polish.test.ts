import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeCatalog,parseHints,parsePeriods,parsePeriodContents} from '../electron/native-catalog';
import {KuwoProvider} from '../electron/provider';
import {CommentFeed,canLoopFeed} from '../src/comment-feed';
import {Store} from '../electron/storage';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';

test('APK suggestions and idle recommendations parse separately, deduplicate and reject errors',()=>{
 assert.deepEqual(parseHints({STATUS:'OK',WORDITEMS:[{RELWORD:'晴天'},{RELWORD:'晴天'},{RELWORD:'周杰伦'}]},'typed').map(x=>x.text),['晴天','周杰伦']);
 assert.equal(parseHints({content:[{query_word:'周杰伦',desc:'热门搜索'}]},'idle')[0].description,'热门搜索');
 assert.equal(parseHints({status:'ok',hotwords:[{key:'江南'}]},'hot')[0].text,'江南');
 assert.throws(()=>parseHints({STATUS:'ERROR'},'typed'));
});
test('rank periods accept original string arrays, keep rank identity and do not invent issues',()=>{
 const periods=parsePeriods({bang_data:{},fq:{volume:{'2026年':JSON.stringify([{second_id:'16',third_id:'23',name:'第2期'},{second_id:'17',third_id:'24',name:'错误榜单'}]),'2025年':[{second_id:'16',third_id:'11',name:'第1期'}]}}},'16');
 assert.deepEqual(periods.map(p=>p.id),['23','11']);assert.deepEqual(parsePeriods({bang_data:{},fq:{}},'16'),[]);assert.throws(()=>parsePeriods({error:true},'16'));
});
test('historical rank XML carries true metadata, escaped names, duration and MV flag',()=>{
 const r=parsePeriodContents('<root><section total="1"><music rid="42" name="A &amp; B" artist="歌手" duration="240" minfo="level:ff,bitrate:2000,format:flac" mvflag="1" img="https://img1.kuwo.cn/a.jpg"/></section></root>',0);
 assert.equal(r.total,1);assert.equal(r.tracks[0].id,'42');assert.equal(r.tracks[0].name,'A & B');assert.equal(r.tracks[0].duration,240);assert.equal(r.tracks[0].hasMv,true);assert.ok(r.tracks[0].qualities.includes('flac'));
 assert.throws(()=>parsePeriodContents('<root><section total="30"></section></root>',0));assert.throws(()=>parsePeriodContents('<!DOCTYPE x><root/>',0));
});
test('period selection checks ownership and uses APK bangdata instead of a server ignoring bangid',async()=>{
 const urls:string[]=[];const service=new NativeCatalog(new KuwoProvider(async url=>{urls.push(url);return new Response(url.includes('basedata.s')?JSON.stringify({bang_data:{},fq:{volume:{year:[{second_id:'16',third_id:'23',name:'第1期'}]}}}):'<root><section total="31"><music rid="42" name="曲" duration="100"/></section></root>');}));
 const r=await service.contents('16','23',1);assert.equal(r.page,1);assert.ok(urls[1].includes('start=30&count=30&bangid=23'));await assert.rejects(()=>service.contents('16','99',0),/不属于/);
});
const comment=(id:string)=>({id,author:'听众',time:'',text:id,likes:0});
test('continuous comment feed appends pages once and loops only after the final page',async()=>{
 let calls=0;const feed=new CommentFeed(async page=>{calls++;return {comments:page===1?[comment('a'),comment('b')]:[comment('b'),comment('c')],page,pageSize:20,total:3,pages:2};},()=>{});
 await Promise.all([feed.load(),feed.load()]);assert.equal(calls,1);assert.equal(canLoopFeed(feed.state),false);await feed.load();assert.deepEqual(feed.state.items.map(c=>c.id),['a','b','c']);assert.equal(canLoopFeed(feed.state),true);await feed.load();assert.equal(calls,2);
});
test('comment page failures wait for explicit retry and old song responses are ignored',async()=>{
 let count=0;const feed=new CommentFeed(async page=>{if(++count===1)throw Error('离线');return {comments:[comment('x')],page,pageSize:20,total:1,pages:1};},()=>{});
 await feed.load();assert.equal(canLoopFeed(feed.state),false);await feed.load();assert.equal(count,1);await feed.load(true);assert.equal(count,2);assert.equal(feed.state.items.length,1);
 let resolve!:(v:any)=>void;const stale=new CommentFeed(()=>new Promise(r=>{resolve=r;}),()=>{});const promise=stale.load();stale.dispose();resolve({comments:[comment('old')],page:1,pages:1});await promise;assert.equal(stale.state.items.length,0);
});
test('new listening defaults migrate once and preserve files, favorites and explicit later choices',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wuwo-polish-')),file=path.join(dir,'state.json');
 try{fs.writeFileSync(file,JSON.stringify({version:1,settings:{coverMode:'square',autoHotComments:true,downloadDir:'D:/music'},library:{local:[{id:'local-a'}],favorites:[{id:'1'}]},tasks:[]}));let s=new Store(file,'M:');assert.equal(s.data.settings.coverMode,'record');assert.equal(s.data.settings.autoHotComments,false);assert.equal(s.data.settings.downloadDir,'D:/music');assert.equal(s.data.library.local[0].id,'local-a');s.data.settings.coverMode='square';s.data.settings.autoHotComments=true;s.save();s=new Store(file,'M:');assert.equal(s.data.settings.coverMode,'square');assert.equal(s.data.settings.autoHotComments,true);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
