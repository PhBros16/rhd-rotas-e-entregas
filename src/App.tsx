import { useEffect, useState } from 'react'
import { localDb } from './lib/clients'
import { AuthProvider, useAuth } from './auth'
import { configured } from './lib/supabase'
import Login from './pages/Login'
import Admin from './pages/Admin'
import Clients from './pages/Clients'
import Routes from './pages/Routes'
import Stats from './pages/Stats'
import Couriers from './pages/Couriers'
import { loadDraft } from './lib/draft'

const Screen = ({ title, text, action }: { title: string; text: string; action?: () => void }) => (
  <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
    <img src="/favicon.svg" alt="" className="h-16 w-16" />
    <h1 className="text-xl font-bold">{title}</h1>
    <p className="text-slate-400">{text}</p>
    {action && <button onClick={action} className="rounded-xl bg-slate-800 px-6 py-3">Sair</button>}
  </main>
)

function Shell({ admin, userId }: { admin: boolean; userId: string }) {
  const tabs: [string, string][] = admin ? [['stats', 'Painel'], ['couriers', 'Entregadores'], ['routes', 'Rotas'], ['clients', 'Clientes'], ['users', 'Usuários']] : [['clients', 'Clientes'], ['routes', 'Rotas']]
  const [tab, setTab] = useState(admin && !loadDraft() ? 'stats' : 'clients')
  useEffect(() => { localDb.routes.filter(r => r.status === 'active' && r.owner_id === userId).count().then(n => { if (n) setTab('routes') }) }, [userId])
  const b = (t: string) => `flex-1 rounded-lg py-2 text-sm font-semibold ${tab === t ? 'bg-orange-500 text-slate-900' : 'bg-slate-800 text-slate-300'}`
  return (<>
    <div className="mx-auto flex max-w-lg gap-2 overflow-x-auto p-4 pb-0">{tabs.map(([k, l]) => <button key={k} className={`${b(k)} ${admin ? 'shrink-0 px-4' : ''}`} onClick={() => setTab(k)}>{l}</button>)}</div>
    {tab === 'users' ? <Admin /> : tab === 'stats' ? <Stats /> : tab === 'couriers' ? <Couriers /> : tab === 'routes' ? <Routes /> : <Clients onRouteSaved={() => setTab('routes')} />}
  </>)
}

function Gate() {
  const { session, profile, loading, signOut } = useAuth()
  if (!configured) return <Screen title="Configuração pendente" text="Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY." />
  if (loading) return <Screen title="Carregando…" text="" />
  if (!session) return <Login />
  if (!profile || profile.status === 'pending') return <Screen title="Aguardando aprovação" text="Seu cadastro foi enviado. O administrador precisa liberar seu acesso." action={signOut} />
  if (profile.status === 'blocked') return <Screen title="Acesso bloqueado" text="Fale com o administrador." action={signOut} />
  return <Shell admin={profile.role === 'admin'} userId={profile.id} />
}

export default function App() { return <AuthProvider><Gate /></AuthProvider> }
