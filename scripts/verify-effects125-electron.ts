import {app,BrowserWindow,protocol} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
const baseline=process.argv.includes('--baseline');
protocol.registerSchemesAsPrivileged([{scheme:'kuwo',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,...(!baseline?{corsEnabled:true}:{})}}]);
function wav(){const rate=44100,frames=rate*2,b=Buffer.alloc(44+frames*4);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);for(let i=0;i<frames;i++){const n=Math.round(Math.sin(i/rate*440*Math.PI*2)*16000);b.writeInt16LE(n,44+i*4);b.writeInt16LE(n,46+i*4);}return b;}
app.whenReady().then(async()=>{
 const evidence:any={date:new Date().toISOString(),electron:process.versions.electron,baseline};let window:BrowserWindow|undefined;
 try{protocol.handle('kuwo',()=>new Response(wav(),{headers:{'Content-Type':'audio/wav',...(!baseline?{'Access-Control-Allow-Origin':'null'}:{})}}));
  await fs.writeFile('artifacts/effects125.html','<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src &apos;self&apos;; script-src &apos;self&apos;; media-src kuwo:; connect-src &apos;self&apos;"></head><body><script src="effects125-renderer.js"></script></body></html>');window=new BrowserWindow({show:false,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,autoplayPolicy:'no-user-gesture-required'}});
  window.webContents.on('console-message',(_e,level,message)=>{(evidence.messages??=[]).push({level,message});});
  await window.loadFile(path.resolve('artifacts/effects125.html'),{search:baseline?'baseline':''});const result=await Promise.race([window.webContents.executeJavaScript('window.verifyVocal().catch(e=>({passed:false,error:String(e),stack:e?.stack}))'),new Promise((_,reject)=>setTimeout(()=>reject(Error('Audio verification timeout')),20000))]);Object.assign(evidence,result);if(!baseline&&!evidence.passed)throw Error('音效没有取得有效 PCM 数据');
 }catch(e){evidence.error=String(e);evidence.passed=false;}
 finally{window?.destroy();await fs.writeFile(baseline?'artifacts/effects125-baseline.json':'docs/evidence/effects125-electron.json',JSON.stringify(evidence,null,2));app.exit(baseline||evidence.passed?0:1);}
});
