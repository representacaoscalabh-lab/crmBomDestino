# Agregações resumidas (Design & PoC)

Este documento descreve um padrão recomendado para reduzir leituras Firestore em dashboards e relatórios pesados: coleções de resumos (materialized summaries) atualizadas incrementalmente.

1) Objetivo
- Reduzir leituras e custo de consulta transformando agregações O(N) (varredura de pedidos) em leituras O(1) por período/loja.

2) Estrutura proposta
- Coleção: `summaries/monthly/{YYYY-MM}` (ou `summaries/{storeId}/{YYYY-MM}` para por-loja)
- Documento exemplo (`summaries/monthly/2024-01`):
```json
{
  "year": 2024,
  "month": 1,
  "weight": 12345.67,
  "ordersCount": 321,
  "positivations": 120,
  "revenue": 98765.43,
  "updatedAt": "2024-02-01T12:00:00Z"
}
```

3) Atualização (PoC)
- Trigger: Cloud Function acionada em `orders` onCreate / onUpdate / onDelete.
- Lógica: calcular deltas a partir do pedido (peso, valor, cliente novo no mês) e aplicar `increment`/`set` atômicos no documento de resumo. Manter idempotência usando `orderId` ou registro de transações, quando necessário.

4) Leitura na aplicação
- `dashboard-service` / `report-data-service` devem ler `summaries/monthly/{YYYY-MM}` para preencher gráficos de peso/positivação e apenas recorrer aos pedidos quando for necessário o detalhe transacional.

5) Benefícios
- Redução enorme de leituras em dashboards históricos (dezenas de milhares de docs → 1 doc por mês).
- Agregações em tempo quase real (dependendo da latência da função).

6) Observações
- Implementar testes de concorrência e idempotência nas funções de atualização.
- Considerar TTL ou reprocessamento completo periódico para recuperar consistência em caso de erro.

---
Documento técnico de apoio para a estratégia de otimização de leituras.
