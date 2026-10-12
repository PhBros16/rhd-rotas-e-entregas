// Resolve links de localização do Google Maps (inclusive os curtos) para latitude/longitude.
// Só segue redirecionamentos entre hosts do Google (lista permitida) para evitar abuso (SSRF).
const ALLOWED = new Set(['maps.app.goo.gl', 'goo.gl', 'g.co', 'google.com', 'www.google.com', 'maps.google.com', 'consent.google.com'])
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

function parse(input: string) {
  let s = input
  try { s = decodeURIComponent(input) } catch { /* mantém */ }
  const pats = [
    /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,
    /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/,
    /[?&](?:q|ll|query|destination|center)=(?:loc:)?(-?\d{1,3}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/,
  ]
  for (const p of pats) {
    const m = s.match(p)
    if (m) {
      const lat = Number(m[1]), lng = Number(m[2])
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng }
    }
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { url } = await req.json()
    let cur = new URL(String(url))
    for (let i = 0; i < 6; i++) {
      if (cur.protocol !== 'https:' || !ALLOWED.has(cur.hostname)) return json({ error: 'host_not_allowed' }, 400)
      const direct = parse(cur.toString())
      if (direct) return json(direct)
      const r = await fetch(cur, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (compatible; RHD/1.0)' } })
      const loc = r.headers.get('location')
      if (!loc) {
        const body = (await r.text()).slice(0, 200000)
        const fromBody = parse(body)
        return fromBody ? json(fromBody) : json({ error: 'no_coords' }, 404)
      }
      cur = new URL(loc, cur)
    }
    return json({ error: 'too_many_redirects' }, 400)
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
})
