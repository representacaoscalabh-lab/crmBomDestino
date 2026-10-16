# Central de Relatórios

Rota: `/relatorios`. A página `/acompanhamento-redes` e sua entrada no menu foram removidas. O relatório dedicado do Mart Minas permanece em `/relatorios/mart-minas`.

## Análises

- **Clientes:** pedidos, kg, valor, ticket médio, mix, última compra e intervalo médio entre datas distintas de compra.
- **Clientes sem compra:** clientes sem pedidos registrados no intervalo, com última compra até a data final, dias sem comprar e telefone.
- **Produtos:** catálogo com ou sem volume, kg, valor dos itens, unidades, compradores, cobertura e participação em kg. Caixa e meia caixa são consolidadas pelo cadastro do produto.
- **Segmentos, Cidades e Redes:** clientes na base, compradores, clientes sem compra, positivação, pedidos, kg e valor. Clientes sem rede ficam em “Sem rede”.
- **Bonificações:** quantidade, kg e valor de referência por cliente. A relação kg bonificados/kg comprados exige pedidos normais com kg positivo.

## Filtros

A seleção inicial usa o mês atual até hoje no fuso de São Paulo, clientes ativos, pedidos normais e Representação WRRJ. Os filtros são aplicados pelo botão **Aplicar filtros**; mudanças pendentes são sinalizadas, mantendo o resultado anterior identificável.

Filtros: De/Até, dados da representação/mesclados/outros vendedores/vendedor específico, situação dos pedidos, rede, cidade, segmento, status do cliente, cliente e produto. Atalhos: sete dias, mês atual e desde o início. O cadastro e o vendedor atuais determinam a carteira, inclusive para pedidos antigos.

O acompanhamento começa em 01/10/2026. Quando o intervalo anterior completo de igual duração estiver dentro do acompanhamento, as tabelas relevantes exibem kg anteriores, diferença absoluta e variação. Não se usa percentual com base zero. Períodos inexistentes não são apresentados como histórico real.

Selecionar um produto recorta os itens dos pedidos e bonificações antes da soma de kg e valor. O número de pedidos conta somente os que contêm esse produto. Última compra e frequência também respeitam o produto e a situação selecionados. O intervalo médio usa até oito datas distintas de compra e requer pelo menos duas.

A base da positivação é o conjunto de clientes que atende aos filtros de cadastro, incluindo os sem compras. A cobertura de produtos usa a mesma base. Bonificações não possuem situação de pedido; essa seleção afeta apenas o denominador da relação com compras.

## Tabelas e exportação

As tabelas têm rolagem interna, cabeçalho fixo, ordenação, pesquisa sem distinção de acentos e paginação de cinquenta registros. O filtro local de volume permite exibir todos, com volume ou sem volume. Os indicadores superiores resumem o período e os filtros aplicados, independentemente da busca local.

O XLSX contém todas as linhas da busca atual na ordenação selecionada, inclusive as páginas não visíveis. O nome do arquivo identifica o relatório e as datas. Valores são exportados como números, códigos como texto e ausência de base como “Sem base”.

Pedidos sem um cliente cadastrado correspondente não são atribuídos por aproximação; a página sinaliza a quantidade fora da análise. Valores de pedidos não representam faturamento confirmado. Os cálculos reutilizam os dados sincronizados pelo store, sem novas coleções, índices ou gravações no Firestore.

## Verificação

`node --test tests/commercial-reports.test.mjs` cobre filtros, carteiras, produto, datas, clientes sem compra, comparações, frequência, consolidação, positivação, bonificações e renderização com base preenchida ou vazia.
