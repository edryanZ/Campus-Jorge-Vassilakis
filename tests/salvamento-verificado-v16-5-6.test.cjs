'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = filename => fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
const context = {};
vm.runInNewContext(read('audit-sync-core.js'), context);
const core = context.AUDIT_SYNC_CORE;

const filled = {
  auditId: 'AUDIT-DADO-FICTICIO-PARA-TESTE',
  environmentId: 'BLOCO-A-SALA-2',
  status: 'IN_PROGRESS', currentStep: 3, serverRevision: 1,
  syncState: 'PENDING', mutationId: 'MUTATION-1', ownerId: 'FAKE-OWNER',
  updatedAt: '2026-11-16T10:00:00.000Z',
  data: { identification: { date: '2026-11-16', inspector: 'DADO FICTÍCIO PARA TESTE' },
    lighting: { total: '9', led: '4' } },
  reviewedSteps: {}, nonConformities: [], evidenceIds: []
};

test('respostas idênticas em outra ordem de propriedades são equivalentes', () => {
  const same = { ...filled, data: { lighting: { led: '4', total: '9' },
    identification: { inspector: 'DADO FICTÍCIO PARA TESTE', date: '2026-11-16' } } };
  assert.equal(core.hasSameCollectedPayload(filled, same), true);
});
test('nunca confirmar etapa, auditoria ou campo diferente', () => {
  assert.equal(core.hasSameCollectedPayload(filled, { ...filled, currentStep: 8 }), false);
  assert.equal(core.hasSameCollectedPayload(filled, { ...filled, auditId: 'OUTRO' }), false);
  assert.equal(core.hasSameCollectedPayload(filled, { ...filled, data: { lighting: { led: '4' } } }), false);
});
test('detectar perda parcial de respostas, não apenas formulário inteiramente vazio', () => {
  const partial = { ...filled, data: { identification: filled.data.identification, lighting: { led: '4' } } };
  assert.equal(core.hasRemovedAnswers(filled, partial), true);
  assert.equal(core.hasRemovedAnswers(filled, { ...filled, data: { ...filled.data, lighting: { total: '10', led: '5' } } }), false);
});
test('registrar perdas de fotografia ou não conformidade', () => {
  assert.equal(core.hasRemovedAnswers({ ...filled, evidenceIds: ['FOTO-FICTICIA'] }, filled), true);
  assert.equal(core.hasRemovedAnswers({ ...filled, nonConformities: [{}] }, filled), true);
});
test('ignorar alterações somente nas datas automáticas', () => {
  assert.equal(core.hasRemovedAnswers(
    { ...filled, data: { identification: { date: '2026-11-11', startTime: '08:20' } } },
    { ...filled, data: { identification: { date: '2026-11-16', startTime: '09:16' } } }), false);
});

function createDb(existing) {
  const saved = new Map(existing ? [[existing.auditId, structuredClone(existing)]] : []);
  const checkpoints = new Map();
  const db = {
    transaction(names) {
      assert.ok(names.includes('audits') && names.includes('conflicts'), 'checkpoint na mesma transação');
      const tx = {
        objectStore(name) {
          const map = name === 'audits' ? saved : checkpoints;
          return {
            get(key) {
              const request = { result: map.get(key) };
              Promise.resolve().then(() => {
                request.onsuccess?.();
                Promise.resolve().then(() => tx.oncomplete?.());
              });
              return request;
            },
            put(record) {
              map.set(name === 'audits' ? record.auditId : record.conflictId, structuredClone(record));
              return {};
            },
            getAll() {
              const request = { result: [...map.values()] };
              Promise.resolve().then(() => request.onsuccess?.());
              return request;
            }
          };
        }
      };
      return tx;
    }
  };
  return { db, saved, checkpoints };
}

