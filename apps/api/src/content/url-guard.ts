// Validation of URLs that come from people (manual submissions) or from the engine. Opt News never fetches these
// URLs itself; the engine fetches with its own connect-time SSRF guard. This blocks storing addresses that point at
// internal networks, credentials in URLs and non-web schemes, and gives one canonical form for deduplication.
import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { invalid } from "../http/problem.ts";

const BLOCKED = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  BLOCKED.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  BLOCKED.addSubnet(net, prefix, "ipv6");

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home.arpa", ".corp"];
const TRACKING = /^(utm_[a-z]+|fbclid|gclid|mc_eid|mc_cid|ref_src)$/i;

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return BLOCKED.check(address, "ipv4");
  if (family !== 6) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped?.[1]) return BLOCKED.check(mapped[1], "ipv4");
  return BLOCKED.check(address, "ipv6");
}

/** Canonical form used for deduplication: lowercase host, no fragment, no default port, no tracking parameters. */
export function canonicalUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw invalid("URL malformada.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw invalid("Somente URLs http(s) são aceitas.");
  if (url.username || url.password) throw invalid("URLs com credenciais não são aceitas.");
  if (url.port && url.port !== "443" && url.port !== "80") throw invalid("Porta não permitida.");
  const host = url.hostname
    .replace(/^\[|\]$/g, "")
    .toLowerCase()
    .replace(/\.$/, "");
  if (!host.includes(".") || host === "localhost" || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    throw invalid("Endereço interno não é aceito.");
  }
  if (isIP(host) && isBlockedAddress(host)) throw invalid("Endereço de rede privada não é aceito.");
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) url.pathname = url.pathname.slice(0, -1);
  return url;
}

export type Lookup = (host: string) => Promise<{ address: string }[]>;
const systemLookup: Lookup = (host) => dnsLookup(host, { all: true, verbatim: true });

/** A submitted URL must also resolve only to public addresses (a public name may point inside the network). */
export async function assertPublicUrl(raw: string, lookup: Lookup = systemLookup): Promise<URL> {
  const url = canonicalUrl(raw);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return url;
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host);
  } catch {
    throw invalid("O domínio não pôde ser resolvido.");
  }
  if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address))) {
    throw invalid("O domínio aponta para uma rede interna.");
  }
  return url;
}
