import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouteData } from '../lib/data'
import { aggregate, inRange, top, type Range } from '../lib/stats'
import { brl, fmtDate, fmtMin, pct } from '../lib/format'
import Period from '../components/Period'

type P = { id: string; full_name: string; username: string; role: string; status: string }

export default function Couriers() {
  const { routes, by, ready } = useRouteData()
  const [range, setRange] = useState<Range>({ from: '', to: '' })
  const [people, setPeople] = useState<P[]>([])
  const [owned, setOwned] = useState<Record<string, number>>({})
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => {
    supabase.from('profiles').select('id, full_name, username, role, status').then(({ data }) => setPeople((data ?? []) as P[]))
    supabase.from('clients').select('owner_id').then(({ data }) => { const m: Record<string, number> = {}; for (const c of data ?? []) m[c.owner_id] = (m[c.owner_id] ?? 0) + 1; setOwned(m) })
  }, [])
  const rows = useMemo(() => people.filter(p => p.status === 'active').map(p => {
    const mine = routes.filter(r => r.owner_id === p.id && r.status !== 'draft')
    const inP = mine.filter(r => inRange(r, range))
    return { p, a: aggregate(inP, by), all: mine, inP }
  }).sort((x, y) => y.a.received - x.a.received), [people, routes, by, range])
  const kv = (l: string, v: string) => <div className="rounded-xl bg-slate-900/60 p-3"><p className="text-xs text-slate-400">{l}</p><p className="font-bold">{v}</p></div>
  return (
    <main className="mx-auto max-w-lg p-4 pb-10">
      <header className="mb-3 flex items-center gap-3"><img src="/favicon.svg" alt="" className="h-10 w-10" /><div><h1 className="font-bold">Entregadores</h1><p className="text-sm text-slate-400">{rows.length} ativo(s)</p></div></header>
      <Period value={range} onChange={setRange} />
      {ready && rows.length === 0 && <p className="mt-10 text-center text-slate-400">Nenhum entregador ativo.</p>}
      <ul className="flex flex-col gap-3">
        {rows.map(({ p, a, all, inP }) => (
          <li key={p.id} className="rounded-2xl bg-slate-800">
            <button onClick={() => setOpen(open === p.id ? null : p.id)} className="flex w-full items-start justify-between gap-2 p-4 text-left">
              <div className="min-w-0"><p className="font-bold">{p.full_name || p.username} {p.role === 'admin' && <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs font-normal text-slate-300">admin</span>}</p>
                <p className="text-sm text-slate-400">{a.delivered} entrega(s) · {a.finished} rota(s) · repasse {brl(a.courierPay)}</p></div>
              <span className="text-slate-500">{open === p.id ? '▴' : '▾'}</span>
            </button>
            {open === p.id && (
              <div className="border-t border-slate-700 p-4 pt-3">
                <div className="mb-3 grid grid-cols-2 gap-2">
                  {kv('✅ Entregas', String(a.delivered))}{kv('❌ Não entregues', String(a.failed + a.skipped))}
                  {kv('📦 Pacotes', String(a.packages))}{kv('🎯 Sucesso', pct(a.success))}
                  {kv('💰 Arrecadou', brl(a.received))}{kv('🤝 Repasse devido', brl(a.courierPay))}{kv('💠 Pix · 💵 Din.', `${brl(a.pix)} · ${brl(a.cash)}`)}
                  {kv('⏱ Tempo/entrega', fmtMin(a.avgPerDeliveryMin))}{kv('🕐 Rota média', fmtMin(a.avgRouteMin))}
                  {kv('🎟 Ticket médio', brl(a.avgTicket))}{kv('👥 Clientes', String(owned[p.id] ?? 0))}
                </div>
                {top(a.stops, s => s.neighborhood || 'Sem bairro', 4).length > 0 && <p className="mb-3 text-sm text-slate-300"><b>📍 Bairros:</b> {top(a.stops, s => s.neighborhood || 'Sem bairro', 4).map(t => `${t.name} (${t.n})`).join(' · ')}</p>}
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Últimas rotas</p>
                <ul className="flex flex-col gap-1 text-sm">{[...(inP.length ? inP : all)].sort((x, y) => (y.go_at ?? y.created_at).localeCompare(x.go_at ?? x.created_at)).slice(0, 5).map(r => {
                  const m = aggregate([r], by); return <li key={r.id} className="flex justify-between gap-2"><span className="truncate">{fmtDate(r.go_at ?? r.created_at)} · {r.name}</span><span className="shrink-0 text-slate-400">{m.delivered}/{m.total} · {brl(m.received)}</span></li> })}
                  {all.length === 0 && <li className="text-slate-500">Nenhuma rota ainda.</li>}</ul>
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}
