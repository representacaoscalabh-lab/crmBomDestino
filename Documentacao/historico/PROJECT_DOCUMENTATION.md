> Cópia histórica preservada em 21/10/2026. O conteúdo abaixo registra uma versão anterior; consulte o [índice atual](../README.md).

# WRRJ CRM - Projeto e Documentação Técnica

## Visão Geral

WRRJ CRM é uma aplicação comercial construída com **Next.js App Router**, **TypeScript**, **React 19**, **Tailwind CSS**, **Firebase** e **Recharts**. O sistema oferece gerenciamento de clientes, produtos, pedidos, metas, relatórios e um dashboard comercial com filtros e métricas.

## Tecnologias Principais

- Next.js 16.2.9
- React 19.2.4
- TypeScript 5
- Tailwind CSS 4
- Firebase Authentication, Firestore e Storage
- Zod para validação de formulários
- React Hook Form para formulários reativos
- XLSX para importação/exportação de planilhas
- Recharts para gráficos
- Radix + componentes de UI customizados
- Sonner para notificações toast

## Estrutura do Projeto

### Diretórios principais

- `src/app/` — páginas e rotas do App Router
- `src/components/` — componentes compartilhados e formulários
- `src/lib/` — serviços de dados, schemas e utilitários
- `src/components/ui/` — componentes de botão, diálogo, input e select

### Arquivos de configuração

- `package.json` — dependências e scripts de execução
- `tsconfig.json` — configuração TypeScript
- `next.config.ts` — configuração Next.js
- `postcss.config.mjs` — configuração Tailwind/PostCSS

## Fluxo de Autenticação e Aprovação de Usuário

### Firebase

`src/lib/firebase.ts` inicializa o Firebase com:

- `auth` (Firebase Auth)
- `db` (Firestore)
- `googleProvider` para login Google
- `storage` e `analytics`

### AuthGate

`src/components/auth-gate.tsx` é o componente que gerencia:

- estado de autenticação com `onAuthStateChanged`
- login via `signInWithPopup(auth, googleProvider)`
- redirecionamento para `/dashboard`

### Gerenciamento de usuários

`src/lib/user-service.ts` contém:

- `createOrUpdateUser` para salvar usuários no Firestore
- `isUserApproved` e `isUserAdmin`
- `createAccessRequest`, `getPendingAccessRequests`, `approveAccessRequest`, `rejectAccessRequest`
- `getAllUsers`, `getApprovedUsers`

As coleções usadas são:

- `users`
- `access_requests`

## Páginas do Dashboard

### `src/app/dashboard/page.tsx`

Painel principal do dashboard comercial. Calcula métricas usando pedidos e clientes:

- filtro de período com `dateFrom` / `dateTo`
- `filteredOrders` para pedidos atualmente exibidos
- `selectedMonthWeight`, `previousMonthWeight`, `yearWeight`
- `averageTicket`, `totalOrders`, `totalAmount`
- `activeCustomersTotal`, `purchasedActiveCustomers`, `conversionRate`
- gráficos de `monthlyWeights`, `cityWeights`, `topProducts`
- `groupOrdersByDay` para gráfico diário

**Tratamento de datas corrigido**:
- `parseDate()` agora suporta:
  - Formatos ISO (YYYY-MM-DD)
  - Números seriais do Excel (convertidos corretamente)
  - Formatos brasileiros (DD/MM/YYYY)
- `monthlyWeights` agora filtra por ano selecionado antes de agregar meses
- Evita divergência entre métricas e gráficos de peso mensal

### `src/app/dashboard/pedidos/page.tsx`

Tela de pedido com funcionalidades de:

- listagem e filtros de busca
- filtro de período por `dateFrom` e `dateTo`
- ordenação por colunas
- importação de XLSX com progresso e avisos
- exportação de pedidos filtrados para XLSX
- seleção múltipla e exclusão em lote
- edição e visualização de pedido

O filtro de data agora usa `parseOrderDate()` com suporte completo a Excel serial numbers e formatos brasileiros. `dateTo` é tratado como inclusivo (23:59:59).

### `src/app/dashboard/clientes/page.tsx`

Cadastro e gerenciamento de clientes com:

- busca e filtros por loja e status
- importação de clientes via XLSX
- exportação para XLSX
- exclusão em lote, edição e cadastro
- atualização de clientes inativos por último pedido

### `src/app/dashboard/produtos/page.tsx`

Gestão de produtos com:

- cache local persistente em `localStorage` para reduzir leituras Firestore
- invalidação automática em create/update/delete/import
- cadastro, edição e exclusão
- importação de XLSX com normalização de unidade de venda
- exportação para XLSX
- filtros de busca e status

### `src/app/dashboard/metas/page.tsx`

Controle de metas com:

- cache local persistente em `localStorage` para reduzir leituras Firestore
- validação de metadados globais para recarregar apenas quando metas mudarem
- criação e edição de metas mensais e anuais
- exclusão em lote
- exportação de metas para XLSX

### `src/app/dashboard/relatorios/page.tsx`

Painel de relatórios com gráficos e tabelas para:

