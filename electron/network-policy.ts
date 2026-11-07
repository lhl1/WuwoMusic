import type {ProxyMode} from '../src/shared';
import {abortable} from '../src/playback-control';

export function proxyMode(value:unknown):ProxyMode {
  if(value===undefined)return 'direct';
  if(value==='direct'||value==='system')return value;
  throw Error('无效的网络代理模式');
}
export interface ProxySession {
  setProxy(config:{mode:ProxyMode}):Promise<void>;
  closeAllConnections():Promise<void>;
  fetch(url:string,init?:RequestInit):Promise<Response>;
}
/** One session controls every external request. Queue changes and retire old pooled sockets. */
export class NetworkPolicy {
  private pending:Promise<void>=Promise.resolve();
  private active?:ProxyMode;
  private failure?:Error;
  constructor(private session:ProxySession){}
  apply(value:unknown):Promise<void>{
    const mode=proxyMode(value);
    const job=this.pending.then(async()=>{
      if(this.active===mode&&!this.failure)return;
      const previous=this.active??'direct';
      try{
        await this.session.setProxy({mode});
        await this.session.closeAllConnections();
        this.active=mode;this.failure=undefined;
      }catch{
        try{await this.session.setProxy({mode:previous});await this.session.closeAllConnections();this.active=previous;this.failure=undefined;}
        catch{this.failure=Error('网络代理设置失败，请重新选择网络模式');}
        throw Error('网络代理切换失败，设置未保存，请重试');
      }
    });
    this.pending=job.catch(()=>{});
    return job;
  }
  async fetch(url:string,init?:RequestInit):Promise<Response>{
    if(init?.signal){await abortable(this.pending,init.signal);init.signal.throwIfAborted();}
    else await this.pending;
    if(this.failure)throw this.failure;
    return this.session.fetch(url,init);
  }
}
