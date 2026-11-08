/** Audio-engine test fixture only; does not inspect or automate the application's UI. */
import {VocalEffects} from '../src/vocal-effects';
import {createRoot} from 'react-dom/client';
import {createElement,useRef,useState} from 'react';
import type {Settings} from '../src/shared';
import {useSeparation,type StemSource} from '../src/use-separation';
import {replaceStemSource} from '../src/use-separation';
(window as any).verifyStems=async()=>{
 const context=new AudioContext(),silent=context.createGain();silent.gain.value=0;silent.connect(context.destination);Object.defineProperty(context,'destination',{value:silent});(window as any).AudioContext=class{constructor(){return context;}};
 const audio=document.createElement('audio');audio.crossOrigin='anonymous';audio.src='kuwo://media/six';audio.loop=true;document.body.append(audio);
 const effects=new VocalEffects(),analyser=context.createAnalyser();analyser.fftSize=16384;const data=new Float32Array(analyser.frequencyBinCount),samples=new Float32Array(analyser.fftSize);
 const settle=()=>new Promise(r=>setTimeout(r,700));
 const tap=()=>{for(const n of [(effects as any).merge,(effects as any).pitch])try{n?.disconnect(analyser);}catch{}(audio.preservesPitch?(effects as any).merge:(effects as any).pitch).connect(analyser);};
 const measure=()=>{analyser.getFloatFrequencyData(data);let peak=1;for(let i=2;i<data.length;i++)if(data[i]>data[peak])peak=i;analyser.getFloatTimeDomainData(samples);return {frequency:peak*context.sampleRate/analyser.fftSize,rms:Math.sqrt(samples.reduce((n,x)=>n+x*x,0)/samples.length)};};
 try{
  await effects.apply(audio,'original',0,1,0,true);tap();await audio.play();await settle();const original=measure();
  await effects.apply(audio,'vocal',-1,1,0,true);tap();await settle();const vocal=measure();
  await effects.apply(audio,'accompaniment',1,1,0,true);tap();await settle();const accompaniment=measure();
  audio.currentTime=3;await settle();const seekPosition=audio.currentTime;audio.pause();const paused=audio.currentTime;await new Promise(r=>setTimeout(r,120));const pauseDrift=audio.currentTime-paused;
  await effects.apply(audio,'vocal',-1,1.25,12,true);tap();await audio.play();await settle();const pitch=measure(),rate=audio.playbackRate;
  audio.pause();await effects.apply(audio,'original',0,1,0,false);await replaceStemSource(audio,'kuwo://media/stereo',2,new AbortController().signal);const restoredPosition=audio.currentTime;const remainedPaused=audio.paused;await audio.play();tap();await settle();const restored=measure();
  return {original,vocal,accompaniment,pitch,rate,seekPosition,pauseDrift,restoredPosition,remainedPaused,restored,passed:Math.abs(original.frequency-440)<15&&Math.abs(vocal.frequency-660)<15&&Math.abs(accompaniment.frequency-880)<15&&Math.abs(pitch.frequency-1320)<45&&rate===1.25&&seekPosition>3.3&&Math.abs(pauseDrift)<.01&&Math.abs(restoredPosition-2)<.01&&remainedPaused&&Math.abs(restored.frequency-440)<15};
 }finally{audio.pause();effects.dispose();}
};

