# 11 — Qualidade, CI/CD, operação e observabilidade

## Pirâmide de testes

- **Unitários:** critérios editoriais, estados de propostas, deduplicação, permissões, URLs, serializers, regras de pontuação.
- **Contratos:** adapter AIHOT ⇄ Opt News, API ⇄ frontend, Graph mock ⇄ integrações.
- **Integração:** PostgreSQL isolado, migrations, jobs, idempotência, outbox, ACL e busca.
- **E2E:** login de teste, feed, comentário, proposta, voto, meetup e insight — fluxo completo; acessibilidade básica.
- **Segurança:** SSRF, XSS, prompt injection, acesso horizontal/vertical, auditoria, content takedown.
- **Resiliência:** provedor IA indisponível, Graph falha após timeout, job duplicado, feed sem dados, retirada de conteúdo.
- **Operação:** backup/restore, rollback, migrations forward compat, secret rotation, recovery de jobs.

## Quality gates sugeridos

| Gate | Obrigatório para merge? | Evidência |
|---|---|---|
| Formatação/lint | Sim | Saída pipeline |
| TypeScript strict typecheck | Sim | Saída pipeline |
| Tests unit/integration | Sim | Relatório e fixtures offline |
| Contract/API schema validation | Sim em alteração de API | Diff OpenAPI + contract tests |
| Build web + API + worker | Sim | Artefatos reproduzíveis |
| Dependency/license/secret scan | Sim | Relatório de risco |
| Smoke staging | Para promoção | Sessão de teste fim a fim |
| Revisão de UX/acessibilidade | Para alterações de interface | Evidência visual + keyboard/screen reader check |
| Manual production approval | Sim | Log de aprovação e plano de rollback |

## CI/CD Azure DevOps (proposta)

`PR validation` → quality gates → build → testes → imagens assinadas/SBOM conforme disponibilidade → `dev` → smoke → `staging` → teste de aceite → aprovação → `prod` → smoke/monitoramento → rollback se necessário.

- Segredos por Variable Groups seguros/Key Vault; credentials short-lived quando possível.
- Migrações em job separado com pré-verificação e estratégia expand/contract.
- Ambientes protegidos; sem deploy direto em `main` ignorando verificação.
- Artefatos associados ao commit, versão de contratos e migrações.
- Fornecer `README-dev` no repositório final com comandos reais depois da escolha do workspace.

## Métricas operacionais

- Ingestão: fontes ativas, itens/hora, duplicatas, latência, falhas, retries, filas paradas.
- IA: chamadas por fase, tokens, custos reais/estimados, cache/receipts, taxa de falha, qualidade amostrada.
- API/web: p50/p95 latência, taxa de erro, sessão/autorização, taxa de falhas de busca e Core Web Vitals.
- Meetups/Graph: criação remota confirmada, sync pendente, falhas de permissão, reprocessamentos.
- Engajamento: participantes semanais, comentários relevantes, meetups sugeridos a partir de notícias, insights gerados, experimentos concluídos.

## SLOs

**Ainda não aprovados.** Levantar baseline de p95, uptime, RPO/RTO, cadência de coleta e orçamento. Transformar em SLOs após medir o piloto, com alertas que refletem impacto real ao usuário. Não usar métricas inventadas como compromisso.

## Runbooks mínimos

1. **Coleta interrompida:** checar habilitação, quota, fonte, jobs, resposta HTTP, volume/retentativas, backfill seguro.
2. **Modelo indisponível/estourou orçamento:** pausar novas chamadas, manter leitura, preservar receipt e reprocessar após liberação.
3. **Notícia incorreta/retirada:** suspender visibilidade, editar com histórico, corrigir relatórios/índices, auditar referências.
4. **Graph falhou:** confirmar criação remota antes de retry, reprocessar com chave idempotente; link manual como fallback.
5. **Vazamento ou acesso não autorizado:** revogar credenciais/sessões, isolar, preservar logs mínimos, reportar conforme plano de incidente.
6. **Restore:** restaurar em ambiente isolado, validar consistência de referências e busca, ensaiar RTO/RPO.

## Critérios de readiness de produção

- Risco e segurança bloqueantes resolvidos; SLOs e budgets aceitos; legal de conteúdo validado.
- Logs, dashboards, alerta, backup/restore, feature flags e rollback testados.
- Usuários e papéis validados com tenant de teste.
- Documentação de arquitetura atualizada e owner operacional definido.
