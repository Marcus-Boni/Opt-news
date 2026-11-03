# 12 — Architecture Decision Records (ADRs)

## Modelo de ADR

```md
# ADR-XXXX — Título
- Status: Proposed | Accepted | Superseded | Rejected
- Data / autores:
- Contexto:
- Forças/requisitos:
- Opções consideradas:
- Decisão:
- Consequências positivas:
- Trade-offs/riscos:
- Critérios de reversão:
- Evidências (commits, benchmark, tests):
```

## ADR-0001 — Produto próprio, mecanismo reaproveitado

- **Status:** Accepted (decisão de produto).
- **Contexto:** Opt News requer experiência colaborativa e conhecimento organizacional que não fazem parte do núcleo de curadoria AIHOT.
- **Decisão:** construir produto e frontend próprios; reaproveitar seletivamente componentes de inteligência AIHOT, condicionado à auditoria técnica.
- **Consequência:** isolamento de domínio e adapter obrigatório; nenhuma imposição de manter o site/admin visual do upstream.
- **Revisão:** somente por decisão explícita da liderança de produto.

## ADR-0002 — Quatro pilares integrados

- **Status:** Accepted (decisão de produto).
- **Decisão:** notícias, comunidade, meetups e conhecimento aplicável fazem parte do escopo integral. Entregar iterativamente, com vertical slice mínimo de todos.
- **Consequência:** IDs/referências e eventos transversais desde o início.

## ADR-0003 — Reutilização técnica do AIHOT

- **Status:** **Accepted — Estratégia D (reimplementação guiada pelo AIHOT)**, por decisão do responsável em 2026-11-02, substituindo a recomendação A do spike.
- **Decisão aceita:** a inteligência de curadoria é construída **dentro** do Opt News (`apps/api/src/intelligence/`), em TypeScript, no esquema `content` do banco Opt News, usando o AIHOT (MIT, commit `6e0cfaf`) como referência e portando o que ele já resolveu: critérios e prompts de seleção (traduzidos para pt-BR), duas notas independentes com limiar por nível de fonte, supressão de ruído, regras contra alucinação, recibos de chamadas pagas com orçamento, proteção SSRF verificada na conexão, deduplicação por URL canônica e hash, arquivamento de itens antigos na primeira importação. Não há serviço AIHOT, nem chamada a `aihot.news`, nem código upstream vendorizado. Atribuição MIT em `NOTICE`.
- **Consequências:** um só produto e um só banco; o formato interno `PublishedStoryV1` passa a ser produzido pelo pipeline próprio; melhorias futuras do AIHOT entram por portabilidade manual e revisada; mais testes próprios são necessários.
- **Histórico da análise (mantido para rastreabilidade):** a recomendação original do spike foi a Estratégia A, descrita abaixo.
- **Recomendação original do spike:** Estratégia A, Go condicionado. Data: 2026-11-02.
- **Contexto:** spike S-001/S-002 no commit `6e0cfaf5533b5a43fbe07a81ed7e235cd189ef7a` (relatório em `docs/07-aihot-spike.md`).
- **Forças:** reaproveitar coleta/seleção/recibos sem herdar UX, auth pública ou esquema; atualização upstream frequente; dados internos nunca podem chegar ao motor.
- **Opções consideradas:** A serviço isolado; B pacote extraído; C fork seletivo; D reimplementação.
- **Decisão proposta:** A. O AIHOT roda sem alterações de código, em rede privada e banco próprio, com pacote de configuração Optsolv em `industry/`/`site/`. O Opt News lê **apenas** `GET /api/v1/selected/snapshot` e `/changes` e converte para `PublishedStoryV1` em `apps/api/src/content/aihot/` (ACL). Upsert idempotente por `(provider, upstreamId)` + hash de revisão; remoção vira `retracted`; `409` dispara novo snapshot com retirada do que sumiu.
- **Consequências positivas:** domínio Opt News independente do esquema do motor; motor pode cair sem afetar leitura/colaboração; troca de motor (D) sem tocar o domínio (`EngineFeed`).
- **Trade-offs/riscos:** um serviço a mais para operar; payload v1 não traz versão de modelo (C4); motor público por desenho exige isolamento de rede (C3); prompts e provedores padrão chineses (C1, C2).
- **Critérios de reversão:** contrato v1 removido/quebrado pelo upstream sem substituto; custo de manter o pacote pt-BR maior que reimplementar seleção; achado de segurança sem mitigação.
- **Evidências:** `apps/api/test/unit.test.ts` ("contract with the real engine"), `apps/api/test/sync.test.ts`, fixture `apps/api/test/fixtures/aihot-6e0cfaf-snapshot.json`.

