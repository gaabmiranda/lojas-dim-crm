# Spec: Seed Inicial de Cards do Kanban

**Data de referência:** 2026-07-06  
**Status:** EM EXECUÇÃO

## Objetivo

Apagar todos os cards existentes e re-popular o kanban com base no histórico real de pedidos do Bling, aplicando a régua de relacionamento retroativamente.

---

## Regras de classificação

### Base de dados
- Somente pedidos com `situacao_valor = 9` (ATENDIDO)
- Por contato: utilizar apenas o pedido MAIS RECENTE (último `COALESCE(data_saida, data) DESC`)
- `ref_date` = `COALESCE(data_saida, data)` do último pedido ATENDIDO
- `pv_date` = `ref_date + 14 dias` (data simulada do pós-venda)

### Grupo A — Pós-venda (tipo = `pos_venda`)
| Condição | Ação |
|---|---|
| `pv_date` entre 2026-07-07 e 2026-07-20 | Card pós-venda com `dataPrevistaAcao = pv_date` |

Equivale a: `ref_date` entre **2026-06-23** e **2026-07-06** (compras das últimas 2 semanas)

### Grupo B — Reativação (tipo = `reativacao`)
| Condição | Ação |
|---|---|
| `pv_date < 2026-07-07` (pós-venda já passou) | Calcular próxima data de reativação após hoje |

**Cálculo da próxima reativação:**
```
base_date  = pv_date  (quando o pós-venda "foi feito")
dias_decorridos = 2026-07-06 − base_date
n = max(ceil(dias_decorridos / 90), 1)
next_reativacao = base_date + (n × 90 dias)
```

Exemplo: último pedido em 2025-01-15 → base = 2025-01-29 → dias = 523 → n=ceil(523/90)=6 → next = 2025-01-29 + 540 = 2026-07-23

### Grupo C — Ignorados (skipped)
| Condição | Motivo |
|---|---|
| `pv_date > 2026-07-20` | Compra muito recente, fora da janela; delta sync cria no momento certo |
| Contato sem nenhum pedido ATENDIDO | Sem histórico de venda real |

---

## Segurança da execução

1. **Dry run first**: endpoint retorna contagens sem modificar dados
2. **Header obrigatório**: `x-confirm: APAGAR_TODOS` para executar de verdade
3. **Transação única**: tudo-ou-nada
4. **Preservar audit log**: eventos.card_id → NULL antes de DELETE cards
5. **Cascade**: DELETE cards apaga atividades e comentários vinculados (ON DELETE CASCADE)

---

## Checklist de execução

- [ ] Deploy do endpoint `/api/admin/seed-cards` em produção
- [ ] Executar dry_run → confirmar contagens com usuário
- [ ] Usuário aprova contagens
- [ ] Executar seed real com `x-confirm: APAGAR_TODOS`
- [ ] Verificar kanban visualmente
- [ ] Verificar n8n e delta sync continuam funcionando

---

## Endpoint

```
POST /api/admin/seed-cards

Headers:
  x-confirm: APAGAR_TODOS   (obrigatório para execução real)

Sem header x-confirm → dry_run automático
```

---

## Pós-execução

Após o seed, o delta sync continuará funcionando normalmente:
- Novos pedidos ATENDIDOS → criam cards `pos_venda` automaticamente
- Cron de transições → avança cards `finalizado` para `reativacao` D+90
