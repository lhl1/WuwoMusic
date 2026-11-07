import {app,net} from 'electron';
import fs from 'node:fs/promises';
import {KuwoProvider} from '../electron/provider';

// Run without creating any window; verify the same network stack as the packaged app.
app.whenReady().then(async()=>{
 const provider=new KuwoProvider((url,init)=>net.fetch(url,init)),checks=[];
 for(const id of ['228908','93157','6304356']){
  try{const lines=await provider.lyrics(id,true);checks.push({id,ok:lines.length>0,count:lines.length});}
  catch(error){checks.push({id,ok:false,error:(error as Error).message});}
 }
 await fs.mkdir('artifacts',{recursive:true});await fs.writeFile('artifacts/electron-lyrics-final.json',JSON.stringify({timestamp:new Date().toISOString(),checks},null,2));
 console.log(JSON.stringify(checks));app.exit(checks.every(c=>c.ok)?0:1);
});
