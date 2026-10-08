# Quick Start Guide - WRRJ CRM

Guia rápido para começar a desenvolver no WRRJ CRM.

## Pré-requisitos

- Node.js 18+ com npm
- Git
- VS Code (recomendado)
- Conta Google para Firebase

## Setup Inicial

### 1. Clonar e Instalar

```bash
git clone <repo-url>
cd crmnew
npm install
```

### 2. Variáveis de Ambiente

Criar arquivo `.env.local` na raiz do projeto:

```env
# Copie .env.example para .env.local e substitua apenas os marcadores.
# Nunca salve o JSON da conta de servico no repositorio.
```

### 3. Iniciar Servidor de Desenvolvimento

```bash
npm run dev
```

Acessar `http://localhost:3000`

## Estrutura de Código

### Criar Nova Página

1. Criar arquivo em `src/app/dashboard/[pagina]/page.tsx`
2. Importar componentes necessários
3. Usar Server Components quando possível
4. Client Components apenas quando precisar de interatividade

Exemplo:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { fetchAllCustomers } from '@/lib/customer-service';

export default function MyPage() {
  const [data, setData] = useState([]);
  
  useEffect(() => {
    async function load() {
      const customers = await fetchAllCustomers();
      setData(customers);
    }
    load();
  }, []);
  
  return (
    <div className="space-y-6">
      {/* Seu conteúdo aqui */}
    </div>
  );
}
```

### Criar Novo Serviço

1. Criar arquivo em `src/lib/[service]-service.ts`
2. Importar Firestore
3. Definir tipos/interfaces
4. Implementar CRUD

Exemplo:

```typescript
import { db } from './firebase';
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';

export interface MyData {
  id: string;
  name: string;
  // ... outros campos
}

export async function fetchAllMyData(): Promise<MyData[]> {
  const snapshot = await getDocs(collection(db, 'myCollection'));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MyData));
}

export async function createMyData(data: Omit<MyData, 'id'>) {
  const docRef = await addDoc(collection(db, 'myCollection'), data);
  return docRef.id;
}

export async function updateMyData(id: string, data: Partial<MyData>) {
  await updateDoc(doc(db, 'myCollection', id), data);
}

export async function deleteMyData(id: string) {
  await deleteDoc(doc(db, 'myCollection', id));
}
```

### Adicionar Validação Zod

Em `src/lib/schemas.ts`:

```typescript
import { z } from 'zod';

export const myDataSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  email: z.string().email('Email inválido'),
  // ... outros campos
});

export type MyData = z.infer<typeof myDataSchema>;
```

### Criar Formulário com React Hook Form

```typescript
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { myDataSchema } from '@/lib/schemas';
import { createMyData } from '@/lib/my-service';

export function MyForm() {
  const form = useForm({
    resolver: zodResolver(myDataSchema),
    defaultValues: {
      name: '',
      email: '',
    },
  });

  async function onSubmit(data: typeof myDataSchema._type) {
    try {
      await createMyData(data);
      toast.success('Criado com sucesso!');
    } catch (error) {
      toast.error('Erro ao criar');
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <input
        {...form.register('name')}
        placeholder="Nome"
        className="w-full rounded-lg border px-3 py-2"
      />
      {form.formState.errors.name && (
        <p className="text-red-500 text-sm">{form.formState.errors.name.message}</p>
      )}
      
      <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-white">
        Enviar
      </button>
    </form>
  );
}
```

## Componentes Comuns

### Cards de Métrica

```typescript
import { MetricCard } from '@/components/metric-card';
import { Package2 } from 'lucide-react';

<MetricCard
  label="Total de Vendas"
  value="R$ 45.320,00"
  comparison="+12% vs. mês anterior"
  icon={<Package2 className="h-5 w-5" />}
  color="emerald"
/>
```

### Botões

```typescript
import { Button } from '@/components/ui/button';

<Button>Ação Padrão</Button>
<Button variant="secondary">Secundário</Button>
<Button variant="destructive">Deletar</Button>
```

### Dialog/Modal

```typescript
import { Dialog } from '@/components/ui/dialog';
import { useState } from 'react';

export function MyModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir</button>
      
      <Dialog open={open} onOpenChange={setOpen}>
        <div className="p-6">
          <h2 className="text-lg font-semibold">Título</h2>
          <p>Conteúdo</p>
          <button onClick={() => setOpen(false)}>Fechar</button>
        </div>
      </Dialog>
    </>
  );
}
```

## Filtros e Busca

Padrão para implementar filtros:

```typescript
'use client';

