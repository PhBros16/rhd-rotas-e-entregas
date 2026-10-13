import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { brl } from '../components/RouteBuilder'

type Stop = { id: string; client_name: string; neighborhood: string | null; price: number; packages: number; position: number }
type Route = { id: string; name: string | null; status: 'draft' | 'active' | 'finished' | 'cancelled'; created_at: string; route_stops: Stop[] }
const label = { draft: 'Rascunho', active: 'Em andamento', finished: 'Finalizada', cancelled: 'Cancelada' } as const

export default function Routes() {
  const [routes, setRoutes] = useState<Route[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('routes').select('id, name, status, created_at, route_stops(id, client_name, neighborhood, price, packages, position)').order('created_at', { ascending: false })
    if (error) setErr(error.message); else setRoutes((data ?? []) as Route[])
  }, [])
  useEffect(() => { load() }, [load])

  async function remove(r: Route) {
    if (!window.confirm(`Excluir "${r.name}"?`)) return
    const { error } = await supabase.from('routes').delete().eq('id', r.id)
    if (error) setErr(error.message); else load()
  }

  return (
    <main className="mx-auto max-w-lg p-4">
      <header className="mb-4 flex items-center gap-3"><img src="/favicon.svg" alt="" className="h-10 w-10" /><div><h1 className="font-bold">Rotas</h1><p className="text-sm text-slate-400">{routes.length} salva{routes.length !== 1 ? 's' : ''}</p></div></header>
      {err && <p className="mb-2 text-sm text-red-400">{err}</p>}
      {routes.length === 0 && !err && <p className="mt-10 text-center text-slate-400">Nenhuma rota ainda. Em Clientes, toque em “Montar rota”.</p>}
      <ul className="flex flex-col gap-3">
        {routes.map(r => {
          const stops = [...r.route_stops].sort((a, b) => a.position - b.position)
          const total = stops.reduce((a, s) => a + Number(s.price), 0)
          return (
            <li key={r.id} className="rounded-2xl bg-slate-800">
              <button onClick={() => setOpen(open === r.id ? null : r.id)} className="flex w-full items-start justify-between gap-2 p-4 text-left">
                <div><p className="font-semibold">{r.name}</p><p className="text-sm text-slate-400">{new Date(r.created_at).toLocaleDateString('pt-BR')} · {stops.length} entrega{stops.length !== 1 ? 's' : ''} · {brl(total)}</p></div>
                <span className="shrink-0 rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">{label[r.status]}</span>
              </button>
              {open === r.id && (
                <div className="border-t border-slate-700 p-4 pt-3">
                  <ol className="flex flex-col gap-2 text-sm">
                    {stops.map((s, i) => <li key={s.id} className="flex justify-between gap-2"><span className="min-w-0 truncate"><span className="text-slate-500">{i + 1}.</span> {s.client_name} <span className="text-slate-500">· {s.neighborhood}</span></span><span className="shrink-0 text-slate-300">{s.packages} pct · {brl(Number(s.price))}</span></li>)}
                  </ol>
                  {r.status === 'draft' && <button onClick={() => remove(r)} className="mt-4 rounded-xl bg-red-500/20 px-4 py-3 text-sm text-red-300">Excluir rota</button>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </main>
  )
}
