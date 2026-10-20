'use strict';

const CAMPUS_DATA = (() => {
  const COLORS = Object.freeze({
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
  });

  const ADMINISTRATIVE_GRADIENT = Object.freeze({
    from: '#84A9FF',
    to: '#1F5F8F',
    css: 'linear-gradient(90deg,#84A9FF,#1F5F8F)'
  });

  const CATEGORIES = Object.freeze({
    salas: { label: 'Salas de aula', color: COLORS.salas },
    auditorios: { label: 'Auditórios', color: COLORS.auditorios },
    administrativo: { label: 'Setores administrativos', color: COLORS.administrativo, gradient: ADMINISTRATIVE_GRADIENT },
    departamentos: { label: 'Departamentos acadêmicos', color: COLORS.administrativo },
    banheiros: { label: 'Banheiros e apoio', color: COLORS.banheiros },
    laboratorio: { label: 'Laboratórios', color: COLORS.laboratorio },
    alimentacao: { label: 'Alimentação e convivência', color: COLORS.alimentacao },
    psicologia: { label: 'Psicologia', color: COLORS.psicologia },
    apoio: { label: 'Apoio acadêmico', color: COLORS.apoio },
    nao_identificado: { label: 'Função não identificada', color: COLORS.apoio },
    deposito: { label: 'Depósitos e limpeza', color: COLORS.deposito },
    biblioteca: { label: 'Biblioteca', color: COLORS.biblioteca },
    externo: { label: 'Estruturas externas', color: COLORS.externo }
  });

  const CATEGORY_LABELS = Object.freeze(Object.fromEntries(
    Object.entries(CATEGORIES).map(([id, category]) => [id, category.label])
  ));

  const DESCRIPTIONS = Object.freeze({
    salas: 'Espaço destinado às atividades de ensino do campus.',
    departamentos: 'Setor acadêmico responsável por atividades de gestão, ensino e apoio ao curso.',
    banheiros: 'Estrutura de apoio localizada junto ao bloco.',
    laboratorio: 'Espaço destinado às atividades práticas, acadêmicas e de pesquisa.',
    auditorios: 'Espaço destinado a eventos, reuniões, palestras e apresentações.',
    biblioteca: 'Setor de consulta, estudo, atendimento e apoio acadêmico.',
    apoio: 'Espaço de apoio às atividades acadêmicas do campus.',
    nao_identificado: 'A função deste ambiente ainda aguarda confirmação.',
    padrao: 'Local pertencente à estrutura do Campus Jorge Vassilakis.'
  });

  const LEGEND_ITEMS = Object.freeze([
    ['DACA', COLORS.daca],
    ['DACL', COLORS.dacl],
    ['DACED', COLORS.daced],
    ['DACSA', COLORS.dacsa],
    ['Biblioteca Setorial', COLORS.biblioteca],
    ['Banheiros', COLORS.banheiros],
    ['Auditórios', COLORS.auditorios],
    ['Salas de Aula', COLORS.salas],
    ['Setores Administrativos', ADMINISTRATIVE_GRADIENT.css]
  ]);

  function room(id, number, name, category, extra = {}) {
    return { id, number, name, category, ...extra };
  }

  function amenity(id, name, blockId, block) {
    return room(id, '', name, 'banheiros', { blockId, block });
  }

  // As coordenadas abaixo são esquemáticas e acompanham a calibração incremental do layout.
  const blocks = [
    {
      id: 'bloco-a', label: 'BLOCO A', x: 250, y: 120, w: 330, h: 72,
      rooms: [
        room('sala-1', '1', 'Mini Auditório', 'auditorios', { blockId: 'bloco-a' }),
        room('sala-2', '2', 'Sala de Aula', 'salas', { blockId: 'bloco-a' }),
        room('sala-3', '3', 'Sala de Aula', 'salas', { blockId: 'bloco-a' }),
        room('sala-4', '4', 'Depósito', 'deposito', { blockId: 'bloco-a' })
      ]
    },
    {
      id: 'bloco-b', label: 'BLOCO B', x: 563, y: 201, w: 320, h: 62, horizontalSequence: true, amenitiesFirst: true, compactSequence: true,
      rooms: [
        room('sala-5', '5', 'DACED', 'departamentos', { blockId: 'bloco-b', color: COLORS.daced, fullName: 'Departamento Acadêmico de Ciências da Educação' }),
        room('sala-6', '6', 'DACL', 'departamentos', { blockId: 'bloco-b', color: COLORS.dacl, fullName: 'Departamento Acadêmico de Ciências da Linguagem' }),
        room('sala-7', '7', 'Sala dos Professores', 'administrativo', { blockId: 'bloco-b' }),
        room('sala-8', '8', 'DACA', 'departamentos', { blockId: 'bloco-b', color: COLORS.daca, fullName: 'Departamento Acadêmico de Ciências da Administração' }),
        room('sala-9', '9', 'Sala de Amamentação', 'administrativo', { blockId: 'bloco-b' }),
        room('sala-10', '10', 'DACSA', 'departamentos', { blockId: 'bloco-b', color: COLORS.dacsa, fullName: 'Departamento Acadêmico de Ciências Sociais e Ambientais' }),
        room('sala-11', '11', 'DACSA', 'departamentos', { blockId: 'bloco-b', color: COLORS.dacsa, fullName: 'Departamento Acadêmico de Ciências Sociais e Ambientais' })
      ],
      amenities: [
        { ...amenity('bloco-b-amenity-0', 'WC Masculino', 'bloco-b', 'BLOCO B'), displayName: 'WC Masc.' },
        { ...amenity('bloco-b-amenity-1', 'WC Feminino', 'bloco-b', 'BLOCO B'), displayName: 'WC Fem.' },
        { ...amenity('bloco-b-amenity-2', 'Bebedouro', 'bloco-b', 'BLOCO B'), detached: true, x: 540, y: 220, w: 18, h: 18, labelSide: 'left' }
      ]
    },
    {
      id: 'bloco-c', label: 'BLOCO C', x: 250, y: 272, w: 330, h: 70,
      rooms: [
        room('sala-12', '12', 'Sala de Aula', 'salas', { blockId: 'bloco-c' }),
        room('sala-13', '13', 'Sala de Aula', 'salas', { blockId: 'bloco-c' }),
        room('sala-14', '14', 'Sala de Aula', 'salas', { blockId: 'bloco-c' }),
        room('sala-15', '15', 'Sala de Aula', 'salas', { blockId: 'bloco-c' }),
        room('sala-16', '16', 'Sala de Aula', 'salas', { blockId: 'bloco-c' }),
        room('sala-17', '17', 'Depósito', 'deposito', { blockId: 'bloco-c' })
      ]
    },
    {
      id: 'bloco-d', label: 'BLOCO D', x: 250, y: 350, w: 330, h: 70, labelX: 592, labelY: 335,
      rooms: [
        room('sala-18', '18', 'Sala de Aula', 'salas', { blockId: 'bloco-d' }),
        room('sala-19', '19', 'Sala de Aula', 'salas', { blockId: 'bloco-d' }),
        room('sala-20', '20', 'Sala de Aula', 'salas', { blockId: 'bloco-d' }),
        room('sala-21', '21', 'Sala de Aula', 'salas', { blockId: 'bloco-d' }),
        room('sala-22', '22', 'Sala de Aula', 'salas', { blockId: 'bloco-d' })
      ]
    },
    {
      id: 'bloco-e', label: 'BLOCO E', x: 889, y: 205, w: 64, h: 56, provisionalPosition: true, hideLabel: true,
      amenities: [
        { ...amenity('bloco-e-amenity-0', 'WC Masculino', 'bloco-e', 'BLOCO E'), displayName: 'WC Masc.' },
        { ...amenity('bloco-e-amenity-1', 'WC Feminino', 'bloco-e', 'BLOCO E'), displayName: 'WC Fem.' }
      ]
    },
    {
      id: 'bloco-f', label: 'BLOCO F', x: 250, y: 500, w: 330, h: 78, labelX: 592, labelY: 500,
      rooms: [
        room('sala-27', '27', 'Laboratório de Biologia', 'laboratorio', { blockId: 'bloco-f' }),
        room('sala-28', '28', 'Laboratório de Informática', 'laboratorio', { blockId: 'bloco-f' })
      ]
    },
    {
      id: 'bloco-salas-23-26', label: 'BLOCO SEM IDENTIFICAÇÃO', x: 255, y: 430, w: 320, h: 62,
      horizontalSequence: true, amenitiesFirst: true, compactSequence: true, hideLabel: true,
      pendingIdentification: true,
      rooms: [
        room('sala-23', '23', 'Sala ainda não identificada', 'nao_identificado', { blockId: 'bloco-salas-23-26', pendingIdentification: true }),
        room('sala-24', '24', 'Sala ainda não identificada', 'nao_identificado', { blockId: 'bloco-salas-23-26', pendingIdentification: true }),
        room('sala-25', '25', 'Brinquedoteca', 'apoio', { blockId: 'bloco-salas-23-26', layoutWeight: 2 }),
        room('sala-26', '26', 'Sala ainda não identificada', 'nao_identificado', { blockId: 'bloco-salas-23-26', pendingIdentification: true })
      ],
      amenities: [
        { ...amenity('bloco-salas-23-26-amenity-0', 'WC Masculino', 'bloco-salas-23-26', 'BLOCO SEM IDENTIFICAÇÃO'), displayName: 'WC Masc.' },
        { ...amenity('bloco-salas-23-26-amenity-1', 'WC Feminino', 'bloco-salas-23-26', 'BLOCO SEM IDENTIFICAÇÃO'), displayName: 'WC Fem.' },
        { ...amenity('bloco-salas-23-26-amenity-2', 'Bebedouro', 'bloco-salas-23-26', 'BLOCO SEM IDENTIFICAÇÃO'), detached: true, x: 234, y: 449, w: 18, h: 18 }
      ]
    },
    {
      id: 'bloco-g', label: 'BLOCO G', x: 565, y: 65, w: 310, h: 64,
      rooms: [
        room('sala-30', '30', 'Sala ainda não identificada', 'administrativo', { blockId: 'bloco-g', pendingIdentification: true }),
        room('sala-31', '31', 'Sala da Equipe de Limpeza', 'deposito', { blockId: 'bloco-g' }),
        room('sala-32', '32', 'Sala da Equipe de Limpeza', 'deposito', { blockId: 'bloco-g' }),
        room('sala-33', '33', 'Cantina', 'alimentacao', { blockId: 'bloco-g' }),
        room('sala-34', '34', 'Atlética Kopakao e CAGEAM', 'administrativo', { blockId: 'bloco-g', fullName: 'Atlética Kopakao e Centro Acadêmico de Gestão Ambiental – CAGEAM' })
      ],
      amenities: [
        { ...amenity('bloco-g-amenity-0', 'WC Masculino', 'bloco-g', 'BLOCO G'), displayName: 'WC' },
        { ...amenity('bloco-g-amenity-1', 'WC Feminino', 'bloco-g', 'BLOCO G'), displayName: 'WC' }
      ]
    },
    {
      id: 'bloco-h', label: 'BLOCO H', x: 869, y: 66, w: 70, h: 124, hideLabel: true, contentPad: 2,
      rooms: [room('sala-35', '35', 'Auditório Grande', 'auditorios', { blockId: 'bloco-h' })]
    },
    {
      id: 'bloco-i', label: 'BLOCO I', x: 970, y: 210, w: 125, h: 65, provisionalPosition: true,
      rooms: [
        room('sala-36', '36', 'Psicologia', 'psicologia', { blockId: 'bloco-i' }),
        room('sala-37', '37', 'Depósito', 'deposito', { blockId: 'bloco-i' })
      ]
    }
  ];

  const FLOORS = Object.freeze({
    inferior: { id: 'inferior', label: 'Pavimento inferior', blockId: 'bloco-k' },
    superior: { id: 'superior', label: 'Pavimento superior', blockId: 'bloco-k' }
  });

  const blockK = Object.freeze({
    id: 'bloco-k',
    label: 'BLOCO K',
    buildingLabel: 'BLOCO K – PRÉDIO AZUL',
    x: 940,
    y: 415,
    w: 360,
    h: 260,
    floorColumns: Object.freeze({ inferior: 2, superior: 3 })
  });

  const floorRooms = {
    inferior: [
      room('k-biblioteca-setorial', '', 'Biblioteca Setorial', 'biblioteca', { blockId: 'bloco-k', block: 'Bloco K', floorId: 'inferior', floor: FLOORS.inferior.label }),
      room('k-auditorio-biblioteca', '', 'Auditório da Biblioteca', 'auditorios', { blockId: 'bloco-k', block: 'Bloco K', floorId: 'inferior', floor: FLOORS.inferior.label }),
      room('k-copa-inferior', '', 'Copa', 'alimentacao', { blockId: 'bloco-k', block: 'Bloco K', floorId: 'inferior', floor: FLOORS.inferior.label }),
      room('k-wc-m-inferior', '', 'WC Masculino', 'banheiros', { blockId: 'bloco-k', block: 'Bloco K', floorId: 'inferior', floor: FLOORS.inferior.label }),
      room('k-wc-f-inferior', '', 'WC Feminino', 'banheiros', { blockId: 'bloco-k', block: 'Bloco K', floorId: 'inferior', floor: FLOORS.inferior.label }),
      room('k-wc-pcd', '', 'WC PCD', 'banheiros', { blockId: 'bloco-k', block: 'Bloco K', floorId: 'inferior', floor: FLOORS.inferior.label })
    ],
    superior: [
      room('k-direcao', '', 'Direção do Campus', 'administrativo', { blockId: 'bloco-k', block: 'Bloco K', floorId: 'superior', floor: FLOORS.superior.label }),
      room('k-secretaria-direcao', '', 'Secretaria da Direção', 'administrativo', { blockId: 'bloco-k', block: 'Bloco K', floorId: 'superior', floor: FLOORS.superior.label }),
      room('k-cadm', '', 'CADM', 'administrativo', { blockId: 'bloco-k', block: 'Bloco K', floorId: 'superior', floor: FLOORS.superior.label }),
      room('k-serca', '', 'SERCA', 'administrativo', { blockId: 'bloco-k', block: 'Bloco K', floorId: 'superior', floor: FLOORS.superior.label }),
      room('k-coplan', '', 'COPLAN', 'administrativo', { blockId: 'bloco-k', block: 'Bloco K', floorId: 'superior', floor: FLOORS.superior.label }),
      room('k-cpav', '', 'CPAV', 'administrativo', { blockId: 'bloco-k', block: 'Bloco K', floorId: 'superior', floor: FLOORS.superior.label }),
      room('k-ndi', '', 'NDI', 'administrativo', { blockId: 'bloco-k', block: 'Bloco K', floorId: 'superior', floor: FLOORS.superior.label }),
      room('k-biblioteca-adm', '', 'Biblioteca – setores administrativos', 'biblioteca', { blockId: 'bloco-k', block: 'Bloco K', floorId: 'superior', floor: FLOORS.superior.label }),
      room('k-outros-orgaos', '', 'Demais órgãos administrativos', 'administrativo', { blockId: 'bloco-k', block: 'Bloco K', floorId: 'superior', floor: FLOORS.superior.label }),
      room('k-copa-superior', '', 'Copa', 'alimentacao', { blockId: 'bloco-k', block: 'Bloco K', floorId: 'superior', floor: FLOORS.superior.label }),
      room('k-salao-festas', '', 'Salão de Festas', 'administrativo', { blockId: 'bloco-k', block: 'Bloco K', floorId: 'superior', floor: FLOORS.superior.label }),
      room('k-wc-m-superior', '', 'WC Masculino', 'banheiros', { blockId: 'bloco-k', block: 'Bloco K', floorId: 'superior', floor: FLOORS.superior.label }),
      room('k-wc-f-superior', '', 'WC Feminino', 'banheiros', { blockId: 'bloco-k', block: 'Bloco K', floorId: 'superior', floor: FLOORS.superior.label })
    ]
  };

  const externalStructures = [
    { id: 'entrada', name: 'Portaria / Entrada e saída do campus', category: 'externo', block: 'Estrutura externa', interactive: true, components: ['Portaria', 'Entrada e saída do campus'], description: 'Entrada principal do campus.' },
    { id: 'via-lateral-interna', name: 'Via lateral interna sem pavimentação ligando a entrada ao Bloco K', category: 'externo', block: 'Estrutura externa', interactive: false },
    { id: 'calcadas-blocos', name: 'Calçadas junto aos blocos A, C, D, E e F', category: 'externo', block: 'Estrutura externa', interactive: false },
    { id: 'estacionamento-publico', name: 'Via lateral de circulação', category: 'externo', block: 'Estrutura externa', interactive: true, components: ['Via de circulação para motos, carros e bicicletas', 'Canteiro central', 'Retorno intermediário', 'Retorno final'], description: 'Via interna de circulação com entrada pela direita da Portaria, retornos e saída pela esquerda.' },
    { id: 'estacionamento-servidores', name: 'Estacionamento de servidores', category: 'externo', block: 'Estrutura externa', interactive: true, description: 'Área reservada aos servidores.' },
    { id: 'campo-futebol', name: 'Campo de Futebol', category: 'externo', block: 'Estrutura externa', interactive: true, description: 'Área esportiva localizada ao lado da via lateral interna.' },
    { id: 'safs', name: 'Sistema Agroflorestal – SAFs', category: 'externo', block: 'Estrutura externa', interactive: true, description: 'Área utilizada em atividades de Gestão Ambiental.' },
    { id: 'viveiro', name: 'Viveiro', category: 'externo', block: 'Estrutura externa', interactive: true, description: 'Área de produção de mudas e atividades práticas.' },
    { id: 'deposito-antigo', name: 'Depósito Antigo', category: 'deposito', block: 'Estrutura externa', interactive: true, components: ['Depósito Antigo', 'Copa dos Agentes de Limpeza'], description: 'Estrutura independente com depósito e copa dos agentes de limpeza.' }
    ,{ id: 'pes-jambo', name: 'Pés de jambo', category: 'externo', block: 'Estrutura externa', interactive: false, description: 'Faixa arborizada indicada na planta de referência.' }
  ];

  const fixedLocations = externalStructures.filter(item => item.interactive);

  function validateCampusData() {
    const errors = [];
    const warnings = [];
    const knownBlocks = new Set([...blocks.map(block => block.id), blockK.id]);
    const knownFloors = new Set(Object.keys(FLOORS));
    const ids = new Set();
    const roomNumbers = new Set();
    const allItems = [
      ...blocks.flatMap(block => [...(block.rooms || []), ...(block.amenities || [])]),
      ...Object.values(floorRooms).flat(),
      ...externalStructures
    ];

    function registerId(id, entityLabel) {
      if (!id) errors.push(`${entityLabel} sem ID.`);
      else if (ids.has(id)) errors.push(`ID duplicado: ${id}.`);
      else ids.add(id);
    }

    blocks.forEach(block => registerId(block.id, 'Bloco'));
    registerId(blockK.id, 'Bloco');
    Object.keys(FLOORS).forEach(floorId => registerId(`pavimento-${floorId}`, 'Pavimento'));
    Object.entries(CATEGORIES).forEach(([categoryId, category]) => {
      if (!category.color) errors.push(`Categoria sem cor definida: ${categoryId}.`);
    });

    allItems.forEach(item => {
      registerId(item.id, 'Item');

      if (!item.name?.trim()) errors.push(`Item ${item.id || '(sem ID)'} sem nome.`);
      if (!item.category) errors.push(`Item ${item.id || '(sem ID)'} sem categoria.`);
      else if (!CATEGORIES[item.category]?.color) errors.push(`Categoria sem cor definida: ${item.category}.`);

      if (item.number) {
        if (roomNumbers.has(item.number)) errors.push(`Número de sala repetido: ${item.number}.`);
        else roomNumbers.add(item.number);
      }

      if (item.blockId && !knownBlocks.has(item.blockId)) errors.push(`Bloco inexistente em ${item.id}: ${item.blockId}.`);
      if (item.floorId && !knownFloors.has(item.floorId)) errors.push(`Pavimento inexistente em ${item.id}: ${item.floorId}.`);
      if (item.pendingIdentification) {
        const label = item.number ? `Sala ${item.number}` : (item.label || item.id);
        warnings.push(`${label}: função ou identificação ainda não confirmada.`);
      }
    });

    Object.entries(floorRooms).forEach(([floorId, items]) => {
      if (!knownFloors.has(floorId)) errors.push(`Pavimento inexistente: ${floorId}.`);
      items.forEach(item => {
        if (item.floorId !== floorId) errors.push(`Pavimento inconsistente em ${item.id}.`);
      });
    });

    return { valid: errors.length === 0, errors, warnings };
  }

  const validation = validateCampusData();
  validation.errors.forEach(message => console.error(`[CampusData] ${message}`));
  validation.warnings.forEach(message => console.warn(`[CampusData] ${message}`));

  return Object.freeze({
    COLORS,
    ADMINISTRATIVE_GRADIENT,
    CATEGORIES,
    CATEGORY_LABELS,
    DESCRIPTIONS,
    LEGEND_ITEMS,
    FLOORS,
    blockK,
    blocks,
    floorRooms,
    externalStructures,
    fixedLocations,
    validation
  });
})();
