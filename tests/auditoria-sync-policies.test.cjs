'use strict';

// Exercícios locais: sem rede, tokens, permissões reais ou gravações em produção.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const file = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const clone = value => value === undefined ? undefined : structuredClone(value);

function createFakeIndexedDB() {
  const stores = Object.fromEntries(['audits', 'evidence', 'meta', 'conflicts'].map(name => [name, new Map()]));
  const db = {
    transaction(name) {
      let pending = 0;
      let committed = false;
      const tx = {
        oncomplete: null, onabort: null, error: null,
        objectStore() {
          const map = stores[name];
          const enqueue = action => {
            const request = {};
            pending += 1;
            queueMicrotask(() => {
              try {
                request.result = action();
                request.onsuccess?.();
              } catch (error) {
                request.error = error;
                request.onerror?.();
              }
              pending -= 1;
              if (pending === 0 && !committed) {
                committed = true;
                queueMicrotask(() => tx.oncomplete?.());
              }
            });
            return request;
          };
          return {
            get: key => enqueue(() => clone(map.get(key))),
            getAll: () => enqueue(() => [...map.values()].map(clone)),
            put: value => enqueue(() => {
              const key = value.auditId ?? value.evidenceId ?? value.conflictId ?? value.key;
              map.set(key, clone(value));
              return key;
            })
          };
        }
      };
      return tx;
    }
  };
  return {
    stores,
    api: { open() {
      const request = {};
      queueMicrotask(() => { request.result = db; request.onsuccess?.(); });
      return request;
    } }
  };
}

function storageFixture() {
  const indexed = createFakeIndexedDB();
  const core = {
    isActiveAudit: a => ['DRAFT', 'IN_PROGRESS'].includes(a.status),
    isRecoveryAudit: () => false, ownerKey: a => a.ownerId || a.localOwnerKey
  };
  const storage = new Function('indexedDB', 'AUDIT_SYNC_CORE', 'AUDIT_DATA',
    'crypto', 'structuredClone', 'globalThis', file('audit-storage.js') +
    '\nreturn AUDIT_STORAGE;')(
      indexed.api, core, { STATUS: { COMPLETED: 'COMPLETED' } },
      { randomUUID: () => 'device-test' }, clone, {}
    );
  return { storage, indexed };
}

function audit(overrides = {}) {
  return {
    auditId: 'AUDIT-FICTICIO', environmentId: 'ROOM-FICTICIA', status: 'IN_PROGRESS',
    ownerId: 'auditor-ficticio', data: { identification: { inspector: 'teste' } },
    nonConformities: [], evidenceIds: [], serverRevision: 1,
    mutationId: 'MUT-1', syncState: 'PENDING',
    updatedAt: '2026-10-29T19:00:00Z', ...overrides
  };
}

test('resposta remota atrasada não sobrescreve edição local posterior', async () => {
  const { storage } = storageFixture();
  await storage.saveAudit(audit({ mutationId: 'MUT-NEW', serverRevision: 1,
    data: { identification: { inspector: 'edição mais recente' } } }));
  const result = await storage.saveRemoteAcknowledgment(audit({
    mutationId: 'MUT-OLD', serverRevision: 2, syncState: 'SYNCED',
    data: { identification: { inspector: 'edição antiga' } }
  }), 'MUT-OLD');
  assert.equal(result.superseded, true);
  assert.equal(result.audit.data.identification.inspector, 'edição mais recente');
  assert.equal(result.audit.serverRevision, 2);
  assert.equal(result.audit.syncState, 'PENDING');
});

test('download remoto só altera cópias locais já sincronizadas', async () => {
  const { storage } = storageFixture();
  await storage.saveAudit(audit({
    mutationId: 'LOCAL-NEW', serverRevision: 1, syncState: 'PENDING'
  }));
  const incoming = audit({ mutationId: 'SERVER', serverRevision: 2,
    syncState: 'SYNCED', data: { identification: { inspector: 'servidor' } } });
  assert.equal((await storage.saveRemoteIfClean(incoming)).saved, false);
  assert.equal((await storage.getAudit(incoming.auditId)).mutationId, 'LOCAL-NEW');
  await storage.saveAudit(audit({ mutationId: 'LOCAL-NEW',
    serverRevision: 1, syncState: 'SYNCED' }));
  assert.equal((await storage.saveRemoteIfClean(incoming)).saved, true);
  assert.equal((await storage.getAudit(incoming.auditId)).mutationId, 'SERVER');
  // Um participante autorizado mantém seu contexto local ao atualizar.
  await storage.saveAudit(audit({ syncState: 'SYNCED',
    collaborationEditorId: 'participante-ficticio' }));
  assert.equal((await storage.saveRemoteIfClean(incoming)).saved, false);
});

