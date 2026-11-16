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

const empty = {
  auditId: 'AUDIT-EXEMPLO-FICTICIO', environmentId: 'BLOCO-A-SALA-2',
  syncState: 'SYNCED', serverRevision: 4,
  data: { identification: { date: '2026-11-11', startTime: '12:25', inspector: '' } },
  evidenceIds: [], nonConformities: [], reviewedSteps: {}
};

const filled = {
  ...empty, data: { identification: { ...empty.data.identification, inspector: 'DADO FICTÍCIO PARA TESTE' } }
};

function makeStore(existing) {
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
            put(record) {
              stored = structuredClone(record);
              writes.push(stored);
              return {};
            }
          };
        }
      };
      return tx;
    }
  };
  return { db, writes, getStored: () => stored };
}

async function tryRemoteRecovery(local, remote) {
  const source = read('audit-storage.js');
  const start = source.indexOf('async function saveRemoteIfClean(record)');
  const end = source.indexOf('\n  const setMeta', start);
  assert.ok(start >= 0 && end > start, 'função de recuperação encontrada');
  const method = source.slice(start, end);
  const fake = makeStore(local);
  const factory = new Function('AUDIT_SYNC_CORE', 'structuredClone', 'openDatabase', 'normalizeAudit', 'STORES', method + '; return saveRemoteIfClean;');
  const save = factory(core, structuredClone, async () => fake.db, structuredClone, { AUDITS: 'audits' });
  return { result: await save(remote), ...fake };
}

test('data/hora automáticas não contam como coleta preenchida', () => {
  assert.equal(core.hasCollectedAnswers(empty), false);
});
test('campo vazio ou só espaços também não conta como resposta', () => {
  assert.equal(core.hasCollectedAnswers({ ...empty, data: { identification: { date: '2026-11-11', inspector: '   ' } } }), false);
});
test('nome do auditor realmente preenchido conta como resposta', () => {
  assert.equal(core.hasCollectedAnswers(filled), true);
});
test('medição numérica zero é informação coletada', () => {
  assert.equal(core.hasCollectedAnswers({ ...empty, data: { lighting: { led: '0' } } }), true);
});
test('etapa revisada explicitamente conta como progresso', () => {
  assert.equal(core.hasCollectedAnswers({ ...empty, reviewedSteps: { lighting: true } }), true);
});
test('evidências e não conformidades contam como conteúdo', () => {
  assert.equal(core.hasCollectedAnswers({ ...empty, evidenceIds: ['FOTO-FICTICIA'] }), true);
  assert.equal(core.hasCollectedAnswers({ ...empty, nonConformities: [{ description: 'DADO FICTÍCIO PARA TESTE' }] }), true);
});
test('servidor vazio não substitui respostas locais marcadas SYNCED', async () => {
  const { result, writes, getStored } = await tryRemoteRecovery(filled, { ...empty, serverRevision: 5 });
  assert.equal(result.protectedLocal, true);
  assert.equal(result.saved, false);
  assert.equal(writes.length, 0);
  assert.equal(getStored().data.identification.inspector, filled.data.identification.inspector);
});
test('servidor preenchido recupera um rascunho sem respostas', async () => {
  const { result, writes } = await tryRemoteRecovery(empty, { ...filled, serverRevision: 5 });
  assert.equal(result.protectedLocal, false);
  assert.equal(result.saved, true);
  assert.equal(writes.length, 1);
});
test('rascunho local com sincronização pendente não é substituído', async () => {
  const { result, writes } = await tryRemoteRecovery({ ...filled, syncState: 'PENDING' }, { ...filled, serverRevision: 5 });
  assert.equal(result.saved, false);
  assert.equal(writes.length, 0);
});
test('fluxo de retomada avisa e preserva conflitos', () => {
  const app = read('audit-app.js');
  const remote = read('audit-remote.js');
  assert.match(app, /Rascunho aberto/);
  assert.match(app, /Ainda não há respostas de coleta/);
  assert.match(app, /Histórico de auditorias · consulta sem alterar seus registros/);
  assert.match(remote, /LOCAL_ANSWERS_MISSING_REMOTE/);
  assert.match(remote, /preserveConflict\(local, remote, 'LOCAL_ANSWERS_MISSING_REMOTE'\)/);
});
