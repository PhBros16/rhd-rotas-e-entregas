import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Client } from '../lib/clients'
import { brl } from '../lib/format'
import { useAuth } from '../auth'

export { brl }
const PRICES = [35, 55, 60, 70, 80, 90, 100, 120]
type Stop = { client: Client; price: number | null; priceText: string; packages: number }
const num = (t: string) => { const v = parseFloat(t.replace(',', '.')); return Number.isFinite(v) && v >= 0 ? v : null }

export default function RouteBuilder({ clients, onClose, onSaved }: { clients: Client[]; onClose: () => void; onSaved: () => void }) {
  const [stops, setStops] = useState<Stop[]>(clients.map(client => ({ client, price: null, priceText: '', packages: 1 })))
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [fee, setFee] = useState<number | null>(null)
  const { profile } = useAuth()
  useEffect(() => {
    if (!profile) return
    Promise.all([supabase.from('profiles').select('pay_rate').eq('id', profile.id).single(), supabase.from('app_settings').select('value').eq('key', 'courier_fee').single()])
      .then(([me, std]) => setFee(me.data?.pay_rate != null ? Number(me.data.pay_rate) : std.data ? Number(std.data.value) : 0))
  }, [profile])
  const patch = (i: number, p: Partial<Stop>) => setStops(s => s.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const total = stops.reduce((a, s) => a + (s.price ?? 0), 0)
  const totalPay = (fee ?? 0) * stops.length
  const noPrice = stops.filter(s => s.price == null).length

  async function save() {
    if (!stops.length) return
    const warn = [noPrice && `${noPrice} sem valor da entrega`, !fee && 'o valor por entrega do entregador ainda não foi definido pelo admin'].filter(Boolean).join(' e ')
    if (warn && !window.confirm(`Atenção: ${warn}. Salvar assim mesmo?`)) return
    setBusy(true); setMsg('')
    const hoods = [...new Set(stops.map(s => s.client.neighborhood).filter(Boolean))] as string[]
    const auto = `Rota ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}${hoods.length ? ' · ' + hoods.slice(0, 2).join(', ') + (hoods.length > 2 ? '…' : '') : ''}`
    const { data: r, error } = await supabase.from('routes').insert({ name: name.trim() || auto }).select('id').single()
    if (error || !r) { setBusy(false); setMsg(error?.message ?? 'Não foi possível salvar.'); return }
    const rows = stops.map((s, i) => ({
      route_id: r.id, client_id: s.client.id, client_name: s.client.name, phone: s.client.phone,
      address: [s.client.street, s.client.number, s.client.complement].filter(Boolean).join(', ') || null,
      neighborhood: s.client.neighborhood, city: s.client.city, lat: s.client.lat, lng: s.client.lng,
      position: i, packages: s.packages, price: s.price ?? 0, courier_pay: fee ?? 0, client_notes: s.client.notes, geo_quality: s.client.geo_quality,
    }))
    const { error: e2 } = await supabase.from('route_stops').insert(rows)
    if (e2) { await supabase.from('routes').delete().eq('id', r.id); setBusy(false); setMsg(e2.message); return }
    setBusy(false); onSaved()
  }

  const chip = (on: boolean) => `rounded-lg px-3 py-2 text-sm font-semibold active:scale-95 ${on ? 'bg-orange-500 text-slate-900' : 'bg-slate-700 text-slate-200'}`
  const inp = 'rounded-lg bg-slate-700 px-3 py-2 text-sm outline-none'
  return (
    <div className="fixed inset-0 z-20 overflow-y-auto bg-slate-900">
      <div className="mx-auto max-w-lg p-4 pb-28">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Montar rota</h2><button onClick={onClose} className="rounded-lg bg-slate-700 px-3 py-2 text-sm">Voltar</button></div>
        <input className="mb-3 w-full rounded-xl bg-slate-800 px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500" placeholder="Nome da rota (opcional)" value={name} onChange={e => setName(e.target.value)} />
        <div className="mb-3 rounded-xl bg-slate-800 p-3 text-sm"><p className="text-slate-400">{stops.length} entrega{stops.length !== 1 ? 's' : ''} · {stops.reduce((a, s) => a + s.packages, 0)} pacote(s) · cobrado <span className="font-semibold text-orange-400">{brl(total)}</span></p>
          <p className="mt-1">💼 Você recebe <span className="text-lg font-extrabold text-emerald-400">{brl(totalPay)}</span> <span className="text-slate-500">({fee === null ? '…' : `${brl(fee)} por entrega`})</span></p></div>
        <ul className="flex flex-col gap-3">
          {stops.map((s, i) => (
            <li key={s.client.id} className="rounded-2xl bg-slate-800 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="font-semibold">{s.client.name}</p><p className="truncate text-sm text-slate-400">{[s.client.street, s.client.number].filter(Boolean).join(', ')} · {s.client.neighborhood}</p></div>
                <button onClick={() => { const n = stops.filter((_, j) => j !== i); n.length ? setStops(n) : onClose() }} aria-label="Remover" className="rounded-lg bg-slate-700 px-3 py-1 text-slate-300">✕</button>
              </div>
              <p className="mb-1 mt-3 text-xs uppercase tracking-wide text-slate-400">Valor da entrega</p>
              <div className="flex flex-wrap gap-2">
                {PRICES.map(p => <button key={p} onClick={() => patch(i, { price: p, priceText: '' })} className={chip(s.price === p && !s.priceText)}>{p}</button>)}
                <input inputMode="decimal" placeholder="Outro" className={`${inp} w-24 ${s.priceText ? 'ring-2 ring-orange-500' : ''}`} value={s.priceText} onChange={e => patch(i, { priceText: e.target.value, price: num(e.target.value) })} />
              </div>
              <div className="mt-3 flex items-center gap-3"><span className="text-xs uppercase tracking-wide text-slate-400">Pacotes</span>
                <button onClick={() => patch(i, { packages: Math.max(1, s.packages - 1) })} className="h-9 w-9 rounded-lg bg-slate-700 text-lg">−</button>
                <span className="w-6 text-center font-semibold">{s.packages}</span>
                <button onClick={() => patch(i, { packages: s.packages + 1 })} className="h-9 w-9 rounded-lg bg-slate-700 text-lg">+</button></div>
            </li>
          ))}
        </ul>
        {msg && <p className="mt-3 text-sm text-red-400">{msg}</p>}
      </div>
      <div className="fixed inset-x-0 bottom-0 bg-slate-900 p-4"><div className="mx-auto max-w-lg">
        <button disabled={busy || !stops.length} onClick={save} className="w-full rounded-xl bg-orange-500 py-4 text-lg font-bold text-slate-900 disabled:opacity-50">{busy ? 'Salvando…' : `Salvar rota · ${brl(total)}`}</button>
      </div></div>
    </div>
  )
}
