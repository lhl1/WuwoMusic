import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {clean,normalizeTrack,albumDetails,KuwoProvider} from '../electron/provider';
import {Store} from '../electron/storage';

test('service text decodes spaces, numeric Unicode and nested entities without executing markup',()=>{
 assert.equal(clean('His&nbsp;Smile'),'His Smile');assert.equal(clean('Love&amp;nbsp;Letter'),'Love Letter');
 assert.equal(clean('A&#160;B&#x20;C &amp; D &#x1F3B5;'),'A B C & D 🎵');
 assert.equal(clean('<p>第一段</p><br>第二段'),'第一段\n\n第二段');
 assert.equal(clean('&#x110000; &#55296;'),'� �');
 assert.equal(clean('&lt;img src=x onerror=alert(1)&gt;标题'),'标题');
 assert.equal(clean('A &unknown; B'),'A &unknown; B');
});
test('album metadata preserves paragraphs, publication and verified catalog tags',()=>{
 const info=albumDetails({name:'Love&nbsp;Letter',artist:'麗美',info:'第一段<br>第二段',pub:'1995-04-21',company:'℗&nbsp;Haisheng',lang:'纯音乐',title:'《情书》电影原声带',songnum:15,tag:"[{'cat1':'日本流行','cat2':'日本流行'},{'cat2':'流行Pop'},{'cat2':'流行Pop'}]"},'10140374');
 assert.equal(info.name,'Love Letter');assert.equal(info.description,'第一段\n第二段');assert.equal(info.releaseDate,'1995-04-21');assert.equal(info.company,'℗ Haisheng');assert.deepEqual(info.tags,['日本流行','流行Pop']);
 assert.deepEqual(albumDetails({tag:'not valid',pub:'unknown'},'1').tags,[]);assert.equal(albumDetails({pub:'unknown'},'1').releaseDate,undefined);
 const t=normalizeTrack({name:'His&nbsp;Smile',album:'Love&nbsp;Letter',albumId:10140374,MINFO:'format:flac;bitrate:2000',N_MINFO:'level:dtsx,format:mmp4;level:ff,format:flac'});
 assert.equal(t.name,'His Smile');assert.equal(t.albumId,'10140374');assert.deepEqual(t.catalogTags,['DTS:X']);assert.equal(t.audioInfo,undefined);
 assert.equal(normalizeTrack({name:'DTSX is just a title',formats:'MP3H'}).catalogTags,undefined);
});
test('album content returns details with the tracks and fills missing album artwork',async()=>{
 let calls=0;const p=new KuwoProvider(async()=>{calls++;return new Response(JSON.stringify({id:'42',name:'Love&nbsp;Letter',songnum:1,hts_img:'https://img2.kuwo.cn/a.jpg',musiclist:[{id:1,name:'His&nbsp;Smile'}]}));});
 const r=await p.collection('42','album');assert.equal(calls,1);assert.equal(r.collection?.name,'Love Letter');assert.equal(r.tracks[0].cover,'https://img2.kuwo.cn/a.jpg');assert.equal(r.tracks[0].albumId,'42');assert.equal(r.tracks[0].name,'His Smile');
});
test('saved metadata repairs display text without renaming files or changing identifiers',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wuwo-text-'));const filename=path.join(dir,'state.json');
 const track={id:'42',name:'His&nbsp;Smile',artist:'A&amp;B',album:'Love&nbsp;Letter',qualities:['flac'],duration:1,localPath:'D:/Music/His&nbsp;Smile.flac'};
 try{fs.writeFileSync(filename,JSON.stringify({version:1,library:{favorites:[track]},tasks:[{id:'task-1',track,path:track.localPath,status:'completed'}]}));const before=fs.readFileSync(filename,'utf8'),store=new Store(filename,dir);assert.equal(store.data.library.favorites[0].name,'His Smile');assert.equal(store.data.tasks[0].track.album,'Love Letter');assert.equal(store.data.tasks[0].path,track.localPath);assert.equal(store.data.tasks[0].id,'task-1');assert.equal(fs.readFileSync(filename,'utf8'),before);}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});
