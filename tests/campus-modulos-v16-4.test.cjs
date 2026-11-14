'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function environment() {
  const cache = new Map();
  const element = () => ({
    hidden:true, value:'', textContent:'', addEventListener(){},
    querySelectorAll(){return []}, querySelector(){return { disabled:false }},
    replaceChildren(){}, append(){}, reset(){}, add(){}
  });
  return {
    document: {
      getElementById(id) { if (!cache.has(id)) cache.set(id, element()); return cache.get(id); },
      addEventListener(){}, createElement(){return element()}
    },
    window: {addEventListener(){}},
    Option: function Option() {},
    AUDIT_DATA: {
      environments:[{environmentId:'B-SALA-1',blockName:'Bloco B',roomNumber:1,name:'Sala 1'}],
      getEnvironment(id) {return id==='B-SALA-1' ? this.environments[0] : null;},
      getEnvironmentByMapId(){return this.environments[0];}
    },
    AUDIT_REMOTE: {onAuthStateChange(){}, async getAccess(){return null;}, async sessionUser(){return null;}},
    AUDIT_STORAGE: {async listAudits(){throw Error('unauthorized read')}},
    AUDIT_SYNC_CORE: {isRecoveryAudit(){return false}},
    console
  };
}

test('indicadores não duplicam ambientes e descartam dados inválidos', () => {
  const env = environment();
  vm.runInNewContext(read('campus-insights.js'), env, {filename:'campus-insights.js'});
  const records = [
    {environmentId:'B-SALA-1',status:'IN_PROGRESS',updatedAt:'2026-10-01',data:{lighting:{led:'2',fluorescent:'6'}}},
    {environmentId:'B-SALA-1',status:'COMPLETED',updatedAt:'2026-11-01',data:{lighting:{led:'4',fluorescent:'1'},waterWaste:{hasHydraulics:'Sim'}}},
    {environmentId:'B-SALA-2',status:'IN_PROGRESS',updatedAt:'2026-11-01',data:{lighting:{led:'-1',fluorescent:'abc'}}}
  ];
  assert.deepEqual(JSON.parse(JSON.stringify(env.CAMPUS_INSIGHTS.summarize(records))), {
    environments:2,lightingRooms:1,led:4,fluorescent:1,hydraulicRooms:1
  });
});

test('sem autorização, indicador privado não acessa banco local', async () => {
  const env = environment();
  vm.runInNewContext(read('campus-insights.js'), env);
  await env.CAMPUS_INSIGHTS.refresh();
  assert.equal(env.document.getElementById('energyOverview').textContent, 'Consumo a mensurar');
});

test('tombo exige etiqueta e ambiente real e normaliza sem inventar bem', () => {
  const env = environment();
  vm.runInNewContext(read('patrimonio.js'), env);
  const normalize = env.CAMPUS_PATRIMONY.normalize;
  assert.equal(normalize({tombo:' 001-ABC ',description:'Projetor',environmentId:'B-SALA-1'}).tombo, '001-ABC');
  assert.throws(() => normalize({tombo:'',description:'Projetor',environmentId:'B-SALA-1'}), /número de tombo/i);
  assert.throws(() => normalize({tombo:'12',description:'Projetor',environmentId:'NAO_EXISTE'}), /ambiente/i);
});

test('UI e PWA incluem módulos; não há dados oficiais predefinidos', () => {
  const html = read('index.html'), sw = read('sw.js'), source = read('patrimonio.js');
  for (const id of ['energyOverview','waterOverview','auditOverview','assetModal','assetEnvironment','assetExportBtn'])
    assert.ok(html.includes('id="' + id + '"'), id);
  assert.match(sw, /campus-auditoria-v16-4/);
  assert.match(sw, /\.\/campus-insights\.js/);
  assert.match(sw, /\.\/patrimonio\.js/);
  assert.match(source, /INVENTARIO_AUXILIAR_LOCAL/);
  assert.match(source, /ownerTombo/);
  assert.match(source, /const visible = records\.filter/);
});

test('consultas privadas filtram proprietário sem acesso ADMIN amplo no cliente', () => {
  const remote = read('audit-remote.js');
  assert.match(remote, /if \(!access\.admin\) authorizedQuery = authorizedQuery\.eq\('owner_id', user\.id\)/);
  assert.match(remote, /if \(!access\.admin\) query = query\.eq\('owner_id', user\.id\)/);
  assert.ok(read('docs/seguranca/proposta-rls-20261113.sql').includes('drop policy if exists audits_v161_active_read'));
});

test('scripts da rodada são sintaticamente válidos', () => {
  for (const file of ['app.js','audit-app.js','audit-remote.js','campus-insights.js','patrimonio.js'])
    assert.doesNotThrow(() => new vm.Script(read(file), {filename:file}));
});
