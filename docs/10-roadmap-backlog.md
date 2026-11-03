# 10 — Roadmap, épicos, backlog e critérios de aceite

## Modelo de execução

Planejar por **releases verificáveis**, não construir as quatro grandes áreas sem fluxo real. O produto integral inclui quatro pilares; a primeira fatia vertical integra funcionalidade mínima de cada um, com mocks das integrações externas quando necessário.

Os tamanhos abaixo são relativos, não datas ou horas prometidas. P0 = essencial, P1 = evolução próxima, P2 = maturidade. Dependências `DEP` são identificadores de tarefa.

## Fase 0 — Descoberta técnica e preparação

| ID | Tarefa | Prio | Dep | Aceite verificável |
|---|---|---|---|---|
| S-001 | Auditar AIHOT no commit fixado | P0 | — | Relatório no template: módulos, testes, licença, riscos e custos |
| S-002 | Executar spike de contrato de publicação | P0 | S-001 | Fixtures passam por adapter e produzem `PublishedStoryV1`, sem chamadas pagas |
| S-003 | Definir ADR da estratégia de reuso | P0 | S-001, S-002 | Decisão documentada, trade-offs e rollback |
| S-004 | Aprovar fronteiras de identidade e conteúdo | P0 | — | Política de acesso e classes de dados aceitas |
| S-005 | Validar licenças/fontes piloto | P0 | — | Lista de fontes autorizadas e restrições registradas |
| S-006 | Definir baseline de UX e marca | P0 | — | Wireframes navegáveis, tokens e estado de leitura aprovados |

**Exit gate:** nenhuma chamada paga/destrutiva no spike; contrato definido; riscos críticos explicitados; aceites para o MVP.

## Fase 1 — Fundação e vertical slice

| ID | Tarefa | Prio | Dep | Aceite verificável |
|---|---|---|---|---|
| F-001 | Estrutura monorepo e convenções | P0 | S-003 | Lint, typecheck, build, unit tests em CI Azure DevOps |
| F-002 | Banco/migrações/seed sintético | P0 | F-001 | Migração up/down testada em banco isolado; sem PII |
| F-003 | Entra SSO com RBAC | P0 | S-004, F-001 | 401/403 corretos, revogação simulada, logout testado |
| F-004 | Adapter de notícias e ingestão demo | P0 | S-002, F-002 | URL duplicada não publica dupla; falha reversível e observável |
| F-005 | Feed responsivo e página de notícia | P0 | F-003, F-004, S-006 | Fonte/datas/resumo IA claros, links funcionais, mobile acessível |
| F-006 | Envio de link manual | P0 | F-004 | URL insegura rejeitada, idempotência e feedback de status |
| F-007 | Comentários autenticados | P0 | F-003, F-005 | Autoria, thread, permissionamento e moderação básica |
| F-008 | Proposta e votação meetup | P0 | F-007 | Criar de notícia; voto único; fechar seleção e preservar origem |
| F-009 | Agendamento manual e histórico | P0 | F-008 | Sessão criada, datas corretas, status e responsável |
| F-010 | Registro de insight e link | P0 | F-009 | Criar insight referenciando noticia + meetup; recuperar vínculo |
| F-011 | Smoke end-to-end | P0 | F-005..F-010 | Fluxo completo testável no staging com usuários de teste |

**Exit gate:** demo com notícia → discussão → proposta → meetup → aprendizado, sem serviço externo obrigatório exceto SSO de teste aprovado; testes e auditoria.

## Fase 2 — Curadoria editorial e comunidade robustas

| ID | Tarefa | Prio | Aceite |
|---|---|---|---|
| E-001 | Admin de fontes e saúde da coleta | P1 | Curador ativa/pausa fonte e rastreia falhas |
| E-002 | Agrupamento e tendências | P1 | Notícias semelhantes em evento; score reproduzível |
| E-003 | Briefing periódico | P1 | Report com fontes, datas e correções |
| E-004 | Busca/full-text e taxonomia | P1 | Resultados relevantes com filtros e ACL testadas |
| E-005 | Menções/notificações | P1 | Só notifica quem pode abrir o recurso |
| E-006 | Salvos/seguindo tópicos | P1 | Preferências vinculadas ao membro |
| E-007 | Métrica de relevância Optsolv | P1 | Separada de editorial, com feedback e versão |

## Fase 3 — Meetups e conhecimento operacional

| ID | Tarefa | Prio | Aceite |
|---|---|---|---|
| M-101 | Integração Graph para evento Teams | P1 | Consentimento, criação idempotente, erro/retry e reconciliation |
| M-102 | Gestão de artefatos | P1 | ACL por arquivo, links seguros e rastreamento de origem |
| M-103 | Busca em meetups e aprendizados | P1 | Encontrar conclusões por tecnologia e origem |
| K-101 | Experimentos/POC e estados | P1 | Dono, hipótese, métrica, evidência e conclusão |
| K-102 | Decisões e retroalimentação de notícias | P1 | Resultado da POC aparece vinculado à notícia de origem |
| K-103 | Integração documental SharePoint | P2 | Permissão de origem respeitada e revogação refletida |
| M-104 | Transcrição/resumo de meetup | P2 | Dados autorizados, validação humana e ausência de transcrição tratada |

## Fase 4 — Personalização e inteligência avançada

| ID | Tarefa | Prio | Aceite |
|---|---|---|---|
| A-001 | Recomendações por tópico/atividade | P2 | Explicáveis, opt-out, sem revelação de dados restritos |
| A-002 | Busca híbrida com embeddings, se benchmark justificar | P2 | Melhoria medida vs FTS com controle de custo/privacidade |
| A-003 | Relatórios de impacto e adoção | P2 | Indicadores com definição e fonte rastreável |
| A-004 | Sugestão de temas para meetups por IA | P2 | Citações/relevância e decisão humana de pauta |
| A-005 | Integração opcional com Work Items Azure DevOps | P2 | Criação só com confirmação do usuário autorizado |

## Exemplo de história de usuário pronta

**US-F008** — Como colaborador, quero propor como pauta de meetup uma notícia que estou lendo, para que o time possa votar e aprofundar o assunto.

**Dado** que sou um usuário ativo autenticado e tenho acesso à notícia, **quando** seleciono `Propor como meetup`, **então** posso adicionar título e justificativa e a proposta salva a referência da notícia, meu usuário, data e status `open`.

**Dado** que outro membro tem permissão, **quando** vota, **então** o voto é registrado uma única vez e aparece na contagem; novo clique remove/atualiza de forma idempotente.

**Dado** que o prazo encerrou, **quando** tento votar, **então** recebo retorno de estado incompatível sem alterar contagem.

**Segurança:** proposta de artigo restrito nunca fica visível para usuários sem acesso ao artigo.

**Testes:** unit de estados, integration 401/403/409, E2E mobile+desktop e teste de concorrência de voto.

## Política de planejamento e handoff

- Cada tarefa deve ligar requisitos do PRD, dependências, projeto de banco/API e casos de teste.
- Branch/PR pequenos; features por trás de flags quando integrações externas não estão prontas.
- Não avançar para próxima fase sem saída de qualidade documentada e aceite humano.
- Tarefas de segurança, licença e direitos de uso são bloqueantes, não cosméticas.
