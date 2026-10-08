# Documentação Técnica - WRRJ CRM

Informações arquiteturais e de desenvolvimento para o WRRJ CRM.

## Stack Tecnológico

- **Framework**: Next.js 16.2.9 com Turbopack
- **Linguagem**: TypeScript
- **React**: 19.2.4 com hooks
- **Styling**: Tailwind CSS 4
- **Backend**: Firebase (Authentication, Firestore, Storage)
- **Validação**: Zod + React Hook Form
- **Gráficos**: Recharts
- **Notificações**: Sonner
- **Ícones**: Lucide React

## Estrutura de Pastas

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx               # Layout principal
│   ├── page.tsx                 # Home page (redirect para login/dashboard)
│   ├── globals.css              # Estilos globais
│   └── dashboard/               # Dashboard e subpáginas
│       ├── layout.tsx           # Layout do dashboard
│       ├── page.tsx             # Dashboard principal (métricas)
│       ├── clientes/            # Gerenciamento de clientes
│       ├── pedidos/             # Gerenciamento de pedidos
│       ├── produtos/            # Gerenciamento de produtos
│       ├── metas/               # Gerenciamento de metas
│       ├── relatorios/          # Relatórios
│       ├── crescimento/         # Análise de crescimento
│       ├── comparacao/          # Comparativos
│       └── configuracoes/       # Admin - Aprovação de usuários
│
├── components/                   # Componentes React reutilizáveis
│   ├── app-shell.tsx            # Shell do app (navbar, sidebar)
│   ├── auth-gate.tsx            # Wrapper de autenticação
│   ├── customer-form.tsx        # Formulário de clientes
│   ├── goal-form.tsx            # Formulário de metas
│   ├── order-form.tsx           # Formulário de pedidos
│   ├── product-form.tsx         # Formulário de produtos
│   ├── reports/                 # Componentes de relatórios
│   └── ui/                      # Componentes UI primitivos
│       ├── button.tsx
│       ├── dialog.tsx
│       ├── input.tsx
│       └── select.tsx
│
└── lib/                          # Funções e utilidades
    ├── firebase.ts              # Inicialização Firebase
    ├── firestore.ts             # Referências de coleções
    ├── user-service.ts          # Gerenciamento de usuários
    ├── customer-service.ts      # CRUD de clientes
    ├── order-service.ts         # CRUD de pedidos
    ├── product-service.ts       # CRUD de produtos
    ├── goal-service.ts          # CRUD de metas
    ├── report-service.ts        # Geração de relatórios
    ├── schemas.ts               # Schemas Zod para validação
    └── utils.ts                 # Funções utilitárias
