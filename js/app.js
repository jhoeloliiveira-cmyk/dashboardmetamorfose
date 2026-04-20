// =============================================================================
// TrafficFlow Dashboard — Main Application
// =============================================================================

// ── State ─────────────────────────────────────────────────────────────────────
const STATE = {
  view: 'overview',
  clientId: null,
  period: 'last_30d',
  search: '',
  filters: { status: 'all', niche: 'all', campaign: 'all' },
  clients: [],
  chatHistory: [],
  charts: {},
  activeChartTab: 'spend',
};

// ── Utilities ─────────────────────────────────────────────────────────────────
const fmt = {
  currency: v => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL', maximumFractionDigits:0 }).format(v),
  currencyFull: v => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL', minimumFractionDigits:2 }).format(v),
  number:   v => new Intl.NumberFormat('pt-BR').format(Math.round(v)),
  percent:  v => `${parseFloat(v).toFixed(2)}%`,
  date:     v => new Date(v + 'T00:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'short' }),
};

function getClientData(clientId, periodKey) {
  const c = STATE.clients.find(x => x.id === clientId);
  if (!c) return null;
  if (periodKey === 'last_7d')  return { daily: c.daily7,  totals: c.totals7  };
  if (periodKey === 'last_14d') return { daily: c.daily14, totals: c.totals14 };
  return { daily: c.daily30, totals: c.totals30 };
}

function getPeriodData(clientId) {
  return getClientData(clientId, STATE.period) || getClientData(clientId, 'last_30d');
}

function getTrend(curr, prev) {
  if (!prev || prev === 0) return { pct: 0, dir: 'neutral' };
  const pct = ((curr - prev) / prev) * 100;
  return { pct: Math.abs(pct).toFixed(1), dir: pct >= 0 ? 'up' : 'down' };
}

function allTotals() {
  return STATE.clients.reduce((a, c) => {
    const d = getPeriodData(c.id);
    if (!d) return a;
    a.spend       += d.totals.spend;
    a.leads       += d.totals.leads;
    a.impressions += d.totals.impressions;
    a.link_clicks += d.totals.link_clicks;
    a.conversations += d.totals.conversations;
    return a;
  }, { spend:0, leads:0, impressions:0, link_clicks:0, conversations:0 });
}

function destroyChart(key) {
  if (STATE.charts[key]) { STATE.charts[key].destroy(); delete STATE.charts[key]; }
}

function setLoading(id, on) {
  const el = document.getElementById(id);
  if (!el) return;
  if (on) el.classList.add('loading'); else el.classList.remove('loading');
}

// ── Router ────────────────────────────────────────────────────────────────────
function navigate(view, clientId) {
  STATE.view = view;
  if (clientId) STATE.clientId = clientId;

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });

  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));

  const sectionMap = {
    overview:      'section-overview',
    clients:       'section-clients',
    'client-detail': 'section-client-detail',
    rankings:      'section-rankings',
    assistant:     'section-assistant',
    settings:      'section-settings',
  };

  const target = sectionMap[view];
  if (target) {
    const el = document.getElementById(target);
    if (el) el.classList.remove('hidden');
  }

  // Destroy stale charts before re-rendering
  Object.keys(STATE.charts).forEach(destroyChart);

  const renders = {
    overview:       renderOverview,
    clients:        renderClients,
    'client-detail': renderClientDetail,
    rankings:       renderRankings,
    assistant:      renderAssistant,
    settings:       renderSettings,
  };
  if (renders[view]) renders[view]();

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
  window.scrollTo(0, 0);
}

// ── Overview ──────────────────────────────────────────────────────────────────
function renderOverview() {
  const totals = allTotals();
  const avgCpl = totals.leads > 0 ? totals.spend / totals.leads : 0;
  const avgCtr = totals.impressions > 0 ? (totals.link_clicks / totals.impressions) * 100 : 0;

  const activeClients = STATE.clients.filter(c => c.status === 'active').length;

  // KPI grid
  document.getElementById('ov-kpi-grid').innerHTML = `
    ${kpiCard('Investimento Total', fmt.currency(totals.spend), 'dollar-sign', 'blue', null)}
    ${kpiCard('Total de Leads', fmt.number(totals.leads), 'users', 'gold', null)}
    ${kpiCard('CPL Médio', fmt.currencyFull(avgCpl), 'target', 'green', null)}
    ${kpiCard('Impressões', fmt.number(totals.impressions), 'eye', 'purple', null)}
    ${kpiCard('Cliques no Link', fmt.number(totals.link_clicks), 'mouse-pointer', 'blue', null)}
    ${kpiCard('CTR Médio', fmt.percent(avgCtr), 'trending-up', 'gold', null)}
    ${kpiCard('Conversas', fmt.number(totals.conversations), 'message-circle', 'green', null)}
    ${kpiCard('Clientes Ativos', activeClients, 'briefcase', 'purple', null)}
  `;

  // Client summary cards
  document.getElementById('ov-client-cards').innerHTML = STATE.clients.map(c => {
    const d = getPeriodData(c.id);
    if (!d) return '';
    return `
      <div class="client-summary-card" onclick="navigate('client-detail','${c.id}')">
        <div class="csc-header">
          <div class="avatar" style="background:${c.color}20;color:${c.color}">${c.initials}</div>
          <div class="csc-info">
            <div class="csc-name">${c.name}</div>
            <div class="csc-niche">${c.niche}</div>
          </div>
          <span class="badge badge-${c.status}">${c.status === 'active' ? 'Ativo' : 'Pausado'}</span>
        </div>
        <div class="csc-metrics">
          <div class="csc-metric"><span class="csc-label">Investimento</span><span class="csc-val">${fmt.currency(d.totals.spend)}</span></div>
          <div class="csc-metric"><span class="csc-label">Leads</span><span class="csc-val text-gold">${fmt.number(d.totals.leads)}</span></div>
          <div class="csc-metric"><span class="csc-label">CPL</span><span class="csc-val">${fmt.currencyFull(d.totals.cpl)}</span></div>
          <div class="csc-metric"><span class="csc-label">CTR</span><span class="csc-val">${fmt.percent(d.totals.ctr)}</span></div>
        </div>
      </div>
    `;
  }).join('');

  // Overview charts
  renderOverviewCharts();
}

