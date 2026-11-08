import type {Comment,CommentPage,CommentSort,CommentSource,CommentPreference,CommentSourceStatus,Track} from '../src/shared';
import type {Fetcher} from './provider';
import {CommentService} from './comments';
import {serviceText} from '../src/text';
import {commentContent} from '../src/comment-content';

export const commentSourceNames:Record<CommentSource,string>={netease:'网易云音乐',qq:'QQ 音乐',kuwo:'酷我音乐'};
export const sourceOrder=(preference:CommentPreference='auto'):CommentSource[]=>preference==='auto'?['netease','qq','kuwo']:[preference,...(['netease','qq','kuwo'] as const).filter(s=>s!==preference)];
interface Candidate {id:string;name:string;artists:string[];album:string;duration:number}
const norm=(s:string)=>serviceText(s).normalize('NFKC').toLocaleLowerCase().replace(/[\s·•]/g,'');
/** Versions (live/cover/remix) remain in the title. Never match by title alone. */
export function matchCommentSong(track:Track,candidates:Candidate[]):Candidate|undefined{
 const title=norm(track.name),artists=track.artist.split(/\s*[&、/;；]\s*/).map(norm).filter(Boolean);
 if(!title||!artists.length||artists.some(a=>['未知歌手','unknown'].includes(a)))return;
 const matches=candidates.filter(c=>norm(c.name)===title&&c.artists.map(norm).length===artists.length&&artists.every(a=>c.artists.map(norm).includes(a))&&(!track.duration||!c.duration||Math.abs(track.duration-c.duration)<=5));
 const album=matches.filter(c=>track.album&&norm(c.album)===norm(track.album));
 if(album.length)return album.sort((a,b)=>Math.abs(a.duration-track.duration)-Math.abs(b.duration-track.duration))[0];
 return matches.length===1?matches[0]:undefined;
}
const stamp=(n:unknown)=>{const v=Number(n);return Number.isFinite(v)&&v>0?new Date(v<1e12?v*1000:v).toLocaleString('zh-CN',{hour12:false}):'';};
const safe=(v:unknown,max=30000)=>serviceText(String(v??'')).slice(0,max);
export function normalizeNetease(raw:any,sort:CommentSort,page:number):CommentPage{
 if(raw?.code!==200)throw Error('网易云音乐评论服务暂不可用');
 const rows=sort==='hot'?raw.hotComments:raw.comments;
 if(!Array.isArray(rows)||!Number.isFinite(Number(raw.total)))throw Error('网易云音乐评论格式异常');
 const total=Math.max(0,Number(raw.total)),more=sort==='hot'?raw.hasMore:raw.more;
 return {comments:rows.slice(0,20).filter((r:any)=>r.commentId&&r.content).map((r:any):Comment=>({id:'netease:'+r.commentId,author:safe(r.user?.nickname||'云村听众',200),avatar:r.user?.avatarUrl,time:stamp(r.time),...commentContent(r.content,Array.isArray(r.pictures)?r.pictures:[]),likes:Math.max(0,Number(r.likedCount)||0)})),total,page,pageSize:20,pages:more===false?page:Math.max(page,Math.ceil(total/20)),source:'netease'};
}
export function normalizeQQ(raw:any,sort:CommentSort,page:number):CommentPage{
 if(raw?.code!==0||raw.subcode&&raw.subcode!==0)throw Error('QQ 音乐评论服务暂不可用');
 const block=raw.comment;
 if(!Array.isArray(block?.commentlist)||!Number.isFinite(Number(block.commenttotal)))throw Error('QQ 音乐评论格式异常');
 // The public hot endpoint currently repeats the same twenty rows for every pagenum.
 const total=sort==='hot'?Math.min(20,Number(block.commenttotal)):Math.max(0,Number(block.commenttotal));
 return {comments:block.commentlist.slice(0,20).filter((r:any)=>r.commentid&&r.rootcommentcontent).map((r:any):Comment=>({id:'qq:'+r.commentid,author:safe(r.nick||r.rootcommentnick||'音乐听众',200),avatar:r.avatarurl,time:stamp(r.time),...commentContent(r.rootcommentcontent,Array.isArray(r.pic)?r.pic:[]),likes:Math.max(0,Number(r.praisenum)||0)})),total,page,pageSize:20,pages:sort==='hot'?1:raw.morecomment===0?page:Math.max(page,Math.ceil(total/20)),source:'qq'};
}
export class MultiCommentService{
 private kuwo:CommentService;
 private cache=new Map<string,{expires:number;value:CommentPage}>();
 private pending=new Map<string,Promise<CommentPage>>();
 private matches=new Map<string,Promise<string|undefined>>();
 private probes=new Map<string,{expires:number;promise:Promise<CommentSourceStatus[]>}>();
 private choices=new Map<string,CommentSource>();
 constructor(private fetcher:Fetcher,private offline:()=>boolean,private now=Date.now){this.kuwo=new CommentService(fetcher,offline,now);}
 private async json(url:string,source:CommentSource){const response=await this.fetcher(url,{headers:{'User-Agent':'Mozilla/5.0',Referer:source==='netease'?'https://music.163.com/':'https://y.qq.com/'},signal:AbortSignal.timeout(10000),cache:'no-store'});if(!response.ok)throw Error(commentSourceNames[source]+'连接失败');return response.json();}
 private async match(t:Track,source:CommentSource){
  if(source==='kuwo')return /^\d+$/.test(t.onlineId??t.id)?t.onlineId??t.id:undefined;
  if(!t.name||!t.artist)return;
  const query=encodeURIComponent(t.name+' '+t.artist);let candidates:Candidate[];
  if(source==='netease'){const r=await this.json('https://music.163.com/api/search/get?s='+query+'&type=1&limit=30&offset=0',source);if(r.code!==200)throw Error('网易云音乐歌曲匹配暂不可用');candidates=(r.result?.songs??[]).map((s:any)=>({id:String(s.id),name:s.name,artists:s.artists?.map((a:any)=>a.name)??[],album:s.album?.name??'',duration:Number(s.duration)/1000}));}
  else {const r=await this.json('https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w='+query+'&format=json&p=1&n=30',source);if(r.code!==0)throw Error('QQ 音乐歌曲匹配暂不可用');candidates=(r.data?.song?.list??[]).map((s:any)=>({id:String(s.songid),name:s.songname,artists:s.singer?.map((a:any)=>a.name)??[],album:s.albumname??'',duration:Number(s.interval)}));}
  return matchCommentSong(t,candidates)?.id;
 }
 private async page(source:CommentSource,id:string,sort:CommentSort,page:number,force:boolean){
  if(source==='kuwo')return {...await this.kuwo.get(id,sort,page,force),source};
  const key=[source,id,sort,page].join(':');const cached=this.cache.get(key);if(!force&&cached&&cached.expires>this.now())return cached.value;
  let pending=this.pending.get(key);if(pending)return pending;
  pending=(async()=>{const url=source==='netease'?`https://music.163.com/api/v1/resource/${sort==='hot'?'hotcomments':'comments'}/R_SO_4_${id}?limit=20&offset=${(page-1)*20}`:`https://c.y.qq.com/base/fcgi-bin/fcg_global_comment_h5.fcg?biztype=1&topid=${id}&cmd=${sort==='hot'?6:8}&pagenum=${page-1}&pagesize=20&format=json`;
   const raw=await this.json(url,source),value=source==='netease'?normalizeNetease(raw,sort,page):normalizeQQ(raw,sort,page);this.cache.set(key,{value,expires:this.now()+300000});if(this.cache.size>200)this.cache.delete(this.cache.keys().next().value!);return value;})();this.pending.set(key,pending);try{return await pending;}finally{this.pending.delete(key);}
 }
 private matchCached(t:Track,source:CommentSource,force=false){
  const key=JSON.stringify([t.id,t.onlineId,t.name,t.artist,t.album,t.duration,source]);
  if(force)this.matches.delete(key);let value=this.matches.get(key);
  if(!value){value=this.match(t,source);this.matches.set(key,value);if(this.matches.size>300)this.matches.delete(this.matches.keys().next().value!);value.catch(()=>this.matches.delete(key));}return value;
 }
 async inspect(t:Track,force=false):Promise<CommentSourceStatus[]>{
  if(this.offline())throw Error('当前为离线模式，联网后可查看评论');
  const key=JSON.stringify([t.id,t.onlineId,t.name,t.artist,t.album,t.duration]);const existing=this.probes.get(key);if(!force&&existing&&existing.expires>this.now())return existing.promise;
  const promise=Promise.all((['netease','qq','kuwo']as const).map(async(source):Promise<CommentSourceStatus>=>{try{const id=await this.matchCached(t,source,force);if(!id)return {source,state:'unmatched'};const p=await this.page(source,id,'latest',1,force);return {source,state:p.total>0||p.comments.length?'available':'empty',total:p.total};}catch(e){return {source,state:'error',error:(e as Error).message};}}));
  this.probes.set(key,{expires:this.now()+300000,promise});if(this.probes.size>150)this.probes.delete(this.probes.keys().next().value!);return promise;
 }
 async get(t:Track,sort:CommentSort,page:number,preference:CommentPreference='auto',force=false,manual?:CommentSource):Promise<CommentPage>{
  if(!['hot','latest'].includes(sort)||!Number.isInteger(page)||page<1||page>10000||!['auto','netease','qq','kuwo'].includes(preference)||manual&&!['netease','qq','kuwo'].includes(manual))throw Error('无效的评论查询');
  if(this.offline())throw Error('当前为离线模式，联网后可查看评论');
  const statuses=(await this.inspect(t,force&&page===1)).map(s=>({...s}));
  const key=JSON.stringify([t.id,t.onlineId,t.name,t.artist,t.album,t.duration,preference,manual]);
  const previous=this.choices.get(key);let first=manual??previous;const order=sourceOrder(manual??preference);if(first)order.splice(0,order.length,first,...order.filter(s=>s!==first));
  let fallbackFrom:CommentSource|undefined;
  for(const source of order){const status=statuses.find(s=>s.source===source)!;
   // Manual selection of a genuinely empty source stays empty; failures still fall through.
   if(status.state!=='available'){if(source===manual&&status.state!=='error')return {comments:[],total:0,page:1,pageSize:20,pages:1,source,statuses};if(status.state==='error'&&!fallbackFrom)fallbackFrom=source;continue;}
   try{const id=await this.matchCached(t,source);if(!id)continue;const cursor=previous&&source!==previous?1:page;const data=await this.page(source,id,sort,cursor,force);this.choices.set(key,source);if(this.choices.size>200)this.choices.delete(this.choices.keys().next().value!);return {...data,statuses,fallbackFrom};}
   catch(e){status.state='error';status.error=(e as Error).message;fallbackFrom??=source;}
  }
  const errors=statuses.filter(s=>s.state==='error');if(errors.length)throw Error('评论源暂未就绪：'+errors.map(s=>commentSourceNames[s.source]+'：'+s.error).join('；'));
  return {comments:[],total:0,page:1,pageSize:20,pages:1,statuses};
 }
}
