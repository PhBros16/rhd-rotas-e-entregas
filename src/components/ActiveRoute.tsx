import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { localDb } from '../lib/clients'
import { doNow, finishRoute, summarize, undo, type StopRow } from '../lib/routes'
import { fmtPhone, mapsUrl, wazeUrl, whatsUrl } from '../lib/maplink'
import { brl, fmtDur, fmtTime } from '../lib/format'
import { buildBackup, shareText, stopDest } from '../lib/report'
import RouteSummary from './RouteSummary'
import { DeferSheet, DeliverSheet, FailSheet, Sheet, btn } from './StopSheets'

const left = (iso: string | null, t: number) => { if (!iso) return 'no fim da rota'; const m = Math.round((new Date(iso).getTime() - t) / 60000); return m > 0 ? `volta em ${m} min` : m === 0 ? 'hora de voltar' : `atrasada ${-m} min` }
const isDue = (s: StopRow, t: number) => s.deferred && !!s.retry_at && new Date(s.retry_at).getTime() <= t

function beep() {
  try {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new C(), o = ctx.createOscillator(), g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.value = 0.2
    o.start(); o.stop(ctx.currentTime + 0.4); setTimeout(() => void ctx.close(), 700)
  } catch { /* sem áudio */ }
}

function Fold({ title, count, tone, children }: { title: string; count: number; tone?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  if (!count) return null
  return (
    <section className="mb-2 rounded-2xl bg-slate-800/70">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between p-4 text-left">
        <span className={`font-semibold ${tone ?? ''}`}>{title} <span className="text-slate-500">({count})</span></span><span className="text-slate-500">{open ? '▴' : '▾'}</span>
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </section>
  )
}

export default function ActiveRoute({ routeId, owner, askBackup, onClose }: { routeId: string; owner: string; askBackup?: boolean; onClose: () => void }) {
  const route = useLiveQuery(() => localDb.routes.get(routeId), [routeId])
  const stops = useLiveQuery(() => localDb.stops.where('route_id').equals(routeId).toArray(), [routeId]) ?? []
  const waiting = useLiveQuery(() => localDb.outbox.count(), []) ?? 0
  const [t, setT] = useState(Date.now())
  const [sheet, setSheet] = useState<{ kind: 'deliver' | 'defer' | 'fail'; s: StopRow } | null>(null)
  const [panel, setPanel] = useState<null | 'nav' | 'menu' | 'backup' | 'all'>(askBackup ? 'backup' : null)
  const [online, setOnline] = useState(navigator.onLine)
  const [note, setNote] = useState('')
  const notified = useRef<Set<string>>(new Set())

  useEffect(() => { const i = setInterval(() => setT(Date.now()), 20000); return () => clearInterval(i) }, [])
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  useEffect(() => { // tela acesa durante a rota
    let lock: { release: () => Promise<void> } | null = null
    const ask = async () => { try { lock = (await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen')) ?? null } catch { /* sem suporte */ } }
    void ask()
    const vis = () => { if (document.visibilityState === 'visible') void ask() }
    document.addEventListener('visibilitychange', vis)
    return () => { document.removeEventListener('visibilitychange', vis); void lock?.release() }
  }, [])

  const dueIds = stops.filter(s => s.status === 'pending' && isDue(s, t)).map(s => s.id).join(',')
  useEffect(() => { // vibra e apita quando uma parada adiada chega na hora
    const ids = new Set(dueIds ? dueIds.split(',') : [])
    const fresh = [...ids].filter(id => !notified.current.has(id))
    notified.current = ids
    if (fresh.length) { try { navigator.vibrate?.([250, 120, 250, 120, 250]) } catch { /* ignora */ } beep() }
  }, [dueIds])

  if (!route) return null
  if (route.status === 'finished') return <RouteSummary route={route} stops={stops} owner={owner} onClose={onClose} />

  const byPos = [...stops].sort((a, b) => a.position - b.position)
  const queue = byPos.filter(s => s.status === 'pending' && !s.deferred)
  const later = byPos.filter(s => s.status === 'pending' && s.deferred)
  const done = byPos.filter(s => s.status !== 'pending').sort((a, b) => (b.delivered_at ?? '').localeCompare(a.delivered_at ?? ''))
  const next = queue[0]
  const m = summarize(stops)
  const due = later.filter(s => isDue(s, t))
  const finished = m.delivered + m.failed + m.skipped
  const pctDone = stops.length ? Math.round((finished / stops.length) * 100) : 0

  async function finish() {
    const pend = queue.length + later.length
    const msg = pend ? `Ainda há ${pend} parada(s) sem resultado (${later.length} para voltar). Finalizar mesmo assim? Elas ficam como "não realizadas".` : 'Finalizar a rota e gerar o relatório?'
    if (window.confirm(msg)) { setPanel(null); await finishRoute(route!, stops) }
  }
  async function sendBackup() {
    const r = await shareText(buildBackup(route!, stops, owner))
    setNote(r === 'copied' ? 'Backup copiado. Cole no WhatsApp.' : r === 'cancelled' ? '' : 'Backup pronto para enviar.')
    setPanel(null)
  }

  const act = 'flex-1 rounded-xl py-3 font-semibold active:scale-95'
  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-slate-900">
      <div className="sticky top-0 z-10 bg-slate-900/95 px-4 pb-2 pt-3 backdrop-blur"><div className="mx-auto max-w-lg">
        <div className="flex items-center gap-2"><button onClick={onClose} className={btn}>←</button><p className="min-w-0 flex-1 truncate font-bold">{route.name}</p><button onClick={() => setPanel('menu')} className={btn} aria-label="Menu">⋯</button></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${pctDone}%` }} /></div>
        <p className="mt-1 flex items-center justify-between text-sm"><span className="font-semibold">{m.delivered}/{m.total} entregues</span><span className="font-extrabold text-emerald-400">💼 {brl(m.courierPay)}</span><span className="text-slate-400">{route.go_at ? fmtDur(t - new Date(route.go_at).getTime()) : ''}</span></p>
      </div></div>

      <div className="mx-auto max-w-lg px-4 pb-64 pt-2">
        {(waiting > 0 || !online) && <p className="mb-3 rounded-lg bg-amber-500/20 p-2 text-sm text-amber-300">{!online ? 'Sem internet. ' : ''}{waiting > 0 ? `${waiting} ação(ões) salva(s) no aparelho. Enviando quando a conexão voltar.` : 'Suas ações ficam salvas no aparelho.'}</p>}
        {note && <p className="mb-3 rounded-lg bg-emerald-500/20 p-2 text-sm text-emerald-200">{note}</p>}
        {due.length > 0 && <div className="mb-3 rounded-xl bg-orange-500 p-3 text-slate-900"><p className="font-bold">⏰ Hora de voltar</p>{due.map(s => <div key={s.id} className="mt-1 flex items-center justify-between gap-2"><span className="truncate font-medium">{s.client_name}</span><button onClick={() => doNow(s)} className="shrink-0 rounded-lg bg-slate-900 px-3 py-1 font-semibold text-white">Fazer agora</button></div>)}</div>}

        {next ? (
          <section className="mb-4 pt-2">
            <p className="text-xs font-bold uppercase tracking-widest text-orange-400">Parada {finished + 1} de {stops.length}</p>
            <h2 className="mt-1 text-3xl font-extrabold leading-tight">{next.client_name}</h2>
            <p className="mt-2 text-xl text-slate-200">{next.address || 'Sem endereço'}</p>
            <p className="text-slate-400">{[next.neighborhood, next.city].filter(Boolean).join(' · ')}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
              <span className="rounded-full bg-orange-500/20 px-3 py-1 text-orange-300">{brl(Number(next.price))}</span>
              <span className="rounded-full bg-slate-800 px-3 py-1">📦 {next.packages} pacote{next.packages > 1 ? 's' : ''}</span>
              {next.attempt_count > 0 && <span className="rounded-full bg-sky-500/20 px-3 py-1 text-sky-300">🔁 {next.attempt_count + 1}ª tentativa</span>}
            </div>
            {next.client_notes && <p className="mt-3 rounded-xl bg-slate-800 p-3 text-slate-200">📝 {next.client_notes}</p>}
            {next.notes && <p className="mt-2 rounded-xl bg-slate-800/60 p-3 text-sm text-slate-300">Última vez: {next.notes}</p>}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button onClick={() => setPanel('nav')} className="rounded-xl bg-slate-800 py-3 text-sm font-semibold active:scale-95">🧭<br />Navegar</button>
              {next.phone ? <a href={whatsUrl(next.phone)} target="_blank" rel="noreferrer" className="rounded-xl bg-slate-800 py-3 text-center text-sm font-semibold active:scale-95">💬<br />WhatsApp</a> : <span />}
              {next.phone ? <a href={`tel:${next.phone}`} className="rounded-xl bg-slate-800 py-3 text-center text-sm font-semibold active:scale-95">📞<br />Ligar</a> : <span />}
            </div>
            {next.phone && <p className="mt-2 text-center text-xs text-slate-500">{fmtPhone(next.phone)}</p>}
          </section>
        ) : (
          <section className="mb-4 rounded-2xl bg-slate-800 p-6 text-center">
            <p className="text-4xl">{later.length ? '⏳' : '🎉'}</p>
            <p className="mt-2 text-lg font-bold">{later.length ? 'Só restam paradas para voltar' : 'Todas as paradas foram feitas'}</p>
            <p className="text-sm text-slate-400">{later.length ? 'Abra “Para voltar” e toque em Fazer agora, ou finalize a rota.' : 'Finalize para gerar o relatório.'}</p>
          </section>
        )}

        <Fold title="Próximas" count={Math.max(0, queue.length - 1)}>
          <ul className="flex flex-col gap-1">{queue.slice(1).map((s, i) => <li key={s.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-800 p-3"><div className="min-w-0"><p className="truncate font-semibold"><span className="text-slate-500">{finished + i + 2}.</span> {s.client_name}</p><p className="truncate text-sm text-slate-400">{s.neighborhood} · {brl(Number(s.price))}</p></div><button onClick={() => doNow(s)} className={`${btn} shrink-0`}>Agora</button></li>)}</ul>
        </Fold>
        <Fold title="⏳ Para voltar" count={later.length} tone="text-orange-300">
          <ul className="flex flex-col gap-1">{later.map(s => <li key={s.id} className={`flex items-center justify-between gap-2 rounded-xl p-3 ${isDue(s, t) ? 'bg-orange-500/20' : 'bg-slate-800'}`}><div className="min-w-0"><p className="truncate font-semibold">{s.client_name}</p><p className="truncate text-sm text-slate-400">{left(s.retry_at, t)}{s.retry_at ? ` (${fmtTime(s.retry_at)})` : ''}{s.notes ? ` · ${s.notes}` : ''}</p></div><button onClick={() => doNow(s)} className={`${btn} shrink-0`}>Agora</button></li>)}</ul>
        </Fold>
        <Fold title="✓ Concluídas" count={done.length}>
          <ul className="flex flex-col gap-1">{done.map(s => <li key={s.id} className="flex items-start justify-between gap-2 rounded-xl bg-slate-800 p-3"><div className="min-w-0"><p className="truncate font-semibold">{s.status === 'delivered' ? '✅' : '❌'} {s.client_name}</p>
            <p className="text-sm text-slate-400">{s.status === 'delivered' ? `${s.pay_method === 'pix' ? 'Pix' : 'Dinheiro'} ${brl(Number(s.paid_amount ?? 0))}${s.pay_differs ? ' (diferente)' : ''}${s.attempt_count > 1 ? ` · ${s.attempt_count}ª tentativa` : ''}${s.received_by ? ` · recebeu: ${s.received_by}` : ''}` : s.status === 'skipped' ? 'Não realizada' : s.notes}</p></div>
            <button onClick={() => undo(s)} className={`${btn} shrink-0`}>Desfazer</button></li>)}</ul>
        </Fold>
      </div>

      <div className="fixed inset-x-0 bottom-0 bg-slate-900 px-4 pb-4 pt-3 shadow-[0_-8px_20px_rgba(0,0,0,0.4)]"><div className="mx-auto max-w-lg">
        {next ? (<>
          <button onClick={() => setSheet({ kind: 'deliver', s: next })} className="mb-2 w-full rounded-2xl bg-emerald-500 py-5 text-2xl font-extrabold text-slate-900 active:scale-[0.98]">Entregue ✓</button>
          <div className="flex gap-2"><button onClick={() => setSheet({ kind: 'defer', s: next })} className={`${act} bg-slate-800`}>⏳ Voltar depois</button><button onClick={() => setSheet({ kind: 'fail', s: next })} className={`${act} bg-red-500/20 text-red-300`}>Não entregue</button></div>
        </>) : <button onClick={finish} className="w-full rounded-2xl bg-orange-500 py-5 text-xl font-extrabold text-slate-900">Finalizar rota</button>}
      </div></div>

      {sheet?.kind === 'deliver' && <DeliverSheet s={sheet.s} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'defer' && <DeferSheet s={sheet.s} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'fail' && <FailSheet s={sheet.s} onClose={() => setSheet(null)} />}
      {panel === 'nav' && next && <Sheet title="Abrir no mapa" onClose={() => setPanel(null)}><div className="flex flex-col gap-2">
        <a onClick={() => setPanel(null)} href={mapsUrl(stopDest(next))} target="_blank" rel="noreferrer" className="rounded-xl bg-slate-800 py-4 text-center text-lg font-bold">Google Maps</a>
        <a onClick={() => setPanel(null)} href={wazeUrl(stopDest(next))} target="_blank" rel="noreferrer" className="rounded-xl bg-slate-800 py-4 text-center text-lg font-bold">Waze</a></div></Sheet>}
      {panel === 'menu' && <Sheet title="Menu da rota" onClose={() => setPanel(null)}><div className="flex flex-col gap-2">
        <button onClick={() => setPanel('all')} className="rounded-xl bg-slate-800 py-4 text-lg font-bold">📋 Ver rota completa</button>
        <button onClick={sendBackup} className="rounded-xl bg-slate-800 py-4 text-lg font-bold">📤 Enviar backup das pendentes</button>
        <button onClick={finish} className="rounded-xl bg-slate-800 py-4 text-lg font-bold">🏁 Finalizar rota</button></div></Sheet>}
      {panel === 'all' && <Sheet title={`Rota completa (${byPos.length})`} onClose={() => setPanel(null)}><ul className="flex flex-col gap-1">{byPos.map((s, i) => <li key={s.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-800 p-3"><div className="min-w-0"><p className="truncate font-semibold"><span className="text-slate-500">{i + 1}.</span> {s.status === 'delivered' ? '✅' : s.status === 'pending' ? (s.deferred ? '⏳' : '•') : '❌'} {s.client_name}</p><p className="truncate text-sm text-slate-400">{s.neighborhood} · {brl(Number(s.price))} · 💼 {brl(Number(s.courier_pay ?? 0))}</p></div>{s.status === 'pending' && s !== next && <button onClick={() => { void doNow(s); setPanel(null) }} className={`${btn} shrink-0`}>Agora</button>}</li>)}</ul></Sheet>}
      {panel === 'backup' && <Sheet title="Rota iniciada! 🚀" onClose={() => setPanel(null)}>
        <p className="mb-4 text-slate-300">Envie o <b>backup</b> das entregas para o seu WhatsApp. Se o app falhar no meio do caminho, você continua com a lista completa: endereços, valores, telefones e localizações.</p>
        <button onClick={sendBackup} className="mb-2 w-full rounded-xl bg-orange-500 py-4 text-lg font-bold text-slate-900">📤 Enviar backup agora</button>
        <button onClick={() => setPanel(null)} className="w-full rounded-xl bg-slate-800 py-3">Agora não</button></Sheet>}
    </div>
  )
}
