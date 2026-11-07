import {test} from 'node:test';
import assert from 'node:assert/strict';
import {abortable,bounded,startBrowserAudio,ProgressWatchdog,type BrowserAudio} from '../src/playback-control';
import {mediaResponse} from '../electron/media-proxy';
import {KuwoProvider,normalizeTrack} from '../electron/provider';
import {AudioBridge} from '../electron/audio-bridge';
const limits={headers:30,idle:30,attempts:2};
const pending=<T>():Promise<T>=>new Promise(()=>{});
const request=()=>new Request('https://test.invalid/',{headers:{Range:'bytes=0-3'}});
test('hard deadlines settle promises even if the network adapter ignores AbortSignal',async()=>{
 await assert.rejects(bounded(()=>pending(),20,'deadline'),/deadline/);
 const parent=new AbortController();const job=bounded(()=>pending(),1000,'too late',parent.signal);parent.abort(new Error('switched'));await assert.rejects(job,/switched/);
});
test('source refresh recovers expired URLs, preserving Range and actual response headers',async()=>{
 let refreshed=0;const seen:any[]=[];const source={url:'https://other-er.kuwo.cn/expired.flac',refresh:async()=>{refreshed++;return 'https://other-er.kuwo.cn/fresh.flac';}};
 const response=await mediaResponse(source,request(),async(url,init)=>{seen.push({url,range:(init?.headers as any).Range});return url.includes('expired')?new Response('expired',{status:403}):new Response('fLaC',{status:206,headers:{'content-type':'audio/flac','content-range':'bytes 0-3/20'}});},limits);
 assert.equal(response.status,206);assert.equal(await response.text(),'fLaC');assert.equal(refreshed,1);assert.deepEqual(seen.map(x=>x.range),['bytes=0-3','bytes=0-3']);assert.equal(response.headers.get('accept-ranges'),null);
});
test('header and first-byte hangs exhaust finite retries rather than spinning forever',async()=>{
 let calls=0;await assert.rejects(mediaResponse({url:'https://other-er.kuwo.cn/a'},request(),async()=>{calls++;return pending<Response>();},limits),/连接超时/);assert.equal(calls,2);
 calls=0;await assert.rejects(mediaResponse({url:'https://other-er.kuwo.cn/a'},request(),async()=>{calls++;return new Response(new ReadableStream({pull(){return pending<void>();}}),{headers:{'content-type':'audio/flac'}});},limits),/没有返回数据/);assert.equal(calls,2);
});
test('mid-stream disconnect errors the stream and cancels upstream',async()=>{
 let cancelled=false,read=0;const response=await mediaResponse({url:'https://other-er.kuwo.cn/a'},request(),async()=>new Response(new ReadableStream({pull(c){if(read++===0)c.enqueue(new TextEncoder().encode('fLaC'));else return pending<void>();},cancel(){cancelled=true;}},{highWaterMark:0}),{headers:{'content-type':'audio/flac'}}),{...limits,attempts:1});
 await assert.rejects(response.arrayBuffer(),/读取中断/);assert.equal(cancelled,true);
});
test('switching tracks cancels active body and ignores a late resolver',async()=>{
 const control=new AbortController();let reads=0;const response=await mediaResponse({url:'https://other-er.kuwo.cn/a',signal:control.signal},request(),async()=>new Response(new ReadableStream({pull(c){if(reads++===0)c.enqueue(new Uint8Array([1]));else return pending<void>();}})),limits);
 const reading=response.arrayBuffer();control.abort(new Error('new track'));await assert.rejects(reading,/new track/);
 let finish!:(s:string)=>void;const late=new Promise<string>(r=>finish=r),old=new AbortController(),job=abortable(late,old.signal);old.abort(new Error('cancel old'));await assert.rejects(job,/cancel old/);finish('late');
});
test('HTML, JSON and empty files never masquerade as playable audio',async()=>{
 for(const r of [()=>new Response('<html>login</html>',{headers:{'content-type':'audio/flac'}}),()=>new Response('{}',{headers:{'content-type':'application/json'}}),()=>new Response('')])await assert.rejects(mediaResponse({url:'https://other-er.kuwo.cn/a'},request(),async()=>r(),{...limits,attempts:1}),/错误|为空/);
});
class FakeAudio implements BrowserAudio {
 src='';currentTime=0;paused=true;ended=false;cleared=0;listeners=new Map<string,()=>void>();
 constructor(public play:()=>Promise<void>){}load(){}pause(){this.paused=true;}removeAttribute(){this.src='';this.cleared++;}addEventListener(n:string,c:()=>void){this.listeners.set(n,c);}removeEventListener(n:string){this.listeners.delete(n);}
}
test('browser startup timeout clears its source; cancellation cannot clear a newer track',async()=>{
 const audio=new FakeAudio(()=>pending());await assert.rejects(startBrowserAudio(audio,'kuwo://media/old',new AbortController().signal,0,20),/启动超时/);assert.equal(audio.src,'');assert.equal(audio.listeners.size,0);
 const controller=new AbortController(),job=startBrowserAudio(audio,'kuwo://media/old',controller.signal,0,1000);audio.src='kuwo://media/new';controller.abort(new Error('switched'));await assert.rejects(job,/switched/);assert.equal(audio.src,'kuwo://media/new');
});
test('successful fresh playback restores position and progress watchdog respects pause and progress',async()=>{
 const audio=new FakeAudio(async()=>{audio.listeners.get('loadedmetadata')?.();audio.paused=false;});await startBrowserAudio(audio,'kuwo://media/new',new AbortController().signal,42);assert.equal(audio.currentTime,42);
 const guard=new ProgressWatchdog(100);guard.reset(0,1000);assert.equal(guard.stalled(0,1101,false),false);assert.equal(guard.stalled(0,1150,true),false);assert.equal(guard.stalled(0,1202,true),true);assert.equal(guard.stalled(1,1300,true),false);
});
test('resolver cancellation is propagated and cover lookup never delays audio',async()=>{
 const provider=new KuwoProvider(async url=>url.includes('get_music_for_share')?pending<Response>():new Response(JSON.stringify({code:200,data:{rid:123,url:'https://other-er.kuwo.cn/a.flac',format:'flac',bitrate:2000}})));
 const track=normalizeTrack({rid:123,name:'test',duration:200});const audio=await bounded(()=>provider.resolve(track,'flac','play'),100,'cover blocked');assert.equal(audio.format,'flac');
 const cancelled=new AbortController();cancelled.abort(new Error('cancel'));await assert.rejects(provider.resolveBest(track,'flac','play',cancelled.signal),/cancel/);
});
test('concurrent native bridge sources share one server and both remain valid',async()=>{
 const bridge=new AudioBridge(async()=>new Response('fLaC',{headers:{'content-type':'audio/flac'}}),()=>false);
 try{const [a,b]=await Promise.all([bridge.source('https://other-er.kuwo.cn/a'),bridge.source('https://other-er.kuwo.cn/b')]);assert.equal(new URL(a).port,new URL(b).port);assert.equal(await(await fetch(a)).text(),'fLaC');assert.equal(await(await fetch(b)).text(),'fLaC');}finally{bridge.close();}
});
