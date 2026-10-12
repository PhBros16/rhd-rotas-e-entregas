import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'
import { CITIES, digits, emptyDraft, localDb, lookupCep, norm, type Client, type ClientDraft } from '../lib/clients'

const field = 'w-full rounded-xl bg-slate-800 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-orange-500'

function ClientForm({ initial, onClose, onSaved }: { initial: Client | null; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<ClientDraft>(initial ? { ...emptyDraft(), ...initial } : emptyDraft())
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
    const row = { ...d, name: d.name.trim(), phone: digits(d.phone ?? '') || null, cep: digits(d.cep ?? '') || null,
      street: d.street?.trim() || null, number: d.number?.trim() || null, complement: d.complement?.trim() || null,
      neighborhood: d.neighborhood?.trim() || null, pin_url: d.pin_url?.trim() || null, notes: d.notes?.trim() || null }
    const { error } = initial ? await supabase.from('clients').update(row).eq('id', initial.id) : await supabase.from('clients').insert(row)
    setBusy(false)
    if (error) setMsg(error.message); else onSaved()
  }

  async function remove() {
    if (!initial || !window.confirm(`Excluir ${initial.name}?`)) return
    const { error } = await supabase.from('clients').delete().eq('id', initial.id)
    if (error) setMsg(error.message); else onSaved()
  }

  return (
    <div className="fixed inset-0 z-10 overflow-y-auto bg-slate-900">
      <form onSubmit={save} className="mx-auto flex max-w-lg flex-col gap-3 p-4 pb-24">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{initial ? 'Editar cliente' : 'Novo cliente'}</h2><button type="button" onClick={onClose} className="rounded-lg bg-slate-800 px-3 py-2">Fechar</button></div>
        <input className={field} placeholder="Nome *" value={d.name} onChange={set('name')} required />
        <input className={field} placeholder="WhatsApp (com DDD)" inputMode="tel" value={d.phone ?? ''} onChange={set('phone')} />
        <input className={field} placeholder="CEP (opcional, preenche o endereço)" inputMode="numeric" value={d.cep ?? ''} onChange={e => onCep(e.target.value)} />
        <input className={field} placeholder="Rua" value={d.street ?? ''} onChange={set('street')} />
        <div className="flex gap-3"><input className={field} placeholder="Número" value={d.number ?? ''} onChange={set('number')} /><input className={field} placeholder="Complemento" value={d.complement ?? ''} onChange={set('complement')} /></div>
        <input className={field} placeholder="Bairro *" value={d.neighborhood ?? ''} onChange={set('neighborhood')} required />
        <input className={field} list="cities" placeholder="Cidade *" value={d.city} onChange={set('city')} required />
        <datalist id="cities">{CITIES.map(c => <option key={c} value={c} />)}</datalist>
        <input className={field} placeholder="Link da localização (WhatsApp/Maps)" inputMode="url" value={d.pin_url ?? ''} onChange={set('pin_url')} />
        <textarea className={field} placeholder="Observações (portaria, referência…)" rows={2} value={d.notes ?? ''} onChange={set('notes')} />
        {msg && <p className="text-sm text-amber-300">{msg}</p>}
        <div className="fixed inset-x-0 bottom-0 flex gap-3 bg-slate-900 p-4">
          {initial && <button type="button" onClick={remove} className="rounded-xl bg-red-500/20 px-4 py-4 text-red-300">Excluir</button>}
          <button disabled={busy} className="flex-1 rounded-xl bg-orange-500 py-4 text-lg font-bold text-slate-900 disabled:opacity-50">{busy ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </div>
  )
}

export default function Clients() {
  const { profile, signOut } = useAuth()
  const [clients, setClients] = useState<Client[]>([])
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Client | null | undefined>(undefined)
  const [offline, setOffline] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('clients').select('*').order('name')
    if (error || !data) { setOffline(true); setClients(await localDb.clients.toArray()); return }
    setOffline(false); setClients(data as Client[])
    await localDb.clients.clear(); await localDb.clients.bulkPut(data as Client[])
  }, [])
  useEffect(() => { load() }, [load])

  const groups = useMemo(() => {
    const n = norm(q.trim())
    const list = clients.filter(c => !n || norm([c.name, c.phone, c.street, c.neighborhood, c.city].join(' ')).includes(n))
    const map = new Map<string, Client[]>()
    for (const c of list) { const k = `${c.neighborhood || 'Sem bairro'} · ${c.city}`; map.set(k, [...(map.get(k) ?? []), c]) }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt'))
  }, [clients, q])

  return (
    <main className="mx-auto max-w-lg p-4 pb-28">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3"><img src="/favicon.svg" alt="" className="h-10 w-10" /><div><h1 className="font-bold">Clientes</h1><p className="text-sm text-slate-400">{profile?.full_name.split(' ')[0]} · {clients.length} cadastrados</p></div></div>
        <button onClick={signOut} className="rounded-lg bg-slate-700 px-3 py-2 text-sm">Sair</button>
      </header>
      {offline && <p className="mb-2 rounded-lg bg-amber-500/20 p-2 text-sm text-amber-300">Sem conexão: mostrando a última lista salva.</p>}
      <input className={`${field} mb-4`} placeholder="Buscar por nome, bairro, rua ou telefone" value={q} onChange={e => setQ(e.target.value)} />
      {groups.length === 0 && <p className="mt-10 text-center text-slate-400">{clients.length ? 'Nenhum cliente encontrado.' : 'Nenhum cliente ainda. Toque em + para cadastrar.'}</p>}
      {groups.map(([k, list]) => (
        <section key={k} className="mb-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-orange-400">{k} <span className="text-slate-500">({list.length})</span></h2>
          <ul className="flex flex-col gap-2">
            {list.map(c => (
              <li key={c.id}><button onClick={() => setEditing(c)} className="w-full rounded-2xl bg-slate-800 p-4 text-left active:scale-[0.99]">
                <p className="font-semibold">{c.name}</p>
                <p className="text-sm text-slate-400">{[c.street, c.number].filter(Boolean).join(', ') || 'Sem endereço'}{c.phone ? ` · ${c.phone}` : ''}</p>
              </button></li>
            ))}
          </ul>
        </section>
      ))}
      <button onClick={() => setEditing(null)} aria-label="Novo cliente" className="fixed bottom-6 right-6 h-16 w-16 rounded-full bg-orange-500 text-4xl font-bold text-slate-900 shadow-lg active:scale-95">+</button>
      {editing !== undefined && <ClientForm initial={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); load() }} />}
    </main>
  )
}
