> Cópia histórica preservada em 21/10/2026. O conteúdo abaixo registra uma versão anterior; consulte o [índice atual](../README.md).

# WRRJ CRM - Especificação Completa do Sistema

## Objetivo

Desenvolver um CRM comercial moderno para a empresa **WRRJ**, utilizando:

* Firebase Authentication
* Cloud Firestore
* Firebase Storage
* Firebase Cloud Messaging
* Firebase Hosting
* Next.js
* TypeScript
* TailwindCSS
* Shadcn/UI
* Recharts
* TanStack Table
* React Hook Form
* Zod
* XLSX
* jsPDF

Todo o sistema deve possuir design moderno, extremamente rápido, responsivo e com foco em produtividade.

---

# Firebase

Utilizar Firebase para:

* Authentication
* Firestore Database
* Storage
* Cloud Messaging
* Analytics

Authentication será exclusivamente via Google.

Utilizar variáveis de ambiente conforme `.env.example`. Não registrar valores reais
nem credenciais administrativas na documentação ou no código-fonte.

```ts
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};
```

---

# Login

Primeira tela:

Login somente utilizando conta Google.

Não haverá login por senha.

Após autenticar, o sistema verifica o status do usuário:

- **Novo usuário**: Recebe status "pending" no Firestore e é solicitado acesso
- **Usuário pendente**: Vê tela com "Solicitar acesso" e "Solicitação enviada" após envio
- **Usuário aprovado**: Acessa imediatamente o painel

---

# Sistema de Aprovação de Usuários

## Fluxo de Acesso

1. **Primeira autenticação**: Novo usuário é criado com status "pending"
2. **Solicitação de acesso**: Usuário vê formulário para solicitar acesso (nome será preenchido automaticamente)
3. **Admin analisa**: Admin acessa página de Configurações para revisar solicitações pendentes
4. **Aprovação/Rejeição**: Admin aprova ou rejeita a solicitação
5. **Notificação**: Usuário vê dashboard (se aprovado) ou mensagem de rejeição

## Página de Configurações (Admin)

Acessível apenas por usuários com `role: "admin"` no Firestore.

### Abas

1. **Usuários Aprovados**
   - Lista de todos os usuários com status "approved"
   - Mostra: Email, Nome, Data de aprovação

2. **Solicitações Pendentes**
   - Lista de usuários aguardando aprovação (status "pending")
   - Botões: Aprovar | Rejeitar
   - Rejeição com modal para adicionar motivo opcional

3. **Aprovação Manual**
   - Formulário para aprovar usuários manualmente
   - Campo: UID do usuário
   - Ação: Busca e aprova o usuário

## Dados do Usuário (Firestore)

Coleção: `users`

Documento: `{uid}`

Campos:
- `uid`: Identificador único do Firebase
- `email`: Email da conta Google
- `displayName`: Nome do usuário
- `photoURL`: Avatar (se disponível)
- `status`: "pending" | "approved" | "rejected"
- `role`: "user" | "admin"
- `createdAt`: Data de criação (ISO string)
- `approvedAt`: Data de aprovação (ISO string, null se não aprovado)

## Coleção de Solicitações

Coleção: `access_requests`

Documento: `{requestId}`

Campos:
- `userId`: UID do usuário solicitante
- `email`: Email do usuário
- `displayName`: Nome do usuário
- `status`: "pending" | "approved" | "rejected"
- `reason`: Motivo da rejeição (se aplicável)
- `createdAt`: Data da solicitação (ISO string)
- `processedAt`: Data do processamento (ISO string)
- `processedBy`: UID do admin que processou (se aplicável)

---

# Tela de Módulos

Exibir três módulos:

* Scala Laticínios (habilitado)
* Bom Destino (desabilitado)
* Lactowal (desabilitado)

Somente o módulo Scala poderá ser acessado nesta primeira versão.

---

# Dashboard Comercial

Ao entrar no módulo Scala abrir automaticamente a Dashboard.

A Dashboard deverá conter:

## Interface

**Header com Período**
- Exibir período selecionado (ex: "Junho / 2026")
- Botões de navegação: "Mês anterior" e "Mês atual"
- Seletor de data para período customizado
- Indicador visual do mês e ano

