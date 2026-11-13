// The seven acts of the Jornada, in order. Every sentence states a property of the system (README, docs/01-prd.md),
// never a result or a metric.

export interface Chapter {
  /** Anchor in the page. */
  id: string;
  /** Short name on the chapter rail. */
  label: string;
  title: string;
  text: string;
  /** Where the caption sits on a wide screen; the shot keeps the body on the other side. */
  place: "bottom" | "left" | "right";
}

export const CHAPTERS: readonly Chapter[] = [
  {
    id: "ruido",
    label: "Ruído",
    title: "A jornada de uma notícia",
    text: "A web publica mais do que qualquer time consegue ler: acompanhe uma manchete do ruído até virar conhecimento da Optsolv.",
    place: "bottom",
  },
  {
    id: "coleta",
    label: "Coleta",
    title: "Primeiro, a coleta.",
    text: "Feeds oficiais e de imprensa passam por um coletor que recusa redes internas e só busca o que mudou. O que tem mais de 72 horas na primeira leitura é arquivado sem custo.",
    place: "right",
  },
  {
    id: "notas",
    label: "Duas notas",
    title: "O ruído sai. Duas notas ficam.",
    text: "Ofertas, eventos e repetições caem no pré-filtro. O que resta recebe duas notas independentes; quando elas divergem muito, um curador decide.",
    place: "left",
  },
  {
    id: "redacao",
    label: "Redação",
    title: "A IA escreve. E assina.",
    text: "Título e resumo saem em português, escritos pelo modelo a partir do trecho que a fonte publicou. Todo texto de máquina leva a marca de IA, e nesta página o roxo é só dela.",
    place: "right",
  },
  {
    id: "curadoria",
    label: "Curadoria",
    title: "Pessoas decidem.",
    text: "Curadores publicam, retiram e corrigem. Cada decisão fica auditada, com quem decidiu e por quê.",
    place: "left",
  },
  {
    id: "cadeia",
    label: "Cadeia",
    title: "Publicada, a notícia começa a render.",
    text: "Quem leu comenta e propõe uma pauta. A pauta mais votada vira meetup. O que o meetup ensinou vira insight, ligado à notícia que o originou.",
    place: "bottom",
  },
  {
    id: "entrar",
    label: "Opt News",
    title: "Uma notícia só vale o que o time faz com ela.",
    text: "O Opt News guarda o caminho inteiro, da fonte ao aprendizado, para o próximo projeto começar de onde este parou.",
    place: "left",
  },
];

export const CHAIN_LABELS = ["Notícia", "Pauta", "Meetup", "Insight"] as const;