```

## Autenticação e Autorização

### Fluxo de Autenticação

1. **Firebase Auth**: Autenticação via Google OAuth
2. **User Service**: Sincroniza usuário com Firestore na primeira autenticação
3. **Auth Gate**: Middleware que valida status do usuário
4. **Dashboard**: Apenas usuários "approved" acessam

### Statuses de Usuário

- `pending`: Novo usuário aguardando aprovação
- `approved`: Usuário autorizado a usar o sistema
- `rejected`: Usuário rejeitado (pode reenviar solicitação)

### Roles

- `user`: Usuário padrão (leitura/escrita de dados comerciais)
- `admin`: Administrador (aprovação de usuários + acesso total)

## Serviços

### User Service (`lib/user-service.ts`)

Gerenciamento de usuários e aprovações.

**Funções principais**:
- `createOrUpdateUser(userData)`: Cria novo usuário com status "pending" ou atualiza metadata preservando status
- `isUserApproved(uid)`: Verifica se usuário está aprovado
- `isUserAdmin(uid)`: Verifica se usuário é admin
- `approveAccessRequest(requestId, adminUid)`: Aprova solicitação de acesso
- `rejectAccessRequest(requestId, reason)`: Rejeita solicitação com motivo
- `getPendingAccessRequests()`: Lista solicitações pendentes
- `getApprovedUsers()`: Lista usuários aprovados

**Importante**: O método `createOrUpdateUser` utiliza `setDoc` com merge na primeira autenticação e `updateDoc` em subsequentes para preservar o status já definido.

### Customer Service (`lib/customer-service.ts`)

CRUD de clientes.

**Funções**:
- `fetchAllCustomers()`: Retorna todos os clientes
- `createCustomer(data)`: Cria novo cliente
- `updateCustomer(id, data)`: Atualiza cliente existente
- `deleteCustomer(id)`: Deleta cliente

**Filtros**: Suporta filtro por status e loja.

### Order Service (`lib/order-service.ts`)

CRUD de pedidos.

**Funções**:
- `fetchAllOrders()`: Retorna todos os pedidos
- `createOrder(data)`: Cria novo pedido
- `updateOrder(id, data)`: Atualiza pedido
- `deleteOrder(id)`: Deleta pedido

**Cálculos automáticos**: Peso total do pedido calculado a partir do produto e quantidade.

### Product Service (`lib/product-service.ts`)

CRUD de produtos.

**Funções**:
- `fetchAllProducts()`: Retorna todos os produtos
- `createProduct(data)`: Cria novo produto
- `updateProduct(id, data)`: Atualiza produto
- `deleteProduct(id)`: Deleta produto

**Regras**:
- Código do produto é único
- Peso por caixa = Peso unitário × Quantidade por caixa

### Goal Service (`lib/goal-service.ts`)

CRUD de metas.

**Funções**:
- `fetchAllGoals()`: Retorna todas as metas
- `createGoal(data)`: Cria nova meta
- `updateGoal(id, data)`: Atualiza meta
- `deleteGoal(id)`: Deleta meta

**Tipos de metas**: Mensal, Anual
**Tipos de objetivo**: Peso, Receita, Positivação, Conversão

## Dashboard

### Arquivo: `src/app/dashboard/page.tsx`

Página principal de métricas comerciais.

**Features implementadas**:
- Navegação de período (mês anterior/atual)
- Filtro por loja
- Cálculo de métricas em tempo real
- Dois gráficos (Peso Mensal e Peso por Dia)
- Comparação com mesmo mês do ano anterior

**Métricas calculadas**:
```typescript
// Clientes ativos com pedidos no período
const activeCustomersWithOrder = filteredOrders.map(o => o.customerId)
  .filter(id => activeCustomers.find(c => c.id === id))

// Taxa de conversão
const conversionRate = (activeCustomersWithOrder / activeCustomers.length) * 100

// Ticket médio
const averageTicket = filteredOrders.reduce((sum, o) => sum + o.totalValue, 0) / filteredOrders.length

// Peso por dia (para gráfico)
const dailyWeightData = Map.groupBy(day => order.issueDate)
  .map(day => sum(order.totalWeight))
