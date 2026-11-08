import {BrowserWindow,screen,Tray,Menu,globalShortcut,type WebContents} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {lyricFrame} from '../src/desktop-lyric-state';
import {desktopAppearance,desktopBounds} from '../src/desktop-appearance';
import type {DesktopLyricState} from '../src/shared';
interface Options{entry:string;preload:string;directory:string;icon:string;enabled:boolean;onEnabled:(enabled:boolean)=>void;onCommand:(action:'play'|'previous'|'next'|'search'|'offset',value?:number)=>void;onReveal:()=>void}
export class DesktopLyricsController{
 private window?:BrowserWindow;private tray?:Tray;private bounds?:{x:number;y:number;width:number;height:number};private timer?:ReturnType<typeof setTimeout>;private expanded=false;private shortcuts:string[]=[];
 private state:DesktopLyricState={enabled:false,locked:false,mouseThrough:false,fontSize:36,opacity:0,singleLine:false,alignment:'center',fontFamily:'Microsoft YaHei UI',bold:true,color:'#ffffff',highlight:'#ffd84d',outline:true,karaoke:true,frame:{title:'无我音乐',artist:'',current:'选择一首喜欢的歌',next:'',playing:false,progress:0}};
 constructor(private options:Options){try{const s=JSON.parse(fs.readFileSync(this.file,'utf8'));if(s.version===2){Object.assign(this.state,desktopAppearance(s));if(Number.isInteger(s.fontSize)&&s.fontSize>=20&&s.fontSize<=64)this.state.fontSize=s.fontSize;if(Number.isFinite(s.opacity)&&s.opacity>=0&&s.opacity<=1)this.state.opacity=s.opacity;this.state.locked=s.locked===true;}if(s.bounds&&['x','y','width','height'].every(k=>Number.isFinite(s.bounds[k])))this.bounds=s.bounds;}catch{}}
 private get file(){return path.join(this.options.directory,'desktop-lyrics.json');}
 owns(contents:WebContents){return this.window?.webContents===contents;}
 private emit(){if(this.window&&!this.window.isDestroyed())this.window.webContents.send('music:desktopLyrics',this.state);}
 private save(){fs.mkdirSync(this.options.directory,{recursive:true});const {frame,enabled,...appearance}=this.state;fs.writeFileSync(this.file,JSON.stringify({version:2,...appearance,bounds:this.bounds}));}
 private through(value:boolean){this.state.mouseThrough=value;this.window?.setIgnoreMouseEvents(value,{forward:true});this.save();this.updateTray();}
 private unlock(){this.state.locked=false;this.window?.setResizable(true);this.through(false);this.emit();}
 private updateTray(){this.tray?.setContextMenu(Menu.buildFromTemplate([{label:'显示主窗口',click:()=>this.options.onReveal()},{label:'解除歌词锁定 / 穿透',click:()=>{this.unlock();this.window?.showInactive();}},{label:'单行歌词',type:'checkbox',checked:this.state.singleLine,click:()=>void this.action('appearance',{singleLine:!this.state.singleLine})},{label:'重置歌词位置',click:()=>void this.action('reset')},{type:'separator'},{label:'关闭桌面歌词',click:()=>this.close()}]));}
 async action(action:unknown,value?:unknown):Promise<DesktopLyricState>{
  if(action==='state')return structuredClone(this.state);
  if(action==='toggle'){if(this.state.enabled)this.close();else await this.open();}
  else if(action==='close')this.close();
  else if(action==='lock'){this.state.locked=!this.state.locked;this.window?.setResizable(!this.state.locked);this.save();}
  else if(action==='through')this.through(!this.state.mouseThrough);
  else if(action==='appearance'){Object.assign(this.state,desktopAppearance(value));this.save();}
  else if(action==='font'){if(!Number.isInteger(value)||Number(value)<20||Number(value)>64)throw Error('无效的桌面歌词字号');this.state.fontSize=Number(value);this.save();}
  else if(action==='opacity'){if(!Number.isFinite(value)||Number(value)<0||Number(value)>1)throw Error('无效的桌面歌词透明度');this.state.opacity=Number(value);this.save();}
  else if(action==='reset'){this.bounds=desktopBounds(screen.getPrimaryDisplay().workArea);this.expanded=false;this.window?.setBounds(this.bounds);this.save();}
  else if(action==='panel'){const w=this.window;if(w){if(!this.expanded)this.bounds=w.getBounds();this.expanded=value===1;const base=this.bounds!,area=screen.getDisplayMatching(base).workArea;w.setBounds(this.expanded?{...base,height:Math.min(430,area.height),y:Math.max(area.y,base.y+base.height-430)}:base);}}
  else if(action==='reveal')this.options.onReveal();
  else if(action==='search'){this.options.onReveal();this.options.onCommand('search');}
  else if(action==='offset'){if(!Number.isFinite(value)||Math.abs(Number(value))>1)throw Error('无效的歌词时间');this.options.onCommand('offset',Number(value));}
  else if(action==='play'||action==='previous'||action==='next')this.options.onCommand(action);
  else throw Error('无效的桌面歌词操作');this.emit();this.updateTray();return structuredClone(this.state);
 }
 publish(value:unknown){this.state.frame=lyricFrame(value);this.emit();}
 private close(){this.state.enabled=false;this.options.onEnabled(false);this.window?.hide();this.tray?.destroy();this.tray=undefined;for(const key of this.shortcuts)globalShortcut.unregister(key);this.shortcuts=[];}
 private async open(){
  if(!this.window||this.window.isDestroyed()){
   const area=(this.bounds?screen.getDisplayMatching(this.bounds):screen.getPrimaryDisplay()).workArea,bounds=desktopBounds(area,this.bounds);this.bounds=bounds;
   const w=this.window=new BrowserWindow({...bounds,title:'无我音乐 · 桌面歌词',frame:false,transparent:true,backgroundColor:'#00000000',alwaysOnTop:true,skipTaskbar:true,resizable:!this.state.locked,minWidth:480,minHeight:100,show:false,hasShadow:false,webPreferences:{preload:this.options.preload,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
   w.setAlwaysOnTop(true,'floating');w.setMenu(null);w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('will-navigate',e=>e.preventDefault());
   const remember=()=>{clearTimeout(this.timer);this.timer=setTimeout(()=>{if(!w.isDestroyed()&&!this.expanded){this.bounds=w.getBounds();this.save();}},350);};w.on('move',remember);w.on('resize',remember);w.on('close',()=>this.close());
   await w.loadFile(this.options.entry,{hash:'desktop-lyrics'});
  }
  this.state.enabled=true;this.options.onEnabled(true);this.through(false);this.window.showInactive();
  if(!this.tray){this.tray=new Tray(this.options.icon);this.tray.setToolTip('无我音乐 · 桌面歌词（双击解除锁定）');this.tray.on('double-click',()=>{this.unlock();});}
  for(const [key,fn]of [['CommandOrControl+Alt+L',()=>this.close()],['CommandOrControl+Alt+Shift+L',()=>{this.unlock();}]]as const)if(globalShortcut.register(key,fn))this.shortcuts.push(key);
  this.emit();this.updateTray();
 }
 dispose(){clearTimeout(this.timer);if(this.window&&!this.window.isDestroyed()){if(!this.expanded)this.bounds=this.window.getBounds();this.save();this.window.destroy();}this.window=undefined;this.tray?.destroy();for(const key of this.shortcuts)globalShortcut.unregister(key);}
}
