import fs from 'node:fs/promises';
import path from 'node:path';
import type {LyricLine,Track} from '../src/shared';
import {decodeBody,imageUrl,type KuwoProvider} from './provider';
import {imageType} from './artwork';

export function parseLrc(text:string):LyricLine[]{
  const offset=Number(text.match(/\[offset:([+-]?\d+)\]/i)?.[1]??0)/1000;
  const out:LyricLine[]=[];
  for(const row of text.replace(/^\uFEFF/,'').split(/\r?\n/)){
    const times=[...row.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];if(!times.length)continue;
    const line=row.replace(/\[[^\]]+\]/g,'').trim();
    for(const m of times)out.push({time:Math.max(0,Number(m[1])*60+Number(m[2])+Number('0.'+(m[3]??'0'))-offset),text:line});
  }
  return out.sort((a,b)=>a.time-b.time);
}
export function formatLrc(lines:LyricLine[]):string {
  return lines.map(l=>{const n=Math.round(l.time*100);return `[${String(Math.floor(n/6000)).padStart(2,'0')}:${String(Math.floor(n/100)%60).padStart(2,'0')}.${String(n%100).padStart(2,'0')}]${l.text}`;}).join('\r\n')+'\r\n';
}
interface Entry {cover?:string;lyrics?:LyricLine[];updated?:number}
export class MetadataCache {
  private pending=new Map<string,Promise<LyricLine[]>>();
  private writes=new Map<string,Promise<void>>();
  constructor(private directory:string,private provider:Pick<KuwoProvider,'lyrics'|'share'>,private offline:()=>boolean){}
  private filename(id:string){if(!/^(\d+|local-[a-f0-9]+)$/.test(id))throw Error('无效的歌曲编号');return path.join(this.directory,id+'.json');}
  private async readDisk(id:string):Promise<Entry>{try{return JSON.parse(await fs.readFile(this.filename(id),'utf8'));}catch{return {};}}
  async read(id:string):Promise<Entry>{await this.writes.get(id)?.catch(()=>{});return this.readDisk(id);}
  async save(id:string,patch:Entry){
    const previous=this.writes.get(id)??Promise.resolve();
    const task=previous.catch(()=>{}).then(async()=>{await fs.mkdir(this.directory,{recursive:true});const data={...await this.readDisk(id),...patch,updated:Date.now()};const filename=this.filename(id);await fs.writeFile(filename+'.tmp',JSON.stringify(data));await fs.rename(filename+'.tmp',filename);});
    this.writes.set(id,task);try{await task;}finally{if(this.writes.get(id)===task)this.writes.delete(id);}
  }
  async cover(track:Track):Promise<string|undefined>{
    const entry=await this.read(track.id);if(entry.cover)return entry.cover;
    let cover=track.cover;
    if(!cover&&track.localPath){
      const stem=track.localPath.replace(/\.[^.]+$/,''),directory=path.dirname(track.localPath);
      const candidates=['jpg','png','webp','jpeg'].flatMap(ext=>[stem+'.cover.'+ext,path.join(directory,'cover.'+ext),path.join(directory,'folder.'+ext)]);
      for(const filename of candidates){try{const stat=await fs.stat(filename);if(stat.size>1500000)continue;const bytes=await fs.readFile(filename),type=imageType(bytes);if(type){cover=`data:${type};base64,${bytes.toString('base64')}`;break;}}catch{/* Optional local artwork may be absent. */}}
    }
    const onlineId=track.onlineId??track.id;
    if(!cover&&!this.offline()&&/^\d+$/.test(onlineId)){const d=await this.provider.share(onlineId).catch(()=>null);cover=imageUrl(d?.img700||d?.img);}
    if(cover)await this.save(track.id,{cover});return cover;
  }
  async lyrics(track:Track,force=false):Promise<LyricLine[]>{
    const entry=await this.read(track.id);if(entry.lyrics?.length&&!force)return entry.lyrics;
    if(track.localPath){
      const file=track.localPath.replace(/\.[^.]+$/,'.lrc');
      try{const lines=await this.importFile(track.id,file);if(lines.length)return lines;}catch{/* A local lyric file is optional. */}
    }
    const onlineId=track.onlineId??track.id;
    if(this.offline()||!/^\d+$/.test(onlineId))return entry.lyrics??[];
    const existing=this.pending.get(track.id);if(existing)return existing;
    const task=this.provider.lyrics(onlineId,force).then(async lines=>{if(lines.length)await this.save(track.id,{lyrics:lines});return lines;});this.pending.set(track.id,task);
    try{return await task;}finally{this.pending.delete(track.id);}
  }
  async importFile(id:string,filename:string){
    const stat=await fs.stat(filename);if(stat.size>1024*1024)throw Error('歌词文件不能大于 1 MB');
    const lines=parseLrc(decodeBody(await fs.readFile(filename)));if(!lines.length)throw Error('未找到有效的带时间轴 LRC 歌词');
    await this.save(id,{lyrics:lines});return lines;
  }
}
