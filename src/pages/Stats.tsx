import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouteData } from '../lib/data'
import { aggregate, byDay, inRange, top, type Range } from '../lib/stats'
import { brl, fmtMin, pct } from '../lib/format'
import Period from '../components/Period'

const card = 'mb-4 rounded-2xl bg-slate-800 p-4'
const h = 'mb-3 text-xs font-bold uppercase tracking-wider text-orange-300'

function Bars({ items, fmt }: { items: { name: string; n: number; sub?: string }[]; fmt?: (n: number) => string }) {
  const max = Math.max(1, ...items.map(i => i.n))
  return <ul className="flex flex-col gap-2">{items.map(i => <li key={i.name}><div className="mb-1 flex justify-between gap-2 text-sm"><span className="truncate">{i.name}</span><span className="shrink-0 text-slate-400">{fmt ? fmt(i.n) : i.n}{i.sub ? ` · ${i.sub}` : ''}</span></div><div className="h-2 rounded-full bg-slate-700"><div className="h-2 rounded-full bg-orange-500" style={{ width: `${(i.n / max) * 100}%` }} /></div></li>)}</ul>
}

export default function Stats() {
  const { routes, by, ready } = useRouteData()
  const [range, setRange] = useState<Range>({ from: '', to: '' })
  const [names, setNames] = useState<Record<string, string>>({})
  const [clients, setClients] = useState(0)
  useEffect(() => {
    supabase.from('profiles').select('id, full_name, username').then(({ data }) => setNames(Object.fromEntries((data ?? []).map(p => [p.id, (p.full_name || p.username).split(' ')[0]]))))
    supabase.from('clients').select('id', { count: 'exact', head: true }).then(({ count }) => setClients(count ?? 0))
  }, [])
  const rs = useMemo(() => routes.filter(r => r.status !== 'draft' && inRange(r, range)), [routes, range])
  const a = useMemo(() => aggregate(rs, by), [rs, by])
  const days = useMemo(() => byDay(rs, by).slice(-14), [rs, by])
  const ranking = useMemo(() => [...new Set(rs.map(r => r.owner_id))].map(id => { const x = aggregate(rs.filter(r => r.owner_id === id), by); return { name: names[id] ?? 'Entregador', n: x.delivered, sub: brl(x.received) } }).sort((p, q) => q.n - p.n), [rs, by, names])
  const kpi = (l: string, v: string, s?: string) => <div className="rounded-2xl bg-slate-800 p-3"><p className="text-xs text-slate-400">{l}</p><p className="text-xl font-extrabold">{v}</p>{s && <p className="text-xs text-slate-500">{s}</p>}</div>
  return (
    <main className="mx-auto max-w-lg p-4 pb-10">
      <header className="mb-3 flex items-center gap-3"><img src="/favicon.svg" alt="" className="h-10 w-10" /><div><h1 className="font-bold">Painel</h1><p className="text-sm text-slate-400">Visão geral da operação</p></div></header>
      <Period value={range} onChange={setRange} />
      {ready && rs.length === 0 && <p className="mt-10 text-center text-slate-400">Nenhuma rota iniciada neste período.</p>}
      {rs.length > 0 && <>
        <div className="mb-4 grid grid-cols-2 gap-2">
          {kpi('✅ Entregas feitas', String(a.delivered), `${a.finished} rota(s) finalizada(s)`)}{kpi('❌ Não entregues', String(a.failed + a.skipped), `sucesso ${pct(a.success)}`)}
          {kpi('📦 Pacotes', String(a.packages))}{kpi('💰 Recebido', brl(a.received), `previsto ${brl(a.planned)}`)}
          {kpi('💠 Pix', brl(a.pix))}{kpi('💵 Dinheiro', brl(a.cash))}
          {kpi('🎟 Ticket médio', brl(a.avgTicket), 'por entrega')}{kpi('⏱ Tempo/entrega', fmtMin(a.avgPerDeliveryMin), `rota média ${fmtMin(a.avgRouteMin)}`)}
        </div>
        {days.length > 0 && <div className={card}><p className={h}>📅 Entregas por dia</p>
          <div className="flex h-32 items-end gap-1">{days.map(d => { const max = Math.max(1, ...days.map(x => x.delivered)); return <div key={d.day} className="flex flex-1 flex-col items-center justify-end gap-1"><span className="text-[10px] text-slate-400">{d.delivered}</span><div className="w-full rounded-t bg-orange-500" style={{ height: `${Math.max(4, (d.delivered / max) * 100)}%` }} /><span className="text-[10px] text-slate-500">{d.day.slice(8)}/{d.day.slice(5, 7)}</span></div> })}</div></div>}
        {ranking.length > 0 && <div className={card}><p className={h}>🏆 Entregadores</p><Bars items={ranking} fmt={n => `${n} entregas`} /></div>}
        <div className={card}><p className={h}>📍 Bairros com mais entregas</p><Bars items={top(a.stops, s => `${s.neighborhood || 'Sem bairro'}${s.city ? ` · ${s.city}` : ''}`).map(t => ({ name: t.name, n: t.n, sub: brl(t.value) }))} /></div>
        {a.failed + a.skipped > 0 && <div className={card}><p className={h}>❌ Motivos de não entrega</p><Bars items={top(a.stops, s => (s.status === 'skipped' ? 'Não realizada' : (s.notes || 'Sem motivo').trim()), 5, 'lost').map(t => ({ name: t.name, n: t.n }))} /></div>}
        <div className={card}><p className={h}>⚠️ Conferência</p>
          <div className="flex justify-between py-1 text-sm"><span className="text-slate-400">Pagamentos diferentes</span><b>{a.diffs.length}</b></div>
          <div className="flex justify-between py-1 text-sm"><span className="text-slate-400">Saldo das diferenças</span><b>{a.diffBalance >= 0 ? '+' : '−'}{brl(Math.abs(a.diffBalance))}</b></div>
          <div className="flex justify-between py-1 text-sm"><span className="text-slate-400">Entregues após voltar</span><b>{a.retried.length}</b></div>
          <div className="flex justify-between py-1 text-sm"><span className="text-slate-400">Clientes cadastrados</span><b>{clients}</b></div></div>
      </>}
    </main>
  )
}
