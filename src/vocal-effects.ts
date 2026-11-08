import type {VocalMode} from './shared';
/** Stereo matrix processing, not AI stem separation. Kept out of the HiFi path. */
export function vocalMatrix(mode:VocalMode,balance?:number):[number,number,number,number]{const x=Math.max(-1,Math.min(1,balance??(mode==='accompaniment'?1:mode==='vocal'?-1:0)));if(x===0)return [1,0,0,1];return x>=0?[1-.5*x,-.5*x,-.5*x,1-.5*x]:[1+.35*x,-.35*x,-.35*x,1+.35*x];}
export class VocalEffects{
 private context?:AudioContext;private gains:GainNode[]=[];private merge?:ChannelMergerNode;private pitch?:AudioWorkletNode;private loadingPitch?:Promise<AudioWorkletNode>;private serial=0;
 async apply(element:HTMLAudioElement,mode:VocalMode,balance?:number,tempo=1,semitones=0){
  const serial=++this.serial;tempo=Math.max(.5,Math.min(2,tempo));semitones=Math.max(-12,Math.min(12,semitones));
  if(!this.context&&mode==='original'&&!balance&&!semitones){element.preservesPitch=true;element.playbackRate=tempo;return;}
  if(!this.context){const context=this.context=new AudioContext(),source=context.createMediaElementSource(element),split=context.createChannelSplitter(2),merge=context.createChannelMerger(2);source.connect(split);
   for(let out=0;out<2;out++)for(let input=0;input<2;input++){const gain=context.createGain();gain.gain.value=out===input?1:0;split.connect(gain,input);gain.connect(merge,0,out);this.gains.push(gain);}this.merge=merge;merge.connect(context.destination);
  }
  if(semitones&&!this.pitch){this.loadingPitch??=import('./soundtouch-module').then(m=>m.createPitchNode(this.context!)).catch(e=>{this.loadingPitch=undefined;throw e;});this.pitch=await this.loadingPitch;}
  if(serial!==this.serial)return;
  this.merge!.disconnect();this.pitch?.disconnect();
  if(semitones&&this.pitch){this.pitch.parameters.get('pitchSemitones')!.value=semitones;this.pitch.parameters.get('playbackRate')!.value=tempo;this.merge!.connect(this.pitch);this.pitch.connect(this.context.destination);element.preservesPitch=false;}
  else{this.merge!.connect(this.context.destination);element.preservesPitch=true;}
  element.playbackRate=tempo;
  const values=vocalMatrix(mode,balance),now=this.context.currentTime;
  this.gains.forEach((gain,i)=>{gain.gain.cancelScheduledValues(now);gain.gain.setTargetAtTime(values[i],now,.025);});
  if(this.context.state==='suspended')await this.context.resume();
 }
 dispose(){++this.serial;void this.context?.close();this.context=undefined;}
}
