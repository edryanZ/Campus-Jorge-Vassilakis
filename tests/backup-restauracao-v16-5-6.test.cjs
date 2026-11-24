'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = pathName => fs.readFileSync(path.join(__dirname, '..', pathName), 'utf8');
const clone = item => structuredClone(item);
function fixture({ owner = 'CONTA-FICTICIA', admin = false } = {}) {
  const stores = { audits: [], evidence: [], conflicts: [] };
  let user = { id: 'CONTA-FICTICIA' };
  const listeners = {};
  const dom = {
    exportAuditBackupBtn: { addEventListener() {}, disabled: false },
    auditBackupStatus: { textContent: '' },
    restoreAuditBackupBtn: { addEventListener(name, fn) { listeners['button:' + name] = fn; }, disabled: false },
    restoreAuditBackupInput: { addEventListener(name, fn) { listeners['input:' + name] = fn; }, files: [] },
    restoreAuditBackupStatus: { textContent: '' }
  };
  const context = {
    document: { getElementById(id) { return dom[id] || null; } },
    window: { dispatchEvent() {}, confirm() { return true; } },
    Event, TextEncoder, TextDecoder, Blob, Uint32Array, Uint8Array,
    DataView, ArrayBuffer, structuredClone,
    navigator: { onLine: true },
    AUDIT_REMOTE: {
      async sessionUser() { return user; },
      async getAccess() { return { canAudit: true, userId: user.id, admin }; }
    },
    AUDIT_STORAGE: {
      async getDeviceId() { return 'DEVICE-FICTICIO'; },
      async listAudits() { return clone(stores.audits); },
      async listEvidence() { return clone(stores.evidence); },
      async listConflicts() { return clone(stores.conflicts); },
      async openDatabase() {
        return {
          transaction(names, mode) {
            assert.equal(mode, 'readwrite');
            assert.deepEqual(names, ['audits', 'evidence', 'conflicts']);
            const pending = { audits: [], evidence: [], conflicts: [] };
            const ids = { audits: 'auditId', evidence: 'evidenceId', conflicts: 'conflictId' };
            const tx = {
              objectStore(name) {
                return { add(record) {
                  const id = record[ids[name]];
                  if ([...stores[name], ...pending[name]].some(item => item[ids[name]] === id))
                    throw new Error('Duplicidade');
                  pending[name].push(record);
                } };
              }
            };
            queueMicrotask(() => {
              for (const name of names) stores[name].push(...pending[name]);
              tx.oncomplete?.();
            });
            return tx;
          }
        };
      }
    }
  };
  vm.runInNewContext(read('audit-backup.js'), context);
  vm.runInNewContext(read('audit-restore.js'), context);
  const record = {
    auditId: 'AUDIT-FICTICIA', environmentId: 'BLOCO-A-SALA-2',
    ownerId: owner, status: 'IN_PROGRESS', serverRevision: 7,
    syncState: 'SYNCED', evidenceIds: ['EVIDENCIA-FICTICIA'],
    data: { identification: { inspector: 'DADO FICTÍCIO PARA TESTE' } }
  };
  const photoBytes = new Uint8Array([1, 2, 3, 4, 5]);
  const photoPath = 'fotografias/AUDIT-FICTICIA/EVIDENCIA-FICTICIA.jpg';
  const evidence = {
    evidenceId: 'EVIDENCIA-FICTICIA', auditId: record.auditId,
    hasLocalPhoto: true, archivePath: photoPath,
    mimeType: 'image/jpeg', size: photoBytes.length
  };
  const manifest = {
    format: 'CAMPUS_AUDIT_BACKUP_V1', exportedAt: '2026-11-24T13:00:00Z',
    audits: [record], evidence: [evidence], conflicts: []
  };
  async function zip(nextManifest = manifest, files = [{ name: photoPath, blob: new Blob([photoBytes]) }]) {
    return context.AUDIT_BACKUP.buildZip([
      { name: 'manifest.json', blob: new Blob([JSON.stringify(nextManifest)]) }, ...files
    ]);
  }
  return { context, manifest, zip, stores, setUser(next) { user = { id: next }; }, photoBytes };
}

test('ZIP exportado pelo CJV é verificável e preserva fotografia intacta', async () => {
  const f = fixture(), archive = await f.zip();
  const inspected = await f.context.AUDIT_RESTORE.inspect(archive);
  assert.equal(inspected.audits, 1);
  assert.equal(inspected.photos, 1);
  const result = await f.context.AUDIT_RESTORE.restore(archive, inspected);
  assert.equal(result.imported, 1);
  assert.equal(result.photos, 1);
  assert.equal(f.stores.audits[0].data.identification.inspector, 'DADO FICTÍCIO PARA TESTE');
  assert.equal(f.stores.audits[0].syncState, 'CONFLICT');
  assert.deepEqual([...new Uint8Array(await f.stores.evidence[0].blob.arrayBuffer())], [...f.photoBytes]);
});

