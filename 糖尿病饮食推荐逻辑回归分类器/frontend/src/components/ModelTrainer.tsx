import React, { useState } from "react";
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from "recharts";
import { Cpu, Play, Sliders, TrendingUp, Info, Activity, CheckCircle2, Beaker, ChevronDown, ChevronUp } from "lucide-react";
import { ModelConfig, TrainingLogItem, PenaltyType, ClassWeightMode } from "../types";
import { CLASS_WEIGHT_MODE_LABELS } from "../utils/modelDefaults";

interface ModelTrainerProps {
  onTrainModel: (config: ModelConfig) => Promise<void>;
  onRunFullPipeline?: () => Promise<void>;
  autoRunningAll?: boolean;
  trainingLogs: TrainingLogItem[];
  isTraining: boolean;
  activeConfig: ModelConfig;
  setActiveConfig: React.Dispatch<React.SetStateAction<ModelConfig>>;
  hasTrained: boolean;
}

const EXPERIMENTAL_SCHEMES = [
  // Group A
  {
    id: "A1",
    group: "A",
    groupName: "L1 vs L2 基准对比 (基础分析)",
    name: "L1 推荐调优配置 (答辩默认)",
    penalty: "L1 (Lasso)",
    lambda: "0.006",
    lr: "0.05",
    batch: "16",
    epochs: "160",
    classWeightMode: "mild" as ClassWeightMode,
    purpose: "项目经调优后的 L1 默认方案：温和类别权重 + 自动「多吃」阈值校准，平衡 Macro F1 与精确率。",
    expected: "「多吃」召回与精确率更均衡，适量类误判减少；Macro F1 通常优于标准逆频率权重。"
  },
  {
    id: "A2",
    group: "A",
    groupName: "L1 vs L2 基准对比 (基础分析)",
    name: "L2 对照调优配置",
    penalty: "L2 (Ridge)",
    lambda: "0.01",
    lr: "0.05",
    batch: "16",
    epochs: "160",
    classWeightMode: "mild" as ClassWeightMode,
    purpose: "与 L1 同学习策略的 L2 对照组，采用温和权重与自动阈值校准。",
    expected: "与调优 L1 公平对比；Macro F1 与「多吃」精确率均优于标准强权重配置。"
  },
  // Group B
  {
    id: "B1",
    group: "B",
    groupName: "设置 λ 对过拟合/欠拟合影响",
    name: "设定极弱约束 L1 (极轻阻尼)",
    penalty: "L1 (Lasso)",
    lambda: "0.001",
    lr: "0.15",
    batch: "16",
    epochs: "100",
    purpose: "设置极其微小的拉姆达惩罚系数，模拟近乎无限制的极限自由度下降搜索域，探究多源共线性风险。",
    expected: "损失函数收敛速度极快，训练集拟合度接近饱和，但几无系数归零，由于缺乏强阻抗，测试集存在过拟合虚高甚至泛化折损的隐患。"
  },
  {
    id: "B2",
    group: "B",
    groupName: "设置 λ 对过拟合/欠拟合影响",
    name: "经典基准稀疏 L1 (权重中和)",
    penalty: "L1 (Lasso)",
    lambda: "0.05",
    lr: "0.15",
    batch: "16",
    epochs: "100",
    purpose: "应用最具科学指导性的黄金交叉参数。以此基准考察不显著特征的归零占比，并核验三大分类推荐的边界精度。",
    expected: "对糖尿病关联度低的微量特征系数精确落入 0。在收敛速率与测试判别精度中取得了最完美的双向平衡。"
  },
  {
    id: "B3",
    group: "B",
    groupName: "设置 λ 对过拟合/欠拟合影响",
    name: "极限高强约束 L1 (剧烈归零)",
    penalty: "L1 (Lasso)",
    lambda: "0.5",
    lr: "0.15",
    batch: "16",
    epochs: "100",
    purpose: "采用极高惩罚项约束。拉大拉姆达参数至 0.5。探讨在过度惩罚和强制缩略下算法是否会丢失基本分类判据。",
    expected: "绝大部分特征（如 Calories / Protein 等主属性之外）系数被强制零化。由于核心特征关联遭到强行压制，不可避免引发欠拟合表现。"
  },
  // Group C
  {
    id: "C1",
    group: "C",
    groupName: "学习率 lr 对收敛步长影响",
    name: "微型慢行低更新率",
    penalty: "L1 (Lasso)",
    lambda: "0.05",
    lr: "0.01",
    batch: "16",
    epochs: "100",
    purpose: "设置细微更新步伐 lr=0.01。研究过小步伐在 100 代训练周期里是否极难到达低谷最优盘旋区间。",
    expected: "梯度更新轨迹异常和缓，但截至第 100 轮极难取得实质收敛，Loss 仍停留在偏高区域，必须额外扩编训练代数。"
  },
  {
    id: "C2",
    group: "C",
    groupName: "学习率 lr 对收敛步长影响",
    name: "标准基准稳健下降步子",
    penalty: "L1 (Lasso)",
    lambda: "0.05",
    lr: "0.15",
    batch: "16",
    epochs: "100",
    purpose: "执行经典 0.15 学习效率。在确保收敛的前提下，观察各类别 Softmax 激活分量的平顺爬升势头。",
    expected: "第 30 至 50 轮即迅速完成大部分梯度寻优，误差平稳接地并不存在任何围绕决策平面产生的数值越界跃迁。"
  },
  {
    id: "C3",
    group: "C",
    groupName: "学习率 lr 对收敛步长影响",
    name: "剧烈大步长高噪声迈步",
    penalty: "L1 (Lasso)",
    lambda: "0.05",
    lr: "0.4",
    batch: "16",
    epochs: "100",
    purpose: "探索较高极限制降级步伐（0.4），检测参数迭代是否会在临界凹坑带出现反弹及溢出震荡。",
    expected: "前期损失值迅速崩落，但后期大步长容易越过拐角极值，损失曲线可能伴随明显的锯齿和震荡波动，稳定性有所下降。"
  },
  // Group D
  {
    id: "D1",
    group: "D",
    groupName: "批量大小 Batch 随机噪声探索",
    name: "高随机噪声微型批次",
    penalty: "L1 (Lasso)",
    lambda: "0.05",
    lr: "0.15",
    batch: "8",
    epochs: "100",
    purpose: "选用超小体积样本组合（8）。向迭代中引入极大噪声波，检测高梯度跃迁对跳出马鞍点、增强泛化的作用。",
    expected: "由于样本量少，单次估算偏差明显，训练损失折线呈现频繁起伏波折。但在特定波段下可能展现高潜能的多维识别率。"
  },
  {
    id: "D2",
    group: "D",
    groupName: "批量大小 Batch 随机噪声探索",
    name: "经典基准 Mini-Batch 算子",
    penalty: "L1 (Lasso)",
    lambda: "0.05",
    lr: "0.15",
    batch: "16",
    epochs: "100",
    purpose: "配置经典 16 批组。用以兼顾多分类任务的全局计算均值稳定度及单样本变动特征的可感知度。",
    expected: "噪声得到完全控制。展现出最标准可控的逻辑回归收敛性，耗时少、鲁棒度强，且特征系数解析状态自然可靠。"
  },
  {
    id: "D3",
    group: "D",
    groupName: "批量大小 Batch 随机噪声探索",
    name: "中大平滑 Mini-Batch 算子",
    penalty: "L1 (Lasso)",
    lambda: "0.05",
    lr: "0.15",
    batch: "32",
    epochs: "100",
    purpose: "探查平铺 32 数据批次对排除离散糖尿病营养异常标签（如超高脂或纯香精食品）的作用。",
    expected: "单轮由于合并度高、硬件向量计算吞吐性强而运行更快速。损失面高度顺服，但在多代后由于稀释了特定离散食品极值而性能略收敛缓慢。"
  },
  {
    id: "D4",
    group: "D",
    groupName: "批量大小 Batch 随机噪声探索",
    name: "大批次梯度去噪升级",
    penalty: "L1 (Lasso)",
    lambda: "0.05",
    lr: "0.15",
    batch: "64",
    epochs: "100",
    purpose: "使用 64 规模超强阻尼子集。研究大范围批次参数对剔除计算扰动、降低单次循环更新频率的影响。",
    expected: "由于迭代步数压缩，整体图像曲线光滑平顺且毫无波动。但对极其细分的膳食分量识别响应可能有少量弱化。"
  },
  {
    id: "D5",
    group: "D",
    groupName: "批量大小 Batch 随机噪声探索",
    name: "全数据集批量 (Full-Batch 相似)",
    penalty: "L1 (Lasso)",
    lambda: "0.05",
    lr: "0.15",
    batch: "128",
    purpose: "对当前的内存分拆运算而言，128 批大小极高地还原了全集 Full-Batch 真实均值分布的一致性下降路径。",
    expected: "绝对屏蔽个体食品的异型分量干扰，收敛折线呈现出最平直完美的学术教科书式平稳趋势，是衡量多分类算法确定特征的最佳试验模型。"
  }
];

