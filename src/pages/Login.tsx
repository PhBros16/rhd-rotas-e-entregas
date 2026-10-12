import { useState, type FormEvent } from 'react'
import { supabase, userToEmail } from '../lib/supabase'

export default function Login() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMsg('')
    const email = userToEmail(username)
    const { error } = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { username: username.trim().toLowerCase(), full_name: fullName.trim() } } })
    if (error) setMsg(error.message.includes('Invalid login') ? 'Usuário ou senha incorretos.' : error.message)
    setBusy(false)
  }

  const input = 'w-full rounded-xl bg-slate-800 px-4 py-4 text-lg outline-none focus:ring-2 focus:ring-orange-500'
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <img src="/favicon.svg" alt="RHD" className="mx-auto h-24 w-24" />
        <h1 className="mt-3 text-2xl font-bold">RHD · Rotas e Entregas</h1>
        <p className="text-slate-400">Rogério Home Delivery</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {mode === 'signup' && <input className={input} placeholder="Nome completo" value={fullName} onChange={e => setFullName(e.target.value)} required />}
        <input className={input} placeholder="Usuário" autoCapitalize="none" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required />
        <input className={input} type="password" placeholder="Senha (mín. 6)" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} value={password} onChange={e => setPassword(e.target.value)} required />
        {msg && <p className="text-sm text-red-400">{msg}</p>}
        <button disabled={busy} className="rounded-xl bg-orange-500 py-4 text-lg font-bold text-slate-900 active:scale-95 disabled:opacity-50">
          {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
        </button>
      </form>
      <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMsg('') }} className="text-sm text-slate-400 underline">
        {mode === 'login' ? 'Primeiro acesso? Criar conta' : 'Já tenho conta'}
      </button>
    </main>
  )
}
