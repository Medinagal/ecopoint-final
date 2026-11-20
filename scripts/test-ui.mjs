import {JSDOM} from 'jsdom';
import {runInContext} from 'node:vm';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import {localD1} from './d1-local.mjs';

const sql = new DatabaseSync(':memory:');
sql.exec(readFileSync('drizzle/0000_ecopoint.sql', 'utf8'));
const password = crypto.randomUUID() + crypto.randomUUID();
const env = {DB: localD1(sql), EP_BOOTSTRAP_PASSWORD: password};
const origin = 'https://example.test';
const html = await (await worker.fetch(new Request(origin), env)).text();
const client = await (await worker.fetch(new Request(origin + '/api-client.js'), env)).text();
const browsers = [];

async function browser(role) {
 const dom = new JSDOM(html, {url: origin, runScripts: 'outside-only', pretendToBeVisual: true});
 browsers.push(dom);
 const w = dom.window;
 const ev = source => runInContext(source, dom.getInternalVMContext());
 let cookie = '';
 const fetch = async (url, options = {}) => {
  const response = await worker.fetch(new Request(new URL(url, origin), {
   ...options, headers: {...options.headers, Origin: origin, Cookie: cookie}
  }), env);
  const setCookie = response.headers.get('Set-Cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  return response;
 };
 Object.assign(w, {fetch, Request, Response, Headers, TextEncoder, TextDecoder, structuredClone, AbortSignal});
 Object.defineProperty(w, 'crypto', {value: crypto});
 w.matchMedia = () => ({matches: false, addEventListener() {}});
 w.scrollTo = () => {};
 w.URL.createObjectURL = () => 'blob:test';
 w.URL.revokeObjectURL = () => {};
 for (const script of w.document.querySelectorAll('script:not([src])')) ev(script.textContent);
 ev(client);
 await new Promise(resolve => setImmediate(resolve));
 ev(`$('em').value='${role}@example.test';$('pw').value=${JSON.stringify(password)}`);
 for (const language of ['ru', 'en', 'kk']) {
  ev(`setLang('${language}')`);
  const button = w.document.querySelector('[aria-controls="pw"]');
  assert.equal(button.type, 'button');
  ev('toggleLoginPassword(document.querySelector("[aria-controls=pw]"))');
  assert.equal(w.document.getElementById('pw').type, 'text');
  assert.equal(w.document.getElementById('pw').value, password);
  ev('toggleLoginPassword(document.querySelector("[aria-controls=pw]"))');
  assert.equal(w.document.getElementById('pw').type, 'password');
 }
 ev("setLang('ru')");
 await ev('doLogin(null,true)');
 assert.ok(ev('S.user'));
 ev('dismissNotice()');
 return {ev, w};
}

async function refresh(browser) {
 for(let attempt=0;attempt<100&&browser.ev('supportSyncRunning');attempt++) {
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 await browser.ev('refreshSupport()');
}
try {
 const resident = await browser('resident');
 const second = await browser('resident2');
 const admin = await browser('admin');
 const collector = await browser('collector');
 const manager = await browser('manager');

 for (const [b, tabs] of [
  [resident, ['home', 'map', 'rew', 'hist', 'guide', 'set']],
  [collector, ['svc', 'map', 'set']],
  [manager, ['dash', 'camp', 'ver', 'map', 'set']],
  [admin, ['users', 'ver', 'map', 'sup', 'set']]
 ]) {
  for (const tab of tabs) {
   b.ev(`go('${tab}')`);
   assert.ok(b.w.document.querySelector('#scr .page-actions'));
   assert.ok(b.w.document.getElementById('scr').textContent.trim());
  }
 }

 resident.ev("go('set');S.sv='help';render();$('ss').value='Проверка станции';$('sd').value='Проверка общей очереди обращений'");
 await resident.ev('tkSend()');
 const ticket = resident.ev('S.tk.id');
 admin.ev("go('sup')");
 await refresh(admin);
 assert.match(admin.w.document.getElementById('scr').textContent, /Проверка станции/);
 admin.ev(`$('rp'+${JSON.stringify(ticket)}).value='Обращение проверено'`);
 await admin.ev(`tkReply('',${JSON.stringify(ticket)})`);
 await admin.ev(`tkSet('',${JSON.stringify(ticket)},'done')`);
 assert.doesNotMatch(admin.w.document.getElementById('scr').textContent, /Проверка станции/);
 admin.ev("S.sf='done';render()");
 assert.match(admin.w.document.getElementById('scr').textContent, /Проверка станции/);
 await refresh(resident);
 assert.equal(resident.ev('S.tk.st'), 'done');
 assert.equal(resident.ev('S.tk.rep[0].t'), 'Обращение проверено');
 await refresh(second);
 assert.equal(second.ev('backendState.tickets.length'), 0);

 second.ev("go('map');S.sel=5;render()");
 const before = second.ev('P.find(p=>p.id===5).f');
 resident.ev('openSt(5)');
 await resident.ev('depAuto()');
 assert.equal(resident.ev('S.step'), 'done');
 resident.ev('showDepositReceipt()');
 assert.match(resident.w.document.getElementById('ov').textContent, /Скачать чек/);
 await resident.ev('closeDep()');
 await resident.ev('sendDropFeedback(true)');
 await refresh(second);
 assert.ok(second.ev('P.find(p=>p.id===5).f') > before);
 collector.ev("go('map');S.sel=5;render()");
 assert.match(collector.w.document.getElementById('scr').textContent, /Обслужить терминал/);
 collector.ev('openAs(5)');
 assert.equal(collector.ev('asGot(P[0])'), false);
 assert.equal(collector.ev('S.as.step'), 'scan');
 assert.equal(collector.ev('asGot(parseTerm("ecopoint://terminal/5"))'), true);
 await collector.ev('asDone()');
 collector.ev('closeAs()');
 await refresh(second);
 assert.equal(second.ev('P.find(p=>p.id===5).f'), 0);

 resident.ev("go('set');$('profile-name').value='Тестовый житель'");
 await resident.ev('saveProfile()');
 assert.equal(resident.ev('backendState.profile.name'), 'Тестовый житель');
 resident.ev("openWd();S.wd.outcome='pending';wdBank('halyk');wdNum({value:'12x34'})");
 assert.equal(resident.ev("$('payout-outcome').value"), 'pending');
 const balance = resident.ev('S.pts');
 await resident.ev('wdGo()');
 assert.equal(resident.ev('S.wd.done.st'), 'p');
 assert.equal(resident.ev('S.pts'), balance - 500);
 resident.ev('wdClose()');
 await refresh(admin);
 const payout = admin.ev("backendState.payouts.find(p=>p.status==='pending').id");
 await admin.ev(`resolvePayout(${JSON.stringify(payout)},'failure')`);
 await refresh(resident);
 assert.equal(resident.ev('S.pts'), balance);

 resident.ev("go('set');S.sv='rate';render();rateStar(4);$('rc').value='Учебная проверка'");
 await resident.ev('rateSend()');
 assert.equal(resident.ev('backendState.ratings[backendState.uid].s'), 4);
 manager.ev("go('camp');$('cn').value='Учебная акция'");
 await manager.ev('cAdd()');
 assert.equal(manager.ev('S.camps.at(-1).on'), true);
 await manager.ev('cTog(S.camps.length-1)');
 assert.equal(manager.ev('S.camps.at(-1).on'), false);

 admin.ev("go('users');$('ne').value='new-collector@example.test';$('new-password').value='New-test-account-2026';S.nr='col'");
 await admin.ev('uAdd()');
 assert.equal(admin.ev("backendState.users.find(u=>u.e==='new-collector@example.test').r"), 'col');

 resident.ev("go('set');$('profile-current').value='incorrect';$('profile-new').value='Changed-password-2026';$('profile-repeat').value='Changed-password-2026'");
 await resident.ev('savePassword()');
 assert.match(resident.w.document.getElementById('ts').textContent, /Текущий пароль неверен/);
 resident.ev(`$('profile-current').value=${JSON.stringify(password)}`);
 await resident.ev('savePassword()');
 assert.match(resident.w.document.getElementById('ts').textContent, /Пароль изменён/);
 await resident.ev('logout()');
 resident.ev("$('em').value='resident@example.test';$('pw').value='Changed-password-2026'");
 await resident.ev('doLogin(null,true)');
 assert.equal(resident.ev('S.user'), 'res');

 console.log('PASS five independent UI sessions, four roles, page navigation, support, receipts, QR, shared fill, payouts, profile, password, ratings and campaigns');
} finally {
 for (const dom of browsers) dom.window.close();
 sql.close();
}
