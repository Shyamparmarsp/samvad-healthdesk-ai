/**
 * Session and report ownership checks.
 *
 * Every chat-turn action runs these against rows fetched with the elevated client,
 * which bypasses RLS. That makes these checks the only thing standing between one
 * patient and another patient's data (AGENTS.md).
 *
 * The helpers are pure so they can be unit-tested without a database.
 */

export interface OwnedRow {
  user_id?: string | null;
}

export class OwnershipError extends Error {
  readonly code = "not_found" as const;
  constructor() {
    super("not_found");
    this.name = "OwnershipError";
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Verifies that a verified user id is present and usable. */
export function requireUserId(userId: unknown): string {
  if (!isUuid(userId)) throw new OwnershipError();
  return userId;
}

/**
 * Verifies that a fetched row exists and belongs to the caller.
 *
 * Returns 404 semantics (not 403) so the API never confirms that another patient's
 * session or report exists.
 */
export function requireOwnedRow<T extends OwnedRow>(row: T | null, userId: string): T {
  if (!row || typeof row.user_id !== "string" || row.user_id !== userId) {
    throw new OwnershipError();
  }
  return row;
}

/** A patient session must belong to the caller before any read or write. */
export function requireSessionOwner<T extends OwnedRow>(session: T | null, userId: string): T {
  return requireOwnedRow(session, userId);
}

/** A report correction or submission must belong to the caller. */
export function requireReportOwner<T extends OwnedRow>(report: T | null, userId: string): T {
  return requireOwnedRow(report, userId);
}

/**
 * Doctors must map to a doctor record; anonymous patients never do. This is used by
 * doctor-facing paths only, never by the patient intake path.
 */
export function isDoctorIdentity(mapping: { doctor_id?: string | null } | null): boolean {
  return !!mapping && typeof mapping.doctor_id === "string" && mapping.doctor_id.length > 0;
}