test('excluir um valor cria checkpoint sem apagar o original do histórico', async () => {
  const source = read('audit-storage.js');
  const start = source.indexOf('async function saveAudit(record, options = {})');
  const end = source.indexOf('\n  const getEvidence', start);
  assert.ok(start >= 0 && end > start);
  const factory = new Function('AUDIT_SYNC_CORE', 'AUDIT_DATA', 'structuredClone', 'openDatabase', 'normalizeAudit', 'STORES',
    source.slice(start, end) + '; return saveAudit;');
  const fake = createDb(filled);
  const save = factory(core, { STATUS: { COMPLETED: 'COMPLETED' } }, structuredClone, async () => fake.db, structuredClone,
    { AUDITS: 'audits', CONFLICTS: 'conflicts' });
  const newer = { ...filled, mutationId: 'MUTATION-2',
    data: { ...filled.data, lighting: { total: '9', led: '' } } };
  await save(newer);
  assert.equal(fake.saved.get(filled.auditId).data.lighting.led, '');
  assert.equal(fake.checkpoints.size, 1);
  const archived = [...fake.checkpoints.values()][0];
  assert.equal(archived.localSnapshot.data.lighting.led, '4');
  assert.equal(archived.reason, 'LOCAL_FIELDS_REMOVED');
  assert.equal(archived.sourceAuditId, filled.auditId);
});

test('mudança normal de valor não cria checkpoint desnecessário', async () => {
  const source = read('audit-storage.js');
  const start = source.indexOf('async function saveAudit(record, options = {})');
  const end = source.indexOf('\n  const getEvidence', start);
  const factory = new Function('AUDIT_SYNC_CORE', 'AUDIT_DATA', 'structuredClone', 'openDatabase', 'normalizeAudit', 'STORES',
    source.slice(start, end) + '; return saveAudit;');
  const fake = createDb(filled);
  const save = factory(core, { STATUS: { COMPLETED: 'COMPLETED' } }, structuredClone, async () => fake.db, structuredClone,
    { AUDITS: 'audits', CONFLICTS: 'conflicts' });
  await save({ ...filled, mutationId: 'MUTATION-2', data: { ...filled.data, lighting: { total: '12', led: '5' } } });
  assert.equal(fake.checkpoints.size, 0);
});

test('avanço aguarda salvamento e não desmonta formulário antes do commit', () => {
  const app = read('audit-app.js');
  const start = app.indexOf('async function navigate(delta)');
  const end = app.indexOf('\n  function renderNonConformities()', start);
  const navigation = app.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(navigation, /await saveNow\(\{ scheduleRemote: false \}\)/);
  assert.ok(navigation.indexOf('await saveNow') < navigation.indexOf('stepIndex = nextStep'));
  assert.ok(navigation.lastIndexOf('await saveNow') < navigation.indexOf('renderStep()'));
  assert.match(navigation, /showLocalSaveError\(error\)/);
});

test('confirmação remota é checada em compartilhamento, gravação e finalização', () => {
  const remote = read('audit-remote.js');
  const occurrences = (remote.match(/await requireMatchingRemotePayload\(/g) || []).length;
  assert.equal(occurrences, 3);
  assert.match(remote, /REMOTE_PAYLOAD_MISMATCH/);
  assert.match(remote, /syncState: 'CONFLICT'/);
});

test('leitura após gravação também é exigida na conclusão', () => {
  const app = read('audit-app.js');
  assert.match(app, /const persistedCompleted = await AUDIT_STORAGE.getAudit/);
  assert.match(app, /hasSameCollectedPayload\(completingRecord, persistedCompleted\)/);
});

test('RPC divergente não recebe confirmação de sincronização e guarda conflito', async () => {
  const source = read('audit-remote.js');
  const start = source.indexOf('async function requireMatchingRemotePayload(');
  const end = source.indexOf('\n  async function syncSharedAuditOnce(', start);
  assert.ok(start >= 0 && end > start);
  const updates = [], conflicts = [];
  const remoteToLocal = row => ({ ...row.private_payload, auditId: row.id,
    environmentId: row.environment_id, status: row.status });
  const factory = new Function('AUDIT_SYNC_CORE', 'remoteToLocal', 'AUDIT_STORAGE', 'preserveConflict',
    source.slice(start, end) + '; return requireMatchingRemotePayload;');
  const verify = factory(core, remoteToLocal,
    { saveRemoteAcknowledgment: async (record, mutationId) => updates.push({ record, mutationId }) },
    async (...args) => conflicts.push(args));
  const expected = { ...filled };
  const matched = { id: expected.auditId, environment_id: expected.environmentId,
    status: expected.status, server_revision: 2, private_payload: expected };
  assert.equal((await verify(expected, matched, 'teste')).data.lighting.total, '9');
  assert.equal(updates.length, 0);
  const missing = { ...matched,
    private_payload: { ...expected, data: { ...expected.data, lighting: { led: '4' } } } };
  let failed = false;
  try { await verify(expected, missing, 'teste'); }
  catch (error) {
    failed = true;
    assert.match(error.message, /divergem/);
  }
  assert.equal(failed, true);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].record.syncState, 'CONFLICT');
  assert.equal(conflicts.length, 1);
});

