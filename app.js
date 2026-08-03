'use strict';

const COLORS = {
  daca: '#5170FF',
  dacl: '#FD0EB3',
  daced: '#CB6CE6',
  dacsa: '#7ED957',
  biblioteca: '#1E146D',
  banheiros: '#5CE1E6',
  auditorios: '#A40000',
  salas: '#FFDE59',
  administrativo: '#4C89C7',
  apoio: '#7C8DA5',
  laboratorio: '#70C87C',
  alimentacao: '#F4A83C',
  psicologia: '#A267CF',
  deposito: '#6F5438',
  externo: '#6A8E5A'
};

const CATEGORY_LABELS = {
  salas: 'Salas de aula',
  auditorios: 'Auditórios',
  administrativo: 'Setores administrativos',
  departamentos: 'Departamentos acadêmicos',
  banheiros: 'Banheiros e apoio',
  laboratorio: 'Laboratórios',
  alimentacao: 'Alimentação e convivência',
  psicologia: 'Psicologia',
  deposito: 'Depósitos e limpeza',
  biblioteca: 'Biblioteca',
  externo: 'Estruturas externas'
};

const LEGEND_ITEMS = [
  ['DACA', COLORS.daca],
  ['DACL', COLORS.dacl],
  ['DACED', COLORS.daced],
  ['DACSA', COLORS.dacsa],
  ['Biblioteca Setorial', COLORS.biblioteca],
  ['Banheiros', COLORS.banheiros],
  ['Auditórios', COLORS.auditorios],
  ['Salas de Aula', COLORS.salas],
  ['Setores Administrativos', 'linear-gradient(90deg,#84A9FF,#1F5F8F)']
];

