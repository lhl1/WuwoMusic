import {useEffect,useState,type CSSProperties} from 'react';
import {Lock,Unlock,Minus,Plus,Pause,Play,SkipBack,SkipForward,X,Move,Contrast} from 'lucide-react';
import type {DesktopLyricState} from '../shared';
export function DesktopLyrics(){
 const [state,setState]=useState<DesktopLyricState|null>(null),[error,setError]=useState('');
 useEffect(()=>{document.title='无我音乐 · 桌面歌词';document.documentElement.classList.add('desktop-lyrics-root');void window.desktop.desktopLyrics('state').then(setState);return window.desktop.onDesktopLyrics(setState);},[]);
 async function action(a:Parameters<typeof window.desktop.desktopLyrics>[0],v?:number){try{setState(await window.desktop.desktopLyrics(a,v));setError('');}catch(e){setError((e as Error).message);}}
 if(!state)return null;const f=state.frame;
 return <div className={`desktop-lyric-window ${state.locked?'locked':''}`} style={{'--desktop-lyric-size':state.fontSize+'px','--desktop-opacity':state.opacity} as CSSProperties}>
  <div className="desktop-lyric-tools"><span className="desktop-drag-handle" title={state.locked?'位置已锁定':'拖动移动桌面歌词'}><Move size={14}/></span><span className="desktop-song ellipsis">{f.title} {f.artist?'· '+f.artist:''}</span>
   <button title="上一首" aria-label="桌面歌词上一首" onClick={()=>void action('previous')}><SkipBack size={15}/></button><button title={f.playing?'暂停':'播放'} aria-label="桌面歌词播放暂停" onClick={()=>void action('play')}>{f.playing?<Pause size={15}/>:<Play size={15}/>}</button><button title="下一首" aria-label="桌面歌词下一首" onClick={()=>void action('next')}><SkipForward size={15}/></button>
   <button title="缩小字号" aria-label="缩小桌面歌词" disabled={state.fontSize<=24} onClick={()=>void action('font',state.fontSize-6)}><Minus size={14}/></button><button title="放大字号" aria-label="放大桌面歌词" disabled={state.fontSize>=42} onClick={()=>void action('font',state.fontSize+6)}><Plus size={14}/></button>
   <button title="切换背景透明度" aria-label="桌面歌词透明度" onClick={()=>void action('opacity',[.6,.8,.92,1][([.6,.8,.92,1].indexOf(state.opacity)+1)%4])}><Contrast size={14}/></button><button title={state.locked?'解锁位置':'锁定位置（保留操作按钮）'} aria-label="锁定桌面歌词位置" aria-pressed={state.locked} onClick={()=>void action('lock')}>{state.locked?<Lock size={14}/>:<Unlock size={14}/>}</button><button title="关闭桌面歌词" aria-label="关闭桌面歌词" onClick={()=>void action('close')}><X size={15}/></button>
  </div><div className="desktop-current" title={f.current}>{f.current||f.title||'纯音乐'}</div><div className="desktop-next">{error||f.next||f.artist||'♪'}</div>
 </div>;
}
