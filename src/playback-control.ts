export class PlaybackTimeout extends Error {constructor(message='音频连接超时'){super(message);this.name='PlaybackTimeout';}}
export function abortReason(signal:AbortSignal):Error{return signal.reason instanceof Error?signal.reason:new DOMException('播放已取消','AbortError');}
/** Race even adapters which ignore AbortSignal; always consume late completions. */
export function abortable<T>(work:Promise<T>,signal:AbortSignal):Promise<T>{
 if(signal.aborted){void work.catch(()=>{});return Promise.reject(abortReason(signal));}
 return new Promise((resolve,reject)=>{const abort=()=>{clean();reject(abortReason(signal));},clean=()=>signal.removeEventListener('abort',abort);signal.addEventListener('abort',abort,{once:true});work.then(v=>{clean();resolve(v);},e=>{clean();reject(e);});});
}
export async function bounded<T>(work:(signal:AbortSignal)=>Promise<T>,milliseconds:number,message:string,parent?:AbortSignal):Promise<T>{
 const timeout=new AbortController(),signal=parent?AbortSignal.any([parent,timeout.signal]):timeout.signal;
 const timer=setTimeout(()=>timeout.abort(new PlaybackTimeout(message)),milliseconds);
 try{signal.throwIfAborted();return await abortable(work(signal),signal);}finally{clearTimeout(timer);}
}
export interface BrowserAudio {src:string;currentTime:number;paused:boolean;ended:boolean;load:()=>void;play:()=>Promise<void>;pause:()=>void;removeAttribute:(name:string)=>void;addEventListener:(name:string,callback:()=>void,options?:{once?:boolean})=>void;removeEventListener:(name:string,callback:()=>void)=>void;}
export async function startBrowserAudio(audio:BrowserAudio,url:string,signal:AbortSignal,position=0,timeout=12000):Promise<void>{
 signal.throwIfAborted();const seek=()=>{if(audio.src===url&&position>0)try{audio.currentTime=position;}catch{}};
 const reset=()=>{if(audio.src===url){audio.pause();audio.removeAttribute('src');audio.load();}};
 signal.addEventListener('abort',reset,{once:true});audio.addEventListener('loadedmetadata',seek,{once:true});
 try{audio.src=url;audio.load();await bounded(()=>audio.play(),timeout,'音频启动超时，正在刷新音源',signal);signal.throwIfAborted();}
 catch(e){reset();throw e;}finally{signal.removeEventListener('abort',reset);audio.removeEventListener('loadedmetadata',seek);}
}
/** Measure actual playback progress, rather than relying on unreliable stalled events. */
export class ProgressWatchdog {
 private time=0;private changedAt=0;
 constructor(private limit=12000){}
 reset(position:number,now:number){this.time=position;this.changedAt=now;}
 stalled(position:number,now:number,running:boolean):boolean{
  if(!running||Math.abs(position-this.time)>.05||!this.changedAt){this.reset(position,now);return false;}
  return now-this.changedAt>=this.limit;
 }
}
