# 06 — Contratos de API e eventos (proposta v1)

> Especificação de superfície, não Swagger implementado. Antes do código, produzir OpenAPI 3.1, schemas runtime (ex.: Zod) e client tipado. Não expor API do AIHOT diretamente ao frontend.

## Convenções

- Prefixo `/api/v1` para APIs de negócio Opt News; versionamento de schema/campos; `application/json`.
- IDs UUID strings internas; datas ISO8601 UTC; paginação por cursor sempre que feed puder crescer; filtros explícitos.
- Entra ID e sessões conforme ADR: backend valida autenticação e `aud`, `iss`, `tid`, `oid`, expiração, roles/scopes.
- Errors: RFC 9457 Problem Details com `type`, `title`, `status`, `detail` seguro, `requestId`.
- Para mutações com integração externa: `Idempotency-Key` e idempotência persistida; `ETag`/`If-Match` ou `revision` para concorrência.
- Autorização no servidor por objeto e operação; retornar 404 quando não revelar existência for necessário.

## Endpoints propostos

| Método | Caminho | Responsável | Papel mínimo |
|---|---|---|---|
| GET | `/stories` | Feed paginado, filtros `topic`, `sort`, `from`, `to`, `q` | membro |
| GET | `/stories/{id}` | Detalhe, fontes e event links | membro |
| POST | `/stories/submissions` | Indicar URL candidata à curadoria | membro |
| GET | `/events/{id}` | Agrupamento de notícias | membro |
| GET | `/topics` | Taxonomia e assuntos | membro |
| GET | `/search` | Pesquisa autorizada e tipada | membro |
| POST | `/comments` | Comentário em alvo autorizado | membro |
| PATCH | `/comments/{id}` | Editar por autor/curador | autor/curador |
| POST | `/comments/{id}/moderate` | Moderar com motivo | curador |
| PUT | `/reactions/{targetType}/{targetId}` | Criar/substituir reação | membro |
| POST | `/meetup-proposals` | Criar proposta (manual ou notícia) | membro |
| GET | `/meetup-proposals` | Listar/votar | membro |
| PUT | `/meetup-proposals/{id}/vote` | Votar/desvotar | membro |
| POST | `/meetups` | Agendar sessão | organizador |
| PATCH | `/meetups/{id}` | Atualizar agenda/status | organizador |
| POST | `/meetups/{id}/artifacts` | Vincular slides/resumo/links | organizador/apresentador |
| POST | `/insights` | Criar insight com referências | membro |
| POST | `/experiments` | Criar POC a partir de insight | membro autorizado |
| POST | `/experiments/{id}/decisions` | Registrar decisão append-only | papel autorizado |
| GET | `/knowledge` | Listar/buscar conhecimento | membro |
| GET | `/me` | Perfil e papéis efetivos | membro |
| PATCH | `/me/preferences` | Tópicos e notificações | membro |
| GET | `/admin/sources` | Fontes e saúde de ingestão | curador |
| PATCH | `/admin/sources/{id}` | Ajustar fonte/ativação | curador |
| GET | `/admin/jobs` | Falhas, custos e retries | operador |
| GET | `/admin/audit` | Auditoria paginada | auditor/admin |

**Papel mínimo é ilustrativo**; matriz RBAC final em documento de segurança, a calibrar. Endpoints de moderação não devem ser delegados a usuários comuns.

## Exemplo de resposta de notícia (ilustrativo)

```json
{
  "id": "00000000-0000-4000-8000-000000000001",
  "headline": "Lançamento de exemplo",
  "summary": "Resumo autoral em português, com evidências.",
  "originalUrl": "https://example.org/artigo",
  "source": { "id": "source-demo", "name": "Fonte ilustrativa" },
  "originalPublishedAt": "2026-11-02T12:00:00Z",
  "firstSeenAt": "2026-11-02T12:30:00Z",
  "topics": ["agentes"],
  "editorialScore": 81,
  "optsolvRelevanceScore": null,
  "aiGenerated": true,
  "provenance": {"evaluationVersion":"v1", "evidenceUrls":["https://example.org/artigo"]},
  "status": "published"
}
```

Campos numéricos não têm unidade/política final até ADR de ranking. `example.org` é dado fictício, não fonte real.

## Eventos de domínio propostos

| Evento | Produzido por | Consumidores sugeridos |
|---|---|---|
| `content.story.published.v1` | adapter de publicação | indexador, feed, recomendações |
| `content.story.retracted.v1` | curadoria | indexador, cache, aviso editorial |
| `community.comment.created.v1` | comunidade | notificações e atividade |
| `meetups.proposal.created.v1` | meetups | notificações, agenda editorial |
| `meetups.session.completed.v1` | meetups | tarefas pós-evento, conhecimento |
| `knowledge.insight.created.v1` | conhecimento | indexador, recomendações |
| `knowledge.experiment.decided.v1` | conhecimento | audit trail, retrospectivas |

Envelope comum `{ eventId, eventType, version, aggregateId, occurredAt, correlationId, actorType, payload }`. Outbox transacional e consumidores idempotentes. Dados sensíveis não devem circular em payloads genéricos.

## Contratos de erro e autenticação

- `401`: não autenticado/token expirado.
- `403`: autenticado sem permissão.
- `404`: não encontrado/ocultado por política.
- `409`: estado ou versão conflita; voto repetido sem idempotência.
- `422`: falha de validação semanticamente relevante.
- `429`: limites de abuso/integração.
- `503`: indisponibilidade temporária com erro explícito; nunca afirmar criação remota sem sucesso.

## Compatibilidade

Contratos são fonte de verdade do frontend; gerar cliente a partir do OpenAPI. Mudanças aditivas podem ser minor; renomeação/remoção requer versionamento e plano de migração. Testes de contrato obrigatórios para cada fronteira de módulo e adapter AIHOT.
