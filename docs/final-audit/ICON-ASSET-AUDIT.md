# Icon and Asset Comparison Report

**Method:** the original Figma file was queried directly and the vector layers were exported as SVG (`download_assets`). Each implementation icon was then read from source and compared **by geometry** (`d=` path data), stroke width, colour, viewBox and size — not by guessing from a screenshot. Exported Figma SVGs are stored in `evidence/figma-icons/`.

Verdict legend: **MATCH** = identical vector; **CLOSE** = same concept, materially same proportions; **APPROX** = different geometry, recognisable but visibly not the approved artwork; **MISSING** = the approved asset is replaced by text or an unrelated glyph.

## 1. Summary

| Verdict | Count |
|---|---|
| MATCH (identical path data) | 3 |
| CLOSE | 6 |
| APPROX | 11 |
| MISSING | 3 |
| Not exported / visual-only check | 4 |

The owner's specific concern about "profile icons and avatar graphics" is **confirmed**: both chat avatars in the implementation are placed inside circular containers that do **not exist** in Figma, and both glyphs are different drawings.

## 2. Patient icons

| # | Element | Figma node | Figma artwork | Implementation | Verdict | Affected component |
|---|---|---|---|---|---|---|
| I-01 | Microphone (recording) | `81:134` | 28×28, stroke white 1.8, capsule mic + arc + stand, two paths | **Identical path data** (`ConversationView.tsx:693-703`) | **MATCH** | `ConversationView` |
| I-02 | Back arrow | `98:38` | 25×25, `M14.5834 19.7917L7.29169 12.5L14.5834 5.20834M7.29169 12.5H21.875`, stroke #1F2A44 1.8 | `M14.5833 19.7917L7.29167 12.5L14.5833 5.20833M7.29167 12.5H21.875`, stroke currentColor (#1f2a44) 1.8 (HEAD `BackButton.tsx:35-40`) | **MATCH** (at HEAD; missing entirely at base) | all non-home screens |
| I-03 | Waveform | `81:92` | 35 bars, 3 px wide, heights 8,12,18,10,23,30,14,21,34,18,10,25,36,17,10,22,31,14,8,20,30,16,9,23,34,18,10,25,32,14,8,17,11,7,13 | `FIGMA_WAVEFORM_HEIGHTS` is the same 35-value array (`ConversationView.tsx:108-110`) | **MATCH** | `ConversationView` |
| I-04 | Type / keyboard | `81:129` | Rounded-rect keyboard 3.5,7→24.5,21 with **8 key dots and a spacebar line** | Different keyboard: `M3 10h18M3 14h18m-9-4v8m-4-8v8m8-8v8M5 6h14a2 2 0 012 2v8...` (grid with vertical dividers, no key dots) (`ConversationView.tsx:661`) | **APPROX** | Conversation Type button; Welcome "Type Instead" |
| I-05 | Done / stop | `81:138` | 14×14 rounded square at 7,7 rx 2.33, stroke 1.8 (28 viewBox) | `<rect x=5 y=5 width=14 height=14 rx=2 strokeWidth=2>` in a 24 viewBox → ~11.7 px, stroke 2 | **CLOSE** | Conversation Done button |
| I-06 | Assistant avatar | `81:70` | 30×30 **bare line-art robot**: head rect 6.25,8.75→23.75,23.75, antenna, two 1.2 px eye strokes, mouth line, two side "ear" tabs at x 3.75 / 26.25. **No container.** | 30 px white/opaque **circle** containing a 16 px robot: rect with `rx=4`, **filled** eye dots, no mouth, no ears (`ConversationView.tsx:499-509`, `ConsentView.tsx:36-43`) | **APPROX** | Conversation, Consent |
| I-07 | Patient avatar | `81:76` | 28×28 **bare line-art person** (head circle r≈4.1 + shoulders arc), stroke #1F2A44 1.8, **no container** | 28 px white **circle** with a 16 px person glyph (`ConversationView.tsx:520-526`) | **APPROX** | Conversation |
| I-08 | Brand mark | `81:4` + `81:5` | 30×30 navy rounded square containing a **text** plus (`brand/plus`, 30×26) | `div` 30×30, `rounded-[9px]`, bg #1f2a44, literal `+` at font-size 22/700 (`PatientHeader.tsx:28-33`) | **CLOSE** — faithful because the source is also text, but the glyph metrics (font size/weight/optical centring) are not the same as the Figma text node | header on every patient screen |
| I-09 | Feature icon — microphone | `81:15` | 24×24 stroke 1.8 | Lucide-style mic, stroke 1.8 | **APPROX** | Welcome feature 1 |
| I-10 | Feature icon — pencil | `81:20` | 24×24 `M4 17.5V20H6.5L18 8.5L15.5 6L4 17.5Z` + `M14.5 7L17 9.5` (pencil with a separate eraser line) | Heroicons pencil `M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5...` — different geometry, no eraser line (`WelcomeView.tsx:60`) | **APPROX** | Welcome feature 2 |
| I-11 | Feature icon — calendar | `81:25` | 24×24 rect 3,5→21,21 + `M16 3V7M8 3V7M3 10H21` | `M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z` (rule at y=11, shorter) (`WelcomeView.tsx:66`) | **APPROX** | Welcome feature 3 |
| I-12 | Report edit affordance | `81:309` etc. (16×16 pencil, stroke #4A5470 1.8) | 16×16 pencil | **The word "Edit"** in 12 px semibold text (`ReportReviewView.tsx:100-106` and 8 more) | **MISSING** | Report review, 9 rows |
| I-13 | Send (What we heard) | `81:237` | 22×22 paper-plane, white stroke 1.8 | The text string `→ Send` (`WhatWeHeardView.tsx:61`) | **MISSING** | What we heard |
| I-14 | Check / success circle | (confirmation frames) | 92×92 soft-green circle with a check | 56 px circle (`w-14 h-14`) with a check | **APPROX** (size 56 vs 92) | Confirmations |
| I-15 | Emergency warning | — | no icon; the frame is typographic (title + paragraph + 112) | no icon | n/a | Emergency |

## 3. Doctor icons

| # | Element | Figma node | Figma artwork | Implementation | Verdict |
|---|---|---|---|---|---|
| I-16 | Nav — Dashboard | `82:35` | 23×23, four rounded squares (2×2), stroke 1.8 | four rounded squares (Lucide layout-grid), stroke 1.8 | **CLOSE** |
| I-17 | Nav — Reports | `82:42` | 23×23 document with folded corner + two ruled lines | document with folded corner + two ruled lines, stroke 1.8 | **CLOSE** (different path, same concept) |
| I-18 | Nav — Appointments | `82:47` | 23×23 calendar with two top ticks and a header rule | calendar, stroke 1.8 | **CLOSE** |
| I-19 | Nav — Urgent | `82:52` | 23×23 warning triangle with exclamation | warning triangle with exclamation, red-tinted | **CLOSE** |
| I-20 | Doctor avatar | `82:57` | 42×42 circle with a visible ring + initials text | 42 px `rounded-[21px]` circle, `#e4e8f2` fill, no ring | **APPROX** |
| I-21 | Report row avatar | `82:79` etc. | 38×38 circle with ring + initials | 38 px filled circle + initials | **APPROX** |
| I-22 | Row chevron / "Open" | none | chevron `>` only | chevron in dashboard; **"Open →" text link** in the reports table; **"Open" button** in urgent list | **APPROX / divergent** |
| I-23 | Password reveal (eye) | (login form) | eye glyph inside the password field | **absent** | **MISSING** |

## 4. Assets that do not exist at all

| Asset | Expected by | Actual |
|---|---|---|
| Cached greeting audio (`public/audio/*.mp3` or `.wav`) | AGENTS.md "Play the pre-generated greeting"; cached ask-name/ask-age/ask-gender/ask-primary-concern | **No `public/` directory in the repository.** No audio file is referenced anywhere in `src/`. The consent "play" control only toggles a label for 2.5 s. |
| Logo / brand illustration beyond the plus mark | — | none in Figma either (the file has no raster images) |
| Doctor portraits | — | none in Figma; initials are correct |
| Empty-state illustrations | — | none in Figma |

## 5. Specific recommendation

Do **not** replace these with "a Lucide icon that means the same thing". The correct fix is to paste the exported SVG paths from `evidence/figma-icons/*.svg` into the components (the mic, back arrow and waveform already prove this is straightforward), and to remove the circular containers around the chat avatars so the bare line-art robot and person render as designed.

Priority: I-06/I-07 (avatars — owner-flagged), I-12 (edit pencils), I-13 (send), I-04 (keyboard), then the remaining APPROX items.
