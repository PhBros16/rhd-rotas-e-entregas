import { useState, type ReactNode } from 'react'
import { defer, deliver, fail, type StopRow } from '../lib/routes'
import { brl } from '../lib/format'

export const btn = 'rounded-lg bg-slate-700 px-3 py-2 text-sm active:scale-95'
export const field = 'w-full rounded-xl bg-slate-800 px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500'

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onClose}>
      <div className="mx-auto max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-slate-900 p-4 pb-8" onClick={e => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h3 className="font-bold">{title}</h3><button onClick={onClose} className={btn}>Cancelar</button></div>
        {children}
      </div>
    </div>
  )
}

export function DeliverSheet({ s, onClose }: { s: StopRow; onClose: () => void }) {
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

export function DeferSheet({ s, onClose }: { s: StopRow; onClose: () => void }) {
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

export function FailSheet({ s, onClose }: { s: StopRow; onClose: () => void }) {
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

