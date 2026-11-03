# 07 — Auditoria de reuso AIHOT (spike antes da implementação)

## O que está documentado pelo upstream (não é resultado de auditoria)

- Framework/código open source para site de notícias, curadoria editorial e relatórios; licença MIT.
- Coleta fontes, executa pré-filtro e duas avaliações independentes, escreve título e resumo, agrupa cobertura de eventos e produz briefings.
- Processos documentados: `apps/api` Fastify, `apps/worker` com pg-boss e `apps/web` com React Router SSR, types/contracts compartilhados.
- `site/` guarda identidade/configuração; `industry/` fontes e critérios; `modules/` extensões específicas. Interface originalmente em chinês; upstream **não é framework empresarial pronto**.
- Página de leitura não executa modelo; resultados persistidos são servidos pela API. Há receipts/limites para chamadas pagas.
- Exibição integral de texto de fontes é controlada por política e desligada por padrão; marca/logo AIHOT não devem ser reutilizados.

Referências: https://github.com/KKKKhazix/AIHOT/blob/main/README.en.md ; https://github.com/KKKKhazix/AIHOT/blob/main/docs/architecture.md ; https://github.com/KKKKhazix/AIHOT/blob/main/docs/selection.md ; https://github.com/KKKKhazix/AIHOT/blob/main/docs/customize.md ; https://github.com/KKKKhazix/AIHOT/blob/main/LICENSE .

## Pergunta técnica do spike

**Qual é a maneira de reutilizar apenas o motor de inteligência do AIHOT sem herdar acoplamento de UX, autenticação pública, esquema de dados ou manutenção onerosa?**

## Estratégias a comparar

| Estratégia | Benefícios potenciais | Custos/riscos | Sinal de escolha |
|---|---|---|---|
| A. Motor como serviço interno isolado | Menor invasão, implantação e rollback independentes | Infra adicional, contratos/mapeamento, duplicação controlada | API de publicação e jobs suficientemente completos |
| B. Extrair módulos de backend como pacote | Contratos locais e menor overhead de rede | Fragilidade com imports, scripts e migrations upstream | Testes mostram limites de pacote claros |
| C. Fork seletivo com isolamento por adapter | Acesso direto a mecanismos e evolução mais rápida | Divergência upstream/merge, herança de dívida | Extração inviável, domínio interno mantido fora do fork |
| D. Reimplementar componentes específicos | Total controle e escopo reduzido | Perde valor do reuso, custo técnico | Risco de segurança/licença/dívida supera benefício |

**Não assumir A/B/C/D antes de evidência.**

## Checklist de investigação

### Reproduzibilidade e licença

- [ ] Registrar URL upstream, tag/commit SHA, data, license, arquivos de notices e dependências transitivas.
- [ ] Executar instalação e testes oficiais em ambiente isolado; resultados completos.
- [ ] Conferir scripts definidos no package.json e AGENTS.md antes de rodar (não presumir nomes).
- [ ] Relatar superfícies com conteúdo/nome/artefatos proibidos pelo upstream e política para atribuições.

### Pipeline e dados

- [ ] Mapear coletores por tipo: RSS, webpage, JSON e outros; autenticações necessárias; termos e robots.
- [ ] Localizar no código: `content`, `editorial`, `events`, `publication`, `reports`, `providers`, `operations`, `sources`.
- [ ] Documentar jobs, schemas PostgreSQL, migrations, estados e índice de produção.
- [ ] Medir como deduplica URL, conteúdo e evento; como lida com correção/retração, e dados antigos.
- [ ] Mapear critérios e taxonomia `industry/`, saída de modelos, prompt injection, avaliação e curadoria.
- [ ] Mapear modelo de recibos, orçamento, retry, idempotência e cancelamento de chamadas.
- [ ] Validar o contrato publicável de conteúdo e elegibilidade de fonte.

### Segurança

- [ ] Revisar download de URLs e bloqueio SSRF (redirecionamentos, DNS rebinding, redes internas).
- [ ] Verificar XSS e sanitização em HTML/Markdown retornados.
- [ ] Verificar injeção de prompts via fonte, citações inventadas e fuga de segredo.
- [ ] Auditar dependências, vulnerabilidades, imagens container, usuários de processo, permissões DB.
- [ ] Verificar auth do admin e isolamento entre conteúdo publicável e dados internos.

