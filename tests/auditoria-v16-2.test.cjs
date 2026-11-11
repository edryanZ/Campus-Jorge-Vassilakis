'use strict';

// Testes sem rede, credenciais ou escrita no Supabase.
// Executar a partir da raiz do repositório:
// node --test tests/auditoria-v16-2.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const app = read('audit-app.js');

function snippet(start, end) {
  const from = app.indexOf(start);
  const until = app.indexOf(end, from);
  assert.ok(from >= 0 && until > from, `Trecho não encontrado: ${start}`);
  return app.slice(from, until);
}

test('módulos JavaScript possuem sintaxe válida', () => {
  for (const file of [
    'app.js', 'audit-app.js', 'audit-data.js', 'audit-remote.js',
    'audit-storage.js', 'audit-sync-core.js', 'campus-data.js',
    'supabase-config.js', 'sw.js'
  ]) assert.doesNotThrow(() => new Function(read(file)), file);
});

test('IDs HTML são únicos e referências DOM existem', () => {
  const html = read('index.html');
  const ids = [...html.matchAll(/\s+id=["']([^"']+)["']/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  const refs = [...(app + read('app.js')).matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)]
    .map(match => match[1]);
  for (const id of refs) assert.ok(ids.includes(id), `Elemento ausente: ${id}`);
});

test('data e hora inicial usam fuso local, mesmo após virada UTC', () => {
  const ctor = new Function('now', 'uid', 'Date', 'AUDIT_DATA', 'AUDIT_REMOTE',
    snippet('  function createAudit(', '  async function openAudit(') + 'return createAudit;');
  class FakeDate {
    getFullYear() { return 2026; }
    getMonth() { return 9; }
    getDate() { return 29; }
    getHours() { return 23; }
    getMinutes() { return 15; }
  }
  const create = ctor(() => '2026-10-30T03:15:00Z', () => 'AUDIT-TEST', FakeDate,
    { STATUS: { DRAFT: 'DRAFT' } }, { configured: true });
  const item = create({ environmentId: 'BLOCO-A-SALA-2' }, 'test-user');
  assert.equal(item.data.identification.date, '2026-10-29');
  assert.equal(item.data.identification.startTime, '23:15');
});

test('campos ambientais permitem medições decimais e contagens inteiras', () => {
  const field = new Function(
    snippet('  function field(', '  const yesNoNa') + 'return field;'
  )();
  for (const name of ['temperature', 'noiseDb', 'lux', 'installedPower', 'estimatedConsumption'])
    assert.match(field(name, name, 'number'), /step="any"/);
  assert.match(field('capacity', 'Capacidade', 'number'), /step="1" min="0"/);
});

test('não conformidade é persistida, limpa formulário e rejeita descrição vazia', () => {
  const bootstrap = new Function('AUDIT_DATA', 'uid', `
    let audit = {data:{nonConformities:{ncDescription:'texto antigo'}},nonConformities:[]};
    let dirty = 0, scheduled = 0, focus = 0, alerts = 0;
    const fields = {
      ncCategory:{value:'waste'}, ncPriority:{value:'MEDIUM'},
      ncDescription:{value:'Vazamento no corredor',focus(){focus++}},
      ncLocation:{value:'Corredor'}, ncRecommendation:{value:'Reparar'}, ncDeadline:{value:''}
    };
    const content = {querySelector(selector){return fields[selector.match(/name="([^"]+)"/)?.[1]];}};
    const window = {alert(){alerts++;}};
    const markDirty = () => dirty++;
    const scheduleSave = () => scheduled++;
    const renderStep = () => {};
    ${snippet('  function addNonConformity()', '  async function storeEvidence(')}
    return {run:addNonConformity, fields, state:()=>({audit,dirty,scheduled,focus,alerts})};
  `);
  const fixture = bootstrap({
    NON_CONFORMITY_CATEGORIES: ['waste'],
    PRIORITIES: ['MEDIUM']
  }, () => 'NC-TEST');
  fixture.run();
  assert.equal(fixture.state().audit.nonConformities.length, 1);
  assert.equal(fixture.state().dirty, 1);
  assert.equal(fixture.state().scheduled, 1);
  assert.deepEqual(fixture.state().audit.data.nonConformities, {});
  fixture.fields.ncDescription.value = '';
  fixture.run();
  assert.equal(fixture.state().audit.nonConformities.length, 1);
  assert.equal(fixture.state().focus, 1);
  assert.equal(fixture.state().alerts, 1);
});

test('conclusão espera imagem pendente antes de salvar', async () => {
  const setup = new Function(`
    let audit = {
      auditId:'AUDIT-TEST',status:'IN_PROGRESS',
      data:{identification:{inspector:'Teste autorizado'}},
      evidenceIds:[],nonConformities:[]
    };
    let releasePhoto;
    const evidenceSaveFinished = new Promise(resolve => {releasePhoto = resolve;});
    const saves = [];
    const content = {innerHTML:'',querySelector(){return {addEventListener(){}};}};
    const AUDIT_DATA = {STATUS:{COMPLETED:'COMPLETED'}};
    const AUDIT_REMOTE = {configured:false};
    const navigator = {onLine:false};
    const localSaveQueue = Promise.resolve();
    const AUDIT_STORAGE = {
      async saveAudit(record) {saves.push({status:record.status,photos:[...record.evidenceIds]});}
    };
    const saveState = {textContent:''};
    const now = () => '2026-10-29T21:00:00Z';
    const markDirty = () => {};
    const captureForm = () => {};
    const escapeHtml = value => String(value);
    const window = {alert(){}};
    const alert = () => {};
    let stepIndex = 8;
    const renderStep = () => {};
    const closeModal = () => {};
    ${snippet('  async function completeAudit()', '  function statusLabel(')}
    return {
      complete:completeAudit,
      finishPhoto(){audit.evidenceIds.push('PHOTO-TEST');releasePhoto();},
      state:()=>({saves,status:audit.status})
    };
  `)();
  const operation = setup.complete();
  await Promise.resolve();
  assert.equal(setup.state().saves.length, 0);
  assert.equal(setup.state().status, 'IN_PROGRESS');
  setup.finishPhoto();
  await operation;
  assert.deepEqual(setup.state().saves, [
    { status:'COMPLETED', photos:['PHOTO-TEST'] }
  ]);
});

test('histórico abre janela antes da consulta assíncrona e informa falhas', () => {
  const source = read('audit-app.js');
  const start = source.indexOf('  async function openHistory(mapId) {');
  const end = source.indexOf('  async function showPublicAudit(', start);
  assert.ok(start > 0 && end > start, 'Rotina de histórico ausente');
  const fn = source.slice(start, end);
  assert.ok(fn.indexOf('openModal();') < fn.indexOf('await AUDIT_REMOTE.getAccess()'),
    'Histórico deveria abrir antes da verificação remota');
  assert.match(fn, /Histórico indisponível/);
  assert.match(fn, /Tentar novamente/);
});

test('login responde antes de sincronizar os rascunhos pendentes', async () => {
  const remote = read('audit-remote.js');
  const start = remote.indexOf('  async function signIn(email, password) {');
  const end = remote.indexOf('  async function signOut()', start);
  assert.ok(start >= 0 && end > start);
  const tasks = [];
  let syncCount = 0;
  const login = new Function('client', 'setTimeout', 'syncPending',
    remote.slice(start, end) + 'return signIn;')(
      { auth: { async signInWithPassword() { return { data: { user: { id: 'test-user' } } }; } } },
      callback => { tasks.push(callback); },
      async () => { syncCount += 1; }
    );
  const user = await login('exemplo@unir.br', 'senha-de-teste');
  assert.equal(user.id, 'test-user');
  assert.equal(syncCount, 0, 'Não deve aguardar a sincronização antes de responder ao login');
  assert.equal(tasks.length, 1);
  await tasks[0]();
  assert.equal(syncCount, 1);
});

test('histórico usa consulta remota somente leitura e distingue cópia local', () => {
  const fn = snippet('  async function openHistory(mapId) {', '  async function showPublicAudit(');
  assert.match(fn, /listByEnvironment\(target\.environmentId\)/);
  assert.match(fn, /listPrivateHistory\(target\.environmentId\)/);
  assert.match(fn, /getPrivateHistoryRecord/);
  assert.match(fn, /Ver dados preenchidos/);
  assert.match(fn, /Ver dados no Supabase/);
  assert.doesNotMatch(fn, /pullRemote\(|saveAudit\(/,
    'Abrir o histórico não pode modificar automaticamente dados locais');
  assert.ok(fn.indexOf('renderHistory();') < fn.indexOf('AUDIT_REMOTE.listPrivateHistory'),
    'Os registros locais precisam aparecer antes da consulta remota');
  assert.match(fn, /if \(!access\?\.canAudit\)/,
    'Dados privados devem exigir autorização');
});

test('reabrir rascunho próprio não espera consulta remota', () => {
  const fn = snippet('  async function openAuditLocked(', '  // Exibe os campos efetivamente persistidos');
  assert.match(fn, /local\.ownerId === owner/);
  assert.ok(fn.indexOf('return showActiveDraft(local, owner, access);') < fn.indexOf('await AUDIT_REMOTE.findRemoteActive('));
  assert.match(fn, /AUDIT_REMOTE\.listActiveOccupancy\(/,
    'Novas auditorias continuam verificando a ocupação no servidor');
});

test('fechamento grava alterações visíveis e preserva a fila local', () => {
  const fn = snippet('  async function closeModal()', '  function renderStep()');
  assert.match(fn, /captureForm\(\)/);
  assert.match(fn, /await evidenceSaveFinished/);
  assert.match(fn, /saveNow\(\{ scheduleRemote: false \}\)/);
  assert.match(fn, /if \(isDirty\) throw/,
    'Não fechar com mudanças ainda não salvas');
});

test('histórico remoto é protegido por perfil e RLS, sem mesclagem automática', () => {
  const remote = read('audit-remote.js');
  const a = remote.slice(remote.indexOf('  async function listPrivateHistory('), remote.indexOf('  async function listPublic('));
  assert.match(a, /getAccess\(\)/);
  assert.match(a, /\.eq\('environment_id', environmentId\)/);
  assert.match(a, /\.limit\(50\)/);
  assert.match(a, /\.from\('audits'\)\.select\('\*'\)/);
  assert.doesNotMatch(a, /AUDIT_STORAGE\.saveAudit|pullRemote\(/);
});

test('consultas IndexedDB usam índice por sala e por auditoria, sem apagar conteúdo', () => {
  const storage = read('audit-storage.js');
  const rooms = storage.slice(storage.indexOf('  async function listByEnvironment('),
    storage.indexOf('  async function findActive('));
  assert.match(rooms, /store\.index\('environmentId'\)\.getAll\(environmentId\)/);
  assert.match(rooms, /store\.index\('auditId'\)\.getAll\(auditId\)/);
  assert.match(rooms, /NotFoundError/);
  assert.match(storage, /databasePromise = null/);
  assert.doesNotMatch(rooms, /\.clear\(|\.delete\(/);
});

test('Central mostra dados locais antes de consultar o Supabase', () => {
  const center = snippet('  async function openCenter() {', '  function closeCenter() {');
  assert.match(center, /const requestId = \+\+centerRequestId/);
  assert.match(center, /refresh\(\); \/\/ Não esperar o servidor/);
  assert.ok(center.indexOf('refresh(); // Não esperar o servidor') <
    center.indexOf('AUDIT_REMOTE.listAccessibleAudits().then('));
  assert.doesNotMatch(center, /await AUDIT_REMOTE\.listAccessibleAudits\(/);
  assert.doesNotMatch(center, /AUDIT_STORAGE\.saveAudit\(/);
});

test('o editor preserva a distinção entre falha de acesso e conta revogada', () => {
  const fn = snippet('  async function openAudit(mapId) {', '  async function openSharedAudit(');
  assert.match(fn, /Verificando sua conta/);
  assert.match(fn, /A sessão de/);
  assert.match(fn, /acesso desta conta foi revogado/i);
  assert.match(fn, /Falha ao verificar autorização/);
});
