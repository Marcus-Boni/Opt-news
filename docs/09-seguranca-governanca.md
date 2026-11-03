# 09 — Segurança, compliance e governança de conteúdo

## Ameaças principais

- **SSRF** por crawlers e URL enviada por colaborador (metadata interna, 127.0.0.1, DNS rebinding, redirecionamentos).
- **Prompt injection** em artigos/transcrições que tentam desviar o agente ou divulgar dados.
- **XSS** por HTML/Markdown injetado em resumos, comentários, links e arquivos.
- **Broken access control** por recursos internos listados em feed, busca, notificações ou download.
- **Tenant/permission mismatch** em Graph e arquivos SharePoint, permissões delegadas mal definidas.
- **Direitos autorais** em captura, armazenagem, tradução, publicação e redistribuição de artigos.
- **Privacidade** de perfis, comunicações, transcrições e dados pessoais tratados por modelos.

## Controles mínimos

| Controle | Implementação esperada | Evidência |
|---|---|---|
| Autorização server-side | Políticas por ação/objeto + negação padrão | Testes 401/403/404 e matriz RBAC |
| SSRF | DNS/IP público após redirecionamento; egress control; size/time/content type limits | Casos contra endereços privados e redirecionamentos |
| Sanitização | Markdown seguro, HTML restrito, CSP e URLs permitidas | Testes XSS e revisão visual |
| Segredos | Key Vault/ambiente seguro; não logar tokens | Secret scanning CI |
| Modelos | Entrada de fonte tratada como dados, não instruções; output validado | Testes adversariais |
| Licença de conteúdo | Direitos por fonte e `site_fulltext=false` como default | Auditoria de fontes e notices |
| Logs/auditoria | Requisições, alterações editoriais, moderação sem PII excessiva | Consultas testadas |
| Dados internos | Segmentação por escopo, indexação privada e ACL por resultado | Testes busca/notificação |
| Backup/restore | Backup agendado, restore testado | Relatório de restauração |
| Retenção | Política validada para comentários, perfis, transcrições, IA e logs | Dicionário de dados |

## Política de publicabilidade

**Padrão: somente ambiente autenticado interno.** Mesmo em sistema interno, copyright continua aplicável. Para cada fonte especificar:

- Direitos de acesso/coleta, termos e licença verificável.
- Pode mostrar título/metadados/link? Pode exibir resumo autoral? Pode armazenar/transmitir texto integral para análise? Pode republicar/traduzir integralmente?
- Quais trechos podem entrar no banco, por quanto tempo, com quais restrições.
- Retirada/solicitações de titular e procedimento de revisão.

Quando direito é incerto: não exibir integralmente, dar preferência a metadados e link com avaliação legal antes da ingestão que envolva reprodução. Proibição de contornar paywall, login ou controles de acesso.

## Governança de IA

- Diferenciar `conteúdo original` (atribuído), `resumo de IA` e `opinião/conclusão humana`.
- Guardar `model`, `promptTemplateVersion`, `policyVersion`, `processingTime`, `evidenceIds`, feedback e revisão.
- Não enviar transcrições de reuniões, arquivos de cliente ou PII para provedores de IA antes de verificar contrato, finalidade e autorização.
- Validar factualidade com fonte; mostrar incerteza quando não houver evidência; nunca apresentar score como certeza factual.
- Resumos de reuniões e recomendações não se convertem automaticamente em decisões aprovadas.

## RBAC inicial (proposto)

| Ação | Membro | Organizador | Curador | Admin |
|---|---|---|---|---|
| Ler conteúdo interno geral | Sim* | Sim* | Sim* | Sim* |
| Comentar/propor meetup | Sim* | Sim* | Sim* | Sim* |
| Organizar sessões | Não | Sim | Opcional | Sim |
| Publicar/moderar conteúdo editorial | Não | Não | Sim | Sim |
| Gerir fontes/configuração de IA | Não | Não | Parcial | Sim |
| Gerir papéis, operações e auditoria | Não | Não | Não | Sim |

`*` condicionado às ACLs específicas por recurso. Papel admin não implica acesso irrestrito a documentos de clientes fora do escopo institucional.

## Privacidade e LGPD

Documentar controlador, bases legais aplicáveis, finalidade, minimização, direitos do titular, retenção, armazenamento, provedores/suboperadores e resposta a incidente. Solicitar revisão jurídica/DPO antes de processar transcrições ou dados pessoais extensos.

## Checklist pré-produção

- [ ] Threat model e revisão de dependências / SBOM / segurança containers.
- [ ] Permissões Entra/Graph aprovadas, contratos de dados e fornecedores verificados.
- [ ] Políticas de conteúdo e termos definidos, sem interface pública acidental.
- [ ] Rate limits, proteções crawler, CSP, TLS, headers, backups, alertas e runbooks validados.
- [ ] Pentest/scan direcionado às APIs, acesso a arquivos, busca, upload e Graph.
- [ ] Auditoria de permissões e planos de revogação/offboarding executados.
