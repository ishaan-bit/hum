# Hum State Model

## 1. Overview

Hum records a short local microphone capture, extracts audio features in the browser, rejects captures that do not meet the quality gate, and saves accepted hum sessions locally. Once five completed non-silent sessions exist, the app compares each accepted hum against a baseline built from those five sessions and assigns one of the stored `SignalLabel` values: `close to baseline`, `steadier than baseline`, `higher activation than baseline`, `lower activation than baseline`, `more variable than baseline`, or `flatter than baseline`.

The state model is client-side only. Feature extraction uses Web Audio APIs. Session metadata is stored in `localStorage`, and accepted audio blobs are stored in IndexedDB.

## 2. Source Map

| File / function | Role |
| --- | --- |
| `components/Recorder.tsx: Recorder` | Captures a 12 second microphone recording with `MediaRecorder`, maintains a live level meter and waveform preview, and passes a `Blob` to `onRecordingComplete`. |
| `components/Recorder.tsx: getHumAudioStream` | Requests audio with `echoCancellation`, `noiseSuppression`, and `autoGainControl` disabled; falls back to `{ audio: true }`. |
| `lib/audioFeatures.ts: extractAudioFeatures` | Decodes the recorded blob, trims edges, removes DC offset, normalizes non-silent samples, computes all `AudioFeatures`, and logs debug output in development. |
| `lib/audioThresholds.ts: AUDIO_PIPELINE_THRESHOLDS` | Defines constants used by loudness stats, silence detection, quality gating, and quality-baseline sizing. |
| `lib/quality.ts: assessHumQuality` | Converts extracted features into `clean`, `borderline`, or `rejected`, including confidence weight and user-facing messages. |
| `lib/quality.ts: getLoudnessBaselineRms` | Builds a recent loudness baseline for the quality gate from non-silent sessions. |
| `lib/recommendation.ts: getBaseline` | Builds the feature baseline used by state classification. |
| `lib/recommendation.ts: compareToBaseline` | Produces the persisted `SignalLabel` by comparing current features to the feature baseline. |
| `lib/recommendation.ts: getSignalType` | Maps `SignalLabel` to internal `SignalType`: `activated`, `flat`, `scattered`, `steady`, or `close`. |
| `lib/recommendation.ts: recommendAction` | Chooses the suggested action from current features, signal type, stored action scores, and recent session history. |
| `lib/storage.ts: getSessions`, `saveSession`, `updateSessionFeedback` | Reads/writes session history and feedback-derived action scores in `localStorage`. |
| `lib/audioStorage.ts: saveRecordingAudio`, `getRecordingAudio`, `pruneRecordingAudio` | Stores accepted recording blobs in IndexedDB and keeps only recent audio keys. |
| `components/DailyMelodyCard.tsx: handleRecordingComplete` | Orchestrates feature extraction, quality gate, state classification, action selection, session creation, and audio persistence. |
| `components/SignalSummary.tsx: SignalSummary` | Displays state label, baseline progress, public indicator bars, and selected raw feature details. |
| `components/ActionCard.tsx: ActionCard` | Displays the selected action and whether it came from learned feedback. |
| `components/FeedbackPanel.tsx: FeedbackPanel` | Captures local feedback values used to update action scores. |
| `components/HistoryView.tsx: HistoryView` | Displays recent saved hums, formatted state labels, actions, feedback, and audio playback when available. |

## 3. Captured / Derived Features

`types/hum.ts: AudioFeatures` defines the stored feature shape. `lib/audioFeatures.ts: extractAudioFeatures` computes these values from a trimmed recording after DC offset removal. Values are rounded before storage.

