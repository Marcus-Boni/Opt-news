// Local HTTP server for the synthetic feeds (dev and demo only; no external calls). GET /<sourceId>.xml.
// POST /__control/advance publishes a new item and a correction; POST /__control/fail?source=<id> makes a feed answer 503.
import { createServer } from "node:http";
import { CORRECTION, feedXml, type FixtureItem, ITEMS, LATER } from "../fixtures/feeds.ts";

export function startFakeFeeds(
  port = Number(process.env.FAKE_FEEDS_PORT ?? 4020),
  host = process.env.FAKE_FEEDS_HOST ?? "127.0.0.1",
) {
  let items: FixtureItem[] = [...ITEMS];
  const failing = new Set<string>();
  const started = Date.now();
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://local");
    const id = /^\/([\w-]+)\.xml$/.exec(url.pathname)?.[1];
    if (req.method === "GET" && id && !failing.has(id)) {
      try {
        const xml = feedXml(id, items, started);
        res.writeHead(200, { "content-type": "application/rss+xml; charset=utf-8" });
        return res.end(xml);
      } catch {
        res.writeHead(404);
        return res.end();
      }
    }
    if (req.method === "POST" && url.pathname === "/__control/advance") {
      items = [
        ...items.map((i) => (i.id === CORRECTION.id ? { ...i, summary: CORRECTION.summary } : i)),
        { ...LATER, ageHours: 0 },
      ];
      res.writeHead(200);
      return res.end("ok");
    }
    if (req.method === "POST" && url.pathname === "/__control/fail") {
      failing.add(url.searchParams.get("source") ?? "");
      res.writeHead(200);
      return res.end("ok");
    }
    res.writeHead(id ? 503 : 404);
    res.end();
  });
  return new Promise<{ port: number; close: () => Promise<void> }>((resolve) => {
    server.listen(port, host, () => {
      const address = server.address();
      resolve({
        port: typeof address === "object" && address ? address.port : port,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

if (import.meta.main) {
  const { port } = await startFakeFeeds();
  console.log(`feeds sintéticos em http://127.0.0.1:${port}/<fonte>.xml`);
}
