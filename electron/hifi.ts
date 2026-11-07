import {spawn,type ChildProcess} from 'node:child_process';
import {connect,type Socket} from 'node:net';
import {randomUUID} from 'node:crypto';
import type {AudioDevice,AudioInfo,HifiState} from '../src/shared';
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
export function hifiArguments(pipe:string,device='auto'):string[]{
 if(device!=='auto'&&!/^wasapi\/[\w{}.-]+$/.test(device))throw Error('无效的音频设备');
 return ['--no-config','--no-video','--no-terminal','--idle=yes','--keep-open=no','--ao=wasapi','--audio-exclusive=yes','--audio-fallback-to-null=no','--audio-normalize-downmix=no','--replaygain=no','--speed=1','--volume=100','--volume-max=100','--af=','--gapless-audio=no','--input-default-bindings=no','--load-scripts=no',`--audio-device=${device}`,`--input-ipc-server=${pipe}`];
}
export function mpvInfo(p:any):AudioInfo|undefined{return p?{sampleRate:p.samplerate,channels:p['channel-count'],bitsPerSample:Number(String(p.format??'').match(/\d+/)?.[0])||undefined,format:p.format}:undefined;}
export class HifiPlayer {
 private playbackJob:Promise<unknown>=Promise.resolve();
 private child?:ChildProcess;private socket?:Socket;private serial=0;private pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();private buffer='';private timer?:ReturnType<typeof setInterval>;private loading?:{resolve:()=>void;reject:(e:Error)=>void};private sourceRemote=false;private loadSerial=0;
 state:HifiState={active:false,playing:false,position:0,duration:0,generation:0};
 constructor(private executable:string,private changed:(state:HifiState)=>void){}
 private emit(){this.changed(structuredClone(this.state));}
 private async command(command:unknown[]):Promise<any>{
  if(!this.socket||this.socket.destroyed)throw Error('HiFi 引擎尚未连接');const request_id=++this.serial;
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(request_id);reject(Error('HiFi 引擎响应超时'));},5000);this.pending.set(request_id,{resolve,reject,timer});this.socket!.write(JSON.stringify({command,request_id})+'\n');});
 }
 private receive(chunk:Buffer){this.buffer+=chunk.toString('utf8');let i:number;while((i=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,i);this.buffer=this.buffer.slice(i+1);let d:any;try{d=JSON.parse(line);}catch{continue;}
   const p=this.pending.get(d.request_id);if(p){clearTimeout(p.timer);this.pending.delete(d.request_id);d.error==='success'?p.resolve(d.data):p.reject(Error(`HiFi: ${d.error}`));}
   if(d.event==='file-loaded')this.loading?.resolve();
   if(d.event==='end-file'){
    if(d.reason==='error'){clearInterval(this.timer);const error=Error('HiFi 独占输出失败：设备忙碌、格式不支持或音频连接失效，请更换设备或切回标准模式');this.loading?.reject(error);this.state={...this.state,active:false,playing:false,error:error.message};this.emit();}
    else if(d.reason==='eof'){clearInterval(this.timer);this.state={...this.state,playing:false,ended:true};this.emit();}
   }
  }}
 private async start(device:string){
  await this.dispose();const pipe=`\\\\.\\pipe\\wuwo-hifi-${randomUUID()}`;
  const child=spawn(this.executable,hifiArguments(pipe,device),{windowsHide:true,stdio:['ignore','ignore','pipe']});this.child=child;
  let failure:Error|undefined;child.once('error',e=>{failure=e;});child.stderr?.resume();
  child.once('exit',()=>{if(this.child!==child)return;this.socket?.destroy();this.socket=undefined;if(this.state.active||this.loading){const error=Error('HiFi 音频引擎已退出');this.loading?.reject(error);this.state={...this.state,active:false,playing:false,error:error.message};this.emit();}});
  for(let n=0;n<60;n++){if(this.child!==child)throw Error('播放已取消');if(failure)throw Error('HiFi 引擎无法启动：'+failure.message);if(child.exitCode!==null)throw Error('HiFi 引擎无法启动');
   const socket=await new Promise<Socket|undefined>(resolve=>{const s=connect(pipe);s.once('connect',()=>resolve(s));s.once('error',()=>{s.destroy();resolve(undefined);});});
   if(socket){this.socket=socket;socket.on('data',c=>this.receive(c));socket.on('error',()=>{});return;}await delay(50);
  }throw Error('HiFi 引擎连接超时');
 }
 async devices():Promise<AudioDevice[]>{
  // Enumeration does not play or acquire exclusive output.
  if(this.socket){return (await this.command(['get_property','audio-device-list'])).filter((d:any)=>d.name==='auto'||String(d.name).startsWith('wasapi/')).map((d:any)=>({id:d.name,name:d.description}));}
  const probe=new HifiPlayer(this.executable,()=>{});try{await probe.start('auto');return await probe.devices();}finally{await probe.dispose();}
 }
 play(source:string,device='auto',sourceBits?:number):Promise<number>{
  const ticket=++this.loadSerial;this.loading?.reject(Error('播放已取消'));
  const job=this.playbackJob.catch(()=>{}).then(()=>{if(ticket!==this.loadSerial)throw Error('播放已取消');return this.playNow(source,device,ticket,sourceBits);});this.playbackJob=job;return job;
 }
 private async playNow(source:string,device:string,ticket:number,sourceBits?:number):Promise<number>{
  await this.start(device);if(ticket!==this.loadSerial){await this.dispose();throw Error('播放已取消');}
  this.sourceRemote=/^https?:/i.test(source);this.state={active:false,playing:false,position:0,duration:0,generation:this.state.generation+1};
  let timeout:ReturnType<typeof setTimeout>|undefined;
  try{
   const loaded=new Promise<void>((resolve,reject)=>{timeout=setTimeout(()=>reject(Error('HiFi 音频加载超时')),25000);this.loading={resolve,reject};});void loaded.catch(()=>{});
   await this.command(['loadfile',source,'replace']);await loaded;
   let output:any;
   for(let n=0;n<40;n++){if(ticket!==this.loadSerial)throw Error('播放已取消');if(this.state.error)throw Error(this.state.error);output=await this.command(['get_property','audio-out-params']).catch(()=>null);if(output)break;await delay(100);}
   const ao=await this.command(['get_property','current-ao']);if(ao!=='wasapi'||!output)throw Error('设备未能建立 WASAPI 独占输出');
   const input=await this.command(['get_property','audio-params']);if(input?.samplerate!==output.samplerate||input?.['channel-count']!==output['channel-count'])throw Error('HiFi 设备不支持该音源的原始采样率或声道，请选择其他设备或标准模式');
   if(sourceBits&&(mpvInfo(output)?.bitsPerSample??0)<sourceBits)throw Error('HiFi 设备的输出位深低于音源，请选择其他设备或标准模式');
   this.state={...this.state,active:true,playing:true,output:mpvInfo(output),device:await this.command(['get_property','audio-device'])};
   this.timer=setInterval(()=>void this.poll(),400);await this.poll();return this.state.generation;
  }catch(e){if(ticket===this.loadSerial)await this.dispose();throw e;}finally{clearTimeout(timeout);this.loading=undefined;}
 }
 private polling=false;
 private async poll(){if(this.polling||!this.socket)return;this.polling=true;const generation=this.state.generation;try{
  const [position,duration,paused,info,output,bitrate]=await Promise.all(['time-pos','duration','pause','audio-params','audio-out-params','audio-bitrate'].map(p=>this.command(['get_property',p]).catch(()=>undefined)));
  if(generation!==this.state.generation||!this.socket)return;
  this.state={...this.state,position:position??this.state.position,duration:duration??this.state.duration,playing:!paused&&this.state.active&&!this.state.ended,info:{...mpvInfo(info),bitrate:bitrate?Math.round(bitrate/1000):undefined},output:mpvInfo(output)??this.state.output};this.emit();
 }finally{this.polling=false;}}
 async control(action:'pause'|'resume'|'seek'|'stop',position?:number){
  if(action==='stop'){this.loadSerial++;await this.dispose();return;}
  if(action==='seek'){if(!Number.isFinite(position)||position!<0||position!>86400)throw Error('无效的播放位置');await this.command(['seek',position,'absolute+exact']);}
  else await this.command(['set_property','pause',action==='pause']);await this.poll();
 }
 async stopRemote(){if(this.sourceRemote)await this.control('stop');}
 async dispose(){
  this.loading?.reject(Error('播放已停止'));this.loading=undefined;
  clearInterval(this.timer);this.timer=undefined;const child=this.child;this.child=undefined;this.socket?.destroy();this.socket=undefined;this.buffer='';
  for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('HiFi 播放已停止'));}this.pending.clear();
  if(child&&child.exitCode===null){child.kill();await new Promise<void>(r=>{child.once('exit',()=>r());setTimeout(r,1000);});}
  this.state={...this.state,active:false,playing:false,ended:false,error:undefined};this.emit();
 }
}
