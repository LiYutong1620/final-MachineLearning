import React, { useState } from "react";
import { ModelEvaluation, ClassPerformance } from "../types";
import { CheckCircle2, AlertCircle, BarChart2, Grid, Award, HelpCircle } from "lucide-react";
import { hasWeakMinorityClass, hasMoreOftenOverPredict } from "../utils/modelDefaults";

interface ModelEvaluationProps {
  l1Metric: ModelEvaluation | null;
  l2Metric: ModelEvaluation | null;
  currentType: "l1" | "l2";
}

export default function ModelEvaluationSection({
  l1Metric,
  l2Metric,
  currentType,
}: ModelEvaluationProps) {
  const activeMetric = currentType === "l1" ? l1Metric : l2Metric;

  // Compute differences
  const comparison = React.useMemo(() => {
    if (!l1Metric || !l2Metric) return null;
    const diffAcc = (l1Metric.accuracy - l2Metric.accuracy) * 100;
    const diffF1 = (l1Metric.macroF1 - l2Metric.macroF1) * 100;

    return {
      diffAcc: Number(diffAcc.toFixed(1)),
      diffF1: Number(diffF1.toFixed(1)),
      l1Better: diffF1 > 0 || (Math.abs(diffF1) < 0.05 && diffAcc > 0),
    };
  }, [l1Metric, l2Metric]);

  const mapIdxToChinese = (cName: string) => {
    const lower = cName.toLowerCase();
    if (lower.includes("more") || lower.includes("green") || lower.includes("多吃")) return "多吃 (绿色)";
    if (lower.includes("less") || lower.includes("red") || lower.includes("少吃")) return "少吃 (红色)";
    if (lower.includes("moderation") || lower.includes("yellow") || lower.includes("适量")) return "适量 (黄色)";
    return cName;
  };

  const getCellClass = (value: number, rowSum: number, isDiagonal: boolean) => {
    if (rowSum === 0 || value === 0) {
      return "bg-gray-50 text-gray-300 border border-gray-100";
    }
    const ratio = value / rowSum;
    if (isDiagonal) {
      if (ratio > 0.8) return "bg-emerald-600 text-white font-bold ring-2 ring-emerald-300/60";
      if (ratio > 0.5) return "bg-emerald-500 text-white font-bold";
      if (ratio > 0.2) return "bg-emerald-300 text-emerald-950 font-semibold";
      return "bg-emerald-100 text-emerald-900";
    }
    if (ratio > 0.5) return "bg-rose-400 text-white font-semibold";
    if (ratio > 0.2) return "bg-rose-200 text-rose-900";
    return "bg-amber-50 text-amber-800 border border-amber-100";
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 md:p-8 shadow-sm">
      <div className="flex items-center gap-3 border-b border-gray-50 pb-5 mb-6">
        <div className="p-2 bg-pink-50 rounded-xl text-pink-600">
          <Award className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900 tracking-tight">
            第三阶段：模型多指标对比评估
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            审查混淆矩阵 (Confusion Matrix)，剖析精确度 (Precision)、召回率 (Recall) 与核心 F1 评分
          </p>
        </div>
      </div>

      {/* 1. Comparison card (only available if both L1 and L2 have been trained) */}
      {comparison && (
        <div className={`mb-8 p-5 rounded-2xl border ${
          comparison.l1Better 
            ? "bg-emerald-50/40 border-emerald-100" 
            : "bg-amber-50/40 border-amber-100"
        }`}>
          <h3 className={`text-md font-bold flex items-center gap-2 ${
            comparison.l1Better ? "text-emerald-900" : "text-amber-900"
          }`}>
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            L1 (Lasso) 对比 L2 (Ridge) 基准测试分析
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
            <div className="bg-white/80 p-4 rounded-xl border border-gray-100">
              <span className="text-xs text-gray-400">测试集整体准确度变化 (Accuracy)</span>
              <div className="text-2xl font-bold font-mono text-gray-800 mt-1 flex items-baseline gap-1">
                {l1Metric?.accuracy !== undefined ? `${(l1Metric.accuracy * 100).toFixed(1)}%` : "-"}
                <span className="text-xs text-gray-400 font-normal">vs L2: {(l2Metric!.accuracy * 100).toFixed(1)}% (
                  <span className={comparison.diffAcc >= 0 ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"}>
                    {comparison.diffAcc >= 0 ? `+${comparison.diffAcc}%` : `${comparison.diffAcc}%`}
                  </span>
                )</span>
              </div>
            </div>
            
            <div className="bg-white/80 p-4 rounded-xl border border-gray-100">
              <span className="text-xs text-gray-400">平均 F1 调和均值差异 (Macro F1)</span>
              <div className="text-2xl font-bold font-mono text-gray-800 mt-1 flex items-baseline gap-1">
                {l1Metric?.macroF1 !== undefined ? (l1Metric.macroF1 * 100).toFixed(1) : "-"}
                <span className="text-xs text-gray-400 font-normal">vs L2: {(l2Metric!.macroF1 * 100).toFixed(1)} (
                  <span className={comparison.diffF1 >= 0 ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"}>
                    {comparison.diffF1 >= 0 ? `+${comparison.diffF1}%` : `${comparison.diffF1}%`}
                  </span>
                )</span>
              </div>
            </div>

            <div className="bg-white/80 p-4 rounded-xl border border-gray-100 flex items-center">
              <p className="text-xs font-medium text-gray-600 leading-relaxed">
                {comparison.l1Better ? (
                  <span>
                    💡 <strong>L1 在 Macro F1 与准确率上优于或持平 L2</strong>。Lasso 稀疏化剔除弱相关特征噪声，配合类别权重平衡后，在不平衡数据集上兼顾可解释性与泛化能力。
                  </span>
                ) : (
                  <span>
                    💡 <strong>L2 的 Macro F1 或准确率表现更优。</strong>说明本数据中营养特征存在<strong>共线性</strong>（如糖分与碳水），Ridge 整体收缩系数、保留全部特征，在此场景下更稳健。可继续调低 L1 的 λ 或开启类别权重后再对比。
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 2. active metrics breakdown */}
      {!activeMetric ? (
        <div className="py-16 text-center text-gray-400 border border-dashed border-gray-200 bg-gray-50/30 rounded-2xl">
          <HelpCircle className="w-8 h-8 mx-auto text-gray-300 mb-2" />
          <p className="text-xs font-semibold text-gray-500">还无可用分类模型性能指标</p>
          <p className="text-[11px] text-gray-400 mt-1">
            至少点击训练一种正则化模型，测试集（20% 留出样本）上的混淆分类精度会自动在此激活。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {hasWeakMinorityClass(activeMetric) && (
            <div className="lg:col-span-12 bg-rose-50 border border-rose-100 rounded-xl p-4 flex gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <div className="text-xs text-rose-900">
                <p className="font-bold">少数类识别不足</p>
                <p className="mt-1 text-rose-800 leading-relaxed">
                  测试集中存在召回率为 0 的类别（通常为「多吃」）。若刚更新过后端代码，请先<strong>重启 Python 后端</strong>（端口 8000），再点「一键 L2 & L1」重训；并确认类别权重为<strong>温和</strong>或<strong>标准</strong>、阈值校准已开启。
                </p>
              </div>
            </div>
          )}

          {hasMoreOftenOverPredict(activeMetric) && (
            <div className="lg:col-span-12 bg-amber-50 border border-amber-100 rounded-xl p-4 flex gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <div className="text-xs text-amber-900">
                <p className="font-bold">「多吃」存在过预测</p>
                <p className="mt-1 text-amber-800 leading-relaxed">
                  「多吃」召回偏高但精确率仍有限。系统已在 15% 校准集上搜索概率门槛（目标精确率 ≥ 40%）。
                  演示时请查看预测页的<strong>置信度</strong>与<strong>门槛校正</strong>提示。
                </p>
              </div>
            </div>
          )}
          
          {/* Classification stats breakdown with Precision, Recall, F1 (Left/Top) */}
          <div className="lg:col-span-12 xl:col-span-7 flex flex-col gap-5">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
              <BarChart2 className="w-4 h-4 text-pink-600" />
              当前逻辑回归模型 ({currentType.toUpperCase()}) 分类诊断报告 (Classification Report)
            </h3>

            <div className="border border-gray-100 rounded-xl overflow-hidden bg-white">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-100 font-semibold text-gray-500 uppercase">
                    <th className="px-4 py-3">饮食分类建议 (Class Description)</th>
                    <th className="px-4 py-3 text-right">精确率 (Precision)</th>
                    <th className="px-4 py-3 text-right">召回率 (Recall)</th>
                    <th className="px-4 py-3 text-right">F1 调和得分 (F1-score)</th>
                    <th className="px-4 py-3 text-right">测试样本数 (Support)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-gray-700">
                  {activeMetric.classPerformance.map((row) => {
                    const isWeak = row.support > 0 && row.recall === 0;
                    return (
                    <tr key={row.className} className={`hover:bg-gray-50/40 ${isWeak ? "bg-rose-50/40" : ""}`}>
                      <td className="px-4 py-3.5 font-semibold text-gray-800">
                        {mapIdxToChinese(row.className)}
                        <span className="text-[10px] font-normal text-gray-400 ml-1.5 font-mono">({row.className})</span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-medium text-indigo-600">
                        {(row.precision * 100).toFixed(1)}%
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-medium text-emerald-600">
                        {(row.recall * 100).toFixed(1)}%
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-bold text-gray-800">
                        {(row.f1Score * 100).toFixed(1)}%
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-gray-400">
                        {row.support || 0}
                      </td>
                    </tr>
                    );
                  })}
                  {/* Summary Rows */}
                  <tr className="bg-gray-50/30 font-bold border-t border-gray-100">
                    <td className="px-4 py-3 text-gray-900">整体精度 (Accuracy)</td>
                    <td colSpan={3} className="px-4 py-3 text-right font-mono text-indigo-600 text-sm">
                      {(activeMetric.accuracy * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-400">
                      {activeMetric.classPerformance.reduce((a, b) => a + b.support, 0)}
                    </td>
                  </tr>
                  <tr className="bg-gray-50/50 font-bold">
                    <td className="px-4 py-3 text-gray-900">宏平均 (Macro Avg F1)</td>
                    <td colSpan={3} className="px-4 py-3 text-right font-mono text-gray-800 text-sm">
                      {(activeMetric.macroF1 * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-400">-</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1">
              <div className="bg-amber-50/40 p-3 rounded-xl border border-amber-100 text-[11px] text-amber-950 flex gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong>精确率 (Precision) 意味着什么？</strong>
                  <p className="text-gray-600 mt-0.5">当逻辑回归推荐某食物为“多吃”时，真实结果确实是“多吃”的把握度有多大，防止误指导糖尿病患者食用高危多油多糖食品！</p>
                </div>
              </div>
              <div className="bg-emerald-50/40 p-3 rounded-xl border border-emerald-100 text-[11px] text-emerald-950 flex gap-2">
                <AlertCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <strong>召回率 (Recall) 意味着什么？</strong>
                  <p className="text-gray-600 mt-0.5">在全部客观上应该“少吃”的危险食物中，逻辑回归成功抓捕、识别并将其标记出来的比例，防止漏网之鱼损害健康！</p>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Confusion Matrix Heatmap (Right/Bottom) */}
          <div className="lg:col-span-12 xl:col-span-5 flex flex-col gap-5 border border-gray-100 rounded-xl p-5 bg-gray-50/10">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
              <Grid className="w-4 h-4 text-pink-600" />
              测试集混淆矩阵 (Confusion Matrix Heatmap)
            </h3>

            {/* Matrix grid container */}
            <div className="flex flex-col items-center justify-center p-3">
              {/* Columns Header (Predicted Class) */}
              <div className="text-[10px] text-gray-400 font-semibold mb-3 uppercase tracking-wider text-center">
                —— 预测类别 (Predicted Labels) ——
              </div>

              {/* Rows and Grid */}
              <div className="grid grid-cols-12 gap-2 w-full max-w-[320px]">
                {/* Empty corner */}
                <div className="col-span-3"></div>
                {/* Predictions Headers */}
                {activeMetric.classNames.map((cName) => (
                  <div key={`header-pred-${cName}`} className="col-span-3 text-center text-[10px] font-bold text-gray-400 truncate" title={cName}>
                    {mapIdxToChinese(cName).substring(0, 2)}
                  </div>
                ))}

                {/* Actual Rows */}
                {activeMetric.classNames.map((actName, rIdx) => {
                  const rowSum = activeMetric.confusionMatrix[rIdx].reduce((a, b) => a + b, 0) || 1;
                  return (
                    <React.Fragment key={`row-matrix-${rIdx}`}>
                      {/* Actual Header (Vertical Label) */}
                      <div className="col-span-3 flex items-center justify-end text-[10px] font-bold text-gray-400 text-right pr-2 truncate" title={actName}>
                        {mapIdxToChinese(actName).substring(0, 2)}
                      </div>

                      {/* 3 columns cell elements */}
                      {activeMetric.confusionMatrix[rIdx].map((cellVal, cIdx) => {
                        const isDiagonal = rIdx === cIdx;
                        const cellClass = getCellClass(cellVal, rowSum, isDiagonal);
                        return (
                          <div
                            key={`cell-${rIdx}-${cIdx}`}
                            className={`col-span-3 aspect-square rounded-lg flex flex-col items-center justify-center text-xs relative ${cellClass}`}
                            title={`真实: ${actName} -> 预测: ${activeMetric.classNames[cIdx]} (共 ${cellVal} 个样本)`}
                          >
                            <span className="text-sm font-bold">{cellVal}</span>
                            <span className="text-[9px] scale-[0.8] opacity-75">
                              {((cellVal / rowSum) * 100).toFixed(0)}%
                            </span>
                            {isDiagonal && cellVal > 0 && (
                              <div className="absolute right-0.5 top-0.5 w-1.5 h-1.5 bg-white/90 rounded-full" />
                            )}
                          </div>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Row description label */}
              <div className="text-[10px] text-gray-400 font-semibold mt-4 uppercase tracking-wider text-center flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                竖向：真实类别 (True Labels)
              </div>
            </div>

            {/* Matrix notes */}
            <div className="text-[10px] text-gray-400 leading-relaxed border-t border-gray-100 pt-3">
              * <strong>绿色对角线</strong>表示分类正确；<strong>红/琥珀色非对角线</strong>表示误判样本。
              * 若「多吃」行在非对角线出现大数值，说明模型尚未稳定识别少数类，可调整类别权重或门槛校准。
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
