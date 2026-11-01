/**
 * Demo smoke runner: executes the committed local HTTP suites and emits JSON.
 * Requires the local stack, `supabase functions serve`, and the provider stub.
 * Run with:
 *   deno run --allow-net --allow-env --allow-read --allow-write --allow-run scripts/demo-smoke.ts
 */
const ENV = Deno.env.toObject();
const suites: Array<[string, string]> = [
  ["integration", "supabase/tests/integration.ts"],
  ["adaptive", "supabase/tests/adaptive.ts"],
];
const results: Array<{ suite: string; ok: boolean; tail: string }> = [];

for (const [name, file] of suites) {
  const command = new Deno.Command(Deno.execPath(), {
    args: ["run", "--allow-net", "--allow-env", "--allow-read", file],
    env: ENV,
    stdout: "piped",
    stderr: "piped",
  });
  const output = await command.output();
  const text = new TextDecoder().decode(output.stdout) + new TextDecoder().decode(output.stderr);
  const tail = text.trimEnd().split("\n").slice(-1)[0] ?? "";
  results.push({ suite: name, ok: output.success, tail });
  console.log(`${output.success ? "PASS" : "FAIL"} ${name} — ${tail}`);
}

const ok = results.every((r) => r.ok);
const report = { generatedAt: new Date().toISOString(), target: ENV.LOCAL_URL ?? "http://127.0.0.1:54321", providerMode: "stub", suites: results, ok };
await Deno.writeTextFile("demo-smoke-result.json", JSON.stringify(report, null, 2));
console.log(`\n${ok ? "SMOKE PASS" : "SMOKE FAIL"} — wrote demo-smoke-result.json`);
console.log("Note: backend HTTP/DB only. Browser UI is not exercised.");
Deno.exit(ok ? 0 : 1);
