import { AuthProvider, useAuth } from './auth'
import { configured } from './lib/supabase'
import Login from './pages/Login'

const Screen = ({ title, text, action }: { title: string; text: string; action?: () => void }) => (
  <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
    <img src="/favicon.svg" alt="" className="h-16 w-16" />
    <h1 className="text-xl font-bold">{title}</h1>
    <p className="text-slate-400">{text}</p>
    {action && <button onClick={action} className="rounded-xl bg-slate-800 px-6 py-3">Sair</button>}
  </main>
)

function Gate() {
  const { session, profile, loading, signOut } = useAuth()
  if (!configured) return <Screen title="Configuração pendente" text="Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY." />
  if (loading) return <Screen title="Carregando…" text="" />
  if (!session) return <Login />
  if (!profile || profile.status === 'pending') return <Screen title="Aguardando aprovação" text="Seu cadastro foi enviado. O administrador precisa liberar seu acesso." action={signOut} />
  if (profile.status === 'blocked') return <Screen title="Acesso bloqueado" text="Fale com o administrador." action={signOut} />
  return <Screen title={`Olá, ${profile.full_name.split(' ')[0]}!`} text={profile.role === 'admin' ? 'Painel do administrador (em breve).' : 'Suas rotas aparecerão aqui (Fase 1).'} action={signOut} />
}

export default function App() { return <AuthProvider><Gate /></AuthProvider> }