### Operação e custo

- [ ] Criar dois perfis de teste: fixtures offline sem LLM e sandbox com cota explícita (somente aprovado).
- [ ] Medir latência e custo/item/por lote, falhas, capacidade de retry, qualidade pt-BR, redução de duplicatas.
- [ ] Validar backup/restore, logs, health/readiness, shutdown, migrations.
- [ ] Executar mocks/falsos provedores para testes automáticos em CI.

## POC mínima do spike

Entrada: 5–15 fixtures de notícias **sintéticas ou licitamente usadas**, incluindo versões duplicadas, fonte indisponível, artigo velho, conteúdo conflitante e texto com prompt injection.

Saída: lista normalizada `PublishedStoryV1` via adapter, sem chamada de terceiros. Evidências: logs, IDs, snapshots dos resultados, testes unitários e custo zero com providers mockados.

## Critérios go/no-go sugeridos

**Go:** adapta sem modificar significativamente o fluxo interno; mantém proveniência, idempotência, rollback; testes reproduzíveis; licença e dependências viáveis; falhas têm tratamento; custos medidos; contrato estável.

**Go condicionado:** precisa endurecimento de segurança e revisão de módulos específicos com trabalho estimado e critérios de saída.

**No-go:** exposição de segredo/insegurança sem solução razoável, ausência de proveniência, acoplamento excessivo ou custo de manutenção superior à reimplementação seletiva.

## Entregável do spike

Preencher `templates/relatorio-spike.md`. Anexar inventário de módulos, dependências, diagramas de fluxo reais, tabela de reuso/reescrita, artefatos e scripts usados, testes com status, custos com hipóteses e ADR recomendada. Não alterar recursos de produção.

---

# Resultado do spike S-001/S-002 — 2026-11-02

> **Atualização (mesma data): o responsável escolheu a Estratégia D** — reimplementar a inteligência dentro do Opt News, guiada pelo AIHOT (ADR-0003 aceito). O relatório abaixo continua válido como auditoria e como mapa do que portar; a recomendação A ficou registrada como alternativa analisada.

> Preenchido conforme `templates/relatorio-spike.md`. Tudo abaixo foi verificado no código e em execução local, não em README.

**Data:** 2026-11-02
**Agente/responsável:** agente de desenvolvimento (Claude Code); aceite humano pendente
**URL do upstream:** https://github.com/KKKKhazix/AIHOT
**Commit SHA analisado:** `6e0cfaf5533b5a43fbe07a81ed7e235cd189ef7a` (2026-11-02 18:39 +0800, "fix: tell the admin page when a configured model name does not exist"). Sem tags nem releases; 203 commits desde 2026-09-29.
**Licença e atribuição verificadas em:** `LICENSE` (MIT, © 2026 数字生命卡兹克) e `NOTICE` (nome e logo "AIHOT" **não** são licenciados; `assets/og-fonts/` sob OFL 1.1; feeds de `industry/sources.json` pertencem aos publicadores).
**Ambiente de execução:** Windows 11 Pro, Node v24.11.1 (upstream exige `>=24.22.1`: aviso `EBADENGINE`), npm 11.6.2, Docker 29.7.2, PostgreSQL 17-alpine em container isolado (`127.0.0.1:55432`, banco descartável). Clone em pasta temporária fora do repositório.
**Serviços pagos desligados?** Sim. `COLLECT_ENABLED=false`, `MODEL_CALLS_ENABLED=false`, nenhuma chave de provedor configurada. Únicos acessos externos: `git clone` do GitHub e download de pacotes do registro npm.

## 1. Sumário executivo

