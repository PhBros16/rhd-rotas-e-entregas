# RHD · Rotas e Entregas

App PWA de apoio ao entregador da **Rogério Home Delivery**.

Banco de clientes, rota com "Go", valores e pagamentos, relatório em PDF,
rota otimizada com Maps/Waze, scanner por foto e painel do administrador.

## Stack
React + TypeScript + Vite · PWA · Tailwind · Dexie (offline) · Supabase · Vercel

## Roadmap
0. Fundação · 1. MVP de campo · 2. Rotas e mapas · 3. Scanner · 4. Painel admin

## Scanner de fotos (desativado por enquanto)
Decisão do projeto: ficou como "turbinada final". O código está pronto e guardado, só desligado por `SCAN_ENABLED = false` em `src/lib/flags.ts`.

- Tela e fluxo: `src/components/ScanImport.tsx` (fotos em lote → conferência → cadastro dos novos → montagem da rota).
- Leitura e reconhecimento de clientes: `src/lib/scan.ts`. Função de leitura: `supabase/functions/scan` (leitor atual: Gemini; trocar de leitor mexe só nela).
- Para reativar: (1) criar a chave no Google AI Studio; (2) guardar como segredo `GEMINI_API_KEY` no Supabase (Edge Functions → Secrets); (3) definir `GEMINI_MODEL` (sugestão: `gemini-3.5-flash-lite`; o padrão do código, `gemini-2.5-flash`, precisa ser conferido); (4) trocar a flag para `true`.
- Privacidade: no plano gratuito do Gemini o conteúdo pode ser usado para melhorar produtos do Google; no plano pago, não. Fotos têm dados de clientes, então usar a conta com faturamento ativo em produção.
- Antes de ligar de vez: piloto com 20 a 30 fotos reais para medir os tokens por foto (a função pode registrar `usageMetadata`) e confirmar o custo.
