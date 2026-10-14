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
