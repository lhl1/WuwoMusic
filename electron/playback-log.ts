import fs from 'node:fs';
import path from 'node:path';
export class PlaybackLog {
 constructor(private file:string){}
 write(event:string,fields:Record<string,unknown>={}){try{fs.mkdirSync(path.dirname(this.file),{recursive:true});if(fs.existsSync(this.file)&&fs.statSync(this.file).size>1048576){fs.copyFileSync(this.file,this.file+'.previous');fs.writeFileSync(this.file,'');}fs.appendFileSync(this.file,JSON.stringify({time:new Date().toISOString(),event,...fields})+'\n');}catch{/* Logging must never interrupt music. */}}
}
