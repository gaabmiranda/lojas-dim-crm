import { asc } from 'drizzle-orm';
import { db } from '@/db/client';
import { usuarios, vendedoresBling } from '@/db/schema';
import { VendedorMapeamento } from './VendedorMapeamento';

export async function VendedoresTab() {
  const [vbs, users] = await Promise.all([
    db
      .select({
        id: vendedoresBling.id,
        idBling: vendedoresBling.idBling,
        contatoNome: vendedoresBling.contatoNome,
        usuarioId: vendedoresBling.usuarioId,
      })
      .from(vendedoresBling)
      .orderBy(asc(vendedoresBling.contatoNome)),
    db
      .select({ id: usuarios.id, nome: usuarios.nome })
      .from(usuarios)
      .orderBy(asc(usuarios.nome)),
  ]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Associe cada vendedor do Bling a um usuário do CRM. Após salvar, novos pedidos e cards
        herdarão o vendedor automaticamente. Use o backfill para atualizar os cards já existentes.
      </p>
      <VendedorMapeamento vendedores={vbs} usuarios={users} />
    </div>
  );
}
