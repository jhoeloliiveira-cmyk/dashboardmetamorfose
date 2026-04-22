// =============================================================================
// TrafficFlow Dashboard — Main Application
// =============================================================================

// ── State ─────────────────────────────────────────────────────────────────────
const STATE = {
  view: 'overview',
  prevView: 'clients',
  clientId: null,
  period: 'last_30d',
  search: '',
  filters: { status: 'all', niche: 'all', campaign: 'all' },
  clients: [],
  chatHistory: [],
  charts: {},
  activeChartTab: 'spend',
  clientsView: 'grid',
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
  if (view !== 'client-detail') STATE.prevView = STATE.view;
  STATE.view = view;
  if (clientId) STATE.clientId = clientId;

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });

  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));

  const sectionMap = {
    overview:        'section-overview',
    clients:         'section-clients',
    board:           'section-board',
    'client-detail': 'section-client-detail',
    rankings:        'section-rankings',
    assistant:       'section-assistant',
    settings:        'section-settings',
  };

  const target = sectionMap[view];
  if (target) {
    const el = document.getElementById(target);
    if (el) el.classList.remove('hidden');
  }

  // Update topbar title
  const titles = { overview:'Dashboard', clients:'Clientes', board:'Board', rankings:'Rankings', assistant:'Assistente IA', settings:'Configurações' };
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = titles[view] || 'Dashboard';

  // Destroy stale charts before re-rendering
  Object.keys(STATE.charts).forEach(k => destroyChart(k));

  const renders = {
    overview:        renderOverview,
    clients:         renderClients,
    board:           renderBoard,
    'client-detail': renderClientDetail,
    rankings:        renderRankings,
    assistant:       renderAssistant,
    settings:        renderSettings,
  };
  if (renders[view]) {
    try { renders[view](); } catch(e) {
      console.error('[TrafficPro] render error for', view, e);
      const sec = document.getElementById(target);
      if (sec) sec.innerHTML += `<div style="color:#ef4444;padding:20px;font-family:monospace;font-size:12px">⚠ Erro ao renderizar (${view}): ${e.message}</div>`;
    }
  }

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('open');
  window.scrollTo(0, 0);
}

