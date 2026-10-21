import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'
import { CITIES, canon, navQuery, digits, emptyDraft, localDb, lookupCep, norm, suggestHood, type Client, type ClientDraft } from '../lib/clients'
import { fmtCep, fmtPhone, mapsUrl, wazeUrl, whatsUrl } from '../lib/maplink'
import { afterClientSave, geocodeClients } from '../lib/geo'
import RouteBuilder from '../components/RouteBuilder'
import { clearDraft, loadDraft, saveDraft, type Draft } from '../lib/draft'

const field = 'w-full rounded-xl bg-slate-800 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-orange-500'
const chip = 'rounded-lg bg-slate-700 px-3 py-2 text-sm active:scale-95'
const addr = (c: Client) => [c.street, c.number].filter(Boolean).join(', ')

export function ClientForm({ initial, restored, all, onClose, onSaved }: { initial: Client | null; restored?: ClientDraft; all: Client[]; onClose: () => void; onSaved: (note?: string) => void }) {
  const base = useRef(JSON.stringify(initial ? { ...emptyDraft(), ...initial } : emptyDraft()))
  const [d, setD] = useState<ClientDraft>(restored ?? (JSON.parse(base.current) as ClientDraft))
  const [fromDraft, setFromDraft] = useState(Boolean(restored))
  const dirty = JSON.stringify(d) !== base.current
  useEffect(() => { if (dirty) saveDraft({ id: initial?.id ?? null, data: d }) }, [d, dirty, initial?.id])
  function close() { if (dirty && !window.confirm('Descartar o que você digitou?')) return; clearDraft(); onClose() }
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const set = (k: keyof ClientDraft) => (e: { target: { value: string } }) => setD(p => ({ ...p, [k]: e.target.value }))
  const pt = (a: string, b: string) => a.localeCompare(b, 'pt')
  const cityList = useMemo(() => [...new Set([...CITIES, ...all.map(c => c.city)])].sort(pt), [all])
  const hoodList = useMemo(() => [...new Set(all.filter(c => norm(c.city) === norm(d.city)).map(c => c.neighborhood).filter(Boolean) as string[])].sort(pt), [all, d.city])
  const sug = d.neighborhood ? suggestHood(d.neighborhood, hoodList) : null

  async function onCep(v: string) {
    setD(p => ({ ...p, cep: v }))
    if (digits(v).length !== 8) return
    try {
      const r = await lookupCep(v)
      if (r) setD(p => ({ ...p, street: p.street || r.street, neighborhood: p.neighborhood || r.neighborhood, city: r.city || p.city }))
      else setMsg('CEP não encontrado. Preencha o endereço à mão.')
    } catch { setMsg('Sem internet para buscar o CEP. Preencha à mão.') }
  }

  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMsg('')
    const row: Record<string, unknown> = { name: d.name.trim(), phone: digits(d.phone ?? '') || null, cep: digits(d.cep ?? '') || null,
      street: d.street?.trim() || null, number: d.number?.trim() || null, complement: d.complement?.trim() || null,
      neighborhood: d.neighborhood?.trim() ? canon(d.neighborhood, hoodList) : null, city: canon(d.city, cityList), notes: d.notes?.trim() || null }
    const key = (x: Record<string, unknown>) => [x.cep, x.street, x.number, x.neighborhood, x.city].map(v => String(v ?? '').trim().toLowerCase()).join('|')
    const addrChanged = !initial || key(initial as unknown as Record<string, unknown>) !== key(row)
    if (initial && addrChanged) { row.lat = null; row.lng = null; row.geo_quality = null }
    let error: { message: string } | null = null, savedId = initial?.id ?? null
    if (initial) ({ error } = await supabase.from('clients').update(row).eq('id', initial.id))
    else { const r = await supabase.from('clients').insert(row).select('id').single(); error = r.error; savedId = r.data?.id ?? null }
    setBusy(false)
    if (error) setMsg(error.message)
    else { clearDraft(); onSaved(); if (savedId) void afterClientSave(savedId, addrChanged) }
  }

  return (
    <div className="fixed inset-0 z-10 overflow-y-auto bg-slate-900">
      <form onSubmit={save} className="mx-auto flex max-w-lg flex-col gap-3 p-4 pb-24">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{initial ? 'Editar cliente' : 'Novo cliente'}</h2><button type="button" onClick={close} className={chip}>Fechar</button></div>
        {fromDraft && <p className="rounded-lg bg-sky-500/20 p-2 text-sm text-sky-200">Rascunho recuperado. <button type="button" className="underline" onClick={() => { setD(JSON.parse(base.current)); setFromDraft(false); clearDraft() }}>Começar do zero</button></p>}
        <input className={field} placeholder="Nome *" value={d.name} onChange={set('name')} required />
        <input className={field} placeholder="WhatsApp (com DDD)" inputMode="tel" value={d.phone ?? ''} onChange={set('phone')} />
        <input className={field} placeholder="CEP (opcional, preenche o endereço)" inputMode="numeric" value={d.cep ?? ''} onChange={e => onCep(e.target.value)} />
        <input className={field} placeholder="Rua" value={d.street ?? ''} onChange={set('street')} />
        <div className="flex gap-3"><input className={field} placeholder="Número" value={d.number ?? ''} onChange={set('number')} /><input className={field} placeholder="Complemento" value={d.complement ?? ''} onChange={set('complement')} /></div>
        <select className={field} value={cityList.includes(d.city) ? d.city : '__other'} onChange={e => setD(p => ({ ...p, city: e.target.value === '__other' ? '' : e.target.value }))}>
          {cityList.map(c => <option key={c} value={c}>{c}</option>)}<option value="__other">Outra cidade…</option></select>
        {!cityList.includes(d.city) && <input className={field} placeholder="Nome da cidade *" value={d.city} onChange={set('city')} required />}
        <input className={field} list="hoods" placeholder="Bairro * (escolha da lista ou digite)" value={d.neighborhood ?? ''} onChange={set('neighborhood')} required />
        <datalist id="hoods">{hoodList.map(h => <option key={h} value={h} />)}</datalist>
        {sug && <p className="rounded-lg bg-amber-500/20 p-2 text-sm text-amber-200">Já existe “{sug}” nesta cidade. <button type="button" className="font-bold underline" onClick={() => setD(p => ({ ...p, neighborhood: sug }))}>Usar “{sug}”</button></p>}
        <textarea className={field} placeholder="Observações (portaria, referência…)" rows={2} value={d.notes ?? ''} onChange={set('notes')} />
        {msg && <p className="text-sm text-amber-300">{msg}</p>}
        <div className="fixed inset-x-0 bottom-0 bg-slate-900 p-4"><div className="mx-auto flex max-w-lg gap-3">
          <button disabled={busy} className="flex-1 rounded-xl bg-orange-500 py-4 text-lg font-bold text-slate-900 disabled:opacity-50">{busy ? 'Salvando…' : 'Salvar'}</button>
        </div></div>
      </form>
    </div>
  )
}

