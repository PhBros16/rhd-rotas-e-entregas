import { useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { localDb } from '../lib/clients'
import { defer, deliver, doNow, fail, finishRoute, summarize, undo, type RouteRow, type StopRow } from '../lib/routes'
import { fmtPhone, mapsUrl, wazeUrl, whatsUrl } from '../lib/maplink'
import { brl } from './RouteBuilder'

const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—')
const fmtDur = (ms: number) => { const m = Math.max(0, Math.round(ms / 60000)); const h = Math.floor(m / 60); return h ? `${h}h${String(m % 60).padStart(2, '0')}` : `${m} min` }
const left = (iso: string | null, t: number) => { if (!iso) return 'no fim da rota'; const m = Math.round((new Date(iso).getTime() - t) / 60000); return m > 0 ? `volta em ${m} min` : m === 0 ? 'hora de voltar' : `atrasada ${-m} min` }
const isDue = (s: StopRow, t: number) => s.deferred && !!s.retry_at && new Date(s.retry_at).getTime() <= t
const dest = (s: StopRow) => (s.lat != null && s.lng != null ? { lat: s.lat, lng: s.lng } : [s.address, s.neighborhood, s.city, 'PE'].filter(Boolean).join(', '))
const btn = 'rounded-lg bg-slate-700 px-3 py-2 text-sm active:scale-95'
const field = 'w-full rounded-xl bg-slate-800 px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500'

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onClose}>
      <div className="mx-auto max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-slate-900 p-4 pb-8" onClick={e => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h3 className="font-bold">{title}</h3><button onClick={onClose} className={btn}>Cancelar</button></div>
        {children}
      </div>
    </div>
  )
}

function DeliverSheet({ s, onClose }: { s: StopRow; onClose: () => void }) {
  const [method, setMethod] = useState<'pix' | 'cash' | null>(null)
  const [diff, setDiff] = useState(false)
  const [amount, setAmount] = useState('')
  const [by, setBy] = useState('')
  const v = parseFloat(amount.replace(',', '.'))
  const final = diff ? v : Number(s.price)
  const valid = !!method && Number.isFinite(final) && final >= 0
  const pick = (on: boolean) => `flex-1 rounded-xl py-4 text-lg font-bold ${on ? 'bg-orange-500 text-slate-900' : 'bg-slate-800'}`
  return (
    <Sheet title={`Entrega · ${s.client_name}`} onClose={onClose}>
      <p className="mb-2 text-sm text-slate-400">Como foi pago?</p>
      <div className="mb-4 flex gap-3"><button className={pick(method === 'pix')} onClick={() => setMethod('pix')}>Pix</button><button className={pick(method === 'cash')} onClick={() => setMethod('cash')}>Dinheiro</button></div>
      <p className="mb-2 text-sm text-slate-400">Valor combinado: <span className="font-semibold text-slate-200">{brl(Number(s.price))}</span></p>
      <button onClick={() => setDiff(!diff)} className={`mb-2 rounded-lg px-3 py-2 text-sm ${diff ? 'bg-amber-500 font-semibold text-slate-900' : 'bg-slate-800 text-slate-300'}`}>{diff ? '✓ Pagamento diferente' : 'Pagamento diferente'}</button>
      {diff && <input className={`${field} mb-3`} inputMode="decimal" placeholder="Valor recebido (R$)" value={amount} onChange={e => setAmount(e.target.value)} autoFocus />}
      <input className={`${field} mb-4`} placeholder="Quem recebeu? (se não foi o cliente)" value={by} onChange={e => setBy(e.target.value)} />
      <button disabled={!valid} onClick={async () => { await deliver(s, { method: method!, amount: final, receivedBy: by }); onClose() }} className="w-full rounded-xl bg-emerald-500 py-4 text-lg font-bold text-slate-900 disabled:opacity-40">Confirmar entrega</button>
    </Sheet>
  )
}