// Coordenadas esquemáticas baseadas na planta enviada pelo usuário.
const blocks = [
  {
    id: 'bloco-a', label: 'BLOCO A', x: 220, y: 120, w: 300, h: 72,
    rooms: [
      room('sala-1', '1', 'Mini Auditório', 'auditorios'),
      room('sala-2', '2', 'Sala de Aula', 'salas'),
      room('sala-3', '3', 'Sala de Aula', 'salas'),
      room('sala-4', '4', 'Depósito', 'deposito')
    ]
  },
  {
    id: 'bloco-b', label: 'BLOCO B', x: 535, y: 120, w: 300, h: 140, columns: 4,
    rooms: [
      room('sala-5', '5', 'DACED', 'departamentos', { color: COLORS.daced, fullName: 'Departamento Acadêmico de Ciências da Educação' }),
      room('sala-6', '6', 'DACL', 'departamentos', { color: COLORS.dacl, fullName: 'Departamento Acadêmico de Ciências da Linguagem' }),
      room('sala-7', '7', 'Sala dos Professores', 'administrativo'),
      room('sala-8', '8', 'DACA', 'departamentos', { color: COLORS.daca, fullName: 'Departamento Acadêmico de Ciências da Administração' }),
      room('sala-9', '9', 'Sala de Amamentação', 'administrativo'),
      room('sala-10', '10', 'DACSA', 'departamentos', { color: COLORS.dacsa, fullName: 'Departamento Acadêmico de Ciências Sociais e Ambientais' }),
      room('sala-11', '11', 'DACSA', 'departamentos', { color: COLORS.dacsa, fullName: 'Departamento Acadêmico de Ciências Sociais e Ambientais' })
    ],
    amenities: ['WC Masculino', 'WC Feminino', 'Bebedouro']
  },
  {
    id: 'bloco-c', label: 'BLOCO C', x: 220, y: 325, w: 330, h: 70,
    rooms: [
      room('sala-12', '12', 'Sala de Aula', 'salas'),
      room('sala-13', '13', 'Sala de Aula', 'salas'),
      room('sala-14', '14', 'Sala de Aula', 'salas'),
      room('sala-15', '15', 'Sala de Aula', 'salas'),
      room('sala-16', '16', 'Sala de Aula', 'salas'),
      room('sala-17', '17', 'Depósito', 'deposito')
    ]
  },
  {
    id: 'bloco-d', label: 'BLOCO D', x: 220, y: 425, w: 330, h: 70,
    rooms: [
      room('sala-18', '18', 'Sala de Aula', 'salas'),
      room('sala-19', '19', 'Sala de Aula', 'salas'),
      room('sala-20', '20', 'Sala de Aula', 'salas'),
      room('sala-21', '21', 'Sala de Aula', 'salas'),
      room('sala-22', '22', 'Sala de Aula', 'salas')
    ]
  },
  {
    id: 'bloco-e', label: 'BLOCO E', x: 565, y: 325, w: 78, h: 170,
    amenities: ['WC Masculino', 'WC Feminino', 'Bebedouro']
  },
  {
    id: 'bloco-f', label: 'BLOCO F', x: 220, y: 520, w: 300, h: 78,
    rooms: [
      room('sala-27', '27', 'Laboratório de Biologia', 'laboratorio'),
      room('sala-28', '28', 'Laboratório de Informática', 'laboratorio')
    ]
  },
  {
    id: 'bloco-g', label: 'BLOCO G', x: 540, y: 520, w: 365, h: 78,
    rooms: [
      room('sala-30', '30', 'Sala não identificada', 'administrativo'),
      room('sala-31', '31', 'Equipe de Limpeza', 'deposito'),
      room('sala-32', '32', 'Equipe de Limpeza', 'deposito'),
      room('sala-33', '33', 'Cantina', 'alimentacao'),
      room('sala-34', '34', 'Atlética Kopakao e CAGEAM', 'administrativo')
    ],
    amenities: ['WC Masculino', 'WC Feminino']
  },
  {
    id: 'bloco-h', label: 'BLOCO H', x: 700, y: 335, w: 175, h: 72,
    rooms: [room('sala-35', '35', 'Auditório Grande', 'auditorios')]
  },
  {
    id: 'bloco-i', label: 'BLOCO I', x: 700, y: 430, w: 175, h: 72,
    rooms: [
      room('sala-36', '36', 'Psicologia', 'psicologia'),
      room('sala-37', '37', 'Depósito', 'deposito')
    ]
  }
];

const floorRooms = {
  inferior: [
    room('k-biblioteca-setorial', '', 'Biblioteca Setorial', 'biblioteca', { block: 'Bloco K', floor: 'Pavimento inferior' }),
    room('k-auditorio-biblioteca', '', 'Auditório da Biblioteca', 'auditorios', { block: 'Bloco K', floor: 'Pavimento inferior' }),
    room('k-copa-inferior', '', 'Copa', 'alimentacao', { block: 'Bloco K', floor: 'Pavimento inferior' }),
    room('k-wc-m-inferior', '', 'WC Masculino', 'banheiros', { block: 'Bloco K', floor: 'Pavimento inferior' }),
    room('k-wc-f-inferior', '', 'WC Feminino', 'banheiros', { block: 'Bloco K', floor: 'Pavimento inferior' }),
    room('k-wc-pcd', '', 'WC PCD', 'banheiros', { block: 'Bloco K', floor: 'Pavimento inferior', accessibility: 'Acessível para pessoa com deficiência' })
  ],
  superior: [
    room('k-direcao', '', 'Direção do Campus', 'administrativo', { block: 'Bloco K', floor: 'Pavimento superior' }),
    room('k-secretaria-direcao', '', 'Secretaria da Direção', 'administrativo', { block: 'Bloco K', floor: 'Pavimento superior' }),
    room('k-cadm', '', 'CADM', 'administrativo', { block: 'Bloco K', floor: 'Pavimento superior' }),
    room('k-serca', '', 'SERCA', 'administrativo', { block: 'Bloco K', floor: 'Pavimento superior' }),
    room('k-coplan', '', 'COPLAN', 'administrativo', { block: 'Bloco K', floor: 'Pavimento superior' }),
    room('k-cpav', '', 'CPAV', 'administrativo', { block: 'Bloco K', floor: 'Pavimento superior' }),
    room('k-ndi', '', 'NDI', 'administrativo', { block: 'Bloco K', floor: 'Pavimento superior' }),
    room('k-biblioteca-adm', '', 'Biblioteca – setores administrativos', 'biblioteca', { block: 'Bloco K', floor: 'Pavimento superior' }),
    room('k-outros-orgaos', '', 'Demais órgãos administrativos', 'administrativo', { block: 'Bloco K', floor: 'Pavimento superior' }),
    room('k-copa-superior', '', 'Copa', 'alimentacao', { block: 'Bloco K', floor: 'Pavimento superior' }),
    room('k-salao-festas', '', 'Salão de Festas', 'administrativo', { block: 'Bloco K', floor: 'Pavimento superior' }),
    room('k-wc-m-superior', '', 'WC Masculino', 'banheiros', { block: 'Bloco K', floor: 'Pavimento superior' }),
    room('k-wc-f-superior', '', 'WC Feminino', 'banheiros', { block: 'Bloco K', floor: 'Pavimento superior' })
  ]
};

