# Opt News — desenvolvimento local

Tudo roda na máquina: PostgreSQL em Docker, **feeds sintéticos** (fontes fictícias em RSS/Atom), curadoria automática com **modelo simulado** (sem chamada paga) e login **simulado** com personas. Nenhum serviço pago, tenant ou recurso Azure é usado.

## Requisitos

- Node.js ≥ 24.11 (executa TypeScript direto, sem build do backend)
- Docker (PostgreSQL 17)

## Primeira execução

```bash
npm install --ignore-scripts
```

```bash
cp .env.example .env
```

```bash
npm run db:up
```

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

Em terminais separados:

```bash
npm run dev:api
```

```bash
npm run dev:web
```

Abra http://localhost:5173 e escolha uma persona. O seed já roda o pipeline de curadoria real sobre os feeds sintéticos.

### Coleta real via HTTP (opcional)

```bash
npm run dev:fake-feeds
```

```bash
npm run ingest:once
```

`ingest:once` coleta as fontes pelo fetch protegido (SSRF), avalia com o provedor simulado por regras, agrupa coberturas em acontecimentos e atualiza o briefing do dia. `POST http://127.0.0.1:4020/__control/advance` publica uma notícia nova e uma correção; `POST /__control/fail?source=vetor` derruba um feed. `npm run dev:worker` roda o agendamento pg-boss (retry exponencial, fila `content.ingest.dlq`).

**IA real (Foundry, ADR-0013):** com `az login` e o papel *Cognitive Services OpenAI User* no recurso Foundry aprovado (endpoint em `FOUNDRY_ENDPOINT` do `.env`), rode `npm run model:check` (3 chamadas com material sintético). Se passar, troque `MODEL_PROVIDER=foundry` no `.env` e rode `npm run ingest:once`. Sem chave: a autenticação é Entra. Voltar: `MODEL_PROVIDER=simulated`.

**Feeds reais (lista proposta para Q-02 em `tools/real-sources.ts`):** num banco separado, rode `DATABASE_URL=<banco> npm run sources:real`. O comando cadastra as 24 fontes públicas com auditoria e pausa as sintéticas, para os dois tipos não se misturarem. Depois rode o worker com `MODEL_PROVIDER=foundry` e `INGEST_PRIVATE_HOSTS=` vazio. Só título, trecho e link são guardados (ADR-0008). Sites sem RSS, como Anthropic e Claude, entram como página de listagem (`web_list`, ADR-0015). Rodar o comando de novo só cadastra as fontes que faltam.

**Apresentação (`/sobre`, pública):** a landing do produto; o login (`/entrar`) aponta para ela. O campo de pontos (three.js) só é carregado nessas duas telas.

**Curadoria (`/curadoria`, Diego ou Eva):** notícias em revisão, indicações com problema, decisões do pipeline com "publicar mesmo assim" e rótulos de calibração (ADR-0014). As indicações de link entram no pipeline pela fonte `indicacoes`. `ARTICLE_READING=true` faz o modelo ler o artigo, que nunca é guardado; fica desligado até o Q-02.

## Personas (tenant `dev-tenant`, sintéticas)

| Persona | Papéis | Para testar |
|---|---|---|
| Ana Ribeiro | member | leitura, comentário, proposta, voto, insight |
| Bruno Tavares | member | idem; responsável por sessão |
| Carla Mendes | member, organizer | decidir pautas, agendar e documentar meetups |
| Diego Faria | member, curator | moderação, itens em revisão, saúde das fontes, pausar/retomar fonte |
| Eva Lima | member, admin | tudo, inclusive cadastrar e editar fontes |
| Fábio Souza | visitor | só leitura (403 ao contribuir) |
| Gabi Rocha | member (desativada) | login recusado (offboarding) |

## Qualidade

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run build
```

```bash
npm run smoke
```

`npm test` usa `TEST_DATABASE_URL` (padrão `postgres://optnews:optnews@127.0.0.1:5433/optnews_test`); o nome do banco precisa terminar em `_test`, e cada arquivo de teste recria o esquema pelas migrações (down → up). `npm run openapi` regenera `docs/openapi-v1.json` a partir do contrato.

## Demo completa em containers

```bash
docker compose --profile app up --build
```

Sobe banco, feeds sintéticos, API servindo o web compilado em http://127.0.0.1:8080 e worker. A imagem é construída pelo `Dockerfile` da raiz.

## Mapa do código

| Caminho | O que é |
|---|---|
| `packages/contracts` | Contrato HTTP (Zod + mapa `endpoints`): fonte de verdade da API, do OpenAPI e dos tipos do web |
| `apps/api/src/intelligence` | Curadoria automática (portada do AIHOT, ver `NOTICE`): fetch protegido, RSS/Atom, prompts pt-BR, recibos e orçamento de modelo, pipeline |
| `apps/api/src/content` | Publicação (`PublishedStoryV1`), feed, detalhe, indicações, proteção de URL |
| `apps/api/src/{community,meetups,knowledge}` | Pilares de colaboração |
| `apps/api/src/identity` | Sessão server-side, CSRF e política de autorização |
| `apps/api/src/ops` | Auditoria e outbox transacional |
| `apps/api/src/db/migrations` | Migrações SQL `up`/`down` |
| `apps/worker` | Agendamento da coleta e curadoria (pg-boss) |
| `apps/web` | SPA React (Vite, React Router, Tailwind) |
| `tools/fixtures`, `tools/fake-feeds` | Fontes e itens sintéticos (inclui casos adversariais), modelo roteirizado para testes e servidor de feeds |

## Rollback

- Código: reverter o commit; não há estado fora do banco.
- Banco local: `npm run db:rollback` desfaz a última migração (a `0001` apaga todos os schemas do Opt News — só em ambiente local).
- Coleta/modelo: se fontes ou o provedor falharem, o portal continua servindo o que já foi publicado; recibos evitam pagar duas vezes no reprocessamento.
