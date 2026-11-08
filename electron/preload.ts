import { contextBridge, ipcRenderer,webUtils } from 'electron';
import type { DesktopApi, DownloadTask, Library } from '../src/shared';
const invoke=(method:string,...args:unknown[])=>ipcRenderer.invoke(`music:${method}`,...args).catch((error:Error)=>{throw new Error(error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,''));});
const api:DesktopApi={
  artist:(id,tab,p)=>invoke('artist',id,tab,p),libraryAction:(scope,id,action,ids,value)=>invoke('libraryAction',scope,id,action,ids,value),libraryImport:(scope,id,kind)=>invoke('libraryImport',scope,id,kind),libraryExport:(scope,id,format)=>invoke('libraryExport',scope,id,format),
  desktopLyrics:(a,v)=>invoke('desktopLyrics',a,v),publishLyrics:frame=>invoke('publishLyrics',frame),
  onDesktopLyrics(callback){const handler=(_e:unknown,state:any)=>callback(state);ipcRenderer.on('music:desktopLyrics',handler);return()=>ipcRenderer.removeListener('music:desktopLyrics',handler);},
  onPlayerCommand(callback){const handler=(_e:unknown,action:any)=>callback(action);ipcRenderer.on('music:playerCommand',handler);return()=>ipcRenderer.removeListener('music:playerCommand',handler);},
  queueState:tracks=>invoke('queueState',tracks),saveQueue:(name,tracks)=>invoke('saveQueue',name,tracks),
  snapshot:()=>invoke('snapshot'), search:(q,p)=>invoke('search',q,p), home:p=>invoke('home',p),
  searchHints:q=>invoke('searchHints',q),rankPeriods:id=>invoke('rankPeriods',id),
  searchCatalog:(q,kind,p)=>invoke('searchCatalog',q,kind,p),playlistTags:()=>invoke('playlistTags'),discoverPlaylists:(p,order,tag)=>invoke('discoverPlaylists',p,order,tag),mv:t=>invoke('mv',t),
  comments:(id,sort,page,force)=>invoke('comments',id,sort,page,force),
  onTheme(callback){const handler=(_e:unknown,dark:boolean)=>callback(dark);ipcRenderer.on('music:theme',handler);return()=>ipcRenderer.removeListener('music:theme',handler);},
  onVisibility(callback){const handler=(_e:unknown,visible:boolean)=>callback(visible);ipcRenderer.on('music:visibility',handler);return()=>ipcRenderer.removeListener('music:visibility',handler);},
  collection:(id,kind,page,period)=>invoke('collection',id,kind,page,period),lyrics:(id,force)=>invoke('lyrics',id,force),importLyrics:id=>invoke('importLyrics',id),
  play:(track,q)=>invoke('play',track,q), download:(tracks,q)=>invoke('download',tracks,q),downloadMv:t=>invoke('downloadMv',t),
  cancelPlay:()=>invoke('cancelPlay'),playbackEvent:(event,id)=>invoke('playbackEvent',event,id),
  enrichLocal:t=>invoke('enrichLocal',t),
  importDropped:files=>invoke('importDropped',files.map(f=>webUtils.getPathForFile(f)).filter(Boolean)),
  hifiDevices:()=>invoke('hifiDevices'),hifiControl:(a,p)=>invoke('hifiControl',a,p),
  onHifi(callback){const handler=(_e:unknown,state:any)=>callback(state);ipcRenderer.on('music:hifi',handler);return()=>ipcRenderer.removeListener('music:hifi',handler);},
  qualities:(track,purpose)=>invoke('qualities',track,purpose),
  downloadAction:(id,action)=>invoke('downloadAction',id,action),
  updateSettings:s=>invoke('updateSettings',s),chooseDirectory:()=>invoke('chooseDirectory'),
  importMusic:()=>invoke('importMusic'),favorite:t=>invoke('favorite',t),history:t=>invoke('history',t),
  playlist:(action,name,t)=>invoke('playlist',action,name,t),openDirectory:()=>invoke('openDirectory'),
  window:action=>invoke('window',action),
  onTasks(callback){const handler=(_e:unknown,tasks:DownloadTask[])=>callback(tasks);ipcRenderer.on('music:tasks',handler);return()=>ipcRenderer.removeListener('music:tasks',handler);},
  onLibrary(callback){const handler=(_e:unknown,library:Library)=>callback(library);ipcRenderer.on('music:library',handler);return()=>ipcRenderer.removeListener('music:library',handler);}
};
contextBridge.exposeInMainWorld('desktop',api);
