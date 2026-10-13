import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'
import { CITIES, digits, emptyDraft, localDb, lookupCep, norm, type Client, type ClientDraft } from '../lib/clients'
import { extractUrl, fmtCep, fmtPhone, mapsUrl, resolveCoords, wazeUrl, whatsUrl } from '../lib/maplink'
import MiniMap from '../components/MiniMap'
import RouteBuilder from '../components/RouteBuilder'
import { clearDraft, loadDraft, saveDraft, type Draft } from '../lib/draft'

const field = 'w-full rounded-xl bg-slate-800 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-orange-500'
const chip = 'rounded-lg bg-slate-700 px-3 py-2 text-sm active:scale-95'
const addr = (c: Client) => [c.street, c.number].filter(Boolean).join(', ')

function ClientForm({ initial, restored, onClose, onSaved }: { initial: Client | null; restored?: ClientDraft; onClose: () => void; onSaved: (note?: string) => void }) {
  const base = useRef(JSON.stringify(initial ? { ...emptyDraft(), ...initial } : emptyDraft()))
  const [d, setD] = useState<ClientDraft>(restored ?? (JSON.parse(base.current) as ClientDraft))
  const [fromDraft, setFromDraft] = useState(Boolean(restored))
  const dirty = JSON.stringify(d) !== base.current
  useEffect(() => { if (dirty) saveDraft({ id: initial?.id ?? null, data: d }) }, [d, dirty, initial?.id])
  function close() { if (dirty && !window.confirm('Descartar o que você digitou?')) return; clearDraft(); onClose() }
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const set = (k: keyof ClientDraft) => (e: { target: { value: string } }) => setD(p => ({ ...p, [k]: e.target.value }))

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
    const pin = extractUrl(d.pin_url ?? '')
    let lat = d.lat, lng = d.lng, note: string | undefined
    if (!pin) { lat = null; lng = null }
    else if (pin !== initial?.pin_url || lat == null) {
      const c = await resolveCoords(pin)
      lat = c?.lat ?? null; lng = c?.lng ?? null
      if (!c) note = 'Cliente salvo, mas não consegui ler a posição do link (o mapinha não será exibido).'
    }
    const row = { name: d.name.trim(), phone: digits(d.phone ?? '') || null, cep: digits(d.cep ?? '') || null,
      street: d.street?.trim() || null, number: d.number?.trim() || null, complement: d.complement?.trim() || null,
      neighborhood: d.neighborhood?.trim() || null, city: d.city.trim(), pin_url: pin || null, lat, lng, notes: d.notes?.trim() || null }
    const { error } = initial ? await supabase.from('clients').update(row).eq('id', initial.id) : await supabase.from('clients').insert(row)
    setBusy(false)
    if (error) setMsg(error.message); else { clearDraft(); onSaved(note) }
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
        <input className={field} placeholder="Bairro *" value={d.neighborhood ?? ''} onChange={set('neighborhood')} required />
        <input className={field} list="cities" placeholder="Cidade *" value={d.city} onChange={set('city')} required />
        <datalist id="cities">{CITIES.map(c => <option key={c} value={c} />)}</datalist>
        <input className={field} placeholder="Link da localização (cole o link do Maps)" inputMode="url" value={d.pin_url ?? ''} onChange={set('pin_url')} />
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
  const full = [c.street, c.number, c.neighborhood, c.city, 'PE'].filter(Boolean).join(', ')
  const pos = c.lat != null && c.lng != null ? { lat: c.lat, lng: c.lng } : null
  const dest = pos ?? full
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
          {pos && <MiniMap lat={pos.lat} lng={pos.lng} href={c.pin_url?.startsWith('http') ? c.pin_url : mapsUrl(pos)} label={addr(c) || c.name} />}
          {!pos && c.pin_url && <a href={c.pin_url} target="_blank" rel="noreferrer" className="text-orange-400 underline">Abrir link da localização</a>}
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

type View = 'cidade' | 'bairro' | 'todos'
type Section = { title: string; count: number; subs: { title: string; items: Client[] }[] }

export default function Clients({ onRouteSaved }: { onRouteSaved?: () => void }) {
  const { profile, signOut } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [clients, setClients] = useState<Client[]>([])
  const [owners, setOwners] = useState<Record<string, string>>({})
  const [q, setQ] = useState('')
  const [view, setView] = useState<View>(isAdmin ? 'cidade' : 'bairro')
  const [fCity, setFCity] = useState(''); const [fHood, setFHood] = useState(''); const [fOwner, setFOwner] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Client | null | undefined>(undefined)
  const [offline, setOffline] = useState(false)
  const [toast, setToast] = useState('')
  const [selecting, setSelecting] = useState(false)
  const [selIds, setSelIds] = useState<string[]>([])
  const [building, setBuilding] = useState(false)
  const [pending, setPending] = useState<Draft | null>(loadDraft)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('clients').select('*').order('name')
    if (error || !data) { setOffline(true); setClients(await localDb.clients.toArray()); return }
    setOffline(false); setClients(data as Client[])
    await localDb.clients.clear(); await localDb.clients.bulkPut(data as Client[])
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

  const cities = useMemo(() => [...new Set(clients.map(c => c.city))].sort((a, b) => a.localeCompare(b, 'pt')), [clients])
  const hoods = useMemo(() => [...new Set(clients.filter(c => !fCity || c.city === fCity).map(c => c.neighborhood || 'Sem bairro'))].sort((a, b) => a.localeCompare(b, 'pt')), [clients, fCity])
  const ownerIds = useMemo(() => [...new Set(clients.map(c => c.owner_id).filter(Boolean))] as string[], [clients])

  const sections = useMemo<Section[]>(() => {
    const n = norm(q.trim())
    const list = clients.filter(c =>
      (!n || norm([c.name, c.phone, c.street, c.neighborhood, c.city].join(' ')).includes(n)) &&
      (!fCity || c.city === fCity) && (!fHood || (c.neighborhood || 'Sem bairro') === fHood) && (!fOwner || c.owner_id === fOwner))
    const by = (key: (c: Client) => string, items: Client[]) => { const m = new Map<string, Client[]>(); for (const c of items) m.set(key(c), [...(m.get(key(c)) ?? []), c]); return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt')) }
    const hood = (c: Client) => c.neighborhood || 'Sem bairro'
    if (view === 'todos') return list.length ? [{ title: 'Todos os clientes', count: list.length, subs: [{ title: '', items: list }] }] : []
    if (view === 'bairro') return by(c => `${hood(c)} · ${c.city}`, list).map(([t, items]) => ({ title: t, count: items.length, subs: [{ title: '', items }] }))
    return by(c => c.city, list).map(([t, items]) => ({ title: t, count: items.length, subs: by(hood, items).map(([h, it]) => ({ title: h, items: it })) }))
  }, [clients, q, view, fCity, fHood, fOwner])

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
      <div className="mb-2 flex gap-2">{seg('cidade', 'Por cidade')}{seg('bairro', 'Por bairro')}{seg('todos', 'Todos')}</div>
      <div className="mb-4 flex gap-2">
        <select className={sel} value={fCity} onChange={e => { setFCity(e.target.value); setFHood('') }}><option value="">Todas as cidades</option>{cities.map(c => <option key={c}>{c}</option>)}</select>
        <select className={sel} value={fHood} onChange={e => setFHood(e.target.value)}><option value="">Todos os bairros</option>{hoods.map(h => <option key={h}>{h}</option>)}</select>
        {isAdmin && <select className={sel} value={fOwner} onChange={e => setFOwner(e.target.value)}><option value="">Todos os entregadores</option>{ownerIds.map(id => <option key={id} value={id}>{owners[id] ?? 'Entregador'}</option>)}</select>}
      </div>
      {sections.length === 0 && <p className="mt-10 text-center text-slate-400">{clients.length ? 'Nenhum cliente encontrado.' : 'Nenhum cliente ainda. Toque em + para cadastrar.'}</p>}
      {sections.map(s => (
        <section key={s.title} className="mb-5">
          <div className="mb-2 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold uppercase tracking-wide text-orange-400">{s.title} <span className="text-slate-500">({s.count})</span></h2>
            {selecting && <button className="shrink-0 text-xs text-orange-400 underline" onClick={() => toggleGroup(s.subs.flatMap(x => x.items))}>{allOn(s.subs.flatMap(x => x.items)) ? 'Desmarcar todos' : 'Marcar todos'}</button>}</div>
          {s.subs.map(sub => (
            <div key={sub.title} className="mb-3">
              {sub.title && <div className="mb-1 flex items-center justify-between gap-2"><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{sub.title} <span className="text-slate-600">({sub.items.length})</span></h3>
                {selecting && <button className="shrink-0 text-xs text-orange-400 underline" onClick={() => toggleGroup(sub.items)}>{allOn(sub.items) ? 'Desmarcar bairro' : 'Marcar bairro'}</button>}</div>}
              <ul className="flex flex-col gap-2">
                {sub.items.map(c => <Card key={c.id} c={c} open={openId === c.id} owner={isAdmin && c.owner_id ? owners[c.owner_id] : undefined}
                  selecting={selecting} selected={selIds.includes(c.id)} onToggle={() => (selecting ? toggle(c.id) : setOpenId(openId === c.id ? null : c.id))} onEdit={() => setEditing(c)} onDelete={() => remove(c)} />)}
              </ul>
            </div>
          ))}
        </section>
      ))}
      {!selecting && <button onClick={() => setEditing(null)} aria-label="Novo cliente" className="fixed bottom-6 right-6 h-16 w-16 rounded-full bg-orange-500 text-4xl font-bold text-slate-900 shadow-lg active:scale-95">+</button>}
      {selecting && <div className="fixed inset-x-0 bottom-0 bg-slate-900 p-4"><div className="mx-auto max-w-lg"><button disabled={!selIds.length} onClick={() => setBuilding(true)} className="w-full rounded-xl bg-orange-500 py-4 text-lg font-bold text-slate-900 disabled:opacity-40">{selIds.length ? `Continuar com ${selIds.length} cliente${selIds.length > 1 ? 's' : ''}` : 'Toque nos clientes para marcar'}</button></div></div>}
      {editing !== undefined && <ClientForm initial={editing} restored={pending && pending.id === (editing?.id ?? null) ? pending.data : undefined} onClose={() => { setEditing(undefined); setPending(null) }} onSaved={n => { setEditing(undefined); setPending(null); if (n) say(n); load() }} />}
      {building && <RouteBuilder clients={selIds.map(id => clients.find(c => c.id === id)).filter(Boolean) as Client[]} onClose={() => setBuilding(false)} onSaved={() => { setBuilding(false); setSelecting(false); setSelIds([]); onRouteSaved?.() }} />}
    </main>
  )
}
