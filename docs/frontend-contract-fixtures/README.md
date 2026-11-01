# Frontend contract fixtures

Generated from the backend builders — do not hand-edit.

```bash
deno run --allow-read --allow-write scripts/export-contract-fixtures.ts   # regenerate
deno run --allow-read scripts/export-contract-fixtures.ts --check         # validate
```

| File | Covers |
|---|---|
| `start-session.json` | `start_session` first response |
| `consent.json` | consent version, wording, language |
| `question-core.json` | scripted core question |
| `question-adaptive-en.json` / `-hi.json` | bank question with localized options |
| `question-adaptive-yes-no.json` | yes/no bank question |
| `transcript-preview.json` | audio confirmation, turn count unchanged |
| `draft-report.json` | report v1.2, gender declined |
| `submitted-report.json` | submitted row + intake reference |
| `urgent-partial-report.json` | emergency report, `summary: null` |
| `resume-session.json` | resume envelope |
| `mark-reviewed.json` | RPC result |
| `available-slots.json` | `get_available_slots` rows |
| `booking-success.json` | `book_appointment` result |
| `booking-conflict.json` | PostgREST `23505` error shape |
| `auth-failure.json` | 401 envelope |
| `demo-busy.json` | global session cap |

Validation asserts: no competing `pending_transcript` field, localized options on adaptive
fixtures, the required `ChatTurnResponse` keys and the gender `declined` invariant.
