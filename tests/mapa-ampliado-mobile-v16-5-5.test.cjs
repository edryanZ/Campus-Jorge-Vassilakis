'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../styles.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const slice = (from, to) => {
  const a = app.indexOf(from);
  const b = app.indexOf(to, a + from.length);
  assert.ok(a >= 0 && b > a, 'Trecho encontrado: ' + from);
  return app.slice(a, b);
};

function camera() {
  const attrs = [];
  const context = {
    transform: { x: 0, y: 0, scale: 1 },
    MAX_MAP_ZOOM: 5.5,
    mapUnlocked: false,
    syncMapMode() {},
    panZoomLayer: { setAttribute(...args) { attrs.push(args); } },
    mapViewport: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1500, height: 920 }) },
    mapSvg: {
      getScreenCTM: () => ({ inverse: () => ({}) }),
      createSVGPoint: () => ({
        x: 0, y: 0,
        matrixTransform() { return { x: this.x, y: this.y }; }
      })
    }
  };
  vm.createContext(context);
  vm.runInContext(slice('function applyTransform()', 'function zoomBy(') +
    '\n' + slice('function zoomBy(', 'function resetView()'), context);
  return { context, attrs };
}

test('enquadramento inicial da planta respeita sua proporção 1500×920', () => {
  assert.match(css, /aspect-ratio:\s*1500\s*\/\s*920/);
  assert.match(css, /\.map-panel:not\(\.is-map-expanded\)/);
});
test('ampliação ocupa a tela sem sobrepor os diálogos de auditoria', () => {
  assert.match(css, /\.map-panel\.is-map-expanded\s*\{[^}]*position:\s*fixed/s);
  assert.match(css, /\.map-panel\.is-map-expanded\s*\{[^}]*height:\s*100dvh/s);
  assert.match(css, /\.map-panel\.is-map-expanded\s*\{[^}]*z-index:\s*200/s);
});
test('controle de ampliar mapa tem estado acessível', () => {
  assert.match(html, /id="mapExpandBtn"[^>]*aria-expanded="false"/);
  assert.match(app, /mapExpandBtn\.setAttribute\('aria-expanded', String\(mapExpanded\)\)/);
});
test('zoom dos botões aproxima o centro em vez do canto', () => {
  const { context } = camera();
  context.zoomBy(2);
  assert.equal(context.transform.scale, 2);
  assert.equal(context.transform.x, -750);
  assert.equal(context.transform.y, -460);
});
test('zoom funciona a partir do mapa inicialmente fixo', () => {
  const { context } = camera();
  context.zoomBy(1.2);
  assert.equal(context.mapUnlocked, true);
});
test('escala máxima impede zoom extremo', () => {
  const { context } = camera();
  context.zoomBy(100);
  assert.equal(context.transform.scale, 5.5);
});
test('arraste e pinça usam coordenadas do SVG e não alteram IDs de salas', () => {
  assert.match(app, /pixelsPerSvgUnit/);
  assert.match(app, /mapPointers\.size === 2/);
  assert.match(app, /mapSvg\.addEventListener\('click', event => \{[\s\S]*?stopImmediatePropagation\(\)/);
});
