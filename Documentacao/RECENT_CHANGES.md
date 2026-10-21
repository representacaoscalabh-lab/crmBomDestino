# Alterações recentes

Registro atualizado em **21/10/2026**, referente ao código do repositório. Não é confirmação de implantação em produção.

## Dashboard e identidade visual

- Título do bloco: **Comissões Mart Minas**.
- Resumo exclusivo da rede configurada para Mart Minas, com total WRRJ + Sul de Minas e valores separados.
- Base, percentual WRRJ, lojas e pedidos consideram o período do bloco; pendências de configuração são identificadas.
- Layout sem a lista de outras redes/clientes gerais nesse bloco.
- Favicon alterado para **B branca em fundo vermelho vinho**, em SVG e PNG, com versão Apple.

## Bonificações e pedidos

- Bonificações abrem em **Mesclado**; alternância entre Mesclado, WRRJ e Sul de Minas.
- Seleção múltipla de cidades/motivos, busca de opções, aplicação por botão e etiquetas removíveis.
- Caixas de seleção por linha e no cabeçalho; seleção do cabeçalho restrita à página atual.
- Paginação por cursor nas listas de pedidos e bonificações, com 25/50 registros e mês atual como período inicial.
- Totais completos independentes da página. Filtros avançados usam cálculo explícito, sem apresentar a soma da página como total.
- Detalhes buscados sob demanda ou reaproveitados do cache. Edição de pedido impede sobrescrever outro registro fora da página.

## Redução de leituras

- Cache em memória por usuário/consulta, com TTL, deduplicação e invalidação por recurso.
- Remoção dos listeners globais das coleções comerciais e do refresh de sete coleções.
- Configurações de relatórios com listener compartilhado.
- Cadastros auxiliares carregados por rota/demanda e relatórios delimitados pelo intervalo necessário.
- Consultas pontuais de CNPJ e de números presentes no PDF antes de importar.
- Exportações completas apenas quando solicitadas, em lotes, com progresso e cancelamento.
- API Admin para projeção leve; alternativa Web paginada para ambiente sem credencial administrativa.

## Preparado para publicação controlada

Funções de resumos diários, reservas transacionais de CNPJ, regras, índices, migrações retomáveis e verificação de reconciliação foram adicionados. Os recursos de resumos/reservas permanecem desativados por padrão até publicar, migrar e conferir a base.

A última execução registrada concluiu 102 testes. Houve build de produção e validações TypeScript/ESLint. Não foram executados backfills/publicação na base real nem testes das regras no emulador neste ambiente.

Consulte [ativação e limitações](../docs/ativacao-reducao-leituras-firebase.md) para os comandos, dependências e itens ainda pendentes. As descrições antigas de cache persistente em `localStorage`, seletor Auto/Número/Texto e rotas `/dashboard/*` foram preservadas como histórico e não descrevem esta versão.