export default function ModelTrainer({
  onTrainModel,
  onRunFullPipeline,
  autoRunningAll = false,
  trainingLogs,
  isTraining,
  activeConfig,
  setActiveConfig,
  hasTrained,
}: ModelTrainerProps) {
  const [currentEpoch, setCurrentEpoch] = useState<number>(0);
  const [showPlan, setShowPlan] = useState<boolean>(false);
  const [activeGroupTab, setActiveGroupTab] = useState<"A" | "B" | "C" | "D">("A");

  const handleConfigChange = (key: keyof ModelConfig, value: any) => {
    setActiveConfig((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleStartTraining = async () => {
    await onTrainModel(activeConfig);
  };

  // Safe epoch summary selector
  const finalLog = trainingLogs.length > 0 ? trainingLogs[trainingLogs.length - 1] : null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 md:p-8 shadow-sm">
      <div className="flex items-center gap-3 border-b border-gray-50 pb-5 mb-6">
        <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
          <Cpu className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-gray-900 tracking-tight">
            第二阶段：模型配置与训练
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            配置 Multinomial Logistic Regression 分类器算子，观察 L1 Lasso / L2 Ridge 的收敛曲线
          </p>
        </div>
        {onRunFullPipeline && (
          <button
            type="button"
            onClick={onRunFullPipeline}
            disabled={autoRunningAll || isTraining}
            className="shrink-0 inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-xs font-bold px-3 py-2 rounded-xl cursor-pointer transition"
          >
            <Play className="w-3.5 h-3.5" />
            {autoRunningAll ? "L2→L1 训练中" : "一键 L2 & L1"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Hyper-parameter dashboard controller (Left) */}
        <div className="lg:col-span-5 flex flex-col gap-5 border border-gray-100 rounded-xl p-5 bg-gray-50/20">
          <div className="flex items-center gap-1.5 border-b border-gray-50 pb-2 mb-2">
            <Sliders className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-semibold text-gray-800">超参数控制面板</h3>
          </div>

          {/* Regularization Type */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-700">惩罚项正则化 (Penalty)</label>
              <span className="text-[10px] font-medium bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-full uppercase">
                {activeConfig.penalty}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                type="button"
                onClick={() => handleConfigChange("penalty", "l1")}
                disabled={isTraining}
                className={`py-2 text-xs font-semibold rounded-lg border cursor-pointer transition ${
                  activeConfig.penalty === "l1"
                    ? "bg-indigo-600 border-indigo-600 text-white shadow-xs"
                    : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-indigo-100"
                }`}
              >
                L1 (Lasso 特征选择)
              </button>
              <button
                type="button"
                onClick={() => handleConfigChange("penalty", "l2")}
                disabled={isTraining}
                className={`py-2 text-xs font-semibold rounded-lg border cursor-pointer transition ${
                  activeConfig.penalty === "l2"
                    ? "bg-indigo-600 border-indigo-600 text-white shadow-xs"
                    : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-indigo-100"
                }`}
              >
                L2 (Ridge 参数缩小)
              </button>
            </div>
          </div>

          {/* Regularization Strength */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-gray-700">正则化强度 (Lambda / λ)</span>
              <span className="text-xs font-mono font-bold text-indigo-600">{activeConfig.lambda}</span>
            </div>
            <input
              type="range"
              min="0.001"
              max="0.5"
              step="0.005"
              disabled={isTraining}
              value={activeConfig.lambda}
              onChange={(e) => handleConfigChange("lambda", parseFloat(e.target.value))}
              className="w-full accent-indigo-600"
            />
            <div className="flex justify-between text-[10px] text-gray-400 font-mono mt-1">
              <span>0.001 (放宽正则)</span>
              <span>0.5 (强化正则/去冗余)</span>
            </div>
          </div>

          {/* Learning Rate */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-gray-700">学习率 (Learning Rate / η)</span>
              <span className="text-xs font-mono font-bold text-indigo-600">{activeConfig.learningRate}</span>
            </div>
            <input
              type="range"
              min="0.01"
              max="0.4"
              step="0.01"
              disabled={isTraining}
              value={activeConfig.learningRate}
              onChange={(e) => handleConfigChange("learningRate", parseFloat(e.target.value))}
              className="w-full accent-indigo-600"
            />
            <div className="flex justify-between text-[10px] text-gray-400 font-mono mt-1">
              <span>0.01</span>
              <span>0.4 (极大更新)</span>
            </div>
          </div>

          {/* Epochs */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-gray-700">迭代轮数 (Max Epochs)</span>
              <span className="text-xs font-mono font-bold text-indigo-600">{activeConfig.epochs}</span>
            </div>
            <input
              type="range"
              min="20"
              max="250"
              step="10"
              disabled={isTraining}
              value={activeConfig.epochs}
              onChange={(e) => handleConfigChange("epochs", parseInt(e.target.value))}
              className="w-full accent-indigo-600"
            />
            <div className="flex justify-between text-[10px] text-gray-400 font-mono mt-1">
              <span>20</span>
              <span>250 轮迭代</span>
            </div>
          </div>

          {/* Batch Size */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-gray-700">小批量梯度尺寸 (Batch Size)</span>
              <span className="text-xs font-mono font-bold text-indigo-600">{activeConfig.batchSize}</span>
            </div>
            <select
              value={activeConfig.batchSize}
              disabled={isTraining}
              onChange={(e) => handleConfigChange("batchSize", parseInt(e.target.value))}
              className="w-full text-xs border border-gray-200 rounded-lg p-2.5 bg-white focus:outline-hidden focus:border-indigo-600 text-gray-700 font-mono"
            >
              <option value="8">8 (Mini-batch SGD)</option>
              <option value="16">16 (Mini-batch sgd)</option>
              <option value="32">32 (默认标准)</option>
              <option value="64">64 (较快求和)</option>
              <option value="128">128 (批量拟合)</option>
            </select>
          </div>

          {/* Split Ratio Indicator */}
          <div className="flex items-center justify-between mt-1 text-xs border-t border-gray-50 pt-3">
            <span className="text-gray-400">分层数据集划分:</span>
            <span className="font-semibold text-gray-700">80% 训练集, 20% 测试集</span>
          </div>

          {/* Class Weight Mode */}
          <div className="border-t border-gray-50 pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-700">类别权重强度</span>
              <span className="text-[10px] font-medium bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-full">
                {CLASS_WEIGHT_MODE_LABELS[activeConfig.classWeightMode ?? "mild"]}
              </span>
            </div>
            <p className="text-[10px] text-gray-400 mb-2">
              温和 = 52% 逆频率混合；标准 = 完全逆频率。修改后端代码后请先<strong>重启 uvicorn</strong>，再点「一键 L2 & L1」。
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(["off", "mild", "strong"] as ClassWeightMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  disabled={isTraining}
                  onClick={() => handleConfigChange("classWeightMode", mode)}
                  className={`py-2 text-[11px] font-semibold rounded-lg border cursor-pointer transition ${
                    (activeConfig.classWeightMode ?? "mild") === mode
                      ? "bg-indigo-600 border-indigo-600 text-white"
                      : "bg-white border-gray-200 text-gray-600 hover:border-indigo-100"
                  }`}
                >
                  {CLASS_WEIGHT_MODE_LABELS[mode]}
                </button>
              ))}
            </div>
          </div>

          {/* More Often threshold calibration */}
          <div className="flex items-center justify-between py-2 border-t border-gray-50">
            <div>
              <span className="text-xs font-semibold text-gray-700">「多吃」阈值自动校准</span>
              <p className="text-[10px] text-gray-400 mt-0.5">
                训练后在训练集上搜索最优概率门槛，抑制误报「多吃」
              </p>
            </div>
            <button
              type="button"
              disabled={isTraining}
              onClick={() =>
                handleConfigChange(
                  "autoCalibrateThreshold",
                  !(activeConfig.autoCalibrateThreshold ?? true)
                )
              }
              className={`relative w-11 h-6 rounded-full transition cursor-pointer ${
                activeConfig.autoCalibrateThreshold ?? true ? "bg-indigo-600" : "bg-gray-200"
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition ${
                  activeConfig.autoCalibrateThreshold ?? true ? "left-5" : "left-0.5"
                }`}
              />
            </button>
          </div>

          {/* Train Button */}
          <button
            type="button"
            disabled={isTraining}
            onClick={handleStartTraining}
            className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-indigo-300 py-3 rounded-xl font-bold text-sm transition shadow-sm hover:shadow-md cursor-pointer flex items-center justify-center gap-2"
          >
            {isTraining ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                <span>模型参数寻优计算中...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>开始逻辑回归梯度寻优迭代</span>
              </>
            )}
          </button>
        </div>

        {/* Dynamic Training Status Graph (Right) */}
        <div className="lg:col-span-7 flex flex-col gap-4 border border-gray-100 rounded-xl p-5 bg-white shadow-3xs min-h-[350px]">
          <div className="flex items-center justify-between border-b border-gray-50 pb-2.5">
            <div className="flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-semibold text-gray-800">
                模型梯度优化实时日志 - 损失收敛形状
              </h3>
            </div>
            {hasTrained && !isTraining && (
              <span className="flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" /> 已收敛
              </span>
            )}
            {isTraining && (
              <span className="flex items-center gap-1 text-[10px] bg-amber-50 text-amber-700 font-bold px-2 py-0.5 rounded-full animate-pulse">
                迭代寻优中
              </span>
            )}
          </div>

          {!hasTrained && !isTraining ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-gray-400">
              <TrendingUp className="w-12 h-12 text-gray-300 stroke-[1.5] mb-2" />
              <p className="text-xs font-semibold">等待触发模型训练</p>
              <p className="text-[10px] text-gray-400 mt-1 max-w-[280px]">
                在左侧配置 Softmax 逻辑回归正则化超参数，然后点击“开始逻辑回归梯度寻优迭代”运行模型。
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-4">
              {/* Stats overview */}
              <div className="grid grid-cols-3 gap-3 bg-slate-50 border border-slate-100/50 rounded-xl p-3">
                <div>
                  <div className="text-[10px] text-slate-400">当前轮次 (Epoch)</div>
                  <div className="text-lg font-bold text-slate-800 font-mono mt-0.5">
                    {isTraining ? currentEpoch : finalLog?.epoch || 0}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">交叉熵损失 (Loss)</div>
                  <div className="text-lg font-bold text-indigo-600 font-mono mt-0.5">
                    {finalLog?.loss.toFixed(4) || "—"}
                  </div>
                </div>
      <div>
                    <div className="text-[10px] text-slate-400">训练准确率 (Accuracy)</div>
                    <div className="text-lg font-bold text-emerald-600 font-mono mt-0.5">
                      {((finalLog?.accuracy || 0) * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>

                {/* Line graph of training curve */}
                <div className="h-56 min-h-[224px] w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%" minHeight={224}>
                    <LineChart data={trainingLogs}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                      <XAxis 
                        dataKey="epoch" 
                        tick={{ fontSize: 10, fill: '#9ca3af' }}
                        stroke="#e5e7eb"
                        label={{ value: '迭代轮次 (Epoch)', position: 'insideBottom', offset: -5, fontSize: 10, fill: '#9ca3af' }}
                      />
                      <YAxis 
                        yAxisId="left" 
                        orientation="left"
                        stroke="#8884d8"
                        tick={{ fontSize: 10, fill: '#8884d8' }}
                        domain={['auto', 'auto']}
                      />
                      <YAxis 
                        yAxisId="right" 
                        orientation="right"
                        stroke="#82ca9d"
                        tick={{ fontSize: 10, fill: '#82ca9d' }}
                        domain={[0, 1]}
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: "8px", border: "1px solid #f3f4f6" }}
                        wrapperStyle={{ zIndex: 10 }}
                      />
                      <Legend verticalAlign="top" height={36} iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                      <Line 
                        yAxisId="left" 
                        type="monotone" 
                        dataKey="loss" 
                        name="交叉熵损失函数值 (Loss)" 
                        stroke="#8884d8" 
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                      <Line 
                        yAxisId="right" 
                        type="monotone" 
                        dataKey="accuracy" 
                        name="训练集预测精确度 (Accuracy)" 
                        stroke="#82ca9d" 
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </div>

      {/* Hyperparameter Optimization Experimental Section */}
      <div className="border border-indigo-100 rounded-2xl mt-8 overflow-hidden bg-white shadow-3xs">
        <button
          type="button"
          onClick={() => setShowPlan(!showPlan)}
          className="w-full px-5 py-4 bg-indigo-50/40 text-left flex items-center justify-between hover:bg-indigo-50/70 transition duration-150 cursor-pointer"
        >
          <div className="flex items-center gap-2.5 text-indigo-950 font-bold">
            <span className="p-1.5 bg-indigo-600 rounded-lg text-white">
              <Beaker className="w-4 h-4 animate-pulse" />
            </span>
            <div>
              <span className="text-xs sm:text-sm block">🔬 糖尿病饮食分类模型：系统性参数调优实验覆盖方案 (13个科学对照案例)</span>
              <span className="text-[10px] text-indigo-500 font-normal mt-0.5">提供 A、B、C、D 四个核心维度、共计 13 组具有明确梯度探究目的和预期理论表现的科研级实验方案</span>
            </div>
          </div>
          <div className="text-indigo-600">
            {showPlan ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </button>

        {showPlan && (
          <div className="p-5 border-t border-indigo-50 bg-indigo-50/5 flex flex-col gap-4">
            <p className="text-xs text-indigo-900 leading-relaxed max-w-4xl">
              系统超参优化是逻辑回归（Logistic Regression）的核心。参数选择决定了 Softmax 分类的决策面特征。以下 4 个实验模块覆盖了全部梯度探究情境，点击左侧方案维度切换，可以直接在控制面板中自动载入超参数，以便在训练后记录结果并进行验证集纵向诊断与特征系数归零情况分析：
            </p>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mt-2 items-start">
              {/* Left sidebar tabs */}
              <div className="md:col-span-3 flex flex-col gap-1.5 p-1.5 bg-indigo-50/40 rounded-xl border border-indigo-100/20">
                <span className="text-[10px] font-bold text-indigo-900/60 px-2 py-1 uppercase tracking-wider">
                  实验梯度方案维度
                </span>
                {[
                  { key: "A", label: "A组：L1 vs L2基准对比", desc: "探究正则化特征归零本领" },
                  { key: "B", label: "B组：正则 λ 强度效应", desc: "探究欠拟合与过拟合界限" },
                  { key: "C", label: "C组：学习率 lr 收敛反应", desc: "探究梯度优化的前进步伐" },
                  { key: "D", label: "D组：Batch 随机噪声", desc: "探究小批量泛化降噪轨迹" }
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveGroupTab(tab.key as any)}
                    className={`p-2.5 rounded-lg text-left transition duration-150 cursor-pointer flex flex-col gap-1 ${
                      activeGroupTab === tab.key
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-indigo-900/80 hover:bg-white hover:text-indigo-900 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-bold leading-none">{tab.label}</span>
                      <span className={`text-[9px] font-mono font-bold px-1 py-0.5 rounded ${
                        activeGroupTab === tab.key ? "bg-indigo-700/60 text-indigo-100" : "bg-indigo-100/60 text-indigo-700"
                      }`}>
                        {tab.key}
                      </span>
                    </div>
                    <span className={`text-[10px] ${
                      activeGroupTab === tab.key ? "text-indigo-200" : "text-gray-500"
                    }`}>
                      {tab.desc}
                    </span>
                  </button>
                ))}
              </div>

              {/* Right table side */}
              <div className="md:col-span-9 flex flex-col gap-4">
                <div className="overflow-x-auto border border-gray-100 rounded-xl bg-white shadow-3xs">
                  <table className="w-full text-left text-xs border-collapse min-w-[750px]">
                    <thead>
                      <tr className="bg-indigo-50/20 text-indigo-950/70 text-[10px] uppercase font-bold tracking-wider border-b border-gray-100">
                        <th className="px-4 py-3">ID</th>
                        <th className="px-4 py-3">方案名称 (Scheme Case)</th>
                        <th className="px-4 py-3">参数科学配置</th>
                        <th className="px-4 py-3 font-medium">调优对照目的 & 分析重点 (Purpose)</th>
                        <th className="px-4 py-3 font-medium">预期表现 & 理论结果 (Expected Outcomes)</th>
                        <th className="px-4 py-3 text-right">动作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-[11px] text-gray-700">
                      {EXPERIMENTAL_SCHEMES.filter(s => s.group === activeGroupTab).map((sch) => {
                        const isLoaded = activeConfig.penalty === (sch.penalty.toLowerCase().includes("l1") ? "l1" : "l2") &&
                          activeConfig.lambda === parseFloat(sch.lambda) &&
                          activeConfig.learningRate === parseFloat(sch.lr) &&
                          activeConfig.batchSize === parseInt(sch.batch) &&
                          activeConfig.epochs === parseInt(sch.epochs);

                        return (
                          <tr key={sch.id} className={`transition ${isLoaded ? "bg-amber-50/20 hover:bg-amber-50/30" : "hover:bg-indigo-50/10"}`}>
                            <td className="px-4 py-3.5 font-mono font-bold text-indigo-600 whitespace-nowrap">
                              <span className="p-1 px-1.5 bg-indigo-50 rounded text-indigo-700 border border-indigo-100">{sch.id}</span>
                            </td>
                            <td className="px-4 py-3.5 font-semibold text-gray-900">
                              {sch.name}
                              {isLoaded && <span className="ml-1.5 text-[9px] bg-amber-500 text-white rounded px-1 text-center font-normal">已载入</span>}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-indigo-950">
                              <div className="inline-flex gap-2.5 font-mono text-[10px] bg-slate-50 border border-slate-100 rounded-lg p-1.5 px-2">
                                <div><span className="text-gray-400">正则:</span> <span className="font-bold text-indigo-700">{sch.penalty}</span></div>
                                <div><span className="text-gray-400">λ:</span> <span className="font-bold">{sch.lambda}</span></div>
                                <div><span className="text-gray-400">lr:</span> <span className="font-bold">{sch.lr}</span></div>
                                <div><span className="text-gray-400">Batch:</span> <span className="font-bold">{sch.batch}</span></div>
                                <div><span className="text-gray-400">Epoch:</span> <span className="font-bold">{sch.epochs}</span></div>
                              </div>
                            </td>
                            <td className="px-4 py-3.5 leading-relaxed max-w-xs text-gray-650 font-medium">
                              {sch.purpose}
                            </td>
                            <td className="px-4 py-3.5 leading-relaxed max-w-sm text-emerald-950 font-medium">
                              {sch.expected}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveConfig({
                                    penalty: sch.penalty.toLowerCase().includes("l1") ? "l1" : "l2",
                                    lambda: parseFloat(sch.lambda),
                                    learningRate: parseFloat(sch.lr),
                                    epochs: parseInt(sch.epochs),
                                    batchSize: parseInt(sch.batch),
                                    trainRatio: 0.8,
                                    classWeightMode:
                                      ("classWeightMode" in sch
                                        ? sch.classWeightMode
                                        : "classWeights" in sch && !sch.classWeights
                                          ? "off"
                                          : "mild") as ClassWeightMode,
                                    autoCalibrateThreshold: true,
                                  });
                                }}
                                className={`px-3 py-1 text-[10px] font-bold rounded-lg transition duration-150 cursor-pointer shadow-3xs ${
                                  isLoaded 
                                    ? "bg-amber-500 text-white" 
                                    : "bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white"
                                }`}
                              >
                                运行案例配置
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center gap-2 bg-emerald-50 rounded-xl p-3 border border-emerald-100 text-emerald-950 text-[11px] leading-relaxed">
                  <span className="p-1 px-2 font-bold bg-emerald-600 text-white rounded text-[10px] shrink-0 font-mono">操作提示</span>
                  <span>您可以一键点击上面的<strong>【运行案例配置】</strong>载入对应的组合，并在运行后对比<strong>【误差收敛形状】</strong>、第三阶段<strong>【验证集诊断对比】</strong>和第四阶段<strong>【决策权重矩阵可视化表】</strong>中无关特征值是否已被 Lasso 特异稀疏化零！</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
