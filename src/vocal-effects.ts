import type {VocalMode} from './shared';
/** Three aligned stereo pairs: original, isolated vocals, isolated accompaniment. */
export function stemWeights(balance:number,ready=true):[number,number,number]{
 const x=Number.isFinite(balance)?Math.max(-1,Math.min(1,balance)):0;
 return ready?[1-Math.abs(x),Math.max(0,-x),Math.max(0,x)]:[1,0,0];
}
export class VocalEffects{
 private context?:AudioContext;private gains:GainNode[]=[];private merge?:ChannelMergerNode;private pitch?:AudioWorkletNode;private loadingPitch?:Promise<AudioWorkletNode>;private serial=0;private pitchConnected=false;
 async apply(element:HTMLAudioElement,mode:VocalMode,balance?:number,tempo=1,semitones=0,stemsReady=false){
  const serial=++this.serial;tempo=Math.max(.5,Math.min(2,tempo));semitones=Math.max(-12,Math.min(12,semitones));
  const x=balance??(mode==='accompaniment'?1:mode==='vocal'?-1:0);
  if(!this.context&&!stemsReady&&!semitones){element.preservesPitch=true;element.playbackRate=tempo;return;}
  if(!this.context){const context=this.context=new AudioContext(),source=context.createMediaElementSource(element),split=context.createChannelSplitter(6),merge=context.createChannelMerger(2);split.channelInterpretation='discrete';source.connect(split);
   for(let pair=0;pair<3;pair++)for(let channel=0;channel<2;channel++){const gain=context.createGain();gain.gain.value=pair===0?1:0;split.connect(gain,pair*2+channel);gain.connect(merge,0,channel);this.gains.push(gain);}this.merge=merge;merge.connect(context.destination);
  }
  if(semitones&&!this.pitch){this.loadingPitch??=import('./soundtouch-module').then(m=>m.createPitchNode(this.context!)).catch(e=>{this.loadingPitch=undefined;throw e;});this.pitch=await this.loadingPitch;}
  if(serial!==this.serial)return;
  const usePitch=Boolean(semitones&&this.pitch);
  if(usePitch!==this.pitchConnected){this.merge!.disconnect();this.pitch?.disconnect();if(usePitch){this.merge!.connect(this.pitch!);this.pitch!.connect(this.context.destination);}else this.merge!.connect(this.context.destination);this.pitchConnected=usePitch;}
  if(usePitch){this.pitch!.parameters.get('pitchSemitones')!.value=semitones;this.pitch!.parameters.get('playbackRate')!.value=tempo;}
  element.preservesPitch=!usePitch;element.playbackRate=tempo;
  const weights=stemWeights(x,stemsReady),now=this.context.currentTime;
  this.gains.forEach((gain,i)=>{gain.gain.cancelScheduledValues(now);gain.gain.setTargetAtTime(weights[Math.floor(i/2)],now,.025);});
  if(this.context.state==='suspended')await this.context.resume();
 }
 dispose(){++this.serial;void this.context?.close();this.context=undefined;}
}
