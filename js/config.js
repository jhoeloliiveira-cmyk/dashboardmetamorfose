// =============================================================================
// TrafficFlow Pro — Config, Board Columns & Mock Data
// =============================================================================

const CONFIG = {
  APP: { NAME: 'TrafficFlow Pro', VERSION: '2.0.0', CURRENCY: 'BRL', LOCALE: 'pt-BR' },
  API: {
    MODE: 'mock', // 'mock' | 'facebook'
    FACEBOOK: {
      BASE_URL: 'https://graph.facebook.com/v19.0',
      TOKEN: null,
      VERSION: 'v19.0',
    },
    AI_ASSISTANT: {
      ENABLED: false,
      TOKEN: null,
      BASE_URL: 'https://api.anthropic.com/v1/messages',
      MODEL: 'claude-sonnet-4-6',
    },
  },
  PERIODS: [
    { label: 'Hoje',           value: 'today',      days: 1  },
    { label: 'Ontem',          value: 'yesterday',  days: 1  },
    { label: 'Últimos 7 dias',  value: 'last_7d',   days: 7  },
    { label: 'Últimos 14 dias', value: 'last_14d',  days: 14 },
    { label: 'Últimos 30 dias', value: 'last_30d',  days: 30 },
    { label: 'Este mês',        value: 'this_month',days: null},
    { label: 'Mês passado',     value: 'last_month',days: null},
  ],
  NICHES: [
    'Estética & Saúde','Fitness & Academia','Imóveis','Educação',
    'E-commerce','Jurídico','Restaurante & Gastronomia','Moda',
    'Tecnologia','Serviços','Outro',
  ],
};

const BOARD_COLUMNS = [
  { id: 'prospecting', label: 'Prospecção', color: '#64748b', emoji: '🔍' },
  { id: 'active',      label: 'Ativo',       color: '#10b981', emoji: '🟢' },
  { id: 'optimizing',  label: 'Otimizando',  color: '#3b82f6', emoji: '⚡' },
  { id: 'paused',      label: 'Em Pausa',    color: '#f59e0b', emoji: '⏸' },
  { id: 'closed',      label: 'Encerrado',   color: '#ef4444', emoji: '🔴' },
];

// =============================================================================
// MOCK DATA GENERATOR
// =============================================================================

function _genDay(cfg, daysBack) {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  const dow = d.getDay();
  const isWeekend = dow === 0 || dow === 6;
  const wMod = cfg.isB2C
    ? (isWeekend ? 1.28 : 0.92)
    : (isWeekend ? 0.52 : 1.12);
  const v = () => 0.72 + Math.random() * 0.56;

  const spend       = parseFloat((cfg.dailyBudget * wMod * v()).toFixed(2));
  const cpm         = cfg.cpm * (0.82 + Math.random() * 0.36);
  const impressions = Math.max(1, Math.round((spend / cpm) * 1000));
  const reach       = Math.round(impressions * (0.70 + Math.random() * 0.18));
  const ctrVal      = cfg.ctr * (0.65 + Math.random() * 0.70);
  const link_clicks = Math.max(0, Math.round(impressions * (ctrVal / 100)));
  const cpc         = link_clicks > 0 ? parseFloat((spend / link_clicks).toFixed(2)) : 0;
  const cpmA        = parseFloat((spend / impressions * 1000).toFixed(2));
  const cvRate      = cfg.convRate * (0.55 + Math.random() * 0.90);
  const leads       = Math.max(0, Math.round(link_clicks * (cvRate / 100)));
  const cpl         = leads > 0 ? parseFloat((spend / leads).toFixed(2)) : 0;
  const conversations = Math.round(leads * (0.22 + Math.random() * 0.28));

  return {
    date: d.toISOString().split('T')[0],
    spend, impressions, reach, link_clicks,
    frequency: parseFloat((impressions / Math.max(1,reach)).toFixed(2)),
    ctr: link_clicks > 0 ? parseFloat((link_clicks / impressions * 100).toFixed(2)) : 0,
    cpc, cpm: cpmA, leads, cpl, conversations,
    cost_per_conversation: conversations > 0 ? parseFloat((spend / conversations).toFixed(2)) : 0,
    conversion_rate: link_clicks > 0 ? parseFloat((leads / link_clicks * 100).toFixed(2)) : 0,
  };
}

function generateDailyData(cfg, days = 30) {
  return Array.from({ length: days }, (_, i) => _genDay(cfg, days - 1 - i));
}

