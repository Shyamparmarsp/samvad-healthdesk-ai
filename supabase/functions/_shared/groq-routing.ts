/**
 * Model-assisted preliminary department suggestion.
 *
 * The model returns one candidate key; it never chooses the doctor and never decides
 * routing. Validation against seeded records happens in routing.ts. Any failure —
 * missing key, timeout, rate limit, malformed JSON, unknown enum value — yields null so
 * the caller falls back deterministically.
 */

import { requestStructured, type GroqOptions } from "./groq.ts";
import { ROUTEABLE_DEPARTMENTS } from "./routing.ts";
import type { DepartmentKey } from "./contract.ts";

const SYSTEM_PROMPT = [
  "You are a routing assistant for a hospital intake demo.",
  "Choose the single most appropriate department key for the patient's stated concern.",
  "You must not diagnose, name a disease, or give advice.",
  "If the concern is unclear, choose general_medicine.",
].join(" ");

const SCHEMA = {
  type: "object",
  properties: {
    department_key: { type: "string", enum: [...ROUTEABLE_DEPARTMENTS] },
  },
  required: ["department_key"],
  additionalProperties: false,
} as const;

interface Suggestion {
  department_key: string;
}

function validate(parsed: unknown): Suggestion | null {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const value = parsed as Record<string, unknown>;
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== "department_key") return null;
  const key = value.department_key;
  if (typeof key !== "string") return null;
  if (!(ROUTEABLE_DEPARTMENTS as readonly string[]).includes(key)) return null;
  return { department_key: key };
}

/**
 * Returns a validated candidate key, or null when the model is unavailable or returns
 * anything unexpected. `concern` must be the patient-reported text only.
 */
export async function suggestDepartment(
  options: GroqOptions,
  concern: string,
): Promise<DepartmentKey | null> {
  if (!options.apiKey) return null;

  const result = await requestStructured<Suggestion>(options, {
    schemaName: "department_suggestion",
    schema: SCHEMA as unknown as Record<string, unknown>,
    system: SYSTEM_PROMPT,
    user: concern.slice(0, 500),
    validate,
  });

  if (!result.ok) return null;
  return result.value.department_key as DepartmentKey;
}
