/** Local demo preflight. Read-only, no secrets printed. */
import { QUESTIONS, DEPARTMENT_KEYS, validateBank } from "../supabase/functions/_shared/intake/question-bank.ts";

const BASE = Deno.env.get("LOCAL_URL") ?? "http://127.0.0.1:54321";
const STUB = Deno.env.get("STUB_URL") ?? "http://127.0.0.1:8787";
type Status = "PASS" | "FAIL" | "WARNING" | "NOT REQUIRED";
const rows: Array<[string, Status, string]> = [];
const add = (name: string, status: Status, detail = "") => rows.push([name, status, detail]);

async function reachable(url: string): Promise<boolean> {
  try { const r = await fetch(url, { method: "GET" }); return r.status < 500; } catch { return false; }
}

add("Docker daemon", (await reachable(`${BASE}/rest/v1/`)) ? "PASS" : "FAIL", "Reachability via the local API");
add("Local API / database", (await reachable(`${BASE}/rest/v1/`)) ? "PASS" : "FAIL", BASE);
add("chat-turn function", (await reachable(`${BASE}/functions/v1/chat-turn`)) ? "PASS" : "FAIL", "401 expected without a JWT");
add("speak function", (await reachable(`${BASE}/functions/v1/speak`)) ? "PASS" : "FAIL");
add("Provider stub", (await reachable(`${STUB}/__stats`)) ? (Deno.env.get("PROVIDER_MODE") === "live" ? "NOT REQUIRED" : "PASS") : "FAIL", STUB);
add("Question bank", validateBank().length === 0 && QUESTIONS.length === 150 ? "PASS" : "FAIL", `${QUESTIONS.length} questions`);
add("Department distribution", DEPARTMENT_KEYS.every((d) => QUESTIONS.filter((q) => q.department === d).length === 30) ? "PASS" : "FAIL");
add("Groq key", Deno.env.get("GROQ_API_KEY") ? "PASS" : "WARNING", "absent is expected in stub mode");
add("Gnani key", Deno.env.get("GNANI_API_KEY") ? "PASS" : "WARNING", "absent is expected in stub mode");
add("Frontend URL", Deno.env.get("VITE_SUPABASE_URL") ? "PASS" : "WARNING", "frontend-owned variable");
add("Frontend key", Deno.env.get("VITE_SUPABASE_KEY") ? "PASS" : "WARNING", "frontend-owned variable");

for (const [name, status, detail] of rows) console.log(`${status.padEnd(12)} ${name}${detail ? ` — ${detail}` : ""}`);
const failed = rows.filter(([, status]) => status === "FAIL").length;
console.log(`\n${rows.length - failed}/${rows.length} checks passed`);
Deno.exit(failed === 0 ? 0 : 1);
