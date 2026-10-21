> Referência histórica — versão anterior ou proposta de evolução. Este arquivo não comprova o estado atual nem a publicação no Firebase. Consulte o [índice atual](README.md), a [arquitetura](TECHNICAL.md) e o [guia de ativação](../docs/ativacao-reducao-leituras-firebase.md). Marcado em 21/10/2026.

# Visualização e leituras dos relatórios

## Comportamento

- O seletor de módulos abre por clique e fecha por novo clique, Escape, saída de foco ou clique externo.
- Configurações mantém usuários, perfis, aprovação, rejeição e exclusão. Telemetria e armazenamento foram retirados dessa página. A alteração de perfil e a exclusão atualizam a lista local, sem buscar novamente todos os usuários.
- Relatórios gerais só monta a análise depois da escolha no modal. Filtros permanecem ao trocar de relatório. Dados equivalentes compartilham cache e requisições simultâneas são deduplicadas.
- Ao trocar rapidamente entre opções, aguarda 180 ms antes de iniciar. Apenas um carregamento de relatório fica em andamento; seleções intermediárias em espera são descartadas. Uma consulta Firestore já enviada precisa terminar, mas não atualiza uma seleção diferente. Só os cálculos da análise selecionada são executados.
- Crescimento abre os filtros com clientes ativos, mês atual e mês anterior. A tabela mostra cliente/cidade e peso dos dois meses, com anos explícitos. O mesmo fluxo atende `/dashboard/crescimento/relatorio`.
- A seleção de clientes aceita pesquisa por trecho do nome/código, seleção individual, todos e exclusões. A pesquisa ignora acentos e caixa, encontra nomes precedidos por códigos e funciona sem campos de busca normalizados. Examina até 100 candidatos por ação, reaproveitando páginas em cache; quando há mais candidatos, oferece **Continuar busca**, mesmo se ainda não encontrou resultados. Essa compatibilidade pode ler mais cadastros que a busca antiga por prefixo, mas não lê pedidos nem carrega toda a coleção automaticamente.
- Clientes são consultados por cursor: até 10 por lote e um documento adicional para detectar a próxima página. A lista do filtro também é paginada e tem cache. A consulta inicial da lista pode ser reutilizada pelo primeiro lote do relatório.
- Só são consultados pedidos dos clientes do lote, nos meses escolhidos. Carteira do mês atual e deduplicação por pré-pedido seguem o tratamento dos relatórios existentes. Referências por ID, código ou nome são aceitas; a loja diferencia referências legadas quando informada no pedido.
- Exportação do crescimento inclui somente os clientes já carregados, sem consultas extras.
- A tabela tem grade e cidade em texto menor e negrito. Clique no mês para alternar peso decrescente/crescente entre os clientes carregados; a exportação segue essa ordem. A variação é `(principal − comparado) / comparado × 100`, verde para aumento, vermelha para queda e amarela para zero. Se o comparado for zero e o principal não, exibe **Sem base**, pois não existe percentual finito; dois pesos zerados exibem 0%.

## Limites da economia

Um lote de 10 clientes **não equivale a 10 leituras de pedidos**: são lidos os pedidos correspondentes desses clientes nos períodos. A leitura de coleções inteiras foi eliminada do novo crescimento, mas clientes com muitos pedidos ainda geram leituras proporcionais ao volume.

Relatórios gerais de totais, frequência e positivação precisam dos registros que compõem os resultados. O botão de paginação dessas tabelas limita a exibição, não as leituras. A economia implementada nessa página vem da escolha prévia, filtros de período, cache compartilhado e carregamento apenas das fontes necessárias. Uma redução adicional exigiria agregados mantidos no servidor, com conciliação após importações, alterações e exclusões; isso não foi introduzido para preservar o funcionamento atual.

A análise histórica de clientes e a página de gráficos continuam disponíveis. Nenhuma economia percentual foi estimada sem medir o uso real.

## Crescimento de Produtos

A página `/dashboard/crescimento/produtos` segue o mesmo fluxo visual de Crescimento de Clientes (`/dashboard/crescimento`): modal inicial, mês atual/anterior, produtos ativos por padrão, seleção com pesquisa e exclusões, lotes de até 10 produtos, grade, ordenação dos registros carregados, percentual colorido e exportação dos registros exibidos. Permite comparar peso (kg, padrão) ou a quantidade registrada nos itens dos pedidos, sem conversão de unidades.

O catálogo é paginado no Firestore e a busca por trechos examina no máximo 100 candidatos por ação, com cache. Nenhum pedido é consultado ao abrir o filtro. Depois de aplicar, os pedidos dos dois meses são lidos e resumidos por produto. Os próximos lotes e a troca da métrica reutilizam esses resumos enquanto o cache estiver válido. Alterações em pedidos invalidam os resumos; alterações no catálogo invalidam as páginas de seleção.

Os produtos estão armazenados dentro do array de itens de cada pedido. Por isso, a seleção de um produto **não restringe as leituras de pedidos àquele produto**: é necessário consultar os pedidos dos meses escolhidos para obter os totais. Não são consultados outros meses, e não há nova leitura por lote enquanto o cache permanecer válido. O tratamento de carteira, exclusões e duplicidade por pré-pedido permanece o do serviço de relatórios existente. Essa versão não altera os pedidos nem grava novos agregados no banco.

## Publicação e validação

Foram acrescentados quatro índices compostos em `firestore.indexes.json`. Publique-os no banco configurado e aguarde ficarem disponíveis antes de validar as consultas novas:

```powershell
firebase.cmd deploy --only firestore:indexes --project wrrjbeckup
```

Testes isolados, sem rede ou gravações no Firebase:

```powershell
node --test scripts/test-report-loading.mjs
```

Os testes cobrem limites e continuidade da paginação, status, busca normalizada, isolamento por cliente/período/loja, carteira, deduplicação e carregamento por tipo de relatório. A validação visual e as consultas com dados reais requerem uma sessão autenticada no navegador.

