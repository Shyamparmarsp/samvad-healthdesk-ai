/**
 * Daily usage reservation.
 *
 * Contract with the database: public.reserve_daily_usage(p_counter) returns
 * (allowed, used, daily_limit) and is callable only by service_role. The Edge Function
 * calls it through the elevated client before any provider attempt, so a failed or
 * abandoned attempt still consumes one unit (docs/architecture-decisions.md D5).
 *
 * Safety: this module never retries, never invents a date and never lets a caller pass
 * an amount. The Asia/Kolkata bucket is derived inside SQL.
 */

export type UsageCounter = "sessions" | "groq" | "prisma" | "timbre";

export const USAGE_COUNTERS: readonly UsageCounter[] = ["sessions", "groq", "prisma", "timbre"];

export interface RpcResponse {
  data: unknown;
  error: unknown;
}

/** Minimal structural client: only `.rpc` is used, so tests need no network. */
export interface RpcClient {
  rpc(name: string, params?: Record<string, unknown>): PromiseLike<RpcResponse>;
}

export type ReservationResult =
  | { allowed: true; used: number; limit: number }
  | { allowed: false; used: number; limit: number }
  | { allowed: false; failed: true };

interface ReservationRow {
  allowed?: unknown;
  used?: unknown;
  daily_limit?: unknown;
}

function readRow(data: unknown): ReservationRow | null {
  if (Array.isArray(data)) {
    if (data.length === 0) return null;
    const first = data[0];
    return typeof first === "object" && first !== null ? (first as ReservationRow) : null;
  }
  if (typeof data === "object" && data !== null) return data as ReservationRow;
  return null;
}

export function isUsageCounter(value: unknown): value is UsageCounter {
  return typeof value === "string" && (USAGE_COUNTERS as readonly string[]).includes(value);
}

/**
 * Reserves exactly one unit. A transport or configuration failure is reported as
 * `failed` and must be treated as "provider unavailable" by the caller — never as
 * permission to proceed.
 */
export async function reserveUsage(
  client: RpcClient,
  counter: UsageCounter,
): Promise<ReservationResult> {
  let response: RpcResponse;
  try {
    response = await client.rpc("reserve_daily_usage", { p_counter: counter });
  } catch {
    return { allowed: false, failed: true };
  }

  if (response.error) return { allowed: false, failed: true };

  const row = readRow(response.data);
  if (!row) return { allowed: false, failed: true };

  const used = typeof row.used === "number" ? row.used : 0;
  const limit = typeof row.daily_limit === "number" ? row.daily_limit : 0;

  if (row.allowed === true) return { allowed: true, used, limit };
  if (row.allowed === false) return { allowed: false, used, limit };
  return { allowed: false, failed: true };
}
