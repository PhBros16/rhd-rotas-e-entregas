import { supabase } from './supabase'
import { localDb } from './clients'

export type StopStatus = 'pending' | 'delivered' | 'failed' | 'skipped'
export type StopRow = {
  id: string; route_id: string; client_id: string | null; client_name: string; phone: string | null
  address: string | null; neighborhood: string | null; city: string | null; lat: number | null; lng: number | null
  position: number; packages: number; price: number; status: StopStatus
  pay_method: 'pix' | 'cash' | null; paid_amount: number | null; pay_differs: boolean
  delivered_at: string | null; received_by: string | null; notes: string | null
  deferred: boolean; retry_at: string | null; attempt_count: number
  pin_url: string | null; client_notes: string | null; courier_pay: number
}
export type RouteRow = {
  id: string; owner_id: string; name: string | null; status: 'draft' | 'active' | 'finished' | 'cancelled'
  go_at: string | null; finished_at: string | null; created_at: string
}
export type Op = { seq?: number; table: 'routes' | 'route_stops' | 'stop_attempts'; op: 'update' | 'insert'; id: string; data: Record<string, unknown> }

/* ---------- fila de sincronização (funciona sem internet) ---------- */
let flushing = false
export async function flush() {
  if (flushing || !navigator.onLine) return
  flushing = true
  try {
    const { data } = await supabase.auth.getSession()
    if (!data.session) return
    for (;;) {
      const op = await localDb.outbox.orderBy('seq').first()
      if (!op) break
      const q = supabase.from(op.table)
      const { error } = op.op === 'insert' ? await q.insert({ id: op.id, ...op.data }) : await q.update(op.data).eq('id', op.id)
      if (error && !error.code) break // sem rede: tenta de novo depois
      if (error && error.code !== '23505') console.warn('Alteração descartada pelo servidor:', op, error.message)
      await localDb.outbox.delete(op.seq!)
    }
  } finally { flushing = false }
}
async function enqueue(op: Op) { await localDb.outbox.add(op); void flush() }
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flush())
  setInterval(() => void flush(), 30000)
  void flush()
}

/* ---------- baixa do servidor para o aparelho (só quando não há nada pendente) ---------- */
export async function refresh() {
  await flush()
  if (!navigator.onLine || (await localDb.outbox.count()) > 0) return false
  const { data, error } = await supabase.from('routes').select('*, route_stops(*)').order('created_at', { ascending: false }).limit(200)
  if (error || !data || (await localDb.outbox.count()) > 0) return false
  await localDb.transaction('rw', localDb.routes, localDb.stops, async () => {
    await localDb.routes.clear(); await localDb.stops.clear()
    for (const r of data as (RouteRow & { route_stops: StopRow[] })[]) {
      const { route_stops, ...route } = r
      await localDb.routes.put(route); await localDb.stops.bulkPut(route_stops)
    }
  })
  return true
}

/* ---------- ações do entregador ---------- */
const now = () => new Date().toISOString()
async function patchStop(id: string, patch: Partial<StopRow>) {
  await localDb.stops.update(id, patch)
  await enqueue({ table: 'route_stops', op: 'update', id, data: patch })
}
async function log(s: StopRow, outcome: 'delivered' | 'retry' | 'failed' | 'undo', reason?: string, retryAt?: string | null) {
  await enqueue({ table: 'stop_attempts', op: 'insert', id: crypto.randomUUID(), data: { stop_id: s.id, route_id: s.route_id, outcome, reason: reason || null, retry_at: retryAt ?? null, at: now() } })
}
export async function startRoute(r: RouteRow) {
  const p = { status: 'active' as const, go_at: now() }
  await localDb.routes.update(r.id, p); await enqueue({ table: 'routes', op: 'update', id: r.id, data: p })
}
export async function deliver(s: StopRow, o: { method: 'pix' | 'cash'; amount: number; receivedBy?: string }) {
  await patchStop(s.id, { status: 'delivered', pay_method: o.method, paid_amount: o.amount, pay_differs: Math.abs(o.amount - Number(s.price)) > 0.001,
    delivered_at: now(), received_by: o.receivedBy?.trim() || null, deferred: false, retry_at: null, attempt_count: s.attempt_count + 1 })
  await log(s, 'delivered')
}
export async function defer(s: StopRow, retryAt: string | null, reason?: string) {
  await patchStop(s.id, { deferred: true, retry_at: retryAt, notes: reason?.trim() || s.notes, attempt_count: s.attempt_count + 1 })
  await log(s, 'retry', reason?.trim(), retryAt)
}
export async function fail(s: StopRow, reason: string) {
  await patchStop(s.id, { status: 'failed', notes: reason.trim(), deferred: false, retry_at: null, attempt_count: s.attempt_count + 1 })
  await log(s, 'failed', reason.trim())
}
export async function undo(s: StopRow) {
  await patchStop(s.id, { status: 'pending', pay_method: null, paid_amount: null, pay_differs: false, delivered_at: null, received_by: null, deferred: false, retry_at: null })
  await log(s, 'undo')
}
export async function doNow(s: StopRow) {
  const pend = await localDb.stops.where('route_id').equals(s.route_id).filter(x => x.status === 'pending' && !x.deferred).toArray()
  await patchStop(s.id, { deferred: false, retry_at: null, position: Math.min(0, ...pend.map(p => p.position)) - 1 })
}
export async function finishRoute(r: RouteRow, stops: StopRow[]) {
  for (const s of stops.filter(x => x.status === 'pending')) await patchStop(s.id, { status: 'skipped', deferred: false, retry_at: null })
  const p = { status: 'finished' as const, finished_at: now() }
  await localDb.routes.update(r.id, p); await enqueue({ table: 'routes', op: 'update', id: r.id, data: p })
}

/* ---------- números para relatório e painel ---------- */
export function summarize(stops: StopRow[]) {
  const done = stops.filter(s => s.status === 'delivered')
  const sum = (a: StopRow[], f: (s: StopRow) => number) => a.reduce((t, s) => t + f(s), 0)
  const paid = (m: 'pix' | 'cash') => sum(done.filter(s => s.pay_method === m), s => Number(s.paid_amount ?? 0))
  return {
    total: stops.length, delivered: done.length, failed: stops.filter(s => s.status === 'failed').length,
    skipped: stops.filter(s => s.status === 'skipped').length, pending: stops.filter(s => s.status === 'pending').length,
    packages: sum(done, s => s.packages), planned: sum(stops, s => Number(s.price)),
    received: sum(done, s => Number(s.paid_amount ?? 0)), pix: paid('pix'), cash: paid('cash'),
    courierPay: sum(done, s => Number(s.courier_pay ?? 0)), courierPlanned: sum(stops, s => Number(s.courier_pay ?? 0)),
    diffs: done.filter(s => s.pay_differs), retried: done.filter(s => s.attempt_count > 1),
  }
}
