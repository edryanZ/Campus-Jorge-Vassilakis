'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = filename => fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');

function validate(record) {
  const context = {};
  vm.runInNewContext(read('audit-validation.js'), context);
  return JSON.parse(JSON.stringify(context.AUDIT_VALIDATION.review(record)));
}
const baseRecord = () => ({
  status:'IN_PROGRESS', data:{
    identification:{inspector:'Auditor de teste',date:'2026-11-13'},
    lighting:{notes:'Registrado na sala'},
    airConditioning:{hasAC:'Não'},
    equipment:{notes:'Sem equipamentos disponíveis'},
    waterWaste:{hasHydraulics:'Não'},
    conditions:{naturalLight:'Adequado'},
    infrastructure:{notes:'Avaliado em campo'},
    review:{conclusion:'Avaliação parcial, conforme observações'}
  },
  reviewedSteps:{
    lighting:true,airConditioning:true,equipment:true,
    waterWaste:true,conditions:true,infrastructure:true,nonConformities:true
  }
});

test('conclusão é bloqueada sem revisão das seções', () => {
  const item = baseRecord();
  item.reviewedSteps.waterWaste = false;
  const result = validate(item);
  assert.equal(result.valid,false);
  assert.equal(result.firstStep,'waterWaste');
  assert.match(result.errors[0].message,/Água e resíduos/);
});

test('etapa confirmada sem coleta nem justificativa continua pendente', () => {
  const item = baseRecord();
  item.data.lighting = {};
  const result = validate(item);
  assert.equal(result.valid,false);
  assert.equal(result.firstStep,'lighting');
});

test('revisão completa não exige classificação automática ou medições inventadas', () => {
  const result = validate(baseRecord());
  assert.equal(result.valid,true);
  assert.equal(result.errors.length,0);
});

test('falta de auditor, data ou conclusão impede conclusão', () => {
  const item = baseRecord();
  item.data.identification.inspector = '';
  item.data.identification.date = '';
  item.data.review.conclusion = '';
  const result = validate(item);
  assert.equal(result.valid,false);
  assert.ok(result.errors.some(e => e.step==='identification'));
  assert.ok(result.errors.some(e => e.step==='review'));
});

test('backup gera ZIP com manifesto e bytes integrais das fotos', async () => {
  const noop = { addEventListener(){}, disabled:false, textContent:'' };
  const context = { document:{getElementById(){return noop}},
    TextEncoder,Blob,Uint32Array,DataView,ArrayBuffer,Uint8Array };
  vm.runInNewContext(read('audit-backup.js'), context);
  const zip = await context.AUDIT_BACKUP.buildZip([
    {name:'manifest.json',blob:new Blob(['{"ok":true}'])},
    {name:'fotografias/EVIDENCE-1.bin',blob:new Blob([new Uint8Array([1,2,3,4,5])])}
  ]);
  const bytes = new Uint8Array(await zip.arrayBuffer());
  const head = new DataView(bytes.buffer);
  assert.equal(head.getUint32(0,true),0x04034b50);
  assert.equal(head.getUint32(bytes.length-22,true),0x06054b50);
  assert.equal(head.getUint16(bytes.length-22+10,true),2);
  const filenameLength = head.getUint16(26,true);
  const firstSize = head.getUint32(22,true);
  const start = 30+filenameLength;
  assert.equal(new TextDecoder().decode(bytes.slice(start,start+firstSize)), '{"ok":true}');
  assert.equal(head.getUint32(14,true),0xA7D45F90); // CRC32 conhecido de {"ok":true}
});

test('interface integra os módulos; a PWA atualiza o cache', () => {
  const html = read('index.html'), sw=read('sw.js');
  assert.match(html, /id="exportAuditBackupBtn"/);
  assert.match(html, /audit-validation\.js/);
  assert.match(html, /audit-backup\.js/);
  assert.ok(html.indexOf('audit-validation.js') < html.indexOf('audit-app.js'));
  assert.match(sw, /campus-auditoria-v16-5/);
  assert.match(sw, /\.\/audit-validation\.js/);
  assert.match(sw, /\.\/audit-backup\.js/);
});

test('código protege finalização, salvamento e recuperação do dono', () => {
  const app=read('audit-app.js'), remote=read('audit-remote.js');
  const complete=app.slice(app.indexOf('async function completeAudit()'),app.indexOf('function statusLabel('));
  assert.ok(complete.indexOf('AUDIT_VALIDATION.review(audit)') < complete.indexOf('audit.status = AUDIT_DATA.STATUS.COMPLETED'));
  assert.match(app,/visibilitychange/);
  assert.match(app,/pagehide/);
  assert.match(app,/beforeunload/);
  assert.match(remote,/async function pullRemote\(\)/);
  assert.match(remote,/client\.from\('audits'\)\.select\('\*'\)\.eq\('owner_id', user\.id\)/);
  const sql=read('docs/seguranca/proposta-rls-20261113.sql');
  assert.match(sql,/CANCELADA/);
  assert.doesNotMatch(sql,/^drop policy/gm);
});

test('JavaScript de auditoria e cache são sintaticamente válidos', () => {
  for(const file of ['audit-app.js','audit-remote.js','audit-validation.js','audit-backup.js','sw.js'])
    assert.doesNotThrow(() => new vm.Script(read(file),{filename:file}));
});
