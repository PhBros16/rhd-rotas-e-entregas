import { summarize, type RouteRow, type StopRow } from './routes'
import { dayKeyOf, pad } from './format'

export const routeDay = (r: RouteRow) => dayKeyOf(r.go_at ?? r.created_at)
export const stopsMap = (stops: StopRow[]) => { const m = new Map<string, StopRow[]>(); for (const s of stops) m.set(s.route_id, [...(m.get(s.route_id) ?? []), s]); return m }

export function aggregate(routes: RouteRow[], by: Map<string, StopRow[]>) {
  const stops = routes.flatMap(r => by.get(r.id) ?? [])
  const m = summarize(stops)
  const fin = routes.filter(r => r.status === 'finished' && r.go_at && r.finished_at)
  let mins = 0, doneInFin = 0
  for (const r of fin) { mins += (new Date(r.finished_at!).getTime() - new Date(r.go_at!).getTime()) / 60000; doneInFin += (by.get(r.id) ?? []).filter(s => s.status === 'delivered').length }
  const tried = m.delivered + m.failed + m.skipped
  return { ...m, stops, routes: routes.length, finished: fin.length, avgRouteMin: fin.length ? mins / fin.length : 0,
    avgPerDeliveryMin: doneInFin ? mins / doneInFin : 0, success: tried ? m.delivered / tried : 0, avgTicket: m.delivered ? m.received / m.delivered : 0,
    diffBalance: m.diffs.reduce((t, s) => t + Number(s.paid_amount ?? 0) - Number(s.price), 0) }
}

export function top(stops: StopRow[], key: (s: StopRow) => string, n = 6, only: 'delivered' | 'lost' = 'delivered') {
  const m = new Map<string, { name: string; n: number; value: number }>()
  for (const s of stops.filter(x => (only === 'delivered' ? x.status === 'delivered' : x.status === 'failed' || x.status === 'skipped'))) {
    const k = key(s); const c = m.get(k) ?? { name: k, n: 0, value: 0 }; c.n += 1; c.value += Number(s.paid_amount ?? 0); m.set(k, c)
  }
  return [...m.values()].sort((a, b) => b.n - a.n).slice(0, n)
}

export function byDay(routes: RouteRow[], by: Map<string, StopRow[]>) {
  const m = new Map<string, { day: string; delivered: number; received: number }>()
  for (const r of routes) {
    const k = routeDay(r); const c = m.get(k) ?? { day: k, delivered: 0, received: 0 }
    const d = (by.get(r.id) ?? []).filter(s => s.status === 'delivered'); c.delivered += d.length; c.received += d.reduce((t, s) => t + Number(s.paid_amount ?? 0), 0); m.set(k, c)
  }
  return [...m.values()].sort((a, b) => a.day.localeCompare(b.day))
}

export type Range = { from: string; to: string }
export const inRange = (r: RouteRow, { from, to }: Range) => { const d = routeDay(r); return (!from || d >= from) && (!to || d <= to) }
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const presets = (): [string, Range][] => {
  const t = new Date(), w = new Date(t), mo = new Date(t.getFullYear(), t.getMonth(), 1)
  w.setDate(t.getDate() - 6)
  return [['Hoje', { from: key(t), to: key(t) }], ['7 dias', { from: key(w), to: key(t) }], ['Este mês', { from: key(mo), to: key(t) }], ['Tudo', { from: '', to: '' }]]
}
