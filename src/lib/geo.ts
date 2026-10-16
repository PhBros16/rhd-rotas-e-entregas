import { supabase } from './supabase'
import { refresh } from './routes'
import { norm } from './format'

export type GeoQuality = 'house' | 'street' | 'neighborhood' | 'city' | 'none'
export const qualityLabel: Record<string, string> = { house: 'Endereço exato', street: 'Rua', neighborhood: 'Só o bairro', city: 'Só a cidade', none: 'Não localizado' }
export const isGood = (q: string | null | undefined) => q === 'house' || q === 'street'

async function openRouteIds() {
  const { data } = await supabase.from('routes').select('id').in('status', ['draft', 'active'])
  return (data ?? []).map(r => r.id as string)
}
async function pushToPending(clientId: string, fields: Record<string, unknown>, routeIds: string[]) {
  if (!routeIds.length) return
  await supabase.from('route_stops').update(fields).eq('client_id', clientId).eq('status', 'pending').in('route_id', routeIds)
}

/** Leva a edição de um cliente (nome, telefone, endereço, localização) às paradas pendentes de rotas abertas. */
export async function propagateClient(clientId: string) {
  const { data: c } = await supabase.from('clients').select('*').eq('id', clientId).single()
  if (!c) return
  await pushToPending(clientId, {
    client_name: c.name, phone: c.phone, client_notes: c.notes, neighborhood: c.neighborhood, city: c.city,
    address: [c.street, c.number, c.complement].filter(Boolean).join(', ') || null, lat: c.lat, lng: c.lng, geo_quality: c.geo_quality,
  }, await openRouteIds())
}

/* ---------- localização de endereços feita pelo próprio aparelho (cada pessoa usa a sua internet) ---------- */
const BOX = { minLat: -8.6, maxLat: -7.7, minLng: -35.5, maxLng: -34.8 } // Grande Recife
const RANK = { house: 4, street: 3, neighborhood: 2, city: 1 } as const
type Q = keyof typeof RANK
type Hit = { lat: number; lng: number; quality: Q; rank: number }
type Probe = { hit: Hit | null; blocked: boolean }
type Counter = { ok: number; none: number; blocked: number }
const inBox = (lat: number, lng: number) => lat >= BOX.minLat && lat <= BOX.maxLat && lng >= BOX.minLng && lng <= BOX.maxLng
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let lastCall = 0
async function throttle() { const w = 1100 - (Date.now() - lastCall); if (w > 0) await sleep(w); lastCall = Date.now() }
const none: Probe = { hit: null, blocked: false }, blockedProbe: Probe = { hit: null, blocked: true }

function qNominatim(x: Record<string, unknown> & { address?: { house_number?: string } }): Q {
  const t = String(x.addresstype ?? x.type ?? ''), cat = String(x.category ?? x.class ?? '')
  if (x.address?.house_number || t === 'house' || t === 'building') return 'house'
  if (t === 'road' || cat === 'highway') return 'street'
  if (['suburb', 'neighbourhood', 'quarter', 'city_district', 'borough'].includes(t)) return 'neighborhood'
  if (['city', 'town', 'village', 'municipality', 'county', 'state'].includes(t)) return 'city'
  return ['amenity', 'shop', 'office', 'craft', 'tourism', 'leisure'].includes(cat) ? 'house' : 'street'
}
async function viaNominatim(q: string, city: string): Promise<Probe> {
  await throttle()
  try {
    const params = new URLSearchParams({ format: 'jsonv2', limit: '1', countrycodes: 'br', addressdetails: '1', bounded: '1', q, 'accept-language': 'pt-BR',
      viewbox: `${BOX.minLng},${BOX.maxLat},${BOX.maxLng},${BOX.minLat}` })
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`)
    if (r.status === 429 || r.status === 403 || r.status >= 500) return blockedProbe
    if (!r.ok) return none
    const x = (await r.json())?.[0]
    if (!x) return none
    const lat = Number(x.lat), lng = Number(x.lon)
    if (!inBox(lat, lng) || !norm(String(x.display_name ?? '')).includes(norm(city))) return none // descarta rua homônima de outra cidade
    const quality = qNominatim(x)
    return { hit: { lat, lng, quality, rank: RANK[quality] }, blocked: false }
  } catch { return blockedProbe }
}
async function viaPhoton(q: string, city: string): Promise<Probe> {
  await throttle()
  try {
    const params = new URLSearchParams({ q, limit: '1', bbox: `${BOX.minLng},${BOX.minLat},${BOX.maxLng},${BOX.maxLat}` })
    const r = await fetch(`https://photon.komoot.io/api/?${params}`)
    if (r.status === 429 || r.status === 403 || r.status >= 500) return blockedProbe
    if (!r.ok) return none
    const f = (await r.json())?.features?.[0]
    if (!f) return none
    const [lng, lat] = f.geometry.coordinates as [number, number], p = (f.properties ?? {}) as Record<string, string | undefined>
    if (!inBox(lat, lng) || !norm([p.city, p.county, p.district, p.locality, p.name, p.state].filter(Boolean).join(' ')).includes(norm(city))) return none
    const quality: Q = p.housenumber || p.type === 'house' ? 'house'
      : p.osm_key === 'highway' || p.type === 'street' ? 'street'
      : ['suburb', 'neighbourhood', 'quarter', 'city_district', 'borough'].includes(p.osm_value ?? '') || p.type === 'district' || p.type === 'locality' ? 'neighborhood'
      : p.type === 'city' || p.type === 'county' || ['city', 'town', 'village', 'municipality', 'county', 'state'].includes(p.osm_value ?? '') ? 'city' : 'street'
    return { hit: { lat, lng, quality, rank: RANK[quality] }, blocked: false }
  } catch { return blockedProbe }
}