const fixedLocations = [
  fixed('entrada', 'Portaria / Entrada e saída', 'externo', 'Entrada principal do campus.'),
  fixed('estacionamento-publico', 'Estacionamento público', 'externo', 'Área de estacionamento destinada ao público.'),
  fixed('estacionamento-servidores', 'Estacionamento de servidores', 'externo', 'Área reservada aos servidores.'),
  fixed('deposito-antigo', 'Depósito Antigo', 'deposito', 'Estrutura independente com depósito e copa dos agentes de limpeza.'),
  fixed('safs', 'Sistema Agroflorestal (SAFs)', 'externo', 'Área utilizada em atividades de Gestão Ambiental.'),
  fixed('viveiro', 'Viveiro', 'externo', 'Área de produção de mudas e atividades práticas.'),
  fixed('campo-futebol', 'Campo de Futebol', 'externo', 'Área esportiva localizada ao lado da via lateral interna.')
];

let currentFloor = 'inferior';
let activeCategory = null;
let selectedId = null;
let searchTerm = '';
let transform = { x: 0, y: 0, scale: 1 };
let dragState = null;

const svgNS = 'http://www.w3.org/2000/svg';
const buildingsLayer = document.getElementById('buildingsLayer');
const routeLayer = document.getElementById('routeLayer');
const mapViewport = document.getElementById('mapViewport');
const mapSvg = document.getElementById('campusMap');
const panZoomLayer = document.getElementById('panZoomLayer');
const tooltip = document.getElementById('mapTooltip');
const detailsPanel = document.getElementById('detailsPanel');
const detailsTemplate = document.getElementById('detailsTemplate');
const searchInput = document.getElementById('searchInput');
const resultCount = document.getElementById('resultCount');

function room(id, number, name, category, extra = {}) {
  return { id, number, name, category, ...extra };
}

function fixed(id, name, category, description) {
  return { id, name, category, description, block: 'Estrutura externa' };
}

function getColor(item) {
  if (item.color) return item.color;
  if (item.category === 'departamentos') return COLORS.administrativo;
  return COLORS[item.category] || COLORS.apoio;
}

function textIsLight(hex) {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 145;
}

function createSvg(tag, attributes = {}, text = '') {
  const el = document.createElementNS(svgNS, tag);
  Object.entries(attributes).forEach(([key, value]) => el.setAttribute(key, value));
  if (text) el.textContent = text;
  return el;
}

function renderBlocks() {
  buildingsLayer.innerHTML = '';
  blocks.forEach(renderBlock);
  renderBlockK();
  bindFeatureEvents();
  applyFilters();
}

