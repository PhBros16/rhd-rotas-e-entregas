import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { localDb, norm, syncClients, type Client } from '../lib/clients'
import { ClientForm } from '../pages/Clients'
import RouteBuilder from './RouteBuilder'

function ClientPicker({ routeId, onClose, onPicked }: { routeId: string; onClose: () => void; onPicked: (c: Client[]) => void }) {
  const clients = useLiveQuery(() => localDb.clients.toArray(), []) ?? []
  const inRoute = useLiveQuery(() => localDb.stops.where('route_id').equals(routeId).toArray(), [routeId]) ?? []
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const known = useRef<Set<string>>(new Set())
  const used = useMemo(() => new Set(inRoute.map(s => s.client_id)), [inRoute])
  const list = useMemo(() => {
    const n = norm(q.trim())
    return clients.filter(c => !n || norm([c.name, c.phone, c.street, c.neighborhood, c.city].join(' ')).includes(n)).sort((a, b) => a.name.localeCompare(b.name, 'pt'))
  }, [clients, q])
  const toggle = (id: string) => setSel(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]))

  return (
    <div className="fixed inset-0 z-20 overflow-y-auto bg-slate-900">
      <div className="mx-auto max-w-lg p-4 pb-28">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Adicionar à rota</h2><button onClick={onClose} className="rounded-lg bg-slate-700 px-3 py-2 text-sm">Voltar</button></div>
        <div className="mb-3 flex gap-2">
          <input className="min-w-0 flex-1 rounded-xl bg-slate-800 px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500" placeholder="Buscar cliente, bairro ou rua" value={q} onChange={e => setQ(e.target.value)} />
          <button onClick={() => { known.current = new Set(clients.map(c => c.id)); setCreating(true) }} className="shrink-0 rounded-xl bg-slate-700 px-4 text-sm font-semibold">+ Novo</button>
        </div>
        {list.length === 0 && <p className="mt-8 text-center text-slate-400">{clients.length ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.'}</p>}
        <ul className="flex flex-col gap-2">
          {list.map(c => { const in_ = used.has(c.id), on = sel.includes(c.id); return (
            <li key={c.id}><button disabled={in_} onClick={() => toggle(c.id)} className={`flex w-full items-center gap-3 rounded-2xl p-4 text-left ${on ? 'bg-orange-500/20 ring-2 ring-orange-500' : 'bg-slate-800'} ${in_ ? 'opacity-40' : ''}`}>
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 font-bold ${on ? 'border-orange-500 bg-orange-500 text-slate-900' : 'border-slate-500'}`}>{on ? '✓' : ''}</span>
              <span className="min-w-0"><span className="block font-semibold">{c.name}{in_ ? ' · já está na rota' : ''}</span><span className="block truncate text-sm text-slate-400">{[c.street, c.number].filter(Boolean).join(', ') || 'Sem endereço'}{c.neighborhood ? ` · ${c.neighborhood}` : ''}</span></span>
            </button></li>) })}
        </ul>
      </div>
      <div className="fixed inset-x-0 bottom-0 bg-slate-900 p-4"><div className="mx-auto max-w-lg">
        <button disabled={!sel.length} onClick={() => onPicked(clients.filter(c => sel.includes(c.id)))} className="w-full rounded-xl bg-orange-500 py-4 text-lg font-bold text-slate-900 disabled:opacity-40">{sel.length ? `Continuar com ${sel.length} cliente${sel.length > 1 ? 's' : ''}` : 'Toque nos clientes para marcar'}</button>
      </div></div>
      {creating && <ClientForm initial={null} all={clients} onClose={() => setCreating(false)}
        onSaved={async () => { setCreating(false); await syncClients(); const fresh = (await localDb.clients.toArray()).filter(c => !known.current.has(c.id)); setSel(s => [...s, ...fresh.map(c => c.id)]) }} />}
    </div>
  )
}

/** Escolher clientes (ou cadastrar um novo) e acrescentá-los a uma rota que já existe. */
export default function AddToRoute({ routeId, onClose, onDone }: { routeId: string; onClose: () => void; onDone: (n: number) => void }) {
  const [picked, setPicked] = useState<Client[] | null>(null)
  if (!picked) return <ClientPicker routeId={routeId} onClose={onClose} onPicked={setPicked} />
  return <RouteBuilder clients={picked} routeId={routeId} onClose={() => setPicked(null)} onSaved={() => onDone(picked.length)} />
}
