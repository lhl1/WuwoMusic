import {app,session} from 'electron';
import {createServer,type Server} from 'node:http';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {NetworkPolicy} from '../electron/network-policy';
import {KuwoProvider} from '../electron/provider';
import {CommentService} from '../electron/comments';
import {inspectStream} from '../electron/audio-info';

app.whenReady().then(async()=>{
  const checks:any[]=[],servers:Server[]=[];
  const record=async(name:string,work:()=>Promise<unknown>)=>{try{checks.push({name,ok:true,result:await work()});}catch(e){checks.push({name,ok:false,error:(e as Error).message});}};
  const listen=async(server:Server)=>{servers.push(server);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));return (server.address() as any).port as number;};
  const targetSession=session.fromPartition('network-test-'+Date.now());
  const policy=new NetworkPolicy(targetSession);
  const fetcher=(u:string,i?:RequestInit)=>policy.fetch(u,i);
  let proxyHits=0,originHits=0;
  const proxyPort=await listen(createServer((_req,res)=>{proxyHits++;res.setHeader('Cache-Control','no-store');res.end('via-proxy');}));
  const originPort=await listen(createServer((_req,res)=>{originHits++;res.setHeader('Cache-Control','no-store');res.end('direct-origin');}));
  const origin=`http://127.0.0.1:${originPort}/test`;
  await record('proxy-fixture-detects-an-inherited-route',async()=>{
    await targetSession.setProxy({mode:'fixed_servers',proxyRules:`http://127.0.0.1:${proxyPort}`,proxyBypassRules:'<-loopback>'});
    assert.equal(await(await targetSession.fetch(origin,{cache:'no-store'})).text(),'via-proxy');assert.equal(originHits,0);return {proxyHits};
  });
  await record('default-direct-bypasses-previous-proxy',async()=>{
    const previous=proxyHits;await policy.apply(undefined);assert.equal(await targetSession.resolveProxy(origin),'DIRECT');
    assert.equal(await(await fetcher(origin,{cache:'no-store'})).text(),'direct-origin');assert.equal(proxyHits,previous);return {originHits,proxyHits};
  });
  await record('system-mode-restores-the-operating-system-policy',async()=>{
    const reference=session.fromPartition('network-reference-'+Date.now());await reference.setProxy({mode:'system'});
    await policy.apply('system');const url='https://www.kuwo.cn/';assert.equal(await targetSession.resolveProxy(url),await reference.resolveProxy(url));
    await reference.closeAllConnections();return {matchesSystem:true};
  });
  await record('switching-back-to-direct-retires-the-system-route',async()=>{
    await policy.apply('direct');assert.equal(await targetSession.resolveProxy('https://www.kuwo.cn/'),'DIRECT');
    assert.equal(await(await fetcher(origin,{cache:'no-store'})).text(),'direct-origin');return {originHits};
  });
  const provider=new KuwoProvider(fetcher);
  await record('real-search-and-audio-use-direct-session',async()=>{
    const found=await provider.search('晴天 周杰伦');assert.ok(found.tracks.length);
    const track=found.tracks.find(t=>t.id==='228908')??found.tracks[0];const audio=await provider.resolveBest(track,'flac','play');
    const info=await inspectStream(audio.url,fetcher);assert.ok(info.sampleRate);
    return {id:track.id,quality:audio.quality,sampleRate:info.sampleRate,bitrate:info.bitrate};
  });
  await record('real-comments-use-direct-session',async()=>{
    const comments=await new CommentService(fetcher,()=>false).get('6304356','hot',1);assert.ok(comments.comments.length);return {rows:comments.comments.length};
  });
  await targetSession.closeAllConnections();for(const server of servers){server.closeAllConnections();server.close();}
  await fs.mkdir('docs/evidence',{recursive:true});await fs.writeFile('docs/evidence/network-electron-120.json',JSON.stringify({date:new Date().toISOString(),systemSettingsModified:false,checks},null,2));
  app.exit(checks.every(c=>c.ok)?0:1);
}).catch(e=>{console.error(e);app.exit(1);});