function renderBlock(block) {
  const group = createSvg('g', {
    id: block.id,
    class: 'block-group',
    'data-block': block.label
  });

  group.appendChild(createSvg('rect', {
    class: 'block-outline',
    x: block.x,
    y: block.y,
    width: block.w,
    height: block.h,
    rx: 16
  }));

  const labelWidth = Math.max(112, block.label.length * 10 + 30);
  group.appendChild(createSvg('rect', {
    class: 'block-label-bg',
    x: block.x + 12,
    y: block.y - 27,
    width: labelWidth,
    height: 28,
    rx: 8
  }));
  group.appendChild(createSvg('text', {
    class: 'block-label-text',
    x: block.x + 12 + labelWidth / 2,
    y: block.y - 8,
    'text-anchor': 'middle'
  }, block.label));

  const pad = 10;
  const amenitySpace = block.amenities?.length ? 62 : 0;
  const roomX = block.x + pad + amenitySpace;
  const roomY = block.y + pad;
  const roomW = block.w - pad * 2 - amenitySpace;
  const roomH = block.h - pad * 2;

  if (block.amenities?.length) {
    const amenityGroup = renderAmenities(block, block.x + pad, roomY, amenitySpace - 8, roomH);
    group.appendChild(amenityGroup);
  }

  if (block.rooms?.length) {
    const columns = block.columns || block.rooms.length;
    const rows = Math.ceil(block.rooms.length / columns);
    const cellW = roomW / columns;
    const cellH = roomH / rows;

    block.rooms.forEach((item, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = roomX + col * cellW;
      const y = roomY + row * cellH;
      group.appendChild(renderRoom(item, block.label, x, y, cellW, cellH));
    });
  }

  buildingsLayer.appendChild(group);
}

function renderAmenities(block, x, y, w, h) {
  const group = createSvg('g');
  const items = block.amenities || [];
  const cellH = h / items.length;
  items.forEach((name, index) => {
    const item = room(`${block.id}-amenity-${index}`, '', name, 'banheiros', { block: block.label });
    const g = createSvg('g', {
      class: 'map-feature room-feature',
      'data-id': item.id,
      'data-category': item.category,
      tabindex: '0',
      role: 'button',
      'aria-label': `${name}, ${block.label}`
    });
    g.appendChild(createSvg('rect', {
      class: 'room-shape',
      x,
      y: y + index * cellH,
      width: w,
      height: cellH,
      rx: 7,
      fill: COLORS.banheiros
    }));
    const lines = wrapText(name.replace('Masculino', 'Masc.').replace('Feminino', 'Fem.'), 10);
    lines.forEach((line, lineIndex) => {
      g.appendChild(createSvg('text', {
        class: 'amenity-label',
        x: x + w / 2,
        y: y + index * cellH + cellH / 2 + (lineIndex - (lines.length - 1) / 2) * 12 + 4,
        'text-anchor': 'middle'
      }, line));
    });
    registerLocation(item);
    group.appendChild(g);
  });
  return group;
}

function renderRoom(item, blockLabel, x, y, w, h) {
  item.block = item.block || blockLabel;
  item.anchor = { x: x + w / 2, y: y + h / 2 };
  registerLocation(item);

  const color = getColor(item);
  const light = textIsLight(color);
  const group = createSvg('g', {
    class: 'map-feature room-feature',
    'data-id': item.id,
    'data-category': item.category,
    tabindex: '0',
    role: 'button',
    'aria-label': `${item.number ? `Sala ${item.number}, ` : ''}${item.name}, ${item.block}`
  });

  group.appendChild(createSvg('rect', {
    class: 'room-shape',
    x: x + 2,
    y: y + 2,
    width: Math.max(1, w - 4),
    height: Math.max(1, h - 4),
    rx: 8,
    fill: color
  }));

  if (item.number) {
    group.appendChild(createSvg('text', {
      class: `room-number${light ? ' light' : ''}`,
      x: x + w / 2,
      y: y + Math.min(27, h * .35),
      'text-anchor': 'middle'
    }, item.number));
  }

  const availableWidth = Math.max(45, w - 12);
  const label = item.fullName && w > 120 ? item.name : item.name;
  const lines = wrapText(label, Math.max(7, Math.floor(availableWidth / 7)));
  const startY = y + (item.number ? Math.min(47, h * .56) : h / 2 - ((lines.length - 1) * 7));
  lines.slice(0, 3).forEach((line, index) => {
    group.appendChild(createSvg('text', {
      class: `room-name${light ? ' light' : ''}`,
      x: x + w / 2,
      y: startY + index * 14,
      'text-anchor': 'middle'
    }, line));
  });

  return group;
}

