# Como foi feita a página de apresentação do Opt News

Página: https://opt-news.vercel.app/sobre

## A ideia em uma frase

A página conta **a jornada de uma notícia** num único "plano-sequência", como um filme sem cortes: ao rolar, a câmera atravessa sete atos, e uma nuvem de milhares de pontos (as notícias do dia) muda de forma em cada um, até virar o símbolo da Optsolv no final.

## Os sete atos

| Ato | O que a nuvem de pontos vira | O que o texto diz |
|---|---|---|
| 1. Ruído | uma espiral lenta, alguns pontos já se destacando | a web publica mais do que o time consegue ler |
| 2. Coleta | nove "correntes" sugadas para um funil | só se busca o que mudou nas fontes |
| 3. Duas notas | metade dos pontos cai; duas órbitas leem o resto | pré-filtro e duas notas independentes |
| 4. Redação | uma casca roxa em volta do "núcleo" do modelo | a IA escreve, e o roxo é a cor exclusiva da IA |
| 5. Curadoria | o desenho de um card de notícia | pessoas publicam ou retiram (dá para clicar) |
| 6. Cadeia | quatro chevrons oficiais ligados: notícia → pauta → meetup → insight | a notícia vira conversa e conhecimento |
| 7. Opt News | o símbolo oficial da Optsolv | o caminho inteiro fica guardado |

O segredo do efeito "mágico": **é sempre o mesmo conjunto de pontos.** Cada ponto tem um lugar em cada uma das sete figuras, e a placa de vídeo só calcula o caminho entre um lugar e outro. Por isso a transição parece contínua, e não uma troca de imagem.

## Para quem não é dev: os princípios por trás

- **História antes do efeito.** Cada ato explica uma propriedade real do sistema; nenhum número inventado. A animação serve à mensagem.
- **Marca de verdade.** O símbolo e os chevrons são amostrados dos arquivos oficiais da marca, não redesenhados.
- **Texto é texto.** Títulos e legendas são HTML de verdade sobre a cena, e não pixels do 3D: dá para ler, selecionar, traduzir e usar leitor de tela.
- **Respeita quem não quer movimento.** Com "reduzir movimento" ligado no sistema, a página vira um quadro parado por ato. Sem WebGL, o texto continua legível sobre um fundo estático.
- **Não derruba o computador de ninguém.** A qualidade baixa sozinha em máquina lenta, e a animação para quando a aba fica escondida.

## Para devs: como funciona

**Stack:** React, [three.js](https://threejs.org) (3D), [GSAP](https://gsap.com) (ScrollTrigger, SplitText, ScrambleText) e [Lenis](https://lenis.darkroom.engineering) (rolagem suave). Nenhuma biblioteca nova: tudo já estava no projeto.

**Arquitetura (`apps/web/src/journey/`):**

| Arquivo | Papel |
|---|---|
| `chapters.ts` | os sete atos: título, texto e lado da tela da legenda |
| `formations.ts` | as sete figuras. Cada uma é um `Float32Array` com x, y, z e tom por ponto; o ponto *i* é o mesmo em todas |
| `svg-path.ts` | lê os paths SVG oficiais da marca (M, L, C, Z), transforma em polígonos e sorteia pontos dentro deles |
| `shaders.ts` | GLSL escrito para a página: ruído, um campo de fluxo que faz os pontos "nadarem", e os programas do corpo, do núcleo, da trilha de chevrons, do fundo e da lente final |
| `stage.ts` | a cena: câmera numa rota, pós-processamento (bloom), qualidade adaptativa, pausa com a aba oculta |
| `pages/journey.tsx` | a página: rolagem → "em que ato e quanto dele" → a cena desenha |

**O truque do morph:** as sete figuras sobem para a GPU como atributos do mesmo `BufferGeometry`. O vertex shader recebe o ato e o progresso e interpola a posição do ponto entre a figura atual e a próxima, com atraso aleatório por ponto (cada um tem 4 números de "personalidade": atraso, direção, cor e tamanho). Assim a nuvem "escorre" de uma forma para a outra em vez de deslizar em bloco.

**Divisão de responsabilidades:** a página manda na rolagem e só informa `{ ato, t }`; a cena manda em cada quadro. Por isso o React não re-renderiza durante a animação.

**Qualidade adaptativa:** três níveis (44 mil, 28 mil e 16 mil pontos, com ou sem bloom). O tempo médio de quadro é medido depois do primeiro segundo, e a cena desce de nível sozinha se estiver pesada.

**Legendas:** cada título entra com SplitText e ScrambleText quando o ato "chega" e sai enquanto a nuvem viaja. A legenda nunca disputa a atenção com a transição.

**Carregamento:** three.js e a cena carregam sob demanda (`lazy`), só nesta página, depois que o texto já está legível.

**Testes:** as figuras são funções puras e determinísticas (mesma semente, mesmos pontos), então rodam em `node:test` sem navegador.

## Como foi feita com IA

A página foi construída com o **Claude Code** (modelo Claude Fable 5.2) dentro do repositório, num ciclo iterativo:

1. **Pedido com intenção, não com receita.** O pedido descreveu o resultado esperado (profissional, moderno, com impacto e fiel à marca), não a técnica. Conceito, figuras e ritmo saíram da conversa com o modelo.
2. **Contexto do projeto.** O Claude leu o PRD, o `DESIGN.md` (tokens, tipografia, cores, a regra do roxo exclusivo da IA) e o kit oficial da marca. Por isso o texto descreve o sistema real e o símbolo é o oficial.
3. **Ver para corrigir.** Animação 3D não se avalia lendo código: o Claude abria a página num navegador com placa de vídeo real (via Playwright), capturava cada ato e corrigia o que via, como enquadramento, legibilidade e ritmo.
4. **Revisão de design.** Passadas de crítica (hierarquia, contraste, movimento reduzido, mobile) antes de considerar pronto.

**Dica para quem quiser repetir:** dê ao modelo (1) a história que a página deve contar, (2) o guia de marca e de design do projeto e (3) uma forma de *ver* o resultado. O terceiro item é o que separa um efeito genérico de um efeito com acabamento.
