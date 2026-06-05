# Hum Technical and Product Specification

Last audited: 2026-05-07

This document describes Hum as it currently exists in the codebase and as it is intended to work. It is a specification and audit artifact only; it does not change product behavior.

## 1. Product Purpose

Hum is a voice-based daily ritual. The user hums one easy tone for roughly 12 seconds. The app captures the audio locally, extracts vocal signal features, checks whether the signal is usable, compares the hum with the user's personal baseline when available, produces a human-readable Moment Read, and curates a song that fits the current vocal state and the user's selected music preferences.

Hum is not a diagnostic tool, a clinical assessment, a mental-health classifier, a medical device, or a symptom detector. It must not label anxiety, depression, trauma, illness, panic, disorder, or symptoms. Its language should stay in the world of self-awareness, energy, steadiness, effort, softness, continuity, and music.

Humming is used because it is short, private, repeatable, and naturally exposes useful non-verbal features: loudness, continuity, pitch movement, breath/voicing breaks, smoothness, and overall vocal effort. The user's exact melody is less important than the shape and steadiness of the signal relative to their own past hums.

After using Hum, the user should feel gently oriented, not judged. The intended "aha moment" is a simple realization such as "I sound more held-together than relaxed" or "I have energy, but it is not landing smoothly." The app should feel emotionally intelligent and immediately interpretable, not mystical, poetic, clinical, or dashboard-like.

## 2. End-To-End User Journey

### Current Behavior

1. Landing / pre-capture: `/` renders `components/HomeExperience.tsx`, which shows `components/DailyMelodyCard.tsx` and `components/HistoryView.tsx`. `DailyMelodyCard` renders `components/Recorder.tsx` first.
2. Permission request: `Recorder.startRecording()` requests microphone access through `navigator.mediaDevices.getUserMedia`. `Recorder` also tries to pre-open a stream on mount through `ensureStream()`, so permission may be requested before the user presses the CTA depending on browser behavior.
3. Mic readiness: `Recorder` creates an `AudioContext`, `MediaStreamAudioSourceNode`, and `AnalyserNode` for live level monitoring. If microphone APIs are missing, it shows an error.
4. Live signal guidance: during recording, `lib/liveSignal.ts` converts live RMS/peak values into `silent`, `faint`, `usable`, `strong`, or `clipping` and shows a small label and meter.
5. 12-second capture: `MediaRecorder` captures 12 seconds by default (`RECORDING_SECONDS = 12`). The same button can stop early, but quality gates later require at least 8 seconds.
6. Capture complete: the recorder emits a `Blob` and capture diagnostics to `DailyMelodyCard.handleRecordingComplete()`. The visual waveform freezes in the captured state.
7. Processing: `DailyMelodyCard` shows short processing messages: "Listening..." then "Comparing to your usual...".
8. Feature extraction: `lib/audioFeatures.ts: extractAudioFeatures()` decodes the blob, extracts signal features, stores diagnostics in `WeakMap`s, and closes the `AudioContext`.
9. Quality decision: `lib/quality.ts: assessHumQuality()` returns `clean`, `borderline`, or `rejected` plus `captureQuality`, confidence weight, reasons, and recommendation/baseline eligibility flags.
10. Moment inference: `lib/humModels.ts: RuleBasedHumModelV2.predict()` delegates to `lib/recommendation.ts: analyzeHumState()`. Before baseline exists, label and baseline comparison are null. The Moment Read card still renders with absolute dimensions.
11. Session creation: accepted hums are saved through `lib/storage.ts: saveSession()`. Accepted audio blobs are saved to IndexedDB through `lib/audioStorage.ts: saveRecordingAudio()`.
12. Moment Read result: `components/SignalSummary.tsx` calls `lib/momentRead.ts: buildMomentRead()` and renders the Moment Read card.
13. Signal details: `SignalSummary` renders a `details` disclosure with `components/FeatureDetails.tsx`.
14. Song Match: `SignalSummary` renders "Your Sound Match" with language, main genre, and flavor chips. Pressing "Curate my song" calls `POST /api/music/recommend`.
15. Song result: `SongResultCard` shows title, artist, tags, provider, reason, Last.fm details link when available, YouTube search link, try-another button, and live song feedback buttons.
16. Feedback: live song feedback is stored locally by `lib/liveMusicStorage.ts: saveSongFeedback()`. If the older music-session feedback card appears, `lib/storage.ts: updateMusicSessionFeedback()` updates regulation/taste models.
17. Repeat / next session: the latest session remains visible until another accepted hum is saved or the user records again.
18. Baseline learning: `getBaseline()` requires 5 baseline-eligible hums. `getBaselineProgress()` is capped at 5. `FeatureDetails` and Moment Read copy show calibration/learning notes until baseline is active.

### Intended Behavior

The capture UI should request permission only when the user clearly starts the ritual or after an explicit readiness action. The post-hum flow should make three separate things easy to distinguish: "what we heard," "what it may mean in human terms," and "why this song was chosen." Rejected hums should be retained as short diagnostic events, not as baseline sessions.

## 3. Capture UX Behavior

Before recording, the UI should show a stable, calm pre-capture state:

- Kicker: private audio ritual.
- Main heading: "Ready to hum?"
- Subcopy: one easy tone for 12 seconds.
- CTA: "Start 12s hum."
- Lightweight readiness indicator: mic status and level if permission is already available.

While recording, large copy should remain stable. The current implementation changes the title to "Keep humming" and keeps it there. That pattern is good: it avoids constantly rewriting the user's task. Only small indicators should update live:

- timer / circular progress in `HumCoreVisualizer`;
- mic meter width;
- signal label and hint after a smoothing delay;
- visual core movement.

What must not flicker:

- main heading;
- large subcopy;
- CTA dimensions;
- card layout;
- Moment Read or Song Match content while capture is still in progress;
- error or warning copy unless the state is settled for a short interval.

Live mic level behavior is defined in `lib/liveSignal.ts`:

