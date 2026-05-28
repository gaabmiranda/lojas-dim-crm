# PRD: CRM próprio Lojas Dim (custom-built, IA-augmented progressivo)

> Regenerado em 2026-05-27 via skill `prd-folloni` Fase 1 (revisão pós-feedback do usuário).
> Mudança chave em relação ao PRD anterior: **rejeição de Twenty CRM** em favor de build custom enxuto + **camada IA opcional via n8n**.
> Documentos relacionados: `docs/regua_relacionamento_arquitetura.md`, memórias em `~/.claude/projects/.../memory/`.

---

## 1. Introdução

CRM custom-built self-hosted, específico pra operação da Lojas Dim (varejo de retalhos B2C com ERP Bling), substituindo a combinação atual de **RD Station CRM + Pluga**. Construção em **Next.js 15 fullstack** sobre Postgres, integrado à infraestrutura existente (n8n + Chatwoot + Baileys), com **camada de agentes IA pluggable** que pode ser ligada progressivamente sem reescrever o core.

Princípios:
- **Bling = source of truth** dos dados; CRM lê (não escreve no Bling).
- **n8n = cérebro de automação** (agendamentos, triggers, integrações, chamadas LLM).
- **App CRM = visualização + ação manual + CRUD**.
- **IA-augmented = opcional, progressivo, plugado via n8n.**

---

## 2. Problem Statement

Hoje Gabriel paga assinatura mensal de **RD Station CRM + Pluga** e enfrenta 3 falhas operacionais:

1. **Dados copiados pelo Pluga não colam no campo correto** do card (informação do pedido fica em local errado ou incompleta)
2. **Notificações de atividades agendadas não chegam** com confiabilidade
3. **Automações de movimentação de card só existem em planos pagos superiores** — toda transição manual via vendedor

**Frequência:** toda venda processada (~10 pedidos/dia × 30 = ~300/mês).

**Impacto:** perda de oportunidades de pós-venda + reativação inconsistente + tempo do vendedor recriando informação que já existe no Bling.

**Pensamento de fundo:** o RD Station é over-spec pro caso — 70% das features dele não são usadas. Twenty CRM (avaliado e rejeitado) tem o mesmo problema. **A operação cabe em 4 telas** (Kanban, Detalhe do card, Lista de contatos, Configurações) + automações no n8n. Build custom é mais leve, mais rápido e mais barato.

---

## 3. Solution Overview

Aplicação **Next.js 15 fullstack** com:

- **Frontend**: 4 telas (Kanban pipeline, Detalhe do card, Lista de contatos, Configurações), interface em português, responsiva mas otimizada pra desktop.
- **Backend (API routes)**: CRUD de contatos, pedidos espelhados, cards, atividades, eventos; webhooks pra Bling e n8n; auth.
- **Banco Postgres dedicado** (schema próprio, sem mexer no banco de outros serviços do Coolify).
- **Integração com n8n existente** via webhooks bidirecionais — n8n orquestra automações, schedule, integrações Bling, chamadas LLM.
- **Integração com Chatwoot existente** via API — abrir conversa programaticamente, ler resposta do cliente.
- **bling-sync worker** (pode ser route no Next.js ou microserviço separado) — webhook receiver + cron job de delta sync com Bling.

Stack consolidada:

```
┌──────────────────────────────────────────────────────────┐
│              VPS Hostinger / Coolify                      │
│                                                            │
│  ┌──────────────┐    ┌──────────────┐                    │
│  │  crm (Next)  │◄───┤   postgres   │                    │
│  └──────┬───────┘    └──────────────┘                    │
│         │                                                  │
│         │ webhooks bidirecionais                           │
│         ▼                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────┐  │
│  │     n8n      │◄───┤   chatwoot   │◄───┤  baileys   │  │
│  │ (existente)  │    │ (existente)  │    │ (existente)│  │
│  └──────┬───────┘    └──────────────┘    └────────────┘  │
│         │                                                  │
│         │ chamadas LLM (Anthropic API)                     │
│         ▼                                                  │
└──────────────────────────────────────────────────────────┘
              [Anthropic Claude API — opcional]
```

---

## 4. Goals (mensuráveis)

