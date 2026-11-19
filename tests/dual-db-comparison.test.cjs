'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compare, makeFixture, validateFixture, supabaseAdapter, firebaseAdapter } =
  require('../experiments/dual-db/compare.js');

function fakeStore({ mismatch = false, fail = false } = {}) {
  const values = new Map();
  const calls = [];
  return {
    calls,
    async write(id, payload) {
      calls.push(['write', id]);
      if (fail) throw Object.assign(new Error('Falha simulada'), { code: 'SIMULATED_FAILURE' });
      values.set(id, structuredClone(payload));
    },
    async read(id) {
      calls.push(['read', id]);
      const snapshot = structuredClone(values.get(id));
      if (mismatch) snapshot.data.lighting.led = 'DADO FICTÍCIO PARA TESTE';
      return snapshot;
    }
  };
}

test('duas cópias íntegras produzem confirmação dupla', async () => {
  const s = fakeStore(), f = fakeStore();
  const result = await compare({ supabase: s, firebase: f,
    id: 'CJV-TEST-DADO-FICTICIO-01' });
  assert.equal(result.bothVerified, true);
  assert.equal(result.supabase.outcome, 'VERIFIED');
  assert.equal(result.firebase.outcome, 'VERIFIED');
  assert.equal(s.calls.length, 2);
  assert.equal(f.calls.length, 2);
});

test('Firebase não devolveu os campos: não declarar sincronização dupla', async () => {
  const result = await compare({ supabase: fakeStore(),
    firebase: fakeStore({ mismatch: true }), id: 'CJV-TEST-MISMATCH-01' });
  assert.equal(result.supabase.outcome, 'VERIFIED');
  assert.equal(result.firebase.outcome, 'MISMATCH');
  assert.equal(result.bothVerified, false);
});

test('Falha simulada do Supabase não impede medir o Firebase', async () => {
  const result = await compare({ supabase: fakeStore({ fail: true }),
    firebase: fakeStore(), id: 'CJV-TEST-FAILURE-01' });
  assert.equal(result.supabase.outcome, 'ERROR');
  assert.equal(result.firebase.outcome, 'VERIFIED');
  assert.equal(result.bothVerified, false);
});

test('não aceitar IDs reais ou respostas que não sejam fictícias', async () => {
  assert.throws(() => validateFixture('AUDIT-REAL-1', makeFixture()), /ID de teste/);
  const bad = { ...makeFixture(), inspector: 'Pessoa Real' };
  assert.throws(() => validateFixture('CJV-TEST-1', bad), /Somente auditorias/);
  let called = 0;
  await assert.rejects(compare({
    supabase: { write: () => { called++; }, read: () => ({}) },
    firebase: { write: () => { called++; }, read: () => ({}) },
    id: 'AUDIT-REAL-1'
  }), /ID de teste/);
  assert.equal(called, 0);
});

test('Supabase escreve apenas na tabela isolada', async () => {
  const visited = [];
  const table = {
    upsert(record) { visited.push(['upsert', record.trial_id]); return Promise.resolve({ error: null }); },
    select() { return { eq(field, id) { return {
      single() { visited.push(['read', id]); return Promise.resolve({ data: { payload: makeFixture() }, error: null }); }
    }; } }; }
  };
  const db = { from(name) {
    assert.equal(name, 'dual_db_trial_records');
    return table;
  } };
  const adapter = supabaseAdapter(db);
  await adapter.write('CJV-TEST-SUPA', makeFixture());
  const actual = await adapter.read('CJV-TEST-SUPA');
  assert.equal(actual.testOnly, true);
  assert.deepEqual(visited, [['upsert','CJV-TEST-SUPA'], ['read','CJV-TEST-SUPA']]);
});

test('Firestore escreve apenas na coleção de testes associada ao UID', async () => {
  const memory = new Map();
  const auth = { currentUser: { uid: 'FAKE-TEST-USER' } };
  const adapter = firebaseAdapter({
    db: {}, auth,
    doc(_db, name, id) {
      assert.equal(name, 'dual_db_trial_records');
      return id;
    },
    async setDoc(path, value) {
      assert.equal(value.ownerUid, 'FAKE-TEST-USER');
      memory.set(path, structuredClone(value));
    },
    async getDoc(path) {
      return { exists: () => memory.has(path), data: () => memory.get(path) };
    }
  });
  await adapter.write('CJV-TEST-FIRE', makeFixture());
  assert.equal((await adapter.read('CJV-TEST-FIRE')).testOnly, true);
  auth.currentUser = { uid: 'DIFFERENT-USER' };
  await assert.rejects(adapter.read('CJV-TEST-FIRE'), /Conta Firebase alterada/);
});