| Key | Computed in | Represents | Kind |
| --- | --- | --- | --- |
| `duration` | `extractAudioFeatures` | Trimmed sample length divided by sample rate. | Raw derived from trimmed raw audio |
| `inputRms` | `getRmsEnergy(rawSamples)` | RMS energy before normalization. | Raw |
| `peakAmplitude` | `getPeakAmplitude(rawSamples)` | Maximum absolute amplitude before normalization. | Raw |
| `meanRms` | `getLoudnessStats` | Mean windowed RMS over raw samples. | Raw derived |
| `medianRms` | `getLoudnessStats` | Median windowed RMS over raw samples. | Raw derived |
| `activeFrameRatio` | `getLoudnessStats` | Ratio of RMS windows at or above `max(absoluteActiveRms, noiseFloorRms * activeNoiseMultiplier)`. | Raw derived |
| `quietFrameRatio` | `getLoudnessStats` | Ratio of RMS windows at or below `max(absoluteQuietRms, noiseFloorRms * quietNoiseMultiplier)`. | Raw derived |
| `clippedFrameRatio` | `getClippedFrameRatio` | Ratio of RMS windows where more than `0.02` of samples have absolute amplitude at least `0.98`. | Raw derived |
| `noiseFloorRms` | `getLoudnessStats` | Median RMS of the initial low-RMS noise-floor window set. | Raw derived |
| `isTooFaint` | `extractAudioFeatures` | True when not basically silent and `medianRms < firstUseSoftRms`. | Derived flag |
| `isSilent` | `isBasicallySilent` | True when `inputRms <= basicallySilentRms` and `peakAmplitude <= basicallySilentPeak`. | Derived flag |
| `rmsEnergy` | `getRmsEnergy(samples)` | RMS energy after normalization. | Normalized |
| `silenceRatio` | `getSilenceRatio(samples)` | Fraction of normalized samples with absolute amplitude below `SILENCE_THRESHOLD`. | Normalized derived |
| `zeroCrossingRate` | `getZeroCrossingRate(samples)` | Sign-change count divided by adjacent-sample count. | Normalized derived |
| `spectralCentroid` | `getSpectralCentroid` | Average spectral centroid over non-silent frames. | Normalized derived |
| `pitchMean` / `pitchHz` | `getPitchTrack`, average voiced pitches | Mean estimated pitch in Hz; `pitchHz` duplicates `pitchMean`. | Normalized derived |
| `pitchVariance` | `extractAudioFeatures` | Variance of voiced pitch estimates around `pitchMean`. | Normalized derived |
| `pitchStability` | `getPitchDifferences` | Average absolute adjacent pitch-frame difference. | Normalized derived |
| `jitter` | `standardDeviation(pitchDifferences)` | Standard deviation of adjacent pitch-frame differences. | Normalized derived |
| `vibratoScore` | `getVibratoScore` | Score for regular pitch oscillation using pitch-delta sign changes and vibrato-rate bounds. | Derived score |
| `glideScore` | `getGlideScore` | Score for directional pitch movement with residual-noise and span checks. | Derived score |
| `amplitudeStability` | `getAmplitudeStability` | Average absolute adjacent frame-RMS difference. | Normalized derived |
| `breakCount` / `breathBreakCount` | `getPauseFeatures`, `countBreathBreaks` | Count of pitch-track silent segments at least `BREATH_BREAK_SECONDS`; `breathBreakCount` stores the same pause feature in `extractAudioFeatures`. | Derived count |
| `avgPauseLength` | `getPauseFeatures` | Mean length of phrasing pauses at least `BREATH_BREAK_SECONDS`. | Derived |
| `pauseCount` | `getPauseFeatures` | Count of all silent pitch-track segments. | Derived count |
| `microBreakRatio` | `getPauseFeatures` | Micro-break count divided by pause count, where micro-breaks are silent segments shorter than `MICRO_BREAK_SECONDS`. | Derived ratio |
| `pauseStructureScore` | `getPauseStructureScore` | Combined pause count, pause length, and micro-break score clamped to `0..1`. | Derived score |
| `smoothnessScore` | `getSmoothnessScore` | One minus the average of pitch, jitter, and amplitude instability values, adjusted for structured vibrato/glide/pause features. | Derived score |
| `pitchDrift` | `getPitchDrift` | End-window pitch average minus start-window pitch average, divided by mean pitch. | Derived ratio |
| `pitchRange` | `getPitchRange` | 90th percentile semitone minus 10th percentile semitone. | Derived |
| `noteChangeRate` | `getMelodyFeatures` | Adjacent semitone changes at least `NOTE_CHANGE_SEMITONES` divided by elapsed pitch-track time. | Derived rate |
| `melodicSmoothness` | `getMelodicSmoothness` | One minus normalized average semitone acceleration across adjacent voiced frames. | Derived score |
| `rhythmicStability` | `getRhythmicStability` | One minus normalized standard deviation of voiced-segment onset intervals. | Derived score |
| `sustainStability` | `getSustainStability` | One minus normalized average adjacent semitone movement. | Derived score |
| `attackConsistency` | `getAttackConsistency` | Consistency and strength of positive RMS attacks at voiced-segment starts. | Derived score |
| `pitchContourShape` | `getPitchContourShape` | First-to-last semitone slope per second. | Derived |

