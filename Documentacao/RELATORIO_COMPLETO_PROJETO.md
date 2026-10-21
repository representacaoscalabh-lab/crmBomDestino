> Referência histórica — versão anterior ou proposta de evolução. Este arquivo não comprova o estado atual nem a publicação no Firebase. Consulte o [índice atual](README.md), a [arquitetura](TECHNICAL.md) e o [guia de ativação](../docs/ativacao-reducao-leituras-firebase.md). Marcado em 21/10/2026.

# Relatório de reconhecimento do projeto — Scala CRM / WRRJ

**Data do levantamento:** 8 de outubro de 2026  
**Escopo:** leitura da estrutura, configurações, rotas, componentes, serviços de domínio, modelos/validações, autenticação, autorização, persistência, importação/exportação e documentação existente. Este documento descreve o código encontrado; não é uma especificação de como o novo sistema deverá funcionar.

## 1. Visão executiva

O repositório contém um CRM comercial web, com interface em português, voltado a carteira de clientes, pedidos, produtos, metas e análise de desempenho. A aplicação é construída com Next.js App Router e React no cliente; Firebase Authentication e Cloud Firestore fornecem autenticação e persistência. A maior parte da lógica de negócio e das consultas ao Firestore roda no navegador, com duas rotas HTTP Next.js para aprovação de usuários e preparação de exportações completas.

As áreas principais são:

- **Operação:** clientes, pedidos, produtos e pedidos em carteira.
- **Acompanhamento:** dashboard, metas, gráficos e relatórios.
- **Administração:** aprovação/remoção/perfil de usuários na página de configurações.
- **Apoio:** central de notificações, crescimento comercial e exportação de planilhas.

O projeto tem recursos relevantes para operação com bases tabulares: paginação, importação/exportação XLS/XLSX, templates, associação de pedidos a clientes e produtos, filtros, cache local e tratamento de datas brasileiras/seriais do Excel.

Há, porém, uma diferença importante entre a autorização apresentada na interface e a política efetiva do backend: as regras Firestore presentes permitem leitura e escrita de qualquer documento a qualquer usuário autenticado. Além disso, a rota de aprovação não valida criptograficamente o token recebido. Essas características devem ser tratadas como riscos de arquitetura antes de reutilizar o padrão no sistema novo.

## 2. Tecnologias e execução

| Camada | Tecnologia encontrada |
|---|---|
| Framework e rotas | Next.js 16.2.9, App Router, Turbopack |
| Interface | React 19.2.4, TypeScript 5, componentes client-side com hooks |
| CSS | Tailwind CSS 4 via `@tailwindcss/postcss`, CSS global e CSS de tema |
| Autenticação | Firebase Authentication, login Google com popup |
| Banco | Cloud Firestore, SDK Web Firebase 12.15.0 |
| Operações administrativas no servidor | Firebase Admin SDK 14.3.0 |
| Arquivos | Firebase Storage no backend e URLs assinadas para exportações completas |
| Validação e formulários | Zod 4, React Hook Form 7, `@hookform/resolvers` |
| Planilhas e relatórios | `xlsx`, ExcelJS, Recharts, Chart.js / react-chartjs-2 |
| PDF | jsPDF instalado |
| Componentes e utilidades | Radix Dialog/Select/Slot, TanStack Table, Lucide React, Sonner, `clsx`, `tailwind-merge`, `class-variance-authority` |
| Qualidade/configuração | ESLint 9, TypeScript strict, `tsconfig` com alias `@/*` para `src/*` |

Scripts disponíveis em `package.json`: `dev`, `build`, `start` e `lint`. Não há script padrão de testes unitários/integrados configurado. Existe o script manual `scripts/test-report-loading.mjs`.

As dependências e versões estão em [package.json](../package.json). Os pontos de configuração de Firebase/Next/Tailwind estão em [firebase.json](../firebase.json), [firestore.rules](../firestore.rules), [storage.rules](../storage.rules), [next.config.ts](../next.config.ts), [postcss.config.mjs](../postcss.config.mjs) e [.env.example](../.env.example).

## 3. Layout, navegação e experiência de uso

### Estrutura visual

