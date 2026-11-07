import type {RankPeriod,SearchHints,SearchResult,SearchSuggestion} from '../src/shared';
import {clean,decodeBody,KuwoProvider,normalizeTrack} from './provider';

function words(rows:any[],key:string):SearchSuggestion[]{
 const seen=new Set<string>();
 return rows.flatMap(row=>{const text=clean(row?.[key]).trim().slice(0,200);if(!text||seen.has(text))return [];seen.add(text);return [{text,description:clean(row.desc).slice(0,80)||undefined}];}).slice(0,20);
}
export function parseHints(raw:any,kind:'typed'|'hot'|'idle'):SearchSuggestion[]{
 if(kind==='typed'){if(raw?.STATUS!=='OK'||!Array.isArray(raw.WORDITEMS))throw Error('联想服务暂不可用');return words(raw.WORDITEMS,'RELWORD');}
 if(kind==='hot'){if(raw?.status!=='ok'||!Array.isArray(raw.hotwords))throw Error('热搜服务暂不可用');return words(raw.hotwords,'key');}
 if(!Array.isArray(raw?.content))throw Error('搜索推荐暂不可用');return words(raw.content,'query_word');
}
export function parsePeriods(raw:any,rankId:string):RankPeriod[]{
 if(!raw?.bang_data)throw Error('榜单期数暂不可用');
 if(!raw.fq)return [];
 if(typeof raw.fq!=='object')throw Error('榜单期数返回异常');
 const periods:RankPeriod[]=[];
 for(const [year,value]of Object.entries(raw.fq.volume??{}).sort(([a],[b])=>b.localeCompare(a))){
  let rows:any=value;if(typeof rows==='string'){try{rows=JSON.parse(rows);}catch{throw Error('榜单期数数据异常');}}
  if(!Array.isArray(rows))continue;
  for(const row of rows){if(String(row.second_id)!==rankId||!/^\d{1,20}$/.test(String(row.third_id)))continue;
   periods.push({id:String(row.third_id),rankId,year:clean(year),name:clean(row.name),cover:typeof row.album_pic==='string'?row.album_pic.replace(/^http:/,'https:'):undefined});}
 }
 return periods.filter((p,i,a)=>a.findIndex(v=>v.id===p.id)===i);
}
function unescapeXml(s:string){return s.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi,entity=>{
 const names:Record<string,string>={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};
 if(entity in names)return names[entity];const code=entity[2].toLowerCase()==='x'?parseInt(entity.slice(3,-1),16):Number(entity.slice(2,-1));return code>0&&code<=0x10ffff?String.fromCodePoint(code):'';
});}
function attributes(s:string){return Object.fromEntries([...s.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m=>[m[1],unescapeXml(m[2]??m[3])]));}
export function parsePeriodContents(xml:string,page:number):SearchResult{
 if(xml.length>4_000_000||/<!DOCTYPE|<!ENTITY/i.test(xml)||!/<root\b/.test(xml))throw Error('历史榜单返回异常');
 const section=xml.match(/<section\b([^>]*)>/);if(!section)throw Error('历史榜单返回异常');
 const total=Number(attributes(section[1]).total);if(!Number.isFinite(total)||total<0)throw Error('历史榜单数量异常');
 const tracks=[...xml.matchAll(/<music\b([^>]*?)\s*\/>/g)].map(m=>{
  const r=attributes(m[1]);return normalizeTrack({...r,MINFO:r.minfo,N_MINFO:r.n_minfo,rid:r.rid??r.id,hasmv:r.mvflag,duration:r.duration});
 });
 if(!tracks.length&&total>page*30)throw Error('历史榜单暂未返回歌曲，请重试');
 return {tracks,total,page};
}
export class NativeCatalog {
 private pending=new Map<string,Promise<SearchHints>>();
 constructor(private provider:KuwoProvider){}
 async hints(query:string):Promise<SearchHints>{
  query=query.normalize('NFKC').replace(/[\u200b-\u200d\ufeff]/g,'').trim().slice(0,200);
  const pending=this.pending.get(query);if(pending)return pending;
  const request=(async()=>{
   if(query){const raw=await this.provider.json('https://tips.kuwo.cn/t.s?'+new URLSearchParams({c:'mbox',w:query,encoding:'utf8',rformat:'json',apiversion:'1',uid:'0'}),60000,undefined,false,8000);return {suggestions:parseHints(raw,'typed'),hot:[],idle:[]};}
   const values=await Promise.allSettled([
    this.provider.json('https://hotword.kuwo.cn/hotword.s?uid=0&plat=kwplayer_ar&rformat=json&encoding=utf8&neworder=1&tabid=0',300000,undefined,false,8000).then(r=>parseHints(r,'hot')),
    this.provider.json('https://searchrecterm.kuwo.cn/recterm.s?encoding=utf8&version=1&uid=0&tab=all&ver=12.2.2.5&src=kwplayer_ar_12.2.2.5',300000,undefined,false,8000).then(r=>parseHints(r,'idle'))
   ]);
   if(values.every(r=>r.status==='rejected'))throw Error('搜索推荐暂不可用');
   return {suggestions:[],hot:values[0].status==='fulfilled'?values[0].value:[],idle:values[1].status==='fulfilled'?values[1].value:[]};
  })();this.pending.set(query,request);try{return await request;}finally{this.pending.delete(query);}
 }
 async periods(id:string){if(!/^\d{1,20}$/.test(id))throw Error('无效的榜单编号');return parsePeriods(await this.provider.json(`https://mobilebasedata.kuwo.cn/basedata.s?type=get_bang_info_m&id=${id}&fq=1&mid=0&prid1=0&prid2=0&aapiver=2&f=web`,300000),id);}
 async contents(id:string,period:string,page:number){
  if(!(await this.periods(id)).some(p=>p.id===period))throw Error('该期不属于当前榜单');
  const response=await this.provider.fetcher(`https://mobi.kuwo.cn/mobi.s?f=web&type=bangdata&id=${id}&start=${page*30}&count=30&bangid=${period}`,{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('历史榜单暂不可用');return parsePeriodContents(decodeBody(new Uint8Array(await response.arrayBuffer())),page);
 }
}