function renderBlockK() {
  const x = 930;
  const y = 315;
  const w = 465;
  const h = 285;
  const group = createSvg('g', { id: 'bloco-k', 'data-block': 'BLOCO K' });
  group.appendChild(createSvg('rect', { class: 'block-outline block-k-outline', x, y, width: w, height: h, rx: 22 }));
  group.appendChild(createSvg('rect', { x, y, width: w, height: 48, rx: 22, fill: '#123b63' }));
  group.appendChild(createSvg('rect', { x, y: y + 24, width: w, height: 24, fill: '#123b63' }));
  group.appendChild(createSvg('text', { class: 'floor-title', x: x + w / 2, y: y + 31, 'text-anchor': 'middle' }, 'BLOCO K – PRÉDIO AZUL'));

  const rooms = floorRooms[currentFloor];
  const contentY = y + 60;
  const innerPad = 12;
  const columns = currentFloor === 'inferior' ? 2 : 3;
  const rows = Math.ceil(rooms.length / columns);
  const cellW = (w - innerPad * 2) / columns;
  const cellH = (h - 74) / rows;

  const floorLabel = currentFloor === 'inferior' ? 'PAVIMENTO INFERIOR' : 'PAVIMENTO SUPERIOR';
  group.appendChild(createSvg('text', { x: x + w / 2, y: y + 58, 'text-anchor': 'middle', fill: '#d9ecff', 'font-size': '11', 'font-weight': '900' }, floorLabel));

  rooms.forEach((item, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const rx = x + innerPad + col * cellW;
    const ry = contentY + row * cellH;
    const g = renderRoom(item, 'BLOCO K', rx, ry, cellW, cellH);
    g.querySelectorAll('.room-name').forEach(el => el.setAttribute('class', 'floor-room-text'));
    g.querySelectorAll('.room-number').forEach(el => el.setAttribute('class', 'floor-room-number'));
    group.appendChild(g);
  });

  buildingsLayer.appendChild(group);
}

const locationRegistry = new Map();
function registerLocation(item) {
  locationRegistry.set(item.id, item);
}

function registerFixedLocations() {
  fixedLocations.forEach(item => registerLocation(item));
}

function bindFeatureEvents() {
  document.querySelectorAll('.map-feature').forEach(feature => {
    feature.addEventListener('click', event => {
      event.stopPropagation();
      selectLocation(feature.dataset.id);
    });
    feature.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectLocation(feature.dataset.id);
      }
    });
    feature.addEventListener('pointerenter', event => showTooltip(feature.dataset.id, event));
    feature.addEventListener('pointermove', moveTooltip);
    feature.addEventListener('pointerleave', hideTooltip);
  });
}

function showTooltip(id, event) {
  const item = locationRegistry.get(id);
  if (!item) return;
  tooltip.innerHTML = `<strong>${escapeHtml(item.name)}</strong>${escapeHtml(item.block || '')}`;
  tooltip.hidden = false;
  moveTooltip(event);
}

function moveTooltip(event) {
  if (tooltip.hidden) return;
  const rect = mapViewport.getBoundingClientRect();
  tooltip.style.left = `${event.clientX - rect.left + 14}px`;
  tooltip.style.top = `${event.clientY - rect.top + 14}px`;
}