**Filtros**
- Filtro por loja (dropdown)
- Intervalo de datas (De / Até)

## Métricas em Cards

### Primeira Linha
1. **Peso Mês Selecionado**
   - Peso total em kg do período selecionado
   - Comparação percentual com o mesmo mês do ano anterior

2. **Peso Ano**
   - Peso acumulado no ano calendário
   - Percentual da meta anual atingida

3. **Peso Mês Passado**
   - Peso total do mês imediatamente anterior

4. **Pedidos**
   - Quantidade total de pedidos no período
   - Comparação com mês anterior

5. **Clientes Ativos**
   - Total de clientes com status "Ativo"
   - Comparação com ano anterior

### Segunda Linha
1. **Leads Abertos** (estático)
   - Quantidade de leads em aberto
   - Peso em kg

2. **Leads Fechados** (estático)
   - Quantidade de leads fechados
   - Peso em kg

3. **Conversão**
   - Percentual = (Clientes com pedidos / Clientes ativos) × 100
   - Comparação com ano anterior

4. **Ticket Médio**
   - Média de valor dos pedidos = Soma total de valores / Quantidade de pedidos
   - Período selecionado

## Seção de Comparação

Comparação com o mesmo mês do ano anterior:

1. **Peso no mesmo mês de [ANO ANTERIOR]**
   - Peso total do período correspondente no ano anterior

2. **Clientes ativos no mesmo mês**
   - Total de clientes ativos no mesmo período do ano anterior

3. **Conversão no mesmo mês**
   - Taxa de conversão no período correspondente do ano anterior

## Funil de Vendas (estático)

Exibir 8 estágios em cards lado a lado:
- Novo Lead
- Contato
- Apresentação
- Proposta
- Negociação
- Fechado
- Perdido
- Não Fez Pedido

Cada estágio exibe:
- Quantidade (atualmente 0 - para implementação futura)
- Peso em kg

## Gráficos

### Peso Mensal
- Gráfico de barras
- Eixo X: Meses do ano (Janeiro a Dezembro)
- Eixo Y: Peso em kg
- Responde ao filtro de loja
- Reflete o ano do período selecionado

### Peso por Dia
- Gráfico de linhas
- Eixo X: Dias do período selecionado
- Eixo Y: Peso em kg
- Responde aos filtros de período e loja
- Mostra peso acumulado por dia do período

## Funcionamento

**Reatividade:**
- Todos os cards e gráficos atualizam automaticamente quando filtros são aplicados
- Mudança de período recalcula todas as métricas
- Filtro de loja refina os dados em tempo real

**Dados:**
- Originários do Firestore (clientes, pedidos, produtos)
- Cálculos baseados em status "Ativo" para clientes
- Apenas pedidos com data no período selecionado

**Performance:**
- Carregamento de dados ao montar a página (useEffect)
- Memoização de cálculos pesados (useMemo)
- Dados em cache até nova navegação

---

# Página Clientes

Menu lateral:

Clientes

Botão:

Cadastrar Cliente

Campos:

Cliente

Loja

Nome

Endereço

Estado

Bairro

Cidade

DDD

Telefone

Telefone Celular

Contato

CNPJ/CPF

Representante

Última Compra

Email

Status

---

## Regras

Código do cliente poderá existir em mais de uma loja.

Porém:

Não poderá existir o mesmo código na mesma loja.

Essa validação deve ocorrer antes de salvar.

---

## Listagem

Tabela moderna contendo:

* filtros completos
* busca rápida
* ordenação
* paginação
* seleção múltipla
* edição
* exclusão
* exclusão em massa
* exportação XLS

---

## Importação

Botão:

Importar Clientes

Aceitar planilhas XLSX

Qualquer quantidade de linhas

Realizar validações antes de inserir.

---

## Atualizar Inativos

Botão:

Atualizar Inativos

Ao clicar:

Verificar todos os clientes.

Clientes sem compras nos últimos 3 meses deverão receber:

Status = Inativo

Cliente inativo:

* não participa das métricas
* não participa dos relatórios
* não participa da conversão
* não participa da positivação

Exemplo:

300 clientes

270 ativos

250 compraram

Conversão =

250 / 270

Nunca utilizar clientes inativos como base.

---

