import type {VocalMode} from './shared';
/** Stereo matrix processing, not AI stem separation. Kept out of the HiFi path. */
export function vocalMatrix(mode:VocalMode):[number,number,number,number]{return mode==='accompaniment'?[.5,-.5,.5,-.5]:mode==='vocal'?[.65,.35,.35,.65]:[1,0,0,1];}
export class VocalEffects{
 private context?:AudioContext;private gains:GainNode[]=[];
 async apply(element:HTMLAudioElement,mode:VocalMode){
  if(!this.context&&mode==='original')return;
  if(!this.context){const context=this.context=new AudioContext(),source=context.createMediaElementSource(element),split=context.createChannelSplitter(2),merge=context.createChannelMerger(2);source.connect(split);
   for(let out=0;out<2;out++)for(let input=0;input<2;input++){const gain=context.createGain();gain.gain.value=out===input?1:0;split.connect(gain,input);gain.connect(merge,0,out);this.gains.push(gain);}merge.connect(context.destination);
  }
  const values=vocalMatrix(mode),now=this.context.currentTime;
  this.gains.forEach((gain,i)=>{gain.gain.cancelScheduledValues(now);gain.gain.setTargetAtTime(values[i],now,.025);});
  if(this.context.state==='suspended')await this.context.resume();
 }
 dispose(){void this.context?.close();this.context=undefined;}
}