function DeferSheet({ s, onClose }: { s: StopRow; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [time, setTime] = useState('')
  const [err, setErr] = useState('')
  const go = async (iso: string | null) => { await defer(s, iso, reason); onClose() }
  const inMin = (m: number) => new Date(Date.now() + m * 60000).toISOString()
  const at = () => {
    const [h, m] = time.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0)
    if (!time || d.getTime() <= Date.now()) { setErr('Escolha um horário que ainda não passou.'); return }
    void go(d.toISOString())
  }
  return (
    <Sheet title={`Voltar depois · ${s.client_name}`} onClose={onClose}>
      <p className="mb-2 text-sm text-slate-400">Motivo (opcional)</p>
      <div className="mb-2 flex flex-wrap gap-2">{['Cliente ausente', 'Pediu para voltar mais tarde', 'Sem contato'].map(r => <button key={r} onClick={() => setReason(r)} className={`${btn} ${reason === r ? '!bg-orange-500 text-slate-900' : ''}`}>{r}</button>)}</div>
      <input className={`${field} mb-4`} placeholder="Observação" value={reason} onChange={e => setReason(e.target.value)} />
      <p className="mb-2 text-sm text-slate-400">Voltar em…</p>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {[['30 minutos', 30], ['1 hora', 60], ['2 horas', 120]].map(([l, m]) => <button key={l} onClick={() => go(inMin(m as number))} className="rounded-xl bg-slate-800 py-4 font-semibold active:scale-95">{l}</button>)}
        <button onClick={() => go(null)} className="rounded-xl bg-slate-800 py-4 font-semibold active:scale-95">No fim da rota</button>
      </div>
      <div className="flex gap-2"><input type="time" className={field} value={time} onChange={e => { setTime(e.target.value); setErr('') }} /><button onClick={at} className="rounded-xl bg-orange-500 px-5 font-bold text-slate-900">Definir</button></div>
      {err && <p className="mt-2 text-sm text-amber-300">{err}</p>}
    </Sheet>
  )
}

function FailSheet({ s, onClose }: { s: StopRow; onClose: () => void }) {
  const [reason, setReason] = useState('')
  return (
    <Sheet title={`Não entregue · ${s.client_name}`} onClose={onClose}>
      <p className="mb-2 text-sm text-slate-400">Motivo (obrigatório)</p>
      <div className="mb-2 flex flex-wrap gap-2">{['Cliente ausente', 'Endereço não encontrado', 'Recusou o pedido', 'Sem contato'].map(r => <button key={r} onClick={() => setReason(r)} className={`${btn} ${reason === r ? '!bg-orange-500 text-slate-900' : ''}`}>{r}</button>)}</div>
      <textarea className={`${field} mb-4`} rows={3} placeholder="Escreva o motivo" value={reason} onChange={e => setReason(e.target.value)} />
      <button disabled={!reason.trim()} onClick={async () => { await fail(s, reason); onClose() }} className="w-full rounded-xl bg-red-500 py-4 text-lg font-bold text-white disabled:opacity-40">Marcar como não entregue</button>
    </Sheet>
  )
}

