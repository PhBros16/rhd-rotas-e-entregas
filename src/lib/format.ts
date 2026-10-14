export const pad = (n: number) => String(n).padStart(2, '0')
export const brl = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
export const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—')
export const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '')
export const fmtDur = (ms: number) => { const m = Math.max(0, Math.round(ms / 60000)); const h = Math.floor(m / 60); return h ? `${h}h${pad(m % 60)}` : `${m} min` }
export const fmtMin = (m: number) => (m > 0 ? fmtDur(m * 60000) : '—')
export const dayKeyOf = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
export const dayLabel = (k: string) => new Date(`${k}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
export const pct = (x: number) => `${Math.round(x * 100)}%`
export const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
