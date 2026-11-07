import path from 'node:path';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseFile} from 'music-metadata';
import {audioInfo} from './audio-info';
import type {Track} from '../src/shared';
export const audioExtensions=new Set(['.mp3','.aac','.flac','.wav','.m4a','.ogg','.opus','.aiff','.aif','.alac']);
export function filenameTags(filename:string):{name:string;artist:string}{
 const kuwo=path.basename(filename,path.extname(filename)).match(/^(.+)-([^-]+)-\d{3,12}-(?:2000|320|128)$/);
 if(kuwo)return {name:kuwo[1].trim(),artist:kuwo[2].trim()};
 const stem=path.basename(filename,path.extname(filename)).replace(/\s*\[\d+\s+(?:flac|128k|320k)\]$/i,'').replace(/^\d+[.、]\s*/,''),parts=stem.split(/\s+-\s+/);
 return parts.length===2?{name:parts[1].trim(),artist:parts[0].trim()}:{name:stem,artist:'未知歌手'};
}
const key=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
export function chooseLocalMatch(local:Track,candidates:Track[]):Track|undefined{
 const title=key(local.name),artist=key(local.artist),knownArtist=artist&&artist!==key('未知歌手');
 if(!title||!local.duration)return;
 const matches=candidates.filter(t=>key(t.name)===title&&t.duration>0&&Math.abs(t.duration-local.duration)<=Math.min(6,Math.max(2,local.duration*.02))&&(!knownArtist||key(t.artist)===artist));
 const hint=local.localPath?.match(/\[(\d+)\s+(?:flac|320k|128k)\]/i)?.[1]??local.localPath?.match(/-(\d{3,12})-(?:2000|320|128)\.[^.]+$/)?.[1];
 const identified=hint?matches.find(t=>t.id===hint):undefined;if(identified)return identified;
 const ids=new Map(matches.map(t=>[t.id,t]));
 if(ids.size===1)return [...ids.values()][0];
 if(local.album){const albums=matches.filter(t=>key(t.album)===key(local.album));if(new Set(albums.map(t=>t.id)).size===1)return albums[0];}
 if(knownArtist){const sorted=[...ids.values()].sort((a,b)=>Math.abs(a.duration-local.duration)-Math.abs(b.duration-local.duration)),best=sorted[0],second=sorted[1];if(best?.album&&Math.abs(best.duration-local.duration)<=1.25&&(!second||Math.abs(second.duration-local.duration)-Math.abs(best.duration-local.duration)>=.75))return best;}
 // Ambiguous live/remix/cover versions must not silently borrow another recording's comments.
}
export async function readLocalFiles(files:unknown):Promise<Track[]>{
 if(!Array.isArray(files)||files.length>500||files.some(p=>typeof p!=='string'||p.length>32768||!path.isAbsolute(p)))throw Error('无效的音频文件列表');
 const tracks:Track[]=[];
 for(const input of [...new Set(files as string[])]){
  if(!audioExtensions.has(path.extname(input).toLowerCase()))continue;
  try{const filename=await fs.realpath(input),m=await parseFile(filename,{duration:true});if(!m.format.hasAudio)continue;
   const guessed=filenameTags(filename),pic=m.common.picture?.[0],info=audioInfo(m,(await fs.stat(filename)).size),lossless=/flac|wav|alac|aiff|pcm/i.test(m.format.codec??m.format.container??'');
   tracks.push({id:`local-${createHash('sha256').update(filename).digest('hex').slice(0,20)}`,name:m.common.title||guessed.name,artist:m.common.artist||guessed.artist,album:m.common.album||'',duration:m.format.duration||0,localPath:filename,qualities:[lossless?'flac':(info.bitrate??0)>=280?'320k':'128k'],audioInfo:info,availability:'available',cover:pic&&pic.data.length<1500000?`data:${pic.format};base64,${Buffer.from(pic.data).toString('base64')}`:undefined});
  }catch{/* Continue importing the other valid selected files. */}
 }
 return tracks;
}
