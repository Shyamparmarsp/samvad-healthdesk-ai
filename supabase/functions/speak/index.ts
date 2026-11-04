/**
 * speak — text to speech for server-known text only.
 *
 * Security contract (AGENTS.md, MILESTONES M3-S7):
 *   - requires a valid user JWT (withSupabase auth: "user")
 *   - the client sends one of: a session id + question id, an allowlisted system message
 *     id, or a validated doctor-assistant `summary_facts` object. It never sends text.
 *   - a session question must belong to the caller and must be the session's current
 *     question; cached scripted prompts are never synthesised
 *   - doctor summary facts are phrased by the existing Groq Qwen model and validated
 *     against those facts (`_shared/doctor-summary-llm.ts`); if the model is unavailable,
 *     times out, or produces anything unsupported, the deterministic Hindi renderer in
 *     `_shared/doctor-summary.ts` is used instead
 *   - the validated text is returned to the browser in `x-summary-text`, so the shown and
 *     spoken sentences are byte-identical and an unvalidated model answer is never shown
 *   - one Groq attempt and one Timbre call are reserved before use; no provider call is
 *     made at a daily cap
 *   - any failure, cap or provider error returns the approved text instead of audio
 */

import { withSupabase } from "@supabase/server";
import { preflight, withCors } from "../_shared/cors.ts";
import { AppError, toErrorCode } from "../_shared/errors.ts";
import { consoleLogger } from "../_shared/logging.ts";
import { synthesize } from "../_shared/timbre.ts";
import { QUESTIONS } from "../_shared/questions.ts";
import { getQuestion as getBankQuestion } from "../_shared/intake/question-bank.ts";
import { reserveUsage } from "../_shared/usage.ts";
import type { RpcClient } from "../_shared/usage.ts";
import { MAX_ANSWER_TURNS } from "../_shared/conversation.ts";
import { requireOwnedRow } from "../_shared/auth.ts";
import { isSystemMessageId, systemMessageText, type SystemMessageId } from "../_shared/messages.ts";
import { MAX_SUMMARY_CHARACTERS, renderHindiSummary } from "../_shared/doctor-summary.ts";
import { phraseDoctorSummary } from "../_shared/doctor-summary-llm.ts";
import { resolveSpeakTarget } from "../_shared/speak-target.ts";

interface SpeakRequest {
  session_id?: unknown;
  question_id?: unknown;
  /**
   * Owner-approved system message id (completion acknowledgement, report-section
   * instruction, send confirmation). Exactly one of `question_id` / `message_id` /
   * `summary_facts` is accepted; free text is never accepted.
   */
  message_id?: unknown;
  /**
   * Doctor-assistant summary facts (see `_shared/doctor-summary.ts`).
   *
   * The browser cannot send text: it sends the same fixed, validated fact shape that the
   * summary screen is rendered from, and this function renders the Hindi sentence itself.
   * That keeps the endpoint useful for the doctor assistant without turning `speak` into
   * an arbitrary text-to-speech proxy.
   */
  summary_facts?: unknown;
}

function corsConfig(): string | null {
  return Deno.env.get("ALLOWED_ORIGINS") ?? null;
}

function textFallback(message: string, status = 200): Response {
  return Response.json({ text: message }, { status });
}

/** Text-only response for a summary: the browser shows exactly this sentence. */
function summaryFallback(
  text: string,
  source: "qwen" | "fallback",
  status = 200,
  reason?: string,
): Response {
  return Response.json({ text, source, ...(reason ? { reason } : {}) }, { status });
}

