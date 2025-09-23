// api/osrm.js  (Vercel Function for Vite app)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { coords } = req.query;
    if (!coords) return res.status(400).json({ error: 'coords required' });

    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=polyline&alternatives=false&steps=false`;
    const r = await fetch(url);
    const body = await r.text();
    res.status(r.status).setHeader('Content-Type', 'application/json').send(body);
  } catch {
    res.status(502).json({ error: 'OSRM upstream failed' });
  }
}
