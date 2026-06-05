import { analyzeHumState } from "@/lib/recommendation";
import type { AudioFeatures, BaselineStats, DimensionScores, SignalLabel } from "@/types/hum";

export type HumModelInput = {
  features: AudioFeatures;
  baseline: BaselineStats | null;
};

export type HumModelOutput = {
  label: SignalLabel | null;
  labelConfidence: number | null;
  dimensionScores: DimensionScores | null;
  baselineComparison: ReturnType<typeof analyzeHumState>["baselineComparison"];
};

export interface HumStateModel {
  version: string;
  predict(input: HumModelInput): HumModelOutput;
}

export class RuleBasedHumModelV2 implements HumStateModel {
  version = "Rule-based v2";

  predict(input: HumModelInput): HumModelOutput {
    return analyzeHumState(input.features, input.baseline);
  }
}

export class FeatureMLModel {
  version = "Feature ML placeholder";

  predict(): never {
    throw new Error("FeatureMLModel is a placeholder and is not available for predictions.");
  }
}

export class NeuralEmbeddingModel {
  version = "Neural embedding placeholder";

  predict(): never {
    throw new Error("NeuralEmbeddingModel is a placeholder and is not available for predictions.");
  }
}
