# 00 — Decisões e guardrails do projeto

## Escopo aprovado

| ID | Decisão | Status | Regra |
|---|---|---|---|
| DEC-001 | Nome de trabalho: Opt News | CONFIRMADO | Identidade final precisa de aprovação de marca |
| DEC-002 | Plataforma própria premium, moderna e profissional | CONFIRMADO | Não adaptar frontend/site AIHOT como produto final |
| DEC-003 | Reaproveitamento **seletivo** da inteligência AIHOT | CONFIRMADO | Estratégia técnica exata depende de spike |
| DEC-004 | IA e tecnologia como eixo principal | CONFIRMADO | Monitorar empresas e concorrentes relacionados |
| DEC-005 | Comunidade técnica interna | CONFIRMADO | Colaboração, debates, curadoria humana |
| DEC-006 | Meetups integrados | CONFIRMADO | Da pauta ao registro pós-evento |
| DEC-007 | Conhecimento aplicável | CONFIRMADO | Referenciar experimentos/projetos/decisões |
| DEC-008 | Jornada integrada fim a fim | CONFIRMADO | Eventos e referências ligam os quatro pilares |
| DEC-009 | Iniciar em fases | CONFIRMADO | Não eliminar pilares do roadmap |
| DEC-010 | Construção por outro agente, iniciando por auditoria e depois vertical slice | CONFIRMADO no handoff | Trabalho local seguro pode avançar; integrações reais/produção exigem autorização |

## Diretrizes técnicas propostas (não foram validadas em código)

| ID | Proposta | Condição |
|---|---|---|
| PROP-001 | React + TypeScript e Tailwind com design system próprio | Confirmar padrões de frontend e necessidades de SSR |
| PROP-002 | Fastify + TypeScript e contratos versionados | Validar extração/interoperabilidade AIHOT |
| PROP-003 | PostgreSQL como banco principal | Definir limites e schemas isolados |
| PROP-004 | Worker assíncrono com pg-boss | Confirmar compatibilidade e operação |
| PROP-005 | SSO Microsoft Entra ID | Checar tenant, app registration e permissões |
| PROP-006 | Microsoft Graph para meetups | Checar se houve consentimento e suporte a tipo de reunião/transcrição |
| PROP-007 | Azure e Azure DevOps como plataforma | Definir serviço, custo, topologia e políticas reais |
| PROP-008 | Busca PostgreSQL FTS antes de mecanismo dedicado | Benchmark antes de pgvector/índice híbrido |
| PROP-009 | Backend modular/monólito modular | Microserviços só mediante justificativa operacional |

## Invariantes de produto

1. Uma matéria pode aparecer em várias visões, mas deve ter identidade canônica e fontes rastreáveis.
2. Toda contribuição humana é atribuída a identidade interna e possui regras de edição, moderação e histórico.
3. Uma sugestão de meetup pode nascer de matéria ou ser proposta manualmente; sua origem é preservada.
4. Um aprendizado/experimento pode linkar várias matérias, discussões, meetups, artefatos e projetos.
5. Exibir claramente `fonte original`, `publicado em`, `coletado em`, `resumo gerado por IA`, `revisado por` quando aplicável.
6. Conteúdo interno não pode vazar em feeds públicos, mecanismos de busca externos ou prompts terceiros sem consentimento.
7. O portal deve ser útil mesmo quando a coleta/LLM falhar: leitura, discussões e histórico permanecem disponíveis.

## Anti-objetivos

- Dashboard genérico disfarçado de portal editorial; poluição visual, gamificação de volume, cópia de interface AIHOT.
- Bot autônomo que altera backlog, envia Teams ou publica informações internas sem fluxo de autorização.
- Adoção obrigatória de todas as dependências do AIHOT sem análise de licenças, segurança e custo.

## Fonte e limites de certeza

A documentação AIHOT descreve `apps/api`, `apps/worker`, `apps/web`, `packages/backend`, `site/`, `industry/` e `modules/`. Leia o código no commit efetivamente usado para confirmar. Referências: https://github.com/KKKKhazix/AIHOT/blob/main/docs/architecture.md e https://github.com/KKKKhazix/AIHOT/blob/main/README.en.md.