export function RouteSummary({ route, stops, onClose }: { route: RouteRow; stops: StopRow[]; onClose: () => void }) {
  const m = summarize(stops)
  const lost = stops.filter(s => s.status === 'failed' || s.status === 'skipped')
  const dur = route.go_at && route.finished_at ? fmtDur(new Date(route.finished_at).getTime() - new Date(route.go_at).getTime()) : '—'
  const text = [`*RHD · Relatório da rota*`, route.name ?? '', `${route.go_at ? new Date(route.go_at).toLocaleDateString('pt-BR') : ''} · ${fmtTime(route.go_at)} às ${fmtTime(route.finished_at)} (${dur})`, '',
    `Entregas feitas: ${m.delivered} de ${m.total}`, `Não entregues: ${m.failed + m.skipped}`, `Pacotes entregues: ${m.packages}`,
    `Recebido: ${brl(m.received)} (Pix ${brl(m.pix)} · Dinheiro ${brl(m.cash)})`, `Previsto: ${brl(m.planned)}`,
    ...(lost.length ? ['', 'Não entregues:', ...lost.map(s => `- ${s.client_name}${s.notes ? ` (${s.notes})` : ''}`)] : [])].join('\n')
  async function share() {
    try { if (navigator.share) await navigator.share({ text }); else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank') } catch { /* cancelado */ }
  }
  const row = (a: string, b: string) => <div className="flex justify-between gap-3 py-1"><span className="text-slate-400">{a}</span><span className="text-right font-semibold">{b}</span></div>
  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-slate-900">
      <div className="mx-auto max-w-lg p-4 pb-28">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Relatório da rota</h2><button onClick={onClose} className={btn}>Fechar</button></div>
        <p className="font-semibold">{route.name}</p>
        <p className="mb-4 text-sm text-slate-400">{route.go_at ? new Date(route.go_at).toLocaleDateString('pt-BR') : ''} · {fmtTime(route.go_at)} às {fmtTime(route.finished_at)} · {dur}</p>
        <div className="mb-4 divide-y divide-slate-700 rounded-2xl bg-slate-800 px-4 py-2">
          {row('Entregas feitas', `${m.delivered} de ${m.total}`)}{row('Não entregues', String(m.failed + m.skipped))}{row('Entregues na 2ª tentativa ou mais', String(m.retried.length))}
          {row('Pacotes entregues', String(m.packages))}{row('Previsto', brl(m.planned))}{row('Recebido', brl(m.received))}{row('  Pix', brl(m.pix))}{row('  Dinheiro', brl(m.cash))}
        </div>
        {m.diffs.length > 0 && <><h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-amber-300">Pagamento diferente</h3>
          <ul className="mb-4 rounded-2xl bg-slate-800 p-3 text-sm">{m.diffs.map(s => <li key={s.id} className="flex justify-between gap-2 py-1"><span className="truncate">{s.client_name}</span><span className="shrink-0 text-slate-300">{brl(Number(s.price))} → {brl(Number(s.paid_amount ?? 0))}</span></li>)}</ul></>}
        {lost.length > 0 && <><h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-red-300">Não entregues</h3>
          <ul className="mb-4 rounded-2xl bg-slate-800 p-3 text-sm">{lost.map(s => <li key={s.id} className="py-1"><span className="font-semibold">{s.client_name}</span><span className="text-slate-400"> · {s.status === 'skipped' ? 'não realizada' : s.notes}</span></li>)}</ul></>}
        <button onClick={share} className="w-full rounded-xl bg-orange-500 py-4 text-lg font-bold text-slate-900">Compartilhar no WhatsApp</button>
      </div>
    </div>
  )
}