**Go condicionado** para a **Estratégia A — motor como serviço interno isolado**: AIHOT no commit fixado, sem alterar código upstream, com o pacote de configuração da Optsolv em `industry/` e `site/` (os pontos de customização previstos pelo próprio upstream), consumido pelo Opt News **somente** pelo contrato público versionado de sincronização `GET /api/v1/selected/snapshot` + `GET /api/v1/selected/changes` (ledger com cursor de marca d'água, `upsert`/`remove`, `409 snapshot_required` após reconstrução). A ACL `PublishedStoryV1` já está implementada e testada contra a API real do AIHOT.

Condições (bloqueiam coleta real, não o desenvolvimento local):

| # | Condição | Esforço relativo | Decisão humana |
|---|---|---|---|
| C1 | Pacote `industry/` pt-BR: 31 prompts estão em chinês (`industry/prompts/*.md`), taxonomia e fontes demo são do site chinês; datas sem fuso assumem `+08:00` (`packages/backend/src/sources/dates.ts:33,82,115`) | M | Q-02, Q-11 |
| C2 | Provedor de IA aprovado: os presets de `site/models.ts` apontam para Zhipu, DeepSeek, DashScope e Xiaomi. Trocar por provedor aprovado (ex.: Azure OpenAI via `LLM_BASE_URL` compatível) com orçamento | P | Q-03 |
| C3 | Isolamento de rede: o motor é **público e anônimo por desenho** (`docs/architecture.md`, seção de regras: conteúdo público anônimo; `apps/api/src/http/respond.ts:58-59` aplica CORS `*`, observado na resposta real). Sem ingress público; só a API Opt News alcança o motor; admin do motor só por rede privada | P | Q-05, Q-06 |
| C4 | Proveniência: o payload v1 não expõe modelo/versão de prompt que gerou o resumo. Hoje gravamos `policyVersion` do pacote e `modelVersion = null`. Fechar com um módulo `modules/optnews-export` (extensão prevista pelo upstream) ou aceitar a lacuna | P | X-05 |
| C5 | Admin do motor usa `ADMIN_PASSWORD` ou OAuth Feishu (`packages/backend/src/admin/auth.ts:1-3`), sem Entra ID. Curadores operam fontes (N-01) no admin do motor via rede privada, ou protegê-lo com proxy Entra | P | Q-04, Q-07 |
| C6 | Atualização: upstream muito ativo (~6 commits/dia, 68 migrações). Fixar SHA e atualizar por PR com teste de contrato e smoke em staging | contínuo | — |
| C7 | Runtime: Node `>=24.22.1` e imagem Linux (o teste de backup trava no Windows; o alvo é container Linux) | P | Q-05 |

## 2. Inventário de módulos e interfaces

| Módulo | Caminho real | Responsabilidade | API/contrato | Dependências | Reuso? |
|---|---|---|---|---|---|
| API | `apps/api/src` (2,0 k linhas) | Fastify: site, API pública v1, RSS, MCP, admin, imagens | `/api/v1/*` (OpenAPI em `/openapi-v1.json`), `/api/v1/selected/{snapshot,changes}` | fastify 5.12.7, MCP server, zod | **Sim, como serviço** (só o sync v1 é consumido) |
| Worker | `apps/worker/src` + `packages/backend/src/jobs` | pg-boss: coleta, modelos, agrupamento, relatórios, alertas | `JobData` em `jobs/queue.ts` | pg-boss 12.34.0 | **Sim, como serviço** |
| Web | `apps/web` (17,3 k linhas) | Site React Router SSR em chinês | HTTP para a API | react-router 8.4 | **Não** (DEC-002) |
| Fontes | `packages/backend/src/sources` | RSS, lista web, JSON, X, contas WeChat, ingest externo | `industry/sources.json`, admin | undici, fast-xml-parser, cheerio | Sim (RSS/web/JSON); X e WeChat desligados |
| Conteúdo | `packages/backend/src/content` | Dedupe por `identity_key`/hash, extração, sanitização | `upsertMaterial` (`materials.ts:234-380`) | readability, sanitize-html, turndown | Sim (interno ao motor) |
| Editorial | `packages/backend/src/editorial` | Pré-filtro, 2 avaliações, título/resumo, tradução | prompts em `industry/prompts` | provedores LLM | Sim, **com prompts pt-BR** (C1) |
| Eventos | `packages/backend/src/events` | Agrupamento, calor, correções | tabelas próprias | — | Sim (alimenta N-06 depois) |
| Publicação | `packages/backend/src/publication` | Camada única de leitura pública, ledger selecionado | `V1ItemPayload` (`publish.ts:91-105`), `selectedSnapshot`/`selectedChanges` (`v1.ts`) | — | **Fronteira consumida** |
| Relatórios | `packages/backend/src/reports` | Diário/semanal/mensal | `/api/v1/dailies…` | — | Futuro (N-07) |
| Provedores | `packages/backend/src/providers` | LLM, embeddings, X, Jina; recibos e orçamento | `receipts.ts`, `circuit.ts` | — | Sim (C2) |
| Operações | `packages/backend/src/operations` | Alertas, backup, retenção, IndexNow | — | pg_dump | Parcial (IndexNow e Feishu desligados) |
| Notificações | `packages/backend/src/notify` | Feishu | — | — | Não (Teams é responsabilidade do Opt News) |
| Configuração | `site/`, `industry/`, `modules/` | Identidade, modelos, taxonomia, prompts, extensões | arquivos TS/JSON/MD | — | **Substituídos** pelo pacote Optsolv |
| Banco | `database/migrations` (68 arquivos, `0001`→`0105`) | Esquema próprio do motor, `pg_trgm` | migração online por arquivo | PostgreSQL 17 | Banco **separado** do Opt News |

## 3. Análise de segurança, licença e qualidade

| Risco | Evidência | Severidade | Mitigação | Owner |
|---|---|---|---|---|
| Exposição pública do motor (API anônima, CORS `*`, RSS, MCP, sitemap, `llms.txt`) | `docs/architecture.md` (saídas públicas); `apps/api/src/http/respond.ts:58-59`; header observado na resposta real | Alta se exposto | C3: sem ingress público, rede privada, só a API Opt News chama o motor | Infra |
| Provedores LLM padrão fora do ecossistema aprovado | `site/models.ts` (`PRESETS`) | Alta (LGPD/residência) | C2: provedor aprovado + DPA + orçamento | Tecnologia/Financeiro |
| SSRF na coleta | `lib/http-fetch.ts:49-79,150-193` (lookup checado na conexão, redirect manual por salto, orçamento único de tempo, origem fixa para requisições com credencial); `lib/url.ts:111-160` | Baixa | Manter `ALLOW_PRIVATE_NETWORK_FETCH` desligado; egress controlado | Infra |
| Prompt injection via fonte | `industry/prompts/safety.md:1`, `selection-score.md:7-8`, `editorial/input.ts:77` (material cercado em `<source>`) | Média (risco inerente) | Prompts pt-BR mantêm as cláusulas; Opt News trata a saída como texto (sem HTML, sem ações) | Curadoria |
| XSS por HTML de terceiros | `content/sanitize.ts` (allowlist `sanitize-html`) | Baixa para o Opt News | O Opt News **não** consome corpo HTML; o adapter remove controles/bidi e a UI renderiza texto | Engenharia |
| Gasto descontrolado / chamadas duplicadas | `providers/receipts.ts:1-30` (recibo antes da chamada, resposta salva antes do uso, liberação única após 30 min), `providers/circuit.ts` | Baixa | Orçamento definido em Q-03 | Operação |
| Armazenamento de texto integral para análise | `database/migrations/0001_core.sql:80,98,118` (`body_text`); `site_fulltext` desligado por padrão | Média (direitos) | Fontes aprovadas e base legal por fonte (Q-02, ADR-0008); retenção | Jurídico |
| Admin sem Entra ID | `admin/auth.ts` | Média | C5 | Segurança |
| Dependências | `npm audit --omit=dev`: **0 vulnerabilidades** (297 pacotes) | Baixa | Reauditar a cada troca de SHA | Engenharia |
| Licenças de dependências | Maioria MIT/ISC/BSD/Apache; `@img/sharp-*` (libvips) **LGPL-3.0-or-later** (binário dinâmico); MPL-2.0 (5 pacotes) | Baixa | Validar com jurídico ao distribuir a imagem | Jurídico |
| Container | `Dockerfile` usa `node:24-trixie-slim` e `USER node` (não root) | Baixa | Imagem própria derivada, scan no pipeline | Infra |
| Manutenção | 203 commits em 35 dias; upstream remove mecanismos substituídos (`AGENTS.md`) | Média | C6; o contrato v1 é a única dependência | Engenharia |

## 4. Benchmarks e custos

- **Todos os resultados usam dados sintéticos e provedores reais desligados (a suíte oficial usa servidores falsos locais); custo de IA = R$ 0.**
- Contrato real: API do AIHOT no commit fixado, banco isolado com 68 migrações aplicadas e ledger preenchido com as 15 fixtures sintéticas do Opt News. `snapshot` devolveu 15 itens (`count=15`, `hasMore=false`); `changes` com o cursor recebido devolveu 0 mudanças; cursor inválido devolveu `409 application/problem+json`. Resposta capturada em `apps/api/test/fixtures/aihot-6e0cfaf-snapshot.json` (arquivo e teste removidos depois que a estratégia D dispensou o contrato v1).
- Adapter Opt News sobre a resposta real: 15 itens → 14 `PublishedStoryV1` válidos (1 em revisão por falta de data) e 1 rejeitado (`javascript:`).
- **Não medido** (exige Q-03 e fontes aprovadas): latência e custo por item no LLM, qualidade pt-BR, taxa de duplicatas em fontes reais. Recomendação: sandbox com cota explícita aprovada, 50–100 itens de fontes licenciadas, medindo tokens e custo por etapa (pré-filtro, 2 avaliações, escrita).

## 5. Testes executados

| Comando | Resultado | Observações |
|---|---|---|
| `git clone https://github.com/KKKKhazix/AIHOT.git` + `git log -1` | `6e0cfaf…` | Pasta temporária isolada |
| `npm ci --ignore-scripts --no-audit` | 297 pacotes, OK | Sem scripts de instalação; aviso de engine (Node 24.11.1 < 24.22.1) |
| `npm audit --omit=dev` | 0 vulnerabilidades | |
| `npm run typecheck` (tsc 7.0.2 em todos os workspaces + typegen web) | **Passou** em 8,5 s | |
| `npm test` (suíte oficial, PostgreSQL 17 isolado) | **Travou** em `tests/backup.test.ts` (>40 min) | Depende de `SIGTERM` POSIX e `pg_dump`; não portável para Windows. O CI upstream roda em `ubuntu-latest` |
| `npm test` sem `tests/backup.test.ts`, 1ª tentativa, com `MODEL_CALLS_ENABLED=false` e `COLLECT_ENABLED=false` forçados pelo agente | 845 ok / 147 falhas / 10 canceladas | **Erro de configuração do agente**: a suíte liga as travas contra servidores falsos locais; 98 falhas foram "Model calls are disabled" e 14 exigiam o build do web antes |
| `npm run build -w @aihot/web` + `npm test` sem `tests/backup.test.ts`, com os padrões da suíte (TAP, 472 s, concorrência 6) | **994 ok / 2 falhas / 6 canceladas** de 1002 | 6 canceladas: testes de `SIGTERM` durante chamadas pagas (semântica de sinal POSIX; expiram no Windows). 2 falhas: `tests/outbound-headers.standalone.test.ts`, que pertence a `npm run test:standalone` e foi incluído pelo glob do agente. Nenhuma falha atribuível à lógica do upstream; repetir em Linux (alvo do CI upstream) no pipeline |
| `node scripts/migrate.ts` (banco vazio) | 68 migrações aplicadas | |
| API real (`apps/api/src/main.ts`, coleta e modelos desligados) + `curl` em `/api/v1/selected/snapshot`, `/changes` e cursor inválido | 200 (15 itens), 200 (0 mudanças), 409 | Header `access-control-allow-origin: *` confirmado |
| Cliente HTTP + adapter Opt News contra a API real | 14 ok, 1 rejeitado, `SnapshotRequired` para cursor inválido | Fixado em `apps/api/test/unit.test.ts` ("contract with the real engine") |

## 6. Decisão arquitetural

| Estratégia | Evidência | Resultado |
|---|---|---|
| **A. Serviço isolado** | Existe contrato público versionado (`schemaVersion: 1`) feito para espelhamento incremental, com remoções explícitas e invalidação de cursor; o upstream separa site/indústria/módulos do núcleo | **Escolhida (Go condicionado)** |
| B. Extrair pacotes | `@aihot/backend` importa `@aihot/site` e `@aihot/industry` e lê/escreve diretamente o esquema de 68 migrações | Rejeitada: carregaria esquema e configuração inteiros sem fronteira estável |
| C. Fork seletivo | Customização prevista sem fork (`site/`, `industry/`, `modules/`); upstream com ~6 commits/dia tornaria merges caros | Rejeitada; usar **sobreposição de configuração** sobre o SHA fixado |
| D. Reimplementar | Recibos/orçamento, SSRF, dedupe, agrupamento e seleção somam ~21 k linhas testadas | Rejeitada agora; a interface `EngineFeed` permite trocar o motor sem tocar o domínio |

- **Fronteira:** `apps/api/src/content/aihot/` (`upstream.ts` contrato lido, `client.ts` HTTP, `adapter.ts` ACL). Nada fora dessa pasta importa tipos do AIHOT; o frontend nunca fala com o motor.
- **Mudanças upstream:** nenhuma. Opcional: módulo `modules/optnews-export` para C4.
- **Atualização:** trocar o SHA na imagem do motor → teste de contrato (nova captura do snapshot + `unit.test.ts`) e smoke em staging → promover.
- **Rollback:** imagem anterior do motor; o Opt News continua servindo o último conteúdo espelhado (leitura, comentários e votos não dependem do motor — verificado no E2E).

## 7. Próximas tarefas

Ver `docs/16-plano-vertical-slice.md` (tarefas, dependências, aceites) e ADR-0003 em `docs/12-adrs.md`. Decisões humanas pendentes para seguir com o motor real: Q-02 (fontes e direitos), Q-03 (provedor e orçamento), Q-05 (hospedagem/rede), Q-04/Q-07 (identidade e papéis).

## 6. Primeira medição com provedor real (2026-11-02, ADR-0013)

Foundry `gpt-6-luna` (GlobalStandard) sobre as 17 fixtures sintéticas, via feeds HTTP locais, banco isolado `optnews_ia`. 43 chamadas, 121 s.

| Etapa | Chamadas | Tokens entrada | Tokens saída (dos quais raciocínio) | Latência média |
|---|---|---|---|---|
| Pré-filtro | 15 | 6.250 | 1.356 (727) | 1,8 s |
| Nota A / Nota B | 13 + 13 | 20.990 | 5.504 (5.010) | 3,3 s |
| Redação | 1 | 526 | 328 (197) | 3,7 s |
| Briefing | 1 | 304 | 142 (86) | 1,7 s |

- **Por item:** ~1,9 mil tokens de entrada e ~0,5 mil de saída. Projeção para 150 itens/dia: ~8,5 M de entrada e ~2,2 M de saída por mês. O preço do `gpt-6-luna` ainda não foi confirmado.
- **Segurança:** o post que pede nota máxima recebeu 0/0, o boato e o recorde sem data receberam notas baixas, e a receita e o XSS foram rejeitados no pré-filtro.
- **Filtro de conteúdo do Azure (Prompt Shields):** bloqueou a notícia legítima sobre injeção de prompt. Agora isso é falha final e legível para o curador, sem novas chamadas pagas. Avaliar com a segurança uma política de filtro própria para o recurso (Q-03).
- **Calibração (Q-10):** o modelo dá notas bem abaixo dos limiares herdados do AIHOT. Apenas 1 de 13 itens passou do limiar; um corte de preço de 40 % ficou em 55/48. É preciso calibrar com uma amostra rotulada pelos curadores antes de ajustar os limiares.

**Calibração provisória (Q-10), 2026-11-02.** Nas 13 notícias avaliadas, a nota do `gpt-6-luna` ficou em média ~0,72× a escala usada no desenho das fixtures, que segue a do AIHOT. A queda vem sobretudo do eixo `cred`, porque o material é só o trecho do feed. Os cortes por modelo (`thresholdsFor` em `prompts.ts`) foram escalados na mesma proporção: T1 43, T1_5 47 e T2 55 (os do AIHOT são 60, 65 e 76). Os modelos simulados continuam com os do AIHOT.

Resultado na reavaliação, que reaproveitou os recibos e precisou de só 6 chamadas novas:
- **4 de 13 selecionadas**, todas de fontes oficiais T1: framework da Atlas, corte de 40 % no preço de embeddings, modelo de 8B da Lumen e guia de governança.
- **De fora:** GPU da Nimbus (65; nova região, que a regra de ruído limita), boato, recorde sem data, injeção de nota e todas as T2 de agregador (no máximo 88).

É provisório: as notas são sintéticas e os rótulos foram escritos pelo próprio time. Recalibrar com 50 a 100 itens reais rotulados pelos curadores; a leitura do artigo (Q-02) deve subir `cred` e exigir uma nova escala.

## 7. Primeira coleta real (2026-11-02, autorizada pelo responsável, banco local `optnews_ia`)

16 feeds públicos (`tools/real-sources.ts`); VentureBeat ficou de fora porque responde 429 ao coletor.

- **Primeira execução:** 8 min, 50 itens novos das últimas 72 h; os mais antigos foram arquivados sem custo de IA.
  - 16 publicados, 24 abaixo do limiar e 10 rejeitados no pré-filtro (ofertas, eventos, demissões, guias de compra).
  - 160 chamadas ao `gpt-6-luna`: 112 mil tokens de entrada e 31 mil de saída (24 mil de raciocínio), cerca de 2,2 mil + 0,6 mil por item. Nenhuma nova tentativa.
- **Briefing:** 10 itens, panorama aprovado na checagem de que só cita o que está nos itens.
- **Agrupamento:** 51 decisões, todas UNRELATED. Ainda não houve duas coberturas do mesmo fato; acompanhar.
- **Achados corrigidos:**
  - O feed do Azure Blog leva 4 a 10 s ou mais; o tempo limite subiu para 30 s.
  - Feeds em Latin-1 agora são decodificados pelo charset.
  - As notícias sintéticas antigas foram retiradas (com histórico, evento e auditoria) depois que uma delas apareceu no panorama real. Pausar uma fonte não retira o que ela já publicou.
- **Pendentes:** aprovação jurídica da lista (Q-02), calibração com curadores (Q-10) e leitura do artigo para análise.

### 7.1 Fontes sem feed e paridade com a lista do AIHOT (2026-11-02, 22:30)

- **Novas fontes (8):**
  - Anthropic e Claude como páginas de listagem (`web_list`, ADR-0015).
  - Mistral, Google Research, BAIR, Import AI, Latent Space e The Decoder, que faltavam em relação à lista demo do AIHOT.
  - Todas coletaram na primeira execução, sem erro.
- **Claude — Blog:** "Make long-running agents faster with message threads" (o mesmo item do aihot.news) foi coletado da listagem, recebeu 50 e 57 e foi publicado em pt-BR. Os outros 9 artigos têm mais de 72 h e foram arquivados sem custo de IA.
- **Anthropic — Notícias:**
  - A página abre com três destaques de outubro, então a regra inicial de parar após 3 artigos antigos seguidos cortava a lista cronológica. A regra foi trocada por um limite de 10 páginas novas por execução.
  - O artigo mais recente é de 27/10, então nada entrou na janela de 72 h, como esperado.
- **Coleta condicional observada:** na segunda execução, 12 feeds responderam 304 e não foram baixados de novo.
- **Escala da nota exibida (corrigido):** o rótulo de relevância ("moderada" ≥ 60, "alta" ≥ 80) usa a escala do AIHOT, e com o `gpt-6-luna` uma notícia selecionada aparecia como "baixa" (53,5 de média para um corte de 43).
  - A nota exibida agora é convertida pelo corte do nível (ADR-0013). As 28 notícias já publicadas na base local foram recalculadas a partir das notas brutas; a do Claude foi de 53,5 para 74,7 ("moderada").
  - Limite: no nível T1_5, notas brutas acima de cerca de 72 batem no teto de 100, e duas notícias empatam em 100.
- **Agent-Reach** (MIT, kit de CLIs para agentes) não entra como dependência (ADR-0015). Os canais úteis a um pipeline, como YouTube, GitHub releases e Reddit, já têm RSS ou Atom e podem entrar como fontes `rss` comuns.
