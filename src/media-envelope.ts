/** A short, cancellable envelope; user volume remains a separate persisted setting. */
export class MediaEnvelope {
 private serial=0;
 cancel(media:HTMLMediaElement,volume:number){this.serial++;media.volume=volume;}
 private async ramp(media:HTMLMediaElement,target:()=>number,duration:number,token:number){
  const start=media.volume,time=performance.now();
  while(token===this.serial){const p=Math.min(1,(performance.now()-time)/duration);media.volume=Math.max(0,Math.min(1,start+(target()-start)*(p*p*(3-2*p))));if(p===1)return true;await new Promise(r=>setTimeout(r,12));}return false;
 }
 async pause(media:HTMLMediaElement,volume:()=>number){const token=++this.serial;if(await this.ramp(media,()=>0,140,token)){media.pause();media.volume=volume();return true;}return false;}
 async resume(media:HTMLMediaElement,volume:()=>number){const token=++this.serial;media.volume=0;await media.play();if(token!==this.serial)return;await this.ramp(media,volume,180,token);}
 async enter(media:HTMLMediaElement,volume:()=>number){const token=++this.serial;media.volume=0;await this.ramp(media,volume,180,token);}
}
