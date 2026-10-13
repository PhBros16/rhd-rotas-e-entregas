import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'
import { localDb } from '../lib/clients'
import { refresh, startRoute, summarize, type RouteRow, type StopRow } from '../lib/routes'
import { brl } from '../lib/format'
import ActiveRoute from '../components/ActiveRoute'

const label = { draft: 'Rascunho', active: 'Em andamento', finished: 'Finalizada', cancelled: 'Cancelada' } as const
const tone = { draft: 'bg-slate-700 text-slate-300', active: 'bg-orange-500/20 text-orange-300', finished: 'bg-emerald-500/20 text-emerald-300', cancelled: 'bg-red-500/20 text-red-300' } as const
const pad = (n: number) => String(n).padStart(2, '0')
const dayKey = (r: RouteRow) => { const d = new Date(r.go_at ?? r.created_at); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const dayLabel = (k: string) => new Date(`${k}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
const sel = 'min-w-0 flex-1 rounded-lg bg-slate-800 px-2 py-2 text-sm text-slate-200'

function stopLine(s: StopRow) {
  if (s.status === 'delivered') return `✓ ${s.pay_method === 'pix' ? 'Pix' : 'Dinheiro'} ${brl(Number(s.paid_amount ?? 0))}${s.pay_differs ? ` (previsto ${brl(Number(s.price))})` : ''}${s.attempt_count > 1 ? ` · ${s.attempt_count}ª tentativa` : ''}${s.received_by ? ` · recebeu: ${s.received_by}` : ''}`
  if (s.status === 'failed') return `✗ Não entregue: ${s.notes ?? ''}`
  if (s.status === 'skipped') return '✗ Não realizada'
  return s.deferred ? '⏳ Para voltar' : '• Pendente'
}

export default function Routes() {
  const { profile } = useAuth()
  const admin = profile?.role === 'admin'
  const routes = useLiveQuery(() => localDb.routes.toArray(), [])
  const allStops = useLiveQuery(() => localDb.stops.toArray(), []) ?? []
  const [names, setNames] = useState<Record<string, string>>({})
  const [open, setOpen] = useState<string | null>(null)
  const [work, setWork] = useState<string | null>(null)
  const [autoDone, setAutoDone] = useState(false)
  const [askBackup, setAskBackup] = useState(false)
  const [syncing, setSyncing] = useState(true)
  const [fOwner, setFOwner] = useState(''); const [fStatus, setFStatus] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => { refresh().finally(() => setSyncing(false)) }, [])
  useEffect(() => {
    if (!admin) return
    supabase.from('profiles').select('id, full_name, username').then(({ data }) =>
      setNames(Object.fromEntries((data ?? []).map(p => [p.id, (p.full_name || p.username).split(' ')[0]]))))
  }, [admin])
  useEffect(() => { // retoma sozinho a rota em andamento ao abrir o app
    if (autoDone || !routes || !profile) return
    setAutoDone(true)
    const mine = routes.find(r => r.status === 'active' && r.owner_id === profile.id)
    if (mine) setWork(mine.id)
  }, [routes, profile, autoDone])

  const stopsBy = useMemo(() => { const m = new Map<string, StopRow[]>(); for (const s of allStops) m.set(s.route_id, [...(m.get(s.route_id) ?? []), s]); return m }, [allStops])
  const list = useMemo(() => (routes ?? []).filter(r =>
    (!fOwner || r.owner_id === fOwner) && (!fStatus || r.status === fStatus) && (!from || dayKey(r) >= from) && (!to || dayKey(r) <= to))
    .sort((a, b) => (b.go_at ?? b.created_at).localeCompare(a.go_at ?? a.created_at)), [routes, fOwner, fStatus, from, to])
  const days = useMemo(() => { const m = new Map<string, RouteRow[]>(); for (const r of list) m.set(dayKey(r), [...(m.get(dayKey(r)) ?? []), r]); return [...m.entries()] }, [list])
  const owners = useMemo(() => [...new Set((routes ?? []).map(r => r.owner_id))], [routes])
  const total = summarize(list.flatMap(r => stopsBy.get(r.id) ?? []))
  const sum = (rs: RouteRow[]) => summarize(rs.flatMap(r => stopsBy.get(r.id) ?? []))

  const ownerOf = (id: string) => { const r = (routes ?? []).find(x => x.id === id); return r && r.owner_id !== profile?.id ? names[r.owner_id] ?? 'Entregador' : profile?.full_name ?? '' }
  async function go(r: RouteRow) {
    if ((routes ?? []).some(x => x.status === 'active' && x.owner_id === profile?.id)) { setErr('Você já tem uma rota em andamento. Continue ou finalize ela primeiro.'); return }
    if (!window.confirm(`Iniciar "${r.name}" agora?`)) return
    setErr(''); await startRoute(r); setAskBackup(true); setWork(r.id)
  }
  async function remove(r: RouteRow) {
    if (!window.confirm(`Excluir "${r.name}"?`)) return
    const { error } = await supabase.from('routes').delete().eq('id', r.id)
    if (error) setErr(error.message); else { await localDb.stops.where('route_id').equals(r.id).delete(); await localDb.routes.delete(r.id) }
  }

  const stat = (a: string, b: string | number) => <div className="rounded-xl bg-slate-800 p-3"><p className="text-xs text-slate-400">{a}</p><p className="text-lg font-bold">{b}</p></div>
  return (
    <main className="mx-auto max-w-lg p-4">
      <header className="mb-3 flex items-center gap-3"><img src="/favicon.svg" alt="" className="h-10 w-10" /><div><h1 className="font-bold">Rotas</h1><p className="text-sm text-slate-400">{list.length} {syncing ? '· atualizando…' : ''}</p></div></header>
      {err && <p className="mb-2 rounded-lg bg-amber-500/20 p-2 text-sm text-amber-300">{err}</p>}
      <div className="mb-2 flex gap-2">
        {admin && <select className={sel} value={fOwner} onChange={e => setFOwner(e.target.value)}><option value="">Todos os entregadores</option>{owners.map(id => <option key={id} value={id}>{names[id] ?? 'Entregador'}</option>)}</select>}
        <select className={sel} value={fStatus} onChange={e => setFStatus(e.target.value)}><option value="">Todos os status</option>{Object.entries(label).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      <div className="mb-4 flex items-center gap-2 text-sm text-slate-400"><span>De</span><input type="date" className={sel} value={from} onChange={e => setFrom(e.target.value)} /><span>até</span><input type="date" className={sel} value={to} onChange={e => setTo(e.target.value)} />{(from || to) && <button onClick={() => { setFrom(''); setTo('') }} className="shrink-0 text-orange-400 underline">limpar</button>}</div>

      {list.length > 0 && <div className="mb-5 grid grid-cols-2 gap-2">
        {stat('Entregas feitas', `${total.delivered} de ${total.total}`)}{stat('Não entregues', total.failed + total.skipped)}
        {stat('Pacotes entregues', total.packages)}{stat('Previsto', brl(total.planned))}
        {stat('Recebido', brl(total.received))}{stat('Pix · Dinheiro', `${brl(total.pix)} · ${brl(total.cash)}`)}
      </div>}

      {routes && list.length === 0 && <p className="mt-10 text-center text-slate-400">{(routes.length ? 'Nenhuma rota neste filtro.' : 'Nenhuma rota ainda. Em Clientes, toque em “Montar rota”.')}</p>}
      {days.map(([k, rs]) => { const d = sum(rs); return (
        <section key={k} className="mb-5">
          <div className="mb-2 flex items-baseline justify-between gap-2"><h2 className="text-sm font-semibold capitalize text-orange-400">{dayLabel(k)}</h2><span className="text-xs text-slate-400">{d.delivered}/{d.total} entregas · {brl(d.received)}</span></div>
          <ul className="flex flex-col gap-3">
            {rs.map(r => {
              const stops = (stopsBy.get(r.id) ?? []).sort((a, b) => a.position - b.position)
              const m = summarize(stops); const mine = r.owner_id === profile?.id
              return (
                <li key={r.id} className="rounded-2xl bg-slate-800">
                  <button onClick={() => setOpen(open === r.id ? null : r.id)} className="flex w-full items-start justify-between gap-2 p-4 text-left">
                    <div className="min-w-0"><p className="truncate font-semibold">{r.name}</p>
                      <p className="text-sm text-slate-400">{admin ? `${names[r.owner_id] ?? 'Entregador'} · ` : ''}{r.status === 'draft' ? `${stops.length} entregas · ${brl(m.planned)}` : `${m.delivered}/${m.total} entregues · ${brl(m.received)}`}{m.failed + m.skipped ? ` · ${m.failed + m.skipped} não entregue(s)` : ''}</p></div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${tone[r.status]}`}>{label[r.status]}</span>
                  </button>
                  {open === r.id && (
                    <div className="border-t border-slate-700 p-4 pt-3">
                      <ol className="mb-3 flex flex-col gap-2 text-sm">{stops.map((s, i) => <li key={s.id}><p><span className="text-slate-500">{i + 1}.</span> <span className="font-semibold">{s.client_name}</span> <span className="text-slate-500">· {s.neighborhood} · {s.packages} pct · {brl(Number(s.price))}</span></p><p className="pl-5 text-slate-400">{stopLine(s)}</p></li>)}</ol>
                      <div className="flex flex-wrap gap-2">
                        {mine && r.status === 'draft' && <button onClick={() => go(r)} className="rounded-xl bg-orange-500 px-6 py-3 font-bold text-slate-900">Go</button>}
                        {mine && r.status === 'active' && <button onClick={() => setWork(r.id)} className="rounded-xl bg-orange-500 px-6 py-3 font-bold text-slate-900">Continuar</button>}
                        {r.status === 'finished' && <button onClick={() => setWork(r.id)} className="rounded-xl bg-slate-700 px-5 py-3 font-semibold">Ver relatório</button>}
                        {(mine || admin) && r.status === 'draft' && <button onClick={() => remove(r)} className="rounded-xl bg-red-500/20 px-4 py-3 text-sm text-red-300">Excluir</button>}
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ) })}
      {work && <ActiveRoute routeId={work} askBackup={askBackup} owner={ownerOf(work)} onClose={() => { setWork(null); setAskBackup(false) }} />}
    </main>
  )
}