import { useState, useMemo } from 'react';

export function MyList() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [data, setData] = useState([]);

  const filtered = useMemo(() => {
    return data.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === 'all' || item.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [data, searchTerm, filterStatus]);

  return (
    <div className="space-y-4">
      <input
        type="text"
        placeholder="Buscar..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full rounded-lg border px-3 py-2"
      />

      <select
        value={filterStatus}
        onChange={(e) => setFilterStatus(e.target.value)}
        className="w-full rounded-lg border px-3 py-2"
      >
        <option value="all">Todos</option>
        <option value="active">Ativos</option>
        <option value="inactive">Inativos</option>
      </select>

      <ul className="space-y-2">
        {filtered.map(item => (
          <li key={item.id} className="rounded-lg border p-3">
            {item.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

## Notificações (Sonner)

```typescript
import { toast } from 'sonner';

// Sucesso
toast.success('Operação realizada!');

// Erro
toast.error('Algo deu errado');

// Info
toast.info('Informação importante');

// Custom
toast.custom((t) => (
  <div className="bg-white p-4 rounded-lg">
    Mensagem customizada
  </div>
));
```

## Debugging

### Logs no Console

```typescript
console.log('Debug:', variavel);
console.error('Erro:', erro);
console.table(arrayDeObjetos);
```

### React DevTools

Instalar extensão no Chrome/Firefox.

### Firestore Console

Acessar `https://console.firebase.google.com` para ver dados em tempo real.

## Commits e Push

```bash
# Ver status
git status

# Adicionar arquivos
git add .

# Commit
git commit -m "feat: descrição curta da mudança"

# Push
git push origin main
```

Convenções de commit:
- `feat:` Nova funcionalidade
- `fix:` Correção de bug
- `docs:` Atualização de documentação
- `refactor:` Refatoração de código
- `style:` Mudanças de estilo (sem lógica)
- `chore:` Atualizações de dependências

## Testes

```bash
# Rodar testes
npm test

# Watch mode
npm test -- --watch
```

## Build e Deploy

### Build Local

```bash
npm run build
npm start
```

### Deploy no Vercel

```bash
vercel
```

Ou push para main branch (auto-deploy).

## Recursos Úteis

- [Next.js Docs](https://nextjs.org/docs)
- [Firebase Docs](https://firebase.google.com/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Zod Docs](https://zod.dev)
- [React Hook Form](https://react-hook-form.com)
- [Recharts](https://recharts.org)

## Problemas Comuns

### "Cannot find module '@/lib/...'"

Verificar se:
1. Arquivo existe em `src/lib/`
2. Caminho está correto (sem extensão .ts)
3. tsconfig.json tem baseUrl e paths configurados

### Firestore retorna undefined

1. Verificar se coleção existe no Firebase
2. Usar console.log para debug
3. Verificar regras de segurança (Security Rules)

### Componente não renderiza após mudanças

1. Salvar arquivo (Ctrl+S)
2. Verificar console para erros
3. Se estiver em async/background, aguardar compilação

### "Hydration mismatch"

Causa: Server e Client renderizam diferente. Solução: Usar `'use client'` no componente.

## Perguntas?

Consultar documentação em TECHNICAL.md para detalhes arquiteturais.