| State | Code meaning | User copy | Intended meaning |
| --- | --- | --- | --- |
| `silent` | RMS below `0.0055` and peak below `0.035`, or smoothed state decays to silence | "A little closer" / "Bring the hum near" | Signal is too weak for comfortable guidance. |
| `faint` | smoothed RMS around `0.0055..0.012` | "Closer helps" / "Usable, just soft" | Low but possibly usable. Come closer or hum slightly fuller. |
| `usable` | smoothed RMS at least `0.012` | "Signal is clear" / "Keep humming" | Good enough live signal. |
| `strong` | smoothed RMS around `0.085+` without clipping | "Signal is clear" / "Stay easy" | Strong signal; do not push harder. |
| `clipping` | peak >= `0.96` or RMS >= `0.22` | "Too loud" / "Ease back slightly" | Back off to avoid overloaded capture. |

Waveform behavior:

- Idle: quiet, low-amplitude visual. It should imply readiness, not emptiness or failure.
- Recording: updates from live meter samples and reflects movement smoothly.
- Frozen/captured: normalized waveform is held from the last recorded samples; it should not keep animating as if the mic is still listening.

The UI avoids overwhelming the user by using one primary instruction, one level hint, one timer, and one CTA. Technical detail belongs after capture in "View signal details."

## 4. Audio Capture and Preprocessing

### Browser APIs

- `navigator.mediaDevices.getUserMedia()` in `components/Recorder.tsx:getHumAudioStream()`.
- `MediaRecorder` for encoded audio chunks.
- `AudioContext` / `webkitAudioContext` for live metering and decoding.
- `AnalyserNode.getFloatTimeDomainData()` for live RMS.
- `AudioContext.decodeAudioData()` for feature extraction.
- IndexedDB for retained accepted audio blobs.

### Capture Constraints

`getHumAudioStream()` first requests:

```ts
audio: {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
}
```

If that fails, it falls back to `{ audio: true }`. Intended behavior is to prefer raw vocal signal because browser enhancement can flatten dynamics.

### Sample Rate And Channels

`extractAudioFeatures()` uses `audioBuffer.sampleRate`; there is no fixed sample-rate assumption. It reads only channel 0 through `audioBuffer.getChannelData(0)`. Multi-channel recordings are effectively treated as mono by first-channel selection, not downmixed.

### Duration

- Target capture: 12 seconds (`AUDIO_PIPELINE_THRESHOLDS.targetHumSeconds`, `Recorder.RECORDING_SECONDS`).
- Current quality minimum: 8 seconds (`qualityGate.minimumDurationSec`).
- Feature extraction trims 0.3 seconds from each edge (`EDGE_TRIM_SECONDS`), so stored `features.duration` is shorter than decoded duration.

### Preprocessing

`lib/audioFeatures.ts: extractAudioFeatures()`:

- decodes the blob;
- removes DC offset with `removeDcOffset()`;
- trims edges with `trimEdges()`;
- normalizes samples with `normalizeSamples()` to target peak `0.82`, capped at 10x gain;
- keeps raw samples for input RMS, peak, loudness stats, noise floor, and faint/silent flags;
- computes many pitch/spectral/stability features on normalized samples.

### Frame / Window Sizes

- Pitch frame size: 2048 samples.
- Pitch hop size: 1024 samples.
- Live analyser FFT size: 1024 samples.
- Loudness RMS window: `AUDIO_PIPELINE_THRESHOLDS.rmsWindowMs = 80`.
- Noise floor window: `AUDIO_PIPELINE_THRESHOLDS.noiseFloorMs = 500`.

### Pitch Detection

Pitch is estimated in `estimatePitch()` over 2048-sample frames using an autocorrelation-style method bounded to `75..420 Hz`. Frames outside confidence/range checks become `null`. `pitchCoverage` is voiced frames divided by pitch frames.

### Active Frame Logic

`getLoudnessStats()` computes windowed RMS over raw samples. It derives:

- `noiseFloorRms` from the low end of early/quiet RMS windows;
- active threshold from max absolute and noise-scaled thresholds;
- quiet threshold from max absolute and noise-scaled thresholds;
- `activeFrameRatio`;
- `quietFrameRatio`;
- `clippedFrameRatio`.

### Fallbacks

- Browser recording fallback: `{ audio: true }`.
- MIME selection tries only `MediaRecorder.isTypeSupported()` candidates, then uses recorder default with no explicit MIME type when none are safe.
- If audio saving fails, the session is kept with `audioKey: null`.
- Missing feature values normalize to conservative null/zero defaults in `lib/storage.ts: normalizeFeatures()`.

### Known Implementation Gaps

- Only channel 0 is used; stereo recordings are not downmixed.
- Edge trimming means an exactly 8-second decoded hum can fall below 8 seconds after trimming and be rejected.
- Normalized features and raw loudness features coexist; the UI must be clear about which metric is raw vs normalized.
- `breathBreakCount` and `breakCount` are both populated from pause/break logic and can be semantically redundant.

## 5. Extracted Parameters

All feature keys live in `types/hum.ts: AudioFeatures`. Most are produced by `lib/audioFeatures.ts: extractAudioFeatures()`. Baseline-relative values are produced by `lib/recommendation.ts:getFeatureDeltas()`, `getDimensionScores()`, and `analyzeHumState()`.

