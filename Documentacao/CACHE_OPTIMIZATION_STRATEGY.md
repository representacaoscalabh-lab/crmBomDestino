# 📊 Estratégia de Otimização de Cache - Redução de Leituras Firestore

## 🎯 Problema Atual

**Duplicação massiva de leituras:**

```
fetchAllCustomers() → Chamado 6+ vezes por renderização:
  ✗ /dashboard/clientes
  ✗ /dashboard/crescimento/clientes
  ✗ /dashboard/crescimento/produtos
  ✗ /dashboard/crescimento (main)
  ✗ components/order-form.tsx
  ✗ Potencial em outros componentes

fetchAllOrders() → Chamado 4+ vezes por renderização:
  ✗ /dashboard/pedidos
  ✗ /dashboard/crescimento/clientes
  ✗ /dashboard/crescimento/produtos
  ✗ /dashboard/crescimento (main)

fetchAllProducts() → Chamado 4+ vezes por renderização:
  ✗ /dashboard/produtos
  ✗ /dashboard/crescimento/produtos
  ✗ components/order-form.tsx
  ✗ charts-service.ts
```

**Impacto estimado:**
- ❌ Dashboard load: ~10-15 leituras Firestore
- ❌ Crescimento/Clientes: 2-3 leituras (poderia ser 0 com cache compartilhado)
- ❌ Crescimento/Produtos: 3 leituras (poderia ser 0)
- ❌ Cada refresh: N leituras sem validação

---

## ✅ Solução Recomendada: Cache Context Global

### Arquitetura de 3 Camadas

```
┌─────────────────────────────────────────────────────┐
│          Global Cache Context                       │
│  (Gerencia compartilhamento entre páginas)         │
├─────────────────────────────────────────────────────┤
│                                                     │
│  1. CACHE EM MEMÓRIA (React Context)               │
│     - Customers: Map<customerId, CustomerRecord>  │
│     - Orders: OrderRecord[]                        │
│     - Products: ProductRecord[]                    │
│     - Timestamps: Track quando foi carregado       │
│     - TTL: 25 minutos                              │
│                                                     │
│  2. LISTENER POR TIPO DE DADO                      │
│     - Quando uma página carrega Customers          │
│     - Outros componentes recebem via Context       │
│     - Não precisam fazer fetch novamente           │
│                                                     │
│  3. INVALIDAÇÃO INTELIGENTE                        │
│     - Quando usuário clica "Atualizar"             │
│     - Todos compartilham o mesmo refresh           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Benefícios

| Antes | Depois |
|-------|--------|
| Dashboard: 10-15 leituras | Dashboard: 1-2 leituras |
| Cada página: N leituras próprias | Cada página: 0 leituras (usa contexto) |
| Refresh: Tudo recarrega | Refresh: Compartilhado |
| Sem sincronização | Todas páginas sincronizadas |

---

## 🛠️ Implementação Proposta

### PASSO 1: Criar Cache Context (`src/lib/cache-context.tsx`)

```typescript
type CacheState = {
  customers: { data: CustomerRecord[]; loadedAt: number } | null;
  orders: { data: OrderRecord[]; loadedAt: number } | null;
  products: { data: ProductRecord[]; loadedAt: number } | null;
};

interface CacheContextType {
  // Getters com validação de TTL
  getCustomers(forceRefresh?: boolean): Promise<CustomerRecord[]>;
  getOrders(forceRefresh?: boolean): Promise<OrderRecord[]>;
  getProducts(forceRefresh?: boolean): Promise<ProductRecord[]>;
  
  // Invalidação seletiva
  invalidateCustomers(): void;
  invalidateOrders(): void;
  invalidateProducts(): void;
  invalidateAll(): void;
  
  // Status
  isFreshWithin(type: 'customers'|'orders'|'products', ms: number): boolean;
  getLastLoad(type: 'customers'|'orders'|'products'): Date | null;
}
```

### PASSO 2: Usar em App Shell

```typescript
// src/components/app-shell.tsx
<CacheProvider>
  {children}
</CacheProvider>
```

### PASSO 3: Refatorar Páginas

**Antes:**
```tsx
useEffect(() => {
  const cached = readLocalCache<CustomerRecord[]>(...);
  if (cached) setCustomers(cached.data);
  else {
    const data = await fetchAllCustomers();
    writeLocalCache(..., data);
    setCustomers(data);
  }
}, []);
```

**Depois:**
```tsx
const { getCustomers } = useCacheContext();

useEffect(() => {
  void (async () => {
    const data = await getCustomers(); // Usa contexto + localStorage
    setCustomers(data);
  })();
}, []);
```

---

## 📈 Impacto Esperado

### Cenário: Usuário navega Dashboard → Clientes → Crescimento

**Antes:**
1. Dashboard carrega: 10 leituras (orders, customers, goals)
2. Clientes carrega: +3 leituras (customers, pagination setup)
3. Crescimento/Clientes: +2 leituras (orders, customers)
4. **Total: ~15 leituras** ❌

**Depois (com Cache Context):**
1. Dashboard carrega: 10 leituras (dados reais)
2. Clientes: 0 leituras (customers já em contexto) ✅
3. Crescimento/Clientes: 0 leituras (orders + customers em contexto) ✅
4. **Total: ~10 leituras** (33% redução)

### Cenário: Refresh de Dados

**Antes:**
- Clica "Atualizar" → Só aquela página recarrega → Outras ficam com dados antigos ❌

**Depois:**
- Clica "Atualizar" → Invalida no contexto → Todas as páginas recebem dados frescos ✅

---

## 💾 Monitor de Armazenamento em Configurações

### Implementar em `src/app/dashboard/configuracoes/page.tsx`

```tsx
type StorageMetrics = {
  cacheSize: number;        // bytes
  cacheItemsCount: number;
  cacheByType: {
    customers: number;
    orders: number;
    products: number;
    dashboard: number;
    other: number;
  };
  utilizationPercent: number; // % de 5MB (limite típico)
};

