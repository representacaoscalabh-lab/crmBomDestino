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
- Pedidos podem ser criados manualmente ou iniciados por "Importar pedido": selecione o cliente e envie capturas das abas de produtos, preços e pesos. O OCR roda no navegador, combina as capturas pela ordem das linhas, usa o código para procurar o produto cadastrado, interpreta `Quant.` como quantidade de caixas e `Preço` como preço unitário, e abre o formulário normal para revisar e editar antes de salvar. A quantidade de unidades e o subtotal são calculados com base no cadastro do produto.
- Cadastre os produtos antes de importar um pedido por imagem para que os códigos sejam associados ao catálogo. Linhas não associadas precisam ser vinculadas a um produto antes de salvar; se as capturas tiverem quantidades de linhas incompatíveis, a importação é interrompida para evitar cruzamentos incorretos.

Os modelos de importação de clientes e produtos são gerados como planilhas Excel `.xlsx` pela interface. O modelo de produtos segue a ordem Descrição do Produto, Preço unitário, Cod CX, Meia CX (opcional), Medida, Peso Unidade, Peso, Validade e QTD CX; não inclui Preço ST. A importação aceita valores monetários formatados com `R$` e pesos em KG ou G, convertendo gramas para quilogramas. Cabeçalhos equivalentes sem acentos também são reconhecidos.

Os itens de pedidos armazenam o ID canônico do produto do catálogo, além do código e do tipo da embalagem. Assim, caixa e meia caixa continuam vinculadas ao mesmo produto para consolidação em relatórios futuros.

Clientes podem ser organizados em redes (grupos de lojas) pela página Clientes. Cada cadastro de loja mantém seu próprio código, nome e histórico de pedidos; o consolidado por rede soma pedidos, peso e faturamento de todas as lojas associadas. A exportação XLSX "Consolidado por rede" inclui o detalhamento de cada loja e o total da rede. Os grupos ficam na coleção `customer_groups` do Firestore e cada cliente guarda o `groupId` da rede.

A central Relatórios permite gerar Clientes Sem Compra, Dia preferido de compra, Frequência de Compra, Lista de Clientes, Lista de Clientes por Segmento, Peso por Cliente, Peso por Segmento, Positivação de Clientes e Positivação de Produtos. A página abre com um seletor de relatório e, após a escolha, exibe filtros persistentes na lateral, resultados em tabela, busca e exportação XLSX. As páginas dedicadas de Crescimento de Clientes e Crescimento de Produtos permitem comparar o mês principal com um ou mais meses escolhidos; os resultados incluem uma coluna por mês comparado e sua variação percentual. POPs foi removido da navegação e das rotas do sistema.

A página Metas permite cadastrar objetivos comerciais mensais ou anuais para receita, peso, clientes positivados e conversão. O progresso é calculado a partir dos pedidos normais do período, pode ser filtrado e pesquisado, e as metas podem ser editadas, excluídas e exportadas para XLSX. Os dados ficam na coleção `goals` do Firestore, disponível para usuários aprovados.

## Persistência e próximos passos

Clientes, redes, produtos, pedidos e acessos são sincronizados pelo Cloud Firestore e o login usa Google Authentication. As regras restringem dados comerciais a usuários aprovados e permitem gerenciar usuários somente pelo administrador. As permissões operacionais atuais são compartilhadas entre todos os usuários aprovados. Os demais módulos do CRM descrito em `Documentacao/RELATORIO_COMPLETO_PROJETO.md` ainda não foram migrados.