| Parameter | Meaning | Current calculation | Expected range | Direction | Insight use | Song use |
| --- | --- | --- | --- | --- | --- | --- |
| `duration` | Usable recorded length | trimmed samples / sampleRate | seconds, target ~11.4 after trim | higher until target | quality gate, continuity | light signal handling |
| `inputRms` | raw input strength | RMS of raw trimmed samples | 0..1 | context-dependent | activation, quality | hum shape energy |
| `meanRms` | average raw loudness | mean windowed RMS | 0..1 | context-dependent | quality, activation | hum shape energy |
| `medianRms` | typical raw loudness | median windowed RMS | 0..1 | context-dependent | quality, loudness baseline | indirect |
| `rmsEnergy` | normalized energy | RMS after peak normalization | 0..~0.82 | context-dependent | legacy activation/action | limited |
| `peakAmplitude` | loudest raw sample | max abs raw sample | 0..1 | too low/too high bad | clipping/noise checks | indirect |
| `activeFrameRatio` | how much hum is active | active RMS windows / windows | 0..1 | higher is more usable | quality, continuity, activation | hum shape energy |
| `quietFrameRatio` | very quiet windows | quiet RMS windows / windows | 0..1 | lower usually better | quality, clarity | hum shape if faint |
| `clippedFrameRatio` | overloaded windows | clipped RMS windows / windows | 0..1 | lower better | reject/poor capture | avoid recommendation if rejected |
| `noiseFloorRms` | room/input floor | low RMS window estimate | 0..1 | lower cleaner | SNR and quality | indirect |
| `silenceRatio` | low-amplitude samples | normalized samples below `0.02` | 0..1 | lower usually better | subdued/broken/quality | hum shape |
| `zeroCrossingRate` | signal noisiness/brightness proxy | sign changes / samples | 0..1 | context-dependent | legacy scattered action | none live |
| `spectralCentroid` | brightness | spectral centroid over frames | Hz | context-dependent | activation/texture | hum shape texture |
| `spectralBandwidth` | frequency spread | spectral bandwidth | Hz | context-dependent | details only | none |
| `spectralRolloff` | high-frequency rolloff | rolloff frequency | Hz | context-dependent | details only | none |
| `spectralFlux` | spectral movement | frame-to-frame spectral difference | 0+ | context-dependent | details/debug | none |
| `spectralFlatness` | noisiness | spectral flatness | 0..1 | lower clearer | clarity/breathiness | indirect |
| `pitchMean` / `pitchHz` | pitch center | average voiced pitch | 75..420 Hz when detected | context-dependent | baseline pitch shift | none direct |
| `pitchCoverage` | voiced percentage | voiced pitch frames / frames | 0..1 | higher better for read | quality, clarity, continuity | hum shape clarity |
| `pitchVariance` | pitch spread | variance around mean pitch | 0+ | context-dependent | movement/flatness/variability | hum shape movement |
| `pitchStability` | adjacent pitch change | average abs pitch-frame delta | 0+ | lower steadier | stability | hum shape instability |
| `jitter` | pitch irregularity | std dev of adjacent pitch deltas | 0+ | lower steadier | variable/steadier labels | hum shape instability |
| `amplitudeStability` | volume irregularity | average adjacent frame-RMS delta | 0+ | lower steadier | stability/control | hum shape smoothness |
| `shimmerProxy` | frame volume shimmer | adjacent RMS ratios | 0+ | lower steadier | residual amplitude instability | none direct |
| `hnrProxy` | harmonic-to-noise proxy | pitch coverage times inverse pitch noise | 0..1 | higher clearer | clarity/breathiness | hum texture |
| `signalToNoiseProxy` | signal over noise | `inputRms / max(noiseFloor, .0001)` | 0+ | higher cleaner | quality, clarity | hum shape faint/breathy |
| `clarityScore` | read clarity | average pitch coverage, spectral clarity, log SNR, HNR, non-silence | 0..1 | higher better | read confidence | light-signal handling |
| `breathinessProxy` | airy/noisy quality | spectral flatness + inverse SNR + inverse HNR | 0..1 | lower cleaner | softness/clarity | hum texture |
| `vibratoScore` | structured oscillation | vibrato rate/depth/regularity checks | 0..1/null | context-dependent | filters musical movement | hum shape words |
| `vibratoRate` | vibrato speed | oscillation rate estimate | Hz/null | context-dependent | details/expression | none direct |
| `vibratoDepth` | vibrato size | pitch oscillation depth | Hz/null | context-dependent | details/expression | none direct |
| `vibratoRegularity` | oscillation regularity | periodicity score | 0..1/null | higher structured | expression filter | none direct |
| `tremorProxy` | irregular oscillation proxy | rate/depth/irregularity blend | 0..1/null | lower steadier | details only currently | none |
| `glideScore` | smooth pitch slide | directional pitch movement score | 0..1/null | context-dependent | expression filter | hum shape words |
| `breakCount` | sustained voicing breaks | silent pitch segments >= 0.25s | count | lower more continuous | continuity/strain | hum shape broken |
| `breathBreakCount` | breath-like breaks | currently same family as break count | count | lower more continuous | details/baseline | none direct |
| `pauseCount` | pitch-track dropouts | silent/interior pitch segments | count | lower more continuous | continuity | hum shape broken |
| `avgPauseLength` | average pause duration | pause segment seconds mean | seconds | lower more continuous | subdued/broken | hum shape broken |
| `microBreakRatio` | tiny dropouts | micro breaks / pauses | 0..1 | lower smoother | variability | hum shape broken |
| `pauseStructureScore` | phrase pause health | combined pause count/length/micro-break score | 0..1/null | higher smoother | stability/smoothness | none direct |
| `smoothnessScore` | overall smoothness | inverse average instability adjusted by vibrato/glide/pause | 0..1/null | higher smoother | stability/control | hum shape smoothness |
| `pitchDrift` | pitch slope over hum | end pitch avg - start avg / pitch mean | signed ratio | near 0 steadier | control/stability | none |
| `pitchRange` | melodic width | 90th - 10th percentile semitones | semitones/null | context-dependent | flatness/movement | hum shape movement |
| `noteChangeRate` | pitch changes per time | semitone changes >= 0.75 / elapsed | rate/null | context-dependent | flatness/movement | hum shape movement |
| `melodicSmoothness` | organized melodic motion | inverse semitone acceleration | 0..1/null | higher smoother | expression filter | hum shape |
| `rhythmicStability` | timing steadiness | inverse onset interval deviation | 0..1/null | higher steadier | stability | none direct |
| `sustainStability` | sustained pitch steadiness | inverse adjacent semitone movement | 0..1/null | higher steadier | stability | hum shape |
| `attackConsistency` | onset consistency | RMS attack consistency/strength | 0..1/null | higher controlled | control/activation | none direct |
| `pitchContourShape` | up/down pitch slope | semitone slope/sec | signed/null | context-dependent | movement/drift | hum shape |
| `onsetDelay` | first voiced onset | first voiced segment start | seconds/null | lower usually better | details | none |
| `longestStableSegment` | longest stable pitch stretch | adaptive stable mask segment length | seconds/null | higher steadier | stability guardrails | none |
| `musicalityScore` | structured expression | blend of vibrato/glide/melody/envelope metrics | 0..1 | context-dependent | prevents over-penalizing musical movement | none direct |
| `controlledExpressionScore` | intentional sustained control | continuity, expression, clarity, SNR blend | 0..1 | higher controlled | control/stability | none direct |
| `residualPitchInstability` | unexplained pitch scatter | pitch scatter after musical relief | 0..1 | lower steadier | variable/strain | hum shape instability |
| `residualAmplitudeInstability` | unexplained volume scatter | amplitude scatter after envelope relief | 0..1 | lower steadier | variable/strain | hum shape instability |
| `residualInstabilityScore` | overall unexplained instability | pitch, amplitude, dropout, noise blend | 0..1 | lower steadier | pattern selection | hum shape instability |
| `stableSegmentCoverage` / `pitchStableSegmentCoverage` | stable pitch coverage | longest stable segment / duration or expression filter | 0..1 | higher steadier | stability guardrails | none |
| `voicingContinuityCoverage` | voice continuity | voiced/active/break/pause blend | 0..1 | higher continuous | continuity/control | hum shape |
| `phraseContinuityCoverage` | phrase continuity | voicing, envelope, timing, melodic region blend | 0..1 | higher continuous | continuity | hum shape |
| `notePlateauScore` | repeated stable pitch regions | plateau coverage and length | 0..1/null | context-dependent | expression filter | none direct |
| `stepwiseMelodicScore` | step-like melody | adjacent semitone step organization | 0..1/null | context-dependent | expression filter | none direct |
| `repeatedPitchRegionScore` | repeated pitch areas | repeated semitone bins | 0..1/null | context-dependent | expression filter | none direct |
| `phraseContourScore` | contour organization | direction run fit | 0..1/null | context-dependent | expression filter | none direct |
| `isTooFaint` | technically faint flag | median RMS below soft threshold with safeguards | boolean | false better | quality/read cap | light signal |
| `isSilent` | near-silent flag | raw RMS and peak below thresholds | boolean | false required | reject/read cap | no recommendation |
| `baselineDistanceScore` | distance from usual | dimension distance in `getDimensionScores()` | 0+ | lower closer | label selection | target selection |
| `activationScore` | activation shift | dimension score relative to baseline | signed | context-dependent | Moment dimensions | target/intent indirectly |
| `stabilityScore` | steadiness shift | dimension score relative to baseline | signed | higher steadier | Moment dimensions | target/intent indirectly |
| `clarityScore` dimension | clarity shift | dimension score relative to baseline | signed | higher clearer | Moment dimensions | indirect |
| `smoothnessScore` dimension | smoothness shift | dimension score relative to baseline | signed | higher smoother | Moment dimensions | indirect |
| `continuityScore` | continuity shift | dimension score relative to baseline | signed | higher continuous | Moment dimensions | indirect |
| `controlScore` | control shift | dimension score relative to baseline | signed | higher controlled | Moment dimensions | indirect |
| `confidenceWeight` | signal confidence | quality decision weight: 1, .95, .72, or 0 | 0..1 | higher stronger | read confidence/storage | recommendation confidence |
| `labelConfidence` | label confidence | `analyzeHumState()` winner confidence | 0.52..0.94/null | higher stronger | read confidence | music session confidence |
| `quality` | accepted/rejected class | `assessHumQuality()` | clean/borderline/rejected | clean best | flow branching | recommendation eligibility |
| `captureQuality` | capture quality | good/usable/soft_usable/poor/rejected | enum | context-dependent | detail/debug | recommendation eligibility |
| `shouldEnterBaseline` | baseline eligibility hint | quality result | boolean | true if usable | baseline | none |
| `shouldGenerateRecommendation` | recommendation hint | quality result | boolean | true if usable | flow | song allowed |
| `signal` | derived label | `analyzeHumState()` | label/null | not ranked | Moment base | regulation target |
| `signalType` | compact label | `getSignalType()` | activated/flat/scattered/steady/close/null | not ranked | internal | action legacy |
| `regulationTarget` | music direction | `getRegulationTarget()` | downshift/ground/gentle_lift/focus/release/maintain | not user genre | local demo recommendation | local catalog |
| `labDirection` | live music direction | `buildMomentRead()` pattern map | Settle/Warmth/Ground/Flow/Lift gently/null | not genre | chip helper | live intent |

