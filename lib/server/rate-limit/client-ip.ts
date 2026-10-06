import { isIPv4, isIPv6 } from "node:net";

/**
 * Task 035A — the ONLY place that reads client-address headers (docs/SECURITY.md
 * §11.1). Owner deployment contract: CLIENT → VERCEL → WEDDINGCLICK, with no
 * other reverse proxy/CDN in front. Vercel's first hop overwrites
 * `x-real-ip` / `x-forwarded-for` with the connecting client address, so those
 * values are trusted here. If the topology changes (e.g. a CDN is placed in
 * front of Vercel), this trust decision MUST be revisited.
 *
 * The result is a validated, normalized address — never arbitrary header text:
 *   - IPv4 as dotted quad; IPv4-mapped IPv6 (`::ffff:a.b.c.d`) collapses to IPv4;
 *   - IPv6 is reduced to its /64 network (`xxxx:xxxx:xxxx:xxxx::/64`), the unit
 *     a single subscriber/device controls, so rotating interface ids inside one
 *     /64 cannot multiply the per-IP budget.
 * Anything else → `null`. Nothing is logged.
 */
export function resolveTrustedClientIp(headers: Headers): string | null {
  const realIp = headers.get("x-real-ip");
  if (realIp !== null) {
    return normalizeClientIp(realIp);
  }
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor !== null) {
    return normalizeClientIp(forwardedFor.split(",")[0] ?? "");
  }
  return null;
}

const MAX_ADDRESS_LENGTH = 64;

export function normalizeClientIp(raw: string): string | null {
  const value = raw.trim();
  if (value.length === 0 || value.length > MAX_ADDRESS_LENGTH) {
    return null;
  }
  if (isIPv4(value)) {
    return value;
  }
  if (!isIPv6(value) || value.includes("%")) {
    return null;
  }
  const hextets = expandIpv6(value.toLowerCase());
  if (hextets === null) {
    return null;
  }
  const isIpv4Mapped = hextets.slice(0, 5).every((h) => h === "0000") && hextets[5] === "ffff";
  if (isIpv4Mapped) {
    const high = parseInt(hextets[6], 16);
    const low = parseInt(hextets[7], 16);
    return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
  }
  return `${hextets.slice(0, 4).join(":")}::/64`;
}

/** Eight zero-padded hextets of an address `isIPv6` already accepted, or `null`. */
function expandIpv6(address: string): string[] | null {
  let text = address;
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    if (!isIPv4(tail)) return null;
    const [a, b, c, d] = tail.split(".").map(Number);
    text = `${text.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] === "" ? [] : halves[0].split(":");
  const rest = halves.length === 2 ? (halves[1] === "" ? [] : halves[1].split(":")) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const all = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  if (all.length !== 8 || all.some((h) => !/^[0-9a-f]{1,4}$/.test(h))) return null;
  return all.map((h) => h.padStart(4, "0"));
}
