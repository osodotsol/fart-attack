# Decisions

## D-001 Stack: Electron + TypeScript + React, npm, Vitest (2026-11-16, proposed per directive)
Matches the official SDK's Electron support. esbuild/Vite for bundling (quickstart uses esbuild).

## D-002 SDK runs in the MAIN process; renderer never sees the API key (2026-11-16, proposed — validate in M1)
The official quickstart puts `apiKey` in renderer code (renderer `SmartSpectraSDK` + `bindSmartSpectraIpc`).
That contradicts our rule "no credentials in the renderer". The SDK also supports headless/main-process use
with `useCamera(CameraSelection.byId/default)`. Plan: main owns the SDK, decodes metrics, converts them to small
normalized `FaceEvent`s, and sends only those to the renderer over 2–3 narrow IPC channels.
**Risk:** camera preview. Options in order: (a) renderer `getUserMedia` preview alongside SDK capture (Windows may or
may not allow shared webcam access — test in M1); (b) downscaled `videoOutput` frames from main; (c) no live preview,
show SDK validation/face-status only. **Fallback** if main-process capture fails on Windows: official renderer bridge,
with the key passed from main at runtime (still never in source/git) — requires owner sign-off as a deviation.

## D-003 M1 probe is a headless Node script, not an Electron app (2026-11-16)
Cheapest way to answer the feasibility questions; exercises exactly the main-process API that D-002 relies on.

## D-004 Don't copy Presage sample code (2026-11-16)
Quickstart files are `LicenseRef-Proprietary`. We write our own code against the documented API; SDK itself is
consumed as an npm dependency under its licence. Licence terms must be re-checked before public release (M7).

## D-005 Controls: HAPPY + SURPRISE, with live coaching preview (2026-11-17, owner approved direction)
Evidence in SDK_VALIDATION.md. DISGUST and BLINKING (the original design) failed on real hardware; TALKING too noisy.
Live self-view + confidence bar substantially improved expression performance → becomes a core UX feature.
Preview comes from main-process `videoOutput` frames, so D-002 (SDK in main, key never in renderer) holds.

## D-006 Storyline "The Great Stink Disaster" + levels 2–3 (2026-11-17, owner-requested)
Story is data (src/game/story.ts) rendered by a comic-panel Cutscene; shown once per session, always skippable,
never on level-select replays. Level mechanics stay rule-based on verified inputs only:
Classroom penalises only NEW freshener activations while the teacher watches (no "neutral face" inference);
Restaurant is smile-only completable (unit-tested), SURPRISE/windows is an optional faster route.
Art = original inline SVG; audio = Web Audio synthesis (no asset files, no licences to track).

## D-007 Camera-free visual verification (2026-11-17)
To conserve SDK credits, UI is verified with `npm run snap`: an offscreen Electron window (no preload → no SDK/camera)
drives keyboard mode and saves screenshots. Hidden (non-offscreen) windows freeze rAF/CSS — offscreen rendering required.

## D-008 Spoken story uses the built-in speech engine, OFFLINE voices only (2026-11-17, owner-requested)
Web Speech API (Windows voices) — no paid API, no download, no dependency. Only voices flagged `localService` are used, so
story text never leaves the PC (Windows' online "Natural" voices are skipped). FRESHBOT's "funny robot" voice = pitch 2.0 +
fast rate + synthesized bleep babble; no external audio. If no local English voice exists the Voice switch is disabled and the
game is subtitle-only. Only 10 of 22 story panels are voiced (narrator, kid, robot, teacher moments), plus a few in-game lines.
Rules: one speaker at a time; same line never restarts while playing; speech stops on skip / quit / level change / pause / mute.

## D-009 Audio = three independent in-memory switches (2026-11-17)
Sound effects, Voice and Music are separate; M mutes/unmutes all. Defaults: all on, music very quiet and ducked while someone
speaks. Preferences are NOT persisted (privacy rule: nothing written to disk). Music is original, generated live (C–Am–F–G loop,
pentatonic melody) — no recorded or licensed audio anywhere. Subtitles are always visible; reduced-motion shows them instantly.

## D-010 Camera input has an explicit fallback state (2026-11-17, Codex R1)
camera → (signal stale >2 s) lost → player chooses keyboard → fallback. Fallback never changes automatically; returning to camera
needs a deliberate "Restore camera control (C)" and only works while a fresh face signal exists. See src/game/inputMode.ts.

## D-011 Revised Claude/Codex workflow (2026-11-17, owner decision — saves time and tokens)
Codex = independent milestone AUDITOR + REPAIR ENGINEER, used at major quality gates only (next: one consolidated review-and-repair
after the owner's play-test). It fixes verified defects directly (minimal and tested) instead of returning findings for
Claude to re-fix. Claude does the building and routine verification and does not request extra Codex passes. Each gate starts from a
clean local restore-point commit; one write owner at a time. Pushing/publishing still needs explicit owner approval.
