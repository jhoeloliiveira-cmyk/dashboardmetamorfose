// Retorna o JSON salvo no Vercel Blob
const { list, head } = require('@vercel/blob');

const BLOB_KEY = 'dashboard-data.json';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600'); // CDN cache 1h

  try {
    const { blobs } = await list({ token: process.env.BLOB_READ_WRITE_TOKEN });
    const blob = blobs.find(b => b.pathname === BLOB_KEY);

    if (!blob) {
      return res.status(404).json({ error: 'Dados ainda não sincronizados. Chame /api/sync-meta primeiro.' });
    }

    const fetched = await fetch(blob.url);
    const data = await fetched.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
