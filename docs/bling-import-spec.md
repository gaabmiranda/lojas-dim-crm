# Spec: Importação Completa do Bling para o CRM

**Objetivo:** Importar todos os dados disponíveis na API v3 do Bling para o banco PostgreSQL do CRM, criando um data warehouse operacional para análise de vendas, financeiro, estoque e fiscal.

**Critério de aceite:** Todos os módulos marcados como `[x]` estão no banco, com tabelas Drizzle migradas, mappers funcionando e script de import rodado contra produção.

---

## Restrições da API

- Rate limit: 3 req/s · 120.000 req/dia
- Paginação: 100 registros/requisição (`?pagina=N&limite=100`)
- Filtro de data: janela máxima de 1 ano por requisição
- Webhooks disponíveis apenas para: `pedidosVendas`, `produtos`, `estoques`, `nfes`, `nfces` — demais módulos exigem polling

---

## Status de Importação

### ✅ Já importado

- [x] **contatos** — `GET /contatos` → tabela `contatos` (4.052 registros em prod)
- [x] **pedidosVendas** — `GET /pedidosVendas` → tabelas `pedidos` + `pedido_itens` (28.032 pedidos, 96.951 itens em prod)

---

### 🔲 Financeiro

- [ ] **contasReceber** — `GET /contasReceber`
  - Tabela: `contas_receber`
  - Campos-chave: `id, situacao, vencimento, valor, saldo, vencimentoOriginal, numeroBanco, borderos[], contato{id}`
  - Join: `contato.id` → `contatos.idBling`
  - ROI: inadimplência, aging, fluxo de caixa, ticket médio por cliente

- [ ] **contasPagar** — `GET /contasPagar`
  - Tabela: `contas_pagar`
  - Campos-chave: `id, situacao, vencimento, valor, saldo, fornecedor{id,nome}`
  - ROI: custo operacional, projeção de caixa

- [ ] **contasContabeis** — `GET /contasContabeis`
  - Tabela: `contas_contabeis` (dimensão/lookup)
  - Campos-chave: `id, descricao, tipo`
  - ROI: classificação contábil de receitas/despesas

- [ ] **categoriasReceitasDespesas** — `GET /categoriasReceitasDespesas`
  - Tabela: `categorias_financeiras` (dimensão/lookup)
  - Campos-chave: `id, descricao, tipo`

- [ ] **formasDePagamento** — `GET /formasDePagamento`
  - Tabela: `formas_pagamento` (dimensão/lookup)
  - Campos-chave: `id, descricao, tipoPagamento`

- [ ] **borderos** — `GET /borderos`
  - Tabela: `borderos`
  - Campos-chave: `id, data, contaBancaria{id}, contasReceber[]`
  - ROI: conciliação bancária

---

### 🔲 Compras

- [ ] **pedidosCompras** — `GET /pedidosCompras`
  - Tabela: `pedidos_compra` + `pedidos_compra_itens`
  - Campos-chave: `id, numero, data, situacao, fornecedor{id}, itens[{produto, quantidade, valor}]`
  - ROI: custo de mercadoria, margem bruta

---

### 🔲 Produtos e Estoque

- [ ] **produtos** — `GET /produtos`
  - Tabela: `produtos`
  - Campos-chave: `id, nome, codigo, preco, precoCusto, tipo, situacao, categoria{id}, estoque`
  - ROI: catálogo, precificação, margem

- [ ] **produtosVariacoes** — `GET /produtos/{id}/variacoes`
  - Tabela: `produto_variacoes`
  - Campos-chave: `id, nome, codigo, preco, produtoPai{id}`
  - Dependência: `produtos`

- [ ] **estoques** — `GET /estoques`
  - Tabela: `estoques`
  - Campos-chave: `produto{id}, deposito{id}, saldoVirtual, saldoFisico`
  - Obs: saldo **atual** apenas (sem histórico de movimentações)
  - ROI: cobertura de estoque, ruptura

