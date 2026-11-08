import {app,session} from 'electron';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {KuwoProvider} from '../electron/provider';
app.whenReady().then(async()=>{
 try{
  await session.defaultSession.setProxy({mode:'direct'});
  const provider=new KuwoProvider((u,i)=>session.defaultSession.fetch(u,i));
  const result=await provider.collection('10140374','album');
  assert.equal(result.total,15);assert.equal(result.tracks.length,15);
  assert.equal(result.collection?.name,'Love Letter');assert.equal(result.collection.releaseDate,'1995-04-21');assert.ok(result.collection.description?.length);
  assert.equal(result.tracks[0].name,'His Smile');assert.equal(result.tracks[0].album,'Love Letter');assert.ok(result.tracks[0].catalogTags?.includes('DTS:X'));
  assert.ok(result.tracks.every(t=>!t.name.includes('&nbsp;')&&!t.album.includes('&nbsp;')));
  await fs.writeFile('docs/evidence/album-electron-1.2.2.json',JSON.stringify({date:new Date().toISOString(),system:process.getSystemVersion(),electron:process.versions.electron,proxy:'direct',...result},null,2));
  console.log('Album metadata and 15 track names verified');app.exit(0);
 }catch(e){console.error(e);await fs.writeFile('artifacts/album-check-error.txt',String(e));app.exit(1);}
});