test('uma gravação local nunca diminui a revisão remota já confirmada', async () => {
  const { storage } = storageFixture();
  await storage.saveAudit(audit({ serverRevision: 22, mutationId: 'M1' }));
  await storage.saveAudit(audit({ serverRevision: 20, mutationId: 'M2' }));
  assert.equal((await storage.getAudit('AUDIT-FICTICIO')).serverRevision, 22);
});

test('rascunho em conflito não é enviado automaticamente', async () => {
  let rpcCalls = 0;
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'auditor-ficticio' } } }, error: null }),
      getUser: async () => ({ data: { user: { id: 'auditor-ficticio' } }, error: null })
    },
    rpc: async () => { rpcCalls += 1; return { data: null, error: null }; }
  };
  const global = {
    SUPABASE_CONFIG: { url: 'https://example.supabase.co', publishableKey: 'sb_publishable_fake' },
    supabase: { createClient: () => client }
  };
  const remote = new Function('globalThis', 'window', 'navigator', 'AUDIT_STORAGE',
    'AUDIT_SYNC_CORE', 'localStorage', 'CustomEvent', 'crypto', 'structuredClone',
    file('audit-remote.js') + '\nreturn AUDIT_REMOTE;')(
      global, { addEventListener() {}, dispatchEvent() {} }, { onLine: true }, {},
      { isRecoveryAudit: () => false }, { getItem: () => null, setItem() {} },
      class FakeEvent {}, { randomUUID: () => 'test' }, clone
    );
  const result = await remote.syncAudit(audit({ syncState: 'CONFLICT' }));
  assert.equal(result.reason, 'UNRESOLVED_CONFLICT');
  const scheduled = await remote.scheduleSync(audit({ syncState: 'CONFLICT' }));
  assert.equal(scheduled.skipped, true);
  assert.equal(rpcCalls, 0);
});

test('falha temporária do Supabase mantém acesso local previamente autorizado', async () => {
  let state = 'approved';
  const items = new Map();
  const client = {
    auth: { getSession: async () => ({
      data: { session: { user: { id: 'auditor-ficticio' } } }, error: null
    }) },
    from() {
      return { select() {
        return { eq() {
          return { async maybeSingle() {
            if (state === 'server-down') return {
              data: null, error: { message: 'Database temporarily unavailable' }
            };
            return { data: state === 'revoked'
              ? { role: 'AUDITOR', active: false, review_status: 'REJECTED' }
              : { role: 'AUDITOR', active: true, review_status: 'APPROVED' },
              error: null };
          } };
        } };
      } };
    }
  };
  const localStorage = {
    getItem: key => items.get(key) || null,
    setItem: (key, value) => items.set(key, value)
  };
  const global = {
    SUPABASE_CONFIG: { url: 'https://example.supabase.co', publishableKey: 'sb_publishable_fake' },
    supabase: { createClient: () => client }
  };
  const remote = new Function('globalThis', 'window', 'navigator', 'AUDIT_STORAGE',
    'AUDIT_SYNC_CORE', 'localStorage', 'CustomEvent', 'crypto', 'structuredClone',
    file('audit-remote.js') + '\nreturn AUDIT_REMOTE;')(
      global, { addEventListener() {}, dispatchEvent() {} }, { onLine: true }, {},
      { isRecoveryAudit: () => false }, localStorage,
      class FakeEvent {}, { randomUUID: () => 'test' }, clone
    );
  const approved = await remote.getAccess();
  assert.equal(approved.canAudit, true);
  assert.equal(approved.offline, false);
  state = 'server-down';
  const cached = await remote.getAccess();
  assert.equal(cached.canAudit, true);
  assert.equal(cached.offline, true);
  state = 'revoked';
  const revoked = await remote.getAccess();
  assert.equal(revoked.canAudit, false);
});

test('resultados públicos não incluem nomes, notas pessoais nem evidências', () => {
  const global = {};
  const core = new Function('globalThis', file('audit-sync-core.js') +
    '\nreturn AUDIT_SYNC_CORE;')(global);
  const result = core.publicPayload(audit({
    data: {
      identification: { inspector: 'Pessoa Privada', notes: 'Dados pessoais' },
      lighting: { total: '6', notes: 'Observação sensível' },
      equipment: { computadores: '2' }
    },
    evidenceIds: ['EVIDENCIA-PRIVADA'],
    nonConformities: [{ description: 'Nome confidencial' }]
  }));
  assert.equal(result.data.lighting.total, '6');
  assert.equal(result.data.equipment.computadores, '2');
  assert.ok(!JSON.stringify(result).includes('Pessoa Privada'));
  assert.ok(!JSON.stringify(result).includes('EVIDENCIA-PRIVADA'));
  assert.ok(!JSON.stringify(result).includes('Observação sensível'));
});
