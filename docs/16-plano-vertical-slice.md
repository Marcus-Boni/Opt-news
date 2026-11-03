# 16 — Plano e estado do vertical slice 01

> Ciclo de 2026-11-02. Tamanhos relativos (P/M/G), não datas. Status: **Feito** = comportamento implementado e coberto por teste automatizado; **Parcial** = implementado com lacuna declarada; **Aberto** = não iniciado.

## Escopo do slice (PRD § MVP)

Fonte demo → item classificado → feed e detalhe → comentário autenticado → proposta e votação de pauta → meetup criado manualmente → aprendizado registrado e relacionado → busca. Integrações externas simuladas: fontes (feeds sintéticos RSS/Atom), provedor de IA (simulado/roteirizado), login (personas sintéticas). A curadoria roda dentro do Opt News (ADR-0003, estratégia D). Nenhum serviço pago, tenant ou recurso Azure.

## Tarefas

| ID | Tarefa | Backlog | Req. | Dep. | Tam. | Status | Aceite / evidência |
|---|---|---|---|---|---|---|---|
| VS-01 | Auditoria do AIHOT no SHA fixado | S-001 | N-01..N-03 | — | M | Feito | `docs/07-aihot-spike.md` (resultado) |
| VS-02 | Contrato interno `PublishedStoryV1` | S-002 | N-02, N-03, X-05 | VS-01 | P | Feito (adapter AIHOT removido com a estratégia D) | `content/publish.ts`; `ingest.test.ts` |
| VS-03 | ADR de reuso, sessão, stack e contrato | S-003 | — | VS-01 | P | Feito (aguarda aceite) | ADR-0003, 0010, 0011, 0012 |
| VS-04 | Monorepo, TS estrito, Biome, scripts | F-001 | — | VS-03 | P | Feito (CI Azure DevOps pendente) | `npm run lint`, `npm run typecheck` |
| VS-05 | Banco, migração up/down, seed sintético | F-002 | X-04 | VS-04 | M | Feito | `api.test.ts` › "migrations"; `npm run db:seed` |
| VS-06 | Sessão server-side, CSRF, RBAC, login simulado | F-003 | X-01*, X-02 | VS-05 | M | Parcial (Entra real depende de Q-04) | `api.test.ts` › "authentication and session"; `unit.test.ts` › "authorization policy" |
| VS-07 | Curadoria automática portada do AIHOT: fetch protegido (SSRF), RSS/Atom, dedupe por URL canônica, arquivamento de itens antigos, pré-filtro, duas notas com limiar por nível de fonte, redação pt-BR, recibos e orçamento, worker pg-boss | F-004 | N-01*, N-02, N-03, X-05, X-06, X-08 | VS-02, VS-05 | G | Feito (provedor real pendente: Q-03) | `ingest.test.ts` (12 testes), `unit.test.ts` › feed parsing, model output contracts |
| VS-08 | Feed (cursor, tópico, relevância, texto, período) e detalhe com proveniência | F-005 | N-04, N-05 | VS-06, VS-07 | M | Feito (API) | `api.test.ts` › "stories" |
| VS-09 | Indicação de link com proteção SSRF e idempotência | F-006 | N-11 | VS-07 | P | Feito (fila de curadoria ainda sem tela de decisão) | `api.test.ts` › "link submissions"; `unit.test.ts` › "url guard" |
| VS-10 | Comentários: thread, edição com revisão, moderação auditada | F-007 | C-01, C-04 | VS-08 | M | Feito | `api.test.ts` › "comments" |
| VS-11 | Proposta (de notícia ou manual) e voto único idempotente | F-008 | M-01, M-02 | VS-10 | M | Feito | `api.test.ts` › "meetup proposals and sessions" |
| VS-12 | Agendamento manual, estados, materiais, registro pós-meetup | F-009 | M-03, M-04, M-05*, M-07 | VS-11 | M | Feito | idem + `e2e.test.ts` |
| VS-13 | Insight com referências validadas + busca FTS com ACL | F-010 | K-01, K-02, K-06* | VS-12 | M | Feito | `api.test.ts` › "knowledge and search"; `e2e.test.ts` |
| VS-14 | OpenAPI 3.1 gerado do contrato | — | — | VS-04 | P | Feito | `npm run openapi` → `docs/openapi-v1.json` |
| VS-15 | Frontend: shell, feed, notícia, comunidade, meetups, conhecimento, busca, admin (sync) | F-005..F-010 | N-04, N-05, X-07 | VS-08..VS-13 | G | Feito (verificação manual no navegador; sem E2E automatizado de UI) | `docs/evidencias/slice-01/` (11 capturas, claro/escuro, desktop/mobile); `apps/web/test/format.test.ts` |
| VS-17 | Acontecimentos (N-06): recall por texto em 14 dias, julgamento do modelo em 4 relações (portado do AIHOT), agrupamento só com confiança ≥ 0,75, decisões auditáveis, um card por acontecimento no feed, linha do tempo | NX-11 | N-06 | VS-07 | M | Feito | `ingest.test.ts` › events (N-06); `api.test.ts` › events and briefings |
| VS-18 | Briefing diário (N-07): seleção por regra (um por acontecimento), panorama escrito pelo modelo e descartado se citar nome ou número ausente dos itens, retirada do panorama quando uma notícia sai | NX-11 | N-07 | VS-17 | M | Feito (só diário; semanal/mensal depois) | `ingest.test.ts` › daily briefing (N-07); `api.test.ts` › events and briefings |
| VS-19 | Admin de fontes (N-01): lista com saúde e contagens por estado, detalhe com o destino de cada item (motivo de falha/rejeição, notas), pausar/retomar e cadência (curador), cadastro e edição de nome, URL e nível (admin), URL protegida contra rede interna, auditoria antes/depois | NX-12 | N-01 | VS-07 | M | Feito | `api.test.ts` › source administration (N-01) |
| VS-20 | IA real e feeds reais: conector Foundry (`gpt-6-luna`, Entra, saída estruturada, novas tentativas, `ProviderUnavailable`), cortes por modelo, 16 feeds públicos, charset, coleta condicional (ETag/Last-Modified) | Q-03, Q-02 (local), Q-10 | N-02, N-03, X-05 | VS-07 | M | Feito (ADR-0013, ADR-0014) | `foundry.test.ts`, `curation.test.ts` › conditional GET, `ingest.test.ts` › selection gates, Latin-1 |
| VS-23 | Apresentação (`/sobre`, pública) e novo login: campo de pontos do símbolo (three.js), pilares com impulso, pipeline fixado pela rolagem com trilho e contador, seção de IA no roxo; título do herói por linhas (SplitText), blocos que chegam ao rolar, campo que se desfaz ao sair do herói, barra fixa com "Entrar", botões magnéticos, pilares com empurrão (anime.js); tudo desligado sob movimento reduzido, com o pipeline em coluna (DESIGN.md › Superfícies de apresentação) | X-01* (login simulado até Q-04) | — | VS-22 | M | Feito | conferido no navegador (1400 e 375px); sem teste automatizado de UI (NX-02) |
| VS-22 | Fontes sem feed (`web_list`, ADR-0015): Anthropic e Claude coletados pela página de listagem, com metadados de prévia; prefixo de links no admin; fontes da lista demo do AIHOT que faltavam (Mistral, Google Research, BAIR, Import AI, Latent Space, The Decoder) | N-01*, Q-02 | N-02 | VS-20 | M | Feito (ADR-0015) | `listing.test.ts` |
| VS-21 | Curadoria (NX-03): fila com revisões, indicações com problema e decisões do pipeline; publicar/retirar; "publicar mesmo assim"; rótulos e resumo de calibração. Indicações (N-11) entram no pipeline pela fonte `indicacoes`. Leitura do artigo pronta e desligada (`ARTICLE_READING`, Q-02) | N-01*, N-11, Q-10 | N-02, N-03, N-11 | VS-19, VS-20 | G | Feito (ADR-0014) | `curation-api.test.ts`, `curation.test.ts` |
| VS-16 | E2E do produto (doc 15) | F-011 | todos acima | VS-08..VS-13 | M | Feito (HTTP); E2E de navegador pendente | `e2e.test.ts` |

