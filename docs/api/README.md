# API CRM Bom Destino — v1

API de leitura em JSON para pedidos, clientes, produtos, redes, bonificações,
metas, condições de pagamento e coleções auxiliares do CRM. A documentação
também fica em **Configurações → API**, com teste de conexão, consulta de cinco
registros, referência de campos e download OpenAPI.

Na tela, use a busca para encontrar uma coleção. **Copiar tudo** copia a
documentação de todas as coleções, campos, exemplos e OpenAPI. **Baixar OpenAPI**
gera `crm-api-openapi.json` no navegador, com o domínio atual, sem depender de
uma chamada ao servidor. O arquivo contém a especificação, sem dados reais ou
tokens. Exemplos, endereços e respostas também podem ser copiados separadamente.

## Configuração e execução

- Definições: `src/cfg/api.ts`.
- Catálogo JSON: `src/cfg/api-collections.json`.
- Modelos comerciais: `src/lib/types.ts`.
- Regenerar catálogo após alterar modelos: `npm.cmd run api:schema`.
- Credencial do servidor: `FIREBASE_SERVICE_ACCOUNT_JSON`, JSON completo da
  conta de serviço no ambiente do Next.js. Projeto: `NEXT_PUBLIC_FIREBASE_PROJECT_ID`.
- Nunca coloque credenciais administrativas em `cfg`, no catálogo ou em uma variável `NEXT_PUBLIC_`.
- Execute `npm.cmd run dev` localmente ou publique com `npm.cmd run build` e
  `npm.cmd start` em uma hospedagem compatível com servidor Next.js/Node.js.
  Uma hospedagem de arquivos estáticos não executa esta API.

O endereço base é `https://SEU-DOMINIO/api/v1` (local: `http://localhost:3000/api/v1`).
Não há chave de API estática nem autenticação por conta de serviço no navegador.

## Autenticação

Todos os endpoints exigem `Authorization: Bearer <Firebase ID token>`.
Obtenha o token pelo SDK Firebase após login:

```ts
const token = await auth.currentUser!.getIdToken();
const response = await fetch('/api/v1/collections/orders?limit=25', {
  headers: { Authorization: `Bearer ${token}` },
});
const body = await response.json();
if (!response.ok) throw new Error(body.error.message);
console.log(body.data, body.pagination.next);
```

O servidor verifica validade e revogação do token e consulta `users/{uid}` em
cada chamada. O usuário precisa de `status: approved`. Para `users` e
`access_requests`, precisa também de `role: admin`. Um token expirado deve ser
renovado pelo SDK; não salve tokens em arquivos de configuração.

## Endpoints

| Método e caminho | Resultado |
| --- | --- |
| `GET /api/v1` | Versão, autenticação, limites e nomes das coleções autorizadas |
| `GET /api/v1/collections` | Catálogo JSON de campos e tipos conforme o perfil |
| `GET /api/v1/openapi` | Documento OpenAPI 3.0.3 para importar em ferramentas de API |
| `GET /api/v1/collections/{collection}?limit=25&after=ID` | Página de documentos completos |
| `GET /api/v1/collections/{collection}/{id}` | Documento completo por ID |

Coleções: `customers`, `customer_groups`, `products`, `orders`, `bonifications`,
`goals`, `payment_terms`, `sellers`, `customer_documents`, `settings`,
`daily_orders`, `daily_bonifications`, `users` e `access_requests`.
`aggregate_states` é documentada como interna e não tem endpoint de dados.
`settings` expõe somente `mart_minas`, `oesa_nova_safra` e `read_optimization`.
Coleções desconhecidas e subcoleções não são expostas automaticamente.

Não há endpoints de escrita nesta versão. A API existente `/api/crm/records`
continua atendendo os filtros e totais usados nas telas do CRM.

## JSON e paginação

```json
{
  "data": [{ "id": "pedido-123", "preOrder": "123", "items": [], "totalValue": 100 }],
  "pagination": { "limit": 25, "next": "pedido-123" }
}
```

Exemplo ilustrativo; campos completos estão no catálogo JSON, incluindo os
campos de cada item de pedido/bonificação. Listagens e detalhes preservam os
campos efetivamente armazenados, inclusive campos legados e opcionais. A API
não preenche dados ausentes. O `id` retornado sempre é o ID real do documento.
O detalhe usa `{ "data": { ... } }`; documento inexistente retorna 404.

- `limit`: inteiro de 1 a 100, padrão 25.
- Ordenação: ID do documento crescente.
- `after`: ID de `pagination.next`, codificado na URL; omita na primeira chamada.
- `next: null`: fim da coleção. Continue mesmo se o próximo cursor não se
  parecer com o ID comercial/número do pedido.
- A API busca até `limit + 1` documentos para detectar a próxima página.
- Não aceita filtros adicionais nem parâmetros repetidos. As páginas não são
  um snapshot transacional; mudanças concorrentes podem alterar os resultados.
- Cada consulta conta como leitura do Firestore. Não há exportação ilimitada,
  contagem global ou cache compartilhado destes endpoints.

Datas comerciais: `YYYY-MM-DD`. Timestamps Firestore: ISO 8601 UTC.
Valores monetários comerciais: reais; `valueCents`: centavos. Pesos: kg.
Referências Firestore são caminhos, coordenadas são `{ latitude, longitude }`
e bytes são base64. Pedidos e bonificações incluem `items` completos.
Resumos diários podem estar vazios quando as funções/agregações não estão ativadas.
`sellers` contém registros legados; a aplicação usa os responsáveis fixos.

```sh
curl -H "Authorization: Bearer $TOKEN" \
  "https://SEU-DOMINIO/api/v1/collections/customers?limit=25"
```

## Erros

```json
{ "error": { "code": "forbidden", "message": "Seu acesso ao CRM não está aprovado." } }
```

| Status | Situação |
| --- | --- |
| 400 | `invalid-query`, `invalid-limit` ou `invalid-id` |
| 401 | `unauthenticated` ou `invalid-token` |
| 403 | `forbidden`: usuário sem aprovação ou perfil insuficiente |
| 404 | `collection-not-found` ou `document-not-found` |
| 503 | `server-not-configured` ou `service-unavailable` |

Respostas GET usam `Cache-Control: private, no-store`. Métodos não implementados
são rejeitados pelo Next.js com 405 e não usam necessariamente o envelope JSON
acima. A API atende o mesmo domínio; não configura CORS para aplicações em
outros domínios. Integrações externas podem usar um backend com HTTPS.

## Manutenção

Os campos de coleções comerciais são gerados dos tipos TypeScript. Campos de
auditoria e coleções auxiliares estão definidos no gerador. Execute
`npm.cmd run api:schema`, confira o diff e rode os testes ao alterar os modelos.
O catálogo descreve o modelo esperado; não é uma migração ou validação de todos
os documentos existentes. As permissões da API são verificadas no servidor,
pois o SDK Admin não aplica `firestore.rules`.
