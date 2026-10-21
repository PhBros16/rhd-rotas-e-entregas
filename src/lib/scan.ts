import { supabase } from './supabase'
import { digits, lev, norm, type Client } from './clients'

export type Entry = {
  name: string; phone: string | null; street: string | null; number: string | null; complement: string | null
  neighborhood: string | null; city: string | null; cep: string | null; packages: number | null; notes: string | null
  confidence: 'high' | 'medium' | 'low'
}
export type ScanError = 'no_key' | 'invalid_key' | 'rate_limited' | 'bad_image' | 'unavailable' | 'network'
export type ReadResult = { entries: Entry[] } | { error: ScanError; message?: string }

/** Reduz a foto (lado maior 1600 px, JPEG) para enviar rápido e gastar menos da cota do serviço de leitura. */
export async function compress(file: File, max = 1600, quality = 0.82) {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('compress'))), 'image/jpeg', quality))
  const base64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(r.error); r.readAsDataURL(blob) })
  return { blob, base64 }
}

export async function readPhoto(base64: string): Promise<ReadResult> {
  try {
    const { data, error } = await supabase.functions.invoke('scan', { body: { image: base64, mime: 'image/jpeg' } })
    if (error) return { error: 'unavailable' }
    if (data?.error) return { error: data.error as ScanError, message: data.message }
    return { entries: ((data?.entries ?? []) as Partial<Entry>[]).map(clean).filter(e => e.name || e.phone || e.street) }
  } catch { return { error: 'network' } }
}

export function clean(e: Partial<Entry>): Entry {
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  return {
    name: s(e.name) ?? '', phone: digits(String(e.phone ?? '')) || null, street: s(e.street), number: s(e.number), complement: s(e.complement),
    neighborhood: s(e.neighborhood), city: s(e.city), cep: digits(String(e.cep ?? '')).slice(0, 8) || null,
    packages: typeof e.packages === 'number' && e.packages > 0 ? Math.round(e.packages) : null, notes: s(e.notes),
    confidence: e.confidence === 'high' || e.confidence === 'low' ? e.confidence : 'medium',
  }
}

const flat = (s: string | null | undefined) => norm(s ?? '').replace(/\s+/g, ' ').trim()
const tail = (p: string | null, n = 8) => digits(p ?? '').slice(-n)

/** Junta a mesma pessoa que aparece em mais de uma foto (mesmo telefone, ou mesmo nome e rua). */
export function dedupe(entries: (Entry & { photo: number })[]) {
  const out: (Entry & { photos: number[] })[] = []
  for (const e of entries) {
    const ph = tail(e.phone), nm = flat(e.name)
    const dup = out.find(o => (ph.length >= 8 && tail(o.phone) === ph) || (nm && flat(o.name) === nm && (!o.street || !e.street || flat(o.street) === flat(e.street))))
    if (!dup) { out.push({ ...e, photos: [e.photo] }); continue }
    dup.photos.push(e.photo)
    const d = dup as unknown as Record<string, unknown>
    for (const k of ['phone', 'street', 'number', 'complement', 'neighborhood', 'city', 'cep', 'notes', 'packages'] as const) if (d[k] == null && e[k] != null) d[k] = e[k]
  }
  return out
}

export type Match = { status: 'existing' | 'maybe' | 'new'; client?: Client; others: Client[] }
/** Procura o cliente já cadastrado: telefone igual é certeza; nome igual com mesma rua também; só o nome é dúvida. */
export function matchEntry(e: Pick<Entry, 'name' | 'phone' | 'street' | 'number'>, clients: Client[]): Match {
  const ph = tail(e.phone)
  if (ph.length >= 8) { const hit = clients.find(c => tail(c.phone) === ph); if (hit) return { status: 'existing', client: hit, others: [] } }
  const nm = flat(e.name)
  if (!nm) return { status: 'new', others: [] }
  const named = clients.filter(c => { const cn = flat(c.name); return cn === nm || (nm.length >= 8 && lev(cn, nm) <= 2) })
  if (!named.length) return { status: 'new', others: [] }
  const sameAddr = named.find(c => c.street && e.street && flat(c.street) === flat(e.street) && (!e.number || !c.number || flat(c.number) === flat(e.number)))
  return sameAddr ? { status: 'existing', client: sameAddr, others: [] } : { status: 'maybe', client: named[0], others: named.slice(1) }
}
