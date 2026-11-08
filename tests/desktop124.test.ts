import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {MultiCommentService,matchCommentSong,normalizeNetease,normalizeQQ,sourceOrder} from '../electron/comment-sources';
import {CommentFeed} from '../src/comment-feed';
import {stemWeights} from '../src/vocal-effects';
import {lyricFrame} from '../src/desktop-lyric-state';
import {Store} from '../electron/storage';
import {artworkSource} from '../electron/artwork';
import type {Track} from '../src/shared';
const track:Track={id:'228908',name:'晴天',artist:'周杰伦',album:'叶惠美',duration:269,qualities:['flac']};
const candidate={id:'97773',name:'晴天',artists:['周杰伦'],album:'叶惠美',duration:269};
const qq=(total=22,text='评论')=>({code:0,subcode:0,morecomment:1,comment:{commenttotal:total,commentlist:total?[{commentid:'q',nick:'听众',rootcommentcontent:text,praisenum:12,time:1475808377,avatarurl:'https://pic6.y.qq.com/a'}]:[]}});
test('cross-platform recording matching rejects title-only, live, wrong duration and ambiguous albums',()=>{
 assert.equal(matchCommentSong(track,[candidate])?.id,'97773');
 for(const changed of [{artists:['翻唱者']},{name:'晴天 (Live)'},{duration:240}])assert.equal(matchCommentSong(track,[{...candidate,...changed}]),undefined);
 assert.equal(matchCommentSong({...track,artist:'未知歌手'},[candidate]),undefined);
 assert.equal(matchCommentSong({...track,album:''},[candidate,{...candidate,id:'other'}]),undefined);
 assert.equal(matchCommentSong(track,[{...candidate,id:'other',album:'现场'},candidate])?.id,'97773');
});
test('provider order and normalization preserve attribution, paging and safe plain text',()=>{
 assert.deepEqual(sourceOrder(),['netease','qq','kuwo']);assert.deepEqual(sourceOrder('qq'),['qq','netease','kuwo']);
 const n=normalizeNetease({code:200,total:45,more:true,comments:[{commentId:1,content:'a&nbsp;<b>b</b>',user:{nickname:'甲'},likedCount:4,time:1700000000000}]},'latest',2);assert.equal(n.source,'netease');assert.equal(n.pages,3);assert.equal(n.comments[0].text,'a b');assert.equal(n.comments[0].id,'netease:1');
 const q=normalizeQQ(qq(),'hot',1);assert.equal(q.pages,1);assert.equal(q.total,20);assert.equal(normalizeQQ(qq(),'latest',2).pages,2);
 assert.throws(()=>normalizeNetease({code:301},'latest',1));assert.throws(()=>normalizeQQ({code:1000,comment:{commentlist:[],commenttotal:0}},'hot',1));
});
test('automatic source selection skips mismatches and empty providers, pins pages and deduplicates requests',async()=>{
 const calls:string[]=[];const service=new MultiCommentService(async url=>{calls.push(url);await new Promise(r=>setTimeout(r,3));if(url.includes('music.163.com'))return Response.json({code:200,result:{songs:[{id:1,name:'晴天',artists:[{name:'翻唱者'}],album:{name:'叶惠美'},duration:269000}]}});if(url.includes('client_search'))return Response.json({code:0,data:{song:{list:[{songid:97773,songname:'晴天',singer:[{name:'周杰伦'}],albumname:'叶惠美',interval:269}]}}});return Response.json(qq());},()=>false);
 const [a,b]=await Promise.all([service.get(track,'latest',1),service.get(track,'latest',1)]);assert.equal(a.source,'qq');assert.deepEqual(a,b);assert.equal(calls.length,4);
 await service.get(track,'latest',2);assert.equal(calls.length,5);assert.ok(calls.at(-1)?.includes('pagenum=1'));
 await service.get(track,'hot',1);assert.equal(calls.length,6);assert.ok(calls.at(-1)?.includes('cmd=6'));
});
test('source failures fall through, all business errors stay errors, and offline bypasses caches',async()=>{
 let offline=false;const s=new MultiCommentService(async url=>{if(url.includes('comment.kuwo'))return Response.json({result:'ok',rows:[{id:9,msg:'酷我评论',u_name:'乙'}],total:'1',totalPage:'1'});throw Error('network unavailable');},()=>offline);
 assert.equal((await s.get(track,'hot',1)).source,'kuwo');offline=true;await assert.rejects(s.get(track,'hot',1),/离线/);
 const broken=new MultiCommentService(async()=>Response.json({code:401}),()=>false);await assert.rejects(broken.get(track,'hot',1),/评论源暂未就绪/);
 const empty=new MultiCommentService(async url=>url.includes('comment.kuwo')?Response.json({result:'ok',rows:[],total:'0',totalPage:'1'}):url.includes('music.163')?Response.json({code:200,result:{songs:[]}}):Response.json({code:0,data:{song:{list:[]}}}),()=>false);
 const result=await empty.get(track,'hot',1);assert.equal(result.source,undefined);assert.equal(result.total,0);
});
test('repeated provider pages terminate pagination, and disposed feeds ignore stale songs',async()=>{
 const row={id:'same',author:'听众',text:'文本',time:'',likes:0};const changes:any[]=[];const feed=new CommentFeed(async page=>({comments:[row],page,pageSize:20,pages:100,total:2000,source:'qq'}),s=>changes.push(s));await feed.load();await feed.load();assert.equal(feed.state.items.length,1);assert.equal(feed.state.hasMore,false);assert.equal(feed.state.source,'qq');
 let done!:(v:any)=>void;const old=new CommentFeed(()=>new Promise(resolve=>done=resolve),s=>changes.push(s));const pending=old.load();old.dispose();const count=changes.length;done({comments:[row],page:1,pages:1,total:1,pageSize:20});await pending;assert.equal(changes.length,count);
});
test('audio matrices cancel a centered vocal and preserve original or centered focus without clipping gain',()=>{
 assert.deepEqual(stemWeights(0),[1,0,0]);assert.deepEqual(stemWeights(1),[0,0,1]);assert.deepEqual(stemWeights(-1),[0,1,0]);
 assert.deepEqual(stemWeights(1,false),[1,0,0]);
});
test('desktop lyrics only accept bounded plain data and strip unrelated payload fields',()=>{
 const frame={title:'歌名',artist:'歌手',current:'第一行',next:'第二行',playing:true,progress:.4};assert.deepEqual(lyricFrame({...frame,path:'C:/secret'}),frame);
 for(const patch of [{progress:NaN},{progress:2},{playing:1},{current:'x'.repeat(4001)},{next:{html:'x'}}])assert.throws(()=>lyricFrame({...frame,...patch}));
});
test('upgrades keep collections, choose automatic source and original audio, and remove persisted speed',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wuwo124-'));try{const f=path.join(dir,'state.json');fs.writeFileSync(f,JSON.stringify({version:1,settings:{playbackRate:1.5,downloadDir:'D:/music'},library:{favorites:[track],local:[],history:[],playlists:[]},tasks:[]}));const s=new Store(f,'M:');assert.equal(s.data.settings.commentPreference,'auto');assert.equal(s.data.settings.vocalMode,'original');assert.equal(s.data.settings.playbackRate,1);assert.equal(s.data.settings.downloadDir,'D:/music');assert.equal(s.data.library.favorites[0].id,track.id);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('new avatar origins stay limited to actual image hosts and cannot expand cover or local access',()=>{
 for(const host of ['p1.music.126.net','pic6.y.qq.com'])assert.equal(new URL(artworkSource('http://'+host+'/a',true)).protocol,'https:');
 for(const host of ['music.126.net.evil.com','evil.y.qq.com','127.0.0.1','p1.music.126.net:81'])assert.throws(()=>artworkSource('https://'+host+'/a',true));
 assert.throws(()=>artworkSource('https://p1.music.126.net/a'));
});
