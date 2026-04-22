// =============================================================================
// TrafficFlow — Facebook Ads Graph API Integration
// Todas as chamadas passam pelo proxy /api/facebook (Vercel Function)
// O token fica na variável de ambiente do Vercel — nunca exposto no browser
// =============================================================================

const FB_API = {

  // Detecta se está rodando no Vercel (produção) ou local
  get proxyBase() {
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    return isLocal ? null : '/api/facebook';
  },

  // ── Request helper ────────────────────────────────────────────────────────────
  async request(path, params = {}) {
    let url;

    if (this.proxyBase) {
      // Produção: usa o proxy Vercel (token fica no servidor)
      url = new URL(this.proxyBase, location.origin);
      url.searchParams.set('path', path);
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    } else {
      // Local: chama direto com token do localStorage
      const token = CONFIG.API.FACEBOOK.TOKEN;
      if (!token) throw new Error('Token não configurado. Acesse Configurações.');
      url = new URL(`${CONFIG.API.FACEBOOK.BASE_URL}${path}`);
      url.searchParams.set('access_token', token);
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const res  = await fetch(url.toString());
    const json = await res.json();

    if (json.error) {
      // Proxy can return string errors (e.g. FACEBOOK_TOKEN not set, network failure)
      if (typeof json.error === 'string') throw new Error(json.error);
      const msg  = json.error.message || JSON.stringify(json.error);
      const code = json.error.code;
      if (code === 190) throw new Error('Token expirado ou inválido. Gere um novo token no Meta for Developers.');
      if (code === 100) throw new Error('Parâmetro inválido: ' + msg);
      if (code === 200 || code === 10) throw new Error('Permissão negada. Adicione ads_read e business_management ao token.');
      throw new Error(`Erro Facebook API (${code}): ${msg}`);
    }

    return json;
  },

  // ── Paginação automática ──────────────────────────────────────────────────────
  async paginate(path, params = {}) {
    let all  = [];
    let data = await this.request(path, params);
    all = all.concat(data.data || []);

    while (data.paging?.next) {
      const next     = new URL(data.paging.next);
      const nextPath = next.pathname.replace(`/${CONFIG.API.FACEBOOK.VERSION}`, '');
      const nextParams = {};
      next.searchParams.forEach((v, k) => {
        if (k !== 'access_token') nextParams[k] = v;
      });
      data = await this.request(nextPath, nextParams);
      all  = all.concat(data.data || []);
    }

    return all;
  },

  // ── Período ───────────────────────────────────────────────────────────────────
  periodToParams(period) {
    const map = {
      today:      'today',
      yesterday:  'yesterday',
      last_7d:    'last_7d',
      last_14d:   'last_14d',
      last_30d:   'last_30d',
      this_month: 'this_month',
      last_month: 'last_month',
    };
    return { date_preset: map[period] || 'last_30d' };
  },

  // ── Campos de insights ────────────────────────────────────────────────────────
  INSIGHT_FIELDS: [
    'spend', 'impressions', 'reach', 'clicks', 'ctr', 'cpc', 'cpm',
    'frequency', 'actions', 'cost_per_action_type', 'date_start', 'date_stop',
  ].join(','),

  // ── Converte linha de insight para formato interno ────────────────────────────
  parseInsightDay(raw) {
    const getAction = type => {
      const a = (raw.actions || []).find(x => x.action_type === type);
      return a ? parseFloat(a.value) : 0;
    };
    const getCost = type => {
      const a = (raw.cost_per_action_type || []).find(x => x.action_type === type);
      return a ? parseFloat(a.value) : 0;
    };

    const spend       = parseFloat(raw.spend || 0);
    const impressions = parseInt(raw.impressions || 0);
    const reach       = parseInt(raw.reach || 0);
    const link_clicks = parseInt(raw.clicks || 0);
    const frequency   = parseFloat(raw.frequency || 0);

    const leads =
      getAction('lead') ||
      getAction('offsite_conversion.fb_pixel_lead') ||
      getAction('onsite_conversion.lead_grouped') ||
      getAction('contact');

    const conversations =
      getAction('onsite_conversion.messaging_conversation_started_7d') ||
      getAction('onsite_conversion.messaging_first_reply');

    const cpl  = leads > 0 ? spend / leads : getCost('lead') || 0;
    const cpc_conv = conversations > 0 ? spend / conversations : 0;

    return {
      date:        raw.date_start,
      spend,
      impressions,
      reach,
      link_clicks,
      ctr:         parseFloat((link_clicks > 0 ? link_clicks / impressions * 100 : parseFloat(raw.ctr) || 0).toFixed(2)),
      cpc:         parseFloat(parseFloat(raw.cpc || 0).toFixed(2)),
      cpm:         parseFloat(parseFloat(raw.cpm || 0).toFixed(2)),
      frequency:   parseFloat(frequency.toFixed(2)),
      leads:       Math.round(leads),
      cpl:         parseFloat(cpl.toFixed(2)),
      conversations: Math.round(conversations),
      cost_per_conversation: parseFloat(cpc_conv.toFixed(2)),
      conversion_rate: link_clicks > 0
        ? parseFloat((leads / link_clicks * 100).toFixed(2))
        : 0,
    };
  },

  // ── 1. Contas do usuário + contas das BMs ─────────────────────────────────────
  async getAdAccounts() {
    // Contas pessoais do usuário
    const personal = await this.paginate('/me/adaccounts', {
      fields: 'id,name,currency,timezone_name,account_status,business',
      limit:  200,
    });

    // Contas das Business Managers que o usuário administra
    let bmAccounts = [];
    try {
      const businesses = await this.paginate('/me/businesses', {
        fields: 'id,name',
        limit:  50,
      });

      const bmPromises = businesses.map(bm =>
        this.paginate(`/${bm.id}/owned_ad_accounts`, {
          fields: 'id,name,currency,timezone_name,account_status',
          limit:  200,
        }).then(accounts => accounts.map(a => ({ ...a, _bm: bm.name })))
          .catch(() => [])
      );

      const clientPromises = businesses.map(bm =>
        this.paginate(`/${bm.id}/client_ad_accounts`, {
          fields: 'id,name,currency,timezone_name,account_status',
          limit:  200,
        }).then(accounts => accounts.map(a => ({ ...a, _bm: bm.name + ' (cliente)' })))
          .catch(() => [])
      );

      const all = await Promise.all([...bmPromises, ...clientPromises]);
      bmAccounts = all.flat();
    } catch (_) {
      // business_management não autorizado — ignora silenciosamente
    }

    // Unifica e remove duplicatas pelo ID
    const seen = new Set();
    return [...personal, ...bmAccounts]
      .filter(a => {
        if (seen.has(a.id)) return false;
        seen.add(a.id);
        return true;
      })
      .map(a => ({
        id:       a.id,
        name:     a.name,
        currency: a.currency || 'BRL',
        timezone: a.timezone_name || 'America/Sao_Paulo',
        status:   a.account_status === 1 ? 'ACTIVE' : 'DISABLED',
        bm:       a.business?.name || a._bm || null,
      }));
  },

  // ── 2. Campanhas de uma conta ─────────────────────────────────────────────────
  async getCampaigns(accountId) {
    const data = await this.paginate(`/${accountId}/campaigns`, {
      fields: 'id,name,status,objective,daily_budget,lifetime_budget',
      limit:  100,
    });
    return data.map(c => ({
      id:        c.id,
      name:      c.name,
      status:    c.status,
      objective: c.objective || '',
      budget:    parseFloat(c.daily_budget || c.lifetime_budget || 0) / 100,
      adSets:    [],
    }));
  },

  // ── 3. Insights diários de uma conta ─────────────────────────────────────────
  async getAccountInsights(accountId, period = 'last_30d') {
    const data = await this.paginate(`/${accountId}/insights`, {
      fields:         this.INSIGHT_FIELDS,
      time_increment: 1,
      level:          'account',
      limit:          50,
      ...this.periodToParams(period),
    });
    return data.map(d => this.parseInsightDay(d));
  },

  // ── 4. Insights por campanha ──────────────────────────────────────────────────
  async getCampaignInsights(accountId, period = 'last_30d') {
    const data = await this.paginate(`/${accountId}/insights`, {
      fields:         this.INSIGHT_FIELDS + ',campaign_id,campaign_name',
      time_increment: 1,
      level:          'campaign',
      limit:          100,
      ...this.periodToParams(period),
    });

    const byCampaign = {};
    data.forEach(row => {
      const id = row.campaign_id;
      if (!byCampaign[id]) byCampaign[id] = { id, name: row.campaign_name, daily: [] };
      byCampaign[id].daily.push(this.parseInsightDay(row));
    });

    return Object.values(byCampaign).map(c => ({
      ...c,
      totals: sumMetrics(c.daily),
    }));
  },

  // ── 5. Carrega cliente completo ───────────────────────────────────────────────
  async loadClientFromAccount(clientMeta, period = 'last_30d') {
    const accountId = clientMeta.adAccount.id;

    const [campaigns, dailyData, campInsights] = await Promise.all([
      this.getCampaigns(accountId),
      this.getAccountInsights(accountId, period),
      this.getCampaignInsights(accountId, period),
    ]);

    const enrichedCampaigns = campaigns.map(camp => {
      const ci = campInsights.find(x => x.id === camp.id);
      return { ...camp, daily: ci?.daily || [], totals: ci?.totals || sumMetrics([]) };
    });

    const daily30 = dailyData.slice(-30);
    const daily14 = dailyData.slice(-14);
    const daily7  = dailyData.slice(-7);

    return {
      ...clientMeta,
      campaigns: enrichedCampaigns,
      daily30, daily14, daily7,
      totals30: sumMetrics(daily30),
      totals14: sumMetrics(daily14),
      totals7:  sumMetrics(daily7),
      _loadedFromApi: true,
      _loadedAt: new Date().toISOString(),
    };
  },

  // ── 6. Verificar token ────────────────────────────────────────────────────────
  async verifyToken() {
    const data = await this.request('/me', { fields: 'id,name' });
    return { valid: true, name: data.name, id: data.id };
  },
};

// =============================================================================
// Loader principal
// =============================================================================

async function loadFacebookData(showNotifs = true) {
  if (CONFIG.API.MODE !== 'facebook') return;

  const isLocal  = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const hasToken = !!CONFIG.API.FACEBOOK.TOKEN;

  if (isLocal && !hasToken) {
    showNotification('⚠️ Token não configurado. Acesse Configurações.');
    return;
  }

  const btn = document.getElementById('fb-load-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader"></i> Sincronizando...'; lucide.createIcons(); }

  try {
    const me = await FB_API.verifyToken();
    if (showNotifs) showNotification(`✅ Conectado: ${me.name}`);

    // Busca todas as contas (pessoais + BMs)
    const accounts = await FB_API.getAdAccounts();
    const accountsEl = document.getElementById('fb-accounts-list');
    if (accountsEl) renderAccountsList(accounts);

    if (!accounts.length) {
      showNotification('⚠️ Nenhuma conta de anúncio encontrada.');
      return;
    }

    // Sincroniza clientes cadastrados
    const linked = STATE.clients.filter(c => c.adAccount?.id?.startsWith('act_'));
    if (!linked.length) {
      showNotification('ℹ️ Vincule uma conta de anúncio a um cliente em Configurações.');
      return;
    }

    let synced = 0;
    await Promise.all(linked.map(async client => {
      try {
        const updated = await FB_API.loadClientFromAccount(client, STATE.period);
        const idx = STATE.clients.findIndex(x => x.id === client.id);
        if (idx >= 0) STATE.clients[idx] = updated;
        synced++;
      } catch (e) {
        console.warn(`${client.name}:`, e.message);
        showNotification(`⚠️ ${client.name}: ${e.message}`);
      }
    }));

    if (synced > 0) {
      showNotification(`✅ ${synced} cliente(s) sincronizados`);
      navigate(STATE.view, STATE.clientId);
    }

  } catch (e) {
    showNotification(`❌ ${e.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="refresh-cw"></i> Sincronizar'; lucide.createIcons(); }
  }
}

async function linkAdAccount(clientId, accountId) {
  const client = STATE.clients.find(c => c.id === clientId);
  if (!client) return;
  try {
    const updated = await FB_API.loadClientFromAccount(
      { ...client, adAccount: { ...client.adAccount, id: accountId } },
      STATE.period
    );
    const idx = STATE.clients.findIndex(c => c.id === clientId);
    if (idx >= 0) STATE.clients[idx] = updated;
    showNotification(`✅ ${accountId} vinculada a ${client.name}`);
    navigate('client-detail', clientId);
  } catch (e) {
    showNotification(`❌ ${e.message}`);
  }
}

function renderAccountsList(accounts) {
  const el = document.getElementById('fb-accounts-list');
  if (!el || !accounts.length) return;

  // IDs already linked to a client
  const linkedIds = new Set(STATE.clients.map(c => c.adAccount?.id).filter(Boolean));

  el.innerHTML = `
    <p style="font-size:12px;color:var(--text-muted);margin-bottom:8px">${accounts.length} conta(s) encontrada(s)</p>
    <div class="accounts-table">
      <div class="accounts-header"><span>Conta</span><span>ID</span><span>BM</span><span>Status</span><span>Ação</span></div>
      ${accounts.map(a => {
        const already = linkedIds.has(a.id);
        const activeOnly = a.status === 'ACTIVE';
        return `
        <div class="accounts-row">
          <span style="font-weight:600;color:var(--text-primary)">${a.name}</span>
          <span style="font-size:11px;color:var(--text-muted)">${a.id}</span>
          <span style="font-size:11px;color:var(--text-muted)">${a.bm || '—'}</span>
          <span><span class="badge badge-${activeOnly ? 'active' : 'paused'}">${activeOnly ? 'Ativa' : 'Inativa'}</span></span>
          <span>
            ${already
              ? `<span style="font-size:11px;color:var(--green)">✓ Vinculada</span>`
              : `<button class="btn-primary" style="padding:4px 10px;font-size:11px"
                   onclick="importAccountAsClient('${a.id}','${a.name.replace(/'/g,'\\\'').replace(/"/g,'&quot;')}','${a.currency||'BRL'}')">
                   Importar
                 </button>`
            }
          </span>
        </div>`;
      }).join('')}
    </div>
    <p style="font-size:11px;color:var(--text-muted);margin-top:8px">
      Clique em <strong>Importar</strong> para criar um cliente real com os dados da conta.
      Clientes demo com IDs falsos <strong>não sincronizam</strong> — use
      <em>Configurações → Remover clientes demo</em> para limpá-los.
    </p>
  `;
}

async function importAccountAsClient(accountId, accountName, currency) {
  showNotification(`⏳ Importando ${accountName}...`);

  const initials = accountName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const palette  = ['#3b82f6','#10b981','#f59e0b','#ec4899','#6366f1','#14b8a6','#f97316','#8b5cf6'];
  const color    = palette[STATE.clients.length % palette.length];
  const id       = 'fb-' + accountId.replace('act_', '');

  // Remove any existing client with same account ID or same generated ID
  STATE.clients = STATE.clients.filter(c => c.adAccount?.id !== accountId && c.id !== id);

  const skeleton = {
    id, name: accountName, niche: 'Outro',
    status: 'active', boardStatus: 'active', platform: 'facebook',
    initials, color,
    adAccount: { id: accountId, name: accountName, currency: currency || 'BRL', status: 'ACTIVE' },
    budget: { monthly: 0, daily: 0 },
    contact: { name: '', email: '', phone: '' },
    startDate: new Date().toISOString().split('T')[0],
    notes: `Importado automaticamente da conta ${accountId}`,
    campaigns: [],
    daily30: [], daily14: [], daily7: [],
    totals30: sumMetrics([]), totals14: sumMetrics([]), totals7: sumMetrics([]),
  };

  try {
    const updated = await FB_API.loadClientFromAccount(skeleton, STATE.period);
    STATE.clients.push(updated);
    showNotification(`✅ ${accountName} importada com dados reais!`);
    renderAccountsList(await FB_API.getAdAccounts());
    navigate('client-detail', id);
  } catch (e) {
    showNotification(`❌ Erro ao importar ${accountName}: ${e.message}`);
  }
}