/** Header-safe encoding of the Hindi sentence (HTTP headers are not UTF-8 safe). */
function encodeSummaryHeader(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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

    // Exactly one target: a session question, one allowlisted system message id, or one
    // validated doctor-summary fact set. Free text is never one of the targets.
    const target = resolveSpeakTarget(body);
    if (!target) return textFallback("", 400);

    try {
      const admin = ctx.supabaseAdmin;

      if (target.kind === "summary") {
        const facts = target.facts;

        // Doctor-only: an account without a `doctor_profiles` mapping gets no audio.
        //
        // This read uses the caller-scoped client, not the elevated one: the
        // `doctor_profiles_read_self` policy is the authority, and `service_role`
        // deliberately holds no SELECT grant on this table (migration
        // 20261103205132). Using RLS here also means a failed read refuses the request.
        const { data: mapping, error: mappingError } = await ctx.supabase
          .from("doctor_profiles")
          .select("doctor_id")
          .eq("user_id", userId)
          .maybeSingle();
        if (mappingError || !mapping || typeof mapping.doctor_id !== "string" || mapping.doctor_id.length === 0) {
          return textFallback("", 403);
        }

        // Stage B: the model only phrases Stage A facts. Anything unsupported is rejected
        // and the deterministic renderer below becomes the authoritative sentence.
        let summaryText = renderHindiSummary(facts);
        let summarySource: "qwen" | "fallback" = "fallback";
        let modelAttempts = 0;
        // Stable rejection/provider code (never model text). Returned only as a diagnostic.
        let modelReason: string | undefined;

        const groqKey = Deno.env.get("GROQ_API_KEY") ?? "";
        if (groqKey) {
          const reservation = await reserveUsage(admin, "groq");
          if (!reservation.allowed) {
            consoleLogger.info("usage_capped", { counter: "groq", provider: "groq" });
          } else {
            const phrasing = await phraseDoctorSummary(facts, {
              apiKey: groqKey,
              baseUrl: Deno.env.get("GROQ_BASE_URL") ?? undefined,
              timeoutMs: 8_000,
            });
            modelAttempts = phrasing.attempts;
            if (phrasing.ok) {
              summaryText = phrasing.text;
              summarySource = "qwen";
            } else {
              modelReason = phrasing.reason;
            }
            // Reason codes only: never the rejected sentence or any patient content.
            consoleLogger.info("provider_attempt", { provider: "groq", ok: phrasing.ok, reason: phrasing.ok ? "ok" : phrasing.reason });
          }
        }

        // Metadata only: never the sentence, a patient field or a provider body.
        consoleLogger.info("action_completed", {
          action: "doctor_summary",
          context: facts.context,
          source: summarySource,
          attempts: modelAttempts,
          ...(facts.context === "dashboard" ? { intent: facts.intent } : {}),
        });

        if (!summaryText || summaryText.length > MAX_SUMMARY_CHARACTERS) {
          return summaryFallback(summaryText, summarySource, 200, modelReason);
        }
        // The assistant is Hindi-only, so the language is fixed here, never client-supplied.
        return await synthesizeOrFallback(admin, "doctor-summary", summaryText, "hi", {
          text: summaryText,
          source: summarySource,
          reason: modelReason,
        });
      }

      const { data: session } = await admin
        .from("sessions")
        .select("id, user_id, status, answer_turn_count, current_question_id, language")
        .eq("id", target.sessionId)
        .maybeSingle();

      requireOwnedRow(session, userId);

      const row = session as {
        status: string;
        answer_turn_count: number;
        current_question_id: string | null;
        language: "en" | "hi";
      };

      if (target.kind === "message") {
        // System messages are independent of the current question and of the turn cap;
        // they are only refused for an emergency session, which has its own guidance.
        const language = row.language ?? "en";
        if (row.status === "emergency") {
          return textFallback(systemMessageText(target.messageId, language), 200);
        }
        return await synthesizeOrFallback(
          admin,
          `msg-${target.messageId}`,
          systemMessageText(target.messageId, language),
          language,
        );
      }

      const questionId = target.questionId;

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
  /** Doctor summary only: the exact validated sentence and where it came from. */
  summary?: { text: string; source: "qwen" | "fallback"; reason?: string },
): Promise<Response> {
  const reservation = await reserveUsage(admin, "timbre");
  if (!reservation.allowed) {
    consoleLogger.info("usage_capped", { counter: "timbre", provider: "timbre" });
    return summary ? summaryFallback(summary.text, summary.source, 200) : textFallback(text, 200);
  }

  const apiKey = Deno.env.get("GNANI_API_KEY") ?? "";
  if (!apiKey) {
    consoleLogger.error("provider_failure", { provider: "timbre", reason: "missing_key" });
    return summary ? summaryFallback(summary.text, summary.source, 200) : textFallback(text, 200);
  }

  const result = await synthesize(
    { apiKey, endpoint: Deno.env.get("TIMBRE_ENDPOINT") ?? undefined },
    { text, language: language === "hi" ? "hi-IN" : "en-IN" },
  );

  consoleLogger.info("provider_attempt", { provider: "timbre", ok: result.ok });

  if (!result.ok) {
    return summary ? summaryFallback(summary.text, summary.source, 200) : textFallback(text, 200);
  }

  const audioBuffer = result.audio.buffer.slice(
    result.audio.byteOffset,
    result.audio.byteOffset + result.audio.byteLength,
  ) as ArrayBuffer;
  const headers: Record<string, string> = {
    "Content-Type": result.contentType,
    "Cache-Control": "no-store",
  };
  if (summary) {
    // The browser displays exactly this sentence, so audio and screen cannot disagree.
    headers["x-summary-text"] = encodeSummaryHeader(summary.text);
    headers["x-summary-source"] = summary.source;
    if (summary.reason) headers["x-summary-reason"] = summary.reason;
  }
  return new Response(audioBuffer, { status: 200, headers });
}

function questionTextFor(questionId: string, language: "en" | "hi"): string {
  const question = QUESTIONS[questionId as keyof typeof QUESTIONS];
  if (!question) return "";
  return language === "hi" ? question.hi : question.en;
}
