> Referência histórica — versão anterior ou proposta de evolução. Este arquivo não comprova o estado atual nem a publicação no Firebase. Consulte o [índice atual](README.md), a [arquitetura](TECHNICAL.md) e o [guia de ativação](../docs/ativacao-reducao-leituras-firebase.md). Marcado em 21/10/2026.

# Dashboard, Clientes e Relatórios — estado atual e melhorias

## Objetivo

Este documento registra o que já foi implementado nas áreas de dashboard, clientes e relatórios, além das oportunidades de melhoria para reduzir leituras Firestore, melhorar a experiência e manter o sistema escalável.

## 1. O que já foi feito

### Dashboard

- Implementado cache local para o snapshot do dashboard em [src/lib/dashboard-service.ts](src/lib/dashboard-service.ts).
- O dashboard passa a reutilizar dados em cache por até 30 minutos, evitando novas consultas repetidas para os mesmos dados.
- Adicionado indicador visual de última atualização para mostrar se os dados vieram do cache ou da rede.
- Ajustado o carregamento inicial para usar o mês atual como valor padrão de filtro.
- Mantido o comportamento de cálculo das métricas e gráficos com base nos dados carregados.
- Consolidado o filtro de período em um único passo: o usuário agora escolhe data de início e data de fim e aplica o intervalo somente ao clicar em "Aplicar período", reduzindo leituras parciais durante a seleção.
- Corrigido o cálculo de `Peso Ano` para considerar corretamente o período aplicado e carregar os pedidos do ano até a data final filtrada.

### Clientes

- A página de clientes passou a carregar os dados em páginas menores, reduzindo o volume inicial de leitura.
- Implementado debounce na busca para evitar disparos excessivos de leitura durante digitação.
- Adicionada indicação de carregamento para melhorar a percepção de resposta durante a busca e paginação.
- O filtro por busca foi ajustado para priorizar prefixos de texto e código, reduzindo a necessidade de varredura completa.
- A paginação foi reorganizada para impedir recarregamentos desnecessários ao navegar na lista.

### Relatórios

- Implementado cache por combinação de filtros de data e status em [src/lib/report-data-service.ts](src/lib/report-data-service.ts).
- A tela de relatórios agora usa o mês atual como intervalo padrão, reduzindo a necessidade de reprocessar filtros vazios ou iniciais.
- A renderização de linhas foi limitada por página para melhorar performance e reduzir o custo inicial de renderização.
- O carregamento de dados foi isolado em um serviço dedicado, facilitando manutenção e futuras otimizações.
- Produtos e metas agora usam cache local persistente para reduzir leituras Firestore, com invalidação automática em operações de escrita.

## 2. Impacto nas leituras Firestore

### Resultado geral

A redução de leituras foi significativa, principalmente em cenários de uso repetido, porque o sistema passou a reutilizar dados em cache em vez de buscar tudo novamente a cada navegação.

### Estimativa prática

- Dashboard: alto impacto, com leituras quase interrompidas enquanto o cache estiver fresco.
- Clientes: impacto médio/alto, principalmente por conta da paginação e do debounce.
- Relatórios: impacto alto em uso repetido, graças ao cache por filtros.

### Ponto importante

A maior redução vem de evitar consultas repetidas para o mesmo conjunto de dados. Isso é particularmente eficaz em páginas que são abertas várias vezes ao longo da sessão.

## 3. O que ainda pode ser melhorado

### Dashboard

- Considerar agregações pré-calculadas para métricas mais pesadas, como peso mensal, ticket médio e número de clientes ativos.
- Se o volume crescer, migrar parte do cálculo para uma função server-side ou para uma coleção de resumo.
- Avaliar se a lógica de métricas pode ser cacheada por período e por loja com chave mais granular.

### Clientes

- O maior ponto de melhoria ainda é a busca. Hoje ela ainda depende de uma abordagem mais próxima de varredura e filtragem local em alguns cenários.
- Idealmente, a busca deve ser movida para consultas mais direcionadas no Firestore, com índices ou campos auxiliares para prefixos e texto.
- Criar uma estratégia de paginação com cursor mais robusta para reduzir ainda mais o número de documentos lidos ao navegar.

### Relatórios

- Em vez de carregar todos os pedidos, clientes e produtos para montar cada relatório, seria interessante separar os relatórios em fluxos específicos por tipo de análise.
- Para volumes grandes, usar agregações ou coleções de resumo por período reduziria bastante o custo de leitura.
- Criar cache com invalidação mais inteligente por entidade alterada, em vez de depender apenas do tempo TTL.

## 4. Recomendação de prioridade

### Prioridade alta

1. Melhorar a busca de clientes com consultas mais inteligentes.
2. Introduzir agregações ou resumos para relatórios pesados.
3. Adicionar invalidação de cache baseada em eventos de escrita, não apenas por tempo.

### Prioridade média

4. Migrar partes do dashboard para métricas pré-calculadas.
5. Criar um padrão comum de cache entre dashboard, clientes e relatórios para reduzir inconsistências.

## 5. Conclusão

O sistema já apresentou uma melhora real na eficiência de leitura, principalmente por conta de cache local e da redução do volume inicial de carregamento. Ainda há espaço para evoluir, principalmente na busca de clientes e na arquitetura de relatórios, mas o estado atual já representa um avanço sólido sem comprometer a experiência do usuário.

## 6. Atualização: Positivação histórica

- Comportamento novo: para períodos anteriores ao ano atual (ex.: janeiro/2024), a dashboard passa a contar como "positivados" todos os clientes que fizeram pelo menos um pedido no período, independentemente do status atual (`Ativo`/`Inativo`). Isso evita que relatórios históricos contenham contagens inconsistentes quando clientes foram marcados como inativos após o período analisado.
- Impacto operacional: a regra preserva a integridade histórica das métricas e evita mudanças retroativas por atualizações de status. A métrica de "conversão" e o valor "clientes não positivados" continuam disponíveis apenas para o ano corrente (ou períodos considerados ativos), pois dependem do estado atual dos clientes.

## 7. Recomendações rápidas

- Para reduzir leituras Firestore ao calcular positivação e métricas históricas, considere agregar/armazenar resumos mensais (coleção de `summaries`), acessíveis em O(1) pela dashboard.
- Evitar leituras completas de `customers` em caminhos críticos; use cache com metadata e, quando necessário, batch-get por IDs referenciados nos pedidos.
- Mover agregações pesadas de relatórios para um endpoint server-side (Cloud Function / API) que retorne dados já agregados e paginados.

