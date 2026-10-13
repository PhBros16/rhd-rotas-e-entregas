import { useState } from 'react'
import { summarize, type RouteRow, type StopRow } from '../lib/routes'
import { brl, dayLabel, dayKeyOf, fmtDur, fmtTime } from '../lib/format'
import { buildReport, copyText, groupByHood, shareText } from '../lib/report'
import { btn } from './StopSheets'

export default function RouteSummary({ route, stops, owner, onClose }: { route: RouteRow; stops: StopRow[]; owner: string; onClose: () => void }) {
  const m = summarize(stops)
  const lost = stops.filter(s => s.status === 'failed' || s.status === 'skipped')
  const dur = route.go_at && route.finished_at ? fmtDur(new Date(route.finished_at).getTime() - new Date(route.go_at).getTime()) : '—'
  const text = buildReport(route, stops, owner)
  const [msg, setMsg] = useState('')
  const card = 'mb-4 rounded-2xl bg-slate-800 p-4'
  const h = 'mb-2 text-xs font-bold uppercase tracking-wider'
  const row = (a: string, b: string, strong = false) => <div className="flex justify-between gap-3 py-1 text-sm"><span className="text-slate-400">{a}</span><span className={`text-right ${strong ? 'text-base font-bold' : 'font-semibold'}`}>{b}</span></div>
  const big = (a: string, b: string) => <div className="rounded-2xl bg-slate-800 p-3"><p className="text-xs text-slate-400">{a}</p><p className="text-xl font-extrabold">{b}</p></div>
  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-slate-900">
      <div className="mx-auto max-w-lg p-4 pb-32">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">📋 Relatório da rota</h2><button onClick={onClose} className={btn}>Fechar</button></div>
        <div className="mb-4 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 p-4 text-slate-900">
          <p className="text-lg font-extrabold">{route.name}</p>
          <p className="text-sm font-medium">👤 {owner}{route.go_at ? ` · ${dayLabel(dayKeyOf(route.go_at))}` : ''}</p>
          <p className="text-sm font-medium">⏱ {fmtTime(route.go_at)} → {fmtTime(route.finished_at)} · <b>{dur}</b></p>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-2">{big('✅ Entregues', `${m.delivered} de ${m.total}`)}{big('❌ Não entregues', String(m.failed + m.skipped))}{big('📦 Pacotes', String(m.packages))}{big('🔁 Após voltar', String(m.retried.length))}</div>
        <div className={card}><p className={`${h} text-emerald-300`}>💰 Financeiro</p>{row('Previsto', brl(m.planned))}{row('Recebido', brl(m.received), true)}{row('💠 Pix', brl(m.pix))}{row('💵 Dinheiro', brl(m.cash))}</div>
        {m.diffs.length > 0 && <div className={card}><p className={`${h} text-amber-300`}>⚠️ Pagamento diferente ({m.diffs.length})</p>{m.diffs.map(s => row(s.client_name, `${brl(Number(s.price))} → ${brl(Number(s.paid_amount ?? 0))}`))}</div>}
        {lost.length > 0 && <div className={card}><p className={`${h} text-red-300`}>❌ Não entregues ({lost.length})</p>{lost.map(s => <div key={s.id} className="py-1 text-sm"><b>{s.client_name}</b><span className="text-slate-400"> — {s.status === 'skipped' ? 'não realizada' : s.notes}</span></div>)}</div>}
        <p className={`${h} mt-6 text-orange-300`}>📍 Entregas por bairro</p>
        {groupByHood(stops).map(([hood, list]) => { const ok = list.filter(s => s.status === 'delivered'); return (
          <div key={hood} className={card}>
            <div className="mb-2 flex items-baseline justify-between gap-2"><p className="font-bold">{hood}</p><p className="shrink-0 text-xs text-slate-400">{ok.length}/{list.length} · {brl(ok.reduce((a, s) => a + Number(s.paid_amount ?? 0), 0))}</p></div>
            <ol className="flex flex-col gap-2 text-sm">{list.map((s, i) => <li key={s.id}>
              <p><span className="text-slate-500">{i + 1}.</span> {s.status === 'delivered' ? '✅' : '❌'} <b>{s.client_name}</b>{s.status === 'delivered' && <span className="text-slate-500"> · {fmtTime(s.delivered_at)}</span>}</p>
              <p className="pl-6 text-slate-400">{s.status === 'delivered' ? `${s.pay_method === 'pix' ? '💠 Pix' : '💵 Dinheiro'} ${brl(Number(s.paid_amount ?? 0))} · ${s.packages} pct${s.attempt_count > 1 ? ` · 🔁 ${s.attempt_count}ª tentativa` : ''}${s.received_by ? ` · recebeu: ${s.received_by}` : ''}` : s.status === 'skipped' ? 'Não realizada' : s.notes}</p>
            </li>)}</ol>
          </div>) })}
      </div>
      <div className="fixed inset-x-0 bottom-0 bg-slate-900 p-4"><div className="mx-auto max-w-lg">
        {msg && <p className="mb-2 text-center text-sm text-emerald-300">{msg}</p>}
        <div className="flex gap-2">
          <button onClick={async () => { const r = await shareText(text); if (r === 'copied') setMsg('Relatório copiado. Cole no WhatsApp.') }} className="flex-1 rounded-xl bg-orange-500 py-4 text-lg font-bold text-slate-900">Compartilhar no WhatsApp</button>
          <button onClick={async () => setMsg((await copyText(text)) ? 'Relatório copiado.' : 'Não foi possível copiar.')} className="rounded-xl bg-slate-700 px-5 font-semibold">Copiar</button>
        </div>
      </div></div>
    </div>
  )
}