## 6. Signal Quality Layer

A hum is usable when it is long enough, audible, mostly active, has enough voiced content when pitch can be tracked, is not mostly silence, is not clipped, and can be separated from the noise floor.

Current quality gates in `lib/quality.ts:getQualityGateDecision()`:

- Reject if `duration < 8`.
- Reject if `isSilent` or `meanRms <= 0.006`.
- Mark poor/rejected if `clippedFrameRatio > 0.08`.
- Mark poor/rejected if `silenceRatio > 0.72`.
- Mark poor/rejected if `quietFrameRatio > 0.78`.
- Mark poor/rejected if `activeFrameRatio < 0.22`.
- Mark poor/rejected if `pitchCoverage < 0.35` when pitch coverage exists.
- Mark poor/rejected if `signalToNoiseProxy < 2` or peak is barely above noise.
- Mark soft usable if current decision RMS is below `0.014`, technically faint, or less than 70% of loudness baseline.
- Mark good if decision RMS is at least `0.05` or active/voiced/silence/quiet/SNR/peak pass strong capture checks.

Current mapping:

| Gate decision | Stored `quality` | `captureQuality` | Baseline | Recommendation |
| --- | --- | --- | --- | --- |
| rejected | rejected | rejected | no | no |
| poor | rejected | poor | no | no |
| soft | borderline | soft_usable | yes | yes |
| usable | clean | usable | yes | yes |
| good | clean | good | yes | yes |

Confidence types must remain distinct:

- Capture quality: technical recording usability (`captureQuality`).
- Signal confidence: how much the signal can support a read (`confidenceWeight`, raw signal confidence in Moment Read).
- Label confidence: how strongly a baseline-relative label won (`labelConfidence`).
- Baseline confidence: whether enough eligible personal hums exist and how many source sessions support comparison.

The UI should not always show 95%. Current `quality.confidenceWeight` is `0.95` for usable captures, but `MomentRead.getReadQualityScore()` now computes a capped read quality from multiple factors. This is better and should remain the displayed source. "Good read" should require strong capture, enough continuity, no major caps, and baseline confidence when claiming baseline-relative changes.

Rules:

- Rejected/poor hums must not enter baseline or produce recommendations.
- Soft usable hums may enter baseline with lower confidence weight, unless future product rules decide calibration-only.
- Baseline entry should be recomputed with `getBaselineEligibility()` rather than trusting stale stored flags.
- Recommendation eligibility should respect `shouldGenerateRecommendation`; currently accepted hums generate a local music session immediately and live Song Match is user-triggered.