function createNavigationHarness(saveLogic) {
  const app = read('audit-app.js');
  const start = app.indexOf('let navigationInFlight = false;');
  const end = app.indexOf('\n  function renderNonConformities()', start);
  assert.ok(start >= 0 && end > start);
  const factory = new Function('saveLogic', `
    let stepIndex = 0;
    let audit = { auditId: 'AUDIT-DADO-FICTICIO-PARA-TESTE', environmentId: 'BLOCO-A-SALA-2', currentStep: 0 };
    const environment = { environmentId: 'BLOCO-A-SALA-2' };
    const editorUserId = 'FAKE-USER';
    const modal = { hidden: false };
    const AUDIT_DATA = { STEPS: Array.from({ length: 9 }, () => ({})) };
    const buttons = [{ disabled: false, isConnected: true }, { disabled: false, isConnected: true }];
    const content = { querySelectorAll: () => buttons };
    let isDirty = false, saveTimer = null, alerts = [], renders = 0;
    const evidenceSaveFinished = Promise.resolve();
    const clearTimeout = () => {};
    const captureForm = () => { isDirty = true; };
    async function saveNow() {
      const response = await saveLogic();
      isDirty = false;
      return response;
    }
    const markDirty = () => { isDirty = true; };
    const renderStep = () => { renders += 1; };
    const showLocalSaveError = () => {};
    const window = { alert: message => alerts.push(message) };
    const AUDIT_REMOTE = { configured: false };
    const navigator = { onLine: true };
    const saveState = { textContent: '' };
    const structuredClone = value => JSON.parse(JSON.stringify(value));
    ${app.slice(start, end)}
    return {
      navigate,
      state: () => ({ stepIndex, currentStep: audit.currentStep,
        renders, alerts: alerts.length, disabled: buttons[0].disabled })
    };
  `);
  return factory(saveLogic);
}

test('não muda de etapa antes da confirmação de gravação local', async () => {
  let release;
  const pendingSave = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const testApp = createNavigationHarness(async () => {
    calls += 1;
    if (calls === 1) await pendingSave;
    return {};
  });
  const navigation = testApp.navigate(1);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(testApp.state().stepIndex, 0);
  release();
  await navigation;
  assert.equal(testApp.state().stepIndex, 1);
  assert.equal(testApp.state().renders, 1);
});

test('erro de gravação impede avanço e mantém formulário na tela', async () => {
  const testApp = createNavigationHarness(async () => { throw new Error('DADO FICTÍCIO PARA TESTE'); });
  await testApp.navigate(1);
  assert.equal(testApp.state().stepIndex, 0);
  assert.equal(testApp.state().renders, 0);
  assert.equal(testApp.state().alerts, 1);
  assert.equal(testApp.state().disabled, false);
});

test('toques concorrentes não avançam duas etapas', async () => {
  let calls = 0;
  const testApp = createNavigationHarness(async () => { calls += 1; return {}; });
  await Promise.all([testApp.navigate(1), testApp.navigate(1)]);
  assert.equal(testApp.state().stepIndex, 1);
  assert.equal(calls, 2);
});
