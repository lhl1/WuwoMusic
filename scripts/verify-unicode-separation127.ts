/** Controlled negative/positive native regression; no GUI or formal profile access. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {SeparationService,runAudioWorker} from '../electron/separation';
const dir=path.resolve('artifacts/separation127/中文 缓存'),resources=path.resolve('build/separation'),input=path.join(dir,'dry.wav');
await fs.mkdir(dir,{recursive:true});
const b=Buffer.alloc(44+44100*4);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(44100,24);b.writeUInt32LE(176400,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);for(let n=0;n<44100;n++){const value=Math.round(3500*Math.sin(n*2*Math.PI*220/44100));b.writeInt16LE(value,44+n*4);b.writeInt16LE(value,46+n*4);}await fs.writeFile(input,b);
const report:any={date:new Date().toISOString(),platform:process.platform},events:Record<string,unknown>[]=[];
try{await runAudioWorker(path.join(resources,'sherpa-onnx-offline-source-separation.exe'),['--print-args=false','--num-threads=2','--spleeter-vocals='+path.join(resources,'vocals.fp16.onnx'),'--spleeter-accompaniment='+path.join(resources,'accompaniment.fp16.onnx'),'--input-wav='+input,'--output-vocals-wav='+path.join(dir,'old-vocals.wav'),'--output-accompaniment-wav='+path.join(dir,'old-accompaniment.wav')],new AbortController().signal,undefined,{stage:'旧版绝对路径',diagnostic:(_event,fields)=>events.push(fields)});report.oldCallFailed=false;}
catch{report.oldCallFailed=true;report.oldExitCode=events.at(-1)?.code;report.nativeCouldNotOpenUnicodeInput=/does not exist|Failed to read/.test(String(events.at(-1)?.output));}
const service=new SeparationService(path.join(dir,'修复后缓存'),resources,path.resolve('build/hifi/mpv.exe'),()=>{});
try{const output=await service.prepare({file:input,key:'unicode-regression'},'unicode-reproduction');report.fixedOutputBytes=(await fs.stat(output)).size;report.fixedCallPassed=report.fixedOutputBytes>68;assert.ok(report.fixedCallPassed);if(process.platform==='win32')assert.ok(report.oldCallFailed&&report.nativeCouldNotOpenUnicodeInput);report.passed=true;}
finally{await service.dispose();await fs.writeFile('docs/evidence/separation127-regression.json',JSON.stringify(report,null,2)+'\n');}
