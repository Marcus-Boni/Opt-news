# Opt News — sistema visual (identidade Optsolv)

> Fonte de verdade do visual do `apps/web`. Tokens em `apps/web/src/index.css`; componentes shadcn/ui em
> `apps/web/src/components/ui`; blocos do app em `apps/web/src/ui.tsx`. Superfície **Operate/Read**: um app de trabalho
> com leitura editorial — quem usa precisa saber onde tudo está antes de notar o estilo.

## Fontes da marca

A marca vem de `docs/marca/`: `optsolv_brand_system_master.md` (regras), `optsolv_brand_system_v1.json` (tokens),
`optsolv_brand_assets_manifest.json` (ativos) e `sobre-optsolv.json` (posicionamento e voz; interno, fora do repositório público). Ordem quando houver
conflito: ativo oficial → valor oficial de cor/tipografia → regra do Brand System → este documento. Regras marcadas
como **operacionais** no Brand System (proporção de cor, área livre, tamanhos mínimos) são provisórias da Optsolv,
não da agência. Este app não inventa cores, fontes, slogans ou símbolos: tons extras abaixo (fundos, estados, modo
escuro) são de interface e ficam marcados como tal.

## Identidade

- **Logo:** vetores oficiais (`Optsolv_Logo_RGB.pdf`) em `src/components/brand/optsolv.tsx`, sempre em
  `currentColor`: `OptsolvSymbol`, `OptsolvWordmark` e `OptsolvTagline` (horizontal com a assinatura). Fundo claro:
  versão laranja ou preta. Fundo escuro: versão **claro quente** (`text-warm-light`) ou branca para o logo completo;
  o símbolo isolado fica laranja em toda a interface (navegação e favicon), para um único padrão de marca. Mínimos: símbolo 24px,
  logo 120px, logo com assinatura 240px. Sem sombra, contorno, distorção ou recoloração.
- **Assinatura "tecnologia que impulsiona":** só como parte do logo oficial (`OptsolvTagline`); nunca redigitada.
- **Produto:** "Opt News" em Public Sans Bold, ao lado do símbolo (laranja, igual em toda a interface).
- **Movimento-assinatura:** o chevron do símbolo. A cadeia notícia → pauta → meetup → insight é desenhada com
  chevrons (`ChevronTrail`, exportado como `Trail` em `ui.tsx`); ao chegar, um impulso laranja percorre a cadeia.
- **Grafismos oficiais:** no máximo um por tela, discreto (hoje só no painel do login, `public/brand/`). Ícones de
  interface são lucide; os ícones oficiais (PNG com fundo branco) não entram no app nem se misturam com lucide.

## Cor

Semântica da marca: **laranja = negócio, ação, decisão, resultado**; **roxo = tecnologia, IA, dados**; grafite e
preto = estrutura e texto; tons suaves = apoio. Proporção (regra operacional): 70–85% neutro, 10–20% de uma ênfase,
até 10% de apoio; laranja vivo e roxo vivo nunca competem na mesma região.