- O layout raiz define idioma `pt-BR`, título “Scala CRM”, aplica autenticação e guarda de inatividade globalmente e instala os toasts Sonner.
- O grupo `/dashboard` usa um shell comum com sidebar, barra superior fixa e área central responsiva.
- A sidebar tem navegação para Dashboard, Clientes, Pedidos, Carteira, Exportação, Produtos e Metas; relatórios ficam em seção expansível.
- A barra superior oferece troca de módulo (link externo para CRM Coronata e CRM Bom Destino desabilitado), configurações, notificações com contador não lido e saída.
- Há modo claro/escuro. A preferência é lida do `localStorage` e, quando autenticado, também pode ser gravada em `user-preferences/{uid}` no Firestore.
- O shell envolve as páginas com provedores de cache, estado de leitura/atualização e tema. Em telas menores, a navegação lateral abre/fecha como menu.
- O padrão visual mistura classes Tailwind, CSS customizado e estilos de tema; algumas páginas ainda usam superfícies/cores próprias em vez de um conjunto visual totalmente uniforme.

### Caminho de entrada

O `AuthGate` é aplicado ao layout raiz. Sem sessão, apresenta uma tela de acesso corporativo com **“Entrar com Google”**. Após autenticação e aprovação, apresenta uma tela de escolha de área (“Onde você quer começar?”) com atalhos para Dashboard, Clientes, Pedidos, Exportação e Relatórios; ao escolher um atalho, libera a página selecionada.

Não foi encontrado `src/app/page.tsx`; portanto, não há uma página inicial própria declarada para `/`. A página `/dashboard/inicio` existe, mas retorna `null`; é usada como destino do botão sair do shell para que o guard global volte a renderizar a experiência sem sessão.

## 4. Mapa de páginas e funcionalidades

| Rota | Área | O que o código oferece |
|---|---|---|
| `/dashboard` | Dashboard comercial | Mês anterior/atual/próximo, período personalizado, peso e receita, pedidos, ticket médio, positivação/conversão, metas e gráficos de evolução e composição comercial. O total anual pode ser carregado sob demanda. Usa pedidos, clientes e metas. |
| `/dashboard/clientes` | Carteira de clientes | Pesquisa, filtros por status/segmento/cidade, listagem paginada, cadastro/edição, visualização, exclusão individual/em lote, importação de clientes e de segmentos, templates XLSX, exportação e ferramentas para revisar/reconciliar status de clientes. A página inicia filtrando status `Ativo`; tamanho de página 25. |
| `/dashboard/pedidos` | Pedidos faturados/registrados | Busca por código/nome de cliente, pré-pedido ou NF; datas; ordenação; paginação de 10; detalhe, cadastro/edição, exclusão lógica individual/em lote, importação XLSX com progresso/avisos, template e exportação dos resultados visíveis. O período inicial é o mês corrente. |
| `/dashboard/agenda` | Carteira de pedidos | Fila de pedidos em carteira, pesquisa por pedido/cliente/produto/NF, intervalo de datas, paginação de 15, importação como carteira, template, seleção múltipla, confirmação para converter em pedido normal e cancelamento/exclusão. Exibe peso da carteira no mês corrente. |
| `/dashboard/produtos` | Cadastro de produtos | Busca, filtro de status, paginação de 25, cadastro/edição, exclusão lógica individual/em lote, importação XLSX, template e exportação. |
| `/dashboard/metas` | Metas | Lista, pesquisa por título/período, filtro mensal/anual, criação/edição, exclusão lógica individual/em lote, exportação e barras de progresso. Uma meta pode expressar receita, peso, clientes positivados e/ou conversão. |
| `/dashboard/relatorios` | Relatórios tabulares | Seleção de análise, intervalo de datas, status, segmento, busca, ordenação, paginação visual e exportação XLSX. Ver lista detalhada abaixo. |
| `/dashboard/graficos` | Gráficos | Painel analítico com filtros mensais/anuais, dados de pedidos/clientes/produtos e visualizações Recharts. O arquivo importa gráficos de barras, linhas, pizza, área e radar. |
| `/dashboard/crescimento/clientes` | Crescimento por cliente | Compara mês com mês anterior, mesmo mês do ano anterior ou período escolhido; filtros por loja/status/cliente, pesquisa, ordenação e detalhamento de produtos adicionados/removidos e valores/peso/quantidades. |
| `/dashboard/crescimento` | Relatório de crescimento | Componente de relatório comparativo de clientes e peso entre meses, com seleção/exclusão de clientes, status, paginação e exportação XLSX. |
| `/dashboard/crescimento/relatorio` | Atalho/variante | Reutiliza o mesmo componente de relatório comparativo (`GrowthReport`). |
| `/dashboard/crescimento/produtos` | Crescimento por produto | Usa o componente dedicado `ProductGrowthReport`. |
| `/dashboard/configuracoes` | Administração | Aba de usuários cadastrados e aba de solicitações pendentes; alteração de perfil user/admin, aprovação/rejeição e exclusão de usuário. A interface valida role admin. |
| `/dashboard/notificacoes` | Central de alertas | Busca cliente nos alertas, atualiza, marca cliente individual como lido e remove alerta. Admin pode gerar alertas de inatividade e queda de desempenho. |
| `/dashboard/inatividade` | Não encontrado | Não existe como rota. |
| `/inatividade` | Sessão encerrada | Tela de encerramento e link para voltar ao início após inatividade. |
| `/api/admin/approve-user` | API de aprovação | POST usado pelo painel de configurações para aprovar/rejeitar. |
| `/api/exports/complete` | API de exportação | POST que monta ou usa arquivo XLSX completo, salva no Storage e retorna URL assinada de leitura por uma hora. |