test('mesmo ZIP importado duas vezes não sobrescreve a auditoria', async () => {
  const f = fixture(), archive = await f.zip();
  await f.context.AUDIT_RESTORE.restore(archive);
  f.stores.audits[0].data.identification.inspector = 'DADO FICTÍCIO PARA TESTE ALTERADO';
  const repeated = await f.context.AUDIT_RESTORE.restore(archive);
  assert.equal(repeated.imported, 0);
  assert.equal(repeated.ignored, 1);
  assert.equal(f.stores.audits[0].data.identification.inspector, 'DADO FICTÍCIO PARA TESTE ALTERADO');
  assert.equal(f.stores.evidence.length, 1);
});

test('arquivo adulterado não importa nem substitui registros', async () => {
  const f = fixture(), archive = await f.zip();
  const bytes = new Uint8Array(await archive.arrayBuffer());
  const needle = new TextEncoder().encode('DADO FICTÍCIO PARA TESTE');
  const index = bytes.findIndex((v, i) =>
    v === needle[0] && needle.every((part, j) => bytes[i + j] === part));
  assert.ok(index > 0);
  bytes[index] ^= 1;
  await assert.rejects(f.context.AUDIT_RESTORE.restore(new Blob([bytes])), /CRC-32/);
  assert.equal(f.stores.audits.length, 0);
});

test('conta diferente não restaura backup privado de outro auditor', async () => {
  const f = fixture({ owner: 'OUTRA-CONTA-FICTICIA' });
  await assert.rejects(f.context.AUDIT_RESTORE.restore(await f.zip()), /outra conta/);
  assert.equal(f.stores.audits.length, 0);
});

test('ZIP com fotografia ausente é recusado quando manifesta arquivo existente', async () => {
  const f = fixture();
  await assert.rejects(f.context.AUDIT_RESTORE.restore(await f.zip(f.manifest, [])), /ausente/);
  assert.equal(f.stores.audits.length, 0);
});

test('backup sem bytes de uma foto é aceito com aviso, sem inventar fotografia', async () => {
  const f = fixture();
  const next = clone(f.manifest);
  next.evidence[0].hasLocalPhoto = false;
  delete next.evidence[0].archivePath;
  const result = await f.context.AUDIT_RESTORE.restore(await f.zip(next, []));
  assert.equal(result.imported, 1);
  assert.equal(result.missingPhotos, 1);
  assert.equal(f.stores.evidence[0].blob, undefined);
  assert.equal(f.stores.evidence[0].syncState, 'ERROR');
});

test('IDs de auditoria duplicados no manifesto cancelam a restauração', async () => {
  const f = fixture(), next = clone(f.manifest);
  next.audits.push(clone(next.audits[0]));
  await assert.rejects(f.context.AUDIT_RESTORE.restore(await f.zip(next)), /duplicado/);
  assert.equal(f.stores.audits.length, 0);
});

test('restauração não mistura dados após troca de sessão', async () => {
  const f = fixture();
  const preview = await f.context.AUDIT_RESTORE.inspect(await f.zip());
  f.setUser('OUTRA-CONTA-FICTICIA');
  await assert.rejects(f.context.AUDIT_RESTORE.restore(await f.zip(), preview), /outra conta/);
  assert.equal(f.stores.audits.length, 0);
});

test('o frontend expõe apenas restauração manual e mantém cache compatível', () => {
  const html = read('index.html');
  const sw = read('sw.js');
  const app = read('audit-app.js');
  assert.match(html, /id="restoreAuditBackupBtn"/);
  assert.match(html, /audit-restore\.js/);
  assert.match(sw, /campus-auditoria-v16-5-6/);
  assert.match(sw, /\.\/audit-restore\.js/);
  assert.match(app, /restoreBackupButton\.hidden = !?false/);
});

test('resumo de outro ZIP não permite ignorar validação da integridade', async () => {
  const f = fixture(), original = await f.zip();
  const preview = await f.context.AUDIT_RESTORE.inspect(original);
  const bytes = new Uint8Array(await original.arrayBuffer());
  const needle = new TextEncoder().encode('DADO FICTÍCIO PARA TESTE');
  const pos = bytes.findIndex((v, i) =>
    v === needle[0] && needle.every((part, j) => bytes[i + j] === part));
  assert.ok(pos > 0);
  bytes[pos] ^= 1;
  await assert.rejects(f.context.AUDIT_RESTORE.restore(new Blob([bytes]), preview), /CRC-32/);
  assert.equal(f.stores.audits.length, 0);
});

test('manifesto sem estrutura de respostas válida é recusado', async () => {
  const f = fixture(), broken = clone(f.manifest);
  broken.audits[0].data = null;
  await assert.rejects(f.context.AUDIT_RESTORE.inspect(await f.zip(broken)), /inválido/);
  assert.equal(f.stores.audits.length, 0);
});