| Papel | Token (classe) | Claro | Escuro | Origem | Uso |
|---|---|---|---|---|---|
| Sinal de marca | `bg-brand` / `text-brand` | #FF4800 | #FF4800 | oficial (laranja vivo) | símbolo, ícone ativo, foco, seleção, chevrons, dados. **Nunca leva texto** |
| Ação preenchida | `bg-primary` / `text-primary-foreground` | #B22D09 / #FFFFFF | #C73D1B / #FFFFFF | oficial (laranja escuro) | botão principal e superfícies laranja com texto (6,4:1 e 5,1:1) |
| Texto laranja | `text-brand-text` | #B22D09 | #FF855A | oficial (laranja escuro / pêssego) | links e texto laranja (≥5,6:1) |
| Profundidade | `bg-depth` / `text-depth-foreground` | #271284 / #F1F1E3 | idem | oficial (roxo escuro / claro quente) | campo de conteúdo feito por IA (panorama do dia), 12:1 |
| IA | `text-ai` / `bg-ai-soft` | #743DFF / #EFE9FF | #A588FF / #231B3D | oficial (roxo vivo / lavanda) + fundo de interface | **só** para marcar texto gerado por máquina |
| Navegação | `bg-sidebar` | #353030 | #171414 | oficial (grafite) / interface | barra lateral |
| Logo em fundo escuro | `text-warm-light` | #F1F1E3 | #F1F1E3 | oficial (claro quente) | logo completo com assinatura no login |
| Realce suave | `bg-brand-soft` | #FFE8DC | #33190D | interface | seleção, hover de destaque, badge `brand` |
| Fundo / superfície | `bg-background` / `bg-card` | #FAF8F5 / #FFFFFF | #1D1919 / #252020 (grafite quente, nunca preto puro) | interface | tela, cartões |
| Texto | `text-foreground` / `text-muted-foreground` | #1B1514 / #66594F | #F1ECE7 / #A89B94 | interface | corpo, metadados (≥5,7:1) |
| Gráficos | `chart-1..5` | #FF4800 #743DFF #9E8477 #FF855A #271284 | idem | oficial | séries |
| Estados | `success`, `warning`, `destructive` | | | interface | só onde carregam significado |

**Regra do laranja:** é a cor de ação, por isso aparece em pontos com função, nunca como parede: no máximo **um**
botão primário por região, item ativo da navegação, foco, seleção e marcas de dado. Nada de barra lateral laranja,
seção inteira laranja ou texto branco sobre laranja. O panorama do dia é texto de IA, por isso fica no roxo escuro, e
seu único laranja é a ação "Ler o briefing completo". Em gráficos, as etapas ficam neutras e o laranja marca só o
resultado (no funil da curadoria, "Publicados"). Abas e seletores ativos são neutros (`bg-foreground`).

## Tipografia

Famílias oficiais, auto-hospedadas via Fontsource: **Public Sans** para tudo (400 corpo, 600 subtítulo e ênfase,
700 títulos e números-chave) e **Roboto Mono** com moderação, só para rótulos curtos e microdados: pontuação
editorial, versões de política/modelo, atalhos de teclado. Nunca mono em parágrafo. Fallback: Arial, Helvetica.
- Título de página: 28–32px, bold, tracking −0.03em. Manchete de notícia (detalhe): 36–44px, bold, −0.03em.
- Títulos de seção: 16px semibold. Corpo: 15–16px, leading 1.55, medida ≤ 70ch. Metadados: 12–13px.
- Sem rótulos minúsculos em caixa alta espaçada, sem eyebrow acima de título.
- Números: `tabular` (`font-variant-numeric: tabular-nums`) em contagens, notas e datas lado a lado.

## Componentes

shadcn/ui (Radix, estilo nova). Regras: `Button` com `data-icon` nos ícones; formulários com `FieldGroup` +
`Field` + `FieldLabel` + `FieldDescription`/`FieldError`; `Select` com `SelectGroup`; opções 2–7 em `ToggleGroup`;
avisos com `Alert`; vazio com `Empty`; carregamento com `Skeleton`; estados com `Badge`; `gap-*` em vez de
`space-*`; `size-*`; sem `dark:` manual (tokens já trocam de tema); classes condicionais com `cn()`.
Controles têm a altura do botão (36px: `Input`, `Select`, `InputGroup`, `Toggle`, abas). `CommandDialog` envolve o
conteúdo em `Command`. Textos de leitor de tela dos componentes estão em pt-BR ("Fechar", "Carregando").

Código de terceiros (`components/ui`, `components/charts`, `components/kokonutui`, `SplitText`, `CountUp`,
`styles/shadcn-base.css`) fica perto do original para facilitar atualização: o Biome não o formata e desliga só
regras de estilo e a11y que o upstream contraria (override em `biome.json`); `noExplicitAny` e
`noDangerouslySetInnerHtml` continuam valendo.

