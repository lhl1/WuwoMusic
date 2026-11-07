import { createCipheriv } from 'node:crypto';
import JSON5 from 'json5';
import type { Collection, LyricLine, Purpose, Quality, ResolvedAudio, SearchResult, Track } from '../src/shared';
import {abortable,bounded} from '../src/playback-control';

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export const UA = 'Mozilla/5.0 KuwoDesktop/1.0';
export class MusicError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'MusicError'; }
}
export function decodeBody(bytes: Uint8Array, contentType = ''): string {
  if (/charset=(gbk|gb2312|gb18030)/i.test(contentType)) return new TextDecoder('gb18030').decode(bytes);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('gb18030').decode(bytes); }
}
export function clean(value: unknown): string {
  return String(value ?? '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
}
export function imageUrl(value:unknown,kind:'album'|'artist'='album'):string|undefined {
  const text=String(value??'').trim();if(!text || text==='undefined')return;
  if(/^https?:\/\//i.test(text))return text.replace(/^http:/i,'https:');
  if(/^\d+\/[\w/.-]+$/.test(text))return `https://img4.kuwo.cn/star/${kind==='album'?'albumcover':'artist'}/${text}`;
}
export function normalizeTrack(row: Record<string, any>): Track {
  const id = String(row.MUSICRID ?? row.musicrid ?? row.musicrId ?? row.rid ?? row.id ?? '').replace(/^MUSIC_/, '');
  const formats = String(row.MINFO ?? row.N_MINFO ?? row.formats ?? '');
  const qualities: Quality[] = [];
  if (/128|MP3|mp3/.test(formats) || !formats) qualities.push('128k');
  if (/bitrate:320|MP3H/.test(formats)) qualities.push('320k');
  if (/format:flac|ALFLAC/.test(formats)) qualities.push('flac');
  const pay = row.payInfo ?? row.payinfo ?? {};
  const unavailable = String(row.ONLINE ?? row.online ?? '1') === '0';
  const time = row.DURATION ?? row.duration ?? row.songTimeMinutes ?? 0;
  const duration = String(time).includes(':') ? String(time).split(':').reduce((n,v)=>n*60+Number(v),0) : Number(time);
  return { id, name: clean(row.NAME ?? row.name ?? row.songName), artist: clean(row.ARTIST ?? row.artist),
    album: clean(row.ALBUM ?? row.album), duration: Number.isFinite(duration) ? duration : 0,
    cover: imageUrl(row.albumpic || row.pic || row.img || row.hts_PICPATH || row.web_albumpic_short) || imageUrl(row.web_artistpic_short,'artist'),
    qualities, availability: unavailable ? 'unavailable' : 'unknown',
    hasMv:String(row.MVFLAG??row.hasmv??row.hasMv??'0')==='1'||Number(row.mvpayinfo?.vid)>0,artistId:String(row.ARTISTID??row.artistid??'')||undefined,albumId:String(row.ALBUMID??row.albumid??'')||undefined,
    payInfo: {play: String(pay.play ?? ''), download: String(pay.download ?? pay.down ?? ''), trial: String(pay.listen_fragment ?? '0') === '1', encrypted: String(pay.local_encrypt ?? '0') === '1'} };
}
export function flattenRanks(root: any): Collection[] {
  const out: Collection[] = [];
  function walk(node: any,group='') {
    if (!node || typeof node !== 'object') return;
    if (node.sourceid && String(node.source) === '2') out.push({ id: String(node.sourceid), name: clean(node.name), cover: imageUrl(node.pic2||node.pic), description: clean(node.intro), kind: 'rank', count: Number(node.info) || undefined,group });
    for (const child of node.child ?? []) walk(child,node.name?clean(node.name):group);
  }
  walk(root);
  return Array.from(new Map(out.map(x=>[x.id,x])).values());
}
export function isMediaUrl(value: string): boolean {
  try { const u = new URL(value); return ['https:','http:'].includes(u.protocol) && /(^|\.)((kuwo|kwcdn)\.cn|sycdn\.kuwo\.cn)$/.test(u.hostname); } catch { return false; }
}
export function parseAudioReply(reply: any, track: Track, quality: Quality): ResolvedAudio {
  const d = reply?.data ?? reply;
  if (d?.rid && String(d.rid) !== track.id) throw new MusicError('WRONG_TRACK', '音频服务返回了其他曲目，已停止播放');
  const raw = typeof d === 'string' ? d : d?.surl ?? d?.url;
  if (!raw || !isMediaUrl(raw)) throw new MusicError('UNAVAILABLE', '该歌曲暂时没有可用音频');
  // This resource is the service's 11-second refusal recording, not the requested song.
  if (/588957081\.mp3|M5000004Gmy54cGDqK/.test(raw)) throw new MusicError('RESTRICTED', '该歌曲当前无法免登录获取完整音频');
  const url = raw.replace(/\\u0026/g,'&');
  const actualFormat = String(d?.format ?? (new URL(url).pathname.match(/\.(mp3|flac|aac|m4a|wav|ogg)$/i)?.[1] ?? 'mp3')).toLowerCase();
  const duration = Number(d?.duration) || undefined;
  const bitrate = Number(d?.bitrate) || undefined;
  return { url, quality, format: actualFormat, bitrate, duration, trial: d?.trial === true || d?.trial === 1 || (!!duration && track.duration > duration + 8) };
}

/** Recovered from the supplied 12.2.2.5-东 APK's kwpass.KpkUtilX native payload.
 * This adapter is deliberately separate from official share/preview metadata.
 * The service still decides resource availability; validate every returned file.
 */
export function modifiedRequest(id:string,quality:Quality,purpose:Purpose):string {
  if(!/^\d+$/.test(id))throw new MusicError('INVALID','无效的歌曲编号');
  const params=new URLSearchParams({user:'0',prod:'kwplayer_ar_12.2.2.5',corp:'kuwo',newver:'3',vipver:'12.2.2.5',source:'kwradio_ar_6.0.0.9_B_jiakong_vh.apk',type:'convert_url_with_sign',br:quality==='flac'?'2000kflac':quality==='320k'?'320kmp3':'128kmp3',format:quality==='flac'?'flac':'mp3',sig:'0',rid:id,priority:'bitrate',network:'WIFI',localUid:'-1',mode:purpose==='download'?'download':'audition',uid:'0',downloadPay:'0',playPay:'0',surl:'1',apiv:'1'});
  const cipher=createCipheriv('aes-128-ecb',Buffer.from('14505b09374869d9','ascii'),null);
  const q=Buffer.concat([cipher.update(params.toString(),'utf8'),cipher.final()]).toString('base64');
  return 'https://mobi.kuwo.cn/mobi.s?f=kwxs&q='+q;
}

export class KuwoProvider {
  private cache = new Map<string,{ expires:number; value:unknown }>();
  private searches=new Map<string,Promise<SearchResult>>();
  constructor(public fetcher: Fetcher = fetch) {}
  async json(url: string, ttl = 0, headers:Record<string,string>={'User-Agent': UA, Referer:'https://www.kuwo.cn/'},acceptBusinessError=false,timeoutMs=20000,signal?:AbortSignal): Promise<any> {
    const cached = this.cache.get(url);
    if (cached && cached.expires > Date.now()) return cached.value;
    const {res,bytes}=await bounded(async s=>{const res=await this.fetcher(url,{headers,cache:'no-store',signal:s});return {res,bytes:new Uint8Array(await abortable(res.arrayBuffer(),s))};},timeoutMs,'音乐服务请求超时',signal);
    if (!res.ok) throw new MusicError('NETWORK', `服务暂不可用（HTTP ${res.status}）`);
    let value: any;
    try { const body=decodeBody(bytes, res.headers.get('content-type') ?? '');try{value=JSON.parse(body);}catch(e){if(new URL(url).hostname!=='search.kuwo.cn')throw e;value=JSON5.parse(body);} }
    catch { throw new MusicError('RESPONSE', '音乐服务返回了无法识别的数据'); }
    if (!acceptBusinessError&&(value?.success === false || (value?.code && Number(value.code) !== 200))) throw new MusicError('SERVICE', clean(value.msg ?? value.message ?? '服务请求失败'));
    if (ttl && value?.data!==null) { if (this.cache.size > 150) this.cache.clear(); this.cache.set(url,{expires:Date.now()+ttl,value}); }
    return value;
  }
  async search(query:string,page=0): Promise<SearchResult> {
    query=query.normalize('NFKC').replace(/[\u200b-\u200d\ufeff]/g,'').replace(/\s+/g,' ').trim().slice(0,200);
    if(!query)return {tracks:[],total:0,page};
    const key=JSON.stringify([query,page]),pending=this.searches.get(key);if(pending)return pending;
    const work=(async()=>{
      let error:unknown,empty:SearchResult|undefined;
      for(let attempt=0;attempt<3;attempt++){
        try{const params=new URLSearchParams({client:'kt',cluster:'0',strategy:'2012',ver:'mbox',show_copyright_off:'1',encoding:'utf8',rformat:'json',mobi:'1',vipver:'1',pn:String(page),rn:'30',issubtitle:'1',correct:'1',ft:'music',newver:attempt===0?'1':'3',vermerge:'1',all:query});
          if(attempt>0)params.set('searchapi','11');
          const d=await this.json(`https://search.kuwo.cn/r.s?${params}`,0,undefined,false,8000);
          if(!Array.isArray(d.abslist)&&!(['TOTAL','HIT','total'].some(k=>k in d&&Number(d[k])===0)))throw new MusicError('RESPONSE','搜索服务返回了不完整的数据，请重试');
          const tracks=(d.abslist??[]).map(normalizeTrack).filter((t:Track)=>/^\d+$/.test(t.id)),total=Math.max(tracks.length,Number(d.TOTAL??d.HIT??d.total)||0);
          if(tracks.length||page>0)return {tracks,total,page};
          if(total>0)throw new MusicError('RESPONSE','搜索结果暂时未能加载，请重试');
          empty={tracks:[],total:0,page};if(attempt>0)return empty;
        }catch(e){error=e;if(/离线/.test((e as Error).message))throw e;}
        if(attempt<2)await new Promise(r=>setTimeout(r,200*(attempt+1)));
      }
      // A failed confirmation must not turn a transient empty response into a definitive no-results message.
      throw error??new MusicError('SERVICE','搜索服务暂不可用，请重试');
    })();this.searches.set(key,work);try{return await work;}finally{this.searches.delete(key);}
  }
  async ranks(): Promise<Collection[]> { return flattenRanks(await this.json('https://wapi.kuwo.cn/api/pc/bang/list',300000)); }
  async recommendations(page=0): Promise<Collection[]> {
    const d = await this.json(`https://wapi.kuwo.cn/api/pc/classify/playlist/getRcmPlayList?pn=${page+1}&rn=12&order=hot`,300000);
    return (d.data?.data ?? []).map((r:any)=>({id:String(r.id),name:clean(r.name),cover:r.img,description:clean(r.desc),count:Number(r.total),kind:'playlist'}));
  }
  async home(page=0) {
    const [rec, ranks] = await Promise.allSettled([this.recommendations(page),this.ranks()]);
    if (rec.status==='rejected' && ranks.status==='rejected') throw rec.reason;
    return {recommendations:rec.status==='fulfilled'?rec.value:[],ranks:ranks.status==='fulfilled'?ranks.value:[]};
  }
  async collection(id:string,kind:Collection['kind'],page=0): Promise<SearchResult> {
    if (!/^\d+$/.test(id)) throw new MusicError('INVALID','无效的列表编号');
    const url = kind==='rank'
      ? `https://kbangserver.kuwo.cn/ksong.s?from=pc&fmt=json&pn=${page}&rn=30&type=bang&data=content&id=${id}`
      : kind==='album'||kind==='artist'?`https://search.kuwo.cn/r.s?stype=${kind==='album'?'albuminfo':'artist2music'}&${kind}id=${id}&pn=${page}&rn=30&encoding=utf8&rformat=json&show_copyright_off=1&vipver=1`
      : `https://nplserver.kuwo.cn/pl.svc?op=getlistinfo&pid=${id}&pn=${page}&rn=30&encode=utf8&keyset=pl2012&identity=kuwo&vipver=MUSIC_9.1.1.2_BCS2&newver=1`;
    const d = await this.json(url,60000);
    return {tracks:(d.musiclist ?? []).map(normalizeTrack),total:Number(d.total ?? d.num ?? d.songnum ?? 0),page};
  }
  async collectionCover(id:string,kind:Collection['kind']):Promise<string|undefined>{
    if(!/^\d+$/.test(id))throw new MusicError('INVALID','无效的封面编号');
    if(kind==='rank')return (await this.ranks()).find(c=>c.id===id)?.cover;
    const url=kind==='playlist'?`https://nplserver.kuwo.cn/pl.svc?op=getlistinfo&pid=${id}&pn=0&rn=1&encode=utf8&keyset=pl2012&identity=kuwo&vipver=MUSIC_9.1.1.2_BCS2&newver=1`:`https://search.kuwo.cn/r.s?stype=${kind}info&${kind}id=${id}&encoding=utf8&rformat=json`;
    const d=await this.json(url,300000);return imageUrl(d.hts_img||d.pic||d.img||d.artistpic);
  }
  async share(id:string): Promise<any> {
    if (!/^\d+$/.test(id)) throw new MusicError('INVALID','无效的歌曲编号');
    const d = await this.json(`https://mobi.kuwo.cn/mobi.s?f=web&type=get_music_for_share&rid=${id}`);
    if (!d.data?.url) throw new MusicError('UNAVAILABLE','该歌曲没有可用音频');
    return d.data;
  }
  async resolve(track:Track,quality:Quality,purpose:Purpose,signal?:AbortSignal): Promise<ResolvedAudio> {
    const reply=await this.json(modifiedRequest(track.id,quality,purpose),0,{'User-Agent':UA,Referer:'https://www.kuwo.cn/'},true,purpose==='play'?8000:20000,signal);
    if(Number(reply.code)!==200)throw new MusicError('UNAVAILABLE',clean(reply.msg)||'音频服务暂时无法提供该歌曲');
    const result=parseAudioReply(reply,track,quality);
    if(quality==='flac' && result.format!=='flac')throw new MusicError('QUALITY','该歌曲当前未提供 FLAC 无损音质，请选择标准音质');
    if(quality==='320k' && (result.format!=='mp3' || !result.bitrate || result.bitrate<280))throw new MusicError('QUALITY','该歌曲当前未提供 320 kbps 音质，请选择标准音质');
    if(purpose==='download' && result.trial)throw new MusicError('TRIAL','该地址仅提供试听片段，不能保存为完整歌曲');
    // Official payInfo describes the official client, and must not veto this APK's separate route.
    // Artwork is loaded independently by Cover/MetadataCache and must never delay playback.
    if(purpose==='play')result.cover=track.cover;
    return result;
  }
  async resolveBest(track:Track,preferred:Quality,purpose:Purpose,signal?:AbortSignal):Promise<ResolvedAudio>{
    const choices:Quality[]=preferred==='flac'?['flac','320k','128k']:preferred==='320k'?['320k','128k']:['128k'];
    let failure:unknown;
    for(const q of choices){try{signal?.throwIfAborted();const audio=await this.resolve(track,q,purpose,signal);if(audio.trial)throw new MusicError('TRIAL','当前仅有试听片段');return audio;}catch(e){failure=e;if(!(e instanceof MusicError)||!['QUALITY','UNAVAILABLE','RESTRICTED','TRIAL'].includes(e.code))throw e;}}
    throw failure;
  }

  async lyrics(id:string,force=false):Promise<LyricLine[]> {
    if (!/^\d+$/.test(id)) return [];
    const web=`https://www.kuwo.cn/openapi/v1/www/lyric/getlyric?musicId=${id}`,mobile=`https://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=${id}`;
    if(force){this.cache.delete(web);this.cache.delete(mobile);}
    let failure:unknown;
    for(let attempt=0;attempt<3;attempt++){
      try{const d=await this.json(attempt===1?mobile:web,300000,{'User-Agent':'Mozilla/5.0'});
        if(!d.data)throw new MusicError('LYRICS','歌词暂时无法加载，请稍后重试');
        if(attempt===1)this.cache.set(web,{expires:Date.now()+300000,value:d});
        return (d.data.lrclist ?? []).map((r:any)=>({time:Number(r.time),text:clean(r.lineLyric)})).filter((r:LyricLine)=>Number.isFinite(r.time)).sort((a:LyricLine,b:LyricLine)=>a.time-b.time);
      }catch(error){failure=error;if(attempt<2)await new Promise(r=>setTimeout(r,attempt===0?200:500));}
    }
    throw failure;
  }
}
