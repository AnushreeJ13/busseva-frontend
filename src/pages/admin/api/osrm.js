// api/osrm.js  (Vercel Function)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const coords = req.query.coords;
    if (!coords) return res.status(400).json({ error: 'coords required (lon1,lat1;lon2,lat2)' });

    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=polyline&alternatives=false&steps=false`;
    const r = await fetch(osrmUrl, { cache: 'no-store' });
    const body = await r.text();
    res.setHeader('Content-Type', 'application/json');
    res.status(r.status).send(body);
  } catch {
    res.status(502).json({ error: 'OSRM upstream failed' });
  }
}
