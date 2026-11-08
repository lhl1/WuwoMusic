import {useState,useRef,useEffect,type CSSProperties} from 'react';
import {Volume2,VolumeX} from 'lucide-react';
import type {Settings} from '../shared';
export function VolumeControl({settings,exclusive,onChange}:{settings?:Settings;exclusive:boolean;onChange:(s:Partial<Settings>)=>void}){
 const [open,setOpen]=useState(false),closeTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),root=useRef<HTMLDivElement>(null);
 useEffect(()=>()=>clearTimeout(closeTimer.current),[]);
 const volume=exclusive?1:settings?.volume??.75,value=Math.round(volume*100);
 return <div className="volume-control volume-popover" ref={root} onMouseEnter={()=>{clearTimeout(closeTimer.current);setOpen(true);}} onMouseLeave={()=>{closeTimer.current=setTimeout(()=>{if(!root.current?.contains(document.activeElement))setOpen(false);},180);}} onFocusCapture={()=>setOpen(true)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setOpen(false);}} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setOpen(false);}}}>
 <button className="icon-button mute-control" aria-label={settings?.muted?'取消静音':'静音'} aria-pressed={Boolean(settings?.muted)} aria-expanded={open} aria-controls="volume-popup" title={settings?.muted?'取消静音':'音量 · 点击静音'} onClick={()=>onChange({muted:!settings?.muted})}>{settings?.muted||volume===0?<VolumeX size={18}/>:<Volume2 size={18}/>}</button>
 {open?<div className="volume-popup" id="volume-popup"><output>{settings?.muted?'静音':`${value}%`}</output><input aria-label="音量" aria-orientation="vertical" disabled={exclusive} title={exclusive?'HiFi 模式使用设备调音量':`${value}%`} type="range" min={0} max={100} step={1} value={value} style={{'--range-fill':`${value}%`} as CSSProperties} onChange={e=>onChange({volume:Number(e.target.value)/100,muted:false})}/>{exclusive?<small>设备调节</small>:null}</div>:null}
 </div>;
}
