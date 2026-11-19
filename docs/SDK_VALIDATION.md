# SDK live validation matrix (M1)

Machine: Windows 11 Pro x64 (26200), Integrated Webcam, Node 24.17.0. SDK version: 3.5.0.
Status: ☐ not run · ✅ verified live · ⚠ partial/unreliable · ❌ fails. Only fill from real probe runs.
Session 1: 2026-11-17, 2 cycles, voiced prompts, log `tools/sdk-probe/logs/probe-2026-11-17T03-08-47-820Z.jsonl` (local only).

| # | Check | How | Result | Evidence (probe log summary) |
|---|---|---|---|---|
| 1 | SDK loads, version | probe start | ✅ | 3.5.0 loads headless on win32-x64 (2026-11-16) |
| 2 | Camera enumeration | `--list-cameras` | ✅ | 1 camera: Integrated Webcam, facing=unknown |
| 3 | Auth OK with key, telemetry off | start | ✅ | Key accepted, models fetched, telemetry off. One transient server 503 "Model not available. Please retry" (expressions-inference) on first try → game must handle + retry |
| 4 | Device readiness verdict | `--readiness` | ✅ | run 1 inconclusive (server 503); run 2 ready "Qualified" |
| 5 | processingStatus reaches kRunning | start | ✅ | kRunning ~5–7 s after start(); first metrics 4–6 s |
| 6 | validationStatus feedback | session | ✅ | kTooDark, kFaceTooLow, kMultipleFacesFound, kExcessiveMotion, kNoFaceFound observed |
| 7 | Metric emit rate / samples per slice | stats | ✅ | ~26–28 emits/s; ~1 expression + 1 blink sample per emit; 32 ms spacing (~31 Hz) |
| 8 | NEUTRAL baseline | neutral phases | ⚠ | NEUTRAL weak (mean 30–35%); ANGRY false-high at rest (mean 25–34%, max 96%), SAD ~23% → never use ANGRY/SAD as controls |
| 9 | HAPPY (big smile) | prompted | ✅ | ≥60% in 43–51% of smile frames, **0%** of neutral/blink frames; ≥60 for 5 frames 2.9–3.7 s after spoken prompt (incl. reaction); release <30 in 2.2–2.9 s |
| 10 | SURPRISE | prompted + coached retest | ✅ | Session 1: weak (1%/10% ≥50). Retest with live preview + coaching ("eyebrows up, big O"): ≥50 in 28% of frames, ≥40 in 31%; **0%** in neutral/talking/smile phases; lingers 11–18% into the following rest phase |
| 11 | DISGUST | prompted | ❌ | Max 7.7 / 9.2 during attempts; never ≥20 → not usable here |
| 12 | BLINKING | 2×5 deliberate blinks | ❌ | 0 detections during blink phases; 13 detected samples of 3648 total → not usable |
| 13 | Gesture latency | stats | ⚠ | ≤3–4 s prompt→threshold incl. voice + human reaction; pure SDK latency not isolated |
| 14 | stopAsync releases camera | manual | ✅ | stopAsync resolves in 330–414 ms; owner confirmed camera LED turns off after each run |
| 15 | Restart in same process | `--cycles 2` | ✅ | Both cycles reached kRunning, errors=[] |
| 16 | Second camera consumer (preview, D-002) | — | n/a | Not needed: preview uses SDK `videoOutput` (row 19) |
| 17 | TALKING | retest | ❌ | Detected 46% while talking but also 64% during surprise and rest-after-surprise → too noisy for a discrete control |
| 18 | FACE_LANDMARKS | retest | ⚠ | 478 points (MediaPipe-style mesh). Inner-lip (13/14) ÷ face height (10/152) did NOT separate the mouth-open phase (p90 0.030 vs neutral 0.041) → inconclusive; not pursued |
| 19 | Local preview from videoOutput | retest | ✅ | Main-process `videoOutput` frames rendered in a local page (no second camera consumer needed) → resolves D-002 preview risk |

Retest log: `probe-2026-11-17T03-37-52-584Z.jsonl` (local only).

## Gameplay decision (owner approved direction 2026-11-17)
Controls: **HAPPY** (smile) = primary; **SURPRISE** (eyebrows up + big O mouth) = second. DISGUST, BLINKING, TALKING rejected.
Keyboard alternatives for both. Initial thresholds (tune in M3):
- HAPPY fires at ≥60 for ≥5 consecutive samples (~160 ms); re-arm after <30 for ≥5 samples.
- SURPRISE fires at ≥40 for ≥5 consecutive samples; re-arm after <20 for ≥8 samples (it lingers).
- Coaching UI with live preview + confidence bar is required (it measurably improved SURPRISE: 1–10% → 28–31%).

## Gesture replay (2026-11-17, M4a)
Recorded HAPPY scores from both sessions replayed offline through the hysteresis detector (fire ≥60×5):
| Re-arm rule | Fires in held-smile phases (3 phases) | Fires elsewhere |
|---|---|---|
| <30 ×5 (M3 original) | 3 (one per held smile) | 1 in a rest phase right after a smile prompt + real smiles during laughing |
| <45 ×3 | 3 | same as above |
| **<45 ×8 (chosen)** | **3** | stray rest-phase re-fire gone; remaining fires were genuine smiles (owner laughing) |
Conclusion: held smiles never re-fired; faster re-arm is safe. Engine adds spray (4 s) + reload (2 s) lockout on top.

## Real-camera acceptance (2026-11-18, commit `fd3c1e0`, owner playing, ONE SDK session)
Method: genuine SDK, Integrated Webcam, normal app launch. A read-only observer on the local debug port logged on-screen state only (screens,
meter percentages, banners, the game's own counters) — no screenshots, no input. SDK console output filtered for errors; key never logged.
| Check | Result | Evidence (session clock) |
|---|---|---|
| Auth + start after consent | ✅ | camera started 804.9 s; "warming up" cleared 810.6 s (5.7 s); 0 SDK error lines; only the usual 8 SDK warnings |
| HAPPY live (practice) | ✅ | smile read 100%; practice tick 812.3 s (<2 s after first readings) |
| SURPRISE live (practice) | ✅ | 50% then 86% (threshold 40); practice tick 816.5 s; smile 0% at the same time (clean separation) |
| HAPPY → freshener in game | ✅ | first face spray 824.9 s; L1: 6 sprays, **6 triggered by face** (game counter); L2: 6/6 by face; L3 sprays continued by face |
| Held smile never re-fires | ✅ | smile 99–100% for ~9 s in L1 → spray READY but not re-triggered until the face relaxed |
| Classroom (DON'T LAUGH) live | ✅ works / hard | won 610; caught ×3 — owner's smile stayed 90–100% for most of the round (natural laughing) |
| Restaurant smile-only | ✅ | won 1880 with no window blasts (surprise peaked 43% once while smiling); customers 12→10 |
| Signal loss / fallback / restore | not tested | no signal-loss event happened during the session |
| Quit → capture stopped | ⚠ partial | quit to title 1123.7 s; game CPU then 0.4% of machine (idle). LED-off: owner confirmation pending. Windows' privacy "last used" record does not list the SDK's native capture |
| Init-failure recovery | not tested | no failure occurred; recovery path = friendly message + one-click Retry + keyboard; no auto-retry |
Credits: SDK exposes no balance API; owner can compare the Presage portal balance before/after this one session.
