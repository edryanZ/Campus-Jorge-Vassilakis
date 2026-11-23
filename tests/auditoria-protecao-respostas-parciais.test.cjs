'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const context = {};
vm.runInNewContext(read('audit-sync-core.js'), context);
const core = context.AUDIT_SYNC_CORE;

const local = {
  auditId: 'AUDIT-FICTICIO', environmentId: 'BLOCO-A-SALA-2', status: 'IN_PROGRESS',
  syncState: 'SYNCED', mutationId: 'MUT-FICTICIA', serverRevision: 4,
  data: {
    identification: { date: '2026-11-23', startTime: '13:30', inspector: 'DADO FICTÍCIO PARA TESTE' },
    lighting: { total: '0', led: '5' }
  },
  reviewedSteps: { lighting: true },
  evidenceIds: ['EVIDENCE-FICTICIA'],
  nonConformities: [{ nonConformityId: 'NC-FICTICIA', description: 'DADO FICTÍCIO PARA TESTE' }]
};
const partial = {
  ...structuredClone(local), serverRevision: 5,
  data: { identification: { ...local.data.identification }, lighting: { total: '0' } }
};

function fakeStore(existing) {
  let stored = structuredClone(existing);
  const writes = [];
  const db = {
    transaction() {
      const tx = {
        objectStore() {
          return {
            get() {
              const request = { result: stored };
              Promise.resolve().then(() => {
                request.onsuccess?.();
                Promise.resolve().then(() => tx.oncomplete?.());
              });
              return request;
            },
            put(next) {
              stored = structuredClone(next);
              writes.push(stored);
              return {};
            }
          };
        }
      };
      return tx;
    }
  };
  return { db, writes, get: () => stored };
}
function extract(begin, end, name, db) {
  const source = read('audit-storage.js');
  const start = source.indexOf(begin), stop = source.indexOf(end, start);
  assert.ok(start >= 0 && stop > start, 'método de armazenamento localizado');
  return new Function('AUDIT_SYNC_CORE', 'structuredClone', 'openDatabase', 'normalizeAudit', 'STORES',
    source.slice(start, stop) + '; return ' + name + ';')(
    core, structuredClone, async () => db, structuredClone, { AUDITS: 'audits' });
}
test('uma seção ausente no remoto não pode apagar outra seção já coletada', () => {
  assert.equal(core.hasMissingCollectedAnswers(local, partial), true);
});
test('zero e false coletados são preservados quando o remoto não os traz', () => {
  const a = { data: { lighting: { total: 0, naturalLight: false } } };
  assert.equal(core.hasMissingCollectedAnswers(a, { data: { lighting: {} } }), true);
});
test('não considerar somente data/hora automáticas como respostas coletadas', () => {
  const a = { data: { identification: { date: '2026-11-23', startTime: '13:30' } } };
  assert.equal(core.hasMissingCollectedAnswers(a, { data: {} }), false);
});
test('não perder revisões, evidências ou não conformidades ao recuperar', () => {
  assert.equal(core.hasMissingCollectedAnswers(local, { ...local, reviewedSteps: {} }), true);
  assert.equal(core.hasMissingCollectedAnswers(local, { ...local, evidenceIds: [] }), true);
  assert.equal(core.hasMissingCollectedAnswers(local, { ...local, nonConformities: [] }), true);
});
test('remoto completo continua elegível à atualização normal', () => {
  assert.equal(core.hasMissingCollectedAnswers(local, { ...local, serverRevision: 6 }), false);
});
test('confirmação remota parcial preserva dados e marca conflito', async () => {
  const fake = fakeStore(local);
  const method = extract('  async function saveRemoteAcknowledgment(record, sentMutationId)',
    '  // Uma consulta remota', 'saveRemoteAcknowledgment', fake.db);
  const result = await method(partial, local.mutationId);
  assert.equal(result.superseded, true);
  assert.equal(result.audit.syncState, 'CONFLICT');
  assert.equal(fake.get().data.lighting.led, '5');
});
test('recuperação parcial não escreve em cima do registro local', async () => {
  const fake = fakeStore(local);
  const method = extract('  async function saveRemoteIfClean(record)',
    '  const setMeta', 'saveRemoteIfClean', fake.db);
  const result = await method(partial);
  assert.equal(result.saved, false);
  assert.equal(result.protectedLocal, true);
  assert.equal(fake.writes.length, 0);
  assert.equal(fake.get().data.lighting.led, '5');
});
