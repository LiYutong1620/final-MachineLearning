import React, { useState, useMemo } from "react";
import { FoodItem } from "../types";
import { 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip, 
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from "recharts";
import { Database, Search, Filter, RefreshCw, AlertCircle, Sparkles } from "lucide-react";
import { getChineseClass } from "../utils/labels";

interface DatasetExplorerProps {
  data: FoodItem[];
  headers: string[];
  numericFeatures: string[];
  targetColumn: string;
  nameColumn: string;
  loading: boolean;
  onReload: () => void;
}

const COLORS = ["#10B981", "#F59E0B", "#EF4444"]; // Green, Yellow, Red

export const getLabelColorInfo = (rawLabel: string) => {
  const norm = String(rawLabel).replace(/'/g, "").replace(/"/g, "").trim().toLowerCase();
  if (norm.includes("more") || norm.includes("多吃")) {
    return {
      hex: "#10B981", // Green - Recommended
      bgClass: "bg-emerald-50 text-emerald-700 border-emerald-100",
      textClass: "text-emerald-600"
    };
  } else if (norm.includes("less") || norm.includes("少吃")) {
    return {
      hex: "#EF4444", // Red - Avoid
      bgClass: "bg-red-50 text-red-700 border-red-100",
      textClass: "text-red-500"
    };
  } else {
    return {
      hex: "#F59E0B", // Yellow/Amber - Moderation
      bgClass: "bg-amber-50 text-amber-700 border-amber-100",
      textClass: "text-amber-500"
    };
  }
};

export default function DatasetExplorer({
  data,
  headers,
  numericFeatures,
  targetColumn,
  nameColumn,
  loading,
  onReload,
}: DatasetExplorerProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClassFilter, setSelectedClassFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // 1. Label Count & Statistics Analysis
  const labelCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    data.forEach((row) => {
      const val = String(row[targetColumn]);
      counts[val] = (counts[val] || 0) + 1;
    });

    return Object.entries(counts).map(([label, count]) => {
      const percentage = ((count / data.length) * 100).toFixed(1);
      const cnName = getChineseClass(label);
      return {
        name: cnName,
        rawLabel: label,
        value: count,
        percentage: `${percentage}%`,
      };
    }).sort((a, b) => b.value - a.value);
  }, [data, targetColumn]);

  // Missing values inspection
  const missingAnalysis = useMemo(() => {
    const counts: Record<string, number> = {};
    numericFeatures.forEach((f) => {
      counts[f] = 0;
    });

    data.forEach((row) => {
      numericFeatures.forEach((f) => {
        if (row[f] === null || row[f] === undefined || row[f] === "") {
          counts[f]++;
        }
      });
    });

    return Object.entries(counts).map(([feature, missingCount]) => ({
      feature,
      missingCount,
      missingPct: ((missingCount / data.length) * 100).toFixed(1),
    })).filter(item => Number(item.missingCount) > 0);
  }, [data, numericFeatures]);

  // Compute column averages across the entire dataset dynamically
  const columnMeans = useMemo(() => {
    if (data.length === 0) return {};
    const sum: Record<string, number> = {};
    const count: Record<string, number> = {};
    
    data.forEach((row) => {
      numericFeatures.forEach((f) => {
        const val = Number(row[f]);
        if (row[f] !== null && row[f] !== undefined && !isNaN(val)) {
          sum[f] = (sum[f] || 0) + val;
          count[f] = (count[f] || 0) + 1;
        }
      });
    });

    const means: Record<string, number> = {};
    numericFeatures.forEach((f) => {
      means[f] = count[f] > 0 ? sum[f] / count[f] : 0;
    });
    return means;
  }, [data, numericFeatures]);

  // 2. Client-side filtration
  const filteredData = useMemo(() => {
    return data.filter((row) => {
      const name = String(row[nameColumn] || "").toLowerCase();
      const matchSearch = name.includes(searchTerm.toLowerCase());
      
      const category = String(row[targetColumn] || "");
      const matchCategory = selectedClassFilter === "all" || category === selectedClassFilter;

      return matchSearch && matchCategory;
    });
  }, [data, nameColumn, targetColumn, searchTerm, selectedClassFilter]);

  // Paged rows
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage]);

  const totalPages = Math.ceil(filteredData.length / pageSize) || 1;

  // Render feature translations nicely
  const getFriendlyFeatureName = (f: string) => {
    const translations: Record<string, string> = {
      "Calories": "热量 (Calories)",
      "Total Fat": "总脂肪 (Total Fat)",
      "Saturated Fat": "饱和脂肪 (Saturated Fat)",
      "Trans Fat": "反式脂肪 (Trans Fat)",
      "Cholesterol": "胆固醇 (Cholesterol)",
      "Sodium": "钠 (Sodium)",
      "Total Carbohydrate": "总碳水化合物 (Carbohydrate)",
      "Dietary Fiber": "膳食纤维 (Fiber)",
      "Sugars": "糖分 (Sugars)",
      "Protein": "蛋白质 (Protein)",
      "Vitamin A": "维生素 A",
      "Vitamin C": "维生素 C",
      "Calcium": "钙 (Calcium)",
      "Iron": "铁 (Iron)",
      "Water": "水分 (Water)",
    };
    return translations[f] || f;
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 md:p-8 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-50 pb-5 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
            <Database className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 tracking-tight">
              第一阶段：在线数据探索
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              IBM 食品营养标签数据集 (包含 17 维食品健康与微量元素指标)
            </p>
          </div>
        </div>

        <button
          onClick={onReload}
          disabled={loading}
          className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-200 hover:border-emerald-200 text-sm font-medium rounded-lg text-gray-600 hover:text-emerald-600 transition duration-200 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          重新读取数据集
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <div className="w-12 h-12 rounded-full border-4 border-emerald-100 border-t-emerald-600 animate-spin mb-4"></div>
          <span className="text-sm font-medium text-gray-500">正在从 IBM 远程加载食品数据集...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Metadata Statistics Panel (Left/Top) */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            <div className="bg-emerald-50/50 rounded-xl p-4 border border-emerald-100/50">
              <h3 className="text-sm font-semibold text-emerald-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                数据概况统计
              </h3>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="bg-white rounded-lg p-3 border border-emerald-100 shadow-xs">
                  <div className="text-xs text-gray-400">样本总数 (Rows)</div>
                  <div className="text-2xl font-bold text-gray-800 tracking-tight mt-1">
                    {data.length}
                  </div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-emerald-100 shadow-xs">
                  <div className="text-xs text-gray-400">特征维度 (Cols)</div>
                  <div className="text-2xl font-bold text-gray-800 tracking-tight mt-1">
                    {numericFeatures.length} <span className="text-xs text-gray-400 font-normal">维</span>
                  </div>
                </div>
              </div>

              {/* Real dynamic dataset averages to prove non-zero characteristics across the 13k dataset */}
              <div className="mt-4 pt-3 border-t border-emerald-100/50 flex flex-col gap-2">
                <div className="text-[10px] uppercase font-bold tracking-wider text-emerald-800">📊 全局平均营养素水平 (以验证样本完整性)：</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between p-1 px-2 rounded bg-white">
                    <span className="text-gray-500">平均卡路里:</span>
                    <span className="font-mono font-bold text-gray-800">
                      {(columnMeans["Calories"] || 0).toFixed(1)} <span className="text-[9px] font-normal text-gray-400">kcal</span>
                    </span>
                  </div>
                  <div className="flex justify-between p-1 px-2 rounded bg-white">
                    <span className="text-gray-500">平均总脂肪:</span>
                    <span className="font-mono font-bold text-gray-800">
                      {(columnMeans["Total Fat"] || 0).toFixed(1)} <span className="text-[9px] font-normal text-gray-400">g</span>
                    </span>
                  </div>
                  <div className="flex justify-between p-1 px-2 rounded bg-white">
                    <span className="text-gray-500">平均糖分:</span>
                    <span className="font-mono font-bold text-gray-800">
                      {(columnMeans["Sugars"] || 0).toFixed(1)} <span className="text-[9px] font-normal text-gray-400">g</span>
                    </span>
                  </div>
                  <div className="flex justify-between p-1 px-2 rounded bg-white">
                    <span className="text-gray-500">平均膳食纤维:</span>
                    <span className="font-mono font-bold text-gray-800">
                      {(columnMeans["Dietary Fiber"] || 0).toFixed(1)} <span className="text-[9px] font-normal text-gray-400">g</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Label Imbalance Visualizer */}
            <div className="border border-gray-100 rounded-xl p-4 bg-gray-50/30">
              <h3 className="text-sm font-semibold text-gray-800">
                糖尿病饮食标签分布 (多分类占比)
              </h3>
              <div className="h-56 mt-2 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={labelCounts}
                      cx="50%"
                      cy="45%"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {labelCounts.map((entry) => (
                        <Cell key={entry.name} fill={getLabelColorInfo(entry.rawLabel).hex} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value, name) => [`${value} 个样本`, "数量"]}
                      contentStyle={{ borderRadius: '8px', border: '1px solid #f3f4f6' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Counts legend */}
              <div className="flex flex-col gap-1.5 text-xs">
                {labelCounts.map((item) => (
                  <div key={item.name} className="flex items-center justify-between p-1.5 rounded-lg hover:bg-gray-50 transition duration-150">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-2.5 h-2.5 rounded-full" 
                        style={{ backgroundColor: getLabelColorInfo(item.rawLabel).hex }}
                      />
                      <span className="font-medium text-gray-700">{item.name}</span>
                      <span className="text-gray-400">({item.rawLabel})</span>
                    </div>
                    <div className="font-semibold text-gray-800">
                      {item.value} <span className="text-gray-400">({item.percentage})</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Missing Values Notice */}
            {missingAnalysis.length > 0 && (
              <div className="border border-red-50 p-4 rounded-xl bg-red-50/30">
                <h4 className="text-xs font-semibold text-red-800 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  存在缺失值特征分析 (空值占比)
                </h4>
                <div className="max-h-24 overflow-y-auto mt-2 flex flex-col gap-1">
                  {missingAnalysis.map((item) => (
                    <div key={item.feature} className="flex justify-between text-xs text-red-600">
                      <span>{item.feature}</span>
                      <span>{item.missingCount}个空值 ({item.missingPct}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Interactive SQL/CSV Raw Data Browser Table (Right) */}
          <div className="lg:col-span-8 flex flex-col">
            <div className="mb-4">
              <div className="flex flex-wrap items-center gap-3">
                {/* Search Food Target Name */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="搜索食品名称 (例如 Chicken, Oatmeal, Pork, Butter 等)..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full text-sm pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                  />
                </div>

                {/* Class Filter */}
                <div className="flex items-center gap-2 text-gray-500 shrink-0">
                  <Filter className="w-4 h-4 text-gray-400" />
                  <select
                    value={selectedClassFilter}
                    onChange={(e) => {
                      setSelectedClassFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="text-xs border border-gray-200 rounded-lg p-2 bg-white focus:outline-hidden focus:border-emerald-600 text-gray-600"
                  >
                    <option value="all">所有标签 (全部)</option>
                    {labelCounts.map(item => (
                      <option key={item.rawLabel} value={item.rawLabel}>
                        {item.name} ({item.rawLabel})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Table wrapper */}
            <div className="border border-gray-100 rounded-xl overflow-x-auto bg-white flex-1 min-h-[360px]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    <th className="px-4 py-3 min-w-[140px] text-gray-500">食品名称 ({nameColumn})</th>
                    <th className="px-3 py-3 text-right max-w-[80px] text-gray-500">卡路里</th>
                    <th className="px-3 py-3 text-right max-w-[80px] text-gray-500">总脂肪</th>
                    <th className="px-3 py-3 text-right max-w-[80px] text-gray-500">糖分</th>
                    <th className="px-3 py-3 text-right max-w-[80px] text-gray-500">蛋白质</th>
                    <th className="px-3 py-3 text-right max-w-[80px] text-gray-500">膳食纤维</th>
                    <th className="px-4 py-3 text-center text-gray-500">饮食决策分类</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-xs text-gray-700">
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-16 text-center text-gray-400">
                        未搜索到匹配的食品数据样本
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((row, idx) => {
                      const labelStr = String(row[targetColumn]);
                      const bgLabel = getLabelColorInfo(labelStr).bgClass;
                      const cnLabel = getChineseClass(labelStr);

                      return (
                        <tr key={row.id || idx} className="hover:bg-gray-50/40 transition duration-150">
                          <td className="px-4 py-3 font-medium text-gray-800 truncate max-w-[160px]">
                            {row[nameColumn] || "未命名食品"}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-gray-500">
                            {row["Calories"] !== undefined ? Number(row["Calories"]).toFixed(0) : "-"}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-gray-500">
                            {row["Total Fat"] !== undefined ? Number(row["Total Fat"]).toFixed(1) : "-"}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-gray-500">
                            {row["Sugars"] !== undefined ? Number(row["Sugars"]).toFixed(1) : "-"}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-gray-500">
                            {row["Protein"] !== undefined ? Number(row["Protein"]).toFixed(1) : "-"}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-gray-500">
                            {row["Dietary Fiber"] !== undefined ? Number(row["Dietary Fiber"]).toFixed(1) : "-"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block px-2.5 py-1 text-[10px] font-semibold rounded-full ${bgLabel}`}>
                              {cnLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {filteredData.length > 0 && (
              <div className="flex items-center justify-between mt-4 px-1">
                <div className="text-xs text-gray-400">
                  当前显示 {Math.min(filteredData.length, (currentPage - 1) * pageSize + 1)} -{" "}
                  {Math.min(filteredData.length, currentPage * pageSize)} 条 (共{" "}
                  {filteredData.length} 条过滤后记录)
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="p-1 px-3 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 text-xs font-medium cursor-pointer transition"
                  >
                    上一页
                  </button>
                  <span className="text-xs font-mono text-gray-500 font-medium">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="p-1 px-3 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 text-xs font-medium cursor-pointer transition"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
