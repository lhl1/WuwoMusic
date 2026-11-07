import type {Comment,CommentPage,CommentSort} from '../src/shared';
import type {Fetcher} from './provider';

export function commentUrl(id:string,sort:CommentSort,page:number){
  if(!/^\d{1,20}$/.test(id)||!['hot','latest'].includes(sort)||!Number.isInteger(page)||page<1||page>10000)throw Error('无效的评论查询');
  const query=new URLSearchParams({type:sort==='hot'?'get_rec_comment':'get_comment',f:'web',page:String(page),rows:'20',digest:'15',sid:id,uid:'0',prod:'MUSIC_9.1.1.2_BCS2'});
  return 'https://comment.kuwo.cn/com.s?'+query;
}
export function normalizeComments(raw:unknown,page:number):CommentPage {
  const r=raw as Record<string,unknown>;
  if(!r||typeof r!=='object'||(r.code!==undefined&&String(r.code)!=='200'&&String(r.code)!=='0')||r.result!=='ok')throw Error('评论服务返回异常，请稍后重试');
  const empty=r.data as {info?:unknown;total?:unknown}|undefined;
  // Verified alternate envelope for songs without comments; business errors are rejected above.
  if(r.rows===undefined&&Array.isArray(empty?.info)&&empty.info.length===0&&String(empty.total)==='0')return {comments:[],total:0,page,pageSize:20,pages:1};
  if(!Array.isArray(r.rows))throw Error('评论服务返回异常，请稍后重试');
  const count=Number(r.total),pages=Number(r.totalPage);
  if(!Number.isFinite(count)||count<0)throw Error('评论数量无效');
  const comments:Comment[]=r.rows.slice(0,20).map((x:any)=>({id:String(x.id??''),author:String(x.u_name??'音乐听众').slice(0,200),avatar:typeof x.u_pic==='string'&&/^https?:\/\//.test(x.u_pic)?x.u_pic:undefined,time:String(x.time??'').slice(0,50),text:String(x.msg??'').slice(0,30000),likes:Math.max(0,Number(x.like_num)||0)}));
  return {comments,total:count,page,pageSize:20,pages:Number.isFinite(pages)?Math.max(1,pages):Math.max(1,Math.ceil(count/20))};
}
export class CommentService {
  private cache=new Map<string,{expires:number;value:CommentPage}>();
  private pending=new Map<string,Promise<CommentPage>>();
  constructor(private fetcher:Fetcher,private offline:()=>boolean,private now=Date.now){}
  async get(id:string,sort:CommentSort,page:number,force=false):Promise<CommentPage>{
    const url=commentUrl(id,sort,page);
    if(this.offline())throw Error('当前为离线模式，联网后可查看评论');
    const cached=this.cache.get(url);if(!force&&cached&&cached.expires>this.now())return cached.value;
    const pending=this.pending.get(url);if(pending)return pending;
    const request=(async()=>{
      const response=await this.fetcher(url,{headers:{'User-Agent':'Mozilla/5.0',Referer:'https://www.kuwo.cn/'},signal:AbortSignal.timeout(15000),cache:'no-store'});
      if(!response.ok)throw Error('评论暂时无法加载，请重试');
      const value=normalizeComments(await response.json(),page);
      this.cache.set(url,{value,expires:this.now()+300000});
      if(this.cache.size>150)this.cache.delete(this.cache.keys().next().value!);
      return value;
    })();
    this.pending.set(url,request);
    try{return await request;}finally{this.pending.delete(url);}
  }
}
