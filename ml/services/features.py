"""
Feature engineering for pricing ML model.

compute_features() converts detection output + context into a fixed-length vector:
  - counts and area stats (sum/mean/max/std)
  - confidence stats
  - image geometry
  - per-severity aggregates (minor/moderate/severe)
  - rule baseline price
  - vehicle-type one-hot
These features are used by the gradient-boosted regressor.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Tuple
import numpy as np

from .inference import normalize_class_key


FEATURE_NAMES = [
    # global counts / geometry
    "n_boxes",
    "area_sum",
    "area_mean",
    "area_max",
    "area_std",
    "conf_mean",
    "conf_max",
    "conf_std",
    "img_w",
    "img_h",
    "img_area",
    "aspect_ratio",
    # per-class counts and area sums for typical severities
    "cnt_minor",
    "cnt_moderate",
    "cnt_severe",
    "area_minor_sum",
    "area_moderate_sum",
    "area_severe_sum",
    # rule baseline
    "rule_price_usd",
    # vehicle type one-hot
    "vt_car",
    "vt_truck",
    "vt_motorcycle",
    "vt_scooter",
    "vt_boat",
]


def _one_hot_vehicle_type(vehicle_type: Optional[str]) -> List[float]:
    vt = normalize_class_key(vehicle_type or "")
    keys = ["car", "truck", "motorcycle", "scooter", "boat"]
    return [1.0 if vt == k else 0.0 for k in keys]


def compute_features(
    det: Dict,
    vehicle_type: Optional[str],
    rule_price_usd: float,
    image_shape: Optional[Tuple[int, int]] = None,
) -> np.ndarray:
    """
    Build a fixed-length numeric feature vector from detection output and context.

    det: {
      "classes": List[str],
      "confidences": List[float],
      "annotated_image": np.ndarray (H,W,C),
      "areas": List[float]  # each in [0,1], area_ratio
    }
    """
    classes: List[str] = [normalize_class_key(c) for c in det.get("classes", [])]
    confs: List[float] = det.get("confidences", []) or []
    areas: List[float] = det.get("areas", []) or []

    n = len(classes)
    arr_areas = np.array(areas, dtype=float) if areas else np.zeros((0,), dtype=float)
    arr_confs = np.array(confs, dtype=float) if confs else np.zeros((0,), dtype=float)

    # image geometry
    if image_shape is None:
        img = det.get("annotated_image", None)
        if img is not None and hasattr(img, "shape"):
            h, w = int(img.shape[0]), int(img.shape[1])
        else:
            h, w = 0, 0
    else:
        h, w = int(image_shape[0]), int(image_shape[1])
    img_area = float(h * w)
    aspect = (w / h) if (h > 0) else 0.0

    # aggregate stats
    area_sum = float(arr_areas.sum()) if n else 0.0
    area_mean = float(arr_areas.mean()) if n else 0.0
    area_max = float(arr_areas.max()) if n else 0.0
    area_std = float(arr_areas.std()) if n else 0.0
    conf_mean = float(arr_confs.mean()) if len(arr_confs) else 0.0
    conf_max = float(arr_confs.max()) if len(arr_confs) else 0.0
    conf_std = float(arr_confs.std()) if len(arr_confs) else 0.0

    # class-level aggregates for common severities
    def sum_for(target: str) -> Tuple[int, float]:
        idx = [i for i, c in enumerate(classes) if c == target]
        if not idx:
            return 0, 0.0
        return len(idx), float(arr_areas[idx].sum()) if len(arr_areas) else 0.0

    cnt_minor, area_minor_sum = sum_for("minor")
    cnt_moderate, area_moderate_sum = sum_for("moderate")
    cnt_severe, area_severe_sum = sum_for("severe")

    vt_onehot = _one_hot_vehicle_type(vehicle_type)

    feats = np.array(
        [
            float(n),
            area_sum,
            area_mean,
            area_max,
            area_std,
            conf_mean,
            conf_max,
            conf_std,
            float(w),
            float(h),
            img_area,
            float(aspect),
            float(cnt_minor),
            float(cnt_moderate),
            float(cnt_severe),
            area_minor_sum,
            area_moderate_sum,
            area_severe_sum,
            float(rule_price_usd or 0.0),
            *vt_onehot,
        ],
        dtype=float,
    )
    return feats


