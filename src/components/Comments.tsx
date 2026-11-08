import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ArrowDown,Pause,ThumbsUp,X} from 'lucide-react';
import type {Comment,CommentSort,CommentPreference,CommentSource,CommentSourceStatus,Track} from '../shared';
import {commentSpans} from '../comment-content';
import {CommentFeed,emptyFeed,canLoopFeed,commentScrollRunning} from '../comment-feed';
function Avatar({comment:c}:{comment:Comment}){const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[c.avatar]);return <span className="comment-avatar">{c.avatar&&!failed?<img src={'kuwo://avatar/?url='+encodeURIComponent(c.avatar)} alt="" loading="lazy" onError={()=>setFailed(true)}/>:c.author.slice(0,1)}</span>;}
function CommentEmoji({url,alt}:{url:string;alt:string}){const [failed,setFailed]=useState(false);return failed?<span className="comment-emoji-fallback">［表情］</span>:<img className="comment-emoji" src={'kuwo://comment-image/?url='+encodeURIComponent(url)} alt={alt} loading="lazy" onError={()=>setFailed(true)}/>;}
function CommentImage({url}:{url:string}){const [failed,setFailed]=useState(false);return failed?<span className="comment-image-unavailable">图片暂不可用</span>:<a className="comment-picture" href="#" onClick={e=>{e.preventDefault();e.currentTarget.classList.toggle('enlarged');}} aria-label="展开评论图片"><img src={'kuwo://comment-image/?url='+encodeURIComponent(url)} loading="lazy" alt="评论图片" onError={()=>setFailed(true)}/></a>;}
function CommentBody({comment:c,expanded,automatic=false,onExpand}:{comment:Comment;expanded:boolean;automatic?:boolean;onExpand:()=>void}){
 const text=useRef<HTMLParagraphElement>(null),[clipped,setClipped]=useState(false);
 useLayoutEffect(()=>{const el=text.current;if(!el||expanded)return;const measure=()=>setClipped(el.scrollHeight>el.clientHeight+1);measure();const observer=new ResizeObserver(measure);observer.observe(el);return()=>observer.disconnect();},[c.text,expanded]);
 return <><div className="comment-author"><Avatar comment={c}/><div><b>{c.author}</b><time>{c.time}</time></div><span className="comment-likes"><ThumbsUp size={13}/>{c.likes.toLocaleString()}</span></div><p ref={text} className={`comment-text ${expanded?'expanded':''}`}>{commentSpans(c.text).map((part,i)=>'text'in part?part.text:<CommentEmoji key={i} url={part.url} alt={part.alt}/>)}</p>{c.images?.length?<div className="comment-pictures">{c.images.map(url=><CommentImage key={url} url={url}/>)}</div>:null}{!automatic&&(expanded||clipped)?<button className="comment-expand" onClick={onExpand}>{expanded?'收起':'展开全文'}</button>:null}</>;
}
function CommentItem({comment,automatic}:{comment:Comment;automatic:boolean}){const [expanded,setExpanded]=useState(false);return <article className="comment-item"><CommentBody comment={comment} expanded={automatic||expanded} automatic={automatic} onExpand={()=>setExpanded(v=>!v)}/></article>;}

