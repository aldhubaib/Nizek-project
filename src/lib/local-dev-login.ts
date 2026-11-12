/**
 * Who the local panel may sign in without Google.
 *
 * Absent unless three things are true together: this process is not a
 * production build, LOCAL_DEV_LOGIN=1, and the request host is this machine
 * or a private LAN address. A public host never qualifies, so the route stays
 * closed on staging even if the flag is copied there by mistake.
 */
export function localDevLoginEmail(input: {
  nodeEnv: string | undefined;
  enabled: string | undefined;
  email: string | undefined;
  host: string | null;
}): string | null {
  if (input.nodeEnv === "production") return null;
  if (input.enabled !== "1") return null;
  const email = input.email?.trim().toLowerCase() ?? "";
  if (!email.includes("@")) return null;
  if (!isPrivateHost(hostnameOf(input.host))) return null;
  return email;
}

/** The account a local sign-in may open. No `requested` means the configured one. */
export function localDevSignInEmail(gate: string | null, requested: string | undefined): string | null {
  if (!gate) return null;
  const email = requested?.trim().toLowerCase() ?? "";
  if (!email) return gate;
  if (!email.includes("@")) return null;
  return email;
}

function hostnameOf(host: string | null): string {
  const raw = (host ?? "").trim().toLowerCase();
  if (raw.startsWith("[")) {
    const end = raw.indexOf("]");
    return end === -1 ? "" : raw.slice(1, end);
  }
  return raw.split(":")[0] ?? "";
}

function isPrivateHost(host: string): boolean {
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (host.endsWith(".local")) return true;
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  const nums = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
  if (nums.some((n) => !Number.isInteger(n) || n > 255)) return false;
  const [a, b] = nums;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}
