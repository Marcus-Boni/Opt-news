# Handoff para agente de desenvolvimento — Opt News

## Instrução pronta para repassar

Você será o agente responsável pelo planejamento técnico e posterior implementação incremental do **Opt News**, plataforma interna da Optsolv que reúne notícias e inteligência de mercado em IA/tecnologia, comunidade técnica, meetups e conhecimento aplicável.

**O produto não é um clone do AIHOT.** Aproveite seletivamente o mecanismo open source AIHOT para coletar, filtrar, pontuar, deduplicar, agrupar fatos e produzir resumos/relatórios. Todo o frontend, experiência editorial, modelos de colaboração, identidade, permissões, meetups e domínio de conhecimento serão Opt News.

Leia TODO este pacote antes de propor alterações: `README.md`, `AGENTS.md`, `docs/00-decisoes.md`, `docs/01-prd.md`, `docs/03-arquitetura.md`, `docs/04-dominio-dados.md`, `docs/07-aihot-spike.md`, `docs/10-roadmap-backlog.md`.

### Sua primeira missão

1. Faça um inventário do ambiente/repositório efetivamente disponível. Se não houver repositório, informe isso sem inventar arquivos.
2. Audite tecnicamente o AIHOT no commit fixado: arquitetura real, qualidade, scripts, dependências, riscos, fontes, contratos, migrations, licenças, segurança, custos, facilidade de extração. Não trate uma leitura de README como auditoria de código.
3. Proponha a estratégia de integração menos invasiva e mais sustentável, com **spike reproduzível**, incluindo alternativas e recomendação em ADR.
4. Revise o backlog e produza uma sequência de tarefas pequenas para um vertical slice real. Declare dependências, critérios de aceite e evidências de teste.
5. Identifique as **decisões bloqueantes** que exigem aceite humano, sem rediscutir o que já foi definido.
6. **Quando a tarefa do usuário for começar a construção**, depois da auditoria/ADR, implemente o vertical slice local com mocks e teste automatizado, conforme backlog; não aguarde reconfirmação para ações locais e reversíveis. Pare para autorização antes de custos, uso de tenant, produção ou ações destrutivas. Se a tarefa for apenas planejamento, entregue documentação sem implementar.

### Resultado esperado do primeiro ciclo

- `docs/07-aihot-spike.md` atualizado com resultados e evidências, incluindo commit SHA e comandos.
- `docs/12-adrs.md` com ADR de decisão de reuso aprovado/proposto.
- Lista priorizada de tarefas do vertical slice, estimativas relativas (não promessas de datas).
- Relatório de riscos, lacunas e custos aproximados com premissas.
- Recomendação de próximo ciclo e checkpoints de aprovação **somente** para ações externas/alto risco; se o mandato incluir implementação, iniciar o primeiro scaffold/vertical slice local seguro.

### Contratos de colaboração

- Comunicação em português brasileiro; código e nomes técnicos conforme convenções definidas para o repositório.
- Acompanhe requisito por ID e mantenha rastreabilidade requisito → tarefa → teste → evidência.
- Não modifique integrações reais sem consentimento. Use mocks em dev/CI.
- Não faça alterações silenciosas de arquitetura ou escopo.
- Não publique artigos integrais de terceiros, nem conteúdo empresarial interno em endpoints públicos.
- Priorize Azure DevOps como destino do código e pipelines, Microsoft Entra ID para SSO, Teams/SharePoint/Graph quando autorizados, e stack React/TypeScript/PostgreSQL.

**Definition of Ready (DoR) de uma tarefa:** requisito e aceite claros; dependências identificadas; regra de acesso; dados necessários; testes definidos; estimativa de risco.

**Definition of Done (DoD) de uma tarefa:** comportamento funcional verificável; testes verdes; observabilidade e erros; acessibilidade básica; documentação; permissão conferida; sem segredos; demonstração ou evidências; rollback quando aplicável.
