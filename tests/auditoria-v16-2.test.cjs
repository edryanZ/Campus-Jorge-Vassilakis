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
  const ids = [...html.matchAll(/\\s+id=["']([^"']+)["']/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  const refs = [...(app + read('app.js')).matchAll(/getElementById\\(['"]([^'"]+)['"]\\)/g)]
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