`*` cobertura parcial do requisito: N-01 sem coleta sob demanda (a fonte retomada ou com URL nova entra na próxima execução do worker); X-01 sem Entra real; M-05 só links (sem upload de arquivo); K-06 busca simples, sem filtros avançados.

## Próximo ciclo (proposta, em ordem)

| ID | Tarefa | Dep. | Tam. | Aceite |
|---|---|---|---|---|
| NX-01 | Pipeline Azure DevOps (lint, typecheck, testes com PostgreSQL de serviço, build, `npm audit`, secret scan) | Q-01 | P | PR bloqueado se qualquer gate falhar |
| NX-02 | E2E de navegador (Playwright) do fluxo principal em desktop e mobile + verificação axe | VS-15 | M | Fluxo do doc 15 verde em CI |
| NX-03 | ~~Tela de curadoria~~ feita em VS-21;: fila de indicações (N-11) encaminhadas ao pipeline com extração de título/descrição da página pelo fetch protegido, e itens `under_review` (aceitar, rejeitar, corrigir) com auditoria | VS-09, VS-19 | M | Curador decide; membro vê o resultado |
| NX-04 | Experimentos e decisões append-only (K-03, K-04, K-07) | VS-13 | M | Decisão imutável, revisitada só por novo registro |
| NX-05 | Consumidor do outbox (notificações e reindexação) com retry/DLQ | VS-07 | M | Eventos despachados exatamente uma vez por consumidor idempotente |
| NX-06 | ~~Provedor de IA aprovado~~ conector Foundry feito (ADR-0013, `foundry.test.ts`, `npm run model:check`); falta rodar com permissão e a calibração dos limiares com amostra rotulada pelos curadores | Q-02, Q-03, Q-10 | M | Custo por item e concordância com curadores registrados no doc 07 |
| NX-13 | Reagrupar quando uma notícia é corrigida, fundir acontecimentos e registrar a segunda fonte de uma mesma URL como cobertura; briefing semanal e mensal | VS-17, VS-18 | M | Correção muda o agrupamento com histórico; edições semanais a partir dos diários |
| NX-07 | Entra ID (OIDC no backend) atrás de `AUTH_MODE=entra` | Q-04, Q-07 | M | 401/403 com tenant de teste; offboarding testado |
| NX-08 | Observabilidade: OpenTelemetry (traces/métricas), painel de jobs e alertas | Q-05 | M | p95 e falhas de sync visíveis |
| NX-09 | Lacunas de contrato achadas no frontend: `GET /meetup-proposals/{id}`, diretório de membros para escolher responsável (hoje usa as personas de dev), excluir comentário, mudar status de insight, manchete da notícia de origem em `MeetupSession.proposal` | VS-15 | P | Endpoints no contrato, OpenAPI regenerado, UI sem contornos |
| NX-10 | Reduzir o bundle do web (≈148 kB gzip, maior parte é o Zod do mapa `endpoints`): exportar só metadados de rota para o cliente | VS-15 | P | Bundle medido antes/depois |

## Decisões humanas bloqueantes (sem rediscutir o que já foi aprovado)

| Decisão | Bloqueia | Default seguro em vigor |
|---|---|---|
| ADR-0003 aceito (estratégia D) | — | — |
| Q-02 fontes e direitos | Coleta real (NX-06) | Só fixtures sintéticas |
| Q-03 provedor de IA e orçamento | Chamadas de modelo | Provedor decidido (ADR-0013) e conector pronto; falta o papel *Cognitive Services OpenAI User* e o teto mensal. Até lá `MODEL_PROVIDER=simulated` |
| Q-04/Q-07 tenant, app registration e papéis | SSO real (NX-07) | Login simulado só fora de produção |
| Q-01/Q-05 repositório Azure DevOps e hospedagem | CI/CD e qualquer deploy | Execução local (Docker Compose) |
| Q-09 identidade visual | Publicar a marca | Tokens provisórios |
