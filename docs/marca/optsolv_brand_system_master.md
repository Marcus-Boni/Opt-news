# Optsolv Brand System Master

Versão operacional para uso por pessoas, LLMs e agentes de geração de materiais.

## 1. Finalidade

Este documento orienta a aplicação consistente da marca Optsolv em propostas comerciais, apresentações, documentos executivos, relatórios, sites e materiais institucionais.

Ele deve ser usado em conjunto com:

- `optsolv_brand_system_v1.json`, que contém tokens, regras estruturadas e parâmetros verificáveis.
- `optsolv_brand_assets_manifest.json`, que identifica os arquivos oficiais e suas limitações técnicas.
- Os ativos visuais oficiais, preferencialmente em arquivos individuais.

## 2. Hierarquia de autoridade

As informações deste sistema possuem três níveis de origem:

1. **Oficial verificado**: extraído diretamente dos pacotes de logo, paleta, tipografia e elementos de apoio fornecidos pela Optsolv.
2. **Contexto estratégico**: posicionamento e preferências editoriais informados pela liderança da Optsolv.
3. **Regra operacional**: critério criado para tornar a aplicação da marca determinística em LLMs e agentes. Essas regras não substituem um manual oficial da agência e podem ser ajustadas pela Optsolv.

Em caso de conflito, prevalece a seguinte ordem:

1. Ativo visual oficial.
2. Valor oficial de cor ou tipografia.
3. Regra expressa neste documento e no JSON.
4. Preferencia genérica do agente ou da ferramenta.

## 3. Essência da marca

### Posicionamento atual

A Optsolv atua com IA aplicada a negócios, com foco em inteligência operacional. A tecnologia deve aparecer como meio para compreender o negócio, melhorar decisões e transformar operações, e não como exibicionismo técnico.

### Sensação desejada

- Premium executivo.
- Maduro e seguro.
- Tecnológico com sobriedade.
- Claro, confiável e sofisticado.
- Próximo do negócio e da operação real.

### Equilíbrio central

A marca deve equilibrar negócio e tecnologia. Uma peça não deve parecer nem uma consultoria tradicional sem capacidade técnica, nem uma startup experimental desconectada de resultado empresarial.

### Assinatura presente no sistema de logo

`tecnologia que impulsiona`

Essa assinatura faz parte de duas variações oficiais do logo. Ela não deve ser reescrita, abreviada ou substituída dentro da marca.

## 4. Sistema cromático

Os nomes abaixo sao aliases operacionais. Os arquivos oficiais apresentam valores cromáticos, mas não documentam nomes semânticos para cada cor.

| Alias operacional | HEX | RGB | CMYK oficial de referência | Pantone |
| --- | --- | --- | --- | --- |
| Laranja escuro | `#B22D09` | 178, 45, 9 | 10, 85, 95, 10 | 2349 C |
| Roxo escuro | `#271284` | 39, 18, 132 | 100, 100, 10, 0 | 2371 C |
| Grafite | `#353030` | 53, 48, 48 | 0, 25, 20, 90 | Black C |
| Laranja vivo | `#FF4800` | 255, 72, 0 | 5, 75, 90, 0 | 7579 C |
| Roxo vivo | `#743DFF` | 116, 61, 255 | 80, 75, 0, 0 | 6097 C |
| Taupe | `#9E8477` | 158, 132, 119 | 0, 30, 30, 45 | 2475 C |
| Pêssego | `#FF855A` | 255, 133, 90 | 0, 65, 65, 0 | 2024 C |
| Lavanda | `#A588FF` | 165, 136, 255 | 55, 50, 0, 0 | 7446 C |
| Areia quente | `#EFC3AF` | 239, 195, 175 | 0, 20, 20, 0 | 9200 U |
| Preto | `#000000` | 0, 0, 0 | 0, 60, 0, 100 | 419 C |
| Claro quente | `#F1F1E3` | 241, 241, 227 | 5, 5, 15, 0 | 9064 U |

### Papéis operacionais