export function CommentsPanel({track,offline,onClose,inline=false,automatic=false,playing=false,onAutomatic,preference='auto'}:{track:Track;offline:boolean;onClose:()=>void;inline?:boolean;automatic?:boolean;playing?:boolean;onAutomatic?:(value:boolean)=>void;preference?:CommentPreference}){
 const [source,setSource]=useState<CommentSource|undefined>(),[statuses,setStatuses]=useState<CommentSourceStatus[]>([]);
 const [sort,setSort]=useState<CommentSort>('hot'),[state,setState]=useState(emptyFeed),[visible,setVisible]=useState(!document.hidden),[hover,setHover]=useState(false),[focus,setFocus]=useState(false);
 const content=useRef<HTMLDivElement>(null),sentinel=useRef<HTMLDivElement>(null),feed=useRef<CommentFeed|null>(null),panel=useRef<HTMLElement>(null);
 const id=track.onlineId??track.id,valid=Boolean(track.name&&track.artist);
 useEffect(()=>{setState(emptyFeed());content.current?.scrollTo(0,0);if(!valid||offline)return;
  const model=new CommentFeed((page,force)=>window.desktop.comments(track,sort,page,force,source),value=>{setState(value);if(value.statuses)setStatuses(value.statuses);});feed.current=model;let live=true;void window.desktop.commentSources(track).then(s=>{if(live)setStatuses(s);}).catch(()=>{});void model.load();return()=>{live=false;model.dispose();feed.current=null;};
 },[id,sort,offline,preference,source]);
 useEffect(()=>{setSource(undefined);setStatuses([]);},[id,preference]);
 useEffect(()=>{content.current?.scrollTo(0,0);},[state.source]);
 useEffect(()=>{const change=()=>setVisible(!document.hidden);document.addEventListener('visibilitychange',change);const off=window.desktop.onVisibility(setVisible);return()=>{document.removeEventListener('visibilitychange',change);off();};},[]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[onClose]);
 useEffect(()=>{if(!state.hasMore||state.loading||state.error||!valid||offline)return;const node=sentinel.current,root=content.current;if(!node||!root)return;
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))void feed.current?.load();},{root,rootMargin:'0px 0px 180px 0px'});observer.observe(node);return()=>observer.disconnect();
 },[state.page,state.hasMore,state.loading,state.error,valid,offline]);
 // Automatic full text must not be treated as a manual expansion that pauses scrolling.
 useEffect(()=>{if(!commentScrollRunning({enabled:inline&&automatic,playing,visible,hover,focus,expanded:false,offline,error:state.error}))return;
  let frame=0,previous=0,bottomAt=0,offset=content.current?.scrollTop??0;const tick=(now:number)=>{const el=content.current;if(!el)return;if(!previous)previous=now;const delta=Math.min(80,now-previous);previous=now;
   if(el.scrollHeight-el.clientHeight>2){if(Math.abs(el.scrollTop-offset)>2)offset=el.scrollTop;offset=Math.min(el.scrollHeight-el.clientHeight,offset+delta*.024);el.scrollTop=offset;if(el.scrollHeight-el.clientHeight-el.scrollTop<4){
    if(state.hasMore){void feed.current?.load();bottomAt=0;}else if(canLoopFeed(state)){if(!bottomAt)bottomAt=now;if(now-bottomAt>4000){el.scrollTop=0;offset=0;bottomAt=0;}}
   }else bottomAt=0;}
   frame=requestAnimationFrame(tick);
  };frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
 },[inline,automatic,playing,visible,hover,focus,offline,state]);
 const names={netease:'网易云',qq:'QQ 音乐',kuwo:'酷我'};const statusText={available:'可查看',empty:'暂无评论',unmatched:'未匹配',error:'暂不可用'};
 return <aside ref={panel} className={inline?'inline-comments':'comments-drawer'} aria-label="歌曲评论">
 {!inline?<div className="drawer-heading"><div><h2>歌曲评论</h2><p>{track.name} · {track.artist}</p></div></div>:null}
 <div className="comment-toolbar"><div className="comment-sort" aria-label="评论排序">{(['hot','latest']as const).map(v=><button key={v} className={sort===v?'active':''} aria-pressed={sort===v} onClick={()=>setSort(v)}>{v==='hot'?'热门':'最新'}</button>)}</div><div className="comment-heading-actions">{onAutomatic?<button className="icon-button comment-auto" aria-label={automatic?'暂停评论自动滚动':'开启评论自动滚动'} aria-pressed={automatic} title={automatic?'暂停自动滚动':'自动滚动并展开全文'} onClick={()=>onAutomatic(!automatic)}>{automatic?<Pause size={15}/>:<ArrowDown size={15}/>}</button>:null}<button className="icon-button" aria-label="关闭评论" title={inline?'返回封面':'关闭评论'} onClick={onClose}><X size={17}/></button></div></div>
 <div className="comment-sources" role="group" aria-label="评论平台"><button className={!source?'selected':''} aria-pressed={!source} onClick={()=>setSource(undefined)}>自动</button>{(['netease','qq','kuwo']as const).map(key=>{const status=state.statuses?.find(s=>s.source===key)??statuses.find(s=>s.source===key);return <button key={key} className={state.source===key?'selected':''} aria-pressed={state.source===key} title={status?.error??(status?statusText[status.state]:'查询中')} onClick={()=>setSource(key)}><span>{names[key]}</span><i className={'source-state state-'+(status?.state??'pending')}/><small>{status?statusText[status.state]:'查询中'}</small></button>;})}</div>{state.fallbackFrom&&state.source?<p className="comment-fallback" role="status">{names[state.fallbackFrom]}暂不可用，已切换至{names[state.source]}</p>:null}
 <div ref={content} className="comments-content" tabIndex={0} aria-label="评论内容" onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)} onFocusCapture={()=>setFocus(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setFocus(false);}}>
 {!valid?<div className="comment-status">未找到对应的在线歌曲评论</div>:offline?<div className="comment-status">当前离线，联网后可查看评论</div>:<>{state.items.map(c=><CommentItem key={c.id} comment={c} automatic={inline&&automatic}/>)}{state.error?<div className="comment-status"><p>{state.error}</p><button className="secondary" onClick={()=>{void window.desktop.commentSources(track,true).then(setStatuses).catch(()=>{});void feed.current?.load(true);}}>重试</button></div>:state.loading?<div className="comment-status comment-loading" role="status">加载中…</div>:!state.items.length?<div className="comment-status">{sort==='hot'?'暂无热门评论':'暂无评论'}</div>:null}<div ref={sentinel} className="comment-sentinel">{!state.hasMore&&state.items.length?<span>{automatic?'已浏览全部，稍后从头继续':'已加载全部评论'}</span>:null}</div></>}
 </div></aside>;
}