function sumMetrics(daily) {
  if (!daily || !daily.length) {
    return { spend:0,impressions:0,reach:0,link_clicks:0,leads:0,conversations:0,
             ctr:0,cpc:0,cpm:0,cpl:0,cost_per_conversation:0,conversion_rate:0,frequency:0 };
  }
  const t = daily.reduce((a, d) => {
    a.spend         += d.spend        || 0;
    a.impressions   += d.impressions  || 0;
    a.reach         += d.reach        || 0;
    a.link_clicks   += d.link_clicks  || 0;
    a.leads         += d.leads        || 0;
    a.conversations += d.conversations|| 0;
    return a;
  }, { spend:0,impressions:0,reach:0,link_clicks:0,leads:0,conversations:0 });

  t.ctr  = t.impressions > 0 ? parseFloat((t.link_clicks / t.impressions * 100).toFixed(2)) : 0;
  t.cpc  = t.link_clicks > 0 ? parseFloat((t.spend / t.link_clicks).toFixed(2)) : 0;
  t.cpm  = t.impressions > 0 ? parseFloat((t.spend / t.impressions * 1000).toFixed(2)) : 0;
  t.cpl  = t.leads > 0 ? parseFloat((t.spend / t.leads).toFixed(2)) : 0;
  t.cost_per_conversation = t.conversations > 0 ? parseFloat((t.spend / t.conversations).toFixed(2)) : 0;
  t.conversion_rate = t.link_clicks > 0 ? parseFloat((t.leads / t.link_clicks * 100).toFixed(2)) : 0;
  t.frequency = t.reach > 0 ? parseFloat((t.impressions / t.reach).toFixed(2)) : 0;
  return t;
}

function buildClient(meta, campaigns, metricsConfig) {
  const daily30 = generateDailyData(metricsConfig, 30);
  campaigns.forEach(c => {
    c.daily  = generateDailyData({ ...metricsConfig, dailyBudget: metricsConfig.dailyBudget * (c._budgetShare || 0.33) }, 30);
    c.totals = sumMetrics(c.daily);
  });
  return {
    ...meta, campaigns, metricsConfig,
    daily30,
    daily14: daily30.slice(-14),
    daily7:  daily30.slice(-7),
    totals30: sumMetrics(daily30),
    totals14: sumMetrics(daily30.slice(-14)),
    totals7:  sumMetrics(daily30.slice(-7)),
  };
}

// =============================================================================
// MOCK CLIENTS
// =============================================================================

