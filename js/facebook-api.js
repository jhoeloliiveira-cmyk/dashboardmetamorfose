// =============================================================================
// TrafficFlow — Facebook Ads Graph API Integration
// Token: NUNCA armazenado aqui. Carregado via CONFIG.API.FACEBOOK.TOKEN (localStorage)
// =============================================================================

const FB_API = {

  // ── Request helper ───────────────────────────────────────────────────────────
  async request(path, params = {}) {
    const token = CONFIG.API.FACEBOOK.TOKEN;
    if (!token) throw new Error('Token do Facebook não configurado. Acesse Configurações.');

    const url = new URL(`${CONFIG.API.FACEBOOK.BASE_URL}${path}`);
    url.searchParams.set('access_token', token);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const res = await fetch(url.toString());
    const json = await res.json();

    if (json.error) {
      const msg = json.error.message || 'Erro desconhecido da API do Facebook';
      const code = json.error.code;
      if (code === 190) throw new Error('Token expirado ou inválido. Atualize nas Configurações.');
      if (code === 100) throw new Error('Parâmetro inválido: ' + msg);
      if (code === 200 || code === 10) throw new Error('Permissão negada. O token precisa da permissão ads_read.');
      throw new Error(`API Facebook (${code}): ${msg}`);
    }

    return json;
  },

  // ── Paginação automática ─────────────────────────────────────────────────────
  async paginate(path, params = {}) {
    let all = [];
    let data = await this.request(path, params);
    all = all.concat(data.data || []);
    while (data.paging?.next) {
      const next = new URL(data.paging.next);
      const nextPath = next.pathname.replace(`/${CONFIG.API.FACEBOOK.VERSION}`, '');
      const nextParams = {};
      next.searchParams.forEach((v, k) => { if (k !== 'access_token') nextParams[k] = v; });
      data = await this.request(nextPath, nextParams);
      all = all.concat(data.data || []);
    }
    return all;
  },

  // ── Período → date_preset ou time_range ─────────────────────────────────────
  periodToParams(period) {
    const presets = {
      today:       'today',
      yesterday:   'yesterday',
      last_7d:     'last_7_d',
      last_14d:    'last_14_d',
      last_30d:    'last_30_d',
      this_month:  'this_month',
      last_month:  'last_month',
    };
    if (presets[period]) return { date_preset: presets[period] };
    return { date_preset: 'last_30_d' };
  },

  // ── Campos de insights ───────────────────────────────────────────────────────
  INSIGHT_FIELDS: [
    'spend',
    'impressions',
    'reach',
    'clicks',
    'ctr',
    'cpc',
    'cpm',
    'frequency',
    'actions',
    'cost_per_action_type',
    'date_start',
    'date_stop',
  ].join(','),

  // ── Converte resposta de insights para o formato interno ──────────────────────
  parseInsightDay(raw) {
    const getAction = (type) => {
      const a = (raw.actions || []).find(x => x.action_type === type);
      return a ? parseFloat(a.value) : 0;
    };
    const getCost = (type) => {
      const a = (raw.cost_per_action_type || []).find(x => x.action_type === type);
      return a ? parseFloat(a.value) : 0;
    };

    const spend       = parseFloat(raw.spend || 0);
    const impressions = parseInt(raw.impressions || 0);
    const reach       = parseInt(raw.reach || 0);
    const link_clicks = parseInt(raw.clicks || 0);
    const ctr         = parseFloat(raw.ctr || 0);
    const cpc         = parseFloat(raw.cpc || 0);
    const cpm         = parseFloat(raw.cpm || 0);
    const frequency   = parseFloat(raw.frequency || 0);

    // Leads: lead form submissions ou pixel lead event
    const leads = getAction('lead') ||
                  getAction('offsite_conversion.fb_pixel_lead') ||
                  getAction('onsite_conversion.lead_grouped');

    const cpl = leads > 0 ? spend / leads : getCost('lead') || 0;

    // Conversas iniciadas no Messenger/WhatsApp
    const conversations =
      getAction('onsite_conversion.messaging_conversation_started_7d') ||
      getAction('onsite_conversion.messaging_first_reply');

    const cost_per_conversation = conversations > 0 ? spend / conversations : 0;

    return {
      date: raw.date_start,
      spend,
      impressions,
      reach,
      link_clicks,
      ctr:  parseFloat(ctr.toFixed(2)),
      cpc:  parseFloat(cpc.toFixed(2)),
      cpm:  parseFloat(cpm.toFixed(2)),
      frequency: parseFloat(frequency.toFixed(2)),
      leads: Math.round(leads),
      cpl:  parseFloat(cpl.toFixed(2)),
      conversations: Math.round(conversations),
      cost_per_conversation: parseFloat(cost_per_conversation.toFixed(2)),
      conversion_rate: link_clicks > 0 ? parseFloat((leads / link_clicks * 100).toFixed(2)) : 0,
    };
  },

  // ── 1. Buscar todas as contas de anúncio do token ────────────────────────────
  async getAdAccounts() {
    const data = await this.paginate('/me/adaccounts', {
      fields: 'id,name,currency,timezone_name,account_status,business',
    });
    return data.map(acc => ({
      id:       acc.id,
      name:     acc.name,
      currency: acc.currency || 'BRL',
      timezone: acc.timezone_name || 'America/Sao_Paulo',
      status:   acc.account_status === 1 ? 'ACTIVE' : 'DISABLED',
      business: acc.business?.name || null,
    }));
  },

  // ── 2. Buscar campanhas de uma conta ─────────────────────────────────────────
  async getCampaigns(accountId) {
    const data = await this.paginate(`/${accountId}/campaigns`, {
      fields: 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time',
      limit: 100,
    });
    return data.map(c => ({
      id:        c.id,
      name:      c.name,
      status:    c.status,
      objective: c.objective || '',
      budget:    parseFloat(c.daily_budget || c.lifetime_budget || 0) / 100,
    }));
  },

  // ── 3. Insights diários de uma conta (período) ──────────────────────────────
  async getAccountInsights(accountId, period = 'last_30d') {
    const periodParams = this.periodToParams(period);
    const data = await this.paginate(`/${accountId}/insights`, {
      fields: this.INSIGHT_FIELDS,
      time_increment: 1,
      level: 'account',
      limit: 50,
      ...periodParams,
    });
    return data.map(d => this.parseInsightDay(d));
  },

  // ── 4. Insights diários por campanha ────────────────────────────────────────
  async getCampaignInsights(accountId, period = 'last_30d') {
    const periodParams = this.periodToParams(period);
    const data = await this.paginate(`/${accountId}/insights`, {
      fields: this.INSIGHT_FIELDS + ',campaign_id,campaign_name',
      time_increment: 1,
      level: 'campaign',
      limit: 100,
      ...periodParams,
    });

    // Agrupar por campanha
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

  // ── 5. Carregar cliente completo a partir de uma conta de anúncio ────────────
  async loadClientFromAccount(clientMeta, period = 'last_30d') {
    const accountId = clientMeta.adAccount.id;

    // Paralelo: campanhas + insights diários da conta
    const [campaigns, dailyData, campInsights] = await Promise.all([
      this.getCampaigns(accountId),
      this.getAccountInsights(accountId, period),
      this.getCampaignInsights(accountId, period),
    ]);

    // Mescla campanhas com seus insights
    const enrichedCampaigns = campaigns.map(camp => {
      const ci = campInsights.find(x => x.id === camp.id);
      return {
        ...camp,
        daily:  ci?.daily  || [],
        totals: ci?.totals || sumMetrics([]),
        adSets: [],
      };
    });

    // Fatias de período
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

  // ── 6. Verificar token e permissões ─────────────────────────────────────────
  async verifyToken() {
    const data = await this.request('/me', { fields: 'id,name' });
    return { valid: true, name: data.name, id: data.id };
  },
};

// =============================================================================
// Facebook API Data Loader — integrado ao STATE
// =============================================================================

async function loadFacebookData(showNotifs = true) {
  if (CONFIG.API.MODE !== 'facebook') return;
  if (!CONFIG.API.FACEBOOK.TOKEN) {
    showNotification('⚠️ Token do Facebook não configurado. Acesse Configurações.');
    return;
  }

  const btn = document.getElementById('fb-load-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Carregando...'; }

  try {
    // Verificar token
    const me = await FB_API.verifyToken();
    if (showNotifs) showNotification(`✅ Conectado como: ${me.name}`);

    // Buscar contas de anúncio
    const accounts = await FB_API.getAdAccounts();
    if (!accounts.length) {
      showNotification('⚠️ Nenhuma conta de anúncio encontrada para este token.');
      return;
    }

    // Atualizar lista de contas nas configurações
    const accountsEl = document.getElementById('fb-accounts-list');
    if (accountsEl) renderAccountsList(accounts);

    // Para cada cliente cadastrado que tem um adAccount.id real, buscar dados
    const loadPromises = STATE.clients
      .filter(c => c.adAccount.id && c.adAccount.id.startsWith('act_'))
      .map(async (client) => {
        try {
          const updated = await FB_API.loadClientFromAccount(client, STATE.period);
          // Substituir no STATE
          const idx = STATE.clients.findIndex(x => x.id === client.id);
          if (idx >= 0) STATE.clients[idx] = updated;
          return updated;
        } catch (e) {
          console.warn(`Erro ao carregar ${client.name}:`, e.message);
          return client;
        }
      });

    await Promise.all(loadPromises);

    if (showNotifs) showNotification(`✅ ${STATE.clients.length} cliente(s) sincronizados com Facebook Ads`);

    // Re-renderizar view atual
    navigate(STATE.view, STATE.clientId);

  } catch (e) {
    showNotification(`❌ ${e.message}`);
    console.error('Facebook API Error:', e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Sincronizar'; }
  }
}

// Adiciona conta de anúncio a um cliente existente
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
    showNotification(`✅ Conta ${accountId} vinculada a ${client.name}`);
    navigate('client-detail', clientId);
  } catch (e) {
    showNotification(`❌ Erro: ${e.message}`);
  }
}

// Renderiza lista de contas disponíveis no painel de configurações
function renderAccountsList(accounts) {
  const el = document.getElementById('fb-accounts-list');
  if (!el) return;
  el.innerHTML = `
    <div class="accounts-table">
      <div class="accounts-header">
        <span>Conta</span><span>ID</span><span>Moeda</span><span>Status</span>
      </div>
      ${accounts.map(a => `
        <div class="accounts-row">
          <span>${a.name}</span>
          <span class="text-muted" style="font-size:11px">${a.id}</span>
          <span>${a.currency}</span>
          <span><span class="badge badge-${a.status === 'ACTIVE' ? 'active' : 'paused'}">${a.status === 'ACTIVE' ? 'Ativa' : 'Inativa'}</span></span>
        </div>
      `).join('')}
    </div>
  `;
}
