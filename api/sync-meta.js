// Cron job: busca todas as contas + insights e salva no Vercel Blob
const { put } = require('@vercel/blob');

const FB = 'https://graph.facebook.com/v21.0';
const TOKEN = process.env.META_TOKEN;
const BLOB_KEY = 'dashboard-data.json';

async function fbGet(path, params = {}) {
  const url = new URL(`${FB}${path}`);
  url.searchParams.set('access_token', TOKEN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json;
}

// Pagina automaticamente
async function fbAll(path, params = {}) {
  let items = [];
  let data = await fbGet(path, { ...params, limit: 200 });
  items = items.concat(data.data || []);
  while (data.paging?.next) {
    const next = new URL(data.paging.next);
    const p = {};
    next.searchParams.forEach((v, k) => { if (k !== 'access_token') p[k] = v; });
    const np = next.pathname.replace(`/v21.0`, '');
    data = await fbGet(np, p);
    items = items.concat(data.data || []);
  }
  return items;
}

async function getAccounts() {
  const personal = await fbAll('/me/adaccounts', {
    fields: 'id,name,currency,account_status',
  });

  let bm = [];
  try {
    const businesses = await fbAll('/me/businesses', { fields: 'id,name' });
    const results = await Promise.allSettled(
      businesses.flatMap(b => [
        fbAll(`/${b.id}/owned_ad_accounts`, { fields: 'id,name,currency,account_status' }),
        fbAll(`/${b.id}/client_ad_accounts`, { fields: 'id,name,currency,account_status' }),
      ])
    );
    bm = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  } catch (_) {}

  // Deduplica por ID
  const seen = new Set();
  return [...personal, ...bm].filter(a => seen.has(a.id) ? false : seen.add(a.id));
}

async function getInsights(accountId) {
  try {
    const data = await fbGet(`/${accountId}/insights`, {
      fields: 'spend,impressions,reach,clicks,cpc,cpm,actions',
      date_preset: 'last_30d',
      level: 'account',
    });
    const row = data.data?.[0] || {};
    const results = (row.actions || []).find(a =>
      ['lead', 'offsite_conversion.fb_pixel_lead', 'onsite_conversion.lead_grouped'].includes(a.action_type)
    );
    return {
      spend:       parseFloat(row.spend || 0),
      impressions: parseInt(row.impressions || 0),
      reach:       parseInt(row.reach || 0),
      clicks:      parseInt(row.clicks || 0),
      cpc:         parseFloat(row.cpc || 0),
      cpm:         parseFloat(row.cpm || 0),
      results:     results ? parseInt(results.value) : 0,
    };
  } catch (_) {
    return { spend: 0, impressions: 0, reach: 0, clicks: 0, cpc: 0, cpm: 0, results: 0 };
  }
}

module.exports = async function handler(req, res) {
  // Aceita POST do cron do Vercel ou GET com header de autorização
  const authHeader = req.headers.authorization;
  if (req.method === 'GET' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!TOKEN) return res.status(500).json({ error: 'META_TOKEN não configurado' });

  try {
    const accounts = await getAccounts();

    const enriched = await Promise.all(
      accounts
        .filter(a => a.account_status === 1) // apenas contas ativas
        .map(async a => ({
          id:       a.id,
          name:     a.name,
          currency: a.currency || 'BRL',
          metrics:  await getInsights(a.id),
        }))
    );

    const payload = {
      updated_at: new Date().toISOString(),
      accounts:   enriched,
    };

    await put(BLOB_KEY, JSON.stringify(payload), {
      access: 'public',
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    return res.status(200).json({ ok: true, accounts: enriched.length, updated_at: payload.updated_at });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
