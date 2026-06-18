import React, { useState, useEffect } from "react";
import { Sliders, Sparkles, HelpCircle, AlertTriangle, Apple, Layers, Info } from "lucide-react";
import { api } from "../utils/api";
import { getChineseLabel } from "../utils/labels";
import { buildLocalAdvice } from "../utils/localAdvice";

interface InteractivePredictorProps {
  featureLimits: Record<string, { min: number; max: number }>;
  classes: string[];
  activePenaltyType: "l1" | "l2";
  modelReady: boolean;
  moreOftenThreshold?: number;
}

// Famous Food Templates for instant pre-population
interface FoodTemplate {
  name: string;
  englishName: string;
  icon: string;
  metrics: Record<string, number>;
}

const FOOD_TEMPLATES: FoodTemplate[] = [
  {
    name: "水煮西蓝花",
    englishName: "Broccoli (Steamed)",
    icon: "🥦",
    metrics: {
      "Calories": 35,
      "Total Fat": 0.4,
      "Saturated Fat": 0.1,
      "Cholesterol": 0,
      "Sodium": 33,
      "Total Carbohydrate": 7,
      "Dietary Fiber": 2.6,
      "Sugars": 1.7,
      "Protein": 2.8,
      "Vitamin A": 77,
      "Vitamin C": 89,
      "Calcium": 47,
      "Iron": 0.7,
    },
  },
  {
    name: "煎顶级西冷牛排",
    englishName: "Sirloin Beef Steak",
    icon: "🥩",
    metrics: {
      "Calories": 240,
      "Total Fat": 15,
      "Saturated Fat": 6,
      "Cholesterol": 80,
      "Sodium": 60,
      "Total Carbohydrate": 0,
      "Dietary Fiber": 0,
      "Sugars": 0,
      "Protein": 26,
      "Vitamin A": 0,
      "Vitamin C": 0,
      "Calcium": 12,
      "Iron": 2.4,
    },
  },
  {
    name: "经典爆浆甜甜圈",
    englishName: "Glazed Sweet Donut",
    icon: "🍩",
    metrics: {
      "Calories": 420,
      "Total Fat": 22,
      "Saturated Fat": 10,
      "Cholesterol": 40,
      "Sodium": 350,
      "Total Carbohydrate": 52,
      "Dietary Fiber": 1.2,
      "Sugars": 28,
      "Protein": 4.5,
      "Vitamin A": 0,
      "Vitamin C": 0.1,
      "Calcium": 25,
      "Iron": 1.8,
    },
  },
  {
    name: "无糖燕麦全麦包",
    englishName: "Oat Wholemeal Bread",
    icon: "🍞",
    metrics: {
      "Calories": 250,
      "Total Fat": 3.2,
      "Saturated Fat": 0.5,
      "Cholesterol": 0,
      "Sodium": 450,
      "Total Carbohydrate": 48,
      "Dietary Fiber": 7.4,
      "Sugars": 4.2,
      "Protein": 11,
      "Vitamin A": 0,
      "Vitamin C": 0,
      "Calcium": 85,
      "Iron": 3.2,
    },
  },
  {
    name: "冰镇快乐肥宅水",
    englishName: "Regular Cola Soda",
    icon: "🥤",
    metrics: {
      "Calories": 150,
      "Total Fat": 0,
      "Saturated Fat": 0,
      "Cholesterol": 0,
      "Sodium": 30,
      "Total Carbohydrate": 39,
      "Dietary Fiber": 0,
      "Sugars": 39,
      "Protein": 0,
      "Vitamin A": 0,
      "Vitamin C": 0,
      "Calcium": 2,
      "Iron": 0.1,
    },
  }
];

