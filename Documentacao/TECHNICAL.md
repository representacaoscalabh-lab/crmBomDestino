# Arquitetura e referência técnica

Atualizado em **21/10/2026**. Referência do código atual; não descreve a antiga estrutura `/dashboard/*`.

## Stack declarada

Conforme `package.json`: Next.js `^16.4.0`, React `^19.0.0`, TypeScript `^5.7.2`, Firebase Web `^13.0.0` e Firebase Admin `^14.5.0`. A resolução exata está em `package-lock.json`.

A interface usa CSS global e arquivos CSS por componente, com Lucide React. Planilhas usam `@e965/xlsx` e ExcelJS; PDFs usam PDF.js e OCR usa Tesseract.js. Tailwind, Shadcn/UI, Recharts, TanStack Table, Zod e React Hook Form não constam nas dependências atuais.

`functions/package.json` é um pacote separado: Node.js 22, Firebase Functions 6.6.0 e Firebase Admin `^13.0.0`.

## Estrutura

```text
src/app/                    Páginas, layout e rotas HTTP
src/components/             Shell, controles, relatórios e formulários
src/lib/                    Tipos, autenticação, consultas, importadores e cálculos
public/                     Favicon e arquivos estáticos
tests/                      Testes Node.js, modelos, importação e renderização
functions/                  Funções e núcleo de agregação diária
scripts/                    Backfills e verificação dos resumos
docs/                       Plano e ativação das otimizações do Firebase
Documentacao/               Guias do projeto e referências históricas
firestore.rules             Permissões do banco
firestore.indexes.json      Índices e campos sem indexação
firebase.json               Regras, índices, funções e configuração de emuladores
```

## Autenticação e permissões

`firebase.ts` inicializa `auth` e `db`. `auth.tsx` acompanha a sessão Google e o documento `users/{uid}`. `AuthGate` controla o acesso visual. A autorização efetiva está nas regras Firestore e na validação das rotas administrativas.

`POST /api/auth/bootstrap` valida o token, o email verificado e `FIREBASE_ADMIN_EMAIL` para provisionar o primeiro administrador. `POST /api/crm/records` valida token e aprovação atual antes de acessar dados ou responder a partir do cache. O Admin SDK ignora as regras do cliente, por isso essa checagem é obrigatória.

As credenciais administrativas são lidas somente no servidor por `firebase-admin.ts`. Não há inicialização de Storage ou Analytics em `firebase.ts` apenas porque seus identificadores aparecem no `.env.example`.

## Camada de leitura

| Arquivo | Responsabilidade |
| --- | --- |
| `src/lib/store.tsx` | Contexto, cadastros auxiliares por rota/demanda, gravações e invalidação. |
| `src/lib/query-cache.ts` | Cache em memória, requisições simultâneas compartilhadas, TTL e invalidação. |
| `src/lib/use-record-page.ts` | Estado da paginação, filtros, detalhes, totais e atualização. |
| `src/app/api/crm/records/route.ts` | Consultas de listagem, projeção de campos, detalhes e totais com Admin SDK. |
| `src/lib/client-record-query.ts` | Alternativa pelo SDK Web quando a API informa ausência da credencial Admin. |
| `src/lib/record-query.ts` | Tipos e correspondência de filtros compartilhados. |
| `src/lib/use-period-records.ts` | Conjunto completo para um intervalo explícito, em lotes de 250. |
| `src/lib/use-dashboard-records.ts` | Escolha entre documentos originais e resumos diários, conforme a flag. |
| `src/lib/export-records.ts` | Exportações completas sob demanda, em lotes e com cancelamento. |
| `src/lib/shared-report-settings.ts` | Assinatura compartilhada de configurações Mart Minas/Oesa. |
| `src/lib/firestore-metrics.ts` | Contadores locais de consultas/documentos, sem conteúdo dos registros. |

