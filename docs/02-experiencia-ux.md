# 02 — Experiência, navegação e design system

## North star de experiência

**Uma plataforma editorial premium que funciona como espaço de aprendizado colaborativo, não um dashboard de KPIs.** Leitura confortável; informação hierarquizada; pouco ruído; motion funcional; CTA contextual; padrões consistentes; conteúdo sempre priorizado sobre efeitos visuais.

## Arquitetura de informação

- **Início** `/` — briefing, destaques, novidades que sigo, próximas pautas e atividade relevante.
- **Explorar** `/explorar` — feed, tendências, categorias, empresas, fontes, pesquisa e filtros salvos.
- **Notícia** `/noticias/:slug` — conteúdo atribuído, fontes e evidências, relevância, comentários, relacionadas, propor meetup, registrar insight.
- **Comunidade** `/comunidade` — debates, posts e contribuições; páginas de thread vinculadas às notícias.
- **Meetups** `/meetups` — propostas, votação, agenda e histórico; `/meetups/:id` antes/depois do encontro.
- **Conhecimento** `/conhecimento` — biblioteca, insights, experimentos, decisões; `/conhecimento/:id`.
- **Meu espaço** `/meu-espaco` — salvos, tópicos seguidos, minhas contribuições, notificações e preferências.
- **Administração** `/admin` — fontes, taxonomia, curadoria, filas, custos, usuários/papéis, moderação e auditoria (RBAC).

## Tela de notícia — requisitos de composição

1. **Header editorial:** categoria, título claro, resumo curto, evento/tendência.
2. **Metadados:** fonte primária, URL original, publicado em, atualizado em, coletado em, idioma, indicador de análise IA.
3. **Corpo:** resumo autoral, fatos verificados, contexto, por que importa, possíveis aplicações, limites/incertezas, fontes adicionais; nunca reproduzir corpo integral sem permissão.
4. **Contexto:** outras coberturas do mesmo acontecimento, linha do tempo, mudanças e correções.
5. **Ações:** salvar, comentar, propor meetup, gerar/registrar insight, compartilhar link interno.
6. **Discussão:** ordenação controlada, threads acessíveis, moderação e autoria visível.
7. **Proveniência:** versão da análise, critérios e ressalvas, fontes acessíveis.

## Jornada detalhada

- Leitor autentica via SSO → feed contém briefing e notícias com metadados.
- Abre notícia e distingue `fato da fonte` de `interpretação IA` → segue tema ou comenta.
- Colaborador menciona colega → colega recebe notificação permitida → debate gera proposta.
- Organizador agrega proposta à agenda e responsável prepara material → sessão acontece.
- Após meetup, responsável publica resumo validado e referências → cria insight/experimento.
- Em data futura, colaborador pesquisa assunto e encontra artigo + discussão + meetup + decisão.

## Componentes do design system

`AppShell`, `TopNavigation`, `Sidebar`, `NewsStoryCard`, `BreakingStoryHero` (uso contido), `MetadataByline`, `SourceBadge`, `RelevanceExplainer`, `TopicChip`, `EventTimeline`, `DiscussionThread`, `MentionInput`, `MeetupProposal`, `VoteControl`, `MeetupSession`, `KnowledgeReferenceList`, `InsightStatus`, `EditorialEmptyState`, `SearchFilters`, `NotificationCenter`, `ModerationAction`, `ErrorBoundary`.

Tokens: escala tipográfica editorial; espaçamento consistente; tokens semânticos (surface/text/border/accent/success/warning/error); fontes com licença; modo claro/escuro; foco visível; raio e sombra moderados; animações com reduced-motion. Brand e logotipo final exigem validação.

## Padrões de interação

- Busca incremental com URL de estado reproduzível, filtros persistentes e feedback de resultados.
- Skeleton durante carregamento; estados vazios que mostram o próximo passo; falhas locais sem derrubar a página.
- Botões e links com semântica adequada; teclado e leitor de tela; contrastes verificáveis.
- Comentários e formulários com validação inline, salvar rascunho se autorizado, evitar perda acidental.
- Votação otimista com rollback visível quando a API rejeitar; prevenir votos duplicados pelo backend.
- Modal somente quando necessário; não esconder conteúdo essencial atrás de hover.
- Evitar infinite scroll sem navegação; manter paginação/acessibilidade e deep links.

## Responsividade

- Desktop: navegação lateral opcional + coluna principal de leitura + barra contextual apenas em telas largas.
- Tablet: duas colunas quando apropriado.
- Mobile: leitura em coluna única e ações primárias acessíveis; evitar modais de largura fixa.

## Experimentos de usabilidade antes do polimento

- Usuário encontra uma notícia sobre agentes em menos de 3 passos.
- Usuário diferencia notícia original de resumo gerado por IA sem ler política externa.
- Usuário propõe pauta diretamente da notícia e entende estado da proposta.
- Usuário encontra conclusões de meetup anterior pelo termo de uma tecnologia.
- Testar com colaboradores de perfis técnicos e não técnicos; medir tempo, erros e compreensão.

## Referências de design

Inspirar-se em boas práticas de interfaces editoriais e ferramentas de conhecimento, **sem copiar** aparência proprietária, layout exclusivo ou ativos visuais de terceiros. O visual final será definido por protótipos aprovados, não presumido pelo agente.
