import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouteData } from '../lib/data'
import { aggregate, pendingPayout } from '../lib/stats'
import { brl, fmtDate } from '../lib/format'

type Payout = { id: string; amount: number; expected: number; method: 'pix' | 'cash'; note: string | null; deliveries: number; paid_at: string }
const card = 'mb-4 rounded-2xl bg-slate-800 p-4'
const h = 'mb-3 text-xs font-bold uppercase tracking-wider text-orange-300'

/** Tela do entregador: quanto tem a receber e o que já recebeu. */
export default function MyPayouts({ userId }: { userId: string }) {
  const { routes, by, ready } = useRouteData()
  const [payouts, setPayouts] = useState<Payout[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('payouts').select('*').eq('courier_id', userId).order('paid_at', { ascending: false }).then(({ data, error }) => {
      if (error) { setFailed(true); return }
      setFailed(false)
      setPayouts((data ?? []).map(x => ({ ...x, amount: Number(x.amount), expected: Number(x.expected) })) as Payout[])
    })
  }, [userId])

  const mine = useMemo(() => routes.filter(r => r.owner_id === userId && r.status !== 'draft'), [routes, userId])
  const pend = useMemo(() => pendingPayout(mine, by), [mine, by])
  const received = (payouts ?? []).reduce((s, x) => s + x.amount, 0)
  const sorted = [...pend.routes].sort((x, y) => (y.go_at ?? y.created_at).localeCompare(x.go_at ?? x.created_at))

  return (
    <main className="mx-auto max-w-lg p-4 pb-10">
      <h1 className="mb-4 text-xl font-extrabold">Meus repasses</h1>

      <div className={card}><p className={h}>💸 A receber</p>
        <div className="mb-3 rounded-xl bg-slate-900/60 p-4 text-center">
          <p className="text-sm text-slate-400">Ainda não pago</p>
          <p className="text-3xl font-extrabold text-emerald-400">{brl(pend.amount)}</p>
          <p className="text-sm text-slate-400">{pend.routes.length} rota(s) finalizada(s) · {pend.deliveries} entrega(s)</p>
        </div>
        {!ready && <p className="text-sm text-slate-500">Carregando…</p>}
        {ready && sorted.length === 0 && <p className="text-sm text-slate-500">Nada pendente no momento.</p>}
        <ul className="flex flex-col gap-1 text-sm">{sorted.map(r => (
          <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-900/60 p-2">
            <span className="min-w-0 flex-1 truncate">{fmtDate(r.go_at ?? r.created_at)} · {r.name}</span>
            <span className="shrink-0 font-semibold">{brl(aggregate([r], by).courierPay)}</span>
          </li>))}</ul>
        <p className="mt-2 text-xs text-slate-500">Só entregas feitas entram na conta. Rotas em andamento aparecem aqui quando forem finalizadas.</p>
      </div>

      <div className={card}><p className={h}>🧾 Já recebi</p>
        {payouts === null && !failed && <p className="text-sm text-slate-500">Carregando…</p>}
        {failed && <p className="text-sm text-amber-300">Não foi possível carregar agora. Verifique a internet e abra de novo.</p>}
        {payouts && payouts.length > 0 && <div className="mb-3 rounded-xl bg-slate-900/60 p-3 text-center"><p className="text-xs text-slate-400">Total recebido</p><p className="text-xl font-extrabold text-emerald-400">{brl(received)}</p></div>}
        {payouts && payouts.length === 0 && <p className="text-sm text-slate-500">Nenhum repasse registrado ainda.</p>}
        <ul className="flex flex-col gap-2 text-sm">{(payouts ?? []).map(x => {
          const rs = mine.filter(r => r.payout_id === x.id)
          const on = open === x.id
          return (<li key={x.id} className="rounded-xl bg-slate-900/60 p-3">
            <button className="w-full text-left" onClick={() => setOpen(on ? null : x.id)}>
              <div className="flex justify-between gap-2"><span className="font-semibold">{fmtDate(x.paid_at)} · {x.method === 'pix' ? '💠 Pix' : '💵 Dinheiro'}</span><b className="text-emerald-400">{brl(x.amount)}</b></div>
              <p className="text-slate-400">{x.deliveries} entrega(s){x.note ? ` · ${x.note}` : ''}{rs.length ? ` · ${on ? 'ocultar' : 'ver'} rotas` : ''}</p>
            </button>
            {on && <ul className="mt-2 flex flex-col gap-1 border-t border-slate-700 pt-2">{rs.map(r => <li key={r.id} className="flex justify-between gap-2 text-slate-300"><span className="min-w-0 truncate">{fmtDate(r.go_at ?? r.created_at)} · {r.name}</span><span className="shrink-0">{brl(aggregate([r], by).courierPay)}</span></li>)}</ul>}
          </li>)
        })}</ul>
      </div>
    </main>
  )
}