export default function ActiveRoute({ routeId, onClose }: { routeId: string; onClose: () => void }) {
  const route = useLiveQuery(() => localDb.routes.get(routeId), [routeId])
  const stops = useLiveQuery(() => localDb.stops.where('route_id').equals(routeId).toArray(), [routeId]) ?? []
  const waiting = useLiveQuery(() => localDb.outbox.count(), []) ?? 0
  const [t, setT] = useState(Date.now())
  const [sheet, setSheet] = useState<{ kind: 'deliver' | 'defer' | 'fail'; s: StopRow } | null>(null)
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => { const i = setInterval(() => setT(Date.now()), 30000); return () => clearInterval(i) }, [])
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  useEffect(() => { // mantém a tela acesa durante a rota
    let lock: { release: () => Promise<void> } | null = null
    const ask = async () => { try { lock = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null } catch { /* sem suporte */ } }
    void ask()
    const vis = () => { if (document.visibilityState === 'visible') void ask() }
    document.addEventListener('visibilitychange', vis)
    return () => { document.removeEventListener('visibilitychange', vis); void lock?.release() }
  }, [])

  if (!route) return null
  if (route.status === 'finished') return <RouteSummary route={route} stops={stops} onClose={onClose} />

  const byPos = [...stops].sort((a, b) => a.position - b.position)
  const queue = byPos.filter(s => s.status === 'pending' && !s.deferred)
  const later = byPos.filter(s => s.status === 'pending' && s.deferred)
  const done = byPos.filter(s => s.status !== 'pending').sort((a, b) => (b.delivered_at ?? '').localeCompare(a.delivered_at ?? ''))
  const next = queue[0]
  const m = summarize(stops)
  const due = later.filter(s => isDue(s, t))

  async function finish() {
    const pend = queue.length + later.length
    if (pend && !window.confirm(`Ainda há ${pend} parada(s) sem resultado (${later.length} para voltar). Finalizar mesmo assim? Elas ficam como "não realizadas".`)) return
    if (!pend && !window.confirm('Finalizar a rota?')) return
    await finishRoute(route!, stops)
  }

  const nav = (s: StopRow) => (
    <div className="flex flex-wrap gap-2">
      {s.phone && <a className={btn} href={whatsUrl(s.phone)} target="_blank" rel="noreferrer">WhatsApp</a>}
      {s.phone && <a className={btn} href={`tel:${s.phone}`}>Ligar</a>}
      <a className={btn} href={mapsUrl(dest(s))} target="_blank" rel="noreferrer">Maps</a>
      <a className={btn} href={wazeUrl(dest(s))} target="_blank" rel="noreferrer">Waze</a>
    </div>
  )

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-slate-900">
      <div className="mx-auto max-w-lg p-4 pb-28">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="min-w-0"><h2 className="truncate font-bold">{route.name}</h2><p className="text-sm text-slate-400">Em andamento · {route.go_at ? fmtDur(t - new Date(route.go_at).getTime()) : ''} · {m.delivered}/{m.total} entregues · {brl(m.received)}</p></div>
          <button onClick={onClose} className={btn}>Voltar</button>
        </div>
        {(waiting > 0 || !online) && <p className="mb-3 rounded-lg bg-amber-500/20 p-2 text-sm text-amber-300">{!online ? 'Sem internet. ' : ''}{waiting > 0 ? `${waiting} alteração(ões) salva(s) no aparelho, enviando quando a conexão voltar.` : 'Suas ações ficam salvas no aparelho.'}</p>}
        {due.length > 0 && <div className="mb-3 rounded-xl bg-orange-500/20 p-3 text-sm text-orange-200"><p className="font-semibold">Hora de voltar:</p>{due.map(s => <div key={s.id} className="mt-1 flex items-center justify-between gap-2"><span className="truncate">{s.client_name}</span><button onClick={() => doNow(s)} className="shrink-0 rounded-lg bg-orange-500 px-3 py-1 font-semibold text-slate-900">Fazer agora</button></div>)}</div>}

        {next ? (
          <section className="mb-5 rounded-2xl bg-slate-800 p-4 ring-2 ring-orange-500">
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-400">Próxima parada</p>
            <p className="mt-1 text-xl font-bold">{next.client_name}</p>
            <p className="text-slate-300">{next.address || 'Sem endereço'}</p>
            <p className="mb-2 text-sm text-slate-400">{[next.neighborhood, next.city].filter(Boolean).join(' · ')}{next.phone ? ` · ${fmtPhone(next.phone)}` : ''}</p>
            <p className="mb-3 text-sm"><span className="font-semibold text-orange-300">{brl(Number(next.price))}</span> · {next.packages} pacote(s){next.attempt_count > 0 ? ` · ${next.attempt_count}ª tentativa já feita` : ''}</p>
            {next.notes && <p className="mb-3 rounded-lg bg-slate-700/60 p-2 text-sm text-slate-300">{next.notes}</p>}
            <div className="mb-4">{nav(next)}</div>
            <button onClick={() => setSheet({ kind: 'deliver', s: next })} className="mb-2 w-full rounded-xl bg-emerald-500 py-4 text-lg font-bold text-slate-900 active:scale-[0.99]">Entregue</button>
            <div className="flex gap-2"><button onClick={() => setSheet({ kind: 'defer', s: next })} className="flex-1 rounded-xl bg-slate-700 py-3 font-semibold">Voltar depois</button><button onClick={() => setSheet({ kind: 'fail', s: next })} className="flex-1 rounded-xl bg-red-500/20 py-3 font-semibold text-red-300">Não entregue</button></div>
          </section>
        ) : (
          <section className="mb-5 rounded-2xl bg-slate-800 p-5 text-center"><p className="text-lg font-bold">{later.length ? 'Só restam paradas para voltar' : 'Todas as paradas foram feitas'}</p><p className="text-sm text-slate-400">{later.length ? 'Toque em “Fazer agora” numa delas, ou finalize a rota.' : 'Finalize a rota para ver o relatório.'}</p></section>
        )}

        {queue.length > 1 && <><h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Depois ({queue.length - 1})</h3>
          <ul className="mb-5 flex flex-col gap-2">{queue.slice(1).map(s => <li key={s.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-800 p-3"><div className="min-w-0"><p className="truncate font-semibold">{s.client_name}</p><p className="truncate text-sm text-slate-400">{s.neighborhood} · {brl(Number(s.price))}</p></div><button onClick={() => doNow(s)} className={`${btn} shrink-0`}>Fazer agora</button></li>)}</ul></>}

        {later.length > 0 && <><h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-orange-300">Para voltar ({later.length})</h3>
          <ul className="mb-5 flex flex-col gap-2">{later.map(s => <li key={s.id} className={`flex items-center justify-between gap-2 rounded-xl p-3 ${isDue(s, t) ? 'bg-orange-500/20' : 'bg-slate-800'}`}><div className="min-w-0"><p className="truncate font-semibold">{s.client_name}</p><p className="truncate text-sm text-slate-400">{left(s.retry_at, t)}{s.retry_at ? ` (${fmtTime(s.retry_at)})` : ''}{s.notes ? ` · ${s.notes}` : ''}</p></div><button onClick={() => doNow(s)} className={`${btn} shrink-0`}>Fazer agora</button></li>)}</ul></>}

        {done.length > 0 && <><h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Concluídas ({done.length})</h3>
          <ul className="mb-5 flex flex-col gap-2">{done.map(s => <li key={s.id} className="rounded-xl bg-slate-800/60 p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-semibold">{s.status === 'delivered' ? '✓' : '✗'} {s.client_name}</p>
            <p className="text-sm text-slate-400">{s.status === 'delivered' ? `${s.pay_method === 'pix' ? 'Pix' : 'Dinheiro'} ${brl(Number(s.paid_amount ?? 0))}${s.pay_differs ? ' (diferente)' : ''}${s.attempt_count > 1 ? ` · ${s.attempt_count}ª tentativa` : ''}${s.received_by ? ` · recebeu: ${s.received_by}` : ''}` : s.status === 'skipped' ? 'Não realizada' : `Não entregue: ${s.notes}`}</p></div>
            <button onClick={() => undo(s)} className={`${btn} shrink-0`}>Desfazer</button></div></li>)}</ul></>}
      </div>
      <div className="fixed inset-x-0 bottom-0 bg-slate-900 p-4"><div className="mx-auto max-w-lg"><button onClick={finish} className="w-full rounded-xl bg-slate-700 py-4 text-lg font-bold">Finalizar rota</button></div></div>
      {sheet?.kind === 'deliver' && <DeliverSheet s={sheet.s} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'defer' && <DeferSheet s={sheet.s} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'fail' && <FailSheet s={sheet.s} onClose={() => setSheet(null)} />}
    </div>
  )
}
