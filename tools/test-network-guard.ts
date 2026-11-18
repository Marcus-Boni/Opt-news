// Tests never reach the network (AGENTS.md: no external services, no real model in CI). `npm test` preloads this
// file: name resolution and connections succeed only for loopback and the test database host; anything else fails
// the test that tried it. Idea from last30days-skill tests/network_guard.py (MIT).
import dns from "node:dns";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";

const testDbHost = (() => {
  try {
    return new URL(process.env.TEST_DATABASE_URL ?? "").hostname;
  } catch {
    return "";
  }
})();
const LOCAL = new Set(["localhost", "127.0.0.1", "::1", "::ffff:127.0.0.1", testDbHost].filter(Boolean));
const local = (host: string) => LOCAL.has(host.replace(/^\[|\]$/g, "")) || host.startsWith("127.");
const refused = (what: string) =>
  Object.assign(new Error(`teste tentou acessar a rede: ${what} (use um servidor local ou um lookup falso)`), {
    code: "ENETWORKGUARD",
  });

const lookup = dns.lookup;
dns.lookup = function (this: unknown, host: string, ...rest: unknown[]) {
  if (local(host)) return Reflect.apply(lookup, this, [host, ...rest]);
  const callback = rest.at(-1);
  if (typeof callback === "function") process.nextTick(callback, refused(`DNS ${host}`));
} as typeof dns.lookup;

const lookupAsync = dns.promises.lookup;
dns.promises.lookup = (async (host: string, ...rest: unknown[]) => {
  if (!local(host)) throw refused(`DNS ${host}`);
  return Reflect.apply(lookupAsync, dns.promises, [host, ...rest]);
}) as typeof dns.promises.lookup;

// shortcut: a hostname resolved by a test's own fake lookup is not re-checked here; the fake decides where it goes.
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
  // net.connect passes its normalized arguments as one array; direct calls pass options or (port, host).
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const options = (typeof first === "object" && first !== null ? first : { port: first, host: args[1] }) as {
    host?: string;
    port?: number;
    path?: string;
  };
  const host = options.host ?? "localhost";
  if (!options.path && net.isIP(host) && !local(host)) {
    this.destroy(refused(`${host}:${options.port}`));
    return this;
  }
  return Reflect.apply(connect, this, args);
} as typeof net.Socket.prototype.connect;

// ESM named imports of built-ins (`import { lookup } from "node:dns"`) only see the patch after this.
syncBuiltinESMExports();
