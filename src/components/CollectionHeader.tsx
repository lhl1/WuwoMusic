import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {Collection} from '../shared';
import {Cover} from './Cover';
import {serviceText} from '../text';

export function CollectionHeader({collection,total,children}:{collection:Collection;total:number;children?:ReactNode}){
 const [expanded,setExpanded]=useState(false);
 const [truncated,setTruncated]=useState(false),paragraph=useRef<HTMLParagraphElement>(null);
 const description=serviceText(collection.description),tags=[...new Set([collection.language,...(collection.tags??[])].filter(Boolean))] as string[];
 useEffect(()=>{if(expanded||!paragraph.current)return;const element=paragraph.current,measure=()=>setTruncated(element.scrollHeight>element.clientHeight+1);measure();const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();},[description,expanded]);
 return <header className="collection-header">
  <Cover src={collection.cover} name={collection.name} collection={collection} large/>
  <div className="collection-summary">
   <div className="collection-labels"><span className="collection-type">{{playlist:'歌单',rank:'排行榜',album:'专辑',artist:'歌手'}[collection.kind]}</span>{tags.map(t=><span className="collection-tag" key={t}>{t}</span>)}</div>
   <h1>{serviceText(collection.name)}</h1>
   {collection.subtitle?<p className="collection-subtitle">{serviceText(collection.subtitle)}</p>:null}
   <div className="collection-meta">{collection.artist?<span>{serviceText(collection.artist)}</span>:null}{collection.releaseDate?<time dateTime={collection.releaseDate}>{collection.releaseDate}</time>:null}<span>{total.toLocaleString()} 首</span></div>
   {collection.company?<p className="collection-company" title={serviceText(collection.company)}>{serviceText(collection.company)}</p>:null}
   {children}
  </div>
  {description?<div className="collection-overview"><p ref={paragraph} id="collection-description" className={expanded?'expanded':''}>{description}</p>{expanded||truncated?<button className="text-button" aria-expanded={expanded} aria-controls="collection-description" onClick={()=>setExpanded(v=>!v)}>{expanded?'收起':'展开简介'}</button>:null}</div>:null}
 </header>;
}
