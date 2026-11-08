import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseDaily,parseEditorial,nativeHome} from '../electron/native-home';import {KuwoProvider} from '../electron/provider';
test('native editorial selects only editorial playlists, decodes entities, rejects external XML entities',()=>{
 const x='<root><section label="广告"><songlist id="4" name="广告"/></section><section label="编辑精选"><songlist id="8" name="A &amp; B" img="http://img1.kuwo.cn/a.jpg"/><songlist id="bad"/></section></root>';
 const r=parseEditorial(x);assert.equal(r.length,1);assert.equal(r[0].name,'A & B');assert.equal(r[0].cover,'https://img1.kuwo.cn/a.jpg');assert.throws(()=>parseEditorial('<!DOCTYPE root>'+x));assert.throws(()=>parseEditorial('<root/>'));
});
test('daily recommendations map nested music data without accepting ad nodes',()=>{
 const r=parseDaily({child:[{type:'rcm_discover',child:[{stype:'ad',musicdata:{rid:3}},{stype:'music',duration:200,musicdata:{rid:42,name:'歌曲',artist:'歌手',minfo:'format:flac;bitrate:320',hasmv:1}}]}]});assert.equal(r.length,1);assert.equal(r[0].name,'歌曲');assert.equal(r[0].duration,200);assert.ok(r[0].qualities.includes('flac'));assert.equal(r[0].hasMv,true);assert.throws(()=>parseDaily({code:20001,data:{}}));
});
test('one failed native module preserves the other and reports failure explicitly',async()=>{
 const p=new KuwoProvider(async(url)=>{if(url.includes('mgxh.s'))throw Error('offline');return new Response(JSON.stringify({child:[{type:'rcm_discover',child:[{stype:'music',duration:5,musicdata:{rid:1,name:'test'}}]}]}));});const r=await nativeHome(p);assert.equal(r.daily.length,1);assert.equal(r.editorial.length,0);assert.deepEqual(r.nativeErrors,['编辑精选暂不可用']);
});
