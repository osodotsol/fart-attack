# PRD — Fart Attack! (v2, 2026-11-17)

> v2 changes (owner-approved): timed freshener activation; story "The Great Stink Disaster" (skippable cutscenes, FRESHBOT 3000
> guide, Bean Kid); 3 levels — L1 Living Room (smile), L2 Classroom "DON'T LAUGH!" (teacher cycle; penalty only on NEW
> activations while watching), L3 Restaurant (mega farts every 3rd, customers leave above stink 60, smile-only completable,
> SURPRISE windows optional); finale with rank title; original synthesized audio + mute (M key). Numbers: src/game/levels.ts.

**Pitch:** A cartoon fart cloud is taking over the room. Your face is the controller: **smile** to pump the air
freshener, pull a **surprised** face to blast the windows open. Powered by live SmartSpectra facial-expression output.
Evidence for control choices: `SDK_VALIDATION.md`, decision D-005.

## Players & context
Anyone at a Windows laptop with a webcam; judges trying it once for 2–3 minutes. Must work first try without a developer.

## Screens (in order)
1. **Title** — name, tagline, Play button, small "How your camera is used" link.
2. **Consent** — plain-language disclosure (see Privacy below); buttons "Turn on camera & continue" / "Play with keyboard only".
3. **Camera warm-up & practice** — mirrored self-view, live HAPPY and SURPRISE bars with threshold markers,
   validation hint ("Move into the light", "Centre your face"). Player must trigger each gesture once (or skip).
   Warm-up message while SDK starts (~5–7 s).
4. **Game** — room scene, character, growing green cloud, stink meter, score, round timer, small self-view with bars,
   control legend (😄 smile / J key = Freshener, 😮 surprise / K key = Windows), "SIMULATION" never shown in real mode.
5. **Level select** — 3 level cards (unavailable ones marked "Coming soon").
6. **Level complete** — win/lose, score + bonus, best this session, Continue (next level) / Play again / Levels / Quit camera.
   Pause menu in-game also offers Quit (camera off).

## Core loop (per level; numbers live in src/game/levels.ts)
- Stink 0–100. Lose at 100; win if the round timer ends below 100. Win bonus = (100 − stink) × 10.
- Farts at random intervals add stink; passive growth ramps up across the round.
- **Freshener (HAPPY / J / Space):** one short recognised smile → sprays for **4 s** (drains 6 stink/s) while the
  player relaxes → **2 s** reload. Activation attempts during spray/reload are rejected (no stacking). +100 points.
- **Windows (SURPRISE / K), only in levels that enable it:** −35 stink instantly, 6 s cooldown, +250 points.
- Combo: re-using a tool within 2.5 s of the previous effect ending → ×1.5, ×2 … max ×3.
- Level 1 Living Room (45 s, smile only): simulated keyboard-equivalent play wins with ≤10 activations (unit test).

## Gesture recognition (SDK → events)
Expression scores (0–100) arrive ~31 Hz. Per gesture a hysteresis state machine:
| Gesture | Fire when | Re-arm when | Notes |
|---|---|---|---|
| HAPPY | ≥ 60 for 5 consecutive samples | < 45 for 8 consecutive samples | replay of recorded data: held smile fires once |
| SURPRISE | ≥ 40 for 5 consecutive samples | < 20 for 8 consecutive samples | lingers after the face relaxes |
- Samples are ignored (and counters reset) when validation ≠ OK, no face, or the stream stalls > 500 ms.
- Thresholds live in one config object; tuned in M3/M4 with real play, recorded in SDK_VALIDATION.md.
- Keyboard always works in parallel. Keyboard-only mode never starts the camera.

## Error & fallback behaviour
| Situation | Behaviour |
|---|---|
| No API key | Consent screen explains; keyboard-only still playable |
| Auth/network/server 503 | Friendly message + Retry button (auto-retry once); keyboard-only offered |
| Camera unavailable/denied | Message + keyboard-only offered |
| Validation not OK during play | Hint banner over self-view; gestures paused; game keeps running (keyboard works) |
| Signal lost > 2 s mid-round | Auto-pause with "We lost your face" overlay; resume on return or keypress |
| Quit / window close | SDK `stopAsync` + `destroy`, camera released |

## Privacy (shown on consent screen; must match code)
Camera frames are processed by the SmartSpectra SDK on this computer. No video or face data is saved or sent by
this game. The SDK contacts Presage servers to verify the API key and download models; SDK telemetry is turned off.
Expression readings are estimates of facial movement, not of how you feel. Stop any time with "Quit camera".
Only "best score this session" is kept in memory; nothing is written to disk. Spoken story uses voices built into Windows that run
on this computer (offline-only voices are used; story text is never sent anywhere). Audio switches (sound / voice / music) are not saved.

## Out of scope (MVP)
Multiple rooms, accounts, online leaderboards, persistence, audio beyond simple effects (M4), DISGUST/BLINK/TALKING controls.

## Acceptance criteria (M3 = items 1–6, M4/M5 = rest)
1. App launches on Windows with `npm.cmd start`; Electron hardening (context isolation, sandbox, strict CSP, navigation/popup denial, denied web permissions) verified in code.
2. API key read only in main; renderer bundle contains no key (grep verified).
3. Real camera: practice screen shows self-view + live bars; HAPPY fires the freshener in-game.
4. One full round playable to win or lose, then Play again works (SDK restarted or reused without error).
5. Keyboard-only round playable with camera off.
6. Unit tests pass for gesture state machine, game engine, metrics normaliser.
7. SURPRISE fires windows in real play; cooldown ring visible.
8. All error rows above handled; Quit releases camera (LED off).
9. First-time user completes practice + a round with no help.
10. Reduced-motion + mute toggles.