## 7. Baseline Learning

### Current Behavior

Baseline is built by `lib/recommendation.ts:getBaseline()`:

- requires 5 eligible sessions (`BASELINE_SESSION_COUNT = 5`);
- filters with `isCompletedBaselineSession()`, which delegates to `getBaselineEligibility()`;
- sorts eligible sessions by `createdAt`;
- uses the latest 24 eligible sessions for rolling baseline stats once at least 5 exist (`ROLLING_BASELINE_SESSION_COUNT = 24`);
- stores `mean`, `stdDev`, `median`, `mad`, `iqr`, `sourceSessionIds`, `count`, and `validBaselineCount`.

`getBaselineEligibility()` excludes sessions with:

- missing/broken features;
- `captureQuality` poor/rejected;
- rejected quality decision or stored rejected quality;
- low-quality flags such as too-short, near-silent, clipping, excessive-silence, low-active-audio, too-faint;
- duration below 8 seconds;
- silence/faintness beyond soft-usable allowance;
- near-silence mean RMS;
- clipping above 0.08;
- too much silence/quiet audio;
- active frame ratio below gate and soft RMS;
- pitch coverage below 0.35;
- high noise floor combined with low clarity/pitch coverage;
- zero confidence.

The quality loudness baseline is separate. `quality.ts:getLoudnessBaselineRms()` uses up to 5 recent clean, non-faint sessions and requires at least 3.

### First 0-5 Hums

- 0 hums: no result card; capture is ready.
- 1-4 eligible hums: Moment Read should say learning/calibration and avoid strong baseline-relative claims.
- 5 eligible hums: baseline becomes active. Reads can say "closer to usual," "more than usual," etc.
- More than 5: rolling baseline can update with recent eligible sessions up to 24.

### Intended Copy

- "Usable signal - learning baseline 2/5"
- "This is a calibration read. We can describe the shape, but not your usual yet."
- "Baseline active - 7 hums"

Avoid saying "not enough baseline" forever if usable hums exist. The UI should show the recomputed eligible count and the exclusion reason for non-qualifying hums in debug. If baseline count gets stuck, developers should run `window.__HUM_DEBUG__.printBaselineStatus()` and inspect `baselineEligibilityReason`.

## 8. Moment Inference Logic

Moment inference has two layers:

1. Baseline state classification in `lib/recommendation.ts:analyzeHumState()`.
2. User-facing Moment Read copy and dimensions in `lib/momentRead.ts:buildMomentRead()`.

### Current Baseline Classification

If no baseline exists, `analyzeHumState()` returns `label: null`, `labelConfidence: null`, `dimensionScores: null`, and `baselineComparison: null`.

With baseline:

- `getFeatureDeltas()` computes z-score-like deltas and ratios.
- `getDimensionScores()` derives activation, stability, clarity, smoothness, continuity, control, and baseline distance.
- `rankDimensionLabels()` ranks possible labels.
- If baseline distance is inside `NEUTRAL_BAND = 0.85`, label score is weak, or top labels are too close, the label is "Close to your usual pattern."
- Otherwise the top ranked label wins.

Current labels:

- "Close to your usual pattern"
- "More activated than usual"
- "More subdued than usual"
- "Steadier than usual"
- "More variable than usual"
- "Flatter than usual"
- "Less clear than usual" exists in types but is not a dominant current label path.

### Current Moment Read Dimensions

`buildMomentRead()` maps raw or baseline-relative scores to five user-facing dimensions:

- Inner charge (`activation`)
- Steadiness (`stability`)
- Held-togetherness (`control`)
- Flow (`continuity`)
- Read confidence (`clarity`)

Then `choosePattern()` picks one visual/copy pattern:

- `activeUnderneath`
- `quietConnected`
- `hardToAnchor`
- `expressiveHeld`
- `movingShape`
- `settled`
- `heldBack`
- `unclear`

### Intended Non-Clinical Interpretation Rules

Activation is inferred from loudness, active frame ratio, voiced coverage, spectral brightness, and baseline-relative energy. Say "more charged," "more push," "lower lift," or "quieter output," not clinical arousal terms.

Steadiness is inferred from pitch stability, jitter, residual instability, smoothness, stable segment coverage, and dropouts. Say "steady," "less even," "held together," or "moving around."

Strain or effort is inferred when activation/movement exists alongside lower smoothness, more corrections, residual instability, or high control. Say "held together with effort" or "controlled, but not fully easy."

Softness / low drive is inferred from lower energy, lower active ratio, more quiet space, narrower pitch range, and low lift. Say "low-output rather than calm" when steadiness is not strong enough to call it calm.

Closeness to baseline is inferred from `baselineDistanceScore`, dimension shifts near neutral, and label confidence. Say "closer to your normal" only when baseline is active.

Mixed states should be explicit:

- high control + high activation: "You sounded composed, but loaded."
- steady + lower lift: "You sounded contained, with less lift."
- energy + instability: "Your hum had energy, but it did not land smoothly."
- clear signal + low output: "You sounded low-output rather than calm."

Confidence affects wording:

- Low confidence: "This is a light read..."
- Learning: "We can read the shape, but we are still learning your usual."
- Strong baseline: direct but still non-diagnostic.

The app avoids overclaiming by grounding each read in one simple evidence sentence and by not turning vocal features into diagnoses. It should also avoid cryptic or AI-poetic language. Lines like "your hum carries a quiet weather" are not acceptable.

## 9. Moment Read Card UX And Copy Rules

Current card: `components/SignalSummary.tsx` renders:

- header: "Today's read" plus confidence pill;
- calibration/meta line;
- headline;
- evidence and interpretation lines;
- chips;
- "Why we think this" signal list;
- state summary dimension rows;
- wellness disclaimer;
- "View signal details" disclosure.

Intended hierarchy:

1. Main read: one direct sentence. Example: "You sounded steady, but loaded."
2. Why we think that: one plain evidence sentence. Example: "Your hum stayed connected, but there were small corrections in the sound."
3. What changed from usual: one baseline-relative sentence when baseline exists. Example: "This is close to your normal, with a little extra push."
4. Confidence / learning note: short if needed.
5. View Signal Details: expandable technical metrics.

