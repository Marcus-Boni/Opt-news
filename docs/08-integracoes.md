# 08 — Integrações Microsoft/Azure e terceiros

## Princípios

Conectar somente o necessário, com app registrations e permissões mínimas revisadas pelo administrador. O repositório não contém tenant IDs, segredos nem URLs privadas. Idempotência e confirmação remota são obrigatórias antes de mostrar sucesso ao usuário.

## Microsoft Entra ID — login SSO

- Validar usuários da organização via OpenID Connect / OAuth 2.0, com configuração `tenant` aprovada.
- Backend valida tokens com metadados/jwks, issuer, audience, tenant, `oid`, expiração e nonce/state conforme fluxo.
- Decidir sessão server-side vs token frontend via ADR; cookies seguros com HttpOnly, Secure, SameSite e anti-CSRF se aplicável.
- Mapear identidades por `(tenantId, oid)`; não usar email como chave imutável.
- Aplicar RBAC em backend; onboarding/offboarding e desativação de membros; sincronização opcional de grupos somente após autorização.

## Microsoft Teams/Graph — meetups

MVP: permitir data/hora, materiais e vínculo manual à reunião Teams. Fase de integração:
1. Aprovar quais ações o Opt News pode executar (criar convite, calendário, buscar transcrição, postar resumo etc.).
2. Definir modelo delegado vs aplicativo; consentimentos e limitações por tipo de reunião.
3. Registrar recurso externo e `externalSyncState` com tentativa, resposta e erro.
4. Evitar criar reuniões duplicadas: chave idempotente de agendamento e reconciliation job.
5. Recuperar transcrições/gravações somente se legalmente autorizadas e disponíveis para a conta/app e reunião; suportar fallback manual.
6. Revisão humana antes de publicar resumos por IA ou compartilhá-los no Teams.

**Não presumir** que toda reunião do Teams fornece transcrição automaticamente para o Opt News; depende de políticas, licença, permissão e tipo de reunião.

## SharePoint e Blob

- SharePoint é preferível para artefatos pertencentes a canais/equipes já organizados por cliente/projeto, respeitando permissões originais.
- Azure Blob pode armazenar artefatos próprios da plataforma com controles de acesso e ciclo de vida.
- Usar referências e metadata, não copiar arquivos de todo o tenant; links de download devem usar autorização e expiração adequadas.
- Contratos do Graph/SharePoint precisam tratar atualização, exclusão, mudança de permissão e recurso indisponível.

## Azure DevOps

- Repositório e pipelines do Opt News na organização Azure DevOps da Optsolv (nome de projeto a confirmar).
- Integrações de projeto/conhecimento com Work Items são **fase posterior** e opt-in; não criar tarefas automaticamente a partir de textos de IA.
- CI/CD com segredos fora de YAML e gates/approvals em produção.

## Fontes externas e fornecedores de IA

- Inventário de URLs/fonte, licença, confiabilidade, rate limits, chave/restrição e finalidade.
- Política editorial prioriza canais oficiais, arXiv/papers autorizados, blogs técnicos e publicações especializadas, em ordem de relevância verificável.
- LLM provider configurável; prompts versionados, transparência, minimização de dados, limites de orçamento, logs redigidos.
- Toda chamada de modelo tem `requestId`, custo estimado, status, tipo de dado, retry e resultado persistido.

## Matriz de integração (planejamento)

| Integração | MVP | Versão seguinte | Controle |
|---|---|---|---|
| Entra ID | Login/identidade | Grupos e lifecycle | Admin tenant |
| Teams | Link manual da reunião | Criação/sincronização | Consentimento Graph |
| Graph transcrições | Registro manual | Coleta autorizada | Política reuniões/licença |
| SharePoint | Link a documento | Importação seletiva | ACL em origem |
| Azure DevOps | Pipeline/repo | Conectar insights a work items | Permissão por projeto |
| IA provider | Mock/teste + provedor aprovado | Avaliação calibrada e custos | Budget e DPA |
