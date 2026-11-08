import type {Track} from './shared';
export function filterLibrary(tracks:Track[],query:string,sort:string,filter:string):Track[]{
 const q=query.normalize('NFKC').toLocaleLowerCase().trim();const rows=tracks.filter(t=>(!q||[t.name,t.artist,t.album,t.localPath].some(v=>v?.normalize('NFKC').toLocaleLowerCase().includes(q)))&&(filter!=='lossless'||t.qualities.includes('flac'))&&(filter!=='missing'||t.missing)&&(filter!=='local'||Boolean(t.localPath)));
 if(sort==='default')return rows;return rows.sort((a,b)=>sort==='duration'?a.duration-b.duration:(sort==='artist'?a.artist:sort==='album'?a.album:a.name).localeCompare(sort==='artist'?b.artist:sort==='album'?b.album:b.name,'zh-CN',{numeric:true}));
}