Do not repeat Song Match rationale inside the Moment Read beyond a short hint. Song selection belongs in the Song Match card. Avoid dashboard-style jargon in the card body; keep z-scores, RMS, SNR, and residual instability in details.

Copy variation should come from pattern templates and dimension combinations, but the meaning must stay stable. Prefer direct human reads:

- "You sound more held-together than relaxed."
- "Your hum has energy, but it is not landing smoothly."
- "This sounds steady, but a little guarded."
- "You sound low-output rather than calm."
- "Your voice is controlled, but not fully easy."
- "This is closer to your normal, with a little extra push."

Avoid:

- vague weather/current metaphors;
- clinical labels;
- repeating "pressure held" too often;
- "Lab direction" as visible end-user language unless reframed.

## 10. Song Match Card UX

Song Match is separate from Moment Read because it answers a different question. Moment Read says what the hum suggests; Song Match says how the app translated that moment plus user taste into a track search.

Current Song Match card includes:

- title: "Your Sound Match";
- `momentRead.soundMatch`;
- `momentRead.soundWhy`;
- visible `Lab direction: ...` pill when available;
- language chips;
- main genre chips;
- flavor chips;
- helper/error text;
- "Curate my song" button.

Current song result card includes:

- title and artist from Last.fm result;
- tags from language, matched genres, and matched shape words;
- provider text;
- "Why this song" reason;
- `sourceUrl` as "Track details" when present;
- YouTube search link built by `buildOfficialYouTubeSearchUrl()`;
- try-another button;
- feedback buttons: Good match, Too slow, Too intense, Not my taste.

Intended Song Match tone:

- Good: "Based on this hum, we looked for something with controlled intensity and a steadier landing."
- Bad: "Because you are anxious, here is calming music."

The song card should not repeat the Moment Read headline. It should explain the selected lane: language, main genre, optional flavors, hum shape, and direction. If no valid match exists, the UI should offer a specific recovery: choose a broader genre, change language, remove flavors, or try again.

Current limitation: no embedded player exists. The app links to Last.fm details and YouTube search results rather than playing tracks inline.

## 11. Song Curation Pipeline

There are two music systems.

### Local Demo Recommendation

`lib/musicRecommendation.ts:recommendMusicSession()` uses `lib/musicCatalog.ts:demoMusicCatalog`. It is created immediately for accepted hum sessions but the newer UI primarily uses live curation.

Pipeline:

- `getRegulationTarget()` maps baseline deltas and signal labels to `downshift`, `ground`, `gentle_lift`, `focus`, `release`, or `maintain`.
- `scoreTracks()` scores demo tracks by regulation fit, taste fit, feedback boost, novelty, artist credibility, recent penalty, negative feedback penalty, and contraindication penalty.
- Top 3 track IDs are stored in `musicRecommendation.recommendedTrackIds`.

These regulation targets are internal music-direction labels, not genres.

### Live Last.fm Song Match

`components/SignalSummary.tsx:handleCurate()` calls `POST /api/music/recommend`. The route expects `LASTFM_API_KEY` in environment. `.env.example` documents the key name. Do not expose real secrets.

Server route:

- validates JSON body;
- blocks English + Hindi-lane genres before provider call;
- requires `LASTFM_API_KEY`;
- normalizes filters with `inferSoundMatchPayload()`;
- requires a main genre;
- calls `recommendLiveSong()`.

`lib/liveMusicIntent.ts:buildMusicIntent()`:

- normalizes `labDirection` to `Settle`, `Lift`, `Ground`, `Release`, `Focus`, or `Soothe`;
- derives `HumMusicalShape` from audio features: energy, pitch movement, stability, texture, tempo feel, vocal shape;
- combines direction mood words, hum shape words, language, main genre, and flavor genres.

`lib/liveMusicProvider.ts:recommendLiveSong()`:

- builds a candidate source plan from Last.fm tag, geo, chart, and search methods;
- fetches up to 12 source pools;
- deduplicates by title/artist;
- hard-rejects covers, karaoke, remixes, generic mood-library artists, bad language lanes, genre mismatches, and non-intentional artifacts;
- enriches top rough candidates with Last.fm metadata/tags;
- scores by source, popularity, language, selected genre, direction-within-genre, hum shape, enriched tags, feedback, and penalties;
- avoids recent exclusions;
- chooses a weighted pick from the top candidates;
- returns title, artist, provider, Last.fm URL, YouTube search URL, estimated language, matched genres, matched shape words, and reason.

Known artist preference exists as `credibilityArtists`, which reduces penalty for known credible artists. Popularity is represented by listener/playcount log score. Duplicate and bad results are avoided through `dedupeCandidates()`, `getHardRejectReason()`, and recent exclusion storage.

Important product rule: genres presented to users must be actual genres: Bollywood, Indie, Pop, Rock, Metal, Jazz, Blues, Classical, Folk, Devotional, plus flavor textures Acoustic, Lo-fi, Electronic, Ambient. Internal labels such as Settle, Release, Lift, Ground, Focus, Hold, and Maintain must not be shown as genres.

## 12. Filter Rules

Current filter code lives in `lib/soundMatchFilters.ts`.

Languages:

- Hindi
- English
- Surprise me

Main genres:

- Bollywood
- Indie
- Pop
- Rock
- Metal
- Jazz
- Blues
- Classical
- Folk
- Devotional

Flavors, max 2:

- Acoustic
- Lo-fi
- Electronic
- Ambient

Compatibility:

| Combination | Current rule | Intended behavior |
| --- | --- | --- |
| English + Rock | allowed | allowed |
| English + Metal | allowed | allowed |
| Hindi + Bollywood | allowed | allowed |
| Hindi + Devotional | allowed | allowed |
| English + Bollywood | blocked/auto-repaired to Hindi | block or transform with clear explanation |
| English + Devotional | blocked/auto-repaired to Hindi | block unless English devotional catalogue is defined |
| Bollywood + Metal | impossible as two main genres | blocked unless future multi-main support exists |
| Main genre + 3 flavors | third flavor disabled | keep max 2 |

Current UI shows disabled chips with `disabled`, `aria-disabled`, `title` helper, and sometimes warning dots for awkward but allowed flavor combinations. It does not hide incompatible chips; this is preferable because the user can learn why a lane is unavailable.