# Página Produtos

Botão:

Cadastrar Produto

Campos

Código

Descrição

Unidade de Venda

Peso Unidade (kg)

Quantidade por Caixa

Peso por Caixa

Preço

Status

---

## Regras

Código do produto deve ser único.

Nunca permitir duplicidade.

Peso por Caixa será:

Peso Unidade × Quantidade por Caixa

Caso unidade seja caixa fechada ou kg, manter mesma lógica de cálculo.

Valores sempre em formato brasileiro.

---

## Listagem

Visualizar

Editar

Excluir

Filtros

Exportação XLS

Pesquisa

---

# Página Pedidos

Botão:

Novo Pedido

Campos

Número Pré-Pedido

Data Emissão

Número NF

Cliente

Nome

Loja

Item

Código Produto

Descrição

Quantidade

Preço Unitário

Peso

---

## Regras

Número Pré-Pedido deve ser único.

Nunca permitir duplicidade.

Cliente deverá ser selecionado entre os cadastrados.

Produto deverá ser selecionado entre os cadastrados.

Peso deverá ser calculado automaticamente conforme produto e quantidade.

Todos os indicadores da Dashboard utilizarão o peso calculado.

Valores em Real.

Separadores brasileiros.

Aceitar corretamente vírgula e ponto.

---

## Listagem

Filtros completos

Busca por:

Número do Pedido

Número da Nota

Cliente

Produto

Cidade

Representante

Datas

Visualizar

Editar

Excluir

Exportar XLS

Caso exista filtro aplicado, exportar apenas os registros filtrados.

---

# Página Metas

Tabela de metas.

Filtros completos.

Botão:

Criar Meta

Tipos:

Meta Mensal

Meta Anual

Selecionar período.

Tipos de metas:

Peso

Receita

Positivação

Conversão

Dashboard deverá possuir barras de progresso individuais para cada meta.

As barras deverão atualizar automaticamente conforme evolução.

---

# Página Relatórios

Relatórios disponíveis:

Receita por Cliente

Receita por Cidade

Receita por Produto

Top Clientes

Top Produtos

Frequência de Compra

Clientes Sem Compra

Positivação de Produtos

Positivação de Clientes

Clientes

Todos deverão possuir:

Filtros

Exportação XLS

Gráficos

Tabelas

Indicadores

---

# Página Crescimento

Filtros completos.

Pesquisa por:

Código

Nome

Selecionando um cliente exibir:

Peso

Receita

Quantidade de Pedidos

Comparação:

Mesmo mês ano anterior

Mês anterior

Gráficos evolutivos.

Também permitir análise por Produto.

Selecionando um produto mostrar:

Peso

Receita

Quantidade vendida

Comparação com mês anterior.

Comparação com mesmo mês do ano anterior.

Exibir gráficos.

---

# Barra Lateral

Dashboard

Clientes

Produtos

Pedidos

Metas

Relatórios

Crescimento

Configurações

---

# Configurações

Gerenciar usuários

Permissões

Representantes

Backup

Importações

Exportações

Logs

---

# Firestore

Criar coleções:

users

customers

products

orders

goals

representatives

cities

states

reports_cache

settings

logs

notifications

---

# Regras Gerais

Todo cadastro deverá possuir:

createdAt

updatedAt

createdBy

updatedBy

Todos os formulários utilizarão validação com Zod.

Utilizar React Hook Form.

Todas as tabelas utilizarão TanStack Table.

Todos os gráficos utilizarão Recharts.

Todo o sistema deverá ser responsivo.

Utilizar Skeleton Loading.

Utilizar Toasts.

Utilizar Dialogs.

Implementar confirmação antes de excluir.

Implementar Soft Delete quando apropriado.

Utilizar paginação no Firestore.

Evitar leituras desnecessárias.

Criar índices compostos sempre que necessário.

Toda Dashboard deverá utilizar consultas otimizadas.

Toda exportação deverá respeitar os filtros ativos.

Todo cálculo de peso deverá utilizar precisão decimal para evitar erros de arredondamento.

Todo o sistema deverá possuir arquitetura escalável, preparada para futuramente adicionar os módulos Bom Destino e Lactowal sem necessidade de reescrever a estrutura principal do CRM.

