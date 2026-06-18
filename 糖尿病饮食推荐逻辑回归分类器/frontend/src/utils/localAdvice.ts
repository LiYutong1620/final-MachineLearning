export function buildLocalAdvice(
  foodName: string,
  modelClass: string,
  metrics: Record<string, number>
): string {
  const sugars = metrics["Sugars"] ?? 0;
  const calories = metrics["Calories"] ?? 0;
  const sodium = metrics["Sodium"] ?? 0;
  const fiber = metrics["Dietary Fiber"] ?? 0;
  const fat = metrics["Total Fat"] ?? 0;

  const isMore = modelClass.includes("多吃");
  const isLess = modelClass.includes("少吃");

  let reason = "";
  if (isMore) {
    reason = `《${foodName}》糖分(${sugars}g)与钠(${sodium}mg)相对较低，膳食纤维(${fiber}g)较充足，适合作为糖尿病患者的日常优选。`;
  } else if (isLess) {
    reason = `《${foodName}》存在高糖(${sugars}g)、高钠(${sodium}mg)或高热量(${calories}kcal)风险，易引发餐后血糖波动，建议减少摄入。`;
  } else {
    reason = `《${foodName}》营养结构中等（糖${sugars}g、脂${fat}g、纤维${fiber}g），可在控制总热量的前提下适量食用。`;
  }

  return `${reason}\n\n*正在生成 AI 详细临床建议，请稍候…*`;
}
