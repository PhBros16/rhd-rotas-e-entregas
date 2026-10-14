// Geocodifica endereços do Grande Recife com o Nominatim (OpenStreetMap).
// Recebe só rua, número, bairro e cidade (nunca nome ou telefone do cliente).
const UA = 'RHD-Rotas-e-Entregas/1.0 (+https://github.com/PhBros16/rhd-rotas-e-entregas)'
const BOX = { minLat: -8.6, maxLat: -7.7, minLng: -35.5, maxLng: -34.8 }
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { ...CORS, 'Content-Type': 'application/json' } })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
let last = 0

type Item = { id: string; street?: string | null; number?: string | null; neighborhood?: string | null; city?: string | null }
type Quality = 'house' | 'street' | 'neighborhood' | 'city'
type Hit = { lat: number; lng: number; quality: Quality; rank: number }
const RANK: Record<Quality, number> = { house: 4, street: 3, neighborhood: 2, city: 1 }

class RateLimited extends Error {}

// deno-lint-ignore no-explicit-any
function classify(r: any): Quality {
  const t = String(r.addresstype ?? r.type ?? '')
  const cat = String(r.category ?? r.class ?? '')
  if (r.address?.house_number || t === 'house' || t === 'building') return 'house'
  if (t === 'road' || cat === 'highway') return 'street'
  if (['suburb', 'neighbourhood', 'quarter', 'city_district', 'borough'].includes(t)) return 'neighborhood'
  if (['city', 'town', 'village', 'municipality', 'county', 'state'].includes(t)) return 'city'
  return ['amenity', 'shop', 'office', 'craft', 'tourism', 'leisure'].includes(cat) ? 'house' : 'street'
}

async function search(q: string, city: string): Promise<Hit | null> {
  const wait = 1100 - (Date.now() - last)
  if (wait > 0) await sleep(wait)
  last = Date.now()
  const params = new URLSearchParams({
    format: 'jsonv2', limit: '1', countrycodes: 'br', addressdetails: '1', bounded: '1', q,
    viewbox: `${BOX.minLng},${BOX.maxLat},${BOX.maxLng},${BOX.minLat}`,
  })
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { 'user-agent': UA, 'accept-language': 'pt-BR' } })
  if (r.status === 429 || r.status === 403) throw new RateLimited()
  if (!r.ok) return null
  const j = await r.json()
  const x = j?.[0]
  if (!x) return null
  const lat = Number(x.lat), lng = Number(x.lon)
  if (!(lat >= BOX.minLat && lat <= BOX.maxLat && lng >= BOX.minLng && lng <= BOX.maxLng)) return null
  // descarta rua homônima de outra cidade: o nome da cidade precisa aparecer no resultado
  if (!norm(String(x.display_name ?? '')).includes(norm(city))) return null
  const quality = classify(x)
  return { lat, lng, quality, rank: RANK[quality] }
}

async function one(it: Item) {
  const city = it.city || 'Recife'
  const hood = it.neighborhood || ''
  const street = it.street || ''
  const num = it.number || ''
  const tail = [city, 'Pernambuco', 'Brasil']
  const tries: string[] = []
  if (street) {
    if (/\d/.test(num)) tries.push([`${street}, ${num}`, hood, ...tail].filter(Boolean).join(', '))
    tries.push([street, hood, ...tail].filter(Boolean).join(', '))
  }
  if (hood) tries.push([hood, ...tail].join(', '))
  tries.push(tail.join(', '))
  let best: Hit | null = null
  for (const q of tries) {
    const h = await search(q, city)
    if (h && (!best || h.rank > best.rank)) best = h
    if (best && best.rank >= 3) break
  }
  return best ? { id: it.id, lat: best.lat, lng: best.lng, quality: best.quality } : { id: it.id, quality: 'none' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const results: unknown[] = []
  try {
    const { items } = await req.json()
    for (const it of (items as Item[]).slice(0, 5)) results.push(await one(it))
    return json({ results })
  } catch (e) {
    if (e instanceof RateLimited) return json({ results, error: 'rate_limited' })
    console.log(String(e))
    return json({ results, error: 'bad_request' })
  }
})
