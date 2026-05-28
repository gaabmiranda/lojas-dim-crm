import { ContatosTable } from './ContatosTable';

export default function ContatosPage() {
  return (
    <div className="p-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">Contatos</h1>
        <p className="text-sm text-muted-foreground">
          Importados do Bling. Busque por nome ou telefone.
        </p>
      </header>
      <ContatosTable />
    </div>
  );
}
