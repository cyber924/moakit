// Optimize PNG delivery in place, preserving the original URLs, dimensions and standard PNG MIME type.
// Full original images remain in public/assets; only generated deployment files are compressed.
import sharp from 'sharp';
import {readdir,readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('dist/client/assets');let before=0,after=0;
async function visit(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory()){await visit(p);continue;}if(!e.name.endsWith('.png')||(await stat(p)).size<150000)continue;const original=await readFile(p),optimized=await sharp(original).png({palette:true,quality:100,effort:7,dither:1}).toBuffer();if(optimized.length>=original.length)continue;await writeFile(p,optimized);before+=original.length;after+=optimized.length;}}
await visit(root);console.log('PNG delivery:',Math.round(before/1024/1024)+'MB → '+Math.round(after/1024/1024)+'MB; original URLs and image format preserved');
