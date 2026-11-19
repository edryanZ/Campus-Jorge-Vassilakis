'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(path.join(__dirname, '../experiments/dual-db/index.html'), 'utf8');
const runner = fs.readFileSync(path.join(__dirname, '../experiments/dual-db/live-test.mjs'), 'utf8');
const compare = fs.readFileSync(path.join(__dirname, '../experiments/dual-db/compare.js'), 'utf8');

test('a página só carrega o módulo isolado do experimento, não o editor de auditoria', () => {
  assert.match(page, /src="\.\/compare\.js"/);
  assert.match(page, /src="\.\/live-test\.mjs"/);
  assert.doesNotMatch(page, /<script[^>]+audit-app\.js/);
  assert.doesNotMatch(page, /<script[^>]+audit-remote\.js/);
});
test('o experimento está preparado para duas autenticações independentes', () => {
  assert.match(runner, /signInWithEmailAndPassword\(/);
  assert.match(runner, /signInWithPassword\(/);
  assert.match(runner, /persistSession:\s*false/);
  assert.match(runner, /browserSessionPersistence/);
  assert.match(runner, /emailVerified/);
});
test('somente um botão dispara a comparação real dos dois bancos', () => {
  assert.match(page, /id="testBoth"[^>]+disabled/);
  assert.match(runner, /trial\.compare\(\{ supabase, firebase, id \}\)/);
  assert.match(compare, /Promise\.all\(\[/);
  assert.match(runner, /confirmScope/);
});
test('a confirmação Firebase exige exclusivamente leitura do servidor', () => {
  assert.match(runner, /getDocFromServer/);
  assert.match(compare, /await getDocFromServer\(/);
  assert.doesNotMatch(compare, /await getDoc\(/);
});
test('nenhum fluxo do teste acessa auditorias reais nem chaves administrativas', () => {
  assert.match(compare, /dual_db_trial_records/);
  assert.doesNotMatch(compare, /from\(['"]audits['"]\)/);
  assert.doesNotMatch(runner, /service_role|sb_secret_|firebase-admin/i);
  assert.match(compare, /canonical\(sample\) !== canonical\(makeFixture\(\)\)/);
});
test('o JavaScript do controlador está sintaticamente válido', () => {
  const withoutImports = runner.replace(/^import[\s\S]*?from\s*'https:\/\/www\.gstatic\.com\/firebasejs\/[^']+\.js';/gm, '');
  new Function(withoutImports);
});
