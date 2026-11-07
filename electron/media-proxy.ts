import type {Fetcher} from './provider';
import {abortable,bounded,PlaybackTimeout} from '../src/playback-control';
export interface RemoteMedia {url:string;signal?:AbortSignal;refresh?:()=>Promise<string>}
export interface MediaLimits {headers:number;idle:number;attempts:number}
const defaults:MediaLimits={headers:8000,idle:12000,attempts:2};
export async function mediaResponse(source:RemoteMedia,request:Request,fetcher:Fetcher,limits:MediaLimits=defaults):Promise<Response>{
 const signal=source.signal?AbortSignal.any([request.signal,source.signal]):request.signal;
 for(let attempt=0;attempt<limits.attempts;attempt++){
  signal.throwIfAborted();const connection=new AbortController(),combined=AbortSignal.any([signal,connection.signal]);let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  const cancel=(error?:unknown)=>{connection.abort(error);void reader?.cancel(error).catch(()=>{});};
  try{
   const headers:Record<string,string>={'User-Agent':'Mozilla/5.0 KuwoDesktop/1.2','Accept-Encoding':'identity'};const range=request.headers.get('range');if(range)headers.Range=range;
   const upstream=await bounded(s=>fetcher(source.url,{method:request.method,headers,cache:'no-store',signal:s}),limits.headers,'音频服务器连接超时',combined);
   if(upstream.status===416){void upstream.body?.cancel().catch(()=>{});return new Response(null,{status:416,headers:{'Content-Range':upstream.headers.get('content-range')??'bytes */*'}});}
   if(!upstream.ok)throw Error(`音频服务器 HTTP ${upstream.status}`);
   const type=upstream.headers.get('content-type')??'application/octet-stream';
   if(/text\/|json|xml/i.test(type))throw Error('音频服务器返回了错误页面');
   const out=new Headers();for(const key of ['content-type','content-length','content-range','accept-ranges']){const value=upstream.headers.get(key);if(value)out.set(key,value);}if(!out.has('content-type'))out.set('content-type',type);
   if(request.method==='HEAD'){void upstream.body?.cancel().catch(()=>{});return new Response(null,{status:upstream.status,headers:out});}
   if(!upstream.body)throw Error('音频服务器未返回文件');reader=upstream.body.getReader();
   const first=await bounded(s=>abortable(reader!.read(),s),limits.idle,'音频服务器没有返回数据',combined);
   if(first.done||!first.value?.length)throw Error('音频文件为空');
   if(/^\s*(?:<!doctype|<html|\{\s*")/i.test(new TextDecoder().decode(first.value.subarray(0,80))))throw Error('音频服务器返回了错误内容');
   let initial:Uint8Array|undefined=first.value,closed=false;const release=()=>{closed=true;signal.removeEventListener('abort',onAbort);};
   let streamController:ReadableStreamDefaultController<Uint8Array>;const onAbort=()=>{cancel(signal.reason);if(!closed){release();streamController?.error(signal.reason);}};
   const body=new ReadableStream<Uint8Array>({start(controller){streamController=controller;signal.addEventListener('abort',onAbort,{once:true});if(signal.aborted)onAbort();},async pull(controller){if(closed)return;try{if(initial){controller.enqueue(initial);initial=undefined;return;}const chunk=await bounded(s=>abortable(reader!.read(),s),limits.idle,'音频读取中断',combined);if(closed)return;if(chunk.done){release();controller.close();}else controller.enqueue(chunk.value);}catch(e){if(!closed){release();cancel(e);controller.error(e);}}},cancel(reason){release();cancel(reason);}});
   return new Response(body,{status:upstream.status,headers:out});
  }catch(error){cancel(error);if(signal.aborted)throw signal.reason;if(attempt+1>=limits.attempts)throw error;
   if(source.refresh)source.url=await bounded(()=>source.refresh!(),limits.headers,'刷新音源超时',signal);
  }
 }
 throw new PlaybackTimeout();
}
