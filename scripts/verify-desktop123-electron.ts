import {app,session} from 'electron';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {KuwoProvider} from '../electron/provider';
import {DiscoveryService} from '../electron/discovery';
import {artistPage} from '../electron/artist';
app.whenReady().then(async()=>{
 try{
  await session.defaultSession.setProxy({mode:'direct'});
  const p=new KuwoProvider((u,i)=>session.defaultSession.fetch(u,i)),d=new DiscoveryService(p);
  const [search,lyrics,music,albums,videos,about,tags]=await Promise.all([p.search('周杰伦'),d.search('而我将爱你所爱的人间','lyrics'),artistPage(p,'336','music',0),artistPage(p,'336','albums',0),artistPage(p,'336','videos',0),artistPage(p,'336','about',0),d.tags()]);
  assert.ok(search.tracks.some(t=>t.catalogTags?.includes('VIP')));assert.ok(search.tracks.some(t=>t.catalogTags?.includes('原唱')));assert.ok(lyrics.tracks.some(t=>t.name.includes('如愿')&&t.lyricSnippet?.includes('人间')));
  assert.ok(music.tracks.length);assert.ok(albums.albums.length);assert.ok(videos.videos.length);assert.ok(videos.videos.every(t=>t.artist.includes('周杰伦')));assert.ok(about.artist.description?.includes('周杰伦'));assert.ok(tags.length>20);
  const images=await Promise.all([albums.albums[0].cover,videos.videos[0].cover,about.artist.cover].map(async url=>{assert.ok(url);const r=await session.defaultSession.fetch(url!);const bytes=(await r.arrayBuffer()).byteLength;assert.ok(r.ok&&bytes>100);return {url,status:r.status,bytes};}));
  await fs.writeFile('docs/evidence/desktop123-electron.json',JSON.stringify({date:new Date().toISOString(),system:process.getSystemVersion(),electron:process.versions.electron,proxy:'direct',search:search.tracks.slice(0,8),lyrics:lyrics.tracks.slice(0,4),artist:{name:about.artist.name,musicTotal:music.total,albumTotal:albums.total,videoTotal:videos.total,facts:about.facts,biographyLength:about.artist.description?.length},albums:albums.albums.slice(0,4),videos:videos.videos.slice(0,4),images,categories:tags.length},null,2));
  app.exit(0);
 }catch(e){await fs.writeFile('artifacts/desktop123-check-error.txt',String(e));app.exit(1);}
});
