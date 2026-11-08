/** Offscreen CSS regression fixture; does not operate the user's desktop. */
import {app,BrowserWindow} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
app.whenReady().then(async()=>{
 const evidence:any={date:new Date().toISOString(),results:[]};let window:BrowserWindow|undefined;
 try{
  const assets=await fs.readdir('dist/assets'),css=assets.find(f=>/^index-.*\.css$/.test(f));assert.ok(css);
  await fs.writeFile('artifacts/layout125.html',`<!doctype html><link rel="stylesheet" href="../dist/assets/${css}"><div class="full-player refined-player" style="height:700px"><div class="album-stage showing-comments"><aside class="inline-comments"><div class="comment-toolbar">热门　最新</div><div class="comment-sources"><button>自动</button>${['available','empty','error'].map((s,i)=>`<button>平台${i+1}<i class="source-state state-${s}"></i><small>状态</small></button>`).join('')}</div><div class="comments-content">评论正文</div></aside></div></div>`);
  window=new BrowserWindow({show:false,width:1280,height:800,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true}});
  await window.loadFile(path.resolve('artifacts/layout125.html'));
  for(const [width,zoom]of [[1280,1],[1280,1.5],[850,1]]as const){window.setSize(width,800);window.webContents.setZoomFactor(zoom);
   const r=await window.webContents.executeJavaScript(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve({icons:[...document.querySelectorAll('.source-state')].map(e=>e.getBoundingClientRect().height),sources:document.querySelector('.comment-sources').getBoundingClientRect().height,content:document.querySelector('.comments-content').getBoundingClientRect().height}))))`);
   for(const h of r.icons)assert.ok(h<=5,'empty/error status must not inherit the global empty-page height');assert.ok(r.sources<100);assert.ok(r.content>300);evidence.results.push({width,zoom,...r});
  }
  evidence.passed=true;
 }catch(e){evidence.passed=false;evidence.error=String(e);}
 finally{window?.destroy();await fs.writeFile('docs/evidence/layout125-electron.json',JSON.stringify(evidence,null,2));app.exit(evidence.passed?0:1);}
});
