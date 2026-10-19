import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { geocodeClients, isGood, moveCity, qualityLabel, renameHood } from '../lib/geo'
import { CITIES, canon, suggestHood } from '../lib/clients'
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
    <div className={card}><p className={h}>💼 Valor padrão por entrega (para quem não tem valor próprio)</p>
      <div className="flex gap-2"><input inputMode="decimal" placeholder="R$ por entrega" value={v} onChange={e => { setV(e.target.value); setMsg('') }} className="min-w-0 flex-1 rounded-xl bg-slate-900 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500" /><button onClick={save} className="rounded-xl bg-emerald-500 px-5 font-bold text-slate-900">Salvar</button></div>
      <p className="mt-2 text-xs text-slate-400">{cur === null ? '' : cur === 0 ? '⚠️ Ainda não definido: as rotas montadas ficam com repasse R$ 0.' : `Padrão atual: ${brl(cur)} por entrega, igual para qualquer tamanho. Cada entregador pode ter um valor próprio no perfil dele. `}{msg}</p>
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
    setMsg(`Localizados: ${r.ok} · não encontrados: ${r.failed}${r.blocked ? ` · ${r.blocked} não consultados (os serviços recusaram; tente de novo mais tarde)` : ''}${r.info ? ` — ${r.info}` : ''}`)
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
type HRow = { neighborhood: string | null; city: string }
function HoodCard() {
  const [rows, setRows] = useState<HRow[]>([]), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  const load = useCallback(async () => { const { data } = await supabase.from('clients').select('neighborhood, city').limit(5000); setRows((data ?? []) as HRow[]) }, [])
  useEffect(() => { void load() }, [load])
  const groups = useMemo(() => {
    const m = new Map<string, Map<string, number>>()
    for (const r of rows) { const h = r.neighborhood || 'Sem bairro', cm = m.get(r.city) ?? new Map<string, number>(); cm.set(h, (cm.get(h) ?? 0) + 1); m.set(r.city, cm) }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt')).map(([city, hm]) => ({ city, hoods: [...hm.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt')).map(([name, n]) => ({ name, n, like: name === 'Sem bairro' ? null : suggestHood(name, [...hm.keys()].filter(k => k !== name)) })) }))
  }, [rows])
  const similar = groups.reduce((t, g) => t + g.hoods.filter(h => h.like).length, 0)

  async function rename(city: string, from: string, suggestion: string | null) {
    const typed = window.prompt(`Novo nome para o bairro "${from}" (${city}).\nSe já existir um bairro com esse nome, os clientes são unidos nele.`, suggestion ?? from)
    if (!typed || !typed.trim() || typed.trim() === from) return
    const to = canon(typed, groups.find(g => g.city === city)?.hoods.map(h => h.name) ?? [])
    if (!window.confirm(`Mudar "${from}" para "${to}" em ${city}?`)) return
    setBusy(true); setMsg('')
    try { const n = await renameHood(city, from, to); setMsg(`${n} cliente(s): "${from}" → "${to}".`) } catch (e) { setMsg((e as Error).message) }
    setBusy(false); await load()
  }
  async function move(city: string, hood: string) {
    const typed = window.prompt(`Para qual cidade deve ir o bairro "${hood}"? (hoje está em ${city})\nExemplos: ${CITIES.slice(0, 3).join(', ')}`, '')
    if (!typed || !typed.trim()) return
    const to = canon(typed, [...new Set([...CITIES, ...groups.map(g => g.city)])])
    if (norm0(to) === norm0(city) || !window.confirm(`Mudar "${hood}" de ${city} para ${to}? A localização desses clientes será recalculada.`)) return
    setBusy(true); setMsg('')
    try { const ids = await moveCity(city, hood, to); setMsg(`${ids.length} cliente(s) agora em ${to}. Recalculando a localização…`); await load(); const r = await geocodeClients(ids); setMsg(`${ids.length} cliente(s) agora em ${to}. Localizados: ${r.ok}.`) } catch (e) { setMsg((e as Error).message) }
    setBusy(false); await load()
  }
  return (
    <details className={card}><summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-orange-300">🏘 Bairros e cidades {similar > 0 && <span className="ml-1 rounded-full bg-amber-500/30 px-2 py-0.5 text-amber-200">{similar} parecido(s)</span>}</summary>
      <p className="mb-3 mt-3 text-xs text-slate-400">Use para unir bairros escritos de formas diferentes (ex.: Pontizinha e Pontezinha) ou corrigir a cidade de um bairro. Vale para os clientes e para as paradas ainda pendentes.</p>
      {msg && <p className="mb-2 text-sm text-emerald-300">{msg}</p>}
      {groups.map(g => (
        <div key={g.city} className="mb-3"><p className="mb-1 text-sm font-bold text-orange-400">{g.city}</p>
          <ul className="flex flex-col gap-1">{g.hoods.map(h => (
            <li key={h.name} className="flex items-center justify-between gap-2 rounded-lg bg-slate-900/60 p-2 text-sm">
              <span className="min-w-0"><span className="font-semibold">{h.name}</span> <span className="text-slate-500">({h.n})</span>{h.like && <span className="block text-xs text-amber-300">⚠️ parecido com “{h.like}”</span>}</span>
              {h.name !== 'Sem bairro' && <span className="flex shrink-0 gap-1"><button disabled={busy} onClick={() => rename(g.city, h.name, h.like)} className="rounded-lg bg-slate-700 px-2 py-1 text-xs">Renomear</button><button disabled={busy} onClick={() => move(g.city, h.name)} className="rounded-lg bg-slate-700 px-2 py-1 text-xs">Cidade</button></span>}
            </li>))}</ul></div>))}
    </details>
  )
}
const norm0 = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
export default function AdminTools() { return <><FeeCard /><GeoCard /><HoodCard /></> }