function renderOverviewCharts() {
  // Spend over time — stacked by client
  const labels = STATE.clients[0]?.daily30.map(d => fmt.date(d.date)) || [];
  const datasets = STATE.clients.map(c => ({
    label: c.name,
    data: c.daily30.map(d => d.spend),
    borderColor: c.color,
    backgroundColor: c.color + '18',
    tension: 0.4,
    fill: false,
    pointRadius: 0,
    borderWidth: 2,
  }));

  destroyChart('ov-line');
  const ctx1 = document.getElementById('chart-ov-line');
  if (ctx1) {
    STATE.charts['ov-line'] = new Chart(ctx1, {
      type: 'line',
      data: { labels, datasets },
      options: darkChartOptions({ title:'Investimento por Cliente (30 dias)', yPrefix:'R$' }),
    });
  }

  // Bar — leads per client
  const clientsSorted = [...STATE.clients].sort((a,b) => b.totals30.leads - a.totals30.leads);
  destroyChart('ov-bar');
  const ctx2 = document.getElementById('chart-ov-bar');
  if (ctx2) {
    STATE.charts['ov-bar'] = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: clientsSorted.map(c => c.name),
        datasets: [{
          label: 'Leads (30 dias)',
          data: clientsSorted.map(c => c.totals30.leads),
          backgroundColor: clientsSorted.map(c => c.color + 'cc'),
          borderColor: clientsSorted.map(c => c.color),
          borderWidth: 1,
          borderRadius: 6,
        }],
      },
      options: darkChartOptions({ title:'Ranking de Leads por Cliente' }),
    });
  }
}

function kpiCard(label, value, icon, accent, trend) {
  const accentClass = `accent-${accent}`;
  const trendHtml = trend
    ? `<div class="kpi-trend ${trend.dir}"><i data-lucide="${trend.dir === 'up' ? 'trending-up' : 'trending-down'}"></i>${trend.pct}% vs anterior</div>`
    : '';
  return `
    <div class="kpi-card">
      <div class="kpi-icon ${accentClass}"><i data-lucide="${icon}"></i></div>
      <div class="kpi-body">
        <div class="kpi-label">${label}</div>
        <div class="kpi-value">${value}</div>
        ${trendHtml}
      </div>
    </div>
  `;
}

// ── Client List ───────────────────────────────────────────────────────────────
function renderClients() {
  const q = STATE.search.toLowerCase();
  const { status, niche } = STATE.filters;

  const filtered = STATE.clients.filter(c => {
    if (q && !c.name.toLowerCase().includes(q) && !c.niche.toLowerCase().includes(q)) return false;
    if (status !== 'all' && c.status !== status) return false;
    if (niche  !== 'all' && c.niche  !== niche)  return false;
    return true;
  });

  document.getElementById('clients-count').textContent = `${filtered.length} cliente${filtered.length !== 1 ? 's' : ''}`;

  const grid = document.getElementById('clients-grid');
  if (!filtered.length) {
    grid.innerHTML = '<div class="empty-state"><i data-lucide="search-x"></i><p>Nenhum cliente encontrado</p></div>';
    lucide.createIcons(); return;
  }

  grid.innerHTML = filtered.map(c => {
    const d = getPeriodData(c.id);
    const t = d?.totals;
    const activeCamps = c.campaigns.filter(x => x.status === 'ACTIVE').length;
    return `
      <div class="client-card" onclick="navigate('client-detail','${c.id}')">
        <div class="cc-header">
          <div class="avatar lg" style="background:${c.color}20;color:${c.color}">${c.initials}</div>
          <div>
            <div class="cc-name">${c.name}</div>
            <div class="cc-niche">${c.niche}</div>
            <div class="cc-account text-muted"><i data-lucide="hash" style="width:11px;height:11px"></i> ${c.adAccount.id}</div>
          </div>
          <span class="badge badge-${c.status}">${c.status === 'active' ? 'Ativo' : 'Pausado'}</span>
        </div>
        <div class="cc-divider"></div>
        <div class="cc-kpis">
          <div class="cc-kpi"><div class="cc-kpi-label">Investimento</div><div class="cc-kpi-val">${fmt.currency(t?.spend || 0)}</div></div>
          <div class="cc-kpi"><div class="cc-kpi-label">Leads</div><div class="cc-kpi-val text-gold">${fmt.number(t?.leads || 0)}</div></div>
          <div class="cc-kpi"><div class="cc-kpi-label">CPL</div><div class="cc-kpi-val">${fmt.currencyFull(t?.cpl || 0)}</div></div>
          <div class="cc-kpi"><div class="cc-kpi-label">CTR</div><div class="cc-kpi-val">${fmt.percent(t?.ctr || 0)}</div></div>
          <div class="cc-kpi"><div class="cc-kpi-label">CPC</div><div class="cc-kpi-val">${fmt.currencyFull(t?.cpc || 0)}</div></div>
          <div class="cc-kpi"><div class="cc-kpi-label">CPM</div><div class="cc-kpi-val">${fmt.currencyFull(t?.cpm || 0)}</div></div>
        </div>
        <div class="cc-footer">
          <span><i data-lucide="megaphone"></i> ${activeCamps} campanha${activeCamps !== 1 ? 's' : ''} ativa${activeCamps !== 1 ? 's' : ''}</span>
          <span class="cc-budget">Orçamento: ${fmt.currency(c.budget.monthly)}/mês</span>
        </div>
      </div>
    `;
  }).join('');
  lucide.createIcons();
}

