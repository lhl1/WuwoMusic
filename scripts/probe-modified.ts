import {createCipheriv,createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseFile} from 'music-metadata';
import {KuwoProvider} from '../electron/provider';
const provider=new KuwoProvider();
const root=path.resolve('artifacts/modified-probe');await fs.mkdir(root,{recursive:true});
const report:any={timestamp:new Date().toISOString(),checks:[]};
for(const query of ['晴天 周杰伦','江南 林俊杰','无奈的思绪','LudwigvanBeethoven 苏夏依']){
 const search=await provider.search(query); const track=search.tracks[0];
 if(!track)continue;
 for(const quality of ['128k','320k','flac']){
  const check:any={query,track,quality};
  try{
   const params=new URLSearchParams({user:'0',prod:'kwplayer_ar_12.2.2.5',corp:'kuwo',newver:'3',vipver:'12.2.2.5',source:'kwradio_ar_6.0.0.9_B_jiakong_vh.apk',type:'convert_url_with_sign',br:quality==='flac'?'2000kflac':quality==='320k'?'320kmp3':'128kmp3',format:quality==='flac'?'flac':'mp3',sig:'0',rid:track.id,priority:'bitrate',network:'WIFI',localUid:'-1',mode:'download',uid:'0',downloadPay:'0',playPay:'0',surl:'1',apiv:'1'});
   const cipher=createCipheriv('aes-128-ecb',Buffer.from('14505b09374869d9'),null);
   const q=Buffer.concat([cipher.update(params.toString(),'utf8'),cipher.final()]).toString('base64');
   const response=await fetch('https://mobi.kuwo.cn/mobi.s?f=kwxs&q='+q,{signal:AbortSignal.timeout(30000)});const data=await response.json();
   check.reply=data;
   const d=data.data;if(!d?.url)throw Error(JSON.stringify(data));
   const url=(d.surl||d.url).replace(/\\u0026/g,'&');
   const audio=await fetch(url,{signal:AbortSignal.timeout(90000)});if(!audio.ok)throw Error('Audio HTTP '+audio.status);
   const bytes=Buffer.from(await audio.arrayBuffer());const file=path.join(root,`${track.id}-${quality}.${d.format}`);await fs.writeFile(file,bytes);
   const m=await parseFile(file,{duration:true});check.file=file;check.bytes=bytes.length;check.sha256=createHash('sha256').update(bytes).digest('hex');check.metadata=m.format;
   check.ok=String(d.rid)===track.id&&Math.abs((m.format.duration??0)-track.duration)<8;
   console.log(JSON.stringify({query,rid:track.id,quality,ok:check.ok,bytes:bytes.length,duration:m.format.duration,format:m.format.container,bitrate:m.format.bitrate,serverBitrate:d.bitrate}));
  }catch(e){check.ok=false;check.error=(e as Error).message;console.log('FAIL',query,quality,check.error);}
  report.checks.push(check);await fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2));
 }
}