Baseline-relative values are not persisted in `AudioFeatures`. They are computed transiently in `lib/recommendation.ts: getFeatureDeltas`, using z-score-like deltas from `zDelta`, relative ratios from `relativeRatio`, and derived values such as `instabilityScore`, `energyRelative`, `pitchRelative`, `variationRelative`, and `absolutePitchDrift`.

## 4. Recording Quality Gate

Recording capture is 12 seconds by default (`components/Recorder.tsx: RECORDING_SECONDS`). The user can stop early with `Finish now`; accepted/rejected status is based on extracted duration and quality metrics, not only the timer.

`lib/audioThresholds.ts: AUDIO_PIPELINE_THRESHOLDS` defines these quality-gate constants:

| Constant | Value |
| --- | --- |
| `qualityGate.minimumDurationSec` | `2.5` |
| `qualityGate.minimumActiveFrameRatio` | `0.12` |
| `qualityGate.nearSilenceMeanRms` | `0.0035` |
| `qualityGate.softRms` | `0.014` |
| `qualityGate.strongRms` | `0.05` |
| `qualityGate.softBaselineRatio` | `0.7` |
| `qualityGate.strongBaselineRatio` | `1.5` |
| `baselineSampleCount` | `5` |
| `baselineMinimumCount` | `3` |

`lib/quality.ts: getQualityGateDecision` separates technical capture quality from vocal state interpretation. Capture gates reject a hum only for broken or technically poor input, such as:

- `features.duration < 8`
- near-silent audio
- excessive clipping
- too much silence or quiet audio
- low active-frame or voiced coverage
- poor SNR or peak barely above the noise floor

Vocal variability metrics such as jitter, pitch movement, breaks, pauses, shimmer, and smoothness are stored as `stateReasons`. They do not make a capture faint or rejected.

If a loudness baseline exists, the gate computes `normalizedLoudness = currentRms / baselineRms`, where `currentRms` is `medianRms || meanRms || inputRms || 0`. Soft recordings are accepted as `soft_usable` when activity, voicing, SNR, and peak are usable.

`lib/quality.ts: getQualityResult` maps decisions to saved quality:

- `rejected` / `poor` -> `rejected`, `captureQuality: rejected | poor`, `confidenceWeight: 0`, message `We could not separate the hum from room noise. Try one more closer to the mic.`
- `soft` -> `borderline`, `captureQuality: soft_usable`, `confidenceWeight: 0.72`, message `Captured. Softer than usual, but usable.`
- `usable` -> `clean`, `captureQuality: usable`, `confidenceWeight: 0.95`
- `good` -> `clean`, `captureQuality: good`, `confidenceWeight: 1`

`components/DailyMelodyCard.tsx: handleRecordingComplete` returns immediately for `rejected` hums before calling `compareToBaseline`, `recommendAction`, `saveRecordingAudio`, or `saveSession`. Rejected hums are not stored in session history or IndexedDB. Borderline hums are saved, shown with the soft message, and contribute to baseline means with their `confidenceWeight`.

## 5. Baseline Logic

There are two baseline calculations:

1. Feature baseline for state classification: `lib/recommendation.ts: getBaseline`.
2. Loudness baseline for the quality gate: `lib/quality.ts: getLoudnessBaselineRms`.

`getBaseline` filters sessions through `isCompletedBaselineSession`, which requires `session.features` and `!session.features.isSilent`. It then sorts by `createdAt` ascending and takes the first `BASELINE_SESSION_COUNT` sessions. `BASELINE_SESSION_COUNT` is `5`. If fewer than five completed non-silent sessions exist, it returns `null`.

When the baseline exists, it stores:

- `count`
- `mean`: weighted average for each feature
- `stdDev`: weighted standard deviation for each supported feature

Weights come from `session.confidenceWeight ?? 1`. The weighted average clamps each weight to at least `0.1`.

Current hums are compared to baseline in `getFeatureDeltas`. Most comparisons use `zDelta`, which subtracts the baseline mean and divides by `max(stdDev, epsilonForFeature(key))`. Some comparisons use ratios instead, including `energyRelative = features.inputRms / baseline.mean.inputRms` and `variationRelative = features.pitchVariance / baseline.mean.pitchVariance`.

