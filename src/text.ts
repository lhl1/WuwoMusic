const entities:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ensp:' ',emsp:' ',thinsp:' ',middot:'·',hellip:'…',ndash:'–',mdash:'—',copy:'©',reg:'®',trade:'™',laquo:'«',raquo:'»',bull:'•',times:'×',plusmn:'±',euro:'€',pound:'£',yen:'¥'};
/** Decode service text as text only. Never interpret it as HTML in the UI. */
export function serviceText(value:unknown):string {
 let text=String(value??'');
 for(let i=0;i<3;i++){
  const next=text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(entity,name:string)=>{
   if(name[0]!=='#')return entities[name.toLowerCase()]??entity;
   const point=name[1].toLowerCase()==='x'?parseInt(name.slice(2),16):Number(name.slice(1));
   return point>0&&point<=0x10ffff&&!(point>=0xd800&&point<=0xdfff)?String.fromCodePoint(point):'�';
  });
  if(next===text)break;text=next;
 }
 return text.replace(/<br\s*\/?\s*>|<\/p\s*>/gi,'\n').replace(/<!--[^]*?-->|<\/?[a-z][^>]*>/gi,'').replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim();
}
