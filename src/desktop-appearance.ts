import type {DesktopLyricState} from './shared';
export const lyricColors=['#ffd84d','#ffffff','#62d9ff','#71e6a0','#ff9bcd','#b5a0ff'];
export const lyricFonts=['Microsoft YaHei UI','Microsoft YaHei','SimHei','KaiTi','Arial'];
export function desktopAppearance(raw:unknown):Partial<DesktopLyricState>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('无效的歌词外观');const p=raw as Record<string,unknown>,out:Partial<DesktopLyricState>={};
 for(const key of ['singleLine','bold','outline','karaoke'] as const)if(p[key]!==undefined){if(typeof p[key]!=='boolean')throw Error('无效的歌词外观');out[key]=p[key];}
 if(p.fontFamily!==undefined){if(!lyricFonts.includes(String(p.fontFamily)))throw Error('不支持的歌词字体');out.fontFamily=String(p.fontFamily);}
 if(p.alignment!==undefined){if(!['left','center','right'].includes(String(p.alignment)))throw Error('无效的歌词对齐');out.alignment=p.alignment as 'left'|'center'|'right';}
 for(const key of ['color','highlight']as const)if(p[key]!==undefined){if(!/^#[a-f0-9]{6}$/i.test(String(p[key])))throw Error('无效的歌词颜色');out[key]=String(p[key]);}
 return out;
}
export function desktopBounds(area:{x:number;y:number;width:number;height:number},saved?:{x:number;y:number;width:number;height:number}){
 const width=Math.min(area.width,Math.max(480,Math.min(1400,saved?.width??900))),height=Math.min(area.height,Math.max(100,Math.min(260,saved?.height??170)));
 return {width,height,x:Math.round(Math.max(area.x,Math.min(saved?.x??area.x+(area.width-width)/2,area.x+area.width-width))),y:Math.round(Math.max(area.y,Math.min(saved?.y??area.y+area.height-height-18,area.y+area.height-height)))};
}
