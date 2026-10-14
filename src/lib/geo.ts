import { supabase } from './supabase'
import { refresh } from './routes'

export type GeoQuality = 'house' | 'street' | 'neighborhood' | 'city' | 'none'
export const qualityLabel: Record<string, string> = { house: 'Endereço exato', street: 'Rua', neighborhood: 'Só o bairro', city: 'Só a cidade', none: 'Não localizado' }
export const isGood = (q: string | null | undefined) => q === 'house' || q === 'street'

async function openRouteIds() {
  const { data } = await supabase.from('routes').select('id').in('status', ['draft', 'active'])
  return (data ?? []).map(r => r.id as string)
}
async function pushToPending(clientId: string, fields: Record<string, unknown>, routeIds: string[]) {
  if (!routeIds.length) return
  await supabase.from('route_stops').update(fields).eq('client_id', clientId).eq('status', 'pending').in('route_id', routeIds)
}

/** Leva a edição de um cliente (nome, telefone, endereço, localização) às paradas pendentes de rotas abertas. */
export async function propagateClient(clientId: string) {
  const { data: c } = await supabase.from('clients').select('*').eq('id', clientId).single()
  if (!c) return
  await pushToPending(clientId, {
    client_name: c.name, phone: c.phone, client_notes: c.notes, neighborhood: c.neighborhood, city: c.city,
    address: [c.street, c.number, c.complement].filter(Boolean).join(', ') || null, lat: c.lat, lng: c.lng, geo_quality: c.geo_quality,
  }, await openRouteIds())
}

export async function geocodeClients(ids: string[], onProgress?: (done: number, total: number) => void) {
  let ok = 0, failed = 0, limited = false
  if (!ids.length) return { ok, failed, limited }
  const { data: cs } = await supabase.from('clients').select('id, street, number, neighborhood, city').in('id', ids)
  const list = cs ?? [], routeIds = await openRouteIds()
  for (let i = 0; i < list.length && !limited; i += 3) {
    const batch = list.slice(i, i + 3)
    const { data, error } = await supabase.functions.invoke('geocode', { body: { items: batch } })
    if (error || !data) { failed += batch.length; continue }
    if (data.error === 'rate_limited') limited = true
    for (const r of (data.results ?? []) as { id: string; lat?: number; lng?: number; quality: GeoQuality }[]) {
      const patch = { lat: r.lat ?? null, lng: r.lng ?? null, geo_quality: r.quality, geo_at: new Date().toISOString() }
      const { error: e } = await supabase.from('clients').update(patch).eq('id', r.id)
      if (e) { failed++; continue }
      await pushToPending(r.id, { lat: patch.lat, lng: patch.lng, geo_quality: patch.geo_quality }, routeIds)
      if (r.quality === 'none') failed++; else ok++
    }
    onProgress?.(Math.min(i + 3, list.length), list.length)
  }
  return { ok, failed, limited }
}

/** Depois de salvar um cliente: atualiza as paradas abertas, localiza o endereço (se mudou) e baixa a rota atualizada. */
export async function afterClientSave(id: string, needsGeo: boolean) {
  try {
    await propagateClient(id)
    if (needsGeo) await geocodeClients([id])
    await refresh()
  } catch { /* sem internet: a próxima abertura tenta de novo */ }
}
