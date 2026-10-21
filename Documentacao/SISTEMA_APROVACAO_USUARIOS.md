# Autenticação e aprovação de usuários

Atualizado em **21/10/2026**.

## Primeiro acesso

O login usa somente Google Authentication. `src/lib/auth.tsx` acompanha a sessão e verifica o perfil no Firestore. Se o perfil não existir, cria `users/{uid}` com `status: pending`, `role: user` e uma solicitação em `access_requests/{uid}`.

A aplicação acompanha o documento do usuário para refletir mudanças de aprovação. `AuthGate` apresenta o estado de acesso; usuários aprovados podem entrar na dashboard em `/`. A autorização também é verificada nas regras Firestore e nas rotas servidor, não apenas na interface.

| Campo | Valores |
| --- | --- |
| `status` | `pending`, `approved`, `rejected` |
| `role` | `user`, `admin` |

O perfil utiliza `uid`, `email` e `name`. Não presumir os campos `displayName`/`photoURL` da antiga documentação como contrato do perfil comercial. Timestamps usam os campos e operações definidos em `auth.tsx` e nas ações administrativas.

## Primeiro administrador

A rota `POST /api/auth/bootstrap` é chamada com um ID token Firebase. Ela valida o token, o email Google verificado e sua correspondência com `FIREBASE_ADMIN_EMAIL`.

Com `FIREBASE_SERVICE_ACCOUNT_JSON` configurado no servidor, provisiona a conta inicial como administrador aprovado. Credenciais administrativas nunca devem ser colocadas em variáveis `NEXT_PUBLIC_*`, arquivos públicos ou documentação.

## Gestão em Configurações

Administradores revisam solicitações pendentes e aprovam ou recusam o acesso. A resolução atualiza o usuário e a solicitação em lote. A gestão de equipe permite pesquisar e editar nome, perfil e situação conforme as validações em `src/lib/team-access.ts`.

A aplicação protege o administrador conectado contra mudanças de seu próprio acesso que o bloqueariam. Remover um perfil/solicitação do CRM não deve ser interpretado como exclusão automática da conta Google ou do usuário no Firebase Authentication.

Usuários aprovados compartilham os dados comerciais autorizados pelas regras atuais. A seleção WRRJ/Sul de Minas é um recorte operacional, não uma política de isolamento por usuário.

## Arquivos de referência

- `src/lib/auth.tsx`: sessão, perfil e solicitação inicial.
- `src/components/auth-gate.tsx`: estados visuais de acesso.
- `src/app/api/auth/bootstrap/route.ts`: administrador inicial.
- `src/app/configuracoes/page.tsx`: solicitações e ações administrativas.
- `src/components/team-access-members.tsx`: gestão de equipe.
- `src/lib/team-access.ts`: validação de alterações de acesso.
- `firestore.rules`: autorização efetiva do banco.

A API administrativa de registros confere a aprovação atual antes de responder, inclusive em cache. Regras e funções novas devem ser publicadas e verificadas no projeto correto conforme o [guia do Firebase](../docs/ativacao-reducao-leituras-firebase.md).
