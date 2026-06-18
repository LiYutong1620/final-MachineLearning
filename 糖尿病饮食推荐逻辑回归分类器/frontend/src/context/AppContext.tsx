import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import {
  FoodItem,
  ModelConfig,
  TrainingLogItem,
  ModelEvaluation,
  ClassCoefficients,
} from "../types";
import { api } from "../utils/api";
import {
  TUNED_L1_CONFIG,
  TUNED_L2_CONFIG,
  pickRecommendedModelType,
} from "../utils/modelDefaults";

export interface AppContextValue {
  data: FoodItem[];
  headers: string[];
  loading: boolean;
  errorText: string;
  setErrorText: (v: string) => void;
  targetColumn: string;
  nameColumn: string;
  numericFeatures: string[];
  featureLimits: Record<string, { min: number; max: number }>;
  classes: string[];
  activeConfig: ModelConfig;
  setActiveConfig: React.Dispatch<React.SetStateAction<ModelConfig>>;
  isTraining: boolean;
  trainingLogs: TrainingLogItem[];
  currentModelType: "l1" | "l2";
  setCurrentModelType: (v: "l1" | "l2") => void;
  hasTrained: boolean;
  l1Metric: ModelEvaluation | null;
  l2Metric: ModelEvaluation | null;
  l1Coefficients: ClassCoefficients[] | null;
  l2Coefficients: ClassCoefficients[] | null;
  trainedModels: { l1: boolean; l2: boolean };
  trainedAt: { l1: string | null; l2: string | null };
  recommendedModelType: "l1" | "l2" | null;
  savedModelConfigs: { l1: Record<string, unknown> | null; l2: Record<string, unknown> | null };
  autoRunningAll: boolean;
  backendPipelineOk: boolean;
  loadDataset: () => Promise<void>;
  handleTrainModel: (config: ModelConfig) => Promise<void>;
  handleRunFullPipeline: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<FoodItem[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  const [targetColumn, setTargetColumn] = useState("class");
  const [nameColumn, setNameColumn] = useState("title");
  const [numericFeatures, setNumericFeatures] = useState<string[]>([]);
  const [featureLimits, setFeatureLimits] = useState<
    Record<string, { min: number; max: number }>
  >({});
  const [classes, setClasses] = useState<string[]>([]);

  const [activeConfig, setActiveConfig] = useState<ModelConfig>({ ...TUNED_L1_CONFIG });

  const [isTraining, setIsTraining] = useState(false);
  const [trainingLogs, setTrainingLogs] = useState<TrainingLogItem[]>([]);
  const [currentModelType, setCurrentModelType] = useState<"l1" | "l2">("l1");
  const [hasTrained, setHasTrained] = useState(false);
  const [recommendedModelType, setRecommendedModelType] = useState<"l1" | "l2" | null>(
    null
  );
  const [savedModelConfigs, setSavedModelConfigs] = useState<{
    l1: Record<string, unknown> | null;
    l2: Record<string, unknown> | null;
  }>({ l1: null, l2: null });

  const [l1Metric, setL1Metric] = useState<ModelEvaluation | null>(null);
  const [l2Metric, setL2Metric] = useState<ModelEvaluation | null>(null);
  const [l1Coefficients, setL1Coefficients] = useState<ClassCoefficients[] | null>(null);
  const [l2Coefficients, setL2Coefficients] = useState<ClassCoefficients[] | null>(null);
  const [trainedModels, setTrainedModels] = useState({ l1: false, l2: false });
  const [trainedAt, setTrainedAt] = useState<{ l1: string | null; l2: string | null }>({
    l1: null,
    l2: null,
  });
  const [autoRunningAll, setAutoRunningAll] = useState(false);
  const [backendPipelineOk, setBackendPipelineOk] = useState(true);

  const checkBackendPipeline = async () => {
    try {
      const health = await api.getHealth();
      const ok =
        health.pipelineVersion === 2 && health.thresholdPromotion === true;
      setBackendPipelineOk(ok);
      if (!ok) {
        setErrorText(
          "检测到旧版 Python 后端（缺少阈值提升逻辑）。请关闭所有 8000 端口进程后重新启动 backend，再点「一键 L2 & L1」。"
        );
      }
      return ok;
    } catch {
      setBackendPipelineOk(false);
      setErrorText("无法连接 Python 后端 (127.0.0.1:8000)，请先启动 backend。");
      return false;
    }
  };

  const syncModelStatus = async () => {
    try {
      const result = await api.getModelStatus();
      if (!result.has_trained) return;

      const nextTrained = { l1: false, l2: false };
      const nextTrainedAt: { l1: string | null; l2: string | null } = { l1: null, l2: null };
      const nextConfigs: { l1: Record<string, unknown> | null; l2: Record<string, unknown> | null } = {
        l1: null,
        l2: null,
      };
      let nextL1Metric = l1Metric;
      let nextL2Metric = l2Metric;

      (["l1", "l2"] as const).forEach((penalty) => {
        const info = result.models?.[penalty];
        if (!info?.ready) return;
        nextTrained[penalty] = true;
        nextTrainedAt[penalty] = info.trained_at || null;
        if (info.config) nextConfigs[penalty] = info.config as Record<string, unknown>;
        if (info.evaluation) {
          const evaluation = info.evaluation as ModelEvaluation;
          if (penalty === "l1") {
            setL1Metric(evaluation);
            nextL1Metric = evaluation;
          } else {
            setL2Metric(evaluation);
            nextL2Metric = evaluation;
          }
        }
        if (info.coefficients) {
          if (penalty === "l1") setL1Coefficients(info.coefficients as ClassCoefficients[]);
          else setL2Coefficients(info.coefficients as ClassCoefficients[]);
        }
      });

      setTrainedModels(nextTrained);
      setTrainedAt(nextTrainedAt);
      setSavedModelConfigs(nextConfigs);
      setHasTrained(nextTrained.l1 || nextTrained.l2);

      const recommended =
        (result.recommended_penalty as "l1" | "l2" | null) ||
        pickRecommendedModelType(nextL1Metric, nextL2Metric);
      setRecommendedModelType(recommended);
      if (recommended) {
        setCurrentModelType(recommended);
      }
    } catch {
      // 后端未启动时忽略
    }
  };

  const loadDataset = async () => {
    setLoading(true);
    setErrorText("");
    try {
      const result = await api.getFoodData();
      setData(result.data as FoodItem[]);
      setHeaders(result.headers as string[]);
      setTargetColumn(result.targetColumn || "class");
      setNameColumn(result.nameColumn || "title");
      setNumericFeatures(result.numericFeatures || []);
      setFeatureLimits(result.featureLimits || {});
      setClasses(result.classes || []);
    } catch (err: any) {
      setErrorText(`数据流读取崩溃: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkBackendPipeline().then(() => loadDataset().then(() => syncModelStatus()));
  }, []);

  const handleTrainModel = async (config: ModelConfig) => {
    if (data.length === 0) return;
    setIsTraining(true);
    setTrainingLogs([]);

    try {
      const result = await api.trainModel(config);
      const logs = result.trainingLogs as TrainingLogItem[];
      setTrainingLogs(
        logs.filter((log) => log.epoch % 3 === 0 || log.epoch === config.epochs)
      );

      const evaluation = result.evaluation as ModelEvaluation;
      const coefficients = result.coefficients as ClassCoefficients[];

      if (config.penalty === "l1") {
        setL1Coefficients(coefficients);
        setTrainedModels((prev) => ({ ...prev, l1: true }));
      } else {
        setL2Coefficients(coefficients);
        setTrainedModels((prev) => ({ ...prev, l2: true }));
      }

      setFeatureLimits(result.featureLimits || featureLimits);
      setClasses(result.classes || classes);
      setCurrentModelType(config.penalty);
      setHasTrained(true);
      setTrainedAt((prev) => ({
        ...prev,
        [config.penalty]: new Date().toISOString(),
      }));
      setSavedModelConfigs((prev) => ({
        ...prev,
        [config.penalty]: {
          ...config,
          moreOftenThreshold: result.moreOftenThreshold,
          classWeightMode: result.classWeightMode ?? config.classWeightMode ?? "mild",
        },
      }));

      // 以服务端刷新后的评估为准，避免旧后端返回「多吃」召回 0 的脏数据
      await syncModelStatus();

      const syncedL1 = config.penalty === "l1" ? evaluation : l1Metric;
      const syncedL2 = config.penalty === "l2" ? evaluation : l2Metric;
      const macroPrecision =
        evaluation.classPerformance.length > 0
          ? evaluation.classPerformance.reduce((acc, item) => acc + item.precision, 0) /
            evaluation.classPerformance.length
          : 0;
      const macroRecall =
        evaluation.classPerformance.length > 0
          ? evaluation.classPerformance.reduce((acc, item) => acc + item.recall, 0) /
            evaluation.classPerformance.length
          : 0;

      await api
        .saveLogs("TRAINING_COMPLETED", {
          penalty: config.penalty,
          lambda: config.lambda,
          learningRate: config.learningRate,
          epochs: config.epochs,
          batchSize: config.batchSize,
          trainRatio: config.trainRatio,
          classWeightMode: config.classWeightMode ?? "mild",
          autoCalibrateThreshold: config.autoCalibrateThreshold ?? true,
          moreOftenThreshold: result.moreOftenThreshold,
          evaluation: {
            accuracy: (config.penalty === "l1" ? syncedL1 : syncedL2)?.accuracy ?? evaluation.accuracy,
            macroF1: (config.penalty === "l1" ? syncedL1 : syncedL2)?.macroF1 ?? evaluation.macroF1,
            precision: macroPrecision,
            recall: macroRecall,
          },
          coefficients,
        })
        .catch(() => undefined);
    } catch (err: any) {
      setErrorText(`训练异常: ${err.message}`);
    } finally {
      setIsTraining(false);
    }
  };

  const handleRunFullPipeline = async () => {
    if (data.length === 0) return;
    setAutoRunningAll(true);
    setErrorText("");

    try {
      await handleTrainModel(TUNED_L2_CONFIG);
      await new Promise((r) => setTimeout(r, 600));
      await handleTrainModel(TUNED_L1_CONFIG);
      await syncModelStatus();
    } catch (err: any) {
      setErrorText(`自动化一键训练管道错误: ${err.message}`);
    } finally {
      setAutoRunningAll(false);
    }
  };

  return (
    <AppContext.Provider
      value={{
        data,
        headers,
        loading,
        errorText,
        setErrorText,
        targetColumn,
        nameColumn,
        numericFeatures,
        featureLimits,
        classes,
        activeConfig,
        setActiveConfig,
        isTraining,
        trainingLogs,
        currentModelType,
        setCurrentModelType,
        hasTrained,
        l1Metric,
        l2Metric,
        l1Coefficients,
        l2Coefficients,
        trainedModels,
        trainedAt,
        recommendedModelType,
        savedModelConfigs,
        autoRunningAll,
        backendPipelineOk,
        loadDataset,
        handleTrainModel,
        handleRunFullPipeline,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
