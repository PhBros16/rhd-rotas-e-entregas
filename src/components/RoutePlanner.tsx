import { useEffect, useMemo, useState } from 'react'
import { Sheet, btn } from './StopSheets'
import { doNow, reorder, undefer, type StopRow } from '../lib/routes'
import { bestInsertion, etas, has, insertionAt, metrics, planQueue, DWELL_MIN, type Item, type Pt, type Stoplike } from '../lib/sequencer'
import { fmtTime } from '../lib/format'

export function getPosition(): Promise<Pt | null> {
  return new Promise(res => {
    if (!navigator.geolocation) return res(null)
    navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res(null), { enableHighAccuracy: false, timeout: 7000, maximumAge: 120000 })
  })
}
const like = (s: StopRow): Stoplike => ({ id: s.id, lat: s.lat, lng: s.lng, hood: s.neighborhood })
const queueOf = (stops: StopRow[]) => stops.filter(s => s.status === 'pending' && !s.deferred).sort((a, b) => a.position - b.position)
function lastKnown(stops: StopRow[]): Pt | null {
  const d = stops.filter(s => s.status === 'delivered' && has(like(s))).sort((a, b) => (b.delivered_at ?? '').localeCompare(a.delivered_at ?? ''))[0]
  return d ? { lat: d.lat!, lng: d.lng! } : null
}
function usePosition(stops: StopRow[]) {
  const [from, setFrom] = useState<Pt | null>(null)
  const [loading, setLoading] = useState(true)
  const [src, setSrc] = useState<'gps' | 'last' | 'none'>('none')
  useEffect(() => {
    let on = true
    getPosition().then(p => {
      if (!on) return
      if (p) { setFrom(p); setSrc('gps') } else { const l = lastKnown(stops); setFrom(l); setSrc(l ? 'last' : 'none') }
      setLoading(false)
    })
    return () => { on = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return { from, loading, src }
}
const srcText = { gps: 'sua localização agora', last: 'a última entrega feita', none: '' } as const
const km1 = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

/** Encaixa uma parada adiada no melhor ponto da rota que o entregador já está seguindo. */
export function InsertSheet({ stop, stops, onClose, onDone }: { stop: StopRow; stops: StopRow[]; onClose: () => void; onDone: (msg: string) => void }) {
  const { from, loading, src } = usePosition(stops)
  const queue = useMemo(() => queueOf(stops), [stops])
  const byId = useMemo(() => new Map(stops.map(s => [s.id, s])), [stops])
  const name = (id: string | null, fallback: string) => (id ? byId.get(id)?.client_name ?? fallback : fallback)
  const items: Item[] = useMemo(() => queue.filter(s => has(like(s))).map(s => ({ id: s.id, lat: s.lat!, lng: s.lng!, hood: s.neighborhood })), [queue])
  const x: Item | null = has(like(stop)) ? { id: stop.id, lat: stop.lat!, lng: stop.lng!, hood: stop.neighborhood } : null
  const smart = !!x && !!from && items.length > 0
  const best = smart ? bestInsertion(from, items, x!) : null
  const now = smart ? insertionAt(from, items, x!, 0) : null

  async function place() {
    if (!best) return
    const ids = queue.map(s => s.id)
    const at = best.nextId ? ids.indexOf(best.nextId) : best.prevId ? ids.indexOf(best.prevId) + 1 : 0
    const ordered = [...queue.slice(0, at), stop, ...queue.slice(at)]
    await undefer(stop); await reorder(ordered)
    onDone(`Encaixada entre ${name(best.prevId, 'você')} e ${name(best.nextId, 'o fim da rota')}.`)
  }
  async function asNext() { await doNow(stop); onDone(`${stop.client_name} é a próxima parada.`) }

  return (
    <Sheet title={`Voltar a ${stop.client_name}`} onClose={onClose}>
      {loading ? <p className="py-6 text-center text-slate-400">Calculando o melhor encaixe…</p> : smart && best && now ? (<>
        <p className="mb-1 text-xs font-bold uppercase tracking-wider text-emerald-300">Melhor encaixe</p>
        <div className="mb-3 rounded-2xl bg-slate-800 p-4 ring-2 ring-emerald-500">
          <p className="text-lg font-bold">Entre {name(best.prevId, 'você')} e {name(best.nextId, 'o fim da rota')}</p>
          <p className="text-emerald-300">+{km1(best.extraKm)} km · +{Math.round(best.extraMin)} min na rota</p>
          <p className="mt-1 text-xs text-slate-400">Calculado a partir de {srcText[src]}. A ordem das outras paradas não muda.</p>
        </div>
        <p className="mb-3 text-sm text-slate-400">Se for agora, como próxima parada: +{km1(now.extraKm)} km · +{Math.round(now.extraMin)} min.</p>
        <button onClick={place} className="mb-2 w-full rounded-xl bg-emerald-500 py-4 text-lg font-bold text-slate-900">Encaixar aqui</button>
        <button onClick={asNext} className="w-full rounded-xl bg-slate-800 py-3 font-semibold">Fazer agora (próxima parada)</button>
      </>) : (<>
        <p className="mb-4 rounded-xl bg-amber-500/20 p-3 text-sm text-amber-200">⚠️ Não consigo calcular o encaixe: {!x ? 'esta parada está sem localização' : !from ? 'não sei onde você está (permita a localização do aparelho)' : 'as outras paradas estão sem localização'}. Ela entra como a próxima parada.</p>
        <button onClick={asNext} className="w-full rounded-xl bg-orange-500 py-4 text-lg font-bold text-slate-900">Fazer agora</button>
      </>)}
    </Sheet>
  )
}

/** Sugere a melhor ordem para as paradas que faltam, mostrando antes e depois. */
export function OptimizeSheet({ stops, fixFirst, onClose, onDone }: { stops: StopRow[]; fixFirst: boolean; onClose: () => void; onDone: (msg: string) => void }) {
  const { from, loading, src } = usePosition(stops)
  const queue = useMemo(() => queueOf(stops), [stops])
  const byId = useMemo(() => new Map(queue.map(s => [s.id, like(s)])), [queue])
  const plan = useMemo(() => (loading ? null : planQueue(from, queue.map(like), fixFirst)), [loading, from, queue, fixFirst])
  if (queue.length < 2) return <Sheet title="Organizar a ordem" onClose={onClose}><p className="py-4 text-slate-300">É preciso ter pelo menos duas paradas na fila.</p></Sheet>
  if (loading || !plan) return <Sheet title="Organizar a ordem" onClose={onClose}><p className="py-6 text-center text-slate-400">Calculando a melhor ordem…</p></Sheet>

  const mapped = queue.filter(s => has(like(s))).length
  if (mapped < 2) return <Sheet title="Organizar a ordem" onClose={onClose}><p className="rounded-xl bg-amber-500/20 p-3 text-amber-200">⚠️ Poucos endereços com localização ({mapped} de {queue.length}). O admin pode localizar os endereços em Entregadores → Localização dos clientes.</p></Sheet>

  const before = metrics(from, queue.map(s => s.id), byId), after = metrics(from, plan.ids, byId)
  const saved = before.km - after.km
  const better = before.km > 0 && saved / before.km >= 0.03
  const ordered = plan.ids.map(id => queue.find(s => s.id === id)!)
  const arr = etas(from, ordered.map(like), Date.now())

  async function apply() { await reorder(ordered); onDone(`Ordem atualizada: ${queue.length} paradas, cerca de ${km1(after.km)} km.`) }
  return (
    <Sheet title="Organizar a melhor ordem" onClose={onClose}>
      <div className="mb-3 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-slate-800 p-3"><p className="text-xs text-slate-400">Ordem atual</p><p className="font-bold">{km1(before.km)} km</p><p className="text-xs text-slate-500">≈ {Math.round(before.min)} min</p></div>
        <div className="rounded-xl bg-emerald-500/20 p-3 ring-1 ring-emerald-500"><p className="text-xs text-emerald-300">Ordem sugerida</p><p className="font-bold">{km1(after.km)} km</p><p className="text-xs text-emerald-200">≈ {Math.round(after.min)} min</p></div>
      </div>
      <p className="mb-3 text-sm text-slate-300">{better ? `Economiza cerca de ${km1(saved)} km.` : 'A ordem atual já está muito boa.'} {fixFirst && 'A próxima parada continua a mesma.'} <span className="text-slate-500">Estimativa: {DWELL_MIN} min parado em cada entrega; ordem calculada a partir de {srcText[src] || 'a primeira parada'}.</span></p>
      {plan.missing > 0 && <p className="mb-3 rounded-xl bg-amber-500/20 p-3 text-sm text-amber-200">⚠️ {plan.missing} parada(s) sem localização ficam junto às do mesmo bairro.</p>}
      <ol className="mb-4 max-h-64 overflow-y-auto rounded-xl bg-slate-800 p-3 text-sm">{ordered.map((s, i) => <li key={s.id} className="flex justify-between gap-2 py-1"><span className="min-w-0 truncate"><span className="text-slate-500">{i + 1}.</span> {s.client_name} <span className="text-slate-500">· {s.neighborhood}</span></span><span className="shrink-0 text-slate-400">{arr[i] ? `~${fmtTime(new Date(arr[i]!).toISOString())}` : '—'}</span></li>)}</ol>
      <button onClick={apply} className="mb-2 w-full rounded-xl bg-emerald-500 py-4 text-lg font-bold text-slate-900">Aplicar essa ordem</button>
      <button onClick={onClose} className={`${btn} w-full py-3`}>Manter a ordem atual</button>
    </Sheet>
  )
}
