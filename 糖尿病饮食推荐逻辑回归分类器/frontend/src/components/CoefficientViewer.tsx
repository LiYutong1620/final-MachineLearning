import React, { useState, useMemo } from "react";
import { ClassCoefficients, CoefficientWeight } from "../types";
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Cell, 
  ReferenceLine 
} from "recharts";
import { Sliders, HelpCircle, FileText, Check, ListFilter, AlertTriangle } from "lucide-react";

interface CoefficientViewerProps {
  l1Coefficients: ClassCoefficients[] | null;
  l2Coefficients: ClassCoefficients[] | null;
  currentType: "l1" | "l2";
}

// Translations for elegant display
const TRANSLATIONS: Record<string, string> = {
  "Calories": "卡路里",
  "Total Fat": "总脂肪",
  "Saturated Fat": "饱和脂肪",
  "Trans Fat": "反式脂肪",
  "Cholesterol": "胆固醇",
  "Sodium": "钠",
  "Total Carbohydrate": "总碳水",
  "Dietary Fiber": "膳食纤维",
  "Sugars": "糖分",
  "Protein": "蛋白质",
  "Vitamin A": "维生素 A",
  "Vitamin C": "维生素 C",
  "Calcium": "钙元素",
  "Iron": "铁元素",
  "Water": "水分",
  "Potassium": "钾元素",
  "Sodium.1": "钠.1",
  "Zinc": "锌元素",
};

