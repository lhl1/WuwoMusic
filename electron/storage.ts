import fs from 'node:fs';
import path from 'node:path';
import type { Snapshot } from '../src/shared';
import {appearanceDefaults} from '../src/preferences';

export class Store {
  data: Snapshot;
  constructor(public filename:string, musicDir:string) {
    this.data = {settings:{downloadDir:path.join(musicDir,'无我音乐'),concurrency:3,quality:'flac',qualityPolicyVersion:1,volume:0.75,zoom:1,proxyMode:'direct',audioOutput:'normal',audioDevice:'auto',...appearanceDefaults},library:{favorites:[],history:[],local:[],playlists:[]},tasks:[]};
    if(fs.existsSync(filename)) {
      try {
        const saved=JSON.parse(fs.readFileSync(filename,'utf8'));
        if(saved.version!==1) throw new Error('Unsupported state version');
        this.data.settings={...this.data.settings,...saved.settings};
        this.data.settings.proxyMode=saved.settings?.proxyMode==='system'?'system':'direct';
        // This release adopts lossless-first once; later explicit quality choices remain intact.
        if(saved.settings?.qualityPolicyVersion!==1)this.data.settings.quality='flac';
        if(saved.settings?.playerLayoutVersion!==2){this.data.settings.coverMode='record';this.data.settings.autoHotComments=false;this.data.settings.playerLayoutVersion=2;}
        this.data.library={...this.data.library,...saved.library};
        this.data.tasks=Array.isArray(saved.tasks)?saved.tasks:[];
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