function hideTooltip() {
  tooltip.hidden = true;
}

function selectLocation(id) {
  const item = locationRegistry.get(id);
  if (!item) return;
  selectedId = id;
  document.querySelectorAll('.map-feature').forEach(el => el.classList.toggle('is-selected', el.dataset.id === id));
  renderDetails(item);
}

function renderDetails(item) {
  const fragment = detailsTemplate.content.cloneNode(true);
  const color = getColor(item);
  fragment.querySelector('.details-color-bar').style.background = color;
  fragment.querySelector('.details-eyebrow').textContent = item.block || 'Local do campus';
  fragment.querySelector('.details-title').textContent = item.number ? `Sala ${item.number} — ${item.name}` : item.name;
  fragment.querySelector('.details-description').textContent = item.description || getDefaultDescription(item);

  const list = fragment.querySelector('.details-list');
  addDetail(list, 'Categoria', CATEGORY_LABELS[item.category] || item.category);
  if (item.fullName) addDetail(list, 'Nome completo', item.fullName);
  if (item.floor) addDetail(list, 'Pavimento', item.floor);
  if (item.accessibility) addDetail(list, 'Acessibilidade', item.accessibility);
  if (item.number) addDetail(list, 'Identificação', `Sala ${item.number}`);

  const closeButton = fragment.querySelector('.details-close');
  closeButton.addEventListener('click', clearSelection);
  fragment.querySelector('.route-action').addEventListener('click', () => showRouteTo(item));
  fragment.querySelector('.focus-action').addEventListener('click', () => focusLocation(item.id));

  detailsPanel.innerHTML = '';
  detailsPanel.appendChild(fragment);
  detailsPanel.classList.add('is-open');
}

function addDetail(list, label, value) {
  const wrapper = document.createElement('div');
  const dt = document.createElement('dt');
  const dd = document.createElement('dd');
  dt.textContent = label;
  dd.textContent = value;
  wrapper.append(dt, dd);
  list.appendChild(wrapper);
}

function getDefaultDescription(item) {
  if (item.category === 'salas') return 'Espaço destinado às atividades de ensino do campus.';
  if (item.category === 'departamentos') return 'Setor acadêmico responsável por atividades de gestão, ensino e apoio ao curso.';
  if (item.category === 'banheiros') return 'Estrutura de apoio localizada junto ao bloco.';
  if (item.category === 'laboratorio') return 'Espaço destinado às atividades práticas, acadêmicas e de pesquisa.';
  if (item.category === 'auditorios') return 'Espaço destinado a eventos, reuniões, palestras e apresentações.';
  if (item.category === 'biblioteca') return 'Setor de consulta, estudo, atendimento e apoio acadêmico.';
  return 'Local pertencente à estrutura do Campus Jorge Vassilakis.';
}

function clearSelection() {
  selectedId = null;
  document.querySelectorAll('.map-feature').forEach(el => el.classList.remove('is-selected'));
  routeLayer.innerHTML = '';
  detailsPanel.classList.remove('is-open');
  detailsPanel.innerHTML = `
    <div class="details-empty">
      <div class="empty-icon">⌖</div>
      <h2>Selecione um local</h2>
      <p>Clique em qualquer sala, bloco ou estrutura externa para visualizar as informações.</p>
    </div>`;
}

