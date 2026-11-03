import assert from "node:assert/strict";
import { test } from "node:test";
import { isoToSaoPauloInput, relativeTime, saoPauloInputToIso } from "../src/format.ts";

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
