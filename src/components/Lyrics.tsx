import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {ArrowDownToLine,ChevronLeft,ChevronRight,Focus,LoaderCircle,Minus,Music2,Plus,RefreshCw,Upload,SlidersHorizontal} from 'lucide-react';
import type {LyricLine,Settings} from '../shared';

export function Lyrics({lines,position,loading,error,settings,onSettings,onSeek,onRetry,onImport,disabled=false}:{lines:LyricLine[];position:number;loading:boolean;error:string;settings?:Settings;onSettings:(s:Partial<Settings>)=>void;onSeek:(time:number)=>void;onRetry:()=>void;onImport:()=>void;disabled?:boolean}){
  const offset=settings?.lyricOffset??0,font=settings?.lyricFontSize??18;
  const [timing,setTiming]=useState(false);
  const index=lines.findLastIndex(l=>l.time<=position+offset),active=useRef<HTMLButtonElement>(null),scroller=useRef<HTMLDivElement>(null),manualUntil=useRef(0);
  function center(){const node=active.current,box=scroller.current;if(node&&box){const top=node.getBoundingClientRect().top-box.getBoundingClientRect().top+box.scrollTop-(box.clientHeight-node.clientHeight)/2;box.scrollTo({top,behavior:'smooth'});}}
  function follow(){manualUntil.current=0;center();}
  useEffect(()=>{if(Date.now()>manualUntil.current)center();},[index,font]);
  useEffect(()=>{const box=scroller.current;if(!box)return;const observer=new ResizeObserver(()=>{if(Date.now()>manualUntil.current)center();});observer.observe(box);return()=>observer.disconnect();},[index,font]);
  return <section className="lyrics-panel" aria-label="同步歌词" style={{'--lyric-font':`${font}px`}as CSSProperties}>
    <div className="lyrics-toolbar"><div><button title="缩小歌词" aria-label="缩小歌词" disabled={font<=14} onClick={()=>onSettings({lyricFontSize:Math.max(14,font-2)})}><Minus size={15}/></button><button title="放大歌词" aria-label="放大歌词" disabled={font>=24} onClick={()=>onSettings({lyricFontSize:Math.min(24,font+2)})}><Plus size={15}/></button><button title="回到当前歌词" aria-label="回到当前歌词" onClick={follow}><Focus size={16}/></button><button title="重新加载歌词" aria-label="重新加载歌词" onClick={onRetry} disabled={disabled||loading}><RefreshCw size={15} className={loading?'spin':''}/></button><button title="导入 LRC 歌词" aria-label="导入 LRC 歌词" onClick={onImport} disabled={disabled}><Upload size={15}/></button><button title="歌词时间调整" aria-label="歌词时间调整" aria-pressed={timing} onClick={()=>setTiming(v=>!v)}><SlidersHorizontal size={15}/></button></div></div>
    <div className="lyric-scroll" ref={scroller} onWheel={()=>{manualUntil.current=Date.now()+5000;}}>
      {loading&&!lines.length?<div className="lyric-empty"><LoaderCircle className="spin"/><p>正在寻找这首歌的歌词…</p></div>:lines.length?<div className="lyric-lines">{lines.map((line,i)=><button key={`${line.time}-${i}`} ref={i===index?active:undefined} className={`lyric-line ${i===index?'lyric-active':''}`} onClick={()=>{manualUntil.current=0;onSeek(Math.max(0,line.time-offset));}} title={`跳转到 ${Math.floor(line.time/60)}:${String(Math.floor(line.time%60)).padStart(2,'0')}`}>{line.text||'♪'}</button>)}</div>:<div className="lyric-empty"><Music2/><p>{error||'纯音乐 / 暂无歌词'}</p><span>可导入本地 LRC 文件，和音乐一起播放</span><button className="secondary" disabled={disabled} onClick={onImport}><ArrowDownToLine size={14}/>选择歌词文件</button></div>}
    </div>
    {timing?<div className="lyrics-offset"><button aria-label="歌词提前半秒" title="歌词提前 0.5 秒" onClick={()=>onSettings({lyricOffset:Math.min(30,offset+0.5)})}><ChevronLeft size={16}/></button><button onClick={()=>onSettings({lyricOffset:0})} title="点击重置歌词时间">{offset===0?'0.0 秒':`${offset>0?'提前':'延后'} ${Math.abs(offset).toFixed(1)} 秒`}</button><button aria-label="歌词延后半秒" title="歌词延后 0.5 秒" onClick={()=>onSettings({lyricOffset:Math.max(-30,offset-0.5)})}><ChevronRight size={16}/></button></div>:null}
  </section>;
}