type Addr = { id: string; street: string | null; number: string | null; neighborhood: string | null; city: string | null }
async function geocodeOne(it: Addr, nom: Counter, pho: Counter): Promise<{ hit: Hit | null; status: 'found' | 'none' | 'blocked' }> {
  const city = it.city || 'Recife', hood = it.neighborhood || '', street = it.street || '', num = it.number || ''
  const tail = [city, 'Pernambuco', 'Brasil'], tries: string[] = []
  if (street) {
    if (/\d/.test(num)) tries.push([`${street}, ${num}`, hood, ...tail].filter(Boolean).join(', '))
    tries.push([street, hood, ...tail].filter(Boolean).join(', '))
  }
  if (hood) tries.push([hood, ...tail].join(', '))
  tries.push(tail.join(', '))
  let best: Hit | null = null, answered = false
  const count = (c: Counter, p: Probe) => { if (p.blocked) c.blocked++; else if (p.hit) c.ok++; else c.none++ }
  for (const q of tries) {
    const a = await viaNominatim(q, city); count(nom, a)
    if (!a.blocked) answered = true
    if (a.hit && (!best || a.hit.rank > best.rank)) best = a.hit
    if (best && best.rank >= 3) break
    const b = await viaPhoton(q, city); count(pho, b) // segundo serviço: reserva quando o primeiro recusa ou não acha
    if (!b.blocked) answered = true
    if (b.hit && (!best || b.hit.rank > best.rank)) best = b.hit
    if (best && best.rank >= 3) break
  }
  return best ? { hit: best, status: 'found' } : { hit: null, status: answered ? 'none' : 'blocked' }
}

export async function geocodeClients(ids: string[], onProgress?: (done: number, total: number) => void) {
  let ok = 0, failed = 0, blocked = 0
  const nom: Counter = { ok: 0, none: 0, blocked: 0 }, pho: Counter = { ok: 0, none: 0, blocked: 0 }
  if (!ids.length) return { ok, failed, blocked, info: '' }
  const { data: cs } = await supabase.from('clients').select('id, street, number, neighborhood, city').in('id', ids)
  const list = (cs ?? []) as Addr[], routeIds = await openRouteIds()
  for (let i = 0; i < list.length; i++) {
    const r = await geocodeOne(list[i], nom, pho)
    if (r.status === 'blocked') blocked++ // não grava nada: tenta de novo depois
    else {
      const patch = { lat: r.hit?.lat ?? null, lng: r.hit?.lng ?? null, geo_quality: r.hit?.quality ?? 'none', geo_at: new Date().toISOString() }
      const { error: e } = await supabase.from('clients').update(patch).eq('id', list[i].id)
      if (e) failed++
      else { await pushToPending(list[i].id, { lat: patch.lat, lng: patch.lng, geo_quality: patch.geo_quality }, routeIds); if (r.hit) ok++; else failed++ }
    }
    onProgress?.(i + 1, list.length)
  }
  const fmt = (n: string, c: Counter) => `${n}: ${c.ok} acharam, ${c.none} sem resultado, ${c.blocked} recusadas`
  return { ok, failed, blocked, info: `${fmt('OpenStreetMap', nom)} · ${fmt('Photon', pho)}` }
}

/** Depois de salvar um cliente: atualiza as paradas abertas, localiza o endereço (se mudou) e baixa a rota atualizada. */
export async function afterClientSave(id: string, needsGeo: boolean) {
  try {
    await propagateClient(id)
    if (needsGeo) await geocodeClients([id])
    await refresh()
  } catch { /* sem internet: a próxima abertura tenta de novo */ }
}
