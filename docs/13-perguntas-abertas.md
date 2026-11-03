# 13 — Decisões abertas, prioridades e defaults seguros

> Evite pedir tudo de uma vez. Priorize as decisões bloqueantes e avance apenas com tarefas reversíveis/mockadas até aprovação.

| ID | Pergunta | Criticidade | Responsável sugerido | Default seguro enquanto aberto |
|---|---|---|---|---|
| Q-01 | Repositório Azure DevOps existente ou novo? Qual projeto? | Bloqueante ao deploy | Líder técnico | Não criar remotamente |
| Q-02 | Quais fontes e direitos de ingestão/publicação foram aprovados? | Coleta real **local** autorizada pelo responsável em 2026-11-02, com lista proposta de 16 feeds públicos em `tools/real-sources.ts`, só resumo + link. Falta a aprovação jurídica antes de abrir para outras pessoas | Produto + jurídico | Fixtures em CI; feeds reais só no banco local `optnews_ia` |
| Q-03 | Que provedor de IA e orçamento mensal podem ser usados? | **Provedor decidido (ADR-0013):** Foundry `gpt-6-luna`. Pendentes: teto mensal e papel de dados no recurso | Tecnologia + financeiro | `MODEL_PROVIDER=simulated` até o papel ser concedido |
| Q-04 | Qual tenant Entra, usuários/grupos, app registration e papéis? | Bloqueante ao SSO real | Admin M365 | Mock auth só local/testes |
| Q-05 | Hospedagem (App Service/Container Apps/VM), regiões e limites? | Bloqueante à produção | Infra | Docker local e topologia conceitual |
| Q-06 | O portal ficará exclusivamente interno? | Alta | Produto/Segurança | Autenticado e privado |
| Q-07 | Quem pode ser curador, organizador e admin? | Alta | Produto/RH/Tecnologia | Negar privilégios administrativos |
| Q-08 | Retenção e tratamento de gravações/transcrições? | Alta | Jurídico/DPO/M365 | Não coletar automaticamente |
| Q-09 | Identidade visual, tom editorial e marca Opt News final? | Média | Produto/Design | Design tokens provisórios, sem publicar |
| Q-10 | Critérios e pesos de relevância Optsolv? | Média. Cortes provisórios para o gpt-6-luna (doc 07 §6); falta amostra real rotulada | Curador/técnicos | Exibir score editorial, interno como não calibrado |
| Q-11 | Categorias/empresas/concorrentes prioritários? | Média | Tecnologia + Comercial | Taxonomia inicial pequena e configurável |
| Q-12 | Devemos ter curadoria prévia obrigatória antes de publicar? | Alta | Produto/Segurança | Conteúdo em revisão quando incerteza significativa |
| Q-13 | Integração Teams: criar reunião, buscar transcrição ou só vincular? | Alta | Produto + Admin M365 | Link manual |
| Q-14 | Ligação com projetos reais (Azure DevOps) e nível de visibilidade? | Alta | Gestão + Segurança | Apenas referência textual controlada |
| Q-15 | Frequência de meetups/briefings e horários oficiais? | Média | Organizador | Configurável, sem automação de agenda |
| Q-16 | Regras de contribuição e moderação? | Média | Produto + RH | Papel curador, histórico e canal de denúncia |
| Q-17 | Metas de adoção, custo, uptime e performance? | Média | Produto + Operação | Medir baseline primeiro |

## Ordem de esclarecimento

**Antes da primeira coleta real:** Q-02 e Q-03. **Antes de SSO real:** Q-04 e Q-07. **Antes de produção:** Q-01, Q-05, Q-06, Q-08, Q-12, Q-16 e metas básicas de operação. **Antes de integração Teams:** Q-13 e política M365. As demais podem ser calibradas em piloto.

## Política do agente

Quando uma resposta não estiver disponível, registre `OPEN`, hipótese e impacto. Não apresente hipótese como decisão do usuário. Evite perguntas que já estejam respondidas no pacote (ex.: quatro pilares, escolha de UX própria, reuso seletivo do AIHOT).
