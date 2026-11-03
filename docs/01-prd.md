# 01 — Product Requirements Document (PRD)

## Problema e oportunidade

O conhecimento sobre novidades em IA está fragmentado entre sites, redes, newsletters, pessoas, conversas e meetups. Notícias relevantes não são selecionadas de maneira consistente para a realidade da empresa; debates não são facilmente recuperáveis; a aplicação em projetos não é rastreada. O Opt News transforma **informação externa → discussão interna → aprendizagem → aplicação**.

## Públicos/personas

- **Colaborador leitor:** quer descobrir o que importa em poucos minutos, salvar e seguir assuntos.
- **Contribuidor técnico:** quer comentar, publicar contexto, compartilhar links e recomendar experimentos.
- **Apresentador/organizador:** quer selecionar pautas, preparar, agendar e preservar resultados dos meetups.
- **Curador editorial:** quer governar fontes, qualidade, categorias, erros e destaques.
- **Gestor/administrador:** quer segurança, adoção, custo, governança, métricas e políticas.

## Jobs to be done

- Ao começar o dia, quero compreender os lançamentos mais relevantes, com links e consequências práticas.
- Ao ver uma tecnologia promissora, quero discuti-la e envolver colegas sem perder o vínculo com o artigo.
- Ao escolher um meetup, quero aproveitar o interesse real do time e preparar uma pauta qualificada.
- Após um encontro, quero recuperar slides, transcrição, conclusões e oportunidades de teste.
- Ao decidir uma solução técnica, quero encontrar o que já foi pesquisado e experimentado internamente.

## Requisitos funcionais: notícias e inteligência

| ID | Requisito | Prioridade | Critério de aceite resumido |
|---|---|---|---|
| N-01 | Administrar fontes RSS/web/API suportadas | P0 | Curador configura, ativa/pausa e consulta falhas; sem editar código |
| N-02 | Coleta recorrente e deduplicação | P0 | Mesmo URL/conteúdo não vira duplicata visível; reprocessar é idempotente |
| N-03 | Avaliação e classificação por IA | P0 | Score com versão de critério/modelo, explicação e revisão manual |
| N-04 | Página editorial de notícia | P0 | Título, resumo, fonte, data, links, categorias, aviso de IA |
| N-05 | Feed e filtros | P0 | Ordenação cronológica/relevância; busca por categoria, fonte, período |
| N-06 | Agrupamento de coberturas em acontecimento | P1 | Várias fontes vinculadas a um evento, sem destruir histórico |
| N-07 | Briefing diário/semanal | P1 | Relatório com links de evidência e tempo de publicação |
| N-08 | Seguir assuntos, favoritos e não lidos | P1 | Preferências persistem em conta corporativa |
| N-09 | Radar de empresas/concorrentes | P1 | Organização e assuntos monitoráveis por curadores |
| N-10 | Relevância estratégica Optsolv | P1 | Separar score editorial e score interno; permitir feedback humano |
| N-11 | Indicação manual de link externo | P0 | URL submetida passa por validação, dedupe e curadoria |

## Requisitos funcionais: comunidade

| ID | Requisito | Prioridade | Critério de aceite resumido |
|---|---|---|---|
| C-01 | Comentários em threads | P0 | Autoria, edição controlada, exclusão lógica e paginação |
| C-02 | Reações e salvar | P1 | Um tipo de reação por usuário/alvo conforme política, sem spam |
| C-03 | Menções | P1 | Apenas usuários autorizados; notificação sem expor dados indevidos |
| C-04 | Curadoria/moderação | P0 | Curador oculta conteúdo e registra motivo/auditoria |
| C-05 | Contribuições externas | P1 | Link/documento contextualizado e verificado; direitos respeitados |
| C-06 | Perfil técnico e tópicos seguidos | P2 | Opt-in e controle de privacidade |
| C-07 | Coleções compartilhadas | P2 | Coleções com permissões e histórico |

## Requisitos funcionais: meetups

