// Shared classroom database. A versioned compare-and-swap commits each business
// operation, ledger entry, audit event and idempotency result in one SQL update.
const ROOT='ecopoint-final-v1';
const STATE_SCHEMA_VERSION=2;
const roles=['res','col','mgr','adm'];
const emails=['resident@example.test','collector@example.test','manager@example.test','admin@example.test'];
const pt={pet:2,can:3,glass:4,battery:10},kg={pet:.03,can:.015,glass:.3,battery:.05};
const tariffs={pet:100,can:200,glass:40,battery:150}; // Demo points per kg, frozen per deposit.
const massKg=d=>Object.entries(d.qty).reduce((sum,[m,n])=>sum+(d.unit==='g'?n/1000:n*kg[m]),0);
const banks=['kaspi','halyk','freedom','forte','bereke','eurasian'];
const iso=()=>new Date().toISOString(),rnd=()=>crypto.randomUUID(),clone=x=>structuredClone(x);
const today=()=>new Date().toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'});
function fail(message,status=400){throw Object.assign(new Error(message),{status})}
function check(v,msg='Нет доступа',status=403){if(!v)fail(msg,status)}
function str(b,k,min=1,max=600){const s=b[k];check(typeof s==='string'&&s.trim().length>=min&&s.trim().length<=max,'Некорректное поле: '+k,400);return s.trim()}
function int(n,min,max){check(Number.isInteger(n)&&n>=min&&n<=max,'Недопустимое число',400);return n}
async function digest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('')}
async function hash(password,salt){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return Array.from(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},key,256)),n=>n.toString(16).padStart(2,'0')).join('')}
function state(){return {pts:1240,total:1240,kg:0,streak:0,wdSum:0,hist:[],cards:[],code:null}}
async function initial(env){
 check(typeof env.EP_BOOTSTRAP_PASSWORD==='string'&&env.EP_BOOTSTRAP_PASSWORD.length>=16&&env.EP_BOOTSTRAP_PASSWORD.length<=128,'Администратор должен настроить учебные аккаунты',503);
 const users=[];
 for(let i=0;i<5;i++){const salt=rnd();users.push({id:i+1,e:i===4?'resident2@example.test':emails[i],r:i===4?'res':roles[i],salt,password:await hash(env.EP_BOOTSTRAP_PASSWORD,salt),blocked:false,deleted:false,scope:i===2?[1,2,3]:CATALOG.stations.map(p=>p.id),state:state(),profile:{name:''},strikes:0})}
 return {schemaVersion:STATE_SCHEMA_VERSION,users,stations:clone(CATALOG.stations),camps:[],log:[],tickets:[],ratings:{},deposits:{},payouts:{},ledger:[],audit:[],deletionRequests:[],sessions:{},loginFailures:{},operations:{},nextUser:6};
}
function migrateState(db){
 if(db.schemaVersion>=STATE_SCHEMA_VERSION)return false;
 const collector=db.users.find(user=>user.id===2&&user.e===emails[1]&&user.r==='col'&&!user.deleted);
 if(collector?.scope.length===3&&[1,2,3].every(id=>collector.scope.includes(id))){
  collector.scope=db.stations.map(station=>station.id);
 }
 // Older versions cached full account-creation requests, including their password field.
 for(const [key,entry] of Object.entries(db.operations)){
  if(entry.signature?.includes('"action":"user.create"'))delete db.operations[key];
 }
 db.schemaVersion=STATE_SCHEMA_VERSION;
 return true;
}
async function readRoot(env){let row=await env.DB.prepare('SELECT body,version FROM ecopoint_state WHERE id=?').bind(ROOT).first();if(!row){await env.DB.prepare('INSERT OR IGNORE INTO ecopoint_state(id,version,body) VALUES(?,0,?)').bind(ROOT,JSON.stringify(await initial(env))).run();row=await env.DB.prepare('SELECT body,version FROM ecopoint_state WHERE id=?').bind(ROOT).first()}return row}
const scoped=(u,station)=>u.r==='adm'||u.scope.includes(station);
function audit(db,u,action,object,outcome,reason=''){db.audit.push({id:rnd(),at:iso(),uid:u?.id||null,role:u?.r||'anonymous',action,object,outcome,reason})}
function ledger(db,u,delta,type,reference){check(!db.ledger.some(x=>x.reference===reference&&x.type===type),'Операция уже записана',409);check(u.state.pts+delta>=0,'Недостаточно баллов',409);u.state.pts+=delta;db.ledger.push({id:rnd(),uid:u.id,delta,type,reference,at:iso(),unit:'points'})}
function transition(d,status){d.status=status;d.transitions.push({status,at:iso()})}
function credit(db,u,d){
 const station=db.stations.find(p=>p.id===d.station);let points=0;
 for(const [m,n]of Object.entries(d.qty)){
  check(station.acc.includes(m)||n===0,'Материал не поддерживается',400);
  const earned=d.unit==='g'?Math.floor(n*d.tariffs[m]*d.multiplier/1000):n*pt[m]*d.multiplier;
  points+=earned;
  if(n){u.state.kg=+(u.state.kg+(d.unit==='g'?n/1000:n*kg[m])).toFixed(4);u.state.hist.unshift({d:today(),at:iso(),event:d.id,m,n,unit:d.unit||'items',p:earned,st:'credited'})}
 }
 ledger(db,u,points,'deposit',d.id);u.state.total+=points;
 transition(d,'Accepted');transition(d,'Credit Pending');transition(d,'Points Credited');d.points=points;d.completed=true;
 const receipt=d.counts?{
  id:d.id,station:d.station,at:iso(),multiplier:d.multiplier,points,
  lines:Object.entries(d.qty).map(([material,grams])=>({
   material,grams,count:d.counts[material],rate:d.tariffs[material],
   points:Math.floor(grams*d.tariffs[material]*d.multiplier/1000)
  }))
 }:null;
 if(receipt)d.receipt=receipt;
 return {p:points,it:d.qty,unit:d.unit||'items',kg:massKg(d),card:null,a:0,receipt};
}
function snapshot(db,u){
 const s=clone(u.state),deposits=Object.values(db.deposits).filter(d=>u.r==='res'?d.uid===u.id:['adm','mgr'].includes(u.r)&&scoped(u,d.station));
 Object.assign(s,{tariffs,schemaVersion:2,updatedAt:iso(),user:u.r,uid:u.id,em:u.e,profile:u.profile,reserved:Object.values(db.payouts).filter(p=>p.uid===u.id&&p.status==='pending').reduce((a,p)=>a+p.points,0),stations:db.stations,rewards:CATALOG.rewards,camp:db.camps.some(c=>c.on),camps:db.camps.filter(c=>u.r==='adm'||u.r==='res'||c.stations.some(id=>scoped(u,id))),log:db.log.filter(l=>u.r==='res'||scoped(u,l.id)),deposits:deposits.map(d=>u.r==='mgr'?{id:d.id,station:d.station,status:d.status,at:d.at,qty:d.qty,source:d.source}:d),flags:deposits.filter(d=>['Pending Reconciliation','Flagged for Admin Review'].includes(d.status)).map(d=>u.r==='mgr'?{id:d.id,station:d.station,status:d.status}:d),strikes:u.strikes,scope:u.scope,tickets:db.tickets.filter(t=>u.r==='adm'||t.uid===u.id),ratings:u.r==='adm'?db.ratings:{[u.id]:db.ratings[u.id]||null},users:u.r==='adm'?db.users.filter(x=>!x.deleted).map(x=>({id:x.id,e:x.e,r:x.r,scope:x.scope})):[],blocked:u.r==='adm'?Object.fromEntries(db.users.map(x=>[x.id,x.blocked])):{},audit:u.r==='adm'?db.audit.slice(-200):[],deletionRequests:db.deletionRequests.filter(x=>u.r==='adm'||x.uid===u.id),payouts:Object.values(db.payouts).filter(p=>u.r==='adm'||p.uid===u.id)});
 if(['mgr','adm'].includes(u.r)){const accepted=Object.values(db.deposits).filter(d=>scoped(u,d.station)&&d.status==='Points Credited');s.stats={kg:+accepted.reduce((a,d)=>a+massKg(d),0).toFixed(4),issued:accepted.reduce((a,d)=>a+d.points,0),deposits:accepted.length,visits:db.log.filter(l=>scoped(u,l.id)).length,pending:deposits.filter(d=>['Pending Reconciliation','Flagged for Admin Review'].includes(d.status)).length};if(u.r==='adm'){s.stats.spent=-db.ledger.filter(l=>l.type==='reward').reduce((a,l)=>a+l.delta,0);s.stats.paid=db.users.reduce((a,x)=>a+x.state.wdSum,0)}}
 return s;
}
function authorize(db,token){const session=db.sessions[token];check(session&&session.expires>Date.now()&&session.lastSeen>Date.now()-30*60000,'Сессия истекла. Войдите снова.',401);const u=db.users.find(u=>u.id===session.uid&&!u.deleted&&!u.blocked);check(u,'Войдите в аккаунт',401);return u}
async function act(db,u,b,token){
 const s=u.state,allow=(...r)=>check(r.includes(u.r));
 const station=()=>{const p=db.stations.find(p=>p.id===b.station);check(p,'Станция не найдена',404);return p};
 const deposit=()=>{const d=db.deposits[b.session];check(d&&(u.r==='adm'||d.uid===u.id),'Сессия не найдена',404);return d};
 switch(b.action){
 case 'deposit.start':{
  allow('res');const p=station();check(p.f<95,'Станция заполнена',409);check(b.qr==='ES-'+p.id,'QR не соответствует станции',400);
  const scenario=b.scenario||'valid';check(['valid','incomplete','mismatch'].includes(scenario),'Неизвестный сценарий',400);
  check(b.grams===undefined&&b.counts===undefined,'Вес и количество определяет автомат',400);
  const simulated={pet:[2,64],can:[3,46],glass:[7,2100],battery:[2,96]};
  const qty=Object.fromEntries(p.acc.map(m=>[m,simulated[m][1]]));
  const counts=Object.fromEntries(p.acc.map(m=>[m,simulated[m][0]]));
  const id=rnd(),multiplier=db.camps.some(c=>c.on&&c.stations.includes(p.id))?2:1;
  db.deposits[id]={id,uid:u.id,station:p.id,qty,counts,scenario,multiplier,at:iso(),tariffs:clone(tariffs),source:'simulated scale; not a physical measurement',unit:'g',status:'Created',transitions:[{status:'Created',at:iso()}],expires:Date.now()+300000,completed:false};return {session:id,qty,counts,tariffs,multiplier,quote:Object.entries(qty).reduce((a,[m,n])=>a+Math.floor(n*tariffs[m]*multiplier/1000),0),simulation:true};
 }
 case 'deposit.feedback':{allow('res');const d=deposit();check(d.status==='Points Credited','Оценить можно только завершённую сдачу',409);check(typeof b.liked==='boolean','Выберите оценку',400);d.feedback={liked:b.liked,at:iso()};return {feedback:d.feedback}}
 case 'deposit.cancel':{allow('res');const d=deposit();check(d.status==='Created','Отменить можно только до отправки',409);transition(d,'Cancelled');return {}}
 case 'deposit.finish':{
  allow('res');const d=deposit();check(d.status==='Created'&&d.expires>Date.now(),'Сессия завершена или истекла',409);const p=db.stations.find(p=>p.id===d.station);check(p.f<95,'Станция заполнена',409);
  transition(d,'Pending Verification');p.f=Math.min(100,p.f+Math.max(.1,Math.round(massKg(d)*10)/10));p.updatedAt=iso();
  if(d.scenario!=='valid'){transition(d,'Pending Reconciliation');if(d.scenario==='mismatch')transition(d,'Flagged for Admin Review');return {pending:true,session:d.id,status:d.status}}
  return {last:credit(db,u,d)};
 }
 case 'deposit.reconcile':{allow('res');const d=deposit();check(d.status==='Pending Reconciliation','Сдача не ожидает сверки',409);check(b.evidence==='simulator-complete','Нужны подтверждённые данные симулятора',400);return {last:credit(db,u,d)}}
 case 'deposit.review':{allow('adm');const d=deposit();check(['Flagged for Admin Review','Pending Reconciliation'].includes(d.status),'Сдача не ожидает решения',409);check(['approve','reject'].includes(b.decision),'Неверное решение',400);d.decision={uid:u.id,reason:str(b,'reason',5,600),at:iso(),decision:b.decision};if(b.decision==='approve')credit(db,db.users.find(x=>x.id===d.uid),d);else transition(d,'Rejected');return {}}
 case 'withdraw':{allow('res');const points=int(b.points,500,10000000);check(banks.includes(b.bank)&&/^\d{4}$/.test(b.last4),'Введите банк и 4 тестовые цифры',400);const outcome=b.outcome||'success';check(['success','failure','pending'].includes(outcome),'Неверный результат',400);const id=rnd();ledger(db,u,-points,'payout.reserve',id);const p={id,uid:u.id,points,amount:Math.floor(points/2),currency:'KZT',status:'pending',at:iso()};db.payouts[id]=p;const h={id,d:today(),at:iso(),w:b.bank,l:b.last4,p:-points,a:p.amount,st:'p',simulation:true};s.hist.unshift(h);if(outcome!=='pending')settle(db,u,p,outcome);return {withdrawal:h}}
 case 'payout.resolve':{allow('adm');const p=db.payouts[b.id];check(p&&p.status==='pending','Выплата не ожидает решения',409);check(['success','failure'].includes(b.outcome),'Неверный результат',400);str(b,'reason',5,600);settle(db,db.users.find(x=>x.id===p.uid),p,b.outcome);return {}}
 case 'redeem':{allow('res');const r=CATALOG.rewards.find(r=>r.id===b.reward);check(r,'Награда не найдена',404);const id=rnd();ledger(db,u,-r.c,'reward',id);s.code='DEMO-'+id.toUpperCase();s.hist.unshift({id,d:today(),at:iso(),r:r.id,p:-r.c,code:s.code,st:'issued'});return {}}
 case 'station.empty':{allow('col');const p=station();check(scoped(u,p.id),'Станция не назначена вашему аккаунту',403);check(b.qr==='ES-'+p.id,'QR не соответствует станции',400);check(b.confirmed===true,'Подтвердите вывоз',400);const visit=str(b,'visit',8,100);const old=db.log.find(l=>l.visit===visit);if(old){check(old.id===p.id&&old.uid===u.id,'Конфликт идентификатора вывоза',409);return {kg:old.kg}}check(p.f>0,'Станция уже пустая',409);const weight=+(p.f*1.2).toFixed(2);db.log.unshift({visit,uid:u.id,at:iso(),d:today(),t:iso().slice(11,16),id:p.id,f:p.f,kg:weight,unit:'kg',source:'estimated'});p.f=0;p.updatedAt=iso();return {kg:weight}}
 case 'campaign.create':{allow('mgr');const stations=b.stations||u.scope;check(Array.isArray(stations)&&stations.length>0&&stations.every(id=>scoped(u,id)&&db.stations.some(p=>p.id===id)),'Станция вне области доступа',403);db.camps.push({id:rnd(),n:str(b,'name',1,80),on:true,stations,uid:u.id,at:iso()});return {}}
 case 'campaign.toggle':{allow('mgr');const c=b.id?db.camps.find(c=>c.id===b.id):db.camps[int(b.index,0,db.camps.length-1)];check(c&&c.stations.every(id=>scoped(u,id)));c.on=!c.on;return {}}
 case 'ticket.create':{check(['app','pts','st','acc','oth'].includes(b.cat),'Неверная категория',400);const t={id:'EP-'+rnd().toUpperCase(),uid:u.id,em:u.e,cat:b.cat,sub:str(b,'sub',3,80),txt:str(b,'txt',10,600),d:iso(),st:'new',rep:[]};db.tickets.unshift(t);return {ticket:t}}
 case 'ticket.reply':case 'ticket.status':{allow('adm');const t=db.tickets.find(t=>t.id===b.id);check(t,'Обращение не найдено',404);if(b.action==='ticket.reply'){t.rep.push({t:str(b,'text',1,2000),d:iso()});t.st='prog'}else{check(['new','prog','done'].includes(b.status),'Неверный статус',400);t.st=b.status}return {}}
 case 'rating':db.ratings[u.id]={s:int(b.score,1,5),c:str(b,'comment',0,400),d:iso()};return {};
 case 'profile.update':u.profile={...u.profile,name:str(b,'name',1,80)};return {};
 case 'profile.password':{
  allow('res');
  const current=str(b,'currentPassword',1,128),next=str(b,'newPassword',12,128);
  check(await hash(current,u.salt)===u.password,'Текущий пароль неверен',400);
  check(next!==current,'Выберите пароль, отличный от текущего',400);
  const salt=rnd();
  u.password=await hash(next,salt);
  u.salt=salt;
  for(const [key,session] of Object.entries(db.sessions))if(key!==token&&session.uid===u.id)delete db.sessions[key];
  return {};
 }
 case 'deletion.request':{let r=db.deletionRequests.find(x=>x.uid===u.id&&x.status==='pending');if(!r){r={id:rnd(),uid:u.id,status:'pending',at:iso()};db.deletionRequests.push(r)}return {request:r}}
 case 'user.create':{allow('adm');const email=str(b,'email',5,150).toLowerCase();check(/^[a-z0-9._+-]+@example\.test$/.test(email),'Используйте вымышленный адрес @example.test',400);check(!db.users.some(x=>x.e===email),'Аккаунт уже существует',409);check(roles.includes(b.role),'Неверная роль',400);const scope=b.scope||db.stations.map(p=>p.id);check(Array.isArray(scope)&&scope.every(id=>db.stations.some(p=>p.id===id)),'Неверная область доступа',400);const salt=rnd();db.users.push({id:db.nextUser++,e:email,r:b.role,salt,password:await hash(str(b,'password',12,128),salt),scope,blocked:false,deleted:false,state:state(),profile:{name:''},strikes:0});return {}}
 case 'user.block':case 'user.delete':case 'user.role':{allow('adm');const x=db.users.find(x=>x.id===b.id&&!x.deleted);check(x,'Аккаунт не найден',404);check(x.id!==u.id,'Нельзя изменить собственный доступ',409);str(b,'reason',5,600);if(b.action==='user.block')x.blocked=!x.blocked;else if(b.action==='user.role'){check(roles.includes(b.role),'Неверная роль',400);x.r=b.role}else{x.deleted=true;for(const r of db.deletionRequests.filter(r=>r.uid===x.id&&r.status==='pending')){r.status='account-disabled-records-retained';r.resolvedAt=iso()}}for(const [key,session]of Object.entries(db.sessions))if(session.uid===x.id)delete db.sessions[key];return {}}
 default:fail('Неизвестное действие',404);
 }
}
function settle(db,u,p,outcome){p.status=outcome;p.resolvedAt=iso();const h=u.state.hist.find(h=>h.id===p.id);if(outcome==='failure'){ledger(db,u,p.points,'payout.release',p.id);h.st='failed';h.p=0}else{ledger(db,u,0,'payout.complete',p.id);u.state.wdSum+=p.amount;h.st='d'}}
function response(data,status=200,cookie){const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};if(cookie)headers['Set-Cookie']=cookie;return new Response(JSON.stringify(data),{status,headers})}
async function api(request,env){
 const url=new URL(request.url),path=url.pathname;
 if(path==='/api/health'){
  try{
   const row=await env.DB.prepare('SELECT body,version FROM ecopoint_state WHERE id=?').bind(ROOT).first();
   return response({ok:true,simulation:true,schemaVersion:2,storage:env.STORAGE_NAME||'SQLite',initialized:!!row});
  }catch{
   return response({error:'База данных недоступна. Проверьте подключение и миграцию.'},503);
  }
 }
 check(['/api/login','/api/logout','/api/state','/api/action'].includes(path),'Не найдено',404);
 check(request.method===(path==='/api/state'?'GET':'POST'),'Метод не поддерживается',405);
 let b={};if(request.method==='POST'){check((request.headers.get('Content-Type')||'').split(';')[0]==='application/json','Ожидается JSON',415);const origin=request.headers.get('Origin');check(!origin||origin===url.origin,'Недопустимый Origin');const raw=await request.text();check(raw.length<=16384,'Запрос слишком большой',413);try{b=JSON.parse(raw)}catch{fail('Некорректный JSON')}check(b&&typeof b==='object'&&!Array.isArray(b),'Ожидается объект JSON',400)}
 const rawToken=(request.headers.get('Cookie')||'').match(/(?:^|;\s*)ep_session=([a-f0-9-]{72})/)?.[1],token=rawToken?await digest(rawToken):null;
 const secure=url.protocol==='https:'?'; Secure':'';
 for(let attempt=0;attempt<20;attempt++){
  const row=await readRoot(env),db=JSON.parse(row.body),migrated=migrateState(db);let out,status=200,cookie,u;
  if(path==='/api/login'){
   check(b.demo!==true,'Войдите с логином и паролем',401);const email=str(b,'email',5,150).toLowerCase(),password=str(b,'password',1,128),emailKey=await digest(email);
   const failure=db.loginFailures[emailKey];check(!failure||failure.count<8||failure.until<Date.now(),'Слишком много попыток. Повторите через 15 минут.',429);
   u=db.users.find(x=>x.e===email&&!x.deleted&&!x.blocked);const valid=await hash(password,u?.salt||'unknown-account')===(u?.password||'');
   if(!valid){db.loginFailures[emailKey]={count:failure&&failure.until>Date.now()?failure.count+1:1,until:Date.now()+15*60000};audit(db,null,'login',emailKey,'denied');out={error:'Неверный логин или пароль'};status=401}
   else{delete db.loginFailures[emailKey];if(token)delete db.sessions[token];for(const [k,v]of Object.entries(db.sessions))if(v.expires<Date.now()||v.lastSeen<Date.now()-30*60000)delete db.sessions[k];const raw=rnd()+rnd();db.sessions[await digest(raw)]={uid:u.id,expires:Date.now()+12*3600000,lastSeen:Date.now()};cookie=`ep_session=${raw}; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=43200`;audit(db,u,'login',u.id,'success');out=snapshot(db,u)}
  }else{
   u=authorize(db,token);
   const now=Date.now();
   // A polling client need not rewrite the whole shared row on every read.
   if(path==='/api/state'&&!migrated&&now-db.sessions[token].lastSeen<60_000){
    return response(snapshot(db,u));
   }
   db.sessions[token].lastSeen=now;
   if(path==='/api/logout'){delete db.sessions[token];cookie=`ep_session=; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=0`;out={ok:true}}
   else if(path==='/api/state')out=snapshot(db,u);
   else if(b.action==='profile.password'||b.action==='user.create'){
    try{await act(db,u,b,token);audit(db,u,b.action,u.id,'success');out={state:snapshot(db,u)}}
    catch(e){if(!e.status)throw e;audit(db,u,b.action,u.id,'denied',e.message);out={error:e.message};status=e.status}
   }else{
    const key=u.id+':'+str(b,'key',8,100),signature=JSON.stringify(Object.fromEntries(Object.entries(b).filter(([k])=>k!=='key').sort(([a],[b])=>a.localeCompare(b))));const old=db.operations[key];
    if(old){check(old.signature===signature,'Ключ использован с другим запросом',409);out={...old.out,state:snapshot(db,u)}}
    else{const before=clone(db);try{out=await act(db,u,b);audit(db,u,b.action,b.session||b.id||b.station||'', 'success',b.reason||'');db.operations[key]={signature,out:clone(out)};out.state=snapshot(db,u)}catch(e){if(!e.status)throw e;Object.assign(db,before);audit(db,u,b.action||'action',b.session||b.id||b.station||'','denied',e.message);out={error:e.message};status=e.status}}
   }
  }
  const saved=await env.DB.prepare('UPDATE ecopoint_state SET body=?,version=version+1 WHERE id=? AND version=?').bind(JSON.stringify(db),ROOT,row.version).run();if(saved.meta.changes===1)return response(out,status,cookie);
 }
 fail('Одновременное обновление. Повторите запрос с тем же ключом.',409);
}
export default {async fetch(request,env){try{const p=new URL(request.url).pathname;if(p.startsWith('/api/'))return await api(request,env);if(!['GET','HEAD'].includes(request.method))return response({error:'Метод не поддерживается'},405);const body=p==='/api-client.js'?CLIENT:p==='/'||p==='/index.html'?HTML:null;if(body===null)return response({error:'Не найдено'},404);return new Response(request.method==='HEAD'?null:body,{headers:{'Content-Type':p.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}})}catch(e){return response({error:e.status?e.message:'Ошибка сервера'},e.status||500)}}};
