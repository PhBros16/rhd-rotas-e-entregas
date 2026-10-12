import { useState } from 'react'
import { AuthProvider, useAuth } from './auth'
import { configured } from './lib/supabase'
import Login from './pages/Login'
import Admin from './pages/Admin'
import Clients from './pages/Clients'

const Screen = ({ title, text, action }: { title: string; text: string; action?: () => void }) => (
  <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
    <img src="/favicon.svg" alt="" className="h-16 w-16" />
    <h1 className="text-xl font-bold">{title}</h1>
    <p className="text-slate-400">{text}</p>
    {action && <button onClick={action} className="rounded-xl bg-slate-800 px-6 py-3">Sair</button>}
  </main>
)

function AdminShell() {
  const [tab, setTab] = useState<'users' | 'clients'>('users')
  const b = (t: 'users' | 'clients') => `flex-1 rounded-lg py-2 text-sm font-semibold ${tab === t ? 'bg-orange-500 text-slate-900' : 'bg-slate-800 text-slate-300'}`
  return (<>
    <div className="mx-auto flex max-w-lg gap-2 p-4 pb-0"><button className={b('users')} onClick={() => setTab('users')}>Usuários</button><button className={b('clients')} onClick={() => setTab('clients')}>Clientes</button></div>
    {tab === 'users' ? <Admin /> : <Clients />}
  </>)
}

function Gate() {
  const { session, profile, loading, signOut } = useAuth()
  if (!configured) return <Screen title="Configuração pendente" text="Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY." />
  if (loading) return <Screen title="Carregando…" text="" />
  if (!session) return <Login />
  if (!profile || profile.status === 'pending') return <Screen title="Aguardando aprovação" text="Seu cadastro foi enviado. O administrador precisa liberar seu acesso." action={signOut} />
  if (profile.status === 'blocked') return <Screen title="Acesso bloqueado" text="Fale com o administrador." action={signOut} />
  if (profile.role === 'admin') return <AdminShell />
  return <Clients />
}

export default function App() { return <AuthProvider><Gate /></AuthProvider> }
