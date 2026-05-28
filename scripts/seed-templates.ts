/**
 * Popula templates_mensagem com os 4 templates iniciais.
 * Conteúdo é placeholder — Gabriel deve revisar via tela /config (Open Question PRD §10).
 */
import 'dotenv/config';
import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '../db/client';
import { templatesMensagem } from '../db/schema';

interface TemplateSeed {
  key: string;
  descricao: string;
  conteudo: string;
}

const TEMPLATES: TemplateSeed[] = [
  {
    key: 'pos_venda_d14',
    descricao: 'Mensagem D+14 após entrega do pedido.',
    conteudo: [
      'Oi {{nome_cliente}}, tudo bem? 😊',
      '',
      'Aqui é da Lojas Dim. Faz uns 14 dias que você recebeu seu pedido com {{primeiro_item}}.',
      '',
      'Está tudo certo? Qualquer coisa que precise, é só me chamar por aqui.',
    ].join('\n'),
  },
  {
    key: 'reativacao_1',
    descricao: 'Primeira tentativa de reativação (D+90 após pós-venda).',
    conteudo: [
      'Olá {{nome_cliente}}! Aqui é da Lojas Dim. 👋',
      '',
      'Faz um tempinho que não te vejo por aqui. Chegou retalho novo essa semana que combina com o que você levou da última vez.',
      '',
      'Quer dar uma olhada?',
    ].join('\n'),
  },
  {
    key: 'reativacao_2',
    descricao: 'Segunda tentativa (mais 90d depois da primeira).',
    conteudo: [
      'Oi {{nome_cliente}}, sumido(a)! 🙂',
      '',
      'Estamos com novidades na loja. Posso te mandar algumas opções pra dar uma olhada sem compromisso?',
    ].join('\n'),
  },
  {
    key: 'reativacao_3',
    descricao: 'Terceira e última tentativa antes de arquivar.',
    conteudo: [
      'Oi {{nome_cliente}}, é da Lojas Dim. ✨',
      '',
      'Última chamada pra esse mês — se quiser, te mando uma seleção das melhores peças que chegaram. Caso prefira, me avisa que pauso os contatos por aqui.',
    ].join('\n'),
  },
];

async function main() {
  for (const t of TEMPLATES) {
    await db
      .insert(templatesMensagem)
      .values(t)
      .onConflictDoUpdate({
        target: templatesMensagem.key,
        set: {
          descricao: t.descricao,
          conteudo: t.conteudo,
          atualizadoEm: drizzleSql`now()`,
        },
      });
  }
  console.log(`✓ ${TEMPLATES.length} templates upserted: ${TEMPLATES.map((t) => t.key).join(', ')}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Falha:', err);
    process.exit(1);
  });
