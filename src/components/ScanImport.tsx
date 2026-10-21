import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { canon, digits, lookupCep, syncClients, tidyName, type Client } from '../lib/clients'
import { geocodeClients } from '../lib/geo'
import { compress, dedupe, matchEntry, readPhoto, type Entry, type Match, type ScanError } from '../lib/scan'
import RouteBuilder from './RouteBuilder'

type Item = { key: string; photos: number[]; e: Entry; match: Match; mode: 'existing' | 'new' | 'ask'; include: boolean; packages: number; open: boolean; saved?: Client }
type Phase = 'pick' | 'reading' | 'review' | 'saving' | 'route'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const inp = 'w-full rounded-lg bg-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500'
const fatalText = { no_key: 'A leitura das fotos ainda não está ativada: falta configurar a chave do Gemini no Supabase.', invalid_key: 'A chave do Gemini foi recusada. Confira se foi copiada inteira e se está ativa.' } as const
const errText: Record<ScanError, string> = { no_key: '', invalid_key: '', rate_limited: 'o serviço pediu para esperar', bad_image: 'foto ilegível', unavailable: 'serviço indisponível', network: 'sem internet' }
const mostCommon = (l: string[]) => { const m = new Map<string, number>(); for (const s of l) m.set(s, (m.get(s) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] }
const addr = (c: Pick<Client, 'street' | 'number' | 'neighborhood'>) => [[c.street, c.number].filter(Boolean).join(', '), c.neighborhood].filter(Boolean).join(' · ')

export default function ScanImport({ clients, onClose, onRouteSaved }: { clients: Client[]; onClose: () => void; onRouteSaved: () => void }) {
  const [phase, setPhase] = useState<Phase>('pick')
  const [files, setFiles] = useState<File[]>([])
  const [progress, setProgress] = useState({ i: 0, n: 0, note: '' })
  const [failed, setFailed] = useState<{ index: number; error: ScanError }[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [fatal, setFatal] = useState<'' | 'no_key' | 'invalid_key'>('')
  const [msg, setMsg] = useState('')
  const [routeClients, setRouteClients] = useState<Client[]>([])
  const reads = useRef(new Map<number, Entry[]>())
  const previews = useRef<string[]>([])
  const picked = useMemo(() => files.map(f => URL.createObjectURL(f)), [files])
  useEffect(() => () => picked.forEach(u => URL.revokeObjectURL(u)), [picked])
  useEffect(() => () => previews.current.forEach(u => u && URL.revokeObjectURL(u)), [])

  async function readAll(idxs: number[]) {
    setPhase('reading'); setFailed([]); setFatal(''); setMsg('')
    const fails: { index: number; error: ScanError }[] = []
    for (let k = 0; k < idxs.length; k++) {
      const i = idxs[k]
      setProgress({ i: k + 1, n: idxs.length, note: '' })
      let b64 = ''
      try { const c = await compress(files[i]); b64 = c.base64; previews.current[i] = URL.createObjectURL(c.blob) } catch { fails.push({ index: i, error: 'bad_image' }); continue }
      for (let attempt = 0; ; attempt++) {
        const r = await readPhoto(b64)
        if ('entries' in r) { reads.current.set(i, r.entries); break }
        if (r.error === 'no_key' || r.error === 'invalid_key') { setFatal(r.error); setPhase('pick'); return }
        if (r.error === 'rate_limited' && attempt < 3) { setProgress({ i: k + 1, n: idxs.length, note: 'Aguardando o limite do serviço gratuito…' }); await sleep(15000); continue }
        fails.push({ index: i, error: r.error }); break
      }
      if (k < idxs.length - 1) await sleep(1500) // respeita o limite por minuto
    }
    setFailed(fails); build(); setPhase('review')
  }

  function build() {
    const all: (Entry & { photo: number })[] = []
    ;[...reads.current.entries()].sort((a, b) => a[0] - b[0]).forEach(([photo, es]) => es.forEach(e => all.push({ ...e, photo })))
    setItems(dedupe(all).map((e, n) => {
      const match = matchEntry(e, clients)
      return { key: String(n), photos: e.photos, e, match, mode: match.status === 'existing' ? 'existing' : match.status === 'maybe' ? 'ask' : 'new', include: true, packages: e.packages ?? 1, open: false }
    }))
  }

  const upd = (key: string, p: Partial<Item>) => setItems(a => a.map(i => (i.key === key ? { ...i, ...p } : i)))
  const updE = (key: string, p: Partial<Entry>) => setItems(a => a.map(i => (i.key === key ? { ...i, e: { ...i.e, ...p } } : i)))
  const inc = items.filter(i => i.include)
  const nExisting = inc.filter(i => i.mode === 'existing').length, nNew = inc.filter(i => i.mode === 'new').length, nAsk = inc.filter(i => i.mode === 'ask').length

  async function saveAndContinue() {
    if (!inc.length) { setMsg('Marque pelo menos um cliente.'); return }
    if (nAsk) { setMsg('Confirme os clientes marcados com ⚠️ antes de continuar.'); return }
    setPhase('saving'); setMsg('')
    const defCity = mostCommon(clients.map(c => c.city)) || 'Recife'
    const cityList = [...new Set(clients.map(c => c.city))]
    const hoodsOf = (city: string) => [...new Set(clients.filter(c => c.city.toLowerCase() === city.toLowerCase()).map(c => c.neighborhood).filter(Boolean) as string[])]
    const toCreate = inc.filter(i => i.mode === 'new' && !i.saved)
    const rows: Record<string, unknown>[] = [], problems: string[] = []
    for (const it of toCreate) {
      const e = it.e
      let street = e.street, hood = e.neighborhood, city = e.city
      if (e.cep && e.cep.length === 8 && (!street || !hood || !city)) { // completa com o CEP
        try { const r = await lookupCep(e.cep); if (r) { street = street || r.street; hood = hood || r.neighborhood; city = city || r.city } } catch { /* sem internet para o CEP */ }
      }
      const cityName = canon(city || defCity, cityList)
      if (!e.name.trim()) { problems.push('Um cliente novo está sem nome.'); upd(it.key, { open: true }); continue }
      if (!hood) { problems.push(`${e.name}: falta o bairro.`); upd(it.key, { open: true }); continue }
      rows.push({ name: tidyName(e.name), phone: digits(e.phone ?? '') || null, cep: e.cep && e.cep.length === 8 ? e.cep : null, street: street ? tidyName(street) : null,
        number: e.number?.trim() || null, complement: e.complement?.trim() || null, neighborhood: canon(hood, hoodsOf(cityName)), city: cityName, notes: e.notes?.trim() || null })
    }
    if (problems.length) { setMsg(problems.join(' ')); setPhase('review'); return }
    let created: Client[] = []
    if (rows.length) {
      const { data, error } = await supabase.from('clients').insert(rows).select('*')
      if (error || !data) { setMsg(error?.message ?? 'Não foi possível cadastrar os clientes novos.'); setPhase('review'); return }
      created = data as Client[]
    }
    const byKey = new Map(toCreate.filter((_, n) => n < created.length).map((it, n) => [it.key, created[n]]))
    const next = items.map(i => (byKey.has(i.key) ? { ...i, saved: byKey.get(i.key) } : i))
    setItems(next)
    await syncClients()
    if (created.length) void geocodeClients(created.map(c => c.id))
    setRouteClients(next.filter(i => i.include).map(i => (i.mode === 'existing' ? i.match.client! : i.saved!)).filter(Boolean))
    setPhase('route')
  }

  if (phase === 'route') {
    const defaults: Record<string, number> = {}
    items.filter(i => i.include).forEach(i => { const c = i.mode === 'existing' ? i.match.client : i.saved; if (c) defaults[c.id] = i.packages })
    return <RouteBuilder clients={routeClients} defaults={defaults} onClose={() => setPhase('review')} onSaved={onRouteSaved} />
  }
  const wrap = (children: React.ReactNode) => <div className="fixed inset-0 z-20 overflow-y-auto bg-slate-900"><div className="mx-auto max-w-lg p-4 pb-32">{children}</div></div>
  const head = (t: string) => <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">{t}</h2><button onClick={onClose} className="rounded-lg bg-slate-700 px-3 py-2 text-sm">Fechar</button></div>

  if (phase === 'reading') return wrap(<>{head('Lendo as fotos')}<div className="mt-10 text-center"><p className="text-5xl">📖</p><p className="mt-4 text-lg font-bold">Foto {progress.i} de {progress.n}</p><div className="mx-auto mt-3 h-2 max-w-xs overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${(progress.i / Math.max(1, progress.n)) * 100}%` }} /></div>{progress.note && <p className="mt-3 text-sm text-amber-300">{progress.note}</p>}<p className="mt-4 text-sm text-slate-400">Pode deixar o app aberto. Cada foto leva alguns segundos.</p></div></>)
  if (phase === 'saving') return wrap(<>{head('Cadastrando')}<p className="mt-16 text-center text-lg">Cadastrando os clientes novos…</p></>)

  if (phase === 'pick') return wrap(<>
    {head('Importar fotos das encomendas')}
    <p className="mb-3 text-sm text-slate-300">Escolha as fotos dos blocos e etiquetas (pode ser várias de uma vez). O app lê todas, mostra os clientes para você conferir e depois monta a rota. <span className="text-slate-500">As fotos são lidas pelo Gemini (Google) e não ficam guardadas no RHD.</span></p>
    {fatal && <p className="mb-3 rounded-xl bg-amber-500/20 p-3 text-sm text-amber-200">⚠️ {fatalText[fatal]}</p>}
    <label className="mb-3 flex cursor-pointer items-center justify-center rounded-2xl bg-slate-800 py-5 text-lg font-bold active:scale-[0.99]">📷 Escolher fotos
      <input type="file" accept="image/*" multiple className="hidden" onChange={e => { const f = Array.from(e.target.files ?? []); if (f.length) setFiles(p => [...p, ...f]); e.target.value = '' }} /></label>
    {files.length > 0 && <>
      <p className="mb-2 text-sm text-slate-400">{files.length} foto(s) escolhida(s)</p>
      <div className="mb-4 grid grid-cols-4 gap-2">{picked.map((u, i) => <div key={u} className="relative"><img src={u} alt="" className="h-20 w-full rounded-lg object-cover" /><button onClick={() => setFiles(p => p.filter((_, k) => k !== i))} aria-label="Remover foto" className="absolute right-1 top-1 rounded-full bg-black/70 px-2 text-xs">✕</button></div>)}</div>
      <div className="fixed inset-x-0 bottom-0 bg-slate-900 p-4"><div className="mx-auto max-w-lg"><button onClick={() => readAll(files.map((_, i) => i))} className="w-full rounded-xl bg-orange-500 py-4 text-lg font-bold text-slate-900">Ler {files.length} foto{files.length > 1 ? 's' : ''}</button></div></div></>}
  </>)

  // phase === 'review'
  return wrap(<>
    {head('Conferir clientes')}
    <p className="mb-1 font-semibold">{items.length} cliente{items.length !== 1 ? 's' : ''} encontrado{items.length !== 1 ? 's' : ''} em {files.length} foto{files.length !== 1 ? 's' : ''}</p>
    <p className="mb-3 text-sm text-slate-400">✅ {nExisting} já cadastrado(s) · 🆕 {nNew} novo(s) · ⚠️ {nAsk} para confirmar</p>
    {failed.length > 0 && <div className="mb-3 rounded-xl bg-red-500/15 p-3 text-sm text-red-200"><p className="font-semibold">{failed.length} foto(s) não foram lidas ({[...new Set(failed.map(f => errText[f.error]))].filter(Boolean).join(', ')}).</p>
      <button onClick={() => readAll(failed.map(f => f.index))} className="mt-1 underline">Tentar de novo (refaz a conferência)</button></div>}
    {items.length === 0 && <p className="mt-8 text-center text-slate-400">Não encontrei nenhum destinatário nas fotos. Tente fotos mais nítidas e de perto.</p>}
    <ul className="flex flex-col gap-3">
      {items.map(it => (
        <li key={it.key} className={`rounded-2xl p-4 ${it.include ? 'bg-slate-800' : 'bg-slate-800/40 opacity-60'}`}>
          <div className="flex items-start gap-3">
            <div className="flex shrink-0 gap-1">{it.photos.slice(0, 2).map(p => previews.current[p] && <a key={p} href={previews.current[p]} target="_blank" rel="noreferrer"><img src={previews.current[p]} alt="" className="h-14 w-14 rounded-lg object-cover" /></a>)}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{it.e.name || '(sem nome)'}</p>
              <p className="truncate text-sm text-slate-400">{addr({ street: it.e.street, number: it.e.number, neighborhood: it.e.neighborhood }) || 'sem endereço lido'}</p>
              <p className="text-xs">{it.mode === 'existing' ? <span className="text-emerald-300">✅ Já cadastrado: {it.match.client?.name}</span> : it.mode === 'ask' ? <span className="text-amber-300">⚠️ Parece com um cliente cadastrado</span> : <span className="text-sky-300">🆕 Cliente novo</span>}{it.e.confidence === 'low' && <span className="ml-2 text-red-300">leitura difícil, confira</span>}</p>
            </div>
            <input type="checkbox" checked={it.include} onChange={e => upd(it.key, { include: e.target.checked })} aria-label="Incluir na rota" className="mt-1 h-6 w-6 shrink-0 accent-orange-500" />
          </div>
          {it.include && it.mode === 'ask' && it.match.client && <div className="mt-3 rounded-xl bg-amber-500/10 p-3 text-sm">
            <p className="mb-2 text-amber-100">Já existe <b>{it.match.client.name}</b> — {addr(it.match.client) || 'sem endereço'}. É a mesma pessoa?</p>
            <div className="flex gap-2"><button onClick={() => upd(it.key, { mode: 'existing' })} className="flex-1 rounded-lg bg-emerald-500 py-2 font-bold text-slate-900">É este</button><button onClick={() => upd(it.key, { mode: 'new', open: true })} className="flex-1 rounded-lg bg-slate-700 py-2 font-semibold">É outro (cadastrar)</button></div></div>}
          {it.include && it.mode === 'existing' && it.match.client && (it.e.street && it.match.client.street && it.e.street.toLowerCase() !== it.match.client.street.toLowerCase()) && <p className="mt-2 rounded-lg bg-slate-900/60 p-2 text-xs text-slate-300">Atenção: na foto a rua é “{it.e.street}”, mas o cadastro tem “{it.match.client.street}”. A rota usa o cadastro.</p>}
          {it.include && (
            <div className="mt-3 flex items-center gap-3 text-sm"><span className="text-xs uppercase tracking-wide text-slate-400">Pacotes</span>
              <button onClick={() => upd(it.key, { packages: Math.max(1, it.packages - 1) })} className="h-8 w-8 rounded-lg bg-slate-700">−</button><span className="w-5 text-center font-semibold">{it.packages}</span><button onClick={() => upd(it.key, { packages: it.packages + 1 })} className="h-8 w-8 rounded-lg bg-slate-700">+</button>
              {it.mode === 'new' && <button onClick={() => upd(it.key, { open: !it.open })} className="ml-auto text-orange-400 underline">{it.open ? 'Fechar dados' : 'Editar dados'}</button>}</div>)}
          {it.include && it.mode === 'new' && it.open && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <input className={`${inp} col-span-2`} placeholder="Nome *" value={it.e.name} onChange={e => updE(it.key, { name: e.target.value })} />
              <input className={inp} placeholder="Telefone" inputMode="tel" value={it.e.phone ?? ''} onChange={e => updE(it.key, { phone: digits(e.target.value) || null })} />
              <input className={inp} placeholder="CEP" inputMode="numeric" value={it.e.cep ?? ''} onChange={e => updE(it.key, { cep: digits(e.target.value).slice(0, 8) || null })} />
              <input className={`${inp} col-span-2`} placeholder="Rua" value={it.e.street ?? ''} onChange={e => updE(it.key, { street: e.target.value || null })} />
              <input className={inp} placeholder="Número" value={it.e.number ?? ''} onChange={e => updE(it.key, { number: e.target.value || null })} />
              <input className={inp} placeholder="Complemento" value={it.e.complement ?? ''} onChange={e => updE(it.key, { complement: e.target.value || null })} />
              <input className={inp} placeholder="Bairro *" value={it.e.neighborhood ?? ''} onChange={e => updE(it.key, { neighborhood: e.target.value || null })} />
              <input className={inp} placeholder="Cidade" value={it.e.city ?? ''} onChange={e => updE(it.key, { city: e.target.value || null })} />
              <input className={`${inp} col-span-2`} placeholder="Observações" value={it.e.notes ?? ''} onChange={e => updE(it.key, { notes: e.target.value || null })} /></div>)}
        </li>
      ))}
    </ul>
    <div className="fixed inset-x-0 bottom-0 bg-slate-900 p-4"><div className="mx-auto max-w-lg">
      {msg && <p className="mb-2 text-sm text-amber-300">{msg}</p>}
      <button disabled={!inc.length} onClick={saveAndContinue} className="w-full rounded-xl bg-orange-500 py-4 text-lg font-bold text-slate-900 disabled:opacity-40">{nNew ? `Cadastrar ${nNew} novo(s) e montar a rota` : 'Montar a rota'} · {inc.length}</button>
    </div></div>
  </>)
}
