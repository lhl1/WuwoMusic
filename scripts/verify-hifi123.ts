import fs from 'node:fs/promises';
import path from 'node:path';
import {HifiPlayer} from '../electron/hifi';
const h=new HifiPlayer(path.resolve('build/hifi/mpv.exe'),()=>{});
const result:any={date:new Date().toISOString(),devices:[],supported:false};
try{result.devices=await h.devices();await h.setMuted(true);await h.play(path.join(process.env.USERPROFILE!,'Music/WuwoMusic-HiFi-QA/周杰伦 - 晴天.flac'));await h.control('pause');result.paused=structuredClone(h.state);await h.control('resume');result.resumed=structuredClone(h.state);result.supported=true;}
catch(e){result.error=(e as Error).message;}
finally{await h.dispose();await fs.writeFile('docs/evidence/hifi-1.2.3.json',JSON.stringify(result,null,2));}
