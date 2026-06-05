# Hum Insight Feature Inventory

Implementation note for the Read and Thread insight rebuild. This inventory is based on code inspection only.

## Guardrails

- No acoustic feature names were added for this work.
- User-facing aliases in `lib/humFeatureInventory.ts` map one-to-one to existing `AudioFeatures` keys.
- New insight objects such as `todayVsUsual`, `recentVsEarlier`, `patternState`, `diary`, and `feedbackTargetId` are aggregates or product state derived from stored hum records. They are not new acoustic features.
- Numeric insight comparison uses existing `baselineComparison.zScores` and `baselineComparison.ratios` when present, and falls back to `analyzeHumState()` plus `getBaseline()` only when old records are missing stored comparisons.
- The existing baseline target is `BASELINE_SESSION_COUNT` in `lib/recommendation.ts`. The existing comparison neutral band is `BASELINE_NEUTRAL_BAND` in the same file.

## Data Path

| Stage | Code path | Existing data used |
| --- | --- | --- |
| Recording | `components/Recorder.tsx` | Captured `Blob`, live RMS diagnostics |
| Analysis | `components/screens/HumScreen.tsx`, legacy `components/DailyMelodyCard.tsx` | Calls `extractAudioFeatures()` |
| Derived values | `lib/audioFeatures.ts` | Builds `AudioFeatures`, `HumContours`, `AudioFeatureDiagnostics` |
| Quality decision | `lib/quality.ts` | `assessHumQuality()` uses `AudioFeatures`, session history, existing threshold constants |
| Baseline eligibility | `lib/baselineEligibility.ts` | `getBaselineEligibility()` filters saved sessions |
| Baseline logic | `lib/recommendation.ts` | `getBaseline()`, `analyzeHumState()`, `baselineComparison`, `dimensionScores` |
| Saved hum object | `components/screens/HumScreen.tsx`, `lib/storage.ts` | `HumSession.features`, `storedFeatureKeys`, `baselineComparison`, `dimensionScores`, `mlData` |
| Read logic | `components/screens/ReadScreen.tsx`, `lib/momentRead.ts`, `lib/humInsightInterpretation.ts` | Latest usable hum, baseline, shared `todayVsUsual` comparison |
| Thread logic | `components/HistoryView.tsx`, `components/screens/ThreadScreen.tsx`, `lib/threadInsight.ts`, `lib/humInsightInterpretation.ts` | Usable hum history, shared `todayVsUsual` and `recentVsEarlier` comparisons |
| Song logic | `components/screens/SongScreen.tsx`, `lib/musicRecommendation.ts`, `lib/liveMusicIntent.ts` | Latest hum features, Moment Read direction, stored song feedback |
| Feedback logic | `lib/storage.ts`, `components/HistoryView.tsx`, `components/screens/SongScreen.tsx` | Thread feedback key `hum:thread-read-feedback:v1`, song feedback keys, per-session feedback |
| Data/history rendering | `components/HistoryView.tsx`, `components/FeatureDetails.tsx`, `app/debug/audit/AuditPanel.tsx` | Saved sessions, feature details, thread debug |

## Storage Surfaces

| Surface | Path or key | Contents |
| --- | --- | --- |
| Session history | localStorage `hum:sessions` | Array of `HumSession` |
| Feature object | `HumSession.features` | Full `AudioFeatures` object after normalization/backfill |
| Stored feature keys | `HumSession.storedFeatureKeys` | Object keys present when the hum was saved or normalized |
| ML vector | `HumSession.mlData.summaryFeatureVector` | `humFeatureVectorKeys` and numeric values |
| Contours | `HumSession.mlData.contours` | `pitchHz`, `rmsEnergy`, `voiced`, `spectralCentroid`, `spectralFlux` arrays |
| Baseline comparison | `HumSession.baselineComparison` | Existing z-scores and ratios from `analyzeHumState()` |
| Dimension scores | `HumSession.dimensionScores` | Existing baseline-relative aggregate scores |
| Thread feedback | localStorage `hum:thread-read-feedback:v1` | `ThreadFeedbackEntry`, now scoped by `targetId` when present |

## Feature Inventory Legend

