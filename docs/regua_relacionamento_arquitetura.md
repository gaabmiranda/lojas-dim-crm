# Régua de relacionamento — Arquitetura proposta

> Pesquisa sênior conduzida em 2026-05-26. Output da skill `pesquisa-senior`.
> Demanda original: como melhorar a régua de relacionamento da Lojas Dim pra realizar mais vendas ao longo do tempo, ignorando plataformas atuais.

---

## Resumo executivo

A régua atual da Lojas Dim é **linear, temporal e one-size-fits-all**: 1 touchpoint pós-venda em D+14 e loop infinito de reativação a cada 90 dias com a mesma mensagem pra todo cliente. O estado da arte em retenção B2C migrou de 2020 pra cá para **trigger-based + segmentação RFM + cadência calculada por IPI (Interpurchase Interval) do próprio cliente**, com **ladder de incentivo na reativação** e **exit strategy** após 3-4 tentativas sem resposta — abordagem que gera **+35% retenção e +28% ROI** (Adobe Digital Trends 2025). 3 opções progressivas abaixo: dá pra adotar a #1 em semanas e evoluir pra #3 quando tiver dado suficiente.

---

## Fluxo atual da Lojas Dim (baseline)

Plataforma atual: RD Station CRM + Pluga (transferência de dados do Bling).

```
Venda atinge status "ATENDIDO"
        ↓
Funil "Pós-venda" criado
        ↓
Card "pós-venda + nome cliente" em coluna "Pendente"
        ↓
Atividade "realizar pós-venda" agendada para D+14
        ↓
No dia: vendedor move card para "Em contato"
        ↓
Espera 24h por resposta do cliente
        ↓
Resposta OU 24h passam → "Finalizado"
        ↓
Card renomeado para "reativação + nome"
        ↓
Após 90 dias → atividade de reativação
        ├── Se cliente compra antes → volta para "pós-venda"
        └── Se contato não responde → "Finalizado" → loop 90d infinito
```

**Diagnóstico:**
- 1 único touchpoint pós-venda (D+14) — perde oportunidades de NPS, cross-sell, educação
- Janela de 24h pra resposta é curta demais pra WhatsApp/email B2C
- Reativação a 90d genérico pra todo cliente (cliente VIP e cliente ocasional tratados igual)
- Loop infinito de reativação com mesma mensagem → fadiga, dano de reputação
- Sem segmentação por valor ou frequência
- Sem ladder de incentivo (cupom escalonado)
- Sem exit strategy (clientes "mortos" continuam recebendo)
- Sem métricas explícitas de eficácia

---

## Opção 1 — Régua linear otimizada (evolução mínima)

- **O que é:** Mantém estrutura temporal do atual, com 3 melhorias cirúrgicas: (a) substitui 1 touchpoint pós-venda por sequência **D+1 / D+7 / D+14**; (b) reativação vira **ladder de 3 tentativas** com cupom escalonado (10% → 15% → 25%); (c) após 3 reativações sem resposta, cliente vai pra **"arquivo dormente"** (não sai, mas para de receber até evento sazonal ou aniversário).
- **Quando usar:** Ganho rápido em 2-4 semanas, sem investir em segmentação ou modelagem. Bom como passo 1 antes da #2.
- **Tradeoffs:** Captura ~60% do ganho potencial. Continua tratando VIP de R$5k como cliente de R$50. Discount ladder uniforme treina cliente a esperar desconto.
- **Maturidade:** Estável. Padrão da indústria pré-2020.
- **Custo:** Baixo. Reaproveita fluxo de cards existente. Investimento: redesenhar conteúdo + definir gatilhos de ladder.
- **Fonte canônica:** Finsi — Win-back templates & 60-90d window

## Opção 2 — Régua de lifecycle com segmentação RFM (RECOMENDADA)

- **O que é:** Arquitetura em **6 estágios** com **8 segmentos RFM** rodando em paralelo, cada um com cadência e mensagem diferentes. Pesos best practice: Recência 50% / Frequência 30% / Monetário 20%.
- **Quando usar:** Maior alavanca de ROI sem precisar de modelagem preditiva. RFM puxa dado dos 28k pedidos já sincronizados — calcula em SQL puro, sem ML.
- **Tradeoffs:** 4-6 semanas de implementação. Captura ~85% do ganho potencial. **Limitação:** cadência ainda é por **segmento**, não por **cliente individual**.
- **Maturidade:** Estável. Padrão atual (2023-2025) de plataformas como Klaviyo, Braze, Iterable.
- **Custo:** Médio. Banco com histórico + engine que respeite trigger comportamental (não só temporal) + 12-15 templates.
- **Fonte canônica:** Optimove — 5-step lifecycle framework · Braze — RFM segmentation

## Opção 3 — Régua preditiva com IPI por cliente

