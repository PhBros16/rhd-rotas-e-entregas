import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, configured } from './lib/supabase'

export type Profile = { id: string; username: string; full_name: string; role: 'admin' | 'courier'; status: 'pending' | 'active' | 'blocked' }
type Ctx = { session: Session | null; profile: Profile | null; loading: boolean; signOut: () => Promise<void> }
const AuthCtx = createContext<Ctx>({ session: null, profile: null, loading: true, signOut: async () => {} })
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(configured)

  useEffect(() => {
    if (!configured) return
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); if (!data.session) setLoading(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setProfile(null); return }
    supabase.from('profiles').select('*').eq('id', session.user.id).single()
      .then(({ data }) => { setProfile(data as Profile | null); setLoading(false) })
  }, [session])

  const signOut = async () => { await supabase.auth.signOut() }
  return <AuthCtx.Provider value={{ session, profile, loading, signOut }}>{children}</AuthCtx.Provider>
}
