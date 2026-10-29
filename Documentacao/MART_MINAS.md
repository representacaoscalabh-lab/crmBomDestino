# Relatórios de redes: Mart Minas e OESA – Nova Safra

Atualizado em **29/10/2026**. Rotas: `/relatorios/mart-minas` e `/relatorios/oesa-nova-safra`.

## Rede e carteiras

Cada página utiliza seu vínculo próprio em `settings/mart_minas` ou `settings/oesa_nova_safra`, definido em Configurações. `groupId` identifica a rede e `reportName` permite personalizar o título.

O layout compartilhado está em `src/components/network-reports-page.tsx`. As opções são **Comissões**, **Crescimento**, **Produtos por loja** e **Produtos**. A seleção inicial é Comissões, mês atual de São Paulo até hoje e carteira WRRJ. O seletor permite WRRJ, Mesclado e Sul de Minas.

Os responsáveis e o vínculo da loja são os atuais do cadastro, inclusive para pedidos antigos. As lojas da rede podem aparecer sem pedidos para permitir analisar ausência de compra. O acompanhamento começa em **01/10/2026**.

## Importação de pedidos e bonificações Mart Minas

O fluxo é iniciado em **Pedidos → Importar redes → Mart Minas**. A rede Mart Minas deve estar vinculada em Configurações e os clientes e produtos da rede precisam estar cadastrados antes da leitura. A implementação atual está em `src/app/pedidos/page.tsx`; o leitor e o mapeamento ficam em `src/lib/network-order-pdf.ts`. Esta seção documenta o comportamento implementado; não substitui nem altera as regras do importador.

### Arquivo e leitura

- O usuário seleciona um PDF de pedidos/bonificações e solicita a leitura. A aplicação lê os bytes no navegador; o arquivo PDF não é enviado para armazenamento ou para um endpoint de importação.
- `loadPdfRuntime` carrega PDF.js e seu worker dos arquivos locais em `public/vendor/pdfjs-4.10.38`. O script de preparação `scripts/prepare-pdf-assets.cjs` copia esses arquivos e os recursos de OCR durante o `prebuild`/`predev`.
- Cada página é lida primeiro como texto e coordenadas com PDF.js. Quando a página não tem texto, o documento não é reconhecido ou há avisos, o fluxo usa Tesseract.js como alternativa, renderizando a página em canvas no navegador. O worker e o modelo de idioma são servidos de `public/vendor/ocr-7`; a escala de OCR é limitada para controlar a memória da imagem.
- Os itens de texto/OCR são agrupados em linhas pela posição vertical e ordenados horizontalmente. A leitura procura título do documento, número terminado em `/L`, CNPJ na área de faturamento, data de emissão, peso total, valor total e as colunas da tabela de produtos.
- O título distingue pedido de compra de pedido de bonificação. As páginas do mesmo documento são reunidas por tipo, número e CNPJ; páginas sem produtos podem aparecer como informação, e páginas com conteúdo não reconhecido geram avisos para conferência.

### Validação e formação da prévia

Antes de salvar, o CRM consulta os pedidos e bonificações com os números identificados para evitar duplicidades. Os pedidos são comparados por pré-pedido e cliente; bonificações já existentes são ignoradas. O sistema relaciona o CNPJ, composto somente por dígitos, a exatamente um cliente cadastrado. CNPJ ausente ou duplicado bloqueia o documento correspondente.

O código do fornecedor de cada linha deve corresponder a exatamente um código de caixa ou meia caixa cadastrado. A quantidade cancelada é descontada. Código sem correspondência, correspondência ambígua, embalagem sem peso válido, preço/peso inválido ou item ausente gera aviso e pode impedir que o documento completo seja preparado.

O leitor verifica quantidades e colunas de preço/custo bruto e compara os totais lidos com os totais impressos no PDF. Quando a soma de quantidades ou valores não confere, há aviso para revisão. A ausência do **valor total do pedido** bloqueia a importação desse documento para evitar um total inventado. As regras e avisos exatos são definidos em `src/lib/network-order-pdf.ts`.

Para itens cuja unidade no PDF é **KG**, o valor e o peso solicitados em kg são preservados; o peso cadastrado da caixa é usado para estimar a quantidade de embalagens, que é arredondada. Se o PDF informar peso bruto do pedido e todos os itens forem reconhecidos, o peso é distribuído proporcionalmente entre eles. Se algum item não for reconhecido, o peso final considera somente os itens preparados e a tela informa a limitação.

O modal apresenta uma conferência antes de salvar:

- quantidade de documentos encontrados, pedidos e bonificações;
- registros prontos, já existentes e bloqueados;
- cliente/CNPJ, número, páginas, itens e valores disponíveis;
- avisos de leitura, correspondência ou consistência e informações de páginas em branco.

Somente os registros novos preparados entram na prévia salvável. A revisão textual adicional é montada por `src/lib/network-import-review.ts`. O usuário deve conferir os avisos e a prévia antes de confirmar.

### Gravação, remessa e histórico

Ao confirmar, o CRM cria uma remessa com rede `mart_minas`, arquivo de origem, nome derivado do arquivo e usuário responsável. A remessa inicia como `processing`; pedidos e bonificações preparados são gravados nas coleções `orders` e `bonifications` com o vínculo `remittanceId`. Ao finalizar, o estado passa a `ready` e o histórico registra quantos pedidos e bonificações foram vinculados. Se houver falha depois da criação, a remessa registra o estado `failed` e os detalhes da falha para investigação.

As remessas e eventos são implementados em `src/lib/order-remittances.ts`. O histórico de importação registra início, conclusão ou erro, usuário, data, rede, nome e arquivo. A exclusão administrativa de uma remessa remove em lotes os pedidos e as bonificações vinculados e registra cada lote e a exclusão final; os eventos de auditoria permanecem mesmo após a remoção da remessa.

### Limites da interpretação

O leitor depende do layout e dos rótulos do PDF Mart Minas, além dos códigos e pesos cadastrados no CRM. OCR é uma alternativa para imagens/texto difícil, não uma garantia de leitura correta. Avisos e prévia devem ser conferidos contra o documento de origem. O sistema não envia o PDF para revisão externa e não deve ser interpretado como validação fiscal do documento.

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
