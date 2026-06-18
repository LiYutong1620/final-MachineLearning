from __future__ import annotations

import math
import random
from typing import Any, Callable

from ml.evaluation import evaluate_model
from ml.preprocessing import compute_class_weights

MORE_OFTEN_KEYWORDS = ("more often", "more", "多吃", "green")


class MultinomialLogisticRegression:
    def __init__(self, features: list[str], classes: list[str]):
        self.features = features
        self.classes = classes
        self.num_features = len(features)
        self.num_classes = len(classes)
        self.weights: list[list[float]] = []
        self.biases: list[float] = []
        self.reset_weights()

    def reset_weights(self, seed: int | None = None) -> None:
        rng = random.Random(seed) if seed is not None else random
        self.weights = [
            [(rng.random() - 0.5) * 0.1 for _ in range(self.num_features)]
            for _ in range(self.num_classes)
        ]
        self.biases = [0.0 for _ in range(self.num_classes)]

    @staticmethod
    def find_more_often_index(class_names: list[str]) -> int | None:
        for idx, name in enumerate(class_names):
            lower = name.lower()
            if any(keyword in lower for keyword in MORE_OFTEN_KEYWORDS):
                return idx
        return None

    @staticmethod
    def _resolve_class_weight_mode(config: dict[str, Any]) -> str:
        mode = config.get("classWeightMode")
        if mode in {"off", "mild", "strong"}:
            return mode
        if config.get("useClassWeights") is False:
            return "off"
        return "mild"

    @staticmethod
    def _softmax(logits: list[float]) -> list[float]:
        max_logit = max(logits)
        exps = [math.exp(logit - max_logit) for logit in logits]
        total = sum(exps) or 1.0
        return [value / total for value in exps]

    @staticmethod
    def _apply_more_often_threshold(
        probs: list[float],
        more_often_idx: int | None,
        threshold: float,
    ) -> int:
        pred_idx = probs.index(max(probs))
        if more_often_idx is None or threshold <= 0:
            return pred_idx

        # 提升：概率达到门槛即判为「多吃」（解决 argmax 从不选第三类的零召回）
        if probs[more_often_idx] >= threshold:
            return more_often_idx

        # 抑制：argmax 为「多吃」但概率不足时，降为次优类
        if pred_idx == more_often_idx:
            alternatives = [
                (idx, prob)
                for idx, prob in enumerate(probs)
                if idx != more_often_idx
            ]
            return max(alternatives, key=lambda item: item[1])[0]

        return pred_idx

    def train(
        self,
        train_x: list[dict[str, Any]],
        train_y: list[int],
        config: dict[str, Any],
        on_epoch_end: Callable[[dict[str, float]], None] | None = None,
    ) -> list[dict[str, float]]:
        train_seed = int(config.get("randomSeed", 42))
        penalty = config["penalty"]
        lambda_value = float(config["lambda"])
        learning_rate = float(config["learningRate"])
        epochs = int(config["epochs"])
        batch_size = int(config["batchSize"])
        weight_mode = self._resolve_class_weight_mode(config)
        class_weights = config.get("classWeights")
        if class_weights:
            class_weights = [float(value) for value in class_weights]
        else:
            class_weights = compute_class_weights(train_y, self.num_classes, weight_mode)

        self.reset_weights(seed=train_seed)
        logs: list[dict[str, float]] = []
        rng = random.Random(train_seed)

        x_arr = [
            [float(item.get(feature, 0) or 0) for feature in self.features]
            for item in train_x
        ]
        y_onehot = []
        for value in train_y:
            one_hot = [0.0] * self.num_classes
            one_hot[value] = 1.0
            y_onehot.append(one_hot)

        n = len(train_x)
        for epoch in range(1, epochs + 1):
            epoch_loss = 0.0
            correct_count = 0
            indices = list(range(n))
            rng.shuffle(indices)

            for batch_start in range(0, n, batch_size):
                batch_end = min(batch_start + batch_size, n)
                current_batch_size = batch_end - batch_start
                grad_w = [[0.0] * self.num_features for _ in range(self.num_classes)]
                grad_b = [0.0] * self.num_classes

                for index in indices[batch_start:batch_end]:
                    x = x_arr[index]
                    y = y_onehot[index]

                    logits = []
                    for class_idx in range(self.num_classes):
                        logit = self.biases[class_idx]
                        for feature_idx, feature_value in enumerate(x):
                            logit += self.weights[class_idx][feature_idx] * feature_value
                        logits.append(logit)

                    probs = self._softmax(logits)
                    pred_idx = probs.index(max(probs))
                    sample_weight = class_weights[train_y[index]]
                    if pred_idx == train_y[index]:
                        correct_count += 1
                    epoch_loss -= sample_weight * math.log(
                        max(probs[train_y[index]], 1e-15)
                    )

                    for class_idx in range(self.num_classes):
                        error = (probs[class_idx] - y[class_idx]) * sample_weight
                        grad_b[class_idx] += error
                        for feature_idx, feature_value in enumerate(x):
                            grad_w[class_idx][feature_idx] += error * feature_value

                for class_idx in range(self.num_classes):
                    db = grad_b[class_idx] / current_batch_size
                    self.biases[class_idx] -= learning_rate * db
                    for feature_idx in range(self.num_features):
                        dw = grad_w[class_idx][feature_idx] / current_batch_size
                        if penalty == "l2":
                            self.weights[class_idx][feature_idx] -= learning_rate * (
                                dw + lambda_value * self.weights[class_idx][feature_idx]
                            )
                        else:
                            weight = self.weights[class_idx][feature_idx] - learning_rate * dw
                            threshold = learning_rate * lambda_value
                            if weight > threshold:
                                weight -= threshold
                            elif weight < -threshold:
                                weight += threshold
                            else:
                                weight = 0.0
                            self.weights[class_idx][feature_idx] = weight

            penalty_loss = 0.0
            for class_idx in range(self.num_classes):
                for feature_idx in range(self.num_features):
                    weight = self.weights[class_idx][feature_idx]
                    if penalty == "l2":
                        penalty_loss += 0.5 * lambda_value * weight * weight
                    else:
                        penalty_loss += lambda_value * abs(weight)

            log_item = {
                "epoch": epoch,
                "loss": (epoch_loss / n) + penalty_loss,
                "accuracy": correct_count / n,
            }
            logs.append(log_item)
            if on_epoch_end:
                on_epoch_end(log_item)

        return logs

    def predict_probs(self, data: list[dict[str, Any]]) -> list[list[float]]:
        results: list[list[float]] = []
        for item in data:
            logits = []
            for class_idx in range(self.num_classes):
                logit = self.biases[class_idx]
                for feature_idx, feature in enumerate(self.features):
                    value = float(item.get(feature, 0) or 0)
                    logit += self.weights[class_idx][feature_idx] * value
                logits.append(logit)
            results.append(self._softmax(logits))
        return results

    def predict(
        self,
        data: list[dict[str, Any]],
        more_often_threshold: float = 0.0,
        more_often_idx: int | None = None,
    ) -> list[int]:
        if more_often_idx is None:
            more_often_idx = self.find_more_often_index(self.classes)
        return [
            self._apply_more_often_threshold(probs, more_often_idx, more_often_threshold)
            for probs in self.predict_probs(data)
        ]

    def calibrate_more_often_threshold(
        self,
        data: list[dict[str, Any]],
        labels: list[int],
        more_often_idx: int | None = None,
        min_more_often_precision: float = 0.40,
    ) -> float:
        if more_often_idx is None:
            more_often_idx = self.find_more_often_index(self.classes)
        if more_often_idx is None or not data:
            return 0.0

        probs_list = self.predict_probs(data)
        total = len(labels) or 1
        candidates: list[tuple[float, float, float, float, float]] = []

        for step in range(0, 81):
            threshold = step / 100.0
            predictions = [
                self._apply_more_often_threshold(probs, more_often_idx, threshold)
                for probs in probs_list
            ]
            evaluation = evaluate_model(labels, predictions, self.classes)
            more_perf = evaluation["classPerformance"][more_often_idx]
            pred_rate = sum(1 for pred in predictions if pred == more_often_idx) / total
            score = self._calibration_score(
                evaluation["macroF1"],
                more_perf["precision"],
                more_perf["recall"],
                min_more_often_precision,
                pred_rate,
            )
            candidates.append(
                (
                    threshold,
                    score,
                    more_perf["precision"],
                    more_perf["recall"],
                    pred_rate,
                )
            )

        valid = [
            item
            for item in candidates
            if item[2] >= min_more_often_precision
            and 0.12 <= item[3] <= 0.85
            and item[4] <= 0.22
        ]
        if not valid:
            valid = [item for item in candidates if item[3] > 0 and item[4] <= 0.35]
        pool = valid if valid else candidates
        best = max(pool, key=lambda item: (item[1], item[2], item[3]))
        return round(best[0], 2)

    @staticmethod
    def _calibration_score(
        macro_f1: float,
        more_precision: float,
        more_recall: float,
        min_precision: float,
        pred_rate: float,
    ) -> float:
        over_rate_penalty = max(0.0, pred_rate - 0.18) * 2.5
        if more_precision >= min_precision:
            return (
                macro_f1
                + 0.25 * more_precision
                + 0.08 * more_recall
                - over_rate_penalty
            )
        return (
            macro_f1 * 0.45
            + more_precision * 0.45
            + more_recall * 0.10
            - over_rate_penalty
        )

    def get_coefficients(self, class_names: list[str]) -> list[dict[str, Any]]:
        coefficients: list[dict[str, Any]] = []
        for class_idx, class_weights in enumerate(self.weights):
            feature_weights = [
                {"feature": self.features[feature_idx], "weight": round(weight, 4)}
                for feature_idx, weight in enumerate(class_weights)
            ]
            feature_weights.sort(key=lambda item: abs(item["weight"]), reverse=True)
            coefficients.append(
                {
                    "className": class_names[class_idx],
                    "coefficients": feature_weights,
                    "intercept": round(self.biases[class_idx], 4),
                }
            )
        return coefficients

    def to_dict(self) -> dict[str, Any]:
        return {
            "features": self.features,
            "classes": self.classes,
            "weights": self.weights,
            "biases": self.biases,
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "MultinomialLogisticRegression":
        model = cls(payload["features"], payload["classes"])
        model.weights = payload["weights"]
        model.biases = payload["biases"]
        return model
