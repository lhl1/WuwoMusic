import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {CommentService,commentUrl,normalizeComments} from '../electron/comments';
import {Store} from '../electron/storage';
import {artworkSource} from '../electron/artwork';
import {appearanceDefaults,themeSource,applyAppearance} from '../src/preferences';
import {canRequestComments,LatestRequest} from '../src/comment-state';
import {commentScrollRunning} from '../src/comment-feed';
const raw={result:'ok',total:'41',totalPage:'3',rows:[{id:12,u_name:'听众',u_pic:'http://q.qlogo.cn/g',time:'2020-01-01',msg:'文本\n第二行',like_num:'21'}]};
test('comments preserve plain text and normalize paging, numbers and empty results',()=>{
 const page=normalizeComments(raw,2);assert.equal(page.comments[0].text,'文本\n第二行');assert.equal(page.comments[0].likes,21);assert.equal(page.page,2);assert.equal(page.pages,3);assert.equal(page.pageSize,20);
 assert.deepEqual(normalizeComments({result:'ok',total:0,rows:[],totalPage:0},1).comments,[]);
 assert.equal(normalizeComments({result:'ok',data:{info:[],total:'0'}},1).total,0);
 assert.throws(()=>normalizeComments({code:'600',result:'ok',data:{info:[],total:'0'}},1));
});
test('business errors including code 600 are never interpreted as empty comments',()=>{
 for(const r of [{...raw,code:'600',rows:[]},{result:'fail',rows:[]},{...raw,total:'bad'},null])assert.throws(()=>normalizeComments(r,1));
});
test('comments use the verified page/rows and client parameters',()=>{
 const u=new URL(commentUrl('228908','hot',2));assert.equal(u.searchParams.get('type'),'get_rec_comment');assert.equal(u.searchParams.get('rows'),'20');assert.equal(u.searchParams.get('page'),'2');assert.equal(u.searchParams.get('prod'),'MUSIC_9.1.1.2_BCS2');assert.equal(new URL(commentUrl('1','latest',1)).searchParams.get('type'),'get_comment');
 for(const id of ['local-a','../2',''])assert.throws(()=>commentUrl(id,'hot',1));assert.throws(()=>commentUrl('1','hot',0));
});
test('comment requests coalesce, expire after five minutes, separate pages and refuse offline even when cached',async()=>{
 let calls=0,now=0,offline=false;
 const service=new CommentService(async()=>{calls++;await new Promise(r=>setTimeout(r,5));return Response.json(raw);},()=>offline,()=>now);
 await Promise.all([service.get('1','hot',1),service.get('1','hot',1)]);assert.equal(calls,1);await service.get('1','hot',1);assert.equal(calls,1);
 await service.get('1','latest',1);await service.get('1','hot',2);assert.equal(calls,3);now=300001;await service.get('1','hot',1);assert.equal(calls,4);offline=true;await assert.rejects(service.get('1','hot',1),/离线/);
});
test('network errors are retryable and do not populate comment cache',async()=>{
 let calls=0;const s=new CommentService(async()=>++calls===1?new Response('',{status:503}):Response.json(raw),()=>false);await assert.rejects(s.get('1','hot',1));assert.equal((await s.get('1','hot',1)).total,41);assert.equal(calls,2);
});
test('old profile keeps library, paths and tasks while receiving new defaults',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wuwo-state-'));try{const filename=path.join(dir,'state.json'),track={id:'1',name:'existing'};fs.writeFileSync(filename,JSON.stringify({version:1,settings:{downloadDir:'D:\\Existing',quality:'flac'},library:{favorites:[track],playlists:[{id:'a',name:'mine',tracks:[track]}]},tasks:[{id:'x',status:'downloading'}]}));const s=new Store(filename,'M:');assert.equal(s.data.settings.downloadDir,'D:\\Existing');assert.equal(s.data.settings.quality,'flac');assert.equal(s.data.library.favorites[0].id,'1');assert.equal(s.data.library.playlists[0].id,'a');assert.equal(s.data.tasks[0].status,'paused');for(const [key,value]of Object.entries(appearanceDefaults))assert.equal((s.data.settings as any)[key],value);s.save();assert.equal(new Store(filename,'M:').data.settings.autoHotComments,false);assert.equal(new Store(path.join(dir,'new.json'),'M:').data.settings.downloadDir,path.join('M:','无我音乐'));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('theme settings validate and initial appearance is applied together with text size',()=>{
 for(const v of ['light','dark','system'])assert.equal(themeSource(v),v);assert.throws(()=>themeSource('blue'));const root={dataset:{}};applyAppearance({textSize:'larger'} as any,true,root as any);assert.deepEqual(root.dataset,{theme:'dark',textSize:'larger'});
});
test('avatar allowlist does not expand the cover proxy or accept arbitrary QQ subdomains',()=>{
 assert.throws(()=>artworkSource('https://q.qlogo.cn/g'));for(const host of ['q.qlogo.cn','thirdwx.qlogo.cn','thirdqq.qlogo.cn'])assert.equal(new URL(artworkSource('http://'+host+'/g',true)).protocol,'https:');for(const host of ['evil.qlogo.cn','q.qlogo.cn.evil.com','localhost'])assert.throws(()=>artworkSource('https://'+host+'/a',true));
});
test('switching songs and unmounting invalidate late comment requests',()=>{const r=new LatestRequest(),a=r.next(),b=r.next();assert.equal(r.valid(a),false);assert.equal(r.valid(b),true);r.invalidate();assert.equal(r.valid(b),false);});
test('disabled automatic comments, offline and local songs never start requests; manual requests still work',()=>{assert.equal(canRequestComments('228908',false,false),false);assert.equal(canRequestComments('228908',true,true),false);assert.equal(canRequestComments('local-a',true,false),false);assert.equal(canRequestComments('228908',true,false),true);});
test('continuous comment scrolling pauses on each interruption and resumes without a catch-up timer',()=>{
 const s={enabled:true,playing:true,visible:true,hover:false,focus:false,expanded:false,offline:false,error:''};assert.equal(commentScrollRunning(s),true);
 for(const key of ['enabled','playing','visible']as const)assert.equal(commentScrollRunning({...s,[key]:false}),false);
 for(const key of ['hover','focus','expanded','offline']as const)assert.equal(commentScrollRunning({...s,[key]:true}),false);
 assert.equal(commentScrollRunning({...s,error:'request failed'}),false);
});
