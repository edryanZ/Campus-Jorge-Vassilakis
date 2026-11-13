'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = filename => fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
const html = read('index.html');
const map = read('app.js');
const remote = read('audit-remote.js');
const audit = read('audit-app.js');
const css = read('styles.css');

test('mapa: visualização geral, escolha de sala e modo travado no celular', () => {
  assert.match(html, /id="mapMoveToggle"/);
  assert.match(html, /id="mapResetBtn"/);
  assert.match(html, /id="mapLocationPicker"/);
  assert.match(map, /let mapUnlocked = !mapBreakpoint\.matches;/);
  assert.match(map, /mapViewport\.classList\.toggle\('is-navigation-locked', !mapUnlocked\)/);
  assert.match(map, /transform\.x = 750 - \(bbox\.x \+ bbox\.width \/ 2\) \* targetScale/);
  assert.match(map, /getScreenCTM\(\)/);
  assert.match(css, /touch-action: pan-y/);
});

test('painel: indicadores não são confundidos com medições reais', () => {
  for (const label of ['Energia', 'Água', 'Papel', 'Auditorias', 'Patrimônio']) assert.ok(html.includes(label));
  assert.match(html, /Consumo a mensurar/);
  assert.match(html, /Índice a levantar/);
  assert.match(html, /Tombos: em preparação/);
  assert.match(css, /overview-grid/);
});

test('central: auditorias autorizadas são consultadas por sessão e registro', () => {
  assert.match(remote, /async function listAccessibleAudits\(\)/);
  assert.match(remote, /const user = await sessionUser\(\);\s+const access = user \? await getAccess\(\) : null;/);
  assert.match(remote, /queryWithDeadline/);
  assert.match(audit, /getPrivateHistoryRecord\(item\.auditId\)/);
  assert.match(audit, /retryAccessBtn/);
  assert.match(audit, /forceRefresh: true/);
});

test('scripts JavaScript são sintaticamente válidos', () => {
  for (const name of ['app.js','audit-app.js','audit-remote.js'])
    assert.doesNotThrow(() => new Function(read(name)));
});