// ── Overview ──────────────────────────────────────────────────────────────────
function renderOverview() {
  if (!STATE.clients || STATE.clients.length === 0) {
    document.getElementById('ov-kpi-grid').innerHTML = '<p style="color:var(--text-muted);padding:16px">Carregando dados...</p>';
    document.getElementById('ov-charts').innerHTML = '';
    return;
  }
  const totals = allTotals();
  const avgCpl = totals.leads > 0 ? totals.spend / totals.leads : 0;
  const avgCtr = totals.impressions > 0 ? (totals.link_clicks / totals.impressions) * 100 : 0;
  const activeClients = STATE.clients.filter(c => c.status === 'active').length;

  document.getElementById('ov-kpi-grid').innerHTML = `
    ${kpiCard('Investimento Total', fmt.currency(totals.spend), 'dollar-sign', 'blue', null)}
    ${kpiCard('Total de Leads', fmt.number(totals.leads), 'users', 'gold', null)}
    ${kpiCard('CPL Médio', fmt.currencyFull(avgCpl), 'target', 'green', null)}
    ${kpiCard('Impressões', fmt.number(totals.impressions), 'eye', 'purple', null)}
    ${kpiCard('Cliques no Link', fmt.number(totals.link_clicks), 'mouse-pointer', 'blue', null)}
    ${kpiCard('CTR Médio', fmt.percent(avgCtr), 'trending-up', 'gold', null)}
    ${kpiCard('Conversas', fmt.number(totals.conversations), 'message-circle', 'green', null)}
    ${kpiCard('Clientes Ativos', `${activeClients}/${STATE.clients.length}`, 'briefcase', 'purple', null)}
  `;

  // Build client mini-cards + chart canvases all inside ov-charts
  const clientCardsHtml = STATE.clients.map(c => {
    const d = getPeriodData(c.id);
    if (!d) return '';
    const t = d.totals;
    const pct = Math.min(100, Math.round((t.spend / (c.budget.monthly || 1)) * 100));
    return `
      <div class="client-card" onclick="navigate('client-detail','${c.id}')" style="--client-color:${c.color}">
        <div class="client-card-header">
          <div class="client-avatar" style="background:${c.color}">${c.initials}</div>
          <div class="client-info">
            <div class="client-name">${c.name}</div>
            <div class="client-niche">${c.niche}</div>
          </div>
          <span class="status-pill sp-${c.status}">${c.status === 'active' ? 'Ativo' : 'Pausado'}</span>
        </div>
        <div class="client-metrics">
          <div class="cm-item"><div class="cm-val">${fmt.currency(t.spend)}</div><div class="cm-label">Investido</div></div>
          <div class="cm-item"><div class="cm-val" style="color:var(--gold)">${fmt.number(t.leads)}</div><div class="cm-label">Leads</div></div>
          <div class="cm-item"><div class="cm-val">${fmt.currencyFull(t.cpl)}</div><div class="cm-label">CPL</div></div>
        </div>
        <div class="client-card-footer">
          <div class="budget-bar-wrap">
            <div class="budget-bar-label"><span>Orçamento mensal</span><span>${pct}%</span></div>
            <div class="budget-bar"><div class="budget-fill" style="width:${pct}%"></div></div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('ov-charts').innerHTML = `
    <div style="margin-bottom:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <h3 style="font-size:14px;font-weight:700;color:var(--text)">Todos os Clientes</h3>
      </div>
      <div class="clients-grid">${clientCardsHtml}</div>
    </div>
    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-card-title"><i data-lucide="trending-up"></i> Investimento Diário por Cliente (30 dias)</div>
        <div class="chart-container"><canvas id="chart-ov-line"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-title"><i data-lucide="bar-chart-2"></i> Ranking de Leads por Cliente</div>
        <div class="chart-container"><canvas id="chart-ov-bar"></canvas></div>
      </div>
    </div>
  `;

  if (typeof lucide !== 'undefined') lucide.createIcons();
  if (typeof Chart !== 'undefined') renderOverviewCharts();
}

function renderOverviewCharts() {
  if (typeof Chart === 'undefined') return;
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
  const palette = {
    blue:   { color:'var(--blue-light)', bg:'rgba(59,130,246,0.1)',   glow:'rgba(59,130,246,0.28)' },
    gold:   { color:'var(--gold)',       bg:'rgba(245,158,11,0.1)',   glow:'rgba(245,158,11,0.28)' },
    green:  { color:'var(--green)',      bg:'rgba(16,185,129,0.1)',   glow:'rgba(16,185,129,0.25)' },
    purple: { color:'var(--purple)',     bg:'rgba(139,92,246,0.1)',   glow:'rgba(139,92,246,0.22)' },
  };
  const c = palette[accent] || palette.blue;
  const trendHtml = trend ? `
    <div class="kpi-trend ${trend.dir}">
      <i data-lucide="${trend.dir === 'up' ? 'trending-up' : 'trending-down'}"></i>${trend.pct}%
    </div>
    <span class="kpi-sub">vs anterior</span>
  ` : '';
  return `
    <div class="kpi-card" style="--kpi-color:${c.color};--kpi-bg:${c.bg};--kpi-glow:${c.glow}">
      <div class="kpi-top">
        <div class="kpi-label">${label}</div>
        <div class="kpi-icon"><i data-lucide="${icon}"></i></div>
      </div>
      <div class="kpi-value">${value}</div>
      <div class="kpi-footer">${trendHtml}</div>
    </div>
  `;
}

// ── Client List ───────────────────────────────────────────────────────────────
function renderClients() {
  const q       = STATE.search.toLowerCase();
  const sfEl    = document.getElementById('filter-status');
  const nfEl    = document.getElementById('filter-niche');
  const bfEl    = document.getElementById('filter-board-status');
  const pfEl    = document.getElementById('filter-platform');
  const sFilt   = sfEl?.value || 'all';
  const nFilt   = nfEl?.value || 'all';
  const bFilt   = bfEl?.value || 'all';
  const pFilt   = pfEl?.value || 'all';

  const filtered = STATE.clients.filter(c => {
    if (q && !c.name.toLowerCase().includes(q) && !c.niche.toLowerCase().includes(q)) return false;
    if (sFilt !== 'all' && c.status !== sFilt) return false;
    if (nFilt !== 'all' && c.niche  !== nFilt) return false;
    if (bFilt !== 'all' && c.boardStatus !== bFilt) return false;
    if (pFilt !== 'all' && c.platform !== pFilt) return false;
    return true;
  });

  const countEl = document.getElementById('clients-count');
  if (countEl) countEl.textContent = filtered.length;

  const grid = document.getElementById('clients-grid');
  if (!grid) return;

  if (!filtered.length) {
    grid.innerHTML = '<div class="empty-state"><i data-lucide="search-x"></i><p>Nenhum cliente encontrado</p></div>';
    if (typeof lucide !== 'undefined') lucide.createIcons(); return;
  }

  grid.className = `clients-grid${STATE.clientsView === 'list' ? ' list-view' : ''}`;

  grid.innerHTML = filtered.map(c => {
    const d  = getPeriodData(c.id);
    const t  = d?.totals;
    const ac = c.campaigns.filter(x => x.status === 'ACTIVE').length;
    const pct = Math.min(100, Math.round(((t?.spend||0) / (c.budget.monthly||1)) * 100));
    const board = BOARD_COLUMNS.find(b => b.id === c.boardStatus);
    return `
      <div class="client-card" onclick="navigate('client-detail','${c.id}')" style="--client-color:${c.color}">
        <div class="client-card-header">
          <div class="client-avatar" style="background:${c.color}">${c.initials}</div>
          <div class="client-info">
            <div class="client-name">${c.name}</div>
            <div class="client-niche">${c.niche} · <span style="color:var(--text-muted);font-size:10px">${c.adAccount.id || 'sem conta'}</span></div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
            <span class="status-pill sp-${c.status}">${c.status === 'active' ? 'Ativo' : 'Pausado'}</span>
            ${board ? `<span class="status-pill" style="background:${board.color}18;color:${board.color};border-color:${board.color}44;font-size:9px">${board.emoji} ${board.label}</span>` : ''}
          </div>
        </div>
        <div class="client-metrics">
          <div class="cm-item"><div class="cm-val">${fmt.currency(t?.spend||0)}</div><div class="cm-label">Investimento</div></div>
          <div class="cm-item"><div class="cm-val" style="color:var(--gold)">${fmt.number(t?.leads||0)}</div><div class="cm-label">Leads</div></div>
          <div class="cm-item"><div class="cm-val">${fmt.currencyFull(t?.cpl||0)}</div><div class="cm-label">CPL</div></div>
          <div class="cm-item"><div class="cm-val" style="color:var(--blue-light)">${fmt.percent(t?.ctr||0)}</div><div class="cm-label">CTR</div></div>
          <div class="cm-item"><div class="cm-val">${fmt.currencyFull(t?.cpc||0)}</div><div class="cm-label">CPC</div></div>
          <div class="cm-item"><div class="cm-val">${fmt.currencyFull(t?.cpm||0)}</div><div class="cm-label">CPM</div></div>
        </div>
        <div class="client-card-footer">
          <div class="budget-bar-wrap">
            <div class="budget-bar-label">
              <span><i data-lucide="megaphone" style="width:10px;height:10px;vertical-align:middle"></i> ${ac} camp. ativa${ac!==1?'s':''}</span>
              <span style="color:${pct>=90?'var(--red)':pct>=70?'var(--gold)':'var(--text-muted)'}">${pct}% do orçamento</span>
            </div>
            <div class="budget-bar"><div class="budget-fill" style="width:${pct}%;background:${pct>=90?'var(--red)':pct>=70?'var(--gold)':'linear-gradient(90deg,var(--blue),var(--gold))'}"></div></div>
          </div>
          <div class="card-actions">
            <button class="card-action-btn" title="Exportar" onclick="event.stopPropagation();exportClientCSV('${c.id}')">
              <i data-lucide="download"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function setClientsView(type) {
  STATE.clientsView = type;
  document.getElementById('vt-grid')?.classList.toggle('active', type === 'grid');
  document.getElementById('vt-list')?.classList.toggle('active', type === 'list');
  renderClients();
}

function onSearch(val) {
  STATE.search = val;
  if (STATE.view === 'clients') renderClients();
  if (STATE.view === 'overview') renderOverview();
}

// ── Client Detail ─────────────────────────────────────────────────────────────
function renderClientDetail() {
  const c = STATE.clients.find(x => x.id === STATE.clientId);
  if (!c) { navigate('clients'); return; }

  const d    = getPeriodData(c.id);
  const t    = d.totals;
  const prev = getClientData(c.id, 'last_30d');
  const board = BOARD_COLUMNS.find(b => b.id === c.boardStatus);

  // Hero — element id is cd-hero in the HTML
  document.getElementById('cd-hero').innerHTML = `
    <div class="cd-hero-avatar" style="background:${c.color}">${c.initials}</div>
    <div class="cd-hero-info">
      <div class="cd-hero-name">${c.name}</div>
      <div class="cd-hero-meta">
        <span><i data-lucide="briefcase"></i> ${c.niche}</span>
        <span><i data-lucide="hash"></i> ${c.adAccount.id || 'Conta não vinculada'}</span>
        <span><i data-lucide="calendar"></i> Desde ${new Date(c.startDate+'T00:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</span>
        ${c.contact?.name ? `<span><i data-lucide="user"></i> ${c.contact.name}</span>` : ''}
        <span class="status-pill sp-${c.status}">${c.status==='active'?'Ativo':'Pausado'}</span>
        ${board ? `<span class="status-pill" style="background:${board.color}18;color:${board.color};border-color:${board.color}44">${board.emoji} ${board.label}</span>` : ''}
        <span class="status-pill sp-${c.platform}">${c.platform.toUpperCase()}</span>
      </div>
    </div>
    <div class="cd-hero-actions">
      <button class="btn-ghost" onclick="exportClientCSV('${c.id}')"><i data-lucide="download"></i> CSV</button>
    </div>
  `;

  const trendSpend = getTrend(t.spend, prev.totals.spend * 0.93);
  const trendLeads = getTrend(t.leads, prev.totals.leads * 0.89);

  document.getElementById('cd-kpi-grid').innerHTML = `
    ${kpiCard('Investimento',  fmt.currency(t.spend),                        'dollar-sign',    'blue',   trendSpend)}
    ${kpiCard('Leads',         fmt.number(t.leads),                          'users',          'gold',   trendLeads)}
    ${kpiCard('CPL',           fmt.currencyFull(t.cpl),                      'target',         'green',  null)}
    ${kpiCard('Impressões',    fmt.number(t.impressions),                     'eye',            'purple', null)}
    ${kpiCard('Alcance',       fmt.number(t.reach),                          'radio',          'blue',   null)}
    ${kpiCard('Cliques',       fmt.number(t.link_clicks),                    'mouse-pointer',  'gold',   null)}
    ${kpiCard('CTR',           fmt.percent(t.ctr),                           'trending-up',    'green',  null)}
    ${kpiCard('CPC',           fmt.currencyFull(t.cpc),                      'credit-card',    'purple', null)}
    ${kpiCard('CPM',           fmt.currencyFull(t.cpm),                      'bar-chart-2',    'blue',   null)}
    ${kpiCard('Conversas',     fmt.number(t.conversations),                  'message-circle', 'gold',   null)}
    ${kpiCard('Custo/Conv.',   fmt.currencyFull(t.cost_per_conversation),    'phone',          'green',  null)}
    ${kpiCard('Frequência',    (t.frequency||0).toFixed(2),                  'repeat',         'purple', null)}
  `;

  // Charts — inject canvases into cd-charts
  document.getElementById('cd-charts').innerHTML = `
    <div class="charts-grid">
      <div class="chart-card">
        <div class="chart-card-title"><i data-lucide="trending-up"></i> Performance no Período</div>
        <div class="chart-tabs">
          ${['spend','leads','ctr','cpl'].map(tab => `
            <button class="chart-tab ${STATE.activeChartTab===tab?'active':''}" onclick="switchChartTab('${tab}')">
              ${{spend:'Investimento',leads:'Leads',ctr:'CTR',cpl:'CPL'}[tab]}
            </button>`).join('')}
        </div>
        <div class="chart-container"><canvas id="chart-cd-main"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-title"><i data-lucide="bar-chart-2"></i> Por Campanha</div>
        <div class="chart-container"><canvas id="chart-cd-campaigns"></canvas></div>
      </div>
    </div>
  `;

  renderClientMainChart(c, d);

  // Campaign bar chart — canvas now exists in DOM
  const campCtx = document.getElementById('chart-cd-campaigns');
  if (campCtx) {
    destroyChart('cd-camps');
    STATE.charts['cd-camps'] = new Chart(campCtx, {
      type: 'bar',
      data: {
        labels: c.campaigns.map(x => x.name.length > 22 ? x.name.slice(0,20)+'…' : x.name),
        datasets: [
          { label:'Leads',          data:c.campaigns.map(x=>x.totals.leads),  backgroundColor:c.color+'cc', borderColor:c.color,    borderWidth:1, borderRadius:6, yAxisID:'y'  },
          { label:'Investimento(R$)',data:c.campaigns.map(x=>x.totals.spend),  backgroundColor:'#3b82f620', borderColor:'#3b82f6', borderWidth:1, borderRadius:6, yAxisID:'y1' },
        ],
      },
      options: {
        ...darkChartOptions({}),
        scales: {
          x:  { ticks:{color:'#64748b',font:{size:10}},  grid:{color:'rgba(255,255,255,0.04)'} },
          y:  { position:'left',  ticks:{color:'#64748b'}, grid:{color:'rgba(255,255,255,0.04)'}, title:{display:true,text:'Leads',color:'#64748b'} },
          y1: { position:'right', ticks:{color:'#3b82f6',callback:v=>'R$'+fmt.number(v)}, grid:{drawOnChartArea:false} },
        },
      },
    });
  }

  // Campaigns table — inject into cd-campaigns
  const campRows = c.campaigns.map(camp => {
    const ct = camp.totals;
    return `
      <tr>
        <td>
          <div style="font-weight:600;color:var(--text)">${camp.name}</div>
          <div style="font-size:10px;color:var(--text-muted)">${camp.objective||''}</div>
        </td>
        <td><span class="status-pill sp-${camp.status==='ACTIVE'?'active':'paused'}">${camp.status==='ACTIVE'?'Ativo':'Pausado'}</span></td>
        <td style="font-weight:700">${fmt.currency(ct.spend)}</td>
        <td>${fmt.number(ct.impressions)}</td>
        <td>${fmt.number(ct.link_clicks)}</td>
        <td style="color:var(--blue-light)">${fmt.percent(ct.ctr)}</td>
        <td>${fmt.currencyFull(ct.cpc)}</td>
        <td>${fmt.currencyFull(ct.cpm)}</td>
        <td style="color:var(--gold);font-weight:700">${fmt.number(ct.leads)}</td>
        <td style="color:var(--green)">${fmt.currencyFull(ct.cpl)}</td>
        <td>${fmt.number(ct.conversations)}</td>
      </tr>
    `;
  }).join('');

  document.getElementById('cd-campaigns').innerHTML = `
    <div class="table-wrap">
      <table>
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
    ${c.notes ? `
      <div style="margin-top:14px;background:var(--bg-card);border:1px solid var(--border);border-left:3px solid ${c.color};border-radius:var(--r-lg);padding:16px 18px">
        <div style="font-size:10.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Observações</div>
        <p style="font-size:13px;color:var(--text-dim);line-height:1.7">${c.notes}</p>
      </div>` : ''}
  `;

  if (typeof lucide !== 'undefined') lucide.createIcons();
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
  if (typeof Chart === 'undefined') return;
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
  const byLeads = [...clients].sort((a,b) => (b.t?.leads||0) - (a.t?.leads||0));
  const byCpl   = [...clients].filter(c=>(c.t?.cpl||0)>0).sort((a,b)=>(a.t?.cpl||0)-(b.t?.cpl||0));
  const bySpend = [...clients].sort((a,b) => (b.t?.spend||0) - (a.t?.spend||0));
  const byCtr   = [...clients].sort((a,b) => (b.t?.ctr||0) - (a.t?.ctr||0));

  const el = document.getElementById('rankings-content');
  if (!el) return;
  el.innerHTML = `
    <div class="rankings-grid">
      ${rankingTable('🏆 Mais Leads',         'users',        byLeads,  'leads', fmt.number,       false)}
      ${rankingTable('💚 Menor CPL',           'target',       byCpl,    'cpl',   fmt.currencyFull, true)}
      ${rankingTable('💰 Maior Investimento',  'dollar-sign',  bySpend,  'spend', fmt.currency,     false)}
      ${rankingTable('🎯 Melhor CTR',          'trending-up',  byCtr,    'ctr',   fmt.percent,      false)}
    </div>
  `;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function rankingTable(title, icon, sorted, key, valueFmt, lowerIsBetter) {
  const medals = ['🥇','🥈','🥉'];
  const max = sorted[0]?.t?.[key] || 1;
  const rows = sorted.map((c, i) => {
    const val = c.t?.[key] || 0;
    const barW = Math.round(val / max * 100);
    const isWinner = i === 0;
    return `
      <tr>
        <td style="width:32px;font-size:16px;text-align:center">${medals[i] || `<span style="font-size:11px;color:var(--text-muted)">#${i+1}</span>`}</td>
        <td>
          <div class="rank-client">
            <div style="width:26px;height:26px;border-radius:6px;background:${c.color};display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#fff;flex-shrink:0">${c.initials}</div>
            <div>
              <div style="font-size:12.5px;font-weight:600;color:var(--text)">${c.name}</div>
              <div style="font-size:10px;color:var(--text-muted)">${c.niche}</div>
            </div>
          </div>
        </td>
        <td style="text-align:right;font-weight:${isWinner?'800':'600'};color:${isWinner?(lowerIsBetter?'var(--green)':'var(--gold)'):'var(--text)'}">
          ${valueFmt(val)}
        </td>
        <td style="width:80px;padding-left:8px">
          <div style="height:4px;background:rgba(255,255,255,0.06);border-radius:99px;overflow:hidden">
            <div style="height:100%;width:${barW}%;background:${c.color};border-radius:99px;transition:width 0.6s"></div>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div class="ranking-card">
      <div class="ranking-card-header">
        <i data-lucide="${icon}"></i>${title}
      </div>
      <table class="ranking-table"><tbody>${rows}</tbody></table>
    </div>
  `;
}

// ── Assistant ──────────────────────────────────────────────────────────────────
function renderAssistant() {
  const el = document.getElementById('section-assistant');
  const aiOn = CONFIG.API.AI_ASSISTANT?.ENABLED;
  el.innerHTML = `
    <div class="assistant-layout">
      <div class="chat-card">
        <div class="chat-header">
          <div class="chat-ai-avatar"><i data-lucide="bot"></i></div>
          <div style="flex:1">
            <div class="chat-name">TrafficFlow AI</div>
            <div class="chat-status">${aiOn ? 'Claude ativado' : 'Modo análise local'}</div>
          </div>
          <div style="font-size:10px;padding:3px 9px;border-radius:99px;border:1px solid ${aiOn?'rgba(16,185,129,0.3)':'rgba(245,158,11,0.3)'};color:${aiOn?'var(--green)':'var(--gold)'};background:${aiOn?'rgba(16,185,129,0.07)':'rgba(245,158,11,0.07)'}">
            ${aiOn ? '✦ IA Ativa' : '⚙ Demo'}
          </div>
        </div>
        <div class="chat-messages" id="chat-window">
          ${STATE.chatHistory.length === 0
            ? `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:10px;color:var(--text-muted)">
                <i data-lucide="message-circle" style="width:40px;height:40px;opacity:0.3"></i>
                <p style="font-size:13px;text-align:center">Olá! Pergunte sobre clientes, métricas, campanhas ou rankings.</p>
               </div>`
            : STATE.chatHistory.map(renderChatMessage).join('')}
        </div>
        <div class="chat-input-row">
          <textarea class="chat-textarea" id="chat-input" rows="1" placeholder="Ex: Qual cliente tem o menor CPL?" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();submitAssistant()}"></textarea>
          <button class="chat-send-btn" onclick="submitAssistant()"><i data-lucide="send"></i></button>
        </div>
      </div>

      <div class="quick-panel">
        <h4>Perguntas rápidas</h4>
        ${[
          'Qual cliente tem mais leads?',
          'Qual o CPL médio da carteira?',
          'Quem tem o melhor CTR?',
          'Quanto foi investido no total?',
          'Quem tem mais conversas?',
          'Qual cliente tem maior orçamento?',
          'Me dê um resumo geral',
          'Quem tem o pior CTR?',
        ].map(q => `<button class="q-btn" onclick="submitAssistant('${q}')">${q}</button>`).join('')}
      </div>
    </div>
  `;
  if (typeof lucide !== 'undefined') lucide.createIcons();
  scrollChat();
}

function renderChatMessage(msg) {
  const isUser = msg.role === 'user';
  return `
    <div class="msg ${isUser ? 'user' : 'bot'}">
      <div class="msg-av">${isUser ? 'Eu' : 'AI'}</div>
      <div>
        <div class="msg-text">${msg.content}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:3px;${isUser?'text-align:right':''}">${msg.time}</div>
      </div>
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
  const el       = document.getElementById('section-settings');
  const fbToken  = localStorage.getItem('tf_fb_token') || '';
  const aiToken  = localStorage.getItem('tf_ai_token') || '';
  const mode     = CONFIG.API.MODE;
  const aiOn     = CONFIG.API.AI_ASSISTANT?.ENABLED;

  const sc = (title, icon, body, full='') => `
    <div class="settings-card${full}">
      <div class="sc-title"><i data-lucide="${icon}"></i>${title}</div>
      ${body}
    </div>`;

  const inputStyle = 'width:100%;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:var(--r-md);padding:8px 11px;color:var(--text);font-size:13px;outline:none;font-family:inherit';

  el.innerHTML = `<div class="settings-grid">

    ${sc('Modo de Dados','zap',`
      <p style="font-size:12.5px;color:var(--text-muted);margin-bottom:12px">Dados mockados para demo ou API real do Facebook Ads.</p>
      <div class="mode-toggle">
        <button class="mode-btn mock ${mode==='mock'?'active':''}" onclick="setApiMode('mock')"><i data-lucide="database"></i> Mockado</button>
        <button class="mode-btn live ${mode==='facebook'?'active':''}" onclick="setApiMode('facebook')"><i data-lucide="zap"></i> Facebook API</button>
      </div>
    `)}

    ${sc('Facebook Ads Token','key',`
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:10px">Salvo apenas no seu browser — nunca enviado a servidores externos.</p>
      <div style="display:flex;gap:6px;margin-bottom:8px">
        <input id="fb-token-input" type="password" style="${inputStyle};flex:1"
          placeholder="EAAxxxxxxxxxxxxxxxxxxxxxxxxx..."
          value="${fbToken ? fbToken.slice(0,14)+'••••' : ''}" autocomplete="off"/>
        <button class="btn-primary" onclick="saveFbToken()"><i data-lucide="save"></i> Salvar</button>
      </div>
      <div id="fb-token-status" style="font-size:12px;min-height:18px"></div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
        <span style="font-size:11px;padding:3px 9px;border-radius:99px;${fbToken?'background:rgba(16,185,129,0.1);color:var(--green);border:1px solid rgba(16,185,129,0.3)':'background:rgba(245,158,11,0.1);color:var(--gold);border:1px solid rgba(245,158,11,0.3)'}">
          ${fbToken ? '● Configurado' : '○ Não configurado'}
        </span>
        ${fbToken ? `<button class="btn-ghost" style="padding:4px 10px;font-size:12px" onclick="verifyFbToken()"><i data-lucide="check-circle"></i> Verificar</button>` : ''}
      </div>
    `)}

    ${sc('Sincronização Facebook Ads','refresh-cw',`
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Sincroniza dados dos clientes com suas contas de anúncio. Requer modo API + token válido.</p>
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        <button id="fb-load-btn" class="btn-primary" onclick="activateFacebookMode()"><i data-lucide="refresh-cw"></i> Ativar e Sincronizar</button>
        <button class="btn-ghost" onclick="verifyFbToken()"><i data-lucide="shield-check"></i> Verificar Token</button>
      </div>
      <div id="fb-verify-result" style="font-size:12px;margin-bottom:10px"></div>
      <div id="fb-accounts-list"></div>
    `,' full')}

    ${sc('Vincular Conta a Cliente','link',`
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:10px">Associe uma conta do Facebook a um cliente.</p>
      <div class="form-group" style="margin-bottom:8px">
        <label>Cliente</label>
        <select id="link-client-select" style="${inputStyle}">
          <option value="">Selecione o cliente</option>
          ${STATE.clients.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="margin-bottom:10px">
        <label>ID da Conta (act_XXXXXXXXX)</label>
        <input id="link-account-input" type="text" placeholder="act_123456789" style="${inputStyle}"/>
      </div>
      <button class="btn-primary" onclick="doLinkAccount()"><i data-lucide="link-2"></i> Vincular</button>
    `)}

    ${sc('Assistente IA','bot',`
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:10px">Token Anthropic para respostas com IA no assistente.</p>
      <div style="display:flex;gap:6px;margin-bottom:8px">
        <input id="ai-token-input" type="password" style="${inputStyle};flex:1"
          placeholder="sk-ant-api03-..." value="${aiToken?aiToken.slice(0,14)+'••••':''}" autocomplete="off"/>
        <button class="btn-primary" onclick="saveAiToken()"><i data-lucide="save"></i> Salvar</button>
      </div>
      <div id="ai-token-status" style="font-size:12px;min-height:18px;margin-bottom:8px"></div>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--text-dim)">
        <input type="checkbox" ${aiOn?'checked':''} onchange="toggleAI(this.checked)" style="accent-color:var(--blue)">
        Ativar Assistente IA
      </label>
    `)}

    ${sc('Exportação','database',`
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Exporte dados da carteira.</p>
      <div style="display:flex;flex-direction:column;gap:7px">
        <button class="btn-ghost" onclick="exportAllCSV()"><i data-lucide="download"></i> Exportar todos como CSV</button>
        <button class="btn-ghost" onclick="exportAllJSON()"><i data-lucide="file-json-2"></i> Exportar JSON completo</button>
        <button class="btn-danger" onclick="confirmClearData()"><i data-lucide="trash-2"></i> Limpar tokens e configs</button>
      </div>
    `)}

    ${sc('Sobre','info',`
      <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
        ${[['Versão',CONFIG.APP.VERSION],['Modo',mode==='mock'?'🟡 Demo':'🟢 Produção'],['Clientes',STATE.clients.length],['FB API',CONFIG.API.FACEBOOK.VERSION],['Charts','Chart.js 4'],['Icons','Lucide']]
          .map(([k,v])=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-dim)"><span style="color:var(--text-muted)">${k}</span><span style="font-weight:600">${v}</span></div>`).join('')}
      </div>
    `)}

  </div>`;
  if (typeof lucide !== 'undefined') lucide.createIcons();
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

// ── Board / Kanban ─────────────────────────────────────────────────────────────
function renderBoard() {
  const container = document.getElementById('board-container');
  if (!container) return;

  const totalSpend = STATE.clients.reduce((a,c) => a+(getPeriodData(c.id)?.totals.spend||0), 0);
  const summaryEl  = document.getElementById('board-summary');
  if (summaryEl) summaryEl.innerHTML = `<strong>${STATE.clients.length}</strong> clientes · <strong>${fmt.currency(totalSpend)}</strong> investidos`;

  container.innerHTML = BOARD_COLUMNS.map(col => {
    const colClients = STATE.clients.filter(c => c.boardStatus === col.id);
    const colSpend   = colClients.reduce((a,c) => a+(getPeriodData(c.id)?.totals.spend||0), 0);

    const cards = colClients.length
      ? colClients.map(c => {
          const t = getPeriodData(c.id)?.totals;
          return `
            <div class="board-card" draggable="true" data-client-id="${c.id}"
              style="--card-color:${c.color}"
              ondragstart="onBoardDragStart(event,'${c.id}')"
            >
              <div class="bc-top">
                <div class="bc-avatar" style="background:${c.color}">${c.initials}</div>
                <div>
                  <div class="bc-name">${c.name}</div>
                  <div class="bc-niche">${c.niche}</div>
                </div>
              </div>
              <div class="bc-metrics">
                <div class="bcm"><div class="bcm-val">${fmt.currency(t?.spend||0)}</div><div class="bcm-lbl">Investido</div></div>
                <div class="bcm"><div class="bcm-val" style="color:var(--gold)">${fmt.number(t?.leads||0)}</div><div class="bcm-lbl">Leads</div></div>
                <div class="bcm"><div class="bcm-val">${fmt.currencyFull(t?.cpl||0)}</div><div class="bcm-lbl">CPL</div></div>
              </div>
              <div class="bc-footer">
                <span class="bc-budget">Orç: <strong>${fmt.currency(c.budget.monthly)}/mês</strong></span>
                <span class="bc-platform"><span>${c.platform.toUpperCase()}</span></span>
              </div>
              <div class="bc-actions">
                <button class="bc-btn" onclick="navigate('client-detail','${c.id}');event.stopPropagation()"><i data-lucide="external-link"></i> Ver</button>
                <button class="bc-btn" onclick="event.stopPropagation()"><i data-lucide="edit-2"></i> Editar</button>
              </div>
            </div>
          `;
        }).join('')
      : `<div class="column-empty"><i data-lucide="inbox"></i><span>Arraste um cliente aqui</span></div>`;

    return `
      <div class="board-column" data-column="${col.id}"
        ondragover="event.preventDefault();this.classList.add('drag-over')"
        ondragleave="this.classList.remove('drag-over')"
        ondrop="onBoardDrop(event,'${col.id}')">
        <div class="column-header">
          <div class="column-dot" style="background:${col.color}"></div>
          <span class="column-title">${col.emoji} ${col.label}</span>
          <span class="column-count">${colClients.length}</span>
        </div>
        <div class="column-meta">${fmt.currency(colSpend)} investidos</div>
        <div class="column-cards">${cards}</div>
      </div>
    `;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function onBoardDragStart(event, clientId) {
  event.dataTransfer.setData('clientId', clientId);
  setTimeout(() => document.querySelector(`[data-client-id="${clientId}"]`)?.classList.add('dragging'), 0);
}

function onBoardDrop(event, newStatus) {
  event.preventDefault();
  const clientId = event.dataTransfer.getData('clientId');
  document.querySelectorAll('.board-card.dragging').forEach(el => el.classList.remove('dragging'));
  document.querySelectorAll('.board-column.drag-over').forEach(el => el.classList.remove('drag-over'));
  const client = STATE.clients.find(c => c.id === clientId);
  if (client && client.boardStatus !== newStatus) {
    client.boardStatus = newStatus;
    renderBoard();
    showNotification(`✅ ${client.name} → ${BOARD_COLUMNS.find(b=>b.id===newStatus)?.label}`);
  }
}

// ── Add Client Modal ───────────────────────────────────────────────────────────
function openAddClientModal() {
  document.getElementById('modal-add-client').classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeAddClientModal() {
  document.getElementById('modal-add-client').classList.add('hidden');
  document.getElementById('add-client-form').reset();
}

// Generic close for any modal
function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('hidden');
  const form = modal.querySelector('form');
  if (form) form.reset();
}

function submitAddClient(e) {
  e.preventDefault();
  const name    = document.getElementById('inp-name').value.trim();
  const niche   = document.getElementById('inp-niche').value;
  const bStatus = document.getElementById('inp-board-status').value;
  const plat    = document.getElementById('inp-platform').value;
  const accId   = document.getElementById('inp-acc-id').value.trim();
  const budget  = parseInt(document.getElementById('inp-budget').value) || 5000;
  const contact = document.getElementById('inp-contact').value.trim();
  const email   = document.getElementById('inp-email').value.trim();
  const notes   = document.getElementById('inp-notes').value.trim();

  if (!name || !niche) return showNotification('⚠️ Preencha nome e nicho.');

  const id       = 'client-' + Date.now();
  const initials = name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
  const palette  = ['#3b82f6','#10b981','#f59e0b','#ec4899','#6366f1','#14b8a6','#f97316','#8b5cf6'];
  const color    = palette[STATE.clients.length % palette.length];

  const cfg = { dailyBudget:budget/30, cpm:16, ctr:2.5, convRate:6, isB2C:true };
  const newClient = buildClient(
    { id, name, niche, status:'active', boardStatus:bStatus||'active', platform:plat||'facebook', initials, color,
      adAccount:{ id:accId||'', name:`${name} Ads`, currency:'BRL', status:'ACTIVE' },
      budget:{ monthly:budget, daily:Math.round(budget/30) },
      contact:{ name:contact, email, phone:'' },
      startDate:new Date().toISOString().split('T')[0], notes },
    [{ id:`c-${id}-1`, name:'Campanha Principal', status:'ACTIVE', objective:'LEAD_GENERATION', _budgetShare:1,
       adSets:[{ id:`as-${id}-1-1`, name:'Público Principal', status:'ACTIVE' }] }],
    cfg
  );

  STATE.clients.push(newClient);
  closeAddClientModal();
  navigate('client-detail', id);
  showNotification(`✅ Cliente "${name}" adicionado!`);
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

// ── Sidebar helpers (also callable from HTML onclick) ─────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-backdrop').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('open');
}

// ── Filter handlers ───────────────────────────────────────────────────────────
function setFilter(key, val) {
  STATE.filters[key] = val;
  if (STATE.view === 'clients') renderClients();
}

// ── Init ──────────────────────────────────────────────────────────────────────
function hideLoader() {
  const loader = document.getElementById('loading-screen');
  if (loader) {
    loader.style.opacity = '0';
    loader.style.pointerEvents = 'none';
    setTimeout(() => { loader.style.display = 'none'; }, 500);
  }
}

function init() {
  // Garantia de escape: loader some em 4s mesmo que algo falhe
  const safetyTimer = setTimeout(hideLoader, 4000);

  try {
    STATE.clients = MOCK_CLIENTS;

    if (typeof Chart !== 'undefined') {
      Chart.defaults.color = '#64748b';
      Chart.defaults.borderColor = 'rgba(255,255,255,0.04)';
    }

    // Period bar
    const pbWrap = document.getElementById('period-bar');
    if (pbWrap) {
      pbWrap.innerHTML = CONFIG.PERIODS.map(p =>
        `<button class="period-btn ${p.value === STATE.period ? 'active' : ''}" data-value="${p.value}" onclick="setPeriod('${p.value}')">${p.label}</button>`
      ).join('');
    }

    // Niche filter
    const nicheFilter = document.getElementById('filter-niche');
    if (nicheFilter) {
      nicheFilter.innerHTML = `<option value="all">Todos os nichos</option>` +
        CONFIG.NICHES.map(n => `<option value="${n}">${n}</option>`).join('');
    }

    // Nav items
    document.querySelectorAll('.nav-item[data-view]').forEach(el => {
      el.addEventListener('click', () => navigate(el.dataset.view));
    });

    // Mobile sidebar
    document.getElementById('menu-toggle')?.addEventListener('click', toggleSidebar);
    document.getElementById('sidebar-backdrop')?.addEventListener('click', closeSidebar);

    // Search
    document.getElementById('global-search')?.addEventListener('input', e => onSearch(e.target.value));

    // Sidebar mode dot
    const modeDot = document.querySelector('.mode-dot');
    if (modeDot && CONFIG.API.MODE === 'facebook') modeDot.className = 'mode-dot live';

    // Init icons se Lucide carregou
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Esconde loader e navega
    clearTimeout(safetyTimer);
    setTimeout(() => {
      hideLoader();
      navigate('overview');
    }, 1600);

  } catch (err) {
    console.error('[TrafficPro] Erro na inicialização:', err);
    clearTimeout(safetyTimer);
    hideLoader();
    // Tenta navegar mesmo assim
    try { navigate('overview'); } catch(e) { console.error('[TrafficPro] Falha ao navegar:', e); }
  }
}

document.addEventListener('DOMContentLoaded', init);
