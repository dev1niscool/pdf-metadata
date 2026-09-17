import { defineConfig } from 'vite';
import { cpSync } from 'node:fs';
export default defineConfig({ base: './', plugins: [{name:'pdf-assets',closeBundle(){for(const dir of ['cmaps','standard_fonts','wasm']) cpSync(`node_modules/pdfjs-dist/${dir}`,`dist/${dir}`,{recursive:true});}}] });
