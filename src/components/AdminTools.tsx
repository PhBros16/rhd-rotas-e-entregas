import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { geocodeClients, isGood, qualityLabel } from '../lib/geo'
import { brl } from '../lib/format'

const card = 'mb-4 rounded-2xl bg-slate-800 p-4'
const h = 'mb-3 text-xs font-bold uppercase tracking-wider text-orange-300'

function FeeCard() {
  const [v, setV] = useState(''), [cur, setCur] = useState<number | null>(null), [msg, setMsg] = useState('')
  useEffect(() => { supabase.from('app_settings').select('value').eq('key', 'courier_fee').single().then(({ data }) => { if (data) { setCur(Number(data.value)); setV(String(data.value)) } }) }, [])
  async function save() {
    const n = parseFloat(v.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) { setMsg('Valor inválido.'); return }
    const { error } = await supabase.from('app_settings').update({ value: n, updated_at: new Date().toISOString() }).eq('key', 'courier_fee')
    if (error) setMsg(error.message); else { setCur(n); setMsg('Salvo. Vale para as próximas rotas montadas.') }
  }
  return (
    <div className={card}><p className={h}>💼 Valor pago ao entregador por entrega</p>
      <div className="flex gap-2"><input inputMode="decimal" placeholder="R$ por entrega" value={v} onChange={e => { setV(e.target.value); setMsg('') }} className="min-w-0 flex-1 rounded-xl bg-slate-900 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500" /><button onClick={save} className="rounded-xl bg-emerald-500 px-5 font-bold text-slate-900">Salvar</button></div>
      <p className="mt-2 text-xs text-slate-400">{cur === null ? '' : cur === 0 ? '⚠️ Ainda não definido: as rotas montadas ficam com repasse R$ 0.' : `Atual: ${brl(cur)} por entrega, igual para todos, qualquer tamanho. `}{msg}</p>
    </div>
  )
}

type C = { id: string; name: string; street: string | null; number: string | null; neighborhood: string | null; city: string; geo_quality: string | null }
function GeoCard() {
  const [cs, setCs] = useState<C[]>([]), [busy, setBusy] = useState(false), [prog, setProg] = useState(''), [msg, setMsg] = useState('')
  const load = useCallback(async () => { const { data } = await supabase.from('clients').select('id, name, street, number, neighborhood, city, geo_quality').limit(5000); setCs((data ?? []) as C[]) }, [])
  useEffect(() => { void load() }, [load])
  const n = (f: (c: C) => boolean) => cs.filter(f).length
  const todo = cs.filter(c => !c.geo_quality), none = cs.filter(c => c.geo_quality === 'none')
  const weak = cs.filter(c => c.geo_quality === 'none' || c.geo_quality === 'neighborhood' || c.geo_quality === 'city')
  async function run(ids: string[]) {
    setBusy(true); setMsg('')
    const r = await geocodeClients(ids, (d, t) => setProg(`${d}/${t}`))
    setBusy(false); setProg('')
    setMsg(`Localizados: ${r.ok} · não localizados: ${r.failed}${r.limited ? ' · o serviço pediu para esperar; tente de novo em alguns minutos' : ''}`)
    await load()
  }
  const stat = (l: string, v: number, c: string) => <div className="rounded-xl bg-slate-900/60 p-3"><p className="text-xs text-slate-400">{l}</p><p className={`text-xl font-extrabold ${c}`}>{v}</p></div>
  return (
    <div className={card}><p className={h}>📍 Localização dos clientes</p>
      <div className="mb-3 grid grid-cols-2 gap-2">{stat('Rua ou exato', n(c => isGood(c.geo_quality)), 'text-emerald-400')}{stat('Só bairro ou cidade', n(c => c.geo_quality === 'neighborhood' || c.geo_quality === 'city'), 'text-amber-300')}{stat('Não localizados', none.length, 'text-red-300')}{stat('Aguardando', todo.length, 'text-slate-200')}</div>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy || !todo.length} onClick={() => run(todo.map(c => c.id))} className="rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-slate-900 disabled:opacity-40">{busy ? `Localizando ${prog}…` : `Localizar pendentes (${todo.length})`}</button>
        <button disabled={busy || !none.length} onClick={() => run(none.map(c => c.id))} className="rounded-xl bg-slate-700 px-4 py-3 text-sm font-semibold disabled:opacity-40">Tentar de novo os não localizados</button>
      </div>
      {msg && <p className="mt-2 text-sm text-emerald-300">{msg}</p>}
      {weak.length > 0 && <><p className="mb-1 mt-4 text-xs font-bold uppercase tracking-wider text-slate-400">Para conferir o endereço ({weak.length})</p>
        <ul className="flex flex-col gap-1 text-sm">{weak.slice(0, 15).map(c => <li key={c.id} className="rounded-lg bg-slate-900/60 p-2"><b>{c.name}</b> <span className="text-slate-400">· {[c.street, c.number].filter(Boolean).join(', ') || 'sem rua'} · {c.neighborhood} · {c.city}</span> <span className="text-amber-300">({qualityLabel[c.geo_quality ?? 'none']})</span></li>)}</ul>
        <p className="mt-2 text-xs text-slate-500">Ao corrigir o endereço do cliente, a localização é recalculada sozinha.</p></>}
    </div>
  )
}
export default function AdminTools() { return <><FeeCard /><GeoCard /></> }