### Relatórios disponíveis

A página de relatórios gerais oferece nove análises:

1. Clientes sem compra no período.
2. Dia preferido de compra por cliente.
3. Frequência de compra.
4. Lista de clientes com situação, cidade, compras e receita.
5. Lista de clientes por segmento.
6. Peso por cliente.
7. Peso por segmento.
8. Positivação de clientes.
9. Positivação de produtos.

Os filtros incluem datas rápidas (7, 30, 90 dias ou todo período), status, segmento e busca. O carregamento reutiliza snapshots com cache, e as tabelas podem ser exportadas para XLSX.

### Exportações oferecidas

A central separa os arquivos em Clientes, Pedidos, Relatórios e Outros. Inclui clientes completos, clientes ativos, clientes por segmento, clientes sem compra no mês, dia da semana da última compra, pedidos por mês, produtos e conversão de texto de cortes/não faturados para uma ou mais planilhas. A exportação completa de pedidos fica oculta na interface para usuários não administradores; as exportações completas de clientes/produtos também passam pela API com autenticação e aprovação.

## 5. Modelo de dados e regras de negócio

Os registros são documentos Firestore. Campos de data e nomes exibidos são frequentemente duplicados nos pedidos para permitir listagem/relatórios sem resolver todas as entidades a cada consulta.

### Cliente — `customers`

- ID gerado a partir de `loja-código` normalizados.
- Campos principais: código, cliente, loja, nome fantasia, endereço, UF, bairro, cidade, DDD, telefone, celular, contato, documento, representante, segmento, última compra, email e status.
- Status: `Ativo`, `Inativo`, `Prospect`.
- Segmentos conhecidos: `FOOD`, `ATACADO`, `DISTRIBUIDOR`, `VAREJO`, `INDUSTRIA`, `REDES`.
- Campos auxiliares: `groupId`, `customerSearch`, `codeSearch`, `deleted`, timestamps.
- Há checagem de duplicidade por código e loja, importação com normalização de colunas/segmentos e reconciliação de atividade.
- A interface usa exclusão física para o comando de excluir, embora o serviço também tenha operação de exclusão lógica.

### Produto — `products`

- ID pelo código do produto (normalizado em maiúsculas).
- Campos: código, descrição, unidade `und`/`kg`, peso por unidade, quantidade por caixa, peso da caixa, preço e status `Ativo`/`Inativo`.
- O esquema valida valores não negativos. Existem busca normalizada, controle de duplicidade, importação e exportação XLSX, soft delete e cache.
- O formulário e a regra de cálculo de peso por caixa devem ser revisados juntos caso o modelo de embalagem mude.

### Pedido — `orders`

- ID pelo número do pré-pedido (normalizado em maiúsculas); não é um ID independente.
- Campos: pré-pedido, data de emissão, NF, cliente/ID/nome, loja, itens, total de valor, total de peso, situação e timestamps.
- Cada item guarda ID/código/descrição do produto, quantidade, preço unitário e peso — snapshot dos dados no momento da inclusão.
- Situação: `normal` ou `wallet` (carteira). Importação aceita XLS/XLSX, agrupa linhas pelo pré-pedido, resolve cliente por ID/código/nome/loja e retorna avisos em inconsistências.
- Pedidos têm exclusão lógica e física em fluxos diferentes. A carteira pode ser confirmada, e há lógica de analytics/exportação para tratar duplicatas entre carteira e pedido faturado.
- Datas aceitam ISO, brasileiro e número serial Excel; armazenagem normalizada para `YYYY-MM-DD`.