Blocos do app (`src/ui.tsx`): `Page` (título, subtítulo, ações, trilho lateral ≥1280px), `Section`, `Async`
(erro/carregando/vazio), `Pill` (Badge semântico), `AiTag`, `ProblemNote` (erro de ação, 409 com recarregar),
`Notice`, `Empty`, `Trail` (assinatura), `Facts`/`Fact`, `Time`, `ExternalLink`, `Icon` (lucide).

Superfícies: cartão = `bg-card` + borda 1px (`border`) **ou** sombra, nunca os dois; raio 10–12px; sem cartões
aninhados; sem grade de cartões iguais com ícone em círculo colorido; sem gradiente, brilho, vidro ou emoji.

## Movimento

Uma gramática, uma função por ferramenta, tudo reduzido sob `prefers-reduced-motion` (`MotionConfig
reducedMotion="user"` na raiz, `reducedMotion()` em `src/motion.ts` e `@media (prefers-reduced-motion: no-preference)`
no CSS). Conteúdo sempre visível por padrão: animação só descreve de onde o elemento vem. Curva única expo-out
(`--ease-out-expo` / `EASE_OUT`); nunca `transition: all`, nunca elástico. Regra anticonflito: **um motor por
elemento**. CSS e Web Animations movem pelas propriedades independentes `translate`/`scale`; GSAP e motion movem por
`transform`. Quando duas coisas precisam mover o mesmo bloco (chegada e ímã), cada uma ganha seu invólucro.
- **CSS (`index.css`):** chegada da página (`data-reveal`: 8px, 500ms, cascata de 50ms entre irmãos via
  `sibling-index()`, teto de 300ms; roda quando o bloco monta, inclusive depois que os dados chegam, e nunca se
  repete); linhas de notícia que sobem com a rolagem (`data-row-in`, `animation-timeline: view()`; sem suporte, só
  aparecem); trilho de leitura laranja sob o cabeçalho nas páginas de leitura (notícia, acontecimento, briefing,
  meetup, insight; `animation-timeline: scroll(root)`, vazio quando a página não rola); estados declarativos (persona
  escolhida no login).
- **Web Animations (`el.animate`):** retornos curtos de controle: voto, comentário novo, símbolo do estado vazio,
  chevron do pilar sob o ponteiro na apresentação.
- **motion:** indicador ativo da navegação (`layoutId`), `CountUp` (React Bits), `SmoothTab` (Kokonut UI) e
  `FunnelChart` (bklit).
- **GSAP:** coreografia de rolagem: impulso nos chevrons (`Trail`), SplitText do panorama e do herói da apresentação,
  marca d'água do símbolo no panorama, blocos da apresentação que chegam ao entrar na tela (`data-inview`,
  `useScrollReveal`), botões que inclinam para o ponteiro (`useMagnetic`, só na apresentação).
- **Lenis:** rolagem suave do documento, movida pelo ticker do GSAP (um só laço de quadros com o ScrollTrigger),
  parada enquanto um modal trava a rolagem e realinhada à posição do `ScrollRestoration` a cada rota. Como as
  páginas buscam dados depois de montar, voltar reaplica a posição salva conforme a página cresce
  (`useSettleRestoredScroll`, até 3s ou até a pessoa rolar).
- **Troca de tema (momento-assinatura):** View Transition em que o tema novo entra da esquerda para a direita atrás
  de uma frente em chevron (`clip-path`, 700ms). Sem suporte ou com movimento reduzido, troca na hora.

## Superfícies de apresentação

A landing (`/sobre`, pública) e o login (`/entrar`) são as duas telas de marca do produto; o resto do app é
superfície de trabalho. Regras só delas:
- **Um grafismo protagonista:** o campo de pontos do símbolo (`components/chevron-field.tsx`, three.js carregado só
  nessas telas). É o desenho oficial amostrado em pontos laranja sobre o grafite: condensa ao chegar, respira e
  cede ao ponteiro. Não é um símbolo novo (Brand System §7) e nunca leva texto por cima. Sob
  `prefers-reduced-motion` fica montado e parado; sem WebGL, entra o SVG do símbolo.
