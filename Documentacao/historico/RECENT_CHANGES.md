> Cópia histórica preservada em 21/10/2026. O conteúdo abaixo registra uma versão anterior; consulte o [índice atual](../README.md).

# Alterações recentes no código

Este documento resume as alterações feitas recentemente no repositório, por que foram feitas, arquivos afetados, como testar e passos recomendados para reduzir leituras Firestore.

Resumo das mudanças
- Clientes: adicionada exibição do total de clientes e assinatura em tempo real para a página de clientes (reduz leituras repetidas ao navegar).
- Metas: normalização de valores numéricos (formatos BR com vírgula/ponto) e validação para impedir períodos duplicados.
- Pedidos: melhoria da busca (suporte para buscar por pré-pedido, nota fiscal, nome do cliente), paginação incremental, debounce, deduplicação ao anexar páginas, e adição do seletor `Auto/Número/Texto` na UI.
- Busca: `fetchOrdersPage` reescrita para executar consultas otimizadas e para aceitar `searchType` (number/text/auto) evitando queries desnecessárias.
- Dashboard: cache de snapshot reforçado em `src/lib/dashboard-service.ts` para evitar leituras ao reabrir a página dentro do TTL e aplicar período somente após confirmação do intervalo.
- Dashboard: corrigido cálculo de `Peso Ano` em `src/app/dashboard/page.tsx` para usar corretamente o intervalo do período aplicado e carregar pedidos do ano até a data final selecionada.
- Dashboard: atualizada regra de *positivação histórica* — agora, para períodos anteriores ao ano atual, são contadas como positivados clientes que fizeram pedido no período mesmo que hoje estejam inativos; conversão e não-positivados ficam indisponíveis para períodos históricos.
- Produtos: implementado cache client-side persistente (memória + `localStorage`) em `src/lib/product-service.ts` para reduzir leituras; cache invalidado em create/update/delete/import e validado por `product_metadata/global`.
- Metas: implementado cache client-side persistente em `src/lib/goal-service.ts` para reduzir leituras; cache invalidado em create/update/delete e validado por `goal_metadata/global`.
- UI: correção de import faltante (`Select`), adição do botão "Próximo mês" no dashboard.

Arquivos principais alterados
- `src/app/dashboard/clientes/page.tsx` — assinatura em tempo real e contador de clientes.
- `src/lib/customer-service.ts` — (adicionado) `countCustomersInBase()` e `subscribeToCustomers()` (contadores ainda podem ser otimizados).
- `src/app/dashboard/page.tsx` — reforçado o uso de cache na dashboard e alterado o filtro de período para aplicar apenas após selecionar início e fim.
- `src/app/dashboard/pedidos/page.tsx` — UI do seletor de busca, debounce, paginação, chamada a `fetchOrdersPage` com `searchType`.
- `src/lib/order-service.ts` — `fetchOrdersPage` aceita `searchType` e faz queries direcionadas (pré-pedido, nota, cliente), merge/dedupe de resultados.
- `src/lib/goal-service.ts` — `parseNumberValue()` e verificação de unicidade do `period`.
- `src/components/goal-form.tsx` — ajustes de normalização ao salvar (UX permanece igual).
- `src/app/dashboard/page.tsx` — filtro por período e botão "Próximo mês".
- `src/lib/product-service.ts` — implementado cache client-side, `subscribeProducts()` e invalidação de cache em operações de escrita.

Como testar (passos rápidos)
1. Produtos
  - Abra a página de produtos e verifique que os produtos carregam normalmente.
  - Em outro painel (ou via console), crie/edite/exclua um produto e confirme que a UI atualiza após a operação (cache é invalidado).
  - Para forçar refresh e testar localStorage: no console do navegador execute `localStorage.removeItem('products_cache_v1')` e recarregue.

2. Pedidos (Busca)
  - Vá para a página de pedidos.
  - Teste buscas numéricas (pré-pedido / nota) selecionando `Número` e textuais selecionando `Texto`.
  - Teste `Auto` digitando números e textos para verificar detecção automática.
  - Valide que não há resultados duplicados ao rolar para carregar mais páginas.

3. Metas
  - Tente criar duas metas com o mesmo período (mesmo ano-mês) e confirme que a segunda é rejeitada.
  - Insira valores com vírgula (ex: `1.234,56`) e confirme que são interpretados corretamente.

Notas operacionais e limitações
- O `countCustomersInBase()` atualmente faz `getDocs()` e pode causar leituras altas em bases grandes — recomenda-se migrar para um contador agregado via Cloud Function ou usar o contador nativo do Firestore quando disponível.
- A busca de `fetchOrdersPage` quando em modo `Auto` ainda executa múltiplas queries em alguns cenários; forçar `searchType` reduz leituras.
- Cache de produtos é simples (TTL 5 minutos) e é invalidado completamente em operações de escrita. Podemos otimizar para atualizações parciais (inserir/atualizar/remover somente o registro afetado) para evitar recarregar toda a coleção.

Recomendações e próximos passos
1. Implementar contadores agregados para `clientes` e métricas de dashboard (Cloud Functions ou Firestore count aggregation).
2. Criar índice/campo `searchKeys` para produtos/pedidos se buscas prefix-match forem frequentes, permitindo uma única query indexada.
3. Tornar cache de produtos mais granular: aplicar patches locais no cache para create/update/delete ao invés de limpá-lo inteiro.
4. Adotar um serviço de busca (Algolia / Elastic / Firebase Extensions) se o volume de buscas crescer muito.

Links úteis
- Páginas a verificar: `src/lib/product-service.ts`, `src/lib/order-service.ts`, `src/app/dashboard/pedidos/page.tsx`, `src/app/dashboard/clientes/page.tsx`.

Se quiser, eu atualizo a `README.md` ou `Documentacao/PROJECT_DOCUMENTATION.md` com um sumário curto e estes links.

---
Gerado automaticamente pelo agente após alterações no código. Para dúvidas ou para eu adicionar passos de implantação, indique o que prefere documentar com mais detalhes.
