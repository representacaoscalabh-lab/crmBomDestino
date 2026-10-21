> Referência histórica — versão anterior ou proposta de evolução. Este arquivo não comprova o estado atual nem a publicação no Firebase. Consulte o [índice atual](README.md), a [arquitetura](TECHNICAL.md) e o [guia de ativação](../docs/ativacao-reducao-leituras-firebase.md). Marcado em 21/10/2026.

# Plano de otimizações futuras

## Visão geral

Este documento organiza as próximas melhorias para reduzir leituras no Firestore, melhorar a performance e preservar a estabilidade do sistema. A proposta é priorizar ações com alto impacto e baixo risco antes de avançar para mudanças mais arquiteturais.

## Estratégia geral

A otimização será feita em três níveis:

1. Reduzir leituras repetidas em telas já existentes
2. Tornar consultas mais seletivas e menos amplas
3. Introduzir agregações e resumos para evitar leitura completa em dashboards e relatórios

## Plano por prioridade

### Fase 1 — Baixo risco e alto impacto

#### 1. Melhorar a busca de clientes e pedidos
- Objetivo: reduzir consultas amplas e evitar leitura desnecessária em telas de listagem.
- Ações:
  - criar campos auxiliares de busca, como `searchKey` ou `searchTokens`
  - usar prefixos e filtros mais específicos no Firestore
  - evitar reconsultar a mesma lista ao navegar entre páginas
- Impacto esperado: alto
- Risco: baixo
- Critério de sucesso: menos leituras em buscas e melhor tempo de resposta

#### 2. Implementar invalidação inteligente de cache
- Objetivo: evitar servir dados desatualizados e reduzir reprocessamento desnecessário.
- Ações:
  - invalidar cache ao criar, editar ou excluir pedidos, clientes e produtos
  - separar cache por tela e por combinação de filtros
- Impacto esperado: alto
- Risco: baixo
- Critério de sucesso: cache refletindo mudanças sem depender só de tempo TTL

#### 3. Melhorar o cache de relatórios
- Objetivo: evitar reprocessar os mesmos relatórios várias vezes.
- Ações:
  - cache por filtro de data/status/tipo de relatório
  - cache em memória para uso dentro da sessão
- Impacto esperado: médio/alto
- Risco: baixo
- Critério de sucesso: redução de carregamentos repetidos ao alternar filtros

### Fase 2 — Médio risco e alto impacto

#### 4. Criar agregações para dashboard
- Objetivo: reduzir a necessidade de ler muitos documentos para montar métricas.
- Ações:
  - criar uma coleção de resumo, como `dashboard_summary`
  - gerar métricas já calculadas por período, loja e tipo de dado
- Impacto esperado: alto
- Risco: médio
- Critério de sucesso: dashboard carregando métricas com menos leitura e em menos tempo

#### 5. Criar agregações para relatórios
- Objetivo: reduzir leitura completa em páginas analíticas.
- Ações:
  - montar resumos por cliente, cidade, produto e período
  - separar relatórios simples de relatórios complexos
- Impacto esperado: alto
- Risco: médio
- Critério de sucesso: relatórios pesados ficando mais rápidos e baratos

#### 6. Adicionar observabilidade de leitura
- Objetivo: medir com precisão onde o sistema ainda lê demais.
- Ações:
  - registrar contagem de leituras por tela
  - monitorar o custo por fluxo principal
- Impacto esperado: médio
- Risco: baixo
- Critério de sucesso: ter dados reais para priorizar melhorias futuras

### Fase 3 — Médio/alto risco e impacto estratégico

#### 7. Separar modelo transacional e modelo analítico
- Objetivo: preparar o sistema para escalar sem depender de leitura completa de documentos transacionais.
- Ações:
  - criar uma camada de leitura analítica
  - manter o modelo operacional simples e o modelo analítico otimizado para consultas
- Impacto esperado: alto
- Risco: médio/alto
- Critério de sucesso: sistema mais escalável e com custo de leitura previsível

#### 8. Avaliar busca externa
- Objetivo: substituir consultas locais e pesadas por uma camada de busca dedicada.
- Ações:
  - avaliar Algolia, Elastic ou solução equivalente
  - usar somente se o volume de dados ou buscas crescer muito
- Impacto esperado: médio/alto
- Risco: alto
- Critério de sucesso: buscas mais rápidas e com menor custo operacional

## Critérios de sucesso

- reduzir significativamente o número de leituras repetidas
- melhorar tempo de resposta das telas principais
- manter a estabilidade do sistema durante as mudanças
- preservar a correção dos dados já exibidos ao usuário

## Checklist executivo

- [ ] Melhorar busca de clientes e pedidos
- [ ] Implementar invalidação inteligente de cache
- [ ] Melhorar cache de relatórios
- [ ] Criar agregações para dashboard
- [ ] Criar agregações para relatórios
- [ ] Adicionar observabilidade de leitura
- [ ] Separar modelo transacional e analítico
- [ ] Avaliar busca externa

## Resumo

O plano prioriza mudanças simples e de baixo risco primeiro, para gerar ganho rápido, e depois avança para melhorias arquiteturais que trarão maior impacto em volumes maiores. Isso permite reduzir custo de leitura sem comprometer a estabilidade do sistema.

## Notas adicionais

- Agregações e resumos (prioridade alta): criar coleções de resumos mensais/por-loja para métricas pesadas (ex.: `summaries/monthly/{YYYY}-{MM}`). Campos sugeridos: `weight`, `ordersCount`, `positivations`, `revenue`, `updatedAt`.
- Atualização incremental: usar Cloud Functions acionadas em criação/atualização/exclusão de pedidos para manter os resumos idempotentes e consistentes.
- Relatórios server-side: para relatórios que hoje agregam no cliente, implementar endpoints que retornem dados já agregados e paginados, evitando download massivo de documentos para o browser.