## ADR-0004 — Monólito modular de negócio e workers

- **Status:** Proposed.
- **Contexto:** equipe pequena, domínio integrado, necessidade de agilidade/baixo custo.
- **Proposta:** API modular + worker(s) assíncronos + PostgreSQL; evitar microsserviços prematuros.
- **Validação:** deployment, custo, equipe e manutenção; comparar com motor isolado.

## ADR-0005 — Microsoft Entra ID como identidade corporativa

- **Status:** Proposed (alta aderência ao ecossistema da empresa).
- **Proposta:** OIDC/OAuth2, RBAC backend, tenant corporativo; armazenar somente IDs estáveis e perfil mínimo.
- **Pendente:** tenant/política, fluxos de login, onboarding/offboarding, autorização de app.

## ADR-0006 — Azure DevOps como plataforma operacional

- **Status:** Proposed (alinhamento operacional Optsolv).
- **Proposta:** código Opt News, pipelines e governança em Azure DevOps; upstream GitHub somente como dependência de referência.
- **Pendente:** organização/projeto, repositório, hospedagem, ambientes e política de aprovação.

## ADR-0007 — Busca primeiro por FTS no PostgreSQL

- **Status:** Proposed.
- **Proposta:** busca full-text com filtros/ACL; embeddings/híbrido só após medir relevância/latência, custo, classificação de dados.

## ADR-0008 — Governança de conteúdo externo

- **Status:** Accepted como princípio de segurança; detalhes legais pendentes.
- **Decisão:** não republicar textos integrais sem permissão; deixar fonte original e evidências; disponibilizar apenas o que a licença autoriza; revisão quando direitos incertos.

## ADR-0009 — Integrações externas não bloqueiam o núcleo

- **Status:** Proposed.
- **Proposta:** meetup e conhecimento funcionam com cadastro manual e documentos vinculados; Teams/Graph/SharePoint como extensões tolerantes a falha.
- **Consequência:** permite piloto antes de consentimentos e políticas Microsoft finalizados.
- **Validação (slice 01):** sessões são criadas manualmente com link Teams opcional validado (`https://*.teams.microsoft.com`); nenhuma chamada Graph.

## ADR-0010 — Sessão server-side (BFF) e login simulado fora de produção

- **Status:** Proposed. Data: 2026-11-02.
- **Contexto:** X-01/X-02 exigem SSO Entra e RBAC no backend; tenant e app registration ainda não existem (Q-04).
- **Decisão:** a API é o único cliente OIDC (fluxo authorization code + PKCE, cliente confidencial, quando Q-04 for resolvida). O navegador só recebe um cookie opaco `HttpOnly`, `SameSite=Lax`, `Secure` em produção; o banco guarda o hash SHA-256 do token (`identity.sessions`), expiração de 8 h e revogação. Mutações exigem `x-csrf-token` vinculado à sessão. Identidade por `(tenant_id, entra_oid)`. Sessão só vale enquanto o membro está `active` (offboarding imediato).
- **Enquanto Q-04 estiver aberta:** `AUTH_MODE=dev` com personas sintéticas do tenant `dev-tenant`; a configuração **recusa** `AUTH_MODE=dev` com `NODE_ENV=production`; `AUTH_MODE=entra` falha explicitamente até ser implementado.
- **Trade-offs:** sessão no banco custa uma consulta por requisição (aceitável no volume interno; cache depois de medir); tokens Entra nunca chegam ao navegador.
- **Evidências:** `apps/api/test/api.test.ts` ("authentication and session").