```

**Nota sobre positivação histórica**: a dashboard agora trata períodos anteriores ao ano atual de forma diferente — para relatórios históricos (ano < ano atual) a contagem de "clientes positivados" considera qualquer cliente que tenha feito ao menos um pedido no período, independentemente do status atual (`Ativo`/`Inativo`). Isso preserva a integridade histórica das métricas; já as métricas dependentes do estado atual do cliente (ex.: conversão, não-positivados) são calculadas apenas para o ano corrente.

**Memoização**: Usa `useMemo` extensivamente para evitar recálculos desnecessários.

### Componente MetricCard

Card reutilizável para exibir métricas.

Props:
- `label`: Rótulo da métrica
- `value`: Valor a exibir
- `comparison`: Texto de comparação
- `icon`: Componente de ícone (Lucide)
- `color`: Tema de cores ('emerald' ou 'slate')

## Firestore Collections

### users

```typescript
{
  uid: string                    // Identificador do Firebase Auth
  email: string
  displayName: string
  photoURL?: string
  status: 'pending' | 'approved' | 'rejected'
  role: 'user' | 'admin'
  createdAt: string             // ISO timestamp
  approvedAt?: string           // ISO timestamp
}
```

### access_requests

```typescript
{
  requestId: string             // ID do documento
  userId: string                // UID do usuário
  email: string
  displayName: string
  status: 'pending' | 'approved' | 'rejected'
  reason?: string               // Motivo da rejeição
  createdAt: string             // ISO timestamp
  processedAt?: string          // ISO timestamp
  processedBy?: string          // UID do admin
}
```

### customers

```typescript
{
  id: string
  code: string
  name: string
  store: string
  address: string
  city: string
  state: string
  phone: string
  email: string
  cnpjCpf: string
  representative: string
  lastPurchase?: string         // ISO date
  status: 'Ativo' | 'Inativo'
  createdAt: string
  updatedAt: string
}
```

### orders

```typescript
{
  id: string
  orderNumber: string           // Único
  issueDate: string             // ISO date (YYYY-MM-DD)
  nfNumber: string
  customerId: string
  store: string
  items: Array<{
    productId: string
    productCode: string
    description: string
    quantity: number
    unitPrice: number
    totalWeight: number
  }>
  totalWeight: number           // Soma do peso dos itens
  totalValue: number
  createdAt: string
  updatedAt: string
}
```

### products

```typescript
{
  id: string
  code: string                  // Único
  description: string
  unit: string
  weightPerUnit: number         // kg
  quantityPerBox: number
  weightPerBox: number          // weightPerUnit × quantityPerBox
  price: number
  status: 'Ativo' | 'Inativo'
  createdAt: string
  updatedAt: string
}
```

### goals

```typescript
{
  id: string
  title: string
  type: 'Mensal' | 'Anual'
  period: string                // "2026-06" para mensal ou "2026" para anual
  objectiveType: 'Peso' | 'Receita' | 'Positivação' | 'Conversão'
  kgTarget?: number
  revenueTarget?: number
  createdAt: string
  updatedAt: string
}
```

## Hooks Customizados

### useAuth

```typescript
const { user, loading } = useAuth()
```

Retorna usuário autenticado do Firebase Auth.

Arquivo: `src/hooks/use-auth.ts`

## Validação

Schemas Zod definidos em `lib/schemas.ts`:

- `customerSchema`: Validação de clientes
- `orderSchema`: Validação de pedidos
- `productSchema`: Validação de produtos
- `goalSchema`: Validação de metas
- `userSchema`: Validação de usuários
- `accessRequestSchema`: Validação de solicitações de acesso

## Performance

- **Code Splitting**: Next.js automaticamente divide código por rota
- **Lazy Loading**: Componentes carregados sob demanda
- **Image Optimization**: Imagens otimizadas via next/image
- **Memoization**: useMemo para cálculos pesados
- **Caching**: Firestore cache automático

## Estilo

Tailwind CSS 4 com customizações:

- Cores: Slate/Emerald para tema dark
- Spacing: Escala 2px
- Rounded: Borders raros (2xl/3xl para componentes)
- Responsive: Mobile-first approach

## Variáveis de Ambiente

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
```

## Troubleshooting

### Erro "No document to update"
**Causa**: `updateDoc` em documento não-existente.
**Solução**: Verificar se documento existe com `getDoc` antes de atualizar, ou usar `setDoc` com merge.

### Status de usuário reseta após refresh
**Causa**: `createOrUpdateUser` usando `updateDoc` sem preservar status.
**Solução**: Usar `setDoc` com merge na primeira autenticação, preservando campos existentes.

### Gráficos não atualizam após filtro
**Causa**: Dados não são recalculados quando filtro muda.
**Solução**: Adicionar dependências ao `useMemo` (incluir `storeFilter`, `fromDate`, `toDate`).

## Deploy

### Vercel

1. Push para GitHub
2. Conectar repo ao Vercel
3. Configurar variáveis de ambiente
4. Deploy automático em push

### Firebase Hosting

```bash
npm run build
firebase deploy
```

## Recursos Futuros

- [ ] Gráficos adicionais (Pedidos por Dia, Peso por Cidade, etc.)
- [ ] Relatórios completos
- [ ] Importação/Exportação XLSX
- [ ] Notificações em tempo real
- [ ] Mobile app
- [ ] Integração com ERP
