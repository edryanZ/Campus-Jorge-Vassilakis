'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const extract = (source, start, end) => {
  const from = source.indexOf(start), until = source.indexOf(end, from);
  assert.ok(from >= 0 && until > from, 'Não encontrado: ' + start);
  return source.slice(from, until);
};

test('troca de sala descarta abertura antiga antes de modificar o editor', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const factory = new Function('modal', 'title', 'AUDIT_STORAGE',
    'let environment = { environmentId: "SALA-A" };\n' +
    extract(read('audit-app.js'),
      '  async function openAuditLocked(target, owner, access) {',
      '  async function showActiveDraft(') +
    '\nreturn { openAuditLocked, switchTo(id) { environment = { environmentId:id }; } };');
  let lookups = 0;
  const editor = factory({ hidden:false }, {textContent:'Abrindo auditoria'}, {
    findActive() { lookups++; return pending; }
  });
  const operation = editor.openAuditLocked({environmentId:'SALA-A'}, 'USER-A', {});
  editor.switchTo('SALA-B');
  finish(null);
  await operation;
  assert.equal(lookups, 1);
  // A abertura antiga retorna sem criar rascunho ou pedir acesso remoto.
});

test('sincronização contabiliza envios confirmados mesmo se pull remoto falhar', async () => {
  const remote = read('audit-remote.js');
  const snippet = extract(remote, '  async function syncPending() {', '  async function signIn(');
  const events = [];
  const make = new Function(
    'getAccess','client','navigator','AUDIT_STORAGE','sessionUser',
    'syncAudit','pullRemote','dispatch','console',
    'let syncing = false; const attempts = new Map(); const approvedLocalAdoptions = new Map();\n' +
    snippet + '\nreturn syncPending;');
  const sync = make(
    async () => ({canAudit:true,offline:false}),
    {}, {onLine:true}, {
      async listPending(){return {audits:[{auditId:'AUDIT-FICTICIA'}],evidence:[]}},
      async getAudit(id){return {auditId:id,ownerId:'USER-A',localOwnerKey:null}}
    },
    async () => ({id:'USER-A'}),
    async () => ({synced:true}),
    async () => { throw Error('Servidor indisponível para recuperar'); },
    (name, data) => events.push({name,data}),
    {error(){},warn(){}}
  );
  const result = await sync();
  assert.equal(result.synced,1);
  assert.equal(result.failed,0);
  assert.match(result.recoveryError,/Servidor indisponível/);
  assert.equal(events.filter(e => e.name === 'audit:sync-end').length,1);
});

test('operação simultânea informa que a sincronização já está em curso', async () => {
  const remote = read('audit-remote.js');
  const snippet = extract(remote, '  async function syncPending() {', '  async function signIn(');
  const make = new Function('getAccess','client','navigator',
    'let syncing = true;\n'+snippet+'\nreturn syncPending;');
  const sync = make(async () => ({canAudit:true}),{}, {onLine:true});
  const result = await sync();
  assert.equal(result.skipped,true);
  assert.equal(result.reason,'ALREADY_SYNCING');
});

test('PWA não intercepta URLs desconhecidas nem guarda query de autenticação', async () => {
  const events = {};
  const writes = [];
  const context = {
    URL,
    console: {warn(){}},
    self: {
      location: {origin:'https://campus.example.com'},
      registration: {scope:'https://campus.example.com/'},
      addEventListener(name, handler){events[name] = handler;}
    },
    caches: {
      async match(){return undefined},
      async open(){return {async put(request){writes.push(request.url);}}}
    },
    fetch: async () => ({ok:true,clone(){return this}})
  };
  vm.runInNewContext(read('sw.js'),context);
  let intercepted = false;
  events.fetch({request:{
    method:'GET',mode:'navigate',url:'https://campus.example.com/relatorio-privado'
  },respondWith(){intercepted=true}});
  assert.equal(intercepted,false);
  let operation;
  events.fetch({request:{
    method:'GET',mode:'navigate',url:'https://campus.example.com/?code=CODIGO_FICTICIO'
  },respondWith(p){operation=p}});
  assert.ok(operation);
  await operation;
  assert.deepEqual(writes,[]);
});

test('rotinas de segurança continuam disponíveis e arquivos possuem sintaxe válida', () => {
  const remote = read('audit-remote.js'), app = read('audit-app.js');
  assert.match(remote,/recoveryError/);
  assert.match(app,/title\.textContent !== 'Abrindo auditoria'/);
  assert.match(app,/result\.reason === 'ALREADY_SYNCING'/);
  for (const file of ['audit-app.js','audit-remote.js','sw.js'])
    assert.doesNotThrow(() => new vm.Script(read(file),{filename:file}));
});