- **G1**: Substituir 100% das funções do RD Station + Pluga em até **4 semanas** (definição: vendedor opera no CRM novo e não toca mais no RD).
- **G2**: Custo mensal **recorrente** de **R$ 0** em licenças/SaaS. Único custo aceito: **API LLM** se camada IA for ligada (~R$ 10-50/mês esperado).
- **G3**: 100% dos pedidos com status `ATENDIDO` no Bling viram automaticamente Card Pós-venda no CRM com **todos os campos preenchidos corretamente** (nome, contato, itens, valor) — sem ação manual do vendedor.
- **G4**: 100% das atividades agendadas disparam notificação no horário correto via **WhatsApp (Chatwoot)** e in-app.
- **G5**: Movimentação automática de cards entre colunas (Pendente → Em contato → Finalizado → Reativação) seguindo regras temporais e de evento, sem ação manual exceto onde necessário (resposta humana ao cliente).
- **G6**: Histórico completo de pedidos do cliente (28k pedidos sincronizados) acessível ao vendedor dentro do CRM no momento do contato — sem precisar abrir o Bling.
- **G7**: Camada de **agentes IA pluggable** via n8n — feature flag liga/desliga sem reescrever o core; quando ligada, gera mensagens personalizadas, classifica respostas, sugere ofertas.

---

## 5. Non-Goals (CRITICAL — IA não infere por omissão)

- **Não usa Twenty CRM** ou qualquer outro CRM open-source pronto. Build é custom.
- **Não migra histórico de cards/atividades do RD Station.** Bling é source of truth; RD é descartado no cutover.
- **Não substitui o Bling.** Bling continua sendo o ERP. CRM apenas lê.
- **NFe está fora do escopo** do CRM.
- **Não emite boletos nem cobra.** Régua de cobrança = projeto separado, futuro.
- **Sem app mobile nativo (iOS/Android).** Responsive web é suficiente.
- **Não substitui o Chatwoot como UI de atendimento.** Vendedor responde cliente DENTRO do Chatwoot. CRM mostra contexto + dispara conversa, não conduz conversa.
- **Não implementa pipeline B2B separado** (90%+ B2C confirmado). Pipeline único.
- **Sem segmentação RFM nesta iteração 1.** Régua avançada (6 estágios + 8 segmentos do doc `regua_relacionamento_arquitetura.md`) fica pra iteração 2.
- **Sem dashboards analíticos avançados nesta iteração.** Foco em pipeline operacional.
- **Sem programa de fidelidade, indicação, cross-sell automático.** Funcionalidades futuras.
- **Sem suporte a múltiplas lojas/empresas no CRM.** Lojas Dim é entidade única.
- **Sem portal/acesso para o cliente final.** Uso interno apenas (funcionários).
- **Agentes IA não são obrigatórios na v1.0.** Sistema funciona sem eles; feature flag controla.
- **Não usa Evolution API, WAHA, WhatsApp Business Cloud API.** Mensageria mantém Chatwoot + Baileys já em produção.

---

## 6. User Stories (atomic)

**Vendedor:**

- Como **vendedor**, eu quero ver todos os cards de pós-venda em formato Kanban (Pendente, Em contato, Finalizado, Reativação), pra ter visão geral do funil.
- Como **vendedor**, eu quero abrir um card e ver imediatamente nome do cliente, contato (telefone/email), itens do pedido (descrição + quantidade + valor) e total, sem precisar abrir o Bling.
- Como **vendedor**, eu quero ver no card o histórico das últimas N compras do cliente (data + valor + status), pra contextualizar o contato.
- Como **vendedor**, eu quero clicar num botão "Abrir WhatsApp" no card e iniciar/abrir a conversa do cliente no Chatwoot.
- Como **vendedor**, eu quero adicionar comentários/notas no card durante o atendimento.
- Como **vendedor**, eu quero receber notificação WhatsApp quando uma atividade que está atribuída a mim chega na data agendada.
- Como **vendedor**, eu quero arrastar cards entre colunas manualmente (override de automação) quando precisar.
- Como **vendedor (com IA ligada)**, eu quero a IA sugerir uma mensagem personalizada de pós-venda baseada nos itens do pedido + histórico do cliente, podendo aceitar, editar ou rejeitar antes de enviar.

**Gestor (Gabriel):**

- Como **gestor**, eu quero ver no dashboard quantos pedidos viraram pós-venda hoje/semana/mês.
- Como **gestor**, eu quero ver quantos cards estão em cada coluna (volume do funil).
- Como **gestor**, eu quero ver taxa de resposta dos clientes em pós-venda e em reativação.
- Como **gestor**, eu quero ligar/desligar a camada IA por feature flag nas configurações.

**Sistema:**

