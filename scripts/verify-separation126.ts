import fs from 'node:fs/promises';
import path from 'node:path';
import {SeparationService} from '../electron/separation';
const input=path.resolve(process.argv[2]??'artifacts/separation126/audio_example.mp3');
await fs.access(input);const phases:unknown[]=[],started=performance.now();
const service=new SeparationService(path.resolve('artifacts/separation126/integration-cache'),path.resolve('build/separation'),path.resolve('build/hifi/mpv.exe'),s=>{phases.push({...s,ms:Math.round(performance.now()-started)});console.log(s.phase);});
try{const file=await service.prepare({file:input,key:input},'verification'),elapsed=performance.now()-started,b=await fs.readFile(file),frames=(b.length-68)/12;const rms=[0,0,0,0,0,0];let maxReconstruction=0;
 for(let i=0;i<frames;i++){const values=rms.map((_,c)=>b.readInt16LE(68+i*12+c*2)/32768);values.forEach((v,c)=>rms[c]+=v*v);maxReconstruction=Math.max(maxReconstruction,Math.abs(values[0]-values[2]-values[4]),Math.abs(values[1]-values[3]-values[5]));}
 const report={input,file,seconds:frames/44100,elapsedMs:Math.round(elapsed),realTimeFactor:elapsed/1000/(frames/44100),rms:rms.map(x=>Math.sqrt(x/frames)),maxReconstruction,phases};await fs.writeFile('artifacts/separation126/integration.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await service.dispose();}
