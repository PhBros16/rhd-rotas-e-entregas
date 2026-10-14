import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { refresh, type RouteRow, type StopRow } from '../lib/routes'
import { aggregate, byDay, inRange, pendingPayout, ranges, top, type Range } from '../lib/stats'
import { brl, fmtDate, fmtMin, pct } from '../lib/format'
import Period from '../components/Period'
import { Bars, DayBars } from '../components/Bars'
import RouteSummary from '../components/RouteSummary'
import { Sheet, field } from '../components/StopSheets'

export type P = { id: string; full_name: string; username: string; role: string; status: string; pay_rate: number | null; created_at: string }
const card = 'mb-4 rounded-2xl bg-slate-800 p-4'
const h = 'mb-3 text-xs font-bold uppercase tracking-wider text-orange-300'
type Payout = { id: string; amount: number; expected: number; method: 'pix' | 'cash'; note: string | null; deliveries: number; paid_at: string }

function PaySheet({ p, rs, expected, deliveries, onClose, onDone }: { p: P; rs: RouteRow[]; expected: number; deliveries: number; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(String(expected))
  const [method, setMethod] = useState<'pix' | 'cash' | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const n = parseFloat(amount.replace(',', '.'))
  const valid = !!method && Number.isFinite(n) && n >= 0
  const pick = (on: boolean) => `flex-1 rounded-xl py-4 text-lg font-bold ${on ? 'bg-orange-500 text-slate-900' : 'bg-slate-800'}`
  async function confirm() {
    setBusy(true); setMsg('')
    const { data: pay, error } = await supabase.from('payouts').insert({ courier_id: p.id, amount: n, expected, method, note: note.trim() || null, deliveries }).select('id').single()
    if (error || !pay) { setBusy(false); setMsg(error?.message ?? 'Não foi possível registrar.'); return }
    const { error: e2 } = await supabase.from('routes').update({ payout_id: pay.id }).in('id', rs.map(r => r.id))
    if (e2) { await supabase.from('payouts').delete().eq('id', pay.id); setBusy(false); setMsg(e2.message); return }
    setBusy(false); onDone()
  }
  return (
    <Sheet title={`Registrar repasse · ${p.full_name || p.username}`} onClose={onClose}>
      <p className="mb-3 text-sm text-slate-400">{rs.length} rota(s) · {deliveries} entrega(s) · calculado pelo app: <b className="text-slate-200">{brl(expected)}</b></p>
      <label className="mb-1 block text-xs text-slate-400">Valor pago</label>
      <input className={`${field} mb-1`} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
      {Number.isFinite(n) && Math.abs(n - expected) > 0.001 && <p className="mb-2 text-xs text-amber-300">Diferente do calculado ({n > expected ? '+' : '−'}{brl(Math.abs(n - expected))}). Vale deixar uma observação.</p>}
      <p className="mb-2 mt-3 text-xs text-slate-400">Como foi pago?</p>
      <div className="mb-3 flex gap-3"><button className={pick(method === 'pix')} onClick={() => setMethod('pix')}>Pix</button><button className={pick(method === 'cash')} onClick={() => setMethod('cash')}>Dinheiro</button></div>
      <input className={`${field} mb-4`} placeholder="Observação (opcional)" value={note} onChange={e => setNote(e.target.value)} />
      {msg && <p className="mb-2 text-sm text-red-400">{msg}</p>}
      <button disabled={!valid || busy} onClick={confirm} className="w-full rounded-xl bg-emerald-500 py-4 text-lg font-bold text-slate-900 disabled:opacity-40">{busy ? 'Registrando…' : 'Confirmar repasse'}</button>
    </Sheet>
  )
}

const label = { draft: 'Rascunho', active: 'Em andamento', finished: 'Finalizada', cancelled: 'Cancelada' } as const

export default function CourierProfile({ p, routes, by, clients, onBack, onChanged }: { p: P; routes: RouteRow[]; by: Map<string, StopRow[]>; clients: number; onBack: () => void; onChanged: () => void }) {
  const [range, setRange] = useState<Range>(ranges().week)
  const [rate, setRate] = useState(p.pay_rate != null ? String(p.pay_rate) : '')
  const [def, setDef] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  const [open, setOpen] = useState<RouteRow | null>(null)
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [off, setOff] = useState<string[]>([])
  const [paying, setPaying] = useState(false)
  const loadPayouts = () => supabase.from('payouts').select('*').eq('courier_id', p.id).order('paid_at', { ascending: false }).then(({ data }) => setPayouts((data ?? []).map(x => ({ ...x, amount: Number(x.amount), expected: Number(x.expected) })) as Payout[]))
  useEffect(() => { void loadPayouts() }, [p.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { supabase.from('app_settings').select('value').eq('key', 'courier_fee').single().then(({ data }) => setDef(data ? Number(data.value) : 0)) }, [])

  const mine = useMemo(() => routes.filter(r => r.owner_id === p.id && r.status !== 'draft'), [routes, p.id])
  const inP = useMemo(() => mine.filter(r => inRange(r, range)), [mine, range])
  const a = useMemo(() => aggregate(inP, by), [inP, by])
  const R = ranges()
  const win = (r: Range) => aggregate(mine.filter(x => inRange(x, r)), by)
  const wk = win(R.week), mo = win(R.month), all = win(R.all)
  const eff = p.pay_rate ?? def ?? 0
  const pend = pendingPayout(mine, by)
  const chosen = pend.routes.filter(r => !off.includes(r.id))
  const chosenA = aggregate(chosen, by)
  async function undoPayout(x: Payout) {
    if (!window.confirm(`Desfazer o repasse de ${brl(x.amount)}? As rotas voltam a ficar pendentes.`)) return
    await supabase.from('payouts').delete().eq('id', x.id)
    await loadPayouts(); await refresh(); onChanged()
  }

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

      <div className={card}><p className={h}>💸 A repassar (pendente)</p>
        <div className="mb-3 rounded-xl bg-slate-900/60 p-4 text-center"><p className="text-sm text-slate-400">Ainda não pago</p><p className="text-3xl font-extrabold text-emerald-400">{brl(pend.amount)}</p><p className="text-sm text-slate-400">{pend.routes.length} rota(s) finalizada(s) · {pend.deliveries} entrega(s)</p></div>
        {pend.routes.length > 0 && <>
          <ul className="mb-3 flex flex-col gap-1 text-sm">{pend.routes.map(r => { const m = aggregate([r], by); const on = !off.includes(r.id); return (
            <li key={r.id}><label className="flex items-center gap-3 rounded-lg bg-slate-900/60 p-2"><input type="checkbox" checked={on} onChange={() => setOff(o => (on ? [...o, r.id] : o.filter(x => x !== r.id)))} className="h-5 w-5 accent-emerald-500" />
              <span className="min-w-0 flex-1 truncate">{fmtDate(r.go_at ?? r.created_at)} · {r.name}</span><span className="shrink-0 font-semibold">{brl(m.courierPay)}</span></label></li>) })}</ul>
          <button disabled={!chosen.length} onClick={() => setPaying(true)} className="w-full rounded-xl bg-emerald-500 py-4 text-lg font-bold text-slate-900 disabled:opacity-40">Registrar repasse de {brl(chosenA.courierPay)}</button></>}
        {pend.routes.length === 0 && <p className="text-sm text-slate-500">Nenhuma rota finalizada aguardando repasse.</p>}
      </div>
      {payouts.length > 0 && <div className={card}><p className={h}>🧾 Repasses feitos</p>
        <ul className="flex flex-col gap-2 text-sm">{payouts.map(x => <li key={x.id} className="rounded-xl bg-slate-900/60 p-3">
          <div className="flex justify-between gap-2"><span className="font-semibold">{fmtDate(x.paid_at)} · {x.method === 'pix' ? '💠 Pix' : '💵 Dinheiro'}</span><b className="text-emerald-400">{brl(x.amount)}</b></div>
          <p className="text-slate-400">{x.deliveries} entrega(s){Math.abs(x.amount - x.expected) > 0.001 ? ` · calculado ${brl(x.expected)}` : ''}{x.note ? ` · ${x.note}` : ''}</p>
          <button onClick={() => undoPayout(x)} className="mt-1 text-xs text-red-300 underline">desfazer</button></li>)}</ul></div>}

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
      {paying && <PaySheet p={p} rs={chosen} expected={chosenA.courierPay} deliveries={chosenA.delivered} onClose={() => setPaying(false)} onDone={() => { setPaying(false); setOff([]); void loadPayouts(); void refresh(); onChanged() }} />}
      {open && <RouteSummary route={open} stops={(by.get(open.id) ?? []).sort((x, y) => x.position - y.position)} owner={p.full_name || p.username} onClose={() => setOpen(null)} />}
    </main>
  )
}
