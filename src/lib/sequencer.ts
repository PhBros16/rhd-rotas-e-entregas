export type Pt = { lat: number; lng: number }
export type Item = Pt & { id: string; hood?: string | null }
export type Stoplike = { id: string; lat: number | null; lng: number | null; hood: string | null }

/** Premissas da estimativa (ajustáveis depois com o histórico real das rotas). */
export const ROAD_FACTOR = 1.35 // distância pelas ruas ≈ linha reta × 1,35
export const SPEED_KMH = 25
export const DWELL_MIN = 7 // tempo parado por entrega (5 a 10 min, informado pela operação)
export const HOOD_PENALTY_KM = 0.6 // empurra a rota a terminar um bairro antes de ir para o outro

const rad = (d: number) => (d * Math.PI) / 180
export function haversineKm(a: Pt, b: Pt) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(x))
}
export const roadKm = (a: Pt, b: Pt) => haversineKm(a, b) * ROAD_FACTOR
export const travelMin = (km: number) => (km / SPEED_KMH) * 60
const hoodOf = (p: Pt | Item) => (p as Item).hood ?? null
const cost = (a: Pt | Item, b: Item) => { const h = hoodOf(a); return roadKm(a, b) + (h && b.hood && h !== b.hood ? HOOD_PENALTY_KM : 0) }
export const has = (s: Stoplike): s is Stoplike & Pt => s.lat != null && s.lng != null

function nearest(start: Pt | null, items: Item[]): Item[] {
  const left = [...items], out: Item[] = []
  let cur: Pt | Item | null = start
  if (!cur) { const f = left.shift()!; out.push(f); cur = f }
  while (left.length) {
    let bi = 0, bd = Infinity
    for (let i = 0; i < left.length; i++) { const d = cost(cur, left[i]); if (d < bd) { bd = d; bi = i } }
    const n = left.splice(bi, 1)[0]; out.push(n); cur = n
  }
  return out
}
const pathCost = (start: Pt | null, p: Item[]) => { let t = 0, prev: Pt | Item | null = start; for (const x of p) { if (prev) t += cost(prev, x); prev = x } return t }
function twoOpt(start: Pt | null, path: Item[]): Item[] {
  const p = [...path], n = p.length
  const d = (a: Pt | Item | null | undefined, b: Item | undefined) => (a && b ? cost(a, b) : 0)
  for (let pass = 0, improved = true; improved && pass < 60; pass++) {
    improved = false
    for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) {
      const a = i > 0 ? p[i - 1] : start, b = p[i], c = p[j], e = j < n - 1 ? p[j + 1] : undefined
      if (d(a, c) + d(b, e) + 1e-9 < d(a, b) + d(c, e)) { p.splice(i, j - i + 1, ...p.slice(i, j + 1).reverse()); improved = true }
    }
  }
  return p
}
/** Melhor ordem de visita (caminho aberto) a partir de `start`; sem `start`, escolhe o melhor ponto de partida. */
export function optimize(start: Pt | null, items: Item[]): Item[] {
  if (items.length < 2) return items
  if (start) return twoOpt(start, nearest(start, items))
  let best: Item[] = items, bc = Infinity
  for (let i = 0; i < items.length; i++) {
    const p = twoOpt(null, nearest(null, [items[i], ...items.filter((_, k) => k !== i)])), c = pathCost(null, p)
    if (c < bc) { bc = c; best = p }
  }
  return best
}

/** Ordem sugerida para a fila. Paradas sem localização ficam junto às do mesmo bairro (ou no fim). */
export function planQueue(start: Pt | null, queue: Stoplike[], fixFirst: boolean) {
  const first = fixFirst ? queue[0] : undefined
  const rest = fixFirst ? queue.slice(1) : queue
  const origin: Pt | null = first && has(first) ? first : start
  const toItem = (s: Stoplike & Pt): Item => ({ id: s.id, lat: s.lat, lng: s.lng, hood: s.hood })
  const ids = optimize(origin, rest.filter(has).map(toItem)).map(i => i.id)
  const without = rest.filter(s => !has(s))
  for (const s of without) {
    let idx = -1
    ids.forEach((id, k) => { const o = queue.find(q => q.id === id); if (o?.hood && o.hood === s.hood) idx = k })
    ids.splice(idx >= 0 ? idx + 1 : ids.length, 0, s.id)
  }
  return { ids: first ? [first.id, ...ids] : ids, missing: queue.filter(s => !has(s)).length }
}

export function metrics(from: Pt | null, ids: string[], byId: Map<string, Stoplike>) {
  let km = 0, prev: Pt | null = from, unknown = 0
  for (const id of ids) { const s = byId.get(id)!; if (has(s)) { if (prev) km += roadKm(prev, s); prev = s } else unknown++ }
  return { km, min: travelMin(km) + ids.length * DWELL_MIN, unknown }
}
/** Horário previsto de chegada em cada parada (null quando a parada não tem localização). */
export function etas(from: Pt | null, ordered: Stoplike[], startMs: number): (number | null)[] {
  let t = startMs, prev: Pt | null = from
  return ordered.map(s => {
    let at: number | null = null
    if (has(s)) { if (prev) t += travelMin(roadKm(prev, s)) * 60000; prev = s; at = t }
    t += DWELL_MIN * 60000
    return at
  })
}

/* ---------- encaixe de uma parada adiada ---------- */
export type Insertion = { index: number; prevId: string | null; nextId: string | null; extraKm: number; extraMin: number; score: number }
export function insertionAt(from: Pt | null, q: Item[], x: Item, k: number): Insertion {
  const prev: Pt | Item | null = k === 0 ? from : q[k - 1], next: Item | undefined = q[k]
  const score = (prev ? cost(prev, x) : 0) + (next ? cost(x, next) : 0) - (prev && next ? cost(prev, next) : 0)
  const extraKm = (prev ? roadKm(prev, x) : 0) + (next ? roadKm(x, next) : 0) - (prev && next ? roadKm(prev, next) : 0)
  return { index: k, prevId: k === 0 ? null : q[k - 1].id, nextId: next?.id ?? null, extraKm, extraMin: travelMin(extraKm), score }
}
export function bestInsertion(from: Pt | null, q: Item[], x: Item): Insertion {
  let best = insertionAt(from, q, x, 0)
  for (let k = 1; k <= q.length; k++) { const c = insertionAt(from, q, x, k); if (c.score < best.score) best = c }
  return best
}
