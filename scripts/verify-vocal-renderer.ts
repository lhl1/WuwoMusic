import {VocalEffects} from '../src/vocal-effects';
// An isolated, never-shown test renderer; the destination is silenced before playing.
(window as any).verifyVocal=async()=>{
 const Audio=window.AudioContext,context=new Audio(),silent=context.createGain();silent.gain.value=0;silent.connect(context.destination);
 (window as any).AudioContext=class{constructor(){return new Proxy(context,{get(target,key){if(key==='destination')return silent;const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v;}});}};
 const element=document.createElement('audio');if(!location.search.includes('baseline'))element.crossOrigin='anonymous';element.src='kuwo://media/audio124';element.loop=true;document.body.append(element);
 const effects=new VocalEffects();await effects.apply(element,'vocal');const analyser=context.createAnalyser();analyser.fftSize=2048;(effects as any).gains[0].connect(analyser);(effects as any).gains[1].connect(analyser);
 const buffer=new Float32Array(analyser.fftSize),rms=()=>{analyser.getFloatTimeDomainData(buffer);return Math.sqrt(buffer.reduce((sum,x)=>sum+x*x,0)/buffer.length);};const settle=()=>new Promise(r=>setTimeout(r,350));
 try{await element.play();await settle();const vocal=rms();await effects.apply(element,'accompaniment');await settle();const accompaniment=rms();await effects.apply(element,'original');await settle();return {vocal,accompaniment,restored:rms(),cors:element.crossOrigin,passed:vocal>.1&&accompaniment<.005&&rms()>.1};}
 finally{element.pause();effects.dispose();}
};