export default function InteractivePredictor({
  featureLimits,
  classes,
  activePenaltyType,
  modelReady,
  moreOftenThreshold = 0,
}: InteractivePredictorProps) {
  const [foodName, setFoodName] = useState("自定义食品");
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const [predictedLabel, setPredictedLabel] = useState<string | null>(null);
  const [probabilities, setProbabilities] = useState<number[]>([]);
  const [confidence, setConfidence] = useState<number>(0);
  const [usedThresholdGate, setUsedThresholdGate] = useState(false);
  const [appliedThreshold, setAppliedThreshold] = useState(0);
  const [aiAdvice, setAiAdvice] = useState<string>("");
  const [loadingAdvice, setLoadingAdvice] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string>("");
  const [provider, setProvider] = useState<string>("AI Agent");
  const [activeModelName, setActiveModelName] = useState<string>("");

  // Initialize features values to midpoints or fallback
  useEffect(() => {
    if (Object.keys(featureLimits).length > 0) {
      const initial: Record<string, number> = {};
      Object.entries(featureLimits).forEach(([f, limits]) => {
        initial[f] = Number((limits.min + (limits.max * 0.1)).toFixed(1)); // 10% value is a safe default
      });
      setMetrics(initial);
    }
  }, [featureLimits]);

  // Handle template selection
  const handleApplyTemplate = (template: FoodTemplate) => {
    setFoodName(template.name);
    const updated: Record<string, number> = {};
    Object.keys(featureLimits).forEach((f) => {
      updated[f] = template.metrics[f] !== undefined ? template.metrics[f] : 0;
    });
    setMetrics(updated);
    setPredictedLabel(null);
    setProbabilities([]);
    setAiAdvice("");
  };

  // Perform model prediction locally using trained Multinomial Logistic Regression weights
  const handlePredict = async () => {
    if (!modelReady) {
      setErrorText("请先确保在第二阶段对模型进行了训练。");
      return;
    }
    setErrorText("");

    try {
      const result = await api.predict({
        penalty: activePenaltyType,
        foodName,
        metrics,
      });

      const probs = result.probabilities as number[];
      setProbabilities(probs);
      const rawPred = result.predictedLabel as string;
      setPredictedLabel(rawPred);
      setConfidence(Number(result.confidence ?? 0));
      setUsedThresholdGate(Boolean(result.usedThresholdGate));
      setAppliedThreshold(Number(result.moreOftenThreshold ?? moreOftenThreshold ?? 0));

      const cnLabel = getChineseLabel(rawPred);

      // 立刻展示本地摘要，AI 报告后台异步加载
      setLoadingAdvice(true);
      setAiAdvice(buildLocalAdvice(foodName, cnLabel, metrics));

      try {
        const resData = await api.recommend({
          foodName,
          metrics,
          modelClass: cnLabel,
          penaltyType: activePenaltyType,
        });

        const activeAdvice = resData.advice || "模型分类已出，AI 建议生成失败，请参考上方分类结果。";
        setAiAdvice(activeAdvice);
        if (resData.provider) setProvider(resData.provider);
        if (resData.model) setActiveModelName(resData.model);

        const probsMap: Record<string, number> = {};
        classes.forEach((cName, idx) => {
          probsMap[getChineseLabel(cName)] = probs[idx];
        });

        api.saveLogs("DIAGNOSIS_COMPLETED", {
          foodName,
          metrics,
          predictedLabel: cnLabel,
          probabilities: probsMap,
          aiAdvice: activeAdvice,
        }).catch((err) => console.warn("Failed to write prediction logs on server", err));
      } catch (aiErr: any) {
        console.warn("AI recommend failed:", aiErr);
        setAiAdvice(
          `${buildLocalAdvice(foodName, cnLabel, metrics)}\n\n*AI 详细报告请求失败，请检查 backend 是否运行、.env 密钥是否有效。*`
        );
      }
    } catch (err: any) {
      console.error(err);
      setErrorText(`分类预测计算故障: ${err.message}`);
    } finally {
      setLoadingAdvice(false);
    }
  };

  const getChineseClassStyling = (raw: string) => {
    const lower = String(raw).toLowerCase();
    if (lower.includes("more") || lower.includes("green") || lower.includes("多吃")) {
      return {
        bg: "bg-emerald-50 border-emerald-200 text-emerald-800",
        badge: "bg-emerald-600 text-white",
        desc: "对血糖波动影响较小，富含高蛋白质或丰富胡萝卜素与纤维，推荐列入日常主选。",
      };
    }
    if (lower.includes("less") || lower.includes("red") || lower.includes("少吃")) {
      return {
        bg: "bg-red-50 border-red-200 text-red-800",
        badge: "bg-red-600 text-white",
        desc: "糖分过大、钠含量严重超标或卡路里过剩，食用可能诱发急性或长期餐后血糖激增！",
      };
    }
    return {
      bg: "bg-amber-50 border-amber-200 text-amber-800",
      badge: "bg-amber-600 text-white",
      desc: "能量中规中矩，含有一定膳食纤维但总脂肪适中，可按卡路里计划进行定量限制并食用。",
    };
  };

  // Human-friendly feature labels mapping
  const FEATURE_LABELS: Record<string, { cn: string; unit: string }> = {
    "Calories": { cn: "热量卡路里", unit: "kcal" },
    "Total Fat": { cn: "总脂肪含量", unit: "g" },
    "Saturated Fat": { cn: "饱和脂肪总量", unit: "g" },
    "Trans Fat": { cn: "反式脂肪酸", unit: "g" },
    "Cholesterol": { cn: "胆固醇", unit: "mg" },
    "Sodium": { cn: "微量盐钠", unit: "mg" },
    "Total Carbohydrate": { cn: "总碳水化合物", unit: "g" },
    "Dietary Fiber": { cn: "可溶膳食纤维", unit: "g" },
    "Sugars": { cn: "独立糖分", unit: "g" },
    "Protein": { cn: "核心蛋白质", unit: "g" },
    "Vitamin A": { cn: "维生素 A", unit: "µg" },
    "Vitamin C": { cn: "维生素 C", unit: "mg" },
    "Calcium": { cn: "钙元素", unit: "mg" },
    "Iron": { cn: "铁元素", unit: "mg" },
    "Water": { cn: "净水分", unit: "g" },
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 md:p-8 shadow-sm">
      <div className="flex items-center gap-3 border-b border-gray-50 pb-5 mb-6">
        <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
          <Apple className="w-6 h-6 animate-bounce" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900 tracking-tight">
            第五阶段：糖尿病食品预测交互演示
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            输入任意假想食品的营养参数，使用已学模型的决策面算法瞬间分类，并调用 Gemini 给出临床解读
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Sliders and Prep Templates (Left) */}
        <div className="lg:col-span-6 flex flex-col gap-6">
          
          {/* Quick Prep Templates */}
          <div>
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2.5">
              点击快速预置假想食品指标 (现场答辩演示)
            </span>
            <div className="flex flex-wrap gap-2">
              {FOOD_TEMPLATES.map((item) => (
                <button
                  key={item.name}
                  onClick={() => handleApplyTemplate(item)}
                  type="button"
                  className="px-3.5 py-2 text-xs font-medium rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-emerald-50/50 hover:border-emerald-200 transition duration-150 cursor-pointer flex items-center gap-1.5 shadow-3xs"
                >
                  <span className="text-sm">{item.icon}</span>
                  <span className="text-gray-700 font-semibold">{item.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-50 pt-4">
            <div className="flex items-center justify-between mb-3.5">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                手动调节营养指标特征 (Nutrition Features Slider)
              </span>
              <input
                type="text"
                value={foodName}
                onChange={(e) => setFoodName(e.target.value)}
                placeholder="命名食品"
                className="text-xs border border-gray-200 p-1 px-2.5 rounded-lg w-28 text-center font-bold text-emerald-900 focus:outline-hidden focus:border-emerald-600 bg-emerald-50/20"
              />
            </div>

            {/* Slider inputs container */}
            <div className="space-y-4 max-h-[380px] overflow-y-auto pr-2 flex flex-col">
              {Object.keys(metrics).length === 0 ? (
                <div className="text-xs text-gray-400 py-10 text-center">暂无可用特征</div>
              ) : (
                Object.keys(metrics)
                  .map((f) => {
                    const limits = featureLimits[f] || { min: 0, max: 100 };
                    // Set safe max limits
                    const safeMax = Math.min(limits.max, f === "Calories" ? 1000 : 100);
                    const safeMin = limits.min;
                    const info = FEATURE_LABELS[f] || { cn: f, unit: "" };

                    return (
                      <div key={f} className="bg-gray-50/30 p-2.5 rounded-xl border border-gray-100 flex flex-col gap-1.5">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-semibold text-gray-700">
                            {info.cn} <span className="text-[10px] text-gray-400 font-mono">({f})</span>
                          </span>
                          <span className="font-mono font-bold text-indigo-600">
                            {metrics[f]} <span className="text-[10px] text-gray-400">{info.unit}</span>
                          </span>
                        </div>
                        <input
                          type="range"
                          min={safeMin}
                          max={safeMax}
                          step={f === "Calories" || f === "Sodium" ? "5" : "0.5"}
                          value={metrics[f]}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setMetrics(prev => ({ ...prev, [f]: val }));
                            setPredictedLabel(null);
                          }}
                          className="w-full accent-indigo-600"
                        />
                        <div className="flex justify-between text-[9px] text-gray-400 font-mono">
                          <span>极小: {safeMin}</span>
                          <span>主测上限: {safeMax}</span>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>

          {/* Action Trigger Predict */}
          <button
            onClick={handlePredict}
            disabled={!modelReady}
            className="w-full py-3.5 border border-indigo-600 text-indigo-600 hover:bg-indigo-600 hover:text-white disabled:bg-gray-100 disabled:border-gray-200 disabled:text-gray-400 font-bold text-sm rounded-xl transition duration-200 active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:cursor-not-allowed"
          >
            <Sparkles className="w-4 h-4" />
            执行糖尿病饮食分类诊断
          </button>
        </div>

        {/* Prediction Outputs Display Cards (Right) */}
        <div className="lg:col-span-6 flex flex-col justify-between">
          <div className="flex-1 flex flex-col">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-3">
              逻辑回归预测结论与 AI 营养师推荐建议
            </span>

            {errorText && (
              <div className="bg-amber-50 text-amber-800 text-xs p-4 rounded-xl border border-amber-200 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                {errorText}
              </div>
            )}

            {!predictedLabel ? (
              <div className="flex-1 min-h-[300px] border border-dashed border-gray-200 bg-gray-50/30 rounded-2xl p-6 flex flex-col items-center justify-center text-center text-gray-400">
                <Info className="w-10 h-10 text-gray-300 mb-2.5 animate-pulse" />
                <span className="text-xs font-semibold text-gray-500">等待输入预测特征信息</span>
                <span className="text-[11px] text-gray-400 mt-1.5 max-w-xs">
                  点击左侧的预设模板食品（如经典爆浆甜甜圈）或拖拽滑块自定义，然后再点击“执行糖尿病饮食分类诊断”。
                </span>
              </div>
            ) : (
              <div className="space-y-5 flex flex-col">
                
                {/* Visual Label Alert badge */}
                {(() => {
                  const styles = getChineseClassStyling(predictedLabel);
                  return (
                    <div className={`p-4 rounded-2xl border ${styles.bg} transition duration-300`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">
                          医学决策分类诊断:
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/70 text-gray-700">
                            置信度 {(confidence * 100).toFixed(1)}%
                          </span>
                          <span className="text-xs font-mono font-semibold bg-white/60 px-2 py-0.5 rounded-md">
                            {activePenaltyType.toUpperCase()}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2.5 mt-3">
                        <span className={`text-sm px-3.5 py-1.5 font-extrabold rounded-full ${styles.badge}`}>
                          {getChineseLabel(predictedLabel)}
                        </span>
                        <span className="text-lg font-bold text-gray-900">
                          《{foodName}》
                        </span>
                      </div>

                      <p className="text-xs mt-3.5 leading-relaxed font-medium">
                        {styles.desc}
                      </p>
                      {confidence < 0.55 && (
                        <p className="text-[11px] mt-2 text-amber-800 bg-white/50 rounded-lg px-2 py-1">
                          模型对该判断置信度偏低，建议结合临床标准人工复核。
                        </p>
                      )}
                      {usedThresholdGate && (
                        <p className="text-[11px] mt-2 text-indigo-900 bg-white/50 rounded-lg px-2 py-1">
                          原始 Softmax 倾向「多吃」，经概率门槛{" "}
                          {(appliedThreshold * 100).toFixed(0)}% 校正后为当前类别。
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Softmax probabilities output bar charts */}
                <div className="border border-gray-100 rounded-xl p-4 bg-gray-50/20">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2.5">
                    Softmax 分类概率输出概率:
                  </span>
                  <div className="space-y-2 text-xs">
                    {classes.map((cName, idx) => {
                      const prob = probabilities[idx] || 0;
                      const pct = (prob * 100).toFixed(1);
                      const cnName = getChineseLabel(cName);
                      
                      let barColor = "bg-amber-500";
                      if (cName.toLowerCase().includes("more")) barColor = "bg-emerald-500";
                      if (cName.toLowerCase().includes("less")) barColor = "bg-red-500";

                      return (
                        <div key={cName} className="flex flex-col gap-1">
                          <div className="flex justify-between font-medium">
                            <span className="text-gray-700">{cnName}</span>
                            <span className="font-mono font-bold text-gray-800">{pct}%</span>
                          </div>
                          <div className="w-full bg-gray-200/50 rounded-full h-2 overflow-hidden">
                            <div 
                              className={`h-2 rounded-full transition-all duration-500 ${barColor}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Expert dietitian narrative analysis details */}
                <div className="border border-indigo-100 bg-indigo-50/10 rounded-2xl p-4 border-l-4 border-l-indigo-600">
                  <h4 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5 mb-2.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
                    AI 营养师定制化临床指导建议 ({activeModelName ? `${provider} ${activeModelName}` : "AI 智能模型"}):
                  </h4>

                  {loadingAdvice ? (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-400 text-xs">
                      <div className="w-6 h-6 border-2 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-2"></div>
                      <span>{provider} 正在撰写细致饮食建议报告...</span>
                    </div>
                  ) : (
                    <div 
                      className="text-xs text-indigo-900 leading-relaxed font-normal whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{
                        __html: aiAdvice.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-indigo-950">$1</strong>')
                      }}
                    />
                  )}
                </div>

              </div>
            )}
          </div>

          <div className="border-t border-gray-100 pt-3.5 text-[10px] text-gray-400 flex items-center gap-1 mt-4">
            <Info className="w-3 h-3 text-emerald-500 shrink-0" />
            <span>* 模型分类由 Python 后端完成，AI 临床诊断报告基于 DeepSeek / Gemini 服务器生成。</span>
          </div>
        </div>

      </div>
    </div>
  );
}