Awkward flavors are allowed with helper copy. Example: Metal + Lo-fi is a "narrow lane" rather than blocked. Main language/genre blocks are hard disabled.

## 13. Feedback Loop

Current live song feedback:

- Good match
- Too slow
- Too intense
- Not my taste

Stored in `localStorage["hum_song_feedback"]` by `saveSongFeedback()`, capped at 80 records. It affects future live curation in `scoreFeedback()` for matching direction/language/genre contexts.

Current live song history:

- Stored in `localStorage["hum_song_recommendation_history"]`, capped at 40 records.
- `getRecentSongExclusions()` excludes first 10 history items or anything from the last 7 days.

Current older music-session feedback:

- `updateMusicSessionFeedback()` stores regulation outcomes (`calmer`, `clearer`, `more_steady`, `same`, `heavier`, `not_for_me`, `skipped`) plus taste outcomes.
- It updates `hum:music:taste-model:v1` and `hum:music:regulation-response:v1`.

Skipped feedback should be treated as weak negative/neutral, not as dislike. Current local model maps `skipped` to -0.5 in `updateMusicLearning()`, but live song feedback has no explicit skipped option.

Eventually, durable feedback and taste models should move to backend storage if cross-device personalization is required. Today, all learning is local-only.

## 14. Storage And Data Model

### localStorage Keys

| Key | Owner | Shape |
| --- | --- | --- |
| `hum:sessions` | `lib/storage.ts` | array of `HumSession`, latest 60 |
| `hum:action-scores` | `lib/storage.ts` | `ActionScores` legacy action learning |
| `hum:music:taste-model:v1` | `lib/storage.ts` | `MusicTasteModel` |
| `hum:music:regulation-response:v1` | `lib/storage.ts` | `RegulationResponseModel` |
| `hum:quality-events` | `lib/storage.ts` | last 20 rejected quality diagnostic events |
| `hum_song_recommendation_history` | `lib/liveMusicStorage.ts` | last 40 live song history items |
| `hum_song_feedback` | `lib/liveMusicStorage.ts` | last 80 live song feedback items |
| `hum:debug` | `lib/humDebug.ts` / audit route | `"1"` enables debug logs in development |

`getSessions()` also scans all localStorage and sessionStorage entries for hum-like records and normalizes them. `hum:sessions` wins on duplicate identities.

### IndexedDB

`lib/audioStorage.ts`:

- DB: `hum-audio`
- Store: `recordings`
- Version: 1
- Record shape: `{ key, blob, createdAt }`
- Keeps audio for up to 20 current keys through `pruneRecordingAudio()`.

### Session Shape

`types/hum.ts: HumSession` includes:

- ids and timestamps;
- `features`;
- `qualityDecision`, `captureQuality`, capture/state reasons, confidence;
- baseline fields;
- `signal`, `signalType`, dimension scores, label confidence;
- audio key/mime type;
- local/demo music recommendation and music session;
- feedback fields;
- metadata and ML data;
- consent/privacy booleans.

### Privacy Assumptions

Feature extraction and session storage are local. Accepted audio blobs are stored locally in IndexedDB. The live song route sends hum-derived features, read summary, selected filters, exclusions, and feedback to the app's own API route, which then queries Last.fm. Raw audio is not sent by current code. No backend persistence is implemented.

## 15. Debug And Developer Tools

Existing tools:

- `/debug/audit`: enables `hum:debug=1`, lists recent sessions, recomputed audit details, schema, and IndexedDB audio playback.
- `window.__HUM_DEBUG__.auditSessions()`: compact table, distributions, accepted/rejected groups, baseline status, warnings.
- `window.__HUM_DEBUG__.printMeterFormulas()`: documents energy/stability/movement formulas.
- `window.__HUM_DEBUG__.printBaselineStatus()`: shows eligibility and reasons.
- Development logs:
  - `[Hum recorder] using ...`
  - `[Hum live signal]`
  - `[Hum recorder capture]`
  - `[Hum recording diagnostic]`
  - `[Hum recording pipeline failure]`
  - `[Hum audio features]`
  - `[Hum quality decision]`
  - `[Hum baseline]`
  - `[Hum signal decision]`
  - `[Hum session saved]`
  - `[Hum storage read]`
  - `[live-music-debug]` when API debug flag is true in development.

Additional debug logs that should exist:

- final Sound Match normalized payload;
- Last.fm source plan and selected source per result in UI-accessible debug;
- filter repair/block event;
- baseline count before and after save with eligibility reason for the new session;
- read quality score component breakdown;
- distinction between capture confidence, label confidence, and baseline confidence;
- no-match/fallback reason surfaced in a structured object.

## 16. Known Bugs / Inconsistencies

- Baseline count can appear stuck if sessions are accepted by quality but later fail `getBaselineEligibility()` due to flags, duration after trim, pitch coverage, noise floor, or stale normalized fields. Debug tools exist but product copy may not explain the stuck count.
- Stability may be over-penalized by pitch-tracking dropouts. `humDebugAudit` already warns when pause/state reasons disagree with quiet percentage.
- Older docs claim older thresholds; current minimum duration is 8 seconds, not 2.5 seconds.
- `quality.confidenceWeight` can be 0.95 for many usable captures. The displayed read quality should continue using `MomentRead.getReadQualityScore()` instead of blindly showing 95%.
- Live meter thresholds and decoded quality thresholds are separate; a strong live meter can still produce a weak decoded blob. `DailyMelodyCard.debugRecordingDecision()` warns about this mismatch.
- UI copy changes between idle/recording/analyzing, but the main recording text is stable during recording. Any future live text rewrites should be avoided.
- Some current Moment Read lines still lean on repeated phrases such as "loaded" and "pressure held." The copy is non-clinical but could be more varied and less stylized.
- Song Match currently shows "Lab direction," which exposes internal terminology.
- Song Match reason can repeat hum-read logic because `momentRead.soundWhy` is shown before curation and `buildSongReason()` also explains hum shape.
- English + Bollywood/Devotional is both blocked in route and repaired to Hindi in filter normalization. The UX should make the transformation/block unambiguous.
- The local demo recommendation is saved on every accepted hum even when the visible user flow asks for live curation separately.
- `loudness` exists in `AudioFeatures` and `FeatureDetails` but is not currently populated by `extractAudioFeatures()`.
- `breathBreakCount` and `breakCount` can duplicate concepts.
- Last.fm language inference is tag-based, not true language detection.
- No embedded player exists; YouTube link is search results, not a guaranteed official playable track.

