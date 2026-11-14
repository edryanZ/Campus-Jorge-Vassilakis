'use strict';
// Testes sem banco ou deploy. Registros estritamente fictícios.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

function createCompletionFixture(options = {}) {
  const source = read('audit-app.js');
  const start = source.indexOf('  async function completeAudit() {');
  const end = source.indexOf('  function statusLabel(', start);
  assert.ok(start >= 0 && end > start);
  const section = source.slice(start, end);
  return new Function('options', `
    let audit = { auditId:'AUDITORIA-FICTICIA-PARA-TESTE', status:'IN_PROGRESS',
      environmentId:'SALA-FICTICIA-PARA-TESTE', data:{identification:{inspector:'FICTICIO'}},
      evidenceIds:[],nonConformities:[],completedAt:null };
    let editorUserId = 'AUDITOR-FICTICIO-PARA-TESTE';
    let environment = {environmentId:'SALA-FICTICIA-PARA-TESTE'};
    const modal = {hidden:false};
    const content = {innerHTML:'',querySelector(){return {isConnected:false,addEventListener(){}}}};
    let completionInFlight = false, isDirty = false, stepIndex = 0, errors = 0;
    let writes=0, notifications=0;
    const evidenceSaveFinished = Promise.resolve();
    const localSaveQueue = Promise.resolve();
    const AUDIT_VALIDATION = {review(){return {valid:true,errors:[]}}};
    const AUDIT_DATA = {STATUS:{COMPLETED:'COMPLETED'},STEPS:[{id:'identification'}]};
    const AUDIT_STORAGE = {async saveAudit(record){
      writes++;
      if(options.onLocalWrite) await options.onLocalWrite(record);
    }};
    const AUDIT_REMOTE = {configured:Boolean(options.remote),async syncAudit(record){
      if(options.onRemoteWrite) await options.onRemoteWrite(record);
      return {synced:true,audit:{...record,lastSyncedAt:'2026-11-14T13:00:00Z'}};
    }};
    const navigator = {onLine:true};
    const saveState = {textContent:''};
    const now = () => '2026-11-14T13:00:00Z';
    const markDirty = () => {isDirty=true;};
    const captureForm = () => {};
    const scheduleSave = () => {};
    const renderStep = () => {};
    const showLocalSaveError = () => {errors++};
    const escapeHtml = value => String(value);
    const window = {alert(){},dispatchEvent(){notifications++}};
    const closeModal = () => {};
    class Event {constructor(name){this.type=name}}
    ${section}
    return {
      complete:completeAudit,
      switchAccount(){modal.hidden=true;editorUserId=null;audit=null;environment=null;},
      state(){return {writes,notifications,errors,visible:content.innerHTML,
        currentAuditId:audit?.auditId,completionInFlight,saveState:saveState.textContent}}
    };
  `)(options);
}

test('dois cliques em Concluir executam uma única gravação', async () => {
  let release;
  let started;
  const startedPromise = new Promise(resolve => {started=resolve});
  const gate = new Promise(resolve => {release=resolve});
  const fixture = createCompletionFixture({async onLocalWrite(){started();await gate;}});
  const first = fixture.complete();
  await startedPromise;
  const second = fixture.complete();
  assert.equal(fixture.state().writes,1);
  assert.equal(fixture.state().completionInFlight,true);
  release();
  await Promise.all([first,second]);
  assert.equal(fixture.state().writes,1);
  assert.equal(fixture.state().completionInFlight,false);
  assert.match(fixture.state().visible,/Auditoria concluída/);
});

test('resposta remota de outra sessão não reapresenta dados privados', async () => {
  let release;
  let started;
  const startedPromise=new Promise(resolve=>{started=resolve});
  const gate=new Promise(resolve=>{release=resolve});
  const fixture=createCompletionFixture({remote:true,async onRemoteWrite(){started();await gate;}});
  const pending=fixture.complete();
  await startedPromise;
  fixture.switchAccount();
  release();
  await pending;
  assert.equal(fixture.state().currentAuditId,undefined);
  assert.doesNotMatch(fixture.state().visible,/Auditoria concluída/);
  assert.equal(fixture.state().completionInFlight,false);
});

test('confirmação remota com novo objeto mantém mensagem de conclusão', async () => {
  const fixture=createCompletionFixture({remote:true});
  await fixture.complete();
  assert.match(fixture.state().visible,/Auditoria concluída/);
  assert.match(fixture.state().saveState,/Supabase/);
});

