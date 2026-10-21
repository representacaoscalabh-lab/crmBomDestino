# Documentação do CRM Bom Destino

Referência atualizada em **21/10/2026**. Os guias abaixo descrevem o código atual; funcionalidades preparadas para publicação estão identificadas separadamente.

## Começar e desenvolver

| Documento | Conteúdo |
| --- | --- |
| [README do projeto](../README.md) | Visão geral, execução e verificações. |
| [Guia rápido](QUICKSTART.md) | Ambiente, Firebase, primeiro acesso e diagnóstico. |
| [Visão funcional](PROJECT_DOCUMENTATION.md) | Rotas, carteiras, dashboard, pedidos, bonificações e regras. |
| [Documentação técnica](TECHNICAL.md) | Stack real, estrutura, consultas, cache, autenticação e testes. |
| [Alterações recentes](RECENT_CHANGES.md) | Estado das entregas recentes e pendências de ativação. |

## Operação e relatórios

- [Aprovação de usuários](SISTEMA_APROVACAO_USUARIOS.md)
- [Mart Minas e OESA – Nova Safra](MART_MINAS.md)
- [Central de relatórios](CENTRAL_RELATORIOS.md)

## Leituras do Firebase

- [Plano completo](../docs/plano-reducao-leituras-firebase.md): diagnóstico e objetivo da otimização.
- [Guia de ativação](../docs/ativacao-reducao-leituras-firebase.md): estado implementado, credenciais, regras, índices, funções, migrações e limites conhecidos.

A paginação e o cache da aplicação já estão implementados. A existência dos arquivos de funções e migrações não significa que tenham sido publicados ou executados no Firebase. Consulte o guia de ativação antes de habilitar as flags.

## Histórico

As versões anteriores dos guias principais foram preservadas em [historico/](historico/INDEX.md). Outros documentos desta pasta identificados como históricos registram propostas e implementações anteriores, inclusive rotas `/dashboard/*` e serviços ausentes da versão atual.

A antiga especificação geral está em [historico/README.md](historico/README.md). Sua lista de bibliotecas, módulos futuros e requisitos não deve ser interpretada como inventário do que está instalado hoje.

