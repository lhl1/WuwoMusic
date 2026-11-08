import type {Comment,CommentPage,CommentSort,CommentSource,CommentPreference,Track} from '../src/shared';
import type {Fetcher} from './provider';
import {CommentService} from './comments';
import {serviceText} from '../src/text';

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
 return {comments:rows.slice(0,20).filter((r:any)=>r.commentId&&r.content).map((r:any):Comment=>({id:'netease:'+r.commentId,author:safe(r.user?.nickname||'云村听众',200),avatar:r.user?.avatarUrl,time:stamp(r.time),text:safe(r.content),likes:Math.max(0,Number(r.likedCount)||0)})),total,page,pageSize:20,pages:more===false?page:Math.max(page,Math.ceil(total/20)),source:'netease'};
}
export function normalizeQQ(raw:any,sort:CommentSort,page:number):CommentPage{
 if(raw?.code!==0||raw.subcode&&raw.subcode!==0)throw Error('QQ 音乐评论服务暂不可用');
 const block=raw.comment;
 if(!Array.isArray(block?.commentlist)||!Number.isFinite(Number(block.commenttotal)))throw Error('QQ 音乐评论格式异常');
 // The public hot endpoint currently repeats the same twenty rows for every pagenum.
 const total=sort==='hot'?Math.min(20,Number(block.commenttotal)):Math.max(0,Number(block.commenttotal));
 return {comments:block.commentlist.slice(0,20).filter((r:any)=>r.commentid&&r.rootcommentcontent).map((r:any):Comment=>({id:'qq:'+r.commentid,author:safe(r.nick||r.rootcommentnick||'音乐听众',200),avatar:r.avatarurl,time:stamp(r.time),text:safe(r.rootcommentcontent),likes:Math.max(0,Number(r.praisenum)||0)})),total,page,pageSize:20,pages:sort==='hot'?1:raw.morecomment===0?page:Math.max(page,Math.ceil(total/20)),source:'qq'};
}
export class MultiCommentService{
 private kuwo:CommentService;
 private cache=new Map<string,{expires:number;value:CommentPage}>();
 private pending=new Map<string,Promise<CommentPage>>();
 private choices=new Map<string,{expires:number;source:CommentSource;id:string}>();
 private emptyUntil=new Map<string,number>();
 private resolving=new Map<string,Promise<{source:CommentSource;id:string}|undefined>>();
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
 async get(t:Track,sort:CommentSort,page:number,preference:CommentPreference='auto',force=false):Promise<CommentPage>{
  if(!['hot','latest'].includes(sort)||!Number.isInteger(page)||page<1||page>10000||!['auto','netease','qq','kuwo'].includes(preference))throw Error('无效的评论查询');
  if(this.offline())throw Error('当前为离线模式，联网后可查看评论');
  const key=JSON.stringify([t.id,t.name,t.artist,t.album,t.duration,preference]);let choice=this.choices.get(key);
  if(force&&page===1){this.choices.delete(key);this.emptyUntil.delete(key);}
  if(!force&&(this.emptyUntil.get(key)??0)>this.now())return {comments:[],total:0,page,pageSize:20,pages:1};
  if(!choice||page===1&&choice.expires<=this.now()||force&&page===1){
   let resolving=this.resolving.get(key);
   if(!resolving){resolving=(async()=>{const errors:string[]=[];for(const source of sourceOrder(preference)){
    try{const id=await this.match(t,source);if(!id)continue;const initial=await this.page(source,id,'latest',1,force);if(initial.total>0||initial.comments.length){const chosen={source,id,expires:this.now()+300000};this.choices.set(key,chosen);if(this.choices.size>150)this.choices.delete(this.choices.keys().next().value!);return chosen;}}
    catch(e){errors.push((e as Error).message);}
   }if(errors.length)throw Error('评论源暂未就绪：'+errors.join('；'));this.emptyUntil.set(key,this.now()+300000);if(this.emptyUntil.size>150)this.emptyUntil.delete(this.emptyUntil.keys().next().value!);return undefined;})();this.resolving.set(key,resolving);}
   try{const selected=await resolving;choice=selected?{...selected,expires:this.now()+300000}:undefined;}finally{this.resolving.delete(key);}
  }
  if(!choice)return {comments:[],total:0,page,pageSize:20,pages:1};
  // Keep one provider throughout pagination and sorting. No mixing unrelated platform rows.
  return this.page(choice.source,choice.id,sort,page,force);
 }
}