function calculateStorageMetrics(): StorageMetrics {
  let total = 0;
  let count = 0;
  const byType = { customers: 0, orders: 0, products: 0, dashboard: 0, other: 0 };

  Object.entries(localStorage).forEach(([key, value]) => {
    const size = new Blob([value]).size;
    total += size;
    count++;
    
    if (key.includes('customer')) byType.customers += size;
    else if (key.includes('order')) byType.orders += size;
    else if (key.includes('product')) byType.products += size;
    else if (key.includes('dashboard')) byType.dashboard += size;
    else byType.other += size;
  });

  return {
    cacheSize: total,
    cacheItemsCount: count,
    cacheByType: byType,
    utilizationPercent: (total / (5 * 1024 * 1024)) * 100,
  };
}
```

**Exibição em Card:**
```
📦 Armazenamento em Cache
├─ Clientes: 245 KB
├─ Pedidos: 1.2 MB
├─ Produtos: 389 KB
├─ Dashboard: 512 KB
├─ Outros: 89 KB
└─ Total: 2.4 MB / 5 MB (48%)
```

---

## 🔄 Padrão de Sincronização Entre Páginas

### Exemplo: Dashboard carrega dados → Clientes pode usar

```typescript
// dashboard/page.tsx
const { getOrders, getCustomers, invalidateAll } = useCacheContext();

useEffect(() => {
  const [orders, customers] = await Promise.all([
    getOrders(),      // Preenche contexto
    getCustomers()    // Preenche contexto
  ]);
  setOrders(orders);
  setCustomers(customers);
}, []);
```

```typescript
// clientes/page.tsx
const { getCustomers } = useCacheContext();

useEffect(() => {
  // Já está em contexto, não faz fetch
  const customers = await getCustomers();
  setCustomers(customers);
}, []);
```

---

## 📋 Checklist de Implementação

### Fase 1: Infraestrutura
- [ ] Criar `src/lib/cache-context.tsx`
- [ ] Implementar `CacheProvider`
- [ ] Envolver `AppShell` com provider
- [ ] Criar hook `useCacheContext()`

### Fase 2: Refatoração Gradual
- [ ] Refatorar `dashboard/clientes/page.tsx` → usar contexto
- [ ] Refatorar `dashboard/pedidos/page.tsx`
- [ ] Refatorar `dashboard/produtos/page.tsx`
- [ ] Refatorar páginas de crescimento
- [ ] Refatorar `order-form.tsx`

### Fase 3: Monitoramento
- [ ] Adicionar `storage-monitor.tsx` component
- [ ] Integrar em `configuracoes/page.tsx`
- [ ] Telemetria de hitrate do cache
- [ ] Dashboard de métricas

### Fase 4: Validação
- [ ] Medir redução de leituras antes/depois
- [ ] Testar TTL funciona corretamente
- [ ] Testar refresh invalida todas páginas
- [ ] Performance em navegação entre pages

---

## ⚠️ Considerações Importantes

1. **Memória do navegador**: Cada usuário = contexto em memória. Com 10K usuários simultâneos, pode consumir RAM.
   - **Solução**: Implementar LRU cache ou garbage collection

2. **Seleção de dados**: Nem todos os dados precisam estar sempre em memória
   - **Solução**: Carregar contexto sob demanda (lazy loading)

3. **Sincronização entre abas**: Se usuário abre 2 abas, contexto não é compartilhado
   - **Solução**: Usar `localStorage` como fallback + listener de mudanças

4. **Dados stale**: Se servidor foi atualizado, cliente não sabe
   - **Solução**: Implementar webhook/real-time listener com Firebase

---

## 🚀 Ganho Estimado

**Leitura por mês (atual):**
- 100 usuários × 10 leituras/dia × 30 dias = **30.000 leituras**
- Custo Firestore: 30k × $0.06/100k reads = **~$18/mês**

**Após otimização (70% redução):**
- 100 usuários × 3 leituras/dia × 30 dias = **9.000 leituras**
- Custo: 9k × $0.06/100k = **~$5/mês** ✅
- **Economia: ~$13/mês (72%)**

**Benefício secundário:**
- ⚡ Carregamento 3-5x mais rápido
- 📱 Menos banda (dados já em memória)
- 🔄 UX melhor (sem "carregando..." repetido)

---

## 📞 Próximas Etapas

1. **Quer que implemente o Cache Context agora?**
2. **Quer primeiro um monitor de armazenamento em Configurações?**
3. **Quer validação de quantas vezes cada fetch é chamado?**

Recomendo começar pela **Fase 1** (Cache Context) que é a base que tudo depende.
