from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ml.model import MultinomialLogisticRegression
from ml.preprocessing import LabelEncoder, MinMaxScaler

SAVED_DIR = Path(__file__).resolve().parent.parent / "saved_models"


def _path_for(penalty: str) -> Path:
    SAVED_DIR.mkdir(parents=True, exist_ok=True)
    return SAVED_DIR / f"{penalty}.json"


def save_trained_model(
    penalty: str,
    model: MultinomialLogisticRegression,
    scaler: MinMaxScaler,
    encoder: LabelEncoder,
    evaluation: dict[str, Any],
    coefficients: list[dict[str, Any]],
    config: dict[str, Any],
) -> str:
    trained_at = datetime.now(timezone.utc).isoformat()
    payload = {
        "penalty": penalty,
        "trained_at": trained_at,
        "config": config,
        "model": model.to_dict(),
        "scaler": scaler.to_dict(),
        "encoder": encoder.to_dict(),
        "evaluation": evaluation,
        "coefficients": coefficients,
    }
    path = _path_for(penalty)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return trained_at


def update_saved_metrics(
    penalty: str,
    evaluation: dict[str, Any],
    config: dict[str, Any],
) -> None:
    path = _path_for(penalty)
    if not path.exists():
        return
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["evaluation"] = evaluation
    payload["config"] = {**payload.get("config", {}), **config}
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def load_trained_model(penalty: str) -> dict[str, Any] | None:
    path = _path_for(penalty)
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        payload["_runtime"] = {
            "model": MultinomialLogisticRegression.from_dict(payload["model"]),
            "scaler": MinMaxScaler.from_dict(payload["scaler"]),
            "encoder": LabelEncoder.from_dict(payload["encoder"]),
        }
        return payload
    except (json.JSONDecodeError, KeyError, TypeError):
        return None


def load_all_saved() -> dict[str, dict[str, Any]]:
    loaded: dict[str, dict[str, Any]] = {}
    for penalty in ("l1", "l2"):
        item = load_trained_model(penalty)
        if item:
            loaded[penalty] = item
    return loaded
