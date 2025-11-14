from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
from ultralytics import YOLO
import cv2
import re
import json
import os


# We are in repo/ml/services/inference.py → repo root is parents[2]
REPO_ROOT = Path(__file__).resolve().parents[2]
# Preferred new locations
NEW_MODEL_PATH = REPO_ROOT / "ml" / "model" / "best.pt"
NEW_PRICE_MAP_PATH = REPO_ROOT / "ml" / "assets" / "car_damage_price.json"
NEW_COST_RULES_PATH = REPO_ROOT / "ml" / "assets" / "cost_rules.json"
# Backward-compatible fallback (old location)
OLD_MODEL_PATH = REPO_ROOT / "Repair_Cost_Estimation_Based_On_Car_Damage" / "src" / "Model" / "best.pt"
OLD_PRICE_MAP_PATH = REPO_ROOT / "Repair_Cost_Estimation_Based_On_Car_Damage" / "src" / "car_damage_price.json"
MODEL_PATH = NEW_MODEL_PATH if NEW_MODEL_PATH.exists() else OLD_MODEL_PATH
PRICE_MAP_PATH = NEW_PRICE_MAP_PATH if NEW_PRICE_MAP_PATH.exists() else OLD_PRICE_MAP_PATH
COST_RULES_PATH = NEW_COST_RULES_PATH


@lru_cache(maxsize=1)
def load_model() -> YOLO:
    return YOLO(str(MODEL_PATH))


@lru_cache(maxsize=1)
def load_price_map() -> Dict[str, str]:
    with PRICE_MAP_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)

