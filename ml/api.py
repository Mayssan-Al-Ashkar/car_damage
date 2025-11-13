from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
import numpy as np
from PIL import Image
from io import BytesIO

from ml.services.inference import (
    load_price_map,
    detect_from_numpy,
    aggregate_costs_for_classes,
    compare_before_after,
)

app = FastAPI(title="Car Damage Estimation API")


def read_image_file(file: UploadFile) -> np.ndarray:
    data = file.file.read()
    img = Image.open(BytesIO(data)).convert("RGB")
    return np.array(img)


@app.post("/predict")
async def predict(image: UploadFile = File(...)):
    img = read_image_file(image)
    det = detect_from_numpy(img)
    price_map = load_price_map()
    cost_summary = aggregate_costs_for_classes(det["classes"], price_map)
    return JSONResponse({
        "classes": det["classes"],
        "counts": cost_summary["counts"],
        "per_class_costs": cost_summary["per_class_costs"],
        "totals": cost_summary["totals"],
    })


@app.post("/compare")
async def compare(before: UploadFile = File(...), after: UploadFile = File(...)):
    before_img = read_image_file(before)
    after_img = read_image_file(after)
    price_map = load_price_map()
    summary = compare_before_after(before_img, after_img, price_map)
    return JSONResponse({
        "before_counts": summary["before_counts"],
        "after_counts": summary["after_counts"],
        "new_damage_counts": summary["new_damage_counts"],
        "new_damage_costs": summary["new_damage_costs"],
    })


