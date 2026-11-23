import dns from "node:dns/promises";
import net from "node:net";

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

export type HostResolver = (hostname: string) => Promise<string[]>;

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

function parseIpv4(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    nums.push(n);
  }
  return nums;
}

function isPrivateIpv4(octets: number[]): boolean {
  const [a, b, c] = octets;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT / Railway)
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local / metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  return false;
}

function expandIpv6(ip: string): number[] | null {
  const zoneIdx = ip.indexOf("%");
  const clean = (zoneIdx === -1 ? ip : ip.slice(0, zoneIdx)).toLowerCase();

  const halves = clean.split("::");
  if (halves.length > 2) return null;

  const parseGroups = (segment: string): number[] | null => {
    if (!segment) return [];
    const tokens = segment.split(":");
    const groups: number[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.includes(".")) {
        if (i !== tokens.length - 1) return null;
        const v4 = parseIpv4(token);
        if (!v4) return null;
        groups.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(token)) return null;
        groups.push(parseInt(token, 16));
      }
    }
    return groups;
  };

  const left = parseGroups(halves[0]);
  const right = halves.length === 2 ? parseGroups(halves[1]) : [];
  if (!left || !right) return null;

  if (halves.length === 1) {
    return left.length === 8 ? left : null;
  }

  const missing = 8 - (left.length + right.length);
  if (missing < 1) return null;
  return [...left, ...new Array<number>(missing).fill(0), ...right];
}

export function isPrivateOrReservedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    const octets = parseIpv4(ip);
    return octets ? isPrivateIpv4(octets) : true;
  }
  if (version === 6) {
    const groups = expandIpv6(ip);
    if (!groups) return true;
    const allZero = groups.every((g) => g === 0);
    if (allZero) return true; // ::
    const isLoopback = groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1;
    if (isLoopback) return true; // ::1

    // IPv4-mapped ::ffff:0:0/96
    const isV4Mapped =
      groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff;
    if (isV4Mapped) {
      return isPrivateIpv4([
        groups[6] >> 8,
        groups[6] & 0xff,
        groups[7] >> 8,
        groups[7] & 0xff,
      ]);
    }

    const first = groups[0];
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    if (first === 0x2001 && groups[1] === 0x0db8) return true; // 2001:db8::/32
    return false;
  }
  return true;
}

async function defaultResolveHost(hostname: string): Promise<string[]> {
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  return records.map((r) => r.address);
}

export async function assertSafePreviewUrl(
  raw: string,
  resolveHost: HostResolver = defaultResolveHost,
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new UnsafeUrlError("Invalid url");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UnsafeUrlError("Unsupported protocol");
  }
  if (parsed.username || parsed.password) {
    throw new UnsafeUrlError("Credentials not allowed in url");
  }

  const host = parsed.hostname.toLowerCase();
  if (!host) {
    throw new UnsafeUrlError("Missing host");
  }
  if (host === "localhost" || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new UnsafeUrlError("Blocked host");
  }

  const unbracketed = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (net.isIP(unbracketed) !== 0) {
    if (isPrivateOrReservedIp(unbracketed)) {
      throw new UnsafeUrlError("Private IP not allowed");
    }
    return parsed;
  }

  let addresses: string[];
  try {
    addresses = await resolveHost(unbracketed);
  } catch {
    throw new UnsafeUrlError("Unresolvable host");
  }
  if (addresses.length === 0) {
    throw new UnsafeUrlError("Unresolvable host");
  }
  for (const addr of addresses) {
    if (isPrivateOrReservedIp(addr)) {
      throw new UnsafeUrlError("Private IP not allowed");
    }
  }
  return parsed;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export async function safeFetchWithRedirects(
  initialUrl: URL,
  options: {
    headers: Record<string, string>;
    signal: AbortSignal;
    maxRedirects?: number;
    resolveHost?: HostResolver;
    fetchImpl?: typeof fetch;
  },
): Promise<{ res: Response; finalUrl: URL }> {
  const maxRedirects = options.maxRedirects ?? 3;
  const fetchImpl = options.fetchImpl ?? fetch;
  let current = initialUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await fetchImpl(current.toString(), {
      headers: options.headers,
      signal: options.signal,
      redirect: "manual",
    });

    if (!REDIRECT_STATUSES.has(res.status)) {
      return { res, finalUrl: current };
    }

    const location = res.headers.get("location");
    if (!location) {
      return { res, finalUrl: current };
    }
    if (hop === maxRedirects) {
      throw new UnsafeUrlError("Too many redirects");
    }

    const nextRaw = new URL(location, current).toString();
    current = await assertSafePreviewUrl(nextRaw, options.resolveHost);
  }

  throw new UnsafeUrlError("Too many redirects");
}

export async function readLimitedText(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) {
    return (await res.text()).slice(0, maxBytes);
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      const remaining = maxBytes - total;
      if (value.byteLength > remaining) {
        chunks.push(value.subarray(0, remaining));
        total += remaining;
        await reader.cancel().catch(() => {});
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

export class LruTtlCache<V> {
  private readonly map = new Map<string, { value: V; expires: number }>();

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
  ) {}

  get size(): number {
    return this.map.size;
  }

  get(key: string, now = Date.now()): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires <= now) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }

  set(key: string, value: V, now = Date.now()): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, { value, expires: now + this.ttlMs });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
}