@lru_cache(maxsize=1)
def load_cost_rules() -> Optional[Dict[str, dict]]:
    try:
        if COST_RULES_PATH.exists():
            with COST_RULES_PATH.open("r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        return None
    return None

# Normalize model class names → price-map keys
# Add aliases here when model labels differ from configured keys
ALIAS_MAP = {
    "serve": "severe",  # common typo from some models
}

def normalize_class_key(name: str) -> str:
    base = name.strip().lower()
    base = ALIAS_MAP.get(base, base)
    return base


def parse_price_range_to_min_max(price_str: str) -> Tuple[int, Optional[int], bool]:
    """
    Parse a human-readable range like '150,000 MMK – 500,000 MMK' or '500,000 MMK – 2,500,000+ MMK'
    into (min_value, max_value, has_plus). If '+' is present on the max side, max_value is None.
    """
    normalized = price_str.replace("MMK", "").replace(",", "").strip()
    normalized = normalized.replace("–", "-").replace("—", "-")
    has_plus = "+" in normalized
    normalized = normalized.replace("+", "")
    parts = [p.strip() for p in normalized.split("-") if p.strip()]
    nums = [int(re.findall(r"\d+", p)[0]) for p in parts if re.findall(r"\d+", p)]
    if not nums:
        return 0, None, has_plus
    if len(nums) == 1:
        return nums[0], None, has_plus or True
    return nums[0], nums[1], has_plus


def aggregate_costs_for_classes(detected_classes: List[str], price_map: Dict[str, str]) -> Dict:
    # Normalize detected class names
    normalized_classes = [normalize_class_key(c) for c in detected_classes]

    # Count per class
    per_class_counts: Dict[str, int] = {}
    for cls in normalized_classes:
        per_class_counts[cls] = per_class_counts.get(cls, 0) + 1

    # Try exact rule-based estimator (USD)
    rules = load_cost_rules()
    if rules:
        rules_norm = {normalize_class_key(k): v for k, v in rules.items()}
        labor_rate = float(os.environ.get("LABOR_RATE_USD", "95"))
        paint_rate = float(os.environ.get("PAINT_RATE_USD", "120"))
        materials_usd = float(os.environ.get("MATERIALS_USD", "50"))

        per_class_costs: Dict[str, dict] = {}
        total = 0.0
        for cls, count in per_class_counts.items():
            rule = rules_norm.get(cls)
            if not rule:
                continue
            if "per_item_usd" in rule:
                each = float(rule["per_item_usd"])
            else:
                parts = float(rule.get("parts_usd", 0))
                labor_h = float(rule.get("labor_h", 0))
                paint_h = float(rule.get("paint_h", 0))
                each = parts + labor_h * labor_rate + paint_h * paint_rate + materials_usd
            per_class_costs[cls] = {
                "count": count,
                "range_text": f"${each:,.0f} USD each",
                "min_each": each,
                "max_each": each,
                "open_ended": False,
            }
            total += each * count
        totals = {"min": int(round(total)), "max": int(round(total)), "open_ended": False, "currency": "USD"}
        return {"counts": per_class_counts, "per_class_costs": per_class_costs, "totals": totals}

    # Fallback: price ranges (MMK) → USD midpoint using FX
    normalized_price_map = {normalize_class_key(k): v for k, v in price_map.items()}
    fx_mmk_per_usd = float(os.environ.get("FX_MMK_PER_USD", "2100"))

    per_class_costs: Dict[str, dict] = {}
    total_usd = 0.0
    for cls, count in per_class_counts.items():
        if cls not in normalized_price_map:
            continue
        range_text = normalized_price_map[cls]
        min_mmk, max_mmk, _ = parse_price_range_to_min_max(range_text)
        if max_mmk is None:
            max_mmk = min_mmk
        midpoint_mmk = (min_mmk + max_mmk) / 2
        each_usd = midpoint_mmk / fx_mmk_per_usd if fx_mmk_per_usd > 0 else midpoint_mmk
        per_class_costs[cls] = {
            "count": count,
            "range_text": f"${each_usd:,.0f} USD each",
            "min_each": each_usd,
            "max_each": each_usd,
            "open_ended": False,
        }
        total_usd += each_usd * count

    totals = {"min": int(round(total_usd)), "max": int(round(total_usd)), "open_ended": False, "currency": "USD"}
    return {"counts": per_class_counts, "per_class_costs": per_class_costs, "totals": totals}


def detect_from_numpy(image_array: np.ndarray) -> Dict:
    model = load_model()
    results = model(image_array)
    if not results:
        return {"classes": [], "confidences": [], "annotated_image": image_array}
    res = results[0]
    classes = []
    confidences = []
    if res.boxes is not None and hasattr(res.boxes, "cls"):
        classes = [res.names[int(cls)] for cls in res.boxes.cls.tolist()]
        if hasattr(res.boxes, "conf") and res.boxes.conf is not None:
            confidences = [float(c) for c in res.boxes.conf.tolist()]

    # Draw boxes only (no labels/confidence)
    annotated_bgr = image_array[:, :, ::-1].copy()  # convert RGB->BGR for OpenCV
    if res.boxes is not None and hasattr(res.boxes, "xyxy"):
        try:
            for xyxy in res.boxes.xyxy.cpu().numpy():
                x1, y1, x2, y2 = map(int, xyxy[:4])
                cv2.rectangle(annotated_bgr, (x1, y1), (x2, y2), (255, 200, 0), 2)  # cyan-ish box
        except Exception:
            pass
    annotated_rgb = annotated_bgr[:, :, ::-1]  # back to RGB
    return {"classes": classes, "confidences": confidences, "annotated_image": annotated_rgb}


def compare_before_after(before_img: np.ndarray, after_img: np.ndarray, price_map: Dict[str, str]) -> Dict:
    before = detect_from_numpy(before_img)
    after = detect_from_numpy(after_img)

    before_counts: Dict[str, int] = {}
    for c in before["classes"]:
        before_counts[c] = before_counts.get(c, 0) + 1
    after_counts: Dict[str, int] = {}
    for c in after["classes"]:
        after_counts[c] = after_counts.get(c, 0) + 1

    deltas: Dict[str, int] = {}
    for cls in set(before_counts.keys()).union(after_counts.keys()):
        delta = after_counts.get(cls, 0) - before_counts.get(cls, 0)
        if delta > 0:
            deltas[cls] = delta

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


