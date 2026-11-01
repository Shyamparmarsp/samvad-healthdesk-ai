/**
 * Exact-origin CORS allowlist.
 *
 * CORS is a browser isolation control, not authentication: JWT verification and every
 * RLS/ownership rule remain unchanged.
 *
 * Allowed origins:
 *   - local development origins (always, for the local demo)
 *   - production origins from the ALLOWED_ORIGINS env var (comma separated)
 * Unknown origins get no permissive header. If production configuration is missing, a
 * non-local origin is refused (fail closed) rather than allowed.
 */

export const LOCAL_ORIGINS: readonly string[] = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:3000",
];

export function parseAllowedOrigins(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0 && origin !== "*");
}

export interface CorsDecision {
  allowed: boolean;
  origin: string | null;
  headers: Record<string, string>;
}

const ALLOW_METHODS = "POST, OPTIONS";
const ALLOW_HEADERS = "authorization, x-client-info, apikey, content-type";

/** Decides the CORS response headers for one request origin. */
export function resolveCors(origin: string | null, configured: string | null | undefined): CorsDecision {
  const production = parseAllowedOrigins(configured);
  const allowlist = new Set([...LOCAL_ORIGINS, ...production]);

  if (!origin) return { allowed: false, origin: null, headers: {} };

  if (!allowlist.has(origin)) {
    return { allowed: false, origin, headers: { Vary: "Origin" } };
  }

  return {
    allowed: true,
    origin,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": ALLOW_METHODS,
      "Access-Control-Allow-Headers": ALLOW_HEADERS,
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    },
  };
}

export function preflight(origin: string | null, configured: string | null | undefined): Response {
  const decision = resolveCors(origin, configured);
  // A 204 response must not carry a body.
  return new Response(decision.allowed ? null : "forbidden", {
    status: decision.allowed ? 204 : 403,
    headers: decision.headers,
  });
}

/** Applies the decision to any response, including error responses, without mutating it. */
export function withCors(response: Response, origin: string | null, configured: string | null | undefined): Response {
  const decision = resolveCors(origin, configured);
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(decision.headers)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}