- receita por cliente
- receita por cidade
- receita por produto
- top clientes e produtos
- frequência de compra
- análise de clientes sem compra
- positivação de produtos e clientes

Os relatórios usam `fetchAllOrders`, `fetchAllCustomers` e `fetchAllProducts` para gerar dados agregados.

### `src/app/dashboard/crescimento/page.tsx`

Tela de crescimento que compara:

- mês atual, mês anterior e mesmo mês do ano anterior
- clientes e produtos por peso, quantidade e receita
- métricas de crescimento percentual

O filtro é feito com base em datas de emissão dos pedidos e loja associada.

### `src/app/dashboard/configuracoes/page.tsx`

Administração de sistema com:

- lista de usuários e solicitações de acesso
- aprovação e rejeição de solicitações
- visualização de logs de importação e ações do sistema

## Serviços de Domínio

### `src/lib/customer-service.ts`

Funções principais:

- `fetchAllCustomers`, `fetchCustomersPage`
- `createCustomer`, `updateCustomer`, `softDeleteCustomer`, `hardDeleteCustomer`, `bulkDeleteCustomers`
- `importCustomersFromXlsx` com validação Zod, normalização de colunas e detecção de duplicatas
- `updateInactiveCustomers`

Regras importantes:

- IDs de cliente são construídos como `store-code`
- clientes duplicados são ignorados na importação
- clientes com status `deleted` são filtrados

### `src/lib/product-service.ts`

Funções principais:

- `fetchAllProducts`, `fetchProductsPage`
- `createProduct`, `updateProduct`, `softDeleteProduct`, `bulkDeleteProducts`
- `importProductsFromXlsx` com normalização de unidade de venda (`und` / `kg`)
- exportação de produtos para XLSX

### `src/lib/order-service.ts`

Funções principais:

- `fetchAllOrders`
- `createOrder`, `updateOrder`, `softDeleteOrder`, `bulkDeleteOrders`
- `exportOrdersToXlsx`, `exportOrderTemplateToXlsx`
- `importOrdersFromXlsx` para planilhas de pedidos

Importação de pedidos:

- normaliza cabeçalhos de colunas
- agrupa linhas por número de pré-pedido
- valida clientes por id, código, nome e loja
- calcula quantidade, peso e valor total
- emite avisos se houver múltiplos clientes/lojas no mesmo pedido
- **Tratamento robusto de datas**:
  - Detecta e converte números seriais do Excel (p.ex., 46583 → 01/06/2026)
  - Suporta formatos brasileiros (DD/MM/YYYY)
  - Normaliza todas as datas para ISO format (YYYY-MM-DD) no armazenamento
  - Funções: `excelSerialToDate()`, `normalizeDateToISO()`

### `src/lib/goal-service.ts`

Funções principais:

- `fetchAllGoals`
- `createGoal`, `updateGoal`, `softDeleteGoal`, `bulkDeleteGoals`
- exportação de metas para XLSX

As metas usam um campo `period` que é construído como `YYYY` para anual ou `YYYY-MM` para mensal.

### `src/lib/report-service.ts`

Serviço utilitário para exportação de relatórios e tabelas para XLSX.

## Schemas e Tipos

`src/lib/schemas.ts` define as validações e tipos usados nos formulários:

- `customerSchema`
- `productSchema`
- `orderItemSchema`
- `orderSchema`

O Zod garante valores obrigatórios, formatos válidos e conversão de números.

## Componentes Reutilizáveis

### `src/components/ui/button.tsx`

Botão estilizado com variantes `default`, `secondary` e `ghost`.

### `src/components/ui/dialog.tsx`

Modal baseada em Radix Dialog com overlay e close automático.

### `src/components/ui/input.tsx` e `src/components/ui/select.tsx`

Inputs estilizados para uso nos formulários.

### Formulários

- `src/components/customer-form.tsx`
- `src/components/product-form.tsx`
- `src/components/order-form.tsx`
- `src/components/goal-form.tsx`

Cada formulário usa React Hook Form com validação Zod e suporta criação/edição.

## Layout e Navegação

### `src/components/app-shell.tsx`

Define a interface principal do dashboard com sidebar, navegação e header.

### `src/app/dashboard/layout.tsx`

Encapsula todas as rotas do dashboard dentro de `AppShell`.

## Notas de Implementação

- O sistema usa soft delete em clientes, produtos, metas e pedidos para preservar histórico.
- Exportação de XLSX está disponível em várias telas: pedidos, clientes, produtos, metas e relatórios.
- Importação de XLSX conta com normalização de cabeçalhos e campos numéricos.
- O dashboard de métricas é derivado de `filteredOrders` para manter consistência entre gráficos e cartões.
- A lógica de comparação de clientes em pedidos tenta casar `customerId`, `customerCode`, `customerName` e `store`.

## Como Rodar

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`.

## Observações

- As pastas `src/app/dashboard/comparacao` e `src/app/dashboard/crescimentos` existem, mas estão vazias no estado atual.
- O homepage em `src/app/page.tsx` fornece acesso rápido ao dashboard e páginas principais.
- `QUICKSTART.md` e `README.md` já trazem orientações de setup e uso básico.

