# Ativação da redução de leituras

Atualizado em 21/10/2026.

## Já implementado na aplicação

- Cache por sessão, usuário e consulta, com TTL, compartilhamento de requisições simultâneas, limite de memória e invalidação por recurso.
- Configurações Mart Minas/Oesa com uma assinatura compartilhada por documento/sessão.
- Fim dos listeners globais das coleções comerciais. Cadastros auxiliares são carregados por tela; produtos e condições de pagamento de pedidos/bonificações são demandados pelos editores/importadores.
- Pedidos e bonificações com paginação real por cursor, 25/50 registros, mês atual por padrão e seleção da página atual. Cabeçalhos não são usados como detalhes de edição/exportação.
- Atualização de pedidos restrita à consulta atual; não há mais atualização de sete coleções.
- Detalhes reaproveitados em cache. Com a API administrativa habilitada, as listagens usam projeção de campos para não transmitir `items`.
- Sem credencial administrativa, a consulta usa o SDK autenticado do navegador e as regras existentes. Ela continua paginada, mas o Firestore Web transfere o documento completo; os detalhes já recebidos são reaproveitados ao abrir o registro.
- Totais do período sem filtros adicionais usam agregações. Totais com busca textual/carteira/filtros adicionais são calculados explicitamente, em lotes de até 500 registros, e podem ser interrompidos ao sair/trocar filtros. Nunca são substituídos pela soma da página.
- Busca por trecho e cidade herdada do cliente preservadas: quando não podem ser expressas no índice atual, a listagem verifica até 250 registros por solicitação, dentro do período escolhido. Uma página sem correspondências pode oferecer Próxima para continuar. Isso limita cada requisição, mas não torna a busca textual uma consulta indexada.
- Dashboard e relatórios usam consultas de período em lotes de 250. Relatórios que dependem de última compra/recorrência continuam lendo o intervalo histórico necessário somente quando abertos.
- Exportações completas carregadas apenas ao clicar em exportar, com lotes, progresso e cancelamento.
- Validação de clientes consulta somente os CNPJs envolvidos, incluindo variantes com/sem máscara; importações de PDF consultam somente os números envolvidos. A importação de pedidos mantém a transação antissobrescrita. A edição também impede colisão com pedido fora da página atual.
- Métricas locais em `src/lib/firestore-metrics.ts`. Contadores da aplicação não equivalem à cobrança real, principalmente para agregações/índices/regras.

## Preparado, ainda depende do ambiente Firebase

1. API administrativa em `/api/crm/records`: valida token e aprovação atual do usuário antes de servir dados ou cache. Requer `FIREBASE_SERVICE_ACCOUNT_JSON` somente no servidor. Essa variável não está configurada no ambiente local inspecionado.
2. Cloud Functions em `functions/`: resumos diários por cliente em `daily_orders` e `daily_bonifications`, com valores em centavos e produtos consolidados. Transações com estado por documento evitam aplicar eventos duplicados ou fora de ordem.
3. Migrações retomáveis e verificação de resumos em `scripts/`.
4. Reservas de CNPJ transacionais em `customer_documents`, com regras que exigem cliente/reserva consistentes. A proteção estrita só deve ser ativada depois da migração; antes disso há a validação pontual, com as limitações de concorrência da base legada.
5. Índices e exclusões de indexação versionados em `firestore.indexes.json`.

Os dois recursos de migração ficam desativados por padrão:

```dotenv
NEXT_PUBLIC_FIREBASE_DAILY_SUMMARIES=false
NEXT_PUBLIC_FIREBASE_CNPJ_RESERVATIONS=false
```

## Sequência de publicação

1. Confirmar projeto Firebase, região do banco e região das funções. A região padrão das funções é `southamerica-east1`; ajustar se o banco estiver em outra região.
2. Configurar credencial administrativa no ambiente seguro do servidor/migração. Não colocar JSON de credencial em arquivo público, código versionado ou variável `NEXT_PUBLIC_*`.
3. Instalar as dependências de `functions/` e validar regras com o emulador antes de publicar. O Java e o pacote de testes das regras não estão disponíveis no ambiente local inspecionado; as regras novas ainda precisam dessa validação de integração.
4. Publicar regras e índices, aguardar os índices ficarem prontos e publicar as funções. Usar o projeto explicitamente:

