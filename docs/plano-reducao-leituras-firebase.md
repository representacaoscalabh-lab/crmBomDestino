# Plano de redução de leituras do Firebase

Data: 20/10/2026. Escopo: plano baseado no código atual; nenhuma alteração de consultas ou dados de produção foi feita nesta etapa. Acesso ao console e à medição real de cobrança ainda não foi realizado.

Atualização de implementação em 21/10/2026: parte substancial já foi implementada no código. O estado por recurso, as limitações e a sequência de publicação/migração estão em [Ativação da redução de leituras](ativacao-reducao-leituras-firebase.md). O plano abaixo descreve o destino completo; não significa que todos os recursos já estejam ativos em produção.

## 1. Diagnóstico do código

| Ponto | Comportamento atual | Prioridade |
| --- | --- | --- |
| `src/lib/store.tsx:92–97` | Seis listeners globais sem filtros: clientes, redes, produtos, bonificações, metas e condições de pagamento. | Alta |
| `src/lib/store.tsx:104–116` | Listener de todos os pedidos, exceto na página de bonificações; sair e voltar dessa página recria a assinatura. | Alta |
| `src/lib/store.tsx:118–135` | `refreshData` consulta novamente sete coleções inteiras. É utilizado na página de pedidos. | Alta |
| `src/lib/store.tsx:138–170` | Cadastro, importação e edição de clientes consultam todos os clientes no servidor para validar CNPJ. | Alta |
| Hooks de configurações Mart Minas e Oesa | Cada consumidor cria sua assinatura. AppShell e componentes de página usam os mesmos hooks. O SDK pode compartilhar consultas idênticas, mas o ciclo de vida deve ser centralizado. | Média |
| `src/lib/firebase.ts` | Inicialização padrão, sem estratégia explícita de cache persistente compartilhado entre abas. | Média |
| Pedidos e bonificações | Documentos incluem `items`; listagens recebem detalhes completos mesmo sem abrir um registro. | Média |
| Filtros, indicadores e relatórios | Dependem de arrays globais completos e de cálculos no navegador. | Alta |

O número de renders React não equivale a leituras faturadas. Instrumentar requisições, assinaturas e origem dos snapshots antes de atribuir custo. Cada alteração de um documento no listener também não implica necessariamente reler toda a coleção.

## 2. Arquitetura proposta

- Manter contexto global para autenticação e coordenação do cache, sem carregar automaticamente todas as entidades.
- Criar camada de consultas compartilhada: chave composta por usuário/escopo autorizado, coleção, filtros normalizados, ordenação, cursor e tamanho da página.
- Compartilhar tanto resultados quanto requisições em andamento. Consumidores simultâneos da mesma chave não iniciam novas consultas.
- Assinar somente consultas que precisam de tempo real; listagens históricas usam busca pontual paginada.
- Invalidar somente consultas afetadas por gravações. Nunca executar atualização global depois de editar um registro.
- Usar a mesma camada em páginas, modais, importações e relatórios, evitando caches independentes por componente.
- Limpar dados e assinaturas ao sair da conta ou perder autorização. Não permitir que um usuário receba o cache de outro.

Política inicial ajustável: páginas recentes por 2 minutos, cadastros auxiliares por 10 minutos e detalhes por 5 minutos. São tempos de frescor da aplicação; não garantem gratuidade das consultas ao servidor. Invalidar imediatamente após escrita local e oferecer atualização direcionada para alterações externas. Indicadores financeiros devem informar quando estão desatualizados ou em processamento.

## 3. Execução em etapas

### Etapa 0 — Medir e estabelecer referência

1. Registrar consultas por tela: chave, início/fim, quantidade de documentos retornados, tamanho aproximado recebido, origem servidor/cache e número de assinaturas ativas.
2. Medir os fluxos: entrada na dashboard; pedidos → bonificações → pedidos; abrir/fechar detalhes; aplicar filtros; atualizar; importar clientes/pedidos; trocar de aba e de conta.
3. Comparar com uso/cobrança no console. Contagem de documentos recebidos na aplicação é estimativa, não medição exata das leituras faturadas: há cache, índices, regras e transações.
4. Não registrar conteúdo de clientes, CNPJ ou dados pessoais na telemetria.

Entrega: referência mensurável por fluxo, antes das mudanças.

### Etapa 1 — Eliminar leituras desnecessárias

1. Substituir `refreshData()` por atualização por recurso/consulta. Se já houver listener compartilhado, evitar uma consulta paralela para obter a mesma atualização.
2. Centralizar configurações Mart Minas/Oesa em um único provedor com uma assinatura por documento e sessão.
3. Introduzir cache com deduplicação e invalidação direcionada.
4. Carregar produtos e condições de pagamento ao abrir formulários/importações; carregar metas apenas nas telas que as utilizam. Preservar dependências reais dos relatórios.
5. Migrar páginas individualmente para consultas delimitadas. Só remover um array global quando todos os seus consumidores tiverem alternativa correta.
6. Avaliar cache persistente multiaba para dispositivos confiáveis, com tratamento de indisponibilidade do IndexedDB e política de limpeza na troca de conta. Não habilitar indiscriminadamente em computadores compartilhados.

