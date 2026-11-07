import {useEffect,useState} from 'react';
import type {RankPeriod} from '../shared';
import {Select} from './Select';
export function RankPeriods({id,value,onChange}:{id:string;value:string;onChange:(p:string)=>void}){
 const [items,setItems]=useState<RankPeriod[]>([]),[error,setError]=useState(''),[revision,setRevision]=useState(0),[loading,setLoading]=useState(true);
 useEffect(()=>{let live=true;setItems([]);setError('');setLoading(true);window.desktop.rankPeriods(id).then(r=>{if(live)setItems(r);}).catch(()=>{if(live)setError('期数加载失败');}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[id,revision]);
 const selected=items.find(p=>p.id===value),years=Array.from(new Set(items.map(p=>p.year))),year=selected?.year??years[0];
 if(error)return <button className="text-button" onClick={()=>setRevision(n=>n+1)}>{error} · 重试</button>;
 if(loading)return <span className="muted period-loading">加载期数…</span>;
 if(!items.length)return null;
 return <div className="rank-periods">{years.length>1?<Select label="榜单年份" value={year} options={years.map(y=>({value:y,label:y}))} onChange={y=>{const p=items.find(p=>p.year===y);if(p)onChange(p.id);}}/>:null}<Select label="榜单期数" value={value} options={[{value:'',label:'最新一期'},...items.filter(p=>p.year===year).map(p=>({value:p.id,label:`${p.year} · ${p.name}`}))]} onChange={onChange}/></div>;
}
