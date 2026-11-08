import type {DesktopLyricFrame} from './shared';
export function lyricFrame(value:unknown):DesktopLyricFrame{
 const f=value as DesktopLyricFrame;if(!f||typeof f!=='object')throw Error('无效的桌面歌词');
 for(const key of ['title','artist','current','next'] as const)if(typeof f[key]!=='string'||f[key].length>4000)throw Error('无效的桌面歌词');
 if(typeof f.playing!=='boolean'||!Number.isFinite(f.progress)||f.progress<0||f.progress>1)throw Error('无效的桌面歌词');
 return {title:f.title,artist:f.artist,current:f.current,next:f.next,playing:f.playing,progress:f.progress};
}
