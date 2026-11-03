// Pure rules: URL guard (SSRF), authorization matrix and the engine adapter (anti-corruption layer).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { feedXml, ITEMS } from "../../../tools/fixtures/feeds.ts";
import { cleanText } from "../src/content/publish.ts";
import { parseFeed, plainText } from "../src/intelligence/feeds.ts";
import { OUTPUTS } from "../src/intelligence/model.ts";
import { assertPublicUrl, canonicalUrl, isBlockedAddress } from "../src/content/url-guard.ts";
import { type Actor, can } from "../src/identity/policy.ts";
import { fakeLookup } from "./helpers.ts";

describe("url guard", () => {
  test("canonical form drops fragment, tracking params, default port and trailing slash", () => {
    assert.equal(
      canonicalUrl("HTTPS://Atlas.Example.com:443/blog/a/?utm_source=x&b=2&a=1#topo").toString(),
      "https://atlas.example.com/blog/a?a=1&b=2",
    );
  });

  for (const bad of [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "ftp://example.com/x",
    "https://user:pw@example.com/",
    "http://localhost/admin",
    "http://127.0.0.1/",
    "http://2130706433/",
    "http://0x7f.1/",
    "http://10.0.0.8/",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://intranet/",
    "http://servidor.corp/",
    "https://example.com:8443/",
    "nota uma url",
  ]) {
    test(`rejects ${bad}`, () => assert.throws(() => canonicalUrl(bad), { status: 422 }));
  }

  test("blocked address ranges", () => {
    for (const ip of ["10.1.1.1", "172.20.0.1", "192.168.0.10", "100.64.0.1", "fe80::1", "fd00::1", "::ffff:10.0.0.1"])
      assert.ok(isBlockedAddress(ip), ip);
    for (const ip of ["93.184.216.34", "2606:4700:4700::1111"]) assert.ok(!isBlockedAddress(ip), ip);
  });

  test("a public name resolving to a private address is rejected (DNS check)", async () => {
    await assert.rejects(assertPublicUrl("https://wiki.internal.example.com/page", fakeLookup), { status: 422 });
    assert.equal((await assertPublicUrl("https://news.example.org/a", fakeLookup)).hostname, "news.example.org");
  });
});

describe("authorization policy (docs/09 RBAC)", () => {
  const actor = (...roles: Actor["roles"]): Actor => ({ id: "x", displayName: "x", roles });
  const matrix: [Actor["roles"], Record<"read" | "contribute" | "organize" | "moderate" | "administer", boolean>][] = [
    [["visitor"], { read: true, contribute: false, organize: false, moderate: false, administer: false }],
    [["member"], { read: true, contribute: true, organize: false, moderate: false, administer: false }],
    [["member", "organizer"], { read: true, contribute: true, organize: true, moderate: false, administer: false }],
    [["member", "curator"], { read: true, contribute: true, organize: false, moderate: true, administer: false }],
    [["member", "admin"], { read: true, contribute: true, organize: true, moderate: true, administer: true }],
    [[], { read: false, contribute: false, organize: false, moderate: false, administer: false }],
  ];
  for (const [roles, expected] of matrix) {
    test(`roles [${roles.join(", ") || "nenhum"}]`, () => {
      for (const [capability, allowed] of Object.entries(expected)) {
        assert.equal(can(actor(...roles), capability as keyof typeof expected), allowed, capability);
      }
    });
  }
});

describe("feed parsing (RSS 2.0 and Atom)", () => {
  const now = Date.parse("2026-11-02T12:00:00Z");

  test("RSS: entities decoded, title markup kept literal, excerpt stripped to text, missing date is null", () => {
    const entries = parseFeed(feedXml("segfront", ITEMS, now));
    const xss = entries.find((e) => e.guid === "fx-xss-title");
    assert.equal(
      xss?.title,
      "Biblioteca de UI corrige falha <script>alert('xss')</script> em renderização de markdown",
    );
    assert.ok(xss?.excerpt && !xss.excerpt.includes("<img"));
    assert.equal(xss?.publishedAt, new Date(now - 30 * 3_600_000).toISOString());
    assert.equal(parseFeed(feedXml("radar-ia", ITEMS, now)).find((e) => e.guid === "fx-undated")?.publishedAt, null);
  });

  test("Atom: alternate link, id as guid", () => {
    const rag = parseFeed(feedXml("radar-ia", ITEMS, now)).find((e) => e.guid === "fx-rag-study");
    assert.equal(rag?.link, "https://dados-ia.example.net/estudos/rag-hibrido-vs-vetorial");
  });

  test("a single-entry feed is still a list; non-feeds are refused", () => {
    const one = `<rss version="2.0"><channel><item><guid>a</guid><title>T</title><link>https://x.example.org/a</link></item></channel></rss>`;
    assert.equal(parseFeed(one).length, 1);
    assert.throws(() => parseFeed("<html><body>oi</body></html>"), /não é RSS nem Atom/);
  });

  test("plain text: scripts and tags removed, length capped", () => {
    assert.equal(plainText("<p>Olá <b>mundo</b></p><script>x()</script>"), "Olá mundo");
    assert.equal(plainText("a".repeat(50), 10)?.length, 10);
  });
});

describe("model output contracts", () => {
  test("scores outside 0–100 or extra fields are rejected (an obeyed injection cannot pass)", () => {
    assert.equal(OUTPUTS.score_a.safeParse({ attentionScore: 999 }).success, false);
    assert.equal(OUTPUTS.score_a.safeParse({ attentionScore: 80, publicar: true }).success, false);
    assert.equal(OUTPUTS.prefilter.safeParse({ label: "MAYBE", reason: "x" }).success, false);
    assert.equal(OUTPUTS.score_b.safeParse({ attentionScore: 80 }).success, true);
  });

  test("control and bidi characters are stripped from stored text", () => {
    assert.equal(cleanText("A‮evil <b>", 100), "Aevil <b>");
  });
});

test("an empty RSS channel is a valid feed with no entries", () => {
  assert.deepEqual(parseFeed(`<rss version="2.0"><channel><title>Vazio</title></channel></rss>`), []);
});
