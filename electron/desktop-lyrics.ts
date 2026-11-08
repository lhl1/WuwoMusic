import {BrowserWindow,screen,type WebContents} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {lyricFrame} from '../src/desktop-lyric-state';
import type {DesktopLyricState} from '../src/shared';

interface Options{entry:string;preload:string;directory:string;enabled:boolean;onEnabled:(enabled:boolean)=>void;onCommand:(action:'play'|'previous'|'next')=>void}
export class DesktopLyricsController{
 private window?:BrowserWindow;private bounds?:{x:number;y:number;width:number;height:number};private timer?:ReturnType<typeof setTimeout>;
 private state:DesktopLyricState={enabled:false,locked:false,fontSize:30,opacity:.92,frame:{title:'无我音乐',artist:'',current:'选择一首喜欢的歌',next:'',playing:false,progress:0}};
 constructor(private options:Options){try{const s=JSON.parse(fs.readFileSync(this.file,'utf8'));if([24,30,36,42].includes(s.fontSize))this.state.fontSize=s.fontSize;if([.6,.8,.92,1].includes(s.opacity))this.state.opacity=s.opacity;this.state.locked=s.locked===true;if(s.bounds&&['x','y','width','height'].every(k=>Number.isFinite(s.bounds[k])))this.bounds=s.bounds;}catch{}}
 private get file(){return path.join(this.options.directory,'desktop-lyrics.json');}
 owns(contents:WebContents){return this.window?.webContents===contents;}
 private emit(){if(this.window&&!this.window.isDestroyed()&&this.window.isVisible())this.window.webContents.send('music:desktopLyrics',this.state);}
 private save(){fs.mkdirSync(this.options.directory,{recursive:true});fs.writeFileSync(this.file,JSON.stringify({bounds:this.bounds,fontSize:this.state.fontSize,opacity:this.state.opacity,locked:this.state.locked}));}
 async action(action:unknown,value?:unknown):Promise<DesktopLyricState>{
  if(action==='state')return structuredClone(this.state);
  if(action==='toggle'){if(this.state.enabled)this.close();else await this.open();}
  else if(action==='close')this.close();
  else if(action==='lock'){this.state.locked=!this.state.locked;this.save();}
  else if(action==='font'){if(![24,30,36,42].includes(Number(value)))throw Error('无效的桌面歌词字号');this.state.fontSize=Number(value);this.save();}
  else if(action==='opacity'){if(![.6,.8,.92,1].includes(Number(value)))throw Error('无效的桌面歌词透明度');this.state.opacity=Number(value);this.save();}
  else if(action==='reset'){this.bounds=undefined;const a=screen.getPrimaryDisplay().workArea;this.window?.setBounds({x:Math.round(a.x+(a.width-800)/2),y:a.y+a.height-210,width:Math.min(800,a.width),height:180});this.save();}
  else if(action==='play'||action==='previous'||action==='next')this.options.onCommand(action);
  else throw Error('无效的桌面歌词操作');
  this.emit();return structuredClone(this.state);
 }
 publish(value:unknown){this.state.frame=lyricFrame(value);this.emit();}
 private close(){this.state.enabled=false;this.options.onEnabled(false);this.window?.hide();}
 private async open(){
  if(!this.window||this.window.isDestroyed()){
   const display=this.bounds?screen.getDisplayMatching(this.bounds):screen.getPrimaryDisplay(),area=display.workArea,width=Math.min(800,area.width),height=180;
   const b=this.bounds;const bounds=b?{x:Math.max(area.x,Math.min(b.x,area.x+area.width-width)),y:Math.max(area.y,Math.min(b.y,area.y+area.height-height)),width,height}:{x:Math.round(area.x+(area.width-width)/2),y:area.y+area.height-210,width,height};
   const w=this.window=new BrowserWindow({...bounds,title:'无我音乐 · 桌面歌词',frame:false,transparent:true,alwaysOnTop:true,skipTaskbar:true,resizable:false,show:false,hasShadow:false,webPreferences:{preload:this.options.preload,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
   w.setAlwaysOnTop(true,'floating');w.setMenu(null);w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('will-navigate',e=>e.preventDefault());
   w.on('move',()=>{clearTimeout(this.timer);this.timer=setTimeout(()=>{if(!w.isDestroyed()){this.bounds=w.getBounds();this.save();}},350);});
   w.on('close',()=>{this.state.enabled=false;this.options.onEnabled(false);});
   await w.loadFile(this.options.entry,{hash:'desktop-lyrics'});
  }
  this.state.enabled=true;this.options.onEnabled(true);this.window.showInactive();this.emit();
 }
 dispose(){clearTimeout(this.timer);if(this.window&&!this.window.isDestroyed()){this.bounds=this.window.getBounds();this.save();this.window.destroy();}this.window=undefined;}
}
