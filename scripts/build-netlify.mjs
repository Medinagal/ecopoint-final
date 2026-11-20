import './assemble.mjs';
const {default:worker}=await import('../worker/index.js');
import {mkdirSync,rmSync,writeFileSync} from 'node:fs';
rmSync('public',{recursive:true,force:true});
mkdirSync('public');
for(const [url,file] of [['/','index.html'],['/api-client.js','api-client.js']]) {
 const response=await worker.fetch(new Request('https://example.test'+url),{});
 if(!response.ok) throw new Error('Static asset build failed');
 writeFileSync('public/'+file,await response.text());
}
console.log('Netlify build ready: public assets + API function + database migration');
await import('./check-build.mjs');
