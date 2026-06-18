import { Link } from "react-router-dom";
import { Heart, AlertCircle, ArrowRight, Star, Settings2 } from "lucide-react";
import { useApp } from "../context/AppContext";
import InteractivePredictor from "../components/InteractivePredictor";
import {
  CLASS_WEIGHT_MODE_LABELS,
  hasWeakMinorityClass,
  hasMoreOftenOverPredict,
  findMoreOftenPerformance,
} from "../utils/modelDefaults";

export default function DemoPage() {
  const {
    errorText,
    hasTrained,
    currentModelType,
    setCurrentModelType,
    featureLimits,
    classes,
    trainedModels,
    trainedAt,
    l1Metric,
    l2Metric,
    recommendedModelType,
    savedModelConfigs,
  } = useApp();

  const activeMetric = currentModelType === "l1" ? l1Metric : l2Metric;
  const activeConfig = savedModelConfigs[currentModelType];
  const activeTrainedAt = trainedAt[currentModelType];
  const formattedTrainedAt = activeTrainedAt
    ? new Date(activeTrainedAt).toLocaleString("zh-CN")
    : null;
  const showMinorityWarning = hasWeakMinorityClass(activeMetric);
  const showOverPredictWarning = hasMoreOftenOverPredict(activeMetric);
  const morePerf = findMoreOftenPerformance(activeMetric);
  const threshold = Number(activeConfig?.moreOftenThreshold ?? 0);
  const weightMode =
    (activeConfig?.classWeightMode as keyof typeof CLASS_WEIGHT_MODE_LABELS) || "mild";

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 space-y-8">
      <div className="bg-gradient-to-r from-emerald-700 to-teal-800 rounded-3xl p-6 sm:p-8 text-white shadow-md">
        <span className="text-[10px] font-bold uppercase tracking-wider bg-white/10 px-3 py-1 rounded-full">
          功能展示 · 饮食推荐
        </span>
        <h2 className="text-2xl sm:text-3xl font-extrabold mt-3">
          糖尿病患者智能饮食分类推荐
        </h2>
        <p className="text-sm text-white/85 mt-2 max-w-2xl leading-relaxed">
          输入食品营养指标，逻辑回归模型自动输出<strong>多吃 / 适量 / 少吃</strong>三类饮食建议，
          并可生成 AI 营养师解读报告。
        </p>
      </div>

      {errorText && (
        <div className="bg-red-50 border border-red-100 p-4 rounded-xl text-xs text-red-800">
          <span className="font-bold">❌ </span>{errorText}
        </div>
      )}

      {!hasTrained && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-bold">模型尚未训练</p>
            <p className="text-xs mt-1 text-amber-800">
              请先到「模型实验室」完成数据探索与模型训练，再返回此处进行饮食预测。
            </p>
            <Link
              to="/lab"
              className="inline-flex items-center gap-1 mt-3 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition"
            >
              前往模型实验室 <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {hasTrained && activeMetric && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-xs text-emerald-800 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-bold">✓ 模型已就绪</span>
          {formattedTrainedAt && <span>最近训练：{formattedTrainedAt}</span>}
          {recommendedModelType && (
            <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
              <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
              推荐模型：{recommendedModelType.toUpperCase()}
            </span>
          )}
          <span className="text-emerald-600">重启 backend 后会自动加载已保存模型</span>
        </div>
      )}

      {hasTrained && activeConfig && (
        <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs text-slate-700 flex flex-wrap items-center gap-x-4 gap-y-1">
          <Settings2 className="w-3.5 h-3.5 text-slate-500" />
          <span>
            权重：<strong>{CLASS_WEIGHT_MODE_LABELS[weightMode] ?? weightMode}</strong>
          </span>
          {threshold > 0 && (
            <span>
              「多吃」概率门槛：<strong>{(threshold * 100).toFixed(0)}%</strong>
            </span>
          )}
          {morePerf && (
            <span>
              「多吃」测试精确率 <strong>{(morePerf.precision * 100).toFixed(1)}%</strong> · 召回{" "}
              <strong>{(morePerf.recall * 100).toFixed(1)}%</strong>
            </span>
          )}
        </div>
      )}

      {hasTrained && showOverPredictWarning && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-800">
          <span className="font-bold">⚠ 边界提示：</span>
          「多吃」精确率仍约 {((morePerf?.precision ?? 0) * 100).toFixed(0)}%（召回偏高）。
          演示时请关注 Softmax 置信度；概率接近门槛时建议人工复核。
        </div>
      )}

      {hasTrained && showMinorityWarning && !showOverPredictWarning && (
        <div className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 text-xs text-rose-800">
          <span className="font-bold">⚠ 少数类提醒：</span>
          「多吃」召回过低。请在实验室将权重设为「温和」或「标准」后重新一键训练。
        </div>
      )}

      {hasTrained && activeMetric && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-[10px] text-gray-400 font-bold uppercase">验证集准确率</p>
            <p className="text-2xl font-extrabold text-emerald-600 mt-1">
              {(activeMetric.accuracy * 100).toFixed(1)}%
            </p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-[10px] text-gray-400 font-bold uppercase">Macro F1</p>
            <p className="text-2xl font-extrabold text-indigo-600 mt-1">
              {(activeMetric.macroF1 * 100).toFixed(1)}%
            </p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex flex-col justify-center">
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentModelType("l1")}
                className={`relative flex-1 text-xs font-bold py-1.5 rounded-lg cursor-pointer ${
                  currentModelType === "l1"
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                L1 模型
                {recommendedModelType === "l1" && (
                  <span className="absolute -top-1.5 -right-1 text-[8px] bg-amber-400 text-amber-950 px-1 rounded">
                    推荐
                  </span>
                )}
              </button>
              <button
                onClick={() => setCurrentModelType("l2")}
                className={`relative flex-1 text-xs font-bold py-1.5 rounded-lg cursor-pointer ${
                  currentModelType === "l2"
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                L2 模型
                {recommendedModelType === "l2" && (
                  <span className="absolute -top-1.5 -right-1 text-[8px] bg-amber-400 text-amber-950 px-1 rounded">
                    推荐
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <section>
        <div className="flex items-center gap-2 mb-3">
          <Heart className="w-4 h-4 text-emerald-600" />
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            交互式饮食分类预测
          </span>
        </div>
        <InteractivePredictor
          featureLimits={featureLimits}
          classes={classes}
          activePenaltyType={currentModelType}
          modelReady={hasTrained && trainedModels[currentModelType]}
          moreOftenThreshold={threshold}
        />
      </section>
    </main>
  );
}