O cache padrão usa TTL de dois minutos. Cadastros auxiliares usam dez minutos e detalhes no cliente usam cinco minutos. As chaves incluem usuário, filtros, período, cursor e outros parâmetros pertinentes. Escritas invalidam recursos afetados; respostas de consultas antigas não devem substituir a consulta atual.

Não há cache persistente em `localStorage`/IndexedDB habilitado por padrão. Listener de configuração/autorização não significa que todas as coleções comerciais continuem assinadas globalmente.

### Paginação e busca

As listas usam `issueDate` e ID como desempate, `limit` e cursor, sem `offset`. A página contém 25 ou 50 registros. Totais completos não são calculados somando somente a página.

A busca por trecho e o fallback de cidade do cadastro exigem verificação quando não podem ser representados pelos índices atuais. Cada solicitação de lista verifica até 250 documentos no período e pode devolver um cursor sem preencher a página. Totais avançados são explícitos e processados em lotes de até 500, canceláveis entre lotes. Isso não equivale a um índice textual dedicado.

Com Admin SDK, a projeção exclui `items` das listas. No fallback Web, o Firestore entrega documentos completos; os detalhes já recebidos são reutilizados em cache. Não aplicar `limit` aos arrays de relatórios e depois apresentá-los como dados completos.

## Modelo Firestore

| Coleção/documento | Uso |
| --- | --- |
| `users`, `access_requests` | Perfil, aprovação e solicitações. |
| `customers`, `customer_groups` | Lojas, CNPJ, rede e responsáveis atuais. |
| `products` | Catálogo e embalagens. |
| `orders` | Pedidos com itens, valores e pesos. |
| `bonifications` | Bonificações e amostras com itens, separadas de pedidos. |
| `goals`, `payment_terms`, `sellers` | Cadastros auxiliares. |
| `settings/mart_minas`, `settings/oesa_nova_safra` | Rede vinculada e nome do relatório. |
| `settings/read_optimization` | Manifesto de manutenção e ativação das reservas de CNPJ. |
| `customer_documents` | Reservas de CNPJ, após migração/ativação. |
| `daily_orders`, `daily_bonifications` | Resumos diários por cliente, escritos pelo backend após publicação. |
| `aggregate_states` | Estado de agregação por documento para idempotência. |

Os tipos principais estão em `src/lib/types.ts`. A atribuição de carteira usa `customer_groups.externalStoreSellers` e o vínculo atual do cliente. A unicidade de pedido usa cliente + pré-pedido no ID do documento; importações e alterações de identidade usam transação.

## Agregações e implantação

`functions/aggregate-core.cjs` relê o documento de origem e o estado anterior na mesma transação, aplica o delta e atualiza o resumo. Repetição de evento, edição, troca de dia/cliente e exclusão são tratadas sem duplicar o total. Os valores são armazenados em centavos e os produtos são consolidados.

As funções, regras e scripts estarem versionados não comprova publicação. Flags públicas são incorporadas no build e permanecem `false` por padrão. Regras novas, resumos, reservas e índices precisam de validação e migração: [procedimento completo](../docs/ativacao-reducao-leituras-firebase.md).

## Validação e limites conhecidos

Comandos: `npm.cmd run lint`, `npm.cmd test` e `npm.cmd run build`. Os testes usam Node Test Runner, transpilações de módulos TypeScript, dublês de Firestore e renderização estática React.

A última execução registrada nesta sessão concluiu **102 testes**; houve também build de produção e verificações TypeScript/ESLint. Isso não substitui testes das regras no emulador nem reconciliação de uma base real. Migrações/publicação não foram executadas por ausência de credencial administrativa no ambiente inspecionado; o Java para o emulador também não estava disponível.

Cadastros auxiliares ainda podem ser lidos completos onde necessários; seletores remotos e paginação desses cadastros são trabalho posterior. Os contadores locais não são uma estimativa exata da fatura do Firebase.
