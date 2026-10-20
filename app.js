'use strict';

const {
  COLORS,
  CATEGORY_LABELS,
  DESCRIPTIONS,
  LEGEND_ITEMS,
  blockK,
  blocks,
  floorRooms,
  fixedLocations
} = CAMPUS_DATA;

let currentFloor = 'inferior';
let activeCategory = null;
let selectedId = null;
let searchTerm = '';
let transform = { x: 0, y: 0, scale: 1 };
let dragState = null;
let suppressMapClick = false;

const PAN_THRESHOLD_PX = 6;

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
    class: `block-group${block.compactSequence ? ' compact-sequence' : ''}`,
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

  if (!block.hideLabel) {
    registerLocation({ id: block.id, name: block.label, block: block.label, category: 'administrativo', kind: 'block' });
    const labelWidth = Math.max(112, block.label.length * 10 + 30);
    const blockLabelX = block.labelX ?? block.x + 12;
    const blockLabelY = block.labelY ?? (block.labelBelow ? block.y + block.h + 8 : block.y - 27);
    const blockLabelTextY = block.labelTextY ?? blockLabelY + 19;
    const labelGroup = createSvg('g', {
      class: 'map-feature block-label-feature',
      'data-id': block.id,
      'data-category': 'administrativo',
      tabindex: '0',
      role: 'button',
      'aria-label': `Abrir ambientes do ${block.label}`
    });
    labelGroup.appendChild(createSvg('rect', {
      class: 'block-label-bg',
      x: blockLabelX,
      y: blockLabelY,
      width: labelWidth,
      height: 28,
      rx: 8
    }));
    labelGroup.appendChild(createSvg('text', {
      class: 'block-label-text',
      x: blockLabelX + labelWidth / 2,
      y: blockLabelTextY,
      'text-anchor': 'middle'
    }, block.label));
    group.appendChild(labelGroup);
  }

  const pad = block.contentPad ?? (block.compactSequence ? 4 : 10);
  const attachedAmenities = (block.amenities || []).filter(item => !item.detached);
  const sequenceItems = block.horizontalSequence
    ? (block.amenitiesFirst
      ? [...attachedAmenities, ...(block.rooms || [])]
      : [...(block.rooms || []), ...attachedAmenities])
    : null;
  const amenitySpace = !sequenceItems && attachedAmenities.length ? 62 : 0;
  const roomX = block.x + pad + amenitySpace;
  const roomY = block.y + pad;
  const roomW = block.w - pad * 2 - amenitySpace;
  const roomH = block.h - pad * 2;

  if (!sequenceItems && attachedAmenities.length) {
    const amenityGroup = renderAmenities(block, attachedAmenities, block.x + pad, roomY, amenitySpace - 8, roomH);
    group.appendChild(amenityGroup);
  }

  if (sequenceItems) {
    const totalWeight = sequenceItems.reduce((sum, item) => sum + (item.layoutWeight || 1), 0);
    let currentX = roomX;
    sequenceItems.forEach(item => {
      const cellW = roomW * (item.layoutWeight || 1) / totalWeight;
      group.appendChild(renderRoom(item, block.label, currentX, roomY, cellW, roomH));
      currentX += cellW;
    });
  } else if (block.rooms?.length) {
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

  (block.amenities || []).filter(item => item.detached).forEach(item => {
    group.appendChild(renderDetachedAmenity(item, block.label));
  });

  buildingsLayer.appendChild(group);
}

