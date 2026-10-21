# Guia rápido de desenvolvimento

Atualizado em **21/10/2026**.

## Ambiente

Use Node.js 22, npm e Git. O frontend requer no mínimo Node.js 20.9; funções e scripts de migração foram preparados para Node.js 22. O Firebase CLI é necessário para publicar regras/índices/funções. O emulador Firestore requer Java compatível com a versão do CLI utilizada.

Na raiz do repositório:

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run dev
```

Se `.env.local` já existir, preserve seus valores e apenas compare com `.env.example`. Não substitua uma configuração existente pelos marcadores do exemplo.

Preencha as variáveis públicas com o projeto Firebase e habilite o login Google. Autorize `localhost` e o domínio de produção no Authentication. A aplicação abre em `http://localhost:3000`; a dashboard é `/`.

## Primeiro administrador

Configure no servidor:

- `FIREBASE_ADMIN_EMAIL`: email Google que será o administrador inicial.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: JSON de uma conta de serviço autorizada no projeto.

Ao autenticar com o email verificado configurado, `/api/auth/bootstrap` provisiona o administrador. Demais usuários ficam sujeitos à aprovação em Configurações. Não publique credenciais em código, documentação, logs ou variáveis `NEXT_PUBLIC_*`.

## Flags que devem começar desativadas

```dotenv
NEXT_PUBLIC_FIREBASE_DAILY_SUMMARIES=false
NEXT_PUBLIC_FIREBASE_CNPJ_RESERVATIONS=false
```

O sistema consegue consultar listas pelo SDK Web sem a credencial Admin. A projeção leve na API exige essa credencial; as flags acima exigem também publicar e migrar a infraestrutura. Não as habilite apenas para testar a interface com uma base não migrada.

## Verificar alterações

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd start
```

Em PowerShell com execução de `.ps1` desativada, prefira `npm.cmd` e `firebase.cmd`. Não é necessário alterar a política de execução do sistema.

## Onde alterar

- Página: `src/app/<rota>/page.tsx`; a dashboard está em `src/app/page.tsx`.
- Componentes: `src/components/`, com CSS local quando necessário.
- Contratos e cálculos: `src/lib/types.ts` e utilitários específicos em `src/lib/`.
- Consultas paginadas: `use-record-page.ts`, `record-query.ts` e as implementações Admin/Web.
- Regras e índices: `firestore.rules`, `firestore.indexes.json` e `firebase.json`.
- Favicon: `public/favicon.svg`, `public/fav.icon.png`, `public/apple-touch-icon.png` e metadata em `src/app/layout.tsx`.

Para uma nova listagem, reutilize a camada de consultas/cache. Não copie os exemplos históricos de `getDocs(collection(...))` sem período ou limite. Depois de uma gravação, invalide apenas os recursos afetados.

## Problemas frequentes

| Sintoma | Verificação |
| --- | --- |
| Acesso pendente | Confira `users/{uid}.status` e a aprovação por um administrador. |
| Erro de permissão Firestore | Confira conta autenticada, aprovação e regras publicadas no projeto correto. |
| API Admin indisponível | Confira a credencial no servidor. Sem ela, as listas usam a alternativa Web identificada pela API. |
| Índice ausente | Publique os índices versionados e aguarde a construção; não retire filtros para contornar o erro. |
| Totais mostram traço após filtros | Solicite **Calcular totais do filtro**. O traço não significa zero. |
| Página sem resultados, mas com Próxima | A busca atingiu o limite de verificação dessa requisição; continue ou refine o período. |
| Cadastro bloqueado durante migração | Confira o manifesto e o procedimento de reservas de CNPJ; não remova a proteção enquanto a migração estiver em curso. |
| Favicon antigo | Atualize a página/aba e o cache do navegador; os arquivos atuais são a letra B em fundo vinho. |

Para publicação e backfills, siga [o guia de ativação do Firebase](../docs/ativacao-reducao-leituras-firebase.md). Não execute comandos com `--apply` sem conferir projeto, credenciais, lotes e sequência de ativação.
