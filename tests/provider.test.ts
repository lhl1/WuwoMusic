import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDecipheriv } from 'node:crypto';
import { decodeBody, flattenRanks, KuwoProvider, modifiedRequest, normalizeTrack, parseAudioReply } from '../electron/provider';
const sample={MUSICRID:'MUSIC_123',NAME:'晴天 &amp; 风',ARTIST:'甲',ALBUM:'乙',DURATION:'03:15',MINFO:'level:h,bitrate:128,format:mp3;level:p,bitrate:320,format:mp3;level:ff,bitrate:2000,format:flac',payInfo:{play:'0000',download:'1111',listen_fragment:'0'}};
test('normalize service variations, duration, qualities and distinct download permissions',()=>{
  const t=normalizeTrack(sample);assert.equal(t.id,'123');assert.equal(t.name,'晴天 & 风');assert.equal(t.duration,195);assert.deepEqual(t.qualities,['128k','320k','flac']);assert.equal(t.payInfo?.play,'0000');assert.equal(t.payInfo?.download,'1111');
  assert.equal(normalizeTrack({rid:15,name:'Song',duration:200}).id,'15');
});
test('decode UTF-8 and GB18030 without mojibake',()=>{assert.equal(decodeBody(Buffer.from('酷我音乐')),'酷我音乐');assert.equal(decodeBody(new Uint8Array([0xb1,0xb1,0xbe,0xa9])),'北京');});
test('flatten nested ranks and remove duplicates',()=>{assert.deepEqual(flattenRanks({child:[{child:[{sourceid:'16',source:'2',name:'热歌榜'},{sourceid:'16',source:'2',name:'热歌榜'}]}]}).map(x=>x.id),['16']);});
test('refuse wrong-track recordings and unsupported URL schemes',()=>{
  const t=normalizeTrack(sample);
  assert.throws(()=>parseAudioReply({url:'https://kw-bj.kuwo.cn/nf/resource/n1/69/32/588957081.mp3'},t,'128k'),/无法免登录/);
  assert.throws(()=>parseAudioReply({data:{rid:999,url:'https://kw-bj.kuwo.cn/a.mp3'}},t,'128k'),/其他曲目/);
  assert.throws(()=>parseAudioReply({url:'file:///C:/test'},t,'128k'),/没有可用/);
  assert.throws(()=>parseAudioReply({url:'https://kuwo.cn.evil.test/a.mp3'},t,'128k'),/没有可用/);
});
test('modified request preserves ID, quality and separate play/download modes',()=>{
  for(const purpose of ['play','download'] as const){
    const url=modifiedRequest('228908','flac',purpose);
    const decipher=createDecipheriv('aes-128-ecb',Buffer.from('14505b09374869d9'),null);
    const encoded=url.slice(url.indexOf('&q=')+3);
    const text=Buffer.concat([decipher.update(Buffer.from(encoded,'base64')),decipher.final()]).toString();
    const p=new URLSearchParams(text);assert.equal(p.get('rid'),'228908');assert.equal(p.get('br'),'2000kflac');assert.equal(p.get('source'),'kwradio_ar_6.0.0.9_B_jiakong_vh.apk');assert.equal(p.get('mode'),purpose==='play'?'audition':'download');
  }
  assert.throws(()=>modifiedRequest('228908&rid=1','128k','download'));
});
test('official payInfo does not veto a verified complete response from modified route',async()=>{
  const provider=new KuwoProvider(async()=>new Response(JSON.stringify({code:200,data:{rid:123,surl:'https://other-er.kuwo.cn/audio.mp3',duration:195,format:'mp3',bitrate:320}})));
  const audio=await provider.resolve(normalizeTrack(sample),'320k','download');assert.equal(audio.trial,false);assert.equal(audio.bitrate,320);
});
test('modified route still rejects short previews and silent quality fallback',async()=>{
  const provider=new KuwoProvider(async()=>new Response(JSON.stringify({code:200,data:{rid:123,surl:'https://other-er.kuwo.cn/audio.mp3',duration:29,format:'mp3',bitrate:128}})));
  await assert.rejects(provider.resolve(normalizeTrack(sample),'128k','download'),/试听/);
  await assert.rejects(provider.resolve(normalizeTrack(sample),'320k','download'),/320 kbps/);
  await assert.rejects(provider.resolve(normalizeTrack(sample),'flac','download'),/FLAC/);
});
