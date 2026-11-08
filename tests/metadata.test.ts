import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ArtworkCache,artworkSource} from '../electron/artwork';
import {MetadataCache,formatLrc,parseLrc} from '../electron/metadata';
import {imageUrl,KuwoProvider} from '../electron/provider';
import type {Track} from '../src/shared';
const track:Track={id:'228908',name:'晴天',artist:'周杰伦',album:'叶惠美',duration:269,qualities:['128k','320k','flac']};
test('relative artwork paths normalize; cache rejects arbitrary origins',()=>{
 assert.equal(imageUrl('120/s3s94/93/211513640.jpg'),'https://img4.kuwo.cn/star/albumcover/120/s3s94/93/211513640.jpg');
 assert.equal(imageUrl('http://img4.kuwo.cn/a.jpg'),'https://img4.kuwo.cn/a.jpg');
 for(const u of ['file:///C:/secret','https://127.0.0.1/a','https://kuwo.cn.evil.test/a','https://u:p@img4.kuwo.cn/a'])assert.throws(()=>artworkSource(u));
});
test('legacy CDN aliases normalize at both API and persisted-image entry points',()=>{
 const legacy='http://img1.kwcdn.kuwo.cn/star/userpl2015/20/94/cover_700.jpg?v=2';
 const expected='https://img1.kuwo.cn/star/userpl2015/20/94/cover_700.jpg?v=2';
 assert.equal(imageUrl(legacy),expected);assert.equal(artworkSource(legacy),expected);
 assert.equal(artworkSource(expected),expected);
 assert.throws(()=>artworkSource('https://img1.kwcdn.kuwo.cn.evil.test/a.jpg'));
 assert.throws(()=>artworkSource('https://u:p@img1.kwcdn.kuwo.cn/a.jpg'));
 assert.equal(imageUrl('https://img1.kwcdn.kuwo.cn:bad/a.jpg'),undefined);
});
test('legacy and canonical covers share one download and the same offline cache',async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'wuwo-cdn-'));let calls=0,offline=false;
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=','base64');
 const old='https://img1.kwcdn.kuwo.cn/a.png',current='https://img1.kuwo.cn/a.png';
 const cache=new ArtworkCache(tmp,async url=>{calls++;assert.equal(url,current);await new Promise(r=>setTimeout(r,10));return new Response(png);},()=>offline);
 try{await Promise.all([cache.bytes(old),cache.bytes(current)]);assert.equal(calls,1);offline=true;assert.deepEqual(await cache.bytes(old),png);assert.equal(calls,1);}
 finally{await fs.rm(tmp,{recursive:true,force:true});}
});
test('LRC supports repeated timestamps, hundredths, milliseconds and offset',()=>{
 const lines=parseLrc('[ar:歌手]\n[offset:500]\n[00:01.25][00:05.125]第一句\n[01:02]第二句');assert.deepEqual(lines,[{time:0.75,text:'第一句'},{time:4.625,text:'第一句'},{time:61.5,text:'第二句'}]);
 const reparsed=parseLrc(formatLrc(lines));assert.equal(reparsed.length,3);assert.equal(reparsed[0].time,0.75);assert.equal(reparsed[1].time,4.63);
});
test('lyrics requests omit the referrer which causes an empty service response',async()=>{
 const provider=new KuwoProvider(async(_url,init)=>{const h=new Headers(init?.headers);assert.equal(h.has('referer'),false);return new Response(JSON.stringify({status:200,data:{lrclist:[{time:'1.5',lineLyric:'第一句'}]}}));});
 assert.deepEqual(await provider.lyrics(track.id),[{time:1.5,text:'第一句'}]);
});
test('transient empty lyric replies retry; manual refresh bypasses a cached success',async()=>{
 let calls=0;const provider=new KuwoProvider(async()=>{calls++;return new Response(JSON.stringify(calls===1?{status:301,data:null}:{status:200,data:{lrclist:[{time:1,lineLyric:'歌词'}]}}));});
 assert.equal((await provider.lyrics(track.id)).length,1);assert.equal(calls,2);await provider.lyrics(track.id);assert.equal(calls,2);await provider.lyrics(track.id,true);assert.equal(calls,3);
});
test('artwork coalesces requests, persists and serves offline; rejects HTML',async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'kuwo-art-'));let calls=0,offline=false;
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=','base64');
 const cache=new ArtworkCache(tmp,async()=>{calls++;await new Promise(r=>setTimeout(r,10));return new Response(png);},()=>offline);
 try{await Promise.all([cache.bytes('https://img4.kuwo.cn/a.png'),cache.bytes('https://img4.kuwo.cn/a.png')]);assert.equal(calls,1);offline=true;assert.deepEqual(await cache.bytes('https://img4.kuwo.cn/a.png'),png);assert.equal(calls,1);const invalid=new ArtworkCache(path.join(tmp,'bad'),async()=>new Response('<html>error</html>'),()=>false);await assert.rejects(invalid.bytes('https://img4.kuwo.cn/b.jpg'));}
 finally{await fs.rm(tmp,{recursive:true,force:true});}
});
test('lyrics and artwork survive concurrent writes and restart without network',async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'kuwo-meta-'));let calls=0;
 const provider={lyrics:async()=>{calls++;return [{time:1,text:'第一句'}];},share:async()=>({img:'https://img4.kuwo.cn/a.jpg'})};
 const cache=new MetadataCache(tmp,provider,()=>false);
 try{await Promise.all([cache.lyrics(track),cache.cover(track)]);assert.ok((await cache.read(track.id)).cover);assert.equal((await cache.read(track.id)).lyrics?.length,1);
 const reopened=new MetadataCache(tmp,{lyrics:async()=>{throw Error('offline');},share:async()=>{throw Error('offline');}},()=>true);assert.equal((await reopened.lyrics({...track,localPath:path.join(tmp,'song.mp3')})).length,1);assert.equal(await reopened.cover(track),'https://img4.kuwo.cn/a.jpg');assert.equal(calls,1);}
 finally{await fs.rm(tmp,{recursive:true,force:true});}
});
test('imported local music reads sidecar cover and LRC while offline',async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'kuwo-local-meta-'));
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=','base64');
 const local={...track,id:'local-abcdef',localPath:path.join(tmp,'song.flac')};
 const cache=new MetadataCache(path.join(tmp,'metadata'),{lyrics:async()=>{throw Error('Must not access network');},share:async()=>{throw Error('Must not access network');}},()=>true);
 try{await fs.writeFile(path.join(tmp,'song.cover.png'),png);await fs.writeFile(path.join(tmp,'song.lrc'),'[00:12.50]本地歌词');assert.match((await cache.cover(local))!,/^data:image\/png;base64,/);assert.deepEqual(await cache.lyrics(local),[{time:12.5,text:'本地歌词'}]);}
 finally{await fs.rm(tmp,{recursive:true,force:true});}
});
