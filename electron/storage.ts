import fs from 'node:fs';
import path from 'node:path';
import type { Snapshot } from '../src/shared';
import {appearanceDefaults} from '../src/preferences';
import {serviceText} from '../src/text';

export class Store {
  data: Snapshot;
  constructor(public filename:string, musicDir:string) {
    this.data = {settings:{downloadDir:path.join(musicDir,'无我音乐'),concurrency:3,quality:'flac',qualityPolicyVersion:1,volume:0.75,muted:false,zoom:1,proxyMode:'direct',audioOutput:'normal',audioDevice:'auto',commentPreference:'auto',vocalMode:'original',vocalBalance:0,playbackRate:1,pitchSemitones:0,effectsVersion:1,desktopLyrics:false,...appearanceDefaults},library:{favorites:[],history:[],local:[],playlists:[]},tasks:[]};
    if(fs.existsSync(filename)) {
      try {
        const saved=JSON.parse(fs.readFileSync(filename,'utf8'));
        if(saved.version!==1) throw new Error('Unsupported state version');
        this.data.settings={...this.data.settings,...saved.settings};
        this.data.settings.muted=saved.settings?.muted===true;
        this.data.settings.proxyMode=saved.settings?.proxyMode==='system'?'system':'direct';
        // This release adopts lossless-first once; later explicit quality choices remain intact.
        if(saved.settings?.qualityPolicyVersion!==1)this.data.settings.quality='flac';
        if(saved.settings?.playerLayoutVersion!==2){this.data.settings.coverMode='record';this.data.settings.autoHotComments=false;this.data.settings.playerLayoutVersion=2;}
        this.data.library={...this.data.library,...saved.library};
        this.data.tasks=Array.isArray(saved.tasks)?saved.tasks:[];
        this.data.settings.commentPreference=['auto','netease','qq','kuwo'].includes(saved.settings?.commentPreference)?saved.settings.commentPreference:'auto';
        this.data.settings.vocalMode=['original','accompaniment','vocal'].includes(saved.settings?.vocalMode)?saved.settings.vocalMode:'original';
        if(saved.settings?.effectsVersion!==1){this.data.settings.playbackRate=1;this.data.settings.pitchSemitones=0;this.data.settings.effectsVersion=1;}else{this.data.settings.playbackRate=Math.max(.5,Math.min(2,Number(saved.settings.playbackRate)||1));this.data.settings.pitchSemitones=Math.round(Math.max(-12,Math.min(12,Number(saved.settings.pitchSemitones)||0)));}
        // Repair saved display text in memory; keep identifiers and file paths intact.
        const tracks=[...this.data.library.favorites,...this.data.library.history,...this.data.library.local,...this.data.library.playlists.flatMap(p=>p.tracks??[]),...this.data.tasks.flatMap(t=>t.track?[t.track]:[])];
        for(const track of tracks)for(const key of ['name','artist','album'] as const)if(typeof track[key]==='string')track[key]=serviceText(track[key]);
        for(const t of this.data.tasks) if(['queued','resolving','downloading'].includes(t.status)){t.status='paused';t.speed=0;}
      } catch {
        fs.copyFileSync(filename,`${filename}.unreadable-${Date.now()}.bak`);
      }
    }
  }
  save() {
    fs.mkdirSync(path.dirname(this.filename),{recursive:true});
    fs.writeFileSync(`${this.filename}.tmp`,JSON.stringify({version:1,...this.data},null,2),'utf8');
    for(let attempt=0;;attempt++){
      try{fs.renameSync(`${this.filename}.tmp`,this.filename);break;}
      catch(e){if(process.platform!=='win32'||!['EPERM','EACCES','EBUSY'].includes((e as NodeJS.ErrnoException).code??'')||attempt===4)throw e;
        // Virus scanners can briefly hold a just-written file on Windows.
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,15*(attempt+1));
      }
    }
  }
  snapshot():Snapshot { return structuredClone(this.data); }
}