The quality-gate loudness baseline is different: `getLoudnessBaselineRms` takes up to `baselineSampleCount` recent non-silent sessions from the current session order, requires at least `baselineMinimumCount` values, sorts their decision RMS values, and returns the median.

## 6. State Classification Logic

Before the five-session feature baseline is available, `compareToBaseline` returns `null`. UI renders this as `Learning your usual`.

After baseline exists, `compareToBaseline` computes feature deltas and first asks `classifyBaselineSignal` for a rule-based label. If that returns `null`, it scores delivery patterns and chooses the highest pattern only when at least `MIN_COHERENT_FEATURES` strong features agree. `MIN_COHERENT_FEATURES` is `2`; `STRONG_DELTA` is `1`. If no pattern has enough coherent features, the label is `close to baseline`.

Rule-based labels from `classifyBaselineSignal`:

- Higher variation: `variationRelative >= 1.3` or `pitchVariance >= 1`.
  - If current vibrato or glide is structured, return `steadier than baseline`.
  - If pause structure is natural and `microBreakRatio < 1`, return `close to baseline`.
  - If `instabilityScore >= 1`, return `more variable than baseline`.
  - Otherwise return `close to baseline`.
- Lower variation: `variationRelative <= 0.72` or `pitchVariance <= -1`. If also `smoothnessScore <= 0.8`, return `flatter than baseline`.
- If `instabilityScore >= 1.25`, return `more variable than baseline`.
- If `energyRelative >= 1.35` and `energy >= 1`, return `higher activation than baseline`.
- If `energyRelative <= 0.75` and `energy <= -1`, return `lower activation than baseline`.
- If `smoothnessScore >= 1` and `instabilityScore <= 0.8`, return `steadier than baseline`.

Structured feature check in `isStructuredFeatureHigh` is true when the current value is at least `0.55`, or the baseline value is at least `0.35` and the current value is at least `80%` of the baseline value.

Fallback delivery patterns in `compareToBaseline`:

| Label | Strong signals considered |
| --- | --- |
| `higher activation than baseline` | Higher relative energy, less quiet space, less regular energy transitions, stronger attack consistency. |
| `lower activation than baseline` | More quiet space, more silent breaks, longer pauses, lower relative energy. |
| `more variable than baseline` | Higher irregular pitch jitter, higher irregular pitch variance, higher instability after musical variation, more tiny breaks, less smooth irregular contour. |
| `flatter than baseline` | Narrower melody range, lower pitch variance, fewer note changes. |
| `steadier than baseline` | Lower pitch jitter, lower frame pitch change, smoother contour, steadier sustains. |

`getSignalType` maps labels to action-facing signal types:

- `higher activation than baseline` -> `activated`
- `lower activation than baseline` -> `flat`
- `flatter than baseline` -> `flat`
- `more variable than baseline` -> `scattered`
- `steadier than baseline` -> `steady`
- `close to baseline` -> `close`

The labels `activated`, `flat`, `scattered`, `steady`, and `close` are internal `SignalType` values, not persisted user-facing `SignalLabel` values.

## 7. Recommendation / Action Logic

`components/DailyMelodyCard.tsx: handleRecordingComplete` calls `recommendAction` for every accepted hum, after quality gating and state classification and before saving the new session.

`lib/recommendation.ts: actions` defines six possible actions:

| ID | Type | Title |
| --- | --- | --- |
| `sunlight-walk` | `low-energy` | `Sunlight lap` |
| `water-reset` | `low-energy` | `Water reset` |
| `box-breathing` | `scattered` | `Four quiet breaths` |
| `soft-stretch` | `scattered` | `Shoulder unspool` |
| `voice-note` | `steady` | `Send a tiny spark` |
| `sketch-line` | `steady` | `One-line sketch` |

`recommendAction` chooses an action type as follows:

- `signalType === "scattered"` or `features.zeroCrossingRate > 0.16` -> `scattered`
- `signalType === "flat"` -> `low-energy`
- `signalType === "steady"` or `signalType === "close"` -> `steady`
- no matching signal and `features.rmsEnergy < 0.045` -> `low-energy`
- otherwise -> `steady`

