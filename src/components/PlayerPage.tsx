import {ArrowDownToLine,ChevronDown,Disc3,Heart,Square,MessageCircle,Clapperboard} from 'lucide-react';
import type {LyricLine,Settings,Track} from '../shared';
import {Cover} from './Cover';
import {Lyrics} from './Lyrics';
import {CommentsPanel} from './Comments';

export function PlayerPage({commentsOpen,onCloseComments,current,playing,lines,position,duration,loading,error,settings,isFavorite,onSettings,onSeek,onRetry,onImport,onBack,onFavorite,onDownload,onComments,onMv}:{commentsOpen:boolean;onCloseComments:()=>void;current:Track|null;playing:boolean;lines:LyricLine[];position:number;duration:number;loading:boolean;error:string;settings?:Settings;isFavorite:boolean;onSettings:(patch:Partial<Settings>)=>void;onSeek:(n:number)=>void;onRetry:()=>void;onImport:()=>void;onBack:()=>void;onFavorite:()=>void;onDownload:()=>void;onComments:()=>void;onMv:()=>void}){
 const square=settings?.coverMode==='square';
 return <div className="full-player refined-player"><div className="player-ambience" aria-hidden="true"><Cover src={current?.cover} id={current?.id} name={current?.name} large/></div><button className="icon-button player-back" aria-label="收起播放页" title="收起" onClick={onBack}><ChevronDown size={21}/></button>
  {!commentsOpen?<button className="icon-button cover-mode-toggle" title={square?'唱片封面':'方形封面'} aria-label={square?'切换唱片封面':'切换方形封面'} onClick={()=>onSettings({coverMode:square?'record':'square'})}>{square?<Disc3 size={18}/>:<Square size={18}/>}</button>:null}
  <div className={`album-stage ${commentsOpen?'showing-comments':''}`}><div className="album-visual"><div className={square?'square-album':`big-record ${playing?'rotating':''}`}><div className={square?'square-album-label':'big-record-label'}><Cover src={current?.cover} id={current?.id} name={current?.name} large/></div></div>
   </div>{!commentsOpen?<div className="album-info"><h1>{current?.name??'无我音乐'}</h1><p>{current?.artist??''}</p>{current?.album?<p className="player-album-name">{current.album}</p>:null}<div className="album-actions"><button className={`icon-button ${isFavorite?'active':''}`} aria-label={isFavorite?'取消喜欢':'喜欢'} title="喜欢" disabled={!current} onClick={onFavorite}><Heart size={19} fill={isFavorite?'currentColor':'none'}/></button><button className="icon-button" aria-label="下载当前歌曲" title="下载" disabled={!current||Boolean(current.localPath)} onClick={onDownload}><ArrowDownToLine size={19}/></button><button className="icon-button" aria-label="查看全部评论" title="评论" disabled={!current} onClick={onComments}><MessageCircle size={19}/></button>{current?.hasMv?<button className="icon-button" aria-label="观看 MV" title="MV" onClick={onMv}><Clapperboard size={19}/></button>:null}</div></div>:null}
   {commentsOpen&&current?<CommentsPanel key={current.id} inline track={current} offline={Boolean(settings?.offline)} playing={playing} automatic={Boolean(settings?.autoHotComments)} onAutomatic={value=>onSettings({autoHotComments:value})} onClose={onCloseComments}/>:null}
  </div>
  <Lyrics lines={lines} position={position} loading={loading} error={error} settings={settings} onSettings={onSettings} onSeek={n=>{if(n<=duration)onSeek(n);}} onRetry={onRetry} onImport={onImport} disabled={!current}/>
 </div>;
}