| ID | Requisito | Prioridade | Critério de aceite resumido |
|---|---|---|---|
| M-01 | Propor pauta por notícia ou manualmente | P0 | Proposta tem autor, descrição, tema, origem e status |
| M-02 | Votar/interessar-se | P0 | Um voto por usuário/proposta, prazo configurável |
| M-03 | Planejar meetup | P0 | Organizador define data, tema, responsável e referências |
| M-04 | Agenda/histórico | P0 | Próximos/anteriores, estados claros, calendário com fuso |
| M-05 | Materiais e preparação | P1 | Links/arquivos/leituras com autoria e permissão |
| M-06 | Integração Teams/Graph | P1 | Criar/vincular reunião após consentimento e confirmar resultado |
| M-07 | Pós-meetup | P0 | Registro manual de resumo/conclusões; transcrição automatizada em fase posterior |
| M-08 | Resumo por IA da transcrição | P2 | Validação humana antes de publicar conclusões como fatos |

## Requisitos funcionais: conhecimento aplicável

| ID | Requisito | Prioridade | Critério de aceite resumido |
|---|---|---|---|
| K-01 | Registrar insight/prática aplicável | P0 | Título, hipótese, contexto, referências, autor, status |
| K-02 | Relacionar objetos | P0 | Links entre news/events/comments/meetups/insights/experiments |
| K-03 | Propor experimento/POC | P1 | Problema, hipótese, responsável, métricas e riscos |
| K-04 | Registrar resultado/decisão | P1 | Evidência, conclusão, data, aprovador e motivos |
| K-05 | Associar a projeto | P2 | Referência controlada ao projeto, sem transferir segredos |
| K-06 | Busca no conhecimento | P1 | Histórico pesquisável com controle de acesso por resultado |
| K-07 | Estado do conhecimento | P1 | Em estudo, testado, adotado, descartado, arquivado |

## Requisitos transversais

- **X-01 SSO:** login Entra ID, sessão segura, logout, atualização de perfil controlada.
- **X-02 RBAC:** visitante/colaborador/curador/organizador/admin, sem privilégio implícito.
- **X-03 Auditoria:** ações administrativas, moderação, publicação, alteração de score e decisões.
- **X-04 LGPD e direitos:** retenção, exclusão adequada, acesso mínimo, licença de fontes.
- **X-05 IA transparente:** distinguir produção por IA de autoria humana; guardar modelo, prompt versionado e origem.
- **X-06 Resiliência:** portal legível quando coleta ou APIs de terceiros indisponíveis.
- **X-07 Acessibilidade:** teclado, contraste, semântica e estados de loading/erro/vazio.
- **X-08 Operabilidade:** logs/trace, custos IA, tarefas falhadas e alarmes.

## Métricas propostas (baselines e metas a calibrar após piloto)

- Adoção: colaboradores ativos semanais / colaboradores convidados.
- Qualidade editorial: % conteúdos destacados com evidência válida, % duplicatas, % correções humanas.
- Conhecimento: discussões com contribuição substantiva, meetups associados, aprendizados registrados e recuperados.
- Aplicação: experimentos iniciados/concluídos, decisões com evidências, tempo para recuperar referência.
- Custo: custo por item processado/selecionado, gasto IA por mês e taxa de reprocessamentos gratuitos.
- Experiência: tempo de resposta das páginas, acessibilidade, pesquisas sem resultado.

## Não funcionais

- Tempo de resposta e disponibilidade terão **SLOs definidos após medição**; não inventar promessa de 99,9% sem infraestrutura.
- Dados internos protegidos em trânsito e repouso; logs sem credenciais; backup e restauração ensaiados.
- Observabilidade para pipeline de ingestão, jobs, chamadas LLM, Graph, banco e interface.
- Compatibilidade desktop e mobile; pt-BR com datas em America/Sao_Paulo; armazenamento de timestamps UTC.
- O desempenho de busca deve ser validado com massa de testes representativa antes de optar por embeddings externos.

## MVP: recorte mínimo sem reduzir escopo do produto

Um vertical slice contém: fonte demo → item classificado → feed e detalhes → comentário autenticado → proposta e votação de pauta → meetup criado manualmente → aprendizado registrado e relacionado. Integração Teams automática, personalização profunda, embeddings e relatórios avançados podem evoluir após a validação desse fluxo.

## Fora do escopo do MVP

Rede pública, app nativo, espelhamento integral de artigos protegidos, feed público sem segregação, ações automáticas em sistemas de produção, publicação sem revisão de conteúdo sensível.
