/**
 * Deterministic local provider stub.
 *
 * Only for local integration runs. It exists so the Edge Functions can be exercised over
 * real HTTP without contacting Groq, Gnani Prisma or Gnani Timbre, and without any
 * production credential.
 *
 * It deliberately mirrors the documented request/response shapes rather than inventing
 * new ones: the adapters are not changed to accommodate the stub.
 *
 * Run:  deno run --allow-net supabase/tests/stub-providers.ts 8787
 * Point the functions at it with GROQ_BASE_URL, PRISMA_BASE_URL and TIMBRE_ENDPOINT.
 *
 * Behaviour is switched with POST /__control so a single stub process can serve every
 * scenario without restarting the function runtime.
 */

type Mode = "ok" | "malformed" | "abort" | "error500" | "ratelimit";

interface State {
  groq: Mode;
  prisma: Mode;
  timbre: Mode;
  prismaTranscript: string;
  ttsCalls: number;
  groqCalls: number;
  prismaCalls: number;
}

const state: State = {
  groq: "ok",
  prisma: "ok",
  timbre: "ok",
  prismaTranscript: "मुझे घुटने में दर्द है",
  ttsCalls: 0,
  groqCalls: 0,
  prismaCalls: 0,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function failure(mode: Mode): Response | null {
  if (mode === "error500") return json({ error: "stub failure" }, 500);
  if (mode === "ratelimit") return json({ error: "rate limited" }, 429);
  if (mode === "abort") return new Response(null, { status: 502 });
  return null;
}

const port = Number(Deno.args[0] ?? 8787);

Deno.serve({ port, onListen: () => console.log(`stub listening on ${port}`) }, async (req) => {
  const url = new URL(req.url);

  if (url.pathname === "/__control" && req.method === "POST") {
    const body = (await req.json()) as Partial<State>;
    Object.assign(state, body);
    return json({ ok: true, state: { ...state } });
  }

  if (url.pathname === "/__stats") {
    return json({ ...state });
  }

  if (url.pathname.endsWith("/chat/completions") && req.method === "POST") {
    state.groqCalls += 1;
    const failed = failure(state.groq);
    if (failed) return failed;
    if (state.groq === "malformed") {
      return json({ choices: [{ message: { role: "assistant", content: "not json at all" } }] });
    }
    const body = (await req.json()) as { messages?: Array<{ content?: string }> };
    const text = (body.messages ?? []).map((message) => message.content ?? "").join(" ").toLowerCase();
    const department = text.includes("knee") || text.includes("joint")
      ? "orthopedics"
      : text.includes("rash") || text.includes("skin") || text.includes("itch")
      ? "dermatology"
      : text.includes("chest") || text.includes("heart")
      ? "cardiology"
      : text.includes("abdomen") || text.includes("stomach")
      ? "general_surgery"
      : "general_medicine";
    return json({
      choices: [{ message: { role: "assistant", content: JSON.stringify({ department_key: department }) } }],
    });
  }

  if (url.pathname.endsWith("/stt/v3") && req.method === "POST") {
    state.prismaCalls += 1;
    const failed = failure(state.prisma);
    if (failed) return failed;
    if (state.prisma === "malformed") {
      return json({ success: true, transcript: 42 });
    }
    if (state.prisma === "empty") {
      return json({ success: true, request_id: "stub", transcript: "", model: "prisma-v2.5" });
    }
    return json({
      success: true,
      request_id: "stub-request",
      transcript: state.prismaTranscript,
      model: "prisma-v2.5",
      output: { literal: state.prismaTranscript },
    });
  }

  if (url.pathname.endsWith("/tts") && req.method === "POST") {
    state.ttsCalls += 1;
    const failed = failure(state.timbre);
    if (failed) return failed;
    if (state.timbre === "malformed") {
      return new Response(new Uint8Array(), { status: 200, headers: { "content-type": "audio/mpeg" } });
    }
    return new Response(new Uint8Array([73, 68, 51, 4, 0, 0, 0, 0]), {
      status: 200,
      headers: { "content-type": "audio/mpeg" },
    });
  }

  return json({ error: "not found", path: url.pathname }, 404);
});
