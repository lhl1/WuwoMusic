import {test} from 'node:test';
import assert from 'node:assert/strict';
import {catalogItems,DiscoveryService,parseMvReply} from '../electron/discovery';
import {KuwoProvider,MusicError,normalizeTrack} from '../electron/provider';

test('catalog fields, artist images, IDs and chart metadata stay normalized',()=>{
 const artist=catalogItems({BASEPICPATH:'https://img1.kuwo.cn/star/starheads/',abslist:[{ARTISTID:'336',ARTIST:'周杰伦',PICPATH:'120/a.jpg',SONGNUM:123},{ARTISTID:'bad'}]},'artist');
 assert.equal(artist.length,1);assert.equal(artist[0].id,'336');assert.equal(artist[0].name,'周杰伦');assert.ok(artist[0].cover?.endsWith('/120/a.jpg'));
 const album=catalogItems({albumlist:[{albumid:1293,name:'叶惠美',artist:'周杰伦',musiccnt:11,img:'https://img1.kuwo.cn/a.jpg'}]},'album')[0];assert.equal(album.count,11);assert.equal(album.kind,'album');
 const t=normalizeTrack({MUSICRID:'MUSIC_228908',NAME:'晴天',MVFLAG:1,ARTISTID:'336',ALBUMID:'1293'});assert.equal(t.hasMv,true);assert.equal(t.artistId,'336');assert.equal(t.albumId,'1293');
 assert.equal(normalizeTrack({id:1,MVFLAG:'0',mvpayinfo:{vid:'0'}}).hasMv,false);
});

test('MV parsing accepts the verified media hosts and refuses bogus protocols',()=>{
 assert.deepEqual(parseMvReply('format=mp4\r\nquality=MP4BD\r\nbitrate=3000\r\nurl=http://other-bj.kuwo.cn/a.mp4\r\n'),{url:'https://other-bj.kuwo.cn/a.mp4',quality:'MP4BD',bitrate:3000});
 for(const url of ['file:///C:/test','https://kuwo.cn.evil.test/a.mp4','https://other-bj.kuwo.cn/588957081.mp4'])assert.throws(()=>parseMvReply(`format=mp4\nurl=${url}`));
});

test('legacy artist and album objects parse data without executing JavaScript',async()=>{
 const p=new KuwoProvider(async()=>new Response("{'musiclist':[{'id':'228908','name':'晴天'}],'songnum':'11'}"));const r=await p.collection('1293','album');assert.equal(r.total,11);assert.equal(r.tracks[0].name,'晴天');
 const unsafe=new KuwoProvider(async()=>new Response("{'musiclist':(function(){throw 'executed'})()}"));await assert.rejects(unsafe.collection('1293','album'),/无法识别/);
});

test('highest available quality is tried in order, previews never pass as full audio',async()=>{
 for(const purpose of ['play','download']as const){
  const p=new KuwoProvider(),seen:string[]=[];
  p.resolve=async(_t,q)=>{seen.push(q);if(q==='flac')throw new MusicError('QUALITY','No FLAC');return {url:'https://other-bj.kuwo.cn/a.mp3',quality:q,format:'mp3',trial:false};};
  assert.equal((await p.resolveBest(normalizeTrack({rid:1}),'flac',purpose)).quality,'320k');assert.deepEqual(seen,['flac','320k']);
  seen.length=0;p.resolve=async(_t,q)=>{seen.push(q);return {url:'https://other-bj.kuwo.cn/a.mp3',quality:q,format:'mp3',trial:q!=='128k'};};
  assert.equal((await p.resolveBest(normalizeTrack({rid:1}),'flac',purpose)).quality,'128k');assert.deepEqual(seen,['flac','320k','128k']);
 }
});

test('network and wrong-track failures are not disguised by trying another quality',async()=>{
 for(const code of ['NETWORK','WRONG_TRACK','INVALID','RESPONSE']){const p=new KuwoProvider();let calls=0;p.resolve=async()=>{calls++;throw new MusicError(code,'failure');};await assert.rejects(p.resolveBest(normalizeTrack({rid:1}),'flac','download'));assert.equal(calls,1);}
});

test('audio business rejection can fall back while other API business errors stay errors',async()=>{
 let calls=0;const p=new KuwoProvider(async()=>{calls++;return new Response(JSON.stringify(calls===1?{code:404,msg:'无损不存在'}:{code:200,data:{surl:'https://other-bj.kuwo.cn/a.mp3',format:'mp3',bitrate:320,duration:200}}));});assert.equal((await p.resolveBest(normalizeTrack({id:1,duration:200}),'flac','download')).quality,'320k');assert.equal(calls,2);
 const broken=new KuwoProvider(async()=>new Response('{"code":500,"msg":"服务出错"}'));await assert.rejects(broken.search('a'),/服务出错/);
});

test('aggregate search preserves partial results and reports partial failures',async()=>{
 const p=new KuwoProvider();p.search=async()=>({tracks:[normalizeTrack({rid:1,name:'歌曲'})],total:1,page:0});p.json=async(url)=>{const kind=new URL(url).searchParams.get('ft');if(kind==='artist')throw Error('offline');return kind==='album'?{albumlist:[{albumid:2,name:'专辑'}],total:1}:{abslist:[{playlistid:3,name:'歌单'}],total:1};};
 const r=await new DiscoveryService(p).search('歌曲','all');assert.equal(r.tracks.length,1);assert.equal(r.items.length,2);assert.deepEqual(r.errors,['歌手暂不可用']);
});

test('lyrics search, tags and playlist pagination use distinct validated requests',async()=>{
 const p=new KuwoProvider(),urls:string[]=[];p.json=async(url)=>{urls.push(url);if(url.includes('getTagList'))return {data:[{name:'风格',data:[{id:146,name:'流行',digest:10000},{id:1,name:'banner',digest:3}]}]};if(url.includes('getTagPlayList'))return {data:{total:50,data:[{id:99,name:'歌单',total:10}]}};return {TOTAL:1,abslist:[{MUSICRID:'MUSIC_1',NAME:'晴天'}]};};const d=new DiscoveryService(p);
 assert.equal((await d.search('故事的小黄花','lyrics',1)).tracks[0].id,'1');const params=new URL(urls[0]).searchParams;assert.equal(params.get('lrccontent'),'故事的小黄花');assert.equal(params.get('pn'),'1');assert.equal(params.has('all'),false);
 assert.equal((await d.tags()).length,1);const page=await d.playlists(1,'new','146');assert.equal(page.total,50);assert.equal(page.items[0].count,10);const list=new URL(urls.at(-1)!);assert.equal(list.searchParams.get('pn'),'2');assert.equal(list.searchParams.get('id'),'146');
});