- **Laranja escuro**: assinatura institucional, ênfase de negócio e destaques de alta relevancia.
- **Laranja vivo**: ação, chamada, número-chave ou destaque energético. Usar em pequenas áreas.
- **Roxo escuro**: tecnologia, IA, dados, fundos escuros e seções de profundidade.
- **Roxo vivo**: destaque digital e tecnológico. Evitar competir com um CTA laranja na mesma página.
- **Grafite e preto**: texto, estrutura, contraste e base neutra.
- **Claro quente**: fundo institucional preferencial quando o branco puro parecer frio.
- **Taupe, pessego, lavanda e areia**: apoio, boxes, categorias secundárias e fundos suaves.

### Proporcao visual recomendada

Regra operacional para pecas executivas:

- 70% a 85% de base neutra.
- 10% a 20% de uma cor principal de ênfase.
- Ate 10% de uma segunda cor de apoio.
- Evitar usar laranja vivo e roxo vivo como destaques concorrentes.

### Contraste e legibilidade

Para texto corrido, buscar contraste mínimo WCAG AA de 4,5:1. Para texto grande, mínimo de 3:1.

Combinacoes recomendadas:

- Texto branco ou claro quente sobre roxo escuro, grafite ou preto.
- Texto branco ou claro quente sobre laranja escuro.
- Texto branco ou claro quente sobre roxo vivo.
- Texto preto sobre laranja vivo, taupe, pessego, lavanda, areia quente ou claro quente.
- Texto grafite, preto, roxo escuro ou laranja escuro sobre claro quente.

Evitar texto branco em laranja vivo, taupe, pessego, lavanda ou areia quente para corpo de texto.

## 5. Tipografia

### Famílias oficiais identificadas

- **Public Sans**: família principal.
- **Roboto Mono**: família secundaria.

O pacote recebido contém páginas HTML de referência do Google Fonts, mas não contém arquivos instaláveis `.ttf`, `.otf`, `.woff` ou `.woff2`. Por isso, a família esta verificada, mas o conjunto oficial de pesos não esta documentado nos arquivos entregues.

### Uso da Public Sans

Usar em:

- Titulos e subtítulos.
- Texto corrido.
- Bullets.
- Numeros executivos.
- CTAs e legendas principais.

Pesos operacionais, quando disponíveis:

- 400 para corpo.
- 600 para subtítulos e ênfase.
- 700 para títulos e números-chave.

### Uso da Roboto Mono

Usar com moderação em:

- Labels.
- Microdados.
- Codigos, versoes e marcadores técnicos.
- Indicadores curtos.
- Pequenos callouts relacionados a tecnologia e dados.

Nao usar Roboto Mono como fonte principal de parágrafos ou de slides completos.

### Fallbacks

- Para documentos digitais: Arial, Helvetica, sans-serif.
- Para PowerPoint que sera editado em ambientes sem as fontes: Arial como fallback seguro.
- Quando houver controle de exportacao, instalar Public Sans e Roboto Mono antes de gerar o arquivo final.

## 6. Sistema de logo

O PDF RGB oficial contém 16 páginas: quatro estruturas de marca em quatro tratamentos cromáticos.

### Estruturas oficiais

1. **Logo principal**: wordmark Optsolv com símbolo, sem assinatura.
2. **Variacao horizontal com assinatura**: assinatura `tecnologia que impulsiona` posicionada a direita.
3. **Variacao composta com assinatura**: assinatura posicionada abaixo do wordmark.
4. **Simbolo isolado**.

Cada estrutura possui versoes laranja, claro quente, preta e branca.

### Selecao da versão

- Usar o logo principal como assinatura institucional padrão.
- Usar a variação horizontal com assinatura apenas quando houver largura e tamanho suficientes para leitura.
- Usar a variação composta em áreas mais compactas ou de proporção menos horizontal.
- Usar o símbolo isolado em avatar, favicon, selo, marca d'agua sutil ou detalhe de composição.
- Nao substituir sistematicamente o logo completo pelo símbolo em documentos institucionais.

### Fundo e contraste

- Fundo claro: preferir versão laranja ou preta.
- Fundo escuro: preferir versão branca ou claro quente.
- Evitar aplicar o logo sobre fotografias ou grafismos com baixo contraste.
- Nao colocar a versão clara sobre fundo claro nem a versão preta sobre fundo escuro.

### Regras operacionais de segurança

Estas medidas não constam de um manual oficial e funcionam como padrão provisório:

- Area livre mínima: 25% da altura total do logo em todos os lados.
- Logo principal digital: largura mínima recomendada de 120 px.
- Logos com assinatura digital: largura mínima recomendada de 240 px.
- Simbolo digital: largura mínima recomendada de 24 px.
- Em impressao, realizar prova de legibilidade antes de reduzir abaixo de 25 mm para o logo principal ou 50 mm para versoes com assinatura.

### Proibicoes

- Nao distorcer, inclinar ou redesenhar.
- Nao alterar as cores internas.
- Nao aplicar sombra, brilho, contorno ou efeito 3D.
- Nao separar o símbolo do wordmark dentro de uma versão oficial.
- Nao reescrever a assinatura com outra fonte.
- Nao repetir o logo como elemento decorativo em excesso.

## 7. Elementos de apoio

### Grafismos

O pacote contém 14 grafismos em PNG transparente e PDFs vetoriais. Visualmente, sao sete composições-base em duas famílias de destaque, laranja e roxo, combinadas principalmente com preto.

Uso recomendado:

- Bordas e cantos.
- Divisoes de seção.
- Fundos discretos.
- Destaques de capa.
- Apoio a diagramas e blocos de conteúdo.

Nao usar mais de um grafismo protagonista por página. Evitar ampliar formas de maneira que dominem o conteúdo.

### Icones e primitivas graficas

O PDF RGB possui 100 páginas, organizadas como variações cromáticas de aproximadamente dez composições-base. O conjunto inclui ícones quadrados e elementos horizontais semelhantes a sequências, conexões, progresso e orbitas.

Limitacao técnica: os PNGs fornecidos possuem fundo branco e não possuem canal alpha. Eles não devem ser aplicados diretamente sobre fundos coloridos ou escuros sem tratamento.

Uso recomendado:

- Capacidades.
- Etapas de processo.
- Conexoes e fluxos.
- Marcadores de tecnologia, dados e integracao.
- Reforco visual de topicos curtos.

Nao misturar ícones oficiais com bibliotecas genericas de estilos incompatíveis na mesma página.

### Ilustracoes

O conjunto possui 17 páginas no PDF RGB: uma composição ampla e quatro estruturas-base em diferentes tratamentos cromáticos. Nao foram fornecidos PNGs ou SVGs individuais.

Uso recomendado:

- Capa ou abertura de seção.
- Paginas institucionais.
- Momentos de respiro visual.
- Contextos de tecnologia, conexão, inteligência e movimento.

Evitar ilustrações em páginas com alta densidade de informação, tabelas extensas ou condições comerciais.

### Substituicao por elementos gerados

Um agente não deve inventar novos símbolos e apresenta-los como elementos oficiais da Optsolv. Quando o ativo oficial não estiver disponível, preferir formas geométricas simples e discretas, claramente tratadas como composição editorial.

## 8. Aplicacao em propostas e apresentações

### Direção visual

- Base premium executiva minimalista.
- Densidade baixa a media.
- Hierarquia clara e alto contraste.
- Tecnologia expressa por estrutura, dados, conexões e precisão.
- Negocio expresso por tese, impacto, resultado e decisão.

### Estrutura de um slide padrão

- Uma tese principal.
- Um título direto.
- De três a cinco pontos ou uma visualizacao central.
- Preferencialmente de 35 a 55 palavras visíveis, exceto slides técnicos, jurídicos ou de escopo.
- Uma cor dominante de ênfase.

### Escala operacional para apresentação 16:9

- Titulo: 30 a 36 pt.
- Subtitulo: 18 a 24 pt.
- Corpo: 16 a 20 pt.
- Label ou nota: 9 a 12 pt.
- Margens externas: aproximadamente 0,6 a 0,8 polegada.

### Escala operacional para documento A4

- Titulo principal: 22 a 28 pt.
- Titulo de seção: 15 a 20 pt.
- Corpo: 9,5 a 11,5 pt.
- Nota ou rodapé: 8 a 9 pt.
- Entrelinha do corpo: 1,25 a 1,45.

### Uso de cores por significado

