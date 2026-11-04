// pt-BR wording and America/Sao_Paulo time for everything the API sends as codes or UTC instants.
export const TZ = "America/Sao_Paulo";

const fullFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" });
const dayFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
const shortDayFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  weekday: "short",
  day: "2-digit",
  month: "short",
});
const timeFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const relFmt = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export const formatDateTime = (iso: string) => fullFmt.format(new Date(iso));
export const formatDay = (iso: string | number) => dayFmt.format(new Date(iso));
export const formatShortDay = (iso: string) => shortDayFmt.format(new Date(iso));
export const formatTime = (iso: string) => timeFmt.format(new Date(iso));

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

export function relativeTime(iso: string, now = Date.now()): string {
  const seconds = (Date.parse(iso) - now) / 1000;
  for (const [unit, size] of UNITS)
    if (Math.abs(seconds) >= size) return relFmt.format(Math.round(seconds / size), unit);
  return "agora";
}

/** Wall-clock fields of an instant in São Paulo. */
function saoPauloFields(ms: number) {
  const p = Object.fromEntries(partsFmt.formatToParts(ms).map((x) => [x.type, x.value]));
  return { y: Number(p.year), mo: Number(p.month), d: Number(p.day), h: Number(p.hour), mi: Number(p.minute) };
}

/** `<input type="datetime-local">` value read as São Paulo wall time → UTC ISO instant for the API. */
export function saoPauloInputToIso(local: string): string {
  const asUtc = Date.parse(`${local}:00Z`);
  const f = saoPauloFields(asUtc);
  const offset = Date.UTC(f.y, f.mo - 1, f.d, f.h, f.mi) - asUtc;
  return new Date(asUtc - offset).toISOString();
}

/** An instant as a São Paulo `datetime-local` value (for `min` and defaults). */
export function isoToSaoPauloInput(ms: number): string {
  const f = saoPauloFields(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${f.y}-${pad(f.mo)}-${pad(f.d)}T${pad(f.h)}:${pad(f.mi)}`;
}

export const ROLE_LABEL: Record<string, string> = {
  visitor: "Visitante",
  member: "Membro",
  organizer: "Organização",
  curator: "Curadoria",
  admin: "Administração",
};

export const PROPOSAL_STATUS: Record<string, string> = {
  open: "Em votação",
  selected: "Selecionada",
  rejected: "Rejeitada",
  expired: "Expirada",
  withdrawn: "Retirada",
};

export const SESSION_STATE: Record<string, string> = {
  draft: "Rascunho",
  scheduled: "Agendada",
  completed: "Realizada",
  documented: "Documentada",
  cancelled: "Cancelada",
};

export const INSIGHT_STATUS: Record<string, string> = {
  proposed: "Proposto",
  reviewing: "Em revisão",
  accepted: "Aceito",
  dismissed: "Descartado",
  archived: "Arquivado",
};

export const RELATION_LABEL: Record<string, string> = {
  inspired_by: "Inspirado em",
  discussed_in: "Discutido em",
  evidence: "Evidência",
  related: "Relacionado",
};

export const REF_LABEL: Record<string, string> = {
  story: "Notícia",
  meetup: "Meetup",
  proposal: "Pauta",
  insight: "Insight",
};

export const ARTIFACT_KIND: Record<string, string> = {
  slides: "Slides",
  document: "Documento",
  recording: "Gravação",
  link: "Link",
};

/** Source tiers, shown on Administração and Curadoria. */
export const TIER: Record<string, string> = { T1: "Oficial (1ª mão)", T1_5: "Conta oficial", T2: "Mídia e pessoas" };

/** Pipeline ids are internal; readers see a name. */
export const PROVIDER_LABEL: Record<string, string> = { optnews: "Curadoria automática Opt News" };

export const LANGUAGE: Record<string, string> = {
  "pt-BR": "Português (Brasil)",
  pt: "Português",
  en: "Inglês",
  es: "Espanhol",
};

/** Where a referenced object lives in the web app. Proposals have no page of their own (no getProposal endpoint). */
export function hrefFor(type: string, id: string): string {
  if (type === "story") return `/noticias/${id}`;
  if (type === "meetup") return `/meetups/${id}`;
  if (type === "insight") return `/conhecimento/${id}`;
  return `/meetups?aba=propostas#pauta-${id}`;
}

const PIPELINE_STEP: Record<string, string> = {
  prefilter: "O pré-filtro",
  score_a: "O avaliador A",
  score_b: "O avaliador B",
  write: "A redação",
  group: "O agrupamento",
  briefing: "O panorama",
};
const PREFILTER_REASON: Record<string, string> = { fixture: "dados de teste" };

/** Pipeline reasons arrive in the engine's words (step ids, raw codes); curators read them in the team's words. */
export function humanReason(reason: string): string {
  const format = /^saída de (\w+) fora do formato esperado$/.exec(reason);
  if (format?.[1]) return `${PIPELINE_STEP[format[1]] ?? "Uma etapa"} devolveu uma resposta fora do formato esperado.`;
  const pre = /^pré-filtro: (.+)$/.exec(reason);
  if (pre?.[1]) return `Barrada no pré-filtro: ${PREFILTER_REASON[pre[1]] ?? pre[1]}.`;
  const split = /^avaliações divergentes \((\d+) e (\d+)\)$/.exec(reason);
  if (split) return `Os dois avaliadores discordaram (${split[1]} e ${split[2]}).`;
  return reason.charAt(0).toUpperCase() + reason.slice(1);
}

/** The editorial score, the same everywhere: a whole number from 0 to 100. */
export const formatScore = (score: number) => String(Math.round(score));

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