// ── Client Detail ─────────────────────────────────────────────────────────────
function renderClientDetail() {
  const c = STATE.clients.find(x => x.id === STATE.clientId);
  if (!c) { navigate('clients'); return; }

  const d = getPeriodData(c.id);
  const t = d.totals;
  const prev = getClientData(c.id, 'last_30d'); // rough "previous" comparison

  // Header
  document.getElementById('cd-header').innerHTML = `
    <button class="btn-back" onclick="navigate('clients')"><i data-lucide="arrow-left"></i> Clientes</button>
    <div class="cd-title-row">
      <div class="avatar xl" style="background:${c.color}20;color:${c.color}">${c.initials}</div>
      <div>
        <h2>${c.name}</h2>
        <div class="cd-meta">
          <span class="badge badge-${c.status}">${c.status === 'active' ? 'Ativo' : 'Pausado'}</span>
          <span class="text-muted">${c.niche}</span>
          <span class="text-muted">•</span>
          <span class="text-muted">${c.adAccount.name} <span class="text-dim">(${c.adAccount.id})</span></span>
        </div>
      </div>
      <div class="cd-actions">
        <button class="btn-secondary" onclick="exportClientCSV('${c.id}')"><i data-lucide="download"></i> Exportar CSV</button>
      </div>
    </div>
  `;

  // KPI grid
  const trendSpend = getTrend(t.spend, prev.totals.spend * 0.93);
  const trendLeads = getTrend(t.leads, prev.totals.leads * 0.89);

  document.getElementById('cd-kpi-grid').innerHTML = `
    ${kpiCard('Investimento', fmt.currency(t.spend),       'dollar-sign',   'blue',   trendSpend)}
    ${kpiCard('Leads',        fmt.number(t.leads),         'users',         'gold',   trendLeads)}
    ${kpiCard('CPL',          fmt.currencyFull(t.cpl),     'target',        'green',  null)}
    ${kpiCard('Impressões',   fmt.number(t.impressions),   'eye',           'purple', null)}
    ${kpiCard('Alcance',      fmt.number(t.reach),         'radio',         'blue',   null)}
    ${kpiCard('Cliques',      fmt.number(t.link_clicks),   'mouse-pointer', 'gold',   null)}
    ${kpiCard('CTR',          fmt.percent(t.ctr),          'trending-up',   'green',  null)}
    ${kpiCard('CPC',          fmt.currencyFull(t.cpc),     'credit-card',   'purple', null)}
    ${kpiCard('CPM',          fmt.currencyFull(t.cpm),     'bar-chart-2',   'blue',   null)}
    ${kpiCard('Conversas',    fmt.number(t.conversations), 'message-circle','gold',   null)}
    ${kpiCard('Custo/Conv.',  fmt.currencyFull(t.cost_per_conversation), 'phone', 'green', null)}
    ${kpiCard('Frequência',   t.freq?.toFixed(2) || '—',  'repeat',        'purple', null)}
  `;

  // Chart tabs
  document.getElementById('cd-chart-area').innerHTML = `
    <div class="chart-tabs">
      ${['spend','leads','ctr','cpl'].map(tab => `
        <button class="chart-tab ${STATE.activeChartTab === tab ? 'active' : ''}" onclick="switchChartTab('${tab}')">
          ${{ spend:'Investimento', leads:'Leads', ctr:'CTR', cpl:'CPL' }[tab]}
        </button>
      `).join('')}
    </div>
    <div class="chart-container"><canvas id="chart-cd-main"></canvas></div>
  `;

  renderClientMainChart(c, d);

  // Campaigns table
  const campRows = c.campaigns.map(camp => {
    const ct = camp.totals;
    return `
      <tr>
        <td><div class="td-camp-name">${camp.name}</div><div class="td-camp-id text-muted">${camp.id}</div></td>
        <td><span class="badge badge-${camp.status === 'ACTIVE' ? 'active' : 'paused'}">${camp.status === 'ACTIVE' ? 'Ativo' : 'Pausado'}</span></td>
        <td>${fmt.currency(ct.spend)}</td>
        <td>${fmt.number(ct.impressions)}</td>
        <td>${fmt.number(ct.link_clicks)}</td>
        <td>${fmt.percent(ct.ctr)}</td>
        <td>${fmt.currencyFull(ct.cpc)}</td>
        <td>${fmt.currencyFull(ct.cpm)}</td>
        <td class="text-gold fw-bold">${fmt.number(ct.leads)}</td>
        <td>${fmt.currencyFull(ct.cpl)}</td>
        <td>${fmt.number(ct.conversations)}</td>
      </tr>
    `;
  }).join('');

  document.getElementById('cd-campaigns-table').innerHTML = `
    <div class="table-header-row">
      <h3><i data-lucide="megaphone"></i> Campanhas</h3>
    </div>
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>Campanha</th><th>Status</th><th>Investimento</th><th>Impressões</th>
            <th>Cliques</th><th>CTR</th><th>CPC</th><th>CPM</th>
            <th>Leads</th><th>CPL</th><th>Conversas</th>
          </tr>
        </thead>
        <tbody>${campRows}</tbody>
      </table>
    </div>
  `;

  // Campaign bar chart
  const campCtx = document.getElementById('chart-cd-campaigns');
  if (campCtx) {
    destroyChart('cd-camps');
    STATE.charts['cd-camps'] = new Chart(campCtx, {
      type: 'bar',
      data: {
        labels: c.campaigns.map(x => x.name),
        datasets: [
          {
            label: 'Leads',
            data: c.campaigns.map(x => x.totals.leads),
            backgroundColor: c.color + 'cc',
            borderColor: c.color,
            borderWidth: 1,
            borderRadius: 6,
            yAxisID: 'y',
          },
          {
            label: 'Investimento (R$)',
            data: c.campaigns.map(x => x.totals.spend),
            backgroundColor: '#3b82f620',
            borderColor: '#3b82f6',
            borderWidth: 1,
            borderRadius: 6,
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        ...darkChartOptions({ title:'Performance por Campanha' }),
        scales: {
          x: { ticks:{ color:'#94a3b8' }, grid:{ color:'rgba(255,255,255,0.04)' } },
          y:  { position:'left',  ticks:{ color:'#94a3b8' }, grid:{ color:'rgba(255,255,255,0.04)' }, title:{ display:true, text:'Leads', color:'#94a3b8' } },
          y1: { position:'right', ticks:{ color:'#3b82f6', callback: v => 'R$'+fmt.number(v) }, grid:{ drawOnChartArea:false }, title:{ display:true, text:'Investimento', color:'#3b82f6' } },
        },
      },
    });
  }

  lucide.createIcons();
}

function switchChartTab(tab) {
  STATE.activeChartTab = tab;
  const c = STATE.clients.find(x => x.id === STATE.clientId);
  const d = getPeriodData(c.id);
  // Update tab buttons
  document.querySelectorAll('.chart-tab').forEach(b => b.classList.toggle('active', b.textContent.trim() === {spend:'Investimento',leads:'Leads',ctr:'CTR',cpl:'CPL'}[tab]));
  destroyChart('cd-main');
  renderClientMainChart(c, d);
}

function renderClientMainChart(c, d) {
  const tab = STATE.activeChartTab;
  const labels = d.daily.map(x => fmt.date(x.date));
  const dataMap = { spend:'spend', leads:'leads', ctr:'ctr', cpl:'cpl' };
  const key = dataMap[tab];
  const values = d.daily.map(x => x[key]);

  const isPrice = tab === 'spend' || tab === 'cpl';
  const isCtr   = tab === 'ctr';
  const colors  = { spend:'#3b82f6', leads:'#f59e0b', ctr:'#10b981', cpl:'#8b5cf6' };
  const color   = colors[tab];

  destroyChart('cd-main');
  const ctx = document.getElementById('chart-cd-main');
  if (!ctx) return;

  STATE.charts['cd-main'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: { spend:'Investimento (R$)', leads:'Leads', ctr:'CTR (%)', cpl:'CPL (R$)' }[tab],
        data: values,
        borderColor: color,
        backgroundColor: color + '15',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: color,
        borderWidth: 2,
      }],
    },
    options: {
      ...darkChartOptions({ yPrefix: isPrice ? 'R$' : '', ySuffix: isCtr ? '%' : '' }),
    },
  });
}

