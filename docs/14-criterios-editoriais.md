# 14 — Curadoria editorial, relevância e taxonomia (proposta)

## Objetivo

Distinguir **notícia importante no mercado** de **notícia útil para a Optsolv**. A seleção automatizada pode usar o modelo AIHOT, mas critérios e pesos precisam de calibragem com profissionais da empresa; não fixar pesos arbitrários em produção.

## Dois escores diferentes

1. **Relevância editorial (`editorialScore`):** sinaliza importância, novidade, credibilidade, utilidade e cobertura do fato segundo critérios do motor — preservar proveniência e não apresentar como verdade absoluta.
2. **Relevância Optsolv (`optsolvRelevanceScore`):** sinaliza relação com áreas de atuação, frameworks/infra em uso, riscos e oportunidades técnicas/comerciais. Calibrado com decisões de curadores e feedback explícito.

O score interno **não substitui** fonte, evidência, autor ou revisor. Notícia sensacionalista ou sem base confiável não deve ser promovida porque menciona cliente/concorrente.

## Taxonomia inicial sugerida (configurável)

- Modelos de IA e LLMs
- Agentes e orquestração
- Engenharia de software com IA
- Machine learning e pesquisa científica
- Infraestrutura, cloud e GPUs
- Dados, RAG e busca
- Segurança, privacidade e governança
- Frameworks e ferramentas de desenvolvimento
- Produtos e APIs de fornecedores
- Mercado, concorrência e movimentos corporativos
- Casos de uso setoriais (saúde, indústria, logística etc.)

A entidade `Topic` suportará sinônimos e aliases, permitindo filtrar por empresa, tecnologia, produto, pesquisa e setor. Categorias definitivas devem ser aceitas por curadoria; evitar sobreposição excessiva.

## Fluxo editorial

`fonte candidata` → direitos/qualidade → coleta permitida → validação de data/proveniência → dedupe → avaliação → resumo/explicação → decisão de publicação → feedback → calibração.

## Regras de qualidade

- Notícia precisa de fonte primária ou secundária identificada; preferir material original quando disponível.
- A data de publicação da fonte não é a data da coleta; armazenar ambas.
- Fatos novos devem apontar evidências; cenários futuros e opiniões precisam de rótulo.
- Corrigir ou retrair resumos quando a fonte original mudar; preservar audit trail interno.
- Não atribuir falas a pessoas não identificadas no material; não inferir causalidade sem evidência.
- Exibir resumo em pt-BR com título fiel, contexto de impacto e limitações, com referências.
- Sempre permitir atuação humana: destacar, ocultar, corrigir, fundir e sinalizar conteúdo.

## Feedback e calibração

Registrar decisões de curador em conjunto versionado: `{storyId, label, rationale, curatorId, policyVersion, timestamp}`. Avaliar qualidade contra amostra com falso positivo/negativo, diversidade de fontes, redundância e explicabilidade. Usar um conjunto de validação estável entre versões de prompts/modelos.

## Fontes de partida

A lista final exige aprovação e verificação de direitos. Podem ser avaliadas categorias de fontes como blogs oficiais de provedores, repositórios de pesquisa autorizados, veículos especializados e publicações técnicas. **Não presumir autorização para scraping ou republicação por serem públicos.**
