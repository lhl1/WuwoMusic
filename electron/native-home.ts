import type {Collection,Track} from '../src/shared';
import {clean,decodeBody,imageUrl,normalizeTrack,KuwoProvider} from './provider';
function attrs(text:string){return Object.fromEntries([...text.matchAll(/([\w:-]+)="([^"]*)"/g)].map(m=>[m[1],m[2].replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&quot;/g,'"').replace(/&amp;/g,'&')]));}
export function parseEditorial(xml:string):Collection[]{
 if(xml.length>4000000||/<!DOCTYPE|<!ENTITY/i.test(xml)||!/<root\b/.test(xml))throw Error('编辑精选返回异常');
 const section=[...xml.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/g)].find(m=>attrs(m[1]).label==='编辑精选');
 if(!section)throw Error('编辑精选暂不可用');
 return [...section[2].matchAll(/<songlist\b([^>]*)>/g)].map(m=>{const r=attrs(m[1]);return {id:r.id,kind:'playlist' as const,name:clean(r.show_name||r.name),cover:imageUrl(r.img),description:clean(r.desc),plays:Number(r.listencnt)||undefined};}).filter(r=>/^\d+$/.test(r.id));
}
export function parseDaily(raw:any):Track[]{
 const section=raw?.child?.find((r:any)=>r.type==='rcm_discover');if(!Array.isArray(section?.child))throw Error('每日推荐暂不可用');
 return section.child.filter((r:any)=>r.musicdata&&r.stype==='music').map((r:any)=>normalizeTrack({...r.musicdata,duration:r.duration,MINFO:r.musicdata.minfo,N_MINFO:r.musicdata.n_minfo,NAME:r.musicdata.name,ARTIST:r.musicdata.artist,ALBUM:r.musicdata.album})).filter((t:Track)=>/^\d+$/.test(t.id));
}
export async function nativeHome(provider:KuwoProvider){
 const common='uid=0&loginUid=0&loginSid=0&appuid=0&plat=ar&prod=kwplayer_ar_12.2.2.5&source=kwplayer_ar_12.2.2.5';
 const values=await Promise.allSettled([
  provider.fetcher('https://homepages.kuwo.cn/mgxh.s?type=hotpage&f=web&apiv=8&'+common,{signal:AbortSignal.timeout(12000)}).then(async r=>{if(!r.ok)throw Error('编辑精选网络失败');return parseEditorial(decodeBody(new Uint8Array(await r.arrayBuffer())));}),
  provider.json('https://wapi.kuwo.cn/openapi/v1/recommend/daily/main?type=rcm_discover&tab=1&apiv=4&'+common,300000).then(parseDaily)
 ]);
 return {editorial:values[0].status==='fulfilled'?values[0].value:[],daily:values[1].status==='fulfilled'?values[1].value:[],nativeErrors:values.flatMap((r,i)=>r.status==='rejected'?[i===0?'编辑精选暂不可用':'每日推荐暂不可用']:[])};
}