test('service worker ignora recursos com query e páginas desconhecidas', () => {
  const handlers={};
  const mocked={
    URL, console,
    self:{registration:{scope:'https://campus.example/'},
      location:{origin:'https://campus.example'},
      addEventListener(name,fn){handlers[name]=fn}},
    caches:{},
    fetch:()=>{}
  };
  vm.runInNewContext(read('sw.js'),mocked);
  for(const url of [
    'https://campus.example/audit-app.js?access_token=FICTICIO',
    'https://campus.example/pagina-privada',
    'https://campus.example/styles.css?code=FICTICIO'
  ]){
    let served=false;
    handlers.fetch({request:{url,method:'GET',mode:'cors'},respondWith(){served=true}});
    assert.equal(served,false,url);
  }
});

test('arquivos essenciais mantêm sintaxe válida', () => {
  for(const path of ['audit-app.js','audit-remote.js','audit-backup.js','sw.js'])
    assert.doesNotThrow(()=>new vm.Script(read(path),{filename:path}));
});


test('solicitações administrativas antigas não reaparecem após troca de conta', async () => {
  const app=read('audit-app.js');
  const start=app.indexOf('  async function loadAccessRequests() {');
  const end=app.indexOf('  async function reviewRequest(', start);
  assert.ok(start>=0 && end>start);
  let resolveQuery;
  const serverReply=new Promise(resolve=>{resolveQuery=resolve});
  const build=new Function('listAccessRequests', `
    let currentAccess={admin:true,offline:false};
    let authGeneration=1;
    const adminPanel={hidden:false};
    const adminList={elements:[],replaceChildren(){this.elements=[]},append(v){this.elements.push(v)}};
    const adminStatus={textContent:''};
    const AUDIT_REMOTE={listAccessRequests};
    const document={createElement(){return {addEventListener(){},append(){}}}};
    const reviewRequest=()=>{};
    ${app.slice(start,end)}
    return {
      load:loadAccessRequests,
      switchAccount(){
        authGeneration++;
        currentAccess=null;
        adminPanel.hidden=true;
        adminList.replaceChildren();
        adminStatus.textContent='';
      },
      state(){return {count:adminList.elements.length,status:adminStatus.textContent}}
    };
  `);
  const fixture=build(()=>serverReply);
  const task=fixture.load();
  fixture.switchAccount();
  resolveQuery([{display_name:'USUÁRIO FICTÍCIO PARA TESTE',email:'test@example.invalid'}]);
  await task;
  assert.equal(fixture.state().count,0);
  assert.equal(fixture.state().status,'');
});

test('solicitações de participação não reabrem dados de antigo administrador', async () => {
  const app=read('audit-app.js');
  const start=app.indexOf('  async function loadAuditParticipationRequests() {');
  const end=app.indexOf('  async function reviewAuditParticipation(',start);
  assert.ok(start>=0&&end>start);
  let resolveQuery;
  const serverReply=new Promise(resolve=>{resolveQuery=resolve});
  const build=new Function('listRequests', `
    let currentAccess={admin:true,offline:false};
    let authGeneration=1;
    const adminPanel={hidden:false};
    const participationStatus={textContent:''};
    const participationList={elements:[],replaceChildren(){this.elements=[]},append(v){this.elements.push(v)}};
    const AUDIT_REMOTE={listAuditParticipationRequests:listRequests};
    const AUDIT_DATA={getEnvironment(){return null}};
    const document={createElement(){return {addEventListener(){},append(){}}}};
    const reviewAuditParticipation=()=>{};
    ${app.slice(start,end)}
    return {
      load:loadAuditParticipationRequests,
      switchAccount(){authGeneration++;currentAccess=null;adminPanel.hidden=true;participationList.replaceChildren();participationStatus.textContent='';},
      state(){return {count:participationList.elements.length,status:participationStatus.textContent}}
    };
  `);
  const fixture=build(()=>serverReply);
  const task=fixture.load();
  fixture.switchAccount();
  resolveQuery([{requester_name:'USUÁRIO FICTÍCIO PARA TESTE'}]);
  await task;
  assert.equal(fixture.state().count,0);
  assert.equal(fixture.state().status,'');
});