- Stored: `features` means `HumSession.features`; `vector` means `mlData.summaryFeatureVector`; `baseline` means existing `baselineComparison.zScores` and `ratios` can contain the field.
- Normalized: `audio-normalized` means computed from the normalized sample path in `extractAudioFeatures()`; `raw-level` means computed from trimmed raw decoded samples or raw loudness stats; `score`, `ratio`, `count`, or `seconds` means a derived scalar in its own units.
- Baseline-relative: no `AudioFeatures` value is baseline-relative by itself. Baseline relativity is stored separately in `baselineComparison` or `dimensionScores`.
- Read use: `shared` means used by `buildHumInsightInterpretation()` and rendered by Read when a comparable z-score exists. `direct` means also used by `buildMomentRead()` formulas.
- Thread use: `shared` means eligible for Thread evidence through `buildHumInsightInterpretation()` when enough stored comparisons exist.
- Debug/details: `details` means shown in `FeatureDetails`; `expression details` means exposed there through `getExpressionFilterMetrics()`; `console` means included in debug logging.

## Existing Derived Values

| Field | Computed in | Stored | Normalized | Baseline-relative availability | Read use | Thread use | Debug/details |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `duration` | `extractAudioFeatures()` | features, vector | seconds from trimmed raw audio | no baseline z-score in current baseline list | direct | no current comparison | details, console |
| `rmsEnergy` | `extractAudioFeatures()` | features, vector, baseline | audio-normalized | z-score and ratio | shared, direct | shared | details, console |
| `loudness` | `AudioFeatures` optional legacy field, not populated by current extractor | features only if old data has it | unknown legacy value | no current baseline z-score | no comparison | no comparison | details if present |
| `silenceRatio` | `extractAudioFeatures()` | features, vector, baseline | audio-normalized ratio | z-score and ratio | shared, direct | shared | details, console |
| `zeroCrossingRate` | `extractAudioFeatures()` | features, vector, baseline | audio-normalized ratio | z-score and ratio | shared | shared | details, console |
| `spectralCentroid` | `getSpectralFeatures()` | features, vector, baseline | audio-normalized spectral value | z-score and ratio | shared, direct | shared | details, console |
| `spectralBandwidth` | `getSpectralFeatures()` | features, vector, baseline | audio-normalized spectral value | z-score and ratio | shared | shared | details |
| `spectralRolloff` | `getSpectralFeatures()` | features, vector, baseline | audio-normalized spectral value | z-score and ratio | shared | shared | details |
| `spectralFlux` | `getSpectralFeatures()` | features, vector, baseline | audio-normalized spectral value | z-score and ratio | shared | shared | details |
| `spectralFlatness` | `getSpectralFeatures()` | features, vector, baseline | audio-normalized score | z-score and ratio | shared, direct | shared | details |
| `pitchMean` | `getPitchTrack()` in `extractAudioFeatures()` | features, vector, baseline | audio-normalized pitch track | z-score and ratio | shared | shared | details, console |
| `pitchHz` | `extractAudioFeatures()` alias of `pitchMean`; `normalizeFeatures()` backfills from either field | features only | audio-normalized pitch track | no current baseline z-score | no comparison when `pitchMean` exists | no comparison when `pitchMean` exists | details |
| `pitchVariance` | `extractAudioFeatures()` | features, vector, baseline | audio-normalized pitch track | z-score and ratio | shared, direct | shared | details, console |
| `pitchStability` | `getPitchDifferences()` | features, vector, baseline | audio-normalized pitch track | z-score and ratio | shared | shared | details, console |
| `jitter` | `getPitchDifferences()` standard deviation | features, vector, baseline | audio-normalized pitch track | z-score and ratio | shared, direct | shared | details, console |
| `shimmerProxy` | `getShimmerProxy()` | features, vector, baseline | audio-normalized frame RMS | z-score and ratio | shared, direct | shared | details |
| `hnrProxy` | `getHnrProxy()` | features, vector, baseline | audio-normalized pitch track | z-score and ratio | shared | shared | details |
| `signalToNoiseProxy` | `getSignalToNoiseProxy()` | features, vector, baseline | raw-level ratio | z-score and ratio | shared, direct | shared | details |
| `clarityScore` | `getClarityScore()` | features, vector, baseline | score | z-score and ratio | shared, direct | shared | details |
| `vibratoScore` | `getVibratoFeatures()` | features, vector, baseline | audio-normalized pitch track | z-score and ratio | shared, direct | shared | console |
| `vibratoRate` | `getVibratoFeatures()` | features, vector, baseline | audio-normalized pitch track | z-score and ratio | shared | shared | expression details |
| `vibratoDepth` | `getVibratoFeatures()` | features, vector, baseline | audio-normalized pitch track | z-score and ratio | shared | shared | expression details |
| `vibratoRegularity` | `getVibratoFeatures()` | features, vector, baseline | audio-normalized pitch track | z-score and ratio | shared | shared | expression details |
| `tremorProxy` | `getTremorProxy()` | features, vector, baseline | score | z-score and ratio | shared | shared | no direct row |
| `glideScore` | `getGlideScore()` | features, vector, baseline | audio-normalized pitch track | z-score and ratio | shared, direct | shared | console, expression details |
| `amplitudeStability` | `getAmplitudeStability()` | features, vector, baseline | audio-normalized frame RMS | z-score and ratio | shared, direct | shared | details, console |
| `breakCount` | `getPauseFeatures()` | features, vector, baseline | count | z-score and ratio | shared, direct | shared | details, console |
| `avgPauseLength` | `getPauseFeatures()` | features, vector, baseline | seconds | z-score and ratio | shared, direct | shared | details, console |
| `pauseCount` | `getPauseFeatures()` | features, vector, baseline | count | z-score and ratio | shared, direct | shared | details, console |
| `microBreakRatio` | `getPauseFeatures()` | features, vector, baseline | ratio | z-score and ratio | shared, direct | shared | details, console |
| `pauseStructureScore` | `getPauseFeatures()` | features, vector, baseline | score | z-score and ratio | shared | shared | console |
| `smoothnessScore` | `getSmoothnessScore()` | features, vector, baseline | score | z-score and ratio | shared, direct | shared | details, console |
| `pitchDrift` | `getPitchDrift()` | features, vector, baseline | audio-normalized pitch track | z-score and ratio | shared, direct | shared | details, console |
| `pitchRange` | `getMelodyFeatures()` | features, vector, baseline | semitone range | z-score and ratio | shared, direct | shared | details |
| `noteChangeRate` | `getMelodyFeatures()` | features, vector, baseline | rate | z-score and ratio | shared, direct | shared | console |
| `melodicSmoothness` | `getMelodyFeatures()` | features, vector, baseline | score | z-score and ratio | shared, direct | shared | details |
| `rhythmicStability` | `getMelodyFeatures()` | features, vector, baseline | score | z-score and ratio | shared | shared | details, console |
| `sustainStability` | `getMelodyFeatures()` | features, vector, baseline | score | z-score and ratio | shared, direct | shared | console |
| `breathBreakCount` | `getPauseFeatures()` and `countBreathBreaks()` | features, vector, baseline | count | z-score and ratio | shared | shared | console |
| `attackConsistency` | `getMelodyFeatures()` | features, vector, baseline | score | z-score and ratio | shared, direct | shared | details, console |
| `pitchContourShape` | `getMelodyFeatures()` | features, vector, baseline | contour slope | z-score and ratio | shared | shared | console |
| `pitchCoverage` | `extractAudioFeatures()` | features, vector, baseline | ratio | z-score and ratio | shared, direct | shared | details |
| `onsetDelay` | `getMelodyFeatures()` | features, vector, baseline | seconds | z-score and ratio | shared | shared | no direct row |
| `longestStableSegment` | `getLongestStableSegment()` | features, vector, baseline | seconds | z-score and ratio | shared, direct | shared | details |
| `breathinessProxy` | `getBreathinessProxy()` | features, vector, baseline | score | z-score and ratio | shared, direct | shared | details |
| `musicalityScore` | `getExpressionFilterMetrics()` | features, vector, baseline | score | z-score and ratio | shared, direct | shared | expression details |
| `controlledExpressionScore` | `getExpressionFilterMetrics()` | features, vector, baseline | score | z-score and ratio | shared, direct | shared | expression details |
| `residualPitchInstability` | `getExpressionFilterMetrics()` | features, vector, baseline | score | z-score and ratio | shared, direct | shared | expression details |
| `residualAmplitudeInstability` | `getExpressionFilterMetrics()` | features, vector, baseline | score | z-score and ratio | shared, direct | shared | expression details |
| `residualInstabilityScore` | `getExpressionFilterMetrics()` | features, vector, baseline | score | z-score and ratio | shared, direct | shared | expression details |
| `stableSegmentCoverage` | `getExpressionFilterMetrics()` | features, vector, baseline | ratio | z-score and ratio | shared | shared | expression details |
| `voicingContinuityCoverage` | `getExpressionFilterMetrics()` | features, vector, baseline | ratio | z-score and ratio | shared | shared | expression details |
| `pitchStableSegmentCoverage` | `getExpressionFilterMetrics()` | features, vector, baseline | ratio | z-score and ratio | shared | shared | expression details |
| `phraseContinuityCoverage` | `getExpressionFilterMetrics()` | features, vector, baseline | ratio | z-score and ratio | shared | shared | expression details |
| `notePlateauScore` | `getMelodyFeatures()` | features, vector, baseline | score | z-score and ratio | shared | shared | expression details |
| `stepwiseMelodicScore` | `getMelodyFeatures()` | features, vector, baseline | score | z-score and ratio | shared | shared | expression details |
| `repeatedPitchRegionScore` | `getMelodyFeatures()` | features, vector, baseline | score | z-score and ratio | shared | shared | expression details |
| `phraseContourScore` | `getMelodyFeatures()` | features, vector, baseline | score | z-score and ratio | shared | shared | expression details |
| `inputRms` | `getRmsEnergy(rawSamples)` | features, vector, baseline | raw-level | z-score and ratio | shared, direct | shared | details, console |
| `meanRms` | `getLoudnessStats(rawSamples)` | features, vector, baseline | raw-level | z-score and ratio | shared, direct | shared | details, console |
| `medianRms` | `getLoudnessStats(rawSamples)` | features, vector, baseline | raw-level | z-score and ratio | shared | shared | console |
| `activeFrameRatio` | `getLoudnessStats(rawSamples)` | features, vector, baseline | raw-level ratio | z-score and ratio | shared, direct | shared | details, console |
| `quietFrameRatio` | `getLoudnessStats(rawSamples)` | features, vector, baseline | raw-level ratio | z-score and ratio | shared, direct | shared | details, console |
| `clippedFrameRatio` | `getLoudnessStats(rawSamples)` | features, vector, baseline | raw-level ratio | z-score and ratio | shared, direct | shared | details |
| `noiseFloorRms` | `getLoudnessStats(rawSamples)` | features, vector, baseline | raw-level | z-score and ratio | shared | shared | console |
| `peakAmplitude` | `getPeakAmplitude(rawSamples)` | features, vector | raw-level | no current baseline z-score | direct | no current comparison | details, console |
| `isTooFaint` | `extractAudioFeatures()` | features, storedFeatureKeys | boolean flag | no baseline z-score | direct quality/read guardrail | baseline eligibility only | model/details via quality |
| `isSilent` | `extractAudioFeatures()` | features, storedFeatureKeys | boolean flag | no baseline z-score | direct quality/read guardrail | baseline eligibility only | model/details via quality |