- Laranja: negócio, impacto, ação, decisão e resultado.
- Roxo: tecnologia, IA, dados, arquitetura e inteligência.
- Grafite e preto: estrutura, texto e seriedade.
- Cores suaves: agrupamento, contexto, fundo e informação secundaria.

Essa semântica e operacional e deve ser consistente dentro de uma mesma peça.

### Co-branding

- Preservar as cores e proporções dos logos parceiros e clientes.
- Equalizar peso óptico, não necessariamente largura matemática.
- Usar separador neutro e área livre entre marcas.
- Nao recolorir o logo do cliente para combinar com a paleta Optsolv.
- Quando o material for liderado pelo cliente, usar a Optsolv como assinatura de realizacao, sem disputar protagonismo.

### Evitar

- Slides cheios de texto.
- Gradientes genéricos de IA.
- Neon, brilhos, circuitos decorativos ou robos humanoides como atalho visual.
- Estetica de startup experimental.
- Excesso de cards, sombras e bordas arredondadas.
- Muitos estilos de ícone na mesma peça.
- Ilustracao decorativa sem função editorial.
- Logo em todas as áreas do slide.

## 9. Voz e linguagem

### Tom

- Direto.
- Executivo.
- Claro.
- Maduro.
- Consultivo.
- Seguro sem ser arrogante.
- Tecnico apenas quando necessário.

### Principios editoriais

- Comecar pelo problema de negócio e pelo impacto.
- Explicar tecnologia como capacidade aplicada.
- Preferir evidências, números e exemplos a adjetivos.
- Usar frases curtas e títulos que expressem uma conclusao.
- Reduzir jargao e explicar termos indispensaveis.
- Diferenciar claramente fato, estimativa, hipótese e recomendação.

### Linguagem a evitar

- Revolucionario.
- Disruptivo sem evidência.
- Magico ou autônomo por natureza.
- Solucao completa para tudo.
- Transformacao digital como expressao vazia.
- Promessas absolutas ou resultados não comprovados.

### Tese de comunicacao

A Optsolv compreende o negócio em profundidade, estrutura a decisão, aplica tecnologia e IA ao contexto real da operação e sustenta a evolução do resultado.

## 10. Contrato de uso para LLMs e agentes

Ao receber este sistema, o agente deve:

1. Ler este Markdown para compreender a marca e o critério de decisão.
2. Ler o JSON para obter valores exatos e regras condicionais.
3. Consultar o manifesto para localizar o ativo adequado.
4. Usar arquivos individuais sempre que precisar inserir um logo, símbolo ou grafismo.
5. Usar PDFs agrupados apenas como catalogo visual ou fonte vetorial quando a ferramenta permitir extração segura.
6. Informar quando uma regra utilizada for operacional e não oficial.
7. Nao inventar novas cores, fontes, slogans, logos ou elementos proprietarios.
8. Nao apresentar inferencias como regras aprovadas pela Optsolv.
9. Preservar legibilidade, contraste e sobriedade acima de efeitos visuais.
10. Adaptar densidade e escala ao formato final sem descaracterizar a marca.

## 11. Pendencias técnicas dos pacotes recebidos

- Incluir arquivos instaláveis de Public Sans e Roboto Mono, observando as licencas aplicaveis.
- Exportar os ícones em SVG ou PNG transparente.
- Exportar as ilustrações individualmente em SVG e PNG transparente.
- Criar aliases sem espaços e sem acentos para maior compatibilidade entre ferramentas.
- Remover o arquivo `Conversor de Imagem para ASCII Art..html` do pacote de tipografia, pois não pertence ao sistema de fontes.
- Eliminar metadados `__MACOSX` em futuros pacotes.
- Resolver a duplicidade dos PDFs Pantone. O arquivo com nome correto `Optsolv_Paleta_Pantone.pdf` coincide com os valores do PDF RGB; o arquivo `Optsovl_Paleta_Pantone.pdf` apresenta uma fórmula CMYK diferente para a cor `#9E8477`.
- Se desejado, formalizar com a agência as áreas de proteção e os tamanhos mínimos atualmente tratados como regras operacionais.

## 12. Regra final

O design deve servir a clareza da decisão e a percepção de valor. Em uma peça Optsolv, sofisticação vem de hierarquia, precisão, espaço e coerência, e não de excesso visual.
