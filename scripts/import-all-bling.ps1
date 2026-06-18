# Importa todos os módulos Bling para produção via /api/import
# Uso: powershell -ExecutionPolicy Bypass -File scripts/import-all-bling.ps1

$BaseUrl  = "https://crm.g7business.com"
$Secret   = "m6ACKrVj8qNX0iQqA2eOPSzh9L0n5_PT"

# Ordem importa: lookups primeiro, dependentes depois
$Modulos = @(
  # ── Lookups (sem dependência)
  "formasPagamento",
  "categoriasFinanceiras",
  "categoriasProdutos",
  "depositos",
  "naturezasOperacao",
  "logisticas",
  "vendedores",
  # ── Financeiro (depende de contatos — já importados)
  "contasReceber",
  "contasPagar",
  # ── Produtos (depende de categoriasProdutos)
  "produtos",
  # ── Estoque (depende de produtos + depositos)
  "estoques",
  # ── Compras (depende de contatos)
  "pedidosCompra",
  # ── Fiscal (depende de contatos)
  "nfe",
  "nfce",
  # ── Logística (depende de pedidos)
  "logisticasRemessas"
)

$TotalGeral = 0

foreach ($modulo in $Modulos) {
  Write-Host "`n══════════════════════════════" -ForegroundColor Cyan
  Write-Host "  $modulo" -ForegroundColor Cyan
  Write-Host "══════════════════════════════" -ForegroundColor Cyan

  $pagina   = 1
  $totalMod = 0
  $erros    = 0

  do {
    try {
      $resp = Invoke-RestMethod `
        -Method POST `
        -Uri "$BaseUrl/api/import?pagina=$pagina" `
        -Headers @{
          "X-Import-Module" = $modulo
          "X-N8N-Secret"    = $Secret
        } `
        -ContentType "application/json" `
        -TimeoutSec 120

      $totalMod += $resp.processed
      $hasNext   = $resp.nextPage -ne $null
      $proxima   = if ($hasNext) { $resp.nextPage } else { $null }

      Write-Host "  pag $pagina → $($resp.processed) registros" -ForegroundColor Green

      $pagina = $proxima
    }
    catch {
      $erros++
      Write-Host "  ERRO pag $pagina : $_" -ForegroundColor Red
      # Para no primeiro erro do módulo para não gerar loops infinitos
      break
    }
  } while ($pagina -ne $null)

  $TotalGeral += $totalMod
  $cor = if ($erros -gt 0) { "Yellow" } else { "Green" }
  Write-Host "  Total $modulo : $totalMod registros (erros: $erros)" -ForegroundColor $cor
}

Write-Host "`n╔══════════════════════════════╗" -ForegroundColor Magenta
Write-Host "  TOTAL IMPORTADO: $TotalGeral registros" -ForegroundColor Magenta
Write-Host "╚══════════════════════════════╝" -ForegroundColor Magenta
