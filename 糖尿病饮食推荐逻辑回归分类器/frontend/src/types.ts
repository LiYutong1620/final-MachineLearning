export interface FoodItem {
  id?: string;
  [key: string]: any; // Allows dynamic features from dataset
}

export type PenaltyType = "l1" | "l2";
export type ClassWeightMode = "off" | "mild" | "strong";

export interface ModelConfig {
  penalty: PenaltyType;
  lambda: number; // Regularization strength
  learningRate: number;
  epochs: number;
  batchSize: number;
  trainRatio: number; // e.g. 0.8
  /** @deprecated use classWeightMode */
  useClassWeights?: boolean;
  classWeightMode?: ClassWeightMode;
  autoCalibrateThreshold?: boolean;
  moreOftenThreshold?: number | null;
}

export interface TrainingLogItem {
  epoch: number;
  loss: number;
  accuracy: number;
}

export interface ClassPerformance {
  className: string;
  precision: number;
  recall: number;
  f1Score: number;
  support: number;
}

export interface ModelEvaluation {
  accuracy: number;
  macroF1: number;
  classPerformance: ClassPerformance[];
  confusionMatrix: number[][]; // actual x predicted
  classNames: string[];
}

export interface TrainTestSplit {
  train: FoodItem[];
  test: FoodItem[];
}

export interface CoefficientWeight {
  feature: string;
  weight: number;
}

export interface ClassCoefficients {
  className: string;
  coefficients: CoefficientWeight[];
  intercept: number;
}
