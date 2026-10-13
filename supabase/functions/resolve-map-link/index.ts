// Resolve links de localização do Google Maps (inclusive os curtos) para latitude/longitude.
// Só segue redirecionamentos entre hosts do Google (lista permitida) para evitar abuso (SSRF).
const ALLOWED = new Set(['maps.app.goo.gl', 'goo.gl', 'g.co', 'google.com', 'www.google.com', 'google.com.br', 'www.google.com.br', 'maps.google.com', 'maps.google.com.br', 'consent.google.com'])
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const ok = (la: string, ln: string) => {
  const lat = Number(la), lng = Number(ln)
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0) ? { lat, lng } : null
}

function parse(input: string) {
  const s = input.replace(/%2C/gi, ',').replace(/%40/g, '@').replace(/%21/g, '!').replace(/%3D/gi, '=')
    .replace(/&amp;/g, '&').replace(/\\u003d/g, '=').replace(/\\u0026/g, '&')
  let m = s.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/); if (m) return ok(m[1], m[2])
  m = s.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/); if (m) return ok(m[1], m[2])
  m = s.match(/[?&;](?:q|ll|query|destination|center)=(?:loc:)?(-?\d{1,2}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/); if (m) return ok(m[1], m[2])
  m = s.match(/APP_INITIALIZATION_STATE\s*=\s*\[\[\[[\d.eE+-]+,(-?\d{1,3}\.\d+),(-?\d{1,2}\.\d+)\]/); if (m) return ok(m[2], m[1])
  m = s.match(/\[null,null,(-?\d{1,2}\.\d{4,}),(-?\d{1,3}\.\d{4,})\]/); if (m) return ok(m[1], m[2])
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const trail: string[] = []
  try {
    const { url } = await req.json()
    let cur = new URL(String(url))
    for (let i = 0; i < 6; i++) {
      trail.push(cur.hostname)
      if (cur.protocol !== 'https:' || !ALLOWED.has(cur.hostname)) return json({ error: 'host_not_allowed', trail }, 400)
      const direct = parse(cur.toString())
      if (direct) return json(direct)
      const r = await fetch(cur, { redirect: 'manual', headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'pt-BR,pt;q=0.9' } })
      const loc = r.headers.get('location')
      if (loc) { cur = new URL(loc, cur); continue }
      const body = (await r.text()).slice(0, 400000)
      const found = parse(body)
      if (found) return json(found)
      const refresh = body.match(/http-equiv=["']refresh["'][^>]*url=([^"'>\s]+)/i)?.[1]
      if (refresh) { cur = new URL(refresh.replace(/&amp;/g, '&'), cur); continue }
      console.log(JSON.stringify({ no_coords: true, trail, status: r.status, len: body.length, init: body.includes('APP_INITIALIZATION_STATE'), staticmap: body.includes('staticmap'), center: body.includes('center='), consent: cur.hostname.includes('consent') }))
      return json({ error: 'no_coords', trail, status: r.status }, 404)
    }
    return json({ error: 'too_many_redirects', trail }, 400)
  } catch (e) {
    console.log(String(e))
    return json({ error: 'bad_request' }, 400)
  }
})
