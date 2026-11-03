import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getAppMode,
  setAppMode,
  getAvailableSlots,
  bookAppointment,
  markReportReviewed,
  startSession,
  resumeSession,
  recordConsent,
  chatTurn,
  correctDraftReport,
  submitReport,
  ApiError,
} from '../src/lib/api';
import { setSupabaseClient } from '../src/lib/supabase';
import { SupabaseClient } from '@supabase/supabase-js';
import { CONSENT_VERSION } from '../src/types/consent';

describe('Supabase Mode & RPC Wiring Tests', () => {
  let originalMode = getAppMode();

  beforeEach(() => {
    originalMode = getAppMode();
  });

  afterEach(() => {
    setSupabaseClient(null);
    setAppMode(originalMode);
  });

  it('1. App mode toggle works and does not mutate global state unexpectedly', () => {
    setAppMode('mock');
    assert.equal(getAppMode(), 'mock');

    setAppMode('supabase');
    assert.equal(getAppMode(), 'supabase');

    setAppMode('mock');
    assert.equal(getAppMode(), 'mock');
  });

  it('2. get_available_slots RPC: argument shaping, success mapping, and SQLSTATE errors', async () => {
    setAppMode('supabase');

    let capturedRpcName = '';
    let capturedRpcArgs: any = null;

    // Test Success
    const mockClientSuccess = {
      rpc: async (fn: string, args: any) => {
        capturedRpcName = fn;
        capturedRpcArgs = args;
        return {
          data: [
            {
              slot_start: '2026-11-04T09:30:00+05:30',
              slot_end: '2026-11-04T10:00:00+05:30',
            },
          ],
          error: null,
        };
      },
    } as unknown as SupabaseClient;

    setSupabaseClient(mockClientSuccess);

    const slots = await getAvailableSlots('rep-uuid-1234', 14);
    assert.equal(capturedRpcName, 'get_available_slots');
    assert.deepEqual(capturedRpcArgs, { p_report_id: 'rep-uuid-1234', p_days: 14 });
    assert.equal(slots.length, 1);
    assert.equal(slots[0].id, '2026-11-04T09:30:00+05:30');
    assert.equal(slots[0].is_available, true);
    assert.equal(slots[0].date, '2026-11-04');

    // Test 42501: Review Hold
    setSupabaseClient({
      rpc: async () => ({
        data: null,
        error: { code: '42501', message: 'report is held pending review' },
      }),
    } as unknown as SupabaseClient);

    await assert.rejects(
      async () => await getAvailableSlots('rep-uuid-1234', 14),
      /Booking paused until a doctor reviews this report/
    );

    // Test 22023: Ineligible (draft/emergency)
    setSupabaseClient({
      rpc: async () => ({
        data: null,
        error: { code: '22023', message: 'not eligible' },
      }),
    } as unknown as SupabaseClient);

    await assert.rejects(
      async () => await getAvailableSlots('rep-uuid-1234', 14),
      /Not eligible for routine booking/
    );

    // Test P0002: Not found / not owned
    setSupabaseClient({
      rpc: async () => ({
        data: null,
        error: { code: 'P0002', message: 'not found' },
      }),
    } as unknown as SupabaseClient);

    await assert.rejects(
      async () => await getAvailableSlots('rep-uuid-1234', 14),
      /Report not found or not owned/
    );
  });

  it('3. book_appointment RPC: argument shaping, success mapping, and SQLSTATE errors', async () => {
    setAppMode('supabase');

    let capturedRpcName = '';
    let capturedRpcArgs: any = null;

    // Test Success
    const mockClientSuccess = {
      rpc: async (fn: string, args: any) => {
        capturedRpcName = fn;
        capturedRpcArgs = args;
        return {
          data: [
            {
              appointment_id: 'apt-uuid-999',
              reference_code: 'APT-20261104-ABC123',
              slot_start: '2026-11-04T10:00:00+05:30',
              slot_end: '2026-11-04T10:30:00+05:30',
              doctor_id: 'doc-gen-med-01',
              already_booked: false,
            },
          ],
          error: null,
        };
      },
    } as unknown as SupabaseClient;

    setSupabaseClient(mockClientSuccess);

    const res = await bookAppointment({
      report_id: 'rep-uuid-1234',
      slot_start: '2026-11-04T10:00:00+05:30',
      patient_name: 'Test Patient',
    });

    assert.equal(capturedRpcName, 'book_appointment');
    assert.deepEqual(capturedRpcArgs, {
      p_report_id: 'rep-uuid-1234',
      p_slot_start: '2026-11-04T10:00:00+05:30',
    });
    assert.equal(res.reference_code, 'APT-20261104-ABC123');
    assert.equal(res.appointment.id, 'apt-uuid-999');
    assert.equal(res.already_booked, false);

    // Test 23505: Slot conflict / duplicate
    setSupabaseClient({
      rpc: async () => ({
        data: null,
        error: { code: '23505', message: 'slot is no longer available' },
      }),
    } as unknown as SupabaseClient);

    await assert.rejects(
      async () =>
        await bookAppointment({
          report_id: 'rep-uuid-1234',
          slot_start: '2026-11-04T10:00:00+05:30',
        }),
      /That slot was just taken\. Please select another slot\./
    );

    // Test 42501: Review Hold
    setSupabaseClient({
      rpc: async () => ({
        data: null,
        error: { code: '42501', message: 'held' },
      }),
    } as unknown as SupabaseClient);

    await assert.rejects(
      async () =>
        await bookAppointment({
          report_id: 'rep-uuid-1234',
          slot_start: '2026-11-04T10:00:00+05:30',
        }),
      /Booking paused until a doctor reviews this report/
    );

    // Test 22023: Ineligible (draft/urgent)
    setSupabaseClient({
      rpc: async () => ({
        data: null,
        error: { code: '22023', message: 'not eligible' },
      }),
    } as unknown as SupabaseClient);

    await assert.rejects(
      async () =>
        await bookAppointment({
          report_id: 'rep-uuid-1234',
          slot_start: '2026-11-04T10:00:00+05:30',
        }),
      /Emergency reports are permanently ineligible for routine booking/
    );
  });

  it('4. mark_report_reviewed RPC: argument shaping, success mapping, and SQLSTATE errors', async () => {
    setAppMode('supabase');

    let capturedRpcName = '';
    let capturedRpcArgs: any = null;

    // Test Success
    const mockClientSuccess = {
      rpc: async (fn: string, args: any) => {
        capturedRpcName = fn;
        capturedRpcArgs = args;
        return {
          data: [
            {
              report_id: 'rep-uuid-5678',
              reviewed_at: '2026-11-02T14:30:00+05:30',
              reviewed_by: 'doctor-auth-uid-01',
              already_reviewed: false,
            },
          ],
          error: null,
        };
      },
    } as unknown as SupabaseClient;

    setSupabaseClient(mockClientSuccess);

    const res = await markReportReviewed('rep-uuid-5678');
    assert.equal(capturedRpcName, 'mark_report_reviewed');
    assert.deepEqual(capturedRpcArgs, { p_report_id: 'rep-uuid-5678' });
    assert.equal(res.success, true);
    assert.equal(res.report_id, 'rep-uuid-5678');
    assert.equal(res.already_reviewed, false);

    // Test 42501: Not authorised (e.g. General Medicine attempting Emergency review)
    setSupabaseClient({
      rpc: async () => ({
        data: null,
        error: { code: '42501', message: 'not authorised to review this report' },
      }),
    } as unknown as SupabaseClient);

    await assert.rejects(
      async () => await markReportReviewed('rep-uuid-5678'),
      /Not authorised to review this report/
    );

    // Test 22023: Draft report review attempt
    setSupabaseClient({
      rpc: async () => ({
        data: null,
        error: { code: '22023', message: 'report is not reviewable' },
      }),
    } as unknown as SupabaseClient);

    await assert.rejects(
      async () => await markReportReviewed('rep-uuid-5678'),
      /Draft reports cannot be reviewed/
    );

    // Test P0002: Report not found
    setSupabaseClient({
      rpc: async () => ({
        data: null,
        error: { code: 'P0002', message: 'not found' },
      }),
    } as unknown as SupabaseClient);

    await assert.rejects(
      async () => await markReportReviewed('rep-uuid-5678'),
      /Report not found/
    );
  });

  it('5. Edge Function invocation: all six chat-turn actions in Supabase mode', async () => {
    setAppMode('supabase');

    const invocations: { fn: string; body: any }[] = [];

    const mockClient = {
      auth: {
        getSession: async () => ({ data: { session: { user: { id: 'usr-123' } } } }),
        signInAnonymously: async () => ({ data: { user: { id: 'usr-123' } }, error: null }),
      },
      functions: {
        invoke: async (fn: string, options: any) => {
          invocations.push({ fn, body: options.body });
          return {
            data: {
              session_id: options.body?.session_id || 'sess-test-1',
              session_status: 'in_progress',
              turn_count: 1,
              max_turns: 15,
              is_complete: false,
              is_cap_reached: false,
              can_submit: false,
              messages: [],
            },
            error: null,
          };
        },
      },
    } as unknown as SupabaseClient;

    setSupabaseClient(mockClient);

    // Action 1: start_session
    await startSession('en');
    assert.equal(invocations[0].fn, 'chat-turn');
    assert.equal(invocations[0].body.action, 'start_session');

    // Action 2: resume_session
    await resumeSession('sess-test-1');
    assert.equal(invocations[1].fn, 'chat-turn');
    assert.equal(invocations[1].body.action, 'resume_session');

    // Action 3: record_consent
    await recordConsent('sess-test-1', true, 'en', CONSENT_VERSION);
    assert.equal(invocations[2].fn, 'chat-turn');
    assert.equal(invocations[2].body.action, 'record_consent');
    assert.equal(invocations[2].body.consent_version, CONSENT_VERSION);

    // Action 4: submit_turn
    await chatTurn({
      action: 'submit_turn',
      session_id: 'sess-test-1',
      question_id: 'name',
      text: 'Asha Sharma',
    });
    assert.equal(invocations[3].fn, 'chat-turn');
    assert.equal(invocations[3].body.action, 'submit_turn');
    assert.equal(invocations[3].body.text, 'Asha Sharma');

    // Action 5: correct_draft_report
    await correctDraftReport({
      action: 'correct_draft_report',
      session_id: 'sess-test-1',
      report_id: 'rep-1',
      updates: { 'patient.name': { value: 'Asha R. Sharma', status: 'provided' } },
    });
    assert.equal(invocations[4].fn, 'chat-turn');
    assert.equal(invocations[4].body.action, 'correct_draft_report');

    // Action 6: submit_report
    await submitReport({
      action: 'submit_report',
      session_id: 'sess-test-1',
      report_id: 'rep-1',
    });
    assert.equal(invocations[5].fn, 'chat-turn');
    assert.equal(invocations[5].body.action, 'submit_report');
  });

  it('6. Failure invariant: Supabase mode errors are re-thrown and never fall back to mock silently', async () => {
    setAppMode('supabase');

    const failingClient = {
      rpc: async () => ({
        data: null,
        error: { code: '500', message: 'Postgres network timeout' },
      }),
      functions: {
        invoke: async () => ({
          data: null,
          error: { message: 'Edge Function network partition' },
        }),
      },
      auth: {
        getSession: async () => ({ data: { session: null } }),
        signInAnonymously: async () => ({
          data: null,
          error: { message: 'Auth service down' },
        }),
      },
    } as unknown as SupabaseClient;

    setSupabaseClient(failingClient);

    // 1. Session start fails loudly
    await assert.rejects(
      async () => await startSession('en'),
      /Anonymous authentication failed: Auth service down/
    );

    // 2. Slot retrieval fails loudly without silent mock fallback
    await assert.rejects(
      async () => await getAvailableSlots('rep-uuid', 14),
      /Postgres network timeout/
    );

    // 3. Booking fails loudly without silent mock fallback
    await assert.rejects(
      async () =>
        await bookAppointment({
          report_id: 'rep-uuid',
          slot_start: '2026-11-04T10:00:00+05:30',
        }),
      /Postgres network timeout/
    );

    // 4. Review fails loudly without silent mock fallback
    await assert.rejects(
      async () => await markReportReviewed('rep-uuid'),
      /Postgres network timeout/
    );
  });

  it('7. start_session 5xx keeps the generic backend code and never invents a session', async () => {
    setAppMode('supabase');

    // Production failure shape: the Edge Function returned HTTP 500 {"error":"internal"}.
    const invokeError = {
      message: 'Edge Function returned a non-2xx status code',
      context: new Response(JSON.stringify({ error: 'internal' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    };

    let invokeCount = 0;
    let anonSignInCount = 0;

    setSupabaseClient({
      auth: {
        getSession: async () => ({ data: { session: null } }),
        signInAnonymously: async () => {
          anonSignInCount += 1;
          return { data: { user: { id: 'anon-usr-1' } }, error: null };
        },
      },
      functions: {
        invoke: async () => {
          invokeCount += 1;
          return { data: null, error: invokeError };
        },
      },
    } as unknown as SupabaseClient);

    // The failure is surfaced, not swallowed and not replaced by a mock session.
    await assert.rejects(async () => await startSession('en'), (error: any) => {
      assert.equal(error instanceof ApiError, true, 'typed ApiError');
      assert.equal(error.code, 'internal', 'backend code preserved');
      assert.equal(error.status, 500, 'HTTP status preserved');
      return true;
    });

    assert.equal(anonSignInCount, 1, 'anonymous identity is created first');
    assert.equal(invokeCount, 1, 'exactly one chat-turn attempt');

    // A missing/invalid JWT surfaces as unauthorized, still without a session.
    setSupabaseClient({
      auth: {
        getSession: async () => ({ data: { session: { user: { id: 'anon-usr-1' } } } }),
        signInAnonymously: async () => ({ data: { user: null }, error: null }),
      },
      functions: {
        invoke: async () => ({
          data: null,
          error: {
            message: 'Edge Function returned a non-2xx status code',
            context: new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }),
          },
        }),
      },
    } as unknown as SupabaseClient);

    await assert.rejects(async () => await startSession('hi'), (error: any) => {
      assert.equal(error.code, 'unauthorized', 'unauthorized preserved');
      assert.equal(error.status, 401, 'status preserved');
      return true;
    });
  });
});
