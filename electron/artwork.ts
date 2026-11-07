import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import type {Fetcher} from './provider';

export function artworkSource(raw:string,avatar=false):string {
  const url=new URL(raw);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||(!/(^|\.)(kuwo|kwcdn)\.cn$/i.test(url.hostname)&&!(avatar&&['q.qlogo.cn','thirdwx.qlogo.cn','thirdqq.qlogo.cn'].includes(url.hostname))))throw Error('不支持的图片来源');
  url.protocol='https:';return url.href;
}
export function imageType(bytes:Uint8Array):string|undefined {
  if(bytes[0]===0xff&&bytes[1]===0xd8)return 'image/jpeg';
  if(Buffer.from(bytes.subarray(0,8)).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(Buffer.from(bytes.subarray(0,6)).toString().match(/^GIF8[79]a$/))return 'image/gif';
  if(Buffer.from(bytes.subarray(0,4)).toString()==='RIFF'&&Buffer.from(bytes.subarray(8,12)).toString()==='WEBP')return 'image/webp';
}
export class ArtworkCache {
  private pending=new Map<string,Promise<Buffer>>();
  private active=0;private waiters:Array<()=>void>=[];private writes=0;
  constructor(private directory:string,private fetcher:Fetcher,private offline:()=>boolean,private avatar=false){}
  async bytes(raw:string):Promise<Buffer>{
    const url=artworkSource(raw,this.avatar),key=createHash('sha256').update(url).digest('hex');
    const filename=path.join(this.directory,key+'.image');
    const cached=await fs.readFile(filename).catch(()=>undefined);if(cached&&imageType(cached))return cached;
    if(this.offline())throw Error('图片尚未缓存');
    const pending=this.pending.get(key);if(pending)return pending;
    const task=this.download(url,filename);this.pending.set(key,task);
    try{return await task;}finally{this.pending.delete(key);}
  }
  private async download(url:string,filename:string){
    if(this.active>=6)await new Promise<void>(r=>this.waiters.push(r));else this.active++;
    try{
      if(this.offline())throw Error('离线模式');
      const res=await this.fetcher(url,{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(12000)});
      if(res.url)artworkSource(res.url,this.avatar);
      if(!res.ok||Number(res.headers.get('content-length'))>8*1024*1024)throw Error('图片暂不可用');
      if(!res.body)throw Error('空图片');
      const reader=res.body.getReader(),chunks:Buffer[]=[];let size=0;
      try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>8*1024*1024){await reader.cancel();throw Error('图片过大');}chunks.push(Buffer.from(r.value));}}finally{reader.releaseLock();}
      const bytes=Buffer.concat(chunks);if(!imageType(bytes))throw Error('图片格式不支持');
      // A temporary Windows file lock must not turn a valid image into a broken cover.
      try{await fs.mkdir(this.directory,{recursive:true});await fs.writeFile(filename+'.tmp',bytes);await fs.rename(filename+'.tmp',filename);}catch{await fs.unlink(filename+'.tmp').catch(()=>{});}
      if(++this.writes%50===0)void this.trim().catch(()=>{});
      return bytes;
    }finally{const next=this.waiters.shift();if(next)next();else this.active--;}
  }
  private async trim(){
    const files=await fs.readdir(this.directory);const items=await Promise.all(files.filter(n=>/^[a-f0-9]{64}\.image$/.test(n)).map(async name=>({name,...await fs.stat(path.join(this.directory,name))})));
    items.sort((a,b)=>b.mtimeMs-a.mtimeMs);let total=0;
    for(const item of items){total+=item.size;if(total>200*1024*1024)await fs.unlink(path.join(this.directory,item.name)).catch(()=>{});}
  }
  async response(raw:string){
    try{const bytes=await this.bytes(raw);return new Response(new Uint8Array(bytes),{headers:{'Content-Type':imageType(bytes)!,'Cache-Control':'public, max-age=86400'}});}catch{return new Response(null,{status:404});}
  }
}