## ADR-0011 — Stack e convenções do monorepo (slice 01)

- **Status:** Proposed (valida PROP-001..004, PROP-008, PROP-009 em código local). Data: 2026-11-02.
- **Decisão:** npm workspaces (`packages/contracts`, `apps/api`, `apps/worker`, `apps/web`); Node 24 executando TypeScript diretamente (sem build do backend), TS 7 `strict` + `noUncheckedIndexedAccess`; Fastify 5; Zod 4; `postgres` (postgres.js) com SQL explícito e migrações `NNNN_nome.up.sql`/`.down.sql`; um banco com schemas por contexto (`identity`, `content`, `community`, `meetups`, `knowledge`, `ops`); outbox transacional e auditoria na mesma transação da mudança; pg-boss no worker (retry exponencial + dead letter `content.sync.dlq`); busca FTS `portuguese` com índices GIN; SPA Vite + React 19 + React Router 8 + Tailwind 4 servida pela própria API (sem SSR: app interno autenticado, sem SEO); Biome para lint/format; `node:test` para testes. Versões fixadas exatamente, alinhadas às já usadas pelo AIHOT e publicadas há mais de duas semanas.
- **Alternativas descartadas agora:** ORM (Prisma/Drizzle) — SQL explícito é suficiente e mantém o controle de consultas; SSR — sem benefício para app autenticado; microsserviços por pilar — ADR-0004.
- **Trade-offs:** sem gerador de cliente: o frontend importa os schemas Zod do pacote `@optnews/contracts`; o OpenAPI 3.1 é gerado desses mesmos schemas (`npm run openapi` → `docs/openapi-v1.json`, 27 operações).

## ADR-0012 — Contrato HTTP como pacote compartilhado

- **Status:** Proposed. Data: 2026-11-02.
- **Decisão:** `packages/contracts/src/index.ts` define schemas Zod e um mapa `endpoints` (método, caminho, params, query, body, resposta, acesso). A API registra cada rota a partir desse mapa (`apps/api/src/http/route.ts`): valida entrada, exige sessão/CSRF e usa o schema de resposta como **allowlist** de saída (campos não previstos são descartados). Erros em RFC 9457 com `requestId`.
- **Consequências:** frontend e API não divergem em tipos; mudanças quebrando contrato aparecem no typecheck; tipos do AIHOT nunca entram no pacote.

## ADR-0013 — Provedor de IA: Microsoft Foundry (`gpt-6-luna`) com Entra, sem ferramentas

**Status:** Aceita (2026-11-02, responsável: Marcus Boni). Resolve o provedor de Q-03; o teto mensal segue pendente.

**Contexto:** o pipeline (ADR-0003, estratégia D) precisa de um modelo real para pré-filtro, notas, redação pt-BR, agrupamento e briefing. O ecossistema da Optsolv é Azure.

