// =============================================================================
// Vercel Serverless Function — Proxy seguro para Facebook Graph API
// Token armazenado em FACEBOOK_TOKEN (variável de ambiente do Vercel)
// =============================================================================

const FB_BASE = 'https://graph.facebook.com/v21.0';

// Vercel Edge/Node — usa CommonJS para máxima compatibilidade
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Método não permitido' });

  const token = process.env.FACEBOOK_TOKEN;
  if (!token) {
    return res.status(500).json({
      error: 'FACEBOOK_TOKEN não configurado. Adicione a variável de ambiente no painel do Vercel.',
    });
  }

  const { path, ...params } = req.query;
  if (!path) return res.status(400).json({ error: 'Parâmetro ?path= obrigatório' });

  // Bloqueia paths suspeitos
  if (!path.startsWith('/')) return res.status(400).json({ error: 'Path inválido' });

  try {
    const url = new URL(`${FB_BASE}${path}`);
    url.searchParams.set('access_token', token);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

    const fbRes = await fetch(url.toString());
    const data  = await fbRes.json();

    if (data.error) {
      const code = data.error.code;
      const msg  = data.error.message;
      // Token expirado
      if (code === 190) return res.status(401).json({ error: { code, message: 'Token expirado ou inválido. Atualize a variável FACEBOOK_TOKEN no Vercel.' } });
      return res.status(400).json({ error: data.error });
    }

    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
