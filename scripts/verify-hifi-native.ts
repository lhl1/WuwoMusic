import fs from 'node:fs/promises';
import path from 'node:path';
import {HifiPlayer} from '../electron/hifi';
const states:any[]=[];const h=new HifiPlayer(path.resolve('build/hifi/mpv.exe'),s=>states.push(s));
try{
 const devices=await h.devices();console.log('Devices:',devices);
 const state=JSON.parse(await fs.readFile(process.env.APPDATA+'/KuwoMusicDesktop/state.json','utf8'));
 const file=state.library.local.find((t:any)=>t.localPath?.endsWith('.flac')).localPath;
 const device=devices.find(d=>/CABLE In 16ch/.test(d.name))?.id??'auto';
 const generation=await h.play(file,device);await new Promise(r=>setTimeout(r,1000));await h.control('pause');const paused=structuredClone(h.state);await h.control('seek',15);await h.control('resume');await new Promise(r=>setTimeout(r,600));
 await fs.writeFile('docs/evidence/hifi-native-120.json',JSON.stringify({devices,file,device,generation,paused,resumed:h.state,states},null,2));console.log(JSON.stringify({paused,resumed:h.state}));
}finally{await h.dispose();}
