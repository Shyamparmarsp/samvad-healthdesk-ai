/**
 * Preliminary department routing.
 *
 * AGENTS.md: the model may propose at most one non-emergency department key; the backend
 * validates it and performs the department-to-doctor mapping; ambiguous cases fall back
 * to General Medicine and stay marked preliminary. Emergency is never routable here.
 *
 * Everything in this module is pure: the model supplies a candidate string, the seeded
 * records decide whether it is real.
 */

import type { DepartmentKey, RoutingSnapshot } from "./contract.ts";

export interface DepartmentRecord {
  key: string;
  name: string;
  booking_enabled: boolean;
  is_emergency: boolean;
}

export interface DoctorRecord {
  id: string;
  display_name: string;
  department_key: string;
}

export const FALLBACK_DEPARTMENT: DepartmentKey = "general_medicine";

/** Departments a model may propose. Emergency is excluded by definition. */
export const ROUTEABLE_DEPARTMENTS: readonly DepartmentKey[] = [
  "general_medicine",
  "orthopedics",
  "general_surgery",
  "dermatology",
  "cardiology",
];

export type RoutingSource = "model" | "fallback";

export interface ResolvedRouting {
  routing: RoutingSnapshot;
  source: RoutingSource;
  /** Machine-readable reason when the fallback was used. */
  reason: "accepted" | "unknown_department" | "emergency_not_routable" | "no_doctor" | "no_candidate" | "no_departments";
}

function isRouteable(value: unknown): value is DepartmentKey {
  return typeof value === "string" && (ROUTEABLE_DEPARTMENTS as readonly string[]).includes(value);
}

/**
 * Resolves a candidate department key against the seeded records.
 *
 * The model's suggestion is only a candidate. It is accepted only when the key exists in
 * `departments`, is not the emergency department, is booking-enabled and has at least one
 * doctor. Otherwise General Medicine is used and the result is marked preliminary with
 * `is_fallback: true`.
 */
export function resolveRouting(
  candidate: unknown,
  departments: readonly DepartmentRecord[],
  doctors: readonly DoctorRecord[],
): ResolvedRouting {
  const byKey = new Map(departments.map((department) => [department.key, department]));
  const doctorFor = (key: string): DoctorRecord | undefined =>
    doctors.find((doctor) => doctor.department_key === key);

  const build = (key: DepartmentKey, isFallback: boolean): RoutingSnapshot | null => {
    const department = byKey.get(key);
    const doctor = doctorFor(key);
    if (!department || !doctor) return null;
    return {
      department_key: key,
      department_name: department.name,
      doctor_id: doctor.id,
      doctor_name: doctor.display_name,
      is_fallback: isFallback,
      preliminary: true,
    };
  };

  let reason: ResolvedRouting["reason"] = "accepted";

  if (candidate === null || candidate === undefined || candidate === "") {
    reason = "no_candidate";
  } else if (candidate === "emergency") {
    reason = "emergency_not_routable";
  } else if (!isRouteable(candidate)) {
    reason = "unknown_department";
  } else {
    const department = byKey.get(candidate);
    if (!department) {
      reason = "unknown_department";
    } else if (department.is_emergency || !department.booking_enabled) {
      reason = "emergency_not_routable";
    } else if (!doctorFor(candidate)) {
      reason = "no_doctor";
    } else {
      const routing = build(candidate, false);
      if (routing) return { routing, source: "model", reason: "accepted" };
      reason = "no_doctor";
    }
  }

  const fallback = build(FALLBACK_DEPARTMENT, true);
  if (fallback) return { routing: fallback, source: "fallback", reason };

  for (const key of ROUTEABLE_DEPARTMENTS) {
    const routing = build(key, true);
    if (routing) return { routing, source: "fallback", reason };
  }

  throw new Error("no routeable department is seeded");
}

/** Emergency routing is separate and always uses the seeded Emergency doctor. */
export function resolveEmergencyRouting(
  departments: readonly DepartmentRecord[],
  doctors: readonly DoctorRecord[],
): RoutingSnapshot {
  const department = departments.find((entry) => entry.key === "emergency");
  const doctor = doctors.find((entry) => entry.department_key === "emergency");
  if (!department || !doctor) throw new Error("emergency department is not seeded");
  return {
    department_key: "emergency",
    department_name: department.name,
    doctor_id: doctor.id,
    doctor_name: doctor.display_name,
    is_fallback: false,
    preliminary: true,
  };
}
