import {KuwoProvider} from '../electron/provider';import {DiscoveryService} from '../electron/discovery';import fs from 'node:fs';
const p=new KuwoProvider(),d=new DiscoveryService(p);const out:any={};
for(const kind of ['all','artist','album','playlist','lyrics']as const){try{const r=await d.search(kind==='lyrics'?'故事的小黄花':'晴天',kind,0);out[kind]={total:r.total,tracks:r.tracks.slice(0,2),items:r.items.slice(0,3),errors:r.errors};}catch(e){out[kind]=String(e);}}
const raw=await p.json('https://wapi.kuwo.cn/api/pc/classify/playlist/getTagList');out.tags=raw.data.map((g:any)=>({name:g.name,tags:g.data.slice(0,5).map((t:any)=>({id:t.id,name:t.name,digest:t.digest}))}));
const t=(await p.search('晴天 周杰伦')).tracks[0];try{out.mv=await d.mv(t);}catch(e){out.mv=String(e)}
fs.writeFileSync('artifacts/discovery-normalized.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));