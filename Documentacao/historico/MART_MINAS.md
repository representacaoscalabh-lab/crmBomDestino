> Cópia histórica preservada em 21/10/2026. O conteúdo abaixo registra uma versão anterior; consulte o [índice atual](../README.md).

# Acompanhamento comercial Mart Minas

Página: `/relatorios/mart-minas`. A rede continua sendo definida em Configurações. As análises usam os cadastros, pedidos e bonificações já sincronizados pelo CRM, sem novas gravações ou índices no Firestore.

## Seleção e comparações

O acompanhamento começa em **01/10/2026**. Períodos anteriores são excluídos do histórico e não entram como zeros na média. No mês inicial não há variação ou alertas de crescimento/queda; a média usa até três períodos anteriores disponíveis desde o início. Comparações anuais só aparecem quando a base anual estiver dentro do acompanhamento.

- Padrão: mês atual de São Paulo, nossa carteira, pedidos normais e seis meses de histórico.
- Carteiras: nossa, outros vendedores, vendedor específico e total da rede. A atribuição considera a rede e o vendedor **atuais**, inclusive para pedidos antigos.
- Mês atual: dia 1 até hoje; todos os períodos anteriores comparados também terminam nesse dia, limitado ao último dia de cada mês. Meses passados são comparados inteiros.
- Média: três períodos imediatamente anteriores, incluindo meses sem registros como zero. A tela sinaliza meses sem pedidos da rede na base da média, sem afirmar que a importação está completa.
- Variação: `(atual − anterior) / anterior × 100`. Base anterior não positiva resulta em “Sem base”.
- Comparação anual: mesmo mês do ano anterior, com o mesmo corte de dias.
- Os campos **De** e **Até** ativam um período personalizado, inclusive entre meses. Ambos são obrigatórios nesse modo, sem datas futuras ou início posterior ao fim. A comparação passa a usar o intervalo imediatamente anterior com o mesmo número de dias; a média usa os três intervalos anteriores, sem sobreposição. O histórico exibe seis ou doze intervalos. A comparação anual usa as mesmas datas no ano anterior, limitando 29 de fevereiro a 28 quando necessário. **Voltar ao mês** restaura a seleção mensal. A exportação respeita o modo ativo.

## Lojas e produtos

As lojas aparecem mesmo sem pedidos. A ordenação inicial prioriza perdas absolutas em kg. A tabela permite pesquisa, filtro por situação e ordenação; selecionar a loja abre o detalhamento de produtos e oportunidades de mix.

“Sem recompra” significa compra no período anterior e nenhuma no atual. “Retomada” exige algum pedido antigo, ausência no período anterior e pedido atual. “Primeira compra registrada” indica apenas o primeiro registro disponível, sem presumir cliente novo. A evolução das mesmas lojas inclui exclusivamente aquelas com pedidos nos dois períodos.

Intervalo habitual: mediana dos intervalos entre as últimas oito datas distintas de compra nos seis meses de calendário terminados no mês selecionado. Exige pelo menos quatro datas; alerta quando os dias sem compra superam 1,5 vez essa mediana. Não são usados pedidos posteriores ao corte.

Produtos são consolidados pelo `productId`, unificando caixa e meia caixa. Peso por produto usa `item.totalWeight`, unidades usam `unitQuantity` e valor usa `subtotal` (ou o cálculo de embalagem com desconto quando ausente). Totais de lojas usam os totais dos pedidos; inconsistências de origem podem causar divergências com os itens. Participação do produto é calculada sobre o peso dos itens.

Oportunidades de mix mostram até dez produtos comprados por outras lojas selecionadas e ausentes na loja no período, ordenados por kg da carteira. Não são previsão de demanda ou confirmação de disponibilidade.

## Bonificações e exportação

Bonificações respeitam período e carteira, sem compor peso ou valor comprado. A relação de kg bonificados/kg comprado só aparece para pedidos normais com peso positivo. Bonificações não são filtradas pela situação do pedido, pois não têm esse atributo.

A exportação XLSX contém oito abas: Resumo, Evolução, Lojas, Produtos, Produtos por loja, Pedidos, Bonificações e Responsáveis. Todas as abas e a tabela por responsável respeitam o filtro de dados: somente nossos dados (padrão), mesclados, somente outros vendedores ou vendedor específico. Pesquisas locais nas tabelas não restringem a exportação, que inclui a carteira e o histórico selecionados.

Os dados medem pedidos às lojas. Não medem venda ao consumidor, estoque, margem ou faturamento confirmado. Preço médio/kg pode variar por preço e composição do mix.

## Validação

`node --test tests/mart-minas-analytics.test.mjs` verifica cortes de período, média, ano anterior, carteira, bonificações, lojas sem compra, retomadas, consolidação de produtos, mediana de frequência, datas, XLSX e renderização do painel com base vazia ou preenchida.

