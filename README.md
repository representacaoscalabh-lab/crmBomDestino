# CRM Bom Destino

CRM comercial em português para a Bom Destino Laticínios de Búfala, com operação por redes e carteiras WRRJ e Sul de Minas. Documentação atualizada em **21/10/2026**, conforme o código deste repositório.

## Iniciar

Use Node.js **22** para manter o ambiente alinhado às funções e aos scripts de migração. O frontend Next.js requer pelo menos Node.js 20.9.

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run dev
```

Preencha `.env.local` com a configuração do seu projeto Firebase, habilite Google Authentication e autorize o domínio utilizado. A aplicação abre em `http://localhost:3000`; a dashboard fica em `/`.

O acesso comercial depende de `users/{uid}.status = approved`. O primeiro administrador é provisionado após login Google verificado, usando `FIREBASE_ADMIN_EMAIL` e `FIREBASE_SERVICE_ACCOUNT_JSON` no servidor. A credencial administrativa nunca deve usar prefixo `NEXT_PUBLIC_`.

## Funcionalidades atuais

| Área | Comportamento |
| --- | --- |
| Dashboard | Indicadores do período, peso anual, rankings e bloco **Comissões Mart Minas**. O bloco soma WRRJ e Sul de Minas e mostra cada comissão separadamente. |
| Clientes e redes | Cadastro, importação Excel, redes de lojas, responsáveis e validação de CNPJ. Nome, código e loja podem se repetir com CNPJs diferentes. |
| Produtos | Cadastro e importação Excel, códigos de caixa/meia caixa, preço, medida e peso. |
| Pedidos | Cadastro, importação PDF/OCR, detalhes, exportação individual, seleção e exclusão em lote. Lista com cursores e 25/50 registros por página. |
| Bonificações | Abre em **Mesclado**, com WRRJ e Sul de Minas. Filtros de cidades/motivos com seleção múltipla, seleção de linhas e paginação. Não compõe vendas ou comissões. |
| Relatórios | Central comercial e relatórios dedicados de Mart Minas e OESA – Nova Safra, com comissões, crescimento e produtos. |
| Metas | Metas mensais/anuais de receita, peso, positivação e conversão, calculadas sobre os pedidos do período. |
| Importações e exportações | Prévia e avisos antes da importação; exportações completas sob demanda, com progresso e cancelamento. |
| Configurações | Redes, percentuais, condições de pagamento e gestão de acessos conforme o perfil. |

As comissões usam o responsável atual de cada loja. Cada loja gera a comissão da WRRJ ou a do Sul de Minas, segundo o cadastro, sem duplicar as duas sobre a mesma base. Os percentuais são configuráveis e os valores são arredondados por loja. Valores de pedidos não comprovam faturamento realizado.

## Dados e desempenho

A aplicação usa Firebase Authentication e Cloud Firestore, com cache em memória por sessão e consulta. Listas de pedidos/bonificações não baixam o histórico inteiro ao abrir. O checkbox do cabeçalho seleciona **a página atual**, e os totais completos são separados das linhas carregadas.

A API `/api/crm/records` pode projetar apenas campos leves das listagens quando a credencial Admin está configurada. Sem ela, o SDK do navegador mantém a paginação, mas recebe os documentos completos dos registros consultados e reaproveita os detalhes em cache.

Resumos diários e reservas transacionais de CNPJ estão preparados para ativação após publicar regras/funções, migrar e conferir os dados. Permanecem desativados por padrão. A redução real de cobrança ainda precisa ser medida no projeto Firebase.

## Verificações

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

Em PowerShell com bloqueio de scripts `.ps1`, use os executáveis `.cmd` como nos exemplos.

## Documentação

- [Índice da documentação](Documentacao/README.md)
- [Guia rápido](Documentacao/QUICKSTART.md)
- [Visão funcional e regras de negócio](Documentacao/PROJECT_DOCUMENTATION.md)
- [Arquitetura e contratos técnicos](Documentacao/TECHNICAL.md)
- [Mudanças recentes](Documentacao/RECENT_CHANGES.md)
- [Relatórios de redes e comissões](Documentacao/MART_MINAS.md)
- [Plano de redução de leituras](docs/plano-reducao-leituras-firebase.md)
- [Ativação, migrações e limitações do Firebase](docs/ativacao-reducao-leituras-firebase.md)

Documentos de versões anteriores ficam identificados como históricos; eles não substituem os guias atuais.
