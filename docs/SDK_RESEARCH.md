# SmartSpectra SDK research (docs-derived — NOT yet live-verified)

Sources read 2026-11-16: smartspectra.presagetech.com/docs/{nodejs, nodejs/api-reference, nodejs/metrics,
device-readiness, agent-skill, data-types}; GitHub `Presage-Security/SmartSpectra/nodejs/samples/electron-quickstart`.
npm registry: `@smartspectra/node-sdk` latest **3.5.0** (rc 3.5.0-rc.5), engines node >=20, licence "SEE LICENSE IN LICENSE".
Live verification status lives in `SDK_VALIDATION.md`. Installed `.d.ts` files override this doc where they differ.

## Packaging
- Native runtime in per-platform package `@smartspectra/node-sdk-win32-x64`; DLLs resolve from adjacent dir;
  no node-gyp / electron-rebuild. Electron >= 28. Packaged apps must ship the DLL outside asar and set
  `SMARTSPECTRA_CAPI_PATH` (quickstart sets `resources/smartspectra/smartspectra_capi.dll`).
- Entry points: `@smartspectra/node-sdk` (main/headless), `/main` (`bindSmartSpectraIpc(win)`),
  `/preload` (contextBridge `window.__smartspectraBridge`), `/renderer` (`SmartSpectraSDK`, MediaStream frame pump),
  `/messages` (`decodeMetrics`, renderer-safe).
- Quickstart sample: Electron 43.8.1, esbuild, sample code licensed `LicenseRef-Proprietary` (do not copy verbatim).

## Construction & lifecycle (main/headless)
`new SmartSpectraSDK({ apiKey, requestedMetrics, enableAccumulatedOutput, logLevel, enableTelemetry })`
- `enableTelemetry` default **true** → we set `false` (telemetry = session summaries + readiness reports; no frames/vitals).
- `static availableCameras(): CameraInfo[]` `{id, name, facing, lensType}`. Windows: `CameraSelection.front/.back`
  fail with `kInputUnavailable` → use `CameraSelection.default` or `.byId(id)`.
- `useCamera(sel)`, `start()`, `stopAsync()` (preferred; `stop()` blocks), `reset()` (after kError; throws kInvalidState
  while stopAsync pending), `destroy()` (idempotent), `checkDeviceReadiness()` → `{verdict: ready|limited|blocked|inconclusive, reason}`
  (camera input only; not during active measurement).
- `requestedMetrics` fixed at construction → destroy + rebuild to change.
- Events (`on` — each call REPLACES the previous listener for that event):
  `processingStatus(kUninitialized0|kIdle1|kStarting2|kRunning3|kStopping4|kError5)`,
  `validationStatus(code, timestampUs, hint)` (kOk0, kNoFaceFound1, kMultipleFacesFound2, kFaceNotCentered3,
  kFaceSizeOutOfRange4, kTooDark5, kTooBright6, kCameraTuning10, kFrameRateTooLow11, kExcessiveMotion12,
  kFaceTooClose13 … kFaceNotForward17), `metrics(buf, timestampUs)` (windowed slice since last emit),
  `error(code, message, retryable)` (kAuthenticationFailed2, kCreditExhausted4, kNetworkError5, kInputUnavailable7,
  kMetricNotAuthorized13, kSustainedLowFrameRate14 …), `videoOutput(...)` (main only).
- Network required for server-validated auth. Hostnames, trial credit amounts, metric update rate: **not documented**.

## Face metrics
`faceMetrics` bundle = `FACE_LANDMARKS, BLINKING, TALKING, EXPRESSIONS`. Decode with `decodeMetrics(buf)` →
`metrics.face.{blinking[], talking[], landmarks[], expression[]}`.
- Expression: `{ stable: bool, timestamp: int64 µs, scores: [{ type: ExpressionType, confidence: float 0–100 }] }`.
  ExpressionType: ANGRY1 CONTEMPT2 DISGUST3 FEAR4 HAPPY5 NEUTRAL6 SAD7 SURPRISE8. No "dominant" field — we compute argmax.
- Blinking: `DetectionStatus { detected: bool, stable: bool, timestamp }` — per-sample boolean; a "blink event"
  must be derived by us (rising edge). Sample rate unknown → must measure (a blink is ~100–300 ms).
- Face `stable` thresholds undocumented.

## Open questions for M1 (answer in SDK_VALIDATION.md)
1. Does headless main-process `useCamera` work on this Windows webcam? 2. Metric emit rate & latency.
3. Per-expression separability (DISGUST/SURPRISE/HAPPY vs NEUTRAL) and confidence ranges.
4. Can BLINKING catch a deliberate blink at the emit rate? 5. Meaning of `stable` in practice.
6. Does a `metrics` slice contain multiple samples? 7. Start/stop/restart cleanliness; camera LED release.
8. Is `faceMetrics` authorized on the trial key (kMetricNotAuthorized?). 9. Credit consumption per session.
