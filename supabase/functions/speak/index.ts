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
import { getQuestion as getBankQuestion } from "../_shared/intake/question-bank.ts";
import { reserveUsage } from "../_shared/usage.ts";
import type { RpcClient } from "../_shared/usage.ts";
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
    const correlationId = crypto.randomUUID();
    const startedAt = performance.now();
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

    if (!isUuid(body.session_id)) {
      return textFallback("", 400);
    }
    // Core ids and adaptive bank ids (GM-001 … CARD-030) are both valid here. Bank ids
    // are exactly the adaptive questions Timbre exists for, so rejecting them made the
    // paid path unreachable in the shipped flow.
    const rawQuestionId = body.question_id;
    if (typeof rawQuestionId !== "string") return textFallback("", 400);
    if (!isQuestionId(rawQuestionId) && !getBankQuestion(rawQuestionId)) {
      return textFallback("", 400);
    }
    const questionId: string = rawQuestionId;

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
        return textFallback(questionTextFor(questionId, "en"), 200);
      }
      if (row.answer_turn_count >= MAX_ANSWER_TURNS) {
        // No provider call once the cap is reached.
        return textFallback(questionTextFor(questionId, row.language ?? "en"), 200);
      }
      if (row.current_question_id !== questionId) {
        return textFallback("", 409);
      }

      const bankQuestion = getBankQuestion(questionId);
      if (bankQuestion) {
        // Adaptive bank questions are synthesised on demand; nothing is cached for them.
        return await synthesizeOrFallback(
          admin,
          questionId,
          row.language === "hi" ? bankQuestion.hi : bankQuestion.en,
          row.language,
        );
      }

      const question = QUESTIONS[questionId as keyof typeof QUESTIONS];
      if (!question || question.phase !== "adaptive") {
        // Scripted prompts are pre-recorded in public/audio and must never hit Timbre.
        return textFallback(questionTextFor(questionId, row.language ?? "en"), 200);
      }

      return await synthesizeOrFallback(
        admin,
        questionId,
        questionTextFor(questionId, row.language ?? "en"),
        row.language,
      );
    } catch (error) {
      const code = toErrorCode(error);
      consoleLogger.error("action_rejected", { action: "speak", code });
      if (error instanceof AppError && error.code === "not_found") {
        return textFallback("", 404);
      }
      return textFallback("", 500);
    }
    };
    const response = await respond();
    consoleLogger.info("request_completed", {
      correlation_id: correlationId,
      action: "speak",
      status: response.status,
      duration_ms: Math.round(performance.now() - startedAt),
    });
    return withCors(response, origin, corsConfig());
  }),
};

/** One reserved Timbre attempt, or the approved question as text when anything fails. */
async function synthesizeOrFallback(
  admin: RpcClient,
  questionId: string,
  text: string,
  language: "en" | "hi",
): Promise<Response> {
  const reservation = await reserveUsage(admin, "timbre");
  if (!reservation.allowed) {
    consoleLogger.info("usage_capped", { counter: "timbre", provider: "timbre" });
    return textFallback(text, 200);
  }

  const apiKey = Deno.env.get("GNANI_API_KEY") ?? "";
  if (!apiKey) {
    consoleLogger.error("provider_failure", { provider: "timbre", reason: "missing_key" });
    return textFallback(text, 200);
  }

  const result = await synthesize(
    { apiKey, endpoint: Deno.env.get("TIMBRE_ENDPOINT") ?? undefined },
    { text, language: language === "hi" ? "hi-IN" : "en-IN" },
  );

  consoleLogger.info("provider_attempt", { provider: "timbre", ok: result.ok });

  if (!result.ok) return textFallback(text, 200);

  const audioBuffer = result.audio.buffer.slice(
    result.audio.byteOffset,
    result.audio.byteOffset + result.audio.byteLength,
  ) as ArrayBuffer;
  return new Response(audioBuffer, {
    status: 200,
    headers: { "Content-Type": result.contentType, "Cache-Control": "no-store" },
  });
}

function questionTextFor(questionId: string, language: "en" | "hi"): string {
  const question = QUESTIONS[questionId as keyof typeof QUESTIONS];
  if (!question) return "";
  return language === "hi" ? question.hi : question.en;
}
