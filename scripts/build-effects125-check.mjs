import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {copyFile,mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);await mkdir('artifacts',{recursive:true});await copyFile(require.resolve('@soundtouchjs/audio-worklet/processor'),'artifacts/soundtouch-processor.js');
await build({entryPoints:['scripts/verify-effects125-renderer.ts'],bundle:true,platform:'browser',format:'iife',outfile:'artifacts/effects125-renderer.js',plugins:[{name:'processor-url',setup(b){b.onResolve({filter:/processor\?url$/},()=>({path:'processor',namespace:'url'}));b.onLoad({filter:/.*/,namespace:'url'},()=>({contents:"export default './soundtouch-processor.js'",loader:'js'}));}}]});
await build({entryPoints:['scripts/verify-effects125-electron.ts'],bundle:true,platform:'node',format:'cjs',external:['electron'],outfile:'artifacts/effects125.cjs'});
