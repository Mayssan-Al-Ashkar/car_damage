"""
ML pricing utilities.

- load_price_model(): loads a persisted scikit-learn regressor (joblib payload).
- predict_price_usd_from_detection(): maps detection + context to features and predicts USD.
Place the trained model at ml/models/price_gbm.pkl (created by ml/train_price_gbm.py).
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional, Dict, Tuple

import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor  # type: ignore
import joblib  # type import for clarity; provided by scikit-learn dependency

from .features import compute_features

_MODEL_CACHE: Optional[HistGradientBoostingRegressor] = None
_MODEL_FEATURES: Optional[list] = None


def _model_path() -> Path:
    base = Path(__file__).resolve().parents[1] / "models"
    base.mkdir(parents=True, exist_ok=True)
    return base / "price_gbm.pkl"


def load_price_model() -> Optional[HistGradientBoostingRegressor]:
    global _MODEL_CACHE, _MODEL_FEATURES
    if _MODEL_CACHE is not None:
        return _MODEL_CACHE
    path = _model_path()
    if not path.exists():
        return None
    payload = joblib.load(path)
    model = payload.get("model") if isinstance(payload, dict) else payload
    features = payload.get("feature_names") if isinstance(payload, dict) else None
    _MODEL_CACHE = model
    _MODEL_FEATURES = features
    return _MODEL_CACHE


def has_price_model() -> bool:
    return load_price_model() is not None


def predict_price_usd_from_detection(
    det: Dict,
    vehicle_type: Optional[str],
    rule_price_usd: float,
    image_shape: Optional[Tuple[int, int]] = None,
) -> Optional[float]:
    """
    Returns predicted USD price using trained model, or None if model not available.
    """
    model = load_price_model()
    if model is None:
        return None
    feats = compute_features(det, vehicle_type, rule_price_usd, image_shape=image_shape)
    pred = float(model.predict(feats.reshape(1, -1))[0])
    # guardrails
    if not np.isfinite(pred) or pred < 0:
        return None
    return float(pred)


