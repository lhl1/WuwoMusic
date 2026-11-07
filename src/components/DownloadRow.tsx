import {Check,FolderOpen,Pause,Play,RotateCcw,X} from 'lucide-react';
import type {DownloadTask} from '../shared';
import {Cover} from './Cover';

function bytes(n:number){return n<1024?`${Math.round(n)} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(1)} MB`;}
export function DownloadRow({task:t,index,action,play}:{task:DownloadTask;index:number;action:(a:'pause'|'resume'|'cancel'|'retry'|'reveal')=>void;play:()=>void}){
 const running=['queued','resolving','downloading'].includes(t.status),complete=t.status==='completed';
 const status={queued:'等待中',resolving:'解析中',downloading:'下载中',paused:'已暂停',completed:'已完成',failed:'失败',cancelled:'已取消'}[t.status];
 const progress=complete?100:t.total?Math.min(100,t.received/t.total*100):0;
 const quality=t.media==='mv'?(t.videoQuality||'MV'):t.quality==='flac'?'无损':t.quality==='320k'?'320K':'128K';
 const button=(label:string,callback:()=>void,icon:React.ReactNode)=><button className="icon-button" title={label} aria-label={`${label} ${t.track.name}`} onClick={callback}>{icon}</button>;
 return <div className={`transfer-row transfer-${t.status}`} role="row">
  <span className="transfer-index" role="cell">{String(index+1).padStart(2,'0')}</span>
  <div className="transfer-song" role="cell"><button className="transfer-cover" aria-label={`播放已下载的 ${t.track.name}`} disabled={!complete} onClick={play}><Cover src={t.track.cover} id={t.track.id} name={t.track.name}/>{complete?<span><Play size={17} fill="currentColor"/></span>:null}</button><div><button className="transfer-title" disabled={!complete} onClick={play} title={t.track.name}>{t.track.name}</button><p>{t.track.artist}</p></div></div>
  <span className="transfer-artist ellipsis" role="cell" title={t.track.artist}>{t.track.artist}</span>
  <span className="transfer-format" role="cell"><span className="audio-badge">{quality}</span></span>
  <div className="transfer-state" role="cell"><div className="transfer-state-label"><span>{complete?<Check size={12}/>:null}{status}</span>{t.status==='downloading'?<small>{bytes(t.speed)}/s</small>:null}</div>{!complete&&t.status!=='failed'&&t.status!=='cancelled'?<div className="transfer-progress" role="progressbar" aria-label={`${t.track.name} 下载进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><i style={{width:`${progress}%`}}/></div>:null}<small className="transfer-size">{t.received?bytes(t.received):'—'}{t.total&&t.received!==t.total?` / ${bytes(t.total)}`:''}</small>{t.error?<p className="transfer-error" title={t.error}>{t.error}</p>:null}</div>
  <div className="transfer-actions" role="cell">{running?button('暂停下载',()=>action('pause'),<Pause size={16}/>):null}{t.status==='paused'?button('继续下载',()=>action('resume'),<Play size={16}/>):null}{t.status==='failed'||t.status==='cancelled'?button('重试下载',()=>action('retry'),<RotateCcw size={16}/>):null}{complete?<>{button('播放',play,<Play size={16}/>)}{button('打开文件位置',()=>action('reveal'),<FolderOpen size={16}/>)}</>:button('取消下载',()=>action('cancel'),<X size={16}/>)}</div>
 </div>;
}
