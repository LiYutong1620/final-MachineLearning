import React, { useState, useEffect, useRef } from "react";
import { Terminal, RefreshCw, Trash2, Download, AlertCircle, FileJson, FileText, CheckCircle2 } from "lucide-react";

interface LogItem {
  timestamp: string;
  eventType: string;
  payload: any;
}

export default function RuntimeConsole() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string>("");
  const [successText, setSuccessText] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    setLoading(true);
    setErrorText("");
    try {
      const response = await fetch("/api/logs");
      const resData = await response.json();
      if (resData.success) {
        setLogs(resData.logs);
      } else {
        throw new Error(resData.error || "获取日志失败");
      }
    } catch (err: any) {
      console.error(err);
      setErrorText(`获取日志失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const clearLogs = async () => {
    setErrorText("");
    setSuccessText("");
    if (!window.confirm("确定要清空服务器磁盘上的实验审计日志文件吗？该操作不可逆。")) {
      return;
    }
    try {
      const response = await fetch("/api/clear-logs", { method: "POST" });
      const resData = await response.json();
      if (resData.success) {
        setLogs([]);
        setSuccessText("运行日志及磁盘文件已成功清空清空！");
        setTimeout(() => setSuccessText(""), 3000);
      } else {
        throw new Error(resData.error || "清空发生错误");
      }
    } catch (err: any) {
      setErrorText(`清空日志失败: ${err.message}`);
    }
  };

  // Poll for new logs if auto-refresh is active
  useEffect(() => {
    fetchLogs();
    
    let interval: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchLogs();
      }, 5000); // refresh every 5 seconds
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  // Scroll to bottom when logs size changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // Format to download JSON
  const downloadJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
    const dlAnchorElem = document.createElement("a");
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `diabetes_ml_model_run_${new Date().toISOString().slice(0, 10)}.json`);
    dlAnchorElem.click();
  };

  // Format to download human-readable text audit log
  const downloadTXT = () => {
    let txtContent = "";
    logs.forEach((log) => {
      txtContent += `======================================================================\n`;
      txtContent += `⏰ 记录时间: ${new Date(log.timestamp).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} (CST) \n`;
      txtContent += `⚡ 事件类型: ${log.eventType}\n`;
      txtContent += `----------------------------------------------------------------------\n`;

      const payload = log.payload || {};
      if (log.eventType === "TRAINING_COMPLETED") {
        txtContent += `📊 逻辑回归训练模型信息:\n`;
        txtContent += `  - 正则惩罚项 (Penalty): ${payload.penalty?.toUpperCase() === "L1" ? "L1 Lasso (套索正则/稀疏化)" : "L2 Ridge (岭正则/权重衰减)"}\n`;
        txtContent += `  - 惩罚系数强度 (lambda): ${payload.lambda}\n`;
        txtContent += `  - 学习率梯度 (Learning Rate): ${payload.learningRate}\n`;
        txtContent += `  - 训练轮轮次 (Epochs): ${payload.epochs}\n`;
        txtContent += `  - 训练批次 (Batch Size): ${payload.batchSize}\n`;
        txtContent += `  - 训练分割比例 (Train Ratio): ${payload.trainRatio}\n`;
        txtContent += `🚀 独立验证集评估绩效:\n`;
        txtContent += `  - 验证集准确率 (Test Accuracy): ${(payload.evaluation?.accuracy * 100 || 0).toFixed(2)}%\n`;
        txtContent += `  - 加权宏观主 F1-Score: ${(payload.evaluation?.macroF1 * 100 || 0).toFixed(2)}%\n`;
        txtContent += `  - 宏观精确率 (Precision): ${(payload.evaluation?.precision * 100 || 0).toFixed(2)}%\n`;
        txtContent += `  - 宏观召回率 (Recall): ${(payload.evaluation?.recall * 100 || 0).toFixed(2)}%\n`;
        
        const cnTrans = (rawName: string) => {
          if (rawName === "In Moderation") return "适度推荐 (In Moderation)";
          if (rawName === "Less Often") return "减少摄入 (Less Often)";
          if (rawName === "More Often") return "推荐食用 (More Often)";
          return rawName;
        };

        if (payload.coefficients) {
          txtContent += `📐 多分类回归权重与决策偏置 (Decision Boundaries & Coefficients):\n`;
          payload.coefficients.forEach((clsCoeff: any) => {
            txtContent += `    * 分类 [ ${cnTrans(clsCoeff.className)} ] Intercept (Bias): ${clsCoeff.intercept.toFixed(4)}\n`;
            txtContent += `      特征系数分布矩阵 (Feature Coefficients):\n`;
            clsCoeff.coefficients.forEach((c: any) => {
              const sign = c.weight >= 0 ? "+" : "";
              const info = c.weight === 0 ? "◀ 已被 L1 套索零化剪枝 (Sparsity)" : "";
              txtContent += `        • ${c.feature.padEnd(16)}: ${sign}${c.weight.toFixed(4)} ${info}\n`;
            });
          });
        } else if (payload.intercepts) {
          txtContent += `📐 多分类边界偏置 intercept (Bias):\n`;
          Object.entries(payload.intercepts).forEach(([k, v]) => {
            txtContent += `    * 分类 [ ${cnTrans(k)} ]: ${v}\n`;
          });
        }
      } else if (log.eventType === "DIAGNOSIS_COMPLETED") {
        txtContent += `🥦 假想待检测食品: 《${payload.foodName}》\n`;
        txtContent += `🔢 录入的高维营养分布特征:\n`;
        if (payload.metrics) {
          Object.entries(payload.metrics).forEach(([k, v]) => {
            txtContent += `    * ${k}: ${v}\n`;
          });
        }
        txtContent += `🎯 逻辑回归最终决策判定: [ ${payload.predictedLabel} ]\n`;
        txtContent += `📈 分类 Softmax 预测概率分布:\n`;
        if (payload.probabilities) {
          Object.entries(payload.probabilities).forEach(([k, v]) => {
            txtContent += `    * ${k}: ${(Number(v) * 100).toFixed(1)}%\n`;
          });
        }
        if (payload.aiAdvice) {
          txtContent += `🤖 AI 临床膳食定制化建议:\n\n${payload.aiAdvice}\n`;
        }
      } else {
        txtContent += `${JSON.stringify(payload, null, 2)}\n`;
      }
      txtContent += `======================================================================\n\n\n`;
    });

    const dataStr = "data:text/plain;charset=utf-8," + encodeURIComponent(txtContent);
    const dlAnchorElem = document.createElement("a");
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `diabetes_ml_model_run_${new Date().toISOString().slice(0, 10)}.txt`);
    dlAnchorElem.click();
  };

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 md:p-8 text-slate-100 shadow-xl overflow-hidden relative">
      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5 mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-800 rounded-xl text-emerald-400 border border-slate-700 animate-pulse">
            <Terminal className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-white flex items-center gap-2">
              第六阶段：糖尿病审计决策运行日志控制台
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 font-mono animate-pulse">
                File Sync On
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              实时同步记录本地每一次逻辑回归的训练参数、独立验证集评估表现和患者膳食推荐决策细节日志
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          <label className="flex items-center gap-1.5 text-xs text-slate-400 mr-2 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
            />
            自动刷新 (5s)
          </label>

          <button
            onClick={fetchLogs}
            disabled={loading}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-lg transition border border-slate-700 cursor-pointer flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
            title="手动拉取最新日志"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            刷新
          </button>

          <button
            onClick={clearLogs}
            className="p-2 bg-rose-950/40 text-rose-300 hover:bg-rose-900/60 font-semibold text-xs rounded-lg transition border border-rose-900/40 cursor-pointer flex items-center gap-1.5 active:scale-95"
            title="清空磁盘历史日志"
          >
            <Trash2 className="w-3.5 h-3.5" />
            清空历史
          </button>
        </div>
      </div>

      {errorText && (
        <div className="bg-rose-950/50 text-rose-200 text-xs p-4 rounded-xl border border-rose-900/50 mb-6 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          {errorText}
        </div>
      )}

      {successText && (
        <div className="bg-emerald-950/50 text-emerald-200 text-xs p-4 rounded-xl border border-emerald-900/50 mb-6 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 animate-bounce" />
          {successText}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
        
        {/* Terminal logs viewport */}
        <div className="lg:col-span-8 flex flex-col">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-[11px] leading-relaxed relative flex flex-col justify-between">
            <div className="flex items-center justify-between border-b border-slate-900 pb-2 mb-3 text-slate-500">
              <span className="flex items-center gap-2 text-[10px]">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
                <span className="ml-1 text-slate-400">bash • runtime_model_logs.txt</span>
              </span>
              <span className="text-[10px]">字符编码: UTF-8</span>
            </div>

            <div 
              ref={scrollRef}
              className="h-[320px] overflow-y-auto pr-2 space-y-4 font-mono scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent text-slate-300"
            >
              {logs.length === 0 ? (
                <div className="text-center py-24 text-slate-600 italic">
                  &gt;_ 暂无决策事件日志。请至少触发一次第二阶段的[模型训练]或第五阶段的[分类诊断]以向磁盘同步日志。
                </div>
              ) : (
                logs.map((log, idx) => {
                  const payload = log.payload || {};
                  return (
                    <div key={idx} className="border-b border-slate-900/55 pb-3 last:border-0">
                      <div className="flex flex-col sm:flex-row justify-between text-slate-500 gap-1 mb-1.5">
                        <span className="text-emerald-400 font-bold">
                          [ {new Date(log.timestamp).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} CST ]
                        </span>
                        <span className="bg-slate-900 px-2 py-0.5 rounded text-[10px] text-indigo-400 font-extrabold uppercase border border-slate-800">
                          {log.eventType}
                        </span>
                      </div>

                      {log.eventType === "TRAINING_COMPLETED" ? (
                        <div className="pl-3 border-l-2 border-indigo-500/50 text-slate-300 space-y-1 mt-1 font-mono">
                          <p className="text-slate-200">
                            📊 &gt; 采用 <span className="text-indigo-400 font-bold">{payload.penalty?.toUpperCase()} 套索/岭算法</span> 超参数拟合完成:
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px] text-slate-400 bg-slate-900/60 p-2 rounded-md border border-slate-900 my-2">
                            <div>罚项强 lambda: <span className="text-white font-bold">{payload.lambda}</span></div>
                            <div>学习率 L.R.: <span className="text-white font-bold">{payload.learningRate}</span></div>
                            <div>轮次 epochs: <span className="text-white font-bold">{payload.epochs}</span></div>
                            <div>验证集比率: <span className="text-white font-bold">{payload.trainRatio}</span></div>
                            <div>分层 Stratify: <span className="text-green-400 font-bold">ACTIVE</span></div>
                          </div>
                          <p className="text-emerald-400 text-xs font-bold leading-relaxed">
                            🚀 &gt; 验证集指标 Accuracy: <span className="underline">{(payload.evaluation?.accuracy * 100).toFixed(2)}%</span> | 宏观 F1-Score: {(payload.evaluation?.macroF1 * 100).toFixed(2)}%
                          </p>
                        </div>
                      ) : log.eventType === "DIAGNOSIS_COMPLETED" ? (
                        <div className="pl-3 border-l-2 border-emerald-500/50 text-slate-300 space-y-1.5 mt-1 font-mono">
                          <p className="text-slate-200 font-semibold">
                            🥦 &gt; 全面检测分析食品: <span className="text-amber-300 font-bold">《{payload.foodName}》</span> ➡ 决策判定为 <span className="text-emerald-400 font-extrabold underline">{payload.predictedLabel}</span>
                          </p>
                          <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-900 flex flex-col gap-1 text-[10px] text-slate-400">
                            <strong>Softmax 判定分布概率:</strong>
                            <div className="flex flex-wrap gap-4 mt-0.5">
                              {payload.probabilities && Object.entries(payload.probabilities).map(([target, val]) => (
                                <span key={target} className="text-slate-200">
                                  {target}: <strong className="text-indigo-300">{(Number(val)*100).toFixed(1)}%</strong>
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <pre className="p-2 bg-slate-900/40 rounded text-[10px] overflow-x-auto text-slate-400 max-h-36">
                          {JSON.stringify(payload, null, 2)}
                        </pre>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="border-t border-slate-900 pt-3 mt-3 flex items-center justify-between text-[9px] text-slate-500 font-sans">
              <span>* 所有的操作日志均双向保存在本地 `model_logs.json` 与 `model_logs.txt` 文件中。</span>
              <span>总事件数: {logs.length} 个</span>
            </div>
          </div>
        </div>

        {/* Action and Download guide (Right) */}
        <div className="lg:col-span-4 flex flex-col justify-between gap-6">
          <div className="bg-slate-800/40 border border-slate-850 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
              <span>🗄️ 决策日志磁盘同步报告</span>
            </h3>
            
            <p className="text-xs text-slate-400 leading-relaxed">
              为了确保在离线部署或高校答辩（如课程设计讲解）等关键场合时，能更方便地演示和分析模型的计算成果，我们设计了完整的双模日志同步机制。
            </p>

            <div className="space-y-3 pt-2">
              <div className="flex items-start gap-2.5 text-xs text-slate-300">
                <div className="p-1 bg-emerald-500/10 text-emerald-400 rounded-md shrink-0 border border-emerald-500/10">
                  <FileText className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="font-semibold text-white">模型审计运行日志 (Txt 格式)</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">面向人类评阅的高可读格式。保存详细营养特征指标、各分类判定概率、与 Gemini 营养师临床诊断处方叙述文本。</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 text-xs text-slate-300">
                <div className="p-1 bg-indigo-500/10 text-indigo-400 rounded-md shrink-0 border border-indigo-500/10">
                  <FileJson className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="font-semibold text-white">高维参数数据帧 (Json 格式)</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">面向机器和大数据分析，导出每次训练得到的 Bias、损失率、测试 F1-Score 趋势等完整高维矩阵数据。</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col gap-2.5">
            <button
              onClick={downloadTXT}
              disabled={logs.length === 0}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:border-slate-800 disabled:text-slate-500 border border-emerald-600 text-white font-bold text-xs rounded-xl transition duration-150 active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              导出高质量实验审计报告 (.TXT)
            </button>

            <button
              onClick={downloadJSON}
              disabled={logs.length === 0}
              className="w-full py-3 bg-slate-800 hover:bg-slate-705 disabled:bg-slate-800 disabled:text-slate-500 text-slate-200 border border-slate-700 font-bold text-xs rounded-xl transition duration-150 active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:cursor-not-allowed"
            >
              <FileJson className="w-4 h-4" />
              导出参数特征矩阵 JSON 文件
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
