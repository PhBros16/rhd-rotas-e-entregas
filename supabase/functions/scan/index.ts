// Lê fotos de blocos, etiquetas e notas de entrega e devolve os dados dos destinatários.
// O leitor atual é o Gemini (Google). Para trocar de leitor no futuro, só esta função muda.
// A foto chega, é lida e descartada: nada é guardado aqui.
const KEY = Deno.env.get('GEMINI_API_KEY')
const MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash'
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { ...CORS, 'Content-Type': 'application/json' } })

const SYSTEM = `Você lê fotos de blocos, etiquetas e notas de entrega de uma transportadora da região metropolitana do Recife (Pernambuco, Brasil). Cada foto pode ter uma ou várias etiquetas ou linhas; devolva uma entrada para cada DESTINATÁRIO (quem vai receber a encomenda).

Regras:
- Não invente nada. Se um campo não estiver visível ou legível, use null.
- name: nome do destinatário, como está escrito. Não use o nome do remetente nem o da loja de origem.
- phone: somente dígitos, com DDD, se estiver escrito. Não presuma o DDD.
- street: nome da rua, avenida ou travessa, sem o número. number: número da casa (pode ter letras, como 12A, ou S/N). complement: apartamento, bloco, loja, quadra, lote ou ponto de referência. neighborhood: bairro. city: cidade. cep: 8 dígitos, somente números.
- packages: quantidade de volumes ou pacotes, se estiver indicada (por exemplo 2 volumes); senão null.
- notes: informações úteis para a entrega que não cabem nos outros campos (por exemplo ligar antes, portão azul).
- Ignore preços, valores de frete e códigos de rastreio.
- confidence: high quando tudo está nítido, medium se alguma parte está duvidosa, low se está muito difícil de ler.
- Se a foto não tiver nenhuma entrega legível, devolva uma lista vazia.`

const STR = { type: 'STRING', nullable: true }
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    entries: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' }, phone: STR, street: STR, number: STR, complement: STR, neighborhood: STR, city: STR, cep: STR,
          packages: { type: 'INTEGER', nullable: true }, notes: STR, confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
        },
        required: ['name', 'confidence'],
      },
    },
  },
  required: ['entries'],
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (!KEY) return json({ error: 'no_key' })
  try {
    const { image, mime } = await req.json()
    if (typeof image !== 'string' || !image || image.length > 7_000_000) return json({ error: 'bad_image' })
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: 'Extraia os destinatários desta foto.' }, { inlineData: { mimeType: mime || 'image/jpeg', data: image } }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA },
      }),
    })
    if (r.status === 429) return json({ error: 'rate_limited' })
    if (r.status === 400 || r.status === 401 || r.status === 403) {
      const t = await r.text()
      console.log('gemini', r.status, t.slice(0, 300))
      return json({ error: /api key|API_KEY|permission/i.test(t) ? 'invalid_key' : 'bad_image', message: t.slice(0, 200) })
    }
    if (!r.ok) { console.log('gemini', r.status); return json({ error: 'unavailable' }) }
    const j = await r.json()
    const text = (j?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('')
    let parsed: { entries?: unknown[] } = {}
    try { parsed = JSON.parse(text) } catch { return json({ error: 'unavailable', message: 'resposta inválida' }) }
    return json({ entries: parsed.entries ?? [] })
  } catch (e) {
    console.log(String(e))
    return json({ error: 'unavailable' })
  }
})
