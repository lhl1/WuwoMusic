import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {normalizeTrack,KuwoProvider} from '../electron/provider';
import {DiscoveryService} from '../electron/discovery';
import {artistPage,artistVideos} from '../electron/artist';
import {libraryList,changeLibrary,exportLibrary,importLibraryFile,scanAudioFolder,createImportedPlaylist,uniqueTracks} from '../electron/library-tools';
import {filterLibrary} from '../src/library-filter';
import {MediaEnvelope} from '../src/media-envelope';
import {HifiPlayer} from '../electron/hifi';
import type {Library} from '../src/shared';
const track=(id:number,name=String(id))=>normalizeTrack({id,name,artist:'歌手',album:'专辑',duration:200,MINFO:'format:flac;bitrate:2000'});
const library=():Library=>({local:[],favorites:[],history:[],playlists:[{id:'p',name:'歌单',tracks:[1,2,3,4,5].map(n=>track(n))}]});
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
function wav(){const b=Buffer.alloc(44+4410*4);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(44100,24);b.writeUInt32LE(44100*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);return b;}
test('catalog badges and lyric snippets use declared fields, strip markup and never infer from titles',()=>{
 const t=normalizeTrack({id:1,name:'原唱 VIP DTSX',fpay:1,originalsongtype:1,N_MINFO:'level:dtsx',SUBTITLE:'动画片&nbsp;片尾曲',lrc:'<em>爱你</em>所爱的人间'});
 assert.deepEqual(t.catalogTags,['VIP','原唱','DTS:X']);assert.equal(t.subtitle,'动画片 片尾曲');assert.equal(t.lyricSnippet,'爱你所爱的人间');assert.equal(t.availability,'unknown');
 assert.equal(normalizeTrack({name:'原唱 VIP DTSX'}).catalogTags,undefined);
});
test('lyric search uses APK client parameters and keeps lyric excerpts as text',async()=>{
 const p=new KuwoProvider(async url=>{const q=new URL(url).searchParams;assert.equal(q.get('newsearch'),'1');assert.equal(q.get('searchapi'),'11');assert.equal(q.get('ver'),'MUSIC_5.2.1.3_UG8');assert.equal(q.get('lrccontent'),'而我将爱你所爱的人间');return new Response(JSON.stringify({TOTAL:2,abslist:[{rid:1,name:'如愿',lrc:'<em>而我将爱你</em>所爱的人间'}]}));});
 const r=await new DiscoveryService(p).search('而我将爱你所爱的人间','lyrics');assert.equal(r.total,2);assert.equal(r.tracks[0].lyricSnippet,'而我将爱你所爱的人间');
});
test('artist video XML keeps the requested artist and rid, refuses entities and malformed replies',()=>{
 const r=artistVideos('<root><section total="2"><mv artistid="336" rid="228908" vid="9" name="晴天" artist="周杰伦" duration="270" img="http://img3.kwcdn.kuwo.cn/a.jpg"/><mv artistid="1" rid="2"/></section></root>','336');
 assert.equal(r.total,2);assert.equal(r.videos.length,1);assert.equal(r.videos[0].id,'228908');assert.equal(r.videos[0].duration,270);assert.equal(r.videos[0].cover,'https://img3.kuwo.cn/a.jpg');assert.equal(r.videos[0].hasMv,true);
 for(const xml of ['<!DOCTYPE root><root/>','<root/>','<root><section total="2"/></root>'])assert.throws(()=>artistVideos(xml,'336'));
 assert.deepEqual(artistVideos('<root><section total="0"/></root>','336').videos,[]);
});
test('artist modules use distinct endpoints, album metadata and correct video offsets',async()=>{
 const p=new KuwoProvider(async url=>{const u=new URL(url),q=u.searchParams;if(q.get('stype')==='artistinfo')return Response.json({id:336,name:'周杰伦',musicnum:1708,info:'<p>简介</p>',aartist:'Jay&nbsp;Chou'});if(q.get('stype')==='albumlist'){assert.equal(q.get('pn'),'1');return Response.json({total:45,albumlist:[{albumid:1293,name:'叶惠美',pub:'2003-07-31'}]});}if(u.hostname==='mobi.kuwo.cn'){assert.equal(q.get('key'),'mv');assert.equal(q.get('start'),'24');return new Response('<root><section total="436"><mv artistid="336" rid="228908" name="晴天"/></section></root>');}return Response.json({total:1,musiclist:[{id:1,name:'单曲'}]});});
 const about=await artistPage(p,'336','about',0);assert.equal(about.facts['外文名'],'Jay Chou');assert.equal(about.artist.count,1708);
 assert.equal((await artistPage(p,'336','albums',1)).albums[0].releaseDate,'2003-07-31');assert.equal((await artistPage(p,'336','videos',1)).total,436);
 await assert.rejects(artistPage(p,'bad','about',0));
});
test('library batch actions preserve relative order and do not remove files or history',()=>{
 const l=library();changeLibrary(l,'playlist','p','up',['2','3']);assert.deepEqual(l.playlists[0].tracks.map(t=>t.id),['2','3','1','4','5']);changeLibrary(l,'playlist','p','down',['2','3']);assert.deepEqual(l.playlists[0].tracks.map(t=>t.id),['1','2','3','4','5']);
 changeLibrary(l,'playlist','p','favorite',['2','3']);changeLibrary(l,'playlist','p','favorite',['2']);assert.equal(l.favorites.length,2);
 createImportedPlaylist(l,'副本',[]);changeLibrary(l,'playlist','p','add',['1','3'],l.playlists[1].id);assert.deepEqual(l.playlists[1].tracks.map(t=>t.id),['1','3']);
 changeLibrary(l,'playlist','p','rename',[],' 新歌单 ');assert.equal(l.playlists[0].name,'新歌单');changeLibrary(l,'playlist','p','remove',['2']);assert.equal(l.playlists[0].tracks.length,4);assert.equal(l.favorites.length,2);
 assert.throws(()=>libraryList(l,'playlist','missing'));assert.throws(()=>changeLibrary(l,'local','','rename',[],'x'));
});
test('JSON and M3U8 round trip actual local audio, skip missing files, URLs and duplicate entries',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'wuwo-import-'));
 try{const local=path.join(dir,'歌手 - 本地.wav');await fs.writeFile(local,wav());await fs.mkdir(path.join(dir,'sub'));await fs.writeFile(path.join(dir,'sub','not-audio.txt'),'x');assert.deepEqual(await scanAudioFolder(dir),[local]);
  const m3u=path.join(dir,'test.m3u8');await fs.writeFile(m3u,'#EXTM3U\n歌手 - 本地.wav\n歌手 - 本地.wav\nmissing.flac\nhttps://example.test/a.mp3\n');const a=await importLibraryFile(m3u);assert.equal(a.tracks.length,1);assert.equal(a.skipped,3);assert.equal(a.tracks[0].name,'本地');assert.equal(a.tracks[0].audioInfo?.sampleRate,44100);
  const online=track(228908,'晴天'),json=path.join(dir,'playlist.json');await fs.writeFile(json,exportLibrary('备份',[...a.tracks,online],'json'));const b=await importLibraryFile(json);assert.equal(b.name,'备份');assert.equal(b.tracks.length,2);assert.equal(b.skipped,0);assert.ok(exportLibrary('备份',b.tracks,'m3u8').includes(await fs.realpath(local)));assert.ok(!exportLibrary('备份',b.tracks,'m3u8').includes('228908'));
  await fs.writeFile(json,JSON.stringify({format:'WuwoMusic',version:1,tracks:[{id:'file:///secret'}, {...online,cover:'javascript:alert(1)',localPath:undefined}]}));const safe=await importLibraryFile(json);assert.equal(safe.tracks.length,1);assert.equal(safe.tracks[0].cover,undefined);assert.equal(safe.skipped,1);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('library search, lossless and missing filters do not mutate saved order',()=>{
 const rows=[track(1,'B'),{...track(2,'A'),localPath:'D:/音乐/a.flac',missing:true}];assert.equal(filterLibrary(rows,'音乐','name','local')[0].id,'2');assert.equal(filterLibrary(rows,'','name','missing')[0].name,'A');assert.deepEqual(filterLibrary(rows,'','name','all').map(t=>t.name),['A','B']);assert.equal(rows[0].name,'B');
});
test('re-importing a downloaded file retains its catalog identity and existing artwork',()=>{
 const old={...track(228908,'晴天'),localPath:path.resolve('music/晴天.flac'),cover:'https://img1.kuwo.cn/cover.jpg'},incoming={...old,id:'local-abc',cover:undefined};
 const result=uniqueTracks([old,incoming]);assert.equal(result.length,1);assert.equal(result[0].id,'228908');assert.equal(result[0].cover,old.cover);assert.equal(uniqueTracks([old,{...incoming,localPath:old.localPath.toUpperCase()}]).length,1);
});
test('browser pause restores user volume; a resumed or new source cancels stale fades',async()=>{
 const media={volume:.7,paused:false,pause(){this.paused=true;},async play(){this.paused=false;}} as any,envelope=new MediaEnvelope();
 const pause=envelope.pause(media,()=>.7);await wait(25);assert.ok(media.volume<.7);const resume=envelope.resume(media,()=>.7);await Promise.all([pause,resume]);assert.equal(media.paused,false);assert.equal(media.volume,.7);
 await envelope.pause(media,()=>.7);assert.equal(media.paused,true);assert.equal(media.volume,.7);
 const stale=envelope.enter(media,()=>.7);envelope.cancel(media,.4);await stale;assert.equal(media.volume,.4);
});
test('HiFi pause/resume envelopes return to unity gain and stale pause cannot stop a resumed track',async()=>{
 const h=new HifiPlayer('',()=>{}) as any;let paused=false,volume=100;h.socket={destroyed:false};h.poll=async()=>{};h.command=async(args:any[])=>{if(args[1]==='volume')volume=args[2];if(args[1]==='pause')paused=args[2];};
 const pause=h.control('pause');await wait(25);assert.ok(volume<100);const resume=h.control('resume');await Promise.all([pause,resume]);assert.equal(paused,false);assert.equal(volume,100);await h.control('pause');assert.equal(paused,true);assert.equal(volume,100);
});
