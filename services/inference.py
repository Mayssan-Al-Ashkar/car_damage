from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
from ultralytics import YOLO
import re
import json


REPO_ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = REPO_ROOT / "Repair_Cost_Estimation_Based_On_Car_Damage" / "src" / "Model" / "best.pt"
PRICE_MAP_PATH = REPO_ROOT / "Repair_Cost_Estimation_Based_On_Car_Damage" / "src" / "car_damage_price.json"


@lru_cache(maxsize=1)
def load_model() -> YOLO:
    return YOLO(str(MODEL_PATH))


@lru_cache(maxsize=1)
def load_price_map() -> Dict[str, str]:
    with PRICE_MAP_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def parse_price_range_to_min_max(price_str: str) -> Tuple[int, Optional[int], bool]:
    """
    Parse a human-readable range like '150,000 MMK – 500,000 MMK' or '500,000 MMK – 2,500,000+ MMK'
    into (min_value, max_value, has_plus). If '+' is present on the max side, max_value is None.
    """
    # Normalize dashes and remove currency text
    normalized = price_str.replace("MMK", "").replace(",", "").strip()
    normalized = normalized.replace("–", "-").replace("—", "-")
    has_plus = "+" in normalized
    normalized = normalized.replace("+", "")
    parts = [p.strip() for p in normalized.split("-") if p.strip()]
    nums = [int(re.findall(r"\d+", p)[0]) for p in parts if re.findall(r"\d+", p)]
    if not nums:
        return 0, None, has_plus
    if len(nums) == 1:
        # Single value, treat as min with open-ended max
        return nums[0], None, has_plus or True
    return nums[0], nums[1], has_plus


def aggregate_costs_for_classes(detected_classes: List[str], price_map: Dict[str, str]) -> Dict:
    per_class_counts: Dict[str, int] = {}
    for cls in detected_classes:
        per_class_counts[cls] = per_class_counts.get(cls, 0) + 1

    per_class_costs = {}
    total_min = 0
    total_max: Optional[int] = 0
    open_ended = False

    for cls, count in per_class_counts.items():
        if cls not in price_map:
            continue
        min_val, max_val, has_plus = parse_price_range_to_min_max(price_map[cls])
        per_class_costs[cls] = {
            "count": count,
            "range_text": price_map[cls],
            "min_each": min_val,
            "max_each": max_val,
            "open_ended": has_plus or max_val is None,
        }
        total_min += min_val * count
        if max_val is None or has_plus:
            open_ended = True
            total_max = None
        elif total_max is not None:
            total_max += max_val * count

    totals = {
        "min": total_min,
        "max": total_max,
        "open_ended": open_ended,
        "currency": "MMK",
    }

    return {
        "counts": per_class_counts,
        "per_class_costs": per_class_costs,
        "totals": totals,
    }


def detect_from_numpy(image_array: np.ndarray) -> Dict:
    """
    Run detection on a numpy RGB array. Returns classes and an annotated RGB image.
    """
    model = load_model()
    results = model(image_array)
    if not results:
        return {"classes": [], "annotated_image": image_array}
    res = results[0]
    classes = []
    if res.boxes is not None and hasattr(res.boxes, "cls"):
        classes = [res.names[int(cls)] for cls in res.boxes.cls.tolist()]
    # results[0].plot() returns BGR; convert to RGB
    annotated_bgr = res.plot()
    annotated_rgb = annotated_bgr[:, :, ::-1]
    return {"classes": classes, "annotated_image": annotated_rgb}


def compare_before_after(before_img: np.ndarray, after_img: np.ndarray, price_map: Dict[str, str]) -> Dict:
    """
    Detect on both images, compute class count deltas and cost estimate for newly detected damages.
    """
    before = detect_from_numpy(before_img)
    after = detect_from_numpy(after_img)

    # Count classes
    before_counts: Dict[str, int] = {}
    for c in before["classes"]:
        before_counts[c] = before_counts.get(c, 0) + 1
    after_counts: Dict[str, int] = {}
    for c in after["classes"]:
        after_counts[c] = after_counts.get(c, 0) + 1

    # Compute increases (new damages)
    deltas: Dict[str, int] = {}
    for cls in set(before_counts.keys()).union(after_counts.keys()):
        delta = after_counts.get(cls, 0) - before_counts.get(cls, 0)
        if delta > 0:
            deltas[cls] = delta

    # Expand deltas into a list of classes for aggregation
    expanded_new = []
    for cls, n in deltas.items():
        expanded_new.extend([cls] * n)
    cost_summary = aggregate_costs_for_classes(expanded_new, price_map)

    return {
        "before": before,
        "after": after,
        "before_counts": before_counts,
        "after_counts": after_counts,
        "new_damage_counts": deltas,
        "new_damage_costs": cost_summary,
    }