**Decisão:**
- Implantação existente `gpt-6-luna` (versão 2026-09-22, SKU GlobalStandard) num recurso Azure AI Foundry já existente da Optsolv (brazilsouth; nome e assinatura ficam no `.env` local, fora do repositório), chamada pela API v1 de chat completions (`/openai/v1/chat/completions`). Nenhum recurso Azure foi criado ou alterado.
- **Autenticação só por Entra:** `DefaultAzureCredential` (az login local, identidade gerenciada no Azure); nenhuma chave em arquivo. O principal precisa do papel de dados *Cognitive Services OpenAI User* (ou *Azure AI User*) no recurso.
- **Sem web search, sem agente, sem tools:** o modelo só lê o material que o pipeline entrega; fontes continuam aprovadas, rastreáveis e protegidas pelo fetch contra SSRF; respostas reprodutíveis por recibo.
- **Saída estruturada estrita** (JSON Schema gerado dos schemas `OUTPUTS`; limites de tamanho e faixa continuam validados depois). Recusa e não-JSON → saída inválida (final); resposta cortada → erro com nova tentativa.
- **Resiliência:** até 4 tentativas em 408/429/5xx respeitando `retry-after(-ms)`, com backoff e jitter; timeout de 90 s. Permissão, implantação ausente, cota ou queda → `ProviderUnavailable`: a execução para e os itens esperam, sem gastar tentativas.
- **Cortes por modelo:** a escala de nota muda com o modelo; `foundry:gpt-6-luna` tem cortes próprios (T1 43, T1_5 47, T2 55), provisórios até a calibração com curadores (Q-10, doc 07 §6). Um modelo sem calibração usa os cortes do AIHOT. As telas de fontes mostram o corte do modelo ativo.
- **Nota editorial na escala de referência** (2026-11-02): a nota que o leitor vê é a média das duas notas multiplicada por `corte AIHOT do nível / corte do modelo no nível`, com teto 100 (`editorialScore` em `prompts.ts`). Uma notícia selecionada nunca aparece como "baixa", e notícias de modelos e níveis diferentes se ordenam juntas na home e no briefing. As notas brutas ficam no item, e é com elas que a curadoria e a calibração trabalham.
- **Custo:** recibos evitam pagar duas vezes; `MODEL_DAILY_CALL_LIMIT` é o teto diário; cada chamada registra tokens de entrada, saída e raciocínio no log (`model.call`).

**Consequências e riscos:**
- *GlobalStandard* pode processar fora do Brasil. Aceitável para notícias públicas e dados sintéticos; **não** enviar conteúdo interno ou de clientes sem DataZone/regional e aprovação.
- A implantação é compartilhada com o Painel Estratégico (mesma cota de tokens e mesma fatura). Recomendação: implantação própria `optnews-gpt-6-luna` ou tag de custo antes do piloto.
- Preço por token do `gpt-6-luna` não confirmado (a consulta de preços do Azure falhou); medir pelos logs na primeira semana.
- **Rollback:** `MODEL_PROVIDER=simulated`. Recibos de modelos diferentes não se misturam (o nome do provedor faz parte da chave).

## ADR-0014 — Ciclo de curadoria, indicações, leitura do artigo e coleta condicional

**Status:** Aceita (2026-11-02). Detalha NX-03, N-11 e Q-10 sem mudar ADR-0003, ADR-0008 ou ADR-0013.

**Decisão:**
- **Fila de curadoria** (`/api/v1/curation`, capacidade `moderate`): notícias em revisão (publicar ou retirar), indicações que o pipeline não conseguiu ler e as decisões do pipeline nos últimos 7 dias, das mais próximas do corte para as mais distantes. Cada ação gera auditoria; notícias retiradas ganham histórico e evento.
- **"Publicar mesmo assim":** o item volta para a fila com `forced_by` e passa pelo pré-filtro e pelo corte; o modelo ainda dá a nota e escreve. A publicação acontece na execução seguinte do worker; a leitura nunca chama o modelo.
- **Rótulos de calibração** (`content.curation_labels`): o curador diz "deveria publicar" ou "deveria ficar de fora". O rótulo guarda as notas, o status e o modelo do momento, então reprocessar não reescreve a amostra. A calibração mostra a concordância e, por nível de fonte, o corte que separa os rótulos. A sugestão é insumo para uma decisão humana: os cortes continuam no código (`thresholdsFor`), revisados por PR.
- **Indicações (N-11):** viram itens da fonte virtual `indicacoes` (tipo `submission`, nível T1_5, pausável) e são julgadas como qualquer item. Da página só se lê o que uma prévia de link mostra (Open Graph, título, descrição, data). Uma página que falha fica para o curador e não é tentada de novo. O status da indicação acompanha o veredito do pipeline.
- **Leitura do artigo** (`ARTICLE_READING`, **desligada**): quando ligada, o texto principal (até 6.000 caracteres) entra na nota e na redação, nunca no pré-filtro. Ele não é guardado nem exibido. A escala de nota muda, por isso o corte usa a chave `<modelo>+artigo`; sem calibração, valem os cortes do AIHOT, pensados para quem lê o artigo inteiro. Ligar depende do Q-02, porque o texto de terceiros vai para o provedor de IA.
- **Coleta condicional:** ETag e Last-Modified são reenviados. Uma resposta 304 não reprocessa nada, e os validadores só são gravados depois que os itens foram salvos.

