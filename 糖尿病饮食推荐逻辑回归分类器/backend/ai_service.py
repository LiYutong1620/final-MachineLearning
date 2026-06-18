from __future__ import annotations

import hashlib
import json
import os
from typing import Any

import httpx

# 糖尿病关注的核心营养指标（减少 prompt 体积，加快 API 响应）
KEY_METRICS = [
    "Calories",
    "Sugars",
    "Total Fat",
    "Saturated Fat",
    "Sodium",
    "Dietary Fiber",
    "Protein",
    "Cholesterol",
    "Total Carbohydrate",
]

_advice_cache: dict[str, str] = {}
_MAX_CACHE = 64
_http_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(60.0, connect=20.0),
            limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
        )
    return _http_client


def _reset_http_client() -> httpx.AsyncClient:
    global _http_client
    _http_client = None
    return get_http_client()


def _pick_metrics(metrics: dict[str, float]) -> dict[str, float]:
    picked: dict[str, float] = {}
    for key in KEY_METRICS:
        if key in metrics:
            picked[key] = metrics[key]
    if not picked:
        picked = dict(list(metrics.items())[:8])
    return picked


def _cache_key(food_name: str, model_class: str, metrics: dict[str, float]) -> str:
    payload = json.dumps(
        {"food": food_name, "class": model_class, "metrics": metrics},
        ensure_ascii=False,
        sort_keys=True,
    )
    return hashlib.md5(payload.encode("utf-8")).hexdigest()


def build_prompt(
    food_name: str,
    model_class: str,
    penalty_type: str,
    metrics: dict[str, float],
) -> str:
    compact = _pick_metrics(metrics)
    metrics_str = "\n".join(f"- {k}: {v}" for k, v in compact.items())
    return (
        f"你是糖尿病营养专家。食品《{food_name}》经 L1/L2 逻辑回归模型判定为「{model_class}」。"
        f"核心营养指标：\n{metrics_str}\n\n"
        "请用 Markdown 输出（150字内）：\n"
        "1. 分类理由\n2. 对糖尿病患者利弊\n3. 食用建议"
    )


async def _call_deepseek(client: httpx.AsyncClient, model: str, prompt: str) -> str:
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            response = await client.post(
                "https://api.deepseek.com/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {os.getenv('DEEPSEEK_API_KEY')}",
                },
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.3,
                    "max_tokens": 220,
                    "stream": False,
                },
            )
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"]
        except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.ConnectError) as exc:
            last_error = exc
            client = _reset_http_client()
            if attempt < 2:
                import asyncio
                await asyncio.sleep(1.5 * (attempt + 1))
                continue
            raise last_error from exc
    raise RuntimeError("DeepSeek request failed")


async def generate_advice(
    food_name: str,
    model_class: str,
    penalty_type: str,
    metrics: dict[str, float],
) -> dict[str, Any]:
    compact = _pick_metrics(metrics)
    cache_id = _cache_key(food_name, model_class, compact)
    if cache_id in _advice_cache:
        return {
            "advice": _advice_cache[cache_id],
            "provider": "Cache",
            "model": "memory",
            "cached": True,
        }

    prompt = build_prompt(food_name, model_class, penalty_type, compact)
    client = get_http_client()

    try:
        if os.getenv("DEEPSEEK_API_KEY"):
            preferred = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
            try:
                advice = await _call_deepseek(client, preferred, prompt)
                model = preferred
            except httpx.HTTPStatusError:
                # 模型名无效或限流时，自动回退到官方 fast 模型
                advice = await _call_deepseek(client, "deepseek-chat", prompt)
                model = "deepseek-chat"
            result = {"advice": advice, "provider": "DeepSeek", "model": model, "cached": False}
        else:
            gemini_key = os.getenv("GEMINI_API_KEY")
            if not gemini_key:
                raise ValueError("Missing both DEEPSEEK_API_KEY and GEMINI_API_KEY")
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={gemini_key}",
                json={"contents": [{"parts": [{"text": prompt}]}]},
            )
            response.raise_for_status()
            advice = response.json()["candidates"][0]["content"]["parts"][0]["text"]
            result = {"advice": advice, "provider": "Gemini", "model": "gemini-2.0-flash", "cached": False}
    except Exception as exc:
        return {
            "advice": (
                f"**本地模型分类已完成。**\n\n"
                f"AI 详细报告暂时无法生成（{exc.__class__.__name__}），"
                f"请优先参考上方「适量/多吃/少吃」判定结果。"
            ),
            "provider": "Local",
            "model": "fallback",
            "cached": False,
            "degraded": True,
        }

    if len(_advice_cache) >= _MAX_CACHE:
        _advice_cache.pop(next(iter(_advice_cache)))
    _advice_cache[cache_id] = result["advice"] or ""
    return result
