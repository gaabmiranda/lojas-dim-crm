'use client';

import { useState } from 'react';

interface BatchResult {
  processados: number;
  comItens: number;
  semItensNoBling: number;
  erros: number;
  remaining: number;
}

export function ImportacaoTab({ semItensInicial }: { semItensInicial: number }) {
  const [rodando, setRodando] = useState(false);
  const [remaining, setRemaining] = useState(semItensInicial);
  const [total] = useState(semItensInicial);
  const [resultados, setResultados] = useState<BatchResult[]>([]);
  const [concluido, setConcluido] = useState(false);

  const acumulado = resultados.reduce(
    (acc, r) => ({
      processados: acc.processados + r.processados,
      comItens: acc.comItens + r.comItens,
      semItensNoBling: acc.semItensNoBling + r.semItensNoBling,
      erros: acc.erros + r.erros,
    }),
    { processados: 0, comItens: 0, semItensNoBling: 0, erros: 0 },
  );

  async function iniciar() {
    setRodando(true);
    setConcluido(false);
    let rem = remaining;

    while (rem > 0) {
      try {
        const resp = await fetch('/api/admin/pedidos/backfill-itens', { method: 'POST' });
        if (!resp.ok) break;
        const data: BatchResult = await resp.json();
        setResultados((prev) => [...prev, data]);
        setRemaining(data.remaining);
        rem = data.remaining;
        if (data.processados === 0) break; // sem candidatos, encerrar
      } catch {
        break;
      }
    }

    setRodando(false);
    setConcluido(true);
  }

  const pct = total > 0 ? Math.round(((total - remaining) / total) * 100) : 100;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-medium mb-1">Backfill de itens de pedido</h2>
        <p className="text-sm text-muted-foreground">
          Pedidos importados via sincronização em lista não contêm o detalhe dos itens. Este processo
          busca cada pedido individualmente no Bling para preencher os itens (descrição, quantidade,
          valor). A taxa da API é de 2 req/s — processa 30 pedidos por lote (~15 s cada).
        </p>
      </div>

      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm">
            Pendentes: <strong>{remaining.toLocaleString('pt-BR')}</strong>
            {total > 0 && ` de ${total.toLocaleString('pt-BR')}`}
          </span>
          {total > 0 && (
            <span className="text-sm text-muted-foreground">{pct}% concluído</span>
          )}
        </div>

        {total > 0 && (
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}

        <button
          onClick={iniciar}
          disabled={rodando || remaining === 0}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm disabled:opacity-50"
        >
          {rodando
            ? `Buscando… (restam ${remaining.toLocaleString('pt-BR')})`
            : remaining === 0
            ? 'Concluído — sem pendências'
            : `Iniciar backfill (${remaining.toLocaleString('pt-BR')} pedidos)`}
        </button>

        {concluido && !rodando && (
          <p className="text-sm text-green-600">
            Processo concluído. Restam {remaining.toLocaleString('pt-BR')} pendências.
          </p>
        )}
      </div>

      {acumulado.processados > 0 && (
        <div className="border rounded-lg p-4 text-sm space-y-1">
          <p className="font-medium mb-2">Resultado acumulado desta sessão</p>
          <p>Pedidos verificados: <strong>{acumulado.processados.toLocaleString('pt-BR')}</strong></p>
          <p>Com itens importados: <strong>{acumulado.comItens.toLocaleString('pt-BR')}</strong></p>
          <p>Sem itens no Bling: <strong>{acumulado.semItensNoBling.toLocaleString('pt-BR')}</strong></p>
          <p>Erros: <strong>{acumulado.erros}</strong></p>
        </div>
      )}
    </div>
  );
}
