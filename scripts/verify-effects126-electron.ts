import {app,BrowserWindow,protocol} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
protocol.registerSchemesAsPrivileged([{scheme:'kuwo',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true}}]);
function wav(six:boolean){const rate=44100,frames=rate*8,channels=six?6:2,header=six?68:44,b=Buffer.alloc(header+frames*channels*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(six?40:16,16);b.writeUInt16LE(six?0xfffe:1,20);b.writeUInt16LE(channels,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*channels*2,28);b.writeUInt16LE(channels*2,32);b.writeUInt16LE(16,34);if(six){b.writeUInt16LE(22,36);b.writeUInt16LE(16,38);b.writeUInt32LE(0x3f,40);Buffer.from('0100000000001000800000aa00389b71','hex').copy(b,44);}b.write('data',header-8);b.writeUInt32LE(frames*channels*2,header-4);for(let i=0;i<frames;i++)for(let c=0;c<channels;c++)b.writeInt16LE(Math.round(Math.sin(i/rate*(440+Math.floor(c/2)*220)*Math.PI*2)*12000),header+(i*channels+c)*2);return b;}
app.whenReady().then(async()=>{
 const evidence:any={date:new Date().toISOString(),electron:process.versions.electron,system:process.getSystemVersion()};let window:BrowserWindow|undefined;
 try{const six=wav(true),stereo=wav(false);protocol.handle('kuwo',req=>{const data=req.url.includes('/six')?six:stereo;return new Response(data,{headers:{'Content-Type':'audio/wav','Access-Control-Allow-Origin':'null'}});});
  await fs.writeFile('artifacts/effects126.html','<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src &apos;self&apos;; script-src &apos;self&apos;; media-src kuwo:; connect-src &apos;self&apos;"></head><body><script src="effects126-renderer.js"></script></body></html>');
  window=new BrowserWindow({show:false,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,autoplayPolicy:'no-user-gesture-required'}});
  window.webContents.on('console-message',(_e,level,message)=>{(evidence.messages??=[]).push({level,message});});await window.loadFile(path.resolve('artifacts/effects126.html'));
  Object.assign(evidence,await Promise.race([window.webContents.executeJavaScript('window.verifyStems().catch(e=>({passed:false,error:String(e),stack:e?.stack}))'),new Promise((_,reject)=>setTimeout(()=>reject(Error('audio timeout')),20000))]));
  evidence.races=await window.webContents.executeJavaScript('window.verifyStemRaces().catch(e=>({passed:false,error:String(e),stack:e?.stack}))');evidence.passed=evidence.passed&&evidence.races.passed;
 }catch(e){evidence.passed=false;evidence.error=String(e);}finally{window?.destroy();await fs.writeFile('docs/evidence/effects126-electron.json',JSON.stringify(evidence,null,2)+'\n');app.exit(evidence.passed?0:1);}
});
