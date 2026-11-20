import {createHandler} from '../netlify/lib/handler.js';
import {PGlite} from '@electric-sql/pglite';
import {postgresStore} from '../netlify/lib/postgres.js';
import {localD1} from './d1-local.mjs';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import worker from '../worker/index.js';
const directory=mkdtempSync(tmpdir()+'/ecopoint-'),dbFile=directory+'/test.sqlite';
const pg=process.argv.includes('--postgres');
let sql;
async function openDatabase(){
 if(pg){sql=new PGlite(directory+'/postgres');await sql.waitReady;}
 else sql=new DatabaseSync(dbFile);
}
await openDatabase();
await sql.exec(readFileSync(pg?'netlify/database/migrations/0001_ecopoint.sql':'drizzle/0000_ecopoint.sql','utf8'));
function store(){return pg?postgresStore(sql):localD1(sql)}
async function readFixture(){return pg?(await sql.query('SELECT body FROM ecopoint_state WHERE id=$1',['ecopoint-final-v1'])).rows[0]:sql.prepare('SELECT body FROM ecopoint_state WHERE id=?').get('ecopoint-final-v1')}
async function writeFixture(db){if(pg)await sql.query('UPDATE ecopoint_state SET body=$1,version=version+1 WHERE id=$2',[JSON.stringify(db),'ecopoint-final-v1']);else sql.prepare('UPDATE ecopoint_state SET body=?,version=version+1 WHERE id=?').run(JSON.stringify(db),'ecopoint-final-v1')}

