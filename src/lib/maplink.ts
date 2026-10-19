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

/** Rota com várias paradas no Google Maps (a última é o destino; as outras, paradas intermediárias). O Maps aceita poucas por vez. */
export const mapsRouteUrl = (stops: string[]) => {
  const p = new URLSearchParams({ api: '1', destination: stops[stops.length - 1], travelmode: 'driving' })
  if (stops.length > 1) p.set('waypoints', stops.slice(0, -1).join('|'))
  return `https://www.google.com/maps/dir/?${p}`
}
