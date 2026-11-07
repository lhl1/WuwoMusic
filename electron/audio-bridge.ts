import {createServer,type Server} from 'node:http';
import {Readable} from 'node:stream';
import {randomUUID} from 'node:crypto';
import type {Fetcher} from './provider';
import {mediaResponse,type RemoteMedia} from './media-proxy';
export class AudioBridge {
 private server?:Server;private starting?:Promise<void>;private port=0;private tokens=new Map<string,RemoteMedia>();
 constructor(private fetcher:Fetcher,private offline:()=>boolean){}
 async source(url:string|RemoteMedia):Promise<string>{
  if(!this.server&&!this.starting){this.starting=(async()=>{const server=createServer(async(req,res)=>{
   const token=(req.url??'').slice(1),source=this.tokens.get(token);
   if(!source||!['GET','HEAD'].includes(req.method??'')){res.writeHead(404).end();return;}
   if(this.offline()){res.writeHead(503).end();return;}
   const abort=new AbortController();res.once('close',()=>abort.abort());
   try{const upstream=await mediaResponse(source,new Request('http://127.0.0.1/',{method:req.method,headers:req.headers.range?{Range:req.headers.range}:{},signal:abort.signal}),this.fetcher);
    const headers:Record<string,string>={};for(const key of ['content-type','content-length','content-range','accept-ranges']){const v=upstream.headers.get(key);if(v)headers[key]=v;}
    res.writeHead(upstream.status,headers);if(req.method==='HEAD'||!upstream.body){res.end();return;}
    const stream=Readable.fromWeb(upstream.body as any);stream.on('error',()=>res.destroy());stream.pipe(res);
   }catch{if(!res.headersSent)res.writeHead(502);res.end();}
  });await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve());});this.server=server;this.port=(server.address() as any).port;})();void this.starting.finally(()=>{this.starting=undefined;}).catch(()=>{});}
  if(this.starting)await this.starting;
  const token=randomUUID();this.tokens.set(token,typeof url==='string'?{url}:url);if(this.tokens.size>32)this.tokens.delete(this.tokens.keys().next().value!);return `http://127.0.0.1:${this.port}/${token}`;
 }
 close(){this.tokens.clear();this.server?.closeAllConnections();this.server?.close();this.server=undefined;}
}
