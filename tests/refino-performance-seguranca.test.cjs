'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

function method(source, from, until, parameters) {
  const start = source.indexOf(from);
  const end = source.indexOf(until, start);
  assert.ok(start >= 0 && end > start, 'Trecho não encontrado: ' + from);
  return new Function(...parameters, source.slice(start, end) + '; return ' +
    from.match(/function\s+([\w]+)/)[1] + ';');
}

test('formulário idêntico não cria novas mutações nem solicita salvamentos', () => {
  const source = read('audit-app.js');
  const record = { status:'IN_PROGRESS',data:{lighting:{total:'2'}},reviewedSteps:{} };
  const checkbox = {checked:false};
  const form = {
    values:{total:'2'},
    querySelector(q){return q==='[data-review-confirm]' ? checkbox : null}
  };
  const content = {querySelector(){return form}};
  let writes = 0, mutations = 0;
  const factory = method(source,'  function captureForm() {','  function hydrateForm()',[
    'audit','content','AUDIT_DATA','FormData','markDirty','toggleConditionalFields','scheduleSave','stepIndex'
  ]);
  const capture = factory(record,content,{STATUS:{COMPLETED:'COMPLETED'},STEPS:[{id:'lighting'}]},
    function FormData(){this.entries=()=>Object.entries(form.values)[Symbol.iterator]()},
    ()=>mutations++,()=>{},()=>writes++,0);
  capture();
  assert.equal(writes,0); assert.equal(mutations,0);
  form.values.total='3'; capture();
  assert.equal(record.data.lighting.total,'3');
  assert.equal(writes,1); assert.equal(mutations,1);
  capture();
  assert.equal(writes,1); assert.equal(mutations,1);
  checkbox.checked=true; capture();
  assert.equal(record.reviewedSteps.lighting,true);
  assert.equal(writes,2); assert.equal(mutations,2);
});

test('trocar etapa gera nova mutação e persiste a navegação', () => {
  const source = read('audit-app.js');
  const record={currentStep:0};
  let mutations=0, saves=0, renders=0;
  const factory=method(source,'  function navigate(delta) {','  function renderNonConformities()',[
    'audit','captureForm','AUDIT_DATA','markDirty','scheduleSave','renderStep','stepIndex'
  ]);
  const navigate=factory(record,()=>{}, {STEPS:[{id:'lighting'},{id:'equipment'}]},
    ()=>mutations++,immediate=>{assert.equal(immediate,true);saves++},()=>renders++,0);
  navigate(1);
  assert.equal(record.currentStep,1);
  assert.equal(mutations,1); assert.equal(saves,1);assert.equal(renders,1);
});

test('data de coleta rejeita dias inexistentes, aceita ano bissexto', () => {
  const env={};
  vm.runInNewContext(read('audit-validation.js'),env);
  const base={
    reviewedSteps:Object.fromEntries(['lighting','airConditioning','equipment','waterWaste',
      'conditions','infrastructure','nonConformities'].map(x=>[x,true])),
    data:{
      identification:{inspector:'Pessoa fictícia para teste',date:'2024-02-29'},
      lighting:{notes:'Coleta fictícia para teste'},
      airConditioning:{hasAC:'Não'},equipment:{notes:'Coleta fictícia para teste'},
      waterWaste:{hasHydraulics:'Não'},conditions:{noise:'Não avaliado'},
      infrastructure:{notes:'Coleta fictícia para teste'},review:{conclusion:'Teste fictício'}
    }
  };
  assert.equal(env.AUDIT_VALIDATION.review(base).valid,true);
  base.data.identification.date='2026-02-30';
  assert.equal(env.AUDIT_VALIDATION.review(base).valid,false);
  base.data.identification.date='2026-13-01';
  assert.equal(env.AUDIT_VALIDATION.review(base).valid,false);
});

test('service worker só remove caches deste projeto', async () => {
  const handlers={};const removed=[];
  const cacheName=read('sw.js').match(/const CACHE_NAME = '([^']+)'/)[1];
  const context={
    URL,console,
    caches:{
      async keys(){return ['outro-aplicativo-cache','campus-auditoria-v16-antigo',cacheName]},
      async delete(name){removed.push(name);return true}
    },
    self:{
      registration:{scope:'https://campus.example.com/'},
      location:{origin:'https://campus.example.com'},
      clients:{async claim(){}},async skipWaiting(){},
      addEventListener(name,callback){handlers[name]=callback}
    }
  };
  vm.runInNewContext(read('sw.js'),context);
  let action;
  handlers.activate({waitUntil(promise){action=promise}});
  await action;
  assert.deepEqual(removed,['campus-auditoria-v16-antigo']);
  let intercepted=false;
  handlers.fetch({request:{method:'GET',url:'https://campus.example.com/dados-privados.json',
    mode:'cors'},respondWith(){intercepted=true}});
  assert.equal(intercepted,false);
});

test('código removeu exportação antiga sem fotos e Auth redundante', () => {
  assert.doesNotMatch(read('audit-storage.js'),/async function exportAll\(/);
  assert.doesNotMatch(read('audit-remote.js'),/async function currentUser\(/);
  assert.match(read('audit-backup.js'),/const archive = await buildZip\(entries\)/);
  assert.match(read('audit-backup.js'),/currentUser\?\.id !== user\.id/);
  assert.match(read('patrimonio.js'),/openedForUserId && openedForUserId !== user\.id/);
  assert.match(read('audit-app.js'),/_event === 'TOKEN_REFRESHED'/);
});

test('interface móvel não tem estilos conflitantes no mapa e respeita movimento reduzido', () => {
  const css=read('styles.css');
  assert.equal((css.match(/\.map-panel \{ height: min\(58dvh, 570px\); min-height: 340px; \}/g)||[]).length,1);
  assert.equal((css.match(/\.map-panel \{ height: min\(72dvh, 710px\);/g)||[]).length,0);
  assert.match(css,/prefers-reduced-motion: reduce/);
  assert.match(read('app.js'),/mapUnlocked = !mapUnlocked;/);
});

test('arquivos JavaScript permanecem válidos e estrutura mantém serviços existentes', () => {
  for (const filename of ['app.js','audit-app.js','audit-storage.js','audit-remote.js',
    'audit-backup.js','audit-validation.js','patrimonio.js','campus-insights.js','sw.js'])
    assert.doesNotThrow(()=>new vm.Script(read(filename),{filename}));
  const html=read('index.html');
  for (const id of ['auditModal','authModal','assetModal','mapViewport','auditCenterModal','exportAuditBackupBtn'])
    assert.ok(html.includes('id="' + id + '"'),id);
});
