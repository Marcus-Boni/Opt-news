// How much of each sentence of an AI summary can be found, word for word, in what the source itself published (headline
// and feed excerpt). A reading aid, not fact-checking: it shows where the summary repeats the source and where it adds.
// shortcut: lexical overlap with a 5-letter stem; upgrade to model-produced citations when the pipeline emits them.

const STOP = new Set(
  (
    "para pela pelo pelos pelas como mais mas sobre entre ainda quando onde porque este esta isso isto essa esse " +
    "estes estas essas esses aquele aquela seus suas dele dela deles delas foram seria sera sendo cada todo toda " +
    "todos todas outro outra outros outras mesmo mesma muito muita pode podem deve devem apenas tambem nosso nossa " +
    "the and that this with from into over have been were will would could should their there which while about " +
    "after before than them they your what when where also more most such only just very"
  ).split(" "),
);

/** Lowercase, accents removed. */
const fold = (w: string) =>
  w
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** The comparison key of a word, or null when it carries no content (short words, stop words). */
export function keyOf(word: string): string | null {
  const w = fold(word.replace(/[^\p{L}\p{N}]/gu, ""));
  if (/^\d+$/.test(w)) return w;
  if (w.length < 4 || STOP.has(w)) return null;
  return w.slice(0, 5);
}

export const keysOf = (text: string) =>
  new Set(
    text
      .split(/\s+/)
      .map(keyOf)
      .filter((k): k is string => k !== null),
  );

export interface Sentence {
  text: string;
  /** Content-word keys of the sentence. */
  keys: Set<string>;
  /** How many of them the source text also has. */
  found: number;
  /** found / keys (0..1); 1 when the sentence has no content words. */
  ratio: number;
}

export function sentencesOf(summary: string, source: string): Sentence[] {
  const known = keysOf(source);
  return summary
    .split(/(?<=[.!?…])\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text) => {
      const keys = keysOf(text);
      const found = [...keys].filter((k) => known.has(k)).length;
      return { text, keys, found, ratio: keys.size === 0 ? 1 : found / keys.size };
    });
}
