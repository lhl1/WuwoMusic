import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../build/separation/',import.meta.url),manifest=JSON.parse(await fs.readFile(new URL('SHA256.json',root),'utf8'));
for(const [file,expected]of Object.entries(manifest.files)){const actual=createHash('sha256').update(await fs.readFile(new URL(file,root))).digest('hex');if(actual!==expected)throw Error('AI 声伴组件校验失败：'+file);}
console.log(`AI 声伴组件校验通过 (${Object.keys(manifest.files).length} 个文件)`);
