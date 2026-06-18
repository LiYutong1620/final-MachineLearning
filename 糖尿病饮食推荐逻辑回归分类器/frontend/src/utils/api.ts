import { ModelConfig } from "../types";

const API_BASE = "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const detail = payload.detail;
    const message = Array.isArray(detail)
      ? detail.map((item) => item.msg || JSON.stringify(item)).join("; ")
      : detail || payload.error || `请求失败: ${path}`;
    throw new Error(message);
  }
  return payload as T;
}

export const api = {
  getFoodData: () => request<any>("/api/food-data"),
  getHealth: () => request<any>("/api/health"),
  getModelStatus: () => request<any>("/api/model-status"),
  trainModel: (config: ModelConfig) =>
    request<any>("/api/train", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    }),
  predict: (body: Record<string, unknown>) =>
    request<any>("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  recommend: (body: Record<string, unknown>) =>
    request<any>("/api/gemini-recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  getLogs: () => request<any>("/api/logs"),
  clearLogs: () =>
    request<any>("/api/clear-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
  saveLogs: (eventType: string, payload: Record<string, unknown>) =>
    request<any>("/api/save-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType, payload }),
    }),
};
