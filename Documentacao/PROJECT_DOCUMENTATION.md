# Visão funcional do CRM Bom Destino

Atualizado em **21/10/2026**, com base nas páginas e regras existentes no repositório.

## Rotas

| Rota | Finalidade |
| --- | --- |
| `/` | Dashboard comercial. |
| `/clientes` | Clientes, lojas e redes. |
| `/produtos` | Catálogo de produtos. |
| `/pedidos` | Pedidos, importação e seleção de registros. |
| `/bonificacoes` | Amostras e cortesias, separadas das vendas. |
| `/metas` | Objetivos comerciais mensais e anuais. |
| `/relatorios` | Central de análises comerciais. |
| `/relatorios/mart-minas` | Rede configurada como Mart Minas. |
| `/relatorios/oesa-nova-safra` | Rede configurada como OESA – Nova Safra. |
| `/crescimento/clientes`, `/crescimento/produtos` | Comparações dos meses selecionados. |
| `/exportacao` | Importações e exportações. |
| `/configuracoes` | Cadastros auxiliares, redes, comissões e acessos. |
| `/notificacoes` | Página de notificações; não implica integração com Cloud Messaging. |

`/carteira` é uma rota legada que redireciona para `/pedidos`. A dashboard atual não fica em `/dashboard`.

## Carteiras e redes

Cada cliente pode guardar um `groupId` em `customers`. As redes ficam em `customer_groups`; `externalStoreSellers` associa lojas a responsáveis externos. O fluxo atual identifica essa carteira como **Sul de Minas**. A normalização consolida nomes externos antigos nessa identificação.

Os relatórios consideram o cadastro e o responsável atuais, inclusive ao consultar pedidos antigos. Mesclado reúne as carteiras; WRRJ e Sul de Minas as separam. Não se trata de isolamento de dados por usuário: as permissões comerciais atuais são compartilhadas pelos usuários aprovados.

## Dashboard e comissões

O painel apresenta valor dos pedidos, peso vendido, quantidade de pedidos e clientes com compra, além de análises de produtos, cidades, segmentos e crescimento. Bonificações têm indicação separada.

O bloco **Comissões Mart Minas** mostra somente a rede configurada para Mart Minas, com:

- Comissão total do período: WRRJ + Sul de Minas.
- Comissão WRRJ e comissão Sul de Minas separadas.
- Base dos pedidos, percentual WRRJ, lojas com compra e pedidos.
- Acesso ao relatório da rede.

Cada loja pertence a um responsável. Lojas WRRJ usam o percentual da representação; lojas Sul de Minas usam o percentual externo e sua base configurada, que pode ser o valor dos pedidos ou a comissão de representação calculada como referência. Essa referência não é somada novamente à WRRJ. O arredondamento ocorre por loja, em centavos. Configuração ausente é exibida como pendência ou total parcial, sem inventar percentual.

Os demais indicadores da dashboard mantêm o recorte WRRJ. O bloco consolidado Mart Minas inclui também o Sul de Minas. Bonificações não entram na base da comissão.

## Pedidos e bonificações

As listas abrem no mês atual e usam páginas de 25 ou 50 registros, com Anterior/Próxima e cursor estável por data/ID. A ordenação global disponível nessas listas é por data.

A caixa do cabeçalho seleciona todos os registros **da página atual**. É possível selecionar registros em várias páginas; a seleção não exige ler o histórico completo. Em pedidos, a exclusão em lote pede confirmação. Bonificações apresentam quantidade, peso e valor da seleção, com opção de limpar.

Bonificações abrem em **Mesclado**, com alternância para WRRJ e Sul de Minas. Cidades e motivos aceitam múltiplas escolhas e busca dentro das opções. Os filtros são aplicados por botão e aparecem como etiquetas removíveis. Ao limpar, o período retorna ao mês atual.

Os totais dos filtros são independentes da página. Sem filtros adicionais, usam agregações. Com busca textual/carteira e outros filtros, o cálculo completo é solicitado explicitamente. Uma busca com poucas correspondências pode exigir continuar para a próxima página após atingir o limite de verificação da requisição. Erro, carregamento e ausência de registros são estados distintos.

## Cadastro e importação

CNPJ identifica o cliente para impedir duplicação. Nome, código e loja podem coincidir entre CNPJs diferentes. A validação consulta documentos envolvidos na operação, com suporte às formas com e sem máscara. A garantia transacional entre usuários depende de ativar as reservas de CNPJ após a migração.

Produtos têm ID canônico, códigos de caixa/meia caixa, quantidade, peso e preço. Os itens preservam o ID do produto, unificando as embalagens nas análises.

Importações Excel aceitam `.xls` e `.xlsx`, com validações e avisos. PDFs pesquisáveis e OCR são processados no navegador e passam por conferência antes de salvar. No Mart Minas, `Custo Bruto` é o total da linha; o importador divide esse valor pela quantidade líquida para obter o preço por embalagem. Na OESA, a leitura segue as colunas próprias desse layout. Códigos ausentes/ambíguos e CNPJs sem correspondência são sinalizados.

Cabeçalhos de compra e bonificação definem coleções distintas. Um mesmo número pode existir em pedido e bonificação. Pedidos são protegidos por transação contra sobrescrita na importação e colisão ao editar.

## Identidade visual e limites

O favicon é a letra **B branca em fundo vermelho vinho**, com SVG, PNG e ícone Apple. Os arquivos ficam em `public/` e são referenciados pelo metadata de `src/app/layout.tsx`.

Peso e valor representam pedidos registrados, não estoque, venda ao consumidor ou faturamento confirmado. Recursos de resumos diários e reservas de CNPJ exigem ativação controlada no Firebase: [guia operacional](../docs/ativacao-reducao-leituras-firebase.md).
