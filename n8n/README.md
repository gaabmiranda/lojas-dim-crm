# n8n Workflows — CRM Lojas Dim

5 workflows que orquestram automações do CRM. Cada um é um cron simples que chama um endpoint do CRM. **Lógica de transição mora no CRM**, não no n8n (Spec §"Decisões técnicas tomadas aqui" #6 e #15).

## Variáveis de ambiente esperadas no n8n

| Var | Valor |
|-----|-------|
| `CRM_BASE_URL` | URL pública do CRM (ex: `https://crm.lojasdim.com.br`) |
| `N8N_SHARED_SECRET` | Mesmo valor que `N8N_SHARED_SECRET` no `.env` do CRM |

## Workflows

### `01-bling-delta-poll.json` — Polling Bling a cada 5min

- **Trigger:** Schedule, 5 minutos, TZ `America/Sao_Paulo`
- **HTTP Request:** `POST {CRM_BASE_URL}/api/sync/bling/delta`
  - Header: `X-N8N-Secret: {{ $env.N8N_SHARED_SECRET }}`
  - Body: vazio (o CRM consulta `BLING_LAST_SYNC_AT` em feature_flags)

### `02-cron-d14-pendente-para-contato.json` — Diário 8h BRT

- **Trigger:** Schedule, cron `0 8 * * *`, TZ `America/Sao_Paulo`
- **HTTP Request:** `POST {CRM_BASE_URL}/api/cron/transitions`
  - Header: `X-N8N-Secret`
  - Body: `{ "tipo": "d14" }`

### `03-cron-48h-sem-resposta.json` — Diário 9h BRT

- Mesmo endpoint, body: `{ "tipo": "sem_resposta" }`

### `04-cron-d90-reativacao.json` — Diário 10h BRT

- Body: `{ "tipo": "reativacao" }`

### `05-cron-arquivar-reativacao-3x.json` — Diário 11h BRT

- Body: `{ "tipo": "arquivar" }`

## Conferindo timezone

```bash
docker exec n8n cat /etc/timezone
# deve retornar "America/Sao_Paulo"
```

Cada workflow declara explicitamente TZ no node Schedule. Container do n8n deve rodar com `TZ=America/Sao_Paulo` (Spec risco "Cron n8n em UTC").

## Como exportar/importar

1. Após editar workflow no UI do n8n, clique em "..." → "Download" → JSON.
2. Salve em `n8n/workflows/NN-nome.json` no repo.
3. Commit. Versionamos os JSONs aqui.
4. No n8n destino: Menu → "Import from File" → seleciona o JSON.

## Teste manual

Pra disparar um workflow sem esperar o cron:

```bash
curl -X POST https://crm.lojasdim.com.br/api/cron/transitions \
  -H "X-N8N-Secret: $N8N_SHARED_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"tipo": "d14"}'
```

Resposta esperada: `{ ok: true, tipo, processados, aplicados, pulados }`.