const MOCK_CLIENTS = [
  buildClient(
    { id:'bella-vita', name:'Clínica Bella Vita', niche:'Estética & Saúde',
      boardStatus:'active', platform:'facebook', status:'active',
      initials:'BV', color:'#ec4899',
      budget:{ monthly:15000, daily:500 },
      adAccount:{ id:'act_112233445', name:'Bella Vita Ads', currency:'BRL', status:'ACTIVE' },
      contact:{ name:'Dra. Marina Santos', email:'marina@bellavita.com.br', phone:'(11) 99999-0001' },
      startDate:'2024-01-15',
      notes:'Cliente Premium. Foco em leads qualificados para procedimentos acima de R$1.500.' },
    [
      { id:'c-bv-1', name:'Leads - Botox & Harmonização', status:'ACTIVE', objective:'LEAD_GENERATION', _budgetShare:0.50,
        adSets:[{ id:'as-bv-1-1', name:'Mulheres 28-55 - Grande SP', status:'ACTIVE' },
                { id:'as-bv-1-2', name:'Lookalike Clientes - SP', status:'ACTIVE' }] },
      { id:'c-bv-2', name:'Remarketing - Visitantes Site',    status:'ACTIVE', objective:'CONVERSIONS',     _budgetShare:0.30,
        adSets:[{ id:'as-bv-2-1', name:'Retargeting 30 dias', status:'ACTIVE' }] },
      { id:'c-bv-3', name:'Awareness - Clínica Premium',      status:'PAUSED', objective:'BRAND_AWARENESS', _budgetShare:0.20,
        adSets:[{ id:'as-bv-3-1', name:'Alcance Amplo - SP',  status:'PAUSED' }] },
    ],
    { dailyBudget:500, cpm:19, ctr:2.9, convRate:9, isB2C:true }
  ),

  buildClient(
    { id:'fitmax', name:'Academia FitMax', niche:'Fitness & Academia',
      boardStatus:'active', platform:'facebook', status:'active',
      initials:'FM', color:'#10b981',
      budget:{ monthly:8000, daily:267 },
      adAccount:{ id:'act_223344556', name:'FitMax Anúncios', currency:'BRL', status:'ACTIVE' },
      contact:{ name:'Carlos Drummond', email:'carlos@fitmax.com.br', phone:'(21) 99988-0002' },
      startDate:'2024-03-01',
      notes:'Foco em matrículas. Pico de conversão em jan e jul.' },
    [
      { id:'c-fm-1', name:'Matrículas - Planos Mensais', status:'ACTIVE', objective:'LEAD_GENERATION', _budgetShare:0.55,
        adSets:[{ id:'as-fm-1-1', name:'Homens e Mulheres 20-45 - RJ', status:'ACTIVE' }] },
      { id:'c-fm-2', name:'Promo Trimestral - 30% OFF',  status:'ACTIVE', objective:'CONVERSIONS',     _budgetShare:0.30,
        adSets:[{ id:'as-fm-2-1', name:'Público Quente - Visitas', status:'ACTIVE' }] },
      { id:'c-fm-3', name:'Branding - FitMax Lifestyle', status:'ACTIVE', objective:'BRAND_AWARENESS', _budgetShare:0.15,
        adSets:[{ id:'as-fm-3-1', name:'Jovens 18-35 - RJ', status:'ACTIVE' }] },
    ],
    { dailyBudget:267, cpm:14, ctr:3.4, convRate:6, isB2C:true }
  ),

  buildClient(
    { id:'horizonte', name:'Construtora Horizonte', niche:'Imóveis',
      boardStatus:'optimizing', platform:'facebook', status:'active',
      initials:'CH', color:'#f59e0b',
      budget:{ monthly:28000, daily:933 },
      adAccount:{ id:'act_334455667', name:'Horizonte Imóveis Ads', currency:'BRL', status:'ACTIVE' },
      contact:{ name:'Ricardo Alves', email:'ricardo@horizonte.com.br', phone:'(11) 3333-0003' },
      startDate:'2023-09-10',
      notes:'Maior orçamento da carteira. Lançamento Edifício Paramount previsto para jun/2025.' },
    [
      { id:'c-hz-1', name:'Lançamento - Paramount Residências', status:'ACTIVE', objective:'LEAD_GENERATION', _budgetShare:0.45,
        adSets:[{ id:'as-hz-1-1', name:'Renda A/B - SP Capital', status:'ACTIVE' },
                { id:'as-hz-1-2', name:'Investidores - Lookalike', status:'ACTIVE' }] },
      { id:'c-hz-2', name:'Unidades Prontas - Entrega Imediata', status:'ACTIVE', objective:'CONVERSIONS', _budgetShare:0.35,
        adSets:[{ id:'as-hz-2-1', name:'Remarketing - Visitas LP', status:'ACTIVE' }] },
      { id:'c-hz-3', name:'Institucional - 20 Anos Horizonte',   status:'ACTIVE', objective:'BRAND_AWARENESS', _budgetShare:0.20,
        adSets:[{ id:'as-hz-3-1', name:'Homens 30-60 - Grande SP', status:'ACTIVE' }] },
    ],
    { dailyBudget:933, cpm:24, ctr:1.8, convRate:4.5, isB2C:false }
  ),

  buildClient(
    { id:'procurso', name:'Escola Técnica ProCurso', niche:'Educação',
      boardStatus:'active', platform:'multi', status:'active',
      initials:'PC', color:'#6366f1',
      budget:{ monthly:11000, daily:367 },
      adAccount:{ id:'act_445566778', name:'ProCurso Education Ads', currency:'BRL', status:'ACTIVE' },
      contact:{ name:'Patrícia Menezes', email:'patricia@procurso.com.br', phone:'(31) 99877-0004' },
      startDate:'2024-02-01',
      notes:'Cursos técnicos EAD. Melhor período de captação: fev-mar e ago-set.' },
    [
      { id:'c-pc-1', name:'Captação - Cursos Técnicos EAD', status:'ACTIVE', objective:'LEAD_GENERATION', _budgetShare:0.50,
        adSets:[{ id:'as-pc-1-1', name:'18-35 anos - Interior MG/SP', status:'ACTIVE' }] },
      { id:'c-pc-2', name:'MBA e Pós - Executivos',         status:'ACTIVE', objective:'CONVERSIONS',     _budgetShare:0.32,
        adSets:[{ id:'as-pc-2-1', name:'Profissionais 28-45 anos', status:'ACTIVE' }] },
      { id:'c-pc-3', name:'Bolsa 50% - Campanha Inverno',   status:'PAUSED', objective:'LEAD_GENERATION', _budgetShare:0.18,
        adSets:[{ id:'as-pc-3-1', name:'Lookalike Alunos Ativos', status:'PAUSED' }] },
    ],
    { dailyBudget:367, cpm:16, ctr:2.2, convRate:7, isB2C:true }
  ),

  buildClient(
    { id:'techstore', name:'TechStore E-commerce', niche:'E-commerce',
      boardStatus:'optimizing', platform:'multi', status:'active',
      initials:'TS', color:'#3b82f6',
      budget:{ monthly:32000, daily:1067 },
      adAccount:{ id:'act_556677889', name:'TechStore Facebook Ads', currency:'BRL', status:'ACTIVE' },
      contact:{ name:'Felipe Rocha', email:'felipe@techstore.com.br', phone:'(11) 97654-0005' },
      startDate:'2023-06-20',
      notes:'E-commerce de gadgets. Pico em Black Friday e Natal.' },
    [
      { id:'c-ts-1', name:'Catálogo Dinâmico - Remarketing',    status:'ACTIVE', objective:'CONVERSIONS',     _budgetShare:0.40,
        adSets:[{ id:'as-ts-1-1', name:'Visitantes 7 dias', status:'ACTIVE' },
                { id:'as-ts-1-2', name:'Carrinhos Abandonados', status:'ACTIVE' }] },
      { id:'c-ts-2', name:'Prospecção - Smartphones',            status:'ACTIVE', objective:'CONVERSIONS',     _budgetShare:0.35,
        adSets:[{ id:'as-ts-2-1', name:'Interesse Tecnologia 20-45', status:'ACTIVE' }] },
      { id:'c-ts-3', name:'Brand - TechStore Melhores Preços',   status:'ACTIVE', objective:'BRAND_AWARENESS', _budgetShare:0.25,
        adSets:[{ id:'as-ts-3-1', name:'Público Amplo 18-55', status:'ACTIVE' }] },
    ],
    { dailyBudget:1067, cpm:12, ctr:3.8, convRate:5.5, isB2C:true }
  ),

  buildClient(
    { id:'silva-adv', name:'Silva & Associados Adv.', niche:'Jurídico',
      boardStatus:'paused', platform:'facebook', status:'paused',
      initials:'SA', color:'#8b5cf6',
      budget:{ monthly:5500, daily:183 },
      adAccount:{ id:'act_667788990', name:'Silva Advocacia Ads', currency:'BRL', status:'ACTIVE' },
      contact:{ name:'Dr. André Silva', email:'andre@silvaadv.com.br', phone:'(11) 3232-0006' },
      startDate:'2024-04-01',
      notes:'Foco em Direito Trabalhista e Previdenciário. Pausado aguardando revisão criativa.' },
    [
      { id:'c-sa-1', name:'Leads - Direito Trabalhista',  status:'PAUSED', objective:'LEAD_GENERATION', _budgetShare:0.50,
        adSets:[{ id:'as-sa-1-1', name:'CLT Demitidos - SP/RJ', status:'PAUSED' }] },
      { id:'c-sa-2', name:'Leads - INSS & Aposentadoria', status:'PAUSED', objective:'LEAD_GENERATION', _budgetShare:0.30,
        adSets:[{ id:'as-sa-2-1', name:'50+ anos - Interior SP', status:'PAUSED' }] },
      { id:'c-sa-3', name:'Branding - Escritório Premium', status:'PAUSED', objective:'BRAND_AWARENESS', _budgetShare:0.20,
        adSets:[{ id:'as-sa-3-1', name:'Empresários e Diretores', status:'PAUSED' }] },
    ],
    { dailyBudget:183, cpm:11, ctr:1.6, convRate:5, isB2C:false }
  ),

  buildClient(
    { id:'verde-terra', name:'Verde & Terra Imóveis', niche:'Imóveis',
      boardStatus:'prospecting', platform:'google', status:'active',
      initials:'VT', color:'#14b8a6',
      budget:{ monthly:7000, daily:233 },
      adAccount:{ id:'', name:'', currency:'BRL', status:'ACTIVE' },
      contact:{ name:'Cláudia Verde', email:'claudia@verdeterra.com.br', phone:'(51) 99123-0007' },
      startDate:'2025-03-01',
      notes:'Prospecção em andamento. Proposta enviada, aguardando aprovação do contrato.' },
    [
      { id:'c-vt-1', name:'Captação - Terrenos RS', status:'ACTIVE', objective:'LEAD_GENERATION', _budgetShare:0.60,
        adSets:[{ id:'as-vt-1-1', name:'Investidores - RS', status:'ACTIVE' }] },
      { id:'c-vt-2', name:'Casas de Campo - Interior', status:'ACTIVE', objective:'CONVERSIONS', _budgetShare:0.40,
        adSets:[{ id:'as-vt-2-1', name:'Público Amplo 35-65', status:'ACTIVE' }] },
    ],
    { dailyBudget:233, cpm:18, ctr:2.1, convRate:4, isB2C:false }
  ),
];

// Load tokens from localStorage
(function () {
  const fbToken = localStorage.getItem('tf_fb_token');
  if (fbToken) CONFIG.API.FACEBOOK.TOKEN = fbToken;
  const mode = localStorage.getItem('tf_api_mode');
  if (mode) CONFIG.API.MODE = mode;
  const aiToken = localStorage.getItem('tf_ai_token');
  if (aiToken) { CONFIG.API.AI_ASSISTANT.TOKEN = aiToken; CONFIG.API.AI_ASSISTANT.ENABLED = true; }
})();
