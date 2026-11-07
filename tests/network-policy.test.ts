import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {NetworkPolicy,proxyMode,type ProxySession} from '../electron/network-policy';
import {Store} from '../electron/storage';

test('network modes default to direct and reject arbitrary proxy settings',()=>{
  assert.equal(proxyMode(undefined),'direct');
  assert.equal(proxyMode('system'),'system');
  for(const bad of [null,false,'','fixed_servers',{mode:'system'}])assert.throws(()=>proxyMode(bad),/无效/);
});
test('new and old profiles use direct while an explicit saved system choice persists',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wuwo-network-')),file=path.join(dir,'state.json');
  try{
    assert.equal(new Store(file,'M:').data.settings.proxyMode,'direct');
    fs.writeFileSync(file,JSON.stringify({version:1,settings:{downloadDir:'D:\\MyMusic',theme:'dark'},library:{favorites:[{id:'123'}],local:[{id:'local-a',localPath:'D:\\MyMusic\\a.flac'}]},tasks:[{id:'saved',status:'paused'}]}));
    const old=new Store(file,'M:');assert.equal(old.data.settings.proxyMode,'direct');assert.equal(old.data.settings.downloadDir,'D:\\MyMusic');assert.equal(old.data.library.favorites[0].id,'123');assert.equal(old.data.tasks[0].id,'saved');
    old.data.settings.proxyMode='system';old.save();assert.equal(new Store(file,'M:').data.settings.proxyMode,'system');
    old.data.settings.volume=.3;old.save();assert.equal(new Store(file,'M:').data.settings.proxyMode,'system');
  }finally{fs.unlinkSync(file);fs.rmdirSync(dir);}
});
test('rapid proxy changes serialize, retire pooled connections, and gate later requests',async()=>{
  const events:string[]=[];
  const session:ProxySession={setProxy:async c=>{events.push(c.mode);await new Promise(r=>setTimeout(r,5));},closeAllConnections:async()=>{events.push('closed');},fetch:async()=>{events.push('fetch');return new Response('ok');}};
  const policy=new NetworkPolicy(session);
  await Promise.all([policy.apply(undefined),policy.apply('system'),policy.apply('direct'),policy.fetch('https://test.invalid')]);
  assert.deepEqual(events,['direct','closed','system','closed','direct','closed','fetch']);
  await policy.apply('direct');assert.equal(events.length,7);
});
test('a cancelled request waiting for a proxy change never starts a network connection',async()=>{
  let release!:()=>void,calls=0;
  const policy=new NetworkPolicy({setProxy:()=>new Promise<void>(r=>release=r),closeAllConnections:async()=>{},fetch:async()=>{calls++;return new Response();}});
  const setting=policy.apply('direct');await Promise.resolve();const controller=new AbortController();
  const request=policy.fetch('https://test.invalid',{signal:controller.signal});controller.abort(new Error('cancelled'));
  await assert.rejects(request,/cancelled/);release();await setting;assert.equal(calls,0);
});
test('failed proxy changes roll back and do not poison later successful switches',async()=>{
  let current='direct',fail=true;
  const policy=new NetworkPolicy({setProxy:async c=>{current=c.mode;},closeAllConnections:async()=>{if(current==='system'&&fail){fail=false;throw Error('connection close failed');}},fetch:async()=>new Response(current)});
  await policy.apply('direct');await assert.rejects(policy.apply('system'),/未保存/);assert.equal(await(await policy.fetch('https://test.invalid')).text(),'direct');
  await policy.apply('system');assert.equal(await(await policy.fetch('https://test.invalid')).text(),'system');
});