Entrega: atualização localizada e ausência de carregamentos globais sem consumidor. Esta etapa não deve introduzir `limit()` nos arrays que ainda alimentam relatórios completos.

### Etapa 2 — Paginação real, começando por bonificações e pedidos

1. Consulta inicial com 25 registros; opções de 25 e 50.
2. Ordenação estável por `issueDate` decrescente e ID como desempate; cursor por snapshot ou pelos valores completos da ordenação.
3. Próxima página com `startAfter`, sem `offset`. Buscar um registro adicional, quando necessário, para detectar existência da próxima página; contabilizar essa leitura.
4. Botões Anterior/Próxima, cache das páginas visitadas e pilha de cursores. Evitar salto para página arbitrária que exija percorrer o histórico.
5. Alterar filtros, ordenação ou tamanho da página reinicia os cursores. Resposta antiga não pode sobrescrever uma consulta mais recente.
6. Consultar somente ao clicar em Aplicar filtros; buscas de seletores podem usar atraso curto e mínimo de caracteres. Não disparar uma leitura a cada tecla.
7. Período inicial recomendado: mês atual, com indicação visível e opção de mudar. Na bonificação, a carteira inicial continua Mesclado.
8. Ordenar a consulta completa no servidor. Ordenar apenas os 25 registros carregados não deve parecer uma ordenação global.
9. Resumo e quantidade total usam consulta agregada ou resumo persistido separado; nunca somar apenas a página e chamar de total do filtro.
10. Resultado vazio deve ser distinguido de carregamento, erro e cache desatualizado.

**Seleção de bonificações:** caixinha do cabeçalho seleciona a página atual. Oferecer ação separada e explícita para selecionar todos os resultados filtrados, se necessária. Representar essa seleção por filtros e exclusões, sem baixar todos os documentos. Ações sobre todo o filtro precisam de processamento controlado no servidor; não depender do array visível. Preservar ou limpar seleção de forma explícita ao trocar filtros.

### Etapa 3 — Filtros indexados e documentos leves

1. Projetar os índices a partir das combinações reais de período, cidade, motivo, rede e carteira; versionar `firestore.indexes.json` e referenciá-lo em `firebase.json`.
2. Normalizar campos de filtro e ordenação. Garantir preenchimento retroativo antes de depender de `orderBy`, pois documentos sem o campo podem desaparecer dos resultados.
3. A carteira atual é derivada de `customer_groups.externalStoreSellers`. Definir uma projeção consultável que preserve essa regra: mudar o responsável de uma loja deve atualizar os índices/projeções e resumos afetados, inclusive históricos quando aplicável. Não congelar silenciosamente o responsável da data da venda.
4. Mesclado significa omitir a restrição de carteira. Para cidades e motivos múltiplos, planejar as combinações de `in`/OR respeitando o limite de disjunções. Exemplo: 6 cidades × 6 motivos pode exceder 30 disjunções.
5. Não resolver limites de filtros baixando toda a coleção. Adotar planejamento no backend com união ordenada, remoção de duplicatas e cursores por consulta, ou limitar combinações com feedback claro no produto.
6. Não prometer a busca atual por qualquer trecho de observação/cliente usando apenas índices simples. Validar estratégia: código exato, prefixos normalizados e, se indispensável, índice de busca dedicado. Preservar o comportamento de busca global ou comunicar claramente a mudança.
7. Separar cabeçalho/resumo de itens em pedidos e bonificações. Listagem usa documentos pequenos; visualizar/editar busca os detalhes por ID e os reutiliza no cache.
8. Se detalhes virarem subcoleção com um documento por item, cada item poderá exigir leitura própria. Avaliar documento de detalhes por registro, respeitando limites de tamanho. Não duplicar payload pesado na projeção.
9. Documentos menores reduzem tráfego, memória e tempo de resposta; não reduzem, por si só, a quantidade de leituras por documento.
10. Opções de cidades/motivos vêm de catálogos pequenos mantidos pelo sistema, e não de uma varredura de todas as bonificações para montar filtros.

Entrega: listagem leve com filtros aplicados antes da leitura e detalhes sob demanda.

### Etapa 4 — Dashboard e relatórios sem baixar o histórico inteiro

