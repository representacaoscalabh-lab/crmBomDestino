# Relatórios de redes: Mart Minas e OESA – Nova Safra

Atualizado em **21/10/2026**. Rotas: `/relatorios/mart-minas` e `/relatorios/oesa-nova-safra`.

## Rede e carteiras

Cada página utiliza seu vínculo próprio em `settings/mart_minas` ou `settings/oesa_nova_safra`, definido em Configurações. `groupId` identifica a rede e `reportName` permite personalizar o título.

O layout compartilhado está em `src/components/network-reports-page.tsx`. As opções são **Comissões**, **Crescimento**, **Produtos por loja** e **Produtos**. A seleção inicial é Comissões, mês atual de São Paulo até hoje e carteira WRRJ. O seletor permite WRRJ, Mesclado e Sul de Minas.

Os responsáveis e o vínculo da loja são os atuais do cadastro, inclusive para pedidos antigos. As lojas da rede podem aparecer sem pedidos para permitir analisar ausência de compra. O acompanhamento começa em **01/10/2026**.

## Comissões

A base é composta por pedidos normais do período; bonificações ficam fora. Os percentuais são configurados na rede:

- `commissionPercent`: percentual da representação WRRJ.
- `sellerCommissionPercent`: percentual do Sul de Minas.
- `sellerCommissionBase`: `orders` ou `representation`.

Cada loja gera somente a comissão de seu responsável. A base da loja é somada e arredondada em centavos antes de calcular a comissão. Se a base externa for `representation`, a comissão de representação é apenas referência para o percentual externo e não vira comissão WRRJ adicional.

Os cards de resumo usam a rede completa no período e apresentam WRRJ, Sul de Minas e o consolidado. A tabela segue a carteira e os filtros escolhidos. Pesquisa, cidade e atividade refinam as linhas; ausência de percentual é apresentada como pendência, sem assumir uma taxa.

Na dashboard, o bloco **Comissões Mart Minas** usa apenas Mart Minas, soma as duas carteiras e mostra cada comissão separada. Os outros indicadores da dashboard mantêm seu recorte WRRJ.

## Crescimento

A análise compara peso atual com a média dos meses anteriores selecionados. Até três meses anteriores disponíveis desde outubro de 2026 podem compor a média. Meses sem compras contam como zero quando fazem parte da comparação; meses inexistentes antes do início do acompanhamento não são incluídos.

A média é a soma dividida pela quantidade de meses ativos. A variação usa `(peso atual − média) / média × 100` quando a base é positiva. Sem meses de comparação ou sem base positiva, a tela indica a ausência de comparação em vez de fabricar crescimento percentual.

## Produtos por loja

Consolida caixa e meia caixa pelo produto canônico. Exibe unidades, peso, valor, comparação e histórico por loja, com detalhamento dos produtos e exportação. O mês é selecionado com corte até a data final; o mês anterior comparável respeita o dia disponível.

Classificações como Sem recompra, Retomou a compra e Primeira compra registrada são baseadas no histórico disponível. Não significam confirmação de estoque, demanda futura ou cliente novo. O histórico necessário é consultado até a data final, sem incluir pedidos futuros.

## Produtos e exportações

A visão Produtos consolida o catálogo da rede, embalagens, peso, valores e referências de preço dos pedidos. Cada componente possui sua própria exportação e escopo; não assumir que as quatro visões geram a antiga exportação única de oito abas.

Valores representam pedidos registrados. Os totais dos pedidos podem diferir da soma dos itens se os dados de origem estiverem inconsistentes. Bonificações são analisadas separadamente na central de relatórios.

## Consultas e validação

As consultas ficam delimitadas ao intervalo necessário. Comissões e Produtos usam o período escolhido; visões que dependem de histórico consultam desde o início do acompanhamento até o corte. O cache compartilha consultas repetidas. As configurações de cada rede têm assinatura compartilhada por sessão.

Os testes de `tests/commission.test.mjs`, `tests/mart-minas-analytics.test.mjs` e `tests/store-products.test.mjs` cobrem cálculos, carteiras, isolamento entre redes, datas, produtos, exportações e renderização. Bibliotecas analíticas antigas ainda presentes no código não significam que todos os seus controles estejam na página atual.
