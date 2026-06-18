from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from ml.dataset import load_food_dataset
from ml.evaluation import evaluate_model
from ml.model import MultinomialLogisticRegression
from ml.preprocessing import (
    LabelEncoder,
    MinMaxScaler,
    detect_numeric_features,
    stratified_holdout_indices,
    stratified_split,
)
from ml.persistence import load_all_saved, save_trained_model, update_saved_metrics
from ml.metrics_refresh import (
    ML_PIPELINE_VERSION,
    evaluate_on_stratified_test,
    needs_evaluation_refresh,
    verify_threshold_promotion_pipeline,
)
from ai_service import generate_advice

ROOT_DIR = Path(__file__).resolve().parent
load_dotenv(ROOT_DIR / ".env")

app = FastAPI(title="糖尿病饮食推荐逻辑回归 API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

LOGS_JSON_PATH = ROOT_DIR / "model_logs.json"
LOGS_TXT_PATH = ROOT_DIR / "model_logs.txt"

_dataset_cache: dict[str, Any] = {}
_models: dict[str, MultinomialLogisticRegression] = {}
_scalers: dict[str, MinMaxScaler] = {}
_encoders: dict[str, LabelEncoder] = {}
_model_meta: dict[str, dict[str, Any]] = {}


def _register_saved_model(penalty: str, payload: dict[str, Any]) -> None:
    runtime = payload["_runtime"]
    _models[penalty] = runtime["model"]
    _scalers[penalty] = runtime["scaler"]
    _encoders[penalty] = runtime["encoder"]
    _model_meta[penalty] = {
        "trained_at": payload.get("trained_at"),
        "config": payload.get("config"),
        "evaluation": payload.get("evaluation"),
        "coefficients": payload.get("coefficients"),
        "persisted": True,
    }


def _bootstrap_saved_models() -> None:
    for penalty, payload in load_all_saved().items():
        _register_saved_model(penalty, payload)


_bootstrap_saved_models()


def _refresh_model_evaluation(penalty: str) -> bool:
    dataset = _dataset_cache
    meta = _model_meta.get(penalty)
    model = _models.get(penalty)
    scaler = _scalers.get(penalty)
    encoder = _encoders.get(penalty)
    if not dataset or not meta or model is None or scaler is None or encoder is None:
        return False

    config = dict(meta.get("config") or {})
    evaluation = meta.get("evaluation")
    if not needs_evaluation_refresh(config, evaluation):
        return False

    refreshed = evaluate_on_stratified_test(model, scaler, encoder, dataset, config)
    config["pipelineVersion"] = ML_PIPELINE_VERSION
    meta["evaluation"] = refreshed
    meta["config"] = config
    update_saved_metrics(penalty, refreshed, config)
    return True


def _refresh_all_evaluations() -> int:
    count = 0
    for penalty in ("l1", "l2"):
        if _refresh_model_evaluation(penalty):
            count += 1
    return count


def _finalize_more_often_threshold(
    model: MultinomialLogisticRegression,
    scaled_calib: list[dict[str, Any]],
    calib_y: list[int],
    scaled_test: list[dict[str, Any]],
    test_y: list[int],
    class_names: list[str],
    threshold: float,
) -> tuple[float, dict[str, Any]]:
    more_idx = MultinomialLogisticRegression.find_more_often_index(class_names)
    if more_idx is None or threshold <= 0:
        test_pred = model.predict(scaled_test, more_often_threshold=threshold)
        return threshold, evaluate_model(test_y, test_pred, class_names)

    verify_threshold_promotion_pipeline()
    test_pred = model.predict(
        scaled_test,
        more_often_threshold=threshold,
        more_often_idx=more_idx,
    )
    evaluation = evaluate_model(test_y, test_pred, class_names)
    if evaluation["classPerformance"][more_idx]["recall"] > 0:
        return threshold, evaluation

    best_threshold = threshold
    best_evaluation = evaluation
    for step in range(int(threshold * 100), -1, -1):
        candidate = step / 100.0
        candidate_pred = model.predict(
            scaled_test,
            more_often_threshold=candidate,
            more_often_idx=more_idx,
        )
        candidate_eval = evaluate_model(test_y, candidate_pred, class_names)
        if candidate_eval["classPerformance"][more_idx]["recall"] > 0:
            best_threshold = candidate
            best_evaluation = candidate_eval
            break
    return best_threshold, best_evaluation


@app.on_event("startup")
async def startup_pipeline_check() -> None:
    verify_threshold_promotion_pipeline()
    try:
        if not _dataset_cache:
            headers, data, _ = await load_food_dataset()
            target_column, name_column = _detect_columns(headers)
            numeric_features = detect_numeric_features(
                data, headers, target_column, name_column
            )
            _dataset_cache.update(
                {
                    "headers": headers,
                    "data": data,
                    "targetColumn": target_column,
                    "nameColumn": name_column,
                    "numericFeatures": numeric_features,
                    "featureLimits": {},
                    "classes": [],
                }
            )
        _refresh_all_evaluations()
    except Exception:
        pass


class ModelConfig(BaseModel):
    penalty: Literal["l1", "l2"]
    lambda_: float = Field(alias="lambda", default=0.006)
    learningRate: float = 0.05
    epochs: int = 160
    batchSize: int = 16
    trainRatio: float = 0.8
    useClassWeights: bool = True
    classWeightMode: Literal["off", "mild", "strong"] = "mild"
    autoCalibrateThreshold: bool = True
    moreOftenThreshold: float | None = None

    model_config = {"populate_by_name": True}


def _resolve_prediction_threshold(
    config: ModelConfig,
    model: MultinomialLogisticRegression,
    scaled_calib: list[dict[str, Any]],
    calib_y: list[int],
    class_names: list[str],
) -> float:
    more_idx = MultinomialLogisticRegression.find_more_often_index(class_names)
    if more_idx is None:
        return 0.0
    if config.autoCalibrateThreshold:
        return model.calibrate_more_often_threshold(scaled_calib, calib_y, more_idx)
    if config.moreOftenThreshold is not None:
        return float(config.moreOftenThreshold)
    return 0.0


def _pick_recommended_penalty(status: dict[str, Any]) -> str | None:
    l1 = status.get("l1", {})
    l2 = status.get("l2", {})
    if not l1.get("ready") and not l2.get("ready"):
        return None
    if l1.get("ready") and not l2.get("ready"):
        return "l1"
    if l2.get("ready") and not l1.get("ready"):
        return "l2"
    l1_f1 = (l1.get("evaluation") or {}).get("macroF1", 0)
    l2_f1 = (l2.get("evaluation") or {}).get("macroF1", 0)
    if l1_f1 != l2_f1:
        return "l1" if l1_f1 > l2_f1 else "l2"
    l1_acc = (l1.get("evaluation") or {}).get("accuracy", 0)
    l2_acc = (l2.get("evaluation") or {}).get("accuracy", 0)
    if l1_acc != l2_acc:
        return "l1" if l1_acc > l2_acc else "l2"
    return "l1"


class PredictRequest(BaseModel):
    penalty: Literal["l1", "l2"]
    foodName: str = "自定义食品"
    metrics: dict[str, float]


class RecommendRequest(BaseModel):
    foodName: str = "未知食品"
    metrics: dict[str, float]
    modelClass: str = "适量"
    penaltyType: str = "l1"


class SaveLogRequest(BaseModel):
    eventType: str
    payload: dict[str, Any]


def _ensure_dataset() -> dict[str, Any]:
    if not _dataset_cache:
        raise HTTPException(status_code=400, detail="数据集尚未加载，请先访问 /api/food-data")
    return _dataset_cache


def _detect_columns(headers: list[str]) -> tuple[str, str]:
    target = next((h for h in headers if h.lower() == "class"), "class")
    name = next(
        (
            h
            for h in headers
            if h.lower() in {"title", "name", "food"}
        ),
        "title",
    )
    return target, name


def _cn_translate_label(raw_name: str) -> str:
    if raw_name == "In Moderation":
        return "适度推荐 (In Moderation)"
    if raw_name == "Less Often":
        return "减少摄入 (Less Often)"
    if raw_name == "More Often":
        return "推荐食用 (More Often)"
    return raw_name


@app.get("/api/health")
async def health() -> dict[str, Any]:
    verify_threshold_promotion_pipeline()
    return {
        "status": "ok",
        "service": "python-ml-backend",
        "pipelineVersion": ML_PIPELINE_VERSION,
        "thresholdPromotion": True,
    }


@app.get("/api/model-status")
async def model_status() -> dict[str, Any]:
    if _dataset_cache:
        _refresh_all_evaluations()
    status: dict[str, Any] = {}
    for penalty in ("l1", "l2"):
        meta = _model_meta.get(penalty)
        if meta and penalty in _models:
            status[penalty] = {
                "ready": True,
                "trained_at": meta.get("trained_at"),
                "persisted": meta.get("persisted", False),
                "evaluation": meta.get("evaluation"),
                "coefficients": meta.get("coefficients"),
                "config": meta.get("config"),
            }
        else:
            status[penalty] = {"ready": False}
    recommended = _pick_recommended_penalty(status)
    return {
        "success": True,
        "has_trained": any(item.get("ready") for item in status.values()),
        "recommended_penalty": recommended,
        "pipelineVersion": ML_PIPELINE_VERSION,
        "models": status,
    }


@app.get("/api/food-data")
async def food_data(reload: bool = False) -> dict[str, Any]:
    try:
        headers, data, source = await load_food_dataset(force_reload=reload)
        target_column, name_column = _detect_columns(headers)
        numeric_features = detect_numeric_features(
            data, headers, target_column, name_column
        )

        feature_limits = {}
        for feature in numeric_features:
            minimum = float("inf")
            maximum = float("-inf")
            for row in data:
                value = row.get(feature)
                if value is not None:
                    try:
                        number = float(value)
                    except (TypeError, ValueError):
                        continue
                    minimum = min(minimum, number)
                    maximum = max(maximum, number)
            feature_limits[feature] = {
                "min": 0 if minimum == float("inf") else minimum,
                "max": 100 if maximum == float("-inf") else maximum,
            }

        encoder = LabelEncoder()
        encoder.fit([str(row[target_column]) for row in data])

        _dataset_cache.clear()
        _dataset_cache.update(
            {
                "headers": headers,
                "data": data,
                "targetColumn": target_column,
                "nameColumn": name_column,
                "numericFeatures": numeric_features,
                "featureLimits": feature_limits,
                "classes": encoder.get_classes(),
            }
        )

        return {
            "success": True,
            "headers": headers,
            "data": data,
            "source": source,
            "targetColumn": target_column,
            "nameColumn": name_column,
            "numericFeatures": numeric_features,
            "featureLimits": feature_limits,
            "classes": encoder.get_classes(),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    finally:
        if _dataset_cache:
            _refresh_all_evaluations()


@app.post("/api/train")
async def train_model(config: ModelConfig) -> dict[str, Any]:
    dataset = _ensure_dataset()
    data = dataset["data"]
    target_column = dataset["targetColumn"]
    numeric_features = dataset["numericFeatures"]

    train, test = stratified_split(data, target_column, config.trainRatio)

    scaler = MinMaxScaler(numeric_features)
    scaler.fit(train)
    scaled_train = scaler.transform(train)
    scaled_test = scaler.transform(test)

    train_labels = [str(row[target_column]) for row in train]
    test_labels = [str(row[target_column]) for row in test]

    encoder = LabelEncoder()
    encoder.fit(train_labels)
    train_y = encoder.transform(train_labels)
    test_y = encoder.transform(test_labels)
    class_names = encoder.get_classes()

    fit_idx, cal_idx = stratified_holdout_indices(train_y, holdout_ratio=0.15)
    scaled_calib = [scaled_train[i] for i in cal_idx]
    calib_y = [train_y[i] for i in cal_idx]

    model = MultinomialLogisticRegression(numeric_features, class_names)
    train_payload = config.model_dump(by_alias=True)
    train_payload["randomSeed"] = 42
    # 用全部训练集拟合权重；校准集仅用于搜索「多吃」概率门槛
    training_logs = model.train(
        scaled_train,
        train_y,
        train_payload,
    )

    more_often_threshold = _resolve_prediction_threshold(
        config, model, scaled_calib, calib_y, class_names
    )
    more_often_threshold, evaluation = _finalize_more_often_threshold(
        model,
        scaled_calib,
        calib_y,
        scaled_test,
        test_y,
        class_names,
        more_often_threshold,
    )
    train_payload["moreOftenThreshold"] = more_often_threshold
    train_payload["pipelineVersion"] = ML_PIPELINE_VERSION
    train_payload["classWeightMode"] = (
        config.classWeightMode
        if config.classWeightMode
        else ("off" if not config.useClassWeights else "mild")
    )

    coefficients = model.get_coefficients(class_names)

    penalty = config.penalty
    _models[penalty] = model
    _scalers[penalty] = scaler
    _encoders[penalty] = encoder

    trained_at = save_trained_model(
        penalty,
        model,
        scaler,
        encoder,
        evaluation,
        coefficients,
        train_payload,
    )
    _model_meta[penalty] = {
        "trained_at": trained_at,
        "config": train_payload,
        "evaluation": evaluation,
        "coefficients": coefficients,
        "persisted": True,
    }

    return {
        "success": True,
        "penalty": penalty,
        "trainingLogs": training_logs,
        "evaluation": evaluation,
        "coefficients": coefficients,
        "moreOftenThreshold": more_often_threshold,
        "classWeightMode": train_payload["classWeightMode"],
        "featureLimits": dataset["featureLimits"],
        "classes": class_names,
        "numericFeatures": numeric_features,
    }


@app.post("/api/predict")
async def predict_food(request: PredictRequest) -> dict[str, Any]:
    model = _models.get(request.penalty)
    scaler = _scalers.get(request.penalty)
    encoder = _encoders.get(request.penalty)

    if model is None or scaler is None or encoder is None:
        raise HTTPException(
            status_code=400,
            detail=f"请先训练 {request.penalty.upper()} 模型后再进行预测",
        )

    scaled = scaler.transform_single(request.metrics)
    meta = _model_meta.get(request.penalty, {})
    saved_config = meta.get("config") or {}
    more_often_threshold = float(saved_config.get("moreOftenThreshold") or 0.0)
    probs = model.predict_probs([scaled])[0]
    pred_idx = model.predict(
        [scaled],
        more_often_threshold=more_often_threshold,
    )[0]
    classes = encoder.get_classes()

    return {
        "success": True,
        "predictedLabel": classes[pred_idx],
        "probabilities": probs,
        "classes": classes,
        "moreOftenThreshold": more_often_threshold,
        "confidence": probs[pred_idx],
        "argmaxLabel": classes[probs.index(max(probs))],
        "usedThresholdGate": (
            more_often_threshold > 0
            and classes[pred_idx] != classes[probs.index(max(probs))]
        ),
    }


@app.post("/api/gemini-recommend")
async def gemini_recommend(request: RecommendRequest) -> dict[str, Any]:
    try:
        result = await generate_advice(
            request.foodName,
            request.modelClass,
            request.penaltyType,
            request.metrics,
        )
        return {
            "success": True,
            "advice": result["advice"] or "暂无 AI 推荐详情",
            "provider": result["provider"],
            "model": result["model"],
            "cached": result.get("cached", False),
            "degraded": result.get("degraded", False),
        }
    except ValueError as exc:
        return {
            "success": True,
            "advice": f"AI 服务未配置：{exc}。请参考上方模型分类结果。",
            "provider": "Local",
            "model": "fallback",
            "cached": False,
            "degraded": True,
        }
    except Exception as exc:
        return {
            "success": True,
            "advice": f"AI 服务异常：{exc}。请参考上方模型分类结果。",
            "provider": "Local",
            "model": "fallback",
            "cached": False,
            "degraded": True,
        }


@app.get("/api/logs")
async def get_logs() -> dict[str, Any]:
    try:
        if LOGS_JSON_PATH.exists():
            logs = json.loads(LOGS_JSON_PATH.read_text(encoding="utf-8") or "[]")
        else:
            logs = []
        return {"success": True, "logs": logs}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/clear-logs")
async def clear_logs() -> dict[str, Any]:
    try:
        LOGS_JSON_PATH.write_text("[]", encoding="utf-8")
        LOGS_TXT_PATH.write_text("", encoding="utf-8")
        return {"success": True, "message": "Logs cleared successfully"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/save-logs")
async def save_logs(request: SaveLogRequest) -> dict[str, Any]:
    try:
        timestamp = datetime.utcnow().isoformat()
        log_entry = {
            "timestamp": timestamp,
            "eventType": request.eventType,
            "payload": request.payload,
        }

        logs = []
        if LOGS_JSON_PATH.exists():
            try:
                logs = json.loads(LOGS_JSON_PATH.read_text(encoding="utf-8") or "[]")
            except json.JSONDecodeError:
                logs = []
        logs.append(log_entry)
        LOGS_JSON_PATH.write_text(
            json.dumps(logs, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        txt_entry = _format_log_entry(request.eventType, request.payload, timestamp)
        with LOGS_TXT_PATH.open("a", encoding="utf-8") as handle:
            handle.write(txt_entry)

        return {"success": True, "count": len(logs)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def _format_log_entry(event_type: str, payload: dict[str, Any], timestamp: str) -> str:
    lines = [
        "=" * 70,
        f"⏰ 记录时间: {timestamp}",
        f"⚡ 事件类型: {event_type}",
        "-" * 70,
    ]

    if event_type == "TRAINING_COMPLETED":
        lines.append("📊 逻辑回归训练模型信息 (Model Hyperparameters & Performance):")
        lines.append(
            f"  - 正则惩罚项 (Penalty): {'L1 Lasso' if payload.get('penalty', '').lower() == 'l1' else 'L2 Ridge'}"
        )
        lines.append(f"  - 惩罚系数强度 (lambda): {payload.get('lambda')}")
        lines.append(f"  - 学习率梯度 (Learning Rate): {payload.get('learningRate')}")
        lines.append(f"  - 训练轮轮次 (Epochs): {payload.get('epochs')}")
        lines.append(f"  - 训练批次 (Batch Size): {payload.get('batchSize')}")
        lines.append(f"  - 训练分割比例 (Train Ratio): {payload.get('trainRatio')}")
        weight_mode = payload.get("classWeightMode")
        if not weight_mode:
            weight_mode = "off" if payload.get("useClassWeights") is False else "mild"
        mode_label = {"off": "关闭", "mild": "温和 (sqrt)", "strong": "标准 (逆频率)"}.get(
            weight_mode, weight_mode
        )
        lines.append(f"  - 类别权重模式 (Class Weights): {mode_label}")
        threshold = payload.get("moreOftenThreshold")
        if threshold:
            lines.append(f"  - 「多吃」预测阈值 (More Often Threshold): {threshold}")
        evaluation = payload.get("evaluation", {})
        lines.append("🚀 独立验证集评估绩效 (Evaluation Validation metrics):")
        lines.append(f"  - 验证集准确率 (Test Accuracy): {evaluation.get('accuracy', 0) * 100:.2f}%")
        lines.append(f"  - 加权宏观主 F1-Score: {evaluation.get('macroF1', 0) * 100:.2f}%")
        lines.append(f"  - 宏观精确率 (Precision): {evaluation.get('precision', 0) * 100:.2f}%")
        lines.append(f"  - 宏观召回率 (Recall): {evaluation.get('recall', 0) * 100:.2f}%")

        coefficients = payload.get("coefficients")
        if coefficients:
            lines.append("📐 多分类回归权重与决策偏置 (Decision Boundaries & Feature Weights):")
            for cls_coeff in coefficients:
                lines.append(
                    f"    * 分类 [ {_cn_translate_label(cls_coeff['className'])} ] Intercept (Bias): {cls_coeff['intercept']:.4f}"
                )
                lines.append("      特征系数分布矩阵 (Feature Coefficients):")
                for coeff in cls_coeff["coefficients"]:
                    info = "◀ 已被 L1 套索零化剪枝 (Sparsity)" if coeff["weight"] == 0 else ""
                    sign = "+" if coeff["weight"] >= 0 else ""
                    lines.append(
                        f"        • {coeff['feature']:<16}: {sign}{coeff['weight']:.4f} {info}"
                    )
    elif event_type == "DIAGNOSIS_COMPLETED":
        lines.append(f"🥦 假想待检测食品: 《{payload.get('foodName')}》")
        lines.append("🔢 录入的高维营养分布特征 (Features):")
        for key, value in (payload.get("metrics") or {}).items():
            lines.append(f"    * {key}: {value}")
        lines.append(f"🎯 逻辑回归最终决策判定: [ {payload.get('predictedLabel')} ]")
        lines.append("📈 分类 Softmax 预测概率分布 (Probabilities):")
        for key, value in (payload.get("probabilities") or {}).items():
            lines.append(f"    * Class [ {key} ]: {float(value) * 100:.1f}%")
        if payload.get("aiAdvice"):
            lines.append(f"🤖 AI 临床膳食定制化建议:\n\n{payload['aiAdvice']}")
    else:
        lines.append(json.dumps(payload, ensure_ascii=False, indent=2))

    lines.extend(["=" * 70, ""])
    return "\n".join(lines)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