### Meta — `goals`

- Campos: título, tipo `Mensal`/`Anual`, ano, mês/período, alvos de receita/peso/clientes/conversão, valor atual opcional, status `Ativa`/`Concluída`/`Pausada` e soft delete.
- O serviço tenta manter uma meta por período. O progresso pode ser calculado com os valores operacionais da dashboard.

### Usuário e acesso — `users`, `access_requests`

- Usuário contém UID Firebase, email, nome/foto opcionais, status `pending`/`approved`/`rejected`, role `user`/`admin`, datas e metadados de aprovação/rejeição.
- Solicitação de acesso registra usuário, data e status, além do motivo de rejeição.
- A documentação antiga menciona “solicitar acesso” depois do primeiro login; no código atual, o primeiro login cria usuário pendente e solicitação automaticamente, e a tela pendente não oferece botão separado para enviar.

### Alertas e dados auxiliares

- `notifications`: alertas associados a `userId`; tipos `customer_inactivity` e `performance_drop`; carga com dados de clientes, leitura por cliente, métricas e datas.
- `monthly_order_aggregates`: totais mensais calculados para peso, pedidos e clientes positivados; usado sob demanda para visão anual.
- Serviços também escrevem metadados/cache em `customer_metadata`, `product_metadata`, `goal_metadata`, `aggregate_metadata` e `cached_exports`.
- O registry em `src/lib/firestore.ts` ainda declara coleções como representatives, cities, states, reports_cache, settings e logs. A presença no registry não significa que todas tenham fluxo ativo nas páginas examinadas.

## 6. Fluxos principais

### Acesso e aprovação

1. Firebase Authentication abre o Google OAuth em popup, com seleção de conta.
2. `AuthGate` observa a sessão e lê `users/{uid}`.
3. Se for o primeiro acesso, cria usuário com status pendente e role user e cria solicitação.
4. Usuário pendente/rejeitado vê uma tela de estado e só pode sair.
5. A página de configurações permite a administração dos registros e solicitações; a aprovação é enviada à rota HTTP. Ao entrar aprovado, a pessoa escolhe a área inicial.

### Pedido

1. Pesquisa cliente e produto por código/nome.
2. Seleção de cliente preenche nome e loja; itens guardam preço/peso vigentes e totais são recalculados.
3. O pedido é validado com Zod e gravado em Firestore.
4. Importação XLSX consolida itens sob o pré-pedido e avisa sobre divergências; carteira usa o mesmo parser com status wallet.
5. Após faturamento, pode ser confirmada a carteira para virar pedido normal.

### Cliente/produto/meta

- Formulários de cliente, produto e pedido usam Zod/React Hook Form (metas usam React Hook Form e normalização no serviço).
- Importação e exportação são centradas em XLSX; na maior parte dos casos a manipulação de arquivo acontece no navegador.
- A atualização de caches derivados é vinculada às operações de escrita nos serviços.

## 7. Dados, desempenho e cache

- O cache de página é configurado em `PAGE_CACHE_TTL_MS` (25 minutos). Há caches em memória e/ou `localStorage`, chaves por filtros e deduplicação de requisições simultâneas em serviços selecionados.
- O dashboard armazena snapshots por intervalo; clientes/produtos/metas mantêm caches; relatórios e gráficos compartilham dados por escopo/filtro. Há invalidação de caches derivados quando entidades mudam.
- Clientes, pedidos e produtos usam paginação no Firestore ou paginação local sobre listas carregadas, conforme filtros e serviço. A página de pedidos tem cache de páginas em memória.
- O dashboard carrega a janela necessária ao período e permite buscar dados anuais agregados separadamente; relatórios carregam pedidos/clientes/produtos conforme o relatório selecionado.
- Componentes `ReadStatusPanel` e `ReadSourceBadge` comunicam fonte cache/rede, horário e ação de atualizar; `ReadStatusProvider` registra o refresh de cada página.
- Exportação completa é tratada de modo diferente das exportações filtradas: API no servidor, Firebase Admin, arquivo XLSX no bucket `cached-exports` e URL assinada temporária.

## 8. Autenticação, autorização e segurança observadas

### O que existe

