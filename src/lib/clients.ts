import Dexie, { type Table } from 'dexie'
import type { Op, RouteRow, StopRow } from './routes'

export type Client = {
  id: string; owner_id?: string; name: string; phone: string | null; cep: string | null
  street: string | null; number: string | null; complement: string | null
  neighborhood: string | null; city: string; pin_url: string | null; notes: string | null
  lat: number | null; lng: number | null; geo_quality: string | null
}
export type ClientDraft = Omit<Client, 'id' | 'owner_id'>

class LocalDB extends Dexie {
  clients!: Table<Client, string>
  routes!: Table<RouteRow, string>
  stops!: Table<StopRow, string>
  outbox!: Table<Op, number>
  constructor() {
    super('rhd')
    this.version(1).stores({ clients: 'id, neighborhood, city' })
    this.version(2).stores({ clients: 'id, neighborhood, city', routes: 'id', stops: 'id, route_id', outbox: '++seq' })
  }
}
export const localDb = new LocalDB()

export const CITIES = ['Recife', 'Jaboatão dos Guararapes', 'Olinda', 'Paulista', 'Camaragibe', 'São Lourenço da Mata', 'Cabo de Santo Agostinho']
export const emptyDraft = (): ClientDraft => ({ name: '', phone: '', cep: '', street: '', number: '', complement: '', neighborhood: '', city: 'Recife', pin_url: '', notes: '', lat: null, lng: null, geo_quality: null })

export const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
export const digits = (s: string) => s.replace(/\D/g, '')

export async function lookupCep(cep: string) {
  const r = await fetch(`https://viacep.com.br/ws/${digits(cep)}/json/`)
  const j = await r.json()
  if (j.erro) return null
  return { street: j.logradouro as string, neighborhood: j.bairro as string, city: j.localidade as string }
}

/* ---------- padronização de nomes de cidade e bairro ---------- */
const CONNECTORS = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])
/** "ponte DOS carvalhos" -> "Ponte dos Carvalhos" */
export const tidyName = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase().split(' ')
  .map((w, i) => (i > 0 && CONNECTORS.has(w) ? w : w.replace(/^(\P{L}*)(\p{L})/u, (_m, a: string, b: string) => a + b.toUpperCase()))).join(' ')

export function lev(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0]; prev[0] = i
    for (let j = 1; j <= b.length; j++) { const t = prev[j]; prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1)); last = t }
  }
  return prev[b.length]
}
const flat = (s: string) => norm(s).replace(/\s+/g, ' ').trim()
/** Se o que foi digitado parece um bairro que já existe (erro de digitação, maiúsculas, acento), devolve o já existente. */
export function suggestHood(value: string, existing: string[]): string | null {
  const v = flat(value)
  if (!v) return null
  let best: string | null = null, bd = Infinity
  const limit = Math.max(1, Math.min(2, Math.floor(v.length / 5)))
  for (const e of existing) {
    const x = flat(e)
    if (x === v) return e === value.trim() ? null : e
    const d = lev(v, x)
    if (d <= limit && d < bd) { bd = d; best = e }
  }
  return best
}
/** Usa a grafia já cadastrada, se existir; senão arruma maiúsculas. */
export const canon = (value: string, list: string[]) => list.find(e => flat(e) === flat(value)) ?? tidyName(value)