// ── Rankings ──────────────────────────────────────────────────────────────────
function renderRankings() {
  const clients = STATE.clients.map(c => ({ ...c, t: getPeriodData(c.id)?.totals }));

  const medals = ['🥇','🥈','🥉'];
  const rank = (sorted, valueKey, valueFmt, lowerIsBetter = false) =>
    sorted.map((c, i) => `
      <tr class="${i < 3 ? 'top-row' : ''}">
        <td class="rank-pos">${medals[i] || `#${i+1}`}</td>
        <td>
          <div class="rank-client">
            <div class="avatar sm" style="background:${c.color}20;color:${c.color}">${c.initials}</div>
            <div>
              <div class="rank-name">${c.name}</div>
              <div class="rank-niche text-muted">${c.niche}</div>
            </div>
          </div>
        </td>
        <td class="rank-val ${i === 0 ? 'text-gold fw-bold' : ''}">${valueFmt(c.t?.[valueKey] || 0)}</td>
        <td><div class="rank-bar-wrap"><div class="rank-bar" style="width:${Math.round((c.t?.[valueKey] || 0) / sorted[0].t?.[valueKey] * 100)}%;background:${c.color}"></div></div></td>
      </tr>
    `).join('');

  const byLeads = [...clients].sort((a,b) => (b.t?.leads||0) - (a.t?.leads||0));
  const byCpl   = [...clients].filter(c => (c.t?.cpl||0) > 0).sort((a,b) => (a.t?.cpl||0) - (b.t?.cpl||0));
  const bySpend = [...clients].sort((a,b) => (b.t?.spend||0) - (a.t?.spend||0));
  const byCtr   = [...clients].sort((a,b) => (b.t?.ctr||0) - (a.t?.ctr||0));

  document.getElementById('rankings-content').innerHTML = `
    <div class="rankings-grid">
      ${rankingTable('Mais Leads', 'users', byLeads,  'leads',  fmt.number,        false)}
      ${rankingTable('Menor CPL',  'target', byCpl,   'cpl',    fmt.currencyFull,  true)}
      ${rankingTable('Maior Investimento','dollar-sign',bySpend,'spend',fmt.currency, false)}
      ${rankingTable('Melhor CTR', 'trending-up',byCtr,'ctr',   fmt.percent,       false)}
    </div>
  `;
  lucide.createIcons();
}

function rankingTable(title, icon, sorted, key, valueFmt, lowerIsBetter) {
  const medals = ['🥇','🥈','🥉'];
  const max = sorted[0]?.t?.[key] || 1;
  const rows = sorted.map((c, i) => `
    <tr class="${i < 3 ? 'top-row' : ''}">
      <td class="rank-pos">${medals[i] || `#${i+1}`}</td>
      <td>
        <div class="rank-client">
          <div class="avatar sm" style="background:${c.color}20;color:${c.color}">${c.initials}</div>
          <span class="rank-name">${c.name}</span>
        </div>
      </td>
      <td class="rank-val ${i === 0 ? (lowerIsBetter ? 'text-green' : 'text-gold') : ''} fw-bold">${valueFmt(c.t?.[key] || 0)}</td>
      <td><div class="rank-bar-wrap"><div class="rank-bar" style="width:${Math.round((c.t?.[key]||0)/max*100)}%;background:${c.color}80"></div></div></td>
    </tr>
  `).join('');

  return `
    <div class="ranking-card">
      <div class="ranking-card-header"><i data-lucide="${icon}"></i>${title}</div>
      <table class="ranking-table"><tbody>${rows}</tbody></table>
    </div>
  `;
}

// ── Assistant ──────────────────────────────────────────────────────────────────
function renderAssistant() {
  const el = document.getElementById('section-assistant');
  el.innerHTML = `
    <div class="assistant-wrap">
      <div class="assistant-header">
        <div class="assistant-icon"><i data-lucide="bot"></i></div>
        <div>
          <h2>Assistente TrafficFlow</h2>
          <p class="text-muted">Faça perguntas sobre os dados dos seus clientes</p>
        </div>
        <div class="ai-badge ${CONFIG.API.AI_ASSISTANT.ENABLED ? 'ai-on' : 'ai-mock'}">
          ${CONFIG.API.AI_ASSISTANT.ENABLED ? '✦ IA Ativada' : '⚙ Modo Análise'}
        </div>
      </div>

      <div class="suggestions-row">
        ${[
          'Qual cliente tem mais leads?',
          'Qual o CPL médio da carteira?',
          'Quem tem o melhor CTR?',
          'Quanto foi investido no total?',
          'Qual campanha tem mais conversas?',
          'Qual cliente tem maior orçamento?',
        ].map(q => `<button class="suggestion-chip" onclick="submitAssistant('${q}')">${q}</button>`).join('')}
      </div>

      <div class="chat-window" id="chat-window">
        ${STATE.chatHistory.length === 0
          ? `<div class="chat-empty"><i data-lucide="message-circle"></i><p>Olá! Pergunte sobre seus clientes, métricas, campanhas ou rankings.</p></div>`
          : STATE.chatHistory.map(renderChatMessage).join('')
        }
      </div>

      <div class="chat-input-row">
        <input id="chat-input" type="text" placeholder="Ex: Qual cliente tem o menor CPL?" onkeydown="if(event.key==='Enter') submitAssistant()" />
        <button class="btn-send" onclick="submitAssistant()"><i data-lucide="send"></i></button>
      </div>
    </div>
  `;
  lucide.createIcons();
  scrollChat();
}

function renderChatMessage(msg) {
  return `
    <div class="chat-msg chat-msg-${msg.role}">
      <div class="chat-bubble">${msg.content}</div>
      <div class="chat-time">${msg.time}</div>
    </div>
  `;
}

function scrollChat() {
  const w = document.getElementById('chat-window');
  if (w) w.scrollTop = w.scrollHeight;
}

async function submitAssistant(preText) {
  const input = document.getElementById('chat-input');
  const text  = preText || input?.value?.trim();
  if (!text) return;
  if (input) input.value = '';

  const time = new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
  STATE.chatHistory.push({ role:'user', content: text, time });

  // Show loading
  STATE.chatHistory.push({ role:'assistant', content: '<span class="typing-dots"><span></span><span></span><span></span></span>', time, loading: true });
  renderAssistant();
  scrollChat();

  // Simulate async (ready for real AI call)
  await new Promise(r => setTimeout(r, 600));

  let answer;
  if (CONFIG.API.AI_ASSISTANT.ENABLED && CONFIG.API.AI_ASSISTANT.TOKEN) {
    answer = await callAIAssistant(text);
  } else {
    answer = localAssistantResponse(text);
  }

  // Replace loading msg
  STATE.chatHistory = STATE.chatHistory.filter(m => !m.loading);
  STATE.chatHistory.push({ role:'assistant', content: answer, time });
  renderAssistant();
  scrollChat();
}

function localAssistantResponse(q) {
  const ql = q.toLowerCase();
  const clients = STATE.clients;
  const ranked = (key, asc = false) =>
    [...clients].filter(c => getPeriodData(c.id)?.totals?.[key] > 0)
                .sort((a,b) => asc
                  ? (getPeriodData(a.id)?.totals?.[key]||0) - (getPeriodData(b.id)?.totals?.[key]||0)
                  : (getPeriodData(b.id)?.totals?.[key]||0) - (getPeriodData(a.id)?.totals?.[key]||0));

  const totals = allTotals();

  if (/leads|lead/.test(ql) && /mais|maior|melhor|top|ranking/.test(ql)) {
    const top = ranked('leads')[0];
    const d = getPeriodData(top.id)?.totals;
    return `🥇 <strong>${top.name}</strong> lidera em leads com <strong>${fmt.number(d.leads)} leads</strong> no período, a um CPL de ${fmt.currencyFull(d.cpl)}.`;
  }

  if (/cpl/.test(ql) && /menor|melhor|mais barato/.test(ql)) {
    const top = ranked('cpl', true)[0];
    const d = getPeriodData(top.id)?.totals;
    return `💚 Melhor CPL: <strong>${top.name}</strong> com <strong>${fmt.currencyFull(d.cpl)}</strong> por lead. Total de ${fmt.number(d.leads)} leads no período.`;
  }

  if (/cpl|custo por lead/.test(ql) && /médio|media|geral|carteira/.test(ql)) {
    const avgCpl = totals.leads > 0 ? totals.spend / totals.leads : 0;
    return `📊 O CPL médio da carteira é <strong>${fmt.currencyFull(avgCpl)}</strong>, baseado em ${fmt.number(totals.leads)} leads gerados e ${fmt.currency(totals.spend)} investidos.`;
  }

  if (/ctr/.test(ql) && /melhor|maior|mais alto/.test(ql)) {
    const top = ranked('ctr')[0];
    const d = getPeriodData(top.id)?.totals;
    return `🎯 Melhor CTR: <strong>${top.name}</strong> com <strong>${fmt.percent(d.ctr)}</strong>. Média de ${fmt.number(d.link_clicks)} cliques em ${fmt.number(d.impressions)} impressões.`;
  }

  if (/investimento|invest|gasto|spend|total investid/.test(ql)) {
    return `💰 Investimento total da carteira no período: <strong>${fmt.currency(totals.spend)}</strong>, distribuídos em ${clients.length} clientes. Maior investidor: <strong>${ranked('spend')[0].name}</strong>.`;
  }

  if (/orçamento|maior budget|mais investe/.test(ql)) {
    const top = [...clients].sort((a,b) => b.budget.monthly - a.budget.monthly)[0];
    return `💼 O cliente com maior orçamento mensal é <strong>${top.name}</strong> com <strong>${fmt.currency(top.budget.monthly)}/mês</strong>.`;
  }

  if (/conversa|conversation/.test(ql)) {
    const top = ranked('conversations')[0];
    const d = getPeriodData(top.id)?.totals;
    return `💬 Mais conversas iniciadas: <strong>${top.name}</strong> com <strong>${fmt.number(d.conversations)} conversas</strong> e custo por conversa de ${fmt.currencyFull(d.cost_per_conversation)}.`;
  }

  if (/ativo|ativos|quantos clientes/.test(ql)) {
    const active = clients.filter(c => c.status === 'active').length;
    const paused = clients.filter(c => c.status === 'paused').length;
    return `📋 Você tem <strong>${clients.length} clientes</strong> cadastrados — <strong>${active} ativos</strong> e <strong>${paused} pausados</strong>.`;
  }

  if (/impressão|impressoes|alcance|reach/.test(ql)) {
    return `👁️ Total de impressões: <strong>${fmt.number(totals.impressions)}</strong>. Total de cliques: <strong>${fmt.number(totals.link_clicks)}</strong>.`;
  }

  if (/quem tem|qual cliente/.test(ql) && /pior|ruim|baixo ctr/.test(ql)) {
    const worst = ranked('ctr').slice(-1)[0];
    const d = getPeriodData(worst.id)?.totals;
    return `📉 CTR mais baixo: <strong>${worst.name}</strong> com <strong>${fmt.percent(d.ctr)}</strong>. Pode ser uma oportunidade de otimizar os criativos.`;
  }

  if (/resumo|geral|overview|panorama/.test(ql)) {
    const avgCpl = totals.leads > 0 ? totals.spend / totals.leads : 0;
    return `
      📊 <strong>Resumo da Carteira</strong><br><br>
      • Investimento total: <strong>${fmt.currency(totals.spend)}</strong><br>
      • Leads gerados: <strong>${fmt.number(totals.leads)}</strong><br>
      • CPL médio: <strong>${fmt.currencyFull(avgCpl)}</strong><br>
      • Impressões: <strong>${fmt.number(totals.impressions)}</strong><br>
      • Clientes ativos: <strong>${clients.filter(c=>c.status==='active').length}/${clients.length}</strong>
    `;
  }

  // Fallback
  return `🤖 Ainda não sei responder isso automaticamente, mas posso ajudar com perguntas sobre leads, CPL, CTR, investimento, conversas ou resumos da carteira.<br><br>
    <em>Dica: Quando a integração com IA estiver ativa, responderei qualquer pergunta com base nos dados em tempo real.</em>`;
}

// Placeholder para chamada real de IA (Anthropic Claude, OpenAI, etc.)
async function callAIAssistant(question) {
  try {
    const context = STATE.clients.map(c => {
      const t = getPeriodData(c.id)?.totals;
      return `${c.name} (${c.niche}): spend=${fmt.currency(t?.spend)}, leads=${t?.leads}, cpl=${fmt.currencyFull(t?.cpl)}, ctr=${fmt.percent(t?.ctr)}`;
    }).join('\n');

    const res = await fetch(CONFIG.API.AI_ASSISTANT.BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CONFIG.API.AI_ASSISTANT.TOKEN,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CONFIG.API.AI_ASSISTANT.MODEL,
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: `Você é um analista de tráfego pago. Dados dos clientes:\n${context}\n\nPergunta: ${question}\n\nResponda de forma concisa em português, com dados específicos.`,
        }],
      }),
    });
    const json = await res.json();
    return json.content?.[0]?.text || 'Não foi possível obter resposta.';
  } catch (e) {
    return `Erro ao chamar assistente IA: ${e.message}. Usando análise local...`;
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────
function renderSettings() {
  const el = document.getElementById('section-settings');
  const fbToken = localStorage.getItem('tf_fb_token') || '';
  const aiToken = localStorage.getItem('tf_ai_token') || '';
  const mode = CONFIG.API.MODE;
  const isConnected = !!fbToken;

  el.innerHTML = `
    <div class="settings-wrap">
      <h2 class="settings-title"><i data-lucide="settings"></i> Configurações</h2>

      <div class="settings-grid">

        <!-- Modo de Dados -->
        <div class="settings-card">
          <h3><i data-lucide="zap"></i> Modo de Dados</h3>
          <p class="text-muted">Escolha entre dados mockados ou a API real do Facebook Ads.</p>
          <div class="radio-group">
            <label class="radio-opt ${mode==='mock'?'active':''}">
              <input type="radio" name="mode" value="mock" ${mode==='mock'?'checked':''} onchange="setApiMode('mock')">
              <div><strong>Mockado</strong><span>Dados de exemplo — sem API</span></div>
            </label>
            <label class="radio-opt ${mode==='facebook'?'active':''}">
              <input type="radio" name="mode" value="facebook" ${mode==='facebook'?'checked':''} onchange="setApiMode('facebook')">
              <div><strong>Facebook Ads API</strong><span>Dados reais via Graph API v19.0</span></div>
            </label>
          </div>
        </div>

        <!-- Facebook Token -->
        <div class="settings-card">
          <h3><i data-lucide="key"></i> Facebook Ads Token</h3>
          <p class="text-muted">
            Token de acesso do Facebook Ads Manager. Salvo apenas no seu browser —
            nunca enviado para servidores externos.
          </p>
          <div class="input-group">
            <input id="fb-token-input" type="password"
              placeholder="EAAxxxxxxxxxxxxxxxxxxxxxxxxx..."
              value="${fbToken ? fbToken.slice(0,12) + '••••••••••••••••' : ''}"
              autocomplete="off" />
            <button class="btn-primary" onclick="saveFbToken()">
              <i data-lucide="save"></i> Salvar
            </button>
          </div>
          <div id="fb-token-status" class="status-msg"></div>

          ${isConnected ? `
            <div class="fb-status-row">
              <span class="badge badge-active">● Token configurado</span>
              <button class="btn-secondary" style="padding:4px 10px;font-size:12px" onclick="verifyFbToken()">
                <i data-lucide="check-circle"></i> Verificar
              </button>
            </div>
          ` : `
            <div class="fb-status-row">
              <span class="badge badge-paused">○ Token não configurado</span>
            </div>
          `}
        </div>

        <!-- Sincronizar / Contas -->
        <div class="settings-card" style="grid-column:1/-1">
          <h3><i data-lucide="refresh-cw"></i> Sincronização com Facebook Ads</h3>
          <p class="text-muted">
            Sincroniza os dados de todos os clientes cadastrados com suas respectivas contas de anúncio.
            Requer modo <strong>Facebook Ads API</strong> ativado e token válido.
          </p>
          <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
            <button id="fb-load-btn" class="btn-primary" onclick="activateFacebookMode()">
              <i data-lucide="refresh-cw"></i> Ativar e Sincronizar
            </button>
            <button class="btn-secondary" onclick="verifyFbToken()">
              <i data-lucide="shield-check"></i> Verificar Token
            </button>
          </div>
          <div id="fb-verify-result" class="status-msg" style="margin-bottom:12px"></div>
          <div id="fb-accounts-list"></div>
        </div>

        <!-- Vincular conta a cliente -->
        <div class="settings-card">
          <h3><i data-lucide="link"></i> Vincular Conta a Cliente</h3>
          <p class="text-muted">Associe uma conta de anúncio do Facebook a um cliente cadastrado.</p>
          <div class="form-group" style="margin-bottom:10px">
            <label>Cliente</label>
            <select id="link-client-select" class="filter-select" style="width:100%;height:40px">
              <option value="">Selecione o cliente</option>
              ${STATE.clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin-bottom:10px">
            <label>ID da Conta de Anúncio</label>
            <input id="link-account-input" type="text" placeholder="act_123456789"
              style="width:100%;height:40px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-md);padding:0 12px;font-size:13px;color:var(--text-primary)" />
          </div>
          <button class="btn-primary" onclick="doLinkAccount()">
            <i data-lucide="link-2"></i> Vincular Conta
          </button>
        </div>

        <!-- Assistente IA -->
        <div class="settings-card">
          <h3><i data-lucide="bot"></i> Assistente IA (Opcional)</h3>
          <p class="text-muted">Token Anthropic para respostas inteligentes no assistente interno.</p>
          <div class="input-group">
            <input id="ai-token-input" type="password" placeholder="sk-ant-api03-..." value="${aiToken ? aiToken.slice(0,14)+'••••' : ''}" autocomplete="off" />
            <button class="btn-primary" onclick="saveAiToken()"><i data-lucide="save"></i> Salvar</button>
          </div>
          <div id="ai-token-status" class="status-msg"></div>
          <label class="toggle-row">
            <input type="checkbox" ${CONFIG.API.AI_ASSISTANT.ENABLED?'checked':''} onchange="toggleAI(this.checked)">
            <span>Ativar Assistente IA</span>
          </label>
        </div>

        <!-- Exportação -->
        <div class="settings-card">
          <h3><i data-lucide="database"></i> Exportação de Dados</h3>
          <p class="text-muted">Exporte os dados carregados da carteira.</p>
          <div class="settings-actions">
            <button class="btn-secondary" onclick="exportAllCSV()"><i data-lucide="download"></i> Exportar CSV (todos os clientes)</button>
            <button class="btn-secondary" onclick="exportAllJSON()"><i data-lucide="file-json"></i> Exportar JSON completo</button>
            <button class="btn-danger" onclick="confirmClearData()"><i data-lucide="trash-2"></i> Limpar tokens e configurações</button>
          </div>
        </div>

        <!-- Sobre -->
        <div class="settings-card">
          <h3><i data-lucide="info"></i> Sobre o TrafficFlow</h3>
          <div class="about-info">
            <div><strong>Versão</strong><span>${CONFIG.APP.VERSION}</span></div>
            <div><strong>Modo</strong><span>${mode === 'mock' ? '🟡 Demonstração' : '🟢 Produção'}</span></div>
            <div><strong>Clientes</strong><span>${STATE.clients.length}</span></div>
            <div><strong>FB API</strong><span>${CONFIG.API.FACEBOOK.VERSION}</span></div>
            <div><strong>Charts</strong><span>Chart.js 4</span></div>
            <div><strong>Icons</strong><span>Lucide</span></div>
          </div>
        </div>

      </div>
    </div>
  `;
  lucide.createIcons();
}

// Ativa modo Facebook e sincroniza
async function activateFacebookMode() {
  if (!CONFIG.API.FACEBOOK.TOKEN) {
    showNotification('⚠️ Salve o token do Facebook antes de sincronizar.');
    return;
  }
  setApiMode('facebook');
  await loadFacebookData(true);
}

// Verifica se o token é válido
async function verifyFbToken() {
  const statusEl = document.getElementById('fb-verify-result');
  if (statusEl) { statusEl.textContent = 'Verificando token...'; statusEl.className = 'status-msg'; }
  try {
    const info = await FB_API.verifyToken();
    const msg = `✅ Token válido — Conta: ${info.name} (ID: ${info.id})`;
    if (statusEl) { statusEl.textContent = msg; statusEl.className = 'status-msg status-success'; }
    showNotification(msg);
  } catch (e) {
    const msg = `❌ ${e.message}`;
    if (statusEl) { statusEl.textContent = msg; statusEl.className = 'status-msg status-error'; }
    showNotification(msg);
  }
}

// Vincula conta de anúncio a cliente
function doLinkAccount() {
  const clientId = document.getElementById('link-client-select')?.value;
  const accountId = document.getElementById('link-account-input')?.value?.trim();
  if (!clientId) return showNotification('⚠️ Selecione um cliente.');
  if (!accountId) return showNotification('⚠️ Informe o ID da conta.');
  linkAdAccount(clientId, accountId);
}

function setApiMode(mode) {
  CONFIG.API.MODE = mode;
  localStorage.setItem('tf_api_mode', mode);
  document.querySelectorAll('.radio-opt').forEach(el => {
    el.classList.toggle('active', el.querySelector('input').value === mode);
  });
}

function saveFbToken() {
  const val = document.getElementById('fb-token-input').value.trim();
  if (!val) return showStatus('fb-token-status', 'Token não pode ser vazio.', 'error');
  localStorage.setItem('tf_fb_token', val);
  CONFIG.API.FACEBOOK.TOKEN = val;
  showStatus('fb-token-status', '✓ Token salvo com segurança no browser.', 'success');
}

function saveAiToken() {
  const val = document.getElementById('ai-token-input').value.trim();
  if (!val) return showStatus('ai-token-status', 'Token não pode ser vazio.', 'error');
  localStorage.setItem('tf_ai_token', val);
  CONFIG.API.AI_ASSISTANT.TOKEN = val;
  showStatus('ai-token-status', '✓ Token do assistente salvo.', 'success');
}

function toggleAI(on) {
  CONFIG.API.AI_ASSISTANT.ENABLED = on;
}

function showStatus(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `status-msg status-${type}`;
  setTimeout(() => { if (el) el.textContent = ''; }, 3000);
}

function confirmClearData() {
  if (confirm('Isso vai limpar todos os tokens salvos. Continuar?')) {
    localStorage.clear();
    CONFIG.API.FACEBOOK.TOKEN = null;
    CONFIG.API.AI_ASSISTANT.TOKEN = null;
    renderSettings();
  }
}

// ── Export ─────────────────────────────────────────────────────────────────────
function exportClientCSV(clientId) {
  const c = STATE.clients.find(x => x.id === clientId);
  if (!c) return;
  const d = c.daily30;
  const headers = 'Data,Investimento,Impressões,Alcance,Cliques,CTR,CPC,CPM,Frequência,Leads,CPL,Conversas,Custo/Conv.,Taxa Conv.';
  const rows = d.map(r =>
    [r.date,r.spend,r.impressions,r.reach,r.link_clicks,r.ctr,r.cpc,r.cpm,r.freq,r.leads,r.cpl,r.conversations,r.cost_per_conversation,r.conversion_rate].join(',')
  );
  downloadCSV(`trafficflow_${c.id}_30dias.csv`, [headers, ...rows].join('\n'));
}

function exportAllCSV() {
  const headers = 'Cliente,Nicho,Investimento,Leads,CPL,CTR,CPC,CPM,Impressões,Alcance,Conversas';
  const rows = STATE.clients.map(c => {
    const t = getPeriodData(c.id)?.totals;
    return [c.name,c.niche,t?.spend,t?.leads,t?.cpl,t?.ctr,t?.cpc,t?.cpm,t?.impressions,t?.reach,t?.conversations].join(',');
  });
  downloadCSV('trafficflow_todos_clientes.csv', [headers, ...rows].join('\n'));
}

function exportAllJSON() {
  const data = STATE.clients.map(c => ({
    id: c.id, name: c.name, niche: c.niche, status: c.status,
    adAccount: c.adAccount, budget: c.budget,
    totals30: c.totals30, campaigns: c.campaigns.map(x => ({ id:x.id, name:x.name, status:x.status, totals:x.totals })),
  }));
  downloadFile('trafficflow_export.json', JSON.stringify(data, null, 2), 'application/json');
}

function downloadCSV(filename, content) {
  downloadFile(filename, '\uFEFF' + content, 'text/csv;charset=utf-8;');
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Add Client Modal ───────────────────────────────────────────────────────────
function openAddClientModal() {
  const modal = document.getElementById('modal-add-client');
  modal.classList.remove('hidden');
  lucide.createIcons();
}

function closeAddClientModal() {
  document.getElementById('modal-add-client').classList.add('hidden');
  document.getElementById('add-client-form').reset();
}

function submitAddClient(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const name  = fd.get('name');
  const niche = fd.get('niche');
  const accId = fd.get('accId');
  const budget= parseInt(fd.get('budget')) || 5000;
  const contact = fd.get('contact');
  const email   = fd.get('email');

  const id = 'client-' + Date.now();
  const initials = name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
  const colors = ['#3b82f6','#10b981','#f59e0b','#ec4899','#6366f1','#14b8a6','#f97316','#8b5cf6'];
  const color  = colors[STATE.clients.length % colors.length];

  const cfg = { dailyBudget: budget/30, cpm:16, ctr:2.5, convRate:6, isB2C:true };
  const newClient = buildClient(
    { id, name, niche, status:'active', initials, color,
      adAccount: { id: accId || 'act_new', name:`${name} Ads`, currency:'BRL', status:'ACTIVE', timezone:'America/Sao_Paulo' },
      budget: { monthly: budget, daily: Math.round(budget/30) },
      contact: { name: contact, email, phone:'' },
      startDate: new Date().toISOString().split('T')[0],
      notes: '',
    },
    [{ id:`c-${id}-1`, name:'Campanha Principal', status:'ACTIVE', objective:'LEAD_GENERATION', _budgetShare:1,
       adSets:[{ id:`as-${id}-1-1`, name:'Público Principal', status:'ACTIVE' }]
    }],
    cfg
  );

  STATE.clients.push(newClient);
  closeAddClientModal();
  navigate('client-detail', id);
  showNotification(`✅ Cliente "${name}" adicionado com sucesso!`);
}

// ── Charts Config ─────────────────────────────────────────────────────────────
function darkChartOptions({ title = '', yPrefix = '', ySuffix = '' } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: '#94a3b8', boxWidth: 14, padding: 16 } },
      tooltip: {
        backgroundColor: '#1e1e2e',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        titleColor: '#f1f5f9',
        bodyColor: '#94a3b8',
        padding: 12,
        callbacks: {
          label: ctx => {
            let v = ctx.parsed.y ?? ctx.parsed;
            if (yPrefix === 'R$') v = fmt.currencyFull(v);
            else if (ySuffix === '%') v = fmt.percent(v);
            else v = fmt.number(v);
            return ` ${ctx.dataset.label}: ${v}`;
          },
        },
      },
      title: title ? { display: true, text: title, color: '#94a3b8', font: { size: 13 } } : { display: false },
    },
    scales: {
      x: {
        ticks: { color: '#64748b', maxRotation: 45, font: { size: 11 } },
        grid:  { color: 'rgba(255,255,255,0.04)' },
      },
      y: {
        ticks: {
          color: '#64748b',
          callback: v => yPrefix === 'R$' ? 'R$' + fmt.number(v) : ySuffix === '%' ? v + '%' : fmt.number(v),
        },
        grid: { color: 'rgba(255,255,255,0.04)' },
      },
    },
  };
}

// ── Notifications ─────────────────────────────────────────────────────────────
function showNotification(msg) {
  const container = document.getElementById('notifications');
  const id = 'notif-' + Date.now();
  const el = document.createElement('div');
  el.id = id;
  el.className = 'notification';
  el.innerHTML = msg;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 400);
  }, 3500);
}

// ── Period Selector ───────────────────────────────────────────────────────────
function setPeriod(value) {
  STATE.period = value;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', b.dataset.value === value));
  // Re-render current view
  navigate(STATE.view, STATE.clientId);
}

// ── Search ────────────────────────────────────────────────────────────────────
function handleSearch(val) {
  STATE.search = val;
  if (STATE.view === 'clients') renderClients();
  if (STATE.view === 'overview') renderOverview();
}

// ── Filter handlers ───────────────────────────────────────────────────────────
function setFilter(key, val) {
  STATE.filters[key] = val;
  if (STATE.view === 'clients') renderClients();
}

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  // Load mock data
  STATE.clients = MOCK_CLIENTS;

  // Chart.js defaults
  Chart.defaults.color = '#94a3b8';
  Chart.defaults.borderColor = 'rgba(255,255,255,0.05)';

  // Build period buttons
  const pbWrap = document.getElementById('period-buttons');
  if (pbWrap) {
    pbWrap.innerHTML = CONFIG.PERIODS.map(p => `
      <button class="period-btn ${p.value === STATE.period ? 'active' : ''}" data-value="${p.value}" onclick="setPeriod('${p.value}')">${p.label}</button>
    `).join('');
  }

  // Build filter dropdowns
  const nicheFilter = document.getElementById('filter-niche');
  if (nicheFilter) {
    nicheFilter.innerHTML = `<option value="all">Todos os nichos</option>` +
      CONFIG.NICHES.map(n => `<option value="${n}">${n}</option>`).join('');
  }

  // Set sidebar active state
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.view));
  });

  // Mobile menu toggle
  const menuBtn = document.getElementById('menu-toggle');
  if (menuBtn) {
    menuBtn.addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
  }

  // Backdrop close
  const backdrop = document.getElementById('sidebar-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', () => document.getElementById('sidebar').classList.remove('open'));
  }

  // Search
  const searchInput = document.getElementById('global-search');
  if (searchInput) {
    searchInput.addEventListener('input', e => handleSearch(e.target.value));
  }

  // Filters
  ['filter-status', 'filter-niche'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', e => setFilter(id.replace('filter-', ''), e.target.value));
  });

  // Init icons
  lucide.createIcons();

  // Navigate to default view
  navigate('overview');
}

document.addEventListener('DOMContentLoaded', init);
