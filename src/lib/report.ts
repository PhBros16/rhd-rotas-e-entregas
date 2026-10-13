import type { RouteRow, StopRow } from './routes'
import { summarize } from './routes'
import { brl, dayLabel, dayKeyOf, fmtDur, fmtTime } from './format'
import { fmtPhone, mapsUrl, whatsUrl } from './maplink'

export const stopDest = (s: StopRow) => (s.lat != null && s.lng != null ? { lat: s.lat, lng: s.lng } : [s.address, s.neighborhood, s.city, 'PE'].filter(Boolean).join(', '))
export const stopLink = (s: StopRow) => (s.pin_url?.startsWith('http') ? s.pin_url : mapsUrl(stopDest(s)))

/** Agrupa por bairro, mantendo a ordem em que cada bairro aparece primeiro na rota. */
export function groupByHood(stops: StopRow[]) {
  const m = new Map<string, StopRow[]>()
  for (const s of [...stops].sort((a, b) => a.position - b.position)) {
    const k = `${s.neighborhood || 'Sem bairro'}${s.city ? ` · ${s.city}` : ''}`
    m.set(k, [...(m.get(k) ?? []), s])
  }
  return [...m.entries()]
}

const LINE = '━━━━━━━━━━━━━━━'

export function buildBackup(route: RouteRow, stops: StopRow[], owner: string) {
  const pending = stops.filter(s => s.status === 'pending')
  const done = stops.length - pending.length
  const now = new Date().toISOString()
  const head = ['🏠 *RHD · BACKUP DA ROTA*', LINE, `📍 *${route.name ?? 'Rota'}*`, `👤 ${owner} · 📅 ${new Date().toLocaleDateString('pt-BR')} · 🕐 gerado às ${fmtTime(now)}`, '',
    `📦 *${pending.length} entrega${pending.length !== 1 ? 's' : ''} por fazer* · ${pending.reduce((a, s) => a + s.packages, 0)} pacote(s)`,
    `💰 Previsto: *${brl(pending.reduce((a, s) => a + Number(s.price), 0))}*`, ...(done ? [`✅ Já feitas: ${done}`] : []), LINE]
  let n = 0
  const body = groupByHood(pending).flatMap(([hood, list]) => [
    '', `📍 *${hood.toUpperCase()}* — ${list.length} entrega${list.length !== 1 ? 's' : ''} · ${brl(list.reduce((a, s) => a + Number(s.price), 0))}`, '',
    ...list.flatMap(s => {
      n += 1
      return [`*${n}. ${s.client_name}*${s.deferred ? ' ⏳ (voltar depois)' : ''}`, `📌 ${s.address || 'Sem endereço'}`,
        `💰 ${brl(Number(s.price))} · 📦 ${s.packages} pacote${s.packages > 1 ? 's' : ''}`,
        ...(s.phone ? [`📞 ${fmtPhone(s.phone)}`, `💬 ${whatsUrl(s.phone)}`] : []),
        `🗺 ${stopLink(s)}`, ...(s.client_notes ? [`📝 ${s.client_notes}`] : []), '─────────────', '']
    }),
  ])
  return [...head, ...body, '_Backup gerado pelo app RHD. Em caso de falha, use esta lista._'].join('\n')
}

export function buildReport(route: RouteRow, stops: StopRow[], owner: string) {
  const m = summarize(stops)
  const lost = stops.filter(s => s.status === 'failed' || s.status === 'skipped')
  const dur = route.go_at && route.finished_at ? fmtDur(new Date(route.finished_at).getTime() - new Date(route.go_at).getTime()) : '—'
  const day = route.go_at ? dayLabel(dayKeyOf(route.go_at)) : ''
  const lines = ['🏠 *RHD · RELATÓRIO DA ROTA*', LINE, `📍 *${route.name ?? 'Rota'}*`, `👤 ${owner}`, `📅 ${day}`, `⏱ ${fmtTime(route.go_at)} → ${fmtTime(route.finished_at)} · *${dur}*`, '',
    '📊 *RESUMO*', `✅ Entregues: *${m.delivered}* de ${m.total}`, `❌ Não entregues: *${m.failed + m.skipped}*`, `🔁 Entregues após voltar: *${m.retried.length}*`, `📦 Pacotes entregues: *${m.packages}*`, '',
    '💰 *FINANCEIRO*', `Previsto: ${brl(m.planned)}`, `Recebido: *${brl(m.received)}*`, `   💠 Pix: ${brl(m.pix)}`, `   💵 Dinheiro: ${brl(m.cash)}`]
  if (m.diffs.length) lines.push('', `⚠️ *PAGAMENTO DIFERENTE* (${m.diffs.length})`, ...m.diffs.map(s => `   • ${s.client_name}: ${brl(Number(s.price))} → *${brl(Number(s.paid_amount ?? 0))}*`))
  if (lost.length) lines.push('', `❌ *NÃO ENTREGUES* (${lost.length})`, ...lost.map(s => `   • ${s.client_name} — ${s.status === 'skipped' ? 'não realizada' : s.notes || 'sem motivo'}`))
  lines.push('', LINE, '📍 *ENTREGAS POR BAIRRO*')
  for (const [hood, list] of groupByHood(stops)) {
    const ok = list.filter(s => s.status === 'delivered')
    lines.push('', `📍 *${hood.toUpperCase()}* — ${ok.length}/${list.length} · ${brl(ok.reduce((a, s) => a + Number(s.paid_amount ?? 0), 0))}`)
    list.forEach((s, i) => lines.push(s.status === 'delivered'
      ? `  ${i + 1}. ✅ ${fmtTime(s.delivered_at)} *${s.client_name}* — ${s.pay_method === 'pix' ? '💠 Pix' : '💵 Dinheiro'} ${brl(Number(s.paid_amount ?? 0))} · ${s.packages} pct${s.attempt_count > 1 ? ` · 🔁 ${s.attempt_count}ª tentativa` : ''}${s.received_by ? ` · recebeu: ${s.received_by}` : ''}`
      : `  ${i + 1}. ❌ *${s.client_name}* — ${s.status === 'skipped' ? 'não realizada' : s.notes || 'não entregue'}`))
  }
  return [...lines, '', '_Relatório gerado pelo app RHD._'].join('\n')
}

export async function shareText(text: string): Promise<'shared' | 'copied' | 'opened' | 'cancelled'> {
  try { if (navigator.share) { await navigator.share({ text }); return 'shared' } } catch (e) { if ((e as Error).name === 'AbortError') return 'cancelled' }
  try { await navigator.clipboard.writeText(text); return 'copied' } catch { /* sem permissão */ }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank'); return 'opened'
}
export async function copyText(text: string) { try { await navigator.clipboard.writeText(text); return true } catch { return false } }