(window as any).verifyStemRaces=async()=>{
 const pending=new Map<string,{resolve:(v:{url:string})=>void;url:string}>(),cancelled:string[]=[],events=new Set<(v:any)=>void>();
 (window as any).desktop={prepareSeparation:(url:string,id:string)=>new Promise(resolve=>pending.set(id,{resolve,url})),cancelSeparation:async(id:string)=>{cancelled.push(id);},onSeparation:(cb:(v:any)=>void)=>{events.add(cb);return()=>events.delete(cb);}};
 const media=document.createElement('audio');media.crossOrigin='anonymous';media.loop=true;media.volume=0;document.body.append(media);await replaceStemSource(media,'kuwo://media/stereo-a',1,new AbortController().signal);await media.play();
 let intent=true,state:any,control:any,busy=false;const div=document.createElement('div');document.body.append(div);const root=createRoot(div);
 function Harness(){const ref=useRef(media),effect=useRef(new VocalEffects()),[source,setSource]=useState<StemSource|null>(null),[settings,setSettings]=useState<Settings>({vocalMode:'original',vocalBalance:0,playbackRate:1,pitchSemitones:0,audioOutput:'normal'} as Settings);const result=useSeparation(ref,source,settings,effect.current,{busy:v=>{busy=v;},resume:()=>intent,volume:()=>0,resetWatchdog:()=>{}});state=result.state;control={setSource,setSettings};return null;}
 root.render(createElement(Harness));const wait=async(check:()=>boolean)=>{const start=performance.now();while(!check()){if(performance.now()-start>5000)throw Error('race fixture timed out '+JSON.stringify(state));await new Promise(r=>setTimeout(r,20));}};
 try{
  await wait(()=>!!control);const a=new AbortController(),b=new AbortController();control.setSource({url:'kuwo://media/stereo-a',generation:1,signal:a.signal});control.setSettings((s:Settings)=>({...s,vocalMode:'accompaniment',vocalBalance:1}));await wait(()=>pending.size===1);const first=[...pending.keys()][0];
  a.abort();await replaceStemSource(media,'kuwo://media/stereo-b',2,b.signal);await media.play();control.setSource({url:'kuwo://media/stereo-b',generation:2,signal:b.signal});await wait(()=>pending.size===2);const second=[...pending.keys()][1];pending.get(first)!.resolve({url:'kuwo://media/six-old'});await new Promise(r=>setTimeout(r,80));const staleIgnored=media.src==='kuwo://media/stereo-b'&&state.phase!=='ready';
  intent=false;media.pause();pending.get(second)!.resolve({url:'kuwo://media/six-new'});await wait(()=>state.phase==='ready'&&!busy);const staysPaused=media.paused,samePosition=Math.abs(media.currentTime-2)<.3;
  control.setSettings((s:Settings)=>({...s,vocalMode:'original',vocalBalance:0}));await wait(()=>state.phase==='idle'&&media.src==='kuwo://media/stereo-b'&&!busy);const restoredPaused=media.paused;
  control.setSource({url:'kuwo://media/stereo-c',generation:3,signal:new AbortController().signal});control.setSettings((s:Settings)=>({...s,vocalMode:'vocal',vocalBalance:-1}));await wait(()=>pending.size===3);const third=[...pending.keys()][2];control.setSettings((s:Settings)=>({...s,vocalMode:'original',vocalBalance:0}));await wait(()=>cancelled.includes(third)&&state.phase==='idle');pending.get(third)!.resolve({url:'kuwo://media/six-cancelled'});await new Promise(r=>setTimeout(r,100));const disabledIgnored=!media.src.includes('cancelled');
  intent=true;const d=new AbortController(),e=new AbortController();await replaceStemSource(media,'kuwo://media/stereo-d',1,d.signal);await media.play();control.setSource({url:'kuwo://media/stereo-d',generation:4,signal:d.signal});control.setSettings((s:Settings)=>({...s,vocalMode:'accompaniment',vocalBalance:1}));await wait(()=>pending.size===4);const fourth=[...pending.keys()][3];pending.get(fourth)!.resolve({url:'kuwo://media/six-d'});await wait(()=>busy);d.abort();await replaceStemSource(media,'kuwo://media/stereo-e',2,e.signal);await media.play();busy=false;control.setSource({url:'kuwo://media/stereo-e',generation:5,signal:e.signal});await wait(()=>pending.size===5);await new Promise(r=>setTimeout(r,250));const midSwapCancelled=media.src==='kuwo://media/stereo-e'&&!media.paused;
  pending.get([...pending.keys()][4])!.resolve({url:'kuwo://media/six-e'});await wait(()=>busy);control.setSettings((s:Settings)=>({...s,vocalMode:'original',vocalBalance:0}));await wait(()=>state.phase==='idle'&&!busy&&media.src==='kuwo://media/stereo-e');await new Promise(r=>setTimeout(r,180));const resetDuringFade=!media.paused;
  return {staleIgnored,staysPaused,samePosition,restoredPaused,disabledIgnored,midSwapCancelled,resetDuringFade,cancelledRequests:cancelled.length,passed:staleIgnored&&staysPaused&&samePosition&&restoredPaused&&disabledIgnored&&midSwapCancelled&&resetDuringFade&&cancelled.includes(first)};
 }finally{root.unmount();media.pause();}
};