- Provedor de identidade: Google via Firebase Auth.
- `AuthGate` centraliza a experiência de autenticação/aprovação no cliente.
- Status e role são documentos Firestore; configurações usa role admin para liberar a interface.
- A rota de exportação completa verifica token Firebase com `adminAuth.verifyIdToken`, consulta `users/{uid}` e exige status aprovado.
- A Storage Rules bloqueia todos os acessos do navegador, inclusive `cached-exports`; o backend Admin escreve o arquivo e entrega URL assinada.
- Há guarda por inatividade: após 2 minutos sem atividade mostra aviso; sem resposta por mais 30 segundos encerra a sessão.

### Limitações a considerar

1. **Regras Firestore excessivamente abertas:** `firestore.rules` permite `read, write` para qualquer documento se `request.auth != null`. Não há regra por coleção, dono, role ou campo. Assim, a distinção `user`/`admin` mostrada na UI não é imposta pelo Firestore.
2. **Aprovação com identidade não vinculada ao token:** `/api/admin/approve-user` exige apenas que exista um header Bearer e recebe `x-admin-uid`; o código não verifica o ID token com Firebase Admin nem extrai o UID do token. O comentário cita validação por middleware, mas não foi localizado middleware no projeto.
3. **Ações administrativas no SDK cliente:** mudança de role e exclusão de usuário são feitas diretamente por `user-service` no Firestore; com as regras atuais, a autorização efetiva não está restrita a administradores pelo banco.
4. **Exportação integral:** a API exige usuário aprovado e reserva a atualização/reconstrução do cache a administradores; se um cache completo estiver limpo e existente, o caminho consultado não exige role admin para retornar URL. A interface oculta pedidos completos de não-admin, mas a API deve ser a autoridade para a autorização desse arquivo.
5. **Persistência local:** caches do navegador incluem dados comerciais em `localStorage`. As chaves de alguns caches são por usuário, mas a política de limpeza na saída/expiração deve ser considerada ao desenhar a versão nova.
6. **Sessão não é isolada por rota no servidor:** o gate é componente React global; proteção visual no cliente não substitui regras de banco e validação server-side.

Para o sistema novo, recomenda-se definir a matriz de acesso por papel/escopo antes de migrar telas e implementar a mesma política em endpoints e regras do banco, validando identidade no servidor. Evitar copiar as regras Firestore atuais como baseline.

## 9. Configuração e operação

- `.env.example` define variáveis públicas do Firebase Web (`NEXT_PUBLIC_FIREBASE_*`), variáveis server-side para Firebase Admin (`FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_SERVICE_ACCOUNT_JSON`) e Node 22.
- Segredos da conta de serviço devem existir apenas no servidor/ambiente de implantação, nunca no bundle do navegador.
- `firebase.json` aponta rules e índices; `storage.rules` só permite acesso a arquivos por backend.
- Há discrepância de ambientes a verificar antes de qualquer deploy: `.firebaserc` seleciona `wrrjbeckup`, enquanto `.env.example` aponta as configurações Web para outro project ID. Confirmar qual projeto Firebase deve ser fonte de verdade.
- O Firebase Admin inicializa credencial a partir do JSON compactado e usa Firestore database ID `default`.
- Não foi identificada configuração de hospedagem/deploy explícita no `package.json`/`next.config.ts`; existe um link externo no menu, mas ele não define o deploy deste CRM.

## 10. Pontos de atenção e decisões úteis para o sistema parecido

1. **Definir o escopo do novo produto:** manter ou alterar módulos, rótulos e fluxos (especialmente carteira, metas, notificações e gráficos).
2. **Redesenhar identidade e navegação:** o shell atual tem marca Scala, sidebar responsiva, tema claro/escuro e acesso a outro módulo; confirmar o que permanece.
3. **Fechar o modelo de dados:** esclarecer IDs/uniquidade de cliente por loja, identificador do pedido, relação de itens e regras para pedido de carteira/faturado.
4. **Fechar regras comerciais:** status de cliente, critério de inatividade, positivação, ticket médio, peso, receita, segmentos, metas e comparação histórica.
5. **Definir política de roles e autorização:** hoje a maioria das telas não diferencia capacidades por role; somente algumas ações/telas escondem ou verificam admin.
6. **Escolher a estratégia de importação:** layouts oficiais de planilha, regras de duplicidade, relatórios de erros e volumes máximos. As planilhas do código atual aceitam vários nomes de colunas e formatos de data.
7. **Decidir exportação e privacidade:** quais perfis podem exportar dados completos, quais campos devem ser incluídos e por quanto tempo a URL temporária fica válida.
8. **Planejar volume/performance:** separar paginação real de consultas agregadas, evitar baixar coleção inteira para pesquisa e decidir quando materializar agregados.
9. **Padronizar componentes/estados visuais:** algumas telas usam componentes compartilhados; outras mantêm estilos, loading e tratamento de erros distintos.
10. **Adicionar cobertura automatizada:** não há suíte de testes padrão; importadores, datas, métricas e regras de autorização são bons primeiros alvos.
11. **Revisar documentação preexistente:** `Documentacao/TECHNICAL.md`, `PROJECT_DOCUMENTATION.md` e `SISTEMA_APROVACAO_USUARIOS.md` descrevem partes úteis, mas alguns trechos não coincidem com os fluxos/regras atuais. Usar o código como referência para este levantamento.

