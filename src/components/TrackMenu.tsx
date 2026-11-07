import {useEffect} from 'react';
import {ArrowDownToLine,Heart,ListEnd,ListMusic,Play,Plus,MessageCircle,Clapperboard} from 'lucide-react';
import type {Track} from '../shared';
export interface TrackMenuState {track:Track;x:number;y:number}
export function TrackMenu({state,favorite,onClose,onPlay,onNext,onQueue,onDownload,onPlaylist,onComments,onMv}:{state:TrackMenuState;favorite:boolean;onClose:()=>void;onPlay:()=>void;onNext:()=>void;onQueue:()=>void;onDownload:()=>void;onPlaylist:()=>void;onComments:()=>void;onMv:()=>void}){
 useEffect(()=>{const close=()=>onClose();const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key);};},[onClose]);
 const actions=[[Play,'播放',onPlay],[ListEnd,'下一首播放',onNext],[ListMusic,'加入播放队列',onQueue],[MessageCircle,'查看评论',onComments],[ArrowDownToLine,'下载 / 选择音质',onDownload],[Plus,'添加到歌单',onPlaylist]]as const;
 return <div className="track-context-menu" role="menu" aria-label={`${state.track.name} 的歌曲菜单`} style={{left:Math.max(8,Math.min(state.x,window.innerWidth-230)),top:Math.max(8,Math.min(state.y,window.innerHeight-310)),maxHeight:'calc(100vh - 16px)',overflowY:'auto'}} onPointerDown={e=>e.stopPropagation()}>
  <p>{state.track.name}<span>{state.track.artist}</span></p>{actions.map(([Icon,label,action])=><button key={label} role="menuitem" disabled={label.startsWith('下载')&&Boolean(state.track.localPath)} onClick={()=>{action();onClose();}}><Icon size={15}/>{label}</button>)}{state.track.hasMv?<button role="menuitem" onClick={()=>{onMv();onClose();}}><Clapperboard size={15}/>观看 MV</button>:null}
 </div>;
}