```powershell
npm.cmd install --prefix functions
firebase.cmd deploy --only firestore:rules,firestore:indexes --project SEU_PROJETO
firebase.cmd deploy --only functions:read-aggregates --project SEU_PROJETO
```

5. Auditar e migrar os resumos. Sem `--apply`, o comando apenas lê o lote:

```powershell
node scripts/backfill-read-models.cjs --resource=orders --max=500
node scripts/backfill-read-models.cjs --resource=bonifications --max=500
node scripts/backfill-read-models.cjs --resource=orders --max=500 --apply
node scripts/backfill-read-models.cjs --resource=bonifications --max=500 --apply
```

Se a saída indicar `finished: false`, retomar com `--after=CURSOR_RETORNADO`. Uma última página cheia pode exigir mais uma execução vazia para confirmar o fim. O backfill atualiza apenas `itemCount` e os resumos/estados auxiliares, sem apagar pedidos/bonificações. Se o documento mudar durante a atualização do contador, o comando falha por precondição; repetir o lote após a gravação em curso.

6. Com as funções ativas e a base estável, reconciliar:

```powershell
node scripts/verify-read-models.cjs
```

O verificador compara dia, cliente, quantidade, centavos, peso e produtos, sem imprimir dados pessoais. A execução também faz leituras e deve ser explícita. Habilitar `NEXT_PUBLIC_FIREBASE_DAILY_SUMMARIES=true` somente após zero divergências e comparação da dashboard real. Reconstruir/publicar o frontend porque variáveis `NEXT_PUBLIC_*` são incorporadas no build. O modo diário é destinado à dashboard; relatórios que precisam dos documentos originais mantêm suas consultas por período. Os resumos são eventualmente consistentes após importações/edições; considerar a latência das funções na conferência.

7. Migrar CNPJs em uma janela de manutenção, depois de publicar as regras novas e preparar o frontend com a flag de reservas:

```powershell
node scripts/backfill-customer-documents.cjs --max=500
node scripts/backfill-customer-documents.cjs --max=500 --apply
```

O `--apply` pausa gravações de clientes pelo manifesto `settings/read_optimization.customerMigration`. Retomar os lotes com o cursor; duplicatas/formatos inválidos interrompem a migração e mantêm a pausa. Ao concluir, o manifesto ativa `customerReservations` e remove a pausa. O frontend publicado precisa estar com `NEXT_PUBLIC_FIREBASE_CNPJ_RESERVATIONS=true`; versões antigas não devem continuar editando clientes nessa fase. Para abortar a ativação, um administrador pode manter a versão anterior do frontend e desativar `customerMigration` e `customerReservations` no manifesto; não remover reservas de clientes enquanto a proteção estiver ativa.

8. Medir os fluxos documentados no plano com dados reais e comparar com o console/billing antes de estimar economia percentual.

## Limites e trabalho posterior

- Ainda não foi medido o custo real em produção nem executada uma migração nesse ambiente. O dry run foi interrompido pela ausência da credencial administrativa, antes de acessar os dados.
- Persistência em disco não foi habilitada por padrão. O cache atual é em memória por sessão; uma opção de dispositivo confiável/múltiplas abas exige política de armazenamento/logout e validação próprias.
- Clientes/redes e catálogos pequenos ainda são carregados completos onde são necessários, com cache. Sua paginação e a substituição dos seletores globais por buscas remotas continuam sendo evolução posterior.
- Motivos/cidades dos filtros usam cadastro de clientes, motivos conhecidos e valores da página. Um catálogo completo para motivos legados personalizados deve ser migrado antes de retirar essa alternativa; ele não deve ser construído varrendo o histórico ao abrir a tela.
- A ordenação global paginada disponível é por data. Outras colunas não exibem controles de ordenação que só ordenariam uma página. Novas ordenações globais exigem modelo/índices compatíveis com o filtro de período.
- Não há ação destrutiva sobre todos os resultados filtrados; o checkbox seleciona a página atual, e a seleção explícita pode ser mantida entre páginas. Não se baixa o histórico para marcar caixas.
- A separação física dos detalhes e um índice de busca textual dedicado não foram ativados. Com Admin SDK, a projeção já reduz o payload; no fallback Web, o documento completo ainda é transmitido para os registros consultados.
