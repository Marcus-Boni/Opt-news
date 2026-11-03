# 15 — Matriz de rastreabilidade (PRD → tarefas → testes)

> Registro inicial. Após implementação, incluir nomes reais dos testes, PRs e commits. Os IDs do PRD e roadmap são convenções do pacote, não dados de um Azure DevOps existente.

| Requisitos | Entrega inicial | Testes/evidências mínimos |
|---|---|---|
| N-01 N-02 N-03 | S-001 S-002 F-004 E-001 | adapter contract, idempotência, fonte desligada, provenance |
| N-04 N-05 | F-005 | feed e detalhes: autoria/data/citação; mobile+keyboard; pagination |
| N-01 X-03 | `api.test.ts` › source administration (N-01) | passa |
| N-06 N-07 | E-002 E-003 | cluster/eventos, relatórios com evidência; retract updates |
| N-08 N-09 N-10 | E-006 E-007 | preferências isoladas por usuário, score interno versionado |
| N-11 | F-006 | SSRF e input validation; duplicate submission; feedback de estado |
| C-01 C-04 | F-007 | 401/403, thread, edit conflict, moderation audit |
| C-02 C-03 C-05 C-06 C-07 | E-005 E-006 + backlog futuro | reação idempotente, menção ACL; necessidade de novos IDs de tarefa |
| M-01 M-02 | F-008 | proposta de artigo/manual, voto único e janela de votação |
| M-03 M-04 M-07 | F-009 F-010 | agenda/cancelamento/fuso, material manual, pós-meetup |
| M-05 M-06 M-08 | M-101 M-102 M-104 | permissionamento artifact, Graph mock, human review |
| K-01 K-02 | F-010 | insight e referências recuperáveis; ACL |
| K-03 K-04 K-07 | K-101 K-102 | estados, evidência e decisão append-only |
| K-05 K-06 | K-103 E-004 M-103 | indexação com ACL; links sem exposição indevida |
| X-01 X-02 | F-003 | SSO validado; horizontal/vertical RBAC |
| X-03 X-04 X-05 | S-004 S-005 F-004 | audit trail, license inventory, metadata model/prompt |
| X-06 X-07 X-08 | F-011 + fase operacional | falhas simuladas, a11y, alarmes, budgets |

## Teste E2E principal do produto

1. Criar fixture/fonte permitida e publicar notícia via adapter mock.
2. Usuário de teste A entra, abre artigo, vê fonte e indicador de IA.
3. Usuário A cria comentário; B responde; C sem acesso recebe negação.
4. Usuário B propõe pauta; A vota; organizador fecha e agenda.
5. Organizador registra materiais e resultado manual do meetup.
6. Usuário A cria Insight com notícia e meetup associados.
7. Busca por tópico retorna notícia e Insight com ACL, e o detalhe permite navegar entre referências.
8. Falha simulada de IA não interrompe leitura/comentários; falha de Graph não cria sessão duplicada.

## Definição de evidência

Cada item completado deve anexar: teste automatizado nomeado, comando de execução, vídeo/captura ou resultado da interface quando relevante, decisão de acesso/privacidade e referência de PR/commit. Marcar `not tested` explicitamente quando aplicável.

## Evidências do slice 01 (2026-11-02)

Comando: `npm test` (node:test, PostgreSQL 17 local, banco `optnews_test` recriado pelas migrações). Sem PR/commit: o diretório ainda não é um repositório git (Q-01).

| Requisitos | Teste automatizado (arquivo › bloco) | Status |
|---|---|---|
| N-01 N-02 N-03 X-05 X-06 X-08 | `ingest.test.ts` › pipeline over the fixture feeds; failures are contained; guarded fetch (SSRF) | passa |
| N-03 X-05 | `unit.test.ts` › feed parsing; model output contracts | passa |
| N-06 N-07 | `ingest.test.ts` › events (N-06), daily briefing (N-07); `api.test.ts` › events and briefings (N-06/N-07) | passa |
| N-04 N-05 | `api.test.ts` › stories (feed, detail, ACL) | passa |
| N-11 | `api.test.ts` › link submissions; `unit.test.ts` › url guard | passa |
| N-01 Q-02 (`web_list`) | `listing.test.ts` › listing links, web_list collection, listing sources in the admin; migração 0003 em `api.test.ts` › migrations | passa |
| N-11 NX-03 Q-10 | `curation-api.test.ts` › curation queue (NX-03); `curation.test.ts` › member submissions, curator override and article reading, conditional GET, page parsing | passa |
| Q-03 | `foundry.test.ts` › foundry provider; `npm run model:check` com o `gpt-6-luna` real (doc 07 §6) | passa |
| C-01 C-04 | `api.test.ts` › comments | passa |
| M-01 M-02 M-03 M-04 M-07 | `api.test.ts` › meetup proposals and sessions | passa |
| K-01 K-02 K-06 | `api.test.ts` › knowledge and search | passa |
| X-01 X-02 | `api.test.ts` › authentication and session; `unit.test.ts` › authorization policy | passa (login simulado; Entra real `not tested`) |
| X-04 (migração) | `api.test.ts` › migrations | passa |
| Fluxo E2E (passos 1–8 acima) | `e2e.test.ts` › notícia → debate → pauta → meetup → aprendizado → busca | passa via HTTP; navegador `not tested` automatizado (capturas manuais em `docs/evidencias/slice-01/`) |
| Passo 8 (falha de Graph) | — | `not tested`: não há integração Graph no slice (ADR-0009) |
