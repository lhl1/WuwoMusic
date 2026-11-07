import {parseBuffer,parseFile,type IAudioMetadata} from 'music-metadata';
import type {AudioInfo} from '../src/shared';
import type {Fetcher} from './provider';
import {abortable,bounded} from '../src/playback-control';
export function audioInfo(metadata:IAudioMetadata,size?:number):AudioInfo{
 const f=metadata.format,duration=f.duration;
 return {format:f.container?.toLowerCase(),codec:f.codec,bitrate:size&&duration?Math.round(size*8/duration/1000):f.bitrate?Math.round(f.bitrate/1000):undefined,sampleRate:f.sampleRate,bitsPerSample:f.bitsPerSample,channels:f.numberOfChannels,duration};
}
export async function inspectFile(file:string):Promise<AudioInfo>{return audioInfo(await parseFile(file,{duration:true,skipCovers:true}));}
export function flacHeader(bytes:Buffer,size?:number):AudioInfo|undefined{
 if(bytes.length<42||bytes.toString('ascii',0,4)!=='fLaC'||(bytes[4]&127)!==0)return;
 const packed=bytes.readBigUInt64BE(18),sampleRate=Number(packed>>44n),samples=Number(packed&0xfffffffffn),duration=sampleRate?samples/sampleRate:0;
 if(!sampleRate||!duration)return;
 return {format:'flac',codec:'FLAC',sampleRate,bitsPerSample:Number((packed>>36n)&31n)+1,channels:Number((packed>>41n)&7n)+1,duration,bitrate:size?Math.round(size*8/duration/1000):undefined};
}
export async function inspectStream(url:string,fetcher:Fetcher,parent?:AbortSignal):Promise<AudioInfo>{
 return bounded(async signal=>{
 const response=await fetcher(url,{headers:{Range:'bytes=0-65535'},signal});
 if(!response.ok||!response.body)throw Error('无法读取音频信息');
 const size=Number(response.headers.get('content-range')?.match(/\/(\d+)$/)?.[1]??(response.status===200?response.headers.get('content-length'):undefined))||undefined;
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0;
 try{while(length<65536){const {value,done}=await abortable(reader.read(),signal);if(done)break;const part=value.subarray(0,65536-length);chunks.push(part);length+=part.length;if(flacHeader(Buffer.concat(chunks),size))break;}}finally{void reader.cancel().catch(()=>{});}
 const bytes=Buffer.concat(chunks),flac=flacHeader(bytes,size);if(flac)return flac;
 const metadata=await parseBuffer(bytes,{mimeType:response.headers.get('content-type')??undefined,size},{skipCovers:true,duration:false});
 return audioInfo(metadata,size);
 },2500,'音频参数读取超时',parent);
}
