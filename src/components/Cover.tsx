import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {Music2} from 'lucide-react';
import type {Collection} from '../shared';
export function artworkUrl(src?:string,id?:string):string|undefined {
 if(src?.startsWith('data:')||src?.startsWith('kuwo:'))return src;
 if(src&&/^https?:\/\//i.test(src))return 'kuwo://artwork/?url='+encodeURIComponent(src);
 if(id&&/^\d+$/.test(id))return 'kuwo://artwork/?rid='+id;
 return src;
}
type Props={src?:string;id?:string;name?:string;large?:boolean;collection?:{id:string;kind:Collection['kind']}};
export function Cover(props:Props){return <CoverContent key={`${props.src}|${props.id}|${props.collection?.kind}|${props.collection?.id}`} {...props}/>;}
function CoverContent({src,id,name,large=false,collection}:Props){
 const [attempt,setAttempt]=useState(0),[loaded,setLoaded]=useState(false),[failed,setFailed]=useState(false),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 const alternate=collection?`kuwo://artwork/?collectionId=${collection.id}&kind=${collection.kind}`:id?artworkUrl(undefined,id):undefined;
 const base=attempt>=2&&alternate?alternate:artworkUrl(src,id),url=base?.startsWith('kuwo:')?base+`&attempt=${attempt}`:base;
 const hue=[...(name??'音乐')].reduce((n,c)=>n+c.charCodeAt(0),0)%60+28;
 return <div className={`cover ${large?'cover-large':''} ${loaded?'cover-loaded':''}`} style={{'--cover-hue':hue}as CSSProperties}>
 {url&&!failed?<img key={url} src={url} alt={name??'专辑封面'} draggable={false} loading={large?'eager':'lazy'} decoding="async" referrerPolicy="no-referrer" onLoad={()=>setLoaded(true)} onError={()=>{setLoaded(false);if(attempt<3)timer.current=setTimeout(()=>setAttempt(n=>n+1),attempt?1200:350);else setFailed(true);}}/>:null}
 {!loaded?<Music2 className="cover-fallback" aria-hidden="true"/>:null}
 </div>;
}
