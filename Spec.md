# Spec: CRM próprio Lojas Dim — iteração 1

> Derivado de `PRD.md` em 2026-05-27. Esta spec é a fonte da verdade para implementação.
> Decisões técnicas que o PRD deixou em aberto foram cravadas aqui (seção "Decisões técnicas tomadas aqui").
> Pré-requisitos antes do Passo 1 da Fase 3: ter as Open Questions do PRD §10 resolvidas pelos itens marcados como **bloqueante** abaixo.

---

## Estrutura de arquivos final

```
LOJAS DIM/
├── PRD.md
├── Spec.md
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── components.json                 # shadcn registry
├── drizzle.config.ts
├── .env.example
├── .gitignore
├── .dockerignore
├── Dockerfile
├── docker-compose.yml              # apenas postgres local (dev)
├── README.md                       # quick-start: env vars, comandos, deploy
│
├── db/
│   ├── schema.ts                   # todas as tabelas Drizzle
│   ├── client.ts                   # drizzle() singleton com pg pool
│   ├── relations.ts                # relations() do Drizzle
│   └── seed/
│       └── feature_flags.ts        # seed inicial de IA_AGENTS_ENABLED=false
│
├── lib/
│   ├── auth.ts                     # Auth.js v5 config (credentials + session JWT)
│   ├── bling/
│   │   ├── client.ts               # fetch wrapper Bling v3 com refresh automático
│   │   ├── tokens.ts               # leitura/escrita da tabela bling_tokens + refresh lock
│   │   ├── mapper.ts               # Bling JSON → modelo interno (contato, pedido, item)
│   │   └── types.ts                # types parciais do Bling (importa do bling-sdk-ref se útil)
│   ├── chatwoot/
│   │   ├── client.ts               # wrapper REST Chatwoot
│   │   └── types.ts
│   ├── n8n/
│   │   └── trigger.ts              # POST helper pros webhooks do n8n
│   ├── notifications.ts            # cria registros em `notificacoes`
│   ├── feature-flags.ts            # lê tabela feature_flags com cache 60s
│   ├── templates.ts                # render de templates WhatsApp com placeholders
│   ├── validators/
│   │   ├── bling-webhook.ts        # Zod schema do payload Bling
│   │   ├── chatwoot-webhook.ts     # Zod schema do payload Chatwoot
│   │   └── shared.ts               # zod helpers comuns
│   ├── audit.ts                    # insert em tabela `eventos`
│   ├── kanban.ts                   # regras de transição de coluna (puras, testáveis)
│   ├── time.ts                     # helpers TZ America/Sao_Paulo (luxon)
│   └── utils.ts                    # cn() do shadcn + helpers genéricos
│
├── app/
│   ├── layout.tsx                  # html root, providers (Query, Theme, Toaster)
│   ├── globals.css
│   ├── providers.tsx               # TanstackQueryProvider + ThemeProvider
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx            # form de login (credentials)
│   ├── (app)/
│   │   ├── layout.tsx              # sidebar + header + auth guard
│   │   ├── page.tsx                # redirect → /kanban
│   │   ├── kanban/
│   │   │   ├── page.tsx            # server component que carrega cards
│   │   │   ├── KanbanBoard.tsx     # client component, dnd-kit
│   │   │   └── CardItem.tsx
│   │   ├── cards/
│   │   │   └── [id]/
│   │   │       ├── page.tsx        # detalhe do card (server)
│   │   │       ├── CardDetail.tsx  # client wrapper
│   │   │       ├── HistoricoPedidos.tsx
│   │   │       ├── Comentarios.tsx
│   │   │       └── AbrirWhatsappButton.tsx
│   │   ├── contatos/
│   │   │   ├── page.tsx            # lista paginada + busca
│   │   │   └── ContatosTable.tsx
│   │   ├── notificacoes/
│   │   │   └── page.tsx            # lista das próprias notificações
│   │   └── config/
│   │       ├── page.tsx            # tab nav (flags, usuários, templates)
│   │       ├── FeatureFlagsTab.tsx
│   │       ├── UsuariosTab.tsx
│   │       └── TemplatesTab.tsx
│   └── api/
│       ├── auth/
│       │   └── [...nextauth]/
│       │       └── route.ts
│       ├── webhooks/
│       │   ├── bling/
│       │   │   └── route.ts        # POST receiver (HMAC + idempotência)
│       │   └── chatwoot/
│       │       └── route.ts        # POST receiver
│       ├── sync/
│       │   └── bling/
│       │       └── delta/
│       │           └── route.ts    # POST chamado pelo cron do n8n
│       ├── cards/
│       │   ├── route.ts            # GET lista, POST manual create
│       │   └── [id]/
│       │       ├── route.ts        # GET, PATCH (move coluna)
│       │       └── comentarios/
│       │           └── route.ts    # POST comentário
│       ├── contatos/
│       │   ├── route.ts            # GET paginado
│       │   └── [id]/
│       │       └── route.ts        # GET + pedidos
│       ├── atividades/
│       │   ├── route.ts            # GET, POST
│       │   └── [id]/
│       │       └── route.ts        # PATCH (concluir, reagendar)
│       ├── notificacoes/
│       │   ├── route.ts            # GET próprias
│       │   └── [id]/
│       │       └── route.ts        # PATCH marca como lida
│       ├── feature-flags/
│       │   └── route.ts            # GET, PUT (admin only)
│       ├── templates/
│       │   └── route.ts            # GET, PUT
│       └── usuarios/
│           └── route.ts            # GET, POST (admin only)
│
├── components/
│   └── ui/                         # shadcn (button, card, table, dialog, etc — instalados via cli)
│
├── scripts/
│   ├── bootstrap-bling.ts          # importa ndjson de ~/Documents para Postgres
│   ├── create-admin.ts             # cria primeiro usuário admin
│   ├── seed-templates.ts           # popula templates_mensagem com 4 templates iniciais
│   └── reset-dev-db.ts             # drop+create schema (apenas DEV)
│
├── n8n/
│   ├── workflows/                  # JSON exportado dos workflows
│   │   ├── 01-bling-delta-poll.json
│   │   ├── 02-cron-d14-pendente-para-contato.json
│   │   ├── 03-cron-48h-sem-resposta.json
│   │   ├── 04-cron-d90-reativacao.json
│   │   └── 05-cron-arquivar-reativacao-3x.json
│   └── README.md                   # como importar os workflows + variáveis necessárias
│
└── tests/
    ├── lib/
    │   ├── kanban.test.ts          # regras puras de transição
    │   ├── templates.test.ts       # placeholder rendering
    │   └── bling-mapper.test.ts
    └── api/
        ├── webhooks-bling.test.ts
        ├── webhooks-chatwoot.test.ts
        └── cards-patch.test.ts
```

---

## Ordem de execução

