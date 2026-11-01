/**
 * speak — text to speech for the current approved adaptive question only.
 *
 * Security contract (AGENTS.md, MILESTONES M3-S7):
 *   - requires a valid user JWT (withSupabase auth: "user")
 *   - the session must belong to the caller
 *   - the client sends a session id and a question id, never text
 *   - the question must be the session's current question and must be adaptive;
 *     cached scripted prompts are never synthesised
 *   - one Timbre call is reserved before the attempt; no call is made at the turn cap
 *   - any failure, cap or provider error returns the approved question as text
 */

import { withSupabase } from "@supabase/server";
import { preflight, withCors } from "../_shared/cors.ts";
import { AppError, toErrorCode } from "../_shared/errors.ts";
import { consoleLogger } from "../_shared/logging.ts";
import { synthesize } from "../_shared/timbre.ts";
import { QUESTIONS, isQuestionId } from "../_shared/questions.ts";
import { reserveUsage } from "../_shared/usage.ts";
import { MAX_ANSWER_TURNS } from "../_shared/conversation.ts";
import { isUuid, requireOwnedRow } from "../_shared/auth.ts";

interface SpeakRequest {
  session_id?: unknown;
  question_id?: unknown;
}

function corsConfig(): string | null {
  return Deno.env.get("ALLOWED_ORIGINS") ?? null;
}

function textFallback(message: string, status = 200): Response {
  return Response.json({ text: message }, { status });
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const origin = req.headers.get("origin");
    const respond = async (): Promise<Response> => {
    if (req.method === "OPTIONS") return preflight(origin, corsConfig());
    if (req.method !== "POST") return withCors(new Response("method not allowed", { status: 405 }), origin, corsConfig());

    const userId = ctx.userClaims?.id;
    if (!userId) return textFallback("", 401);

    let body: SpeakRequest;
    try {
      body = (await req.json()) as SpeakRequest;
    } catch {
      return textFallback("", 400);
    }

    if (!isUuid(body.session_id) || !isQuestionId(body.question_id)) {
      return textFallback("", 400);
    }

    try {
      const admin = ctx.supabaseAdmin;

      const { data: session } = await admin
        .from("sessions")
        .select("id, user_id, status, answer_turn_count, current_question_id, language")
        .eq("id", body.session_id)
        .maybeSingle();

      requireOwnedRow(session, userId);

      const row = session as {
        status: string;
        answer_turn_count: number;
        current_question_id: string | null;
        language: "en" | "hi";
      };

      if (row.status !== "in_progress" && row.status !== "consented") {
        return textFallback(questionTextFor(body.question_id, "en"), 200);
      }
      if (row.answer_turn_count >= MAX_ANSWER_TURNS) {
        // No provider call once the cap is reached.
        return textFallback(questionTextFor(body.question_id, row.language ?? "en"), 200);
      }
      if (row.current_question_id !== body.question_id) {
        return textFallback("", 409);
      }

      const question = QUESTIONS[body.question_id];
      if (question.phase !== "adaptive") {
        // Scripted prompts are pre-recorded in public/audio and must never hit Timbre.
        return textFallback(questionTextFor(body.question_id, row.language ?? "en"), 200);
      }

      const reservation = await reserveUsage(admin, "timbre");
      if (!reservation.allowed) {
        consoleLogger.info("usage_capped", { counter: "timbre", provider: "timbre" });
        return textFallback(questionTextFor(body.question_id, row.language ?? "en"), 200);
      }

      const apiKey = Deno.env.get("GNANI_API_KEY") ?? "";
      if (!apiKey) {
        consoleLogger.error("provider_failure", { provider: "timbre", reason: "missing_key" });
        return textFallback(questionTextFor(body.question_id, row.language ?? "en"), 200);
      }

      const result = await synthesize(
        { apiKey, endpoint: Deno.env.get("TIMBRE_ENDPOINT") ?? undefined },
        {
          text: questionTextFor(body.question_id, row.language ?? "en"),
          language: row.language === "hi" ? "hi-IN" : "en-IN",
        },
      );

      consoleLogger.info("provider_attempt", { provider: "timbre", ok: result.ok });

      if (!result.ok) {
        return textFallback(questionTextFor(body.question_id, row.language ?? "en"), 200);
      }

      const audioBuffer = result.audio.buffer.slice(
        result.audio.byteOffset,
        result.audio.byteOffset + result.audio.byteLength,
      ) as ArrayBuffer;
      return new Response(audioBuffer, {
        status: 200,
        headers: { "Content-Type": result.contentType, "Cache-Control": "no-store" },
      });
    } catch (error) {
      const code = toErrorCode(error);
      consoleLogger.error("action_rejected", { action: "speak", code });
      if (error instanceof AppError && error.code === "not_found") {
        return textFallback("", 404);
      }
      return textFallback("", 500);
    }
    };
    return withCors(await respond(), origin, corsConfig());
  }),
};

function questionTextFor(questionId: string, language: "en" | "hi"): string {
  const question = QUESTIONS[questionId as keyof typeof QUESTIONS];
  if (!question) return "";
  return language === "hi" ? question.hi : question.en;
}