- Como **sistema**, eu quero criar automaticamente um Card Pós-venda quando o Bling dispara webhook de pedido `ATENDIDO`, sem ação humana.
- Como **sistema**, eu quero mover automaticamente o card de "Pendente" para "Em contato" no dia D+14 após o pedido (via n8n cron).
- Como **sistema**, eu quero mover automaticamente o card de "Em contato" para "Finalizado" se passar 48h sem resposta OU se cliente responder no WhatsApp.
- Como **sistema**, eu quero renomear o card pra "Reativação + nome" e agendar nova atividade pra D+90 quando vira "Finalizado".
- Como **sistema**, eu quero detectar quando o cliente faz nova compra no Bling e reabrir como "Pós-venda" automaticamente.
- Como **sistema**, eu quero parar o loop de reativação após 3 tentativas sem resposta e mover o cliente pra "Arquivo dormente" (não recebe mais mensagem automática por 12 meses).
- Como **sistema (com IA ligada)**, eu quero classificar a resposta do cliente no WhatsApp (positiva/negativa/dúvida/sem interesse) e roteirizar a próxima ação automaticamente.

---

## 7. Acceptance Criteria

- [ ] **AC1**: Bling dispara webhook de pedido com status `ATENDIDO` → endpoint `/api/webhooks/bling` do CRM recebe → cria/atualiza `Pedido` no Postgres + cria `Card` na coluna "Pendente" com campos preenchidos (cliente, itens, valor, data_prevista_acao = D+14).
- [ ] **AC2**: D+14 chega → n8n cron job (configurado pra rodar diariamente às 8h) move card pra "Em contato" + chama API do Chatwoot pra abrir conversa WhatsApp + dispara mensagem template ao cliente.
- [ ] **AC3**: Cliente responde no WhatsApp → Chatwoot webhook → endpoint `/api/webhooks/chatwoot` do CRM marca card como "Finalizado" + notifica vendedor responsável (WhatsApp + in-app).
- [ ] **AC4**: 48h sem resposta após D+14 → n8n auto-move card pra "Finalizado" sem mensagem extra.
- [ ] **AC5**: Card vira "Finalizado" → workflow no CRM renomeia automaticamente pra "Reativação + nome cliente" + agenda próxima atividade pra D+90 (insert em `eventos_agendados`).
- [ ] **AC6**: D+90 chega → n8n dispara mensagem de reativação (template 1, sem desconto) + move card pra "Em contato".
- [ ] **AC7**: Cliente compra de novo (Bling webhook) → bling-sync detecta cliente existente → reabre card como "Pós-venda" + cancela loop de reativação pendente.
- [ ] **AC8**: Após 3 tentativas de reativação sem resposta → card vai pra coluna "Arquivo" + flag `freezing_ate` = today + 12 meses + cliente não recebe mais mensagem automática até essa data.
- [ ] **AC9**: Vendedor acessa pelo navegador (subdomínio do `lojasdim.com.br` a definir), faz login com credencial própria, vê pipeline Kanban funcional em <2s.
- [ ] **AC10**: 4.113 contatos do Bling estão importados no Postgres antes do go-live, com campo `id_bling` populado.
- [ ] **AC11**: Histórico de 28k pedidos espelhado no banco; card de cada cliente mostra os 10 mais recentes diretamente; mais via paginação.
- [ ] **AC12**: 0 (zero) cobrança recorrente em SaaS após cutover do RD Station + Pluga.
- [ ] **AC13**: Feature flag `IA_AGENTS_ENABLED` controla se camada IA está ligada. Quando OFF, sistema funciona 100% sem chamadas LLM. Quando ON, n8n usa Anthropic API pra geração de mensagens + classificação.
- [ ] **AC14**: Quando IA está ON, custo médio mensal de API LLM deve ficar abaixo de R$ 50/mês com volume atual de ~300 cards/mês.

---

## 8. Technical Requirements

### Stack

- **Frontend + Backend**: **Next.js 15** (App Router) + TypeScript estrito
- **UI components**: **shadcn/ui** + Tailwind CSS v4
- **Admin framework (acelerador)**: avaliar **Refine.dev** vs montagem manual com Tanstack — decidir na Fase 2 (Spec)
- **Banco**: **PostgreSQL 16**
- **ORM**: **Drizzle ORM** (lightweight, type-safe, melhor que Prisma pra projetos enxutos)
- **Validação**: **Zod**
- **Auth**: **Auth.js v5** (NextAuth) com provedor de credenciais — login simples pra 2-3 funcionários, sem OAuth externo
- **Fila/scheduler**: **n8n existente** (não usar BullMQ; aproveita infra)
- **Mensageria**: **Chatwoot + Baileys** existentes
- **IA (opcional)**: **Anthropic Claude API** — Sonnet pra geração, Haiku pra classificação

### Integrações obrigatórias

- **Bling API v3 OAuth 2.0** — app ID 335719 já criado, todos os 82 escopos autorizados, refresh token funcionando, tokens armazenados em variáveis de ambiente do Coolify
- **Chatwoot REST API** + webhooks
- **n8n** via webhook HTTP bidirecional

### Persistência (schema crítico)

Tabelas principais (Postgres):