If `signalType` is `close`, candidates are limited to `lowPressureActionIds`: `water-reset`, `box-breathing`, `soft-stretch`, and `sketch-line`. Otherwise, candidates are actions of the selected type.

Candidate scoring uses:

- stored feedback learning score for this `signalType` and action ID, default `0`
- recent-action penalty from `RECENT_ACTION_PENALTIES = [-6, -3, -1.5]`
- `explorationBonus = 1` if not recently used
- `untriedBonus = 0.5` if this action has not been tried for the current signal type
- candidate rotation offset `sessions.length % candidates.length`

If the winner is the immediately previous action, the runner-up replaces it unless the winner has enough learned support. `LEARNING_REPEAT_MARGIN` is `4`, and repeat is allowed only when the learning score is at least that margin or the learning-score difference over the runner-up reaches that margin.

Feedback loop: `components/FeedbackPanel.tsx` collects `better`, `same`, `worse`, or `skipped`. `lib/storage.ts: updateSessionFeedback` updates `hum:action-scores` only when the target session has a `signalType`. Feedback deltas are `better: 2`, `same: 1`, `worse: -2`, `skipped: 0`; changes are multiplied by `clamp(confidenceWeight, 0.3, 1)` and action scores are clamped to `[-8, 12]`.

## 8. UI Usage

Visible after recording:

- `components/SignalSummary.tsx` shows a formatted state label or `Learning your usual`.
- `SignalSummary` shows baseline progress as `{baselineProgress} of 5`.
- `SignalSummary` shows three indicator bars from `getIndicatorLevels`: `Stability`, `Energy`, and `Movement`.
- `SignalSummary` exposes detail metrics in a disclosure: `Duration`, `Input level`, `Energy`, `Quiet ratio`, `Pitch`, `Jitter`, `Pitch stability`, `Amplitude stability`, `Break count`, `Smoothness`, `Vibrato`, `Glide`, `Pause structure`, and `Micro-breaks`.
- `components/ActionCard.tsx` shows the selected action title, action lines, and either `Picked because it has helped before.` or `Trying this today.`
- `components/FeedbackPanel.tsx` shows feedback buttons and the saved feedback value.
- `components/HistoryView.tsx` shows the five most recent saved hums, each formatted signal label, action title, feedback status, and optional audio playback.

Internal or hidden:

- Full feature objects, baseline means, baseline standard deviations, z-score deltas, `instabilityScore`, relative ratios, and pattern scores are not directly rendered.
- Quality-gate decisions and debug feature dumps are logged only in development.
- `quality`, `confidenceWeight`, `signalType`, `pickedFromLearning`, `actionId`, `audioKey`, and `audioMimeType` are persisted but mostly used internally.

## 9. Current Limitations Visible From Code

- Persistence is local-only: sessions and action scores use `localStorage`; accepted audio blobs use IndexedDB. No backend persistence appears in the traced state-model path.
- `writeSessions` keeps only the latest 60 session records in `localStorage`.
- `pruneRecordingAudio` keeps audio only for the first 20 kept audio keys passed from current saved sessions.
- Rejected hums are not persisted, so the app does not retain rejected quality history.
- The feature baseline is established from the first five completed non-silent sessions after sorting by `createdAt`, not a rolling recent baseline.
- UI copy says `Based on your last 5 hums`, but `getBaseline` uses the first five completed non-silent sessions. This is a code/copy mismatch.
- Baseline progress is capped at five completed non-silent sessions and does not indicate whether later sessions are excluded from the feature baseline.
- Legacy session normalization can infer missing quality as `borderline` from `isTooFaint`, otherwise `clean`, and can fill missing `confidenceWeight` with `0.55` or `1`.
- Feedback learning only updates action scores when a session has a non-null `signalType`; pre-baseline sessions with `signal: null` do not update learning scores.

## 10. Open Questions / TODOs

- Should the feature baseline be the first five completed hums, as implemented, or the last five hums, as the UI copy states?
- Should later accepted hums recalibrate the feature baseline, or is the first-five-session baseline intentionally fixed?
- Should rejected hums be recorded as quality events for troubleshooting or calibration, even though they should not become state sessions?
- Should `breathBreakCount` and `breakCount` remain separate fields if they are populated from the same pause count in `extractAudioFeatures`?
- Should the quality-gate loudness baseline and the state-classification feature baseline share naming or docs in code to reduce ambiguity?
