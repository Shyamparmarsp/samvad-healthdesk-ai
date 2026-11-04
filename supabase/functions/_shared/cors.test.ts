import { LOCAL_ORIGINS, parseAllowedOrigins, preflight, resolveCors, withCors } from "./cors.ts";
import { assert, assertEqual } from "./testing.ts";

Deno.test("cors: allowed local origin is echoed", () => {
  const d = resolveCors("http://localhost:5173", null);
  assert(d.allowed, "allowed");
  assertEqual(d.headers["Access-Control-Allow-Origin"], "http://localhost:5173", "echo");
  assertEqual(d.headers["Access-Control-Allow-Methods"], "POST, OPTIONS", "methods");
  assertEqual(d.headers.Vary, "Origin", "vary");
});

Deno.test("cors: configured production origin is allowed, wildcard is ignored", () => {
  const configured = "https://samvad.example.app, *";
  assertEqual(parseAllowedOrigins(configured).join(","), "https://samvad.example.app", "wildcard stripped");
  assert(resolveCors("https://samvad.example.app", configured).allowed, "allowed");
});

Deno.test("cors: the doctor summary text headers are exposed to the allowed origin", () => {
  const d = resolveCors("http://localhost:5173", null);
  assert(d.allowed, "allowed");
  const exposed = d.headers["Access-Control-Expose-Headers"];
  assert(typeof exposed === "string", "expose header present");
  assert(exposed.includes("x-summary-text"), "validated Hindi sentence is readable by the browser");
  assert(exposed.includes("x-summary-source"), "summary source is readable by the browser");
  assert(!exposed.toLowerCase().includes("authorization"), "no credential header is exposed");
});

Deno.test("cors: unknown origin gets no permissive header", () => {
  const d = resolveCors("https://evil.example", "https://samvad.example.app");
  assert(!d.allowed, "refused");
  assertEqual(d.headers["Access-Control-Allow-Origin"], undefined, "no ACAO");
});

Deno.test("cors: missing configuration fails closed for non-local origins", () => {
  assert(!resolveCors("https://random.vercel.app", null).allowed, "fails closed");
  assert(resolveCors("http://127.0.0.1:5173", null).allowed, "local still allowed");
  assertEqual(LOCAL_ORIGINS.length > 0, true, "local list present");
});

Deno.test("cors: preflight responses", () => {
  assertEqual(preflight("http://localhost:5173", null).status, 204, "allowed preflight");
  assertEqual(preflight("https://evil.example", null).status, 403, "refused preflight");
});

Deno.test("cors: error responses keep the same CORS decision", () => {
  const error = new Response(JSON.stringify({ error: "invalid_request" }), { status: 400 });
  const allowed = withCors(error, "http://localhost:5173", null);
  assertEqual(allowed.status, 400, "status preserved");
  assertEqual(allowed.headers.get("access-control-allow-origin"), "http://localhost:5173", "header applied");
  const refused = withCors(error, "https://evil.example", null);
  assertEqual(refused.headers.get("access-control-allow-origin"), null, "no header for refused origin");
});
