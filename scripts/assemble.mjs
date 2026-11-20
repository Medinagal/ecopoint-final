import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
mkdirSync('worker',{recursive:true});
let html=readFileSync('src/index.html','utf8');
// The original anonymous QR route must not log the visitor in before API auth.
html=html.replace("render();route();addEventListener('hashchange',route);","render();addEventListener('hashchange',route);");
let client=readFileSync('src/api-client.js','utf8').replace('API + SQLite · станции и выплаты: DEMO','Сервер + база D1 · учебная демоверсия');
writeFileSync('worker/index.js','const HTML='+JSON.stringify(html)+';\nconst CLIENT='+JSON.stringify(client)+';\nconst CATALOG='+readFileSync('src/catalog.json','utf8')+';\n'+readFileSync('src/backend.js','utf8'));
