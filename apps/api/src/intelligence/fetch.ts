// Outbound fetch for collectors. Same guarantees as AIHOT's lib/http-fetch.ts (MIT, see NOTICE): the address checked
// is the one actually dialled (DNS lookup inside the connection, so rebinding cannot swap it), every redirect hop is
// checked again, and one deadline and one size budget cover the whole chain.
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { isBlockedAddress } from "../content/url-guard.ts";

export interface FetchOptions {
  /** Hostnames allowed to resolve to private addresses (local fake feeds in dev/test only). */
  privateHosts?: readonly string[];
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Replayed validators of the last full response (conditional GET). */
  etag?: string | null;
  lastModified?: string | null;
  /** What the caller expects: a feed (default) or an article page. */
  accept?: "feed" | "html";
}

export type FetchResult =
  | { notModified: false; body: string; etag: string | null; lastModified: string | null }
  | { notModified: true };

const ACCEPT = {
  feed: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
  html: "text/html, application/xhtml+xml;q=0.9, */*;q=0.1",
};

export class FetchBlocked extends Error {
  override name = "FetchBlocked";
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

function guardedLookup(allowed: boolean) {
  return (hostname: string, options: { all?: boolean }, callback: LookupCallback) => {
    dnsLookup(hostname, { all: true }, (err, addresses) => {
      if (err) return callback(err, "");
      const bad = addresses.find((a) => isBlockedAddress(a.address));
      if (bad && !allowed)
        return callback(new FetchBlocked(`${hostname} resolve para endereço interno ${bad.address}`), "");
      const first = addresses[0];
      if (!first) return callback(new Error(`${hostname} sem endereço`), "");
      return options.all ? callback(null, addresses) : callback(null, first.address, first.family);
    });
  };
}

function get(
  url: URL,
  allowed: boolean,
  signal: AbortSignal,
  headers: Record<string, string>,
): Promise<http.IncomingMessage> {
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.get(url, {
      signal,
      lookup: guardedLookup(allowed) as never,
      headers: { "user-agent": "OptNews-Collector/0.1 (+interno)", ...headers },
    });
    req.on("response", resolve);
    req.on("error", reject);
  });
}

export async function guardedFetchText(raw: string, opts: FetchOptions = {}): Promise<string> {
  const res = await guardedFetch(raw, { ...opts, etag: null, lastModified: null });
  if (res.notModified) throw new Error("304 sem validadores");
  return res.body;
}

export async function guardedFetch(raw: string, opts: FetchOptions = {}): Promise<FetchResult> {
  // Some official feeds (Azure blog) take 10 s+ to send ~180 KB; 30 s keeps them without stalling a run.
  const { privateHosts = [], timeoutMs = 30_000, maxBytes = 2 * 1024 * 1024, maxRedirects = 5 } = opts;
  const signal = AbortSignal.timeout(timeoutMs);
  let url = new URL(raw);
  for (let hop = 0; ; hop++) {
    if (url.protocol !== "https:" && url.protocol !== "http:")
      throw new FetchBlocked(`protocolo não permitido: ${url.protocol}`);
    if (url.username || url.password) throw new FetchBlocked("URL com credenciais");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const allowed = privateHosts.includes(host);
    // An IP literal never goes through DNS, so the lookup guard would not see it.
    if (isIP(host) && isBlockedAddress(host) && !allowed) throw new FetchBlocked(`endereço interno: ${host}`);
    const headers: Record<string, string> = { accept: ACCEPT[opts.accept ?? "feed"] };
    if (opts.etag) headers["if-none-match"] = opts.etag;
    if (opts.lastModified) headers["if-modified-since"] = opts.lastModified;
    const res = await get(url, allowed, signal, headers);
    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume();
      if (hop >= maxRedirects) throw new Error("redirecionamentos demais");
      url = new URL(res.headers.location, url);
      continue;
    }
    if (status === 304 && (opts.etag || opts.lastModified)) {
      res.resume();
      return { notModified: true };
    }
    if (status !== 200) {
      res.resume();
      throw new Error(`resposta ${status} de ${url.host}`);
    }
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of res) {
      size += (chunk as Buffer).length;
      if (size > maxBytes) {
        res.destroy();
        throw new Error(`resposta maior que ${maxBytes} bytes`);
      }
      chunks.push(chunk as Buffer);
    }
    return {
      notModified: false,
      body: decode(Buffer.concat(chunks), res.headers["content-type"]),
      etag: res.headers.etag ?? null,
      lastModified: res.headers["last-modified"] ?? null,
    };
  }
}

/** Header charset first, then the XML declaration; unknown labels fall back to UTF-8 (Brazilian sites still use Latin-1). */
export function decode(body: Buffer, contentType?: string): string {
  const declared =
    /charset="?([\w-]+)/i.exec(contentType ?? "")?.[1] ??
    /^<\?xml[^>]*encoding=["']([\w-]+)/i.exec(body.subarray(0, 200).toString("latin1"))?.[1];
  try {
    return new TextDecoder(declared ?? "utf-8").decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}
