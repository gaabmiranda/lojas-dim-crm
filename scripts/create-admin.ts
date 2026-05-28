/**
 * Cria primeiro usuário admin.
 * Uso: `npm run seed:admin -- --email=gabriel@lojasdim.com.br --nome="Gabriel" --senha=trocar123 [--telefone=38999998888]`
 * Critério de aceite: usuário consegue logar em /login após rodar.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '../db/client';
import { usuarios } from '../db/schema';

interface Args {
  email: string;
  nome: string;
  senha: string;
  telefone?: string;
  role: 'admin' | 'vendedor';
}

function parseArgs(): Args {
  const flags = new Map<string, string>();
  for (const arg of process.argv.slice(2)) {
    const m = /^--([^=]+)=(.+)$/.exec(arg);
    if (m) flags.set(m[1]!, m[2]!);
  }
  const email = flags.get('email');
  const nome = flags.get('nome');
  const senha = flags.get('senha');
  if (!email || !nome || !senha) {
    console.error('Uso: npm run seed:admin -- --email=X --nome=Y --senha=Z [--telefone=...] [--role=admin|vendedor]');
    process.exit(1);
  }
  const role = (flags.get('role') as Args['role']) ?? 'admin';
  if (role !== 'admin' && role !== 'vendedor') {
    console.error('--role deve ser admin ou vendedor');
    process.exit(1);
  }
  return { email, nome, senha, telefone: flags.get('telefone'), role };
}

async function main() {
  const args = parseArgs();
  const senhaHash = await bcrypt.hash(args.senha, 10);

  const inserted = await db
    .insert(usuarios)
    .values({
      email: args.email,
      nome: args.nome,
      senhaHash,
      role: args.role,
      telefone: args.telefone,
      ativo: true,
    })
    .onConflictDoUpdate({
      target: usuarios.email,
      set: {
        nome: args.nome,
        senhaHash,
        role: args.role,
        telefone: args.telefone,
        ativo: true,
      },
    })
    .returning({ id: usuarios.id, email: usuarios.email });

  console.log(`✓ Usuário ${inserted[0]!.email} (id ${inserted[0]!.id}) criado/atualizado como ${args.role}.`);
  // Silenciar warning sobre conexão pendente.
  void drizzleSql;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Falha:', err);
    process.exit(1);
  });
