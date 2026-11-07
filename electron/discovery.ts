import type {CatalogResult,Collection,MvSource,PlaylistPage,PlaylistTag,SearchKind,Track} from '../src/shared';
import {clean,decodeBody,imageUrl,isMediaUrl,KuwoProvider,MusicError,normalizeTrack} from './provider';
export function catalogItems(raw:any,kind:'artist'|'album'|'playlist'):Collection[]{
 const rows=kind==='album'?raw.albumlist:raw.abslist;
 return (Array.isArray(rows)?rows:[]).map((r:any)=>({id:String(kind==='artist'?r.ARTISTID:kind==='album'?(r.albumid??r.id):r.playlistid),kind,name:clean(r.ARTIST??r.name),artist:clean(r.artist??r.nickname),description:clean(r.intro??r.info??r.desc).slice(0,1000),cover:imageUrl(r.hts_img??r.hts_pic??r.img??r.pic)||(kind==='artist'&&r.PICPATH?imageUrl(raw.BASEPICPATH+r.PICPATH,'artist'):undefined),count:Number(r.SONGNUM??r.musiccnt??r.songnum)||undefined,plays:Number(r.playcnt)||undefined})).filter((c:Collection)=>/^\d+$/.test(c.id));
}
export function parseMvReply(body:string):MvSource {
 const fields=Object.fromEntries(body.trim().split(/\r?\n/).filter(Boolean).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1).trim()];}));
 if(!isMediaUrl(fields.url)||fields.format!=='mp4'||/588957081|M5000004Gmy54cGDqK/.test(fields.url))throw new MusicError('MV','当前没有可播放的 MV');
 return {url:fields.url.replace(/^http:/,'https:'),quality:fields.quality||'MP4',bitrate:Number(fields.bitrate)||0};
}
export class DiscoveryService {
 constructor(private provider:KuwoProvider){}
 async search(query:string,kind:SearchKind,page=0):Promise<CatalogResult>{
  if(!query.trim())return {tracks:[],items:[],total:0,page};
  if(kind==='all'){
   const kinds=['music','artist','album','playlist']as const;
   const values=await Promise.allSettled(kinds.map(k=>this.search(query,k,page)));
   if(values.every(r=>r.status==='rejected'))throw (values[0]as PromiseRejectedResult).reason;
   const songs=values[0].status==='fulfilled'?values[0].value:null;
   return {tracks:songs?.tracks??[],total:songs?.total??0,page,items:values.flatMap(v=>v.status==='fulfilled'?v.value.items.slice(0,3):[]),errors:values.flatMap((v,i)=>v.status==='rejected'?[`${({music:'单曲',artist:'歌手',album:'专辑',playlist:'歌单'})[kinds[i]]}暂不可用`]:[])};
  }
  if(kind==='music')return {...await this.provider.search(query,page),items:[]};
  const params=new URLSearchParams({client:'kt',cluster:'0',strategy:'2012',ver:'mbox',show_copyright_off:'1',encoding:'utf8',rformat:'json',mobi:'1',vipver:'1',pn:String(page),rn:'30',ft:kind==='lyrics'?'music':kind,newver:'3',correct:'1'});
  params.set(kind==='lyrics'?'lrccontent':'all',query.slice(0,200));
  if(kind==='lyrics'){params.set('newsearch','1');params.set('searchapi','11');}
  const d=await this.provider.json('https://search.kuwo.cn/r.s?'+params);
  const total=Number(d.TOTAL??d.total??d.HIT)||0;
  return {tracks:kind==='lyrics'?(d.abslist??[]).map(normalizeTrack):[],items:kind==='lyrics'?[]:catalogItems(d,kind),total,page};
 }
 async tags():Promise<PlaylistTag[]>{
  const d=await this.provider.json('https://wapi.kuwo.cn/api/pc/classify/playlist/getTagList',3600000);
  return (Array.isArray(d.data)?d.data:[]).filter((g:any)=>g.name!=='专区').flatMap((g:any)=>(g.data??[]).filter((t:any)=>String(t.digest)==='10000').map((t:any)=>({id:String(t.id),name:clean(t.name),group:clean(g.name)})));
 }
 async playlists(page:number,order:'hot'|'new',tag?:string):Promise<PlaylistPage>{
  const params=new URLSearchParams({pn:String(page+1),rn:'24',order});if(tag)params.set('id',tag);
  const d=await this.provider.json(`https://wapi.kuwo.cn/api/pc/classify/playlist/${tag?'getTagPlayList':'getRcmPlayList'}?${params}`,60000);
  const items=(d.data?.data??[]).map((r:any)=>({id:String(r.id),kind:'playlist' as const,name:clean(r.name),cover:imageUrl(r.img),count:Number(r.total)||undefined,artist:clean(r.uname),plays:Number(r.listencnt)||undefined}));
  return {items,total:Number(d.data?.total)||items.length,page};
 }
 async mv(track:Track):Promise<MvSource>{
  let error:unknown;
  for(const quality of ['MP4BD','MP4UL','MP4HV','MP4','MP4L']){
   try{
    const params=new URLSearchParams({type:'convert_mv_url2',rid:track.id,quality,format:'mp4',mode:'audition',network:'WIFI',uid:'0',loginUid:'0',prod:'kwplayer_ar_12.2.2.5',corp:'kuwo'});
    const response=await this.provider.fetcher('https://mobi.kuwo.cn/mobi.s?'+params,{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new MusicError('NETWORK','MV 暂时无法加载');
    const source=parseMvReply(decodeBody(new Uint8Array(await response.arrayBuffer()),response.headers.get('content-type')??''));
    return source;
   }catch(e){error=e;if(e instanceof MusicError&&e.code==='NETWORK')throw e;}
  }
  throw error??new MusicError('MV','当前没有可播放的 MV');
 }
}