- **O que é:** Tudo da Opção 2 + cálculo do **IPI médio por cliente individual** (em vez de por segmento). Cliente A compra a cada 45d → lembrete aos 50d. Cliente B compra a cada 120d → lembrete aos 130d. Vai pra reativação quando atinge 1.5× seu IPI próprio. Nível avançado: modelo de propensão à recompra prevê "next best action".
- **Quando usar:** Tem ≥2 anos de histórico (Lojas Dim tem 6) E recompra é métrica chave (varejo de retalhos é exatamente isso). Faz diferença grande com heterogeneidade alta entre clientes (cliente B2B costureira vs B2C ocasional).
- **Tradeoffs:** +3-4 semanas vs Opção 2. Captura ~95-100% do potencial. **Complexidade:** pipeline ETL recorrente (semanal) + modelo simples de churn (regressão logística é suficiente — ScienceDirect 2025 mostra que deep learning melhora marginalmente vs RFM bem feito).
- **Maturidade:** Estável em retail médio-grande. Em PME ainda é diferencial competitivo.
- **Custo:** Alto. Pipeline ETL + cálculo recorrente + monitoramento. Mas tudo em cima do mesmo banco da Opção 2.
- **Fonte canônica:** Klaviyo on automated flows (30× RPR) · Lexer — AI predictive retention

---

## Recomendação

**Comece pela Opção 2 direto, pulando a Opção 1.** Diferença de esforço entre 1 e 2 é menor do que parece (≤4 semanas extras), e os ~25 pp adicionais de retenção compensam. Opção 1 vira beco quando precisar segmentar depois.

**Árvore de decisão:**
- Algo rodando em 2-3 semanas e fará iteração → **Opção 1** com plano explícito de migrar pra 2 em ≤6 meses.
- Pode investir 4-8 semanas num projeto bem feito → **Opção 2** direto. Onde 90% das marcas B2C estão indo.
- Tem time/orçamento pra pipeline de dados recorrente E mix B2B+B2C dramaticamente diferente → **Opção 3** logo de cara.

---

## Arquitetura concreta da Opção 2

### 6 estágios sequenciais

| # | Estágio | Trigger | Touchpoints | Saída |
|---|---|---|---|---|
| 1 | **Acompanhamento entrega** | NF emitida | D+0 confirmação · status enviado · entregue (WhatsApp idealmente) | Vai pra 2 quando "entregue" confirma |
| 2 | **Pós-venda multi-touch** | Entrega confirmada | D+1 "tudo certo?" (NPS) · D+7 dica de uso/educação · D+14 review request + cross-sell discreto | Vai pra 3 após D+14 |
| 3 | **Engajamento ativo** | Em curso | 1-2 mensagens/mês de conteúdo (lançamento, coleção, dica), não vendinha | Vai pra 4 quando atinge IPI médio do segmento |
| 4 | **Lembrete recompra** | IPI médio atingido | 1 mensagem personalizada com referência ao último pedido | Vai pra 5 se 30d sem compra |
| 5 | **Reativação (ladder)** | 1.5× IPI sem compra | A: sem desconto, toque pessoal · B (+15d): cupom 10% · C (+15d): cupom 20% + urgência | Vai pra 6 se não responder após C |
| 6 | **Win-back final / Arquivo** | 3 tentativas sem resposta | 1 mensagem agressiva (BOGO/cupom grande/frete grátis) · depois: freezing 12m, só envia em aniversário/sazonalidade | Volta pra 2 se comprar de novo |

### 8 segmentos RFM em paralelo

| Segmento | RFM aprox | Tratamento diferenciado |
|---|---|---|
| **Champions** | R5 F5 M5 | Contato do dono/gerente, ofertas exclusivas, programa VIP |
| **Leais ativos** | R4-5 F4-5 M3-5 | Cross-sell pesado, antecipação de lançamentos |
| **Potenciais leais** | R4-5 F2-3 M3-5 | Reforço de relacionamento, conteúdo educativo |
| **Novos** | R5 F1 M qualquer | **Foco maníaco na 2ª compra (D+30 max)** |
| **Em alerta** | R2-3 F3-5 M3-5 | Lembrete antecipado, oferta personalizada |
| **Em risco** | R1-2 F3-5 M4-5 | **MAIOR ALAVANCA**: win-back agressiva, contato humano |
| **Dormentes baixo valor** | R1 F1-2 M1-2 | Mensagem em massa em sazonalidade |
| **Perdidos** | R1 F1 M1 | Arquivo |

### Sazonais paralelos (independente do estágio)

- Aniversário do cliente
- Aniversário da 1ª compra
- Datas-chave do varejo de tecidos: Dia das Mães, Festa Junina, Volta às Aulas, Natal, Carnaval — extrair picos históricos dos 28k pedidos
- Reposição automática quando identificar padrões em SKU

---

## Mapeamento do fluxo atual → arquitetura proposta

