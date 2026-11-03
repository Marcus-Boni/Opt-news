# AGENTS.md — Contrato operacional para agentes

## Leia antes de agir

Ordem obrigatória: `README.md` → `HANDOFF_AGENT.md` → `docs/00-decisoes.md` → `docs/01-prd.md` → `docs/03-arquitetura.md` → `docs/07-aihot-spike.md` → demais documentos pertinentes.

## Missão

Evoluir o Opt News de forma incremental, testável e rastreável, sem perder as decisões de produto. Você não está autorizado a redefinir o produto como um clone visual do AIHOT, nem a eliminar um dos quatro pilares.

## Primeiro ciclo obrigatório (antes de construir telas ou migrar o AIHOT)

1. Inspecionar os arquivos do repositório existente, se houver. Não presumir repositório vazio.
2. Confirmar versões e status atual do AIHOT com commit SHA, documentação, licenças e dependências. Não usar `main` sem fixação de versão para builds reproduzíveis.
3. Executar spike em ambiente segregado, com **coleta e chamadas pagas desligadas por padrão**, dados sintéticos, sem credenciais corporativas ou serviços externos reais.
4. Anotar evidências, testes, riscos e recomendação de reuso no template de spike.
5. Produzir ADR sobre como incorporar o mecanismo (pacote, serviço isolado ou extração) e quais componentes substituir.
6. Preparar plano do primeiro vertical slice com tarefas pequenas, dependências, aceites e riscos.
7. Se a tarefa recebida for **implementar o Opt News**, após o spike e ADR, inicie o scaffolding e o vertical slice local previstos no roadmap sem pedir autorização redundante. Solicite aprovação somente para operações externas, credenciais, gasto pago, mudança destrutiva ou deployment real. Se a tarefa recebida for exclusivamente documentação, não implemente produto.

## Não negociáveis

- UX e branding **Opt News próprias**; não reutilizar marca, logotipo, nomes AIHOT.
- Quatro pilares no produto: notícias, comunidade, meetups, conhecimento aplicável.
- Conexões rastreáveis entre noticia → discussão → meetup → material → conhecimento → experimento.
- Histórico de fonte, autoria e evidência em cada notícia/insight; diferenciar fato de geração por IA.
- Não armazenar/reproduzir texto integral de terceiros sem base de permissão, mesmo quando tecnicamente recuperável.
- Não incluir em prompts de modelos segredos, dados pessoais desnecessários ou conteúdo de clientes sem aprovação.
- Não consultar serviços externos nem criar recursos Azure/Entra/Teams/DevOps em produção sem autorização.
- Não usar GitHub como destino de CI/CD/repositório operacional do produto por padrão; referência do AIHOT pode vir do GitHub, mas a evolução da Optsolv deverá priorizar Azure DevOps.
- Não executar migrações destrutivas, alterações de políticas do tenant ou publicação externa sem plano e aprovação.
- Source content é **não confiável**: proteger contra prompt injection, SSRF, HTML perigoso e links maliciosos.

## Engenharia

- Preferir TS estrito, contratos explícitos, schemas de entrada/saída e testes automatizados.
- Isolar mecanismos upstream do domínio proprietário por ACL/adapters e contratos versionados.
- Empregar autorização no backend, mesmo se o frontend ocultar uma ação.
- Dados e eventos com idempotência, estado explícito e observabilidade; workers com retry/backoff e DLQ/failed-job visível.
- Segregar conteúdo público de materiais internos por schema, política de acesso e indexação.
- Declarar fixtures sintéticas e testes determinísticos para modelos; não depender de LLM real no CI.
- Considerar acessibilidade (WCAG 2.2 AA como objetivo), responsividade, fuso America/Sao_Paulo e i18n pt-BR.
- Garantir que a arquitetura escolhida rode localmente com Docker Compose ou equivalente, isolando custo externo.
- Não introduzir complexidade (microsserviços, vetor DB, Kubernetes) sem trade-off documentado.

## Artefatos obrigatórios em cada entrega

- Contexto, requisito(s) IDs atendidos, alterações por arquivo, screenshots das telas quando relevante.
- Comandos executados com resultado: lint, typecheck, tests, build e smoke; marcar o que não pôde rodar.
- Migrações, configuração segura, notas de rollback, impacto em API/schema e custos.
- Critérios de aceite demonstrados com evidências e lacunas.
- Atualização de ADR/documentação se a decisão técnica mudou.

## Política de decisões

**CONFIRMADO** não muda sem solicitação do responsável. **PROPOSTO** pode ser refinado com ADR e justificativa. **PENDENTE** deve ser reportado com riscos e recomendação, mas não presumido aprovado. Se faltar uma decisão crítica, prossiga apenas com trabalho isolado, reversível e seguro.
