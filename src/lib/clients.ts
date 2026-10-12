import Dexie, { type Table } from 'dexie'

export type Client = {
  id: string; owner_id?: string; name: string; phone: string | null; cep: string | null
  street: string | null; number: string | null; complement: string | null
  neighborhood: string | null; city: string; pin_url: string | null; notes: string | null
}
export type ClientDraft = Omit<Client, 'id' | 'owner_id'>

class LocalDB extends Dexie {
  clients!: Table<Client, string>
  constructor() { super('rhd'); this.version(1).stores({ clients: 'id, neighborhood, city' }) }
}
export const localDb = new LocalDB()

export const CITIES = ['Recife', 'Jaboatão dos Guararapes', 'Olinda', 'Paulista', 'Camaragibe', 'São Lourenço da Mata', 'Cabo de Santo Agostinho']
export const emptyDraft = (): ClientDraft => ({ name: '', phone: '', cep: '', street: '', number: '', complement: '', neighborhood: '', city: 'Recife', pin_url: '', notes: '' })

export const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
export const digits = (s: string) => s.replace(/\D/g, '')

export async function lookupCep(cep: string) {
  const r = await fetch(`https://viacep.com.br/ws/${digits(cep)}/json/`)
  const j = await r.json()
  if (j.erro) return null
  return { street: j.logradouro as string, neighborhood: j.bairro as string, city: j.localidade as string }
}