**Alternativas descartadas:** ajuste automático dos cortes, porque com poucos rótulos ele oscilaria e esconderia a decisão; guardar o texto do artigo, vetado pela ADR-0008; Readability com DOM, que traria uma dependência pesada (o extrator por parágrafos fica marcado como `shortcut:`).

**Migração:** `0002_curation`, só aditiva. O `down` remove os rótulos e os vínculos e mantém a fonte `indicacoes` quando há itens que dependem dela.

## ADR-0015 — Fontes sem feed (páginas de listagem)

**Status:** Aceita (2026-11-02). Equivale ao tipo `web_list` do AIHOT (`packages/backend/src/sources/web-list.ts`, SHA `f88621f`), reimplementado sem dependência nova; não muda ADR-0008.

**Contexto:** sites oficiais importantes não publicam RSS (Anthropic em `/news`, Claude em `/blog`), e o AIHOT os coleta como lista web.

**Decisão:**
- Tipo de fonte `web_list`: o endereço da fonte é a página de listagem, e `link_prefix` diz quais links são artigos. O prefixo precisa ser do mesmo site da listagem e, por padrão, é o próprio endereço dela.
- De cada artigo **novo** lê-se só o que uma prévia de link mostra (Open Graph: título, descrição, data). O corpo da página não é guardado nem enviado ao modelo, a menos que `ARTICLE_READING` seja ligado (Q-02, ADR-0014).
- No máximo 10 páginas novas por execução e fonte: a primeira coleta se completa em algumas execuções. A leitura não para em artigos antigos, porque listagens abrem com destaques de qualquer data (anthropic.com/news começa por três destaques de outubro). Artigos antigos (mais de 72 h) são guardados como arquivados e não são lidos de novo.
- Páginas sem data ou sem título (categorias, páginas de entrada) são descartadas e contam como inválidas. Páginas que falham são tentadas de novo na próxima execução.
- A listagem não guarda ETag: mesmo sem mudanças, ela pode ter links que a execução anterior não leu por causa do limite de 10.
- Tudo passa pelo mesmo fetch protegido (SSRF, tamanho, tempo) e pelo mesmo pipeline de pré-filtro, notas e corte.

**Alternativas descartadas:**
- **Jina Reader ou Exa** (o AIHOT usa como opção, e o Agent-Reach também): são serviços externos que receberiam os endereços coletados, então ficam fora sem aprovação.
- **Seletores CSS com cheerio:** trazem uma dependência e uma configuração por site; os metadados Open Graph bastam para as fontes atuais.
- **Sitemap:** o de claude.com não tem `lastmod`.
- **Agent-Reach como dependência:** o projeto é um kit de CLIs para agentes interativos. Os canais com login reaproveitam cookies do navegador, o que esbarra em credenciais e nos termos dos sites, e outros canais exigem chaves de terceiros. O que serve a um pipeline de servidor (YouTube, GitHub releases, Reddit) já tem RSS ou Atom nativo e entra como fonte `rss` comum.

**Migração:** `0003_web_list`, só aditiva (coluna `link_prefix` e o tipo no check). O `down` remove o prefixo e mantém o tipo `web_list` enquanto houver fontes dele, para que seus itens continuem rastreáveis.
