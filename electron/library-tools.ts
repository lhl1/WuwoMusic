import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import type {Library,LibraryScope,Track} from '../src/shared';
import {serviceText} from '../src/text';
import {readLocalFiles,audioExtensions} from './local-music';
export function libraryList(library:Library,scope:LibraryScope,id=''):Track[]{
 if(scope==='local')return library.local;if(scope==='favorites')return library.favorites;
 if(scope!=='playlist')throw Error('无效的资料类型');const p=library.playlists.find(p=>p.id===id);if(!p)throw Error('歌单不存在');return p.tracks;
}
export function uniqueTracks(tracks:Track[]):Track[]{
 const byId=new Map<string,Track>();for(const t of tracks){const old=byId.get(t.id);byId.set(t.id,{...old,...t,cover:t.cover??old?.cover,onlineId:t.onlineId??old?.onlineId});}
 const result:Track[]=[],paths=new Map<string,number>();for(const t of byId.values()){const key=t.localPath?path.resolve(t.localPath).toLowerCase():undefined,index=key?paths.get(key):undefined;if(index!==undefined){const old=result[index];result[index]={...old,...t,id:old.id,cover:t.cover??old.cover,onlineId:t.onlineId??old.onlineId};}else{if(key)paths.set(key,result.length);result.push(t);}}return result;
}
export function changeLibrary(library:Library,scope:LibraryScope,id:string,action:string,ids:string[],value=''){
 const list=libraryList(library,scope,id),selected=new Set(ids);
 if(action==='rename'){const name=serviceText(value).slice(0,100);if(scope!=='playlist'||!name)throw Error('请输入歌单名称');library.playlists.find(p=>p.id===id)!.name=name;return;}
 if(action==='favorite'){library.favorites=uniqueTracks([...library.favorites,...list.filter(t=>selected.has(t.id))]);return;}
 if(action==='add'){const target=library.playlists.find(p=>p.id===value);if(!target)throw Error('目标歌单不存在');target.tracks=uniqueTracks([...target.tracks,...list.filter(t=>selected.has(t.id))]);return;}
 if(action==='remove'){const kept=list.filter(t=>!selected.has(t.id));list.splice(0,list.length,...kept);return;}
 if(action==='up'||action==='down'){const sequence=action==='up'?[...list.keys()]:[...list.keys()].reverse();for(const i of sequence){const j=i+(action==='up'?-1:1);if(selected.has(list[i]?.id)&&list[j]&&!selected.has(list[j].id))[list[i],list[j]]=[list[j],list[i]];}return;}
 throw Error('无效的资料操作');
}
export async function scanAudioFolder(directory:string):Promise<string[]>{
 const result:string[]=[],pending=[directory];let visited=0;
 while(pending.length){const folder=pending.pop()!;if(++visited>20000)throw Error('目录过多，请选择较小的音乐目录');for(const entry of await fs.readdir(folder,{withFileTypes:true})){if(entry.isSymbolicLink())continue;const name=path.join(folder,entry.name);if(entry.isDirectory())pending.push(name);else if(entry.isFile()&&audioExtensions.has(path.extname(name).toLowerCase()))result.push(name);if(result.length>10000)throw Error('单次最多导入 10000 首');}}
 return result;
}
export function exportLibrary(name:string,tracks:Track[],format:'json'|'m3u8'):string{
 const line=(s:string)=>s.replace(/[\r\n]/g,' ');
 if(format==='m3u8')return '#EXTM3U\n'+tracks.filter(t=>t.localPath).map(t=>`#EXTINF:${Math.round(t.duration)},${line(t.artist)} - ${line(t.name)}\n${line(t.localPath!)}`).join('\n')+'\n';
 return JSON.stringify({format:'WuwoMusic',version:1,name,tracks:tracks.map(({id,name,artist,album,duration,qualities,localPath,onlineId})=>({id,name,artist,album,duration,qualities,localPath,onlineId}))},null,2);
}
export async function importLibraryFile(filename:string):Promise<{name:string;tracks:Track[];skipped:number}>{
 if((await fs.stat(filename)).size>8*1024*1024)throw Error('歌单文件超过 8MB');const body=await fs.readFile(filename,'utf8');
 const localPaths:string[]=[],online:Track[]=[];let count=0,name=path.basename(filename,path.extname(filename));
 if(path.extname(filename).toLowerCase()==='.json'){
  const raw=JSON.parse(body.replace(/^\ufeff/,''));if(raw.format!=='WuwoMusic'||raw.version!==1||!Array.isArray(raw.tracks)||raw.tracks.length>10000)throw Error('不是支持的无我音乐歌单文件');name=serviceText(raw.name).slice(0,100)||name;count=raw.tracks.length;
  for(const t of raw.tracks){if(t?.localPath&&typeof t.localPath==='string'){if(path.isAbsolute(t.localPath))localPaths.push(t.localPath);continue;}if(!/^\d{1,20}$/.test(String(t?.id)))continue;online.push({id:String(t.id),name:serviceText(t.name).slice(0,500),artist:serviceText(t.artist).slice(0,500),album:serviceText(t.album).slice(0,500),duration:Number.isFinite(t.duration)&&t.duration>=0?t.duration:0,qualities:['128k','320k','flac'],availability:'unknown'});}
 }else{
  for(const raw of body.replace(/^\ufeff/,'').split(/\r?\n/)){const line=raw.trim();if(!line||line.startsWith('#'))continue;count++;if(count>10000)throw Error('歌单最多包含 10000 首');if(/^[a-z]+:\/\//i.test(line))continue;localPaths.push(path.resolve(path.dirname(filename),line));}
 }
 const local:Track[]=[];for(let i=0;i<localPaths.length;i+=500)local.push(...await readLocalFiles(localPaths.slice(i,i+500)));
 const tracks=uniqueTracks([...online,...local]);return {name,tracks,skipped:count-tracks.length};
}
export function createImportedPlaylist(library:Library,name:string,tracks:Track[]){if(library.playlists.length>=100)throw Error('最多创建 100 个歌单');const playlist={id:randomUUID(),name,tracks:uniqueTracks(tracks)};library.playlists.push(playlist);return playlist;}
