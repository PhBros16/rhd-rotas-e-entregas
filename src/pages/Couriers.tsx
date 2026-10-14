import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouteData } from '../lib/data'
import { aggregate, inRange, ranges, type Range } from '../lib/stats'
import { brl, norm } from '../lib/format'
import Period from '../components/Period'
import AdminTools from '../components/AdminTools'
import CourierProfile, { type P } from './CourierProfile'

export default function Couriers() {
  const { routes, by, ready } = useRouteData()
  const [range, setRange] = useState<Range>(ranges().week)
  const [people, setPeople] = useState<P[]>([])
  const [owned, setOwned] = useState<Record<string, number>>({})
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('active')
  const [sel, setSel] = useState<string | null>(null)
  const load = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('id, full_name, username, role, status, pay_rate, created_at')
    setPeople((data ?? []) as P[])
  }, [])
  useEffect(() => {
    void load()
    supabase.from('clients').select('owner_id').then(({ data }) => { const m: Record<string, number> = {}; for (const c of data ?? []) m[c.owner_id] = (m[c.owner_id] ?? 0) + 1; setOwned(m) })
  }, [load])

  const rows = useMemo(() => people.filter(p => (!status || p.status === status) && (!q || norm(`${p.full_name} ${p.username}`).includes(norm(q)))).map(p => ({
    p, a: aggregate(routes.filter(r => r.owner_id === p.id && r.status !== 'draft' && inRange(r, range)), by),
  })).sort((x, y) => y.a.delivered - x.a.delivered || (x.p.full_name || '').localeCompare(y.p.full_name || '')), [people, routes, by, range, q, status])

  const cur = sel ? people.find(x => x.id === sel) : null
  if (cur) return <CourierProfile p={cur} routes={routes} by={by} clients={owned[cur.id] ?? 0} onBack={() => setSel(null)} onChanged={load} />
  return (
    <main className="mx-auto max-w-lg p-4 pb-10">
      <header className="mb-3 flex items-center gap-3"><img src="/favicon.svg" alt="" className="h-10 w-10" /><div><h1 className="font-bold">Entregadores</h1><p className="text-sm text-slate-400">Toque em um nome para ver o perfil</p></div></header>
      <div className="mb-3 flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar entregador" className="min-w-0 flex-1 rounded-xl bg-slate-800 px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500" />
        <select value={status} onChange={e => setStatus(e.target.value)} className="rounded-xl bg-slate-800 px-3 text-sm"><option value="active">Ativos</option><option value="pending">Aguardando</option><option value="blocked">Bloqueados</option><option value="">Todos</option></select>
      </div>
      <Period value={range} onChange={setRange} />
      {ready && rows.length === 0 && <p className="mt-6 text-center text-slate-400">Nenhum entregador encontrado.</p>}
      <ul className="mb-6 flex flex-col gap-3">
        {rows.map(({ p, a }) => (
          <li key={p.id}><button onClick={() => setSel(p.id)} className="w-full rounded-2xl bg-slate-800 p-4 text-left active:scale-[0.99]">
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="font-bold">{p.full_name || p.username}</p><p className="text-sm text-slate-400">@{p.username}{p.role === 'admin' ? ' · admin' : ''} · {p.pay_rate != null ? `${brl(p.pay_rate)}/entrega` : 'valor padrão'}</p></div><span className="text-slate-500">›</span></div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center"><div><p className="text-lg font-extrabold">{a.delivered}</p><p className="text-xs text-slate-400">entregas</p></div><div><p className="text-lg font-extrabold">{a.finished}</p><p className="text-xs text-slate-400">rotas</p></div><div><p className="text-lg font-extrabold text-emerald-400">{brl(a.courierPay)}</p><p className="text-xs text-slate-400">repassar</p></div></div>
          </button></li>
        ))}
      </ul>
      <details className="rounded-2xl bg-slate-800/50 p-3"><summary className="cursor-pointer text-sm font-semibold text-slate-300">⚙️ Ajustes e ferramentas</summary><div className="mt-3"><AdminTools /></div></details>
    </main>
  )
}