1. Usar `count`/`sum`/`average` quando atenderem ao indicador; essas consultas também têm cobrança e limitações. Cachear por chave de filtro.
2. Para indicadores recorrentes, manter resumos por dia, loja e rede; agregar somente os intervalos solicitados. Evitar um único documento global sujeito a contenção.
3. Atualizar resumos com processamento idempotente no backend, cobrindo inclusão, edição, exclusão, importação e mudança de responsável/rede. Prever reconciliação e reconstrução.
4. Comissões exigem fidelidade ao cálculo atual: soma da base por loja no período, percentual vigente, regra WRRJ/Sul de Minas e arredondamento por loja. Somar comissões diárias arredondadas pode divergir; preferir bases em centavos por loja e aplicar a regra no período consultado.
5. Lojas/clientes distintos não podem ser calculados somando contagens diárias. Usar dimensões por loja ou agregação própria para evitar duplicidade.
6. Relatórios de produtos carregam agregados por produto/loja/período, sem buscar todos os itens de todos os pedidos para qualquer aba.
7. Exportações completas são operações explícitas, paginadas em lotes, com progresso e possibilidade de cancelamento; não executadas na abertura da página.
8. Comparar custo adicional de escritas, armazenamento e processamento com a redução de leituras. Não presumir que toda materialização é mais barata.

### Etapa 5 — Validação de CNPJ sem varrer clientes

1. Introduzir CNPJ normalizado e consulta pontual como transição.
2. Para garantir unicidade sob concorrência, criar registro de reserva `customer_documents/{cnpjNormalizado}` vinculado ao cliente, mantido em transação por fluxo confiável e protegido por regras/backend.
3. Criar, trocar e excluir CNPJ atualizam a reserva de forma atômica. CNPJ ausente segue as regras atuais do cadastro.
4. Importação valida duplicatas no arquivo localmente e consulta/reserva somente CNPJs envolvidos. Não confiar apenas no cache para impedir duplicidade.
5. Auditar duplicatas históricas antes de criar as reservas. Preservar as leituras pontuais transacionais de pedidos que impedem importação duplicada.

## 4. Migração e testes

- Migração aditiva, em lotes com cursor, retomada e limites de execução; sem apagar os documentos atuais.
- Backfill de campos, detalhes e resumos com versão de esquema. Medir o custo único da migração separadamente.
- Publicar e validar índices/regras antes de ativar consultas dependentes.
- Alternância por funcionalidade para comparar resultados e permitir retorno à leitura anterior durante a migração.
- Testar no emulador: paginação com datas repetidas; nenhuma repetição/lacuna com conjunto estável; registros novos entre páginas; troca de filtros; seleção; totais globais; alterações de responsável; percentuais; exclusões; concorrência de CNPJ; falhas parciais de importação; regras de acesso.
- Testar cache: dois componentes pedindo a mesma consulta, retorno à página, duas abas, perda de conexão, logout e troca de usuário.
- Na comparação, nunca substituir erro ou relatório incompleto por zero financeiro.

## 5. Critérios de aceite

| Fluxo | Resultado esperado |
| --- | --- |
| Abrir bonificações | Apenas página inicial e auxiliares necessários; nenhum histórico de pedidos. |
| Abrir pedidos | Página inicial e auxiliares necessários; nenhum histórico completo de bonificações. |
| Próxima página | Uma consulta delimitada, sem reler páginas anteriores. |
| Retornar à página recente | Resultado compartilhado em cache dentro da política de frescor; nenhuma consulta duplicada em andamento. |
| Visualizar e editar o mesmo registro | Detalhes reutilizados enquanto válidos. |
| Atualizar uma listagem | Atualização apenas da consulta ativa e agregados afetados. |
| Selecionar registros | Nenhuma leitura adicional somente para marcar caixas. |
| Aplicar filtros | Filtra o conjunto completo no servidor; totais independem da página. |
| Dashboard | Consultas de período/resumos; nenhum download automático do histórico completo. |
| Cadastrar/editar cliente | Sem consulta de todos os clientes para validar um CNPJ. |

Meta de engenharia: custo de abrir uma listagem proporcional ao tamanho da página e seus auxiliares, e não ao tamanho do banco. Quantificar a redução percentual somente após a referência e o teste com dados representativos. Leituras de índices, regras e consultas agregadas devem entrar na avaliação.

Ordem recomendada: medição → cache/atualização direcionada/configurações → piloto paginado de bonificações com totais corretos → pedidos → dashboard/relatórios → demais cadastros. A reserva de CNPJ pode ser uma entrega independente após medição e auditoria.

## Referências oficiais

- Cobrança, listeners, reconexão e cursores versus offsets: https://firebase.google.com/docs/firestore/pricing
- Cache offline e múltiplas abas: https://firebase.google.com/docs/firestore/manage-data/enable-offline
- Consultas e limites de disjunções: https://firebase.google.com/docs/firestore/query-data/queries
- Agregações em leitura: https://firebase.google.com/docs/firestore/query-data/aggregation-queries
- Agregações na escrita: https://firebase.google.com/docs/firestore/solutions/aggregation
