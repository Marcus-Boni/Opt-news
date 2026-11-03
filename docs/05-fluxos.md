# 05 — Fluxos de negócio ponta a ponta

## F01 — Descoberta, análise e publicação

**Trigger:** agendador/fonte externa/indicação manual. **Ator:** worker+curador. **Resultado:** story publicada com evidência válida.

1. Validar fonte e condições de uso; aplicar limites, allowlist de domínios e proteção SSRF.
2. Capturar metadados; normalizar URL; checar URL/hash/idempotência.
3. Recuperar somente conteúdo permitido; identificar data original e idioma.
4. Pré-filtrar, analisar, pontuar e agrupar acontecimento, preservando scores e versões.
5. Gerar título/resumo em pt-BR com atribuição e limites de confiança; proibir fatos sem suporte.
6. Aplicar política de revisão e visibilidade; publicar somente escopo autorizado.
7. Atualizar índice de busca/feed/briefings; registrar eventos com observabilidade.

**Falhas:** sem data confiável ⇒ revisão; conteúdo insuficiente ⇒ aguardando material; falha LLM ⇒ retry com receipt/idempotência; licença desconhecida ⇒ somente link/metadados/resumo permitido após validação jurídica.

## F02 — Debate e curadoria colaborativa

**Trigger:** usuário autenticado abre notícia e comenta. **Resultado:** thread atribuída e relacionada.

1. API revalida identidade, autorização e política do alvo.
2. Valida tamanho/HTML/URLs/menções; sanitização e rate limit.
3. Persiste comentário, event/audit (conforme política), retorna com revision.
4. Notifica pessoas mencionadas apenas se também possuem acesso.
5. Usuário pode corrigir/editar; curador pode moderar com motivo, sem apagar evidências necessárias.

**Falhas:** token inválido ⇒ 401; permissão ausente ⇒ 403; conteúdo retirado ⇒ discussão somente se política autorizar; update conflitante ⇒ 409.

## F03 — Da notícia ao meetup

**Trigger:** proposta feita a partir de matéria ou diretamente. **Resultado:** sessão documentada.

1. Criar proposta com origem(es), autor e janela de votação.
2. Colaboradores votam (único por membro), organizador seleciona e fecha propostas.
3. Criar sessão com horário, responsável, referências e pauta; validar colisões manualmente na v1.
4. Opcional: agendar/vincular evento Teams via integração aprovada, com idempotency key externa.
5. Disponibilizar materiais antes do encontro; registrar participação quando permitido.
6. Pós-evento: resumo humano, documentos, links e conclusões; transcrição só se permitido e disponível.
7. Converter uma conclusão em `KnowledgeInsight` e ligar aos objetos de origem.

**Falhas:** Graph indisponível ⇒ sessão fica `draft` ou `pending_external_sync`, sem criar duplicata; gravação não disponível ⇒ permite registro manual; data passada ⇒ validação explicita.

## F04 — Do insight à aplicação

**Trigger:** usuário cria insight de discussão/meetup/notícia. **Resultado:** decisão rastreável.

1. Descrever hipótese, problema, contexto, tecnologias, referências e benefícios esperados.
2. Registrar análise de risco/custo e responsável; optar por POC se apropriado.
3. Definir métrica de sucesso e evidências antes de executar a POC.
4. Acompanhamento com atualizações, anexos e conclusões (sem segredos de clientes).
5. Registrar decisão: adotar, adiar, descartar, repetir experimento; quem decidiu e por quê.
6. Indexar para busca com autorização e mostrar de volta em notícias relacionadas.

**Falhas:** falha de experimento não apaga aprendizado; saída de responsável exige transferência; decisão pode ser revisitada mediante novo registro, não alteração silenciosa.

## F05 — Busca e recuperação de conhecimento

- Query com filtros por data, empresa, tecnologia, autor, tipo, estado e referência.
- Busca unificada pode oferecer histórias, discussões, meetups e insights em seções com permissões.
- Snippet e contagem não devem vazar material não autorizado.
- Abrir resultado mostra cadeia de origem e decisão, quando existir.

## F06 — Correção, retirada e governança

- Curador recebe alerta/feedback de artigo incorreto → marca revisão → corrige resumo ou retira publicação.
- Guardar revisão, motivo, quem aprovou e aviso de correção; avaliar efeito em briefings já publicados, busca e notificações.
- Comentários/meetups podem manter referência ao fato retirado, mas não devem reproduzir conteúdo cuja divulgação deixou de ser autorizada.
- Criar fluxo administrativo de investigação de denúncias, autorização e relatório de ações.
