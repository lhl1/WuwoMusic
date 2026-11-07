import {app,net} from 'electron';
import fs from 'node:fs/promises';
app.whenReady().then(async()=>{
const results=[];
for(const extra of ['',`&probe=${Date.now()}`]){
 try{const res=await net.fetch('https://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=228908'+extra,{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(20000)});const bytes=await res.arrayBuffer();const t=new TextDecoder('utf8').decode(bytes);results.push({status:res.status,headers:Object.fromEntries(res.headers),body:t.slice(0,20000)});}catch(e){results.push({error:String(e)});}
}
await fs.writeFile('artifacts/electron-network.json',JSON.stringify(results,null,2));app.quit();
});
