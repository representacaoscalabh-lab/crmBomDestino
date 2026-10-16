# CRM Bom Destino

CRM comercial em português para a operação da Bom Destino Laticínios de Búfala. A interface usa a identidade visual bordô `#722F37` e branco, com navegação responsiva para visão geral, clientes, pedidos, produtos e administração de acessos.

## Executar localmente

Requisitos: Node.js 20.9 ou superior.

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`. Configure o Firebase no `.env.local` (consulte `.env.example`) e habilite o provedor Google Authentication no Firebase Console.

Para criar o primeiro administrador, configure `FIREBASE_ADMIN_EMAIL` e `FIREBASE_SERVICE_ACCOUNT_JSON` no ambiente do servidor. O email precisa pertencer a uma conta Google verificada. A conta é promovida pelo endpoint servidor após login; não configure a credencial Admin em variáveis `NEXT_PUBLIC_*`. Publique também as regras do banco usando `firebase deploy --only firestore:rules`.

## Regras implementadas nesta versão inicial

- Produtos guardam códigos diferentes para caixa e meia caixa, preço, medida (KG/UN), peso por unidade, classificação do peso (variável/fixo) e validade.
- O peso da caixa é calculado por peso por unidade × quantidade por caixa. A quantidade por caixa precisa ser par; a meia caixa é metade das unidades, do peso e do preço da caixa.
- A importação de clientes e produtos usa planilhas `.xls` e `.xlsx` de até 10 MB.
- Pedidos podem ser criados manualmente ou iniciados por "Importar pedido": selecione o cliente e envie um único print da tabela completa do pedido. O OCR roda no navegador, usa o código para procurar o produto cadastrado, usa `Preço` como preço unitário, `Caixas` como quantidade de embalagens e `P. Bruto` como peso final do item. `Quant.`, `Desconto`, `Sub-total`, `Peças` e `P. Liq.` são ignorados; a quantidade de unidades e o subtotal são calculados com base no cadastro do produto e no preço. Os itens reconhecidos abrem no formulário normal para revisão antes de salvar.
- Cadastre os produtos antes de importar um pedido por print. Linhas de produtos que não existam no cadastro são puladas, e os códigos/nomes ignorados são informados ao final junto aos demais itens que não puderam ser lidos.
- A central "Importações e exportações" oferece importação de print de pedido separado, pedido geral e PDFs de rede. A Importação Inteligente identifica `PEDIDO DE COMPRAS` como pedido e `PEDIDO DE BONIFICAÇÃO SEM INCID CUSTO` como bonificação, mantendo os dois tipos em coleções e métricas distintas. No modo Rede, associa o CNPJ à filial cadastrada e o `Cod Forn` ao código do produto. As páginas são reunidas somente quando número do pedido, CNPJ e tipo do documento são iguais; números diferentes geram registros separados, mesmo para a mesma loja. A quantidade usada é `Qtde - Qtd.Canc.` e `Valor Unit.` é aplicado por embalagem. O peso total indicado no PDF é o peso bruto oficial; quando todos os itens são reconhecidos, ele é distribuído entre eles em proporção aos pesos calculados pelo cadastro dos produtos. Registros já existentes, CNPJs sem correspondência e itens sem produto cadastrado são apresentados nos avisos e não são sobrescritos. PDFs pesquisáveis são processados localmente no navegador.
- Na lista de pedidos, selecione várias linhas ou use a caixa do cabeçalho para selecionar os pedidos filtrados e excluí-los permanentemente do Firebase.
- "Bonificações" mantém amostras e cortesias em uma coleção separada, com cadastro de cliente, produtos, quantidades, motivo e observações. Peso e valor de referência são calculados pelo catálogo, mas bonificações não entram no faturamento, nos pedidos nem nos rankings de vendas. A coleção `bonifications` exige publicar as regras atualizadas com `firebase deploy --only firestore:rules`.

Os modelos de importação de clientes e produtos são gerados como planilhas Excel `.xlsx` pela interface. O modelo de produtos segue a ordem Descrição do Produto, Preço unitário, Cod CX, Meia CX (opcional), Medida, Peso Unidade, Peso, Validade e QTD CX; não inclui Preço ST. A importação aceita valores monetários formatados com `R$` e pesos em KG ou G, convertendo gramas para quilogramas. Cabeçalhos equivalentes sem acentos também são reconhecidos.

Os itens de pedidos armazenam o ID canônico do produto do catálogo, além do código e do tipo da embalagem. Assim, caixa e meia caixa continuam vinculadas ao mesmo produto para consolidação em relatórios futuros.

Clientes podem ser organizados em redes (grupos de lojas) pela página Clientes. Cada cadastro de loja mantém seu próprio código, nome e histórico de pedidos; o consolidado por rede soma pedidos, peso e faturamento de todas as lojas associadas. A exportação XLSX "Consolidado por rede" inclui o detalhamento de cada loja e o total da rede. Os grupos ficam na coleção `customer_groups` do Firestore e cada cliente guarda o `groupId` da rede.

A central Relatórios foi reconstruída com análises de clientes, clientes sem compra, produtos, segmentos, cidades, redes e bonificações. Possui filtros de período, representação/vendedor, rede, cidade, segmento, cliente, produto e situação; tabelas com busca, ordenação, paginação e exportação XLSX. A página Acompanhamento de Redes foi removida; Mart Minas e as páginas dedicadas de Crescimento de Clientes e Produtos permanecem disponíveis. Consulte [Central de Relatórios](Documentacao/CENTRAL_RELATORIOS.md) para as regras dos indicadores.

A página Metas permite cadastrar objetivos comerciais mensais ou anuais para receita, peso, clientes positivados e conversão. O progresso é calculado a partir dos pedidos normais do período, pode ser filtrado e pesquisado, e as metas podem ser editadas, excluídas e exportadas para XLSX. Os dados ficam na coleção `goals` do Firestore, disponível para usuários aprovados.

## Persistência e próximos passos

Clientes, redes, produtos, pedidos e acessos são sincronizados pelo Cloud Firestore e o login usa Google Authentication. As regras restringem dados comerciais a usuários aprovados e permitem gerenciar usuários somente pelo administrador. As permissões operacionais atuais são compartilhadas entre todos os usuários aprovados. Os demais módulos do CRM descrito em `Documentacao/RELATORIO_COMPLETO_PROJETO.md` ainda não foram migrados.