const password=crypto.randomUUID()+crypto.randomUUID(),env={DB:store(),EP_BOOTSTRAP_PASSWORD:password};
const invoke=pg?createHandler(()=>env.DB,()=>env.EP_BOOTSTRAP_PASSWORD,()=>env):(req)=>worker.fetch(req,env);
const results=[];
async function test(id,fr,title,run){await run();results.push({id,fr,title,result:'PASS'});console.log(id+' PASS '+title)}
function client(){let cookie='';const call=async(path,b,headers={})=>{const r=await worker.fetch(new Request('https://example.com/api/'+path,{method:b?'POST':'GET',headers:{'Content-Type':'application/json',Cookie:cookie,Origin:'https://example.com',...headers},body:b?JSON.stringify(b):undefined}),env);if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')}};call.action=(action,b={})=>call('action',{action,key:crypto.randomUUID(),...b});call.login=name=>call('login',{email:name+'@example.test',password});return call}
const a=client(),a2=client(),b=client(),admin=client(),mgr=client(),col=client();
await test('AT-01','FR-01,FR-02','Authentication required; demo bypass rejected',async()=>{assert.equal((await a('state')).status,401);assert.equal((await a('login',{demo:true,role:'adm'})).status,401);assert.equal((await a('login',{email:'resident@example.test',password:'wrong'})).status,401);const login=await a.login('resident');assert.equal(login.status,200);assert.match(login.cookie,/HttpOnly; Secure; SameSite=Strict/);await a2.login('resident');await b.login('resident2');await admin.login('admin');await mgr.login('manager');await col.login('collector')});
const start=(c,station=1,scenario='valid')=>c.action('deposit.start',{station,qr:'ES-'+station,scenario});
let event,points;
await test('AT-02','FR-03,FR-04,FR-05','Station discovery, QR and explicit deposit completion',async()=>{assert.equal((await a('state')).data.stations.length,7);assert.equal((await a.action('deposit.start',{station:1,qr:'ES-2'})).status,400);const r=await start(a);assert.equal(r.status,200);event=r.data.session;assert.equal(r.data.state.pts,1240);const done=await a.action('deposit.finish',{session:event});assert.equal(done.status,200);points=done.data.last.p;assert.ok(points>0);assert.equal(done.data.state.deposits[0].status,'Points Credited')});
await test('AT-03','FR-06,FR-07','Same account across devices; other resident privacy',async()=>{assert.equal((await a2('state')).data.pts,1240+points);assert.equal((await b('state')).data.pts,1240);assert.equal((await b('state')).data.deposits.length,0);assert.equal((await b.action('deposit.finish',{session:event})).status,404)});
await test('AT-04','FR-08','Concurrent duplicate deposit creates one credit',async()=>{const s=await start(a),key=crypto.randomUUID(),before=(await a('state')).data.pts;const out=await Promise.all([a.action('deposit.finish',{session:s.data.session,key}),a2.action('deposit.finish',{session:s.data.session,key})]);assert.ok(out.every(r=>r.status===200));assert.equal((await a('state')).data.pts,before+out[0].data.last.p);assert.equal((await a.action('deposit.finish',{session:s.data.session,key,extra:true})).status,409)});
await test('AT-05','FR-09','Incomplete evidence: no points, no strike; reconciliation once',async()=>{const s=await start(a,1,'incomplete'),before=(await a('state')).data.pts;const r=await a.action('deposit.finish',{session:s.data.session});assert.equal(r.data.status,'Pending Reconciliation');assert.equal(r.data.state.pts,before);assert.equal(r.data.state.strikes,0);assert.equal((await a.action('deposit.reconcile',{session:s.data.session,evidence:'wrong'})).status,400);assert.equal((await a.action('deposit.reconcile',{session:s.data.session,evidence:'simulator-complete'})).status,200);assert.equal((await a.action('deposit.reconcile',{session:s.data.session,evidence:'simulator-complete'})).status,409)});
await test('AT-06','FR-10,FR-11','Admin review and rejection with reason; manager denied',async()=>{const s=await start(a,1,'mismatch');await a.action('deposit.finish',{session:s.data.session});assert.equal((await mgr.action('deposit.review',{session:s.data.session,decision:'approve',reason:'valid evidence'})).status,403);assert.equal((await admin.action('deposit.review',{session:s.data.session,decision:'reject',reason:''})).status,400);assert.equal((await admin.action('deposit.review',{session:s.data.session,decision:'reject',reason:'Evidence rejected in acceptance test'})).status,200);assert.equal((await a('state')).data.deposits.find(d=>d.id===s.data.session).status,'Rejected');const approved=await start(a,1,'mismatch');await a.action('deposit.finish',{session:approved.data.session});const before=(await a('state')).data.pts;await admin.action('deposit.review',{session:approved.data.session,decision:'approve',reason:'Simulator evidence checked'});assert.ok((await a2('state')).data.pts>before)});
await test('AT-07','FR-12','Rewards: atomic debit, unique code and insufficient funds',async()=>{const before=(await b('state')).data.pts;const out=await Promise.all([b.action('redeem',{reward:3}),b.action('redeem',{reward:3})]);assert.deepEqual(out.map(x=>x.status).sort(),[200,409]);assert.equal((await b('state')).data.pts,before-700);assert.match((await b('state')).data.code,/^DEMO-/)});
await test('AT-08','FR-13,FR-14','Collector QR, scope, idempotent visit and shared fill',async()=>{
 const empty=(client,station,fields={})=>client.action('station.empty',{station,qr:'ES-'+station,confirmed:true,visit:crypto.randomUUID(),...fields});
 assert.equal((await empty(a,5)).status,403);
 assert.equal((await empty(col,5,{qr:'ES-2'})).status,400);
 assert.equal((await empty(col,5,{confirmed:false})).status,400);
 const assigned=await admin.action('user.create',{email:'limited@example.test',role:'col',password,scope:[1]});
 assert.equal(assigned.status,200);
 const limited=client();
 assert.equal((await limited.login('limited')).status,200);
 assert.equal((await empty(limited,5)).status,403);
 assert.deepEqual((await col('state')).data.scope,[1,2,3,4,5,6,7]);
 const visit=crypto.randomUUID();
 assert.equal((await empty(col,5,{visit})).status,200);
 assert.equal((await empty(col,5,{visit})).status,200);
 assert.equal((await empty(col,5)).status,409);
 assert.equal((await a('state')).data.stations.find(p=>p.id===5).f,0);
 assert.equal((await a('state')).data.log.filter(l=>l.id===5).length,1);
 for(const {id,f} of (await col('state')).data.stations){
  if(id!==5&&f>0)assert.equal((await empty(col,id)).status,200,'Station '+id);
 }
 assert.ok((await a2('state')).data.stations.every(p=>p.f===0));
});
await test('AT-20','FR-13,FR-14','An already signed-in collector receives the upgraded scope without losing existing data',async()=>{
 const row=await readFixture();
 const db=JSON.parse(row.body);
 db.schemaVersion=1;
 db.operations.legacyCreate={signature:JSON.stringify({action:"user.create",password}),out:{}};
 db.users.find(u=>u.id===2).scope=[1,2,3];
 await writeFixture(db);
 assert.deepEqual((await col('state')).data.scope,[1,2,3,4,5,6,7]);
 const migrated=JSON.parse((await readFixture()).body);
 assert.equal(migrated.schemaVersion,2);
 assert.ok(!migrated.operations.legacyCreate);
 assert.ok(!JSON.stringify(migrated).includes(password));
 assert.deepEqual(migrated.users.find(u=>u.id===3).scope,[1,2,3]);
 assert.deepEqual(migrated.users.find(u=>u.e==='limited@example.test').scope,[1]);
 assert.deepEqual(migrated.log,db.log);
 assert.deepEqual(migrated.deposits,db.deposits);
});
await test('AT-09','FR-15,FR-16','Shared campaigns and scoped aggregate statistics',async()=>{assert.equal((await mgr.action('campaign.create',{name:'Wrong scope',stations:[7]})).status,403);await mgr.action('campaign.create',{name:'Test double',stations:[1]});const s=await start(b);const done=await b.action('deposit.finish',{session:s.data.session});assert.equal(done.data.last.p,2*(6+9+84));assert.equal(done.data.last.receipt.points,done.data.last.p);const st=(await mgr('state')).data;assert.ok(st.stats.issued>0);assert.equal(st.users.length,0);assert.ok(st.deposits.every(d=>d.uid===undefined));assert.ok(st.flags.every(d=>d.uid===undefined))});
await test('AT-10','FR-17,FR-18','Shared support and resident isolation',async()=>{const t=await a.action('ticket.create',{cat:'st',sub:'Test station',txt:'Synthetic station complaint'});await admin.action('ticket.reply',{id:t.data.ticket.id,text:'Synthetic reply'});assert.equal((await a2('state')).data.tickets[0].rep[0].t,'Synthetic reply');assert.equal((await b('state')).data.tickets.length,0);assert.equal((await b.action('ticket.reply',{id:t.data.ticket.id,text:'Forbidden'})).status,403);const id=t.data.ticket.id;assert.equal((await b.action('ticket.status',{id,status:'done'})).status,403);assert.equal((await admin.action('ticket.status',{id,status:'done'})).status,200);assert.equal((await a2('state')).data.tickets[0].st,'done')});
await test('AT-11','FR-19','Payout reservation, failure release, success, pending retry',async()=>{const before=(await a('state')).data.pts,key=crypto.randomUUID();const r=await a.action('withdraw',{points:500,bank:'kaspi',last4:'1234',outcome:'pending',key});assert.equal(r.data.state.reserved,500);await a2.action('withdraw',{points:500,bank:'kaspi',last4:'1234',outcome:'pending',key});assert.equal((await a('state')).data.pts,before-500);await admin.action('payout.resolve',{id:r.data.withdrawal.id,outcome:'failure',reason:'Simulator confirmed failure'});assert.equal((await a('state')).data.pts,before);assert.equal((await a('state')).data.reserved,0);const success=await a.action('withdraw',{points:500,bank:'kaspi',last4:'1234',outcome:'success'});assert.equal(success.data.withdrawal.st,'d');assert.equal((await a('state')).data.pts,before-500)});
await test('AT-12','FR-20,FR-21','Profile and tracked deletion requests across devices',async()=>{await a.action('profile.update',{name:'Synthetic name'});assert.equal((await a2('state')).data.profile.name,'Synthetic name');const d=await a.action('deletion.request');assert.equal(d.data.request.status,'pending');assert.equal((await admin('state')).data.deletionRequests.length,1)});
await test('AT-13','FR-22,FR-23','Account administration and session revocation',async()=>{const create=await admin.action('user.create',{email:'new@example.test',role:'res',password});assert.equal(create.status,200);const id=create.data.state.users.find(u=>u.e==='new@example.test').id,c=client();assert.equal((await c.login('new')).status,200);await admin.action('user.block',{id,reason:'Acceptance test block'});assert.equal((await c('state')).status,401);await admin.action('user.block',{id,reason:'Acceptance test unblock'});await c.login('new');await admin.action('user.role',{id,role:'col',reason:'Acceptance test role change'});assert.equal((await c('state')).status,401);assert.equal((await c.login('new')).data.user,'col');await admin.action('user.delete',{id,reason:'Acceptance test deletion'});assert.equal((await c.login('new')).status,401)});
await test('AT-14','FR-24','Durable state survives SQLite close and reopen',async()=>{const before=(await a('state')).data.pts;await sql.close();await openDatabase();env.DB=store();assert.equal((await a2('state')).data.pts,before)});
await test('AT-15','FR-25','Audit trail excludes passwords and cookie tokens',async()=>{const s=(await admin('state')).data;assert.ok(s.audit.some(x=>x.action==='deposit.review'&&x.reason));assert.ok(s.audit.some(x=>x.outcome==='denied'));assert.equal(JSON.stringify(s).includes(password),false);assert.equal(JSON.stringify(s).includes('"salt"'),false)});
await test('AT-16','FR-02','Cross-origin writes denied, session logout and login throttling',async()=>{assert.equal((await a('action',{action:'rating',score:5,comment:'x',key:crypto.randomUUID()},{Origin:'https://evil.example'})).status,403);await a2('logout',{});assert.equal((await a2('state')).status,401);for(let i=0;i<8;i++)await a2('login',{email:'unknown@example.test',password:'wrong'});assert.equal((await a2('login',{email:'unknown@example.test',password:'wrong'})).status,429)});
await test('AT-17','FR-04,FR-05','Cancelled and expired sessions never credit',async()=>{const s=await start(a);await a.action('deposit.cancel',{session:s.data.session});assert.equal((await a.action('deposit.finish',{session:s.data.session})).status,409);const x=await start(a),row=await readFixture(),db=JSON.parse(row.body);db.deposits[x.data.session].expires=0;await writeFixture(db);assert.equal((await a.action('deposit.finish',{session:x.data.session})).status,409)});
await test('AT-18','FR-03','Full station refusal uses shared server state',async()=>{const row=await readFixture(),db=JSON.parse(row.body);db.stations[0].f=95;await writeFixture(db);assert.equal((await start(a)).status,409);assert.equal((await b('state')).data.stations[0].f,95)});
await test('AT-19','FR-02','Absolute session expiry enforced',async()=>{const c=client();await c.login('resident2');const row=await readFixture(),db=JSON.parse(row.body);for(const s of Object.values(db.sessions))if(s.uid===5)s.expires=0;await writeFixture(db);assert.equal((await c('state')).status,401)});
await test('AT-21','OPERATIONS','Health checks database connectivity without creating users',async()=>{
 const req=new Request('https://example.com/api/health');
 const healthy=await invoke(req);
 assert.equal(healthy.status,200);
 assert.equal((await healthy.json()).ok,true);
 const unavailable=await worker.fetch(req,{DB:{prepare(){throw Error('database unavailable')}}});
 assert.equal(unavailable.status,503);
});
writeFileSync(pg?'test-results-postgres.json':'test-results.json',JSON.stringify({environment:process.version+(pg?' / PostgreSQL engine and Netlify handler':' / SQLite and Worker handler'),at:new Date().toISOString(),results},null,2));
await sql.close();rmSync(directory,{recursive:true});console.log(`${results.length} acceptance tests passed`);
