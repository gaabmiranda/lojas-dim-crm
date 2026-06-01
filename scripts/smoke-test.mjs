/**
 * Smoke test visual do CRM em produção.
 * Abre Chrome em modo visível, aguarda login manual, depois captura
 * screenshots de /kanban, /contatos, /config, /notificacoes.
 *
 * Uso: node scripts/smoke-test.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS = join(__dirname, '..', 'smoke-screenshots');
mkdirSync(SCREENSHOTS, { recursive: true });

const BASE = 'https://crm.g7business.com';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function shot(page, name, description) {
  const path = join(SCREENSHOTS, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  console.log(`  📸 ${description} → smoke-screenshots/${name}.png`);
  return path;
}

async function main() {
  console.log('Abrindo Chrome...');
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: false,
    args: ['--start-maximized'],
  });

  const ctx = await browser.newContext({ viewport: null });
  const page = await ctx.newPage();

  // 1. Login
  console.log('\n[1] Navegando para /login...');
  await page.goto(`${BASE}/login`);
  await shot(page, '01-login', 'Página de login');

  console.log('  ⏳ Aguardando você fazer login (até 3min)...');
  // Aguarda qualquer URL que não seja /login
  await page.waitForFunction(
    () => !window.location.pathname.startsWith('/login'),
    null,
    { timeout: 180_000 }
  );
  const currentUrl = page.url();
  console.log(`  ✅ Login detectado — agora em: ${currentUrl}`);
  // Se caiu na raiz, aguarda redirect para /kanban
  if (currentUrl === BASE + '/' || currentUrl === BASE) {
    await page.waitForURL(`${BASE}/kanban`, { timeout: 10_000 }).catch(() => {});
  }

  // 2. Kanban
  console.log('\n[2] Verificando /kanban...');
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await shot(page, '02-kanban', 'Kanban board');

  // Contar colunas visíveis
  const colunas = await page.locator('[data-coluna], .kanban-coluna, [class*="coluna"]').count();
  const h2s = await page.locator('h2, h3').allInnerTexts();
  console.log(`  colunas encontradas: ${colunas}, headings: ${h2s.slice(0, 6).join(' | ')}`);

  // 3. Contatos
  console.log('\n[3] Navegando para /contatos...');
  await page.goto(`${BASE}/contatos`);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await shot(page, '03-contatos', 'Lista de contatos');

  const texto = await page.locator('body').innerText();
  const temContatos = /contato|cliente|nome/i.test(texto);
  console.log(`  tem dados de contatos: ${temContatos}`);

  // 4. Config
  console.log('\n[4] Navegando para /config...');
  await page.goto(`${BASE}/config`);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await shot(page, '04-config', 'Página de configurações');

  const configTexto = await page.locator('body').innerText();
  const temFlags = /IA_AGENTS|BLING_WEBHOOK|BLING_POLLING/i.test(configTexto);
  const temTemplates = /pos_venda|reativacao|template/i.test(configTexto);
  console.log(`  feature flags visíveis: ${temFlags}`);
  console.log(`  templates visíveis: ${temTemplates}`);

  // 5. Notificações
  console.log('\n[5] Navegando para /notificacoes...');
  await page.goto(`${BASE}/notificacoes`);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await shot(page, '05-notificacoes', 'Página de notificações');

  // 6. Detalhe de contato (primeiro da lista)
  console.log('\n[6] Voltando a /contatos para verificar detalhe...');
  await page.goto(`${BASE}/contatos`);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  const primeiroLink = page.locator('a[href*="/contatos/"], tr a, td a').first();
  if (await primeiroLink.count()) {
    await primeiroLink.click();
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await shot(page, '06-contato-detalhe', 'Detalhe de contato');
  }

  console.log('\n✅ Smoke tests concluídos.');
  console.log(`   Screenshots em: ${SCREENSHOTS}`);
  console.log('\nPressione Ctrl+C para fechar o browser.');

  // Mantém browser aberto para inspeção manual
  await new Promise(() => {});
}

main().catch((err) => {
  console.error('FALHOU:', err.message);
  process.exit(1);
});
