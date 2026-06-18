export function getChineseClass(label: string): string {
  const lower = String(label).toLowerCase();
  if (lower.includes("more") || lower.includes("green") || lower.includes("healthy") || lower.includes("多吃")) {
    return "多吃 (绿色)";
  }
  if (lower.includes("less") || lower.includes("red") || lower.includes("avoid") || lower.includes("少吃")) {
    return "少吃 (红色)";
  }
  if (lower.includes("moderation") || lower.includes("yellow") || lower.includes("适量")) {
    return "适量 (黄色)";
  }
  return label;
}

export function getChineseLabel(raw: string): string {
  const lower = String(raw).toLowerCase();
  if (lower.includes("more") || lower.includes("green") || lower.includes("多吃")) return "多吃 (绿色判定)";
  if (lower.includes("less") || lower.includes("red") || lower.includes("少吃")) return "少吃 (红色判定)";
  return "适量 (黄色判定)";
}