## 11. Mapa do código-fonte

- `src/app/`: layouts, páginas e rotas HTTP Next.js.
- `src/components/app-shell.tsx`: navegação e estrutura das páginas autenticadas.
- `src/components/auth-gate.tsx`: login e estados de aprovação.
- `src/components/*-form.tsx`: formulários de cliente, pedido, produto e meta.
- `src/components/growth-report.tsx` e `product-growth-report.tsx`: telas de comparação/crescimento.
- `src/components/ui/`: primitives de interface e status de leitura.
- `src/hooks/use-auth.ts`: hook de sessão Firebase.
- `src/lib/*-service.ts`: acesso a dados e lógica de domínio.
- `src/lib/schemas.ts`: esquemas Zod de cliente, produto e pedido.
- `src/lib/cache-*`, `read-status-context.tsx`, `theme-context.tsx`: cache, indicadores de leitura e tema.
- `firestore.indexes.json`: índices compostos usados em listagens/pesquisas.
- `Documentacao/`: documentação histórica de arquitetura, fluxos e otimizações.

## 12. Referências de código relevantes

- Entrada/layout e autenticação: [src/app/layout.tsx](../src/app/layout.tsx), [src/components/auth-gate.tsx](../src/components/auth-gate.tsx), [src/components/inactivity-guard.tsx](../src/components/inactivity-guard.tsx).
- Shell e navegação: [src/app/dashboard/layout.tsx](../src/app/dashboard/layout.tsx), [src/components/app-shell.tsx](../src/components/app-shell.tsx).
- Páginas: [src/app/dashboard/page.tsx](../src/app/dashboard/page.tsx), [src/app/dashboard/clientes/page.tsx](../src/app/dashboard/clientes/page.tsx), [src/app/dashboard/pedidos/page.tsx](../src/app/dashboard/pedidos/page.tsx), [src/app/dashboard/agenda/page.tsx](../src/app/dashboard/agenda/page.tsx), [src/app/dashboard/produtos/page.tsx](../src/app/dashboard/produtos/page.tsx), [src/app/dashboard/metas/page.tsx](../src/app/dashboard/metas/page.tsx), [src/app/dashboard/relatorios/page.tsx](../src/app/dashboard/relatorios/page.tsx), [src/app/dashboard/graficos/page.tsx](../src/app/dashboard/graficos/page.tsx), [src/app/dashboard/exportacao/page.tsx](../src/app/dashboard/exportacao/page.tsx), [src/app/dashboard/configuracoes/page.tsx](../src/app/dashboard/configuracoes/page.tsx), [src/app/dashboard/notificacoes/page.tsx](../src/app/dashboard/notificacoes/page.tsx).
- Serviços e validação: [src/lib/customer-service.ts](../src/lib/customer-service.ts), [src/lib/order-service.ts](../src/lib/order-service.ts), [src/lib/product-service.ts](../src/lib/product-service.ts), [src/lib/goal-service.ts](../src/lib/goal-service.ts), [src/lib/user-service.ts](../src/lib/user-service.ts), [src/lib/notification-service.ts](../src/lib/notification-service.ts), [src/lib/schemas.ts](../src/lib/schemas.ts).
- Firebase e rotas servidor: [src/lib/firebase.ts](../src/lib/firebase.ts), [src/lib/firebase-admin.ts](../src/lib/firebase-admin.ts), [src/app/api/admin/approve-user/route.ts](../src/app/api/admin/approve-user/route.ts), [src/app/api/exports/complete/route.ts](../src/app/api/exports/complete/route.ts).