- `contatos` (id, id_bling, nome, telefone, email, dados_extras_json, criado_em, atualizado_em, freezing_ate)
- `pedidos` (id, id_bling, contato_id, numero, data, situacao, total, total_produtos, dados_completos_json, criado_em, atualizado_em)
- `pedido_itens` (id, pedido_id, descricao, quantidade, valor_unitario, valor_total)
- `cards` (id, contato_id, pedido_id_origem, tipo {pos_venda|reativacao}, coluna {pendente|em_contato|finalizado|arquivo}, nome_exibido, criado_em, atualizado_em, tentativas_reativacao)
- `atividades` (id, card_id, tipo, titulo, descricao, data_agendada, status, vendedor_id, executada_em)
- `eventos` (id, card_id, tipo, payload_json, criado_em) — log de auditoria
- `usuarios` (id, email, senha_hash, nome, role {admin|vendedor}, ativo)
- `comentarios` (id, card_id, usuario_id, texto, criado_em)
- `feature_flags` (key, value, atualizado_em) — pra ligar/desligar IA, etc.

Schema separado `bling_cache` no mesmo Postgres pra cache bruto da API Bling (snapshot de respostas pra evitar re-fetch).

### Hosting/Deploy

Coolify + Docker. Domínio próprio (subdomínio a definir).

### Performance/Escala

- ~300 cards novos/mês (10 pedidos/dia)
- ~4.1k contatos totais, crescimento ~50/mês
- ≤3 usuários simultâneos
- Latência alvo: <2s pra abrir Kanban; <500ms pra abrir um card; <30s pra criar card após webhook Bling
- Tamanho de banco esperado: <500MB no primeiro ano

---

## 9. Constraints (hard limits)

- **Custo recorrente máximo: R$ 50/mês** (apenas API LLM se IA ligada). Tudo o resto = R$ 0.
- **VPS Hostinger básica** — specs exatas a confirmar (Open Question). Total RAM consumida pelos novos containers (crm + postgres) ≤ 1GB.
- **Não pode quebrar Chatwoot/Baileys/n8n já em produção.** Implementação coexiste.
- **Bling = source of truth.** CRM nunca escreve em pedidos/contatos do Bling de volta.
- **WhatsApp via stack atual.** Não introduzir Evolution API, WAHA ou Cloud API Meta.
- **Cutover progressivo.** RD Station continua rodando paralelo até validação completa (≥1 semana) antes de cancelar.
- **Compatibilidade com fluxo atual** (D+14, 48h espera, 90d reativação, loop até arquivo após 3 tentativas).
- **Stack TypeScript-only.** Sem Python, Go, PHP, etc. Reduz complexidade de manutenção.
- **Camada IA é feature flag.** Sistema deve funcionar 100% com `IA_AGENTS_ENABLED=false`.

---

## 10. Open Questions

- **Specs exatas da VPS Hostinger** (RAM, CPU, disco). Crítico antes de subir novos containers. **Quem desbloqueia:** Gabriel rodar `free -h && df -h && nproc` na VPS.
- **Subdomínio do CRM** (sugerido: `crm.lojasdim.com.br` ou `crm.lojadim.com.br`). **Desbloqueia:** Gabriel decidir + apontar DNS.
- **Vendedores que vão usar** (nomes + e-mails pra cadastro inicial). **Desbloqueia:** Gabriel informar.
- **Templates de mensagem WhatsApp** (pós-venda D+14, reativação 1ª tentativa, reativação 2ª, reativação 3ª). **Desbloqueia:** Gabriel revisar com vendedores.
- **Webhook do Bling pra `ATENDIDO`** — Bling permite configurar webhook por mudança de situação? Confirmar na aba Webhooks do app 335719. Plano B: polling periódico via n8n a cada 5 min.
- **Refine.dev vs Tanstack puro** — decisão deixada pra Fase 2 (Spec). Refine economiza ~30% de tempo mas adiciona dependência. Tanstack puro = mais código mas zero lock-in.
- **Storage de tokens OAuth do Bling** — Coolify env vars ou banco? Env vars é mais simples mas requer re-deploy pra atualizar quando refresh roda. Banco permite atualização runtime mas adiciona complexidade. Decidir na Spec.
- **Prompts dos agentes IA** quando IA for ligada — engenharia de prompt fica pra iteração 1.5.
- **Mix fiado vs à vista** (pergunta original ainda em aberto) — não bloqueia esta iteração, mas afeta priorização da iteração 2 (régua de cobrança).
- **NPS baseline atual** — não medido. Vendedor pode capturar manualmente na 1ª mensagem de pós-venda durante a primeira semana de uso pra estabelecer baseline.
- **Sync de contatos ainda rodando** (task #12) — precisa estar concluído antes do bootstrap inicial do banco do CRM.
