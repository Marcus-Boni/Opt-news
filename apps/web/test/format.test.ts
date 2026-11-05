import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dayHeading,
  formatScore,
  humanReason,
  isoToSaoPauloInput,
  relativeTime,
  saoPauloInputToIso,
} from "../src/format.ts";

test("datetime-local is read as São Paulo wall time and sent as UTC", () => {
  assert.equal(saoPauloInputToIso("2026-11-20T19:30"), "2026-11-20T22:30:00.000Z");
  assert.equal(saoPauloInputToIso("2026-12-31T23:00"), "2027-01-01T02:00:00.000Z");
  assert.equal(isoToSaoPauloInput(Date.parse("2026-11-20T22:30:00.000Z")), "2026-11-20T19:30");
});

test("relative time in pt-BR", () => {
  const now = Date.parse("2026-11-02T12:00:00Z");
  assert.equal(relativeTime("2026-11-02T09:00:00Z", now), "há 3 horas");
  assert.equal(relativeTime("2026-11-12T12:00:00Z", now), "em 10 dias");
  assert.equal(relativeTime("2026-11-02T11:59:40Z", now), "agora");
});

test("pipeline reasons read in the team's words", () => {
  assert.equal(
    humanReason("saída de score_a fora do formato esperado"),
    "O avaliador A devolveu uma resposta fora do formato esperado.",
  );
  assert.equal(humanReason("pré-filtro: fixture"), "Barrada no pré-filtro: dados de teste.");
  assert.equal(humanReason("pré-filtro: sem relação com IA"), "Barrada no pré-filtro: sem relação com IA.");
  assert.equal(humanReason("avaliações divergentes (88 e 40)"), "Os dois avaliadores discordaram (88 e 40).");
  assert.equal(humanReason("sem data de publicação confiável"), "Sem data de publicação confiável");
});

test("the editorial score is a whole number everywhere", () => {
  assert.equal(formatScore(77.5), "78");
  assert.equal(formatScore(64), "64");
});

test("feed day headings follow the São Paulo calendar", () => {
  const now = Date.parse("2026-11-05T13:00:00Z"); // 10:00 in São Paulo
  assert.equal(dayHeading("2026-11-05T03:30:00Z", now), "Hoje"); // 00:30 local, same day
  assert.equal(dayHeading("2026-11-05T02:30:00Z", now), "Ontem"); // 23:30 local on the 4th
  assert.equal(dayHeading("2026-11-02T15:00:00Z", now), "Segunda-feira, 2 de novembro");
});