function showRouteTo(item) {
  const anchor = item.anchor || estimateAnchor(item.id);
  if (!anchor) return;
  routeLayer.innerHTML = '';
  const start = { x: 130, y: 585 };
  const corridor = { x: 620, y: 590 };
  const points = [start];

  if (anchor.x > 900) {
    points.push(corridor, { x: 910, y: 590 }, { x: 910, y: anchor.y });
  } else if (anchor.y > 650) {
    points.push({ x: 180, y: 620 }, { x: anchor.x, y: 620 });
  } else if (anchor.y < 300) {
    points.push({ x: 150, y: 180 }, { x: 620, y: 180 }, { x: anchor.x, y: 180 });
  } else {
    points.push(corridor, { x: 620, y: anchor.y }, { x: anchor.x, y: anchor.y });
  }
  points.push(anchor);

  routeLayer.appendChild(createSvg('polyline', {
    class: 'route-line',
    points: points.map(point => `${point.x},${point.y}`).join(' ')
  }));
  routeLayer.appendChild(createSvg('circle', { class: 'route-point', cx: start.x, cy: start.y, r: 9 }));
  routeLayer.appendChild(createSvg('circle', { class: 'route-point', cx: anchor.x, cy: anchor.y, r: 9 }));
}

function estimateAnchor(id) {
  const el = document.querySelector(`.map-feature[data-id="${CSS.escape(id)}"]`);
  if (!el) return null;
  const bbox = el.getBBox();
  return { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };
}

function focusLocation(id) {
  const el = document.querySelector(`.map-feature[data-id="${CSS.escape(id)}"]`);
  if (!el) return;
  const bbox = el.getBBox();
  const viewport = mapViewport.getBoundingClientRect();
  const targetScale = Math.min(2.2, Math.max(1.25, Math.min(viewport.width / (bbox.width * 4), viewport.height / (bbox.height * 4))));
  transform.scale = targetScale;
  transform.x = (750 - (bbox.x + bbox.width / 2)) * targetScale;
  transform.y = (460 - (bbox.y + bbox.height / 2)) * targetScale;
  applyTransform();
}

function renderFilters() {
  const counts = new Map();
  getAllLocations().forEach(item => counts.set(item.category, (counts.get(item.category) || 0) + 1));
  const container = document.getElementById('categoryFilters');
  container.innerHTML = '';

  [...counts.entries()]
    .sort((a, b) => (CATEGORY_LABELS[a[0]] || a[0]).localeCompare(CATEGORY_LABELS[b[0]] || b[0]))
    .forEach(([category, count]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'filter-chip';
      button.dataset.category = category;
      button.innerHTML = `
        <span class="filter-dot" style="background:${categoryColor(category)}"></span>
        <span>${escapeHtml(CATEGORY_LABELS[category] || category)}</span>
        <span class="filter-count">${count}</span>`;
      button.addEventListener('click', () => {
        activeCategory = activeCategory === category ? null : category;
        renderFilters();
        applyFilters();
      });
      if (activeCategory === category) button.classList.add('is-active');
      container.appendChild(button);
    });
}

function renderLegend() {
  const legend = document.getElementById('legend');
  legend.innerHTML = '';
  LEGEND_ITEMS.forEach(([label, color]) => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    swatch.style.background = color;
    const text = document.createElement('span');
    text.textContent = label;
    item.append(swatch, text);
    legend.appendChild(item);
  });
}

function applyFilters() {
  const normalizedSearch = normalize(searchTerm);
  let visibleCount = 0;

  document.querySelectorAll('.map-feature').forEach(el => {
    const item = locationRegistry.get(el.dataset.id);
    if (!item) return;
    const matchesCategory = !activeCategory || item.category === activeCategory;
    const haystack = normalize([item.name, item.number, item.block, item.fullName, item.floor].filter(Boolean).join(' '));
    const matchesSearch = !normalizedSearch || haystack.includes(normalizedSearch);
    const visible = matchesCategory && matchesSearch;

    el.classList.toggle('is-dimmed', !visible);
    el.classList.toggle('search-match', Boolean(normalizedSearch && matchesSearch));
    if (visible) visibleCount += 1;
  });

  resultCount.textContent = `${visibleCount} ${visibleCount === 1 ? 'local' : 'locais'}`;
}

function categoryColor(category) {
  if (category === 'departamentos') return 'linear-gradient(90deg,#CB6CE6,#5170FF,#7ED957)';
  return COLORS[category] || COLORS.apoio;
}

