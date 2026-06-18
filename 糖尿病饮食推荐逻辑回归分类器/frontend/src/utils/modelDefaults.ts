import { ModelConfig, ModelEvaluation } from "../types";

/** 经调优后的 L1 推荐配置（答辩默认：温和权重 + 自动阈值） */
export const TUNED_L1_CONFIG: ModelConfig = {
  penalty: "l1",
  lambda: 0.006,
  learningRate: 0.05,
  epochs: 160,
  batchSize: 16,
  trainRatio: 0.8,
  classWeightMode: "mild",
  autoCalibrateThreshold: true,
};

/** 与 L1 同学习策略的 L2 对照配置 */
export const TUNED_L2_CONFIG: ModelConfig = {
  penalty: "l2",
  lambda: 0.01,
  learningRate: 0.05,
  epochs: 160,
  batchSize: 16,
  trainRatio: 0.8,
  classWeightMode: "mild",
  autoCalibrateThreshold: true,
};

export const CLASS_WEIGHT_MODE_LABELS: Record<
  NonNullable<ModelConfig["classWeightMode"]>,
  string
> = {
  off: "关闭",
  mild: "温和",
  strong: "标准",
};

export function pickRecommendedModelType(
  l1Metric: ModelEvaluation | null,
  l2Metric: ModelEvaluation | null
): "l1" | "l2" | null {
  if (l1Metric && l2Metric) {
    if (l1Metric.macroF1 !== l2Metric.macroF1) {
      return l1Metric.macroF1 >= l2Metric.macroF1 ? "l1" : "l2";
    }
    return l1Metric.accuracy >= l2Metric.accuracy ? "l1" : "l2";
  }
  if (l1Metric) return "l1";
  if (l2Metric) return "l2";
  return null;
}

export function hasWeakMinorityClass(metric: ModelEvaluation | null): boolean {
  if (!metric) return false;
  return metric.classPerformance.some((row) => row.support > 0 && row.recall === 0);
}

/** 「多吃」召回高但精确率过低 → 过预测 */
export function hasMoreOftenOverPredict(metric: ModelEvaluation | null): boolean {
  if (!metric) return false;
  const moreRow = metric.classPerformance.find((row) => {
    const lower = row.className.toLowerCase();
    return lower.includes("more") || lower.includes("多吃");
  });
  if (!moreRow || moreRow.support === 0) return false;
  return moreRow.recall >= 0.85 && moreRow.precision < 0.38;
}

export function findMoreOftenPerformance(metric: ModelEvaluation | null) {
  if (!metric) return null;
  return (
    metric.classPerformance.find((row) => {
      const lower = row.className.toLowerCase();
      return lower.includes("more") || lower.includes("多吃");
    }) || null
  );
}
