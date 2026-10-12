import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth, type Profile } from '../auth'

const statusLabel = { pending: 'Aguardando', active: 'Ativo', blocked: 'Bloqueado' } as const
const statusColor = { pending: 'bg-amber-500/20 text-amber-300', active: 'bg-emerald-500/20 text-emerald-300', blocked: 'bg-red-500/20 text-red-300' } as const

export default function Admin() {
  const { profile: me, signOut } = useAuth()
  const [users, setUsers] = useState<Profile[]>([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setUsers(([...(data as Profile[])]).sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending')))
  }, [])
  useEffect(() => { load() }, [load])

  async function update(u: Profile, patch: Partial<Pick<Profile, 'role' | 'status'>>, ask?: string) {
    if (ask && !window.confirm(ask)) return
    const { error } = await supabase.from('profiles').update(patch).eq('id', u.id)
    if (error) setError(error.message); else { setError(''); load() }
  }

  const btn = 'rounded-lg bg-slate-700 px-3 py-2 text-sm active:scale-95'
  return (
    <main className="mx-auto max-w-lg p-4">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3"><img src="/favicon.svg" alt="" className="h-10 w-10" /><div><h1 className="font-bold">Administração</h1><p className="text-sm text-slate-400">Olá, {me?.full_name.split(' ')[0]}</p></div></div>
        <button onClick={signOut} className={btn}>Sair</button>
      </header>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Usuários</h2>
      {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
      <ul className="flex flex-col gap-3">
        {users.map(u => {
          const self = u.id === me?.id
          return (
            <li key={u.id} className="rounded-2xl bg-slate-800 p-4">
              <div className="flex items-start justify-between gap-2">
                <div><p className="font-semibold">{u.full_name || u.username}</p><p className="text-sm text-slate-400">@{u.username} · {u.role === 'admin' ? 'Admin' : 'Entregador'}</p></div>
                <span className={`rounded-full px-3 py-1 text-xs ${statusColor[u.status]}`}>{statusLabel[u.status]}</span>
              </div>
              {self ? <p className="mt-3 text-sm text-slate-500">Você</p> : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {u.status !== 'active' && <button className={`${btn} !bg-orange-500 font-semibold text-slate-900`} onClick={() => update(u, { status: 'active' })}>Aprovar</button>}
                  {u.status === 'active' && <button className={btn} onClick={() => update(u, { status: 'blocked' }, `Bloquear ${u.full_name}?`)}>Bloquear</button>}
                  {u.role === 'courier' && u.status === 'active' && <button className={btn} onClick={() => update(u, { role: 'admin' }, `Dar acesso de ADMINISTRADOR a ${u.full_name}? Ele verá todos os dados.`)}>Tornar admin</button>}
                  {u.role === 'admin' && <button className={btn} onClick={() => update(u, { role: 'courier' }, `Tornar ${u.full_name} entregador?`)}>Tornar entregador</button>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </main>
  )
}