function getAllLocations() {
  const dynamic = blocks.flatMap(block => [
    ...(block.rooms || []).map(item => ({ ...item, block: item.block || block.label })),
    ...(block.amenities || []).map((name, index) => room(`${block.id}-amenity-${index}`, '', name, 'banheiros', { block: block.label }))
  ]);
  return [...dynamic, ...floorRooms[currentFloor], ...fixedLocations];
}

function wrapText(text, maxChars) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  words.forEach(word => {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line);
  return lines;
}

function normalize(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function applyTransform() {
  const scale = Math.max(.75, Math.min(3.2, transform.scale));
  transform.scale = scale;
  panZoomLayer.setAttribute('transform', `translate(${transform.x} ${transform.y}) scale(${scale})`);
}

function zoomBy(factor, clientX = null, clientY = null) {
  const oldScale = transform.scale;
  const newScale = Math.max(.75, Math.min(3.2, oldScale * factor));
  if (clientX !== null && clientY !== null) {
    const rect = mapViewport.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * 1500;
    const svgY = ((clientY - rect.top) / rect.height) * 920;
    const ratio = newScale / oldScale;
    transform.x = svgX - (svgX - transform.x) * ratio;
    transform.y = svgY - (svgY - transform.y) * ratio;
  }
  transform.scale = newScale;
  applyTransform();
}

function resetView() {
  transform = { x: 0, y: 0, scale: 1 };
  applyTransform();
  routeLayer.innerHTML = '';
}

function setupInteractions() {
  searchInput.addEventListener('input', () => {
    searchTerm = searchInput.value;
    applyFilters();
  });

  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      searchInput.focus();
    }
    if (event.key === 'Escape') {
      clearSelection();
      searchInput.blur();
    }
  });

  document.querySelectorAll('.floor-btn').forEach(button => {
    button.addEventListener('click', () => {
      currentFloor = button.dataset.floor;
      document.querySelectorAll('.floor-btn').forEach(btn => btn.classList.toggle('is-active', btn === button));
      renderBlocks();
      renderFilters();
      if (selectedId?.startsWith('k-')) clearSelection();
    });
  });

  document.getElementById('clearFiltersBtn').addEventListener('click', () => {
    activeCategory = null;
    searchTerm = '';
    searchInput.value = '';
    renderFilters();
    applyFilters();
  });
  document.getElementById('zoomInBtn').addEventListener('click', () => zoomBy(1.2));
  document.getElementById('zoomOutBtn').addEventListener('click', () => zoomBy(1 / 1.2));
  document.getElementById('resetViewBtn').addEventListener('click', resetView);
  document.getElementById('printBtn').addEventListener('click', () => window.print());

  mapViewport.addEventListener('wheel', event => {
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX, event.clientY);
  }, { passive: false });

  mapViewport.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    dragState = { startX: event.clientX, startY: event.clientY, x: transform.x, y: transform.y };
    mapViewport.setPointerCapture(event.pointerId);
  });
  mapViewport.addEventListener('pointermove', event => {
    if (!dragState) return;
    const rect = mapViewport.getBoundingClientRect();
    transform.x = dragState.x + ((event.clientX - dragState.startX) / rect.width) * 1500;
    transform.y = dragState.y + ((event.clientY - dragState.startY) / rect.height) * 920;
    applyTransform();
  });
  mapViewport.addEventListener('pointerup', event => {
    dragState = null;
    if (mapViewport.hasPointerCapture(event.pointerId)) mapViewport.releasePointerCapture(event.pointerId);
  });
  mapViewport.addEventListener('pointercancel', () => { dragState = null; });
  mapSvg.addEventListener('click', event => {
    if (event.target === mapSvg || event.target.classList.contains('site-background') || event.target.classList.contains('boundary-green')) {
      clearSelection();
    }
  });
}

registerFixedLocations();
renderLegend();
renderBlocks();
renderFilters();
setupInteractions();
applyTransform();
