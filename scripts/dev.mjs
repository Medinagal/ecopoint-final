import {localD1} from './d1-local.mjs';
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdirSync} from 'node:fs';
import worker from '../worker/index.js';
mkdirSync('.data',{recursive:true});const sql=new DatabaseSync('.data/ecopoint.sqlite');if(!sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ecopoint_state'").get())sql.exec(readFileSync('drizzle/0000_ecopoint.sql','utf8'));
const env={DB:localD1(sql),EP_BOOTSTRAP_PASSWORD:process.env.EP_BOOTSTRAP_PASSWORD,STORAGE_NAME:'SQLite'};
const server=createServer(async(req,res)=>{try{let body='';for await(const chunk of req)body+=chunk;const origin='http://'+req.headers.host;const r=await worker.fetch(new Request(origin+req.url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:body}),env);res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()))}catch(e){res.writeHead(500);res.end(String(e))}});
server.listen(Number(process.argv.includes('--port')?process.argv[process.argv.indexOf('--port')+1]:(process.env.PORT||5173)),'127.0.0.1',()=>console.log('EcoPoint preview ready'));
