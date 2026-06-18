from __future__ import annotations

import math
import random
from typing import Any


def is_numeric(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return not (isinstance(value, float) and math.isnan(value))
    text = str(value).strip()
    if not text:
        return False
    try:
        float(text)
        return True
    except ValueError:
        return False


class MinMaxScaler:
    def __init__(self, features: list[str]):
        self.features = features
        self.min_vals: dict[str, float] = {}
        self.max_vals: dict[str, float] = {}

    def fit(self, data: list[dict[str, Any]]) -> None:
        for feature in self.features:
            minimum = float("inf")
            maximum = float("-inf")
            for row in data:
                value = row.get(feature)
                if is_numeric(value):
                    number = float(value)
                    minimum = min(minimum, number)
                    maximum = max(maximum, number)
            if minimum == float("inf"):
                minimum = 0.0
            if maximum == float("-inf"):
                maximum = 1.0
            if minimum == maximum:
                maximum = minimum + 1.0
            self.min_vals[feature] = minimum
            self.max_vals[feature] = maximum

    def transform(self, data: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [self._transform_row(dict(row)) for row in data]

    def transform_single(self, item: dict[str, float]) -> dict[str, float]:
        return self._transform_row(item)

    def get_limits(self, feature: str) -> dict[str, float]:
        return {
            "min": self.min_vals.get(feature, 0.0),
            "max": self.max_vals.get(feature, 1.0),
        }

    def to_dict(self) -> dict[str, Any]:
        return {
            "features": self.features,
            "min_vals": self.min_vals,
            "max_vals": self.max_vals,
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "MinMaxScaler":
        scaler = cls(payload["features"])
        scaler.min_vals = {k: float(v) for k, v in payload["min_vals"].items()}
        scaler.max_vals = {k: float(v) for k, v in payload["max_vals"].items()}
        return scaler

    def _transform_row(self, row: dict[str, Any]) -> dict[str, Any]:
        new_row = dict(row)
        for feature in self.features:
            value = row.get(feature)
            if is_numeric(value):
                minimum = self.min_vals[feature]
                maximum = self.max_vals[feature]
                new_row[feature] = (float(value) - minimum) / (maximum - minimum)
            else:
                new_row[feature] = 0.0
        return new_row


class LabelEncoder:
    def __init__(self) -> None:
        self.label_to_idx: dict[str, int] = {}
        self.idx_to_label: dict[int, str] = {}
        self.unique_labels: list[str] = []

    def fit(self, labels: list[str]) -> None:
        raw_unique = sorted(
            {
                str(label)
                for label in labels
                if label is not None and str(label).strip() != ""
            }
        )
        self.unique_labels = raw_unique
        self.label_to_idx = {label: idx for idx, label in enumerate(raw_unique)}
        self.idx_to_label = {idx: label for label, idx in self.label_to_idx.items()}

    def transform(self, labels: list[str]) -> list[int]:
        return [self.label_to_idx.get(label, 0) for label in labels]

    def get_classes(self) -> list[str]:
        return self.unique_labels

    def to_dict(self) -> dict[str, Any]:
        return {
            "label_to_idx": self.label_to_idx,
            "unique_labels": self.unique_labels,
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "LabelEncoder":
        encoder = cls()
        encoder.unique_labels = payload["unique_labels"]
        encoder.label_to_idx = payload["label_to_idx"]
        encoder.idx_to_label = {
            idx: label for label, idx in encoder.label_to_idx.items()
        }
        return encoder


def stratified_split(
    data: list[dict[str, Any]],
    target_column: str,
    train_ratio: float = 0.8,
    seed: int = 42,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    rng = random.Random(seed)
    grouped: dict[str, list[dict[str, Any]]] = {}
    for item in data:
        label = str(item[target_column])
        grouped.setdefault(label, []).append(item)

    train: list[dict[str, Any]] = []
    test: list[dict[str, Any]] = []

    for items in grouped.values():
        shuffled = items[:]
        rng.shuffle(shuffled)
        train_count = max(1, round(len(shuffled) * train_ratio))
        train.extend(shuffled[:train_count])
        test.extend(shuffled[train_count:])

    rng.shuffle(train)
    rng.shuffle(test)
    return train, test


def detect_numeric_features(
    data: list[dict[str, Any]],
    headers: list[str],
    target_column: str,
    name_column: str,
) -> list[str]:
    numeric_features: list[str] = []
    sample = data[: min(50, len(data))]

    for column in headers:
        if column in {target_column, name_column} or column.lower() == "id":
            continue
        parsable = sum(
            1 for row in sample if is_numeric(row.get(column))
        )
        if sample and parsable / len(sample) >= 0.8:
            numeric_features.append(column)
    return numeric_features


def compute_balanced_class_weights(labels: list[int], num_classes: int) -> list[float]:
    """Inverse-frequency weights (strong / sklearn balanced)."""
    return compute_class_weights(labels, num_classes, mode="strong")


def compute_class_weights(
    labels: list[int],
    num_classes: int,
    mode: str = "mild",
) -> list[float]:
    """
    Class weight modes (linear blend toward inverse frequency):
    - off: uniform
    - mild: alpha=0.52 — 兼顾少数类召回与精确率
    - strong: alpha=1.0 — full sklearn balanced weights
    """
    mode_alpha = {"off": 0.0, "mild": 0.52, "strong": 1.0}
    alpha = mode_alpha.get(mode, 0.32)
    if alpha <= 0:
        return [1.0] * num_classes

    counts = [0] * num_classes
    for label in labels:
        counts[label] += 1
    total = len(labels) or 1

    raw: list[float] = []
    for count in counts:
        if count <= 0:
            raw.append(1.0)
            continue
        balanced = total / (num_classes * count)
        raw.append(1.0 + alpha * (balanced - 1.0))

    mean_weight = sum(raw) / (num_classes or 1)
    if mean_weight <= 0:
        return [1.0] * num_classes
    return [value / mean_weight for value in raw]


def stratified_holdout_indices(
    labels: list[int],
    holdout_ratio: float = 0.15,
    seed: int = 42,
) -> tuple[list[int], list[int]]:
    """Split indices into fit / calibration holdout (stratified)."""
    rng = random.Random(seed)
    by_class: dict[int, list[int]] = {}
    for idx, label in enumerate(labels):
        by_class.setdefault(label, []).append(idx)

    fit_indices: list[int] = []
    calib_indices: list[int] = []
    for indices in by_class.values():
        shuffled = indices[:]
        rng.shuffle(shuffled)
        n_cal = max(1, int(round(len(shuffled) * holdout_ratio)))
        if len(shuffled) - n_cal < 1:
            n_cal = max(0, len(shuffled) - 1)
        calib_indices.extend(shuffled[:n_cal])
        fit_indices.extend(shuffled[n_cal:])

    rng.shuffle(fit_indices)
    rng.shuffle(calib_indices)
    return fit_indices, calib_indices
