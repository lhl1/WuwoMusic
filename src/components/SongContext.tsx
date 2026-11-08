import {useEffect,useState} from 'react';
import {Play,RefreshCw} from 'lucide-react';
import type {AudioInfo,Track} from '../shared';
import {Cover} from './Cover';
export function SongInformation({track,info}:{track:Track|null;info:AudioInfo}){
 if(!track)return null;
 const rows=[['歌手',track.artist],['专辑',track.album],['时长',`${Math.floor(track.duration/60)}:${String(Math.floor(track.duration%60)).padStart(2,'0')}`],['格式',info.codec||info.format],['采样率',info.sampleRate?info.sampleRate+' Hz':undefined],['位深',info.bitsPerSample?info.bitsPerSample+' bit':undefined],['声道',info.channels?String(info.channels):undefined],['来源',track.localPath?'本地文件':'酷我音乐']];
 return <div className="song-information"><dl>{rows.filter(([,value])=>value).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>{track.catalogTags?.length?<div className="song-context-tags">{track.catalogTags.map(tag=><span key={tag}>{tag}</span>)}</div>:null}<p>参数来自当前音频；切换音质后以实际播放文件为准。</p></div>;
}
export function SameArtist({track,onPlay}:{track:Track|null;onPlay:(t:Track)=>void}){
 const [items,setItems]=useState<Track[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{let live=true;setItems([]);setError('');if(!track?.artistId)return;setLoading(true);window.desktop.artist(track.artistId,'music',0).then(p=>{if(live)setItems(p.tracks.filter(t=>t.id!==track.id).slice(0,12));}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[track?.id,track?.artistId,revision]);
 return <div className="same-artist">{items.map(t=><button key={t.id} onClick={()=>onPlay(t)}><Cover src={t.cover} id={t.id} name={t.name}/><span><b>{t.name}</b><small>{t.album||t.artist}</small></span><Play size={15}/></button>)}{error?<div className="comment-status"><p>{error}</p><button className="secondary" onClick={()=>setRevision(n=>n+1)}><RefreshCw size={14}/>重试</button></div>:!items.length?<div className="comment-status">{loading?'正在寻找音乐…':track?.artistId?'暂无更多歌曲':'尚无对应的歌手资料'}</div>:null}</div>;
}
