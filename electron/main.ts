import { app, BrowserWindow, dialog, ipcMain, nativeTheme, protocol, session, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { parseFile } from 'music-metadata';
import type { DesktopApi, AudioInfo, DownloadTask, Quality, Settings, Track } from '../src/shared';
import { KuwoProvider, UA } from './provider';
import { DownloadManager } from './downloads';
import { Store } from './storage';
import { ArtworkCache, imageType } from './artwork';
import { MetadataCache, formatLrc, parseLrc } from './metadata';
import {MultiCommentService} from './comment-sources';
import {DesktopLyricsController} from './desktop-lyrics';
import {DiscoveryService} from './discovery';
import {themeSource} from '../src/preferences';
import {inspectFile,inspectStream} from './audio-info';
import {readLocalFiles,chooseLocalMatch} from './local-music';
import {artistPage} from './artist';
import type {LibraryScope} from '../src/shared';
import {libraryList,changeLibrary,scanAudioFolder,exportLibrary,importLibraryFile,uniqueTracks,createImportedPlaylist} from './library-tools';
import {HifiPlayer} from './hifi';
import {AudioBridge} from './audio-bridge';
import {NativeCatalog} from './native-catalog';
import {mediaResponse,type RemoteMedia} from './media-proxy';
import {bounded} from '../src/playback-control';
import {PlaybackLog} from './playback-log';
import {NetworkPolicy,proxyMode} from './network-policy';

const appDir=app.getAppPath();
protocol.registerSchemesAsPrivileged([{scheme:'kuwo',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true}}]);
let window:BrowserWindow,store:Store,downloads:DownloadManager;
let artwork:ArtworkCache,metadata:MetadataCache;
let avatars:ArtworkCache,commentImages:ArtworkCache;
let network:NetworkPolicy;
let desktopLyrics:DesktopLyricsController;
const fetchNetwork=(url:string,init?:RequestInit)=>network.fetch(url,init);
const comments=new MultiCommentService(fetchNetwork,()=>Boolean(store?.data.settings.offline));
const metadataHandled=new Set<string>();
const provider=new KuwoProvider((url,init)=>{if(store?.data.settings.offline)throw new Error('当前为离线模式，请在设置中关闭后联网');return fetchNetwork(url,init);});
const discovery=new DiscoveryService(provider);
const nativeCatalog=new NativeCatalog(provider);
let playTicket=0;
let playAbort:AbortController|undefined;
const playbackLog=new PlaybackLog(path.join(app.getPath('userData'),'logs/playback.log'));
type MediaSource={file?:string;url?:string;signal?:AbortSignal;refresh?:()=>Promise<string>};
const hifi=new HifiPlayer(path.join(app.isPackaged?process.resourcesPath:path.join(appDir,'build'),'hifi','mpv.exe'),state=>{if(window&&!window.isDestroyed())window.webContents.send('music:hifi',state);});
const bridge=new AudioBridge(fetchNetwork,()=>Boolean(store?.data.settings.offline));
const localMatches=new Map<string,Promise<Track>>();
const sources=new Map<string,MediaSource>();
const qualities=new Set(['128k','320k','flac']);
function quality(q:unknown):Quality{if(typeof q!=='string'||!qualities.has(q))throw new Error('无效的音质');return q as Quality;}
function text(value:unknown,max=200):string{if(typeof value!=='string'||value.length>max)throw new Error('无效的参数');return value;}
function integer(value:unknown,fallback=0,max=10000){if(value===undefined)return fallback;if(!Number.isInteger(value)||Number(value)<0||Number(value)>max)throw new Error('无效的页码');return Number(value);}
function track(value:unknown):Track{
  if(!value||typeof value!=='object')throw new Error('无效的歌曲');
  const r=value as Track;const id=text(r.id,100);
  // Imported paths and completed downloads are only trusted when present in the main-process library.
  if(r.localPath){const known=store.data.library.local.find(x=>x.id===id && x.localPath===r.localPath);if(!known)throw new Error('本地歌曲不存在，请重新导入');return known;}
  if(!/^\d+$/.test(id))throw new Error('无效的歌曲编号');
  return {id,name:text(r.name,500),artist:text(r.artist,500),album:text(r.album??'',500),duration:Math.max(0,Math.min(86400,Number(r.duration)||0)),cover:typeof r.cover==='string'&&/^(https?:|data:image\/)/.test(r.cover)?r.cover.slice(0,2000000):undefined,qualities:Array.isArray(r.qualities)?r.qualities.filter(x=>qualities.has(x)):['128k'],availability:r.availability,payInfo:r.payInfo,hasMv:r.hasMv===true,artistId:typeof r.artistId==='string'&&/^\d+$/.test(r.artistId)?r.artistId:undefined,albumId:typeof r.albumId==='string'&&/^\d+$/.test(r.albumId)?r.albumId:undefined};
}
function handle(name:string,fn:(...args:any[])=>any){
  ipcMain.handle(`music:${name}`,async(event,...args)=>{
    if(!window || event.sender!==window.webContents || event.senderFrame!==window.webContents.mainFrame)throw new Error('无效的调用来源');
    try{return await fn(...args);}catch(e){throw new Error((e as Error).message || '操作失败');}
  });
}
function mediaToken(source:MediaSource){
  const token=randomUUID();sources.set(token,source);
  if(sources.size>64)sources.delete(sources.keys().next().value!);
  return `kuwo://media/${token}`;
}
function knownTrack(id:string):Track {
  text(id,100);if(!/^(\d+|local-[a-f0-9]+)$/.test(id))throw new Error('无效的歌曲编号');
  return [...store.data.library.local,...store.data.library.history,...store.data.library.favorites].find(t=>t.id===id)??{id,name:'',artist:'',album:'',duration:0,qualities:['128k']};
}
async function enrichDownload(t:DownloadTask){
  if(t.media==='mv'||t.status!=='completed'||!t.path||t.metadataSaved||metadataHandled.has(t.id)||store.data.settings.offline)return;
  metadataHandled.add(t.id);
  try{
    const [lines,cover]=await Promise.all([metadata.lyrics(t.track).catch(()=>[]),metadata.cover(t.track).catch(()=>undefined)]);
    const stem=t.path.replace(/\.[^.]+$/,'');
    if(lines.length&&store.data.settings.saveLyrics!==false)await fsp.writeFile(stem+'.lrc',formatLrc(lines),{flag:'wx'}).catch(()=>{});
    if(cover){
      const bytes=await artwork.bytes(cover).catch(()=>undefined);
      if(bytes&&store.data.settings.saveCover!==false){const type=imageType(bytes);const ext=type==='image/png'?'png':type==='image/webp'?'webp':type==='image/gif'?'gif':'jpg';await fsp.writeFile(stem+'.cover.'+ext,bytes,{flag:'wx'}).catch(()=>{});}
      t.track.cover=cover;const local=store.data.library.local.find(x=>x.localPath===t.path);if(local)local.cover=cover;
    }
    t.metadataSaved=Boolean(lines.length||cover);store.save();
    if(window&&!window.isDestroyed()){window.webContents.send('music:library',structuredClone(store.data.library));window.webContents.send('music:tasks',structuredClone(store.data.tasks));}
  }catch{/* Supplementary metadata must not invalidate a complete audio download. */}
}
async function registerMedia(){
  protocol.handle('kuwo',async request=>{
    const u=new URL(request.url);
    if(u.hostname==='comment-image'){if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405});const raw=u.searchParams.get('url');return raw?commentImages.response(raw):new Response(null,{status:404});}
    if(u.hostname==='avatar'){
      if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405});
      const raw=u.searchParams.get('url');return raw?avatars.response(raw):new Response(null,{status:404});
    }
    if(u.hostname==='artwork'){
      if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405});
      let raw=u.searchParams.get('url');
      if(!raw&&u.searchParams.has('collectionId')){const kind=u.searchParams.get('kind');if(!['playlist','rank','album','artist'].includes(kind??''))return new Response(null,{status:400});try{raw=await provider.collectionCover(u.searchParams.get('collectionId')!,kind as any)??null;}catch{return new Response(null,{status:404});}}
      if(!raw&&u.searchParams.has('rid')){try{raw=await metadata.cover(knownTrack(u.searchParams.get('rid')!))??null;}catch{return new Response(null,{status:404});}}
      if(!raw)return new Response(null,{status:404});return artwork.response(raw);
    }
    const source=u.hostname==='media'?sources.get(u.pathname.slice(1)):undefined;
    if(!source)return new Response('Not found',{status:404});
    if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405});
    if(source.url){
      try{
        if(store.data.settings.offline)return new Response('当前为离线模式',{status:503});
        const response=await mediaResponse(source as RemoteMedia,request,fetchNetwork);response.headers.set('Access-Control-Allow-Origin','null');return response;
      }catch(e){if(!source.signal?.aborted&&!request.signal.aborted)playbackLog.write('stream-failed',{error:String(e).replace(/https?:\/\/\S+/g,'[url]').slice(0,200)});return new Response('音频连接已失效，请重新播放',{status:502});}
    }
    try{
      const stat=await fsp.stat(source.file!);let start=0,end=stat.size-1,status=200;
      const range=request.headers.get('range');
      if(range){const m=range.match(/^bytes=(\d*)-(\d*)$/);if(!m || (!m[1]&&!m[2]))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${stat.size}`}});
        if(!m[1])start=Math.max(0,stat.size-Number(m[2]));else{start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}
        if(start>end || start>=stat.size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${stat.size}`}});status=206;}
      const ext=path.extname(source.file!).toLowerCase();
      const type=({'.mp4':'video/mp4','.mp3':'audio/mpeg','.flac':'audio/flac','.wav':'audio/wav','.aac':'audio/aac','.m4a':'audio/mp4','.ogg':'audio/ogg'} as Record<string,string>)[ext]??'application/octet-stream';
      const headers={'Access-Control-Allow-Origin':'null','Content-Type':type,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes',...(status===206?{'Content-Range':`bytes ${start}-${end}/${stat.size}`}:{})};
      if(request.method==='HEAD')return new Response(null,{status,headers});
      const stream=fs.createReadStream(source.file!,{start,end});
      request.signal.addEventListener('abort',()=>stream.destroy(),{once:true});
      return new Response(Readable.toWeb(stream) as ReadableStream,{status,headers});
    }catch{return new Response('本地文件不存在',{status:404});}
  });
}
async function importFiles(files:unknown):Promise<Track[]>{
  const items=await readLocalFiles(files);if(!items.length)throw Error('未发现可播放的音频文件');
  for(const t of items){if(t.cover)await metadata.save(t.id,{cover:t.cover});const m=await parseFile(t.localPath!).catch(()=>null),embedded=m?.common.lyrics?.find(l=>l.syncText?.length||l.text);if(embedded){const lines=embedded.syncText?.filter(l=>l.timestamp!==undefined).map(l=>({time:l.timestamp!/1000,text:l.text}))??parseLrc(embedded.text??'');if(lines.length)await metadata.save(t.id,{lyrics:lines});}}
  store.data.library.local=uniqueTracks([...store.data.library.local,...items]);store.save();window.webContents.send('music:library',structuredClone(store.data.library));return items.map(t=>store.data.library.local.find(v=>v.id===t.id||v.localPath?.toLowerCase()===t.localPath?.toLowerCase())!);
}
async function enrichLocal(t:Track):Promise<Track>{
  if(!t.localPath||store.data.settings.offline)return t;
  const pending=localMatches.get(t.id);if(pending)return pending;
  const task=(async()=>{
    if(!t.onlineId){const result=await provider.search([t.name,t.artist==='未知歌手'?'':t.artist].filter(Boolean).join(' '));const match=chooseLocalMatch(t,result.tracks);if(!match)return t;t.onlineId=match.id;t.artistId=match.artistId;t.albumId=match.albumId;t.hasMv=match.hasMv;if(!t.album)t.album=match.album;if(!t.cover)t.cover=match.cover;}
    const [cover]=await Promise.all([metadata.cover(t).catch(()=>t.cover),metadata.lyrics(t).catch(()=>[])]);if(cover)t.cover=cover;store.save();window.webContents.send('music:library',structuredClone(store.data.library));return structuredClone(t);
  })();localMatches.set(t.id,task);try{return await task;}finally{localMatches.delete(t.id);}
}
function registerIpc(){
  const scopeOf=(value:unknown):LibraryScope=>{if(!['local','favorites','playlist'].includes(value as string))throw Error('无效的资料类型');return value as LibraryScope;};
  handle('artist',(id,tab,p)=>artistPage(provider,text(id,30),tab,integer(p,0,1000)));
  handle('libraryAction',async(scope,id,action,ids,value)=>{
    const target=scopeOf(scope);id=text(id??'',100);if(!Array.isArray(ids)||ids.length>10000||ids.some(v=>typeof v!=='string'||v.length>100))throw Error('无效的歌曲选择');
    const list=libraryList(store.data.library,target,id);
    if(action==='locate'){const t=list.find(t=>ids.includes(t.id));if(!t?.localPath)throw Error('请选择本地文件');shell.showItemInFolder(t.localPath);return {library:structuredClone(store.data.library)};}
    if(action==='check'){let missing=0;for(const t of list){if(t.localPath){t.missing=!(await fsp.access(t.localPath).then(()=>true,()=>false));if(t.missing)missing++;}}store.save();return {library:structuredClone(store.data.library),message:missing?`${missing} 首文件已失效，可在筛选中查看`:'文件检查完成，均可访问'};}
    changeLibrary(store.data.library,target,id,text(action,30),ids,text(value??'',100));store.save();return {library:structuredClone(store.data.library),message:action==='remove'?'已从列表移除':'已更新'};
  });
  handle('libraryImport',async(scope,id,kind)=>{
    const target=scopeOf(scope);id=text(id??'',100);if(!['files','folder','list'].includes(kind))throw Error('无效的导入方式');
    const r=await dialog.showOpenDialog(window,{title:kind==='folder'?'导入音乐目录':kind==='list'?'导入歌单':'导入音频',properties:kind==='folder'?['openDirectory']:['openFile',...(kind==='files'?['multiSelections' as const]:[])],filters:kind==='list'?[{name:'歌单文件',extensions:['json','m3u8','m3u']}]:[{name:'音频',extensions:['mp3','flac','wav','aac','m4a','ogg','opus','aiff','aif','alac']}]});
    if(r.canceled)return {library:structuredClone(store.data.library)};
    let tracks:Track[]=[],name='导入的歌单',skipped=0;
    if(kind==='list'){const result=await importLibraryFile(r.filePaths[0]);tracks=result.tracks;name=result.name;skipped=result.skipped;store.data.library.local=uniqueTracks([...store.data.library.local,...tracks.filter(t=>t.localPath)]);}
    else{const files=kind==='folder'?await scanAudioFolder(r.filePaths[0]):r.filePaths;for(let i=0;i<files.length;i+=500)tracks.push(...await importFiles(files.slice(i,i+500)));}
    if(target==='playlist'&&!id)createImportedPlaylist(store.data.library,name,tracks);else{const list=libraryList(store.data.library,target,id);list.splice(0,list.length,...uniqueTracks([...list,...(target==='local'?tracks.filter(t=>t.localPath):tracks)]));}
    const added=target==='local'?tracks.filter(t=>t.localPath).length:tracks.length;if(target==='local')skipped+=tracks.length-added;store.save();return {library:structuredClone(store.data.library),message:`导入 ${added} 首${skipped?`，跳过 ${skipped} 个无效或重复条目`:''}`};
  });
  handle('libraryExport',async(scope,id,format)=>{
    const target=scopeOf(scope);id=text(id??'',100);if(!['json','m3u8'].includes(format))throw Error('无效的导出格式');const tracks=libraryList(store.data.library,target,id),name=target==='local'?'本地音乐':target==='favorites'?'我喜欢':store.data.library.playlists.find(p=>p.id===id)!.name;
    const r=await dialog.showSaveDialog(window,{title:'导出歌单',defaultPath:name.replace(/[<>:"/\\|?*]/g,'_')+'.'+format,filters:[{name:format==='json'?'无我音乐歌单':'M3U8 本地播放列表',extensions:[format]}]});if(r.canceled||!r.filePath)return null;await fsp.writeFile(r.filePath,exportLibrary(name,tracks,format),'utf8');return r.filePath;
  });
  handle('queueState',async items=>{const file=path.join(app.getPath('userData'),'queue.json');if(items!==undefined){if(!Array.isArray(items)||items.length>5000)throw Error('队列过长');const list=uniqueTracks(items.map(track));await fsp.writeFile(file,JSON.stringify(list),'utf8');return list;}try{const saved=JSON.parse(await fsp.readFile(file,'utf8'));if(!Array.isArray(saved))return [];return uniqueTracks(saved.slice(0,5000).flatMap(value=>{try{return [track(value)];}catch{return [];} }));}catch{return [];}});
  handle('saveQueue',(name,items)=>{name=text(name,100).trim();if(!name)throw Error('请输入歌单名称');if(!Array.isArray(items)||!items.length||items.length>5000)throw Error('请选择 1–5000 首歌曲');if(store.data.library.playlists.length>=100)throw Error('最多创建 100 个歌单');createImportedPlaylist(store.data.library,name,uniqueTracks(items.map(track)));store.save();return structuredClone(store.data.library);});
  handle('snapshot',()=>({...store.snapshot(),themeDark:nativeTheme.shouldUseDarkColors}));
  handle('comments',(value,sort,page,force,source)=>comments.get(track(value),sort,integer(page,1),store.data.settings.commentPreference??'auto',force===true,source));
  handle('commentSources',(value,force)=>comments.inspect(track(value),force===true));
  handle('publishLyrics',frame=>desktopLyrics.publish(frame));
  handle('search',(q,p)=>provider.search(text(q),integer(p)));
  handle('home',page=>provider.home(integer(page,0,1000)));
  handle('searchCatalog',(q,kind,p)=>{if(!['all','music','playlist','artist','album','lyrics'].includes(kind))throw Error('无效的搜索分类');return discovery.search(text(q),kind,integer(p));});
  handle('playlistTags',()=>discovery.tags());
  handle('discoverPlaylists',(page,order,tag)=>{if(!['hot','new'].includes(order))throw Error('无效的排序');if(tag!==undefined&&!/^\d{1,20}$/.test(tag))throw Error('无效的歌单分类');return discovery.playlists(integer(page,0,1000),order,tag);});
  handle('mv',async value=>{if(value?.localPath){const task=store.data.tasks.find(t=>t.media==='mv'&&t.status==='completed'&&t.track.id===value.id&&t.path===value.localPath);if(!task){const local=track(value);if(!local.onlineId)throw Error('本地歌曲尚未匹配 MV');const source=await discovery.mv({...local,id:local.onlineId,localPath:undefined});return {...source,url:mediaToken({url:source.url})};}await fsp.access(task.path!);return {url:mediaToken({file:task.path}),quality:task.videoQuality??'MP4',bitrate:task.videoBitrate??0,local:true};}const t=track(value);if(t.localPath||!/^\d+$/.test(t.id))throw Error('本地歌曲暂无 MV');const source=await discovery.mv(t);return {...source,url:mediaToken({url:source.url})};});
  handle('searchHints',q=>nativeCatalog.hints(text(q)));
  handle('rankPeriods',id=>nativeCatalog.periods(text(id,30)));
  handle('collection',(id,kind,p,period)=>{if(!['playlist','rank','album','artist'].includes(kind))throw new Error('无效的列表类型');return kind==='rank'&&period?nativeCatalog.contents(text(id,30),text(period,30),integer(p)):provider.collection(text(id,30),kind,integer(p));});
  handle('lyrics',(id,force)=>metadata.lyrics(knownTrack(id),force===true));
  handle('importLyrics',async id=>{const t=knownTrack(id);const r=await dialog.showOpenDialog(window,{title:'选择 LRC 歌词',properties:['openFile'],filters:[{name:'同步歌词',extensions:['lrc']}]});if(r.canceled)return null;return metadata.importFile(t.id,r.filePaths[0]);});
  handle('hifiDevices',()=>hifi.devices());
  const cancelPlay=async()=>{playTicket++;playAbort?.abort(new DOMException('播放已取消','AbortError'));playAbort=undefined;await hifi.control('stop');};
  handle('cancelPlay',cancelPlay);
  handle('playbackEvent',(event,id)=>{if(!['started','startup-retry','stall-retry','failed','cancelled'].includes(event))throw Error('无效的播放事件');playbackLog.write(event,{id:text(id,100)});});
  handle('hifiControl',async(action,position)=>{if(!['pause','resume','seek','stop'].includes(action))throw Error('无效的播放控制');if(action==='stop')return cancelPlay();await hifi.control(action,position);});
  handle('enrichLocal',value=>enrichLocal(track(value)));
  handle('play',async(value,q)=>{
    const t=track(value),preferred=quality(q),ticket=++playTicket,start=Date.now();playAbort?.abort(new DOMException('已切换歌曲','AbortError'));const control=new AbortController();playAbort=control;
    playbackLog.write('prepare',{id:t.id,quality:preferred,engine:store.data.settings.audioOutput??'normal'});
    const stop=()=>{if(ticket===playTicket)void hifi.control('stop').catch(()=>{});};control.signal.addEventListener('abort',stop,{once:true});
    try{return await bounded(async signal=>{
      await hifi.control('stop');signal.throwIfAborted();let result:any,source:MediaSource;
      if(t.localPath){await fsp.access(t.localPath);const info=await bounded(()=>inspectFile(t.localPath!),5000,'本地文件读取超时',signal);if(!info.sampleRate)throw Error('该文件不是可识别的音频');t.audioInfo=info;t.duration=info.duration||t.duration;store.save();source={file:t.localPath,signal:control.signal};result={...info,trial:false,quality:/flac|alac|wav|aiff|pcm/i.test(info.format??info.codec??'')?'flac':(info.bitrate??0)>=280?'320k':'128k',cover:t.cover,track:t};}
      else{
        const resolved=await provider.resolveBest(t,preferred,'play',signal);playbackLog.write('resolved',{id:t.id,quality:resolved.quality,host:new URL(resolved.url).host,ms:Date.now()-start});
        const info=await inspectStream(resolved.url,fetchNetwork,signal).catch(e=>{signal.throwIfAborted();playbackLog.write('metadata-unavailable',{id:t.id,error:String(e).slice(0,180)});return {} as AudioInfo;});signal.throwIfAborted();
        if(info.duration&&t.duration>info.duration+8)throw Error('音源仅为试听片段，无法完整播放');
        let refreshing:Promise<string>|undefined;
        source={url:resolved.url,signal:control.signal,refresh:()=>{
          if(!refreshing)refreshing=(async()=>{control.signal.throwIfAborted();const next=await provider.resolve(t,resolved.quality,'play',control.signal);if(next.trial||next.format!==resolved.format)throw Error('刷新音源的格式或完整性不匹配');playbackLog.write('source-refreshed',{id:t.id,host:new URL(next.url).host});return next.url;})().finally(()=>{refreshing=undefined;});return refreshing;
        }};
        result={...resolved,...info,bitrate:info.bitrate??(resolved.format==='flac'?undefined:resolved.bitrate)};
      }
      signal.throwIfAborted();if(ticket!==playTicket)throw Error('播放已取消');
      if(store.data.settings.audioOutput==='hifi'){
        const target=source.file??await bridge.source(source as RemoteMedia);signal.throwIfAborted();
        await hifi.setMuted(Boolean(store.data.settings.muted));const generation=await hifi.play(target,store.data.settings.audioDevice??'auto',result.bitsPerSample);signal.throwIfAborted();if(ticket!==playTicket)throw Error('播放已取消');playbackLog.write('prepared',{id:t.id,engine:'hifi',ms:Date.now()-start});return {...result,url:'',engine:'hifi',generation};
      }
      playbackLog.write('prepared',{id:t.id,engine:'browser',ms:Date.now()-start});return {...result,url:mediaToken(source),engine:'browser'};
    },35000,'播放准备超时，请重试',control.signal);
    }catch(e){if(ticket===playTicket)control.abort(e);playbackLog.write('prepare-failed',{id:t.id,ms:Date.now()-start,error:String(e).replace(/https?:\/\/\S+/g,'[url]').slice(0,200)});throw e;}
  });
  handle('downloadMv',value=>{const t=track(value);if(t.localPath){if(!t.onlineId)throw Error('本地歌曲尚未匹配 MV');return downloads.enqueue([{...t,id:t.onlineId,localPath:undefined}],'128k','mv');}return downloads.enqueue([t],'128k','mv');});
  handle('download',(values,q)=>{if(!Array.isArray(values)||values.length>500)throw new Error('每批最多下载 500 首');return downloads.enqueue(values.map(track),quality(q));});
  handle('qualities',async(value,purpose='download')=>{if(!['play','download'].includes(purpose))throw Error('无效的音质用途');const t=track(value);return Promise.all((['128k','320k','flac']as const).map(async q=>{try{const a=await provider.resolve(t,q,purpose);return {quality:q,available:!a.trial,format:a.format,bitrate:a.bitrate};}catch(e){return {quality:q,available:false,error:(e as Error).message};}}));});
  handle('downloadAction',async(id,action)=>{text(id,100);if(action==='reveal'){const t=store.data.tasks.find(t=>t.id===id);if(t?.path)shell.showItemInFolder(t.path);return;}if(!['pause','resume','cancel','retry'].includes(action))throw new Error('无效的下载操作');await downloads.action(id,action);});
  handle('chooseDirectory',async()=>{const r=await dialog.showOpenDialog(window,{title:'选择下载目录',defaultPath:store.data.settings.downloadDir,properties:['openDirectory','createDirectory']});if(r.canceled)return null;const dir=r.filePaths[0];await fsp.access(dir,fs.constants.W_OK);store.data.settings.downloadDir=dir;store.save();return dir;});
  handle('updateSettings',async(patch:Partial<Settings>)=>{if(!patch||typeof patch!=='object')throw new Error('无效的设置');const nextProxy=patch.proxyMode===undefined?undefined:proxyMode(patch.proxyMode);const s=store.data.settings;
    if(patch.quality!==undefined)s.quality=quality(patch.quality);
    if(patch.theme!==undefined){s.theme=themeSource(patch.theme);nativeTheme.themeSource=s.theme;}
    if(patch.textSize!==undefined){if(!['standard','large','larger'].includes(patch.textSize))throw Error('无效的文字大小');s.textSize=patch.textSize;}
    if(patch.autoHotComments!==undefined){if(typeof patch.autoHotComments!=='boolean')throw Error('无效的轮播设置');s.autoHotComments=patch.autoHotComments;}
    if(patch.concurrency!==undefined){if(!Number.isInteger(patch.concurrency)||patch.concurrency<1||patch.concurrency>6)throw new Error('并发数量应为 1–6');s.concurrency=patch.concurrency;}
    if(patch.muted!==undefined){if(typeof patch.muted!=='boolean')throw Error('无效的静音设置');await hifi.setMuted(patch.muted);s.muted=patch.muted;}
    if(patch.volume!==undefined){if(!Number.isFinite(patch.volume)||patch.volume<0||patch.volume>1)throw new Error('无效的音量');s.volume=patch.volume;}
    if(patch.zoom!==undefined){if(![0.75,1,1.25,1.5].includes(patch.zoom))throw new Error('无效的显示比例');s.zoom=patch.zoom;window.webContents.setZoomFactor(s.zoom);}
    if(patch.audioOutput!==undefined){if(!['normal','hifi'].includes(patch.audioOutput))throw Error('无效的输出模式');s.audioOutput=patch.audioOutput;}
    if(patch.audioDevice!==undefined){if(typeof patch.audioDevice!=='string'||(patch.audioDevice!=='auto'&&!/^wasapi\/[\w{}.-]+$/.test(patch.audioDevice)))throw Error('无效的音频设备');s.audioDevice=patch.audioDevice;}
    if(patch.offline!==undefined){if(typeof patch.offline!=='boolean')throw new Error('无效的离线设置');s.offline=patch.offline;if(s.offline){void hifi.stopRemote();}if(s.offline)for(const t of store.data.tasks.filter(t=>['queued','resolving','downloading'].includes(t.status)))void downloads.action(t.id,'pause');}
    if(patch.commentPreference!==undefined){if(!['auto','netease','qq','kuwo'].includes(patch.commentPreference))throw Error('无效的评论来源');s.commentPreference=patch.commentPreference;}
    if(patch.vocalMode!==undefined){if(!['original','accompaniment','vocal'].includes(patch.vocalMode))throw Error('无效的音效');if(s.audioOutput==='hifi'&&patch.vocalMode!=='original')throw Error('HiFi 独占模式保持原音，请切换标准输出后使用音效');s.vocalMode=patch.vocalMode;}
    if(patch.audioOutput==='hifi'){s.vocalMode='original';s.vocalBalance=0;s.playbackRate=1;s.pitchSemitones=0;}
    for(const [key,min,max]of [['vocalBalance',-1,1],['pitchSemitones',-12,12]]as const)if(patch[key]!==undefined){if(!Number.isFinite(patch[key])||patch[key]<min||patch[key]>max||key==='pitchSemitones'&&!Number.isInteger(patch[key]))throw Error('无效的音效参数');if(s.audioOutput==='hifi'&&patch[key]!==0)throw Error('HiFi 独占保持原音');s[key]=patch[key];}
    if(patch.playbackRate!==undefined){if(!Number.isFinite(patch.playbackRate)||patch.playbackRate<.5||patch.playbackRate>2)throw new Error('无效的播放速度');if(s.audioOutput==='hifi'&&patch.playbackRate!==1)throw Error('HiFi 独占保持原速');s.playbackRate=patch.playbackRate;}
    if(patch.lyricOffset!==undefined){if(!Number.isFinite(patch.lyricOffset)||Math.abs(patch.lyricOffset)>30)throw new Error('歌词偏移应在 30 秒以内');s.lyricOffset=patch.lyricOffset;}
    if(patch.lyricFontSize!==undefined){if(![14,16,18,20,22,24].includes(patch.lyricFontSize))throw new Error('无效的歌词字号');s.lyricFontSize=patch.lyricFontSize;}
    if(patch.coverMode!==undefined){if(!['record','square'].includes(patch.coverMode))throw new Error('无效的封面模式');s.coverMode=patch.coverMode;}
    for(const key of ['saveLyrics','saveCover'] as const)if(patch[key]!==undefined){if(typeof patch[key]!=='boolean')throw new Error('无效的保存设置');s[key]=patch[key];}
    if(nextProxy!==undefined){await network.apply(nextProxy);s.proxyMode=nextProxy;}
    store.save();downloads.pump();return {...s};});
  handle('importDropped',files=>importFiles(files));
  handle('importMusic',async()=>{const r=await dialog.showOpenDialog(window,{title:'导入本地音乐',properties:['openFile','multiSelections'],filters:[{name:'音频文件',extensions:['mp3','aac','flac','wav','m4a','ogg','opus','aiff','aif','alac']}]});return r.canceled?[]:importFiles(r.filePaths);});
  handle('favorite',(value)=>{const t=track(value),list=store.data.library.favorites;const at=list.findIndex(x=>x.id===t.id);if(at>=0)list.splice(at,1);else list.unshift(t);store.save();return structuredClone(store.data.library);});
  handle('history',(value)=>{const t=track(value);store.data.library.history=[t,...store.data.library.history.filter(x=>x.id!==t.id)].slice(0,300);store.save();return structuredClone(store.data.library);});
  handle('playlist',(action,nameOrId,value)=>{text(nameOrId,100);const lists=store.data.library.playlists;
    if(action==='create'){const name=nameOrId.trim();if(!name)throw new Error('请输入歌单名称');if(lists.length>=100)throw new Error('最多创建 100 个本地歌单');lists.push({id:randomUUID(),name,tracks:[]});}
    else{const pl=lists.find(p=>p.id===nameOrId);if(!pl)throw new Error('歌单不存在');if(action==='delete')lists.splice(lists.indexOf(pl),1);else if(action==='add'){const t=track(value);if(!pl.tracks.some(x=>x.id===t.id))pl.tracks.push(t);}else if(action==='remove'){pl.tracks=pl.tracks.filter(t=>t.id!==track(value).id);}else throw new Error('无效的歌单操作');}
    store.save();return structuredClone(store.data.library);});
  handle('openDirectory',async()=>{await fsp.mkdir(store.data.settings.downloadDir,{recursive:true});const error=await shell.openPath(store.data.settings.downloadDir);if(error)throw new Error(error);});
  handle('window',action=>{if(action==='minimize')window.minimize();else if(action==='maximize'){if(window.isMaximized())window.unmaximize();else window.maximize();}else if(action==='close')window.close();else throw new Error('无效的窗口操作');});
}

app.setName('KuwoMusicDesktop');
const lock=app.requestSingleInstanceLock();
if(!lock)app.quit();
else {
  app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();}});
  app.whenReady().then(async()=>{
    store=new Store(path.join(app.getPath('userData'),'state.json'),app.getPath('music'));
    network=new NetworkPolicy(session.defaultSession);
    await network.apply(store.data.settings.proxyMode);
    nativeTheme.themeSource=themeSource(store.data.settings.theme??'system');
    nativeTheme.on('updated',()=>{if(window&&!window.isDestroyed()){window.setBackgroundColor(nativeTheme.shouldUseDarkColors?'#1b1c1f':'#fcfbf7');window.webContents.send('music:theme',nativeTheme.shouldUseDarkColors);}});
    artwork=new ArtworkCache(path.join(app.getPath('userData'),'artwork'),fetchNetwork,()=>Boolean(store.data.settings.offline));
    avatars=new ArtworkCache(path.join(app.getPath('userData'),'avatars'),fetchNetwork,()=>Boolean(store.data.settings.offline),true);
    commentImages=new ArtworkCache(path.join(app.getPath('userData'),'comment-images'),fetchNetwork,()=>Boolean(store.data.settings.offline),false,true);
    metadata=new MetadataCache(path.join(app.getPath('userData'),'metadata'),provider,()=>Boolean(store.data.settings.offline));
    downloads=new DownloadManager(store,provider,fetchNetwork,tasks=>{if(window&&!window.isDestroyed())window.webContents.send('music:tasks',tasks);for(const t of tasks)if(t.status==='completed'){const original=store.data.tasks.find(x=>x.id===t.id);if(original)void enrichDownload(original);}},t=>discovery.mv(t));
    await registerMedia();registerIpc();
    session.defaultSession.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
    session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:Boolean(store.data.settings.offline)}));
    window=new BrowserWindow({title:'无我音乐',width:1280,height:850,minWidth:860,minHeight:620,frame:false,backgroundColor:nativeTheme.shouldUseDarkColors?'#1b1c1f':'#fcfbf7',icon:path.join(appDir,'dist/icon.png'),show:false,webPreferences:{preload:path.join(appDir,'dist-electron/preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
    const invisible=()=>window.webContents.send('music:visibility',false),visible=()=>window.webContents.send('music:visibility',true);
    window.on('minimize',invisible);window.on('hide',invisible);window.on('restore',visible);window.on('show',visible);
    window.on('closed',()=>{desktopLyrics?.dispose();app.quit();});
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    window.webContents.on('will-navigate',e=>e.preventDefault());
    window.once('ready-to-show',()=>{window.webContents.setZoomFactor(store.data.settings.zoom);window.showInactive();});
    desktopLyrics=new DesktopLyricsController({entry:path.join(appDir,'dist/index.html'),preload:path.join(appDir,'dist-electron/preload.cjs'),directory:app.getPath('userData'),icon:path.join(appDir,'dist/icon.png'),onReveal:()=>{window.show();window.focus();},enabled:store.data.settings.desktopLyrics===true,onEnabled:enabled=>{store.data.settings.desktopLyrics=enabled;store.save();},onCommand:(action,value)=>window.webContents.send('music:playerCommand',action,value)});
    ipcMain.handle('music:desktopLyrics',(event,action,value)=>{if(event.senderFrame!==event.sender.mainFrame||(event.sender!==window.webContents&&!desktopLyrics.owns(event.sender)))throw Error('无效的调用来源');return desktopLyrics.action(action,value);});
    await window.loadFile(path.join(appDir,'dist/index.html'));
    if(store.data.settings.desktopLyrics)await desktopLyrics.action('toggle');
    for(const t of store.data.tasks.filter(t=>t.status==='completed').slice(0,30))void enrichDownload(t);
  }).catch(e=>{dialog.showErrorBox('无我音乐启动失败',String(e));app.exit(1);});
  let quitting=false;
  app.on('before-quit',event=>{if(quitting||!downloads)return;event.preventDefault();quitting=true;desktopLyrics?.dispose();bridge.close();void Promise.allSettled([downloads.shutdown(),hifi.dispose()]).finally(()=>app.quit());});
  app.on('window-all-closed',()=>app.quit());
}
