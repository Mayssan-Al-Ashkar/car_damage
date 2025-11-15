"""
FastAPI service for damage detection and pricing.

Endpoints:
- POST /predict  : run YOLO on a single image and return detections + pricing.
- POST /compare  : run YOLO on before/after, compute deltas, and price new damage.

Pricing modes (env):
- PRICE_PROVIDER = rule | ml | hybrid
- PRICE_BLEND_ALPHA for hybrid blending
The response contains both the rule totals and a 'price' block with the chosen total.
"""
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
import numpy as np
from PIL import Image
from io import BytesIO
import base64
import os

from ml.services.inference import (
    load_price_map,
    detect_from_numpy,
    aggregate_costs_for_classes,
    compare_before_after,
    normalize_class_key,
)
from ml.services.pricing_ml import predict_price_usd_from_detection, has_price_model

app = FastAPI(title="Car Damage Estimation API")
PRICE_PROVIDER = os.environ.get("PRICE_PROVIDER", "rule")  # "rule" | "ml" | "hybrid"
ALPHA = float(os.environ.get("PRICE_BLEND_ALPHA", "0.6"))  # for hybrid: final = α*ml + (1-α)*rule


def read_image_file(file: UploadFile) -> np.ndarray:
    data = file.file.read()
    img = Image.open(BytesIO(data)).convert("RGB")
    return np.array(img)


def image_to_b64(img_rgb: np.ndarray) -> str:
    pil = Image.fromarray(img_rgb.astype("uint8"), "RGB")
    buf = BytesIO()
    pil.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


@app.post("/predict")
async def predict(image: UploadFile = File(...), vehicle_type: str | None = None):
    img = read_image_file(image)
    det = detect_from_numpy(img)
    price_map = load_price_map()
    rule_costs = aggregate_costs_for_classes(det["classes"], price_map, vehicle_type, det.get("areas"))

    # ML price (optional)
    ml_price = None
    if has_price_model():
        ml_price = predict_price_usd_from_detection(
            det, vehicle_type, rule_price_usd=rule_costs["totals"]["min"], image_shape=(img.shape[0], img.shape[1])
        )

    # choose final price
    final_price = rule_costs["totals"]["min"]
    provider = "rule"
    if PRICE_PROVIDER == "ml" and ml_price is not None:
        final_price = float(ml_price)
        provider = "ml"
    elif PRICE_PROVIDER == "hybrid" and ml_price is not None:
        final_price = float(ALPHA * ml_price + (1.0 - ALPHA) * rule_costs["totals"]["min"])
        provider = "hybrid"

    per_class_costs = rule_costs["per_class_costs"]
    dets = []
    for idx, cls in enumerate(det["classes"]):
        norm = normalize_class_key(cls)
        each = per_class_costs.get(norm, {}).get("min_each")
        conf_list = det.get("confidences", [])
        dets.append({
            "class": cls,
            "confidence": float(conf_list[idx]) if idx < len(conf_list) else None,
            "each_cost_usd": float(each) if each is not None else None,
        })

    return JSONResponse({
        "classes": det["classes"],
        "detections": dets,
        "counts": rule_costs["counts"],
        "per_class_costs": rule_costs["per_class_costs"],
        "totals_rule": rule_costs["totals"],
        "price": {
            "provider": provider,
            "ml_usd": ml_price,
            "rule_usd": rule_costs["totals"]["min"],
            "final_usd": final_price,
        },
        "annotated_image_b64": image_to_b64(det["annotated_image"]),
    })


@app.post("/compare")
async def compare(before: UploadFile = File(...), after: UploadFile = File(...), vehicle_type: str | None = None):
    before_img = read_image_file(before)
    after_img = read_image_file(after)
    price_map = load_price_map()
    summary = compare_before_after(before_img, after_img, price_map)

    # Rule-based delta: recompute using new-damage list with areas
    expanded_new = []
    areas_new = []
    remaining = dict(summary["new_damage_counts"])  # copy
    after_areas = summary["after"].get("areas") or []
    for i, cls in enumerate(summary["after"]["classes"]):
        nleft = remaining.get(normalize_class_key(cls), 0)
        if nleft > 0:
            expanded_new.append(cls)
            if i < len(after_areas):
                areas_new.append(after_areas[i])
            remaining[normalize_class_key(cls)] = nleft - 1
    rule_new_costs = aggregate_costs_for_classes(expanded_new, price_map, vehicle_type, areas_new)

    # ML delta: price(after) - price(before)
    ml_delta = None
    if has_price_model():
        ml_before = predict_price_usd_from_detection(
            summary["before"], vehicle_type, rule_price_usd=0.0, image_shape=(before_img.shape[0], before_img.shape[1])
        )
        ml_after = predict_price_usd_from_detection(
            summary["after"], vehicle_type, rule_price_usd=0.0, image_shape=(after_img.shape[0], after_img.shape[1])
        )
        if ml_before is not None and ml_after is not None:
            ml_delta = max(0.0, float(ml_after - ml_before))

    final_delta = rule_new_costs["totals"]["min"]
    provider = "rule"
    if PRICE_PROVIDER == "ml" and ml_delta is not None:
        final_delta = ml_delta
        provider = "ml"
    elif PRICE_PROVIDER == "hybrid" and ml_delta is not None:
        final_delta = float(ALPHA * ml_delta + (1.0 - ALPHA) * rule_new_costs["totals"]["min"])
        provider = "hybrid"

    return JSONResponse({
        "before_counts": summary["before_counts"],
        "after_counts": summary["after_counts"],
        "new_damage_counts": summary["new_damage_counts"],
        "new_damage_costs_rule": rule_new_costs,
        "price": {
            "provider": provider,
            "ml_delta_usd": ml_delta,
            "rule_delta_usd": rule_new_costs["totals"]["min"],
            "final_delta_usd": final_delta,
        },
        "before_annotated_b64": image_to_b64(summary["before"]["annotated_image"]),
        "after_annotated_b64": image_to_b64(summary["after"]["annotated_image"]),
    })


