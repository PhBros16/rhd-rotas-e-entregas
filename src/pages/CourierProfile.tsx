import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { refresh, type RouteRow, type StopRow } from '../lib/routes'
import { aggregate, byDay, inRange, ranges, top, type Range } from '../lib/stats'
import { brl, fmtDate, fmtMin, pct } from '../lib/format'
import Period from '../components/Period'
import { Bars, DayBars } from '../components/Bars'
import RouteSummary from '../components/RouteSummary'

export type P = { id: string; full_name: string; username: string; role: string; status: string; pay_rate: number | null; created_at: string }
const card = 'mb-4 rounded-2xl bg-slate-800 p-4'
const h = 'mb-3 text-xs font-bold uppercase tracking-wider text-orange-300'
const label = { draft: 'Rascunho', active: 'Em andamento', finished: 'Finalizada', cancelled: 'Cancelada' } as const

export default function CourierProfile({ p, routes, by, clients, onBack, onChanged }: { p: P; routes: RouteRow[]; by: Map<string, StopRow[]>; clients: number; onBack: () => void; onChanged: () => void }) {
  const [range, setRange] = useState<Range>(ranges().week)
  const [rate, setRate] = useState(p.pay_rate != null ? String(p.pay_rate) : '')
  const [def, setDef] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  const [open, setOpen] = useState<RouteRow | null>(null)
  useEffect(() => { supabase.from('app_settings').select('value').eq('key', 'courier_fee').single().then(({ data }) => setDef(data ? Number(data.value) : 0)) }, [])

  const mine = useMemo(() => routes.filter(r => r.owner_id === p.id && r.status !== 'draft'), [routes, p.id])
  const inP = useMemo(() => mine.filter(r => inRange(r, range)), [mine, range])
  const a = useMemo(() => aggregate(inP, by), [inP, by])
  const R = ranges()
  const win = (r: Range) => aggregate(mine.filter(x => inRange(x, r)), by)
  const wk = win(R.week), mo = win(R.month), all = win(R.all)
  const eff = p.pay_rate ?? def ?? 0

  async function saveRate(useDefault: boolean) {
    const n = useDefault ? null : parseFloat(rate.replace(',', '.'))
    if (!useDefault && (n === null || !Number.isFinite(n) || n < 0)) { setMsg('Valor inválido.'); return }
    const { error } = await supabase.from('profiles').update({ pay_rate: n }).eq('id', p.id)
    if (error) { setMsg(error.message); return }
    const applied = n ?? def ?? 0
    const { data: drafts } = await supabase.from('routes').select('id').eq('owner_id', p.id).eq('status', 'draft')
    if (drafts?.length) await supabase.from('route_stops').update({ courier_pay: applied }).in('route_id', drafts.map(r => r.id as string))
    setRate(useDefault ? '' : String(n))
    setMsg(useDefault ? `Voltou ao valor padrão (${brl(applied)}).` : `Salvo: ${brl(applied)} por entrega. Vale para as próximas rotas e para os rascunhos.`)
    onChanged(); void refresh()
  }

  const cell = (v: string, strong = false) => <span className={`text-center ${strong ? 'font-bold text-emerald-400' : 'font-semibold'}`}>{v}</span>
  const kv = (l: string, v: string) => <div className="rounded-xl bg-slate-900/60 p-3"><p className="text-xs text-slate-400">{l}</p><p className="font-bold">{v}</p></div>
  const sorted = [...inP].sort((x, y) => (y.go_at ?? y.created_at).localeCompare(x.go_at ?? x.created_at))
  return (
    <main className="mx-auto max-w-lg p-4 pb-10">
      <button onClick={onBack} className="mb-3 rounded-lg bg-slate-700 px-3 py-2 text-sm">← Entregadores</button>
      <header className="mb-4"><h1 className="text-xl font-extrabold">{p.full_name || p.username}</h1>
        <p className="text-sm text-slate-400">@{p.username} · {p.role === 'admin' ? 'Admin' : 'Entregador'} · {p.status === 'active' ? 'ativo' : p.status === 'pending' ? 'aguardando' : 'bloqueado'} · desde {fmtDate(p.created_at)} · {clients} cliente(s)</p></header>

      <div className={card}><p className={h}>💼 Repasse ao entregador</p>
        <label className="mb-1 block text-xs text-slate-400">Valor por entrega (igual para todas as entregas)</label>
        <div className="mb-1 flex gap-2"><input inputMode="decimal" placeholder={def ? `Padrão: ${brl(def)}` : 'R$'} value={rate} onChange={e => { setRate(e.target.value); setMsg('') }} className="min-w-0 flex-1 rounded-xl bg-slate-900 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500" /><button onClick={() => saveRate(false)} className="rounded-xl bg-emerald-500 px-5 font-bold text-slate-900">Salvar</button></div>
        <p className="mb-3 text-xs text-slate-400">Em uso: <b className="text-slate-200">{brl(eff)}</b> por entrega {p.pay_rate == null ? '(valor padrão do admin)' : '(valor próprio)'}.{p.pay_rate != null && <button onClick={() => saveRate(true)} className="ml-2 text-orange-400 underline">usar o padrão</button>}</p>
        {msg && <p className="mb-3 text-sm text-emerald-300">{msg}</p>}
        <Period value={range} onChange={setRange} />
        <div className="rounded-xl bg-slate-900/60 p-4 text-center"><p className="text-sm text-slate-400">Repassar neste período</p><p className="text-3xl font-extrabold text-emerald-400">{brl(a.courierPay)}</p><p className="text-sm text-slate-400">{a.delivered} entrega(s) feita(s){a.failed + a.skipped > 0 ? ` · ${a.failed + a.skipped} não entregue(s) não contam` : ''}</p></div>
        <p className="mt-2 text-xs text-slate-500">O valor de cada rota fica gravado quando ela é montada, então mudar o valor não altera o que já foi feito.</p>
      </div>

      <div className={card}><p className={h}>📊 Resumo</p>
        <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-3 gap-y-2 text-sm">
          <span /><span className="text-center text-xs text-slate-400">Semana</span><span className="text-center text-xs text-slate-400">Mês</span><span className="text-center text-xs text-slate-400">Total</span>
          <span className="text-slate-400">Entregas</span>{cell(String(wk.delivered))}{cell(String(mo.delivered))}{cell(String(all.delivered))}
          <span className="text-slate-400">Rotas</span>{cell(String(wk.finished))}{cell(String(mo.finished))}{cell(String(all.finished))}
          <span className="text-slate-400">Arrecadou</span>{cell(brl(wk.received))}{cell(brl(mo.received))}{cell(brl(all.received))}
          <span className="text-slate-400">Repasse</span>{cell(brl(wk.courierPay), true)}{cell(brl(mo.courierPay), true)}{cell(brl(all.courierPay), true)}
        </div>
      </div>

      <div className={card}><p className={h}>📈 No período selecionado</p>
        <div className="grid grid-cols-2 gap-2">
          {kv('✅ Entregas', String(a.delivered))}{kv('❌ Não entregues', String(a.failed + a.skipped))}{kv('📦 Pacotes', String(a.packages))}{kv('🎯 Sucesso', pct(a.success))}
          {kv('💰 Arrecadou', brl(a.received))}{kv('💠 Pix · 💵 Din.', `${brl(a.pix)} · ${brl(a.cash)}`)}{kv('⏱ Tempo/entrega', fmtMin(a.avgPerDeliveryMin))}{kv('🕐 Rota média', fmtMin(a.avgRouteMin))}
          {kv('🎟 Ticket médio', brl(a.avgTicket))}{kv('🔁 Após voltar', String(a.retried.length))}
        </div></div>

      {byDay(inP, by).length > 1 && <div className={card}><p className={h}>📅 Entregas por dia</p><DayBars days={byDay(inP, by).slice(-14)} /></div>}
      {top(a.stops, s => s.neighborhood || 'Sem bairro').length > 0 && <div className={card}><p className={h}>📍 Bairros</p><Bars items={top(a.stops, s => s.neighborhood || 'Sem bairro').map(t => ({ name: t.name, n: t.n, sub: brl(t.value) }))} /></div>}
      {a.failed + a.skipped > 0 && <div className={card}><p className={h}>❌ Motivos de não entrega</p><Bars items={top(a.stops, s => (s.status === 'skipped' ? 'Não realizada' : (s.notes || 'Sem motivo').trim()), 5, 'lost').map(t => ({ name: t.name, n: t.n }))} /></div>}

      <div className={card}><p className={h}>🗂 Rotas ({sorted.length})</p>
        {sorted.length === 0 && <p className="text-sm text-slate-500">Nenhuma rota neste período.</p>}
        <ul className="flex flex-col gap-2">{sorted.map(r => { const m = aggregate([r], by); return (
          <li key={r.id}><button disabled={r.status !== 'finished'} onClick={() => setOpen(r)} className="w-full rounded-xl bg-slate-900/60 p-3 text-left disabled:opacity-70">
            <div className="flex justify-between gap-2"><span className="min-w-0 truncate font-semibold">{r.name}</span><span className="shrink-0 text-xs text-slate-400">{label[r.status]}</span></div>
            <p className="text-sm text-slate-400">{fmtDate(r.go_at ?? r.created_at)} · {m.delivered}/{m.total} entregues · repasse <b className="text-emerald-400">{brl(m.courierPay)}</b>{r.status === 'finished' ? ' · ver relatório' : ''}</p>
          </button></li>) })}</ul></div>
      {open && <RouteSummary route={open} stops={(by.get(open.id) ?? []).sort((x, y) => x.position - y.position)} owner={p.full_name || p.username} onClose={() => setOpen(null)} />}
    </main>
  )
}
