import { build } from 'esbuild';
import {rm} from 'node:fs/promises';
// Bundle metadata parsers into the CommonJS main process entry.
await build({entryPoints:['electron/main.ts'],bundle:true,platform:'node',target:'node24',format:'cjs',outfile:'dist-electron/main.cjs',external:['electron'],sourcemap:true});
await Promise.all(['dist-electron/main.mjs','dist-electron/main.mjs.map'].map(file=>rm(file,{force:true})));
await build({entryPoints:['electron/preload.ts'],bundle:true,platform:'node',target:'node24',format:'cjs',outfile:'dist-electron/preload.cjs',external:['electron'],sourcemap:true});
