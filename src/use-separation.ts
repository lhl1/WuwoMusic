import {useEffect,useRef,useState,type RefObject} from 'react';
import type {SeparationState,Settings} from './shared';
import {VocalEffects} from './vocal-effects';
import {bounded} from './playback-control';
import {MediaEnvelope} from './media-envelope';

export interface StemSource {url:string;generation:number;signal:AbortSignal}
/** Muted until metadata, exact seeking and graph routing are ready. */
export async function replaceStemSource(audio:HTMLAudioElement,url:string,position:number,signal:AbortSignal){
 await bounded(async active=>new Promise<void>((resolve,reject)=>{
  const done=(error?:Error)=>{audio.removeEventListener('canplay',ready);audio.removeEventListener('loadedmetadata',metadata);audio.removeEventListener('error',failed);active.removeEventListener('abort',aborted);error?reject(error):resolve();};
  const metadata=()=>{if(audio.src===url&&position>0)audio.currentTime=Math.min(position,Number.isFinite(audio.duration)?Math.max(0,audio.duration-.01):position);};
  const ready=()=>{if(audio.readyState>=3&&!audio.seeking)done();};
  const failed=()=>done(Error('声伴音轨无法加载，已保留原声'));
  const aborted=()=>done(Error('声伴切换已取消'));
  active.addEventListener('abort',aborted,{once:true});audio.addEventListener('loadedmetadata',metadata);audio.addEventListener('canplay',ready);audio.addEventListener('error',failed);audio.src=url;audio.load();
 }),12000,'声伴音轨加载超时',signal);
}

export function useSeparation(audio:RefObject<HTMLAudioElement|null>,source:StemSource|null,settings:Settings|undefined,effects:VocalEffects,callbacks:{busy:(v:boolean)=>void;resume:()=>boolean;volume:()=>number;resetWatchdog:()=>void}){
 const [state,setState]=useState<SeparationState>({phase:'idle'}),[ready,setReady]=useState(false),[retry,setRetry]=useState(0);
 const latest=useRef({settings,callbacks});latest.current={settings,callbacks};
 const prepared=useRef<{source:string;url:string}|null>(null),swapping=useRef<Promise<void>>(Promise.resolve());
 const balance=settings?.vocalBalance??(settings?.vocalMode==='accompaniment'?1:settings?.vocalMode==='vocal'?-1:0);
 const wanted=settings?.audioOutput!=='hifi'&&Math.abs(balance)>.0001;
 const enabled=useRef(false);enabled.current=ready;
 const apply=async(stems=enabled.current)=>{const a=audio.current,s=latest.current.settings;if(a)await effects.apply(a,s?.vocalMode??'original',s?.audioOutput==='hifi'?0:s?.vocalBalance,s?.audioOutput==='hifi'?1:s?.playbackRate??1,s?.audioOutput==='hifi'?0:s?.pitchSemitones??0,stems);};
 useEffect(()=>{void apply().catch(e=>setState({phase:'error',error:'音效无法启用：'+e.message}));},[settings?.vocalMode,settings?.vocalBalance,settings?.playbackRate,settings?.pitchSemitones,settings?.audioOutput,ready]);
 useEffect(()=>{
  const control=new AbortController(),id=crypto.randomUUID();let live=true;
  setReady(false);enabled.current=false;setState({phase:'idle'});
  if(!source)return()=>{live=false;control.abort();};
  const signal=AbortSignal.any([control.signal,source.signal]);
  const current=()=>live&&!signal.aborted;
  const unsubscribe=window.desktop.onSeparation(p=>{if(current()&&p.id===id&&p.phase!=='ready')setState({phase:p.phase});});
  const swap=async(url:string,stems:boolean)=>{
   const previous=swapping.current;
   const work=(async()=>{await previous.catch(()=>{});if(!current()||!audio.current)return;const a=audio.current;
    if(a.src===url){try{enabled.current=stems;setReady(stems);await apply(stems);if(!current())return;if(!latest.current.callbacks.resume())a.pause();else if(a.paused)await a.play();}finally{if(current()){latest.current.callbacks.busy(false);latest.current.callbacks.resetWatchdog();}}return;}
    const playing=latest.current.callbacks.resume(),envelope=new MediaEnvelope();latest.current.callbacks.busy(true);
    const cancelFade=()=>envelope.cancel(a,latest.current.callbacks.volume());signal.addEventListener('abort',cancelFade,{once:true});
    try{
     if(playing)await envelope.pause(a,()=>latest.current.callbacks.volume());if(!current())return;
     a.volume=0;a.pause();const position=a.currentTime;await apply(stems);await replaceStemSource(a,url,position,signal);if(!current())return;enabled.current=stems;setReady(stems);
     if(playing&&latest.current.callbacks.resume()){await a.play();if(!current())return;if(latest.current.callbacks.resume())await envelope.enter(a,()=>latest.current.callbacks.volume());else a.pause();}else a.volume=latest.current.callbacks.volume();
    }finally{signal.removeEventListener('abort',cancelFade);if(current()){latest.current.callbacks.busy(false);latest.current.callbacks.resetWatchdog();a.volume=latest.current.callbacks.volume();}}
   })();swapping.current=work;await work;
  };
  void (async()=>{
   try{
    if(!wanted){if(prepared.current?.source===source.url)await swap(source.url,false);if(current())setState({phase:'idle'});return;}
    setState({phase:'fetching'});
    const cached=prepared.current?.source===source.url?prepared.current:null;
    const result=cached??await window.desktop.prepareSeparation(source.url,id);
    if(!current())return;prepared.current={source:source.url,url:result.url};await swap(result.url,true);if(current())setState({phase:'ready'});
   }catch(e){if(!current())return;enabled.current=false;setReady(false);try{await swap(source.url,false);}catch{}if(current())setState({phase:'error',error:(e as Error).message});}
  })();
  return()=>{live=false;control.abort();unsubscribe();void window.desktop.cancelSeparation(id).catch(()=>{});};
 },[source?.generation,source?.url,wanted,retry]);
 useEffect(()=>()=>effects.dispose(),[]);
 return {state,retry:()=>setRetry(n=>n+1)};
}