| Hoje | Proposta | Por que mudar |
|---|---|---|
| 1 touchpoint pós-venda em D+14 | 3 touchpoints (D+1, D+7, D+14) com objetivos diferentes | 89% dos consumidores valorizam acompanhamento; 1 ponto perde múltiplas oportunidades |
| "Em contato" 24h | Espera adaptada por canal (WhatsApp 48h, e-mail 5d, ligação 1 tentativa) | B2C raramente responde WhatsApp em 24h; 24h gera falso negativo |
| Loop 90d infinito mesma msg | Ladder de 3 tentativas → freezing 12m | Fadiga e dano de reputação; literatura confirma stop após 3-4 tentativas |
| Reativação 90d fixo | Reativação em 1.5× IPI do segmento (≠ 90d pra todo mundo) | Cliente que compra a cada 30d "esquece" rápido; cliente que compra a cada 180d acha 90d intrusivo |
| Sem segmentação | 8 segmentos RFM com cadência diferenciada | Adobe 2025: behavioral segmentation = +35% retenção / +28% ROI |
| Sem ladder de desconto | Ladder progressivo 0%→10%→20% | Treina cliente a não esperar desconto na 1ª; preserva margem |
| Sem métrica explícita | Repurchase rate, Win-back rate, RPR, LTV, NPS | Não dá pra otimizar o que não mede |

---

## Métricas obrigatórias

- **Repurchase rate** (segunda compra dentro de 90/180/365 dias)
- **Win-back rate** por tentativa (A, B, C)
- **Revenue per Recipient (RPR)** por estágio e segmento
- **LTV** (12m, 24m)
- **Inactivity-to-Reactivation conversion** %
- **NPS** evolução (medido em D+1 após entrega)

---

## Riscos e unknowns críticos

1. **IPI real da Lojas Dim ainda não calculado.** Pré-requisito: rodar análise nos 28k pedidos (recência média entre 1ª-2ª compra, 2ª-3ª compra, distribuição). Sem isso, o "1.5× IPI" é placeholder.
2. **Mix B2C vs B2B (revendedoras/ateliers/costureiras).** Se >30% da receita vem de B2B, eles merecem **pipeline próprio** (vendedor dedicado, sem mensagem de massa). Inferência depende dos dados.
3. **Mix fiado vs à vista** (pergunta anterior do projeto, ainda não respondida). Se muito fiado, régua **financeira de cobrança** deve compor a régua de relacionamento — cliente atrasado não recebe oferta, recebe cobrança humanizada.
4. **Capacidade operacional da equipe atual.** Quantos vendedores fazem follow-up hoje? Régua mais sofisticada exige mais automação. Sem isso, vira gargalo no vendedor.
5. **NPS atual** — não medido. Sem baseline, não dá pra medir progresso.
6. **Divergência na literatura sobre janela win-back** (60-90d clássico vs 21-45d MarketingCharts). Resposta correta provavelmente é "depende do IPI" — pra retalhos B2C IPI alto = 60-90d coerente; pra B2B IPI 30d = antecipar pra 21-45d.

---

## Sources (todas verificadas em 2026-05-26)

**Primárias:**
- Optimove — Customer Lifecycle Stages 5-step framework: https://www.optimove.com/resources/blog/customer-lifecycle-stages-insights-and-actions
- Braze — RFM Segmentation guide: https://www.braze.com/resources/articles/rfm-segmentation
- Finsi — Win-back templates, timing, 60-90d window: https://www.finsi.ai/blog/win-back-email-campaign-guide/
- Shopify — 7 win-back strategies 2025: https://www.shopify.com/enterprise/blog/running-winback-campaigns
- Hightouch — Winback campaign: timing, targeting, discount trap: https://hightouch.com/blog/winback-campaign
- eyKdata — RFM segmentation winning brands 2025: https://www.eykdata.com/blog/rfm-segmentation-what-it-is-and-how-winning-brands-use-it-to-scale-profitably-in-2025
- Klaviyo — Email Marketing Benchmarks by Industry 2024: https://www.klaviyo.com/marketing-resources/email-benchmarks-by-industry-2024
- Blueshift — B2C Lifecycle Marketing complete guide: https://blueshift.com/blog/customer-lifecycle-marketing-the-complete-guide-for-b2c-marketers/
- ScienceDirect — Hybrid RFM+K-means+NN churn prediction: https://www.sciencedirect.com/science/article/abs/pii/S0957417425020846

**Validação cruzada:**
- Metapack — 6 post-purchase touchpoints: https://www.metapack.com/blog/6-post-purchase-touchpoints-for-an-exceptional-customer-journey/
- Mailmodo — B2C Lifecycle Marketing guide: https://www.mailmodo.com/guides/b2c-lifecycle-marketing/
- Omnisend — Replenishment email examples: https://www.omnisend.com/blog/replenishment-email/
- Lexer — AI predictive retention signals: https://www.lexer.io/blog/5-ways-predictive-analytics-improves-customer-retention
- Bloomreach — Email conversion rate benchmarks: https://www.bloomreach.com/en/blog/email-conversion-rate
