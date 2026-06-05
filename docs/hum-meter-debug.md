# Hum Meter Debug Notes

This file documents the current signal-meter math without changing product behavior.

## Storage

Saved hum sessions are read by `lib/storage.ts:getSessions()`.

- Primary writer key: `localStorage["hum:sessions"]`
- Reader behavior: scans both `localStorage` and `sessionStorage` for arrays or objects that contain hum-like feature objects, then normalizes records into `HumSession`.
- Duplicate identity preference: records from `hum:sessions` win over the same session identity found under other keys.
- Audio blobs are stored separately in IndexedDB by `lib/audioStorage.ts`, referenced by `session.audioKey`.

The normalized saved shape is `HumSession` in `types/hum.ts`: ids, timestamps, `features`, capture/quality fields, confidence, baseline fields, signal label/type, recommendation/session/action fields, feedback, metadata, ML data, and consent fields.

## Energy Meter

No baseline:

```ts
raw = clamp(inputRms / 0.06, 0, 1)
bars = max(1, min(5, round(raw * 5)))
```

With baseline:

```ts
energyRelative = inputRms / baseline.mean.inputRms
delta = log2(max(0.01, energyRelative)) / log2(1.35)
raw = centeredScore(delta)
bars = max(1, min(5, round(raw * 5)))
```

`centeredScore(delta)` clamps `delta` to `-1.5..1.5`, maps it around `0.5`, then clamps to `0.05..0.95`.

Notes:

- Energy is mostly driven by `inputRms`.
- `peakAmplitude`, `meanRms`, voiced ratio, active-frame ratio, and quiet percentage are not used directly in the meter.
- The meter is absolute before baseline and baseline-relative after baseline exists.

## Live Recording Meter

The recording screen uses a separate live microphone meter in `components/Recorder.tsx` and `lib/liveSignal.ts`. It does not use the saved-session energy meter above.

```ts
rawRms = sqrt(sum(sample * sample) / frameLength)
db = 20 * log10(max(rawRms, 0.00001))
dbProgress = clamp((db - -54) / (-24 - -54), 0, 1)
meterLevel = pow(dbProgress, 0.68)
```

Near-silent frames are gated down when `rawRms < 0.0055` and `peakAmplitude < 0.035`. The visible meter is therefore perceived-loudness weighted rather than `rawRms * constant`, so ordinary audible hums occupy a meaningful amount of the bar.

Live signal states are based on smoothed RMS with hysteresis:

- `silent`: genuinely weak or near-silent input
- `faint`: low but usable input
- `usable` / `strong`: clear signal
- `clipping`: peak amplitude or RMS indicates clipping risk

Development logging prints raw RMS, smoothed RMS, peak amplitude, mapped meter value, dB value, final signal state, clipping detection, and the quality gate value.

## Stability Meter

No baseline:

```ts
stability = average([
  smoothnessScore,
  sustainStability,
  melodicSmoothness,
  1 - clamp(amplitudeStability / 0.05, 0, 1),
])
bars = toBars(stability)
```

With baseline:

```ts
currentStability = same stability formula
baselineStability = same formula on baseline.mean
delta = (currentStability - baselineStability) / 0.22
raw = centeredScore(delta)
bars = toBars(raw)
```

If stability scores are unavailable with baseline, the fallback is `-instabilityScore`.

Notes:

- Stability does not directly use `pauseCount`, but state classification does.
- Pause count is derived from interior null pitch-track segments after short gaps are closed. Pitch-tracking dropouts can therefore create pause-related state penalties even when the actual quiet-frame ratio is low.

## Movement Meter

No baseline:

```ts
raw = clamp(pitchRange / 6 + noteChangeRate / 3 + glideScore * 0.3, 0, 1)
bars = toBars(raw)
```

With baseline:

```ts
movementDelta = average([
  zDelta(pitchRange),
  zDelta(noteChangeRate),
  zDelta(glideScore),
  abs(zDelta(pitchContourShape)) * 0.7,
])
raw = centeredScore(movementDelta)
bars = toBars(raw)
```

Notes:

- The displayed raw details may contain very large `pitchVariance`, `pitchStability`, or `jitter`.
- Movement meter does not directly use raw `pitchVariance`.
- State classification does use normalized `pitchVariance` and `jitter` through `zDelta()` with feature-specific epsilon floors.
- The meter is absolute before baseline and baseline-relative after baseline exists.

## Console Commands

In development, the app installs:

```ts
window.__HUM_DEBUG__.auditSessions()
window.__HUM_DEBUG__.printMeterFormulas()
window.__HUM_DEBUG__.printBaselineStatus()
```

`auditSessions()` prints a compact table, distribution stats, accepted/rejected group averages, baseline status, and warnings.
