from __future__ import annotations

from typing import Any

from ml.evaluation import evaluate_model
from ml.model import MultinomialLogisticRegression
from ml.preprocessing import stratified_split

ML_PIPELINE_VERSION = 2


def verify_threshold_promotion_pipeline() -> None:
    """启动自检：确认「多吃」概率门槛提升逻辑已加载。"""
    promoted = MultinomialLogisticRegression._apply_more_often_threshold(
        [0.2, 0.5, 0.28],
        2,
        0.25,
    )
    if promoted != 2:
        raise RuntimeError(
            "ML 阈值提升逻辑未生效，请完全重启 Python 后端后再训练。"
        )


def evaluate_on_stratified_test(
    model: MultinomialLogisticRegression,
    scaler,
    encoder,
    dataset: dict[str, Any],
    config: dict[str, Any],
) -> dict[str, Any]:
    target_column = dataset["targetColumn"]
    data = dataset["data"]
    train_ratio = float(config.get("trainRatio", 0.8))
    seed = int(config.get("randomSeed", 42))
    threshold = float(config.get("moreOftenThreshold") or 0.0)

    train, test = stratified_split(data, target_column, train_ratio, seed=seed)
    _ = train  # scaler 已在训练时 fit，此处仅复现相同划分
    scaled_test = scaler.transform(test)
    test_labels = [str(row[target_column]) for row in test]
    test_y = encoder.transform(test_labels)
    class_names = encoder.get_classes()
    more_idx = MultinomialLogisticRegression.find_more_often_index(class_names)
    test_pred = model.predict(
        scaled_test,
        more_often_threshold=threshold,
        more_often_idx=more_idx,
    )
    return evaluate_model(test_y, test_pred, class_names)


def needs_evaluation_refresh(config: dict[str, Any], evaluation: dict[str, Any] | None) -> bool:
    if not evaluation:
        return True
    if int(config.get("pipelineVersion") or 0) < ML_PIPELINE_VERSION:
        return True
    threshold = float(config.get("moreOftenThreshold") or 0.0)
    if threshold <= 0:
        return False
    class_names = evaluation.get("classNames") or []
    more_idx = MultinomialLogisticRegression.find_more_often_index(class_names)
    if more_idx is None:
        return False
    rows = evaluation.get("classPerformance") or []
    if more_idx >= len(rows):
        return True
    more_row = rows[more_idx]
    return more_row.get("support", 0) > 0 and more_row.get("recall", 0) == 0
