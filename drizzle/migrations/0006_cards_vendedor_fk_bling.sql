-- cards.vendedor_id agora referencia vendedores_bling.id (não usuarios.id)
-- Todos os cards tinham vendedor_id NULL (mapping nunca foi executado), sem conflito de dados.
ALTER TABLE "cards" DROP CONSTRAINT IF EXISTS "cards_vendedor_id_usuarios_id_fk";
ALTER TABLE "cards" ADD CONSTRAINT "cards_vendedor_id_vendedores_bling_id_fk"
  FOREIGN KEY ("vendedor_id") REFERENCES "vendedores_bling"("id");