- [ ] **depositos** — `GET /depositos`
  - Tabela: `depositos` (dimensão/lookup)
  - Campos-chave: `id, descricao, situacao`

- [ ] **categoriasProdutos** — `GET /categorias/produtos`
  - Tabela: `categorias_produtos` (dimensão/lookup)
  - Campos-chave: `id, descricao`

- [ ] **gruposDeProdutos** — `GET /grupos`
  - Tabela: `grupos_produtos` (dimensão/lookup)
  - Campos-chave: `id, nome`

- [ ] **produtosFornecedores** — `GET /produtos/{id}/fornecedores`
  - Tabela: `produto_fornecedores`
  - Campos-chave: `produto{id}, fornecedor{id}, precoCusto, prazoEntrega`
  - Dependência: `produtos`, `contatos` (fornecedores)

---

### 🔲 Fiscal

- [ ] **nfes** — `GET /nfes`
  - Tabela: `nfe`
  - Campos-chave: `id, numero, serie, situacao, dataEmissao, contato{id}, pedido{id}, valorTotal`
  - Obs: breakdown ICMS/PIS/COFINS/IPI não verificado — testar antes de mapear

- [ ] **nfces** — `GET /nfces`
  - Tabela: `nfce`
  - Campos-chave: similar ao nfe, sem CPF obrigatório

- [ ] **naturezasDeOperacoes** — `GET /naturezas-de-operacoes`
  - Tabela: `naturezas_operacao` (dimensão/lookup)
  - Campos-chave: `id, descricao, tipo, cfop`

---

### 🔲 Logística

- [ ] **logisticasRemessas** — `GET /logisticas/remessas`
  - Tabela: `logistica_remessas`
  - Campos-chave: `id, situacao, pedido{id}, transportadora{id}, codigoRastreio`
  - ROI: SLA de entrega, performance por transportadora

- [ ] **logisticas** — `GET /logisticas`
  - Tabela: `logisticas` (dimensão/lookup)
  - Campos-chave: `id, nome, tipo`

---

### 🔲 Vendedores / Equipe

- [ ] **vendedores** — `GET /vendedores`
  - Tabela: `vendedores` (dimensão/lookup)
  - Campos-chave: `id, contato{id}, comissao`
  - ROI: ranking de vendedores, comissionamento

---

### 🔲 Fora de escopo (por ora)

- `nfses` — NFS-e (serviços): não se aplica a varejo de retalhos
- `ordensDeProducao` — Produção: não se aplica
- `contratos` — Contratos: não se aplica
- `produtosEstruturas` — Bill of materials: não se aplica a varejo simples
- `borderos` — Remessas bancárias: baixa prioridade
- `camposCustomizados` — Campos extras: depende do uso no Bling

---

## Ordem de implementação sugerida (por ROI)

```
Fase 1 — Financeiro básico
  1. contasReceber    ← inadimplência, aging, fluxo
  2. contasPagar      ← custos operacionais
  3. formasDePagamento (lookup)
  4. categoriasReceitasDespesas (lookup)

Fase 2 — Produtos e estoque
  5. categoriasProdutos (lookup)
  6. depositos (lookup)
  7. produtos
  8. produtosVariacoes
  9. estoques

Fase 3 — Compras e margem
  10. pedidosCompras + itens

Fase 4 — Fiscal
  11. naturezasDeOperacoes (lookup)
  12. nfes
  13. nfces

Fase 5 — Logística e equipe
  14. logisticas (lookup)
  15. logisticasRemessas
  16. vendedores
```

---

## Como marcar como concluído

Para cada módulo implementado:
1. Criar tabela Drizzle em `db/schema.ts` + rodar migration
2. Criar mapper em `lib/bling/mapper.ts`
3. Adicionar endpoint ao `app/api/bootstrap/route.ts` OU criar script dedicado
4. Rodar `scripts/import-bling-prod.ps1` (ou equivalente) contra produção
5. Marcar `[x]` neste arquivo + registrar contagem em prod (ex: `2.341 registros`)

---

_Última atualização: 2026-06-18_
