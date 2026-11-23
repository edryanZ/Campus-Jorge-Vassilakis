'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'audit-app.js'), 'utf8');

function makeRecovery({ needed = true, online = true, currentId = 'ADMIN-FICTICIO', sessionId = 'ADMIN-FICTICIO', instant = 120000 } = {}) {
  const begin = source.indexOf('  async function recoverTemporaryAccess() {');
  const end = source.indexOf("\n  window.addEventListener('focus', recoverTemporaryAccess)", begin);
  assert.ok(begin >= 0 && end > begin, 'rotina de recuperação encontrada');
  const calls = [];
  const mockRemote = { async sessionUser() { calls.push('session'); return sessionId ? { id: sessionId } : null; } };
  const fakeDate = { now: () => instant };
  const func = new Function('AUDIT_REMOTE', 'navigator', 'setAuthState', 'Date', 'console',
    `let accessRecoveryNeeded = ${needed}; let accessRecoveryInFlight = false;
     let lastAccessRecoveryAttempt = 0; let currentSessionUserId = ${JSON.stringify(currentId)};
     ${source.slice(begin, end)}
     return recoverTemporaryAccess;`)(
       mockRemote, { onLine: online },
       async (...args) => { calls.push(['access', ...args]); }, fakeDate, { warn: () => {} });
  return { func, calls };
}
test('apenas indisponibilidade temporária provoca revalidação automática', async () => {
  const active = makeRecovery();
  await active.func();
  assert.equal(active.calls[0], 'session');
  assert.equal(active.calls[1][0], 'access');
  assert.deepEqual(active.calls[1][3], { forceRefresh: true });
  const approved = makeRecovery({ needed: false });
  await approved.func();
  assert.equal(approved.calls.length, 0);
});
test('não tenta revalidar sem internet nem com sessão de outra conta', async () => {
  const offline = makeRecovery({ online: false });
  await offline.func();
  assert.equal(offline.calls.length, 0);
  const switched = makeRecovery({ sessionId: 'AUDITOR-FICTICIO' });
  await switched.func();
  assert.deepEqual(switched.calls, ['session']);
});
test('eventos repetidos não disparam novas consultas durante a janela de 15 segundos', async () => {
  const recovering = makeRecovery();
  await recovering.func();
  await recovering.func();
  assert.equal(recovering.calls.length, 2);
});
test('retoma autorização ao voltar à aba ou à janela, não a cada digitação', () => {
  assert.match(source, /window\.addEventListener\('focus', recoverTemporaryAccess\)/);
  assert.match(source, /document\.visibilityState === 'visible'\) recoverTemporaryAccess\(\)/);
  assert.match(source, /accessRecoveryNeeded = !access \|\| Boolean\(access\.offline\)/);
});
