import { supabase } from './supabase'

export const extractUrl = (s: string) => s.match(/https?:\/\/[^\s]+/i)?.[0] ?? s.trim()

export function parseCoords(input: string) {
  let s = input
  try { s = decodeURIComponent(input) } catch { /* mantém */ }
  const pats = [
    /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,
    /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/,
    /[?&](?:q|ll|query|destination|center)=(?:loc:)?(-?\d{1,3}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/,
    /^\s*(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/,
  ]
  for (const p of pats) {
    const m = s.match(p)
    if (m) { const lat = +m[1], lng = +m[2]; if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng } }
  }
  return null
}

export async function resolveCoords(input: string) {
  const direct = parseCoords(input)
  if (direct) return direct
  if (!/^https?:/i.test(input)) return null
  try {
    const { data, error } = await supabase.functions.invoke('resolve-map-link', { body: { url: input } })
    if (error || typeof data?.lat !== 'number') return null
    return { lat: data.lat as number, lng: data.lng as number }
  } catch { return null }
}

type Q = string | { lat: number; lng: number }
export const mapsUrl = (q: Q) => `https://www.google.com/maps/search/?api=1&query=${typeof q === 'string' ? encodeURIComponent(q) : `${q.lat},${q.lng}`}`
export const wazeUrl = (q: Q) => typeof q === 'string' ? `https://waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes` : `https://waze.com/ul?ll=${q.lat},${q.lng}&navigate=yes`
export const whatsUrl = (phone: string) => { const d = phone.replace(/\D/g, ''); return `https://wa.me/${d.length >= 12 && d.startsWith('55') ? d : '55' + d}` }
export const fmtPhone = (p: string | null) => {
  const d = (p ?? '').replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return p ?? ''
}
export const fmtCep = (c: string | null) => (c && c.length === 8 ? `${c.slice(0, 5)}-${c.slice(5)}` : c ?? '')
