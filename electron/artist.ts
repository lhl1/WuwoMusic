import type {ArtistPage,Track} from '../src/shared';
import {KuwoProvider,clean,decodeBody,imageUrl,normalizeTrack,albumDetails} from './provider';
export function artistVideos(xml:string,artistId:string):{videos:Track[];total:number}{
 if(xml.length>4000000||/<!DOCTYPE|<!ENTITY/i.test(xml)||!/<root\b/.test(xml))throw Error('歌手视频数据异常');
 const total=Number(xml.match(/<section\b[^>]*\btotal="(\d+)"/)?.[1]);if(!Number.isFinite(total))throw Error('歌手视频数量异常');
 const videos=[...xml.matchAll(/<mv\b([^>]*?)\/>/g)].map(m=>Object.fromEntries([...m[1].matchAll(/([\w_]+)="([^"]*)"/g)].map(v=>[v[1],clean(v[2])]))).filter(r=>r.artistid===artistId&&/^\d+$/.test(r.rid)).map(r=>({...normalizeTrack(r),hasMv:true,cover:imageUrl(r.img?.replace(/^http(s?):\/\/img([1-4])\.kwcdn\.kuwo\.cn\//,'https://img$2.kuwo.cn/'))}));
 if(total&&!videos.length)throw Error('歌手视频未正确返回');return {videos,total};
}
export async function artistPage(provider:KuwoProvider,id:string,tab:'music'|'albums'|'videos'|'about',page:number):Promise<ArtistPage>{
 if(!/^\d{1,20}$/.test(id)||!['music','albums','videos','about'].includes(tab))throw Error('无效的歌手查询');
 const raw=await provider.json(`https://search.kuwo.cn/r.s?stype=artistinfo&artistid=${id}&encoding=utf8&rformat=json`,300000);
 if(String(raw.id)!==id)throw Error('歌手资料暂不可用');
 const artist={id,kind:'artist' as const,name:clean(raw.name),count:Number(raw.musicnum)||undefined,cover:imageUrl(raw.hts_pic)||imageUrl(raw.pic,'artist'),description:clean(raw.info||raw.desc)};
 const result:ArtistPage={artist,tracks:[],albums:[],videos:[],total:0,page,facts:Object.fromEntries([['外文名',raw.aartist],['别名',raw.oname],['地区',raw.country],['生日',raw.birthday],['出生地',raw.birthplace],['语言',raw.language]].map(([k,v])=>[k,clean(v)]).filter(([,v])=>v))};
 if(tab==='music'){const songs=await provider.collection(id,'artist',page);return {...result,tracks:songs.tracks,total:songs.total};}
 if(tab==='albums'){const r=await provider.json(`https://search.kuwo.cn/r.s?stype=albumlist&artistid=${id}&pn=${page}&rn=24&encoding=utf8&rformat=json`,60000);if(!Array.isArray(r.albumlist))throw Error('歌手专辑暂不可用');return {...result,albums:r.albumlist.map((a:any)=>albumDetails(a,String(a.albumid??a.id))),total:Number(r.total)||r.albumlist.length};}
 if(tab==='videos'){const res=await provider.fetcher(`https://mobi.kuwo.cn/mobi.s?type=music_list&id=${id}&key=mv&start=${page*24}&count=24&presell=1&apiv=2&rformat=xml&f=web&encoding=utf8`,{signal:AbortSignal.timeout(12000)});if(!res.ok)throw Error('歌手视频暂不可用');return {...result,...artistVideos(decodeBody(new Uint8Array(await res.arrayBuffer())),id)};}
 return result;
}