function Card({ c, open, owner, selecting, selected, onToggle, onEdit, onDelete }: { c: Client; open: boolean; owner?: string; selecting?: boolean; selected?: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void }) {
  const full = navQuery(c)
  const dest = full // navegação pelo endereço escrito (o Maps e o Waze acertam o número da casa)
  if (selecting) return (
    <li><button onClick={onToggle} className={`flex w-full items-center gap-3 rounded-2xl p-4 text-left ${selected ? 'bg-orange-500/20 ring-2 ring-orange-500' : 'bg-slate-800'}`}>
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 font-bold ${selected ? 'border-orange-500 bg-orange-500 text-slate-900' : 'border-slate-500'}`}>{selected ? '✓' : ''}</span>
      <span className="min-w-0"><span className="block font-semibold">{c.name}</span><span className="block truncate text-sm text-slate-400">{addr(c) || 'Sem endereço'}{c.neighborhood ? ` · ${c.neighborhood}` : ''}</span></span>
    </button></li>
  )
  return (
    <li className="rounded-2xl bg-slate-800">
      <button onClick={onToggle} className="flex w-full items-start justify-between gap-2 p-4 text-left">
        <div className="min-w-0"><p className="font-semibold">{c.name}</p>
          <p className="truncate text-sm text-slate-400">{addr(c) || 'Sem endereço'}{c.phone ? ` · ${fmtPhone(c.phone)}` : ''}</p></div>
        <span className="flex shrink-0 items-center gap-2">{owner && <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">{owner}</span>}<span className="text-slate-500">{open ? '▴' : '▾'}</span></span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-slate-700 p-4 pt-3 text-sm">
          <div className="text-slate-300">
            <p>{[c.street, c.number, c.complement].filter(Boolean).join(', ') || 'Sem endereço'}</p>
            <p className="text-slate-400">{[c.neighborhood, c.city].filter(Boolean).join(' · ')}{c.cep ? ` · CEP ${fmtCep(c.cep)}` : ''}</p>
          </div>
          {c.notes && <p className="rounded-lg bg-slate-700/50 p-2 text-slate-300">{c.notes}</p>}
          <div className="flex flex-wrap gap-2">
            {c.phone && <a className={chip} href={whatsUrl(c.phone)} target="_blank" rel="noreferrer">WhatsApp</a>}
            {c.phone && <a className={chip} href={`tel:${c.phone}`}>Ligar</a>}
            <a className={chip} href={mapsUrl(dest)} target="_blank" rel="noreferrer">Maps</a>
            <a className={chip} href={wazeUrl(dest)} target="_blank" rel="noreferrer">Waze</a>
          </div>
          <div className="flex gap-2"><button onClick={onEdit} className="flex-1 rounded-xl bg-orange-500 py-3 font-semibold text-slate-900">Editar</button><button onClick={onDelete} className="rounded-xl bg-red-500/20 px-5 py-3 text-red-300">Excluir</button></div>
        </div>
      )}
    </li>
  )
}

type View = 'cidade' | 'todos'
type HoodNode = { key: string; label: string; items: Client[] }
type CityNode = { key: string; label: string; count: number; items: Client[]; hoods: HoodNode[] }

export default function Clients({ onRouteSaved }: { onRouteSaved?: () => void }) {
  const { profile, signOut } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [clients, setClients] = useState<Client[]>([])
  const [owners, setOwners] = useState<Record<string, string>>({})
  const [q, setQ] = useState('')
  const [view, setView] = useState<View>('cidade')
  const [fOwner, setFOwner] = useState('')
  const [openCities, setOpenCities] = useState<string[]>([])
  const [openHoods, setOpenHoods] = useState<string[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Client | null | undefined>(undefined)
  const [offline, setOffline] = useState(false)
  const [toast, setToast] = useState('')
  const [selecting, setSelecting] = useState(false)
  const [selIds, setSelIds] = useState<string[]>([])
  const [building, setBuilding] = useState(false)
  const [pending, setPending] = useState<Draft | null>(loadDraft)

  const tried = useRef<Set<string>>(new Set())
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('clients').select('*').order('name')
    if (error || !data) { setOffline(true); setClients(await localDb.clients.toArray()); return }
    setOffline(false); setClients(data as Client[])
    await localDb.clients.clear(); await localDb.clients.bulkPut(data as Client[])
    const todo = (data as Client[]).filter(c => !c.geo_quality && !tried.current.has(c.id)).slice(0, 6) // localiza em segundo plano quem ainda não foi localizado
    if (todo.length) { todo.forEach(c => tried.current.add(c.id)); void geocodeClients(todo.map(c => c.id)).then(() => load()) }
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!isAdmin) return
    supabase.from('profiles').select('id, full_name, username').then(({ data }) =>
      setOwners(Object.fromEntries((data ?? []).map(p => [p.id, (p.full_name || p.username).split(' ')[0]]))))
  }, [isAdmin])

  useEffect(() => {
    if (!pending || editing !== undefined) return
    if (pending.id === null) setEditing(null)
    else { const c = clients.find(x => x.id === pending.id); if (c) setEditing(c) }
  }, [pending, clients, editing])

  const toggle = (id: string) => setSelIds(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]))
  const toggleGroup = (items: Client[]) => setSelIds(s => (items.every(c => s.includes(c.id)) ? s.filter(id => !items.some(c => c.id === id)) : [...s, ...items.filter(c => !s.includes(c.id)).map(c => c.id)]))
  const allOn = (items: Client[]) => items.length > 0 && items.every(c => selIds.includes(c.id))
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 6000) }
  async function remove(c: Client) {
    if (!window.confirm(`Excluir ${c.name}?`)) return
    const { error } = await supabase.from('clients').delete().eq('id', c.id)
    if (error) say(error.message); else { setOpenId(null); load() }
  }

  const ownerIds = useMemo(() => [...new Set(clients.map(c => c.owner_id).filter(Boolean))] as string[], [clients])
  const searching = q.trim().length > 0
  const tree = useMemo<CityNode[]>(() => {
    const n = norm(q.trim())
    const list = clients.filter(c => (!n || norm([c.name, c.phone, c.street, c.neighborhood, c.city].join(' ')).includes(n)) && (!fOwner || c.owner_id === fOwner))
    const pt = (x: string, y: string) => x.localeCompare(y, 'pt')
    const label = (names: string[]) => { const m = new Map<string, number>(); for (const t of names) m.set(t, (m.get(t) ?? 0) + 1); return [...m.entries()].sort((x, y) => y[1] - x[1] || pt(x[0], y[0]))[0][0] }
    const group = <T,>(items: T[], key: (t: T) => string) => { const m = new Map<string, T[]>(); for (const t of items) m.set(key(t), [...(m.get(key(t)) ?? []), t]); return [...m.entries()] }
    return group(list, c => norm(c.city)).map(([key, items]) => ({
      key, label: label(items.map(c => c.city)), count: items.length, items,
      hoods: group(items, c => norm(c.neighborhood || 'Sem bairro')).map(([hk, hi]) => ({ key: `${key}|${hk}`, label: label(hi.map(c => c.neighborhood || 'Sem bairro')), items: hi })).sort((x, y) => pt(x.label, y.label)),
    })).sort((x, y) => pt(x.label, y.label))
  }, [clients, q, fOwner])
  const flat = useMemo(() => tree.flatMap(c => c.items).sort((x, y) => x.name.localeCompare(y.name, 'pt')), [tree])
  const flip = (arr: string[], k: string) => (arr.includes(k) ? arr.filter(x => x !== k) : [...arr, k])
  const cityOpen = (k: string) => searching || openCities.includes(k)
  const hoodOpen = (k: string) => searching || openHoods.includes(k)
  const everythingOpen = tree.length > 0 && tree.every(c => openCities.includes(c.key) && c.hoods.every(h => openHoods.includes(h.key)))
  const toggleAll = () => { if (everythingOpen) { setOpenCities([]); setOpenHoods([]) } else { setOpenCities(tree.map(c => c.key)); setOpenHoods(tree.flatMap(c => c.hoods.map(h => h.key))) } }
  const selCount = (items: Client[]) => items.filter(c => selIds.includes(c.id)).length
  const cardFor = (c: Client) => <Card key={c.id} c={c} open={openId === c.id} owner={isAdmin && c.owner_id ? owners[c.owner_id] : undefined}
    selecting={selecting} selected={selIds.includes(c.id)} onToggle={() => (selecting ? toggle(c.id) : setOpenId(openId === c.id ? null : c.id))} onEdit={() => setEditing(c)} onDelete={() => remove(c)} />

  const seg = (v: View, label: string) => <button onClick={() => setView(v)} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${view === v ? 'bg-orange-500 text-slate-900' : 'bg-slate-800 text-slate-300'}`}>{label}</button>
  const sel = 'min-w-0 flex-1 rounded-lg bg-slate-800 px-2 py-2 text-sm text-slate-200'

  return (
    <main className="mx-auto max-w-lg p-4 pb-28">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3"><img src="/favicon.svg" alt="" className="h-10 w-10" /><div><h1 className="font-bold">Clientes</h1><p className="text-sm text-slate-400">{profile?.full_name.split(' ')[0]} · {clients.length} cadastrados</p></div></div>
        <div className="flex gap-2">{selecting
          ? <button onClick={() => { setSelecting(false); setSelIds([]) }} className={chip}>Cancelar</button>
          : <><button onClick={() => { setSelecting(true); setOpenId(null) }} className={`${chip} !bg-orange-500 font-semibold text-slate-900`}>Montar rota</button><button onClick={signOut} className={chip}>Sair</button></>}</div>
      </header>
      {offline && <p className="mb-2 rounded-lg bg-amber-500/20 p-2 text-sm text-amber-300">Sem conexão: mostrando a última lista salva.</p>}
      {toast && <p className="mb-2 rounded-lg bg-amber-500/20 p-2 text-sm text-amber-300">{toast}</p>}
      <input className={`${field} mb-3`} placeholder="Buscar por nome, bairro, rua ou telefone" value={q} onChange={e => setQ(e.target.value)} />
      <div className="mb-2 flex gap-2">{seg('cidade', 'Por cidade e bairro')}{seg('todos', 'Todos (A–Z)')}</div>
      <div className="mb-3 flex items-center justify-between gap-3 text-sm">
        {isAdmin ? <select className={sel} value={fOwner} onChange={e => setFOwner(e.target.value)}><option value="">Todos os entregadores</option>{ownerIds.map(id => <option key={id} value={id}>{owners[id] ?? 'Entregador'}</option>)}</select> : <span />}
        {view === 'cidade' && !searching && tree.length > 0 && <button onClick={toggleAll} className="shrink-0 text-orange-400 underline">{everythingOpen ? 'Recolher tudo' : 'Expandir tudo'}</button>}
      </div>
      {tree.length === 0 && <p className="mt-10 text-center text-slate-400">{clients.length ? 'Nenhum cliente encontrado.' : 'Nenhum cliente ainda. Toque em + para cadastrar.'}</p>}
      {view === 'todos' ? <ul className="flex flex-col gap-2">{flat.map(cardFor)}</ul> : tree.map(city => (
        <section key={city.key} className="mb-3 rounded-2xl bg-slate-800/40">
          <div className="flex items-center gap-2">
            <button onClick={() => setOpenCities(a => flip(a, city.key))} className="flex min-w-0 flex-1 items-center justify-between gap-2 p-4 text-left">
              <span className="min-w-0"><span className="block truncate font-bold text-orange-400">{city.label}</span>
                <span className="text-xs text-slate-400">{city.count} cliente{city.count !== 1 ? 's' : ''} · {city.hoods.length} bairro{city.hoods.length !== 1 ? 's' : ''}{selecting && selCount(city.items) > 0 && <b className="text-orange-300"> · {selCount(city.items)} marcado(s)</b>}</span></span>
              <span className="text-slate-500">{cityOpen(city.key) ? '▴' : '▾'}</span>
            </button>
            {selecting && <button className="shrink-0 pr-4 text-xs text-orange-400 underline" onClick={() => toggleGroup(city.items)}>{allOn(city.items) ? 'Desmarcar cidade' : 'Marcar cidade'}</button>}
          </div>
          {cityOpen(city.key) && <div className="px-3 pb-3">
            {city.hoods.map(h => (
              <div key={h.key} className="mb-2">
                <div className="flex items-center gap-2">
                  <button onClick={() => setOpenHoods(a => flip(a, h.key))} className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl bg-slate-800 p-3 text-left">
                    <span className="min-w-0 truncate font-semibold">{h.label} <span className="text-slate-500">({h.items.length})</span>{selecting && selCount(h.items) > 0 && <span className="text-orange-300"> · {selCount(h.items)} ✓</span>}</span>
                    <span className="text-slate-500">{hoodOpen(h.key) ? '▴' : '▾'}</span>
                  </button>
                  {selecting && <button className="shrink-0 text-xs text-orange-400 underline" onClick={() => toggleGroup(h.items)}>{allOn(h.items) ? 'Desmarcar' : 'Marcar'}</button>}
                </div>
                {hoodOpen(h.key) && <ul className="mt-2 flex flex-col gap-2 pl-2">{h.items.map(cardFor)}</ul>}
              </div>
            ))}
          </div>}
        </section>
      ))}
      {!selecting && <button onClick={() => setEditing(null)} aria-label="Novo cliente" className="fixed bottom-6 right-6 h-16 w-16 rounded-full bg-orange-500 text-4xl font-bold text-slate-900 shadow-lg active:scale-95">+</button>}
      {selecting && <div className="fixed inset-x-0 bottom-0 bg-slate-900 p-4"><div className="mx-auto max-w-lg"><button disabled={!selIds.length} onClick={() => setBuilding(true)} className="w-full rounded-xl bg-orange-500 py-4 text-lg font-bold text-slate-900 disabled:opacity-40">{selIds.length ? `Continuar com ${selIds.length} cliente${selIds.length > 1 ? 's' : ''}` : 'Toque nos clientes para marcar'}</button></div></div>}
      {editing !== undefined && <ClientForm initial={editing} all={clients} restored={pending && pending.id === (editing?.id ?? null) ? pending.data : undefined} onClose={() => { setEditing(undefined); setPending(null) }} onSaved={n => { setEditing(undefined); setPending(null); if (n) say(n); load() }} />}
      {building && <RouteBuilder clients={selIds.map(id => clients.find(c => c.id === id)).filter(Boolean) as Client[]} onClose={() => setBuilding(false)} onSaved={() => { setBuilding(false); setSelecting(false); setSelIds([]); onRouteSaved?.() }} />}
    </main>
  )
}
