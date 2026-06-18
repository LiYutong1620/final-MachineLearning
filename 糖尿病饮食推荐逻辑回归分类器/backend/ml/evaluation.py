from __future__ import annotations


def evaluate_model(
    actual: list[int],
    predicted: list[int],
    class_names: list[str],
) -> dict:
    num_classes = len(class_names)
    n = len(actual)
    confusion_matrix = [[0 for _ in range(num_classes)] for _ in range(num_classes)]

    num_correct = 0
    for act, pred in zip(actual, predicted):
        confusion_matrix[act][pred] += 1
        if act == pred:
            num_correct += 1

    accuracy = num_correct / (n or 1)
    class_performance = []

    for class_idx, class_name in enumerate(class_names):
        tp = confusion_matrix[class_idx][class_idx]
        fp = sum(confusion_matrix[row_idx][class_idx] for row_idx in range(num_classes) if row_idx != class_idx)
        fn = sum(confusion_matrix[class_idx][col_idx] for col_idx in range(num_classes) if col_idx != class_idx)
        support = sum(confusion_matrix[class_idx])

        precision = tp / (tp + fp) if tp + fp > 0 else 0.0
        recall = tp / (tp + fn) if tp + fn > 0 else 0.0
        f1_score = (
            (2 * precision * recall) / (precision + recall)
            if precision + recall > 0
            else 0.0
        )

        class_performance.append(
            {
                "className": class_name,
                "precision": precision,
                "recall": recall,
                "f1Score": f1_score,
                "support": support,
            }
        )

    macro_f1 = sum(item["f1Score"] for item in class_performance) / (num_classes or 1)

    return {
        "accuracy": accuracy,
        "macroF1": macro_f1,
        "classPerformance": class_performance,
        "confusionMatrix": confusion_matrix,
        "classNames": class_names,
    }
