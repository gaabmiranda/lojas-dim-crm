# CRM Lojas Dim

CRM custom-built fullstack pra operação da Lojas Dim — substitui RD Station + Pluga.
Bling = source of truth dos dados; CRM lê via API v3 OAuth.

- **PRD:** [`PRD.md`](./PRD.md)
- **Spec:** [`Spec.md`](./Spec.md)
- **n8n workflows:** [`n8n/README.md`](./n8n/README.md)

## Stack

Next.js 15 (App Router) · TypeScript estrito · PostgreSQL 16 · Drizzle ORM · Auth.js v5 · Tailwind v4 + shadcn · Tanstack Query · dnd-kit (Kanban).

## Quick-start (dev local)

Pré-requisitos: **Node 20.10+**, **Docker** (pra Postgres local), `npm`.

```bash
# 1. Dependências
npm install

# 2. .env
cp .env.example .env
# Edite: AUTH_SECRET (openssl rand -base64 32), credenciais Bling, Chatwoot, n8n.

# 3. Postgres local
docker compose up -d
# (sem Docker: rode Postgres na VPS e aponte DATABASE_URL)

# 4. Migration + seed
npm run db:generate    # gera SQL de migrations a partir de db/schema.ts
npm run db:migrate     # aplica no Postgres
npm run seed:templates # popula templates_mensagem (4 templates iniciais)
npx tsx db/seed/feature_flags.ts  # popula 3 flags base

# 5. Bootstrap dados Bling (opcional, importa ~4k contatos + ~28k pedidos)
# Requer ndjson em ~/Documents/ (gerados por bling_sync.ps1)
npm run bootstrap:bling

# 6. Primeiro usuário admin
npm run seed:admin -- --email=gabriel@lojasdim.com.br --nome="Gabriel" --senha=trocar123

# 7. Subir app
npm run dev
# → http://localhost:3000/login
```

## Scripts úteis

| Comando | O que faz |
|---------|-----------|
| `npm run dev` | Next dev em :3000 com hot-reload |
| `npm run build` | Build production (`.next/standalone`) |
| `npm run test` | Vitest (79+ testes — kanban, time, validators, bling-mapper, templates, webhooks) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint via `next lint` |
| `npm run db:studio` | Drizzle Studio (UI do DB) |
| `npm run db:reset` | Drop + recria schema (**DEV apenas**) |

## Arquitetura

```
┌─ Bling (ERP)              webhook  ┌─ /api/webhooks/bling
│   pedido_venda.alterado ──────────►│   HMAC + idempotência + upsert + cria card
│   contato.alterado                  │
└─ + polling fallback ─────n8n cron──┼─ /api/sync/bling/delta
                                      │
┌─ n8n (cron diário)                  │
│  d14, sem_resposta,                 │
│  reativacao, arquivar  ─────────────► /api/cron/transitions
└─ + polling 5min                      │   lib/kanban.ts (máquina de estados pura)
                                      │
┌─ Chatwoot (cliente WhatsApp)        │
│   message_created  ─────webhook────► /api/webhooks/chatwoot
└─                                    │   finaliza card + notifica vendedor

         CRM (Next.js)
         ├─ /kanban     (3 colunas, drag-and-drop)
         ├─ /cards/[id] (detalhe + histórico + WhatsApp)
         ├─ /contatos   (lista 4k+ com busca)
         ├─ /notificacoes (polling 30s)
         └─ /config     (admin: flags, usuários, templates)
```

**Decisões-chave (Spec §"Decisões técnicas"):**
- Tanstack Query + shadcn puro, sem Refine.dev (4 telas com fluxos custom não justificam o overhead).
- Tokens OAuth Bling em tabela `bling_tokens` (singleton + lock pessimista no refresh).
- Lógica de transição mora em `lib/kanban.ts` no CRM, **não no n8n**. n8n é só timer + transport.
- Idempotência centralizada via unique `(origem, external_id)` em `eventos`.
- Notificações in-app = polling 30s (2-3 usuários não justificam WebSocket).
- `tentativas_reativacao` incrementa no **envio** (não no reagendamento) — Spec literal divergente, ver comentário em `lib/kanban.ts`.

## Deploy (Coolify VPS)

1. Push pra repo conectado ao Coolify.
2. Cadastrar env vars no painel (ver `.env.example` — **nunca commit `.env`**).
3. Coolify usa o `Dockerfile` (multi-stage, output standalone). Container ouve `:3000`.
4. Postgres: criar serviço separado ou apontar `DATABASE_URL` pra Postgres compartilhado da VPS.
5. Pós-deploy, rodar uma vez: `db:migrate`, `seed:templates`, seed feature_flags, `seed:admin`.
6. Configurar webhooks Bling (aba Webhooks do app 335719) e Chatwoot apontando pros endpoints do CRM.
7. n8n: importar os 5 JSONs em `n8n/workflows/` (ver `n8n/README.md`).

## Pendências bloqueantes (Spec §"Pré-requisitos")

- [ ] Specs VPS confirmados (`free -h && df -h && nproc`)
- [ ] Sync de pedidos Bling concluído (gera `bling_pedidos_full.ndjson`)
- [ ] Subdomínio definido + DNS apontando
- [ ] Credenciais Chatwoot (account_id, inbox_id, api_token, webhook_secret)
- [ ] Lista de vendedores (nome + email + telefone)

Pendências não-bloqueantes (resolvidas durante uso):
- Templates WhatsApp finalizados (placeholders já estão; texto editável em `/config`)
- Prompts dos agentes IA (iteração 1.5 — Spec mantém IA atrás de feature flag `IA_AGENTS_ENABLED`)
- NPS baseline (capturar manualmente na 1ª semana)

## Troubleshoot

- **`npm install` ECONNRESET:** rodar de novo (`npm install --prefer-offline`). Cache npm cobre maior parte.
- **`db:generate` falha:** confirmar `DATABASE_URL` no `.env` aponta pra Postgres ativo.
- **Bling 429:** rate limit 3 req/s — `lib/bling/client.ts` já tem throttle de 2 req/s + retry. Se ainda estoura, aumente `MIN_INTERVAL_MS`.
- **Webhook Bling não chega:** confirmar HMAC secret bate entre app Bling e `BLING_WEBHOOK_SECRET`. Conferir aba Webhooks do app 335719 ativa.
- **`/api/cron/transitions` retorna 403:** header `X-N8N-Secret` ausente ou diferente do `N8N_SHARED_SECRET` no `.env`.