function renderAmenities(block, items, x, y, w, h) {
  const group = createSvg('g');
  const cellH = h / items.length;
  items.forEach((item, index) => {
    const name = item.displayName || item.name;
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

function renderDetachedAmenity(item, blockLabel) {
  const { x, y, w, h } = item;
  item.anchor = { x: x + w / 2, y: y + h / 2 };
  registerLocation(item);

  const group = createSvg('g', {
    class: 'map-feature room-feature detached-amenity',
    'data-id': item.id,
    'data-category': item.category,
    tabindex: '0',
    role: 'button',
    'aria-label': `${item.name}, ao lado do ${blockLabel}`
  });
  group.appendChild(createSvg('circle', {
    class: 'room-shape detached-amenity-shape',
    cx: x + w / 2,
    cy: y + h / 2,
    r: Math.min(w, h) / 2,
    fill: COLORS.banheiros
  }));
  group.appendChild(createSvg('path', {
    class: 'water-drop-icon',
    d: `M${x + w / 2} ${y + 9}C${x + 11} ${y + 24},${x + 12} ${y + 31},${x + w / 2} ${y + 34}C${x + w - 12} ${y + 31},${x + w - 11} ${y + 24},${x + w / 2} ${y + 9}Z`
  }));
  group.appendChild(createSvg('text', {
    class: 'detached-amenity-label',
    x: item.labelSide === 'left' ? x - 4 : x + w / 2,
    y: item.labelSide === 'left' ? y + h / 2 + 4 : y + h + 16,
    'text-anchor': item.labelSide === 'left' ? 'end' : 'middle'
  }, item.name));
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
  const label = item.displayName || item.name;
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
  const { x, y, w, h } = blockK;
  const titleStrip = { x: x + w, y, w: 42, h };
  const group = createSvg('g', { id: blockK.id, 'data-block': blockK.label });
  registerLocation({ id: blockK.id, name: blockK.buildingLabel, block: blockK.label, category: 'administrativo', kind: 'block', auditPending: true });
  group.appendChild(createSvg('rect', { class: 'block-outline block-k-outline', x, y, width: w, height: h, rx: 22 }));
  const header = createSvg('g', { class: 'map-feature block-label-feature', 'data-id': blockK.id, 'data-category': 'administrativo', tabindex: '0', role: 'button', 'aria-label': `Abrir informações do ${blockK.buildingLabel}` });
  header.appendChild(createSvg('rect', { class: 'block-k-side-label-bg', x: titleStrip.x, y: titleStrip.y, width: titleStrip.w, height: titleStrip.h, rx: 18 }));
  header.appendChild(createSvg('text', {
    class: 'floor-title block-k-side-label',
    x: titleStrip.x + titleStrip.w / 2,
    y: titleStrip.y + titleStrip.h / 2,
    'text-anchor': 'middle',
    transform: `rotate(90 ${titleStrip.x + titleStrip.w / 2} ${titleStrip.y + titleStrip.h / 2})`
  }, blockK.buildingLabel));
  group.appendChild(header);

  const rooms = floorRooms[currentFloor];
  const contentY = y + 60;
  const innerPad = 12;
  const columns = blockK.floorColumns[currentFloor];
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

  const auditAction = fragment.querySelector('.audit-action');
  const historyAction = fragment.querySelector('.audit-history-action');
  if (window.AUDIT_DATA?.getEnvironmentByMapId(item.id)) {
    fragment.querySelector('.details-audit-actions').hidden = false;
    auditAction.hidden = false;
    historyAction.hidden = false;
    auditAction.addEventListener('click', () => window.dispatchEvent(new CustomEvent('audit:start', { detail: { mapId: item.id } })));
    historyAction.addEventListener('click', () => window.dispatchEvent(new CustomEvent('audit:history', { detail: { mapId: item.id } })));
  }

  detailsPanel.innerHTML = '';
  detailsPanel.appendChild(fragment);
  detailsPanel.hidden = false;
  detailsPanel.setAttribute('aria-hidden', 'false');
  detailsPanel.classList.add('is-open');
  window.dispatchEvent(new CustomEvent('campus:location-selected', { detail: { item } }));
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
  return DESCRIPTIONS[item.category] || DESCRIPTIONS.padrao;
}

function clearSelection() {
  selectedId = null;
  document.querySelectorAll('.map-feature').forEach(el => el.classList.remove('is-selected'));
  routeLayer.innerHTML = '';
  detailsPanel.classList.remove('is-open');
  detailsPanel.setAttribute('aria-hidden', 'false');
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
    ...(block.amenities || [])
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
    if (event.target.closest?.('.map-feature')) return;
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: transform.x,
      y: transform.y,
      isPanning: false
    };
    suppressMapClick = false;
  });
  mapViewport.addEventListener('pointermove', event => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
    if (!dragState.isPanning) {
      if (distance < PAN_THRESHOLD_PX) return;
      dragState.isPanning = true;
      suppressMapClick = true;
      mapViewport.setPointerCapture(event.pointerId);
    }
    const rect = mapViewport.getBoundingClientRect();
    transform.x = dragState.x + ((event.clientX - dragState.startX) / rect.width) * 1500;
    transform.y = dragState.y + ((event.clientY - dragState.startY) / rect.height) * 920;
    applyTransform();
  });
  mapViewport.addEventListener('pointerup', event => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const completedPan = dragState.isPanning;
    dragState = null;
    if (mapViewport.hasPointerCapture(event.pointerId)) mapViewport.releasePointerCapture(event.pointerId);
    if (completedPan) setTimeout(() => { suppressMapClick = false; }, 0);
  });
  mapViewport.addEventListener('pointercancel', event => {
    if (dragState?.pointerId === event.pointerId) dragState = null;
    if (mapViewport.hasPointerCapture(event.pointerId)) mapViewport.releasePointerCapture(event.pointerId);
    suppressMapClick = false;
  });
  mapSvg.addEventListener('click', event => {
    if (suppressMapClick) {
      suppressMapClick = false;
      event.preventDefault();
      return;
    }
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
