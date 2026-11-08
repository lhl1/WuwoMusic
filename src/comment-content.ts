import {serviceText} from './text';
const emoji:Record<string,string>={'微笑':'🙂','大笑':'😄','可爱':'🥰','色':'😍','亲亲':'😘','憨笑':'😁','呲牙':'😁','流泪':'😢','大哭':'😭','爱心':'❤️','心':'❤️','心碎':'💔','强':'👍','赞':'👍','玫瑰':'🌹','握手':'🤝','抱抱':'🤗','鼓掌':'👏','狗':'🐶','狗头':'🐶','捂脸':'🤦','笑哭':'😂','偷笑':'🤭','惊恐':'😱','再见':'👋','太阳':'☀️','月亮':'🌙','星星':'⭐','蛋糕':'🎂','礼物':'🎁','祈祷':'🙏','合十':'🙏','咖啡':'☕','音乐':'🎵','酷':'😎','撇嘴':'😒','害羞':'☺️','发呆':'😶','调皮':'😜','难过':'😞','疑问':'❓','奋斗':'💪','怒':'😠','生气':'😠','晕':'😵','汗':'😓','白眼':'🙄','惊讶':'😲','流汗':'😓','睡':'😴','吐':'🤮','拥抱':'🤗','便便':'💩'};
export function commentImageUrl(value:unknown):string|undefined{try{const u=new URL(String(value));if(!['https:','http:'].includes(u.protocol)||u.username||u.password||(u.port&&u.port!=='443'))return;const h=u.hostname;if(!(/^p[1-9]\.music\.126\.net$/.test(h)||/^pic[1-9]\.y\.qq\.com$/.test(h)||h==='y.gtimg.cn'||/(^|\.)(kuwo|kwcdn)\.cn$/.test(h)))return;u.protocol='https:';return u.href;}catch{return;}}
/** No HTML enters the renderer. Decode transport escapes before sanitising. */
export function commentContent(value:unknown,attachments:unknown[]=[]):{text:string;images:string[]}{
 let raw=String(value??'').slice(0,30000);for(let i=0;i<2;i++)raw=raw.replace(/\\r\\n|\\n|\\r/g,'\n').replace(/\\u([\da-f]{4})/gi,(_,v)=>String.fromCharCode(parseInt(v,16))).replace(/\\\//g,'/');
 const images:string[]=[];const add=(v:unknown)=>{const u=commentImageUrl(v);if(u&&!images.includes(u)&&images.length<6)images.push(u);};
 raw=raw.replace(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi,(_,u)=>{add(serviceText(u));return '';}).replace(/\[img\]([^]*?)\[\/img\]/gi,(_,u)=>{add(u);return '';});
 for(const item of attachments){if(typeof item==='string')add(item);else if(item&&typeof item==='object'){const o=item as Record<string,unknown>;add(o.originUrl??o.url??o.picUrl??o.imageUrl);}}
 const text=serviceText(raw).replace(/\[([^\]\n]{1,8})\]/g,(all,key)=>emoji[key]??all);
 return {text,images};
}

export function commentSpans(text:string):Array<{text:string}|{url:string;alt:string}>{const parts:Array<{text:string}|{url:string;alt:string}>=[];const pattern=/\[em\](e\d{6})\[\/em\]/gi;let start=0;for(const m of text.matchAll(pattern)){if(m.index!>start)parts.push({text:text.slice(start,m.index)});parts.push({url:'https://y.gtimg.cn/mediastyle/global/emoji/img/'+m[1].toLowerCase()+'.png',alt:'QQ 表情'});start=m.index!+m[0].length;}if(start<text.length)parts.push({text:text.slice(start)});return parts;}