## Baseline-Relative Aggregates

| Aggregate | Computed in | Stored | Inputs |
| --- | --- | --- | --- |
| `baselineComparison.zScores` | `analyzeHumState()` in `lib/recommendation.ts` | `HumSession.baselineComparison`, `HumSession.mlData.zScores` | Existing `stdDevFeatureKeys` only |
| `baselineComparison.ratios` | `analyzeHumState()` in `lib/recommendation.ts` | `HumSession.baselineComparison` | Existing `stdDevFeatureKeys` where current and usual are numeric and usual is positive |
| `dimensionScores` | `getDimensionScores()` in `lib/recommendation.ts` | `HumSession.dimensionScores`, `HumSession.mlData.dimensionScores` | Existing feature deltas and expression-filter metrics |
| `signal` | `analyzeHumState()` via `RuleBasedHumModelV2` | `HumSession.signal`, `HumSession.mlData.finalLabel` | Existing `dimensionScores` and baseline distance |
| `signalType` | `getSignalType()` | `HumSession.signalType` | Existing `signal` label |

## Insight Layer Added By This Work

| Output | Location | Acoustic source |
| --- | --- | --- |
| `todayVsUsual` | `lib/humInsightInterpretation.ts` | Latest usable hum, existing `baselineComparison.zScores` and `ratios`, or computed comparison from existing baseline logic |
| `recentVsEarlier` | `lib/humInsightInterpretation.ts` | Existing baseline-relative z-scores averaged over earlier and recent usable windows |
| `patternState` | `lib/humInsightInterpretation.ts` | Usable hum count, baseline readiness, `todayVsUsual`, `recentVsEarlier`, existing neutral band |
| `diary` | `lib/humInsightInterpretation.ts` | Actual saved `HumSession` records only |
| `feedbackTargetId` | `lib/humInsightInterpretation.ts` | Pattern state, latest session id, usable count, top existing comparison keys and directions |

