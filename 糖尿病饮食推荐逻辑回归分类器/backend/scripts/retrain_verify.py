"""离线重训 L1/L2 并打印测试集指标（与 main.train_model 逻辑一致）"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ml.dataset import load_food_dataset
from ml.evaluation import evaluate_model
from ml.model import MultinomialLogisticRegression
from ml.persistence import save_trained_model
from ml.preprocessing import (
    LabelEncoder,
    MinMaxScaler,
    detect_numeric_features,
    stratified_holdout_indices,
    stratified_split,
)


TUNED_L1 = {
    "penalty": "l1",
    "lambda": 0.006,
    "learningRate": 0.05,
    "epochs": 160,
    "batchSize": 16,
    "trainRatio": 0.8,
    "classWeightMode": "mild",
    "autoCalibrateThreshold": True,
}

TUNED_L2 = {
    **TUNED_L1,
    "penalty": "l2",
    "lambda": 0.01,
}


def train_one(config: dict, headers, data, target_column, name_column, numeric_features):
    train, test = stratified_split(data, target_column, config["trainRatio"])
    scaler = MinMaxScaler(numeric_features)
    scaler.fit(train)
    scaled_train = scaler.transform(train)
    scaled_test = scaler.transform(test)

    encoder = LabelEncoder()
    train_labels = [str(row[target_column]) for row in train]
    test_labels = [str(row[target_column]) for row in test]
    encoder.fit(train_labels)
    train_y = encoder.transform(train_labels)
    test_y = encoder.transform(test_labels)
    class_names = encoder.get_classes()

    _, cal_idx = stratified_holdout_indices(train_y, holdout_ratio=0.15)
    scaled_calib = [scaled_train[i] for i in cal_idx]
    calib_y = [train_y[i] for i in cal_idx]

    train_config = {**config, "randomSeed": 42}
    model = MultinomialLogisticRegression(numeric_features, class_names)
    model.train(scaled_train, train_y, train_config)

    more_idx = MultinomialLogisticRegression.find_more_often_index(class_names)
    threshold = (
        model.calibrate_more_often_threshold(scaled_calib, calib_y, more_idx)
        if config.get("autoCalibrateThreshold")
        else 0.0
    )
    save_config = {**train_config, "moreOftenThreshold": threshold}

    test_pred = model.predict(scaled_test, more_often_threshold=threshold)
    evaluation = evaluate_model(test_y, test_pred, class_names)
    coefficients = model.get_coefficients(class_names)

    save_trained_model(
        config["penalty"],
        model,
        scaler,
        encoder,
        evaluation,
        coefficients,
        save_config,
    )
    return threshold, evaluation


async def main():
    headers, data, _ = await load_food_dataset()
    target_column = next((h for h in headers if h.lower() == "class"), "class")
    name_column = next(
        (h for h in headers if h.lower() in {"title", "name", "food"}),
        "title",
    )
    numeric_features = detect_numeric_features(data, headers, target_column, name_column)

    for cfg in (TUNED_L2, TUNED_L1):
        threshold, ev = train_one(cfg, headers, data, target_column, name_column, numeric_features)
        more = next(
            (r for r in ev["classPerformance"] if "more" in r["className"].lower()),
            None,
        )
        print(f"\n=== {cfg['penalty'].upper()} threshold={threshold} ===")
        print(f"accuracy={ev['accuracy']:.3f} macroF1={ev['macroF1']:.3f}")
        if more:
            print(
                f"多吃 P={more['precision']:.3f} R={more['recall']:.3f} F1={more['f1Score']:.3f}"
            )
        print("confusionMatrix:")
        print(json.dumps(ev["confusionMatrix"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
