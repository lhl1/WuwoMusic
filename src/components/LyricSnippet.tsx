/** Highlights plain text only. Service markup is discarded in the main process. */
export function LyricSnippet({text,query}:{text:string;query:string}){
 const compact=Array.from(query).filter(c=>! /\s/.test(c)),pattern=compact.map(c=>c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s*'),match=pattern?new RegExp(pattern,'iu').exec(text):null;
 const start=match?.index??-1,end=match?match.index+match[0].length:-1;
 return <p className="lyric-snippet"><span className="lyric-label">词</span><span>{start>=0?<>{text.slice(0,start)}<mark>{text.slice(start,end)}</mark>{text.slice(end)}</>:text}</span></p>;
}
