import type { HumSession } from "@/types/hum";

export type HumMLExportOptions = {
  includeLocalAudioKeys?: boolean;
};

export type HumMLExport = {
  schemaVersion: 1;
  exportedAt: string;
  localOnly: true;
  includesRawAudio: false;
  includesAudioKeyReferences: boolean;
  sessions: Array<{
    exportId: string;
    createdAt: string;
    taskType: HumSession["taskType"];
    quality: HumSession["quality"];
    captureQuality: HumSession["captureQuality"];
    captureReasons: string[];
    stateReasons: string[];
    shouldEnterBaseline: boolean | undefined;
    shouldGenerateRecommendation: boolean | undefined;
    qualityFlags: string[];
    signalConfidence: number | null;
    baselineVersion: HumSession["baselineVersion"];
    validBaselineCount: number;
    includedInBaseline: boolean;
    summaryFeatureVector: HumSession["mlData"]["summaryFeatureVector"];
    contours: HumSession["mlData"]["contours"];
    zScores: HumSession["mlData"]["zScores"];
    dimensionScores: HumSession["dimensionScores"];
    finalLabel: HumSession["signal"];
    userFeedback: HumSession["userFeedback"];
    actionFeedback: HumSession["actionFeedback"];
    actionId: string;
    metadata: Omit<HumSession["metadata"], "userAgent">;
    audioKey?: string | null;
  }>;
};

export function exportHumSessionsForML(
  sessions: HumSession[],
  options: HumMLExportOptions = {},
): HumMLExport {
  const includeLocalAudioKeys = options.includeLocalAudioKeys ?? false;

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    localOnly: true,
    includesRawAudio: false,
    includesAudioKeyReferences: includeLocalAudioKeys,
    sessions: sessions.map((session, index) => ({
      exportId: `hum-session-${index + 1}`,
      createdAt: session.createdAt,
      taskType: session.taskType,
      quality: session.quality,
      captureQuality: session.captureQuality,
      captureReasons: session.captureReasons ?? [],
      stateReasons: session.stateReasons ?? [],
      shouldEnterBaseline: session.shouldEnterBaseline,
      shouldGenerateRecommendation: session.shouldGenerateRecommendation,
      qualityFlags: session.mlData.qualityFlags,
      signalConfidence: session.mlData.signalConfidence,
      baselineVersion: session.baselineVersion,
      validBaselineCount: session.validBaselineCount,
      includedInBaseline: session.includedInBaseline,
      summaryFeatureVector: session.mlData.summaryFeatureVector,
      contours: session.mlData.contours,
      zScores: session.mlData.zScores,
      dimensionScores: session.dimensionScores,
      finalLabel: session.signal,
      userFeedback: session.userFeedback,
      actionFeedback: session.actionFeedback,
      actionId: session.actionId,
      metadata: anonymizeMetadata(session.metadata),
      ...(includeLocalAudioKeys ? { audioKey: session.audioKey } : {}),
    })),
  };
}

function anonymizeMetadata(metadata: HumSession["metadata"]): Omit<HumSession["metadata"], "userAgent"> {
  return {
    deviceMemoryGb: metadata.deviceMemoryGb,
    hardwareConcurrency: metadata.hardwareConcurrency,
    platform: metadata.platform,
    language: metadata.language,
    browser: metadata.browser,
    sampleRate: metadata.sampleRate,
    audioMimeType: metadata.audioMimeType,
  };
}

export function exportHumSessionsForMLJson(
  sessions: HumSession[],
  options: HumMLExportOptions = {},
) {
  return JSON.stringify(exportHumSessionsForML(sessions, options), null, 2);
}