- **Fundo escuro forçado** (classe `dark` na seção) no herói, no painel do login e no rodapé, porque é o chão do
  logo em claro quente. As seções de leitura seguem o tema do app.
- **Tipografia maior:** título do herói 40–68px, títulos de seção 32–40px, mesmo tracking −0.03em. Sem eyebrow,
  sem caixa alta, sem gradiente, brilho ou vidro.
- **Movimento:** o título do herói sobe linha a linha por trás de uma máscara (SplitText com `autoSplit`) e o resto
  chega em cascata; cada bloco abaixo chega quando entra na tela (`useScrollReveal`, uma vez); ao rolar para fora do
  herói o texto sobe e some e o campo de pontos se desfaz de novo (`scatter`, lido a cada quadro); impulso laranja nos
  conectores dos pilares (ScrollTrigger, uma vez) e, ao passar o ponteiro, o chevron do pilar recebe o mesmo empurrão
  (Web Animations); faixa do pipeline fixada e percorrida pela rolagem (`pin` + `scrub` só ≥1024px) com trilho e
  contador "03 / 06"; réguas dos números desenham da esquerda e os números contam (`CountUp`); os botões principais
  inclinam para o ponteiro fino (`useMagnetic`); uma barra fixa com marca e "Entrar" desce quando o herói sai da
  tela (inerte enquanto escondida); Lenis sincronizado com o ScrollTrigger. No login, a persona escolhida avança e as
  outras recuam enquanto a sessão abre (transição CSS do estado). Tudo desligado sob movimento reduzido: a página só lê de cima para
  baixo, o pipeline fica em coluna também no desktop e a barra fixa não aparece.
- **Números:** só propriedades do sistema (2 notas, 72 h, 1 fonte por notícia), nunca resultados ou métricas.

## Feedback e ajuda

- **Toasts (Sonner):** só para o resultado de uma ação ("Pauta aberta para votação", "Alterações salvas"), com
  ação quando há próximo passo ("Ver em Meetups"). Superfície de cartão, ícone na cor semântica, ação no laranja de
  ação. Erros que pedem correção ficam **inline** junto do campo (`ProblemNote`), não em toast.
- **Tooltips:** um padrão só, `Hint` em `ui.tsx` (atraso 300ms, acima, máx. 16rem): data exata nos tempos
  relativos, o significado da marca IA e da pontuação, rótulo de botões só de ícone. Nunca é o único lugar de uma
  informação.
- **Campos:** todo campo tem rótulo visível e placeholder com exemplo terminando em "…". Data e hora usam
  `DateTimePicker` (Popover + Calendar + Select, pt-BR, horário de Brasília), nunca `input type="datetime-local"`.

## Acessibilidade

WCAG 2.2 AA: contraste verificado por script (todos os pares ≥ 4,5:1), foco visível laranja em tudo, navegação por
teclado, `aria-live` em resultados assíncronos, landmarks e pular para o conteúdo, alvo de toque ≥ 36px.

## Voz da interface

Segue `docs/marca/sobre-optsolv.json`: direta, executiva, clara, sem jargão desnecessário. Nada de
"revolucionário", "disruptivo", "mágico" ou IA vaga: toda menção a IA diz o que ela fez (ex.: "Escrito por IA a partir
das 5 notícias listadas"). Fato, estimativa e geração por máquina ficam sempre distinguíveis (marca IA, pontuação
"indica prioridade, não certeza", proveniência). Isso espelha dois fundamentos do Método Optsolv que o produto já
pratica: curadoria humana sobre o que a IA produz e rastreabilidade de cada decisão até sua evidência. Escrever
"Optsolv" (nunca "OptSolv"); "optsolv" minúsculo só no próprio logo.
