from __future__ import annotations

from io import StringIO
from typing import Any

import pandas as pd
import httpx

DATASET_URL = (
    "https://cf-courses-data.s3.us.cloud-object-storage.appdomain.cloud/"
    "IBM-ML241EN-SkillsNetwork/labs/datasets/food_items.csv"
)

_cached_dataset: list[dict[str, Any]] | None = None
_cached_headers: list[str] | None = None


async def load_food_dataset(force_reload: bool = False) -> tuple[list[str], list[dict[str, Any]], str]:
    global _cached_dataset, _cached_headers

    if _cached_dataset is not None and _cached_headers is not None and not force_reload:
        return _cached_headers, _cached_dataset, "cache"

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(DATASET_URL)
        response.raise_for_status()
        csv_text = response.text

    frame = pd.read_csv(StringIO(csv_text))
    frame = frame.where(pd.notnull(frame), None)
    records = frame.to_dict(orient="records")
    headers = list(frame.columns)

    _cached_dataset = records
    _cached_headers = headers
    return headers, records, "remote"