export default function CoefficientViewer({
  l1Coefficients,
  l2Coefficients,
  currentType,
}: CoefficientViewerProps) {
  const activeCoefficients = currentType === "l1" ? l1Coefficients : l2Coefficients;
  const [selectedClassIdx, setSelectedClassIdx] = useState<number>(0);

  const selectedClass = activeCoefficients ? activeCoefficients[selectedClassIdx] : null;

  // Format dataset for horizontal bar chart
  const barChartData = useMemo(() => {
    if (!selectedClass) return [];
    return [...selectedClass.coefficients]
      // Sort alphabetically or by magnitude (we can keep original sort or magnitude order)
      .map((item) => ({
        rawFeature: item.feature,
        featureName: TRANSLATIONS[item.feature] || item.feature,
        coefficient: item.weight,
        absWeight: Math.abs(item.weight),
      }))
      .sort((a, b) => b.coefficient - a.coefficient); // descending order of value
  }, [selectedClass]);

  const mapIdxToChinese = (cName: string) => {
    const lower = cName.toLowerCase();
    if (lower.includes("more") || lower.includes("green") || lower.includes("多吃")) return "多吃 (绿色建议)";
    if (lower.includes("less") || lower.includes("red") || lower.includes("少吃")) return "少吃 (红色限制)";
    if (lower.includes("moderation") || lower.includes("yellow") || lower.includes("适量")) return "适量 (黄色控制)";
    return cName;
  };

  // Compute zero coefficient statistics for L1/L2
  const zeroStats = useMemo(() => {
    if (!selectedClass) return null;
    const total = selectedClass.coefficients.length;
    const zeros = selectedClass.coefficients.filter(c => c.weight === 0).length;
    const nonZeros = total - zeros;
    const activePct = ((nonZeros / total) * 100).toFixed(0);

    return {
      total,
      zeros,
      nonZeros,
      activePct,
    };
  }, [selectedClass]);

  // Model Coefficients Interpretation
  const interpretationText = useMemo(() => {
    if (!selectedClass) return "";
    const name = selectedClass.className.toLowerCase();
    
    // Sort weights to find top positive and top negative
    const sorted = [...selectedClass.coefficients].sort((a, b) => b.weight - a.weight);
    const positive = sorted.filter(c => c.weight > 0.001).slice(0, 3);
    const negative = sorted.filter(c => c.weight < -0.001).reverse().slice(0, 3);

    const posStr = positive.map(c => `**${TRANSLATIONS[c.feature] || c.feature}** (+${c.weight})`).join(", ");
    const negStr = negative.map(c => `**${TRANSLATIONS[c.feature] || c.feature}** (${c.weight})`).join(", ");

    if (name.includes("more") || name.includes("green") || name.includes("多吃")) {
      return `对于 **多吃** 分类：其正向驱动因素主要为 ${posStr || "无"}，这意味着这些成分成分越高，该食物越容易被糖尿病患者健康享用；负向惩罚特征主要有 ${negStr || "无"}，表明需要避开这些营养过载物质。`;
    }
    if (name.includes("less") || name.includes("red") || name.includes("少吃")) {
      return `对于 **少吃/避开** 分类：正向核心关联指标有 ${posStr || "无"}。这些系数为正的特征越高，样本越易落入红灯区。负向阻力系数为 ${negStr || "无"}，会显著降低被判为「少吃」的概率。`;
    }
    return `对于 **适量** 分类：体现均衡搭配，相关正负关联度分别为：正向关联 ${posStr || "无"}；负向干扰 ${negStr || "无"}。处于这些变量平衡区间是进入黄灯适量食用的主力指标。`;
  }, [selectedClass]);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 md:p-8 shadow-sm">
      <div className="flex items-center gap-3 border-b border-gray-50 pb-5 mb-6">
        <div className="p-2 bg-amber-50 rounded-xl text-amber-600">
          <Sliders className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900 tracking-tight">
            第四阶段：逻辑回归特征系数诠释
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            解密逻辑回归的参数权重 (Model Coefficients Weight)，观察高维营养成分的临床特征拉扯关系
          </p>
        </div>
      </div>

      {!activeCoefficients ? (
        <div className="py-16 text-center text-gray-400 border border-dashed border-gray-200 bg-gray-50/30 rounded-2xl">
          <HelpCircle className="w-8 h-8 mx-auto text-gray-300 mb-2" />
          <p className="text-xs font-semibold text-gray-500">还无生成的可视化特征系数</p>
          <p className="text-[11px] text-gray-400 mt-1">
            请至少执行一次第二阶段的数据训练，模型求出的每一类代表特征权重参数会在此处渲染Bar Chart。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Class Selector & Interpretation Table (Left/Top) */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">
                请选择要解析系数的概率分类 (Decision Class)
              </label>
              <div className="flex flex-col gap-1.5 mt-2">
                {activeCoefficients.map((item, idx) => (
                  <button
                    key={item.className}
                    onClick={() => setSelectedClassIdx(idx)}
                    className={`w-full p-3 font-semibold text-xs text-left rounded-xl border transition flex items-center justify-between cursor-pointer ${
                      selectedClassIdx === idx
                        ? "bg-amber-600 border-amber-600 text-white shadow-xs"
                        : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <span>{mapIdxToChinese(item.className)}</span>
                    <span className="text-[10px] opacity-75 font-mono">
                      截距(Bias): {item.intercept}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Sparsity Indicator Cards (L1 Feature Selection Highlight) */}
            {zeroStats && (
              <div className="border border-gray-100 rounded-xl p-4 bg-gray-50/20">
                <span className="text-xs font-semibold text-gray-800">
                  {currentType === "l1" ? "L1 Lasso 特征提取报告" : "L2 Ridge 权重缩小报告"}
                </span>
                
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div className="bg-white p-3 border border-gray-100 rounded-lg shadow-2xs">
                    <div className="text-[10px] text-gray-400">有效激活特征</div>
                    <div className="text-xl font-bold text-gray-800 font-mono mt-0.5">
                      {zeroStats.nonZeros} <span className="text-xs text-gray-400 font-normal">/ {zeroStats.total}</span>
                    </div>
                  </div>
                  <div className="bg-white p-3 border border-gray-100 rounded-lg shadow-2xs">
                    <div className="text-[10px] text-gray-400">废弃剔除特征</div>
                    <div className="text-xl font-bold font-mono mt-0.5 text-amber-600">
                      {zeroStats.zeros} <span className="text-xs text-gray-400 font-normal">维变量</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3.5 flex items-center gap-1.5 text-xs text-gray-600 leading-relaxed">
                  {currentType === "l1" ? (
                    <div>
                      💡 {zeroStats.zeros > 0 ? (
                        <span>
                          模型检测并剔除了 <strong>{zeroStats.zeros} 维</strong>（例如不重要微量元素）的系数因子（变为值为 0.0），仅提炼了 <strong>{zeroStats.activePct}%</strong> 最强关联特征！
                        </span>
                      ) : (
                        "当前设置的 L1 正则系数较弱暂未排除特征，可拖大 Lambda 重新点击训练。"
                      )}
                    </div>
                  ) : (
                    <span>
                      💡 L2 正则下采用的是岭回归参数约束，由于不会产生绝对 0 值的交点截断，因此所有维度 <strong>{zeroStats.total} 维</strong> 特征均被保留（但系数值整体被极大抑制缩小）。
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Analytical Narrative on Coefficients */}
            <div className="p-4 border border-rose-100 bg-rose-50/10 rounded-xl text-xs text-gray-700 leading-relaxed flex gap-2">
              <FileText className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <div>
                <strong className="text-rose-950 font-bold block mb-1">医学归纳建议推论:</strong>
                <p className="text-gray-600" dangerouslySetInnerHTML={{
                  __html: interpretationText.replace(/\*\*(.*?)\*\*/g, '<strong class="text-rose-950 font-bold">$1</strong>')
                }} />
              </div>
            </div>
          </div>

          {/* Coefficient Horizontal Bar Chart (Right/Bottom) */}
          <div className="lg:col-span-7 flex flex-col justify-between">
            <h3 className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1.5 mb-2">
              <ListFilter className="w-4 h-4 text-amber-600" />
              分类边界判定系数图 ({currentType.toUpperCase()} 模型)
            </h3>

            <div className="h-[380px] mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={barChartData}
                  layout="vertical"
                  margin={{ top: 10, right: 30, left: 40, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                  <XAxis 
                    type="number" 
                    tick={{ fontSize: 10, fill: '#6b7280' }} 
                    stroke="#e5e7eb"
                  />
                  <YAxis 
                    type="category" 
                    dataKey="featureName" 
                    tick={{ fontSize: 10, fill: '#374151', fontWeight: 500 }}
                    stroke="#e5e7eb"
                    width={80}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }}
                    formatter={(value) => [`系数值: ${value}`, "系数"]}
                    labelFormatter={(label) => `指标: ${label}`}
                  />
                  <ReferenceLine x={0} stroke="#9ca3af" strokeWidth={1} />
                  <Bar dataKey="coefficient" name="系数权重" radius={[0, 4, 4, 0]}>
                    {barChartData.map((entry, index) => {
                      // Determine bar color by positive, negative or exact 0
                      let barColor = "#9ea7b4"; // zero (gray)
                      if (entry.coefficient > 0.001) {
                        barColor = "#4F46E5"; // positive (indigo/blue)
                      } else if (entry.coefficient < -0.001) {
                        barColor = "#EF4444"; // negative (red)
                      }
                      return (
                        <Cell key={`cell-${index}`} fill={barColor} />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="flex gap-4 items-center justify-center text-[10px] text-gray-500 mt-2">
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded bg-[#4F46E5]"></div>
                <span>正向拉扯项 (增加该类判定概率)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded bg-[#EF4444]"></div>
                <span>负向阻力项 (减少该类判定概率)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded bg-[#9ea7b4]"></div>
                <span>零权重特征 (无贡献/自动特征筛选)</span>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
