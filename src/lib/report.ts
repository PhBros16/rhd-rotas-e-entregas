import type { RouteRow, StopRow } from './routes'
import { summarize } from './routes'
import { brl, dayLabel, dayKeyOf, fmtDur, fmtTime } from './format'
import { fmtCep, fmtPhone, mapsUrl, whatsUrl } from './maplink'
import { navQuery, type Client } from './clients'

// Navegação sempre pelo endereço escrito (com CEP quando o cadastro do cliente está disponível): o Maps e o Waze acertam o número da casa;
// as coordenadas guardadas só servem para ordenar a rota.
export const stopDest = (s: StopRow, c?: Client) => (c ? navQuery(c) : [s.address, s.neighborhood, s.city, 'PE'].filter(Boolean).join(', '))
export const stopLink = (s: StopRow, c?: Client) => (s.pin_url?.startsWith('http') ? s.pin_url : mapsUrl(stopDest(s, c)))

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

export function buildBackup(route: RouteRow, stops: StopRow[], owner: string, clientOf?: (s: StopRow) => Client | undefined) {
  const pending = stops.filter(s => s.status === 'pending').sort((a, b) => a.position - b.position)
  const done = stops.length - pending.length
  const sum = (l: StopRow[], f: (s: StopRow) => number) => l.reduce((t, s) => t + f(s), 0)
  const hoodKey = (s: StopRow) => `${s.neighborhood || 'Sem bairro'}${s.city ? ` · ${s.city}` : ''}`
  const hoods = groupByHood(pending).map(([k, l]) => `${k.split(' · ')[0]} (${l.length})`).join(' · ')
  const head = ['🏠 *RHD · BACKUP DA ROTA*', LINE, `📍 *${route.name ?? 'Rota'}*`,
    `👤 ${owner} · 📅 ${new Date().toLocaleDateString('pt-BR')} · 🕐 gerado às ${fmtTime(new Date().toISOString())}`, '',
    `📦 *${pending.length} entrega${pending.length !== 1 ? 's' : ''} por fazer* · ${sum(pending, s => s.packages)} pacote(s)`,
    `💰 A receber dos clientes: *${brl(sum(pending, s => Number(s.price)))}*`, `💼 Você recebe: *${brl(sum(pending, s => Number(s.courier_pay ?? 0)))}*`,
    ...(done ? [`✅ Já feitas: ${done}`] : []), ...(hoods ? [`🗂 Bairros: ${hoods}`] : []), LINE]
  const body: string[] = []
  for (let i = 0; i < pending.length;) {
    const key = hoodKey(pending[i]); let j = i
    while (j < pending.length && hoodKey(pending[j]) === key) j++
    const run = pending.slice(i, j)
    body.push('', `📍 *${key.toUpperCase()}* — ${run.length} entrega${run.length !== 1 ? 's' : ''} · ${brl(sum(run, s => Number(s.price)))}`, '')
    run.forEach((s, k) => {
      const c = clientOf?.(s)
      body.push(`*${i + k + 1}. ${s.client_name}* — ${brl(Number(s.price))} · 📦 ${s.packages}${s.deferred ? ' ⏳ voltar depois' : ''}`,
        `📌 ${s.address || 'Sem endereço'}${c?.cep ? ` · CEP ${fmtCep(c.cep)}` : ''}`,
        ...(s.phone ? [`📞 ${fmtPhone(s.phone)}`, `💬 ${whatsUrl(s.phone).replace('https://', '')}`] : []),
        `🗺 ${stopLink(s, c)}`, ...(s.client_notes ? [`📝 ${s.client_notes}`] : []), '─────────────', '')
    })
    i = j
  }
  return [...head, ...body, '_Se o app falhar, siga por esta lista na ordem: toque em 🗺 para navegar e em 💬 para falar com o cliente._'].join('\n')
}

export function buildReport(route: RouteRow, stops: StopRow[], owner: string) {
  const m = summarize(stops)
  const lost = stops.filter(s => s.status === 'failed' || s.status === 'skipped')
  const dur = route.go_at && route.finished_at ? fmtDur(new Date(route.finished_at).getTime() - new Date(route.go_at).getTime()) : '—'
  const day = route.go_at ? dayLabel(dayKeyOf(route.go_at)) : ''
  const lines = ['🏠 *RHD · RELATÓRIO DA ROTA*', LINE, `📍 *${route.name ?? 'Rota'}*`, `👤 ${owner}`, `📅 ${day}`, `⏱ ${fmtTime(route.go_at)} → ${fmtTime(route.finished_at)} · *${dur}*`, '',
    '📊 *RESUMO*', `✅ Entregues: *${m.delivered}* de ${m.total}`, `❌ Não entregues: *${m.failed + m.skipped}*`, `🔁 Entregues após voltar: *${m.retried.length}*`, `📦 Pacotes entregues: *${m.packages}*`, '',
    '💰 *FINANCEIRO*', `Previsto: ${brl(m.planned)}`, `Recebido: *${brl(m.received)}*`, `   💠 Pix: ${brl(m.pix)}`, `   💵 Dinheiro: ${brl(m.cash)}`, `💼 Entregador recebe: *${brl(m.courierPay)}*`, `🏢 Empresa: *${brl(m.received - m.courierPay)}*`]
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
