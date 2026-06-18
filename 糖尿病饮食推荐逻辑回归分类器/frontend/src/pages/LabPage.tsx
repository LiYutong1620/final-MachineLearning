import {
  Activity,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import DatasetExplorer from "../components/DatasetExplorer";
import ModelTrainer from "../components/ModelTrainer";
import ModelEvaluationSection from "../components/ModelEvaluation";
import CoefficientViewer from "../components/CoefficientViewer";
import RuntimeConsole from "../components/RuntimeConsole";

export default function LabPage() {
  const {
    data,
    headers,
    loading,
    errorText,
    targetColumn,
    nameColumn,
    numericFeatures,
    loadDataset,
    handleTrainModel,
    trainingLogs,
    isTraining,
    activeConfig,
    setActiveConfig,
    hasTrained,
    currentModelType,
    setCurrentModelType,
    l1Metric,
    l2Metric,
    l1Coefficients,
    l2Coefficients,
    handleRunFullPipeline,
    autoRunningAll,
    backendPipelineOk,
  } = useApp();

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 space-y-10">
      {!backendPipelineOk && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <strong>后端版本过旧或未启动。</strong> 请运行{" "}
          <code className="bg-rose-100 px-1 rounded">backend/restart_backend.ps1</code>{" "}
          或手动重启 8000 端口，直到{" "}
          <code className="bg-rose-100 px-1 rounded">/api/health</code> 返回{" "}
          <code className="bg-rose-100 px-1 rounded">pipelineVersion: 2</code>，再刷新本页。
        </div>
      )}
      <div className="bg-gradient-to-r from-indigo-800 to-violet-900 rounded-3xl p-6 sm:p-8 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 bottom-0 opacity-10 scale-[1.5] translate-y-8 pointer-events-none">
          <Activity className="w-96 h-96" />
        </div>
        <div className="relative z-10 max-w-3xl">
          <span className="text-[10px] font-bold uppercase tracking-wider bg-white/10 px-3 py-1 rounded-full">
            模型实验室 · 机器学习全流程
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold mt-3">
            多项式逻辑回归 (Softmax) 训练与评估
          </h2>
          <p className="text-xs sm:text-sm text-white/85 mt-3 leading-relaxed">
            从 IBM 食品数据集探索、MinMax 归一化、分层采样，到 L1/L2 正则化逻辑回归训练、
            混淆矩阵评估、特征系数分析与审计日志——完整展示本次机器学习实验过程。
          </p>
          <div className="flex flex-wrap gap-4 mt-5 pt-4 border-t border-white/10 text-xs">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-indigo-300" /> Stratify 80:20
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-indigo-300" /> MinMax 归一化
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-indigo-300" /> Python NumPy Softmax
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-indigo-300" /> 温和类别权重
            </span>
          </div>
        </div>

        {data.length > 0 && (
          <button
            onClick={handleRunFullPipeline}
            disabled={autoRunningAll || isTraining}
            className="relative z-10 mt-5 flex items-center gap-2 bg-white/15 hover:bg-white/25 disabled:opacity-60 text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer transition"
          >
            <Zap className="w-3.5 h-3.5" />
            {autoRunningAll
              ? "正在一键训练 L2 & L1…"
              : hasTrained
                ? "重新一键训练 L2 & L1"
                : "一键执行 L2 & L1 完整训练"}
          </button>
        )}
      </div>

      {errorText && (
        <div className="bg-red-50 border border-red-100 p-4 rounded-xl text-xs text-red-800">
          <span className="font-bold">❌ </span>{errorText}
        </div>
      )}

      {hasTrained && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-xs text-emerald-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="font-bold">✓ 训练完成</span>
            <span className="mx-2">·</span>
            模型已保存至 <code className="bg-emerald-100 px-1 rounded">backend/saved_models/</code>，重启服务后自动恢复。
          </div>
          <button
            type="button"
            onClick={handleRunFullPipeline}
            disabled={autoRunningAll || isTraining}
            className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-bold px-3 py-1.5 rounded-lg cursor-pointer transition shrink-0"
          >
            <Zap className="w-3.5 h-3.5" />
            {autoRunningAll ? "训练中…" : "重新一键训练 L2 & L1"}
          </button>
        </div>
      )}

      <section>
        <PhaseLabel phase="01" color="emerald" title="在线数据导入与分布核查" />
        <DatasetExplorer
          data={data}
          headers={headers}
          numericFeatures={numericFeatures}
          targetColumn={targetColumn}
          nameColumn={nameColumn}
          loading={loading}
          onReload={loadDataset}
        />
      </section>

      {data.length > 0 && (
        <section>
          <PhaseLabel phase="02" color="indigo" title="逻辑回归模型超参训练调谐" />
          <ModelTrainer
            onTrainModel={handleTrainModel}
            onRunFullPipeline={handleRunFullPipeline}
            autoRunningAll={autoRunningAll}
            trainingLogs={trainingLogs}
            isTraining={isTraining}
            activeConfig={activeConfig}
            setActiveConfig={setActiveConfig}
            hasTrained={hasTrained}
          />
        </section>
      )}

      {hasTrained && (
        <section>
          <PhaseLabel phase="03" color="pink" title="混淆矩阵与性能对比分析" />
          <div className="flex gap-2 mb-4 bg-gray-100 p-1 rounded-xl w-fit">
            {(["l1", "l2"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setCurrentModelType(type)}
                className={`px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition ${
                  currentModelType === type
                    ? "bg-white text-indigo-700 shadow-xs"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {type === "l1" ? "L1 (Lasso)" : "L2 (Ridge)"} 诊断
              </button>
            ))}
          </div>
          <ModelEvaluationSection
            l1Metric={l1Metric}
            l2Metric={l2Metric}
            currentType={currentModelType}
          />
        </section>
      )}

      {hasTrained && (
        <section>
          <PhaseLabel phase="04" color="amber" title="特征维度决策边界诠释" />
          <CoefficientViewer
            l1Coefficients={l1Coefficients}
            l2Coefficients={l2Coefficients}
            currentType={currentModelType}
          />
        </section>
      )}

      {hasTrained && (
        <section>
          <PhaseLabel phase="06" color="slate" title="决策过程运行时审计日志" />
          <RuntimeConsole />
        </section>
      )}
    </main>
  );
}

function PhaseLabel({
  phase,
  color,
  title,
}: {
  phase: string;
  color: "emerald" | "indigo" | "pink" | "amber" | "slate";
  title: string;
}) {
  const colors = {
    emerald: "text-emerald-600 bg-emerald-50",
    indigo: "text-indigo-600 bg-indigo-50",
    pink: "text-pink-600 bg-pink-50",
    amber: "text-amber-600 bg-amber-50",
    slate: "text-slate-600 bg-slate-100",
  };

  return (
    <div className="flex items-center gap-2 mb-3">
      <span className={`font-mono text-xs font-bold px-2.5 py-1 rounded-full ${colors[color]}`}>
        Phase {phase}
      </span>
      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{title}</span>
    </div>
  );
}