## 17. Acceptance Criteria

Capture UX:

- User sees a calm pre-capture state with one clear CTA.
- Recording runs for 12 seconds by default and can recover gracefully from permission errors.
- Large recording copy remains stable; only timer, meter, signal hint, and visualizer update live.
- Meter does not flicker rapidly between states; current smoothing delay is at least 900ms.

Signal quality:

- Near-silent, clipped, too-short, too-noisy, mostly quiet, and low-voicing hums are rejected with helpful non-shaming copy.
- Soft usable hums are accepted with a clear caveat and lower confidence.
- Displayed read confidence is derived from signal, label, baseline, and quality caps, not a hard-coded 95%.

Baseline:

- Exactly which hums qualify is explainable from `getBaselineEligibility()`.
- Baseline activates after 5 eligible hums.
- Debug view shows why any accepted-looking hum did not count.
- Product copy never says "not enough baseline" without showing progress or reason.

Moment inference:

- Before baseline, reads describe shape without overclaiming "usual."
- After baseline, reads can describe relative shifts.
- Mixed states are handled directly.
- Clinical terms are absent from user-facing copy.

Moment Read copy:

- Headline is one direct sentence.
- Evidence is concrete and plain.
- Baseline-relative sentence appears only when baseline exists.
- Technical terms stay inside "View signal details."

Song curation:

- User-selected language/main genre/flavors are reflected in the API payload and result reason.
- Internal directions are not presented as genres.
- Invalid language/genre combinations are blocked or clearly transformed.
- No-match states provide actionable recovery.
- Recent tracks and negative feedback reduce repeats.

Filter rules:

- English + Rock and English + Metal are allowed.
- Hindi + Bollywood and Hindi + Devotional are allowed.
- English + Bollywood and English + Devotional are blocked unless a defined English catalogue exists.
- Only up to 2 flavors can be selected.
- Disabled chips explain why they are disabled.

Debugging:

- `/debug/audit` can recover stored sessions and audio.
- Console debug can show baseline status, meter formulas, quality decisions, and session warnings.
- Live music debug can show source plan, candidate counts, rejection reasons, top scores, and selected candidate.

Regression prevention:

- Existing tests in `lib/*.regression.test.ts` and `app/api/music/recommend/route.regression.test.ts` should pass.
- Add regression coverage when changing thresholds, filter compatibility, baseline eligibility, Moment Read confidence caps, or Last.fm rejection rules.

## 18. Recommended Next Implementation Phases

### Phase 1: Stabilize Capture And Metrics

Goal: make live meter, decoded blob diagnostics, and stored raw/normalized metrics agree better.

Files likely involved: `components/Recorder.tsx`, `lib/liveSignal.ts`, `lib/audioFeatures.ts`, `lib/audioThresholds.ts`, `components/DailyMelodyCard.tsx`.

Risks: browser differences in MediaRecorder and audio constraints; over-tightening could reject good hums.

How to test: record quiet/normal/loud hums; compare live RMS to decoded RMS; run quality regression tests; inspect `/debug/audit`.

### Phase 2: Fix Baseline And Quality Decisions

Goal: make baseline progress trustworthy and ensure quality flags align with baseline eligibility.

Files likely involved: `lib/quality.ts`, `lib/baselineEligibility.ts`, `lib/recommendation.ts`, `lib/storage.ts`, `components/FeatureDetails.tsx`.

Risks: changing eligibility may shift user baselines; legacy sessions need normalization.

How to test: seed sessions with edge cases; verify `printBaselineStatus()`; add tests for stuck baseline scenarios.

### Phase 3: Rewrite Moment Read Logic / Copy System

Goal: produce clearer, less repetitive, non-clinical reads with explicit evidence and baseline-relative wording.

Files likely involved: `lib/momentRead.ts`, `components/SignalSummary.tsx`, `components/FeatureDetails.tsx`.

Risks: copy can overclaim or become too bland; pattern thresholds can misclassify mixed states.

How to test: snapshot representative feature profiles; verify banned clinical terms; human-read review of copy examples.

### Phase 4: Separate Song Match Properly

Goal: make Song Match explain music selection without repeating Moment Read or exposing lab/internal labels.

Files likely involved: `components/SignalSummary.tsx`, `lib/liveMusicIntent.ts`, `lib/liveMusicProvider.ts`.

Risks: losing useful rationale; confusing direction with genre.

How to test: curate for multiple states and filters; inspect reason text; verify no "Lab direction" visible.

### Phase 5: Fix Song Curation And Filters

Goal: enforce dynamic compatibility and improve result relevance across language/genre lanes.

Files likely involved: `lib/soundMatchFilters.ts`, `app/api/music/recommend/route.ts`, `lib/liveMusicProvider.ts`, `lib/liveMusicIntent.ts`.

Risks: Last.fm tags are noisy; strict filters can cause no candidates.

How to test: run route regression tests; manually test English/Rock, English/Metal, Hindi/Bollywood, Hindi/Devotional, blocked English/Bollywood, Metal with calming directions.

### Phase 6: Add Feedback Learning

Goal: use song feedback and taste history to improve future matches without narrowing recommendations too aggressively.

Files likely involved: `lib/liveMusicStorage.ts`, `lib/liveMusicProvider.ts`, `lib/storage.ts`, `types/hum.ts`.

Risks: feedback loops can overfit; negative feedback can suppress whole genres too broadly.

How to test: simulate feedback sequences; verify repeats decline; verify good-match feedback boosts similar but not identical tracks.

### Phase 7: Polish UI And Regression Tests

Goal: make the full ritual feel modern, calm, cool, and robust across devices.

Files likely involved: `app/globals.css`, `components/Recorder.tsx`, `components/RitualWaveform.tsx`, `components/HumCoreVisualizer.tsx`, `components/SignalSummary.tsx`, tests under `lib` and `app/api`.

Risks: visual polish can accidentally reintroduce flicker or layout shifts.

How to test: desktop/mobile manual capture, visual regression screenshots if available, text overflow checks, complete test suite.