1. **Boilerplate Next.js + tooling** (`package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `components.json`, `.env.example`, `.gitignore`, `.dockerignore`) — base que todo o resto consome; sem isso nada compila.
2. **`db/schema.ts` + `db/client.ts` + `drizzle.config.ts` + `db/relations.ts`** — todo o domínio depende do schema; estabilizar cedo.
3. **Migration inicial gerada via drizzle-kit** + `docker-compose.yml` (postgres local) — destrava dev local.
4. **`lib/time.ts`, `lib/utils.ts`, `lib/validators/shared.ts`** — utilitários puros sem dependência de DB; primeiros testáveis.
5. **`lib/audit.ts`, `lib/feature-flags.ts`, `lib/notifications.ts`, `lib/templates.ts`** — serviços puros sobre o schema; depende de §2.
6. **`lib/kanban.ts`** — máquina de estados pura das transições de coluna; depende de nada além de types do schema. **Implementar com testes JUNTO** — é o miolo de regras de negócio.
7. **`lib/bling/tokens.ts` + `lib/bling/client.ts` + `lib/bling/mapper.ts` + `lib/bling/types.ts`** — camada Bling antes do bootstrap.
8. **`scripts/bootstrap-bling.ts`** — importa os ndjson existentes em `~/Documents/` (4.113 contatos + 27.851 pedidos) pro banco local. Permite trabalhar com dados reais no dev.
9. **`scripts/create-admin.ts` + `scripts/seed-templates.ts` + `db/seed/feature_flags.ts`** — bootstrap operacional.
10. **`lib/auth.ts` + `app/api/auth/[...nextauth]/route.ts` + `app/(auth)/login/page.tsx`** — auth antes de qualquer rota protegida.
11. **`app/layout.tsx` + `app/providers.tsx` + `app/(app)/layout.tsx` + `app/globals.css`** — shell da app + auth guard.
12. **`lib/chatwoot/client.ts` + `lib/n8n/trigger.ts`** — clients de saída; webhooks de entrada precisam dos clients pra responder/disparar follow-up.
13. **`app/api/webhooks/bling/route.ts` + `lib/validators/bling-webhook.ts`** — receiver de eventos do Bling.
14. **`app/api/sync/bling/delta/route.ts`** — endpoint chamado pelo n8n no caminho polling (fallback do webhook). Depende da camada Bling de §7.
15. **`app/api/webhooks/chatwoot/route.ts` + `lib/validators/chatwoot-webhook.ts`** — receiver de respostas WhatsApp.
16. **APIs CRUD internas** (cards, contatos, atividades, comentarios, notificacoes, feature-flags, templates, usuarios) — todas dependem de §2 e §6.
17. **Tela `/kanban` (server page + KanbanBoard client)** — primeira tela navegável; valida o fluxo ponta-a-ponta com dados reais.
18. **Tela `/cards/[id]` (detalhe + histórico + comentários + botão WhatsApp)**.
19. **Tela `/contatos` (lista + busca)**.
20. **Tela `/notificacoes`** + indicador no header.
21. **Tela `/config` (feature flags + usuários + templates)**.
22. **Workflows n8n exportados em `n8n/workflows/*.json` + `n8n/README.md`** — depois que todos os endpoints existem.
23. **`Dockerfile` + ajustes pra Coolify** — depois de tudo rodar local.
24. **Testes e2e manuais do fluxo completo** (Bling → card → cron D+14 → Chatwoot → resposta → finalizado → reativação D+90).

Cada arquivo concluído **deve** ter seu critério de aceite validado por teste automatizado (quando aplicável) ou por verificação manual descrita no critério.

---

## Mudanças por arquivo

### `package.json`
- **Ação:** create
- **Propósito:** define dependências e scripts npm canônicos do projeto.
- **Conteúdo/mudanças concretas:**
  - Engines: node >=20.10.
  - Deps runtime: `next@^15`, `react@^19`, `react-dom@^19`, `drizzle-orm`, `postgres` (driver `postgres-js`), `zod`, `next-auth@beta` (v5), `bcryptjs`, `@tanstack/react-query@^5`, `@tanstack/react-table@^8`, `@dnd-kit/core`, `@dnd-kit/sortable`, `luxon`, `clsx`, `class-variance-authority`, `tailwind-merge`, `lucide-react`, `sonner` (toasts), `date-fns` (formatos curtos).
  - Deps dev: `typescript@^5.6`, `drizzle-kit`, `@types/*`, `vitest`, `tsx` (executar scripts TS sem build), `eslint`, `eslint-config-next`, `prettier`.
  - Scripts: `dev`, `build`, `start`, `lint`, `format`, `test`, `db:generate` (drizzle-kit generate), `db:migrate` (drizzle-kit migrate), `db:studio`, `db:reset` (`tsx scripts/reset-dev-db.ts`), `bootstrap:bling` (`tsx scripts/bootstrap-bling.ts`), `seed:admin`, `seed:templates`.
- **Testes:** N/A (config).
- **Critério de aceite:** `npm install` completa sem warnings de peer deps; `npm run dev` sobe Next em :3000; `npm run lint` passa.

### `tsconfig.json`
- **Ação:** create
- **Propósito:** TS estrito, paths absolutos.
- **Conteúdo/mudanças concretas:** `strict: true`, `noUncheckedIndexedAccess: true`, `paths: { "@/*": ["./*"] }`, `moduleResolution: bundler`, `target: ES2022`, `jsx: preserve`.
- **Critério de aceite:** `tsc --noEmit` passa em projeto vazio.

### `next.config.ts`
- **Ação:** create
- **Propósito:** config mínima do Next 15.
- **Conteúdo/mudanças concretas:** habilita `experimental.serverActions` se necessário; configura `output: 'standalone'` (Docker); seta `eslint.ignoreDuringBuilds: false`; `images.remotePatterns: []` (sem imagens externas iter 1).
- **Critério de aceite:** `npm run build` produz `.next/standalone`.

### `tailwind.config.ts` + `postcss.config.mjs` + `components.json` + `app/globals.css`
- **Ação:** create
- **Propósito:** Tailwind v4 + shadcn registry. Tema neutro padrão shadcn.
- **Conteúdo/mudanças concretas:** rodar `npx shadcn@latest init` com base color `neutral`; instalar de cara: `button`, `card`, `dialog`, `dropdown-menu`, `input`, `label`, `select`, `table`, `tabs`, `toast`, `sonner`, `tooltip`, `badge`, `avatar`, `skeleton`, `separator`, `sheet`, `command`.
- **Critério de aceite:** `<Button>` renderiza com estilo em uma rota de teste.

### `.env.example`
- **Ação:** create
- **Propósito:** documentar todas as env vars exigidas.
- **Conteúdo/mudanças concretas:**
  ```
  DATABASE_URL=postgresql://crm:crm@localhost:5432/crm
  AUTH_SECRET=  # openssl rand -base64 32
  AUTH_URL=http://localhost:3000
  BLING_CLIENT_ID=
  BLING_CLIENT_SECRET=
  BLING_WEBHOOK_SECRET=  # HMAC shared secret (validar no receiver)
  CHATWOOT_BASE_URL=
  CHATWOOT_API_TOKEN=
  CHATWOOT_ACCOUNT_ID=
  CHATWOOT_INBOX_ID=  # ID da inbox WhatsApp Baileys
  CHATWOOT_WEBHOOK_SECRET=
  N8N_WEBHOOK_BASE_URL=  # ex: https://n8n.lojasdim.com.br/webhook
  N8N_SHARED_SECRET=
  ANTHROPIC_API_KEY=  # opcional, só se IA_AGENTS_ENABLED=true
  TZ=America/Sao_Paulo
  ```
- **Critério de aceite:** arquivo committed; `.env` real é gitignored.

### `.gitignore`
- **Ação:** create
- **Conteúdo concreto:** `.env*` (exceto `.env.example`), `node_modules`, `.next`, `coverage`, `drizzle/migrations/meta/` não — incluir migrations no repo. **CRITICAL:** ignorar `bling_tokens.json`, `bling app.txt`, `bling_pedidos_*.ndjson`, `bling_pedidos_ids.txt` se algum vier acidentalmente parar no working dir.

---

### `drizzle.config.ts`
- **Ação:** create
- **Propósito:** config do drizzle-kit (path do schema, migrations, credentials).
- **Conteúdo/mudanças concretas:** `schema: './db/schema.ts'`, `out: './drizzle/migrations'`, `dialect: 'postgresql'`, `dbCredentials: { url: process.env.DATABASE_URL! }`, `strict: true`, `verbose: true`.
- **Critério de aceite:** `npm run db:generate` produz arquivos SQL em `drizzle/migrations/`.

### `db/schema.ts`
- **Ação:** create
- **Propósito:** fonte da verdade do domínio. Todas as tabelas listadas no PRD §8 + tabelas operacionais necessárias.
- **Conteúdo/mudanças concretas:**
  - **`contatos`**: `id` (pgserial), `id_bling` (bigint, unique not null, index), `nome` (text not null), `telefone` (text), `email` (text), `dados_extras_json` (jsonb), `situacao_bling` (text — `A|E|I|S`, ver pegadinha API), `criado_em`, `atualizado_em` (timestamptz default now), `freezing_ate` (timestamptz null), índice em `freezing_ate`.
  - **`pedidos`**: `id`, `id_bling` (unique not null, index), `contato_id` (fk contatos.id), `numero` (text), `data` (date), `data_saida` (date null), `situacao_id` (int — ID Bling do estado), `situacao_valor` (smallint — código 1..N), `total` (numeric(14,2)), `total_produtos` (numeric(14,2)), `dados_completos_json` (jsonb), `criado_em`, `atualizado_em`. Índices em `(contato_id, data desc)` e em `situacao_valor`.
  - **`pedido_itens`**: `id`, `pedido_id` (fk on delete cascade), `descricao` (text), `quantidade` (numeric), `valor_unitario` (numeric(14,2)), `valor_total` (numeric(14,2)).
  - **`cards`**: `id`, `contato_id` (fk), `pedido_id_origem` (fk pedidos.id null), `tipo` enum {`pos_venda`,`reativacao`}, `coluna` enum {`pendente`,`em_contato`,`finalizado`,`arquivo`}, `nome_exibido` (text), `criado_em`, `atualizado_em`, `tentativas_reativacao` (smallint default 0), `data_prevista_acao` (timestamptz null), `vendedor_id` (fk usuarios.id null). Índice em `(coluna, data_prevista_acao)` e em `contato_id`. **Unique partial index**: `(contato_id) WHERE coluna != 'arquivo'` — garante 1 card ativo por contato.
  - **`atividades`**: `id`, `card_id` (fk on delete cascade), `tipo` (text — `mensagem_d14`, `mensagem_reativacao`, `nota`, `manual`), `titulo` (text), `descricao` (text), `data_agendada` (timestamptz), `status` enum {`pendente`,`em_andamento`,`concluida`,`cancelada`}, `vendedor_id` (fk null), `executada_em` (timestamptz null). Índice em `(status, data_agendada)`.
  - **`eventos`**: `id`, `card_id` (fk null), `contato_id` (fk null), `tipo` (text), `payload_json` (jsonb), `origem` (text — `bling_webhook`,`chatwoot_webhook`,`n8n_cron`,`api_interna`,`bootstrap`), `external_id` (text null — pra idempotência), `criado_em`. **Unique** em `(origem, external_id)` onde `external_id is not null`.
  - **`usuarios`**: `id`, `email` (text unique not null), `senha_hash` (text not null), `nome` (text), `role` enum {`admin`,`vendedor`}, `ativo` (bool default true), `telefone` (text null — pra notificação WhatsApp), `criado_em`.
  - **`comentarios`**: `id`, `card_id` (fk on delete cascade), `usuario_id` (fk), `texto` (text), `criado_em`.
  - **`feature_flags`**: `key` (text pk), `value` (text — JSON serialized), `atualizado_em`. Pré-popular `IA_AGENTS_ENABLED=false`, `BLING_WEBHOOK_ATIVO=false`, `BLING_POLLING_ATIVO=true`.
  - **`bling_tokens`**: `id` (smallint pk default 1, check `id=1` — singleton), `access_token` (text), `refresh_token` (text), `access_expires_at` (timestamptz), `refresh_expires_at` (timestamptz), `atualizado_em`.
  - **`templates_mensagem`**: `key` (text pk — `pos_venda_d14`,`reativacao_1`,`reativacao_2`,`reativacao_3`), `descricao` (text), `conteudo` (text — com placeholders `{{nome_cliente}}`, `{{primeiro_item}}`, `{{total}}`), `atualizado_em`.
  - **`notificacoes`**: `id`, `usuario_id` (fk), `tipo` (text), `titulo` (text), `link` (text null), `lida` (bool default false), `criado_em`. Índice em `(usuario_id, lida, criado_em desc)`.
- **Testes:** N/A (schema é validado pela migration + `db:studio`).
- **Critério de aceite:** `npm run db:generate` produz migration SQL; aplicar com `db:migrate` em base limpa não dá erro; `db:studio` lista todas as tabelas.

### `db/client.ts`
- **Ação:** create
- **Propósito:** singleton do client Drizzle (`drizzle(postgres(...))`), evitar múltiplos pools em hot-reload.
- **Conteúdo:** exporta `db` (DrizzleClient) e `sql` (postgres raw). Reusa global em dev.
- **Critério de aceite:** importar `db` em uma rota e consultar `select count from contatos` retorna 0 em base vazia.

### `db/relations.ts`
- **Ação:** create
- **Propósito:** relations() do Drizzle pro query builder relacional.
- **Conteúdo:** declara: contatos→pedidos (1:N), contatos→cards (1:N), pedidos→pedido_itens, cards→atividades, cards→comentarios, cards→contato, cards→pedido_origem.
- **Critério de aceite:** `db.query.cards.findFirst({ with: { contato: true, comentarios: true } })` compila e retorna shape correto.

### `db/seed/feature_flags.ts`
- **Ação:** create
- **Propósito:** garantir flags base existem após migration.
- **Conteúdo:** função `seedFeatureFlags(db)` que faz upsert das 3 flags base.
- **Critério de aceite:** rodar duas vezes não duplica registros (upsert por key).

---

### `lib/time.ts`
- **Ação:** create
- **Propósito:** helpers de timezone (toda lógica de cron, D+14, D+90 usa BRT).
- **Conteúdo concreto:**
  - `nowBRT()` → DateTime em America/Sao_Paulo
  - `addDays(date, n)` → DateTime
  - `formatBR(date)` → string `dd/MM/yyyy HH:mm`
  - `isPast(date)`, `daysAgo(date)`, `daysUntil(date)`
- **Testes:** `tests/lib/time.test.ts` cobre wrap-around DST (Brasil hoje sem horário de verão, mas teste documenta).
- **Critério de aceite:** todos os helpers retornam DateTime BRT; conversões round-trip preservam instante.

### `lib/utils.ts`
- **Ação:** create
- **Conteúdo:** `cn()` (clsx + tailwind-merge); `assertNever`; `parseNumberBR`.
- **Critério de aceite:** `cn('a', false && 'b', 'c')` → `"a c"`.

### `lib/validators/shared.ts`
- **Ação:** create
- **Conteúdo:** zod helpers comuns: `bigintLike` (aceita string ou number), `dateBR`, `phoneBR`.
- **Critério de aceite:** testes unitários cobrem casos válidos e inválidos.

---

### `lib/audit.ts`
- **Ação:** create
- **Propósito:** wrapper de insert em `eventos`. Toda mudança importante (criação de card, mudança de coluna, recebimento de webhook, falha) loga aqui.
- **Conteúdo concreto:**
  - `logEvent({ tipo, origem, externalId?, cardId?, contatoId?, payload })` → `Promise<void>`
  - Em caso de duplicate key (constraint unique em `(origem, external_id)`): retorna `{ duplicate: true }` em vez de throw.
- **Testes:** unit — duplicate é tratado, não vira exception.
- **Critério de aceite:** chamar 2x com mesmo `(origem, externalId)` insere 1x; segunda retorna `{ duplicate: true }`.

### `lib/feature-flags.ts`
- **Ação:** create
- **Propósito:** leitura de flags com cache em memória (60s TTL), escrita invalida cache.
- **Conteúdo concreto:**
  - `getFlag(key: string): Promise<string | null>`
  - `getFlagBool(key)`, `getFlagJson<T>(key)`
  - `setFlag(key, value)` (invalida cache)
  - Cache via `Map` module-level.
- **Critério de aceite:** 100 leituras consecutivas em <1s sem cache miss; `setFlag` seguido de `getFlag` retorna novo valor.

### `lib/notifications.ts`
- **Ação:** create
- **Propósito:** API interna pra criar notificações + helper pra disparar WhatsApp via Chatwoot.
- **Conteúdo concreto:**
  - `notify({ usuarioId, tipo, titulo, link?, alsoWhatsapp? })` → cria row em `notificacoes` e, se `alsoWhatsapp`, chama `chatwoot.sendMessage(usuario.telefone, titulo)`.
- **Critério de aceite:** insert na tabela acontece sempre; chamada Chatwoot só com flag.

### `lib/templates.ts`
- **Ação:** create
- **Propósito:** ler template do banco + substituir placeholders.
- **Conteúdo concreto:**
  - `renderTemplate(key, context: Record<string,string>)` → string
  - Substitui `{{placeholder}}` por valor; placeholder sem valor → string vazia + log warning via `console.warn`.
- **Testes:** `tests/lib/templates.test.ts` cobre placeholder presente, ausente, repetido, com markdown.
- **Critério de aceite:** render de template `pos_venda_d14` com `{ nome_cliente: 'João' }` retorna string com 'João' substituído.

---

### `lib/kanban.ts`
- **Ação:** create
- **Propósito:** **máquina de estados pura** das transições. Esta é a regra de negócio central do CRM — testar até dobrar.
- **Conteúdo concreto:**
  - Tipos: `Coluna = 'pendente'|'em_contato'|'finalizado'|'arquivo'`; `Tipo = 'pos_venda'|'reativacao'`.
  - `proximaTransicaoAutomatica(card, agora): Transicao | null` — retorna o que o cron deveria fazer. Casos:
    - tipo `pos_venda`, coluna `pendente`, `data_prevista_acao <= agora` → mover pra `em_contato` + ação `enviar_mensagem_d14`.
    - tipo `pos_venda`, coluna `em_contato`, `atualizado_em + 48h <= agora`, sem resposta → mover pra `finalizado` (sem mensagem) + criar card `reativacao` com `data_prevista_acao = atualizado_em + 90d`.
    - tipo `reativacao`, coluna `pendente`, `data_prevista_acao <= agora` → mover pra `em_contato` + `enviar_mensagem_reativacao_N` (N = tentativas_reativacao+1).
    - tipo `reativacao`, coluna `em_contato`, `atualizado_em + 48h <= agora`, `tentativas_reativacao < 3` → mover pra `pendente` + incrementar `tentativas_reativacao` + `data_prevista_acao = atualizado_em + 90d`.
    - tipo `reativacao`, `tentativas_reativacao >= 3`, sem resposta → mover pra `arquivo` + setar `contato.freezing_ate = now + 12 meses`.
  - `transicaoPorResposta(card, agora): Transicao | null` — quando webhook Chatwoot chega: card em `em_contato` → mover pra `finalizado` + notificar vendedor.
  - `transicaoPorNovaCompra(contato, novoPedido, cardExistente): Transicao` — webhook Bling de novo pedido: se há card de reativação ativo, cancela e cria novo card `pos_venda`.
- **Testes:** `tests/lib/kanban.test.ts` — **mínimo 12 casos**, um por branch da máquina + edge cases (3ª tentativa, freezing ativo, race entre webhook e cron).
- **Critério de aceite:** todos os testes passam; coverage da função ≥95%.

---

### `lib/bling/types.ts`
- **Ação:** create
- **Propósito:** types parciais dos payloads Bling que o CRM consome.
- **Conteúdo concreto:** copiar/adaptar dos arquivos do `bling-sdk-ref` (apontado em [[reference-bling-arquivos]]) — `BlingContato`, `BlingPedidoVenda`, `BlingPedidoItem`, `BlingSituacao`. Não tente cobrir 100% do schema — apenas campos consumidos.
- **Critério de aceite:** types compilam; `bling_schemas.json` pode ser parseado contra eles.

### `lib/bling/tokens.ts`
- **Ação:** create
- **Propósito:** ler/atualizar singleton da tabela `bling_tokens`. **Cuidado:** rate-limit de refresh + invalidação do refresh antigo (pegadinha #4).
- **Conteúdo concreto:**
  - `getCurrentTokens()` → row singleton
  - `refreshTokens()` → chama endpoint `/Api/v3/oauth/token` com `grant_type=refresh_token`, atualiza row. Lock pessimista via `SELECT FOR UPDATE` pra evitar 2 refresh paralelos invalidando token.
  - `ensureValidAccessToken()` → se `access_expires_at - 60s <= now`, chama `refreshTokens`; retorna `access_token`.
- **Testes:** mock do endpoint Bling; verificar que 2 chamadas concorrentes resultam em 1 só refresh (smoke test conceitual; lock real testado em integração).
- **Critério de aceite:** chamadas seguidas em access_token expirado disparam exatamente 1 refresh.

### `lib/bling/client.ts`
- **Ação:** create
- **Propósito:** fetch wrapper Bling com auth automática, retry em 429 (rate limit 3 req/s — pegadinha #3).
- **Conteúdo concreto:**
  - `blingFetch(path, init?)` — injeta `Authorization: Bearer <access>` via `ensureValidAccessToken()`.
  - Retry: em 429, espera 1500ms e tenta de novo (até 3x).
  - Em 401, força `refreshTokens()` e refaz 1x.
  - **Throttle global** via semáforo módulo-level: máx 2 req/s (margem do limite real 3/s).
  - Funções tipadas: `getContato(id)`, `getPedido(id)`, `listPedidos({ pagina, dataAlteracaoInicial })`.
- **Testes:** integração só com `BLING_INTEGRATION=true` no env — não roda no CI default.
- **Critério de aceite:** chamar `getPedido(idValido)` retorna JSON parseável; chamar 10x seguidas não estoura 429.

### `lib/bling/mapper.ts`
- **Ação:** create
- **Propósito:** converter JSON Bling → modelos internos. Centraliza a tradução.
- **Conteúdo concreto:**
  - `mapContato(blingContato): NewContato`
  - `mapPedido(blingPedido): { pedido: NewPedido, itens: NewPedidoItem[] }`
  - Trata `telefone` extraindo número de objeto `{ celular, ddd, ... }` (formato Bling).
- **Testes:** `tests/lib/bling-mapper.test.ts` — usa `bling_schemas.json` como fixture (cópia em `tests/fixtures/bling_schemas.json`).
- **Critério de aceite:** todos os campos exigidos pelo schema interno são preenchidos quando vêm do Bling.

---

### `lib/chatwoot/client.ts`
- **Ação:** create
- **Propósito:** wrapper REST Chatwoot — abrir conversa, enviar mensagem, buscar/criar contato.
- **Conteúdo concreto:**
  - `searchContact(phone)` → existing ou null
  - `createContact({ name, phone })`
  - `createConversation({ contactId, inboxId })`
  - `sendMessage({ conversationId, content })`
  - `openOrCreateConversation({ name, phone, content })` — wrapper que cobre os 3 acima.
- **Testes:** integração só com env var habilitada.
- **Critério de aceite:** `openOrCreateConversation` retorna `conversationId` e mensagem aparece no Chatwoot.

### `lib/chatwoot/types.ts`
- **Ação:** create
- **Conteúdo:** types parciais — `ChatwootContact`, `ChatwootConversation`, `ChatwootIncomingMessage` (payload do webhook).

### `lib/n8n/trigger.ts`
- **Ação:** create
- **Propósito:** POST helper pros webhooks do n8n com shared secret.
- **Conteúdo concreto:**
  - `triggerN8n(workflowSlug, payload)` → POST `${N8N_WEBHOOK_BASE_URL}/${slug}` com `X-N8N-Secret`.
- **Critério de aceite:** chamada com slug válido recebe HTTP 200; chamada sem secret recebe 401 (n8n configurado).

---

### `lib/validators/bling-webhook.ts`
- **Ação:** create
- **Propósito:** zod schema do payload de webhook Bling.
- **Conteúdo concreto:** schema com `evento`, `data`, `dados` (varia por evento). Fonte: aba Webhooks do app + bling-sdk-ref. **Documentar premissa:** payload exato a confirmar na primeira execução real; iniciar com schema permissivo (`.passthrough()`) e endurecer depois.
- **Critério de aceite:** schema aceita um exemplo manual gerado a partir do `bling_schemas.json`.

### `lib/validators/chatwoot-webhook.ts`
- **Ação:** create
- **Propósito:** zod schema do payload `message_created` do Chatwoot.
- **Conteúdo concreto:** schema cobre `event`, `id`, `content`, `message_type` (filtra só `incoming`), `sender.phone_number`, `conversation.id`.
- **Critério de aceite:** schema aceita payload real capturado em teste manual no Chatwoot.

---

### `app/api/webhooks/bling/route.ts`
- **Ação:** create
- **Propósito:** receiver de eventos do Bling.
- **Conteúdo concreto:**
  - `POST` handler:
    1. Valida HMAC do header `X-Bling-Signature` contra `BLING_WEBHOOK_SECRET` + body raw. Se inválido → 401.
    2. Parse zod do body.
    3. `logEvent({ origem: 'bling_webhook', externalId: payload.data + payload.evento + payload.id_externo, ... })`. Se `duplicate` → 200 + log.
    4. Switch no `evento`:
       - `pedido_venda.alterado` com `situacao.valor` indicando ATENDIDO → busca pedido completo via `blingClient.getPedido(id)`, mapeia, upsert em `pedidos` + `pedido_itens` + `contatos` (se novo), cria `Card` `pos_venda` `pendente` com `data_prevista_acao = data_saida + 14d` via `lib/kanban.ts`.
       - `pedido_venda.criado` → upsert pedido (não cria card ainda).
       - `contato.alterado` → upsert contato.
    5. Resposta 200 com `{ ok: true }`.
  - Toda manipulação envolvida em uma transação Drizzle.
- **Testes:** `tests/api/webhooks-bling.test.ts` — assinatura inválida (401), duplicate (200 idempotente), criação de card (DB inspect).
- **Critério de aceite:** chamada manual com payload válido cria card; chamada repetida não duplica; assinatura inválida rejeita.

### `app/api/sync/bling/delta/route.ts`
- **Ação:** create
- **Propósito:** endpoint que o n8n cron chama (polling fallback). Lista pedidos alterados desde `last_sync`.
- **Conteúdo concreto:**
  - `POST` com header `X-N8N-Secret`.
  - Lê `last_sync` da tabela `feature_flags` (key `BLING_LAST_SYNC_AT`).
  - Chama `blingClient.listPedidos({ dataAlteracaoInicial: last_sync })`.
  - Para cada pedido com situação ATENDIDO ainda não em DB ou com mudança de situação: replica lógica do webhook (upsert + criar card).
  - Atualiza `BLING_LAST_SYNC_AT` ao fim.
- **Testes:** unit com mock do bling client.
- **Critério de aceite:** chamada manual reflete novos pedidos do dia no DB; chamada vazia (sem novos) não falha.

### `app/api/webhooks/chatwoot/route.ts`
- **Ação:** create
- **Propósito:** receiver de respostas WhatsApp.
- **Conteúdo concreto:**
  - `POST` valida header `X-Chatwoot-Secret` (configurado no Chatwoot).
  - Parse zod; filtra apenas `message_type=incoming`.
  - Match contato pelo `sender.phone_number` (normalizado) na tabela `contatos`.
  - Se contato tem card ativo em `em_contato` → aplica `transicaoPorResposta()` do `lib/kanban.ts`, notifica vendedor responsável via `lib/notifications.ts` (in-app + WhatsApp).
  - `logEvent({ origem: 'chatwoot_webhook', externalId: message.id })`.
- **Testes:** `tests/api/webhooks-chatwoot.test.ts`.
- **Critério de aceite:** mensagem incoming em conversa cujo phone bate com contato move card; outgoing é ignorado.

---

### `app/api/cards/route.ts` + `app/api/cards/[id]/route.ts` + `.../comentarios/route.ts`
- **Ação:** create
- **Propósito:** CRUD de cards usado pelo front.
- **Conteúdo concreto:**
  - `GET /api/cards?coluna=&vendedor_id=&limit=50` → lista paginada com `with: { contato }`.
  - `POST /api/cards` — criação manual (raro, mas suportar — vendedor cria card avulso).
  - `GET /api/cards/[id]` → card completo com contato, pedido_origem, atividades, comentarios, últimos 10 pedidos do contato.
  - `PATCH /api/cards/[id]` — body `{ coluna?: ..., vendedor_id?: ..., nome_exibido?: ... }`. Mover coluna sempre via função do `lib/kanban.ts` em modo "override manual" (loga em `eventos`).
  - `POST /api/cards/[id]/comentarios` — body `{ texto }`.
- **Auth:** todas exigem sessão.
- **Testes:** `tests/api/cards-patch.test.ts` cobre transição manual + auditoria.
- **Critério de aceite:** mover card via API insere row em `eventos` com `origem='api_interna'`.

### `app/api/contatos/*`, `app/api/atividades/*`, `app/api/notificacoes/*`, `app/api/feature-flags/*`, `app/api/templates/*`, `app/api/usuarios/*`
- **Ação:** create cada um
- **Propósito:** CRUD dos respectivos recursos. Todas exigem sessão; `feature-flags`/`templates`/`usuarios` exigem role `admin`.
- **Conteúdo concreto:** padrão similar a cards. Cada route file expõe `GET`/`POST`/`PATCH` conforme necessário. Validação zod no body.
- **Critério de aceite:** smoke tests em uma rota de cada (GET retorna lista vazia em base fresca; POST cria; PATCH altera).

---

### `lib/auth.ts` + `app/api/auth/[...nextauth]/route.ts` + `app/(auth)/login/page.tsx`
- **Ação:** create
- **Propósito:** Auth.js v5 com provedor `Credentials`. Sessão JWT, sem store de sessão. Middleware protege todas as rotas exceto `/login`, `/api/webhooks/*`, `/api/sync/*`.
- **Conteúdo concreto:**
  - `lib/auth.ts` — `authConfig` exportando `auth`, `signIn`, `signOut`, `handlers`. Callback de authorize: busca por email, `bcrypt.compare`. Adiciona `role` e `userId` no token e na session.
  - `middleware.ts` na raiz — usa `auth.middleware()` com lista de paths públicos.
  - `app/(auth)/login/page.tsx` — form simples, server action chama `signIn('credentials', ...)`.
- **Testes:** manual.
- **Critério de aceite:** login com usuário criado pelo `seed:admin` redireciona pra `/kanban`; rota protegida sem sessão redireciona pra `/login`.

### `middleware.ts`
- **Ação:** create
- **Conteúdo:** matcher excluindo `/api/webhooks/*`, `/api/sync/*`, `/login`, `/_next/*`, `/favicon.ico`.
- **Critério de aceite:** `curl /kanban` sem cookie retorna redirect 307 para `/login`.

---

### `app/layout.tsx` + `app/providers.tsx` + `app/(app)/layout.tsx`
- **Ação:** create
- **Propósito:** shell. Sidebar fixa (nav: Kanban, Contatos, Notificações, Config), header com info do usuário + indicador de notificações não lidas.
- **Conteúdo concreto:**
  - `providers.tsx` envelopa em `QueryClientProvider` (staleTime 30s) + Sonner toaster.
  - `(app)/layout.tsx` chama `auth()` server-side, redireciona se não logado.
- **Critério de aceite:** navegar entre `/kanban`, `/contatos`, `/config` mantém sidebar; logout limpa sessão.

### `app/(app)/kanban/page.tsx` + `KanbanBoard.tsx` + `CardItem.tsx`
- **Ação:** create
- **Propósito:** tela primária.
- **Conteúdo concreto:**
  - Server page busca cards por coluna (50 por coluna inicialmente; "carregar mais" via Tanstack).
  - `KanbanBoard.tsx` usa `@dnd-kit/sortable` — 4 colunas, drag entre colunas dispara `PATCH /api/cards/[id]`.
  - `CardItem.tsx` mostra: nome cliente, valor do pedido origem (se houver), data prevista de ação, badge do tipo (`pos_venda`/`reativacao`).
- **Critério de aceite (AC9 do PRD):** abrir `/kanban` em <2s com 300 cards mock; drag-and-drop persiste e logs em `eventos`.

### `app/(app)/cards/[id]/page.tsx` + `CardDetail.tsx` + `HistoricoPedidos.tsx` + `Comentarios.tsx` + `AbrirWhatsappButton.tsx`
- **Ação:** create
- **Propósito:** detalhe rico do card (AC2, AC3 — user stories).
- **Conteúdo concreto:**
  - Header: nome cliente, contato (clicável), botão Abrir WhatsApp (chama Chatwoot API + abre Chatwoot em nova aba).
  - Seção Pedido de origem: itens, total, data, situação.
  - Seção Histórico: últimos 10 pedidos do contato (data, valor, situação Bling). Botão "Ver mais" → paginação.
  - Seção Atividades: pendentes + concluídas; criar nota.
  - Seção Comentários: lista + form.
- **Critério de aceite:** todas as 5 seções renderizam com dados reais via API; `AbrirWhatsappButton` chama `/api/cards/[id]/whatsapp` que faz `chatwoot.openOrCreateConversation`.

### `app/(app)/contatos/page.tsx` + `ContatosTable.tsx`
- **Ação:** create
- **Propósito:** lista de 4.113+ contatos com busca por nome/telefone.
- **Conteúdo concreto:** tanstack-table; server pagination 50 por página; busca server-side com `ilike`.
- **Critério de aceite:** busca por "joão" retorna em <500ms; clicar em contato vai pra `/contatos/[id]` (placeholder na v1, se faltar tempo redireciona pro último card).

### `app/(app)/notificacoes/page.tsx`
- **Ação:** create
- **Propósito:** lista das notificações do usuário logado + ação marcar como lida (individual e em massa).
- **Conteúdo concreto:** polling 30s via Tanstack `refetchInterval` no header também (pra badge não lidas).
- **Critério de aceite:** notificação criada por webhook Chatwoot aparece em <30s.

### `app/(app)/config/page.tsx` + tabs
- **Ação:** create
- **Propósito:** admin-only.
- **Conteúdo concreto:**
  - `FeatureFlagsTab` — toggle de cada flag (IA, polling, webhook ativo). Salvar chama `PUT /api/feature-flags`.
  - `UsuariosTab` — CRUD usuários.
  - `TemplatesTab` — editor textarea por template; preview com placeholders dummy.
- **Critério de aceite:** vendedor (role≠admin) que acessa `/config` recebe 403.

---

### `scripts/bootstrap-bling.ts`
- **Ação:** create
- **Propósito:** importar 4.113 contatos + 27.851 pedidos dos ndjson já existentes em `~/Documents/`. **Não chama API Bling**.
- **Conteúdo concreto:**
  - Path dos arquivos lido de env `BOOTSTRAP_NDJSON_DIR` (default `C:/Users/GabrielM Pc/Documents/`).
  - Stream `bling_pedidos_list.ndjson` linha a linha (readline), extrai contato_id, buffer batches de 500, faz upserts.
  - Faz `bling_pedidos_full.ndjson` em seguida pra preencher `pedido_itens` + `dados_completos_json`.
  - Não cria cards no bootstrap — apenas dados históricos. Cards futuros virão por webhook/sync.
  - Log progresso a cada 1000 linhas.
- **Testes:** rodar em DB vazio, conferir counts no fim.
- **Critério de aceite (AC10/AC11 do PRD):** após `npm run bootstrap:bling`, `select count(*) from contatos` ≈ 4113 e `select count(*) from pedidos` ≈ 27851.

### `scripts/create-admin.ts`
- **Ação:** create
- **Conteúdo:** prompt CLI (`@inquirer/prompts` ou flags via process.argv) pra email/senha/nome → bcrypt → insert. Role `admin`.
- **Critério de aceite:** após rodar, usuário consegue logar em `/login`.

### `scripts/seed-templates.ts`
- **Ação:** create
- **Conteúdo:** upsert dos 4 templates iniciais com conteúdo placeholder (mensagens reais a ser revisadas pelo Gabriel — Open Question do PRD §10).
- **Critério de aceite:** após rodar, tabela `templates_mensagem` tem 4 rows.

### `scripts/reset-dev-db.ts`
- **Ação:** create
- **Conteúdo:** dropa schema `public` e recria; chama drizzle-migrate. **Apenas DEV** — checa `NODE_ENV !== 'production'` e aborta caso contrário.
- **Critério de aceite:** rodar em prod aborta com erro claro.

---

### `n8n/workflows/01-bling-delta-poll.json`
- **Ação:** create (exportar do n8n após configurar manualmente)
- **Propósito:** cron a cada 5min chamando `POST /api/sync/bling/delta` no CRM.
- **Conteúdo concreto:** Trigger Schedule (cada 5min, TZ America/Sao_Paulo) → HTTP Request POST com header `X-N8N-Secret`.
- **Critério de aceite:** workflow exporta funcional; `BLING_LAST_SYNC_AT` avança nos testes.

### `n8n/workflows/02-cron-d14-pendente-para-contato.json`
- **Propósito:** diariamente às 8h BRT, chama endpoint interno (a criar inline aqui: `/api/cron/transitions-d14`) que: pra cada card `pos_venda` em `pendente` com `data_prevista_acao <= now`, aplica `proximaTransicaoAutomatica` e dispara mensagem via Chatwoot.
- **Decisão de design:** **a regra de transição é avaliada no CRM** (`/api/cron/transitions`), n8n só agenda + chama. Mantém lógica centralizada.

### `n8n/workflows/03-cron-48h-sem-resposta.json`
- **Propósito:** diariamente, mesma rotina com filtro `em_contato + atualizado_em + 48h <= now`.

### `n8n/workflows/04-cron-d90-reativacao.json`
- **Propósito:** diariamente, cards `reativacao + pendente + data_prevista_acao <= now`.

### `n8n/workflows/05-cron-arquivar-reativacao-3x.json`
- **Propósito:** diariamente, cards `reativacao` com `tentativas_reativacao >= 3` e sem resposta — move pra `arquivo`, seta `freezing_ate`.

> **Consolidação:** os 4 workflows acima podem ser **1 só endpoint** `POST /api/cron/transitions` que processa todas as transições no CRM; cada workflow n8n é só um cron diferente que chama esse endpoint com `{ tipo: 'd14' | 'sem_resposta' | 'reativacao' | 'arquivar' }`. **Decisão:** **um endpoint, 4 workflows n8n** (n8n só dispara timer; CRM faz a lógica).

### `app/api/cron/transitions/route.ts`
- **Ação:** create (não estava na árvore inicial mas decorre da consolidação acima)
- **Propósito:** endpoint chamado pelos workflows 02-05.
- **Conteúdo concreto:**
  - `POST` com `X-N8N-Secret` + body `{ tipo: 'd14'|'sem_resposta'|'reativacao'|'arquivar' }`.
  - Query cards correspondentes; pra cada um, aplica `proximaTransicaoAutomatica` de `lib/kanban.ts`.
  - Pra cada transição que envolve envio de mensagem: chama `chatwoot.openOrCreateConversation` com template renderizado.
  - **Idempotência:** loga em `eventos` com `externalId = card.id + '-' + tipo + '-' + dataYYYYMMDD` — chamadas duplicadas no mesmo dia para o mesmo card são noop.
- **Critério de aceite:** dado um card sintético com `data_prevista_acao` no passado, uma chamada move card e dispara Chatwoot; chamada repetida no mesmo dia não duplica mensagem.

### `n8n/README.md`
- **Ação:** create
- **Conteúdo:** instruções: importar JSONs, configurar credencial `X-N8N-Secret`, env `CRM_BASE_URL`. Comando de teste manual de cada workflow.

---

### `Dockerfile`
- **Ação:** create
- **Propósito:** Coolify rodar Next 15 standalone.
- **Conteúdo concreto:** multi-stage (deps, builder, runner) baseado em `node:20-alpine`, `output: standalone` do Next.
- **Critério de aceite:** `docker build` produz imagem; container responde em :3000.

### `docker-compose.yml`
- **Ação:** create
- **Propósito:** apenas Postgres local pra dev. **Não** sobe app no compose — `npm run dev` direto pra hot-reload.
- **Conteúdo concreto:** postgres 16, volume nomeado, port 5432, healthcheck.
- **Critério de aceite:** `docker compose up -d` deixa DB acessível em `DATABASE_URL` do `.env.example`.

### `README.md`
- **Ação:** create
- **Conteúdo:** quick-start (clone → .env → docker compose → db:migrate → bootstrap → seed → dev), comandos npm canônicos, link pro `PRD.md` e `Spec.md`, troubleshoot básico.

---

## Decisões técnicas tomadas aqui (não no PRD)

1. **UI framework: Tanstack Query + shadcn puro, sem Refine.dev.** Refine é overkill pra 4 telas com fluxos custom (Kanban com automações, detalhe rico). Brilha em CRUD massivo (20+ recursos), não aqui. Custo: ~1 dia extra de boilerplate de Query hooks; benefício: zero lock-in, código idiomático Next.
2. **Tokens OAuth Bling armazenados em tabela `bling_tokens`** (singleton), não em env vars. Re-deploy a cada refresh (~30d) é inviável; lock pessimista evita race. CLIENT_ID e CLIENT_SECRET continuam em env vars.
3. **bling-sync é parte do Next.js**, não microserviço. Webhook receiver = route; cron delta = endpoint chamado pelo n8n. Reduz superfície de deploy.
4. **Notificações in-app = polling 30s**, não WebSocket/SSE. 2-3 usuários simultâneos não justificam complexidade.
5. **Templates WhatsApp armazenados em tabela `templates_mensagem`** com placeholders `{{...}}`. Renderização feita no CRM (`lib/templates.ts`), n8n só repassa string pronta ao Chatwoot. Permite o Gabriel editar template via tela de Config.
6. **Lógica de transição de coluna mora em `lib/kanban.ts` no CRM**, não no n8n. n8n é apenas timer + transport. Consolidação dos workflows 02-05 em 1 endpoint `POST /api/cron/transitions` com `tipo`.
7. **Bootstrap inicial NÃO chama API Bling** — lê ndjson já existentes em `~/Documents/`. Evita 27.851 chamadas, respeita rate-limit, é repetível.
8. **Polling do Bling é o caminho primário; webhook é otimização posterior.** A Open Question do PRD §10 fica resolvida com fallback que sempre funciona; webhook entra atrás de feature flag `BLING_WEBHOOK_ATIVO` quando Gabriel confirmar disponibilidade na aba Webhooks do app 335719.
9. **Unique partial index em `cards (contato_id) WHERE coluna != 'arquivo'`** — garante invariante "no máximo 1 card ativo por contato"; pega bug de duplicação por race entre webhook e cron.
10. **Idempotência centralizada via `eventos.external_id`** — toda integração de entrada (Bling webhook, Chatwoot webhook, n8n cron) define um `externalId` único e checa duplicate antes de processar.
11. **Auth.js v5 com JWT session** (sem store de sessão DB). Custo de invalidação manual é aceitável pra 2-3 usuários internos.
12. **TZ America/Sao_Paulo hard-coded** em `lib/time.ts` (luxon). Container roda com `TZ=America/Sao_Paulo`.
13. **Testes unitários focados em `lib/kanban.ts` + `lib/templates.ts` + webhooks**. UI sem testes automatizados na v1 (manual). Estratégia: mais retorno pelo esforço.
14. **n8n workflows versionados como JSON exportado em `n8n/workflows/`**. Não há sync automático — após edição no UI do n8n, dev exporta e commit. Documentado em `n8n/README.md`.
15. **`/api/cron/transitions` aceita `{ tipo }` em vez de 1 endpoint por tipo.** Reduz boilerplate; n8n vira "schedule + payload literal".

---

## Riscos de implementação + mitigação

- **Risco:** Webhook do Bling pode não disparar pra mudança de situação (aberto na Open Question do PRD §10). → **Mitigação:** path primário é polling via `/api/sync/bling/delta` chamado pelo n8n cron de 5min. Webhook fica atrás de feature flag `BLING_WEBHOOK_ATIVO`; quando habilitado, o handler do webhook desabilita polling implicitamente (não cria card se já existe — idempotência já cobre).
- **Risco:** Bootstrap de 27.851 pedidos estoura memória se carregar tudo. → **Mitigação:** streaming linha-a-linha dos ndjson, batches de 500 inserts, `console.log` de progresso a cada 1k linhas; rodar com `node --max-old-space-size=2048` se necessário.
- **Risco:** 2 instâncias de refresh do token OAuth Bling em paralelo invalidam o refresh um do outro (pegadinha #4 — refresh antigo é invalidado ao usar). → **Mitigação:** `SELECT FOR UPDATE` na row de `bling_tokens` no início de `refreshTokens`; segunda call espera + relê e detecta token já válido.
- **Risco:** Webhook Chatwoot entrega duplicado (retry HTTP). → **Mitigação:** idempotência via `(origem='chatwoot_webhook', external_id=message.id)` em `eventos`.
- **Risco:** Race condition entre webhook Bling criando card e cron n8n já tentando processar transição. → **Mitigação:** unique partial index em `cards`; cron descarta card criado nos últimos 5 minutos (filtro `age(now(), criado_em) > interval '5 minutes'`).
- **Risco:** Kanban com >100 cards numa coluna fica lento. → **Mitigação:** server pagination 50 por coluna, "carregar mais" no scroll. Virtualização (`@tanstack/react-virtual`) só se necessário após perfil.
- **Risco:** Vendedor edita template e quebra placeholders → mensagem sai literal `{{nome_cliente}}` pro cliente. → **Mitigação:** preview no editor com placeholders dummy; validação Zod do conteúdo (deve conter pelo menos os placeholders obrigatórios por template — `{{nome_cliente}}` em todos).
- **Risco:** Cron n8n configurado em UTC roda no horário errado. → **Mitigação:** `TZ=America/Sao_Paulo` no container do n8n + cada workflow declara explicitamente o timezone no node Schedule. `n8n/README.md` documenta como conferir.
- **Risco:** CLIENT_SECRET do Bling vazar no repo (texto puro em `bling app.txt` no working dir do dev). → **Mitigação:** `.gitignore` lista o arquivo de cara; `git init` já com `.gitignore` no primeiro commit; checar `git status` antes do primeiro push.
- **Risco:** Bling muda formato do `situacao.valor` ou IDs internos. → **Mitigação:** schema interno guarda `dados_completos_json` (jsonb) com payload bruto; `situacao_id` + `situacao_valor` separadas; mapper isolado em `lib/bling/mapper.ts`.
- **Risco:** Coolify recria container e perde estado de cache local. → **Mitigação:** cache em memória (feature flags 60s) é regenerado em 1 query; tokens em DB persistem. Sem dependência de filesystem local.

---

## Pré-requisitos antes de iniciar a Fase 3 (bloqueantes)

Levantados a partir do PRD §10 — sem estes, partes da implementação ficam emperradas:

- **Specs da VPS Hostinger** confirmados (RAM ≥1GB livre pra Postgres + crm). → **Quem desbloqueia:** Gabriel rodar `free -h && df -h && nproc` na VPS.
- **Sync de pedidos do Bling concluído** (task #12 do projeto). Sem isso, `bling_pedidos_full.ndjson` está parcial e o bootstrap importa dados incompletos.
- **Subdomínio definido** (`crm.lojasdim.com.br` recomendado) e DNS apontando pra Coolify — necessário pra Bling registrar webhook (quando ligado) e Chatwoot configurar URL pública.
- **Credenciais Chatwoot:** API token + account_id + inbox_id da inbox WhatsApp Baileys (env vars).
- **Lista de vendedores iniciais** (nome + email + telefone) pra `seed:admin` e cadastros iniciais.

Pré-requisitos **não-bloqueantes** (Fase 3 pode começar, resolvidos durante implementação):

- Conteúdo final dos 4 templates de mensagem WhatsApp (placeholders ficam definidos; texto real é editável via `/config`).
- Prompts dos agentes IA (iteração 1.5).
- NPS baseline.
